'use strict';
// Fazenda pelo WebSocket e por HTTP: só com identidade, servidor decide, /fazenda e /farm.json só com perfil público, disco.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const H = require('./harness.js');
const C = require('../assets/catalog.js');
const { payload } = require('../lib/identity.js');
const { fidOf } = require('../lib/ids.js');
const { pidOf } = require('../lib/pubprofile.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const sign = (priv, data) => crypto.sign('sha256', Buffer.from(data, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');
const kp = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { pk: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), priv: privateKey };
};
async function next(c, pred, ms = 3000) {
  assert.ok(await H.until(() => c.msgs.some(pred), ms), 'mensagem esperada: ' + String(pred));
  return c.msgs.find(pred);
}
async function enter(srv, ip, ch, name) {
  const c = await H.connect(srv.port, ip);
  const k = ch.repeat(43),
    id = fidOf(k),
    main = kp(),
    rec = kp();
  send(c, { t: 'idreg', k, pk: main.pk, rpk: rec.pk });
  await next(c, m => m.t === 'idok');
  send(c, { t: 'auth', id, action: 'join' });
  const chl = await next(c, m => m.t === 'challenge');
  send(c, { t: 'proof', id, nonce: chl.nonce, sig: sign(main.priv, payload.auth(id, chl.nonce, 'join')), action: 'join' });
  const s = await next(c, m => m.t === 'session');
  c.msgs.length = 0;
  send(c, { t: 'create', style: 'amazora', bots: 0, name, token: s.token, k });
  await next(c, m => m.t === 'joined');
  return { c, id, pid: pidOf(id) };
}
const rid = () => crypto.randomBytes(8).toString('hex');
async function act(c, m) {
  await H.wait(200); // o servidor aceita uma ação a cada 150 ms
  const r = rid();
  send(c, { t: 'farmdo', ...m, rid: r });
  return next(c, x => x.t === 'farmr' && x.rid === r);
}
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-fw-')), 'farm.json');

test('fazenda: sem identidade autenticada não planta', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.210');
  t.after(() => c.ws.close());
  send(c, { t: 'create', style: 'amazora', bots: 0, name: 'Sem' });
  await next(c, m => m.t === 'joined');
  send(c, { t: 'farmdo', k: 'plant', i: 0, c: 'tomate', rid: rid() });
  await next(c, m => m.t === 'err' && m.scope === 'farm');
  assert.ok(!c.msgs.some(m => m.t === 'farmr'));
});

test('fazenda: planta, rega, não colhe antes da hora e recusa semente e canteiro bloqueados', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const { c } = await enter(srv, '203.0.113.211', 'F', 'Roça');
  t.after(() => c.ws.close());
  send(c, { t: 'farmget' });
  const st = await next(c, m => m.t === 'farm');
  assert.strictEqual(st.plots.length, C.FARM_W * C.FARM_H);
  assert.strictEqual(st.open, C.farmPlots(1));
  assert.ok(Math.abs(st.now - Date.now()) < 5000, 'manda o relógio do servidor para as barras');
  const p = await act(c, { k: 'plant', i: 0, c: 'tomate' });
  assert.ok(p.ok && p.state.plots[0].c === 'tomate');
  assert.strictEqual((await act(c, { k: 'plant', i: 0, c: 'cenoura' })).reason, 'ocupado');
  assert.ok((await act(c, { k: 'water', i: 0 })).ok);
  assert.strictEqual((await act(c, { k: 'water', i: 0 })).reason, 'regada');
  assert.strictEqual((await act(c, { k: 'harvest', i: -1 })).reason, 'crescendo');
  assert.strictEqual((await act(c, { k: 'plant', i: 1, c: 'arvore' })).reason, 'nivel');
  assert.strictEqual((await act(c, { k: 'plant', i: C.farmPlots(1), c: 'tomate' })).reason, 'fechado');
  // fora do formato: o servidor nem responde
  c.msgs.length = 0;
  for (const bad of [
    { t: 'farmdo', k: 'plant', i: 99, c: 'tomate', rid: rid() },
    { t: 'farmdo', k: 'plant', i: 1, c: 'ouro', rid: rid() },
    { t: 'farmdo', k: 'dig', i: -1, rid: rid() },
    { t: 'farmdo', k: 'roubar', i: 0, rid: rid() }
  ])
    send(c, bad);
  await H.wait(400);
  assert.ok(!c.msgs.some(m => m.t === 'farmr'));
  // duas ações coladas: a segunda volta como "calma" (não fica sem resposta nem derruba a conexão)
  await H.wait(200);
  const r1 = rid(),
    r2 = rid();
  send(c, { t: 'farmdo', k: 'water', i: 0, rid: r1 });
  send(c, { t: 'farmdo', k: 'water', i: 0, rid: r2 });
  assert.strictEqual((await next(c, x => x.t === 'farmr' && x.rid === r2)).reason, 'calma');
  await next(c, x => x.t === 'farmr' && x.rid === r1);
  const d = await act(c, { k: 'dig', i: 0 });
  assert.ok(d.ok && d.state.plots[0] === null);
});

test('fazenda: /farm.json e /fazenda só com perfil público; o perfil ganha a fazenda sem o caderno inteiro', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.212', 'G', 'Sítio');
  t.after(() => a.c.ws.close());
  await act(a.c, { k: 'plant', i: 3, c: 'morango' });
  assert.strictEqual((await H.request(srv.port, '/farm.json?id=' + a.pid)).status, 404, 'sem perfil público, nada');
  const page = await H.request(srv.port, '/fazenda');
  assert.strictEqual(page.status, 200);
  assert.match(String(page.body), /Fazenda/);
  assert.match(String(page.headers['content-security-policy']), /script-src/);
  send(a.c, { t: 'pubp', on: true, bio: 'oi' });
  await next(a.c, m => m.t === 'pubp');
  const r = await H.request(srv.port, '/farm.json?id=' + a.pid);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers['cache-control'], 'no-store');
  assert.strictEqual(r.json.name, 'Sítio');
  assert.strictEqual(r.json.plots[3].c, 'morango');
  assert.ok(!('done' in r.json) && !JSON.stringify(r.json).includes(a.id), 'nem caderno nem id de identidade');
  const pr = (await H.request(srv.port, '/profile.json?id=' + a.pid)).json;
  assert.strictEqual(pr.farm.rec.planted, 1);
  assert.strictEqual((await H.request(srv.port, '/farm.json?id=zz')).status, 404);
});

test('fazenda: canteiros persistem entre reinícios (0600)', { skip: H.missing() }, async t => {
  const file = tmp();
  let srv = await H.startServer({ FARM_FILE: file });
  const stops = [() => srv.stop()];
  t.after(() => stops.forEach(f => f()));
  let a = await enter(srv, '203.0.113.213', 'H', 'Horta');
  await act(a.c, { k: 'plant', i: -1, c: 'cenoura' });
  a.c.ws.close();
  srv.stop();
  await H.wait(500);
  assert.ok(fs.existsSync(file), 'gravou ao encerrar');
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  srv = await H.startServer({ FARM_FILE: file });
  stops.push(() => srv.stop());
  a = await enter(srv, '203.0.113.214', 'H', 'Horta');
  t.after(() => a.c.ws.close());
  send(a.c, { t: 'farmget' });
  const st = await next(a.c, m => m.t === 'farm');
  assert.strictEqual(st.plots.filter(p => p && p.c === 'cenoura').length, C.farmPlots(1));
  assert.strictEqual(st.rec.planted, C.farmPlots(1));
});
