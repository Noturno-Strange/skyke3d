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
 *
 * Custo: um acerto é O(1) mesmo com o mapa cheio. A ordem de inserção do Map é a ordem de uso (cada acerto
 * move a chave para o fim), então passar do teto descarta as chaves usadas há mais tempo sem ordenar nada.
 * (Antes, cada chave nova com o mapa cheio copiava e ordenava as 50 mil entradas: ~3 ms por requisição, o
 * que deixava o servidor inteiro lento sob uma inundação de origens diferentes.)
 */
function createLimiter({ maxKeys = 50000, sweepMs = 60000, maxAgeMs = 600000 } = {}) {
  const map = new Map();
  let lastSweep = 0;

  // Chaves vencidas: varredura O(n), no máximo uma por `sweepMs` (ou quando pedida por `prune`).
  function sweep(now, force) {
    if (!force && now - lastSweep < sweepMs) return;
    lastSweep = now;
    for (const [k, a] of map) if (!a.length || now - a[a.length - 1] > maxAgeMs) map.delete(k);
  }
  // Passou do teto: sai a chave usada há mais tempo (a primeira do Map).
  function trim() {
    while (map.size > maxKeys) map.delete(map.keys().next().value);
  }

  function hit(key, max, win, now = Date.now()) {
    sweep(now);
    let a = map.get(key);
    if (a) map.delete(key);
    else a = [];
    map.set(key, a); // a chave tocada vai para o fim da ordem de uso
    let i = 0;
    while (i < a.length && now - a[i] >= win) i++;
    if (i) a.splice(0, i);
    a.push(now);
    if (map.size > maxKeys) trim();
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
    prune: now => {
      sweep(now, true);
      trim();
    },
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
  let lastExpire = 0;
  const clampLevel = i => Math.max(0, Math.min(i, levels.length - 1));

  // Esquecidos: banimento vencido e sem strike novo há `resetMs`. Varredura O(n).
  function expire(now) {
    lastExpire = now;
    for (const [k, e] of map) if (e.until <= now && now - e.last > resetMs) map.delete(k);
  }
  // Passou do teto: tira os esquecidos (no máximo uma varredura por minuto) e, se ainda sobrar, as chaves com o strike
  // mais antigo, que vêm primeiro na ordem do Map (cada strike/ban move a chave para o fim). Sem ordenar nada.
  function trim(now) {
    if (now - lastExpire >= 60000) expire(now);
    while (map.size > max) map.delete(map.keys().next().value);
  }
  const put = (key, rec, now) => {
    map.delete(key);
    map.set(key, rec);
    if (map.size > max) trim(now);
  };

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
    put(key, rec, now);
    return { ms, until: rec.until, level: lvl };
  }

  /**
   * Banimento manual por `ms` milissegundos. Não escala o nível automático:
   * o histórico de strikes da chave fica como estava.
   */
  function block(key, ms, now = Date.now()) {
    if (!Number.isFinite(ms) || ms <= 0) return null;
    const e = map.get(key);
    const rec = { level: e ? clampLevel(e.level) : 0, until: now + ms, last: now };
    put(key, rec, now);
    return { ms, until: rec.until };
  }

  /** Remove a chave (e o histórico dela). Devolve true se existia. */
  function unban(key) {
    return map.delete(key);
  }

  /** Banimentos ativos agora, o que expira por último primeiro. */
  function list(now = Date.now()) {
    const out = [];
    for (const [key, e] of map) if (e.until > now) out.push({ key, until: e.until, level: e.level, last: e.last });
    return out.sort((a, b) => b.until - a.until);
  }

  function prune(now = Date.now()) {
    expire(now);
    while (map.size > max) map.delete(map.keys().next().value);
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

  return { check, strike, block, unban, list, prune, snapshot, restore, size: () => map.size, levels };
}

module.exports = { createLimiter, createBanStore };
