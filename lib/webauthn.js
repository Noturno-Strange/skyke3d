'use strict';
/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Verificação de Passkeys (WebAuthn nível 2) sem dependências: só o `crypto` do Node.
 *
 * - Cadastro: `attestation: 'none'`. O navegador entrega a chave pública já em SPKI (`getPublicKey()`), os dados do
 *   autenticador (`getAuthenticatorData()`) e o clientDataJSON. Aqui conferimos o tipo, o desafio (de uso único, emitido pelo
 *   servidor), a origem, o hash do rpId, os sinais de presença (UP) e verificação do usuário (UV) e que o id da credencial
 *   nos dados do autenticador é o mesmo que o navegador informou. Sem atestado não há confiança no fabricante, e não precisa:
 *   a chave serve só para provar que é o mesmo autenticador nas próximas entradas.
 * - Entrada: a assinatura cobre `authenticatorData || SHA-256(clientDataJSON)` e é conferida com a chave guardada. O contador
 *   de assinaturas, quando o autenticador usa um (chaves físicas), precisa subir: se voltar, a credencial pode ter sido clonada.
 *
 * Algoritmos aceitos: ES256 (-7, P-256), EdDSA (-8, Ed25519) e RS256 (-257, RSA de 2048 bits ou mais).
 * Nada aqui guarda segredo: chave pública, id da credencial e contador não permitem entrar no lugar de ninguém.
 */
const crypto = require('crypto');

const ALGS = new Set([-7, -8, -257]);
const B64U = /^[A-Za-z0-9_-]+$/;
// tamanhos máximos (em base64url) do que vem do navegador: barram lixo antes de decodificar
const MAX = { cd: 2048, ad: 2048, sig: 1024, spki: 1200, cid: 1400 };
const CID_RE = /^[A-Za-z0-9_-]{16,1366}$/; // a especificação limita o id da credencial a 1023 bytes
const FLAG_UP = 0x01,
  FLAG_UV = 0x04,
  FLAG_AT = 0x40;

/** @param {any} s @param {number} max @returns {Buffer|null} */
function b64(s, max) {
  if (typeof s !== 'string' || !s || s.length > max || !B64U.test(s)) return null;
  const b = Buffer.from(s, 'base64url');
  return b.length ? b : null;
}

/**
 * Importa a chave pública de uma passkey (SPKI DER base64url) conferindo que bate com o algoritmo declarado.
 * @param {string} spki
 * @param {number} alg
 * @returns {crypto.KeyObject|null}
 */
function importCredentialKey(spki, alg) {
  if (!ALGS.has(alg)) return null;
  const der = b64(spki, MAX.spki);
  if (!der) return null;
  let key;
  try {
    key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch (e) {
    return null;
  }
  const t = key.asymmetricKeyType,
    d = key.asymmetricKeyDetails || {};
  if (alg === -7) return t === 'ec' && d.namedCurve === 'prime256v1' ? key : null;
  if (alg === -8) return t === 'ed25519' ? key : null;
  return t === 'rsa' && (d.modulusLength || 0) >= 2048 ? key : null;
}

/**
 * Lê os dados do autenticador: hash do rpId (32), sinais (1), contador (4) e, no cadastro, o id da credencial.
 * @param {Buffer} ad
 * @returns {{rpIdHash: Buffer, flags: number, signCount: number, credId: Buffer|null}|null}
 */
function parseAuthData(ad) {
  if (!Buffer.isBuffer(ad) || ad.length < 37) return null;
  const flags = ad[32];
  let credId = null;
  if (flags & FLAG_AT) {
    // aaguid (16) + tamanho do id (2) + id
    if (ad.length < 55) return null;
    const n = ad.readUInt16BE(53);
    if (n < 1 || n > 1023 || ad.length < 55 + n) return null;
    credId = ad.subarray(55, 55 + n);
  }
  return { rpIdHash: ad.subarray(0, 32), flags, signCount: ad.readUInt32BE(33), credId };
}

/**
 * Confere o clientDataJSON: tipo, desafio (comparado em tempo constante) e origem.
 * @param {Buffer} cd
 * @param {{type: string, challenge: string, origin: string}} want
 * @returns {string} '' quando confere; senão o motivo
 */
function checkClientData(cd, want) {
  let j;
  try {
    j = JSON.parse(cd.toString('utf8'));
  } catch (e) {
    return 'client-data';
  }
  if (!j || typeof j !== 'object') return 'client-data';
  if (j.type !== want.type) return 'type';
  if (typeof j.challenge !== 'string' || !sameText(j.challenge, want.challenge)) return 'challenge';
  if (j.origin !== want.origin) return 'origin';
  // passkey criada dentro de um iframe de outro site não vale aqui
  if (j.crossOrigin === true) return 'origin';
  return '';
}

/** @param {string} a @param {string} b */
function sameText(a, b) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** rpId válido para WebAuthn: um nome de domínio (localhost incluído), nunca IP. */
function rpIdOf(origin) {
  let u;
  try {
    u = new URL(origin);
  } catch (e) {
    return '';
  }
  const h = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (h === 'localhost' || h.endsWith('.localhost'))))
    return '';
  if (!h || /^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return '';
  return h;
}

