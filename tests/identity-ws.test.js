'use strict';
// Identidade no WebSocket (Fase 3): registro, desafio-resposta, entrada com token, rotação,
// revogação de sessões, recuperação com carência e migração de nomes.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const H = require('./harness.js');
const { payload } = require('../lib/identity.js');
const { fidOf } = require('../lib/ids.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const key = ch => ch.repeat(43);
const clear = c => (c.msgs.length = 0);

function kp() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { pk: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), priv: privateKey };
}
/** a chave de recuperação nova que todo pedido de recuperação leva (o código usado vale uma vez só) */
const NEWREC = kp();
const sign = (priv, data) =>
  crypto.sign('sha256', Buffer.from(data, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');

async function next(c, pred, ms = 3000) {
  assert.ok(await H.until(() => c.msgs.some(pred), ms), 'mensagem esperada: ' + String(pred));
  return c.msgs.find(pred);
}

async function register(c, k, pk, rpk) {
  clear(c);
  send(c, { t: 'idreg', k, pk, rpk });
  return next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idreg'));
}

async function auth(c, id, priv, action = 'join') {
  clear(c);
  send(c, { t: 'auth', id, action });
  const ch = await next(c, m => m.t === 'challenge');
  send(c, { t: 'proof', id, nonce: ch.nonce, sig: sign(priv, payload.auth(id, ch.nonce, action)), action });
  return next(c, m => m.t === 'session' || (m.t === 'err' && m.scope === 'proof'));
}

const joined = (c, ms) => next(c, m => m.t === 'joined', ms);

test('identidade: registro, prova, entrada com token e recusa da chave antiga', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.60');
  t.after(() => c.ws.close());
  const K = key('A'),
    id = fidOf(K),
    main = kp(),
    rec = kp();

  const reg = await register(c, K, main.pk, rec.pk);
  assert.strictEqual(reg.t, 'idok');
  assert.strictEqual(reg.id, id);
  assert.strictEqual(reg.gen, 1);
  assert.strictEqual(reg.rgen, 1);
  assert.strictEqual(reg.epoch, 0);

  // repetir com as mesmas chaves é idempotente; com outras chaves, recusa
  const again = await register(c, K, main.pk, rec.pk);
  assert.strictEqual(again.existed, true);
  const other = kp();
  const dup = await register(c, K, other.pk, other.pk);
  assert.strictEqual(dup.code, 'exists');

  const s = await auth(c, id, main.priv);
  assert.strictEqual(s.t, 'session');
  assert.strictEqual(s.scope, 'primary');
  assert.strictEqual(s.gen, 1);
  assert.strictEqual(s.epoch, 0);
  assert.match(s.token, /^[A-Za-z0-9_-]{43}$/);

  clear(c);
  send(c, { t: 'create', style: 'amazora', bots: 0, name: 'Ana', token: s.token });
  assert.ok(await joined(c), 'entra com o token');

  // a chave antiga sozinha não entra mais depois do registro
  const d = await H.connect(srv.port, '203.0.113.61');
  t.after(() => d.ws.close());
  clear(d);
  send(d, { t: 'create', style: 'amazora', bots: 0, name: 'Outra', k: K });
  const err = await next(d, m => m.t === 'err');
  assert.strictEqual(err.scope, 'auth');
  assert.strictEqual(err.code, 'registered');
  assert.ok(!d.msgs.some(m => m.t === 'joined'));
});

test('identidade: chave antiga continua entrando enquanto não foi registrada', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.62');
  t.after(() => c.ws.close());
  const K = key('B'),
    id = fidOf(K);

  send(c, { t: 'create', style: 'amazora', bots: 0, name: 'Beto', k: K });
  assert.ok(await joined(c));

  // amigos usam o id derivado da chave antiga
  clear(c);
  send(c, { t: 'friends', k: K, ids: [] });
  const fme = await next(c, m => m.t === 'fme');
  assert.strictEqual(fme.id, id);

  // o desafio para uma identidade não registrada existe, mas a prova falha
  const ghost = kp();
  const bad = await auth(c, id, ghost.priv);
  assert.strictEqual(bad.t, 'err');
  assert.strictEqual(bad.code, 'bad-signature');
});

