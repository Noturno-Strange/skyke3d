'use strict';
// Filtro de palavrões do chat (pt-BR): troca por !@#$%, sem censurar palavras comuns.
const test = require('node:test');
const assert = require('node:assert');
const { censor, hasProfanity } = require('./profanity');

const MASKED = /^[!@#$%&*]{3,7}$/;

test('palavrões simples viram símbolos e o resto da frase fica igual', () => {
  assert.strictEqual(censor('que porra é essa'), 'que !@#$% é essa');
  const r = censor('Isso é uma merda mesmo');
  assert.ok(/^Isso é uma [!@#$%&*]+ mesmo$/.test(r), r);
  assert.ok(!/merda/i.test(censor('MERDA!')));
});

test('maiúsculas, acentos, letras repetidas e plural também são pegos', () => {
  for (const t of ['PORRA', 'Porra', 'porrrrra', 'caralhos', 'FODA', 'foooda', 'putas', 'buceta', 'cuzão', 'Filho da puta', 'filhodaputa', 'VIADO', 'arrombado'])
    assert.ok(hasProfanity(t), t);
});

test('trocas de números e símbolos por letras, e separadores entre as letras', () => {
  for (const t of ['p0rra', 'c4ralho', 'm3rda', 'f0d@', 'f0da', 'b0sta', 'p.u.t.a', 'p u t a', 'f-o-d-a', 'put4'])
    assert.ok(hasProfanity(t), t);
});

test('abreviações comuns: fdp, pqp, vsf, vtnc', () => {
  for (const t of ['fdp', 'FDP', 'pqp', 'vsf', 'vtnc', 'vai tnc'])
    assert.ok(hasProfanity(t), t);
});

test('palavras comuns que contêm um palavrão dentro NÃO são censuradas', () => {
  for (const t of ['computador', 'pauta', 'cultura', 'cuidado', 'curso', 'escuta', 'classe', 'assassino', 'raputa', 'disputa', 'reputação',
    'bostela', 'cuco', 'pata', 'porrada', 'fodão', 'putrefato', 'oi pessoal', 'bom dia', 'vamos jogar', 'karaokê', 'música', 'fogueira', 'cenário',
    'ótimo', 'amigo', 'Marina', 'http://exemplo.com/cuidado', '2024', '1 2 3', 'oi!', 'tudo bem?', 'foda!!'.slice(0, 0) || 'ok'])
    assert.strictEqual(censor(t), t, t);
});

test('a máscara tem de 3 a 7 símbolos e só contém símbolos', () => {
  const r = censor('porra');
  assert.ok(MASKED.test(r), r);
  assert.ok(MASKED.test(censor('caralhooooooooo')), censor('caralhooooooooo'));
});

test('várias palavras na mesma frase e pontuação depois do palavrão', () => {
  const r = censor('porra, caralho! foda-se, né');
  assert.ok(!/porra|caralho|foda/i.test(r), r);
  assert.ok(r.includes(', ') && r.endsWith(', né'), r);
});

test('entradas inesperadas não quebram', () => {
  assert.strictEqual(censor(''), '');
  assert.strictEqual(censor(undefined), undefined);
  assert.strictEqual(censor(42), 42);
  assert.strictEqual(censor('😀 porra 😀').includes('porra'), false);
  assert.ok(censor('😀 porra 😀').startsWith('😀 ') && censor('😀 porra 😀').endsWith(' 😀'));
});
