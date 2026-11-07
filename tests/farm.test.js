'use strict';
// Fazenda (lib/farm.js): crescimento pelo relógio do servidor, rega, colheita, nível, canteiros, recordes, conquistas e disco.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../assets/catalog.js');
const { createFarm, xpFor, levelOf, BADGES, SLOTS, MAX_LEVEL } = require('../lib/farm.js');

const P = 'a'.repeat(20),
  Q = 'b'.repeat(20);
const clock = (t = 1e12) => {
  const c = { t, now: () => c.t, go: s => (c.t += s * 1000) };
  return c;
};
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-farm-')), 'farm.json');

test('catálogo: muitas plantas, ids únicos, tempos, níveis e colheitas coerentes', () => {
  assert.ok(C.CROPS.length >= 50, 'muitas plantas');
  assert.strictEqual(new Set(C.CROPS.map(c => c.id)).size, C.CROPS.length);
  for (const c of C.CROPS) {
    assert.ok(Number.isInteger(c.t) && c.t >= 60, c.id + ': tempo');
    assert.ok(Number.isInteger(c.lv) && c.lv >= 1 && c.lv <= MAX_LEVEL, c.id + ': nível');
    assert.ok(Number.isInteger(c.xp) && c.xp > 0, c.id + ': experiência');
    assert.ok(c.y[0] >= 1 && c.y[1] >= c.y[0], c.id + ': colheita');
    assert.ok(c.g === '' || C.INGR[c.g], c.id + ': ingrediente da culinária');
  }
  assert.ok(C.CROPS.filter(c => c.lv === 1).length >= 3, 'dá para começar no nível 1');
  assert.strictEqual(C.farmPlots(1), 8);
  assert.strictEqual(C.farmPlots(MAX_LEVEL), SLOTS);
});

test('planta, cresce no relógio do servidor e só colhe quando fica pronta', () => {
  const k = clock(),
    f = createFarm({ now: k.now, rng: () => 0 });
  assert.strictEqual(f.harvest(P, 0).reason, 'vazio');
  const r = f.plant(P, 0, 'tomate');
  assert.ok(r.ok && r.n === 1);
  assert.strictEqual(r.state.plots[0].c, 'tomate');
  assert.strictEqual(r.state.plots[0].e - r.state.plots[0].a, C.CROP.tomate.t * 1000);
  assert.strictEqual(f.plant(P, 0, 'cenoura').reason, 'ocupado');
  k.go(C.CROP.tomate.t - 1);
  assert.strictEqual(f.harvest(P, 0).reason, 'crescendo');
  k.go(1);
  const h = f.harvest(P, 0);
  assert.ok(h.ok);
  assert.deepStrictEqual(h.got, [{ i: 0, c: 'tomate', n: C.CROP.tomate.y[0], first: true }]);
  assert.strictEqual(h.xp, C.CROP.tomate.xp * 3, 'primeira colheita rende o triplo');
  assert.strictEqual(h.state.plots[0], null, 'o canteiro fica vazio');
  f.plant(P, 0, 'tomate');
  k.go(C.CROP.tomate.t);
  assert.strictEqual(f.harvest(P, 0).xp, C.CROP.tomate.xp, 'depois, o normal');
});

test('regar corta um quarto do tempo que falta, uma vez só, e rende +1', () => {
  const k = clock(),
    f = createFarm({ now: k.now, rng: () => 0 });
  f.plant(P, 1, 'cenoura');
  const t = C.CROP.cenoura.t * 1000;
  const w = f.water(P, 1);
  assert.ok(w.ok);
  assert.strictEqual(w.state.plots[1].e - k.t, Math.round(t * 0.75));
  assert.strictEqual(f.water(P, 1).reason, 'regada');
  k.go(Math.ceil((t * 0.75) / 1000));
  assert.strictEqual(f.water(P, 1).reason, 'pronta');
  assert.strictEqual(f.harvest(P, 1).got[0].n, C.CROP.cenoura.y[0] + 1);
  assert.strictEqual(f.view(P).rec.water, 1);
});

test('plantar, regar e colher em todos os canteiros de uma vez (-1)', () => {
  const k = clock(),
    f = createFarm({ now: k.now, rng: () => 0.999 });
  const r = f.plant(P, -1, 'morango');
  assert.strictEqual(r.n, C.farmPlots(1), 'todos os abertos');
  assert.strictEqual(f.plant(P, -1, 'morango').reason, 'cheio');
  assert.strictEqual(f.water(P, -1).n, C.farmPlots(1));
  k.go(C.CROP.morango.t);
  const h = f.harvest(P, -1);
  assert.strictEqual(h.n, C.farmPlots(1));
  assert.ok(h.got.every(g => g.n === C.CROP.morango.y[1] + 1), 'máximo com rng alto, +1 regada');
  assert.strictEqual(h.got.filter(g => g.first).length, 1, 'só a primeira conta como nova');
});