test('identidade: rotação invalida a chave e o token antigos na hora', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.63');
  t.after(() => c.ws.close());
  const K = key('C'),
    id = fidOf(K),
    main = kp(),
    rec = kp(),
    nextKey = kp();

  await register(c, K, main.pk, rec.pk);
  const s1 = await auth(c, id, main.priv);
  assert.strictEqual(s1.t, 'session');

  const data = payload.rotate(id, 1, nextKey.pk);
  clear(c);
  send(c, {
    t: 'idrot',
    token: s1.token,
    gen: 1,
    pk: nextKey.pk,
    sigOld: sign(main.priv, data),
    sigRec: sign(rec.priv, data)
  });
  const ok = await next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idrot'));
  assert.strictEqual(ok.t, 'idok');
  assert.strictEqual(ok.op, 'rotate');
  assert.strictEqual(ok.gen, 2);
  assert.strictEqual(ok.epoch, 1);
  assert.match(ok.token, /^[A-Za-z0-9_-]{43}$/);

  // o token antigo morreu
  const d = await H.connect(srv.port, '203.0.113.64');
  t.after(() => d.ws.close());
  clear(d);
  send(d, { t: 'create', style: 'amazora', bots: 0, name: 'Dora', token: s1.token });
  const dead = await next(d, m => m.t === 'err');
  assert.strictEqual(dead.scope, 'auth');
  assert.strictEqual(dead.code, 'session');

  // a chave principal antiga não assina mais; a nova sim
  const old = await auth(c, id, main.priv);
  assert.strictEqual(old.t, 'err');
  assert.strictEqual(old.code, 'bad-signature');
  const fresh = await auth(c, id, nextKey.priv);
  assert.strictEqual(fresh.t, 'session');
  assert.strictEqual(fresh.gen, 2);
  assert.strictEqual(fresh.epoch, 1);

  // o token novo entra (conexão nova: `create` tem intervalo mínimo por conexão)
  const e = await H.connect(srv.port, '203.0.113.78');
  t.after(() => e.ws.close());
  send(e, { t: 'create', style: 'amazora', bots: 0, name: 'Dora', token: ok.token });
  assert.ok(await joined(e));
});

test('identidade: revogar sessões derruba as outras conexões e o pedido continua', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const K = key('D'),
    id = fidOf(K),
    main = kp(),
    rec = kp();
  const a = await H.connect(srv.port, '203.0.113.65');
  const b = await H.connect(srv.port, '203.0.113.66');
  t.after(() => a.ws.close());
  t.after(() => b.ws.close());

  await register(a, K, main.pk, rec.pk);
  const ta = await auth(a, id, main.priv);
  const tb = await auth(b, id, main.priv);
  assert.strictEqual(ta.t, 'session');
  assert.strictEqual(tb.t, 'session');

  clear(a);
  send(a, { t: 'create', style: 'amazora', bots: 0, name: 'Ana', token: ta.token });
  assert.ok(await joined(a));
  const code = a.msgs.find(m => m.t === 'joined').code;
  clear(b);
  send(b, { t: 'join', code, name: 'Bia', token: tb.token });
  assert.ok(await joined(b));

  clear(a);
  send(a, {
    t: 'idrev',
    token: ta.token,
    epoch: 0,
    sigOld: sign(main.priv, payload.revoke(id, 0))
  });
  const ok = await next(a, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idrev'));
  assert.strictEqual(ok.t, 'idok');
  assert.strictEqual(ok.op, 'revoke');
  assert.strictEqual(ok.epoch, 1);
  assert.match(ok.token, /^[A-Za-z0-9_-]{43}$/);

  // a outra conexão recebe o aviso e fecha; a do pedido continua
  assert.strictEqual(await b.closed, 4001);
  const kicked = b.msgs.find(m => m.t === 'err' && m.scope === 'identity');
  assert.ok(kicked && kicked.code === 'revoked');
  assert.strictEqual(a.ws.readyState, 1);

  // o token antigo morreu e o novo entra (conexão nova: `create` tem intervalo mínimo por conexão)
  const c = await H.connect(srv.port, '203.0.113.67');
  t.after(() => c.ws.close());
  clear(c);
  send(c, { t: 'create', style: 'amazora', bots: 0, name: 'Caio', token: ta.token });
  const dead = await next(c, m => m.t === 'err');
  assert.strictEqual(dead.code, 'session');
  const e = await H.connect(srv.port, '203.0.113.79');
  t.after(() => e.ws.close());
  send(e, { t: 'create', style: 'amazora', bots: 0, name: 'Caio', token: ok.token });
  assert.ok(await joined(e));
});

