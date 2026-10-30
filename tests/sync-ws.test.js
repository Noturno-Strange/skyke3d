'use strict';
// Sincronia: relógio do servidor (tsync), hora de leitura da posição (at) nos vídeos e no karaokê, e ponto atual para quem chega depois.
const test = require('node:test');
const assert = require('node:assert');
const H = require('../harness.js');
const V = require('../validate.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const got = (c, f) => c.msgs.filter(f);

test('validador: ts opcional e plausível em vsync/ksync; tsync exige número', () => {
  assert.deepStrictEqual(V.normalizeMessage({ t: 'vsync', time: 3, playing: true, ts: 1e12 }), { t: 'vsync', time: 3, playing: true, ts: 1e12 });
  assert.deepStrictEqual(V.normalizeMessage({ t: 'vsync', time: 3, playing: true, ts: 'x' }), { t: 'vsync', time: 3, playing: true }, 'ts inválido é ignorado');
  assert.deepStrictEqual(V.normalizeMessage({ t: 'ksync', time: 3, playing: false, ts: -5 }), { t: 'ksync', time: 3, playing: false });
  assert.deepStrictEqual(V.normalizeMessage({ t: 'tsync', c: 1700000000000 }), { t: 'tsync', c: 1700000000000 });
  for (const c of [undefined, 'a', -1, 0, Infinity, 1e15]) assert.strictEqual(V.normalizeMessage({ t: 'tsync', c }), null, String(c));
});

async function room(srv, t, n) {
  const cl = [];
  for (let i = 0; i < n; i++) {
    const c = await H.connect(srv.port, '203.0.113.' + (120 + i)); t.after(() => c.ws.close()); cl.push(c);
    send(c, i === 0 ? { t: 'create', style: 'proxima', bots: 0, name: 'S' + i } : { t: 'join', code: cl[0].msgs.find(m => m.t === 'joined').code, name: 'S' + i });
    assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined')));
  }
  return cl.map(c => ({ c, id: c.msgs.find(m => m.t === 'joined').id }));
}

test('tsync: o servidor devolve a hora dele junto com a do cliente', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a] = await room(srv, t, 1);
  const c0 = Date.now();
  send(a.c, { t: 'tsync', c: c0 });
  assert.ok(await H.until(() => got(a.c, m => m.t === 'tsync').length === 1));
  const r = got(a.c, m => m.t === 'tsync')[0];
  assert.strictEqual(r.c, c0);
  assert.ok(Math.abs(r.s - Date.now()) < 2000, 'hora do servidor');
});

test('vídeo: a sincronia leva a hora em que o dono leu a posição (at); hora implausível vira a do servidor', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  send(a.c, { t: 'video', vid: 'dQw4w9WgXcQ' });
  assert.ok(await H.until(() => got(b.c, m => m.t === 'vinv').length === 1));
  send(b.c, { t: 'vjoin', by: a.id });
  assert.ok(await H.until(() => got(b.c, m => m.t === 'vsync').length === 1));
  const j = got(b.c, m => m.t === 'vsync')[0];
  assert.ok(typeof j.at === 'number' && typeof j.time === 'number', 'quem entra recebe posição + hora, sem o servidor recalcular');
  await H.wait(250);
  const ts = Date.now() - 800;
  send(a.c, { t: 'vsync', time: 42, playing: true, ts });
  assert.ok(await H.until(() => got(b.c, m => m.t === 'vsync' && m.time === 42).length === 1));
  assert.strictEqual(got(b.c, m => m.t === 'vsync' && m.time === 42)[0].at, ts);
  await H.wait(250);
  send(a.c, { t: 'vsync', time: 50, playing: false, ts: Date.now() + 3600000 });  // relógio do dono adiantado 1 h: ignorado
  assert.ok(await H.until(() => got(b.c, m => m.t === 'vsync' && m.time === 50).length === 1));
  assert.ok(Math.abs(got(b.c, m => m.t === 'vsync' && m.time === 50)[0].at - Date.now()) < 2000);
  await H.wait(250);
  send(a.c, { t: 'vsync', time: 51, playing: true, ts: Date.now() - 60000 });   // velho demais: ignorado
  assert.ok(await H.until(() => got(b.c, m => m.t === 'vsync' && m.time === 51).length === 1));
  assert.ok(Date.now() - got(b.c, m => m.t === 'vsync' && m.time === 51)[0].at < 2000);
});

test('karaokê: sincronia com at e quem entra na fila no meio da música recebe o ponto atual', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b, c] = await room(srv, t, 3);
  send(a.c, { t: 'kjoin', vid: 'dQw4w9WgXcQ' });
  send(b.c, { t: 'kjoin', vid: 'aaaaaaaaaaa' });
  assert.ok(await H.until(() => got(b.c, m => m.t === 'kar' && m.q.length === 2).length > 0));
  const ts = Date.now() - 300;
  send(a.c, { t: 'ksync', time: 12.5, playing: true, ts });
  assert.ok(await H.until(() => got(b.c, m => m.t === 'ksync').length === 1));
  assert.deepStrictEqual(got(b.c, m => m.t === 'ksync')[0], { t: 'ksync', time: 12.5, playing: true, at: ts });
  assert.strictEqual(got(c.c, m => m.t === 'ksync').length, 0, 'quem não está no karaokê não recebe');
  send(c.c, { t: 'kjoin', vid: 'bbbbbbbbbbb' });
  assert.ok(await H.until(() => got(c.c, m => m.t === 'ksync').length === 1), 'quem entra depois recebe a última sincronia');
  assert.strictEqual(got(c.c, m => m.t === 'ksync')[0].at, ts);
  send(b.c, { t: 'ksync', time: 99, playing: true });   // só quem canta sincroniza
  await H.wait(300);
  assert.strictEqual(got(c.c, m => m.t === 'ksync' && m.time === 99).length, 0);
});
