/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Limitadores puros: janela deslizante por chave e banimento progressivo.
 * Sem I/O e sem relógio global — `now` é sempre injetável para testes.
 */
'use strict';

/**
 * Janela deslizante com teto de chaves. Cada chave guarda os instantes dos
 * últimos acertos; a janela é aplicada na leitura, então a mesma chave pode
 * ser usada com janelas diferentes sem perder precisão.
 */
function createLimiter({ maxKeys = 50000, sweepMs = 60000, maxAgeMs = 600000 } = {}) {
  const map = new Map();
  let lastSweep = 0;

  function sweep(now, force) {
    if (!force && now - lastSweep < sweepMs && map.size <= maxKeys) return;
    lastSweep = now;
    for (const [k, a] of map) {
      if (!a.length || now - a[a.length - 1] > maxAgeMs) map.delete(k);
    }
    if (map.size <= maxKeys) return;
    const byAge = [...map].sort((x, y) => x[1][x[1].length - 1] - y[1][y[1].length - 1]);
    for (let i = 0; i < byAge.length - maxKeys; i++) map.delete(byAge[i][0]);
  }

  function hit(key, max, win, now = Date.now()) {
    sweep(now);
    let a = map.get(key);
    if (!a) { a = []; map.set(key, a); }
    let i = 0;
    while (i < a.length && now - a[i] >= win) i++;
    if (i) a.splice(0, i);
    a.push(now);
    if (map.size > maxKeys) sweep(now, true);
    return { over: a.length > max, count: a.length };
  }

  function count(key, win, now = Date.now()) {
    const a = map.get(key);
    if (!a) return 0;
    let i = 0;
    while (i < a.length && now - a[i] >= win) i++;
    return a.length - i;
  }

  return {
    hit,
    count,
    over: (key, max, win, now) => hit(key, max, win, now).over,
    blocked: (key, max, win, now) => count(key, win, now) >= max,
    prune: now => sweep(now, true),
    size: () => map.size
  };
}

/**
 * Banimento progressivo. O primeiro strike dura `levels[0]`, o segundo
 * `levels[1]` e assim por diante. Sem novo strike por `resetMs`, o histórico
 * da chave é descartado (volta ao primeiro nível).
 */
function createBanStore({ levels = [120000, 1800000, 21600000], resetMs = 86400000, max = 20000 } = {}) {
  const map = new Map();
  const clampLevel = i => Math.max(0, Math.min(i, levels.length - 1));

  function check(key, now = Date.now()) {
    const e = map.get(key);
    if (!e) return 0;
    if (e.until > now) return e.until - now;
    if (now - e.last > resetMs) map.delete(key);
    return 0;
  }

  function strike(key, now = Date.now()) {
    let e = map.get(key);
    if (!e || (e.until <= now && now - e.last > resetMs)) e = { level: 0, until: 0, last: 0 };
    const lvl = clampLevel(e.level);
    const ms = levels[lvl];
    const rec = { level: clampLevel(lvl + 1), until: now + ms, last: now };
    map.set(key, rec);
    if (map.size > max) prune(now);
    return { ms, until: rec.until, level: lvl };
  }

  function prune(now = Date.now()) {
    for (const [k, e] of map) {
      if (e.until <= now && now - e.last > resetMs) map.delete(k);
    }
    if (map.size <= max) return;
    const byAge = [...map].sort((x, y) => x[1].last - y[1].last);
    for (let i = 0; i < byAge.length - max; i++) map.delete(byAge[i][0]);
  }

  function snapshot(now = Date.now()) {
    const out = {};
    for (const [k, e] of map) {
      if (e.until > now || now - e.last <= resetMs) out[k] = [e.until, e.level, e.last];
    }
    return out;
  }

  function restore(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (map.size >= max) break;
      if (!Array.isArray(v) || v.length !== 3) continue;
      const [until, level, last] = v.map(Number);
      if (![until, level, last].every(Number.isFinite)) continue;
      map.set(String(k), { until, level: clampLevel(level), last });
    }
  }

  return { check, strike, prune, snapshot, restore, size: () => map.size, levels };
}

module.exports = { createLimiter, createBanStore };