test('identidade: reconexão antiga não volta depois da rotação', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const K = key('E'),
    id = fidOf(K),
    main = kp(),
    rec = kp(),
    nextKey = kp();
  const a = await H.connect(srv.port, '203.0.113.68');
  const b = await H.connect(srv.port, '203.0.113.69');
  t.after(() => a.ws.close());

  await register(a, K, main.pk, rec.pk);
  const ta = await auth(a, id, main.priv);
  clear(a);
  send(a, { t: 'create', style: 'amazora', bots: 0, name: 'Ana', token: ta.token });
  assert.ok(await joined(a));
  const code = a.msgs.find(m => m.t === 'joined').code;

  const tb = await auth(b, id, main.priv);
  clear(b);
  send(b, { t: 'join', code, name: 'Bia', token: tb.token });
  const jb = await joined(b);
  const roomToken = jb.token;

  // B cai sem revogar: fica offline e resumível
  b.ws.close();
  await H.wait(150);

  const data = payload.rotate(id, 1, nextKey.pk);
  clear(a);
  send(a, {
    t: 'idrot',
    token: ta.token,
    gen: 1,
    pk: nextKey.pk,
    sigOld: sign(main.priv, data),
    sigRec: sign(rec.priv, data)
  });
  assert.ok(await next(a, m => m.t === 'idok'));

  // a reconexão antiga encontra a época mudada e é recusada
  const r = await H.connect(srv.port, '203.0.113.70');
  t.after(() => r.ws.close());
  clear(r);
  send(r, { t: 'resume', code, token: roomToken });
  const err = await next(r, m => m.t === 'err' && m.scope === 'resume');
  assert.match(err.msg, /identidade mudou/i);
  assert.ok(!r.msgs.some(m => m.t === 'joined'));
});

