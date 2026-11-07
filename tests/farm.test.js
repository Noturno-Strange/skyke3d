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
  // terreno: começa com 6 canteiros e o último abre a grade toda; cada tamanho é um retângulo que cresce a partir do canto
  assert.strictEqual(C.farmOpen(0).length, 6);
  assert.strictEqual(C.farmOpen(C.FARM_LAND.length - 1).length, SLOTS);
  assert.strictEqual(new Set(C.FARM_ORDER).size, SLOTS);
  for (let t = 0; t < C.FARM_LAND.length; t++) {
    const o = C.farmOpen(t), rows = new Set(o.map(i => Math.floor(i / C.FARM_W))), cols = new Set(o.map(i => i % C.FARM_W));
    assert.strictEqual(rows.size * cols.size, o.length, 'terreno ' + t + ' é um retângulo');
    if (t) assert.ok(C.FARM_LAND[t].$ > C.FARM_LAND[t - 1].$ && C.FARM_LAND[t].p > C.FARM_LAND[t - 1].p, 'cada terreno custa e rende mais');
  }
  for (const list of [C.FARM_PROP, C.FARM_HOUSE]) {
    assert.strictEqual(list[0].$, 0, 'o primeiro é de graça');
    for (let t = 1; t < list.length; t++) assert.ok(list[t].$ > list[t - 1].$ && list[t].b > list[t - 1].b);
  }
  for (const c of C.CROPS) assert.ok(Number.isInteger(c.$) && c.$ >= 1, c.id + ': preço');
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
  assert.strictEqual(r.n, C.farmOpen(0).length, 'todos os abertos');
  assert.strictEqual(f.plant(P, -1, 'morango').reason, 'cheio');
  assert.strictEqual(f.water(P, -1).n, C.farmOpen(0).length);
  k.go(C.CROP.morango.t);
  const h = f.harvest(P, -1);
  assert.strictEqual(h.n, C.farmOpen(0).length);
  assert.ok(h.got.every(g => g.n === C.CROP.morango.y[1] + 1), 'máximo com rng alto, +1 regada');
  assert.strictEqual(h.got.filter(g => g.first).length, 1, 'só a primeira conta como nova');
});

test('nível libera sementes; canteiro fechado (terreno não comprado) e semente bloqueada são recusados', () => {
  const k = clock(),
    f = createFarm({ now: k.now, rng: () => 0 });
  assert.strictEqual(f.plant(P, 0, 'arvore').reason, 'nivel');
  const closed = C.FARM_ORDER[C.farmOpen(0).length];
  assert.strictEqual(f.plant(P, closed, 'tomate').reason, 'fechado');
  assert.strictEqual(f.plant(P, SLOTS, 'tomate').reason, 'canteiro');
  assert.strictEqual(f.plant(P, 0, 'nada').reason, 'semente');
  assert.strictEqual(f.plant('x', 0, 'tomate').reason, 'pid');
  let up = null;
  for (let n = 0; n < 50 && !up; n++) {
    f.plant(P, -1, 'margarida');
    k.go(C.CROP.margarida.t);
    const h = f.harvest(P, -1);
    if (h.lvUp) up = h;
  }
  assert.ok(up, 'subiu de nível');
  assert.strictEqual(f.view(P).open, 6, 'subir de nível não abre canteiro: o terreno é comprado');
  assert.strictEqual(levelOf(xpFor(MAX_LEVEL) * 2), MAX_LEVEL);
});

