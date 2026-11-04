/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Emblemas do perfil público. Dois tipos:
 * - concedidos: só o administrador dá ou tira, pelo painel /status. Ficam em `data/badges.json` (por código público do
 *   perfil, sem nome nem id de identidade). O jogador não tem como pôr um emblema em si mesmo.
 * - automáticos: calculados na hora a partir do próprio perfil, sem guardar nada.
 * Como a página busca tudo direto do servidor, não há emblema que viaje de mão em mão; por isso não precisa de assinatura
 * digital (ela só serviria para dados portáteis, copiáveis para fora do servidor).
 */
'use strict';

const { readJsonFile, writeJsonAtomic } = require('./persist');

const PID_RE = /^[0-9a-f]{20}$/;
const MAX_PIDS = 5000;

/** Emblemas que o administrador concede. */
const GRANTED = {
  equipe: { n: 'Equipe', i: '🛡️' },
  apoiador: { n: 'Apoiador', i: '💜' },
  pioneiro: { n: 'Pioneiro', i: '🚀' }
};

/**
 * Emblemas automáticos do perfil, a partir do que ele tem agora.
 * @param {{bio: string, like: string, mood: string, world: string, likes: number}} p
 * @returns {{id: string, n: string, i: string}[]}
 */
function derived(p) {
  const out = [];
  if (p.bio.length >= 20 && p.like && p.mood && p.world) out.push({ id: 'completo', n: 'Perfil completo', i: '✍️' });
  if (p.likes >= 10) out.push({ id: 'querido', n: 'Querido pela galera', i: '❤️' });
  return out;
}

/** @param {{file?: string, delayMs?: number, onError?: (w: string, e: any) => void}} [o] */
function createBadges({ file = '', delayMs = 2000, onError = () => {} } = {}) {
  /** @type {Map<string, Set<string>>} */
  const grants = new Map();
  let dirty = false,
    timer = /** @type {any} */ (null);

  if (file) {
    let obj = null;
    try {
      obj = readJsonFile(file);
    } catch (e) {
      onError('emblemas', e);
    }
    if (obj && obj.v === 1 && obj.g && typeof obj.g === 'object')
      for (const [pid, ids] of Object.entries(obj.g)) {
        if (grants.size >= MAX_PIDS) break;
        if (!PID_RE.test(pid) || !Array.isArray(ids)) continue;
        const set = new Set(ids.filter(x => typeof x === 'string' && Object.prototype.hasOwnProperty.call(GRANTED, x)));
        if (set.size) grants.set(pid, set);
      }
  }

  function write() {
    if (!file || !dirty) return;
    dirty = false;
    /** @type {Record<string, string[]>} */
    const g = {};
    for (const [pid, set] of grants) g[pid] = [...set];
    try {
      writeJsonAtomic(file, { v: 1, g });
    } catch (e) {
      dirty = true;
      onError('emblemas', e);
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
  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    write();
  }

  /**
   * @param {string} pid
   * @param {string} id emblema concedido
   * @param {boolean} on dar (true) ou tirar (false)
   * @returns {{ok: boolean, reason?: string, badges?: string[]}}
   */
  function set(pid, id, on) {
    if (!PID_RE.test(pid)) return { ok: false, reason: 'pid' };
    if (!Object.prototype.hasOwnProperty.call(GRANTED, id)) return { ok: false, reason: 'badge' };
    let s = grants.get(pid);
    if (on) {
      if (!s) {
        if (grants.size >= MAX_PIDS) return { ok: false, reason: 'full' };
        s = new Set();
        grants.set(pid, s);
      }
      s.add(id);
    } else if (s) {
      s.delete(id);
      if (!s.size) grants.delete(pid);
    }
    save();
    return { ok: true, badges: [...(grants.get(pid) || [])] };
  }

  /**
   * Emblemas para mostrar: concedidos primeiro, depois os automáticos.
   * @param {string} pid
   * @param {{bio: string, like: string, mood: string, world: string, likes: number}} profile
   * @returns {{id: string, name: string, icon: string}[]}
   */
  function of(pid, profile) {
    const out = [...(grants.get(pid) || [])].map(id => ({ id, name: GRANTED[id].n, icon: GRANTED[id].i }));
    for (const d of derived(profile)) out.push({ id: d.id, name: d.n, icon: d.i });
    return out;
  }

  return { set, of, flush, size: () => grants.size };
}

module.exports = { createBadges, GRANTED, derived };
