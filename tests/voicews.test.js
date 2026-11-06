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
  html.slice(start, end) + '\n({adpcmEncode,adpcmDecode,resample,ADPCM_N,ADPCM_RATE,VWS_MS,VWS_KBPS,VAGC,agcNew,agcApply,jitStep,fadeIn,VWS_JIT,VWS_JMIN,VWS_JMAX})',
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
  const w = { t: 0, n: 0, b: 0 };
  let ok = 0;
  for (let i = 0; i < V.MAX_FPS + 20; i++) if (V.frameOk(w, 1000, 10)) ok++;
  assert.strictEqual(ok, V.MAX_FPS);
  assert.ok(V.frameOk(w, 2000, 10));
  // teto de bytes: quadros grandes param antes do teto de quantidade
  const wb = { t: 0, n: 0, b: 0 };
  let okb = 0;
  for (let i = 0; i < V.MAX_FPS; i++) if (V.frameOk(wb, 1000, 500)) okb++;
  assert.strictEqual(okb, Math.floor(V.MAX_BPS / 500));
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

const tone = (amp, n = 1024) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * 300 * i) / 48000));
const rms = f => Math.sqrt(f.reduce((a, x) => a + x * x, 0) / f.length);
const peak = f => f.reduce((a, x) => Math.max(a, Math.abs(x)), 0);

test('nivelador: voz baixa sobe até perto do alvo em poucos segundos, sem passar do teto de ganho', () => {
  const st = cli.agcNew();
  let out;
  for (let i = 0; i < 200; i++) out = cli.agcApply(st, tone(0.02)); // ~4 s de uma voz a -37 dBFS de pico
  assert.ok(Math.abs(rms(out) - cli.VAGC.target) < 0.02, 'nível final ' + rms(out));
  assert.ok(st.g <= cli.VAGC.max);
  const muito = cli.agcNew();
  for (let i = 0; i < 400; i++) cli.agcApply(muito, tone(0.0035));
  assert.ok(muito.g <= cli.VAGC.max + 1e-9, 'teto de ganho');
});

test('nivelador: voz alta desce rápido e nada passa de 1 (limitador suave)', () => {
  const st = cli.agcNew();
  const first = cli.agcApply(st, tone(0.9));
  assert.ok(peak(first) <= 1, 'primeiro bloco já limitado: ' + peak(first));
  for (let i = 0; i < 20; i++) cli.agcApply(st, tone(0.9));
  assert.ok(st.g < cli.VAGC.min * 1.05, 'em ~0,4 s o ganho já caiu até o piso: ' + st.g);
  assert.ok(st.g >= cli.VAGC.min);
});

test('nivelador: silêncio não mexe no ganho e não vira ruído alto', () => {
  const st = cli.agcNew();
  for (let i = 0; i < 100; i++) cli.agcApply(st, tone(0.02));
  const g = st.g;
  const out = cli.agcApply(st, tone(0.0005));
  assert.strictEqual(st.g, g, 'ganho segurado no silêncio');
  assert.ok(peak(out) < 0.01);
  assert.strictEqual(cli.agcApply(st, new Float32Array(0)).length, 0);
});

test('reamostragem 48 → 16 kHz filtra os agudos (sem chiado de aliasing) e mantém a voz', () => {
  const run = hz => {
    const st = {};
    let out = [];
    for (let b = 0; b < 30; b++) {
      const f = Float32Array.from({ length: 1024 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * (b * 1024 + i)) / 48000));
      out = out.concat([...cli.resample(f, 48000, 16000, st)]);
    }
    return rms(Float32Array.from(out.slice(2000)));
  };
  // sem filtro, um tom de 12 kHz voltaria como 4 kHz (bem audível) com ~0,35
  assert.ok(run(12000) < 0.01, 'tom de 12 kHz quase some: ' + run(12000));
  assert.ok(run(10000) < 0.04, 'tom de 10 kHz bem atenuado: ' + run(10000));
  assert.ok(run(1000) > 0.3, 'voz (1 kHz) passa: ' + run(1000));
});

test('folga de reprodução: cresce com faltas no meio da fala, não cresce entre falas, encolhe com a rede estável', () => {
  const v = { next: 0, jit: cli.VWS_JIT, rx: 0, ok: 0 };
  let r = cli.jitStep(v, 10, 100, 0.04);
  assert.ok(r.restart, 'primeiro quadro recomeça');
  assert.strictEqual(v.jit, cli.VWS_JIT, 'começo de fala não conta como falta');
  v.next = 10; // a fila acabou
  r = cli.jitStep(v, 10.5, 100.05, 0.04); // outro quadro 50 ms depois: falta de verdade
  assert.ok(r.restart);
  assert.ok(Math.abs(v.jit - (cli.VWS_JIT + 0.04)) < 1e-9);
  for (let i = 0; i < 20; i++) {
    v.next = 20;
    cli.jitStep(v, 20.5 + i, 100.1 + i * 0.05, 0.04); // quadros a cada 50 ms, mas a fila sempre vazia
  }
  assert.strictEqual(v.jit, cli.VWS_JMAX, 'teto');
  v.next = 30;
  cli.jitStep(v, 31, 200, 0.04); // muito tempo sem quadros: nova fala
  assert.strictEqual(v.jit, cli.VWS_JMAX, 'pausa entre falas não aumenta');
  for (let i = 0; i < 25 * 600; i++) {
    v.next = 40 + 0.1;
    cli.jitStep(v, 40, 300 + i * 0.04, 0.04);
  }
  assert.strictEqual(v.jit, cli.VWS_JMIN, 'rede estável encolhe até o piso');
});

test('fade de entrada suaviza o começo sem mexer no resto', () => {
  const f = new Float32Array(200).fill(1);
  cli.fadeIn(f, 96);
  assert.strictEqual(f[0], 0);
  assert.ok(f[48] > 0.4 && f[48] < 0.6);
  assert.strictEqual(f[150], 1);
});

test('worklet do microfone: junta blocos de 128 amostras em blocos de 1024, em ordem, sem perder nem repetir', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'mic-worklet.js'), 'utf8');
  const sent = [];
  let Proc = null;
  const sandbox = {
    Float32Array,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { postMessage: d => sent.push(d) };
      }
    },
    registerProcessor: (name, C) => {
      assert.strictEqual(name, 'mic-tap');
      Proc = C;
    }
  };
  vm.runInContext(src, vm.createContext(sandbox));
  const p = new Proc();
  let k = 0;
  for (let b = 0; b < 20; b++) {
    const ch = Float32Array.from({ length: 128 }, () => k++);
    assert.strictEqual(p.process([[ch]]), true);
  }
  assert.strictEqual(p.process([[]]), true, 'sem entrada não quebra');
  assert.strictEqual(sent.length, 2, '20 × 128 = 2560 amostras = 2 blocos de 1024 (o resto espera)');
  for (let i = 0; i < 2048; i++) assert.strictEqual(sent[i >> 10][i & 1023], i);
});
