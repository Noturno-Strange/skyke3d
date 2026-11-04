/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Regras de cuidado, idade e progressão do mascote. Puro: recebe o registro e a hora e devolve o novo estado.
 *
 * - O tempo vem sempre do servidor (`now`). Nada de contador que dependa de o jogador estar conectado: as necessidades
 *   são calculadas sob demanda a partir do último instante registrado, e a idade vem da data de criação.
 * - O mascote nunca morre nem perde progresso por ausência: cada necessidade tem um piso e a saúde nunca cai de 30.
 * - Cada ação tem espera (cooldown) e limite diário de vínculo, então não adianta apertar sem parar.
 * - O vínculo só sobe com o cuidado; ele não diminui com o tempo.
 */
'use strict';

const { PERSONALITIES, SPECIALS, RARITIES, rarityOf } = require('./pet-genes');

const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;

/** Necessidades em ordem de exibição. 100 = tudo certo. */
const NEEDS = ['food', 'energy', 'joy', 'clean', 'health', 'fun'];
/** Quanto cada uma cai por hora (antes do ajuste da personalidade). */
const DECAY = { food: 3, energy: 2, joy: 1.5, clean: 1.2, fun: 2.5 };
/** Piso: o valor nunca passa disso, então o mascote nunca fica "morto". */
const FLOOR = { food: 8, energy: 8, joy: 15, clean: 10, health: 30, fun: 10 };
/** Ausências maiores que isso não pesam mais (96 h): voltar depois de semanas não castiga. */
const MAX_OFFLINE_H = 96;
/** Vínculo máximo ganho por dia (impede "farmar" cuidando sem parar). */
const BOND_PER_DAY = 12;

/** Ajuste das quedas por personalidade (índice de `PERSONALITIES`). */
const PERS_MUL = [
  { fun: 1.2 },
  { energy: 1.3 },
  { fun: 1.25, energy: 1.1 },
  { joy: 0.8, fun: 0.9 },
  { food: 1.3 },
  { joy: 1.1, energy: 0.9 }
];

/**
 * Ações: espera, condição, efeitos nas necessidades e vínculo.
 * @type {Record<string, {cd: number, need?: [string, '<=' | '>=', number, string], d: Record<string, number>, bond: number}>}
 */
const ACTIONS = {
  feed: { cd: 15 * MIN, need: ['food', '<=', 95, 'full'], d: { food: 30, joy: 3 }, bond: 0.5 },
  play: { cd: 15 * MIN, need: ['energy', '>=', 15, 'tired'], d: { fun: 30, joy: 6, energy: -10, food: -4 }, bond: 0.5 },
  rest: { cd: 30 * MIN, need: ['energy', '<=', 90, 'rested'], d: { energy: 40 }, bond: 0.5 },
  clean: { cd: 20 * MIN, need: ['clean', '<=', 90, 'clean'], d: { clean: 40, health: 3 }, bond: 0.5 },
  pet: { cd: 10 * MIN, d: { joy: 8 }, bond: 1 },
  special: { cd: 4 * HOUR, need: ['energy', '>=', 30, 'tired'], d: { joy: 10, fun: 10, energy: -8 }, bond: 3 }
};
const ACTION_IDS = Object.keys(ACTIONS);

/** Estágios por idade em dias. */
const STAGES = [
  { from: 0, name: 'Filhote' },
  { from: 3, name: 'Jovem' },
  { from: 10, name: 'Crescido' },
  { from: 30, name: 'Veterano' }
];
const BOND_LEVELS = ['Conhecidos', 'Colegas', 'Amigos', 'Companheiros', 'Inseparáveis', 'Almas gêmeas'];

/** Acessórios (índice usado pelo desenho): 0 nenhum. Cada um é liberado por uma conquista. */
const COSMETICS = ['Nenhum', 'Laço', 'Cachecol', 'Coroa estelar', 'Óculos redondos'];
const COSMETIC_UNLOCK = { 1: 'primeira-refeicao', 2: 'uma-semana', 3: 'um-mes', 4: 'explorador' };

/** Conquistas e marcos. */
const ACHIEVEMENTS = [
  { id: 'adotado', n: 'Primeiro dia juntos', test: () => true },
  { id: 'nasceu-especial', n: 'Nasceu especial', test: p => rarityOf(p.g) >= 2 },
  { id: 'primeira-refeicao', n: 'Primeira refeição', test: p => p.ct.feed >= 1 },
  { id: 'brincalhao', n: 'Brincalhão (10 brincadeiras)', test: p => p.ct.play >= 10 },
  { id: 'limpinho', n: 'Limpinho (10 banhos)', test: p => p.ct.clean >= 10 },
  { id: 'soneca', n: 'Soneca em dia (5 descansos)', test: p => p.ct.rest >= 5 },
  { id: 'explorador', n: 'Primeira aventura', test: p => p.ct.special >= 1 },
  { id: 'cem-carinhos', n: '100 cuidados', test: p => p.ct.total >= 100 },
  { id: 'amigos', n: 'Amigos de verdade (vínculo 20)', test: p => p.a.bond >= 20 },
  { id: 'inseparaveis', n: 'Inseparáveis (vínculo 80)', test: p => p.a.bond >= 80 },
  { id: 'uma-semana', n: 'Uma semana de vida', test: (p, age) => age >= 7 },
  { id: 'um-mes', n: 'Um mês de vida', test: (p, age) => age >= 30 }
];
const AGE_MARK = { 'uma-semana': 7, 'um-mes': 30 };
const ACH_NAME = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a.n]));
const HISTORY_MAX = 20;

