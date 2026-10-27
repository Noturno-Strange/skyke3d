'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createLimiter, createBanStore } = require('../limits');

test('janela deslizante conta e expira', () => {
  const l = createLimiter();
  assert.deepStrictEqual(l.hit('k', 2, 1000, 0), { over: false, count: 1 });
  assert.deepStrictEqual(l.hit('k', 2, 1000, 10), { over: false, count: 2 });
  assert.strictEqual(l.hit('k', 2, 1000, 20).over, true);
  assert.strictEqual(l.count('k', 1000, 30), 3);
  assert.strictEqual(l.count('k', 1000, 1100), 0, 'fora da janela');
  assert.strictEqual(l.hit('k', 2, 1000, 1100).over, false, 'janela reiniciou');
});

test('blocked não registra acerto', () => {
  const l = createLimiter();
  l.hit('k', 2, 1000, 0);
  assert.strictEqual(l.blocked('k', 2, 1000, 1), false);
  assert.strictEqual(l.blocked('k', 1, 1000, 1), true);
  assert.strictEqual(l.count('k', 1000, 1), 1, 'blocked não deve alterar a contagem');
});

test('prune limita o número de chaves', () => {
  const l = createLimiter({ maxKeys: 2 });
  l.hit('a', 1, 60000, 0);
  l.hit('b', 1, 60000, 1);
  l.hit('c', 1, 60000, 2);
  l.hit('d', 1, 60000, 3);
  assert.ok(l.size() <= 2, 'teto de chaves: ' + l.size());
});

test('chaves velhas somem no prune', () => {
  const l = createLimiter({ maxAgeMs: 1000 });
  l.hit('k', 5, 100000, 0);
  l.prune(5000);
  assert.strictEqual(l.size(), 0);
});

test('banimento escala e expira', () => {
  const b = createBanStore({ levels: [100, 200, 300], resetMs: 10000 });
  const key = 'ip';
  assert.strictEqual(b.check(key, 0), 0);
  assert.deepStrictEqual(b.strike(key, 0), { ms: 100, until: 100, level: 0 });
  assert.strictEqual(b.check(key, 50), 50);
  assert.strictEqual(b.check(key, 100), 0, 'ban expirou');
  assert.deepStrictEqual(b.strike(key, 101), { ms: 200, until: 301, level: 1 });
  assert.deepStrictEqual(b.strike(key, 102), { ms: 300, until: 402, level: 2 });
  assert.deepStrictEqual(b.strike(key, 103), { ms: 300, until: 403, level: 2 }, 'não passa do último nível');
});

test('sem strike por resetMs o nível volta ao primeiro', () => {
  const b = createBanStore({ levels: [100, 200], resetMs: 1000 });
  b.strike('k', 0);
  b.strike('k', 50);
  assert.strictEqual(b.snapshot(60).k[1], 1, 'nível máximo com dois níveis é 1');
  b.prune(2000);
  assert.strictEqual(b.size(), 0, 'chave esquecida após o reset');
  assert.deepStrictEqual(b.strike('k', 2000), { ms: 100, until: 2100, level: 0 });
});

test('snapshot e restore preservam banimentos e níveis', () => {
  const a = createBanStore({ levels: [100, 200], resetMs: 10000 });
  a.strike('x', 0);
  a.strike('y', 10);
  a.strike('y', 20);
  const snap = a.snapshot(30);
  const b = createBanStore({ levels: [100, 200], resetMs: 10000 });
  b.restore(snap);
  assert.strictEqual(b.check('x', 40), 60);
  assert.strictEqual(b.check('y', 40), 180);
  assert.deepStrictEqual(b.strike('y', 40), { ms: 200, until: 240, level: 1 });
});

test('restore ignora entradas inválidas', () => {
  const b = createBanStore();
  b.restore({ a: 'x', b: [1, 2], c: [1, 2, 3], d: [0, 9, 0] });
  assert.strictEqual(b.size(), 2, 'apenas c e d são válidos');
  assert.strictEqual(b.snapshot(0).d[1], 2, 'nível limitado ao último');
});
