'use strict';
// Brechas achadas no teste ofensivo: conexões lentas (slowloris), enxurrada de ofertas de voz, nomes que imitam outros ou a equipe.
const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const H = require('./harness.js');
const V = require('../lib/validate.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('nomes: equipe, sistema e variações com números ou letras de outros alfabetos viram "Visitante"', () => {
  for (const n of ['Moderação', 'Moderadora', 'm0d3r4d0r', '4dmin', '5istema', 'МОDERADOR', 'Staff', 'Equipe', 'Oficial', 'Bot'])
    assert.strictEqual(V.normalizeMessage({ t: 'create', style: 'proxima', bots: 0, name: n }).name, 'Visitante', n);
  assert.strictEqual(V.normalizeMessage({ t: 'create', style: 'proxima', bots: 0, name: 'Ana' }).name, 'Ana');
  assert.strictEqual(V.nameKey('Аna'), V.nameKey('Ana'), 'A cirílico conta como A latino');
});

test('nome único: o mesmo nome (ou um que imita com acento, maiúscula ou letra cirílica) é recusado em qualquer sala, com sugestão', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await H.connect(srv.port, '203.0.113.240'); t.after(() => a.ws.close());
  send(a, { t: 'create', style: 'proxima', bots: 0, name: 'Ana' });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')));
  const code = a.msgs.find(m => m.t === 'joined').code;
  for (const [i, nm, how] of [[1, 'Аna', 'join'], [2, 'ÂNA', 'create'], [3, 'a n a', 'join']]) {
    const b = await H.connect(srv.port, '203.0.113.24' + i); t.after(() => b.ws.close());
    send(b, how === 'join' ? { t: 'join', code, name: nm } : { t: 'create', style: 'proxima', bots: 0, name: nm });
    assert.ok(await H.until(() => b.msgs.some(m => m.t === 'err' || m.t === 'joined')), nm);
    const e = b.msgs.find(m => m.t === 'err');
    assert.ok(e && e.field === 'name' && /já está em uso/.test(e.msg), nm + ': ' + JSON.stringify(b.msgs.map(m => m.t)));
    assert.ok(e.sug && e.sug !== nm, 'sugere outro nome');
    assert.ok(!b.msgs.some(m => m.t === 'joined'));
  }
  const c = await H.connect(srv.port, '203.0.113.250'); t.after(() => c.ws.close());
  send(c, { t: 'create', style: 'proxima', bots: 0, name: 'Ana2' });
  assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined')), 'a sugestão funciona');
  send(a, { t: 'leave' });
  await H.wait(300);
  const d = await H.connect(srv.port, '203.0.113.251'); t.after(() => d.ws.close());
  send(d, { t: 'create', style: 'proxima', bots: 0, name: 'ana' });
  assert.ok(await H.until(() => d.msgs.some(m => m.t === 'joined')), 'quem sai libera o nome');
});

test('voz: enxurrada de ofertas para um jogador é cortada (4 a cada 5 s por par)', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ VOICE_PRIVACY: 'direct' });// modo direto: os candidatos de teste não são do tipo relay
  t.after(() => srv.stop());
  const a = await H.connect(srv.port, '203.0.113.250'); t.after(() => a.ws.close());
  send(a, { t: 'create', style: 'proxima', bots: 0, name: 'Alvo' });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')));
  const b = await H.connect(srv.port, '203.0.113.251'); t.after(() => b.ws.close());
  send(b, { t: 'join', code: a.msgs.find(m => m.t === 'joined').code, name: 'Troll' });
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'joined')));
  const to = a.msgs.find(m => m.t === 'joined').id;
  for (let i = 0; i < 40; i++) send(b, { t: 'sig', to, data: { d: { type: 'offer', sdp: 'v=0\r\n' + i } } });
  for (let i = 0; i < 20; i++) send(b, { t: 'sig', to, data: { c: { candidate: 'candidate:' + i, sdpMid: '0', sdpMLineIndex: 0 } } });
  await sleep(600);
  const sig = a.msgs.filter(m => m.t === 'sig');
  assert.strictEqual(sig.filter(m => m.data.d).length, 4, 'só 4 ofertas chegam');
  assert.strictEqual(sig.filter(m => m.data.c).length, 20, 'candidatos de ICE continuam passando');
  assert.strictEqual(b.ws.readyState, 1, 'quem manda não é derrubado (o envio só é descartado)');
});

test('slowloris: um IP não segura mais que RAW_PERIP conexões, e cabeçalho lento é cortado', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ RAW_PERIP: '5' });
  t.after(() => srv.stop());
  const socks = [];
  for (let i = 0; i < 9; i++) { const s = net.connect({ port: srv.port, host: '127.0.0.1', localAddress: '127.0.0.2' }); s.on('error', () => {}); s.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n'); socks.push(s); }
  t.after(() => socks.forEach(s => s.destroy()));
  await sleep(800);
  const open = () => socks.filter(s => !s.destroyed && s.readyState === 'open').length;
  assert.strictEqual(open(), 5, 'acima do limite a conexão é recusada');
  const t0 = Date.now();
  while (open() && Date.now() - t0 < 16000) { socks.forEach(s => { if (!s.destroyed) s.write('X-a: b\r\n'); }); await sleep(500); }
  assert.strictEqual(open(), 0, 'cabeçalho que nunca termina é cortado em ~10 s');
  // o proxy confiável (127.0.0.1) não entra no limite: os outros testes e o teste de carga dependem disso
  const r = await H.request(srv.port, '/');
  assert.strictEqual(r.status, 200);
});
