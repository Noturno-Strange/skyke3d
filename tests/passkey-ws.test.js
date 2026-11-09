'use strict';
// Passkeys no servidor real (lib/identity-ws.js + lib/webauthn.js): várias por conta, entrar em outro aparelho, revogar,
// tentativas automatizadas, cancelamento de recuperação e o registro de eventos de segurança sem segredos.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const H = require('./harness.js');
const FA = require('./fake-authn.js');
const { payload } = require('../lib/identity.js');
const { fidOf } = require('../lib/ids.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const sign = (priv, data) =>
  crypto.sign('sha256', Buffer.from(data, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');
function kp() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { pk: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), priv: privateKey };
}
/** espera a próxima mensagem que satisfaz `pred` depois da posição `from` (as respostas antigas ficam na lista) */
async function next(c, pred, from = 0) {
  assert.ok(await H.until(() => c.msgs.slice(from).some(pred), 4000), 'mensagem esperada: ' + String(pred));
  return c.msgs.slice(from).find(pred);
}
/** manda e espera a resposta (idok da operação ou erro do escopo) */
async function ask(c, m, op, scope = m.t) {
  const from = c.msgs.length;
  send(c, m);
  return next(c, x => (x.t === 'idok' && x.op === op) || (x.t === 'err' && x.scope === scope) || x.t === m.t, from);
}
let ipN = 10;
const conn = (port, host = 'localhost') => H.connect(port, '203.0.113.' + ipN++, { host });

/** cria a identidade e entra com a chave principal */
async function account(port) {
  const c = await conn(port);
  const K = crypto.randomBytes(32).toString('base64url'),
    id = fidOf(K),
    main = kp(),
    rec = kp();
  assert.strictEqual((await ask(c, { t: 'idreg', k: K, pk: main.pk, rpk: rec.pk }, 'register', 'idreg')).t, 'idok');
  const token = await login(c, id, main.priv, 'join');
  return { c, K, id, main, rec, token };
}
async function login(c, id, priv, action) {
  const from = c.msgs.length;
  send(c, { t: 'auth', id, action });
  const ch = await next(c, m => m.t === 'challenge' || (m.t === 'err' && m.scope === 'auth'), from);
  const f2 = c.msgs.length;
  send(c, { t: 'proof', id, action, nonce: ch.nonce, sig: sign(priv, payload.auth(id, ch.nonce, action)) });
  const s = await next(c, m => m.t === 'session' || (m.t === 'err' && m.scope === 'proof'), f2);
  return s.t === 'session' ? s.token : '';
}
async function addPasskey(c, token, cred, origin, name = 'Celular') {
  const o = await ask(c, { t: 'pkopt', purpose: 'reg', token }, '', 'pkopt');
  assert.strictEqual(o.t, 'pkopt', JSON.stringify(o));
  assert.strictEqual(o.rpId, 'localhost');
  const reg = FA.register(cred, { rpId: o.rpId, origin, challenge: o.challenge });
  return { o, r: await ask(c, { t: 'pkreg', token, challenge: o.challenge, name, ...reg }, 'pkreg') };
}
async function pkLogin(c, cred, origin, opts = {}) {
  const o = await ask(c, { t: 'pkopt', purpose: 'login' }, '', 'pkopt');
  assert.strictEqual(o.t, 'pkopt', JSON.stringify(o));
  const a = FA.assert(cred, { rpId: o.rpId, origin, challenge: o.challenge, ...opts });
  const dev = kp();
  return { dev, r: await ask(c, { t: 'pklogin', challenge: o.challenge, pk: dev.pk, ...a }, 'pklogin') };
}

test('passkeys: várias por conta, entrar em outro aparelho, revogar e o registro de eventos sem segredos', { skip: H.missing() }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-pk-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const logFile = path.join(dir, 'security.log');
  const srv = await H.startServer({ IDENTITY_FILE: path.join(dir, 'identity.json'), SECURITY_LOG: logFile });
  t.after(() => srv.stop());
  const origin = 'http://localhost:' + srv.port;

  const A = await account(srv.port);
  t.after(() => A.c.ws.close());
  const phone = FA.makeCred('es256'),
    key = FA.makeCred('eddsa');
  const secrets = [A.K, A.id, A.token, phone.cid, key.cid];

  // duas passkeys na mesma conta; a lista não leva chave pública
  const p1 = await addPasskey(A.c, A.token, phone, origin, 'Celular');
  assert.strictEqual(p1.r.t, 'idok', JSON.stringify(p1.r));
  secrets.push(p1.o.challenge);
  const p2 = await addPasskey(A.c, A.token, key, origin, 'Chave física');
  assert.strictEqual(p2.r.list.length, 2);
  assert.deepStrictEqual(p2.r.list.map(p => p.name), ['Celular', 'Chave física']);
  assert.ok(!JSON.stringify(p2.r.list).includes(phone.spki), 'a lista não traz a chave pública');
  // a terceira vez pede para excluir as já cadastradas
  const o3 = await ask(A.c, { t: 'pkopt', purpose: 'reg', token: A.token }, '', 'pkopt');
  assert.deepStrictEqual(o3.exclude.sort(), [phone.cid, key.cid].sort());
  // cadastrar a mesma de novo não duplica
  const dup = await ask(A.c, { t: 'pkreg', token: A.token, challenge: o3.challenge, name: 'x', ...FA.register(phone, { rpId: 'localhost', origin, challenge: o3.challenge }) }, 'pkreg');
  assert.strictEqual(dup.code, 'pk-exists');
  // desafio é de uso único e preso à conexão
  const reuse = await ask(A.c, { t: 'pkreg', token: A.token, challenge: o3.challenge, name: 'x', ...FA.register(FA.makeCred(), { rpId: 'localhost', origin, challenge: o3.challenge }) }, 'pkreg');
  assert.strictEqual(reuse.code, 'challenge');
  // sem sessão não cadastra
  assert.strictEqual((await ask(A.c, { t: 'pkopt', purpose: 'reg', token: 'Z'.repeat(43) }, '', 'pkopt')).code, 'session');

  // outro aparelho, sem nada guardado, entra com a passkey do celular: vira o principal
  const B = await conn(srv.port);
  t.after(() => B.ws.close());
  const closedA = A.c.closed;
  const { dev, r } = await pkLogin(B, phone, origin);
  assert.strictEqual(r.t, 'idok', JSON.stringify(r));
  assert.strictEqual(r.id, A.id);
  assert.strictEqual(r.rpk, A.rec.pk, 'o aparelho novo recebe a chave pública de recuperação (para conferir o código depois)');
  assert.strictEqual(r.gen, 2);
  secrets.push(r.token);
  // a sessão do aparelho antigo caiu e a chave antiga não entra mais
  assert.strictEqual(await Promise.race([closedA, H.wait(3000).then(() => 'aberta')]), 4001);
  const C = await conn(srv.port);
  t.after(() => C.ws.close());
  assert.strictEqual(await login(C, A.id, A.main.priv, 'join'), '', 'a chave do aparelho antigo foi revogada');
  assert.ok(await login(C, A.id, dev.priv, 'join'), 'a chave nova entra');
  // o aparelho novo lista e revoga uma passkey
  const list = await ask(B, { t: 'pklist', token: r.token }, 'pklist');
  assert.strictEqual(list.list.length, 2);
  assert.ok(list.list.find(p => p.cid === phone.cid).used > 0, 'última entrada registrada');
  const del = await ask(B, { t: 'pkdel', token: r.token, cid: key.cid }, 'pkdel');
  assert.deepStrictEqual(del.list.map(p => p.cid), [phone.cid]);
  // a revogada não entra mais (e a resposta é a mesma de uma passkey que nunca existiu)
  const D = await conn(srv.port);
  t.after(() => D.ws.close());
  const gone = await pkLogin(D, key, origin);
  assert.strictEqual(gone.r.code, 'pk-fail');
  const never = await pkLogin(D, FA.makeCred(), origin);
  assert.strictEqual(never.r.code, 'pk-fail');
  assert.strictEqual(never.r.msg, gone.r.msg);

  // endereço por IP não serve para passkey (o navegador também recusaria)
  const E = await conn(srv.port, '');
  t.after(() => E.ws.close());
  assert.strictEqual((await ask(E, { t: 'pkopt', purpose: 'login' }, '', 'pkopt')).code, 'pk-origin');

  // o registro de eventos tem o que aconteceu, sem id, IP, token, desafio nem id de passkey
  await H.wait(100);
  const text = fs.readFileSync(logFile, 'utf8');
  const evs = text.trim().split('\n').map(l => JSON.parse(l));
  const names = evs.map(e => e.ev);
  for (const ev of ['identity.create', 'passkey.add', 'passkey.login', 'passkey.remove', 'passkey.fail'])
    assert.ok(names.includes(ev), 'evento ' + ev);
  for (const v of secrets) assert.ok(!text.includes(v), 'segredo no registro: ' + v.slice(0, 6) + '…');
  assert.ok(!/203\.0\.113/.test(text), 'sem IP');
  const who = evs.find(e => e.ev === 'passkey.login').who;
  assert.ok(evs.filter(e => e.who === who).length >= 4, 'os eventos da mesma conta têm o mesmo código');
});

