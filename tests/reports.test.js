'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { createReports } = require('../reports');

const REASONS = { abuso: 'Abuso' };
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-rep-')), 'r.json');
const rep = (n, o = {}) => ({ id: n.toString(16).padStart(12, '0'), at: 1000, reason: 'abuso', tk: 't', rk: 'r', by: {}, target: {}, chat: [], status: 'open', ...o });
const mk = o => createReports({ reasons: REASONS, now: () => 2000, delayMs: 20, ...o });

test('add põe a mais nova na frente e respeita o teto', () => {
  const R = mk({ max: 2 });
  R.add(rep(1)); R.add(rep(2)); R.add(rep(3));
  assert.deepStrictEqual(R.list.map(x => x.id), [rep(3).id, rep(2).id]);
  assert.strictEqual(R.find(rep(2).id).id, rep(2).id);
  assert.strictEqual(R.find('x'), undefined);
});

test('duplicata: mesmo autor e alvo dentro da janela', () => {
  const R = mk(); R.add(rep(1, { at: 1500 }));
  assert.strictEqual(R.recent('r', 't', 600), true);
  assert.strictEqual(R.recent('r', 't', 400), false);
  assert.strictEqual(R.recent('outro', 't', 600), false);
});

test('expire remove as vencidas', () => {
  const R = mk({ ttl: 500 }); R.add(rep(1, { at: 1000 })); R.add(rep(2, { at: 1900 }));
  R.expire();
  assert.deepStrictEqual(R.list.map(x => x.id), [rep(2).id]);
});

test('grava, recarrega e descarta registros inválidos ou vencidos', () => {
  const f = tmp(); const A = mk({ file: f });
  A.add(rep(1, { at: 1900 })); A.write();
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  j.reports.push(rep(2, { reason: 'inexistente' }), { id: 'ruim' }, rep(3, { at: 1 }));
  fs.writeFileSync(f, JSON.stringify(j));
  const B = mk({ file: f, ttl: 1500 });
  assert.deepStrictEqual(B.list.map(x => x.id), [rep(1).id]);
});

test('gravação adiada e arquivo inválido', async () => {
  const f = tmp(); const A = mk({ file: f });
  A.add(rep(1, { at: 1900 }));
  assert.strictEqual(fs.existsSync(f), false);
  await new Promise(r => setTimeout(r, 80));
  assert.strictEqual(fs.existsSync(f), true);
  fs.writeFileSync(f, '{x'); const w = [];
  assert.strictEqual(mk({ file: f, warn: m => w.push(m) }).list.length, 0);
  assert.strictEqual(w.length, 1);
});
