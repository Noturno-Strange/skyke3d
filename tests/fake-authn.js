'use strict';
// Autenticador de mentira para os testes de passkey: chaves reais do Node (ES256, EdDSA e RS256) e os mesmos bytes que um
// navegador entrega (clientDataJSON, authenticatorData e assinatura). Não é publicado: só os testes usam.
const crypto = require('node:crypto');

const ALG = { es256: -7, eddsa: -8, rs256: -257 };

/** @param {'es256'|'eddsa'|'rs256'} kind */
function makeCred(kind = 'es256') {
  const kp =
    kind === 'eddsa'
      ? crypto.generateKeyPairSync('ed25519')
      : kind === 'rs256'
        ? crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
        : crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const cidBuf = crypto.randomBytes(32);
  return {
    kind,
    alg: ALG[kind],
    priv: kp.privateKey,
    spki: kp.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'),
    cidBuf,
    cid: cidBuf.toString('base64url'),
    count: 0
  };
}

const clientData = (type, challenge, origin, extra = {}) =>
  Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false, ...extra }));

function authData({ rpId, flags, signCount, credId }) {
  const head = Buffer.alloc(37);
  crypto.createHash('sha256').update(rpId).digest().copy(head, 0);
  head[32] = flags;
  head.writeUInt32BE(signCount >>> 0, 33);
  if (!credId) return head;
  const len = Buffer.alloc(2);
  len.writeUInt16BE(credId.length);
  // aaguid zerado + tamanho + id (+ a chave COSE, que o servidor não lê: ele usa a SPKI de getPublicKey())
  return Buffer.concat([head, Buffer.alloc(16), len, credId, Buffer.from([0xa0])]);
}

/** o que o navegador manda para cadastrar (`pkreg`) */
function register(cred, { rpId, origin, challenge, flags = 0x45, cd } = {}) {
  return {
    cd: (cd || clientData('webauthn.create', challenge, origin)).toString('base64url'),
    ad: authData({ rpId, flags, signCount: cred.count, credId: cred.cidBuf }).toString('base64url'),
    spki: cred.spki,
    alg: cred.alg,
    cid: cred.cid
  };
}

/** o que o navegador manda para entrar (`pklogin`); `count`: o contador do autenticador (0 = passkey sincronizada) */
function assert_(cred, { rpId, origin, challenge, flags = 0x05, count, cd } = {}) {
  const c = cd || clientData('webauthn.get', challenge, origin);
  const ad = authData({ rpId, flags, signCount: count === undefined ? cred.count : count, credId: null });
  const data = Buffer.concat([ad, crypto.createHash('sha256').update(c).digest()]);
  const sig = cred.kind === 'eddsa' ? crypto.sign(null, data, cred.priv) : crypto.sign('sha256', data, cred.priv);
  return { cid: cred.cid, cd: c.toString('base64url'), ad: ad.toString('base64url'), sig: sig.toString('base64url') };
}

module.exports = { makeCred, register, assert: assert_, clientData, authData, ALG };
