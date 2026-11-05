/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Prova de trabalho do registro de identidade (mensagem `idreg`).
 *
 * Registrar uma identidade não custava nada: um script enchia o registro (teto de IDENTITY_MAX) e ninguém novo conseguia
 * criar a conta. Agora o cliente precisa achar um número `n` tal que
 *     SHA-256("skyke3d/idreg|" + k + "|" + pk + "|" + rpk + "|" + n)
 * comece com `bits` bits zero. A prova vale só para aqueles dados (não dá para reaproveitar em outra identidade).
 * Verificar custa um hash; resolver custa ~2^bits. A dificuldade base é pequena (jogador normal não percebe) e sobe quando muita
 * gente se registra ao mesmo tempo no servidor inteiro, como na prova de admissão (lib/admission.js).
 */
'use strict';

const crypto = require('crypto');
const { zeroBits } = require('./admission');

const PREFIX = 'skyke3d/idreg|';
const NONCE_RE = /^\d{1,12}$/;

const hash = (k, pk, rpk, nonce) =>
  crypto
    .createHash('sha256')
    .update(PREFIX + k + '|' + pk + '|' + rpk + '|' + nonce, 'utf8')
    .digest();

/** A prova `nonce` serve para estes dados e esta dificuldade? Com `bits` 0, qualquer pedido serve. */
function powOk(k, pk, rpk, nonce, bits) {
  if (!(bits > 0)) return true;
  if (typeof nonce !== 'string' || !NONCE_RE.test(nonce)) return false;
  return zeroBits(hash(k, pk, rpk, nonce), bits);
}

/** Resolve a prova (usado nos testes e em ferramentas; o navegador tem a própria versão em assets/identity.js). */
function solve(k, pk, rpk, bits) {
  for (let n = 0; n < 1e9; n++) if (powOk(k, pk, rpk, String(n), bits)) return String(n);
  throw new Error('prova não encontrada');
}

/**
 * Dificuldade exigida agora: a base, mais 4 bits com 30+ registros no último minuto e mais 6 com 120+ (limitada a `max`).
 * @param {number} base 0 desliga a prova
 * @param {number} max
 * @param {number} recent registros novos no servidor inteiro no último minuto
 */
function bitsFor(base, max, recent) {
  if (!(base > 0)) return 0;
  const bump = recent >= 120 ? 6 : recent >= 30 ? 4 : 0;
  return Math.min(Math.max(base, max), base + bump);
}

module.exports = { powOk, solve, bitsFor, NONCE_RE };
