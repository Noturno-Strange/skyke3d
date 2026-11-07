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
 * - Moedas: cada unidade colhida vende pelo preço da planta (`$` no catálogo). Com elas o jogador compra terreno maior (mais
 *   canteiros), propriedade maior (colheita maior) e casa maior (mais experiência), em níveis (FARM_LAND, FARM_PROP, FARM_HOUSE).
 *   Não há troca de moedas entre jogadores.
 * - Antifraude (lib/guard.js): `gain(pid, xp)` devolve quanto do ganho vale (0 a 1) pelo ritmo e pelo cansaço do dia; vale para
 *   a experiência e as moedas da colheita.
 */
'use strict';

const C = require('../assets/catalog.js');
const { readJsonFile, writeJsonAtomic } = require('./persist');

const PID_RE = /^[0-9a-f]{20}$/;
const MAX_FARMS = 20000;
const MAX_LEVEL = 20;
const COUNT_MAX = 1000000;
const SLOTS = C.FARM_W * C.FARM_H;
const COINS_MAX = 100000000;
const OLD_W = 6; // grade da primeira versão (v:1 no arquivo), convertida ao carregar
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
 *   b: {c: string, n: number, at: number} | null, m: number, me: number, tl: number, tp: number, th: number}} Rec
 */
const TIERS = { land: ['tl', C.FARM_LAND], prop: ['tp', C.FARM_PROP], house: ['th', C.FARM_HOUSE] };

/**
 * @param {{file?: string, max?: number, delayMs?: number, now?: () => number, rng?: () => number,
 *   gain?: (pid: string, xp: number) => number, onError?: (w: string, e: any) => void}} [o]
 */
