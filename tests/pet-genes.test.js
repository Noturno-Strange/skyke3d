'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../lib/pet-genes.js');

test('genes: mesma seed e tentativa dão sempre o mesmo mascote (determinismo)', () => {
  for (const seed of ['0123456789abcdef', 'ffffffffffffffff', 'a1b2c3d4e5f60789'])
    for (let n = 0; n < 3; n++) assert.deepStrictEqual(G.genesFromSeed(seed, n), G.genesFromSeed(seed, n));
  assert.notDeepStrictEqual(G.genesFromSeed('0123456789abcdef', 0), G.genesFromSeed('0123456789abcdef', 1));
});

test('genes: todo gene fica dentro da faixa e as regras de compatibilidade valem sempre', () => {
  for (let i = 0; i < 4000; i++) {
    const g = G.genesFromSeed(i.toString(16).padStart(16, '0'), 0);
    for (const k of G.GENE_KEYS) assert.ok(Number.isInteger(g[k]) && g[k] >= 0 && g[k] < G.GENE_SIZE[k], k + '=' + g[k]);
    const smooth = [0, 3, 7].includes(g.bd);
    if (g.ea === 3) assert.ok([0, 1, 3, 5].includes(g.hd), 'orelha caída só em cabeça arredondada');
    if (g.ea === 7) assert.ok(smooth, 'crista de nadadeira só em corpo liso');
    if (g.tl === 3) assert.ok(smooth || g.ea === 7, 'cauda de nadadeira');
    if (g.pt === 5) assert.notStrictEqual(g.pl, 14);
    if (g.sp === 5) assert.ok(g.pl !== 12 && g.pl !== 4, 'cósmico em paleta escura');
    if (g.ey === 3) assert.notStrictEqual(g.es, 2);
    assert.deepStrictEqual(G.cleanGenes(g), g);
  }
});

test('raridade: probabilidades do sorteio ficam perto das definidas (20 mil mascotes)', () => {
  const N = 20000,
    tier = [0, 0, 0, 0];
  for (let i = 0; i < N; i++) tier[G.rarityOf(G.genesFromSeed((i * 7919).toString(16).padStart(16, '0'), 0))]++;
  const pct = tier.map(x => (x / N) * 100);
  assert.ok(pct[0] > 75 && pct[0] < 81, 'comum ' + pct[0]);
  assert.ok(pct[1] > 12 && pct[1] < 16, 'incomum ' + pct[1]);
  assert.ok(pct[2] > 5 && pct[2] < 8, 'rara ' + pct[2]);
  assert.ok(pct[3] > 0.8 && pct[3] < 2.3, 'extremamente rara ' + pct[3]);
});

test('diversidade: 5 mil mascotes dão milhares de combinações diferentes e nenhuma característica some', () => {
  const keys = new Set(),
    seen = {};
  for (let i = 0; i < 5000; i++) {
    const g = G.genesFromSeed((i * 104729).toString(16).padStart(16, '0'), 0);
    keys.add(G.genomeKey(g));
    for (const k of G.GENE_KEYS) (seen[k] = seen[k] || new Set()).add(g[k]);
  }
  assert.ok(keys.size > 4990, 'combinações repetidas demais: ' + keys.size);
  for (const k of G.GENE_KEYS) assert.strictEqual(seen[k].size, G.GENE_SIZE[k], k + ' tem opção que nunca sai');
});

test('unicidade: nunca devolve um genoma já usado e tenta de novo com a mesma seed', () => {
  const g0 = G.genesFromSeed('aaaaaaaaaaaaaaaa', 0);
  const taken = new Set([G.genomeKey(g0)]);
  const r = G.generateUnique(taken, () => 'aaaaaaaaaaaaaaaa');
  assert.ok(r && r.attempt >= 1, 'pulou a tentativa 0, que já existia');
  assert.ok(!taken.has(G.genomeKey(r.genes)));
  assert.deepStrictEqual(G.genesFromSeed(r.seed, r.attempt), r.genes, 'seed + tentativa reconstroem exatamente');
  const all = { has: () => true };
  assert.strictEqual(G.generateUnique(all, () => 'bbbbbbbbbbbbbbbb', 5), null);
});

test('cleanGenes: recusa faltando, sobrando fora da faixa ou não inteiro', () => {
  const g = G.genesFromSeed('0123456789abcdef', 0);
  assert.ok(G.cleanGenes(g));
  assert.strictEqual(G.cleanGenes({ ...g, bd: 99 }), null);
  assert.strictEqual(G.cleanGenes({ ...g, ey: 1.5 }), null);
  assert.strictEqual(G.cleanGenes({ ...g, pe: -1 }), null);
  const sem = { ...g };
  delete sem.sp;
  assert.strictEqual(G.cleanGenes(sem), null);
  assert.strictEqual(G.cleanGenes(null), null);
});
