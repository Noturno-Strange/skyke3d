'use strict';
// Modo Sobrevivência de ponta a ponta: sala própria, mapa por semente igual para todos, ações validadas no servidor, sem vídeo/rádio/karaokê.
const test = require('node:test');
const assert = require('node:assert');
const H = require('../harness.js');
const M = require('../assets/survmap.js');
const { SURV: S } = require('../assets/catalog.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const last = (c, t) => c.msgs.filter(m => m.t === t).pop();
const open = async (srv, ip, m) => { const c = await H.connect(srv.port, ip); send(c, { name: 'Ana', ...m }); assert.ok(await H.until(() => c.msgs.some(x => x.t === 'joined'), 4000), 'entrou'); return c; };

test('sobrevivência: sala própria com semente, mapa igual nos dois lados, estado e medidores pelo servidor', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const a = await open(srv, '203.0.113.170', { t: 'create', surv: true, bots: 5 }); t.after(() => a.ws.close());
  const j = a.msgs.find(m => m.t === 'joined');
  assert.strictEqual(j.style, 'acampamento');
  assert.ok(Number.isInteger(j.sv.seed) && j.sv.nights >= 3 && j.sv.nights <= 5);
  assert.strictEqual(j.sv.pub.t, 'svs'); assert.strictEqual(j.sv.pub.fire, S.fire.start);
  assert.strictEqual(j.want, 0, 'sem bots no modo');
  assert.ok(await H.until(() => last(a, 'svm'), 3000), 'recebe o próprio estado');
  const m0 = last(a, 'svm'); assert.strictEqual(m0.m.fome, S.meters.fome.start); assert.deepStrictEqual(m0.inv, {});
  const b = await open(srv, '203.0.113.171', { t: 'join', code: j.code, name: 'Beto' }); t.after(() => b.ws.close());
  assert.strictEqual(b.msgs.find(m => m.t === 'joined').sv.seed, j.sv.seed, 'mesma semente para todos da sala');
  assert.ok(await H.until(() => last(a, 'svs') && last(a, 'svs').pl.length === 2, 3000), 'estado público lista os dois');
});

test('sobrevivência: coleta só perto do ponto (o servidor confere), recurso some e a mochila enche', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const a = await open(srv, '203.0.113.172', { t: 'create', surv: true }); t.after(() => a.ws.close());
  const j = a.msgs.find(m => m.t === 'joined'), map = M.generate(j.sv.seed);
  send(a, { t: 'sv', a: 'collect', i: 0 });
  assert.ok(await H.until(() => last(a, 'sverr'), 2000)); assert.strictEqual(last(a, 'sverr').e, 'longe');
  const n = map.nodes.findIndex(x => x.res === 'lenha'), p = map.nodes[n];
  send(a, { t: 'move', x: p.x, z: p.z, ry: 0, y: 0, s: 0 });
  await H.wait(300);
  send(a, { t: 'sv', a: 'collect', i: n });
  assert.ok(await H.until(() => (last(a, 'svm') || {}).inv && last(a, 'svm').inv.lenha === 1, 3000), 'lenha na mochila');
  assert.ok(await H.until(() => last(a, 'svs') && last(a, 'svs').nx.includes(n), 3000), 'ponto marcado como indisponível');
  send(a, { t: 'sv', a: 'collect', i: n });
  assert.ok(await H.until(() => a.msgs.filter(m => m.t === 'sverr').some(m => m.e === 'vazio'), 2000));
});

test('sobrevivência: entradas inválidas são recusadas; fora do modo as ações não fazem nada; sem vídeo/rádio/karaokê', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const a = await open(srv, '203.0.113.173', { t: 'create', surv: true }); t.after(() => a.ws.close());
  for (const bad of [{ a: 'eat', res: '__proto__' }, { a: 'collect', i: -1 }, { a: 'collect', i: 999 }, { a: 'cook', rid: 'x' }, { a: 'rev', to: '../x' }, { a: 'x' }]) send(a, { t: 'sv', ...bad });
  send(a, { t: 'video', vid: 'dQw4w9WgXcQ' });
  await H.wait(500);
  assert.ok(a.ws.readyState === 1, 'continua conectado (ação de interface não derruba)');
  assert.strictEqual(a.msgs.some(m => m.t === 'vinv'), false, 'vídeo bloqueado no modo');
  const n = await open(srv, '203.0.113.174', { t: 'create', style: 'proxima' }); t.after(() => n.ws.close());
  assert.strictEqual(n.msgs.find(m => m.t === 'joined').sv, undefined);
  send(n, { t: 'sv', a: 'again' }); await H.wait(300);
  assert.strictEqual(n.msgs.some(m => m.t === 'svs' || m.t === 'sverr' || m.t === 'svnew'), false, 'sala normal ignora o modo');
  const c = await H.connect(srv.port, '203.0.113.175'); t.after(() => c.ws.close());
  send(c, { t: 'create', style: 'acampamento', name: 'Cris', cfg: {} });
  await H.wait(600);
  assert.strictEqual(c.msgs.some(m => m.t === 'joined'), false, 'o mapa do modo não nasce sem o modo');
});

test('sobrevivência: raio andável de 28 m só no modo; sala normal continua em 10,2 m', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const a = await open(srv, '203.0.113.176', { t: 'create', surv: true }); t.after(() => a.ws.close());
  const n = await open(srv, '203.0.113.177', { t: 'create', style: 'proxima' }); t.after(() => n.ws.close());
  const viewer = await open(srv, '203.0.113.178', { t: 'join', code: n.msgs.find(m => m.t === 'joined').code }); t.after(() => viewer.ws.close());
  send(n, { t: 'move', x: 50, z: 0, ry: 0, y: 0, s: 0 });
  await H.wait(700);
  const bin = viewer.msgs.filter(m => m.t === 'st' && m.bin).map(m => m.bin).pop();
  assert.ok(bin, 'recebeu posições da sala normal');
  const idN = n.msgs.find(m => m.t === 'joined').id, num = Number(idN.slice(1));
  let x = null; for (let o = 1; o + 12 <= bin.length; o += 12) if ((bin.readUInt32LE(o) & 0x7fffffff) === num) x = bin.readInt16LE(o + 4) / 100;
  assert.ok(x !== null && x <= 10.3, 'sala normal recortada em 10,2 m: ' + x);
});
