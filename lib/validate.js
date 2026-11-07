/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Validação estrita de mensagens do cliente. Funções puras, sem estado e sem
 * banco de dados: tudo é reconstruído a partir de uma allowlist de campos.
 */
'use strict';

// Itens, gestos, emojis, cores e mundos vêm do mesmo catálogo que o navegador usa: o que o jogo oferece é o que se aceita aqui.
const CAT = require('../assets/catalog.js');
const { MAX_GEN, PK_RE } = require('./identity');

const MAX_NAME = CAT.LIMITS.name;
const MAX_CHAT = 200;
const MAX_GCHAT = 140,
  MAX_FRIENDS = 100,
  FKEY = /^[A-Za-z0-9_-]{43}$/,
  FID = /^[a-z2-7]{12}$/;
// Assinatura ECDSA P-256 no formato cru r||s (64 bytes) em base64url.
const SIG = /^[A-Za-z0-9_-]{86}$/;
const MAX_GRACE = 7 * 24 * 3600000;
// Ações que o cliente pode pedir no desafio. `remove` existe no registro, mas não é
// exposta pelo protocolo do jogo.
const ID_ACTIONS = new Set(['join', 'rotate', 'rotate-recovery', 'revoke', 'recover', 'cancel-recovery']);
const MAX_SDP = 12000;
const MAX_CANDIDATE = 600;
const MAX_CODE = 10;
const MAX_BOTS = CAT.LIMITS.bots;
const MAX_EMO = CAT.EMO.length - 1;
const MAX_VIDEO_TIME = 86400;
const MAX_KDUR = 780;

const RESERVED_NAMES = new Set([
  'karaoke',
  'sistema',
  'system',
  'servidor',
  'server',
  'admin',
  'administrador',
  'administrator',
  'moderador',
  'moderator',
  'skyke',
  'skyke3d',
  'suporte',
  'support',
  'moderacao',
  'moderadora',
  'moderadores',
  'moderation',
  'mod',
  'staff',
  'equipe',
  'oficial',
  'official',
  'dono',
  'owner',
  'administracao',
  'adm',
  'denuncias',
  'bot'
]);
// letras de outros alfabetos que parecem latinas (cirílico, grego): "Аna" com A cirílico não pode passar por "Ana"
const CONFUSABLE = {
  а: 'a',
  в: 'b',
  е: 'e',
  ё: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  і: 'i',
  ї: 'i',
  ј: 'j',
  ѕ: 's',
  ԁ: 'd',
  ԛ: 'q',
  ԝ: 'w',
  ɡ: 'g',
  α: 'a',
  β: 'b',
  ε: 'e',
  η: 'n',
  ι: 'i',
  κ: 'k',
  μ: 'u',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
  ω: 'w',
  ϲ: 'c'
};
const unconfuse = s => s.replace(/[\u0370-\u03ff\u0400-\u052f\u0261]/g, c => CONFUSABLE[c] || c);
// "Esqueleto" de um nome para a checagem de nomes reservados: tudo que se confunde com uma letra comum vira essa letra. Mais agressivo
// que nameKey (que também decide se dois nomes são o mesmo): aqui i, l, 1, | e ! são a mesma letra, e ɑ ɪ ᴀ ı etc. voltam para o ASCII.
// Por isso só serve para barrar nomes que imitam a equipe ("ADMlN", "adm|n", "admın", "ᴀdmin"), não para comparar jogadores.
const LOOKALIKES = {
  a: 'ɑᴀɐɒⱥαаａ4@',
  b: 'ʙɓƀƅьβｂ8',
  c: 'ᴄɔƈϲϹсｃ(',
  d: 'ɖɗᴅԁｄ',
  e: 'ɛɘǝᴇεеёєｅ3з',
  f: 'ƒꜰｆ',
  g: 'ɡɠɢƍｇ9',
  h: 'ɦʜɧһｈ',
  i: 'ıɪɨᵻᴉіїｉⅰǀ|!1lɭⅼℓʟłɫӏӀ',
  j: 'ʝᴊјｊ',
  k: 'ƙᴋκкｋ',
  m: 'ɱᴍмｍ',
  n: 'ɴɲɳпոｎ',
  o: 'ɵᴏοоօｏ0',
  p: 'ƥᴘρрｐ',
  q: 'ԛｑ',
  r: 'ɾɼʀгｒ',
  s: 'ʂꜱѕｓ5$',
  t: 'ƫʈᴛτтｔ7+',
  u: 'ʋυսｕv',
  w: 'ᴡʍԝωｗ',
  x: 'хχｘ',
  y: 'ʏƴуүｙ',
  z: 'ʐʑᴢｚ2'
};
const SKEL = new Map();
for (const [letra, outras] of Object.entries(LOOKALIKES)) for (const c of outras) SKEL.set(c, letra);
const skelMap = t => [...t].map(c => SKEL.get(c) || c).join('');
// Mapeia ANTES da normalização (ϲ viraria σ no NFKD e se perderia) e DEPOIS (a largura cheia vira ASCII, que também tem parecidos).
const skeleton = s =>
  skelMap(skelMap(String(s).toLowerCase()).normalize('NFKD').replace(/\p{M}/gu, ''))
    .replace(/rn/g, 'm')
    .replace(/uu/g, 'w')
    .replace(/[^\p{L}\p{N}]/gu, '');
