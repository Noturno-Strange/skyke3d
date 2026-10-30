/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Filtro de palavrões do chat (português do Brasil). Cada palavrão vira uma sequência como "!@#$%".
 *
 * O texto é comparado em uma cópia "dobrada": minúsculas, sem acento (ç vira c) e com as trocas
 * comuns de números e símbolos por letras (p0rra, c4ralho, m3rda, f0d@). Só palavras inteiras são
 * censuradas, então "computador", "pauta" ou "cultura" passam. Letras repetidas (puuuta) e um separador
 * simples entre as letras (p.u.t.a, p u t a) também são pegos. A cópia tem um caractere por caractere
 * do original, então a posição do trecho encontrado é a mesma nos dois textos.
 */
'use strict';
const { unconfuse } = require('./validate');

// Palavrões, ofensas e xingamentos comuns. Escritos sem acento. Variações de plural e diminutivo entram por SUFIXO.
const BASE = [
  'porra', 'caralho', 'caraio', 'merda', 'bosta', 'puta', 'puto', 'putaria', 'putinha', 'putao', 'putona',
  'vagabunda', 'vagabundo', 'vadia', 'piranha', 'buceta', 'boceta', 'bucetinha', 'xoxota', 'xereca', 'piroca',
  'punheta', 'punheteiro', 'cuzao', 'cuzinho', 'cu',
  'foda', 'foder', 'fodeu', 'fodido', 'fodida', 'fodase', 'fodasse', 'fodendo', 'fodo', 'fodam', 'fodi', 'fodemos',
  'arrombado', 'arrombada', 'desgraca', 'desgracado', 'desgracada', 'corno', 'corna', 'cornudo', 'otario', 'otaria',
  'filhodaputa', 'filhadaputa', 'viado', 'viada', 'viadinho', 'sapatao', 'traveco', 'boiola', 'retardado', 'retardada',
  'mongoloide', 'crioulo', 'crioula',
  // abreviações
  'fdp', 'pqp', 'vsf', 'vtnc', 'vtmnc', 'tnc', 'tmnc', 'krl', 'crl', 'crlh', 'krlh'
];
const SUFFIX = '(?:s|inha|inhas|inho|inhos|ao|oes|ona|onas)?';
// Abreviações e palavras muito curtas não aceitam sufixo nem separador entre as letras (evita falso positivo).
const STRICT = new Set(['cu', 'fdp', 'pqp', 'vsf', 'vtnc', 'vtmnc', 'tnc', 'tmnc', 'krl', 'crl', 'crlh', 'krlh']);
// até três separadores entre as letras (p__u__t__a, p - u - t - a); nas abreviações, um só (v s f, f.d.p); "cu" não aceita nenhum
const SEP = '[^a-z0-9]{0,3}', SEP1 = '[^a-z0-9]?';
// letras que costumam ser trocadas para fugir do filtro: u/v (pvta), l/i (cara1ho vira "caraiho")
const CLS = { u: '[uv]', v: '[vu]', l: '[li]', i: '[il]' };

const pattern = w => {
  if (w === 'cu') return 'c+u+s?';
  if (STRICT.has(w)) return [...w].map(c => c + '+').join(SEP1) + 's?';
  return [...w].map(c => (CLS[c] || c) + '+').join(SEP) + SUFFIX;
};
// mais longas primeiro: a alternância do JS usa a primeira que casa
const RX = new RegExp('(?<![a-z])(?:' + [...BASE].sort((a, b) => b.length - a.length).map(pattern).join('|') + ')(?![a-z])', 'g');

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };
const SYMS = { '@': 'a', '$': 's' };
const isLetter = c => c >= 'a' && c <= 'z';

/** Uma letra minúscula sem acento por caractere do texto (ou o próprio caractere, se não for letra). */
function fold(text) {
  // NFKD pega a letra base de formas de compatibilidade (ｐｕｔａ de largura cheia, ℙ, ①…) e de acentos; letras cirílicas/gregas parecidas viram latinas
  let base = [...text.normalize('NFC')].map(ch => unconfuse((ch.normalize('NFKD')[0] || ch).toLowerCase()));
  // números e símbolos viram letras quando estão colados em letras; repete para cadeias como "pu74" (o 4 só vira letra depois do 7)
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    base = base.map((c, i) => {
      const prev = base[i - 1] || '', next = base[i + 1] || '';
      let r = c;
      if (LEET[c] !== undefined) r = isLetter(prev) || isLetter(next) ? LEET[c] : c;
      else if (c === '!') r = isLetter(prev) && isLetter(next) ? 'i' : c; // "foda!" não vira "fodai"
      else if (SYMS[c] !== undefined) r = isLetter(prev) || isLetter(next) ? SYMS[c] : c;
      if (r !== c) changed = true;
      return r;
    });
    if (!changed) break;
  }
  return base;
}

const MASK = '!@#$%&*';
const maskOf = len => MASK.slice(0, Math.max(3, Math.min(MASK.length, len)));

/** Devolve o texto com cada palavrão trocado por algo como "!@#$%". */
function censor(text) {
  if (typeof text !== 'string' || !text) return text;
  const chars = [...text.normalize('NFC')];
  const folded = fold(text).join('');
  if (folded.length !== chars.length) return text; // segurança: o alinhamento precisa ser 1 para 1
  let out = '', last = 0, hit = false;
  RX.lastIndex = 0;
  for (let m; (m = RX.exec(folded));) {
    if (!m[0]) { RX.lastIndex++; continue; }
    hit = true;
    out += chars.slice(last, m.index).join('') + maskOf(m[0].length);
    last = m.index + m[0].length;
  }
  return hit ? out + chars.slice(last).join('') : text;
}

const hasProfanity = text => censor(text) !== text;

module.exports = { censor, hasProfanity, BASE };