test('identidade: recuperação com carência, cancelamento e aplicação pelo relógio', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ IDENTITY_GRACE_MS: '60' });
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.71');
  t.after(() => c.ws.close());
  const K = key('F'),
    id = fidOf(K),
    main = kp(),
    rec = kp(),
    newMain = kp(),
    finalMain = kp();

  await register(c, K, main.pk, rec.pk);
  const tr = await auth(c, id, rec.priv, 'recover');
  assert.strictEqual(tr.t, 'session');
  assert.strictEqual(tr.scope, 'recovery');

  // pedido com carência: a principal atual continua valendo
  clear(c);
  send(c, {
    t: 'idrec',
    token: tr.token,
    gen: 1,
    pk: newMain.pk,
    rpk: NEWREC.pk,
    sigRec: sign(rec.priv, payload.recover(id, 1, newMain.pk, NEWREC.pk)),
    grace: 200
  });
  const pending = await next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idrec'));
  assert.strictEqual(pending.t, 'idok');
  assert.strictEqual(pending.pending, true);
  const still = await auth(c, id, main.priv);
  assert.strictEqual(still.t, 'session');
  assert.strictEqual(still.gen, 1);

  // a principal atual cancela
  const tp = await auth(c, id, main.priv);
  clear(c);
  send(c, {
    t: 'idcancel',
    token: tp.token,
    gen: 1,
    sigOld: sign(main.priv, payload.cancelRecovery(id, 1))
  });
  const canceled = await next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idcancel'));
  assert.strictEqual(canceled.t, 'idok');
  assert.strictEqual(canceled.op, 'cancel-recovery');

  // outro pedido, agora sem cancelar: vence e a chave nova passa a valer
  clear(c);
  send(c, {
    t: 'idrec',
    token: tr.token,
    gen: 1,
    pk: finalMain.pk,
    rpk: NEWREC.pk,
    sigRec: sign(rec.priv, payload.recover(id, 1, finalMain.pk, NEWREC.pk)),
    grace: 80
  });
  const pending2 = await next(c, m => m.t === 'idok');
  assert.strictEqual(pending2.pending, true);
  await H.wait(120);
  // a troca vale: as conexões da chave antiga caem (esta incluída) e o aparelho novo entra por outra conexão
  const c2 = await H.connect(srv.port, '203.0.113.79');
  t.after(() => c2.ws.close());
  const applied = await auth(c2, id, finalMain.priv);
  assert.strictEqual(applied.t, 'session');
  assert.strictEqual(applied.gen, 2);
  assert.strictEqual(applied.epoch, 1);
  assert.strictEqual(applied.rgen, 2, 'a chave de recuperação usada foi trocada pela nova');
  assert.strictEqual(await Promise.race([c.closed, H.wait(2000).then(() => 'aberta')]), 4001, 'a sessão da chave antiga caiu');
  const old = await auth(c2, id, main.priv);
  assert.strictEqual(old.t, 'err');
  assert.strictEqual(old.code, 'bad-signature');
});

test('identidade: escopos separados, token inválido e amigos sem chave', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.72');
  t.after(() => c.ws.close());
  const K = key('G'),
    id = fidOf(K),
    main = kp(),
    rec = kp();

  await register(c, K, main.pk, rec.pk);
  const tp = await auth(c, id, main.priv);
  const tr = await auth(c, id, rec.priv, 'recover');

  // token de recuperação não roda a principal nem entra no jogo
  clear(c);
  send(c, { t: 'idrot', token: tr.token, gen: 1, pk: kp().pk, sigOld: 'A'.repeat(86), sigRec: 'A'.repeat(86) });
  const noRot = await next(c, m => m.t === 'err' && m.scope === 'idrot');
  assert.strictEqual(noRot.code, 'session');

  clear(c);
  send(c, { t: 'create', style: 'amazora', bots: 0, name: 'Gabi', token: tr.token });
  const noJoin = await next(c, m => m.t === 'err' && m.scope === 'auth');
  assert.strictEqual(noJoin.code, 'session');

  // token principal não pede recuperação
  clear(c);
  send(c, { t: 'idrec', token: tp.token, gen: 1, pk: kp().pk, rpk: NEWREC.pk, sigRec: 'A'.repeat(86), grace: 0 });
  const noRec = await next(c, m => m.t === 'err' && m.scope === 'idrec');
  assert.strictEqual(noRec.code, 'session');

  // token desconhecido não entra (conexão nova: `create` tem intervalo mínimo por conexão)
  const d = await H.connect(srv.port, '203.0.113.80');
  t.after(() => d.ws.close());
  send(d, { t: 'create', style: 'amazora', bots: 0, name: 'Gabi', token: 'A'.repeat(43) });
  const unknown = await next(d, m => m.t === 'err' && m.scope === 'auth');
  assert.strictEqual(unknown.code, 'session');

  // amigos pela identidade autenticada, sem mandar a chave
  const e = await H.connect(srv.port, '203.0.113.81');
  t.after(() => e.ws.close());
  send(e, { t: 'create', style: 'amazora', bots: 0, name: 'Gabi', token: tp.token });
  assert.ok(await joined(e));
  clear(e);
  send(e, { t: 'friends', ids: [] });
  const fme = await next(e, m => m.t === 'fme');
  assert.strictEqual(fme.id, id);
});