test('moedas: a colheita vende pelo preço da planta; a loja compra terreno, propriedade e casa com nível e moedas', () => {
  const k = clock(),
    f = createFarm({ now: k.now, rng: () => 0 });
  assert.strictEqual(f.buy(P, 'land').reason, 'nivel', 'a Horta pede nível 2');
  f.plant(P, -1, 'tomate');
  k.go(C.CROP.tomate.t);
  const h = f.harvest(P, -1);
  assert.strictEqual(h.coins, 6 * C.CROP.tomate.y[0] * C.CROP.tomate.$);
  assert.strictEqual(f.view(P).coins, h.coins);
  // sobe de nível e junta moedas com margaridas
  for (let n = 0; n < 40; n++) {
    f.plant(P, -1, 'margarida');
    k.go(C.CROP.margarida.t);
    f.harvest(P, -1);
  }
  const v = f.view(P);
  assert.ok(v.lv >= 3 && v.coins >= C.FARM_LAND[1].$, 'nível e moedas para a Horta');
  const b = f.buy(P, 'land');
  assert.ok(b.ok && b.tier === 1 && b.name === C.FARM_LAND[1].n);
  assert.strictEqual(b.state.coins, v.coins - C.FARM_LAND[1].$, 'o preço sai do saldo');
  assert.strictEqual(b.state.open, C.FARM_LAND[1].p, 'mais canteiros abertos');
  assert.ok(f.plant(P, C.FARM_ORDER[6], 'tomate').ok, 'o canteiro novo aceita planta');
  assert.strictEqual(f.buy(P, 'casa').reason, 'loja');
  assert.strictEqual(f.buy(Q, 'land').reason, 'nivel');
  // sem moedas não compra; o máximo avisa
  const g = createFarm({ now: k.now });
  assert.strictEqual(g.act(P, { k: 'buy', b: 'house' }).reason, 'nivel');
  assert.strictEqual(f.view(P).rec.earned >= v.coins, true, 'recorde de moedas ganhas');
});

test('propriedade dá colheita maior e casa dá mais experiência', () => {
  const k = clock(),
    f = createFarm({ now: k.now, rng: () => 0 });
  f.plant(P, 0, 'tomate');
  k.go(C.CROP.tomate.t);
  const base = f.harvest(P, 0);
  // força os níveis da loja por um arquivo (o mesmo caminho de quem comprou)
  const file = tmp();
  fs.writeFileSync(file, JSON.stringify({ v: 2, p: { [P]: { x: 100, d: { tomate: 1 }, s: {}, p: 1, tp: 4, th: 4, m: 0 } } }));
  const g = createFarm({ file, now: k.now, rng: () => 0 });
  g.plant(P, 0, 'tomate');
  k.go(C.CROP.tomate.t);
  const big = g.harvest(P, 0);
  assert.strictEqual(big.got[0].n, Math.round(C.CROP.tomate.y[0] * (1 + C.FARM_PROP[4].b)), 'colheita +40%');
  assert.strictEqual(big.xp, Math.round(C.CROP.tomate.xp * (1 + C.FARM_HOUSE[4].b)), 'experiência +20%');
  assert.ok(big.got[0].n > base.got[0].n && big.xp > C.CROP.tomate.xp, 'rende mais que sem loja');
});

test('antifraude: o fator de ganho corta experiência e moedas e o resultado avisa quanto', () => {
  const k = clock(),
    seen = [];
  const f = createFarm({ now: k.now, rng: () => 0, gain: (pid, xp) => (seen.push([pid, xp]), 0.5) });
  f.plant(P, 0, 'tomate');
  k.go(C.CROP.tomate.t);
  const h = f.harvest(P, 0);
  assert.deepStrictEqual(seen, [[P, C.CROP.tomate.xp * 3]], 'o antifraude vê o ganho bruto');
  assert.strictEqual(h.xp, Math.round((C.CROP.tomate.xp * 3) / 2));
  assert.strictEqual(h.coins, Math.round((C.CROP.tomate.y[0] * C.CROP.tomate.$) / 2));
  assert.strictEqual(h.cut, 50);
  assert.strictEqual(h.got[0].n, C.CROP.tomate.y[0], 'a colheita em si não muda (só o ganho)');
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

test('arquivo da primeira versão (grade 6×6, sem moedas): ganha o terreno que cabia e as plantas vão para canteiros abertos', () => {
  const file = tmp(),
    k = clock();
  // nível 3 (6 + 2 × 3 = 12 canteiros) com 3 plantas nos canteiros 0, 7 e 11 da grade antiga
  const pl = { c: 'tomate', a: k.t, e: k.t + 120000, w: 0 };
  fs.writeFileSync(file, JSON.stringify({ v: 1, p: { [P]: { x: xpFor(3), d: { tomate: 2 }, s: { 0: pl, 7: pl, 11: pl }, q: 6, h: 2, w: 0, p: 5 } } }));
  const f = createFarm({ file, now: k.now });
  const v = f.view(P);
  assert.ok(v.open >= 12, 'continua com pelo menos 12 canteiros');
  assert.strictEqual(v.coins, 0);
  const open = new Set(C.farmOpen(v.land));
  const placed = v.plots.map((p, i) => (p ? i : -1)).filter(i => i >= 0);
  assert.strictEqual(placed.length, 3, 'nenhuma planta se perde');
  assert.ok(placed.every(i => open.has(i)), 'todas em canteiros abertos');
  f.flush();
  f.plant(P, -1, 'tomate');
  f.flush();
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).v, 2, 'grava no formato novo');
});

