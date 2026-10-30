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
const CAT = require('./assets/catalog.js');

const MAX_NAME = CAT.LIMITS.name;
const MAX_CHAT = 200;
const MAX_SDP = 12000;
const MAX_CANDIDATE = 600;
const MAX_CODE = 10;
const MAX_BOTS = CAT.LIMITS.bots;
const MAX_EMO = CAT.EMO.length - 1;
const MAX_VIDEO_TIME = 86400;
const MAX_KDUR = 780;

const RESERVED_NAMES = new Set([
  'karaoke', 'sistema', 'system', 'servidor', 'server', 'admin',
  'administrador', 'administrator', 'moderador', 'moderator', 'skyke',
  'skyke3d', 'suporte', 'support', 'moderacao', 'moderadora', 'moderadores', 'moderation', 'mod', 'staff',
  'equipe', 'oficial', 'official', 'dono', 'owner', 'administracao', 'adm', 'denuncias', 'bot'
]);
// letras de outros alfabetos que parecem latinas (cirílico, grego): "Аna" com A cirílico não pode passar por "Ana"
const CONFUSABLE = { 'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ї': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ԛ': 'q', 'ԝ': 'w', 'ɡ': 'g',
  'α': 'a', 'β': 'b', 'ε': 'e', 'η': 'n', 'ι': 'i', 'κ': 'k', 'μ': 'u', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ω': 'w', 'ϲ': 'c' };
const unconfuse = s => s.replace(/[\u0370-\u03ff\u0400-\u052f\u0261]/g, c => CONFUSABLE[c] || c);
const INVISIBLE = /(?![\uFE0E\uFE0F])\p{Default_Ignorable_Code_Point}|[\u2800\u2028\u2029]/gu;

// faixa de cada opção do avatar (índices de 0 a n-1), do tamanho das listas do catálogo
const CR = { ...CAT.CR };
const ITEMS = new Set(CAT.ITEMS.map(i => i.id));
const FOOD = new Set(CAT.ITEMS.filter(i => i.food).map(i => i.id));
const STY = new Set(Object.keys(CAT.ST));
// ids antigas dos mundos (renomeados): clientes desatualizados ainda podem enviá-las
const STY_LEGACY = Object.assign(Object.create(null), CAT.ST_LEGACY);
const styleId = s => (typeof s === 'string' && STY_LEGACY[s]) || s;
const playerId = x => typeof x === 'string' && /^p\d{1,9}$/.test(x); // ids de jogador do servidor (p1, p2...)
const G = new Set([...CAT.GESTS.map(g => g.id), 'stop']);
// gestos com som: limite próprio contra spam (server.js)
const SOUND_G = new Set(CAT.GESTS.filter(g => g.sfx).map(g => g.id));
const VOICE_Q = new Set(['eco', 'padrao', 'alta', 'musica', 'estereo']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const YT = /^[A-Za-z0-9_-]{11}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const PLAYER_ID = /^[pb]\d{1,12}$/;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isBool = v => typeof v === 'boolean';
const strip = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(INVISIBLE, '');
const nameKey = s => unconfuse(s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()).replace(/[^\p{L}\p{N}]/gu, '');
const nm = s => {
  const name = strip(s).replace(/[<>&"'`]/g, '').trim().slice(0, MAX_NAME);
  if (!name) return 'Visitante';
  const visible = [...name].some(ch => !/\s/u.test(ch) && ch !== '\uFE0E' && ch !== '\uFE0F' && !/\p{M}/u.test(ch));
  const key = nameKey(name);
  if (!visible || RESERVED_NAMES.has(key) || RESERVED_NAMES.has(key.replace(/[013457]/g, d => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' })[d]))) return 'Visitante';
  return name;
};

function cleanCfg(c) {
  if (c === undefined || c === null) return Object.fromEntries(Object.keys(CR).map(k => [k, 0]));
  if (!isObj(c)) return null;
  const out = {};
  for (const [k, n] of Object.entries(CR)) {
    const v = c[k];
    if (v === undefined) { out[k] = 0; continue; }
    if (!isInt(v, 0, n - 1)) return null;
    out[k] = v;
  }
  return out;
}

// R: raio andável da sala (10,2 m no jogo normal; o modo Sobrevivência usa o raio de SURV.walk)
function clampPos(x, z, R = 10.2) {
  const WALK_X = 0, WALK_Z = 1.2, WALK_R = R;
  if (!isNum(x) || !isNum(z)) return [WALK_X, 5];
  const dx = x - WALK_X, dz = z - WALK_Z, d = Math.hypot(dx, dz);
  if (d > WALK_R) {
    const s = WALK_R / (d || 1);
    return [WALK_X + dx * s, WALK_Z + dz * s];
  }
  return [x, z];
}

function videoId(v) {
  return typeof v === 'string' && YT.test(v) ? v : null;
}

const BLOCKED_SUFFIX = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.private', '.arpa', '.test', '.invalid', '.example'];
const MAX_STREAM_URL = 300;

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
  try { u = new URL(raw); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.length > 253 || !host.includes('.') || host.includes(':') || host.startsWith('[')) return null;
  if (/^[\d.]+$/.test(host) || /^0x/i.test(host.split('.').pop())) return null;
  if (!/^[a-z0-9.-]+$/.test(host) && !/^[\p{L}\p{N}.-]+$/u.test(host)) return null;
  if (host === 'localhost' || BLOCKED_SUFFIX.some(s => host.endsWith(s))) return null;
  if (u.port && !(Number(u.port) >= 1 && Number(u.port) <= 65535)) return null;
  u.hash = '';
  const out = u.href;
  return out.length <= MAX_STREAM_URL ? out : null;
}

function normCode(v) {
  if (typeof v !== 'string') return null;
  const c = strip(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAX_CODE);
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
  if (isObj(d.d) && (d.d.type === 'offer' || d.d.type === 'answer') && typeof d.d.sdp === 'string' && d.d.sdp.length <= MAX_SDP) {
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
const REPORT_REASONS = { assedio: 'Assédio ou ofensa', odio: 'Discurso de ódio ou discriminação', sexual: 'Conteúdo sexual ou impróprio', spam: 'Spam ou flood', golpe: 'Golpe, link malicioso ou dados pessoais', trapaca: 'Trapaça ou abuso de falha', outro: 'Outro motivo' };
const cleanNote = s => typeof s === 'string' ? s.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : '';

function normalizeMessage(m) {
  if (!isObj(m) || typeof m.t !== 'string') return null;

  switch (m.t) {
    case 'create': {
      if (m.surv !== undefined && typeof m.surv !== 'boolean') return null;
      const surv = m.surv === true, style = surv ? 'acampamento' : styleId(m.style);
      if (!surv && m.style !== undefined && (typeof m.style !== 'string' || !STY.has(style) || CAT.ST[style].surv)) return null;
      if (m.bots !== undefined && !isInt(m.bots, 0, MAX_BOTS)) return null;
      if (m.name !== undefined && (typeof m.name !== 'string' || m.name.length > 64)) return null;
      const cfg = cleanCfg(m.cfg);
      if (!cfg) return null;
      const name = nm(m.name);
      return { t: 'create', style: STY.has(style) ? style : 'proxima', surv, bots: surv || m.bots === undefined ? 0 : m.bots, cfg, name, named: nameKey(name) !== 'visitante' };
    }
    case 'join': {
      const code = normCode(m.code);
      if (!code) return null;
      if (m.name !== undefined && (typeof m.name !== 'string' || m.name.length > 64)) return null;
      const cfg = cleanCfg(m.cfg);
      if (!cfg) return null;
      const name = nm(m.name);
      return { t: 'join', code, cfg, name, named: nameKey(name) !== 'visitante' };
    }
    case 'resume': {
      const code = normCode(m.code), token = normToken(m.token);
      return code && token ? { t: 'resume', code, token } : null;
    }
    case 'leave': return { t: 'leave' };
    // página pessoal de estatísticas: o segredo do jogador (43 caracteres base64url) liga ele às rodadas desta sala
    case 'pst': return typeof m.k === 'string' && /^[A-Za-z0-9_-]{43}$/.test(m.k) ? { t: 'pst', k: m.k } : null;
    // modo Sobrevivência: a = ação; i = ponto de coleta; res = recurso; rid = receita; to = jogador a reanimar
    case 'sv': {
      if (typeof m.a !== 'string') return null;
      switch (m.a) {
        case 'collect': return isInt(m.i, 0, 255) ? { t: 'sv', a: 'collect', i: m.i } : null;
        case 'eat': case 'fuel': return typeof m.res === 'string' && Object.prototype.hasOwnProperty.call(CAT.SURV.res, m.res) ? { t: 'sv', a: m.a, res: m.res } : null;
        case 'cook': return typeof m.rid === 'string' && CAT.SURV.recipes.some(r => r.id === m.rid) ? { t: 'sv', a: 'cook', rid: m.rid } : null;
        case 'rev': return typeof m.to === 'string' && /^p\d{1,9}$/.test(m.to) ? { t: 'sv', a: 'rev', to: m.to } : null;
        case 'relight': case 'take': case 'revstop': case 'again': return { t: 'sv', a: m.a };
        default: return null;
      }
    }
    case 'move': {
      if (!isNum(m.x) || !isNum(m.z)) return null;
      if (m.ry !== undefined && !isNum(m.ry)) return null;
      if (m.y !== undefined && !isNum(m.y)) return null;
      if (m.s !== undefined && !isInt(m.s, 0, 1)) return null;
      const [x, z] = clampPos(m.x, m.z, CAT.SURV.walk.r); // teto do maior modo; o servidor recorta de novo pelo raio da sala
      return {
        t: 'move', x, z,
        ry: isNum(m.ry) ? Math.max(-10, Math.min(10, m.ry)) : 0,
        y: isNum(m.y) ? Math.max(0, Math.min(1.6, m.y)) : 0,
        s: m.s === 1 ? 1 : 0
      };
    }
    case 'cfg': {
      const cfg = cleanCfg(m.cfg);
      return cfg ? { t: 'cfg', cfg } : null;
    }
    case 'chat': {
      if (typeof m.text !== 'string') return null;
      const text = strip(m.text).replace(/(.)\1{9,}/g, '$1$1$1').trim();
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
    case 'ice': return { t: 'ice' };
    case 'bots':
      return isInt(m.n, 0, MAX_BOTS) ? { t: 'bots', n: m.n } : null;
    case 'sig': return cleanSig(m);
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
      if (!playerId(m.id) || typeof m.reason !== 'string' || !Object.prototype.hasOwnProperty.call(REPORT_REASONS, m.reason)) return null;
      if (m.note !== undefined && typeof m.note !== 'string') return null;
      return { t: 'report', id: m.id, reason: m.reason, note: cleanNote(m.note) };
    }
    case 'tsync': return isNum(m.c) && m.c > 0 && m.c < 1e14 ? { t: 'tsync', c: m.c } : null;
    case 'dj': {
      const url = streamUrl(m.url);
      return url ? { t: 'dj', url } : null;
    }
    case 'djstop': return { t: 'djstop' };
    case 'vstop': return m.by === undefined ? { t: 'vstop' } : (playerId(m.by) ? { t: 'vstop', by: m.by } : null);
    case 'vend': return { t: 'vend' };
    case 'vjoin': return playerId(m.by) ? { t: 'vjoin', by: m.by } : null;
    case 'vleave': return playerId(m.by) ? { t: 'vleave', by: m.by } : null;
    case 'kjoin': {
      const vid = videoId(m.vid);
      return vid ? { t: 'kjoin', vid } : null;
    }
    case 'ksong': {
      const vid = videoId(m.vid);
      return vid ? { t: 'ksong', vid } : null;
    }
    case 'kleave': return { t: 'kleave' };
    case 'kpass': return { t: 'kpass' };
    case 'kdur':
      return isNum(m.d) && m.d >= 10 ? { t: 'kdur', d: Math.min(MAX_KDUR, m.d) } : null;
    case 'kend': return { t: 'kend' };
    case 'ksync': {
      if (!isNum(m.time) || m.time < 0 || m.time > MAX_VIDEO_TIME || !isBool(m.playing)) return null;
      return withTs({ t: 'ksync', time: m.time, playing: m.playing }, m.ts);
    }
    default: return null;
  }
}

module.exports = {
  MAX_BOTS,
  MAX_NAME, MAX_CHAT, MAX_SDP, MAX_CANDIDATE, MAX_CODE, MAX_EMO, MAX_VIDEO_TIME, MAX_KDUR,
  CR, ITEMS, FOOD, STY, STY_LEGACY, G, SOUND_G, VOICE_Q, CODE_ALPHABET, YT, TOKEN_RE, REPORT_REASONS, unconfuse,
  isObj, isNum, isInt, isBool, strip, nm, nameKey, cleanCfg, clampPos, videoId, streamUrl, normCode, normToken,
  normalizeMessage
};
