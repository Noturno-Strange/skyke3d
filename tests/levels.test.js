'use strict';
// Curva de níveis da fazenda e da culinária (lib/levels.js): até o 20 igual à antiga, depois 1000 por nível até o 999.
const test = require('node:test');
const assert = require('node:assert');
const L = require('../lib/levels.js');

test('níveis 1 a 20 são os de antes (ninguém muda de nível com a curva nova)', () => {
  const old = lv => (50 * lv * (lv - 1)) / 2;
  for (let lv = 1; lv <= 20; lv++) assert.strictEqual(L.xpFor(lv), old(lv), 'nível ' + lv);
  for (let x = 0; x <= old(20); x += 37) {
    let lv = 1;
    while (lv < 20 && x >= old(lv + 1)) lv++;
    assert.strictEqual(L.levelOf(x), lv, 'xp ' + x);
  }
});

test('depois do 20, cada nível custa 1000; o teto é 999 e a curva é contínua', () => {
  assert.strictEqual(L.MAX_LEVEL, 999);
  assert.strictEqual(L.xpFor(21) - L.xpFor(20), 1000);
  assert.strictEqual(L.xpFor(999) - L.xpFor(998), 1000);
  assert.strictEqual(L.xpFor(999), 9500 + 979 * 1000);
  for (const lv of [20, 21, 100, 500, 998, 999]) {
    assert.strictEqual(L.levelOf(L.xpFor(lv)), lv);
    if (lv > 1) assert.strictEqual(L.levelOf(L.xpFor(lv) - 1), lv - 1);
  }
  assert.strictEqual(L.levelOf(1e9), 999);
  assert.strictEqual(L.levelOf(-5), 1);
  const i = L.levelInfo(L.xpFor(999));
  assert.ok(i.max && i.lo === i.hi);
});

test('a experiência ganha cresce com o nível (+1% por nível) e com cada renascimento (+10%)', () => {
  assert.strictEqual(L.xpMult(1, 0), 1);
  assert.strictEqual(L.xpMult(101, 0), 2);
  assert.strictEqual(L.xpMult(1, 3), 1.3);
  assert.ok(Math.abs(L.xpMult(999, 10) - 10.98 * 2) < 1e-9);
});
