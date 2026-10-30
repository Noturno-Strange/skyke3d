'use strict';

// Modo Sobrevivência: os números ficam em SURV (assets/catalog.js). Estes testes impedem um balanceamento que quebre o modo
// sem aviso: receita com ingrediente que não existe, recurso fora das zonas, rodada fora do tempo combinado, área maior que o cenário.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../assets/catalog.js');
const S = C.SURV;
const base = fs.readFileSync(path.join(__dirname, '..', 'assets/app-base.js'), 'utf8');

const RES = Object.keys(S.res), ZONES = Object.keys(S.zones), METERS = Object.keys(S.meters);
const NOMES = Object.values(S.res).concat(S.recipes, Object.values(S.meters));

test('nomes curtos, com ícone, e ids sem repetição', () => {
  for (const x of NOMES) { assert.ok(x.n && x.n.length <= 16, `nome "${x.n}"`); assert.ok(x.ic, `ícone de ${x.n}`); }
  const ids = [...RES, ...S.recipes.map(r => r.id)];
  assert.strictEqual(new Set(ids).size, ids.length, 'ids de recursos e pratos repetidos');
  assert.strictEqual(S.recipes.length >= 5, true);
});

test('área andável: maior que a do jogo normal e antes das montanhas', () => {
  const walk = base.match(/const WALK=\{x:0,z:1\.2,r:([\d.]+)\}/), ground = base.match(/GROUND=(\d+)/);
  assert.ok(walk && ground, 'WALK e GROUND encontrados em app-base.js');
  assert.ok(S.walk.r > +walk[1], 'maior que o raio normal');
  assert.ok(S.walk.r < +ground[1] * .39, 'para antes da primeira camada de montanhas');
  assert.strictEqual(S.walk.x, 0); assert.strictEqual(S.walk.z, 1.2, 'mesmo centro do jogo normal');
});

test('zonas: contínuas, começam na fogueira e terminam na borda andável', () => {
  const z = ZONES.map(k => S.zones[k]);
  assert.strictEqual(z[0][0], 0);
  for (let i = 1; i < z.length; i++) assert.strictEqual(z[i][0], z[i - 1][1], 'sem buraco entre zonas');
  assert.strictEqual(z[z.length - 1][1], S.walk.r);
});

test('recursos: tipo válido, só em zonas existentes, e o que restaura existe como medidor', () => {
  for (const [id, r] of Object.entries(S.res)) {
    assert.ok(['fuel', 'food', 'drink'].includes(r.kind), id);
    assert.ok(r.give > 0 && r.respawn > 0, id);
    assert.ok(Object.keys(r.spots).length && Object.keys(r.spots).every(z => ZONES.includes(z)), `${id}: zona`);
    assert.ok(Object.values(r.spots).every(n => Number.isInteger(n) && n > 0), `${id}: pontos`);
    if (r.kind === 'fuel') assert.ok(r.fuel > 0, id);
    for (const m of ['fome', 'sede', 'calor']) if (m in r) assert.ok(METERS.includes(m) && r[m] > 0, `${id}.${m}`);
  }
});

test('receitas: ingredientes existem, resultado restaura algo e o fogo é o único lugar da V1', () => {
  for (const r of S.recipes) {
    assert.ok(r.ins.length >= 1 && r.ins.length <= 3, r.id);
    assert.ok(r.ins.every(i => RES.includes(i) && S.res[i].kind !== 'fuel'), `${r.id}: ingrediente`);
    assert.strictEqual(r.onde, 'fogueira', r.id);
    assert.ok(r.time > 0 && r.time < S.cook.burn, `${r.id}: tempo`);
    assert.ok(METERS.some(m => r[m] > 0), `${r.id}: não restaura nada`);
    const cru = r.ins.reduce((n, i) => n + (S.res[i].fome || 0), 0);
    if (r.fome) assert.ok(r.fome > cru, `${r.id}: cozinhar tem que valer mais que comer cru`);
  }
  const chave = r => [...r.ins].sort().join('+');
  assert.strictEqual(new Set(S.recipes.map(chave)).size, S.recipes.length, 'duas receitas com os mesmos ingredientes');
});

test('rodada de 10 a 20 minutos e fogueira possível de manter', () => {
  const ciclo = S.time.day + S.time.night, [a, b] = S.run.nights;
  assert.ok(a <= S.run.def && S.run.def <= b);
  assert.ok(ciclo * a >= 600 && ciclo * b <= 1200, `rodada de ${ciclo * a / 60} a ${ciclo * b / 60} min`);
  const gasto = (S.time.day * S.fire.burn + S.time.night * S.fire.burn * S.fire.nightX) * S.run.def;
  const rodada = ciclo * S.run.def, L = S.res.lenha;
  const lenha = Object.values(L.spots).reduce((x, y) => x + y, 0) * (1 + Math.floor(rodada / L.respawn)) * L.fuel * L.give;
  assert.ok(lenha >= gasto * 1.5, `só ${lenha} de combustível (contando o retorno dos pontos) para gastar ${Math.round(gasto)}`);
  assert.ok(S.fire.start <= S.fire.max && S.fire.relightFuel <= S.fire.max);
  assert.ok(Object.keys(S.fire.relight).every(k => RES.includes(k) && S.res[k].kind === 'fuel'));
});

test('medidores: começam cheios o bastante e não zeram sozinhos antes da primeira noite', () => {
  for (const [k, m] of Object.entries(S.meters)) {
    assert.ok(m.start <= m.max && m.drain > 0 && m.nightX >= 1, k);
    assert.ok(m.start - m.drain * S.time.day > 0, `${k} zeraria antes do fim do primeiro dia`);
  }
  assert.ok(S.revive.back > 0 && S.revive.back <= S.meters.calor.max && S.revive.hold > 0);
  assert.ok(S.run.minPlayers >= 2 && S.run.minSec >= 180);
});
