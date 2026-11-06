'use strict';
// Voz pelo WebSocket: formato dos quadros, limite por segundo, quem ouve quem (lib/voicews.js) e o codec ADPCM do cliente.
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const V = require('../lib/voicews.js');

const html = require('./client-source').readClient();
const start = html.indexOf('// ---------- perfil único de áudio (testável) ----------');
const end = html.indexOf('// ---------- fim do núcleo do perfil de áudio ----------');
const cli = vm.runInContext(
  html.slice(start, end) + '\n({adpcmEncode,adpcmDecode,resample,ADPCM_N,ADPCM_RATE,VWS_MS,VWS_KBPS})',
  vm.createContext({ Math, Float32Array, Uint8Array })
);

test('quadro de entrada: tipo 2, codec conhecido, tamanho entre 4 e MAX_FRAME', () => {
  assert.deepStrictEqual(V.parseIn(Buffer.from([2, 1, 7, 9, 9])), { codec: 1, seq: 7, data: Buffer.from([9, 9]) });
  assert.strictEqual(V.parseIn(Buffer.from([1, 1, 7, 9])), null, 'tipo errado');
  assert.strictEqual(V.parseIn(Buffer.from([2, 9, 7, 9])), null, 'codec desconhecido');
  assert.strictEqual(V.parseIn(Buffer.from([2, 1, 7])), null, 'sem dados');
  assert.strictEqual(V.parseIn(Buffer.alloc(V.MAX_FRAME + 1, 2)), null, 'grande demais');
  assert.strictEqual(V.parseIn(/** @type {any} */ ('texto')), null);
});

test('quadro de saída leva o id numérico de quem fala, o codec e a sequência', () => {
  const b = V.packOut('p42', { codec: 2, seq: 200, data: Buffer.from([1, 2, 3]) });
  assert.strictEqual(b[0], 2);
  assert.strictEqual(b.readUInt32LE(1), 42);
  assert.deepStrictEqual([...b.subarray(5)], [2, 200, 1, 2, 3]);
});

test('limite de quadros por segundo descarta o excesso e reabre na janela seguinte', () => {
  const w = { t: 0, n: 0 };
  let ok = 0;
  for (let i = 0; i < V.MAX_FPS + 20; i++) if (V.frameOk(w, 1000)) ok++;
  assert.strictEqual(ok, V.MAX_FPS);
  assert.ok(V.frameOk(w, 2000));
});

const P = (id, o = {}) => ({ id, bot: 0, ready: true, online: true, ws: {}, talk: false, x: 0, z: 0, vlisten: true, vmute: new Set(), ...o });

test('ouvintes: só humanos prontos, ouvindo e que não silenciaram quem fala', () => {
  const a = P('p1', { talk: true }),
    b = P('p2'),
    c = P('p3', { vlisten: false }),
    d = P('p4', { vmute: new Set(['p1']) }),
    e = P('p5', { ready: false }),
    bot = P('b1', { bot: 1 });
  assert.deepStrictEqual(V.listeners([a, b, c, d, e, bot], a).map(p => p.id), ['p2']);
});

test('ouvintes: com mais de MAX_HEAR falando, cada um só recebe as vozes mais próximas', () => {
  const ouvinte = P('p0', { x: 0 });
  const falando = Array.from({ length: V.MAX_HEAR + 2 }, (_, i) => P('p' + (i + 1), { talk: true, x: i + 1 }));
  const todos = [ouvinte, ...falando];
  const ouve = falando.filter(f => V.listeners(todos, f).includes(ouvinte)).map(f => f.id);
  assert.deepStrictEqual(ouve, falando.slice(0, V.MAX_HEAR).map(f => f.id));
});

test('a sala usa Opus só se ninguém informou que não tem', () => {
  assert.strictEqual(V.roomOpus([{ bot: 0, vop: true }, { bot: 0, vop: null }, { bot: 1 }]), true);
  assert.strictEqual(V.roomOpus([{ bot: 0, vop: true }, { bot: 0, vop: false }]), false);
});

test('ADPCM: quadro de 40 ms tem 3 + 320 bytes e volta parecido com o original', () => {
  assert.strictEqual(cli.ADPCM_N, (cli.ADPCM_RATE * cli.VWS_MS) / 1000);
  const n = cli.ADPCM_N,
    f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / cli.ADPCM_RATE);
  const st = { p: 0, i: 0 },
    q = cli.adpcmEncode(f, st);
  assert.strictEqual(q.length, 3 + n / 2);
  assert.ok(q.length + 3 <= V.MAX_FRAME, 'cabe no limite do servidor');
  // o segundo quadro começa do estado em que o primeiro terminou e é decodificado sozinho
  const q2 = cli.adpcmEncode(f, st),
    g = cli.adpcmDecode(q2);
  assert.strictEqual(g.length, n);
  let err = 0,
    pow = 0;
  for (let i = 0; i < n; i++) {
    err += (g[i] - f[i]) ** 2;
    pow += f[i] ** 2;
  }
  assert.ok(10 * Math.log10(pow / err) > 20, 'relação sinal/ruído acima de 20 dB');
  assert.strictEqual(cli.adpcmDecode(new Uint8Array(2)).length, 0, 'quadro curto não quebra');
});

test('reamostragem 44,1 → 48 kHz em blocos mantém a taxa e a continuidade', () => {
  const st = {},
    blocks = 20,
    N = 1024;
  let total = 0,
    last = null,
    jump = 0;
  for (let b = 0; b < blocks; b++) {
    const f = new Float32Array(N);
    for (let i = 0; i < N; i++) f[i] = Math.sin((2 * Math.PI * 200 * (b * N + i)) / 44100);
    const o = cli.resample(f, 44100, 48000, st);
    if (last !== null && o.length) jump = Math.max(jump, Math.abs(o[0] - last));
    if (o.length) last = o[o.length - 1];
    total += o.length;
  }
  assert.ok(Math.abs(total - (blocks * N * 48000) / 44100) < 3, 'quantidade de amostras: ' + total);
  assert.ok(jump < 0.05, 'sem degrau entre blocos: ' + jump);
  const same = new Float32Array([1, 2]);
  assert.notStrictEqual(cli.resample(same, 48000, 48000, {}), same, 'mesma taxa devolve cópia (o buffer do microfone é reaproveitado)');
});
