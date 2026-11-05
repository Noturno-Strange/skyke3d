'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createLimiter, createBanStore } = require('../lib/limits');

test('janela deslizante conta e expira', () => {
  const l = createLimiter();
  assert.deepStrictEqual(l.hit('k', 2, 1000, 0), { over: false, count: 1 });
  assert.deepStrictEqual(l.hit('k', 2, 1000, 10), { over: false, count: 2 });
  assert.strictEqual(l.hit('k', 2, 1000, 20).over, true);
  assert.strictEqual(l.count('k', 1000, 30), 3);
  assert.strictEqual(l.count('k', 1000, 1100), 0, 'fora da janela');
  assert.strictEqual(l.hit('k', 2, 1000, 1100).over, false, 'janela reiniciou');
});

test('blocked não registra acerto', () => {
  const l = createLimiter();
  l.hit('k', 2, 1000, 0);
  assert.strictEqual(l.blocked('k', 2, 1000, 1), false);
  assert.strictEqual(l.blocked('k', 1, 1000, 1), true);
  assert.strictEqual(l.count('k', 1000, 1), 1, 'blocked não deve alterar a contagem');
});

test('prune limita o número de chaves', () => {
  const l = createLimiter({ maxKeys: 2 });
  l.hit('a', 1, 60000, 0);
  l.hit('b', 1, 60000, 1);
  l.hit('c', 1, 60000, 2);
  l.hit('d', 1, 60000, 3);
  assert.ok(l.size() <= 2, 'teto de chaves: ' + l.size());
});

test('chaves velhas somem no prune', () => {
  const l = createLimiter({ maxAgeMs: 1000 });
  l.hit('k', 5, 100000, 0);
  l.prune(5000);
  assert.strictEqual(l.size(), 0);
});

test('banimento escala e expira', () => {
  const b = createBanStore({ levels: [100, 200, 300], resetMs: 10000 });
  const key = 'ip';
  assert.strictEqual(b.check(key, 0), 0);
  assert.deepStrictEqual(b.strike(key, 0), { ms: 100, until: 100, level: 0 });
  assert.strictEqual(b.check(key, 50), 50);
  assert.strictEqual(b.check(key, 100), 0, 'ban expirou');
  assert.deepStrictEqual(b.strike(key, 101), { ms: 200, until: 301, level: 1 });
  assert.deepStrictEqual(b.strike(key, 102), { ms: 300, until: 402, level: 2 });
  assert.deepStrictEqual(b.strike(key, 103), { ms: 300, until: 403, level: 2 }, 'não passa do último nível');
});

test('sem strike por resetMs o nível volta ao primeiro', () => {
  const b = createBanStore({ levels: [100, 200], resetMs: 1000 });
  b.strike('k', 0);
  b.strike('k', 50);
  assert.strictEqual(b.snapshot(60).k[1], 1, 'nível máximo com dois níveis é 1');
  b.prune(2000);
  assert.strictEqual(b.size(), 0, 'chave esquecida após o reset');
  assert.deepStrictEqual(b.strike('k', 2000), { ms: 100, until: 2100, level: 0 });
});

test('snapshot e restore preservam banimentos e níveis', () => {
  const a = createBanStore({ levels: [100, 200], resetMs: 10000 });
  a.strike('x', 0);
  a.strike('y', 10);
  a.strike('y', 20);
  const snap = a.snapshot(30);
  const b = createBanStore({ levels: [100, 200], resetMs: 10000 });
  b.restore(snap);
  assert.strictEqual(b.check('x', 40), 60);
  assert.strictEqual(b.check('y', 40), 180);
  assert.deepStrictEqual(b.strike('y', 40), { ms: 200, until: 240, level: 1 });
});

test('restore ignora entradas inválidas', () => {
  const b = createBanStore();
  b.restore({ a: 'x', b: [1, 2], c: [1, 2, 3], d: [0, 9, 0] });
  assert.strictEqual(b.size(), 2, 'apenas c e d são válidos');
  assert.strictEqual(b.snapshot(0).d[1], 2, 'nível limitado ao último');
});

// SK-03: com o mapa cheio, uma chave nova custava ~3 ms (copiava e ordenava as 50 mil entradas). Agora é O(1).
test('limitador cheio: chave nova não ordena o mapa (custo constante)', () => {
  const l = createLimiter({ maxKeys: 50000 });
  const now = Date.now();
  for (let i = 0; i < 50000; i++) l.hit('http|' + i, 120, 60000, now);
  assert.strictEqual(l.size(), 50000);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 5000; i++) l.hit('http|novo' + i, 120, 60000, now + i);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.strictEqual(l.size(), 50000, 'o teto continua valendo');
  // antes: 5000 × ~3 ms = ~15 s; agora são microssegundos por chamada. O limite é folgado para máquinas lentas.
  assert.ok(ms < 1000, `5000 chaves novas com o mapa cheio levaram ${ms.toFixed(0)} ms`);
});

test('limitador: sai a chave usada há mais tempo, e quem acabou de agir é mantido', () => {
  const l = createLimiter({ maxKeys: 3 });
  l.hit('a', 5, 60000, 1);
  l.hit('b', 5, 60000, 2);
  l.hit('c', 5, 60000, 3);
  l.hit('a', 5, 60000, 4); // a volta para o fim da ordem de uso
  l.hit('d', 5, 60000, 5); // estoura o teto: sai b (a mais antiga), não a
  assert.strictEqual(l.size(), 3);
  assert.strictEqual(l.count('a', 60000, 6), 2, 'a continua com a contagem');
  assert.strictEqual(l.count('b', 60000, 6), 0, 'b foi descartada');
  assert.strictEqual(l.count('c', 60000, 6), 1);
  assert.strictEqual(l.count('d', 60000, 6), 1);
});

test('limitador: chaves vencidas ainda somem na varredura periódica', () => {
  const l = createLimiter({ maxKeys: 100, sweepMs: 1000, maxAgeMs: 500 });
  l.hit('velha', 5, 60000, 0);
  l.hit('nova', 5, 60000, 2000); // passa de sweepMs: varre e remove a vencida
  assert.strictEqual(l.size(), 1);
});

test('banimento com o armazém cheio: sem ordenação e a chave recente fica', () => {
  const b = createBanStore({ levels: [100], resetMs: 1e9, max: 2000 });
  for (let i = 0; i < 2000; i++) b.strike('ip' + i, i);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 3000; i++) b.strike('novo' + i, 5000 + i);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.strictEqual(b.size(), 2000);
  assert.ok(ms < 1000, `3000 strikes novos com o armazém cheio levaram ${ms.toFixed(0)} ms`);
  assert.ok(b.check('novo2999', 8000) > 0, 'o strike mais recente continua valendo');
  assert.strictEqual(b.check('ip0', 8000), 0, 'o mais antigo foi descartado');
  // quem levou um strike novo vai para o fim e não é o primeiro a sair
  const c = createBanStore({ levels: [1e6], resetMs: 1e9, max: 2 });
  c.strike('a', 1);
  c.strike('b', 2);
  c.strike('a', 3);
  c.strike('c', 4);
  assert.ok(c.check('a', 5) > 0 && c.check('c', 5) > 0, 'a e c ficam');
  assert.strictEqual(c.check('b', 5), 0, 'b (strike mais antigo) saiu');
});
