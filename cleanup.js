/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Intervals de limpeza: tick, stats, ping, hits cleanup.
 */
'use strict';

const config = require('./config');
const { cleanupHits } = require('./rate-limit');

function logError(where, e) {
  const errAt = Object.create(null);
  const now = Date.now();
  if (now - (errAt[where] || 0) < 5000) return;
  errAt[where] = now;
  console.error(where + ':', e && e.stack || e);
}

function startCleanupIntervals({ rooms, wss, bc, pub, clampPos, rnd, rr, MAX, humans, logError, config, MAX_HITS_KEYS }) {
  // Tick interval (100ms) - broadcast player positions
  setInterval(() => {
    try {
      const now = Date.now();
      for (const r of rooms.values()) {
        const s = [];
        const full = now >= (r.fullAt || 0);
        if (r.kar.length && now >= r.karEnd) {
          bc(r, { t: 'chat', name: '🎶 Karaokê', text: r.kcap ? '⏱ Limite de 13 min do karaokê atingido! Próximo cantor.' : 'Fim da música! Próximo cantor.' });
          require('./karaoke').krot(r, bc);
        }
        for (const p of r.players.values()) {
          if (p.bot) {
            if (now > p.next) {
              p.next = now + 3000 + Math.random() * 5000;
              const [tx, tz] = clampPos(rr(-6, 6), rr(-2.5, 4.5));
              p.tx = tx; p.tz = tz;
              if (Math.random() < 0.3) bc(r, { t: 'chat', name: p.name, text: ['Opa, bem-vindo!', 'Esse lugar tá incrível ✨', 'Já provou o suco?', 'Alguém quer cantar no karaokê?', 'Que poção boa!'][rnd(5)] });
            }
            const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
            if (d > 0.2) { p.x += dx / d * 0.14; p.z += dz / d * 0.14; p.ry = Math.atan2(dx, dz); }
          }
          const e = [p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2), +(p.y || 0).toFixed(2), p.s ? 1 : 0];
          const k = e.join();
          if (full || k !== p.lst) { p.lst = k; s.push(e); }
        }
        if (s.length) bc(r, { t: 'st', s });
        if (full) r.fullAt = now + 5000;
      }
    } catch (e) { logError('tick', e); }
  }, 100).unref();

  // Ping interval (30s) - keep WebSocket connections alive
  setInterval(() => {
    try {
      for (const w of wss.clients) {
        if (!w.alive) { w.terminate(); continue; }
        w.alive = false;
        try { w.ping(); } catch (e) { }
      }
    } catch (e) { logError('ping', e); }
  }, 30000).unref();

  // Hits cleanup interval (60s) - clean rate limit entries
  setInterval(() => cleanupHits(MAX_HITS_KEYS), 60000).unref();
}

module.exports = { logError, startCleanupIntervals };