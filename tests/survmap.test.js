'use strict';

// Gerador do mapa de Sobrevivência: mesma semente, mesmo mapa; e nenhuma semente pode gerar um mapa injogável.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../assets/survmap.js');
const { SURV: S } = require('../assets/catalog.js');

test('mesma semente dá o mesmo mapa; sementes diferentes dão mapas diferentes', () => {
  assert.deepStrictEqual(M.generate(123), M.generate(123));
  assert.notDeepStrictEqual(M.generate(123).nodes, M.generate(124).nodes);
  assert.deepStrictEqual(M.generate(0), M.generate(1), 'semente 0 vira 1 (nunca fica sem mapa)');
});

test('5 mil sementes: todo mapa é jogável (pontos certos, dentro da área e da zona, sem sobrepor)', () => {
  const falhas = [];
  for (let seed = 1; seed <= 5000; seed++) {
    const bad = M.check(M.generate(seed));
    if (bad.length) falhas.push(seed + ': ' + bad[0]);
    if (falhas.length > 5) break;
  }
  assert.deepStrictEqual(falhas, []);
});

test('todo recurso essencial aparece e a água fica em volta da cisterna', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const m = M.generate(seed), por = {};
    for (const n of m.nodes) por[n.res] = (por[n.res] || 0) + 1;
    for (const [id, r] of Object.entries(S.res)) assert.strictEqual(por[id], Object.values(r.spots).reduce((a, b) => a + b, 0), `${id} @ ${seed}`);
    for (const n of m.nodes.filter(x => x.res === 'agua')) assert.ok(Math.abs(Math.hypot(n.x - m.cistern.x, n.z - m.cistern.z) - (m.cistern.r + .9)) < 1e-9);
  }
});

test('enfeites: só tipos que o cenário já desenha, fora da cisterna, da fogueira e da borda', () => {
  const tipos = new Set(Object.values(M.DECOR).flat().map(x => x[0]));
  assert.deepStrictEqual([...tipos].sort(), ['bush', 'fern', 'log', 'rock', 'shroom', 'stump', 'tree']);
  for (let seed = 1; seed <= 300; seed++) {
    const m = M.generate(seed);
    assert.ok(m.decor.length > 60, 'cenário não pode ficar vazio');
    for (const d of m.decor) {
      assert.ok(tipos.has(d.type));
      assert.ok(Math.hypot(d.x - S.walk.x, d.z - S.walk.z) <= S.walk.r);
      assert.ok(Math.hypot(d.x - S.fire.x, d.z - S.fire.z) >= 2.5);
      assert.ok(Math.hypot(d.x - m.cistern.x, d.z - m.cistern.z) >= m.cistern.r + .6 - 1e-9);
    }
  }
});

test('gerar é rápido (cabe no início da rodada, no celular)', () => {
  const t = process.hrtime.bigint();
  for (let s = 1; s <= 200; s++) M.generate(s);
  assert.ok(Number(process.hrtime.bigint() - t) / 1e6 / 200 < 5, 'menos de 5 ms por mapa');
});

test('nada do mapa gerado cai em cima da casa, da estufa ou dos painéis solares (inclusive a cisterna)', () => {
  const dentro = (x, z, r = 0) => M.FIXED.some(q => Math.hypot(x - q.x, z - q.z) < q.r + r);
  for (let seed = 1; seed <= 1000; seed++) {
    const m = M.generate(seed);
    assert.ok(!dentro(m.cistern.x, m.cistern.z, m.cistern.r), 'cisterna @ ' + seed);
    for (const n of m.nodes) assert.ok(!dentro(n.x, n.z), n.res + ' @ ' + seed);
    for (const d of m.decor) assert.ok(!dentro(d.x, d.z), d.type + ' @ ' + seed);
  }
});
