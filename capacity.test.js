'use strict';
// Capacidade: tetos de projeto, validação, estimativa e arquivo de configuração (módulo puro).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('./capacity.js');

test('validate: aceita o padrão e os extremos permitidos', () => {
  assert.deepStrictEqual(C.validate(75, 25), { ok: true, rooms: 75, perRoom: 25 });
  assert.ok(C.validate(C.ABS.minRooms, C.ABS.minPerRoom).ok);
  assert.ok(C.validate(C.ABS.maxPlayers / C.ABS.maxPerRoom, C.ABS.maxPerRoom).ok, '75 × 40 = 3000 no teto de jogadores');
  assert.ok(C.validate(C.ABS.maxRooms, C.ABS.maxPlayers / C.ABS.maxRooms).ok, '150 × 20 = 3000');
});

test('validate: recusa fora dos tetos, não inteiros, texto e o teto total de jogadores', () => {
  for (const [r, p] of [[0, 25], [151, 10], [75, 1], [75, 41], [1.5, 10], [10, 2.5], ['75', 25], [75, '25'], [null, 25], [75, undefined], [NaN, 25], [Infinity, 25], [-3, 25]])
    assert.strictEqual(C.validate(r, p).ok, false, JSON.stringify([r, p]));
  const over = C.validate(100, 40);
  assert.strictEqual(over.ok, false);
  assert.match(over.erro, /3000/);
});

test('o padrão é 20 salas × 32 jogadores (640, o mesmo total de 40 × 16) e não gera alerta', () => {
  assert.deepStrictEqual(C.DEFAULTS, { rooms: 20, perRoom: 32 });
  assert.strictEqual(C.DEFAULTS.rooms * C.DEFAULTS.perRoom, 40 * 16);
  assert.ok(C.validate(C.DEFAULTS.rooms, C.DEFAULTS.perRoom).ok);
  const e = C.estimate(C.DEFAULTS.rooms, C.DEFAULTS.perRoom, null);
  assert.strictEqual(e.level, 'ok');
  assert.ok(e.fds < 900, 'cabe no limite padrão de 1024 descritores de arquivo');
});

test('connLimit: todos os lugares + 5% + 25, crescendo com os limites', () => {
  assert.strictEqual(C.connLimit(75, 25), Math.ceil(1875 * 1.05) + 25);
  assert.ok(C.connLimit(75, 25) > 75 * 25);
  assert.ok(C.connLimit(10, 10) < C.connLimit(10, 11) && C.connLimit(10, 10) < C.connLimit(11, 10));
});

test('estimate: números derivados e níveis de alerta', () => {
  const e = C.estimate(75, 25, null);
  assert.strictEqual(e.players, 1875);
  assert.strictEqual(e.conns, C.connLimit(75, 25));
  assert.strictEqual(e.msgsPerSec, 1875 * C.TICK_HZ);
  assert.strictEqual(e.bytesWorst, 75 * 25 * 25 * C.STATE_BYTES * C.TICK_HZ);
  assert.strictEqual(e.tickMs, null, 'sem medição suficiente não inventa um tick');
  assert.ok(e.notes.some(n => /sem jogadores suficientes|ainda sem/i.test(n)));
  assert.strictEqual(e.level, 'warn', 'passa de ~900 descritores de arquivo: avisa do ulimit');
  assert.ok(e.notes.some(n => /ulimit/.test(n)));
  const small = C.estimate(10, 10, null);
  assert.strictEqual(small.level, 'ok');
  const big = C.estimate(75, 40, null);       // 3000 jogadores em salas grandes: banda no pior caso passa de 300 Mbit/s
  assert.strictEqual(big.level, 'crit');
  assert.ok(big.mbitWorst > 300);
});

test('estimate: o tick projetado cresce com os jogadores e dispara alerta quando passa do orçamento', () => {
  const t = C.estimate(75, 25, { avgTickMs: 2, population: 100 });
  assert.strictEqual(t.tickMs, +(2 / 100 * 1875).toFixed(1));
  assert.strictEqual(C.estimate(10, 10, { avgTickMs: 2, population: 100 }).tickMs, 2);
  assert.strictEqual(C.estimate(10, 10, { avgTickMs: 2, population: 5 }).tickMs, null, 'menos de 10 jogadores: sem projeção');
  const crit = C.estimate(10, 10, { avgTickMs: 90, population: 10 });
  assert.strictEqual(crit.tickMs, 900);
  assert.strictEqual(crit.level, 'crit');
});

test('arquivo: grava de forma atômica, relê e ignora conteúdo inválido', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-cap-'));
  const f = path.join(dir, 'sub', 'capacity.json');
  try {
    assert.strictEqual(C.loadFile(f), null, 'sem arquivo');
    assert.strictEqual(C.saveFile(f, 40, 12), true);
    assert.deepStrictEqual(C.loadFile(f), { rooms: 40, perRoom: 12 });
    assert.ok(!fs.existsSync(f + '.tmp'), 'sem arquivo temporário sobrando');
    for (const bad of ['{{{', '{"rooms":999,"perRoom":10}', '{"rooms":10,"perRoom":"x"}', '{"rooms":100,"perRoom":40}', 'null', '[]']) {
      fs.writeFileSync(f, bad);
      assert.strictEqual(C.loadFile(f), null, bad);
    }
    assert.strictEqual(C.loadFile(''), null);
    assert.strictEqual(C.saveFile('', 1, 2), true, 'sem arquivo configurado: nada a gravar');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