test('identidade: nome antigo migra para o id novo e continua reservado', { skip: H.missing() }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-idws-'));
  const names = path.join(dir, 'names.json');
  const srv = await H.startServer({ NAMES_FILE: names });
  t.after(async () => {
    await srv.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const K = key('H'),
    id = fidOf(K),
    main = kp(),
    rec = kp();

  // entra com a chave antiga e reserva o nome
  const old = await H.connect(srv.port, '203.0.113.73');
  t.after(() => old.ws.close());
  send(old, { t: 'create', style: 'amazora', bots: 0, name: 'Helena', k: K });
  assert.ok(await joined(old));
  old.ws.close();
  await H.wait(150);

  // registra e entra com token + chave antiga: o nome é aceito e migra
  const c = await H.connect(srv.port, '203.0.113.74');
  t.after(() => c.ws.close());
  await register(c, K, main.pk, rec.pk);
  const s = await auth(c, id, main.priv);
  clear(c);
  send(c, { t: 'create', style: 'amazora', bots: 0, name: 'helena', token: s.token, k: K });
  assert.ok(await joined(c), 'o dono antigo continua dono depois do registro');

  // outra identidade não pode usar o mesmo nome
  const otherK = key('I'),
    other = kp();
  const d = await H.connect(srv.port, '203.0.113.75');
  t.after(() => d.ws.close());
  await register(d, otherK, other.pk, other.pk);
  const otherId = fidOf(otherK);
  const sd = await auth(d, otherId, other.priv);
  clear(d);
  send(d, { t: 'create', style: 'amazora', bots: 0, name: 'HELENA', token: sd.token });
  const err = await next(d, m => m.t === 'err');
  assert.strictEqual(err.field, 'name');
  assert.match(err.msg, /já está em uso/);
  assert.ok(!d.msgs.some(m => m.t === 'joined'));
});

test('identidade: registro persiste no arquivo e sobrevive ao reinício', { skip: H.missing() }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-idfile-'));
  const file = path.join(dir, 'identity.json');
  let srv = await H.startServer({ IDENTITY_FILE: file });
  t.after(async () => {
    if (srv) await srv.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const K = key('J'),
    id = fidOf(K),
    main = kp(),
    rec = kp();

  const c = await H.connect(srv.port, '203.0.113.76');
  await register(c, K, main.pk, rec.pk);
  c.ws.close();
  await srv.stop();
  srv = null;

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(raw.ids[id].pk, main.pk);
  assert.strictEqual(raw.ids[id].rpk, rec.pk);
  assert.ok(!JSON.stringify(raw).includes('private'), 'o arquivo não guarda material privado');

  srv = await H.startServer({ IDENTITY_FILE: file });
  const d = await H.connect(srv.port, '203.0.113.77');
  t.after(() => d.ws.close());
  const s = await auth(d, id, main.priv);
  assert.strictEqual(s.t, 'session');
  assert.strictEqual(s.gen, 1);
  clear(d);
  send(d, { t: 'create', style: 'amazora', bots: 0, name: 'Juca', token: s.token });
  assert.ok(await joined(d));
});

// SK-01: quem decide a carência é o servidor. Antes, `grace: 0` (que o próprio cliente mandava) aplicava a troca da chave principal
// na hora, só com a chave de recuperação, e o dono não tinha janela para cancelar.
test('identidade: o cliente não consegue encurtar a carência da recuperação (grace 0 vira o mínimo do servidor)', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ IDENTITY_GRACE_MS: '4000' });
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.120');
  t.after(() => c.ws.close());
  const K = key('H'),
    id = fidOf(K),
    main = kp(),
    rec = kp(),
    atk = kp();
  await register(c, K, main.pk, rec.pk);
  const tr = await auth(c, id, rec.priv, 'recover');
  assert.strictEqual(tr.scope, 'recovery');

  // quem só tem a chave de recuperação pede grace 0: continua pendente, e a chave antiga segue valendo
  clear(c);
  send(c, { t: 'idrec', token: tr.token, gen: 1, pk: atk.pk, rpk: NEWREC.pk, sigRec: sign(rec.priv, payload.recover(id, 1, atk.pk, NEWREC.pk)), grace: 0 });
  const r0 = await next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idrec'));
  assert.strictEqual(r0.t, 'idok');
  assert.strictEqual(r0.pending, true, 'grace 0 não aplica a troca na hora');
  assert.ok(r0.until - Date.now() > 2500, 'vale o mínimo do servidor (4 s), não o pedido do cliente: ' + (r0.until - Date.now()));
  const stillOld = await auth(c, id, main.priv);
  assert.strictEqual(stillOld.t, 'session', 'a chave principal antiga continua valendo durante a carência');
  assert.strictEqual(stillOld.gen, 1);
  const atkTry = await auth(c, id, atk.priv);
  assert.strictEqual(atkTry.t, 'err', 'a chave nova do atacante ainda não vale');

  // o dono é avisado ao entrar: a sessão traz o pedido pendente e a hora em que ele passa a valer
  assert.ok(stillOld.pending && stillOld.pending.until === r0.until, 'a sessão avisa do pedido de recuperação pendente');
  // o pedido repetido (mesma chave) é idempotente e não reinicia a carência
  clear(c);
  const tr2 = await auth(c, id, rec.priv, 'recover');
  send(c, { t: 'idrec', token: tr2.token, gen: 1, pk: atk.pk, rpk: NEWREC.pk, sigRec: sign(rec.priv, payload.recover(id, 1, atk.pk, NEWREC.pk)), grace: 1 });
  const again = await next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idrec'));
  assert.strictEqual(again.pending, true);
  assert.strictEqual(again.until, r0.until, 'repetir o pedido não estende nem reinicia a carência');

  // o dono cancela e o aviso some
  const tp = await auth(c, id, main.priv);
  clear(c);
  send(c, { t: 'idcancel', token: tp.token, gen: 1, sigOld: sign(main.priv, payload.cancelRecovery(id, 1)) });
  assert.strictEqual((await next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idcancel'))).op, 'cancel-recovery');
  const clean = await auth(c, id, main.priv);
  assert.strictEqual(clean.pending, undefined, 'sem pedido pendente, a sessão não traz aviso');

  // o cliente pode pedir MAIS carência que o mínimo (nunca menos)
  const tr3 = await auth(c, id, rec.priv, 'recover');
  clear(c);
  send(c, { t: 'idrec', token: tr3.token, gen: 1, pk: atk.pk, rpk: NEWREC.pk, sigRec: sign(rec.priv, payload.recover(id, 1, atk.pk, NEWREC.pk)), grace: 60000 });
  const longer = await next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idrec'));
  assert.ok(longer.until - Date.now() > 50000, 'carência maior que o mínimo é respeitada');
});

test('identidade: com IDENTITY_GRACE_MS=0 o operador libera a recuperação imediata (escolha explícita)', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ IDENTITY_GRACE_MS: '0' });
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.121');
  t.after(() => c.ws.close());
  const K = key('I'),
    id = fidOf(K),
    main = kp(),
    rec = kp(),
    next1 = kp();
  await register(c, K, main.pk, rec.pk);
  const tr = await auth(c, id, rec.priv, 'recover');
  clear(c);
  send(c, { t: 'idrec', token: tr.token, gen: 1, pk: next1.pk, rpk: NEWREC.pk, sigRec: sign(rec.priv, payload.recover(id, 1, next1.pk, NEWREC.pk)) });
  const done = await next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idrec'));
  assert.strictEqual(done.pending, undefined);
  assert.strictEqual(done.gen, 2, 'aplicada na hora porque o operador configurou carência 0');
});

