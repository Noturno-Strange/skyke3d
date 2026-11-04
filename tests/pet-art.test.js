'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Art = require('../assets/pet-art.js');
const G = require('../lib/pet-genes.js');

function fakeCtx() {
  const calls = [];
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k === '__calls') return calls;
      if (k in t) return t[k];
      return (...a) => {
        calls.push(String(k));
        if (String(k).startsWith('create')) return { addColorStop() {} };
        return undefined;
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    }
  });
}

test('desenho: toda combinação de genes, estados, estágios e acessórios desenha sem erro e com poucas operações', () => {
  let max = 0;
  for (let i = 0; i < 1500; i++) {
    const g = G.genesFromSeed((i * 6151).toString(16).padStart(16, '0'), 0);
    const state = Object.keys(Art.STATES)[i % 6];
    const ctx = fakeCtx();
    assert.doesNotThrow(() => Art.draw(ctx, 240, 216, g, { t: i / 7, state, stage: i % 4, cos: i % 5, blink: i % 3 ? 1 : 0.2 }), 'seed ' + i);
    max = Math.max(max, ctx.__calls.length);
  }
  assert.ok(max < 700, 'operações por quadro: ' + max);
});

test('desenho: aguenta todas as opções de cada gene (nenhuma fica sem desenho)', () => {
  const base = G.genesFromSeed('0123456789abcdef', 0);
  for (const k of G.GENE_KEYS)
    for (let v = 0; v < G.GENE_SIZE[k]; v++) {
      const ctx = fakeCtx();
      assert.doesNotThrow(() => Art.draw(ctx, 200, 180, { ...base, [k]: v }, { t: 1, state: 'idle', stage: 2, cos: 4 }), k + '=' + v);
    }
  assert.strictEqual(Art.PALETTES.length, G.GENE_SIZE.pl, 'uma paleta para cada opção');
  assert.ok(Art.BODIES.length >= G.GENE_SIZE.bd && Art.HEADS.length >= G.GENE_SIZE.hd);
});

test('desenho: estado desconhecido ou parâmetros ausentes não quebram', () => {
  const g = G.genesFromSeed('0123456789abcdef', 0);
  assert.doesNotThrow(() => Art.draw(fakeCtx(), 100, 90, g));
  assert.doesNotThrow(() => Art.draw(fakeCtx(), 100, 90, g, { state: 'nao-existe', stage: 99, cos: -3 }));
});

test('cores: mistura estável e paleta válida em todas as combinações', () => {
  assert.strictEqual(Art.mix('#000000', '#ffffff', 0.5), '#808080');
  for (let pl = 0; pl < 16; pl++)
    for (let tn = 0; tn < 3; tn++) {
      const C = Art.colorsOf({ pl, tn });
      for (const k of ['base', 'shade', 'accent', 'belly']) assert.match(C[k], /^#[0-9a-f]{6}$/, k);
    }
});
