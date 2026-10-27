/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Rate limiting por IP e por ação.
 */
'use strict';

const hits = new Map();
const conns = new Map();

const RATE = {
  chat: [700, 5, 5000], item: [150, 15, 5000], gest: [1500, 8, 10000], emo: [400, 12, 5000], cfg: [200, 15, 5000],
  video: [0, 4, 30000], kjoin: [1000, 4, 10000], ksong: [1000, 4, 10000], bots: [1000, 3, 5000],
  move: [25, 40, 1000], sig: [0, 300, 10000], speak: [100, 10, 1000], ice: [60000, 1, 60000],
  vjoin: [500, 4, 5000], vstop: [500, 4, 5000], kleave: [500, 4, 5000], kpass: [1000, 3, 5000],
  kdur: [1000, 2, 10000], kend: [1000, 2, 10000], ksync: [200, 10, 5000], vsync: [200, 10, 5000],
  create: [1000, 3, 60000], join: [1000, 5, 60000], resume: [1000, 5, 60000], leave: [0, 1, 1000]
};

const SOFT = new Set(['cfg', 'item', 'emo', 'gest', 'speak', 'vjoin', 'vstop', 'kleave', 'kpass', 'ksync', 'vsync', 'bots']);
const TRAIL = new Set(['cfg', 'item']);

const MSG_PER_SEC = 150;
const SIG_PER_SEC = 120;
const MAX_BUFFERED = 1 << 20;

function blocked(ip, key, max, ms) {
  return (hits.get(key + '|' + ip) || []).filter(t => Date.now() - t < ms).length >= max;
}

function over(ip, key, max, ms) {
  const k = key + '|' + ip;
  const now = Date.now();
  const a = (hits.get(k) || []).filter(t => now - t < ms);
  a.push(now);
  hits.set(k, a);
  return a.length > max;
}

function cleanupHits(MAX_HITS_KEYS) {
  const now = Date.now();
  for (const [k, a] of hits) if (!a.length || now - a[a.length - 1] > 120000) hits.delete(k);
  if (hits.size > MAX_HITS_KEYS) {
    const entries = [...hits.entries()].sort((a, b) => a[1][a[1].length - 1] - b[1][b[1].length - 1]);
    for (let i = 0; i < entries.length - MAX_HITS_KEYS; i++) hits.delete(entries[i][0]);
  }
}

function createRateLimiter() {
  const rl = {};
  const lt = {};
  const lastTxt = '';
  let lastAt = 0;
  let lastWarn = 0;
  let badHits = [];
  const defer = {};

  function rate(t) {
    const c = RATE[t]; if (!c) return true;
    const [min, max, win] = c;
    const now = Date.now();
    const s = rl[t] || (rl[t] = { last: 0, hits: [] });
    if (min && now - s.last < min) return false;
    s.hits = s.hits.filter(x => now - x < win);
    if (s.hits.length >= max) return false;
    s.last = now; s.hits.push(now); return true;
  }

  function waitFor(t) {
    const c = RATE[t], s = rl[t]; if (!c || !s) return 0;
    const [min, max, win] = c, now = Date.now();
    let w = min ? s.last + min - now : 0;
    const h = s.hits.filter(x => now - x < win);
    if (h.length >= max) w = Math.max(w, h[h.length - max] + win - now);
    return Math.max(0, w);
  }

  function trail(m) {
    const d = defer[m.t] || (defer[m.t] = { m: null, tm: null });
    d.m = m; if (d.tm) return;
    d.tm = setTimeout(() => { d.tm = null; const x = d.m; d.m = null; if (x && me && room && ws.readyState === 1) ws.emit('message', JSON.stringify(x)); }, waitFor(m.t) + 30);
  }

  function violation() {
    const now = Date.now(); badHits = badHits.filter(t => now - t < 10000); badHits.push(now);
    if (badHits.length >= 8) return true;
    return false;
  }

  function clear() {
    for (const k in defer) clearTimeout(defer[k].tm);
  }

  return { rl, lt, lastTxt, lastAt, lastWarn, badHits, defer, rate, waitFor, trail, violation, clear };
}

module.exports = { hits, conns, RATE, SOFT, TRAIL, MSG_PER_SEC, SIG_PER_SEC, MAX_BUFFERED, blocked, over, cleanupHits, createRateLimiter };