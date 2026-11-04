'use strict';
// Limpeza periódica de estruturas em memória que crescem com o uso.
const test = require('node:test');
const assert = require('node:assert');
const { serverSource, hasCode } = require('./server-source.js');

test('desafios e sessões de identidade vencidos são varridos periodicamente', () => {
  assert.ok(hasCode(serverSource(), 'setInterval(() => AUTH.sweep(), 60000).unref()'));
});
