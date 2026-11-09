'use strict';
// Autenticação (lib/auth.js): desafio de uso único, assinatura, tokens presos à geração/época
// da identidade e escopo limitado da chave de recuperação.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { createIdentityRegistry, payload } = require('../lib/identity.js');
const { createAuth } = require('../lib/auth.js');
const { newId } = require('../lib/ids.js');

function kp() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { pk: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), priv: privateKey };
}
const sign = (priv, data) =>
  crypto.sign('sha256', Buffer.from(data, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');

function world(opts = {}) {
  let clock = 1000000;
  const r = createIdentityRegistry({ file: '', now: () => clock });
  const id = newId(),
    main = kp(),
    rec = kp();
  assert.strictEqual(r.register({ id, pk: main.pk, rpk: rec.pk }).ok, true);
  const A = createAuth({ identity: r, now: () => clock, ...opts });
  return { r, A, id, main, rec, tick: ms => (clock += ms) };
}

/** Pede o desafio, assina e devolve tudo, para os testes poderem repetir o nonce. */
function prove(A, id, key, action) {
  const c = A.challenge({ id, action });
  assert.strictEqual(c.ok, true);
  const sig = sign(key.priv, payload.auth(id, c.nonce, action));
  return { c, sig, r: A.verifyProof({ id, nonce: c.nonce, sig, action }) };
}

test('desafio + prova com a principal emite token válido', t => {
  const { A, id, main } = world();
  const { r } = prove(A, id, main, 'join');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.scope, 'primary');
  assert.match(r.token, /^[A-Za-z0-9_-]{43}$/);
  assert.strictEqual(r.gen, 1);
  assert.strictEqual(r.epoch, 0);
  const v = A.verifyToken(r.token, 'join');
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.id, id);
  assert.strictEqual(v.scope, 'primary');
  assert.strictEqual(A.verifyToken(r.token, 'rotate').ok, true);
});

test('id desconhecido recebe o mesmo formato de desafio e falha na prova', () => {
  const { A, main } = world();
  const ghost = newId();
  const c = A.challenge({ id: ghost, action: 'join' });
  assert.strictEqual(c.ok, true);
  assert.strictEqual(c.gen, 1);
  assert.strictEqual(c.epoch, 0);
  assert.deepStrictEqual(
    A.verifyProof({ id: ghost, nonce: c.nonce, sig: sign(main.priv, payload.auth(ghost, c.nonce, 'join')), action: 'join' }),
    { ok: false, reason: 'bad-signature' }
  );
});

test('nonce é de uso único: repetir devolve challenge', t => {
  const { A, id, main } = world();
  const { c, sig, r } = prove(A, id, main, 'join');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(A.verifyProof({ id, nonce: c.nonce, sig, action: 'join' }), {
    ok: false,
    reason: 'challenge'
  });
});

test('desafio vencido não vale', t => {
  const { A, id, main, tick } = world();
  const c = A.challenge({ id, action: 'join' });
  tick(60001);
  const sig = sign(main.priv, payload.auth(id, c.nonce, 'join'));
  assert.deepStrictEqual(A.verifyProof({ id, nonce: c.nonce, sig, action: 'join' }), {
    ok: false,
    reason: 'expired'
  });
});

test('assinatura errada queima o nonce (uma tentativa por desafio)', t => {
  const { A, id, main } = world();
  const c = A.challenge({ id, action: 'join' });
  const bad = A.verifyProof({
    id,
    nonce: c.nonce,
    sig: sign(kp().priv, payload.auth(id, c.nonce, 'join')),
    action: 'join'
  });
  assert.deepStrictEqual(bad, { ok: false, reason: 'bad-signature' });
  const good = A.verifyProof({ id, nonce: c.nonce, sig: sign(main.priv, payload.auth(id, c.nonce, 'join')), action: 'join' });
  assert.deepStrictEqual(good, { ok: false, reason: 'challenge' });
});

