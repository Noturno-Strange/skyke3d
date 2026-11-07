/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Fazenda: canteiros com plantas que crescem em tempo real, experiência de fazendeiro, recordes pessoais e conquistas.
 *
 * - O servidor decide tudo, como na culinária (lib/cook.js): o cliente só diz o canteiro e a semente. O crescimento sai de
 *   horários guardados (plantou em `a`, fica pronta em `e`), sem timer por jogador; a colheita, a experiência e os recordes
 *   só mudam aqui.
 * - O progresso é por código público do jogador (o mesmo do perfil e da culinária). Fica em `data/farm.json` (0600,
 *   gravação atômica agrupada). Consulta não grava.
 * - Emblemas não são guardados: saem dos contadores. A página /fazenda e o perfil público só mostram a fazenda de quem
 *   tem perfil público (o servidor confere antes de chamar `publicOf`).
 */
'use strict';

const C = require('../assets/catalog.js');
const { readJsonFile, writeJsonAtomic } = require('./persist');

const PID_RE = /^[0-9a-f]{20}$/;
const MAX_FARMS = 20000;
const MAX_LEVEL = 20;
const COUNT_MAX = 1000000;
const SLOTS = C.FARM_W * C.FARM_H;
const FIRST_BONUS = 3; // a primeira colheita de cada planta rende o triplo de experiência
const WATER_CUT = 0.25; // regar corta 25% do tempo que falta e dá +1 na colheita
const has = (/** @type {any} */ o, /** @type {string} */ k) => Object.prototype.hasOwnProperty.call(o, k);

/** experiência total para chegar ao nível `lv` (nível 1 = 0) */
const xpFor = (/** @type {number} */ lv) => (50 * lv * (lv - 1)) / 2;
/** @param {number} xp */
function levelOf(xp) {
  let lv = 1;
  while (lv < MAX_LEVEL && xp >= xpFor(lv + 1)) lv++;
  return lv;
}

const ids = (/** @type {string} */ c) => C.CROPS.filter(x => x.c === c).map(x => x.id);
const FLOWERS = ids('Flores'),
  FRUITS = ids('Frutas');
const countIn = (/** @type {any} */ s, /** @type {string[]} */ list) => list.filter(id => s.d[id]).length;

/** Conquistas de fazendeiro: dadas pelo progresso, nunca pelo cliente. */
const BADGES = [
  {
    id: 'semente',
    n: 'Primeira Semente',
    i: '🌱',
    t: 'Faça a primeira colheita',
    ok: (/** @type {any} */ s) => s.h >= 1
  },
  {
    id: 'horta',
    n: 'Horta Variada',
    i: '🥕',
    t: 'Colha 10 plantas diferentes',
    ok: (/** @type {any} */ s) => s.distinct >= 10
  },
  {
    id: 'jardineiro',
    n: 'Jardineiro',
    i: '🌷',
    t: 'Colha 5 flores diferentes',
    ok: (/** @type {any} */ s) => countIn(s, FLOWERS) >= 5
  },
  {
    id: 'pomar',
    n: 'Pomar Cheio',
    i: '🍎',
    t: 'Colha 10 frutas diferentes',
    ok: (/** @type {any} */ s) => countIn(s, FRUITS) >= 10
  },
  { id: 'regador', n: 'Regador', i: '💧', t: 'Regue 50 vezes', ok: (/** @type {any} */ s) => s.w >= 50 },
  { id: 'cesto', n: 'Cesto Cheio', i: '🧺', t: 'Faça 100 colheitas', ok: (/** @type {any} */ s) => s.h >= 100 },
  {
    id: 'celeiro',
    n: 'Celeiro Lotado',
    i: '🚜',
    t: 'Colha 1000 unidades no total',
    ok: (/** @type {any} */ s) => s.q >= 1000
  },
  {
    id: 'sortudo',
    n: 'Sortudo',
    i: '🍀',
    t: 'Colha um trevo da sorte',
    ok: (/** @type {any} */ s) => !!s.d.trevo
  },
  {
    id: 'fazendeiro',
    n: 'Fazendeiro de Verdade',
    i: '🧑‍🌾',
    t: 'Chegue ao nível 10 de fazendeiro',
    ok: (/** @type {any} */ s) => levelOf(s.x) >= 10
  },
  {
    id: 'mestre_fazenda',
    n: 'Mestre da Fazenda',
    i: '🏆',
    t: 'Colha as ' + C.CROPS.length + ' plantas',
    ok: (/** @type {any} */ s) => C.CROPS.every(c => s.d[c.id])
  }
];

