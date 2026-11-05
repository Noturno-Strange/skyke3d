/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Perfil público opcional (/profile#<código>).
 *
 * - O código do link é derivado do id de identidade por SHA-256 (mão única): publicar o link não revela o id de amigo nem
 *   a chave de recuperação, e o mesmo jogador tem sempre o mesmo link sem o servidor guardar a ligação.
 * - O perfil (nome, aparência e os textos que o jogador escreve) fica em `data/profiles.json` enquanto o jogador deixar o
 *   perfil ligado. Desligar apaga na hora. Quem não volta por `staleMs` (180 dias) é apagado.
 * - Curtidas e recados do livro de visitas são temporários: ficam só na memória e somem 24 h depois que o dono sai
 *   (ou quando o servidor reinicia).
 * - Tamanho limitado (`max` perfis, textos curtos) e gravação com atraso: o custo no servidor é desprezível.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const CAT = require('../assets/catalog.js');
const { readJsonFile, writeJsonAtomic } = require('./persist');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** mundo favorito: id atual, ou id antiga convertida para o bioma que a substituiu; qualquer outra coisa vira '' */
const worldId = w => (typeof w !== 'string' ? '' : own(CAT.ST, w) ? w : own(CAT.ST_LEGACY, w) ? CAT.ST_LEGACY[w] : '');

const PID_RE = /^[0-9a-f]{20}$/;
/** Limites de cada campo que o jogador escreve. */
const LIMITS = { bio: 300, like: 80, mood: 60 };
const BIO_MAX = LIMITS.bio;
const DAY = 86400000;
const LIKES_MAX = 5000;
const BOOK_MAX = 20; // recados guardados por perfil (o mais antigo sai)
const NOTE_MAX = 120;
const PER_AUTHOR = 3; // recados ao mesmo tempo por autor em cada perfil
// controles, espaços invisíveis, separadores de linha/parágrafo e marcas de direção
const CTRL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]', 'g');
// endereço, domínio ou convite: os textos do perfil não levam link
const LINK_RE =
  /(https?:|www\.|\/\/|\b[a-z0-9-]{2,}\.(com|net|org|br|io|gg|me|ly|app|xyz|link|ru|tk|ml|ga|cf)\b|discord\.gg|t\.me)/i;

/** @param {string} id id de identidade */
const pidOf = id =>
  crypto
    .createHash('sha256')
    .update('skyke3d-profile:' + id, 'utf8')
    .digest('hex')
    .slice(0, 20);

/**
 * Aparência só em índices do catálogo (inteiros dentro da faixa de cada campo). A página desenha o rosto com o mesmo
 * código do jogo; nunca recebe imagem nem texto de aparência vindos do jogador.
 * @param {any} cfg
 * @returns {Record<string, number>}
 */
function cleanCfgOut(cfg) {
  /** @type {Record<string, number>} */
  const out = {};
  if (cfg && typeof cfg === 'object')
    for (const [k, n] of Object.entries(CAT.CR))
      if (Number.isInteger(cfg[k]) && cfg[k] >= 0 && cfg[k] < n) out[k] = cfg[k];
  return out;
}

