'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createActionLimit } = require('../lib/action-limit');

test('limite por identidade: abas compartilham a janela, outros jogadores e sistemas seguem livres', () => {
  let at = 100000;
  const g = createActionLimit({ now: () => at, rules: { craft: [1200, 3, 10000], chat: [700, 5, 5000] } });
  assert.equal(g.take('Ana', 'craft'), true);
  for (let i = 0; i < 1000; i++) assert.equal(g.take('Ana', 'craft'), false);
  assert.equal(g.take('Bia', 'craft'), true);
  assert.equal(g.take('Ana', 'chat'), true);
  at += 1200;
  assert.equal(g.take('Ana', 'craft'), true, 'descartes não prolongam a espera');
  at += 1200; assert.equal(g.take('Ana', 'craft'), true);
  at += 1200; assert.equal(g.take('Ana', 'craft'), false, 'o teto da janela também vale');
  at += 6400; assert.equal(g.take('Ana', 'craft'), true, 'libera exatamente na expiração');
  assert.equal(g.report().discarded, 1001);
});
test('limite de ações não mistura controles de avatar/voz e tem teto de memória', () => {
  const g = createActionLimit({ rules: { craft: [100, 10, 1000] }, maxKeys: 12 });
  for (let i = 0; i < 100; i++) { assert.equal(g.take('p' + i, 'craft'), true); assert.equal(g.take('p' + i, 'move'), true); }
  assert.ok(g.report().keys <= 12);
  assert.equal(g.take('', 'craft'), true, 'conexão sem identidade não cria um balde comum');
});
