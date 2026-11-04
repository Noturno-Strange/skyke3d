/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Perfil público opcional (/profile#<id>). Só memória: nada vai para disco.
 *
 * - O id público é derivado do id de identidade por SHA-256 (via de mão única): publicar o link não revela o id de
 *   amigo nem a chave de recuperação, e o mesmo jogador tem sempre o mesmo link sem o servidor guardar nada.
 * - Nome e aparência vêm do jogador que está na sala (já validados e filtrados); só a descrição curta é do perfil.
 * - Enquanto o jogador está online o perfil é ao vivo; depois que sai, fica um instantâneo por `ttlMs` e some.
 *   O limite `max` impede a memória de crescer sem controle.
 */
'use strict';

const crypto = require('crypto');
const CAT = require('../assets/catalog.js');

const PID_RE = /^[0-9a-f]{20}$/;
const BIO_MAX = 140;
// controles, espaços invisíveis, separadores de linha/parágrafo e marcas de direção
const CTRL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]', 'g');
const DAY = 86400000;
const LIKES_MAX = 5000;

/** @param {string} id id de identidade */
const pidOf = id =>
  crypto
    .createHash('sha256')
    .update('skyke3d-profile:' + id, 'utf8')
    .digest('hex')
    .slice(0, 20);

const pick = (list, i) => (Number.isInteger(i) && i >= 0 && i < list.length ? list[i] : list[0]);

/**
 * Aparência em palavras e cores, para a página desenhar sem carregar o jogo.
 * @param {Record<string, number>} cfg visual já validado pelo servidor
 */
function look(cfg) {
  const c = cfg || {};
  return {
    skin: pick(CAT.SKIN, c.skin),
    eye: pick(CAT.EYE, c.eye),
    hair: pick(CAT.HAIRC, c.hair),
    shirt: pick(CAT.PAL, c.shirt),
    pants: pick(CAT.PAL, c.pc),
    shoesColor: pick(CAT.PAL, c.sc),
    hatColor: pick(CAT.PAL, c.hc),
    hairStyle: pick(CAT.HS, c.hs),
    hat: pick(CAT.HATS, c.hat),
    shoes: pick(CAT.SHOES, c.shoes),
    face: pick(CAT.FACES, c.fc)
  };
}

/** Texto curto: sem controle, sem espaços repetidos, sem < > & para nunca virar marcação. */
function cleanBio(s) {
  return String(s == null ? '' : s)
    .replace(CTRL, ' ')
    .replace(/[<>&"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, BIO_MAX);
}

/**
 * @param {{ttlMs?: number, max?: number, now?: () => number}} [o]
 */
function createPubProfiles({ ttlMs = DAY, max = 5000, now = Date.now } = {}) {
  /** @type {Map<string, {bio: string, conns: Set<any>, snap: {name: string, cfg: any}|null, seen: number, likes: Set<string>}>} */
  const map = new Map();

  function evict() {
    if (map.size < max) return;
    const t = now();
    for (const [pid, e] of map) if (!e.conns.size && t - e.seen >= ttlMs) map.delete(pid);
    // ainda cheio: sai o instantâneo offline mais antigo; perfis ao vivo nunca saem
    while (map.size >= max) {
      /** @type {string|null} */
      let oldPid = null;
      let oldSeen = Infinity;
      for (const [pid, e] of map)
        if (!e.conns.size && e.seen < oldSeen) {
          oldPid = pid;
          oldSeen = e.seen;
        }
      if (oldPid === null) break;
      map.delete(oldPid);
    }
  }

  /**
   * Publica (ou atualiza a descrição de) um perfil e liga a conexão a ele.
   * @param {string} pid
   * @param {any} conn conexão com `me.name` e `me.cfg`
   * @param {string} bio
   * @returns {boolean} false quando não há espaço
   */
  function publish(pid, conn, bio) {
    if (!PID_RE.test(pid)) return false;
    let e = map.get(pid);
    if (!e) {
      evict();
      if (map.size >= max) return false;
      e = { bio: '', conns: new Set(), snap: null, seen: 0, likes: new Set() };
      map.set(pid, e);
    }
    e.bio = cleanBio(bio);
    e.conns.add(conn);
    e.snap = null;
    return true;
  }

  /** O jogador desligou o perfil público: some na hora, ao vivo e instantâneo. */
  function withdraw(pid) {
    map.delete(pid);
  }

  /**
   * Uma conexão saiu. Quando era a última, fica o instantâneo (nome e aparência) por `ttlMs`.
   * @param {string} pid
   * @param {any} conn
   * @param {{name: string, cfg: any}|null} snap
   */
  function leave(pid, conn, snap) {
    const e = map.get(pid);
    if (!e) return;
    e.conns.delete(conn);
    if (e.conns.size) return;
    e.seen = now();
    e.snap = snap ? { name: String(snap.name || ''), cfg: snap.cfg || {} } : null;
    if (!e.snap) map.delete(pid);
  }

  /**
   * @param {string} pid
   * @returns {{name: string, bio: string, online: boolean, seenAt: number, likes: number, look: ReturnType<typeof look>}|null}
   */
  function get(pid) {
    if (!PID_RE.test(pid)) return null;
    const e = map.get(pid);
    if (!e) return null;
    for (const c of e.conns) {
      const me = c && c.me;
      if (me && me.name)
        return { name: me.name, bio: e.bio, online: true, seenAt: 0, likes: e.likes.size, look: look(me.cfg) };
    }
    if (e.snap && now() - e.seen < ttlMs)
      return {
        name: e.snap.name,
        bio: e.bio,
        online: false,
        seenAt: e.seen,
        likes: e.likes.size,
        look: look(e.snap.cfg)
      };
    map.delete(pid);
    return null;
  }

  /**
   * Uma curtida por pessoa (`voter` é o código público de quem curte). O contador vive só enquanto o perfil existe.
   * @param {string} pid perfil curtido
   * @param {string} voter
   * @returns {{ok: boolean, reason?: string, count?: number, dup?: boolean}}
   */
  function like(pid, voter) {
    if (!PID_RE.test(pid) || !PID_RE.test(voter)) return { ok: false, reason: 'invalid' };
    if (pid === voter) return { ok: false, reason: 'self' };
    const e = get(pid) && map.get(pid);
    if (!e) return { ok: false, reason: 'notfound' };
    if (e.likes.has(voter)) return { ok: true, dup: true, count: e.likes.size };
    if (e.likes.size >= LIKES_MAX) return { ok: false, reason: 'full' };
    e.likes.add(voter);
    return { ok: true, count: e.likes.size };
  }

  /** Remove instantâneos vencidos. */
  function sweep() {
    const t = now();
    let n = 0;
    for (const [pid, e] of map)
      if (!e.conns.size && t - e.seen >= ttlMs) {
        map.delete(pid);
        n++;
      }
    return n;
  }

  const stats = () => ({ total: map.size, online: [...map.values()].filter(e => e.conns.size).length });

  return { publish, withdraw, leave, get, like, sweep, stats };
}

module.exports = { createPubProfiles, pidOf, cleanBio, look, PID_RE, BIO_MAX };
