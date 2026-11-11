'use strict';
// Seleção da tecnologia de voz por variável de ambiente: WebSocket é o padrão, WebRTC só quando pedido; valor inválido para o servidor
// com uma mensagem clara; as duas nunca transmitem ao mesmo tempo; falha na voz não derruba o chat.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./harness.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const frame = (seq, codec = 1) => Buffer.from([2, codec, seq, 0xf8, 0xff, 0xfe]);
const voiceOf = c => c.msgs.filter(m => m.t === 'st' && m.bin[0] === 2);
let ipN = 40;
async function room(srv, t, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = await H.connect(srv.port, '203.0.113.' + ipN++);
    t.after(() => c.ws.close());
    if (i === 0) send(c, { t: 'create', style: 'amazora', bots: 0, name: 'Ana' });
    else send(c, { t: 'join', code: out[0].j.code, name: ['Ana', 'Beto', 'Caio'][i] });
    assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined')));
    out.push({ c, j: c.msgs.find(m => m.t === 'joined') });
  }
  return out;
}
/** tenta subir o servidor e devolve a mensagem com que ele recusou a configuração ('' se subiu) */
async function refused(env) {
  try {
    const srv = await H.startServer(env);
    await srv.stop();
    return '';
  } catch (e) {
    return String(e && e.message);
  }
}

test('voz: sem a variável (ou vazia) o servidor usa o WebSocket e avisa o cliente', { skip: H.missing() }, async t => {
  for (const env of [{}, { VOICE_TRANSPORT: '' }, { VOICE_TRANSPORT: '  ' }]) {
    const srv = await H.startServer({ STATUS_TOKEN: 't'.repeat(30), ...env });
    try {
      const [a] = await room(srv, t, 1);
      assert.deepStrictEqual([a.j.ice.ws, a.j.ice.voice, a.j.ice.iceServers], [true, true, []], 'WebSocket, sem servidores ICE: ' + JSON.stringify(env));
      const st = (await H.request(srv.port, '/status.json', { headers: { authorization: 'Bearer ' + 't'.repeat(30), 'x-forwarded-for': '192.0.2.50' } })).json;
      assert.strictEqual(st.voice.transport, 'ws');
      assert.match(srv.log(), /Voz pelo WebSocket \(VOICE_TRANSPORT=ws\)/);
    } finally {
      await srv.stop();
    }
  }
});

test('voz: os valores aceitos não dependem de maiúsculas; "websocket" é o mesmo que "ws"', { skip: H.missing() }, async t => {
  for (const [v, ws] of [['WS', true], ['WebSocket', true], ['WEBRTC', false], [' webrtc ', false]]) {
    const srv = await H.startServer({ VOICE_TRANSPORT: v, VOICE_PRIVACY: 'Direct' });
    try {
      const [a] = await room(srv, t, 1);
      assert.strictEqual(!!a.j.ice.ws, ws, 'VOICE_TRANSPORT=' + v);
      if (!ws) assert.ok(a.j.ice.iceServers.length > 0 && a.j.ice.voice === true, 'malha WebRTC em modo direto: STUN para os navegadores');
    } finally {
      await srv.stop();
    }
  }
});

test('voz: valor inválido não cai calado no padrão: o servidor não sobe e diz o que é aceito', { skip: H.missing() }, async () => {
  const a = await refused({ VOICE_TRANSPORT: 'webrct' });
  assert.match(a, /servidor saiu \(1\)/);
  assert.match(a, /VOICE_TRANSPORT inválido: "webrct"\. Valores aceitos: ws ou webrtc \(padrão: ws\)\./);
  const b = await refused({ VOICE_TRANSPORT: 'udp' });
  assert.match(b, /VOICE_TRANSPORT inválido: "udp"/);
  const c = await refused({ VOICE_PRIVACY: 'publico' });
  assert.match(c, /VOICE_PRIVACY inválido: "publico"\. Valores aceitos: relay ou direct \(padrão: relay\)\./);
  // valor enorme: a mensagem mostra só o começo (nada de despejar a variável inteira no log)
  const d = await refused({ VOICE_TRANSPORT: 'x'.repeat(500) });
  assert.ok(d.includes('"' + 'x'.repeat(40) + '"') && !d.includes('x'.repeat(41)));
});

