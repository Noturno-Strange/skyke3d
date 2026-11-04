'use strict';
/*
 * Identificadores opacos do Skyke3D.
 *
 * O id de identidade herdado é o próprio id de amigo da chave do aparelho (skyke_fk): assim
 * nomes e listas de amigos antigos continuam válidos sem migração destrutiva. Identidades
 * novas usam um id aleatório no mesmo formato (12 caracteres base32, 60 bits).
 *
 * O id não é segredo: serve só para localizar a identidade no registro do servidor. Quem
 * prova a posse é a assinatura da chave privada correspondente.
 */
const crypto = require('crypto');

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
const ID_RE = /^[a-z2-7]{12}$/;

/** 60 bits em base32 minúsculo, sem depender do tamanho da entrada. */
function b32_60(bytes) {
  let out = '';
  for (let i = 0, acc = 0, bits = 0; out.length < 12; ) {
    if (bits < 5) {
      acc = (acc << 8) | bytes[i++];
      bits += 8;
    }
    out += B32[(acc >> (bits - 5)) & 31];
    bits -= 5;
  }
  return out;
}

/**
 * Id público de amigo: 60 bits do SHA-256 da chave secreta, em base32 minúsculo.
 * @param {string} key
 * @returns {string}
 */
function fidOf(key) {
  const h = crypto
    .createHash('sha256')
    .update('skyke3d/amigo|' + key)
    .digest();
  return b32_60(h);
}

/** Identidade herdada: o mesmo valor do id de amigo da chave do aparelho. */
const identityIdOf = fidOf;

/**
 * Id novo, aleatório e opaco (60 bits em base32).
 * @returns {string}
 */
function newId() {
  return b32_60(crypto.randomBytes(12));
}

module.exports = { B32, ID_RE, fidOf, identityIdOf, newId };