test('passkeys: força bruta numa conta bloqueia a entrada por passkey dela por um tempo', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const origin = 'http://localhost:' + srv.port;
  const A = await account(srv.port);
  t.after(() => A.c.ws.close());
  const cred = FA.makeCred();
  assert.strictEqual((await addPasskey(A.c, A.token, cred, origin)).r.t, 'idok');
  // assinaturas erradas de várias origens (cada conexão de um IP diferente)
  const wrong = FA.makeCred();
  for (let i = 0; i < 10; i++) {
    const c = await conn(srv.port);
    const o = await ask(c, { t: 'pkopt', purpose: 'login' }, '', 'pkopt');
    const a = FA.assert({ ...wrong, cid: cred.cid }, { rpId: 'localhost', origin, challenge: o.challenge });
    const r = await ask(c, { t: 'pklogin', challenge: o.challenge, pk: kp().pk, ...a }, 'pklogin');
    assert.strictEqual(r.code, 'pk-fail');
    c.ws.close();
  }
  // agora nem a passkey certa entra nesta conta (até a janela passar); o código de recuperação continua valendo
  const c = await conn(srv.port);
  t.after(() => c.ws.close());
  assert.strictEqual((await pkLogin(c, cred, origin)).r.code, 'pk-locked');
  // a mesma conexão não consegue reaproveitar um desafio já usado
  const o = await ask(c, { t: 'pkopt', purpose: 'login' }, '', 'pkopt');
  const a = FA.assert(cred, { rpId: 'localhost', origin, challenge: o.challenge });
  await ask(c, { t: 'pklogin', challenge: o.challenge, pk: kp().pk, ...a }, 'pklogin');
  assert.strictEqual((await ask(c, { t: 'pklogin', challenge: o.challenge, pk: kp().pk, ...a }, 'pklogin')).code, 'challenge');
});