test('voz: com WebSocket a malha WebRTC fica parada (nenhuma sinalização passa) e a voz chega uma vez só', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  send(b.c, { t: 'vlisten', v: true });
  send(a.c, { t: 'speak', v: true });
  await H.wait(150);
  send(a.c, { t: 'sig', to: b.j.id, data: { d: { type: 'offer', sdp: 'v=0\r\n' } } });
  send(a.c, { t: 'sig', to: b.j.id, data: { c: { candidate: 'candidate:1 1 udp 1 192.0.2.1 9 typ host', sdpMid: '0', sdpMLineIndex: 0 } } });
  for (let i = 0; i < 5; i++) a.c.ws.send(frame(i));
  assert.ok(await H.until(() => voiceOf(b.c).length === 5));
  await H.wait(300);
  assert.strictEqual(voiceOf(b.c).length, 5, 'cada quadro chega uma vez');
  assert.ok(!b.c.msgs.some(m => m.t === 'sig'), 'nenhuma oferta nem candidato WebRTC é repassado');
  assert.strictEqual(voiceOf(a.c).length, 0, 'quem fala não recebe a própria voz de volta');
});

test('voz: com WebRTC o servidor não repassa áudio pelo WebSocket (só a sinalização)', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ VOICE_TRANSPORT: 'webrtc', VOICE_PRIVACY: 'direct', STATUS_TOKEN: 't'.repeat(30) });
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  send(a.c, { t: 'vlisten', v: true });
  send(b.c, { t: 'vlisten', v: true });
  send(a.c, { t: 'speak', v: true });
  await H.wait(150);
  for (let i = 0; i < 20; i++) a.c.ws.send(frame(i));
  send(a.c, { t: 'sig', to: b.j.id, data: { d: { type: 'offer', sdp: 'v=0\r\n' } } });
  assert.ok(await H.until(() => b.c.msgs.some(m => m.t === 'sig')), 'a sinalização passa');
  await H.wait(400);
  assert.strictEqual(voiceOf(b.c).length, 0, 'nenhum quadro de voz sai pelo WebSocket');
  const st = (await H.request(srv.port, '/status.json', { headers: { authorization: 'Bearer ' + 't'.repeat(30), 'x-forwarded-for': '192.0.2.50' } })).json;
  assert.strictEqual(st.voice.transport, 'webrtc');
  assert.deepStrictEqual([st.perf.voice.framesOut, st.perf.voice.bytesOutPerSec], [0, 0], 'banda de voz do servidor: zero');
});

test('voz: quadros estragados e a queda de quem fala não atrapalham o chat nem o resto da sala', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b, c] = await room(srv, t, 3);
  send(b.c, { t: 'vlisten', v: true });
  send(a.c, { t: 'speak', v: true });
  await H.wait(150);
  // lixo no canal de voz: tipo errado, codec que não existe, curto demais e grande demais
  for (const bad of [Buffer.from([9, 1, 0, 1, 2]), Buffer.from([2, 77, 0, 1, 2]), Buffer.from([2, 1]), Buffer.concat([Buffer.from([2, 1, 0]), Buffer.alloc(700)])]) a.c.ws.send(bad);
  a.c.ws.send(frame(1));
  assert.ok(await H.until(() => voiceOf(b.c).length === 1), 'o quadro bom depois do lixo ainda chega');
  await H.wait(800);
  send(a.c, { t: 'chat', text: 'oi, ainda estou aqui' });
  assert.ok(await H.until(() => b.c.msgs.some(m => m.t === 'chat' && m.text === 'oi, ainda estou aqui')), 'o chat de quem mandou lixo continua');
  assert.strictEqual(voiceOf(b.c).length, 1, 'o lixo não foi repassado');
  // quem falava cai no meio da fala: a sala segue conversando
  a.c.ws.terminate();
  await H.wait(800);
  send(c.c, { t: 'chat', text: 'seguimos' });
  assert.ok(await H.until(() => b.c.msgs.some(m => m.t === 'chat' && m.text === 'seguimos')));
  assert.strictEqual(b.c.ws.readyState, 1);
});