// SK-13: o desafio não pode revelar se um id existe (gen/rgen/epoch de um id já rotacionado diferiam dos de um id inexistente)
test('identidade: o desafio de um id existente e o de um id inexistente têm o mesmo formato', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.122');
  t.after(() => c.ws.close());
  const K = key('J'),
    id = fidOf(K),
    main = kp(),
    rec = kp();
  await register(c, K, main.pk, rec.pk);
  const s1 = await auth(c, id, main.priv);
  // rotaciona a principal: gen e epoch passam a ser diferentes dos valores padrão
  const np = kp();
  clear(c);
  send(c, { t: 'idrot', token: s1.token, gen: 1, pk: np.pk, sigOld: sign(main.priv, payload.rotate(id, 1, np.pk)), sigRec: sign(rec.priv, payload.rotate(id, 1, np.pk)) });
  await next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idrot'));
  clear(c);
  send(c, { t: 'auth', id, action: 'join' });
  const known = await next(c, m => m.t === 'challenge');
  clear(c);
  send(c, { t: 'auth', id: 'abcdefghijkl', action: 'join' });
  const unknown = await next(c, m => m.t === 'challenge');
  assert.deepStrictEqual(Object.keys(known).sort(), Object.keys(unknown).sort(), 'mesmos campos para id existente e inexistente');
  for (const f of ['gen', 'rgen', 'epoch']) assert.strictEqual(known[f], undefined, f + ' não vai no desafio');
});

