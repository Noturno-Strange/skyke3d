'use strict';
// Página pública /estatisticas: sem token, só agregados, com CSP por hash e sem nenhum dado de jogador.
const test = require('node:test');
const assert = require('node:assert');
const H = require('../harness.js');

test('estatísticas: página e JSON públicos, só números, CSP com hash do script inline', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const page = await H.request(srv.port, '/estatisticas');
  assert.strictEqual(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.ok(!/noindex/i.test(String(page.headers['x-robots-tag'] || '')), 'pública e indexável');
  const html = page.body.toString('utf8');
  assert.ok(!/<script[^>]+src=/.test(html) && !/onclick=/.test(html), 'sem script externo nem atributo de evento');
  assert.match(page.headers['content-security-policy'], /script-src[^;]*'sha384-/, 'script inline liberado só por hash');
  const j = await H.request(srv.port, '/estatisticas.json');
  assert.strictEqual(j.status, 200);
  const d = JSON.parse(j.body.toString('utf8'));
  assert.deepStrictEqual(Object.keys(d).sort(), ['apples', 'at', 'avgPlayers', 'avgSec', 'bestNights', 'bestSec', 'causes', 'cooked', 'days', 'dishes', 'faints', 'lit', 'live', 'meals', 'records', 'runs', 'today', 'worlds'].sort());
  assert.strictEqual(d.days.length, 30); assert.strictEqual(d.runs, 0); assert.deepStrictEqual(d.live, { rooms: 0, players: 0 });
  const head = await H.request(srv.port, '/estatisticas.json', { method: 'HEAD' }); assert.strictEqual(head.status, 200);
  const post = await H.request(srv.port, '/estatisticas.json', { method: 'POST', body: {} }); assert.strictEqual(post.status, 405);
});

test('estatísticas: "jogando agora" conta só salas do modo; SURVIVAL=0 desliga página e JSON', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const mk = async (ip, m) => { const c = await H.connect(srv.port, ip); c.ws.send(JSON.stringify({ name: 'Ana', ...m })); assert.ok(await H.until(() => c.msgs.some(x => x.t === 'joined'), 4000)); return c; };
  const a = await mk('203.0.113.190', { t: 'create', surv: true }); t.after(() => a.ws.close());
  const n = await mk('203.0.113.191', { t: 'create', style: 'proxima' }); t.after(() => n.ws.close());
  const d = JSON.parse((await H.request(srv.port, '/estatisticas.json')).body.toString('utf8'));
  assert.deepStrictEqual(d.live, { rooms: 1, players: 1 });
  const off = await H.startServer({ SURVIVAL: '0' }); t.after(() => off.stop());
  assert.strictEqual((await H.request(off.port, '/estatisticas')).status, 404);
  assert.strictEqual((await H.request(off.port, '/estatisticas.json')).status, 404);
  const c = await H.connect(off.port, '203.0.113.192'); t.after(() => c.ws.close());
  c.ws.send(JSON.stringify({ t: 'create', surv: true, name: 'Ana', cfg: {} }));
  assert.ok(await H.until(() => c.msgs.some(m => m.t === 'err'), 3000), 'recusa criar sala do modo');
});