const clamp = v => Math.max(0, Math.min(100, v));
const round1 = v => Math.round(v * 10) / 10;

/**
 * Registro novo, com a seed e os genes já sorteados.
 * @param {{seed: string, attempt: number, genes: Record<string, number>, name: string, now: number}} o
 */
function newPet({ seed, attempt, genes, name, now }) {
  const p = {
    sd: seed,
    n: attempt,
    g: genes,
    nm: name,
    c: now,
    t: now,
    a: { food: 70, energy: 80, joy: 70, clean: 80, health: 100, fun: 60, bond: 0 },
    cd: /** @type {Record<string, number>} */ ({}),
    ct: { feed: 0, play: 0, rest: 0, clean: 0, pet: 0, special: 0, total: 0 },
    hs: /** @type {[string, number][]} */ ([['adotado', now]]),
    un: /** @type {Record<string, number>} */ ({}),
    cos: genes.ac || 0,
    bd: { d: Math.floor(now / DAY), g: 0 }
  };
  unlock(p, now);
  return p;
}

/**
 * Aplica o tempo que passou desde o último registro. Idempotente para o mesmo `now`.
 * @param {any} p
 * @param {number} now
 */
function settle(p, now) {
  if (!(now > p.t)) return p;
  const h = Math.min((now - p.t) / HOUR, MAX_OFFLINE_H);
  const mul = PERS_MUL[p.g.pe] || {};
  const a = p.a;
  for (const k of /** @type {const} */ (['food', 'energy', 'joy', 'clean', 'fun'])) {
    let rate = DECAY[k] * (mul[k] || 1);
    if (k === 'joy' && a.fun < 25) rate += 0.8; // sem diversão, a alegria cai mais rápido
    a[k] = Math.max(FLOOR[k], a[k] - rate * h);
  }
  const bad = a.food < 25 || a.clean < 25 || a.energy < 15;
  a.health = bad ? Math.max(FLOOR.health, a.health - 0.8 * h) : Math.min(100, a.health + 0.6 * h);
  p.t = now;
  return p;
}

/** @param {any} p @param {number} now */
const ageDays = (p, now) => Math.max(0, Math.floor((now - p.c) / DAY));

/** @param {number} days */
function stageOf(days) {
  let idx = 0;
  for (let i = 0; i < STAGES.length; i++) if (days >= STAGES[i].from) idx = i;
  return { index: idx, name: STAGES[idx].name };
}

/** @param {number} bond */
const bondLevel = bond => Math.min(BOND_LEVELS.length - 1, Math.floor(bond / 20));

/**
 * Marca conquistas novas. Devolve os ids recém-liberados.
 * @param {any} p @param {number} now
 */
function unlock(p, now) {
  const age = ageDays(p, now);
  /** @type {string[]} */
  const fresh = [];
  for (const a of ACHIEVEMENTS)
    if (!p.un[a.id] && a.test(p, age)) {
      // marcos de idade valem desde o dia em que foram alcançados, mesmo que ninguém tenha aberto o jogo
      p.un[a.id] = AGE_MARK[a.id] ? p.c + AGE_MARK[a.id] * DAY : now;
      fresh.push(a.id);
    }
  return fresh;
}

/** Acessórios liberados (o inicial, se tiver, mais os das conquistas). */
function unlockedCosmetics(p) {
  /** @type {number[]} */
  const out = [0];
  if (p.g.ac) out.push(p.g.ac);
  for (const [id, ach] of Object.entries(COSMETIC_UNLOCK)) if (p.un[ach] && !out.includes(+id)) out.push(+id);
  return out.sort((a, b) => a - b);
}

/**
 * Faz uma ação de cuidado. Valida espera e condição; nada muda se recusar.
 * @param {any} p registro (já com `settle` aplicado até `now`)
 * @param {string} action
 * @param {number} now
 * @returns {{ok: true, gain: number, fresh: string[]} | {ok: false, reason: string, wait?: number}}
 */