/** Texto curto: sem controle, sem espaços repetidos, sem < > & para nunca virar marcação. */
function cleanText(s, max) {
  return String(s == null ? '' : s)
    .replace(CTRL, ' ')
    .replace(/[<>&"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
const cleanBio = s => cleanText(s, BIO_MAX);
const hasLink = s => LINK_RE.test(String(s).replace(/\s+/g, ''));

/**
 * Campos do perfil já limpos. `censor` (filtro de palavrões) é opcional.
 * @param {any} f
 * @param {(s: string) => string} [censor]
 * @returns {{ok: true, bio: string, like: string, mood: string, world: string}|{ok: false, reason: string}}
 */
function cleanFields(f, censor) {
  const o = f && typeof f === 'object' ? f : {};
  const c = censor || (s => s);
  const bio = c(cleanText(o.bio, LIMITS.bio)),
    like = c(cleanText(o.like, LIMITS.like)),
    mood = c(cleanText(o.mood, LIMITS.mood));
  if (hasLink(bio) || hasLink(like) || hasLink(mood)) return { ok: false, reason: 'link' };
  const world = worldId(o.world);
  return { ok: true, bio, like, mood, world };
}

/**
 * @typedef {Object} Stored perfil guardado (vai para o arquivo)
 * @property {string} n nome de exibição na última vez
 * @property {Record<string, number>} c aparência
 * @property {string} b sobre
 * @property {string} l gosto de
 * @property {string} m frase
 * @property {string} w mundo favorito
 * @property {number} at última vez visto
 */

/**
 * @param {{file?: string, ttlMs?: number, staleMs?: number, max?: number, delayMs?: number, now?: () => number,
 *   onError?: (w: string, e: any) => void, warn?: (m: string) => void}} [o]
 */
function createPubProfiles({
  file = '',
  ttlMs = DAY,
  staleMs = 180 * DAY,
  max = 10000,
  delayMs = 5000,
  now = Date.now,
  onError = () => {},
  warn = () => {}
} = {}) {
  /** @type {Map<string, Stored>} */
  const store = new Map();
  /** @type {Map<string, {conns: Set<any>, likes: Set<string>, book: {id: number, by: string, name: string, text: string, at: number}[], nextMsg: number, seen: number}>} */
  const live = new Map();
  let dirty = false,
    timer = /** @type {any} */ (null);

  // ---------- arquivo ----------
  function load() {
    if (!file) return;
    let obj = null;
    try {
      obj = readJsonFile(file);
    } catch (e) {
      try {
        fs.renameSync(file, file + '.bak');
      } catch (x) {
        /* já não existe */
      }
      warn('perfis: arquivo inválido, começando limpo.');
    }
    if (!obj || obj.v !== 1 || !obj.p || typeof obj.p !== 'object') return;
    const t = now();
    for (const [pid, s] of Object.entries(obj.p)) {
      if (store.size >= max) break;
      if (!PID_RE.test(pid) || !s || typeof s !== 'object') continue;
      const e = /** @type {any} */ (s);
      if (typeof e.n !== 'string' || !Number.isFinite(e.at) || t - e.at > staleMs) continue;
      store.set(pid, {
        n: cleanText(e.n, 16),
        c: cleanCfgOut(e.c),
        b: cleanText(e.b, LIMITS.bio),
        l: cleanText(e.l, LIMITS.like),
        m: cleanText(e.m, LIMITS.mood),
        w: worldId(e.w),
        at: e.at
      });
    }
  }
  function write() {
    if (!file || !dirty) return;
    dirty = false;
    /** @type {Record<string, Stored>} */
    const p = Object.create(null);
    for (const [pid, s] of store) p[pid] = s;
    try {
      writeJsonAtomic(file, { v: 1, savedAt: now(), p });
    } catch (e) {
      dirty = true;
      onError('perfis', e);
    }
  }
  function save() {
    if (!file) return;
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      write();
    }, delayMs);
    if (timer.unref) timer.unref();
  }
  /** Grava já o que estiver pendente (ao encerrar). */
  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    write();
  }

  // ---------- memória ----------
  /** @param {string} pid */
  function ent(pid) {
    let e = live.get(pid);
    if (!e) {
      e = { conns: new Set(), likes: new Set(), book: [], nextMsg: 1, seen: 0 };
      live.set(pid, e);
    }
    return e;
  }

  /** Abre espaço para um perfil novo tirando o que está parado há mais tempo (nunca quem está online). */
  function makeRoom() {
    if (store.size < max) return true;
    /** @type {string|null} */
    let oldPid = null;
    let oldAt = Infinity;
    for (const [pid, s] of store) {
      const e = live.get(pid);
      if (e && e.conns.size) continue;
      if (s.at < oldAt) {
        oldAt = s.at;
        oldPid = pid;
      }
    }
    if (oldPid === null) return false;
    store.delete(oldPid);
    live.delete(oldPid);
    return true;
  }

  /**
   * Liga o perfil (ou atualiza os textos) e vincula a conexão a ele.
   * @param {string} pid
   * @param {any} conn conexão com `me.name` e `me.cfg`
   * @param {{bio: string, like: string, mood: string, world: string}} f campos já limpos (cleanFields)
   * @returns {boolean} false quando não há espaço
   */
  function publish(pid, conn, f) {
    if (!PID_RE.test(pid)) return false;
    let s = store.get(pid);
    if (!s) {
      if (!makeRoom()) return false;
      s = { n: '', c: {}, b: '', l: '', m: '', w: '', at: 0 };
      store.set(pid, s);
    }
    const me = conn && conn.me;
    if (me && me.name) {
      s.n = cleanText(me.name, 16);
      s.c = cleanCfgOut(me.cfg);
    }
    s.b = f.bio;
    s.l = f.like;
    s.m = f.mood;
    s.w = f.world;
    s.at = now();
    ent(pid).conns.add(conn);
    save();
    return true;
  }

  /** Campos guardados, para o jogador reabrir o painel em outro aparelho. */
  function fieldsOf(pid) {
    const s = store.get(pid);
    return s ? { bio: s.b, like: s.l, mood: s.m, world: s.w } : null;
  }

  /** O jogador desligou o perfil: some tudo na hora (arquivo, curtidas e recados). */
  function withdraw(pid) {
    if (store.delete(pid)) save();
    live.delete(pid);
  }

  /**
   * Uma conexão saiu. Guarda o nome e a aparência de agora; curtidas e recados seguem por `ttlMs` e somem.
   * @param {string} pid
   * @param {any} conn
   * @param {{name: string, cfg: any}|null} snap
   */
  function leave(pid, conn, snap) {
    const e = live.get(pid);
    if (e) {
      e.conns.delete(conn);
      if (!e.conns.size) e.seen = now();
    }
    const s = store.get(pid);
    if (s && (!e || !e.conns.size)) {
      if (snap && snap.name) {
        s.n = cleanText(snap.name, 16);
        s.c = cleanCfgOut(snap.cfg);
      }
      s.at = now();
      save();
    }
  }

  /** Livro de visitas para a página: mais novas primeiro, sem o código de quem escreveu. */
  const bookOf = e => (e ? e.book.map(m => ({ name: m.name, text: m.text, at: m.at })).reverse() : []);

  /**
   * @param {string} pid
   * @returns {{name: string, bio: string, like: string, mood: string, world: string, online: boolean, seenAt: number,
   *   likes: number, book: {name: string, text: string, at: number}[], cfg: Record<string, number>}|null}
   */
  function get(pid) {
    if (!PID_RE.test(pid)) return null;
    const s = store.get(pid);
    if (!s) return null;
    const e = live.get(pid);
    let name = s.n,
      cfg = s.c,
      online = false;
    if (e)
      for (const c of e.conns) {
        const me = c && c.me;
        if (me && me.name) {
          name = me.name;
          cfg = me.cfg;
          online = true;
          break;
        }
      }
    if (!name) return null;
    return {
      name,
      bio: s.b,
      like: s.l,
      mood: s.m,
      world: s.w ? (CAT.ST[s.w] && CAT.ST[s.w].n) || '' : '',
      online,
      seenAt: online ? 0 : s.at,
      likes: e ? e.likes.size : 0,
      book: bookOf(e),
      cfg: cleanCfgOut(cfg)
    };
  }

  /**
   * Uma curtida por pessoa (`voter` é o código público de quem curte). O contador some com os dados temporários.
   * @param {string} pid perfil curtido
   * @param {string} voter
   * @returns {{ok: boolean, reason?: string, count?: number, dup?: boolean}}
   */
  function like(pid, voter) {
    if (!PID_RE.test(pid) || !PID_RE.test(voter)) return { ok: false, reason: 'invalid' };
    if (pid === voter) return { ok: false, reason: 'self' };
    if (!store.has(pid)) return { ok: false, reason: 'notfound' };
    const e = ent(pid);
    if (e.likes.has(voter)) return { ok: true, dup: true, count: e.likes.size };
    if (e.likes.size >= LIKES_MAX) return { ok: false, reason: 'full' };
    e.likes.add(voter);
    return { ok: true, count: e.likes.size };
  }

  /**
   * Deixa um recado curto no livro de visitas de um perfil ativo.
   * @param {string} pid perfil
   * @param {string} author código público de quem escreve (limita recados por pessoa)
   * @param {string} name nome de exibição de quem escreve
   * @param {string} text
   * @returns {{ok: boolean, reason?: string, owners?: any[]}}
   */
  function post(pid, author, name, text) {
    if (!PID_RE.test(pid) || !PID_RE.test(author)) return { ok: false, reason: 'invalid' };
    if (pid === author) return { ok: false, reason: 'self' };
    if (!store.has(pid)) return { ok: false, reason: 'notfound' };
    const t = cleanText(text, NOTE_MAX);
    if (!t) return { ok: false, reason: 'empty' };
    if (hasLink(t)) return { ok: false, reason: 'link' };
    const e = ent(pid);
    if (e.book.filter(m => m.by === author).length >= PER_AUTHOR) return { ok: false, reason: 'limit' };
    e.book.push({ id: e.nextMsg++, by: author, name: String(name || '').slice(0, 16), text: t, at: now() });
    while (e.book.length > BOOK_MAX) e.book.shift();
    return { ok: true, owners: [...e.conns] };
  }

  /** Lista para o dono (com ids para apagar). */
  function listBook(pid) {
    const e = live.get(pid);
    return e ? e.book.map(m => ({ id: m.id, name: m.name, text: m.text, at: m.at })).reverse() : [];
  }

  /** O dono apaga um recado. */
  function removeNote(pid, id) {
    const e = live.get(pid);
    if (!e) return false;
    const n = e.book.length;
    e.book = e.book.filter(m => m.id !== id);
    return e.book.length < n;
  }

  /** Apaga perfis parados há mais de `staleMs` e os dados temporários vencidos. */
  function sweep() {
    const t = now();
    let n = 0;
    for (const [pid, s] of store) {
      const e = live.get(pid);
      if (e && e.conns.size) continue;
      if (t - s.at >= staleMs) {
        store.delete(pid);
        live.delete(pid);
        n++;
      }
    }
    for (const [pid, e] of live) if (!e.conns.size && t - e.seen >= ttlMs) live.delete(pid);
    if (n) save();
    return n;
  }

  load();
  const stats = () => ({ total: store.size, online: [...live.values()].filter(e => e.conns.size).length });

  return { publish, fieldsOf, withdraw, leave, get, like, post, listBook, removeNote, sweep, flush, stats };
}

module.exports = {
  createPubProfiles,
  pidOf,
  cleanBio,
  cleanText,
  cleanFields,
  hasLink,
  cleanCfgOut,
  PID_RE,
  BIO_MAX,
  NOTE_MAX,
  BOOK_MAX,
  PER_AUTHOR,
  LIMITS
};