test('nível libera sementes e canteiros; canteiro fechado e semente bloqueada são recusados', () => {
  const k = clock(),
    f = createFarm({ now: k.now, rng: () => 0 });
  assert.strictEqual(f.plant(P, 0, 'arvore').reason, 'nivel');
  assert.strictEqual(f.plant(P, C.farmPlots(1), 'tomate').reason, 'fechado');
  assert.strictEqual(f.plant(P, SLOTS, 'tomate').reason, 'canteiro');
  assert.strictEqual(f.plant(P, 0, 'nada').reason, 'semente');
  assert.strictEqual(f.plant('x', 0, 'tomate').reason, 'pid');
  // colhe até subir de nível: os canteiros abertos aumentam
  let up = null;
  for (let n = 0; n < 50 && !up; n++) {
    f.plant(P, -1, 'margarida');
    k.go(C.CROP.margarida.t);
    const h = f.harvest(P, -1);
    if (h.lvUp) up = h;
  }
  assert.ok(up, 'subiu de nível');
  assert.ok(up.plotsUp > 0 && C.farmPlots(up.lv) - up.plotsUp >= C.farmPlots(1), 'mais canteiros abertos');
  assert.strictEqual(f.view(P).open, C.farmPlots(f.view(P).lv));
  assert.strictEqual(levelOf(xpFor(MAX_LEVEL) * 2), MAX_LEVEL);
});

test('arrancar tira a planta sem colheita nem experiência', () => {
  const k = clock(),
    f = createFarm({ now: k.now });
  f.plant(P, 2, 'tomate');
  const r = f.dig(P, 2);
  assert.ok(r.ok);
  assert.strictEqual(r.state.plots[2], null);
  assert.strictEqual(r.state.xp, 0);
  assert.strictEqual(f.dig(P, 2).reason, 'vazio');
  assert.strictEqual(f.dig(P, -1).reason, 'canteiro', 'arrancar é sempre de um canteiro só');
  assert.strictEqual(f.act(P, { k: 'outra', i: 0 }).reason, 'acao');
});

test('recordes pessoais: maior colheita, favorita, totais', () => {
  const k = clock();
  let roll = 0;
  const f = createFarm({ now: k.now, rng: () => roll });
  f.plant(P, 0, 'tomate');
  k.go(C.CROP.tomate.t);
  f.harvest(P, 0);
  roll = 0.999;
  f.plant(P, 0, 'morango');
  k.go(C.CROP.morango.t);
  f.harvest(P, 0);
  f.plant(P, 0, 'morango');
  k.go(C.CROP.morango.t);
  f.harvest(P, 0);
  const r = f.view(P).rec;
  assert.strictEqual(r.harvests, 3);
  assert.strictEqual(r.kinds, 2);
  assert.strictEqual(r.planted, 3);
  assert.strictEqual(r.units, C.CROP.tomate.y[0] + C.CROP.morango.y[1] * 2);
  assert.deepStrictEqual({ c: r.best.c, n: r.best.n }, { c: 'morango', n: C.CROP.morango.y[1] });
  assert.deepStrictEqual(r.fav, { c: 'morango', n: 2 });
});

test('conquistas: saem dos contadores; o perfil público só vê as ganhas', () => {
  const k = clock(),
    f = createFarm({ now: k.now, rng: () => 0 });
  assert.strictEqual(f.badgesOf(P).length, 0);
  f.plant(P, 0, 'tomate');
  k.go(C.CROP.tomate.t);
  const h = f.harvest(P, 0);
  assert.deepStrictEqual(
    h.badges.map(b => b.id),
    ['semente']
  );
  assert.deepStrictEqual(f.badgesOf(P), [{ id: 'semente', name: 'Primeira Semente', icon: '🌱' }]);
  assert.strictEqual(f.view(P).badges.length, BADGES.length, 'o painel mostra todas, ganhas ou não');
  assert.deepStrictEqual(
    f.publicOf(P).badges.map(b => b.id),
    ['semente']
  );
  assert.strictEqual(f.publicOf(Q).rec.harvests, 0, 'quem nunca plantou tem fazenda vazia');
  assert.ok(!('done' in f.publicOf(P)), 'o público não recebe o caderno inteiro');
});

test('disco: grava agrupado, volta igual e descarta o que não confere', () => {
  const file = tmp(),
    k = clock();
  const f = createFarm({ file, now: k.now, rng: () => 0, delayMs: 10 });
  f.plant(P, 0, 'tomate');
  f.plant(P, 1, 'cenoura');
  k.go(C.CROP.tomate.t);
  f.harvest(P, 0);
  f.flush();
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  const g = createFarm({ file, now: k.now });
  assert.deepStrictEqual(g.view(P).plots, f.view(P).plots);
  assert.deepStrictEqual(g.view(P).rec, f.view(P).rec);
  // arquivo adulterado: planta inexistente, canteiro fora da grade, contagens absurdas e id inválido somem
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.p[P].s['99'] = { c: 'tomate', a: 1, e: 2, w: 0 };
  raw.p[P].s['5'] = { c: 'ouro', a: 1, e: 2, w: 0 };
  raw.p[P].d.ouro = 5;
  raw.p[P].x = 1e15;
  raw.p['nao-e-id'] = raw.p[P];
  fs.writeFileSync(file, JSON.stringify(raw));
  const h = createFarm({ file, now: k.now });
  const v = h.view(P);
  assert.strictEqual(v.plots[5], null);
  assert.strictEqual(v.plots.length, SLOTS);
  assert.ok(!('ouro' in v.done));
  assert.strictEqual(v.xp, 0, 'experiência fora da faixa vira 0');
  assert.strictEqual(h.size(), 1);
});

test('teto de fazendas: jogador novo não entra quando está cheio', () => {
  const f = createFarm({ max: 1 });
  assert.ok(f.plant(P, 0, 'tomate').ok);
  assert.strictEqual(f.plant(Q, 0, 'tomate').reason, 'full');
  assert.strictEqual(f.size(), 1);
});