function act(p, action, now) {
  const A = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!A) return { ok: false, reason: 'action' };
  settle(p, now);
  const until = p.cd[action] || 0;
  if (until > now) return { ok: false, reason: 'cooldown', wait: until - now };
  if (A.need) {
    const [k, op, v, why] = A.need;
    const cur = p.a[k];
    if (op === '<=' ? cur > v : cur < v) return { ok: false, reason: why };
  }
  for (const [k, dv] of Object.entries(A.d))
    p.a[k] = Math.max(FLOOR[/** @type {'food'} */ (k)] || 0, clamp(p.a[k] + dv));
  const day = Math.floor(now / DAY);
  if (p.bd.d !== day) p.bd = { d: day, g: 0 };
  const gain = Math.max(0, Math.min(A.bond, BOND_PER_DAY - p.bd.g));
  p.bd.g += gain;
  p.a.bond = round1(Math.min(100, p.a.bond + gain));
  p.cd[action] = now + A.cd;
  p.ct[/** @type {'feed'} */ (action)] += 1;
  p.ct.total += 1;
  p.hs.push([action, now]);
  while (p.hs.length > HISTORY_MAX) p.hs.shift();
  return { ok: true, gain, fresh: unlock(p, now) };
}

/**
 * Troca o acessório (só entre os liberados).
 * @param {any} p @param {number} id
 */
function dress(p, id) {
  if (!Number.isInteger(id) || !unlockedCosmetics(p).includes(id)) return false;
  p.cos = id;
  return true;
}

/** Algo pede atenção? (só para o ponto discreto no botão) */
const needsAttention = p => p.a.food < 25 || p.a.clean < 25 || p.a.energy < 15 || p.a.joy < 30 || p.a.fun < 20;

/**
 * Estado de animação e frase curta a partir das necessidades.
 * @param {any} p
 * @returns {{state: 'sleep'|'sad'|'idle'|'happy', text: string}}
 */
function mood(p) {
  const a = p.a;
  if (a.energy < 15) return { state: 'sleep', text: 'Está com sono.' };
  if (a.food < 25) return { state: 'sad', text: 'Está com fome.' };
  if (a.clean < 25) return { state: 'sad', text: 'Quer um banho.' };
  if (a.joy < 30 || a.fun < 20) return { state: 'sad', text: 'Quer companhia e diversão.' };
  if (a.joy >= 75 && a.fun >= 50) return { state: 'happy', text: 'Está muito feliz!' };
  return { state: 'idle', text: 'Está tranquilo.' };
}

/**
 * Visão do dono: necessidades, esperas e tudo para desenhar o painel.
 * @param {any} p registro com `settle` aplicado
 * @param {number} now
 */
function ownerView(p, now) {
  const cd = /** @type {Record<string, number>} */ ({});
  for (const k of ACTION_IDS) if ((p.cd[k] || 0) > now) cd[k] = p.cd[k] - now;
  const m = mood(p);
  return {
    name: p.nm,
    genes: p.g,
    cos: p.cos,
    cosOk: unlockedCosmetics(p),
    created: p.c,
    age: ageDays(p, now),
    stage: stageOf(ageDays(p, now)).index,
    stageName: stageOf(ageDays(p, now)).name,
    pers: PERSONALITIES[p.g.pe],
    special: SPECIALS[p.g.sp],
    rarity: RARITIES[rarityOf(p.g)],
    a: Object.fromEntries(Object.entries(p.a).map(([k, v]) => [k, Math.round(/** @type {number} */ (v))])),
    cd,
    mood: m,
    attention: needsAttention(p),
    stats: { ...p.ct },
    hist: p.hs.slice(-10),
    ach: Object.entries(p.un).map(([id, t]) => ({ id, n: ACH_NAME[id] || id, t })),
    next: ACHIEVEMENTS.filter(a => !p.un[a.id]).map(a => ({ id: a.id, n: a.n }))
  };
}

/**
 * Visão pública (perfil): sem necessidades nem datas internas além da criação.
 * @param {any} p
 * @param {number} now
 */
function publicView(p, now) {
  const days = ageDays(p, now);
  return {
    name: p.nm,
    genes: p.g,
    cos: p.cos,
    created: p.c,
    age: days,
    stage: stageOf(days).index,
    stageName: stageOf(days).name,
    pers: PERSONALITIES[p.g.pe],
    special: SPECIALS[p.g.sp],
    rarity: RARITIES[rarityOf(p.g)],
    bond: bondLevel(p.a.bond),
    bondName: BOND_LEVELS[bondLevel(p.a.bond)],
    ach: Object.entries(p.un)
      .sort((a, b) => a[1] - b[1])
      .map(([id, t]) => ({ id, n: ACH_NAME[id] || id, t })),
    stats: {
      total: p.ct.total,
      feed: p.ct.feed,
      play: p.ct.play,
      clean: p.ct.clean,
      rest: p.ct.rest,
      special: p.ct.special
    }
  };
}

module.exports = {
  NEEDS,
  DECAY,
  FLOOR,
  ACTIONS,
  ACTION_IDS,
  STAGES,
  BOND_LEVELS,
  BOND_PER_DAY,
  COSMETICS,
  ACHIEVEMENTS,
  MAX_OFFLINE_H,
  newPet,
  settle,
  act,
  dress,
  unlock,
  unlockedCosmetics,
  ageDays,
  stageOf,
  bondLevel,
  needsAttention,
  mood,
  ownerView,
  publicView
};
