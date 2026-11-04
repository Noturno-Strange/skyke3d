/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Geração procedural dos mascotes. Pura e determinística: a mesma seed e a mesma tentativa dão sempre os mesmos genes,
 * então a aparência se reconstrói sem guardar imagem.
 *
 * - Só o servidor sorteia a seed (crypto) e a probabilidade de cada característica. O cliente nunca escolhe nada.
 * - Cada característica tem pesos; as raras (campo `sp`) têm probabilidades próprias e fixas.
 * - Regras de compatibilidade corrigem combinações incoerentes de forma determinística (nada de sorteio extra).
 * - `genomeKey` identifica o conjunto completo de características, usado para impedir dois mascotes idênticos.
 * Os genes são índices pequenos; quem desenha (assets/pet-art.js) tem uma tabela para cada índice.
 */
'use strict';

/** Quantas opções cada gene tem (o desenho precisa cobrir todas). */
const GENE_SIZE = { bd: 8, hd: 6, ey: 7, es: 3, ea: 8, tl: 5, ft: 3, pt: 6, pl: 16, tn: 3, ck: 3, sp: 6, pe: 6, ac: 3 };
const GENE_KEYS = Object.keys(GENE_SIZE);

/** Pesos de sorteio por gene (a soma não precisa dar 100). */
const WEIGHTS = {
  bd: [14, 14, 14, 12, 12, 12, 11, 11],
  hd: [20, 18, 16, 16, 15, 15],
  ey: [20, 18, 16, 14, 12, 12, 8],
  es: [30, 45, 25],
  ea: [18, 16, 14, 12, 12, 10, 10, 8],
  tl: [20, 25, 20, 15, 20],
  ft: [40, 40, 20],
  pt: [24, 16, 16, 14, 16, 14],
  pl: [7, 7, 7, 7, 6, 7, 7, 6, 7, 6, 6, 5, 6, 7, 4, 5],
  tn: [60, 20, 20],
  ck: [30, 50, 20],
  // característica especial: é ela que define a raridade (estética, sem vantagem no jogo)
  sp: [78, 7, 7, 3.25, 3.25, 1.5],
  pe: [1, 1, 1, 1, 1, 1],
  ac: [70, 15, 15]
};

const PERSONALITIES = ['Curioso', 'Dorminhoco', 'Brincalhão', 'Calmo', 'Guloso', 'Sonhador'];
const SPECIALS = ['Nenhuma', 'Aura brilhante', 'Marca de estrela', 'Arco-íris', 'Constelação', 'Cósmico'];
const RARITIES = ['Comum', 'Incomum', 'Rara', 'Extremamente rara'];
/** Raridade de cada característica especial. */
const SPECIAL_TIER = [0, 1, 1, 2, 2, 3];

/** @param {string} str */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** Gerador de números pseudoaleatórios (sfc32) a partir de um texto. */
function makeRng(text) {
  const s = xmur3(text);
  let a = s(),
    b = s(),
    c = s(),
    d = s();
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** @param {() => number} rng @param {number[]} w */
function pickWeighted(rng, w) {
  let total = 0;
  for (const x of w) total += x;
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r < 0) return i;
  }
  return w.length - 1;
}

/**
 * Corrige combinações incoerentes, sempre do mesmo jeito (determinístico).
 * @param {Record<string, number>} g
 */
function harmonize(g) {
  const smooth = [0, 3, 7].includes(g.bd); // corpos lisos, de "bicho de água"
  if (g.ea === 3 && ![0, 1, 3, 5].includes(g.hd)) g.ea = 1; // orelha caída só em cabeça arredondada
  if (g.ea === 7 && !smooth) g.ea = 0; // crista de nadadeira só em corpo liso
  if (g.tl === 3 && !smooth && g.ea !== 7) g.tl = 2; // cauda de nadadeira idem
  if (g.pt === 5 && g.pl === 14) g.pt = 2; // dois tons em paleta que já tem dois tons
  if (g.sp === 5 && (g.pl === 12 || g.pl === 4)) g.pl = 10; // cósmico precisa de fundo escuro o bastante
  if (g.ey === 3 && g.es === 2) g.es = 1; // olho sonolento não fica enorme
  return g;
}

/**
 * Genes de um mascote a partir da seed e do número da tentativa.
 * @param {string} seed texto hexadecimal sorteado no servidor
 * @param {number} [attempt]
 * @returns {Record<string, number>}
 */
function genesFromSeed(seed, attempt = 0) {
  const rng = makeRng('skyke3d-pet:' + seed + ':' + attempt);
  /** @type {Record<string, number>} */
  const g = {};
  for (const k of GENE_KEYS) g[k] = pickWeighted(rng, WEIGHTS[k]);
  return harmonize(g);
}

/** @param {Record<string, number>} g */
function genomeKey(g) {
  return GENE_KEYS.map(k => g[k]).join('.');
}

/**
 * Genes só com inteiros válidos (para ler do disco ou de qualquer lugar de fora).
 * @param {any} g
 * @returns {Record<string, number>|null} null se faltar ou sobrar algo
 */
function cleanGenes(g) {
  if (!g || typeof g !== 'object') return null;
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of GENE_KEYS) {
    const v = g[k];
    if (!Number.isInteger(v) || v < 0 || v >= GENE_SIZE[k]) return null;
    out[k] = v;
  }
  return out;
}

/** @param {Record<string, number>} g */
const rarityOf = g => SPECIAL_TIER[g.sp] || 0;

/**
 * Sorteia um mascote que ainda não existe. A seed vem de `randomSeed` (crypto no servidor).
 * @param {{has: (key: string) => boolean}} taken conjunto de genomas já usados
 * @param {() => string} randomSeed
 * @param {number} [tries]
 * @returns {{seed: string, attempt: number, genes: Record<string, number>}|null} null se não achou um livre
 */
function generateUnique(taken, randomSeed, tries = 60) {
  const seed = randomSeed();
  for (let n = 0; n < tries; n++) {
    const genes = genesFromSeed(seed, n);
    if (!taken.has(genomeKey(genes))) return { seed, attempt: n, genes };
  }
  return null;
}

module.exports = {
  GENE_SIZE,
  GENE_KEYS,
  WEIGHTS,
  PERSONALITIES,
  SPECIALS,
  RARITIES,
  SPECIAL_TIER,
  makeRng,
  genesFromSeed,
  genomeKey,
  cleanGenes,
  harmonize,
  rarityOf,
  generateUnique
};