// SK-02: registrar custa (prova de trabalho que sobe sob pressão) e tem teto diário por origem.
const { solve: solveReg } = require('../lib/idpow.js');

test('identidade: o registro exige prova de trabalho; a prova vale só para aqueles dados', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ IDENTITY_POW: '10' });
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.130');
  t.after(() => c.ws.close());
  const K = key('K'),
    main = kp(),
    rec = kp();

  const semProva = await register(c, K, main.pk, rec.pk);
  assert.strictEqual(semProva.t, 'err');
  assert.strictEqual(semProva.code, 'pow');
  assert.strictEqual(semProva.bits, 10, 'o servidor diz a dificuldade exigida');

  clear(c);
  send(c, { t: 'idreg', k: K, pk: main.pk, rpk: rec.pk, pow: '0' });
  const errada = await next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idreg'));
  assert.strictEqual(errada.code, 'pow', 'prova que não confere é recusada');

  const pow = solveReg(K, main.pk, rec.pk, 10);
  clear(c);
  send(c, { t: 'idreg', k: K, pk: main.pk, rpk: rec.pk, pow });
  const ok = await next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idreg'));
  assert.strictEqual(ok.t, 'idok');
  assert.strictEqual(ok.id, fidOf(K));

  // a mesma prova não serve para outra identidade (outra chave do aparelho)
  clear(c);
  send(c, { t: 'idreg', k: key('L'), pk: main.pk, rpk: rec.pk, pow });
  const outra = await next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idreg'));
  assert.strictEqual(outra.code, 'pow');

  // quem já registrou (mesmas chaves) repete o pedido sem pagar de novo
  clear(c);
  send(c, { t: 'idreg', k: K, pk: main.pk, rpk: rec.pk });
  const jaTem = await next(c, m => m.t === 'idok' || (m.t === 'err' && m.scope === 'idreg'));
  assert.strictEqual(jaTem.t, 'idok');
  assert.strictEqual(jaTem.existed, true);
});

