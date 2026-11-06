'use strict';
// Voz pelo WebSocket (padrão): o servidor repassa quadros só de quem está falando, só para quem está ouvindo e não silenciou quem fala,
// troca a sala para ADPCM quando alguém não tem Opus e ignora a sinalização WebRTC.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./harness.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const frame = (seq, codec = 1) => Buffer.from([2, codec, seq, 0xf8, 0xff, 0xfe]);
const voiceOf = c => c.msgs.filter(m => m.t === 'st' && m.bin[0] === 2).map(m => m.bin);

async function room(srv, t, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = await H.connect(srv.port, '203.0.113.' + (170 + i));
    t.after(() => c.ws.close());
    if (i === 0) send(c, { t: 'create', style: 'amazora', bots: 0, name: 'Ana' });
    else send(c, { t: 'join', code: out[0].j.code, name: ['Ana', 'Beto', 'Caio', 'Duda'][i] });
    assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined')));
    out.push({ c, j: c.msgs.find(m => m.t === 'joined') });
  }
  return out;
}

test('voz pelo WebSocket: o joined avisa o modo; quadros chegam só a quem ouve e não silenciou', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b, c] = await room(srv, t, 3);
  assert.strictEqual(a.j.ice.ws, true);
  assert.strictEqual(a.j.ice.voice, true);
  assert.strictEqual(a.j.vopus, true);
  send(b.c, { t: 'vlisten', v: true });
  // todos ficam sabendo que B está ouvindo (👂 no nome); repetir o mesmo estado não gera aviso
  assert.ok(await H.until(() => a.c.msgs.some(m => m.t === 'vl' && m.id === b.j.id && m.v === true)));
  send(b.c, { t: 'vlisten', v: true });
  await H.wait(150);
  assert.strictEqual(a.c.msgs.filter(m => m.t === 'vl').length, 1, 'sem aviso repetido');
  // quem entra depois recebe o estado na lista de jogadores
  const d = await H.connect(srv.port, '203.0.113.179');
  t.after(() => d.ws.close());
  send(d, { t: 'join', code: a.j.code, name: 'Duda' });
  assert.ok(await H.until(() => d.msgs.some(m => m.t === 'joined')));
  assert.strictEqual(d.msgs.find(m => m.t === 'joined').players.find(p => p.id === b.j.id).vl, true);
  // C não está ouvindo (microfone desligado)

  // sem 'speak' antes, o quadro é descartado
  a.c.ws.send(frame(1));
  await H.wait(200);
  assert.strictEqual(voiceOf(b.c).length, 0, 'quem não está falando não transmite');

  send(a.c, { t: 'speak', v: true });
  await H.wait(100);
  a.c.ws.send(frame(2));
  assert.ok(await H.until(() => voiceOf(b.c).length === 1));
  const q = voiceOf(b.c)[0];
  assert.strictEqual('p' + q.readUInt32LE(1), a.j.id, 'leva o id de quem fala');
  assert.deepStrictEqual([...q.subarray(5)], [1, 2, 0xf8, 0xff, 0xfe]);
  await H.wait(150);
  assert.strictEqual(voiceOf(c.c).length, 0, 'quem não está ouvindo não recebe');
  assert.strictEqual(voiceOf(a.c).length, 0, 'quem fala não recebe a própria voz');

  // B silencia A: o servidor para de mandar
  send(b.c, { t: 'vmute', id: a.j.id, v: true });
  await H.wait(100);
  a.c.ws.send(frame(3));
  await H.wait(200);
  assert.strictEqual(voiceOf(b.c).length, 1, 'silenciado não chega');
  send(b.c, { t: 'vmute', id: a.j.id, v: false });
  await H.wait(100);
  a.c.ws.send(frame(4));
  assert.ok(await H.until(() => voiceOf(b.c).length === 2), 'voltou a ouvir');

  // quadro malformado não derruba ninguém
  a.c.ws.send(Buffer.from([2, 77, 1, 1]));
  a.c.ws.send(Buffer.alloc(700, 2));
  await H.wait(150);
  assert.strictEqual(a.c.ws.readyState, 1);
  assert.strictEqual(voiceOf(b.c).length, 2);
});

