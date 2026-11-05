'use strict';
// Culinária pelo WebSocket: só com identidade, perto da fogueira, servidor decide a receita, alimento bloqueado até a primeira vez.
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
  send(c, { t: 'create', style: 'proxima', bots: 0, name, token: s.token, k });
  await next(c, m => m.t === 'joined');
  return { c, id, pid: pidOf(id) };
}
const rid = () => crypto.randomBytes(8).toString('hex');
const R = id => C.RECIPE[id];
const cookMsg = id => ({ t: 'cookdo', m: R(id).m, g: R(id).g, rid: rid() });
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-cw-')), 'cook.json');

test('culinária: sem identidade autenticada não cozinha e o alimento de receita continua bloqueado', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.180');
  t.after(() => c.ws.close());
  send(c, { t: 'create', style: 'proxima', bots: 0, name: 'Sem' });
  await next(c, m => m.t === 'joined');
  send(c, cookMsg('batata_assada'));
  await next(c, m => m.t === 'err' && m.scope === 'cook');
  send(c, { t: 'item', item: 'batata_assada' });
  await H.wait(300);
  assert.ok(!c.msgs.some(m => m.t === 'cookr' || m.t === 'item'), 'nem receita nem alimento bloqueado');
});

test('culinária: o servidor acha a receita, exige a fogueira por perto e desbloqueia o alimento só depois', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.181', 'A', 'Cozi');
  t.after(() => a.c.ws.close());

  send(a.c, { t: 'cookget' });
  const st0 = await next(a.c, m => m.t === 'cook');
  assert.strictEqual(st0.lv, 1);
  assert.deepStrictEqual(st0.done, {});
  a.c.msgs.length = 0;

  // alimento de receita bloqueado: o servidor ignora, mesmo que o cliente peça
  send(a.c, { t: 'item', item: 'batata_assada' });
  await H.wait(300);
  assert.ok(!a.c.msgs.some(m => m.t === 'item'), 'bloqueado antes da primeira receita');
  // itens livres continuam funcionando
  send(a.c, { t: 'item', item: 'pizza' });
  await next(a.c, m => m.t === 'item' && m.item === 'pizza');
  a.c.msgs.length = 0;

  // longe da fogueira
  send(a.c, { t: 'move', x: 9, z: 1.2, ry: 0, y: 0, s: 0 });
  await H.wait(150);
  const far = cookMsg('batata_assada');
  send(a.c, far);
  const r0 = await next(a.c, m => m.t === 'cookr' && m.rid === far.rid);
  assert.deepStrictEqual([r0.ok, r0.reason], [false, 'longe']);
  assert.ok(!a.c.msgs.some(m => m.t === 'cook'), 'nada foi gravado');

  // perto: combinação que não existe não vira nada
  send(a.c, { t: 'move', x: 1, z: 2, ry: 0, y: 0, s: 0 });
  await H.wait(1300);
  const bad = { t: 'cookdo', m: 'assar', g: ['batata', 'sal'], rid: rid() };
  send(a.c, bad);
  assert.strictEqual((await next(a.c, m => m.t === 'cookr' && m.rid === bad.rid)).reason, 'nada');
  // mensagem malformada (ingrediente que não existe, repetido) é descartada pelo validador
  const nResp = a.c.msgs.filter(m => m.t === 'cookr').length;
  send(a.c, { t: 'cookdo', m: 'assar', g: ['batata', 'veneno'], rid: rid() });
  send(a.c, { t: 'cookdo', m: 'assar', g: ['batata', 'batata'], rid: rid() });
  await H.wait(300);
  assert.strictEqual(a.c.msgs.filter(m => m.t === 'cookr').length, nResp, 'mensagens malformadas não geram resposta');

  // a receita certa
  await H.wait(1300);
  const ok = cookMsg('batata_assada');
  send(a.c, ok);
  const r1 = await next(a.c, m => m.t === 'cookr' && m.rid === ok.rid && m.ok);
  assert.strictEqual(r1.recipe, 'batata_assada');
  assert.strictEqual(r1.first, true);
  assert.deepStrictEqual(r1.state.done, { batata_assada: 1 });
  assert.ok(r1.badges.some(b => b.id === 'aprendiz'));

  // agora o alimento está desbloqueado e entra na mão, e some depois de comer
  a.c.msgs.length = 0;
  send(a.c, { t: 'item', item: 'batata_assada' });
  await next(a.c, m => m.t === 'item' && m.item === 'batata_assada' && !m.use);
  await H.wait(300);
  send(a.c, { t: 'item', item: 'batata_assada', use: 1 });
  await next(a.c, m => m.t === 'item' && m.use === 1);

  // os pedidos têm intervalo mínimo: dois seguidos não passam de uma vez
  const q1 = cookMsg('milho_brasa'),
    q2 = cookMsg('sopa_legumes');
  await H.wait(1300);
  send(a.c, q1);
  send(a.c, q2);
  await next(a.c, m => m.t === 'cookr' && m.rid === q1.rid);
  await H.wait(200);
  assert.ok(!a.c.msgs.some(m => m.t === 'cookr' && m.rid === q2.rid), 'o segundo pedido colado foi contido');
});

test('culinária: progresso persiste entre reinícios e os emblemas aparecem no perfil público, sem vazar nada', { skip: H.missing() }, async t => {
  const file = tmp();
  let srv = await H.startServer({ COOK_FILE: file, PROFILES_FILE: '0' });
  const stops = [() => srv.stop()];
  t.after(() => stops.forEach(f => f()));
  let a = await enter(srv, '203.0.113.182', 'B', 'Chef');
  send(a.c, { t: 'pubp', on: true, bio: 'oi' });
  await next(a.c, m => m.t === 'pubp');
  send(a.c, cookMsg('milho_brasa'));
  await next(a.c, m => m.t === 'cookr' && m.ok);
  const pr = (await H.request(srv.port, '/profile.json?id=' + a.pid)).json;
  assert.ok(pr.badges.some(b => b.id === 'aprendiz' && b.icon), 'emblema de cozinheiro no perfil público');
  assert.ok(!JSON.stringify(pr).includes('milho_brasa') && !('xp' in pr), 'receitas e experiência não vão para o perfil');
  a.c.ws.close();
  srv.stop();
  await H.wait(500);
  assert.ok(fs.existsSync(file), 'gravou ao encerrar');
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  srv = await H.startServer({ COOK_FILE: file, PROFILES_FILE: '0' });
  stops.push(() => srv.stop());
  a = await enter(srv, '203.0.113.183', 'B', 'Chef');
  t.after(() => a.c.ws.close());
  send(a.c, { t: 'cookget' });
  const st = await next(a.c, m => m.t === 'cook');
  assert.deepStrictEqual(st.done, { milho_brasa: 1 }, 'a receita feita continua desbloqueada depois de reiniciar');
  assert.ok(st.xp >= 30 && st.badges.find(b => b.id === 'aprendiz').on);
  send(a.c, { t: 'item', item: 'milho_brasa' });
  await next(a.c, m => m.t === 'item' && m.item === 'milho_brasa');
});