function createFarm({
  file = '',
  max = MAX_FARMS,
  delayMs = 5000,
  now = Date.now,
  rng = Math.random,
  gain = () => 1,
  onError = () => {}
} = {}) {
  /** @type {Map<string, Rec>} */
  const players = new Map();
  let dirty = false,
    timer = /** @type {any} */ (null);

  const int = (/** @type {any} */ v, top = COUNT_MAX) => (Number.isInteger(v) && v >= 0 && v <= top ? v : 0);
  const tierOk = (/** @type {any} */ v, /** @type {any[]} */ list) =>
    Math.min(list.length - 1, int(v, list.length - 1));

  /** valida um registro lido do disco: nada do que está no arquivo é confiado. v1 = grade 6×6 sem moedas */
  function clean(/** @type {any} */ r, /** @type {number} */ v) {
    if (!r || typeof r !== 'object') return null;
    /** @type {Record<string, number>} */
    const d = {};
    if (r.d && typeof r.d === 'object')
      for (const [id, n] of Object.entries(r.d)) if (has(C.CROP, id) && int(n) > 0) d[id] = int(n);
    /** @type {Plot[]} */
    const old = [];
    /** @type {Record<string, Plot>} */
    let s = {};
    if (r.s && typeof r.s === 'object')
      for (const [k, p] of Object.entries(r.s)) {
        const i = Number(k);
        if (!Number.isInteger(i) || i < 0 || i >= (v === 1 ? OLD_W * OLD_W : SLOTS) || !p || typeof p !== 'object')
          continue;
        const a = Number.isSafeInteger(p.a) && p.a > 0 ? p.a : 0,
          e = Number.isSafeInteger(p.e) && p.e >= a ? p.e : 0;
        if (typeof p.c === 'string' && has(C.CROP, p.c) && a && e) {
          const pl = { c: p.c, a, e, w: p.w ? 1 : 0 };
          if (v === 1) old.push(pl);
          else s[String(i)] = pl;
        }
      }
    const b =
      r.b && typeof r.b.c === 'string' && has(C.CROP, r.b.c) && int(r.b.n) > 0
        ? { c: r.b.c, n: int(r.b.n), at: Number.isSafeInteger(r.b.at) ? r.b.at : 0 }
        : null;
    const x = Math.min(xpFor(MAX_LEVEL), int(r.x));
    let tl = tierOk(r.tl, C.FARM_LAND);
    if (v === 1) {
      // primeira versão: os canteiros vinham do nível (6 + 2 × nível, até 36). Ganha o terreno que cabe pelo menos isso e as plantas
      // vão para os primeiros canteiros abertos, na ordem nova
      const need = Math.max(old.length, Math.min(36, 6 + 2 * levelOf(x)));
      tl = C.FARM_LAND.findIndex(l => l.p >= need);
      s = {};
      old.forEach((pl, k) => {
        s[String(C.FARM_ORDER[k])] = pl;
      });
    }
    const rec = {
      x,
      s,
      d,
      q: int(r.q),
      h: int(r.h),
      w: int(r.w),
      p: int(r.p),
      b,
      m: int(r.m, COINS_MAX),
      me: int(r.me, COINS_MAX),
      tl,
      tp: tierOk(r.tp, C.FARM_PROP),
      th: tierOk(r.th, C.FARM_HOUSE)
    };
    return rec.x || rec.p || rec.m || Object.keys(s).length ? rec : null;
  }

  if (file) {
    let obj = null;
    try {
      obj = readJsonFile(file);
    } catch (e) {
      onError('fazenda', e);
    }
    if (obj && (obj.v === 1 || obj.v === 2) && obj.p && typeof obj.p === 'object')
      for (const [pid, r] of Object.entries(obj.p)) {
        if (players.size >= max) break;
        const rec = PID_RE.test(pid) ? clean(r, obj.v) : null;
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
      writeJsonAtomic(file, { v: 2, p });
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

  const blank = () =>
    /** @type {Rec} */ ({ x: 0, s: {}, d: {}, q: 0, h: 0, w: 0, p: 0, b: null, m: 0, me: 0, tl: 0, tp: 0, th: 0 });
  function stats(/** @type {Rec | undefined} */ r) {
    const x = r || blank();
    return { ...x, distinct: Object.keys(x.d).length };
  }
  const badgeIds = (/** @type {ReturnType<typeof stats>} */ s) => BADGES.filter(b => b.ok(s)).map(b => b.id);
  const openOf = (/** @type {Rec | undefined} */ r) => C.farmOpen(r ? r.tl : 0);

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
      earned: s.me,
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
  function level(/** @type {ReturnType<typeof stats>} */ s) {
    const lv = levelOf(s.x),
      lo = xpFor(lv),
      hi = lv >= MAX_LEVEL ? lo : xpFor(lv + 1);
    return {
      xp: s.x,
      lv,
      lo,
      hi,
      max: lv >= MAX_LEVEL,
      open: C.FARM_LAND[s.tl].p,
      land: s.tl,
      prop: s.tp,
      house: s.th
    };
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
      ...level(s),
      coins: s.m,
      now: now(),
      plots: plots(r),
      done: s.d,
      rec: records(s),
      badges: BADGES.map(b => ({ id: b.id, n: b.n, i: b.i, t: b.t, on: have.has(b.id) }))
    };
  }

  /**
   * Fazenda para quem visita (/fazenda e perfil público): canteiros, nível, evolução, recordes e só as conquistas já ganhas.
   * O saldo de moedas não vai (só o total ganho, nos recordes).
   * @param {string} pid
   */
  function publicOf(pid) {
    const r = players.get(pid),
      s = stats(r),
      have = new Set(badgeIds(s));
    return {
      ...level(s),
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
      open = openOf(cur);
    if (cr.lv > lv) return { ok: false, reason: 'nivel' };
    if (i >= 0 && !open.includes(i)) return { ok: false, reason: 'fechado' };
    const free = (i >= 0 ? [i] : open).filter(k => !(cur && cur.s[String(k)]));
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
   * Colhe o canteiro `i` (ou todos os prontos, com i = -1). Rende de y[0] a y[1] unidades, +1 se foi regada, mais o bônus da
   * propriedade; cada unidade vende pelo preço da planta. A casa dá bônus de experiência. O antifraude (`gain`) diz quanto
   * da experiência e das moedas vale agora.
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
      badgesBefore = new Set(badgeIds(before)),
      pb = C.FARM_PROP[r.tp].b,
      hb = C.FARM_HOUSE[r.th].b;
    /** @type {{i: number, c: string, n: number, first: boolean}[]} */
    const got = [];
    let raw = 0,
      cash = 0,
      why = 'vazio';
    for (const k of list) {
      const p = r.s[String(k)];
      if (!p) continue;
      if (p.e > n) {
        why = 'crescendo';
        continue;
      }
      const cr = C.CROP[p.c];
      const base = cr.y[0] + Math.floor(rng() * (cr.y[1] - cr.y[0] + 1)) + (p.w ? 1 : 0);
      const amount = Math.max(1, Math.round(base * (1 + pb)));
      const first = !r.d[p.c];
      raw += cr.xp * (first ? FIRST_BONUS : 1) * (1 + hb);
      cash += amount * cr.$;
      r.d[p.c] = Math.min(COUNT_MAX, (r.d[p.c] || 0) + 1);
      r.q = Math.min(COUNT_MAX, r.q + amount);
      r.h = Math.min(COUNT_MAX, r.h + 1);
      if (!r.b || amount > r.b.n || (amount === r.b.n && cr.xp > C.CROP[r.b.c].xp)) r.b = { c: p.c, n: amount, at: n };
      got.push({ i: k, c: p.c, n: amount, first });
      delete r.s[String(k)];
    }
    if (!got.length) return { ok: false, reason: why };
    const f = Math.max(0, Math.min(1, gain(pid, Math.round(raw))));
    const xp = Math.round(raw * f),
      coins = Math.round(cash * f);
    r.x = Math.min(xpFor(MAX_LEVEL), r.x + xp);
    r.m = Math.min(COINS_MAX, r.m + coins);
    r.me = Math.min(COINS_MAX, r.me + coins);
    save();
    const after = stats(r),
      lv = levelOf(after.x);
    return {
      ok: true,
      n: got.length,
      got,
      xp,
      coins,
      cut: f < 1 ? Math.round((1 - f) * 100) : 0,
      lv,
      lvUp: lv > lvBefore,
      badges: BADGES.filter(b => b.ok(after) && !badgesBefore.has(b.id)).map(b => ({ id: b.id, n: b.n, i: b.i })),
      state: view(pid)
    };
  }

  /**
   * Compra o próximo nível de terreno, propriedade ou casa, se o nível de fazendeiro e as moedas permitem.
   * @param {string} pid
   * @param {string} kind 'land' | 'prop' | 'house'
   */
  function buy(pid, kind) {
    if (!PID_RE.test(pid)) return { ok: false, reason: 'pid' };
    if (!has(TIERS, kind)) return { ok: false, reason: 'loja' };
    const [key, list] = /** @type {[ 'tl' | 'tp' | 'th', any[] ]} */ (TIERS[/** @type {'land'} */ (kind)]);
    const r = players.get(pid);
    const cur = r ? r[key] : 0,
      next = list[cur + 1];
    if (!next) return { ok: false, reason: 'maximo' };
    if (levelOf(r ? r.x : 0) < next.lv) return { ok: false, reason: 'nivel' };
    if (!r || r.m < next.$) return { ok: false, reason: 'moedas' };
    r.m -= next.$;
    r[key] = cur + 1;
    save();
    return { ok: true, kind, tier: cur + 1, name: next.n, state: view(pid) };
  }

  /**
   * Uma ação vinda do cliente (já validada pelo formato): planta, rega, colhe, arranca ou compra.
   * @param {string} pid
   * @param {{k: string, i?: number, c?: string, b?: string}} m
   */
  function act(pid, m) {
    const i = m.i === undefined ? -1 : m.i;
    if (m.k === 'plant') return plant(pid, i, m.c || '');
    if (m.k === 'water') return water(pid, i);
    if (m.k === 'harvest') return harvest(pid, i);
    if (m.k === 'dig') return dig(pid, i);
    if (m.k === 'buy') return buy(pid, m.b || '');
    return { ok: false, reason: 'acao' };
  }

  return {
    view,
    publicOf,
    badgesOf,
    plant,
    water,
    harvest,
    dig,
    buy,
    act,
    flush,
    has: (/** @type {string} */ pid) => players.has(pid),
    size: () => players.size
  };
}

module.exports = { createFarm, xpFor, levelOf, BADGES, MAX_LEVEL, MAX_FARMS, SLOTS, WATER_CUT, PID_RE };
