'use strict';
// Código de recuperação (assets/recovery.js): ida e volta, conferência contra erro de digitação e validação do que vem colado.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const R = require('../assets/recovery.js');
const C = require('../assets/catalog.js');

const look = { fc: 3, skin: C.SKIN.length - 1, eye: 9, hs: C.HS.length - 1, hair: C.HAIRC.length - 1, hat: 2, hc: C.PAL.length - 1, shirt: 0, bt: 1, pc: 12, shoes: 2, sc: 7 };

test('SHA-256 próprio bate com o do Node', () => {
  for (let l = 0; l < 160; l++) {
    const b = crypto.randomBytes(l);
    assert.deepStrictEqual(Buffer.from(R.sha256(b)), crypto.createHash('sha256').update(b).digest(), 'tamanho ' + l);
  }
});

test('ida e volta com nome acentuado e brilho; minúsculas, O/I/L e espaços são aceitos', () => {
  const code = R.encode({ name: 'Ação 🌟', look, gloss: 1 });
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{1,5}(-[0-9A-HJKMNP-TV-Z]{1,5})*$/);
  const r = R.decode(' ' + code.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l').replace(/-/g, ' ') + ' ');
  assert.deepStrictEqual(r, { ok: true, name: 'Ação 🌟', look, gloss: 1, fk: '', friends: [] });
  assert.deepStrictEqual(R.decode(R.encode({ name: '', look, gloss: 0 })), { ok: true, name: '', look, gloss: 0, fk: '', friends: [] });
});

test('qualquer caractere trocado, faltando ou sobrando é recusado', () => {
  const code = R.encode({ name: 'Ana', look, gloss: 0 }).replace(/-/g, '');
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  for (let i = 0; i < code.length; i++) {
    const swapped = code.slice(0, i) + A[(A.indexOf(code[i]) + 7) % 32] + code.slice(i + 1);
    assert.strictEqual(R.decode(swapped).ok, false, 'troca na posição ' + i);
    assert.strictEqual(R.decode(code.slice(0, i) + code.slice(i + 1)).ok, false, 'falta na posição ' + i);
  }
  assert.strictEqual(R.decode(code + '0').ok, false);
  for (const bad of ['', 'U'.repeat(30), 'abc', null, 42, 'Z'.repeat(500)]) assert.strictEqual(R.decode(bad).ok, false);
});

test('índice fora do catálogo é recusado mesmo com conferência certa', () => {
  const code = R.encode({ name: 'x', look: { ...look, skin: 127 }, gloss: 0 });
  assert.deepStrictEqual(R.decode(code), { ok: false, err: 'faixa' });
});

test('as listas do catálogo cabem nos 7 bits por campo', () => {
  for (const k of R.FIELDS) assert.ok(C.CR[k] > 0 && C.CR[k] <= 128, k);
});

test('amigos no código: leva a chave e até MAXF ids (sem nomes nem mensagens) e volta igual', () => {
  const fk = require('node:crypto').randomBytes(32).toString('base64url');
  const ids = ['abcdefghijkl', 'mnopqrstuvwx', 'yz234567abcd'];
  const code = R.encode({ name: 'Ana', look, gloss: 0, fk, friends: [...ids, ids[0], 'INVALIDO'] });
  assert.deepStrictEqual(R.decode(code), { ok: true, name: 'Ana', look, gloss: 0, fk, friends: ids });
  assert.ok(code.length < 170, 'com poucos amigos o código continua curto: ' + code.length);
  const B = 'abcdefghijklmnopqrstuvwxyz234567',
    many = Array.from({ length: 60 }, (_, i) => 'aaaaaaaaaa' + B[i >> 5] + B[i & 31]);
  const big = R.decode(R.encode({ name: 'Max', look, gloss: 1, fk, friends: many }));
  assert.strictEqual(big.friends.length, R.MAXF, 'no máximo MAXF amigos');
  assert.ok(!/Ana|Max/.test(JSON.stringify(big.friends)));
  const sem = R.encode({ name: 'Bia', look, gloss: 0, fk: 'chave-invalida', friends: ids });
  assert.deepStrictEqual(R.decode(sem).friends, [], 'chave inválida: código sem amigos');
});
