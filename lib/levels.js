/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Curva de níveis da fazenda e da culinária (a mesma nas duas), com renascimento ao chegar no topo.
 *
 * - Níveis de 1 a 999. Até o nível 20 a curva é a de antes (subir do nível n para o n+1 custa 50 × n), então quem já jogava fica no
 *   mesmo nível; depois cada nível custa 1000 de experiência.
 * - A experiência ganha cresce com o nível (+1% por nível acima do 1) e com cada renascimento (+10% cada): os níveis altos não
 *   ficam arrastados e cada volta fica mais rápida que a anterior.
 * - Renascer (Safra na fazenda, Estrela na culinária): no nível 999 o jogador escolhe voltar ao nível 1 e ganha +1. É o que deixa
 *   o sistema praticamente infinito, como os "resets" de MMORPGs; o que foi comprado e desbloqueado fica.
 */
'use strict';

const MAX_LEVEL = 999;
const SOFT = 20; // até aqui, a curva antiga
const STEP = 1000; // custo de cada nível depois do SOFT
const PER_LEVEL = 0.01; // +1% de experiência por nível
const PER_RANK = 0.1; // +10% de experiência por renascimento

/** experiência total para chegar ao nível `lv` (nível 1 = 0) */
function xpFor(/** @type {number} */ lv) {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(lv)));
  return l <= SOFT ? 25 * l * (l - 1) : 25 * SOFT * (SOFT - 1) + STEP * (l - SOFT);
}
/** nível com `xp` de experiência */
function levelOf(/** @type {number} */ xp) {
  const x = Math.max(0, Number(xp) || 0);
  if (x >= xpFor(SOFT)) return Math.min(MAX_LEVEL, SOFT + Math.floor((x - xpFor(SOFT)) / STEP));
  let lv = 1;
  while (lv < SOFT && x >= xpFor(lv + 1)) lv++;
  return lv;
}
/** quanto a experiência ganha vale no nível `lv` com `rank` renascimentos */
const xpMult = (/** @type {number} */ lv, /** @type {number} */ rank) =>
  (1 + PER_LEVEL * (lv - 1)) * (1 + PER_RANK * rank);
/** o que o painel mostra da faixa de experiência do nível atual */
function levelInfo(/** @type {number} */ xp) {
  const lv = levelOf(xp),
    lo = xpFor(lv),
    hi = lv >= MAX_LEVEL ? lo : xpFor(lv + 1);
  return { xp, lv, lo, hi, max: lv >= MAX_LEVEL };
}

module.exports = { MAX_LEVEL, SOFT, STEP, PER_LEVEL, PER_RANK, xpFor, levelOf, xpMult, levelInfo };
