'use strict';
// Estado das posições: pacote binário (12 bytes por jogador), 5 por segundo, só com quem mudou.
const test = require('node:test');
const assert = require('node:assert');
const H = require('../harness.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
function unpack(b) {
  const out = [];
  assert.strictEqual(b[0], 1, 'tipo 1 = estado');
  assert.strictEqual((b.length - 1) % 12, 0, '12 bytes por jogador');
  for (let o = 1; o + 12 <= b.length; o += 12) {
    const u = b.readUInt32LE(o);
    out.push({ id: (u & 0x80000000 ? 'b' : 'p') + (u & 0x7fffffff), x: b.readInt16LE(o + 4) / 100, z: b.readInt16LE(o + 6) / 100, r: b.readInt16LE(o + 8) / 10000, y: b[o + 10] / 100, s: b[o + 11] });
  }
  return out;
}

test('estado: binário de 12 bytes por jogador, 5 por segundo, com posição, giro, altura e sentado', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await H.connect(srv.port, '203.0.113.150'); t.after(() => a.ws.close());
  send(a, { t: 'create', style: 'proxima', bots: 1, name: 'Ana' });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')));
  const b = await H.connect(srv.port, '203.0.113.151'); t.after(() => b.ws.close());
  send(b, { t: 'join', code: a.msgs.find(m => m.t === 'joined').code, name: 'Beto' });
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'joined')));
  send(a, { t: 'ready' }); send(b, { t: 'ready' });
  const idA = a.msgs.find(m => m.t === 'joined').id;
  send(a, { t: 'move', x: 1.234, z: -2.5, ry: 4, y: .5, s: 1 });
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'st' && m.bin && unpack(m.bin).some(e => e.id === idA)), 4000), 'Beto recebe a posição da Ana');
  const e = b.msgs.filter(m => m.t === 'st' && m.bin).map(m => unpack(m.bin)).flat().reverse().find(x => x.id === idA);
  assert.ok(Math.abs(e.x - 1.23) < .011 && Math.abs(e.z + 2.5) < .011, 'posição em centímetros');
  assert.ok(Math.abs(e.r - Math.atan2(Math.sin(4), Math.cos(4))) < .001, 'giro normalizado em (-π, π]');
  assert.strictEqual(e.y, .5); assert.strictEqual(e.s, 1);
  assert.ok(b.msgs.filter(m => m.t === 'st' && m.bin).some(m => unpack(m.bin).some(x => x.id.startsWith('b'))), 'bots também vão no pacote');
  // frequência: ~5 pacotes por segundo enquanto alguém se move
  const n0 = b.msgs.filter(m => m.t === 'st').length, t0 = Date.now();
  const iv = setInterval(() => send(a, { t: 'move', x: Math.random() * 4, z: Math.random() * 3, ry: 0, y: 0, s: 0 }), 100);
  await H.wait(2000); clearInterval(iv);
  const rate = (b.msgs.filter(m => m.t === 'st').length - n0) / ((Date.now() - t0) / 1000);
  assert.ok(rate >= 3.5 && rate <= 6, 'cerca de 5 pacotes/s, veio ' + rate.toFixed(1));
  assert.strictEqual(b.msgs.filter(m => m.t === 'st' && !m.bin).length, 0, 'nada de estado em JSON');
});
