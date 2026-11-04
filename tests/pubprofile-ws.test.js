'use strict';
// Perfil público pelo WebSocket e por HTTP: ligar, ler, desligar, sair, privacidade e limites.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const H = require('./harness.js');
const { payload } = require('../lib/identity.js');
const { fidOf } = require('../lib/ids.js');
const { pidOf } = require('../lib/pubprofile.js');

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
async function enter(srv, ip, ch, name) {
  const c = await H.connect(srv.port, ip);
  const K = ch.repeat(43),
    id = fidOf(K),
    main = kp(),
    rec = kp();
  send(c, { t: 'idreg', k: K, pk: main.pk, rpk: rec.pk });
  await next(c, m => m.t === 'idok');
  send(c, { t: 'auth', id, action: 'join' });
  const chl = await next(c, m => m.t === 'challenge');
  send(c, {
    t: 'proof',
    id,
    nonce: chl.nonce,
    sig: sign(main.priv, payload.auth(id, chl.nonce, 'join')),
    action: 'join'
  });
  const s = await next(c, m => m.t === 'session');
  c.msgs.length = 0;
  send(c, { t: 'create', style: 'proxima', bots: 0, name, token: s.token });
  await next(c, m => m.t === 'joined');
  return { c, id };
}
const get = (srv, pid) => H.request(srv.port, '/profile.json?id=' + pid);

test('perfil público: liga, aparece em /profile.json, desliga e some', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const { c, id } = await enter(srv, '203.0.113.120', 'P', 'Luna');
  t.after(() => c.ws.close());
  const pid = pidOf(id);

  assert.strictEqual((await get(srv, pid)).status, 404, 'desligado por padrão');

  c.msgs.length = 0;
  send(c, { t: 'pubp', on: true, bio: 'Oi! <b>sou</b> a Luna' });
  const ok = await next(c, m => m.t === 'pubp');
  assert.strictEqual(ok.pp, pid);
  const r = await get(srv, pid);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers['cache-control'], 'no-store');
  assert.strictEqual(r.json.name, 'Luna');
  assert.strictEqual(r.json.online, true);
  assert.strictEqual(r.json.bio, 'Oi! bsou/b a Luna');
  assert.match(r.json.look.skin, /^#[0-9a-f]{6}$/i);
  // nada que identifique a pessoa além do que ela escolheu
  assert.deepStrictEqual(Object.keys(r.json).sort(), ['bio', 'look', 'name', 'online', 'seenAt']);
  assert.ok(!JSON.stringify(r.json).includes(id));

  await H.wait(400); // intervalo mínimo entre mensagens de perfil
  send(c, { t: 'pubp', on: false });
  await next(c, m => m.t === 'pubp' && m.on === 0);
  assert.strictEqual((await get(srv, pid)).status, 404);
});

test('perfil público: quem entra depois recebe o id na sala e, ao sair, o perfil fica offline', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.121', 'Q', 'Ana');
  const pid = pidOf(a.id);
  send(a.c, { t: 'pubp', on: true, bio: '' });
  await next(a.c, m => m.t === 'pubp');

  const code = a.c.msgs.find(m => m.t === 'joined').code;
  const b = await H.connect(srv.port, '203.0.113.122');
  t.after(() => b.ws.close());
  send(b, { t: 'join', code, name: 'Beto' });
  const j = await next(b, m => m.t === 'joined');
  const all = JSON.stringify(j);
  assert.ok(all.includes(pid), 'o resumo dos jogadores traz o id público de quem ligou');
  assert.ok(!all.includes(a.id), 'e nunca o id de identidade');

  a.c.ws.close();
  await H.wait(500);
  const r = await get(srv, pid);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.online, false);
  assert.ok(r.json.seenAt > 0);
});

test('perfil público: id inválido, limite de consultas e página sem script externo', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  assert.strictEqual((await get(srv, '../../etc/passwd')).status, 404);
  assert.strictEqual((await get(srv, '')).status, 404);
  const page = await H.request(srv.port, '/profile');
  assert.strictEqual(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.headers['x-robots-tag'], /noindex/);
  const html = page.body.toString('utf8');
  assert.ok(!/<script[^>]+src=/i.test(html), 'sem script externo');
  assert.ok(!/innerHTML|document\.write|eval\(/.test(html), 'só textContent');
  const js = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  const h = "'sha384-" + crypto.createHash('sha384').update(js, 'utf8').digest('base64') + "'";
  assert.ok(page.headers['content-security-policy'].includes(h), 'hash do script na CSP');
  let limited = 0;
  for (let i = 0; i < 70; i++) if ((await get(srv, 'a'.repeat(20))).status === 429) limited++;
  assert.ok(limited > 0, 'consultas em excesso levam 429');
});

test('perfil público: sem identidade autenticada não liga', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.123');
  t.after(() => c.ws.close());
  send(c, { t: 'create', style: 'proxima', bots: 0, name: 'Sem' });
  await H.wait(500);
  send(c, { t: 'pubp', on: true, bio: 'x' });
  await H.wait(300);
  assert.ok(!c.msgs.some(m => m.t === 'pubp' && m.on === 1));
});