test('voz pelo WebSocket: excesso de quadros é descartado sem derrubar a conexão', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  send(b.c, { t: 'vlisten', v: true });
  send(a.c, { t: 'speak', v: true });
  await H.wait(150);
  for (let i = 0; i < 120; i++) a.c.ws.send(frame(i & 255));
  await H.wait(500);
  const n = voiceOf(b.c).length;
  assert.ok(n > 0 && n <= 2 * 50, 'repassou ' + n);
  assert.strictEqual(a.c.ws.readyState, 1);
  assert.ok(!a.c.msgs.some(m => m.t === 'sys' && /desconectado|encerrada/.test(m.text)));
});

test('voz pelo WebSocket: alguém sem Opus troca a sala para ADPCM; quando sai, volta', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  send(a.c, { t: 'vcap', opus: true });
  send(b.c, { t: 'vcap', opus: false });
  assert.ok(await H.until(() => a.c.msgs.some(m => m.t === 'vcodec' && m.opus === false)));
  // 'leave' tira da sala na hora (fechar a conexão abriria a janela de reconexão)
  send(b.c, { t: 'leave' });
  assert.ok(await H.until(() => a.c.msgs.some(m => m.t === 'vcodec' && m.opus === true)), 'volta ao Opus');
});

test('voz pelo WebSocket: a sinalização WebRTC é ignorada', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  send(a.c, { t: 'sig', to: b.j.id, data: { d: { type: 'offer', sdp: 'v=0\r\n' } } });
  await H.wait(300);
  assert.ok(!b.c.msgs.some(m => m.t === 'sig'));
});

test('voz pelo WebSocket: o painel /status mostra o modo e os medidores da voz', { skip: H.missing() }, async t => {
  const TOKEN = 'token-de-teste-1234567890';
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  send(b.c, { t: 'vlisten', v: true });
  send(a.c, { t: 'speak', v: true });
  await H.wait(150);
  for (let i = 0; i < 10; i++) a.c.ws.send(frame(i));
  assert.ok(await H.until(() => voiceOf(b.c).length === 10));
  await H.wait(1200); // o painel soma de segundo em segundo
  const st = (await H.request(srv.port, '/status.json', { headers: { authorization: 'Bearer ' + TOKEN, 'x-forwarded-for': '192.0.2.50' } })).json;
  assert.strictEqual(st.voice.transport, 'ws');
  const v = st.perf.voice;
  assert.strictEqual(v.framesIn, 10);
  assert.strictEqual(v.framesOut, 10);
  assert.ok(v.inPerSec > 0 && v.outPerSec > 0 && v.bytesOutPerSec > 0, JSON.stringify(v));
  assert.strictEqual(v.talking, 1);
  assert.strictEqual(v.listening, 1);
  assert.strictEqual(v.dropped60, 0);
});

test('voz pelo WebSocket: enxurrada de mensagens binárias derruba a conexão', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a] = await room(srv, t, 1);
  for (let i = 0; i < 400; i++) a.c.ws.send(Buffer.from([2, 1, i & 255, 0]));
  assert.strictEqual(await Promise.race([a.c.closed, H.wait(3000).then(() => 'aberta')]), 1008);
});

test('voz pelo WebSocket: o teto de bytes por segundo corta quadros grandes demais em sequência', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  send(b.c, { t: 'vlisten', v: true });
  send(a.c, { t: 'speak', v: true });
  await H.wait(150);
  const big = Buffer.alloc(590, 1);
  big[0] = 2;
  big[1] = 2;
  for (let i = 0; i < 40; i++) a.c.ws.send(big); // 40 × 590 B ≈ 23 KB em menos de 1 s
  await H.wait(500);
  const n = voiceOf(b.c).length;
  assert.ok(n >= 15 && n <= 21, 'repassou ' + n + ' (12 KB/s ÷ 590 B ≈ 20)');
  assert.strictEqual(a.c.ws.readyState, 1, 'teto de bytes descarta, não derruba');
});