const INVISIBLE = /(?![\uFE0E\uFE0F])\p{Default_Ignorable_Code_Point}|[\u2800\u2028\u2029]/gu;

// faixa de cada opção do avatar (índices de 0 a n-1), do tamanho das listas do catálogo
const CR = { ...CAT.CR };
const ITEMS = new Set(CAT.ITEMS.map(i => i.id));
const FOOD = new Set(CAT.ITEMS.filter(i => i.food).map(i => i.id));
// alimentos de receita: bloqueados até o jogador preparar a receita pela primeira vez (o servidor confere em lib/cook.js)
const RECIPE_ITEMS = new Set(CAT.ITEMS.filter(i => i.rc).map(i => i.id));
const ING_IDS = new Set(CAT.ING.map(i => i.id));
const FARM_ACTS = new Set(['plant', 'water', 'harvest', 'dig']);
const STY = new Set(Object.keys(CAT.ST));
// ids antigas dos mundos (renomeados): clientes desatualizados ainda podem enviá-las
const STY_LEGACY = Object.assign(Object.create(null), CAT.ST_LEGACY);
const styleId = s => (typeof s === 'string' && STY_LEGACY[s]) || s;
const playerId = x => typeof x === 'string' && /^p\d{1,9}$/.test(x); // ids de jogador do servidor (p1, p2...)
const G = new Set([...CAT.GESTS.map(g => g.id), 'stop']);
// gestos com som: limite próprio contra spam (server.js)
const SOUND_G = new Set(CAT.GESTS.filter(g => g.sfx).map(g => g.id));
// Modos antigos: o cliente novo usa um perfil único e não envia mais `vq`, mas o
// servidor continua aceitando os valores para não derrubar quem está desatualizado.
const VOICE_Q = new Set(['eco', 'padrao', 'alta', 'musica', 'estereo']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const YT = /^[A-Za-z0-9_-]{11}$/;
const PET_ACTIONS = new Set(['feed', 'play', 'rest', 'clean', 'pet', 'special']);
const PET_SOCIAL = new Set(['wave', 'hug', 'gift']);
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const PLAYER_ID = /^[pb]\d{1,12}$/;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isBool = v => typeof v === 'boolean';
const strip = s =>
  String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(INVISIBLE, '');
const nameKey = s => unconfuse(s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()).replace(/[^\p{L}\p{N}]/gu, '');
// esqueletos dos nomes reservados (a equipe e o sistema): comparados com o esqueleto do nome pedido
const RESERVED_SKEL = new Set([...RESERVED_NAMES].map(skeleton));
const nm = s => {
  const name = strip(s)
    .replace(/[<>&"'`]/g, '')
    .trim()
    .slice(0, MAX_NAME);
  if (!name) return 'Visitante';
  const visible = [...name].some(ch => !/\s/u.test(ch) && ch !== '\uFE0E' && ch !== '\uFE0F' && !/\p{M}/u.test(ch));
  const key = nameKey(name);
  if (
    !visible ||
    RESERVED_NAMES.has(key) ||
    RESERVED_NAMES.has(key.replace(/[013457]/g, d => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' })[d])) ||
    RESERVED_SKEL.has(skeleton(name))
  )
    return 'Visitante';
  return name;
};

function cleanCfg(c) {
  if (c === undefined || c === null) return Object.fromEntries(Object.keys(CR).map(k => [k, 0]));
  if (!isObj(c)) return null;
  const out = {};
  for (const [k, n] of Object.entries(CR)) {
    const v = c[k];
    if (v === undefined) {
      out[k] = 0;
      continue;
    }
    if (!isInt(v, 0, n - 1)) return null;
    out[k] = v;
  }
  return out;
}

function clampPos(x, z) {
  const WALK_X = 0,
    WALK_Z = 1.2,
    WALK_R = 10.2;
  if (!isNum(x) || !isNum(z)) return [WALK_X, 5];
  const dx = x - WALK_X,
    dz = z - WALK_Z,
    d = Math.hypot(dx, dz);
  if (d > WALK_R) {
    const s = WALK_R / (d || 1);
    return [WALK_X + dx * s, WALK_Z + dz * s];
  }
  return [x, z];
}

function videoId(v) {
  return typeof v === 'string' && YT.test(v) ? v : null;
}

const BLOCKED_SUFFIX = [
  '.localhost',
  '.local',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.corp',
  '.private',
  '.arpa',
  '.test',
  '.invalid',
  '.example'
];
const MAX_STREAM_URL = 300;
// Portas aceitas nos links de rádio (https): a padrão (443) e as que Icecast/Shoutcast com TLS costumam usar. É o SERVIDOR que abre a
// conexão; com porta livre, qualquer jogador usava o servidor para sondar serviços TLS de terceiros em qualquer porta. RADIO_PORTS
// (server.js) troca a lista por `setRadioPorts`.
let radioPorts = new Set([443, 8443, 8000, 8080, 8100, 8200, 8888, 9000, 9443]);
function setRadioPorts(list) {
  radioPorts = new Set(list.filter(n => Number.isInteger(n) && n >= 1 && n <= 65535));
}

/**
 * Link de rádio (Icecast/Shoutcast/MP3/AAC): só https, com nome de domínio público,
 * sem usuário/senha, sem IP literal, sem nomes locais e com no máximo 300 caracteres.
 * Devolve a URL normalizada (sem fragmento) ou null. A checagem de DNS fica no servidor.
 */
function streamUrl(v) {
  if (typeof v !== 'string' || v.length > MAX_STREAM_URL + 20) return null;
  const raw = v.trim();
  if (!raw || raw.length > MAX_STREAM_URL || /[\u0000-\u0020\u007f-\u009f"'<>`\\]/.test(raw)) return null;
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.length > 253 || !host.includes('.') || host.includes(':') || host.startsWith('[')) return null;
  if (/^[\d.]+$/.test(host) || /^0x/i.test(host.split('.').pop() || '')) return null;
  if (!/^[a-z0-9.-]+$/.test(host) && !/^[\p{L}\p{N}.-]+$/u.test(host)) return null;
  if (host === 'localhost' || BLOCKED_SUFFIX.some(s => host.endsWith(s))) return null;
  if (u.port && !radioPorts.has(Number(u.port))) return null;
  u.hash = '';
  const out = u.href;
  return out.length <= MAX_STREAM_URL ? out : null;
}

function normCode(v) {
  if (typeof v !== 'string') return null;
  const c = strip(v)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_CODE);
  if (c.length !== MAX_CODE) return null;
  for (const ch of c) if (!CODE_ALPHABET.includes(ch)) return null;
  return c;
}

function normToken(v) {
  return typeof v === 'string' && TOKEN_RE.test(v) ? v : null;
}

function cleanSig(m) {
  if (!isObj(m.data)) return null;
  const to = typeof m.to === 'string' && PLAYER_ID.test(m.to) ? m.to : null;
  if (!to) return null;
  const d = m.data;
  let data = null;
  if (
    isObj(d.d) &&
    (d.d.type === 'offer' || d.d.type === 'answer') &&
    typeof d.d.sdp === 'string' &&
    d.d.sdp.length <= MAX_SDP
  ) {
    data = { d: { type: d.d.type, sdp: d.d.sdp } };
  } else if (isObj(d.c) && typeof d.c.candidate === 'string' && d.c.candidate.length <= MAX_CANDIDATE) {
    data = {
      c: {
        candidate: d.c.candidate,
        sdpMid: typeof d.c.sdpMid === 'string' ? d.c.sdpMid.slice(0, 32) : null,
        sdpMLineIndex: isInt(d.c.sdpMLineIndex, 0, 9) ? d.c.sdpMLineIndex : 0
      }
    };
  } else if (d.x === 'vq') {
    if (!VOICE_Q.has(d.q)) return null;
    data = { x: 'vq', q: d.q };
  } else if (d.x === 'busy' || d.x === 'close') {
    data = { x: d.x };
  }
  return data ? { t: 'sig', to, data } : null;
}

// ts = hora do servidor (estimada pelo cliente) em que a posição do vídeo foi lida; o servidor confere se é plausível antes de usar
const withTs = (o, ts) => (isNum(ts) && ts > 0 && ts < 1e14 ? { ...o, ts } : o);

// Denúncia: motivo de uma lista fechada e observação curta (sem caracteres de controle).
const REPORT_REASONS = {
  assedio: 'Assédio ou ofensa',
  odio: 'Discurso de ódio ou discriminação',
  sexual: 'Conteúdo sexual ou impróprio',
  spam: 'Spam ou flood',
  golpe: 'Golpe, link malicioso ou dados pessoais',
  trapaca: 'Trapaça ou abuso de falha',
  outro: 'Outro motivo'
};
const cleanNote = s =>
  typeof s === 'string'
    ? s
        .normalize('NFC')
        .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300)
    : '';

function normalizeMessage(m) {
  if (!isObj(m) || typeof m.t !== 'string') return null;

  switch (m.t) {
    case 'create': {
      const style = styleId(m.style);
      if (m.style !== undefined && (typeof m.style !== 'string' || !STY.has(style))) return null;
      if (m.bots !== undefined && !isInt(m.bots, 0, MAX_BOTS)) return null;
      if (m.name !== undefined && (typeof m.name !== 'string' || m.name.length > 64)) return null;
      if (m.k !== undefined && (typeof m.k !== 'string' || !FKEY.test(m.k))) return null;
      if (m.token !== undefined && (typeof m.token !== 'string' || !TOKEN_RE.test(m.token))) return null;
      const cfg = cleanCfg(m.cfg);
      if (!cfg) return null;
      const name = nm(m.name);
      return {
        t: 'create',
        style: STY.has(style) ? style : 'amazora',
        bots: m.bots === undefined ? 0 : m.bots,
        cfg,
        name,
        k: typeof m.k === 'string' ? m.k : '',
        ...(typeof m.token === 'string' ? { token: m.token } : {}),
        named: nameKey(name) !== 'visitante'
      };
    }
    case 'join': {
      const code = normCode(m.code);
      if (!code) return null;
      if (m.name !== undefined && (typeof m.name !== 'string' || m.name.length > 64)) return null;
      if (m.k !== undefined && (typeof m.k !== 'string' || !FKEY.test(m.k))) return null;
      if (m.token !== undefined && (typeof m.token !== 'string' || !TOKEN_RE.test(m.token))) return null;
      const cfg = cleanCfg(m.cfg);
      if (!cfg) return null;
      const name = nm(m.name);
      return {
        t: 'join',
        code,
        cfg,
        name,
        k: typeof m.k === 'string' ? m.k : '',
        ...(typeof m.token === 'string' ? { token: m.token } : {}),
        named: nameKey(name) !== 'visitante'
      };
    }
    case 'resume': {
      const code = normCode(m.code),
        token = normToken(m.token);
      return code && token ? { t: 'resume', code, token } : null;
    }
    case 'leave':
      return { t: 'leave' };
    case 'move': {
      if (!isNum(m.x) || !isNum(m.z)) return null;
      if (m.ry !== undefined && !isNum(m.ry)) return null;
      if (m.y !== undefined && !isNum(m.y)) return null;
      if (m.s !== undefined && !isInt(m.s, 0, 1)) return null;
      const [x, z] = clampPos(m.x, m.z);
      return {
        t: 'move',
        x,
        z,
        ry: isNum(m.ry) ? Math.max(-10, Math.min(10, m.ry)) : 0,
        y: isNum(m.y) ? Math.max(0, Math.min(1.6, m.y)) : 0,
        s: m.s === 1 ? 1 : 0
      };
    }
    // perfil público opcional (lib/pubprofile.js): liga/desliga e descrição curta; o servidor limpa o texto
    case 'pubp': {
      if (!isBool(m.on)) return null;
      const t = k => (typeof m[k] === 'string' ? strip(m[k]).slice(0, 400) : '');
      for (const k of ['bio', 'like', 'mood', 'world']) if (m[k] !== undefined && typeof m[k] !== 'string') return null;
      return { t: 'pubp', on: m.on, bio: t('bio'), like: t('like'), mood: t('mood'), world: t('world').slice(0, 20) };
    }
    case 'gbook':
      return typeof m.to === 'string' && /^[0-9a-f]{20}$/.test(m.to) && typeof m.text === 'string'
        ? { t: 'gbook', to: m.to, text: strip(m.text).slice(0, 300) }
        : null;
    case 'gblist':
      return { t: 'gblist' };
    case 'gbdel':
      return isInt(m.id, 1, 1000000000) ? { t: 'gbdel', id: m.id } : null;
    // mascote (lib/pets.js): o cliente só pede ações pelo nome; nunca manda seed, genes, hora nem valores
    case 'petget':
      return { t: 'petget' };
    case 'petadopt':
      return typeof m.name === 'string' ? { t: 'petadopt', name: strip(m.name).slice(0, 40) } : null;
    case 'petact':
      return typeof m.a === 'string' &&
        PET_ACTIONS.has(m.a) &&
        typeof m.rid === 'string' &&
        /^[A-Za-z0-9_-]{6,24}$/.test(m.rid)
        ? { t: 'petact', a: m.a, rid: m.rid }
        : null;
    case 'petdress':
      return isInt(m.c, 0, 4) ? { t: 'petdress', c: m.c } : null;
    case 'petrel':
      return m.sure === true ? { t: 'petrel', sure: true } : null;
    case 'petsocial':
      return typeof m.to === 'string' && /^[0-9a-f]{20}$/.test(m.to) && typeof m.k === 'string' && PET_SOCIAL.has(m.k)
        ? { t: 'petsocial', to: m.to, k: m.k }
        : null;
    // culinária (lib/cook.js): o cliente só manda o método e de 2 a 6 ingredientes diferentes; o servidor acha a receita
    case 'cookget':
      return { t: 'cookget' };
    case 'cookdo': {
      if (typeof m.m !== 'string' || !Object.prototype.hasOwnProperty.call(CAT.COOK_METHODS, m.m)) return null;
      if (!Array.isArray(m.g) || m.g.length < 2 || m.g.length > CAT.COOK_SLOTS) return null;
      if (
        !m.g.every((/** @type {any} */ x) => typeof x === 'string' && ING_IDS.has(x)) ||
        new Set(m.g).size !== m.g.length
      )
        return null;
      if (typeof m.rid !== 'string' || !/^[A-Za-z0-9_-]{6,24}$/.test(m.rid)) return null;
      return { t: 'cookdo', m: m.m, g: [...m.g], rid: m.rid };
    }
    // fazenda (lib/farm.js): o cliente só manda a ação, o canteiro (-1 = todos) e, para plantar, a semente
    case 'farmget':
      return { t: 'farmget' };
    case 'farmdo': {
      if (typeof m.k !== 'string' || !FARM_ACTS.has(m.k)) return null;
      if (!isInt(m.i, m.k === 'dig' ? 0 : -1, CAT.FARM_W * CAT.FARM_H - 1)) return null;
      if (m.k === 'plant' && (typeof m.c !== 'string' || !Object.prototype.hasOwnProperty.call(CAT.CROP, m.c)))
        return null;
      if (typeof m.rid !== 'string' || !/^[A-Za-z0-9_-]{6,24}$/.test(m.rid)) return null;
      return m.k === 'plant'
        ? { t: 'farmdo', k: m.k, i: m.i, c: m.c, rid: m.rid }
        : { t: 'farmdo', k: m.k, i: m.i, rid: m.rid };
    }
    case 'plike':
      return typeof m.to === 'string' && /^[0-9a-f]{20}$/.test(m.to) ? { t: 'plike', to: m.to } : null;
    case 'cfg': {
      const cfg = cleanCfg(m.cfg);
      return cfg ? { t: 'cfg', cfg } : null;
    }
    case 'chat': {
      if (typeof m.text !== 'string') return null;
      const text = strip(m.text)
        .replace(/(.)\1{9,}/g, '$1$1$1')
        .trim();
      if (!text || text.length > MAX_CHAT) return null;
      if ((text.match(/https?:\/\//gi) || []).length > 3) return null;
      return { t: 'chat', text };
    }
    case 'item': {
      if (m.item !== null && !(typeof m.item === 'string' && ITEMS.has(m.item))) return null;
      if (m.use !== undefined && !isInt(m.use, 0, 1)) return null;
      return { t: 'item', item: m.item, use: m.use === 1 ? 1 : 0 };
    }
    case 'gest':
      return typeof m.g === 'string' && G.has(m.g) ? { t: 'gest', g: m.g } : null;
    case 'emo':
      return isInt(m.i, 0, MAX_EMO) ? { t: 'emo', i: m.i } : null;
    case 'speak':
      return isBool(m.v) ? { t: 'speak', v: m.v } : null;
    case 'ice':
      return { t: 'ice' };
    // voz pelo WebSocket: se está ouvindo a sala, quem silenciou (para o servidor nem mandar o áudio) e se o navegador fala Opus
    case 'vlisten':
      return isBool(m.v) ? { t: 'vlisten', v: m.v } : null;
    case 'vmute':
      return typeof m.id === 'string' && PLAYER_ID.test(m.id) && isBool(m.v) ? { t: 'vmute', id: m.id, v: m.v } : null;
    case 'vcap':
      return isBool(m.opus) ? { t: 'vcap', opus: m.opus } : null;
    case 'bots':
      return isInt(m.n, 0, MAX_BOTS) ? { t: 'bots', n: m.n } : null;
    case 'sig':
      return cleanSig(m);
    case 'video': {
      const vid = videoId(m.vid);
      return vid ? { t: 'video', vid } : null;
    }
    case 'vsync': {
      if (!isNum(m.time) || m.time < 0 || m.time > MAX_VIDEO_TIME || !isBool(m.playing)) return null;
      return withTs({ t: 'vsync', time: m.time, playing: m.playing }, m.ts);
    }
    // relógio: o cliente manda a sua hora (c) e o servidor devolve a dele; com isso o cliente estima a diferença de relógio e a latência
    case 'report': {
      if (
        !playerId(m.id) ||
        typeof m.reason !== 'string' ||
        !Object.prototype.hasOwnProperty.call(REPORT_REASONS, m.reason)
      )
        return null;
      if (m.note !== undefined && typeof m.note !== 'string') return null;
      return { t: 'report', id: m.id, reason: m.reason, note: cleanNote(m.note) };
    }
    case 'tsync':
      return isNum(m.c) && m.c > 0 && m.c < 1e14 ? { t: 'tsync', c: m.c } : null;
    case 'dj': {
      const url = streamUrl(m.url);
      return url ? { t: 'dj', url } : null;
    }
    case 'djstop':
      return { t: 'djstop' };
    case 'vstop':
      return m.by === undefined ? { t: 'vstop' } : playerId(m.by) ? { t: 'vstop', by: m.by } : null;
    case 'vend':
      return { t: 'vend' };
    case 'vjoin':
      return playerId(m.by) ? { t: 'vjoin', by: m.by } : null;
    case 'vleave':
      return playerId(m.by) ? { t: 'vleave', by: m.by } : null;
    case 'kjoin': {
      const vid = videoId(m.vid);
      return vid ? { t: 'kjoin', vid } : null;
    }
    case 'ksong': {
      const vid = videoId(m.vid);
      return vid ? { t: 'ksong', vid } : null;
    }
    case 'kleave':
      return { t: 'kleave' };
    case 'kpass':
      return { t: 'kpass' };
    case 'kdur':
      return isNum(m.d) && m.d >= 10 ? { t: 'kdur', d: Math.min(MAX_KDUR, m.d) } : null;
    case 'kend':
      return { t: 'kend' };
    case 'ksync': {
      if (!isNum(m.time) || m.time < 0 || m.time > MAX_VIDEO_TIME || !isBool(m.playing)) return null;
      return withTs({ t: 'ksync', time: m.time, playing: m.playing }, m.ts);
    }
    // amigos e chat global (lib/social.js): a identidade vem da conexão autenticada; `k` ainda
    // é aceito para os clientes antigos, que não têm token.
    case 'friends': {
      if (m.k !== undefined && (typeof m.k !== 'string' || !FKEY.test(m.k))) return null;
      if (!Array.isArray(m.ids) || m.ids.length > MAX_FRIENDS) return null;
      if (!m.ids.every(x => typeof x === 'string' && FID.test(x))) return null;
      return { t: 'friends', ...(typeof m.k === 'string' ? { k: m.k } : {}), ids: [...new Set(m.ids)] };
    }
    case 'freq':
    case 'facc':
    case 'finv':
      return typeof m.to === 'string' && FID.test(m.to) ? { t: m.t, to: m.to } : null;
    // identidade (lib/identity.js + lib/auth.js): desafio, prova, registro e operações de segurança
    case 'auth': {
      if (typeof m.id !== 'string' || !FID.test(m.id)) return null;
      if (typeof m.action !== 'string' || !ID_ACTIONS.has(m.action)) return null;
      return { t: 'auth', id: m.id, action: m.action };
    }
    case 'proof': {
      if (typeof m.id !== 'string' || !FID.test(m.id)) return null;
      if (typeof m.action !== 'string' || !ID_ACTIONS.has(m.action)) return null;
      if (typeof m.nonce !== 'string' || !TOKEN_RE.test(m.nonce)) return null;
      if (typeof m.sig !== 'string' || !SIG.test(m.sig)) return null;
      return { t: 'proof', id: m.id, action: m.action, nonce: m.nonce, sig: m.sig };
    }
    case 'idreg': {
      if (typeof m.k !== 'string' || !FKEY.test(m.k)) return null;
      if (typeof m.pk !== 'string' || !PK_RE.test(m.pk)) return null;
      if (typeof m.rpk !== 'string' || !PK_RE.test(m.rpk)) return null;
      // prova de trabalho do registro (lib/idpow.js): só dígitos, até 12
      if (m.pow !== undefined && (typeof m.pow !== 'string' || !/^\d{1,12}$/.test(m.pow))) return null;
      return { t: 'idreg', k: m.k, pk: m.pk, rpk: m.rpk, ...(m.pow !== undefined ? { pow: m.pow } : {}) };
    }
    case 'idrot': {
      const token = normToken(m.token);
      if (!token) return null;
      if (typeof m.sigOld !== 'string' || !SIG.test(m.sigOld)) return null;
      if (typeof m.sigRec !== 'string' || !SIG.test(m.sigRec)) return null;
      const hasPk = m.pk !== undefined,
        hasRpk = m.rpk !== undefined;
      if (hasPk === hasRpk) return null;
      if (hasPk) {
        if (typeof m.pk !== 'string' || !PK_RE.test(m.pk) || !isInt(m.gen, 1, MAX_GEN)) return null;
        return { t: 'idrot', token, gen: m.gen, pk: m.pk, sigOld: m.sigOld, sigRec: m.sigRec };
      }
      if (typeof m.rpk !== 'string' || !PK_RE.test(m.rpk) || !isInt(m.rgen, 1, MAX_GEN)) return null;
      return { t: 'idrot', token, rgen: m.rgen, rpk: m.rpk, sigOld: m.sigOld, sigRec: m.sigRec };
    }
    case 'idrec': {
      const token = normToken(m.token);
      if (!token) return null;
      if (!isInt(m.gen, 1, MAX_GEN)) return null;
      if (typeof m.pk !== 'string' || !PK_RE.test(m.pk)) return null;
      if (typeof m.sigRec !== 'string' || !SIG.test(m.sigRec)) return null;
      if (m.grace !== undefined && !isInt(m.grace, 0, MAX_GRACE)) return null;
      return {
        t: 'idrec',
        token,
        gen: m.gen,
        pk: m.pk,
        sigRec: m.sigRec,
        ...(m.grace !== undefined ? { grace: m.grace } : {})
      };
    }
    case 'idcancel': {
      const token = normToken(m.token);
      if (!token || !isInt(m.gen, 1, MAX_GEN)) return null;
      if (typeof m.sigOld !== 'string' || !SIG.test(m.sigOld)) return null;
      return { t: 'idcancel', token, gen: m.gen, sigOld: m.sigOld };
    }
    case 'idrev': {
      const token = normToken(m.token);
      if (!token || !isInt(m.epoch, 0, MAX_GEN)) return null;
      if (m.sigOld !== undefined && (typeof m.sigOld !== 'string' || !SIG.test(m.sigOld))) return null;
      return { t: 'idrev', token, epoch: m.epoch, ...(typeof m.sigOld === 'string' ? { sigOld: m.sigOld } : {}) };
    }
    case 'gsub':
      return isBool(m.on) ? { t: 'gsub', on: m.on } : null;
    case 'gchat': {
      if (typeof m.text !== 'string') return null;
      const text = strip(m.text)
        .replace(/(.)\1{5,}/g, '$1$1$1')
        .replace(/\s+/g, ' ')
        .trim();
      return text && text.length <= MAX_GCHAT ? { t: 'gchat', text } : null;
    }
    default:
      return null;
  }
}

module.exports = {
  skeleton,
  RESERVED_NAMES,
  MAX_GCHAT,
  MAX_FRIENDS,
  MAX_BOTS,
  MAX_NAME,
  MAX_CHAT,
  MAX_SDP,
  MAX_CANDIDATE,
  MAX_CODE,
  MAX_EMO,
  MAX_VIDEO_TIME,
  MAX_KDUR,
  CR,
  ITEMS,
  FOOD,
  RECIPE_ITEMS,
  ING_IDS,
  STY,
  STY_LEGACY,
  G,
  SOUND_G,
  VOICE_Q,
  CODE_ALPHABET,
  YT,
  TOKEN_RE,
  REPORT_REASONS,
  unconfuse,
  isObj,
  isNum,
  isInt,
  isBool,
  strip,
  nm,
  nameKey,
  cleanCfg,
  clampPos,
  videoId,
  streamUrl,
  setRadioPorts,
  normCode,
  normToken,
  normalizeMessage
};