test('nonce fica preso ao id e à ação', t => {
  const { A, id, main } = world();
  const c = A.challenge({ id, action: 'join' });
  const outro = newId();
  assert.strictEqual(
    A.verifyProof({ id: outro, nonce: c.nonce, sig: sign(main.priv, payload.auth(id, c.nonce, 'join')), action: 'join' })
      .reason,
    'challenge'
  );
  const c2 = A.challenge({ id, action: 'join' });
  assert.strictEqual(
    A.verifyProof({ id, nonce: c2.nonce, sig: sign(main.priv, payload.auth(id, c2.nonce, 'join')), action: 'revoke' })
      .reason,
    'challenge'
  );
});

test('chave de recuperação abre só sessão de escopo limitado', t => {
  const { A, id, rec } = world();
  const { r } = prove(A, id, rec, 'recover');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.scope, 'recovery');
  assert.strictEqual(A.verifyToken(r.token, 'recover').ok, true);
  assert.strictEqual(A.verifyToken(r.token, 'revoke').ok, true);
  assert.strictEqual(A.verifyToken(r.token, 'join'), null);
  assert.strictEqual(A.verifyToken(r.token, 'rotate'), null);
  assert.strictEqual(A.verifyToken(r.token, 'remove'), null);
  assert.strictEqual(A.verifyToken(r.token, 'cancel-recovery'), null);
});

test('principal não abre sessão de recuperação e recuperação não abre sessão de jogo', t => {
  const { A, id, main, rec } = world();
  assert.strictEqual(prove(A, id, main, 'recover').r.reason, 'bad-signature');
  assert.strictEqual(prove(A, id, rec, 'join').r.reason, 'bad-signature');
});

test('rotação de chave invalida os tokens na hora', t => {
  const { A, r, id, main, rec } = world();
  const { r: session } = prove(A, id, main, 'join');
  assert.strictEqual(session.ok, true);
  const next = kp();
  const data = payload.rotate(id, 1, next.pk);
  assert.strictEqual(
    r.rotatePrimary({ id, expectedGen: 1, newPk: next.pk, sigOld: sign(main.priv, data), sigRec: sign(rec.priv, data) })
      .ok,
    true
  );
  assert.strictEqual(A.verifyToken(session.token), null);
  assert.strictEqual(prove(A, id, next, 'join').r.ok, true);
});

test('revogação de sessões pela época invalida os tokens', t => {
  const { A, r, id, main } = world();
  const { r: session } = prove(A, id, main, 'join');
  assert.strictEqual(r.revokeSessions({ id, expectedEpoch: 0, sigOld: sign(main.priv, payload.revoke(id, 0)) }).ok, true);
  assert.strictEqual(A.verifyToken(session.token), null);
});

test('revokeSessions derruba os tokens daquela identidade na hora', t => {
  const { A, id, main } = world();
  const a = prove(A, id, main, 'join').r,
    b = prove(A, id, main, 'join').r;
  assert.strictEqual(A.revokeSessions(id), 2);
  assert.strictEqual(A.verifyToken(a.token), null);
  assert.strictEqual(A.verifyToken(b.token), null);
  assert.strictEqual(A.stats().sessions, 0);
});

test('token vence pelo tempo', t => {
  const { A, id, main, tick } = world({ sessionTtlMs: 1000 });
  const { r } = prove(A, id, main, 'join');
  assert.strictEqual(A.verifyToken(r.token).ok, true);
  tick(1001);
  assert.strictEqual(A.verifyToken(r.token), null);
});

test('teto de desafios: recusa busy e libera depois de vencer', t => {
  const { A, id, tick } = world({ maxChallenges: 2 });
  assert.strictEqual(A.challenge({ id, action: 'join' }).ok, true);
  assert.strictEqual(A.challenge({ id, action: 'join' }).ok, true);
  assert.deepStrictEqual(A.challenge({ id, action: 'join' }), { ok: false, reason: 'busy' });
  tick(60001);
  assert.strictEqual(A.challenge({ id, action: 'join' }).ok, true);
});

