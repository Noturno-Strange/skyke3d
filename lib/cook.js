/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Culinária: receitas feitas na fogueira, alimentos desbloqueados, experiência, atributos e emblemas de cozinheiro.
 *
 * - O servidor decide tudo: a receita sai da combinação (método + ingredientes) conferida no catálogo compartilhado
 *   (assets/catalog.js), e só ele soma experiência e desbloqueios. O cliente só diz o método e os ingredientes.
 * - O progresso é por código público do jogador (o mesmo do perfil e do mascote, derivado do id de identidade). Fica em
 *   `data/cook.json` (0600, gravação atômica agrupada). Só uma receita que deu certo grava; combinação que não vira nada,
 *   consulta e ingrediente inválido não gravam.
 * - Atributos e emblemas não são guardados: saem sempre dos contadores (receitas feitas, métodos, ingredientes usados).
 * - Um registro é um objeto pequeno e o total tem teto (`max`); não há timer por jogador.
 * - Níveis de 1 a 999 (lib/levels.js). No 999 o cozinheiro pode ganhar uma **estrela**: volta ao nível 1 e ganha +1 estrela, que
 *   dá +10% de experiência para sempre. Receitas feitas, alimentos desbloqueados, atributos e emblemas ficam.
 * - Antifraude (lib/guard.js): `gain(pid, xp)` devolve quanto da experiência vale agora (0 a 1), pelo ritmo e pelo cansaço do dia.
 */
'use strict';

const C = require('../assets/catalog.js');
const { readJsonFile, writeJsonAtomic } = require('./persist');
const { MAX_LEVEL, xpFor, levelOf, xpMult, levelInfo } = require('./levels');

const PID_RE = /^[0-9a-f]{20}$/;
const MAX_COOKS = 20000;
const COUNT_MAX = 1000000;
const FIRST_XP = 10; // por ingrediente, na primeira vez que a receita é feita
const REPEAT_XP = 3; // por ingrediente, nas vezes seguintes (repetir rende pouco)
const BONUS_PER_RANK = 0.02; // cada ponto de atributo soma 2% de experiência
const RANK_MAX = 10;

const rankOf = (/** @type {number} */ n) => Math.min(RANK_MAX, Math.floor(Math.sqrt(n)));

/** Atributos de cozinheiro: o ponto de cada um vem da raiz quadrada de um contador. */
const ATTRS = [
  { id: 'fogo', n: 'Fogo', t: 'Receitas feitas na fogueira' },
  { id: 'paladar', n: 'Paladar', t: 'Receitas diferentes que você já fez' },
  { id: 'despensa', n: 'Despensa', t: 'Ingredientes diferentes que você já usou' }
];

/** Emblemas de cozinheiro: dados pelo progresso, nunca pelo cliente. */
// receitas clássicas e dos biomas (b=1 no catálogo); cada grupo tem o seu emblema de "todas"
const CLASSIC = C.RECIPES.filter(r => !r.b).map(r => r.id),
  BIOMA = C.RECIPES.filter(r => r.b).map(r => r.id);
const BADGES = [
  {
    id: 'aprendiz',
    n: 'Aprendiz de Cozinha',
    i: '🥄',
    t: 'Prepare a primeira receita',
    ok: (/** @type {any} */ s) => s.distinct >= 1
  },
  {
    id: 'cozinheiro',
    n: 'Cozinheiro de Fogueira',
    i: '🍳',
    t: 'Prepare 5 receitas diferentes',
    ok: (/** @type {any} */ s) => s.distinct >= 5
  },
  {
    id: 'mestre_panela',
    n: 'Mestre da Panela',
    i: '🍲',
    t: 'Cozinhe 10 vezes na panela',
    ok: (/** @type {any} */ s) => s.k.cozinhar >= 10
  },
  {
    id: 'mestre_braseiro',
    n: 'Mestre do Braseiro',
    i: '🔥',
    t: 'Asse 10 vezes nas brasas',
    ok: (/** @type {any} */ s) => s.k.assar >= 10
  },
  {
    id: 'chef',
    n: 'Chef',
    i: '🧑‍🍳',
    t: 'Prepare 20 receitas diferentes',
    ok: (/** @type {any} */ s) => s.distinct >= 20
  },
  {
    // as 46 clássicas (eram "todas" quando o emblema saiu): receita nova no catálogo não tira o emblema de quem já tinha
    id: 'mestre_cuca',
    n: 'Mestre-cuca',
    i: '🏆',
    t: 'Prepare as ' + CLASSIC.length + ' receitas clássicas',
    ok: (/** @type {any} */ s) => CLASSIC.every(id => s.d[id])
  },
  {
    id: 'sabores_brasil',
    n: 'Sabores do Brasil',
    i: '🌎',
    t: 'Prepare as ' + BIOMA.length + ' receitas dos biomas',
    ok: (/** @type {any} */ s) => BIOMA.every(id => s.d[id])
  },
  {
    id: 'estrela1',
    n: 'Primeira Estrela',
    i: '⭐',
    t: 'Chegue ao nível 999 e ganhe uma estrela',
    ok: (/** @type {any} */ s) => s.st >= 1
  },
  { id: 'estrela5', n: 'Cinco Estrelas', i: '🌟', t: 'Ganhe 5 estrelas', ok: (/** @type {any} */ s) => s.st >= 5 },
  { id: 'estrela10', n: 'Constelação', i: '✨', t: 'Ganhe 10 estrelas', ok: (/** @type {any} */ s) => s.st >= 10 }
];

