'use strict';
// Mascote pelo WebSocket e pelo perfil público: autoridade do servidor, dono, limites e persistência.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const H = require('./harness.js');
const { payload } = require('../lib/identity.js');
const { fidOf } = require('../lib/ids.js');
const { pidOf } = require('../lib/pubprofile.js');
const G = require('../lib/pet-genes.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const sign = (priv, data) => crypto.sign('sha256', Buffer.from(data, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');
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
  send(c, { t: 'proof', id, nonce: chl.nonce, sig: sign(main.priv, payload.auth(id, chl.nonce, 'join')), action: 'join' });
  const s = await next(c, m => m.t === 'session');
  c.msgs.length = 0;
  send(c, { t: 'create', style: 'proxima', bots: 0, name, token: s.token });
  await next(c, m => m.t === 'joined');
  return { c, id, pid: pidOf(id) };
}
const get = (srv, pid) => H.request(srv.port, '/profile.json?id=' + pid);
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-pw-')), 'pets.json');

test('mascote: sem identidade autenticada não adota nem age', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.170');
  t.after(() => c.ws.close());
  send(c, { t: 'create', style: 'proxima', bots: 0, name: 'Sem' });
  await next(c, m => m.t === 'joined');
  send(c, { t: 'petadopt', name: 'Bolo' });
  await next(c, m => m.t === 'err' && m.scope === 'pet');
  assert.ok(!c.msgs.some(m => m.t === 'pet'));
});

test('mascote: adotar, cuidar, pedido repetido e nada de seed ou genes vindos do cliente', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.171', 'A', 'Ana');
  t.after(() => a.c.ws.close());

  send(a.c, { t: 'petget' });
  assert.strictEqual((await next(a.c, m => m.t === 'pet')).pet, null, 'ainda não tem');
  a.c.msgs.length = 0;
  // o cliente tenta empurrar seed e genes: o validador descarta tudo que não é o nome
  send(a.c, { t: 'petadopt', name: '  Bolinha ', seed: 'ffffffffffffffff', genes: { sp: 5 }, sd: 'x' });
  const adopted = await next(a.c, m => m.t === 'pet' && m.pet);
  assert.strictEqual(adopted.pet.name, 'Bolinha');
  assert.ok(G.cleanGenes(adopted.pet.genes));
  const txt = JSON.stringify(a.c.msgs);
  assert.ok(!/ffffffffffffffff|"seed"|"sd"/.test(txt), 'a seed nunca chega ao cliente');

  await H.wait(2100); // intervalo mínimo entre adoções
  a.c.msgs.length = 0;
  send(a.c, { t: 'petadopt', name: 'Outro' });
  assert.strictEqual((await next(a.c, m => m.t === 'pet')).err, 'exists');

  await H.wait(450);
  a.c.msgs.length = 0;
  send(a.c, { t: 'petact', a: 'pet', rid: 'pedido0001' });
  const r1 = await next(a.c, m => m.t === 'petres' && m.rid === 'pedido0001');
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.pet.stats.pet, 1);
  await H.wait(450);
  send(a.c, { t: 'petact', a: 'pet', rid: 'pedido0001' });
  await H.wait(300);
  const dups = a.c.msgs.filter(m => m.t === 'petres' && m.rid === 'pedido0001');
  assert.strictEqual(dups.length, 2);
  assert.strictEqual(dups[1].dup, true);
  assert.strictEqual(dups[1].pet.stats.pet, 1, 'repetir o pedido não conta de novo');
  await H.wait(450);
  send(a.c, { t: 'petact', a: 'pet', rid: 'pedido0002' });
  const r3 = await next(a.c, m => m.t === 'petres' && m.rid === 'pedido0002');
  assert.deepStrictEqual([r3.ok, r3.reason], [false, 'cooldown']);
  assert.ok(r3.wait > 0);
});

test('mascote: mensagens malformadas e ações inventadas são descartadas', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.172', 'B', 'Bia');
  t.after(() => a.c.ws.close());
  send(a.c, { t: 'petadopt', name: 'Bolo' });
  await next(a.c, m => m.t === 'pet' && m.pet);
  a.c.msgs.length = 0;
  // o servidor corta quem manda mensagens inválidas em enxurrada (8 em 10 s); aqui vão em dois lotes pequenos
  const lote = ms => ms.forEach(m => send(a.c, m));
  lote([
    { t: 'petact', a: 'matar', rid: 'pedido0001' },
    { t: 'petact', a: '__proto__', rid: 'pedido0001' },
    { t: 'petact', a: 'feed' },
    { t: 'petact', a: 'feed', rid: 'x' },
    { t: 'petadopt', name: 123 },
    { t: 'petdress', c: 9 }
  ]);
  await H.wait(10500);
  lote([{ t: 'petdress', c: 1.5 }, { t: 'petrel' }, { t: 'petrel', sure: 'sim' }, { t: 'petsocial', to: 'xx', k: 'wave' }, { t: 'petsocial', to: 'a'.repeat(20), k: 'matar' }]);
  await H.wait(500);
  assert.ok(!a.c.msgs.some(m => m.t === 'petres' || (m.t === 'pet' && m.released)), 'nada foi executado');
  send(a.c, { t: 'petget' });
  const v = await next(a.c, m => m.t === 'pet');
  assert.strictEqual(v.pet.name, 'Bolo', 'o mascote segue intacto');
  assert.strictEqual(v.pet.stats.total, 0);
});

