/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Validação estrita de mensagens do cliente. Funções puras, sem estado e sem
 * banco de dados: tudo é reconstruído a partir de uma allowlist de campos.
 */
'use strict';

const MAX_NAME = 16;
const MAX_CHAT = 200;
const MAX_SDP = 12000;
const MAX_CANDIDATE = 600;
const MAX_CODE = 10;
const MAX_EMO = 19;
const MAX_VIDEO_TIME = 86400;
const MAX_KDUR = 900;

const RESERVED_NAMES = new Set([
  'karaoke', 'sistema', 'system', 'servidor', 'server', 'admin',
  'administrador', 'administrator', 'moderador', 'moderator', 'skyke',
  'skyke3d', 'suporte', 'support'
]);
const INVISIBLE = /(?![\uFE0E\uFE0F])\p{Default_Ignorable_Code_Point}|[\u2800\u2028\u2029]/gu;

const CR = { skin: 4, eye: 4, shirt: 20, hair: 12, h2: 12, hc: 20, hs: 24, hat: 6, bt: 2, pc: 20, sc: 20, shoes: 3, fc: 8 };
const ITEMS = new Set(['refri', 'suco', 'leite', 'pocao_cura', 'elixir_lunar', 'pocao_floresta', 'nectar_estelar', 'cha_fada', 'lanche', 'prato', 'cupcake', 'pizza', 'maca', 'biscoito', 'sorvete', 'marshmallow']);
const FOOD = new Set(['lanche', 'prato', 'cupcake', 'pizza', 'maca', 'biscoito', 'sorvete', 'marshmallow']);
const STY = new Set(['aeris', 'brontis', 'cryon', 'pyra', 'sylvaris', 'verdara']);
const G = new Set(['arms', 'scream', 'fart', 'dance1', 'dance2', 'dance3', ...Array.from({ length: 16 }, (_, i) => 'dance' + (i + 4)), 'stop']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const YT = /^[A-Za-z0-9_-]{11}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const PLAYER_ID = /^[pb]\d{1,12}$/;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isBool = v => typeof v === 'boolean';
const strip = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(INVISIBLE, '');
const nameKey = s => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const nm = s => {
  const name = strip(s).replace(/[<>&"'`]/g, '').trim().slice(0, MAX_NAME);
  if (!name) return 'Visitante';
  const visible = [...name].some(ch => !/\s/u.test(ch) && ch !== '\uFE0E' && ch !== '\uFE0F' && !/\p{M}/u.test(ch));
  if (!visible || RESERVED_NAMES.has(nameKey(name))) return 'Visitante';
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

function clampPos(x, z) {
  const WALK_X = 0, WALK_Z = 1.2, WALK_R = 10.2;
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
  } else if (d.x === 'busy' || d.x === 'close') {
    data = { x: d.x };
  }
  return data ? { t: 'sig', to, data } : null;
}

function normalizeMessage(m) {
  if (!isObj(m) || typeof m.t !== 'string') return null;

  switch (m.t) {
    case 'create': {
      if (m.style !== undefined && (typeof m.style !== 'string' || !STY.has(m.style))) return null;
      if (m.bots !== undefined && !isInt(m.bots, 0, 9)) return null;
      if (m.name !== undefined && (typeof m.name !== 'string' || m.name.length > 64)) return null;
      const cfg = cleanCfg(m.cfg);
      if (!cfg) return null;
      return { t: 'create', style: STY.has(m.style) ? m.style : 'aeris', bots: m.bots === undefined ? 0 : m.bots, cfg, name: nm(m.name) };
    }
    case 'join': {
      const code = normCode(m.code);
      if (!code) return null;
      if (m.name !== undefined && (typeof m.name !== 'string' || m.name.length > 64)) return null;
      const cfg = cleanCfg(m.cfg);
      if (!cfg) return null;
      return { t: 'join', code, cfg, name: nm(m.name) };
    }
    case 'resume': {
      const code = normCode(m.code), token = normToken(m.token);
      return code && token ? { t: 'resume', code, token } : null;
    }
    case 'leave': return { t: 'leave' };
    case 'move': {
      if (!isNum(m.x) || !isNum(m.z)) return null;
      if (m.ry !== undefined && !isNum(m.ry)) return null;
      if (m.y !== undefined && !isNum(m.y)) return null;
      if (m.s !== undefined && !isInt(m.s, 0, 1)) return null;
      const [x, z] = clampPos(m.x, m.z);
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
      return isInt(m.n, 0, 9) ? { t: 'bots', n: m.n } : null;
    case 'sig': return cleanSig(m);
    case 'video': {
      const vid = videoId(m.vid);
      return vid ? { t: 'video', vid } : null;
    }
    case 'vsync': {
      if (!isNum(m.time) || m.time < 0 || m.time > MAX_VIDEO_TIME || !isBool(m.playing)) return null;
      return { t: 'vsync', time: m.time, playing: m.playing };
    }
    case 'vstop': return { t: 'vstop' };
    case 'vjoin': return { t: 'vjoin' };
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
      return { t: 'ksync', time: m.time, playing: m.playing };
    }
    default: return null;
  }
}

module.exports = {
  MAX_NAME, MAX_CHAT, MAX_SDP, MAX_CANDIDATE, MAX_CODE, MAX_EMO, MAX_VIDEO_TIME, MAX_KDUR,
  CR, ITEMS, FOOD, STY, G, CODE_ALPHABET, YT, TOKEN_RE,
  isObj, isNum, isInt, isBool, strip, nm, cleanCfg, clampPos, videoId, normCode, normToken,
  normalizeMessage
};