test('nova safra: só no nível 999; volta ao 1 com +1 safra, guarda o que foi comprado e rende mais daí em diante', () => {
  const file = tmp(),
    k = clock();
  fs.writeFileSync(file, JSON.stringify({ v: 2, p: { [P]: { x: xpFor(MAX_LEVEL), d: { tomate: 3 }, s: {}, p: 3, m: 500, me: 900, tl: 2, tp: 1, th: 1 } } }));
  const f = createFarm({ file, now: k.now, rng: () => 0 });
  assert.strictEqual(f.renew(Q).reason, 'nivel', 'quem não chegou no 999 não renasce');
  const v0 = f.view(P);
  assert.ok(v0.max && v0.lv === MAX_LEVEL && v0.rank === 0);
  const r = f.renew(P);
  assert.ok(r.ok && r.rank === 1);
  assert.deepStrictEqual(r.badges.map(b => b.id), ['safra1']);
  const v = r.state;
  assert.strictEqual(v.lv, 1);
  assert.strictEqual(v.rank, 1);
  assert.deepStrictEqual([v.coins, v.land, v.prop, v.house], [500, 2, 1, 1], 'moedas e compras ficam');
  assert.ok(v.badges.find(b => b.id === 'fazendeiro').on, 'o emblema de nível 10 não some ao voltar ao nível 1');
  assert.strictEqual(f.renew(P).reason, 'nivel', 'no nível 1 não renasce de novo');
  // a próxima colheita rende +10% de experiência e +5% nas moedas
  f.plant(P, 0, 'tomate');
  k.go(C.CROP.tomate.t);
  const h = f.harvest(P, 0);
  const n = Math.round(C.CROP.tomate.y[0] * (1 + C.FARM_PROP[1].b));
  assert.strictEqual(h.xp, Math.round(C.CROP.tomate.xp * (1 + C.FARM_HOUSE[1].b) * 1.1));
  assert.strictEqual(h.coins, Math.round(n * C.CROP.tomate.$ * 1.05));
  assert.strictEqual(f.publicOf(P).rank, 1, 'a página pública mostra as safras');
  assert.ok(f.badgesOf(P).some(b => b.id === 'safra1'), 'o emblema vai para o perfil');
});

test('a experiência cresce com o nível: no nível 101 a mesma colheita vale o dobro', () => {
  const file = tmp(),
    k = clock();
  fs.writeFileSync(file, JSON.stringify({ v: 2, p: { [P]: { x: xpFor(101), d: { tomate: 1 }, s: {}, p: 1 } } }));
  const f = createFarm({ file, now: k.now, rng: () => 0 });
  f.plant(P, 0, 'tomate');
  k.go(C.CROP.tomate.t);
  assert.strictEqual(f.harvest(P, 0).xp, C.CROP.tomate.xp * 2);
});

test('teto de fazendas: jogador novo não entra quando está cheio', () => {
  const f = createFarm({ max: 1 });
  assert.ok(f.plant(P, 0, 'tomate').ok);
  assert.strictEqual(f.plant(Q, 0, 'tomate').reason, 'full');
  assert.strictEqual(f.size(), 1);
});
