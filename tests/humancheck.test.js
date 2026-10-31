'use strict';

const test = require('node:test');
const assert = require('node:assert');
const HC = require('../humancheck');
const { CFG } = HC;
const rngDe = seed => { let a = seed; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

test('desafios: conta certa, maior certo, figura certa; a resposta nunca vai para o jogador', () => {
  const rng = rngDe(5), vistos = new Set();
  for (let i = 0; i < 400; i++) {
    const c = HC.make(rng); vistos.add(c.kind);
    if (c.kind === 'soma') { const [, a, op, b] = c.q.match(/^(\d+) ([+×]) (\d+)/); assert.strictEqual(c.ans, String(op === '+' ? +a + +b : a * b)); assert.strictEqual(c.opts.length, 4); assert.strictEqual(new Set(c.opts).size, 4); assert.ok(c.opts.includes(c.ans)); assert.ok(c.opts.every(o => +o > 0)); }
    if (c.kind === 'maior') { assert.strictEqual(c.opts.length, 3); assert.strictEqual(new Set(c.opts).size, 3); assert.strictEqual(c.ans, String(Math.max(...c.opts.map(Number)))); }
    if (c.kind === 'figura') { assert.strictEqual(c.opts.length, 4); assert.strictEqual(new Set(c.opts).size, 4); assert.ok(c.opts.includes(c.ans)); assert.ok(c.q.includes(HC.FIGURAS.find(f => f[0] === c.ans)[1])); }
  }
  assert.deepStrictEqual([...vistos].sort(), ['figura', 'maior', 'soma']);
  const h = HC.create(), r = rngDe(1); const out = HC.poll(h, CFG.first + CFG.jitter + 1, 0, r);
  assert.ok(out.ch && !('ans' in out.ch) && !/ans/.test(Object.keys(out.ch).join()), 'o campo da resposta certa não vai no desafio (ela só aparece como uma das opções)');
});

test('cadência: nada antes de `first`, depois um por vez, com intervalo e sorteio; rodada curta nunca é cobrada', () => {
  const h = HC.create(), r = rngDe(2); let n = 0, ultimo = -1;
  for (let t = 0; t < 4000; t += 1) {
    const o = HC.poll(h, t, t * 1000, r);
    if (o.ch) { n++; if (ultimo >= 0) assert.ok(t - ultimo >= CFG.every - CFG.jitter - CFG.window - 2, 'intervalo'); else assert.ok(t >= CFG.first, 'o primeiro só depois de ' + CFG.first + ' s'); ultimo = t; HC.answer(h, o.ch.id, h.pending.ans, t * 1000 + 2000); }
  }
  assert.ok(n >= 3 && n <= 5, 'em ~67 minutos: ' + n + ' desafios (um a cada ~15 min)');
  assert.strictEqual(HC.verified(HC.create(), CFG.first - 1), true, 'rodada curta vale sem desafio');
});

test('responder: certa passa; errada gasta tentativas; rápida demais não vale; fora do prazo é falta', () => {
  const r = rngDe(3), novo = () => { const h = HC.create(); h.next = 0; const o = HC.poll(h, 1000, 1000, r); return { h, id: o.ch.id, ans: h.pending.ans }; };
  let { h, id, ans } = novo();
  assert.deepStrictEqual(HC.answer(h, id, ans, 1000 + 1500), { ok: true, done: true }); assert.strictEqual(h.passed, 1);
  ({ h, id, ans } = novo());
  assert.strictEqual(HC.answer(h, id, 'xx', 2500).why, 'errada'); assert.strictEqual(HC.answer(h, id, 'yy', 2600).why, 'errada');
  assert.deepStrictEqual(HC.answer(h, id, 'zz', 2700), { ok: false, done: true, why: 'erros' }); assert.strictEqual(h.missed, 1);
  ({ h, id, ans } = novo());
  assert.strictEqual(HC.answer(h, id, ans, 1000 + 100).why, 'rapido', 'certa mas em 0,1 s: ninguém lê tão rápido'); assert.strictEqual(h.fast, 1);
  assert.strictEqual(HC.answer(h, id, ans, 1000 + 1500).ok, true, 'depois de um tempo humano, vale');
  ({ h, id, ans } = novo());
  assert.strictEqual(HC.answer(h, id, ans, 1000 + CFG.window * 1000 + 5).why, 'tempo'); assert.strictEqual(h.missed, 1);
  assert.strictEqual(HC.answer(h, 999, ans, 2000).why, 'sem_desafio', 'id errado');
  assert.strictEqual(HC.answer(h, id, ans, 2000).why, 'sem_desafio', 'já encerrado');
});

test('prazo vencido sem resposta: falta, e só tenta de novo depois de `retry`', () => {
  const h = HC.create(), r = rngDe(4); h.next = 0;
  const o = HC.poll(h, 700, 700000, r); assert.ok(o.ch);
  const o2 = HC.poll(h, 760, 700000 + (CFG.window + 1) * 1000, r); assert.strictEqual(o2.miss, true); assert.strictEqual(h.missed, 1);
  assert.ok(!o2.ch, 'não repete na hora'); assert.ok(h.next >= 760 + CFG.retry - 1);
});

test('verificado: sem falta e com ao menos um desafio passado, depois de `first`', () => {
  const h = HC.create();
  assert.strictEqual(HC.verified(h, CFG.first + 5), false, 'passou do tempo sem nenhum desafio vencido');
  h.passed = 1; assert.strictEqual(HC.verified(h, CFG.first + 5), true);
  h.missed = 1; assert.strictEqual(HC.verified(h, CFG.first + 5), false, 'uma falta tira a rodada do ranking');
  assert.strictEqual(HC.verified(h, 100), true, 'rodada curta nunca é cobrada');
});
