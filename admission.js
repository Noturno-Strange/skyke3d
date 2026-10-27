/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Ticket de admissão com prova de trabalho. O ticket é assinado com HMAC e
 * amarrado à chave do cliente (IPv4 ou IPv6 /64); o cliente precisa encontrar
 * um nonce que produza `d` bits zero em SHA-256. Verificar custa um hash no
 * servidor; resolver custa 2^d hashes no cliente.
 *
 * Formato do parâmetro: `challenge.expira.dificuldade.assinatura.nonce`
 * Assinatura: base64url(HMAC-SHA256("v1|c|e|d|chave"))
 * Prova: SHA-256("c:nonce") com `d` bits zero à esquerda.
 */
'use strict';

const crypto = require('crypto');

/** Testa se o buffer tem pelo menos `bits` bits zero à esquerda. */
function zeroBits(buf, bits) {
  if (bits <= 0) return true;
  let have = 0;
  for (const b of buf) {
    if (b === 0) {
      have += 8;
      if (have >= bits) return true;
      continue;
    }
    return have + (Math.clz32(b) - 24) >= bits;
  }
  return have >= bits;
}

function powOk(challenge, bits, nonce) {
  if (bits <= 0) return true;
  if (typeof nonce !== 'string' || !/^\d{1,10}$/.test(nonce)) return false;
  const digest = crypto.createHash('sha256').update(String(challenge) + ':' + nonce, 'utf8').digest();
  return zeroBits(digest, bits);
}

function sig(secret, c, e, d, ipKey) {
  return crypto.createHmac('sha256', secret)
    .update(['v1', c, e, d, ipKey].join('|'), 'utf8')
    .digest('base64url');
}

function safeEq(a, b) {
  const x = Buffer.from(String(a), 'utf8'), y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Emite um ticket; devolve o objeto que o cliente recebe em /ticket. */
function issue({ secret, ipKey, bits = 0, ttlMs = 60000, now = Date.now() }) {
  const c = crypto.randomBytes(18).toString('base64url');
  const e = Math.floor((now + ttlMs) / 1000);
  const d = Math.max(0, Math.min(24, bits | 0));
  const k = sig(secret, c, e, d, ipKey);
  return { v: 1, c, e, d, k };
}

/**
 * Verifica o parâmetro recebido no handshake.
 * `used` (opcional) impede reutilizar a mesma prova por replay.
 */
function verify({ secret, param, ipKey, now = Date.now(), skewMs = 120000, used = null }) {
  const parts = typeof param === 'string' ? param.split('.') : [];
  if (parts.length !== 5) return { ok: false, reason: 'formato' };
  const [c, e, d, k, n] = parts;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(c) ||
      !/^\d{1,12}$/.test(e) ||
      !/^\d{1,2}$/.test(d) ||
      !/^[A-Za-z0-9_-]{20,64}$/.test(k)) return { ok: false, reason: 'formato' };
  const exp = +e * 1000, bits = +d;
  if (bits > 24) return { ok: false, reason: 'dificuldade' };
  if (exp < now || exp > now + skewMs) return { ok: false, reason: 'expirado' };
  const want = sig(secret, c, e, d, ipKey);
  if (!safeEq(want, k)) return { ok: false, reason: 'assinatura' };
  if (!powOk(c, bits, n)) return { ok: false, reason: 'pow' };
  if (used && !used.take(c, exp)) return { ok: false, reason: 'replay' };
  return { ok: true, bits };
}

/** Cache limitado de desafios já usados (anti-replay), com expiração. */
function createUsed({ max = 50000 } = {}) {
  const map = new Map();
  function sweep(now) {
    if (map.size <= max) return;
    for (const [k, exp] of map) if (exp < now) map.delete(k);
    if (map.size <= max) return;
    let over = map.size - max;
    for (const k of map.keys()) {
      map.delete(k);
      if (--over <= 0) break;
    }
  }
  return {
    take(c, exp, now = Date.now()) {
      if (map.has(c)) return false;
      map.set(c, exp);
      sweep(now);
      return true;
    },
    size: () => map.size
  };
}

module.exports = { zeroBits, powOk, sig, issue, verify, createUsed };