test('identidade: a dificuldade sobe quando muita gente se registra ao mesmo tempo', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ IDENTITY_POW: '4', IDENTITY_POW_MAX: '12' });
  t.after(() => srv.stop());
  // 30 registros no último minuto (de origens diferentes) elevam a base de 4 para 8 bits
  for (let i = 0; i < 30; i++) {
    const c = await H.connect(srv.port, '198.51.100.' + (10 + i));
    const k = key('abcdefghijklmnopqrstuvwxyzABCDE'[i] || 'z'),
      m = kp(),
      r = kp();
    send(c, { t: 'idreg', k: k + String.fromCharCode(65 + (i % 26)).repeat(0), pk: m.pk, rpk: r.pk, pow: solveReg(k, m.pk, r.pk, 4) });
    const ok = await next(c, x => x.t === 'idok' || (x.t === 'err' && x.scope === 'idreg'));
    assert.strictEqual(ok.t, 'idok', 'registro ' + i + ': ' + JSON.stringify(ok));
    c.ws.close();
  }
  const c = await H.connect(srv.port, '198.51.100.99');
  t.after(() => c.ws.close());
  const r = await register(c, key('Z'), kp().pk, kp().pk);
  assert.strictEqual(r.code, 'pow');
  assert.strictEqual(r.bits, 8, 'com 30 registros no minuto a exigência sobe 4 bits');
});

test('identidade: teto diário de contas novas por origem', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ IDENTITY_POW: '0', IDENTITY_REG_DAY: '3' });
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.131');
  t.after(() => c.ws.close());
  for (let i = 0; i < 3; i++) assert.strictEqual((await register(c, key(String.fromCharCode(97 + i)), kp().pk, kp().pk)).t, 'idok');
  const quarta = await register(c, key('d'), kp().pk, kp().pk);
  assert.strictEqual(quarta.code, 'limit', 'a quarta conta do dia desta origem é recusada');
  // outra origem não é afetada
  const d = await H.connect(srv.port, '203.0.113.132');
  t.after(() => d.ws.close());
  assert.strictEqual((await register(d, key('e'), kp().pk, kp().pk)).t, 'idok');
  // IPv6: o teto vale por bloco /48, não por /64
  const v1 = await H.connect(srv.port, '2001:db8:aaaa:1::1');
  const v2 = await H.connect(srv.port, '2001:db8:aaaa:2::1');
  t.after(() => {
    v1.ws.close();
    v2.ws.close();
  });
  assert.strictEqual((await register(v1, key('f'), kp().pk, kp().pk)).t, 'idok');
  assert.strictEqual((await register(v1, key('g'), kp().pk, kp().pk)).t, 'idok');
  assert.strictEqual((await register(v2, key('h'), kp().pk, kp().pk)).t, 'idok');
  assert.strictEqual((await register(v2, key('i'), kp().pk, kp().pk)).code, 'limit', 'outro /64 do mesmo /48 divide o teto');
});

test('identidade: o painel mostra quantas identidades existem e quantas nunca autenticaram', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: 'token-do-painel-12345', IDENTITY_POW: '0' });
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.133');
  t.after(() => c.ws.close());
  const K = key('M'),
    main = kp(),
    rec = kp();
  await register(c, K, main.pk, rec.pk);
  await register(c, key('N'), kp().pk, kp().pk);
  const before = await H.request(srv.port, '/status.json', { headers: { authorization: 'Bearer token-do-painel-12345' } });
  assert.strictEqual(before.json.identity.count, 2);
  assert.strictEqual(before.json.identity.unused, 2);
  await auth(c, fidOf(K), main.priv);
  await H.wait(2200); // /status.json guarda a resposta por 2 s
  const after = await H.request(srv.port, '/status.json', { headers: { authorization: 'Bearer token-do-painel-12345' } });
  assert.strictEqual(after.json.identity.unused, 1, 'quem autenticou deixa de contar como sem uso');
  assert.strictEqual(after.json.identity.pow, 0);
  assert.ok(after.json.identity.max >= 100);
});