test('teto de sessões descarta a mais antiga, sem recusar login', t => {
  const { A, id, main } = world({ maxSessions: 2 });
  const t1 = prove(A, id, main, 'join').r.token;
  const t2 = prove(A, id, main, 'join').r.token;
  const t3 = prove(A, id, main, 'join').r.token;
  assert.strictEqual(A.verifyToken(t1), null);
  assert.strictEqual(A.verifyToken(t2).ok, true);
  assert.strictEqual(A.verifyToken(t3).ok, true);
});

test('ação desconhecida ou id malformado são recusados', () => {
  const { A, id } = world();
  assert.deepStrictEqual(A.challenge({ id, action: 'admin' }), { ok: false, reason: 'invalid' });
  assert.deepStrictEqual(A.challenge({ id: 'X', action: 'join' }), { ok: false, reason: 'invalid' });
  assert.deepStrictEqual(A.verifyProof({ id, nonce: '', sig: '', action: 'join' }), {
    ok: false,
    reason: 'challenge'
  });
});

test('sweep limpa desafios e sessões vencidos', t => {
  const { A, id, main, tick } = world({ challengeTtlMs: 1000, sessionTtlMs: 1000 });
  prove(A, id, main, 'join');
  A.challenge({ id, action: 'join' });
  assert.deepStrictEqual(A.stats(), { challenges: 1, sessions: 1, ids: 1 });
  tick(1001);
  assert.deepStrictEqual(A.sweep(), { challenges: 1, sessions: 1 });
  assert.deepStrictEqual(A.stats(), { challenges: 0, sessions: 0, ids: 0 });
});

test('createAuth exige o registro de identidades', () => {
  assert.throws(() => createAuth({}), TypeError);
});

test('desafios de passkey: uso único, presos à conexão, à finalidade e à conta, e vencem', () => {
  let clock = 1000;
  const r = createIdentityRegistry({ now: () => clock });
  const A = createAuth({ identity: r, now: () => clock, pkChallengeTtlMs: 1000 });
  const w1 = {},
    w2 = {};
  const a = A.pkChallenge({ purpose: 'login', owner: w1 });
  assert.match(a.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.strictEqual(A.takePkChallenge({ challenge: a.challenge, purpose: 'login', owner: w2 }).reason, 'challenge', 'outra conexão');
  // a tentativa errada já consumiu: nem a conexão certa usa depois
  assert.strictEqual(A.takePkChallenge({ challenge: a.challenge, purpose: 'login', owner: w1 }).reason, 'challenge');
  const b = A.pkChallenge({ purpose: 'reg', id: 'abcdefghijkl', owner: w1 });
  assert.strictEqual(A.takePkChallenge({ challenge: b.challenge, purpose: 'login', owner: w1 }).reason, 'challenge', 'outra finalidade');
  const c = A.pkChallenge({ purpose: 'reg', id: 'abcdefghijkl', owner: w1 });
  assert.strictEqual(A.takePkChallenge({ challenge: c.challenge, purpose: 'reg', owner: w1, id: 'mnopqrstuvwx' }).reason, 'challenge', 'outra conta');
  const d = A.pkChallenge({ purpose: 'reg', id: 'abcdefghijkl', owner: w1 });
  const e = A.pkChallenge({ purpose: 'reg', id: 'abcdefghijkl', owner: w1 });
  assert.strictEqual(A.takePkChallenge({ challenge: d.challenge, purpose: 'reg', owner: w1, id: 'abcdefghijkl' }).reason, 'challenge', 'pedir outro descarta o anterior');
  assert.strictEqual(A.takePkChallenge({ challenge: e.challenge, purpose: 'reg', owner: w1, id: 'abcdefghijkl' }).ok, true);
  const f = A.pkChallenge({ purpose: 'login', owner: w1 });
  clock += 1001;
  assert.strictEqual(A.takePkChallenge({ challenge: f.challenge, purpose: 'login', owner: w1 }).reason, 'expired');
  assert.strictEqual(A.pkChallenge({ purpose: 'outra', owner: w1 }).ok, false);
});
