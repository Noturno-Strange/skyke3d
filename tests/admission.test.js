'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { zeroBits, powOk, issue, verify, createUsed } = require('../admission');

const SECRET = crypto.randomBytes(32);
const IP = '203.0.113.10';

function solve(c, bits) {
  for (let n = 0; n < 5e6; n++) if (powOk(c, bits, String(n))) return String(n);
  throw new Error('não resolveu');
}

test('zeroBits confere o prefixo binário', () => {
  assert.strictEqual(zeroBits(Buffer.from([0x00, 0x01]), 15), true);
  assert.strictEqual(zeroBits(Buffer.from([0x00, 0x01]), 16), false);
  assert.strictEqual(zeroBits(Buffer.from([0x80]), 0), true);
});

test('ticket emitido e verificado na mesma chave', () => {
  const t = issue({ secret: SECRET, ipKey: IP, bits: 0 });
  assert.strictEqual(t.v, 1);
  const param = [t.c, t.e, t.d, t.k, 0].join('.');
  const v = verify({ secret: SECRET, param, ipKey: IP });
  assert.deepStrictEqual(v, { ok: true, bits: 0 });
});

test('ticket não vale em outra chave (outro IP)', () => {
  const t = issue({ secret: SECRET, ipKey: IP, bits: 0 });
  const param = [t.c, t.e, t.d, t.k, 0].join('.');
  assert.strictEqual(verify({ secret: SECRET, param, ipKey: '198.51.100.7' }).reason, 'assinatura');
});

test('ticket adulterado é recusado', () => {
  const t = issue({ secret: SECRET, ipKey: IP, bits: 0 });
  const tampered = t.k.slice(0, -1) + (t.k.endsWith('A') ? 'B' : 'A');
  const param = [t.c, t.e, t.d, tampered, 0].join('.');
  assert.strictEqual(verify({ secret: SECRET, param, ipKey: IP }).reason, 'assinatura');
  assert.strictEqual(verify({ secret: SECRET, param: 'lixo', ipKey: IP }).reason, 'formato');
});

test('ticket expirado é recusado', () => {
  const t = issue({ secret: SECRET, ipKey: IP, bits: 0, ttlMs: 1000, now: 0 });
  const param = [t.c, t.e, t.d, t.k, 0].join('.');
  assert.strictEqual(verify({ secret: SECRET, param, ipKey: IP, now: 120000 }).reason, 'expirado');
});

test('prova de trabalho válida passa e inválida falha', () => {
  const t = issue({ secret: SECRET, ipKey: IP, bits: 8, ttlMs: 60000 });
  const n = solve(t.c, 8);
  const ok = verify({ secret: SECRET, param: [t.c, t.e, t.d, t.k, n].join('.'), ipKey: IP });
  assert.deepStrictEqual(ok, { ok: true, bits: 8 });
  const bad = verify({ secret: SECRET, param: [t.c, t.e, t.d, t.k, 'abc'].join('.'), ipKey: IP });
  assert.strictEqual(bad.reason, 'pow');
});

test('replay do mesmo desafio é recusado', () => {
  const used = createUsed();
  const t = issue({ secret: SECRET, ipKey: IP, bits: 0 });
  const param = [t.c, t.e, t.d, t.k, 0].join('.');
  assert.strictEqual(verify({ secret: SECRET, param, ipKey: IP, used }).ok, true);
  assert.strictEqual(verify({ secret: SECRET, param, ipKey: IP, used }).reason, 'replay');
});

test('dificuldade acima do teto é recusada', () => {
  const t = issue({ secret: SECRET, ipKey: IP, bits: 0 });
  const param = [t.c, t.e, 99, t.k, 0].join('.');
  assert.strictEqual(verify({ secret: SECRET, param, ipKey: IP }).reason, 'dificuldade');
});
