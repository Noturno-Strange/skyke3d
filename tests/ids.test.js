'use strict';
// Identificadores opacos (lib/ids.js): o id herdado tem que continuar idêntico ao id de amigo já distribuído.
const test = require('node:test');
const assert = require('node:assert');
const { B32, ID_RE, fidOf, identityIdOf, newId } = require('../lib/ids.js');

test('fidOf bate com o vetor conhecido da implementação antiga', () => {
  assert.strictEqual(fidOf('A'.repeat(43)), 'wmlf77lf2lov');
  assert.strictEqual(fidOf('A'.repeat(43)), fidOf('A'.repeat(43)));
  assert.notStrictEqual(fidOf('A'.repeat(43)), fidOf('B'.repeat(43)));
});

test('id de amigo tem 12 caracteres base32 minúsculo e aceita chave de qualquer tamanho', () => {
  for (const k of ['a'.repeat(43), 'z'.repeat(43), '', 'ação']) {
    const id = fidOf(k);
    assert.match(id, ID_RE);
    assert.match(id, /^[a-z2-7]{12}$/);
    assert.ok([...id].every(c => B32.includes(c)));
  }
  assert.strictEqual(B32.length, 32);
});

test('identityIdOf é o mesmo id de amigo (migração sem perder nomes nem amigos)', () => {
  assert.strictEqual(identityIdOf, fidOf);
  for (const k of ['A'.repeat(43), 'chave-de-teste', 'x'.repeat(43)]) assert.strictEqual(identityIdOf(k), fidOf(k));
});

test('newId gera 12 caracteres no mesmo formato, sem repetir em lote', () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const id = newId();
    assert.match(id, ID_RE);
    assert.ok(!seen.has(id), 'id repetido: ' + id);
    seen.add(id);
  }
});
