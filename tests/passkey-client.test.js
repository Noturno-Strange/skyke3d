'use strict';
// Passkeys no cliente (assets/identity.js) contra o servidor real, com um navigator.credentials de mentira que entrega os
// mesmos bytes que um navegador (tests/fake-authn.js): cadastrar, entrar em outro aparelho sem nada guardado e revogar.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const H = require('./harness.js');
const FA = require('./fake-authn.js');
const SKYREC = require('../assets/recovery.js');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'assets', 'identity.js'), 'utf8');

function fakeIDB() {
  const data = new Map();
  const later = fn => setTimeout(fn, 0);
  const request = result => {
    const r = {};
    later(() => {
      r.result = result;
      if (r.onsuccess) r.onsuccess();
    });
    return r;
  };
  const stores = new Set();
  const db = {
    objectStoreNames: { contains: n => stores.has(n) },
    createObjectStore: n => stores.add(n),
    transaction: () => ({
      objectStore: () => ({
        get: k => request(data.get(k)),
        put: (v, k) => (data.set(k, v), request(undefined)),
        delete: k => (data.delete(k), request(undefined))
      })
    })
  };
  return {
    _data: data,
    open: () => {
      const r = {};
      later(() => {
        r.result = db;
        if (!stores.size && r.onupgradeneeded) r.onupgradeneeded();
        if (r.onsuccess) r.onsuccess();
      });
      return r;
    }
  };
}
function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const ab = buf => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const b64 = u8 => Buffer.from(u8).toString('base64url');

/** autenticador compartilhado (como uma passkey sincronizada entre aparelhos) */
function authenticator(origin) {
  /** @type {any[]} */
  const creds = [];
  const err = name => Object.assign(new Error(name), { name });
  const credentials = {
    create: async ({ publicKey: o }) => {
      if (o.authenticatorSelection.userVerification !== 'required') throw err('NotSupportedError');
      const exclude = new Set((o.excludeCredentials || []).map(x => b64(x.id)));
      if (creds.some(c => exclude.has(c.cid))) throw err('InvalidStateError');
      const cred = FA.makeCred('es256');
      cred.user = b64(o.user.id);
      creds.push(cred);
      const reg = FA.register(cred, { rpId: o.rp.id, origin, challenge: b64(o.challenge) });
      return {
        rawId: ab(cred.cidBuf),
        response: {
          clientDataJSON: ab(Buffer.from(reg.cd, 'base64url')),
          getAuthenticatorData: () => ab(Buffer.from(reg.ad, 'base64url')),
          getPublicKey: () => ab(Buffer.from(cred.spki, 'base64url')),
          getPublicKeyAlgorithm: () => -7
        }
      };
    },
    get: async ({ publicKey: o }) => {
      const cred = creds[creds.length - 1];
      if (!cred) throw err('NotAllowedError');
      const a = FA.assert(cred, { rpId: o.rpId, origin, challenge: b64(o.challenge) });
      return {
        rawId: ab(cred.cidBuf),
        response: {
          clientDataJSON: ab(Buffer.from(a.cd, 'base64url')),
          authenticatorData: ab(Buffer.from(a.ad, 'base64url')),
          signature: ab(Buffer.from(a.sig, 'base64url'))
        }
      };
    }
  };
  return { credentials, creds };
}

async function client(port, authn) {
  const conn = await H.connect(port, '203.0.113.' + (20 + Math.floor(Math.random() * 200)), { host: 'localhost' });
  function AuthenticatorAttestationResponse() {}
  AuthenticatorAttestationResponse.prototype.getPublicKey = function () {};
  AuthenticatorAttestationResponse.prototype.getAuthenticatorData = function () {};
  const sandbox = {
    crypto: crypto.webcrypto,
    indexedDB: fakeIDB(),
    localStorage: fakeStorage(),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    console,
    SKYREC,
    isSecureContext: true,
    PublicKeyCredential: function () {},
    AuthenticatorAttestationResponse,
    navigator: { credentials: authn.credentials }
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'identity.js' });
  const id = sandbox.SKYID;
  id.bind(m => conn.ws.send(JSON.stringify(m)));
  conn.ws.on('message', (d, bin) => {
    if (!bin) id.onMessage(JSON.parse(d));
  });
  return { conn, id };
}

test('cliente: cadastra passkeys, entra em outro aparelho sem nada guardado e revoga', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const authn = authenticator('http://localhost:' + srv.port);

  const A = await client(srv.port, authn);
  t.after(() => A.conn.ws.close());
  assert.strictEqual(A.id.passkeySupported(), true);
  const me = await A.id.ensure();
  await A.id.preparePasskey('reg');
  const l1 = await A.id.addPasskey('Celular', 'Ana');
  assert.deepStrictEqual(l1.map(p => p.name), ['Celular']);
  // a mesma passkey de novo: o navegador recusa (excludeCredentials) e a mensagem é clara
  await assert.rejects(A.id.addPasskey('De novo', 'Ana'), e => e.code === 'pk-exists');
  assert.strictEqual((await A.id.listPasskeys()).list.length, 1);

  // aparelho novo, sem identidade guardada: entra com a passkey e vira o principal
  const B = await client(srv.port, authn);
  t.after(() => B.conn.ws.close());
  assert.strictEqual(B.id.status(), null);
  const r = await B.id.passkeyLogin();
  assert.strictEqual(r.id, me.id);
  const st = B.id.status();
  assert.strictEqual(st.hasPrimary, true);
  assert.strictEqual(st.hasRecovery, true, 'conhece a chave pública de recuperação');
  assert.ok((await B.id.ensure()).token, 'entra com a chave nova');
  assert.strictEqual(await Promise.race([A.conn.closed, H.wait(3000).then(() => 'aberta')]), 4001, 'o aparelho antigo saiu');

  // revoga: a passkey não entra mais
  assert.deepStrictEqual(await B.id.removeAllPasskeys(), []);
  const C = await client(srv.port, authn);
  t.after(() => C.conn.ws.close());
  await assert.rejects(C.id.passkeyLogin(), e => e.code === 'pk-fail');
  assert.strictEqual(C.id.status(), null, 'nada foi guardado depois da falha');
});

test('cliente: sem suporte a passkey (http num endereço que não é localhost) o jogo avisa em vez de tentar', () => {
  const sandbox = { crypto: crypto.webcrypto, TextEncoder, TextDecoder, setTimeout, clearTimeout, SKYREC, isSecureContext: false };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'identity.js' });
  assert.strictEqual(sandbox.SKYID.passkeySupported(), false);
  return assert.rejects(sandbox.SKYID.passkeyLogin(), e => e.code === 'pk-unsupported');
});
