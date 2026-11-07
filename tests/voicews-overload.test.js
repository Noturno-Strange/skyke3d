'use strict';
// Voz pelo WebSocket sob carga (lib/voicews.js, sem servidor): fila congestionada com histerese, ouvinte lento não atrapalha os outros,
// falha ao mandar para um ouvinte não interrompe o repasse, memória da fila limitada e custo do repasse numa sala cheia.
// São testes locais com conexões falsas: não medem rede real nem substituem um teste de carga com navegadores.
const test = require('node:test');
const assert = require('node:assert');
const V = require('../lib/voicews.js');

const frame = (n = 160) => ({ codec: 1, seq: 1, data: Buffer.alloc(n, 7) });
// conexão falsa: guarda o que recebeu; `drain` = false simula quem não lê (a fila só cresce)
const fakeWs = (drain = true) => {
  const w = { bufferedAmount: 0, got: [], drain };
  return w;
};
const P = (id, o = {}) => ({ id, bot: 0, ready: true, online: true, talk: false, x: 0, z: 0, vlisten: true, vmute: new Set(), vslow: false, ws: fakeWs(), ...o });
const sendTo = (w, buf) => {
  w.got.push(buf);
  if (!w.drain) w.bufferedAmount += buf.length;
};

test('roomy: para acima de VOICE_BUFFER e só volta abaixo de VOICE_RESUME (histerese)', () => {
  const p = { vslow: false };
  assert.strictEqual(V.roomy(p, 0), true);
  assert.strictEqual(V.roomy(p, V.VOICE_BUFFER), true, 'no limite ainda manda');
  assert.strictEqual(V.roomy(p, V.VOICE_BUFFER + 1), false);
  assert.strictEqual(p.vslow, true);
  assert.strictEqual(V.roomy(p, V.VOICE_RESUME + 1), false, 'entre as marcas continua parado');
  assert.strictEqual(V.roomy(p, V.VOICE_RESUME), true, 'a fila baixou: volta');
  assert.strictEqual(p.vslow, false);
  assert.ok(V.VOICE_RESUME < V.VOICE_BUFFER);
  // a voz para bem antes de a conexão ser derrubada por fila cheia (1 MB no server.js)
  assert.ok(V.VOICE_BUFFER <= 1 << 18);
});

test('relay: ouvinte lento perde a voz; os outros recebem tudo, e o mesmo Buffer (sem cópia por ouvinte)', () => {
  const a = P('p1', { talk: true }),
    b = P('p2'),
    c = P('p3'),
    lento = P('p4', { ws: fakeWs(false) });
  const room = [a, b, c, lento];
  let drops = 0;
  for (let i = 0; i < 2000; i++) drops += V.relay(room, a, frame(), sendTo).drop;
  assert.strictEqual(b.ws.got.length, 2000);
  assert.strictEqual(c.ws.got.length, 2000);
  assert.ok(b.ws.got.every((x, i) => x === c.ws.got[i]), 'um Buffer por quadro, compartilhado');
  assert.ok(lento.ws.got.length < 2000 && drops === 2000 - lento.ws.got.length);
  // memória limitada: a fila do lento para logo depois de VOICE_BUFFER (no máximo um quadro a mais)
  assert.ok(lento.ws.bufferedAmount <= V.VOICE_BUFFER + 7 + 160, 'fila ' + lento.ws.bufferedAmount);
  assert.strictEqual(lento.vslow, true);
  // a fila esvaziou: volta a receber
  lento.ws.bufferedAmount = 0;
  const n = lento.ws.got.length;
  V.relay(room, a, frame(), sendTo);
  assert.strictEqual(lento.ws.got.length, n + 1);
  assert.strictEqual(lento.vslow, false);
});

test('relay: erro ao mandar para um ouvinte não impede os demais', () => {
  const a = P('p1', { talk: true }),
    b = P('p2'),
    quebrado = P('p3'),
    c = P('p4');
  const r = V.relay([a, b, quebrado, c], a, frame(), (w, buf) => {
    if (w === quebrado.ws) throw new Error('socket quebrado');
    sendTo(w, buf);
  });
  assert.deepStrictEqual([r.out, r.drop], [2, 1]);
  assert.strictEqual(b.ws.got.length, 1);
  assert.strictEqual(c.ws.got.length, 1);
});

test('relay: desconectado (ws null / offline) não recebe nem quebra o repasse', () => {
  const a = P('p1', { talk: true }),
    b = P('p2'),
    caiu = P('p3', { ws: null, online: false });
  const r = V.relay([a, b, caiu], a, frame(), sendTo);
  assert.strictEqual(r.out, 1);
});

test('relay: duas salas não se misturam, cada uma com o próprio congestionamento', () => {
  const s1 = [P('p1', { talk: true }), P('p2', { ws: fakeWs(false) })],
    s2 = [P('p3', { talk: true }), P('p4')];
  for (let i = 0; i < 1000; i++) {
    V.relay(s1, s1[0], frame(), sendTo);
    V.relay(s2, s2[0], frame(), sendTo);
  }
  assert.strictEqual(s1[1].vslow, true);
  assert.strictEqual(s2[1].ws.got.length, 1000, 'a sala 2 não sente a sala 1 congestionada');
  assert.ok(s2[1].ws.got.every(b => b.readUInt32LE(1) === 3));
});

test('relay: custo numa sala cheia (40 pessoas, todas falando, 1 s de voz) fica muito abaixo de 1 s de CPU', () => {
  const room = Array.from({ length: 40 }, (_, i) => P('p' + (i + 1), { talk: true, x: i % 7, z: (i / 7) | 0 }));
  const noop = () => {};
  const t0 = process.hrtime.bigint();
  let out = 0;
  // 25 quadros por segundo (40 ms) de cada um dos 40
  for (let k = 0; k < 25; k++) for (const p of room) out += V.relay(room, p, frame(), noop).out;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  // cada ouvinte recebe só as MAX_HEAR vozes mais próximas (empates de distância podem somar algumas), nunca as 39
  assert.ok(out >= 25 * 40 * V.MAX_HEAR && out < 25 * 40 * 20, 'repassou ' + out);
  assert.ok(ms < 250, 'levou ' + ms.toFixed(1) + ' ms');
});
