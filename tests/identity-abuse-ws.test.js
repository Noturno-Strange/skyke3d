'use strict';
// Abuso do protocolo de identidade pelo WebSocket: rotações simultâneas, enxurrada de provas
// erradas e mensagens malformadas.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const H = require('./harness.js');
const { payload } = require('../lib/identity.js');
const { fidOf } = require('../lib/ids.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const sign = (priv, data) =>
  crypto.sign('sha256', Buffer.from(data, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');
function kp() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { pk: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), priv: privateKey };
}
async function next(c, pred, ms = 3000) {
  assert.ok(await H.until(() => c.msgs.some(pred), ms), 'mensagem esperada: ' + String(pred));
  return c.msgs.find(pred);
}
async function setup(srv, ip, ch) {
  const c = await H.connect(srv.port, ip);
  const K = ch.repeat(43),
    id = fidOf(K),
    main = kp(),
    rec = kp();
  send(c, { t: 'idreg', k: K, pk: main.pk, rpk: rec.pk });
  await next(c, m => m.t === 'idok');
  return { c, id, main, rec };
}
async function session(c, id, priv) {
  c.msgs.length = 0;
  send(c, { t: 'auth', id, action: 'join' });
  const ch = await next(c, m => m.t === 'challenge');
  send(c, { t: 'proof', id, nonce: ch.nonce, sig: sign(priv, payload.auth(id, ch.nonce, 'join')), action: 'join' });
  return next(c, m => m.t === 'session');
}

test('identidade: duas rotações simultâneas com o mesmo token — só uma vence', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const { c, id, main, rec } = await setup(srv, '203.0.113.110', 'R');
  t.after(() => c.ws.close());
  const s = await session(c, id, main.priv);
  const a = kp(),
    b = kp();
  const da = payload.rotate(id, 1, a.pk),
    db = payload.rotate(id, 1, b.pk);
  c.msgs.length = 0;
  send(c, { t: 'idrot', token: s.token, gen: 1, pk: a.pk, sigOld: sign(main.priv, da), sigRec: sign(rec.priv, da) });
  send(c, { t: 'idrot', token: s.token, gen: 1, pk: b.pk, sigOld: sign(main.priv, db), sigRec: sign(rec.priv, db) });
  await next(c, m => m.t === 'idok');
  await next(c, m => m.t === 'err' && m.scope === 'idrot');
  assert.strictEqual(c.msgs.filter(m => m.t === 'idok').length, 1, 'só uma rotação confirmada');
  assert.strictEqual(c.msgs.filter(m => m.t === 'err').length, 1);

  // a chave que perdeu a corrida não autentica; a que venceu sim
  const lost = await new Promise(r => {
    c.msgs.length = 0;
    send(c, { t: 'auth', id, action: 'join' });
    next(c, m => m.t === 'challenge').then(ch => {
      send(c, {
        t: 'proof',
        id,
        nonce: ch.nonce,
        sig: sign(b.priv, payload.auth(id, ch.nonce, 'join')),
        action: 'join'
      });
      next(c, m => m.t === 'session' || m.t === 'err').then(r);
    });
  });
  assert.strictEqual(lost.t, 'err');
  assert.strictEqual((await session(c, id, a.priv)).gen, 2);
});

test('identidade: enxurrada de provas erradas é contida e não afeta a chave certa de outro IP', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const { c, id, main } = await setup(srv, '203.0.113.111', 'S');
  t.after(() => c.ws.close());
  const wrong = kp();
  c.msgs.length = 0;
  let closed = false;
  c.closed.then(() => (closed = true));
  for (let i = 0; i < 30 && !closed; i++) {
    send(c, { t: 'auth', id, action: 'join' });
    const ch = await next(c, m => m.t === 'challenge' && !m.seen);
    ch.seen = true;
    send(c, { t: 'proof', id, nonce: ch.nonce, sig: sign(wrong.priv, payload.auth(id, ch.nonce, 'join')), action: 'join' });
    await H.until(() => c.msgs.filter(m => m.t === 'err' && m.scope === 'proof').length > i || closed, 1000);
  }
  assert.ok(!c.msgs.some(m => m.t === 'session'), 'nenhuma prova errada gera sessão');

  // outro IP, chave certa: continua funcionando
  const d = await H.connect(srv.port, '203.0.113.112');
  t.after(() => d.ws.close());
  assert.strictEqual((await session(d, id, main.priv)).scope, 'primary');
});

test('identidade: mensagens malformadas são recusadas e o servidor segue respondendo', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const { c, id, main } = await setup(srv, '203.0.113.113', 'T');
  t.after(() => c.ws.close());
  const tok = 'A'.repeat(43),
    sig = 'B'.repeat(86);
  const bad = [
    { t: 'auth', id: 5, action: 'join' },
    { t: 'auth', id, action: 'nao-existe' },
    { t: 'proof', id, action: 'join', nonce: 'curto', sig },
    { t: 'proof', id, action: 'join', nonce: tok, sig: { x: 1 } },
    { t: 'idreg', k: 'x', pk: 'y', rpk: 'z' },
    { t: 'idrot', token: tok, gen: 1, sigOld: sig, sigRec: sig },
    { t: 'idrot', token: tok, gen: 1, pk: 'a', rpk: 'b', sigOld: sig, sigRec: sig },
    { t: 'idrot', token: tok, gen: -1, pk: 'a'.repeat(120), sigOld: sig, sigRec: sig },
    { t: 'idrec', token: [], gen: 1 },
    { t: 'idrev', token: tok, epoch: 'x' },
    { t: 'idcancel', token: null, gen: 1, sigOld: sig }
  ];
  c.msgs.length = 0;
  for (const m of bad) send(c, m);
  c.ws.send('não é json');
  c.ws.send('{"t":"idrot","token":');
  await H.wait(300);
  assert.ok(!c.msgs.some(m => m.t === 'session' || m.t === 'idok'), 'nada foi aceito');

  // outra conexão do mesmo servidor continua autenticando normalmente
  const d = await H.connect(srv.port, '203.0.113.114');
  t.after(() => d.ws.close());
  assert.strictEqual((await session(d, id, main.priv)).t, 'session');
});
