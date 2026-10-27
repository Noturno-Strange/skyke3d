'use strict';
// Banimento manual: block, unban e list do armazém de banimentos.
const test = require('node:test');
const assert = require('node:assert');
const { createBanStore } = require('./limits.js');

const T0 = 1_000_000;

test('block: bane pelo tempo pedido e expira sozinho', () => {
  const b = createBanStore();
  const r = b.block('k', 60000, T0);
  assert.strictEqual(r.until, T0 + 60000);
  assert.strictEqual(b.check('k', T0 + 1000), 59000);
  assert.strictEqual(b.check('k', T0 + 60001), 0);
});

test('block: duração inválida é ignorada', () => {
  const b = createBanStore();
  for (const ms of [0, -5, NaN, Infinity, undefined]) assert.strictEqual(b.block('k', ms, T0), null);
  assert.strictEqual(b.size(), 0);
});

test('block: o administrador pode encurtar um banimento existente', () => {
  const b = createBanStore();
  b.block('k', 3600000, T0);
  b.block('k', 60000, T0 + 1000);
  assert.strictEqual(b.check('k', T0 + 1000), 60000);
});

test('block: não escala o nível automático', () => {
  const b = createBanStore();
  b.block('k', 1000, T0);
  const s = b.strike('k', T0 + 5000);
  assert.strictEqual(s.level, 0, 'primeiro strike automático continua no nível 0');
  assert.strictEqual(s.ms, b.levels[0]);
});

test('unban: remove e informa se existia', () => {
  const b = createBanStore();
  b.block('k', 60000, T0);
  assert.strictEqual(b.unban('k'), true);
  assert.strictEqual(b.check('k', T0 + 1), 0);
  assert.strictEqual(b.unban('k'), false);
});

test('list: só ativos, o que expira por último primeiro', () => {
  const b = createBanStore();
  b.block('curto', 1000, T0);
  b.block('longo', 90000, T0);
  b.block('medio', 30000, T0);
  b.strike('antigo', T0 - 10_000_000);
  const l = b.list(T0 + 500);
  assert.deepStrictEqual(l.map(e => e.key), ['longo', 'medio', 'curto']);
  assert.deepStrictEqual(b.list(T0 + 2000).map(e => e.key), ['longo', 'medio']);
});

test('banimento manual sobrevive a snapshot e restore', () => {
  const a = createBanStore();
  a.block('k', 60000, T0);
  const b = createBanStore();
  b.restore(JSON.parse(JSON.stringify(a.snapshot(T0 + 10))));
  assert.strictEqual(b.check('k', T0 + 1000), 59000);
  assert.strictEqual(b.list(T0 + 1000).length, 1);
});