test('perfil público mostra o mascote (offline também) e nunca as necessidades, a seed ou o id', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.173', 'C', 'Cris');
  send(a.c, { t: 'petadopt', name: 'Pipoca' });
  await next(a.c, m => m.t === 'pet' && m.pet);
  assert.strictEqual((await get(srv, a.pid)).status, 404, 'sem perfil público, o mascote não aparece');
  send(a.c, { t: 'pubp', on: true, bio: 'oi' });
  await next(a.c, m => m.t === 'pubp');
  let r = await get(srv, a.pid);
  assert.strictEqual(r.status, 200);
  const pet = r.json.pet;
  assert.ok(pet && pet.name === 'Pipoca' && G.cleanGenes(pet.genes) && pet.age === 0 && pet.stageName === 'Filhote');
  const raw = JSON.stringify(r.json);
  assert.ok(!/"food"|"energy"|"seed"|"sd"|"cd"/.test(raw) && !raw.includes(a.id), 'nada privado');
  a.c.ws.close();
  await H.wait(500);
  r = await get(srv, a.pid);
  assert.strictEqual(r.json.online, false);
  assert.strictEqual(r.json.pet.name, 'Pipoca', 'o mascote continua no perfil com o dono offline');
});

test('interação social: só em perfis públicos, não altera o mascote e tem espera', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.174', 'D', 'Dani');
  t.after(() => a.c.ws.close());
  const b = await enter(srv, '203.0.113.175', 'E', 'Edu');
  t.after(() => b.c.ws.close());
  send(a.c, { t: 'petadopt', name: 'Nuvem' });
  await next(a.c, m => m.t === 'pet' && m.pet);
  const before = (await (async () => { a.c.msgs.length = 0; send(a.c, { t: 'petget' }); return next(a.c, m => m.t === 'pet'); })()).pet.a;

  send(b.c, { t: 'petsocial', to: a.pid, k: 'wave' });
  assert.strictEqual((await next(b.c, m => m.t === 'petsocial')).reason, 'none', 'perfil desligado: não dá para visitar');
  send(a.c, { t: 'pubp', on: true, bio: '' });
  await next(a.c, m => m.t === 'pubp');
  await H.wait(1100);
  b.c.msgs.length = 0;
  send(b.c, { t: 'petsocial', to: a.pid, k: 'wave' });
  const ok = await next(b.c, m => m.t === 'petsocial');
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.counts.wave, 1);
  await H.wait(1100);
  b.c.msgs.length = 0;
  send(b.c, { t: 'petsocial', to: a.pid, k: 'wave' });
  assert.strictEqual((await next(b.c, m => m.t === 'petsocial')).reason, 'cooldown');
  await H.wait(1100);
  b.c.msgs.length = 0;
  send(b.c, { t: 'petsocial', to: a.pid, k: 'hug' });
  assert.strictEqual((await next(b.c, m => m.t === 'petsocial')).counts.hug, 1);
  await H.wait(1100);
  a.c.msgs.length = 0;
  send(a.c, { t: 'petsocial', to: a.pid, k: 'wave' });
  assert.strictEqual((await next(a.c, m => m.t === 'petsocial')).reason, 'self');

  a.c.msgs.length = 0;
  send(a.c, { t: 'petget' });
  const after = (await next(a.c, m => m.t === 'pet')).pet.a;
  assert.deepStrictEqual(after.food, before.food, 'necessidades não mudam com visitas');
  assert.strictEqual((await get(srv, a.pid)).json.pet.social.wave, 1);
});

test('mascote persiste: reiniciar o servidor mantém aparência, nome, idade e histórico', { skip: H.missing() }, async t => {
  const file = tmp();
  let srv = await H.startServer({ PETS_FILE: file, PROFILES_FILE: '0' });
  let stopped = false;
  const stop = async () => {
    if (!stopped) {
      stopped = true;
      await srv.stop();
    }
  };
  t.after(stop);
  const a = await enter(srv, '203.0.113.176', 'F', 'Fabi');
  send(a.c, { t: 'petadopt', name: 'Mel' });
  const adopted = await next(a.c, m => m.t === 'pet' && m.pet);
  await H.wait(450);
  send(a.c, { t: 'petact', a: 'pet', rid: 'pedido0001' });
  await next(a.c, m => m.t === 'petres' && m.ok);
  a.c.ws.close();
  await H.wait(300);
  await stop();
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(raw.pets[a.pid] && !JSON.stringify(raw).includes(a.id), 'só o código público, nunca o id de identidade');
  assert.deepStrictEqual(G.genesFromSeed(raw.pets[a.pid].sd, raw.pets[a.pid].n), adopted.pet.genes);

  srv = await H.startServer({ PETS_FILE: file, PROFILES_FILE: '0' });
  stopped = false;
  const b = await enter(srv, '203.0.113.177', 'F', 'Fabi');
  send(b.c, { t: 'petget' });
  const v = (await next(b.c, m => m.t === 'pet')).pet;
  assert.deepStrictEqual([v.name, v.stats.pet], ['Mel', 1]);
  assert.deepStrictEqual(v.genes, adopted.pet.genes);
});