/**
 * @typedef {{x: number, d: Record<string, number>, k: {cozinhar: number, assar: number}, u: string[], st?: number}} Rec
 */

/**
 * @param {{file?: string, max?: number, delayMs?: number, gain?: (pid: string, xp: number, scale: number) => number,
 *   onError?: (w: string, e: any) => void}} [o]
 */
function createCook({ file = '', max = MAX_COOKS, delayMs = 5000, gain = () => 1, onError = () => {} } = {}) {
  /** @type {Map<string, Rec>} */
  const players = new Map();
  let dirty = false,
    timer = /** @type {any} */ (null);

  if (file) {
    let obj = null;
    try {
      obj = readJsonFile(file);
    } catch (e) {
      onError('culinária', e);
    }
    if (obj && obj.v === 1 && obj.p && typeof obj.p === 'object')
      for (const [pid, r] of Object.entries(obj.p)) {
        if (players.size >= max) break;
        const rec = PID_RE.test(pid) ? clean(r) : null;
        if (rec) players.set(pid, rec);
      }
  }

  /** valida um registro lido do disco: nada do que está no arquivo é confiado */
  function clean(/** @type {any} */ r) {
    if (!r || typeof r !== 'object') return null;
    const int = (/** @type {any} */ v) => (Number.isInteger(v) && v >= 0 && v <= COUNT_MAX ? v : 0);
    /** @type {Record<string, number>} */
    const d = {};
    if (r.d && typeof r.d === 'object')
      for (const [id, n] of Object.entries(r.d))
        if (Object.prototype.hasOwnProperty.call(C.RECIPE, id) && int(n) > 0) d[id] = int(n);
    const u = Array.isArray(r.u)
      ? [
          ...new Set(
            r.u.filter(
              (/** @type {any} */ x) => typeof x === 'string' && Object.prototype.hasOwnProperty.call(C.INGR, x)
            )
          )
        ]
      : [];
    const k = { cozinhar: int(r.k && r.k.cozinhar), assar: int(r.k && r.k.assar) };
    const x = Math.min(xpFor(MAX_LEVEL), int(r.x)),
      st = int(r.st);
    return Object.keys(d).length || x || st ? { x, d, k, u: /** @type {string[]} */ (u), st } : null;
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
      onError('culinária', e);
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

  /** contadores de um registro (ou de quem nunca cozinhou) */
  function stats(/** @type {Rec | undefined} */ r) {
    const d = r ? r.d : {};
    const k = r ? r.k : { cozinhar: 0, assar: 0 };
    return {
      x: r ? r.x : 0,
      d,
      k,
      u: r ? r.u : [],
      st: r ? r.st || 0 : 0,
      distinct: Object.keys(d).length,
      total: k.cozinhar + k.assar
    };
  }
  function attrsOf(/** @type {ReturnType<typeof stats>} */ s) {
    const count = { fogo: s.total, paladar: s.distinct, despensa: s.u.length };
    return ATTRS.map(a => ({
      id: a.id,
      n: a.n,
      t: a.t,
      v: /** @type {any} */ (count)[a.id],
      r: rankOf(/** @type {any} */ (count)[a.id])
    }));
  }
  function badgeIds(/** @type {ReturnType<typeof stats>} */ s) {
    return BADGES.filter(b => b.ok(s)).map(b => b.id);
  }

  /**
   * Tudo o que o menu de culinária mostra: nível, experiência, receitas feitas, atributos e emblemas.
   * @param {string} pid
   */
  function view(pid) {
    const s = stats(players.get(pid));
    const have = new Set(badgeIds(s));
    return {
      ...levelInfo(s.x),
      rank: s.st,
      mult: Math.round(xpMult(levelOf(s.x), s.st) * 100) / 100,
      done: s.d,
      total: s.total,
      attrs: attrsOf(s),
      badges: BADGES.map(b => ({ id: b.id, n: b.n, i: b.i, t: b.t, on: have.has(b.id) }))
    };
  }

  /** o jogador já preparou esta receita (o alimento está desbloqueado na mochila)? */
  function unlocked(/** @type {string} */ pid, /** @type {string} */ item) {
    const r = players.get(pid);
    return !!r && Object.prototype.hasOwnProperty.call(r.d, item);
  }

  /**
   * Emblemas de cozinheiro para o perfil público.
   * @param {string} pid
   * @returns {{id: string, name: string, icon: string}[]}
   */
  function badgesOf(pid) {
    const have = new Set(badgeIds(stats(players.get(pid))));
    return BADGES.filter(b => have.has(b.id)).map(b => ({ id: b.id, name: b.n, icon: b.i }));
  }

  /**
   * Faz uma receita. O cliente só informa o método e os ingredientes (de 2 a 6, diferentes).
   * @param {string} pid
   * @param {string} method
   * @param {string[]} ids
   */
  function cook(pid, method, ids) {
    if (!PID_RE.test(pid)) return { ok: false, reason: 'pid' };
    if (!Object.prototype.hasOwnProperty.call(C.COOK_METHODS, method)) return { ok: false, reason: 'metodo' };
    if (!Array.isArray(ids) || ids.length < 2 || ids.length > C.COOK_SLOTS || new Set(ids).size !== ids.length)
      return { ok: false, reason: 'ingredientes' };
    for (const id of ids)
      if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(C.INGR, id))
        return { ok: false, reason: 'ingredientes' };
    const recipe = Object.prototype.hasOwnProperty.call(C.RECIPE_KEY, C.recipeKey(method, ids))
      ? C.RECIPE_KEY[C.recipeKey(method, ids)]
      : null;
    if (!recipe) return { ok: false, reason: 'nada' };

    let r = players.get(pid);
    if (!r) {
      if (players.size >= max) return { ok: false, reason: 'full' };
      r = { x: 0, d: {}, k: { cozinhar: 0, assar: 0 }, u: [], st: 0 };
    }
    const before = stats(r);
    const lvBefore = levelOf(before.x),
      ranksBefore = attrsOf(before).map(a => a.r),
      badgesBefore = new Set(badgeIds(before));
    const first = !Object.prototype.hasOwnProperty.call(r.d, recipe.id);
    // a experiência usa os atributos de ANTES desta receita, para o bônus não se alimentar de si mesmo
    const bonus = 1 + BONUS_PER_RANK * ranksBefore.reduce((a, b) => a + b, 0);
    const raw = Math.round((first ? FIRST_XP : REPEAT_XP) * recipe.g.length * bonus);
    // o antifraude olha a experiência de base; o nível e as estrelas multiplicam depois
    const f = Math.max(0, Math.min(1, gain(pid, raw, 1))),
      got = Math.round(raw * xpMult(lvBefore, r.st || 0) * f);
    r.d[recipe.id] = Math.min(COUNT_MAX, (r.d[recipe.id] || 0) + 1);
    r.k[/** @type {'cozinhar'|'assar'} */ (method)] = Math.min(
      COUNT_MAX,
      r.k[/** @type {'cozinhar'|'assar'} */ (method)] + 1
    );
    for (const id of recipe.g) if (!r.u.includes(id)) r.u.push(id);
    r.x = Math.min(xpFor(MAX_LEVEL), r.x + got);
    players.set(pid, r);
    save();

    const after = stats(r);
    const attrsAfter = attrsOf(after);
    const lv = levelOf(after.x);
    return {
      ok: true,
      recipe: recipe.id,
      first,
      xp: got,
      cut: f < 1 ? Math.round((1 - f) * 100) : 0,
      lv,
      lvUp: lv > lvBefore,
      up: attrsAfter.filter((a, i) => a.r > ranksBefore[i]).map(a => a.n),
      badges: BADGES.filter(b => b.ok(after) && !badgesBefore.has(b.id)).map(b => ({ id: b.id, n: b.n, i: b.i })),
      state: view(pid)
    };
  }

  /**
   * Estrela: no nível 999, o cozinheiro volta ao nível 1 e ganha +1 estrela (+10% de experiência daí em diante). Receitas,
   * alimentos desbloqueados, atributos e emblemas ficam.
   * @param {string} pid
   */
  function renew(pid) {
    if (!PID_RE.test(pid)) return { ok: false, reason: 'pid' };
    const r = players.get(pid);
    if (!r || levelOf(r.x) < MAX_LEVEL) return { ok: false, reason: 'nivel' };
    const before = new Set(badgeIds(stats(r)));
    r.x = 0;
    r.st = Math.min(COUNT_MAX, (r.st || 0) + 1);
    save();
    const after = stats(r);
    return {
      ok: true,
      rank: r.st,
      badges: BADGES.filter(b => b.ok(after) && !before.has(b.id)).map(b => ({ id: b.id, n: b.n, i: b.i })),
      state: view(pid)
    };
  }

  return {
    view,
    cook,
    renew,
    unlocked,
    badgesOf,
    flush,
    has: (/** @type {string} */ pid) => players.has(pid),
    size: () => players.size
  };
}

module.exports = { createCook, xpFor, levelOf, rankOf, ATTRS, BADGES, MAX_LEVEL, MAX_COOKS, PID_RE };
