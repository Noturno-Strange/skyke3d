'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { createReports } = require('../lib/reports');

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

// SK-10: inundar a fila com denúncias falsas expulsava as verdadeiras (a lista só cortava as mais antigas).
test('denúncias abertas por autor têm teto; passou do teto, a fila não é aceita para aquele autor', () => {
  const R = mk({ perAuthor: 3, max: 100 });
  for (let i = 1; i <= 3; i++) assert.strictEqual(R.add(rep(i, { rk: 'spam' })), true);
  assert.strictEqual(R.add(rep(4, { rk: 'spam' })), false, 'o quarto do mesmo autor é recusado');
  assert.strictEqual(R.add(rep(5, { rk: 'outro' })), true, 'outro autor não é afetado');
  assert.strictEqual(R.list.length, 4);
  // arquivar libera vaga para o autor
  R.find(rep(1).id).status = 'dismissed';
  assert.strictEqual(R.add(rep(6, { rk: 'spam' })), true);
});

test('fila cheia: sai primeiro o já resolvido; só abertas: perde quem inunda, não quem denunciou uma vez', () => {
  const R = mk({ max: 4, perAuthor: 100 });
  R.add(rep(1, { rk: 'a', status: 'dismissed' }));
  R.add(rep(2, { rk: 'a' }));
  R.add(rep(3, { rk: 'b' }));
  R.add(rep(4, { rk: 'b' }));
  R.add(rep(5, { rk: 'c' })); // passa do teto: sai a arquivada (1), não uma aberta
  assert.deepStrictEqual(R.list.map(x => x.id).sort(), [rep(2).id, rep(3).id, rep(4).id, rep(5).id].sort());
  // agora todas abertas: um autor despeja várias e só elas saem
  const F = mk({ max: 6, perAuthor: 100 });
  F.add(rep(1, { rk: 'real1' }));
  F.add(rep(2, { rk: 'real2' }));
  for (let i = 10; i < 18; i++) F.add(rep(i, { rk: 'flood' }));
  assert.strictEqual(F.list.length, 6);
  const rks = F.list.map(x => x.rk);
  assert.ok(rks.includes('real1') && rks.includes('real2'), 'as denúncias verdadeiras ficam');
  assert.strictEqual(rks.filter(r => r === 'flood').length, 4);
});

test('fila cheia: eviçar com 500 denúncias é barato e a mais antiga do autor que mais enche sai', () => {
  const R = mk({ max: 500, perAuthor: 100000 });
  for (let i = 0; i < 500; i++) R.add(rep(i, { rk: 'r' + (i % 50) }));
  const t0 = process.hrtime.bigint();
  for (let i = 500; i < 2500; i++) R.add(rep(i, { rk: 'flood' }));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.strictEqual(R.list.length, 500);
  assert.ok(ms < 2000, '2000 denúncias com a fila cheia levaram ' + ms.toFixed(0) + ' ms');
});
