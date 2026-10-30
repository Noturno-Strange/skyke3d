'use strict';
// Voz privada: com VOICE_PRIVACY=relay (padrão) a sinalização só leva candidatos do TURN, sem IP real; sem TURN a voz fica desligada.
const test = require('node:test');
const assert = require('node:assert');
const H = require('../harness.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const TURN = { TURN_URL: 'turn:turn.exemplo.com:3478', TURN_SECRET: 'segredo-de-teste-123' };

async function pair(srv, t) {
  const a = await H.connect(srv.port, '203.0.113.160'); t.after(() => a.ws.close());
  send(a, { t: 'create', style: 'proxima', bots: 0, name: 'Ana' });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')));
  const b = await H.connect(srv.port, '203.0.113.161'); t.after(() => b.ws.close());
  send(b, { t: 'join', code: a.msgs.find(m => m.t === 'joined').code, name: 'Beto' });
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'joined')));
  return { a, b, ja: a.msgs.find(m => m.t === 'joined'), idB: b.msgs.find(m => m.t === 'joined').id };
}
const SDP = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 'c=IN IP4 198.51.100.9', 'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=rtcp:9 IN IP4 198.51.100.9',
  'a=candidate:1 1 udp 2122260223 192.168.0.10 50000 typ host generation 0',
  'a=candidate:2 1 udp 1686052607 198.51.100.9 50001 typ srflx raddr 192.168.0.10 rport 50000 generation 0',
  'a=candidate:3 1 udp 41885439 203.0.113.250 60000 typ relay raddr 198.51.100.9 rport 50001 generation 0',
  'a=candidate:4 1 udp 2122260223 abcd.local 50002 typ host generation 0', 'a=ice-ufrag:abcd', ''].join('\r\n');

test('voz privada: ICE só com TURN e policy relay; host/srflx somem e o raddr do relay é zerado (inclusive no SDP)', { skip: H.missing() }, async t => {
  const srv = await H.startServer(TURN);
  t.after(() => srv.stop());
  const { a, b, ja, idB } = await pair(srv, t);
  assert.strictEqual(ja.ice.policy, 'relay');
  assert.strictEqual(ja.ice.voice, true);
  assert.ok(ja.ice.iceServers.length === 1 && String(ja.ice.iceServers[0].urls).startsWith('turn:'), 'sem STUN: só o TURN');
  send(a, { t: 'sig', to: idB, data: { d: { type: 'offer', sdp: SDP } } });
  for (const c of ['candidate:1 1 udp 2122260223 192.168.0.10 50000 typ host', 'candidate:2 1 udp 1686052607 198.51.100.9 50001 typ srflx raddr 192.168.0.10 rport 50000',
    'candidate:5 1 udp 1 198.51.100.9 50003 typ prflx', 'candidate:3 1 udp 41885439 203.0.113.250 60000 typ relay raddr 198.51.100.9 rport 50001'])
    send(a, { t: 'sig', to: idB, data: { c: { candidate: c, sdpMid: '0', sdpMLineIndex: 0 } } });
  await H.wait(600);
  const sig = b.msgs.filter(m => m.t === 'sig');
  const offer = sig.find(m => m.data.d);
  assert.ok(offer, 'a oferta chega');
  const raw = JSON.stringify(sig);
  for (const ip of ['192.168.0.10', '198.51.100.9', 'abcd.local']) assert.ok(!raw.includes(ip), 'não vaza ' + ip + ': ' + raw.slice(0, 400));
  assert.ok(offer.data.d.sdp.includes('typ relay raddr 0.0.0.0 rport 0'), 'relay mantido, sem a origem');
  assert.ok(offer.data.d.sdp.includes('c=IN IP4 0.0.0.0') && offer.data.d.sdp.includes('a=rtcp:9 IN IP4 0.0.0.0'));
  assert.ok(offer.data.d.sdp.includes('203.0.113.250'), 'o endereço do TURN pode passar');
  const cands = sig.filter(m => m.data.c);
  assert.strictEqual(cands.length, 1, 'só o candidato relay passa');
  assert.match(cands[0].data.c.candidate, /typ relay raddr 0\.0\.0\.0 rport 0$/);
  const st = await H.request(srv.port, '/');
  assert.strictEqual(st.status, 200);
});

test('voz privada sem TURN: a voz fica desligada e nenhuma sinalização passa', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  assert.match(srv.log(), /Voz desligada/);
  const { a, b, ja, idB } = await pair(srv, t);
  assert.strictEqual(ja.ice.voice, false);
  assert.strictEqual(ja.ice.policy, 'relay');
  send(a, { t: 'sig', to: idB, data: { d: { type: 'offer', sdp: SDP } } });
  await H.wait(400);
  assert.strictEqual(b.msgs.filter(m => m.t === 'sig').length, 0);
});

test('VOICE_PRIVACY=direct: voz direta como antes (STUN, sem filtro)', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ VOICE_PRIVACY: 'direct' });
  t.after(() => srv.stop());
  const { a, b, ja, idB } = await pair(srv, t);
  assert.strictEqual(ja.ice.policy, undefined);
  assert.ok(String(ja.ice.iceServers[0].urls).startsWith('stun:'));
  send(a, { t: 'sig', to: idB, data: { c: { candidate: 'candidate:1 1 udp 1 192.168.0.10 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 } } });
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'sig')));
});