/**
 * Cadastro de uma passkey.
 * @param {{origin: string, rpId: string, challenge: string, cd: string, ad: string, spki: string, alg: number, cid: string}} o
 * @returns {{ok: true, cred: {cid: string, pk: string, alg: number, sc: number}} | {ok: false, reason: string}}
 */
function verifyRegistration({ origin, rpId, challenge, cd, ad, spki, alg, cid }) {
  const cdb = b64(cd, MAX.cd),
    adb = b64(ad, MAX.ad);
  if (!cdb || !adb || typeof cid !== 'string' || !CID_RE.test(cid)) return { ok: false, reason: 'invalid' };
  const why = checkClientData(cdb, { type: 'webauthn.create', challenge, origin });
  if (why) return { ok: false, reason: why };
  const a = parseAuthData(adb);
  if (!a || !a.credId) return { ok: false, reason: 'invalid' };
  if (!a.rpIdHash.equals(crypto.createHash('sha256').update(rpId).digest())) return { ok: false, reason: 'rp' };
  if (!(a.flags & FLAG_UP) || !(a.flags & FLAG_UV)) return { ok: false, reason: 'uv' };
  if (a.credId.toString('base64url') !== cid) return { ok: false, reason: 'invalid' };
  if (!importCredentialKey(spki, alg)) return { ok: false, reason: 'alg' };
  return { ok: true, cred: { cid, pk: spki, alg, sc: a.signCount } };
}

/**
 * Entrada com uma passkey já cadastrada.
 * @param {{origin: string, rpId: string, challenge: string, cd: string, ad: string, sig: string,
 *   cred: {pk: string, alg: number, sc: number}}} o
 * @returns {{ok: true, sc: number} | {ok: false, reason: string}}
 */
function verifyAssertion({ origin, rpId, challenge, cd, ad, sig, cred }) {
  const cdb = b64(cd, MAX.cd),
    adb = b64(ad, MAX.ad),
    sg = b64(sig, MAX.sig);
  if (!cdb || !adb || !sg || !cred) return { ok: false, reason: 'invalid' };
  const why = checkClientData(cdb, { type: 'webauthn.get', challenge, origin });
  if (why) return { ok: false, reason: why };
  const a = parseAuthData(adb);
  if (!a) return { ok: false, reason: 'invalid' };
  if (!a.rpIdHash.equals(crypto.createHash('sha256').update(rpId).digest())) return { ok: false, reason: 'rp' };
  if (!(a.flags & FLAG_UP) || !(a.flags & FLAG_UV)) return { ok: false, reason: 'uv' };
  const key = importCredentialKey(cred.pk, cred.alg);
  if (!key) return { ok: false, reason: 'alg' };
  const data = Buffer.concat([adb, crypto.createHash('sha256').update(cdb).digest()]);
  let good = false;
  try {
    good =
      cred.alg === -8
        ? crypto.verify(null, data, key, sg)
        : crypto.verify('sha256', data, cred.alg === -7 ? { key, dsaEncoding: 'der' } : key, sg);
  } catch (e) {
    good = false;
  }
  if (!good) return { ok: false, reason: 'bad-signature' };
  // contador: 0 sempre (passkeys sincronizadas) é normal; se o autenticador conta, tem que subir
  if ((a.signCount !== 0 || cred.sc !== 0) && a.signCount <= cred.sc) return { ok: false, reason: 'clone' };
  return { ok: true, sc: a.signCount };
}

/** Identificador estável e opaco da conta dentro do autenticador (não revela o id de identidade). */
function userHandle(id) {
  return crypto
    .createHash('sha256')
    .update('skyke3d/passkey-user|' + id)
    .digest()
    .subarray(0, 16)
    .toString('base64url');
}

module.exports = {
  verifyRegistration,
  verifyAssertion,
  importCredentialKey,
  parseAuthData,
  rpIdOf,
  userHandle,
  ALGS,
  CID_RE,
  MAX
};
