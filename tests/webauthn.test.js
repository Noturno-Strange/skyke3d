'use strict';
// Passkeys (lib/webauthn.js): cadastro e entrada com os três algoritmos aceitos, e cada coisa que precisa barrar.
const test = require('node:test');
const assert = require('node:assert');
const WA = require('../lib/webauthn.js');
const FA = require('./fake-authn.js');

const origin = 'https://jogo.exemplo.com',
  rpId = 'jogo.exemplo.com',
  challenge = 'c'.repeat(43);

for (const kind of /** @type {const} */ (['es256', 'eddsa', 'rs256'])) {
  test('passkey ' + kind + ': cadastra e entra', () => {
    const cred = FA.makeCred(kind);
    const reg = FA.register(cred, { rpId, origin, challenge });
    const r = WA.verifyRegistration({ origin, rpId, challenge, ...reg });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    const a = FA.assert(cred, { rpId, origin, challenge });
    const v = WA.verifyAssertion({ origin, rpId, challenge, cd: a.cd, ad: a.ad, sig: a.sig, cred: r.ok ? r.cred : null });
    assert.deepStrictEqual(v, { ok: true, sc: 0 });
  });
}

test('cadastro: barra desafio, origem, tipo, rpId, sem verificação do usuário, iframe de outro site e chave trocada', () => {
  const cred = FA.makeCred();
  const base = () => FA.register(cred, { rpId, origin, challenge });
  const check = (reg, why, o = {}) =>
    assert.strictEqual(WA.verifyRegistration({ origin, rpId, challenge, ...reg, ...o }).reason, why);
  check(base(), 'challenge', { challenge: 'd'.repeat(43) });
  check(FA.register(cred, { rpId, origin: 'https://evil.example', challenge }), 'origin');
  check(FA.register(cred, { rpId, origin, challenge, cd: FA.clientData('webauthn.get', challenge, origin) }), 'type');
  check(FA.register(cred, { rpId: 'evil.example', origin, challenge }), 'rp');
  check(FA.register(cred, { rpId, origin, challenge, flags: 0x41 }), 'uv'); // presença sem verificação (sem PIN/biometria)
  check(FA.register(cred, { rpId, origin, challenge, cd: FA.clientData('webauthn.create', challenge, origin, { crossOrigin: true }) }), 'origin');
  check({ ...base(), cid: FA.makeCred().cid }, 'invalid'); // o id não é o dos dados do autenticador
  check({ ...base(), alg: -257 }, 'alg'); // chave EC declarada como RSA
  check({ ...base(), spki: 'AAAA' }, 'alg');
  check({ ...base(), cd: '!!' }, 'invalid');
});

test('entrada: barra assinatura errada, outra chave, desafio, origem, rpId, sem verificação e contador que volta', () => {
  const cred = FA.makeCred();
  const stored = { pk: cred.spki, alg: cred.alg, sc: 0 };
  const ok = o => WA.verifyAssertion({ origin, rpId, challenge, ...o, cred: o.cred || stored });
  const a = FA.assert(cred, { rpId, origin, challenge });
  assert.strictEqual(ok(a).ok, true);
  const other = FA.makeCred();
  assert.strictEqual(ok({ ...a, cred: { pk: other.spki, alg: -7, sc: 0 } }).reason, 'bad-signature');
  const tampered = Buffer.from(a.ad, 'base64url');
  tampered[36] ^= 1; // muda o contador depois de assinado
  assert.strictEqual(ok({ ...a, ad: tampered.toString('base64url') }).reason, 'bad-signature');
  assert.strictEqual(ok({ ...a, challenge: 'e'.repeat(43) }).reason, 'challenge');
  assert.strictEqual(ok(FA.assert(cred, { rpId, origin: 'https://evil.example', challenge })).reason, 'origin');
  assert.strictEqual(ok(FA.assert(cred, { rpId: 'evil.example', origin, challenge })).reason, 'rp');
  assert.strictEqual(ok(FA.assert(cred, { rpId, origin, challenge, flags: 0x01 })).reason, 'uv');
  assert.strictEqual(ok(FA.assert(cred, { rpId, origin, challenge, cd: FA.clientData('webauthn.create', challenge, origin) })).reason, 'type');
  // chave física com contador: precisa subir
  const counted = { ...stored, sc: 5 };
  assert.deepStrictEqual(ok({ ...FA.assert(cred, { rpId, origin, challenge, count: 6 }), cred: counted }), { ok: true, sc: 6 });
  assert.strictEqual(ok({ ...FA.assert(cred, { rpId, origin, challenge, count: 5 }), cred: counted }).reason, 'clone');
  assert.strictEqual(ok({ ...FA.assert(cred, { rpId, origin, challenge, count: 0 }), cred: counted }).reason, 'clone');
});

test('rpId: só domínio com https (ou localhost); IP e http em outro endereço não servem', () => {
  assert.strictEqual(WA.rpIdOf('https://skyke3d.com.br'), 'skyke3d.com.br');
  assert.strictEqual(WA.rpIdOf('http://localhost:3000'), 'localhost');
  assert.strictEqual(WA.rpIdOf('http://jogo.exemplo.com'), '');
  assert.strictEqual(WA.rpIdOf('https://192.168.0.10:3000'), '');
  assert.strictEqual(WA.rpIdOf('https://[::1]:3000'), '');
  assert.strictEqual(WA.rpIdOf('lixo'), '');
});

test('o identificador da conta no autenticador é estável e não revela o id', () => {
  const h = WA.userHandle('abcdefghijkl');
  assert.strictEqual(h, WA.userHandle('abcdefghijkl'));
  assert.notStrictEqual(h, WA.userHandle('abcdefghijkm'));
  assert.ok(!h.includes('abcdefghijkl'));
  assert.strictEqual(Buffer.from(h, 'base64url').length, 16);
});
