'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { createRecords } = require('../records');

const KEYS = ['humans', 'rss'];
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-rec-')), 'r.json');

test('só sobe, arredonda e ignora lixo', () => {
  const R = createRecords({ keys: KEYS, now: () => 5000 });
  R.up('humans', 3); R.up('humans', 2); R.up('humans', NaN); R.up('nada', 9); R.up('rss', 1.26);
  assert.deepStrictEqual(R.records.humans, { v: 3, at: 5 });
  assert.strictEqual(R.records.rss.v, 1.3);
  assert.strictEqual('nada' in R.records, false);
  assert.strictEqual(R.dirty, true);
});

test('grava e recarrega; sem arquivo não grava', () => {
  const f = tmp();
  const A = createRecords({ file: f, keys: KEYS, now: () => 7000 });
  A.up('humans', 4); A.write();
  assert.strictEqual(A.dirty, false);
  const B = createRecords({ file: f, keys: KEYS });
  assert.deepStrictEqual(B.records.humans, { v: 4, at: 7 });
  const C = createRecords({ keys: KEYS }); C.up('humans', 1); C.write();
  assert.strictEqual(C.dirty, true);
});

test('arquivo inválido ou com valores ruins começa do zero e avisa', () => {
  const f = tmp(); fs.writeFileSync(f, '{x');
  const w = []; const A = createRecords({ file: f, keys: KEYS, warn: m => w.push(m) });
  assert.strictEqual(A.records.humans.v, 0); assert.strictEqual(w.length, 1);
  fs.writeFileSync(f, JSON.stringify({ records: { humans: { v: -1, at: 1 }, rss: { v: 2, at: 3 } } }));
  const B = createRecords({ file: f, keys: KEYS });
  assert.strictEqual(B.records.humans.v, 0); assert.deepStrictEqual(B.records.rss, { v: 2, at: 3 });
});
