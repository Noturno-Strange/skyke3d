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
  assert.deepStrictEqual(r, { ok: true, name: 'Ação 🌟', look, gloss: 1 });
  assert.deepStrictEqual(R.decode(R.encode({ name: '', look, gloss: 0 })), { ok: true, name: '', look, gloss: 0 });
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

test('código antigo com 32 bytes extras depois do cabeçalho ainda restaura nome e visual; os bytes são ignorados', () => {
  // monta à mão um código no formato antigo: bit 4 ligado e 32 bytes de chave logo depois do cabeçalho
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const b32 = u8 => { let s = '', acc = 0, bits = 0; for (const x of u8) { acc = acc << 8 | x; bits += 8; while (bits >= 5) { bits -= 5; s += A[acc >> bits & 31]; } acc &= (1 << bits) - 1; } if (bits) s += A[acc << (5 - bits) & 31]; return s; };
  const unb32 = t => { const out = []; let acc = 0, bits = 0; for (const ch of t) { acc = acc << 5 | A.indexOf(ch); bits += 5; if (bits >= 8) { bits -= 8; out.push(acc >> bits & 255); } acc &= (1 << bits) - 1; } return Uint8Array.from(out); };
  const novo = R.encode({ name: 'Ação 🌟', look, gloss: 1 }), u = unb32(novo.replace(/-/g, '')), body = u.slice(0, -5);
  const antigo = Uint8Array.from([body[0] | 4, ...body.slice(1, 12), ...Array.from({ length: 32 }, (_, i) => i * 7 + 1), ...body.slice(12)]);
  const tag = [...'skyke3d/rec/v1'].map(c => c.charCodeAt(0)), ck = R.sha256(Uint8Array.from([...tag, ...antigo])).slice(0, 5);
  const codigo = b32(Uint8Array.from([...antigo, ...ck])).match(/.{1,5}/g).join('-');
  const d = R.decode(codigo);
  assert.deepStrictEqual([d.ok, d.name, d.gloss], [true, 'Ação 🌟', 1]); assert.deepStrictEqual(d.look, R.decode(novo).look);
  assert.ok(!('secret' in d), 'a chave não sai do decodificador');
  assert.ok(!('secret' in R.decode(novo)) && !('viewCode' in R));
  assert.strictEqual(R.decode(codigo.slice(0, 60)).ok, false, 'código cortado');
});