/**
 * @typedef {{c: string, a: number, e: number, w: number}} Plot
 * @typedef {{x: number, s: Record<string, Plot>, d: Record<string, number>, q: number, h: number, w: number, p: number,
 *   b: {c: string, n: number, at: number} | null}} Rec
 */

/**
 * @param {{file?: string, max?: number, delayMs?: number, now?: () => number, rng?: () => number,
 *   onError?: (w: string, e: any) => void}} [o]
 */
function createFarm({
  file = '',
  max = MAX_FARMS,
  delayMs = 5000,
  now = Date.now,
  rng = Math.random,
  onError = () => {}
} = {}) {
  /** @type {Map<string, Rec>} */
  const players = new Map();
  let dirty = false,
    timer = /** @type {any} */ (null);

  const int = (/** @type {any} */ v, top = COUNT_MAX) => (Number.isInteger(v) && v >= 0 && v <= top ? v : 0);

  /** valida um registro lido do disco: nada do que está no arquivo é confiado */
  function clean(/** @type {any} */ r) {
    if (!r || typeof r !== 'object') return null;
    /** @type {Record<string, number>} */
    const d = {};
    if (r.d && typeof r.d === 'object')
      for (const [id, n] of Object.entries(r.d)) if (has(C.CROP, id) && int(n) > 0) d[id] = int(n);
    /** @type {Record<string, Plot>} */
    const s = {};
    if (r.s && typeof r.s === 'object')
      for (const [k, p] of Object.entries(r.s)) {
        const i = Number(k);
        if (!Number.isInteger(i) || i < 0 || i >= SLOTS || !p || typeof p !== 'object') continue;
        const a = Number.isSafeInteger(p.a) && p.a > 0 ? p.a : 0,
          e = Number.isSafeInteger(p.e) && p.e >= a ? p.e : 0;
        if (typeof p.c === 'string' && has(C.CROP, p.c) && a && e) s[String(i)] = { c: p.c, a, e, w: p.w ? 1 : 0 };
      }
    const b =
      r.b && typeof r.b.c === 'string' && has(C.CROP, r.b.c) && int(r.b.n) > 0
        ? { c: r.b.c, n: int(r.b.n), at: Number.isSafeInteger(r.b.at) ? r.b.at : 0 }
        : null;
    const rec = {
      x: Math.min(xpFor(MAX_LEVEL), int(r.x)),
      s,
      d,
      q: int(r.q),
      h: int(r.h),
      w: int(r.w),
      p: int(r.p),
      b
    };
    return rec.x || rec.p || Object.keys(s).length ? rec : null;
  }

  if (file) {
    let obj = null;
    try {
      obj = readJsonFile(file);
    } catch (e) {
      onError('fazenda', e);
    }
    if (obj && obj.v === 1 && obj.p && typeof obj.p === 'object')
      for (const [pid, r] of Object.entries(obj.p)) {
        if (players.size >= max) break;
        const rec = PID_RE.test(pid) ? clean(r) : null;
        if (rec) players.set(pid, rec);
      }
  }

  function write() {
    if (!file || !dirty) return;
    dirty = false;
    /** @type {Record<string, Rec>} */
    const p = {};
    for (const [pid, r] of players) p[pid] = r;
    try {
      writeJsonAtomic(file, { v: 1, p });
    } catch (e) {
      dirty = true;
      onError('fazenda', e);
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

  const blank = () => /** @type {Rec} */ ({ x: 0, s: {}, d: {}, q: 0, h: 0, w: 0, p: 0, b: null });
  function stats(/** @type {Rec | undefined} */ r) {
    const x = r || blank();
    return { ...x, distinct: Object.keys(x.d).length };
  }
  const badgeIds = (/** @type {ReturnType<typeof stats>} */ s) => BADGES.filter(b => b.ok(s)).map(b => b.id);

  /** recordes pessoais (o que o perfil e a página da fazenda mostram) */
  function records(/** @type {ReturnType<typeof stats>} */ s) {
    let fav = '',
      favN = 0;
    for (const [id, n] of Object.entries(s.d))
      if (n > favN) {
        fav = id;
        favN = n;
      }
    return {
      harvests: s.h,
      units: s.q,
      kinds: s.distinct,
      total: C.CROPS.length,
      water: s.w,
      planted: s.p,
      best: s.b ? { c: s.b.c, n: s.b.n, at: s.b.at } : null,
      fav: fav ? { c: fav, n: favN } : null
    };
  }
  function plots(/** @type {Rec | undefined} */ r) {
    /** @type {({c: string, a: number, e: number, w: number} | null)[]} */
    const out = [];
    for (let i = 0; i < SLOTS; i++) {
      const p = r && r.s[String(i)];
      out.push(p ? { c: p.c, a: p.a, e: p.e, w: p.w } : null);
    }
    return out;
  }
  function level(/** @type {number} */ xp) {
    const lv = levelOf(xp),
      lo = xpFor(lv),
      hi = lv >= MAX_LEVEL ? lo : xpFor(lv + 1);
    return { xp, lv, lo, hi, max: lv >= MAX_LEVEL, open: C.farmPlots(lv) };
  }

  /**
   * Tudo o que o painel da fazenda mostra. `now` vai junto para o cliente acertar o relógio das barras de progresso.
   * @param {string} pid
   */
  function view(pid) {
    const r = players.get(pid),
      s = stats(r),
      have = new Set(badgeIds(s));
    return {
      ...level(s.x),
      now: now(),
      plots: plots(r),
      done: s.d,
      rec: records(s),
      badges: BADGES.map(b => ({ id: b.id, n: b.n, i: b.i, t: b.t, on: have.has(b.id) }))
    };
  }

  /**
   * Fazenda para quem visita (/fazenda e perfil público): canteiros, nível, recordes e só as conquistas já ganhas.
   * @param {string} pid
   */
  function publicOf(pid) {
    const r = players.get(pid),
      s = stats(r),
      have = new Set(badgeIds(s));
    return {
      ...level(s.x),
      now: now(),
      plots: plots(r),
      rec: records(s),
      badges: BADGES.filter(b => have.has(b.id)).map(b => ({ id: b.id, n: b.n, i: b.i }))
    };
  }

  /** Conquistas de fazendeiro para a lista de emblemas do perfil público. */
  function badgesOf(/** @type {string} */ pid) {
    const have = new Set(badgeIds(stats(players.get(pid))));
    return BADGES.filter(b => have.has(b.id)).map(b => ({ id: b.id, name: b.n, icon: b.i }));
  }

  /** registro do jogador, criado na primeira ação que grava; null quando não há vaga */
  function own(/** @type {string} */ pid) {
    let r = players.get(pid);
    if (!r) {
      if (players.size >= max) return null;
      r = blank();
      players.set(pid, r);
    }
    return r;
  }
  const slotOk = (/** @type {any} */ i) => Number.isInteger(i) && i >= -1 && i < SLOTS;

  /**
   * Planta `crop` no canteiro `i` (ou em todos os vazios, com i = -1).
   * @param {string} pid
   * @param {number} i
   * @param {string} crop
   */
  function plant(pid, i, crop) {
    if (!PID_RE.test(pid)) return { ok: false, reason: 'pid' };
    if (!slotOk(i)) return { ok: false, reason: 'canteiro' };
    if (typeof crop !== 'string' || !has(C.CROP, crop)) return { ok: false, reason: 'semente' };
    const cr = C.CROP[crop],
      cur = players.get(pid),
      lv = levelOf(cur ? cur.x : 0),
      open = C.farmPlots(lv);
    if (cr.lv > lv) return { ok: false, reason: 'nivel' };
    if (i >= open) return { ok: false, reason: 'fechado' };
    const free = i >= 0 ? (cur && cur.s[String(i)] ? [] : [i]) : [];
    if (i < 0) for (let k = 0; k < open; k++) if (!(cur && cur.s[String(k)])) free.push(k);
    if (!free.length) return { ok: false, reason: i >= 0 ? 'ocupado' : 'cheio' };
    const r = own(pid);
    if (!r) return { ok: false, reason: 'full' };
    const n = now();
    for (const k of free) r.s[String(k)] = { c: crop, a: n, e: n + cr.t * 1000, w: 0 };
    r.p = Math.min(COUNT_MAX, r.p + free.length);
    save();
    return { ok: true, n: free.length, state: view(pid) };
  }

  /**
   * Rega o canteiro `i` (ou todos os que estão crescendo e ainda não foram regados, com i = -1).
   * @param {string} pid
   * @param {number} i
   */
  function water(pid, i) {
    if (!PID_RE.test(pid)) return { ok: false, reason: 'pid' };
    if (!slotOk(i)) return { ok: false, reason: 'canteiro' };
    const r = players.get(pid),
      n = now();
    if (!r) return { ok: false, reason: 'vazio' };
    const list = i >= 0 ? [i] : [...Array(SLOTS).keys()];
    let done = 0,
      why = 'vazio';
    for (const k of list) {
      const p = r.s[String(k)];
      if (!p) continue;
      if (p.e <= n) {
        why = 'pronta';
        continue;
      }
      if (p.w) {
        why = 'regada';
        continue;
      }
      p.e = Math.max(n, Math.round(p.e - (p.e - n) * WATER_CUT));
      p.w = 1;
      done++;
    }
    if (!done) return { ok: false, reason: why };
    r.w = Math.min(COUNT_MAX, r.w + done);
    save();
    return { ok: true, n: done, state: view(pid) };
  }

  /**
   * Arranca a planta do canteiro `i` antes de ficar pronta (sem colheita e sem experiência).
   * @param {string} pid
   * @param {number} i
   */
  function dig(pid, i) {
    if (!PID_RE.test(pid)) return { ok: false, reason: 'pid' };
    if (!Number.isInteger(i) || i < 0 || i >= SLOTS) return { ok: false, reason: 'canteiro' };
    const r = players.get(pid);
    if (!r || !r.s[String(i)]) return { ok: false, reason: 'vazio' };
    delete r.s[String(i)];
    save();
    return { ok: true, n: 1, state: view(pid) };
  }

  /**
   * Colhe o canteiro `i` (ou todos os prontos, com i = -1). Rende de y[0] a y[1] unidades, +1 se foi regada.
   * @param {string} pid
   * @param {number} i
   */
  function harvest(pid, i) {
    if (!PID_RE.test(pid)) return { ok: false, reason: 'pid' };
    if (!slotOk(i)) return { ok: false, reason: 'canteiro' };
    const r = players.get(pid),
      n = now();
    if (!r) return { ok: false, reason: 'vazio' };
    const list = i >= 0 ? [i] : [...Array(SLOTS).keys()];
    const before = stats(r),
      lvBefore = levelOf(before.x),
      badgesBefore = new Set(badgeIds(before));
    /** @type {{i: number, c: string, n: number, first: boolean}[]} */
    const got = [];
    let gain = 0,
      why = 'vazio';
    for (const k of list) {
      const p = r.s[String(k)];
      if (!p) continue;
      if (p.e > n) {
        why = 'crescendo';
        continue;
      }
      const cr = C.CROP[p.c];
      const amount = cr.y[0] + Math.floor(rng() * (cr.y[1] - cr.y[0] + 1)) + (p.w ? 1 : 0);
      const first = !r.d[p.c];
      gain += cr.xp * (first ? FIRST_BONUS : 1);
      r.d[p.c] = Math.min(COUNT_MAX, (r.d[p.c] || 0) + 1);
      r.q = Math.min(COUNT_MAX, r.q + amount);
      r.h = Math.min(COUNT_MAX, r.h + 1);
      if (!r.b || amount > r.b.n || (amount === r.b.n && cr.xp > C.CROP[r.b.c].xp)) r.b = { c: p.c, n: amount, at: n };
      got.push({ i: k, c: p.c, n: amount, first });
      delete r.s[String(k)];
    }
    if (!got.length) return { ok: false, reason: why };
    r.x = Math.min(xpFor(MAX_LEVEL), r.x + gain);
    save();
    const after = stats(r),
      lv = levelOf(after.x);
    return {
      ok: true,
      n: got.length,
      got,
      xp: gain,
      lv,
      lvUp: lv > lvBefore,
      plotsUp: C.farmPlots(lv) - C.farmPlots(lvBefore),
      badges: BADGES.filter(b => b.ok(after) && !badgesBefore.has(b.id)).map(b => ({ id: b.id, n: b.n, i: b.i })),
      state: view(pid)
    };
  }

  /**
   * Uma ação vinda do cliente (já validada pelo formato): planta, rega, colhe ou arranca.
   * @param {string} pid
   * @param {{k: string, i: number, c?: string}} m
   */
  function act(pid, m) {
    if (m.k === 'plant') return plant(pid, m.i, m.c || '');
    if (m.k === 'water') return water(pid, m.i);
    if (m.k === 'harvest') return harvest(pid, m.i);
    if (m.k === 'dig') return dig(pid, m.i);
    return { ok: false, reason: 'acao' };
  }

  return { view, publicOf, badgesOf, plant, water, harvest, dig, act, flush, size: () => players.size };
}

module.exports = { createFarm, xpFor, levelOf, BADGES, MAX_LEVEL, MAX_FARMS, SLOTS, WATER_CUT, PID_RE };