test('passkeys: entrar com a passkey cancela um pedido de recuperação em carência (quem tem a passkey é o dono)', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ IDENTITY_GRACE_MS: '60000' });
  t.after(() => srv.stop());
  const origin = 'http://localhost:' + srv.port;
  const A = await account(srv.port);
  t.after(() => A.c.ws.close());
  const cred = FA.makeCred();
  assert.strictEqual((await addPasskey(A.c, A.token, cred, origin)).r.t, 'idok');
  // alguém com o código pede a recuperação (com a chave de recuperação nova, como o cliente atual)
  const X = await conn(srv.port);
  t.after(() => X.ws.close());
  const rtok = await login(X, A.id, A.rec.priv, 'recover');
  const np = kp(),
    nr = kp();
  const rr = await ask(X, { t: 'idrec', token: rtok, gen: 1, pk: np.pk, rpk: nr.pk, sigRec: sign(A.rec.priv, payload.recover(A.id, 1, np.pk, nr.pk)) }, 'recover', 'idrec');
  assert.strictEqual(rr.pending, true, JSON.stringify(rr));
  // o dono entra com a passkey em outro aparelho: o pedido cai
  const B = await conn(srv.port);
  t.after(() => B.ws.close());
  const { r } = await pkLogin(B, cred, origin);
  assert.strictEqual(r.cancelled, true);
  // quem pediu é desconectado e a sessão de recuperação dele morreu junto (época nova)
  assert.strictEqual(await Promise.race([X.closed, H.wait(3000).then(() => 'aberta')]), 4001);
  const Y = await conn(srv.port);
  t.after(() => Y.ws.close());
  const again = await ask(Y, { t: 'idrec', token: rtok, gen: 2, pk: kp().pk, rpk: kp().pk, sigRec: sign(A.rec.priv, 'x') }, 'recover', 'idrec');
  assert.strictEqual(again.code, 'session');
});

test('validação: o pedido de recuperação sem a chave de recuperação nova é recusado (o código vale uma vez só)', () => {
  const V = require('../lib/validate.js');
  const fn = V.normalizeMessage;
  assert.strictEqual(typeof fn, 'function');
  const base = { t: 'idrec', token: 'T'.repeat(43), gen: 1, pk: kp().pk, sigRec: 'S'.repeat(86) };
  assert.strictEqual(fn(base), null);
  assert.strictEqual(fn({ ...base, rpk: kp().pk }).t, 'idrec');
});
