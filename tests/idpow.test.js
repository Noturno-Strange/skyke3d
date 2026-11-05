'use strict';

// Prova de trabalho do registro de identidade (lib/idpow.js).
const test = require('node:test');
const assert = require('node:assert');
const { powOk, solve, bitsFor } = require('../lib/idpow.js');

const K = 'A'.repeat(43),
  PK = 'B'.repeat(122),
  RPK = 'C'.repeat(122);

test('prova de trabalho: resolver e verificar, só para aqueles dados', () => {
  const n = solve(K, PK, RPK, 10);
  assert.strictEqual(powOk(K, PK, RPK, n, 10), true);
  assert.strictEqual(powOk(K, PK, RPK, n, 0), true, 'sem dificuldade, qualquer coisa serve');
  // a prova não serve para outra chave do aparelho, outra chave pública ou outra de recuperação
  let reuse = 0;
  for (const [k, pk, rpk] of [['D'.repeat(43), PK, RPK], [K, 'E'.repeat(122), RPK], [K, PK, 'F'.repeat(122)]]) if (powOk(k, pk, rpk, n, 10)) reuse++;
  assert.ok(reuse <= 1, 'reaproveitar a prova em outros dados passa só por acaso (1 em 1024 por tentativa)');
  assert.strictEqual(powOk(K, PK, RPK, undefined, 10), false);
  assert.strictEqual(powOk(K, PK, RPK, '', 10), false);
  assert.strictEqual(powOk(K, PK, RPK, '-1', 10), false);
  assert.strictEqual(powOk(K, PK, RPK, '1e3', 10), false);
  assert.strictEqual(powOk(K, PK, RPK, '1'.repeat(13), 10), false, 'até 12 dígitos');
});

test('prova de trabalho: a dificuldade sobe com o ritmo de registros e respeita o teto', () => {
  assert.strictEqual(bitsFor(0, 20, 500), 0, 'base 0 desliga');
  assert.strictEqual(bitsFor(14, 20, 0), 14);
  assert.strictEqual(bitsFor(14, 20, 29), 14);
  assert.strictEqual(bitsFor(14, 20, 30), 18);
  assert.strictEqual(bitsFor(14, 20, 120), 20, 'teto de 20 (14 + 6)');
  assert.strictEqual(bitsFor(14, 16, 500), 16, 'o teto configurado limita');
  assert.strictEqual(bitsFor(14, 8, 0), 14, 'a base nunca fica abaixo dela mesma');
});
