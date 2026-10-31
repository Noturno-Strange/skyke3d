'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { createSurvStats } = require('../survstats');
const { SURV: S } = require('../assets/catalog.js');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-ss-')), 's.json');
const T0 = Date.parse('2026-10-30T12:00:00Z');
const mk = o => createSurvStats({ S, worlds: ['acampamento'], now: () => T0, delayMs: 20, ...o });
const run = o => ({ world: 'acampamento', nights: 4, sec: 960, players: 3, meals: 5, faints: 1, causes: { sede: 1 }, dishes: { sopa: 2 }, ...o });

test('só conta rodada de verdade (gente e tempo mínimos, mundo conhecido)', () => {
  const s = mk();
  assert.strictEqual(s.record(run({ players: 1 })), false);
  assert.strictEqual(s.record(run({ sec: 100 })), false);
  assert.strictEqual(s.record(run({ world: 'proxima' })), false);
  assert.strictEqual(s.record(null), false);
  assert.deepStrictEqual(s.record(run()), { rec: true }, 'a primeira rodada que conta já é o recorde de tempo');
  assert.strictEqual(s.totals.runs, 1);
});

test('totais, recorde de tempo, melhor rodada, causas e pratos', () => {
  const s = mk();
  assert.deepStrictEqual(s.record(run()), { rec: true });
  assert.deepStrictEqual(s.record(run({ nights: 2, sec: 500, faints: 3, causes: { fome: 2, calor: 1 }, dishes: {} })), { rec: false }, 'rodada mais curta não é recorde');
  assert.deepStrictEqual(s.record(run({ sec: 1500, nights: 6, faints: 0 })), { rec: true }, 'mais tempo bate o recorde');
  const v = JSON.parse(s.view({ rooms: 1, players: 2 }));
  assert.strictEqual(v.runs, 3); assert.strictEqual(v.bestSec, 1500); assert.strictEqual(v.records.timeSec, 1500); assert.strictEqual(v.records.timePlayers, 3);
  assert.strictEqual(v.avgSec, Math.round((960 + 500 + 1500) / 3)); assert.strictEqual(v.bestNights, 6);
  assert.deepStrictEqual(v.worlds[0].best, { sec: 1500, nights: 6, players: 3, faints: 0, at: T0 / 1000 }, 'mais tempo sobrevivendo, depois menos desmaios');
  assert.deepStrictEqual(Object.fromEntries(v.causes.map(c => [c.k, c.n])), { sede: 2, fome: 2, calor: 1 });
  assert.deepStrictEqual(v.dishes, [{ id: 'sopa', n: 4 }]);
  assert.strictEqual(v.today, 3); assert.strictEqual(v.days.length, 30); assert.strictEqual(v.days[29].runs, 3); assert.deepStrictEqual(v.live, { rooms: 1, players: 2 });
  assert.strictEqual(v.wins, undefined, 'não existe mais vitória'); assert.strictEqual(v.rate, undefined);
});

test('o JSON público não traz nome, IP, sala nem semente', () => {
  const s = mk(); s.record({ ...run(), name: 'Ana', ip: '1.2.3.4', code: 'ABCDE', seed: 7 });
  const txt = s.view({ rooms: 0, players: 0 });
  for (const x of ['Ana', '1.2.3.4', 'ABCDE', 'seed', 'name', 'code']) assert.ok(!txt.includes(x), x);
});

test('grava, recarrega, ignora lixo e começa do zero com arquivo inválido', () => {
  const f = tmp(), A = mk({ file: f }); A.record(run()); A.write();
  const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.causes.xpto = 9; j.dishes.zzz = 9; j.worlds.outro = { runs: 1 }; j.tot.runs = -5; fs.writeFileSync(f, JSON.stringify(j));
  const B = mk({ file: f }), v = JSON.parse(B.view({}));
  assert.strictEqual(v.runs, 0, 'valor negativo vira zero'); assert.strictEqual(v.causes.length, 1); assert.strictEqual(v.worlds.length, 1);
  fs.writeFileSync(f, '{x'); const w = []; assert.strictEqual(mk({ file: f, warn: m => w.push(m) }).totals.runs, 0); assert.strictEqual(w.length, 1);
});

test('dias antigos saem e o gráfico tem sempre 30 dias', () => {
  let t = T0; const s = createSurvStats({ S, worlds: ['acampamento'], now: () => t });
  s.record(run()); t = T0 + 70 * 86400000; s.record(run());
  const v = JSON.parse(s.view({})); assert.strictEqual(v.days.length, 30); assert.strictEqual(v.runs, 2); assert.strictEqual(v.days.reduce((n, x) => n + x.runs, 0), 1);
});

test('totais e recordes de maçãs, pratos e fogueiras: por jogador e pelo grupo, só números', () => {
  const s = mk(), per = (a, c, l) => ({ ct: { 'col.fruta': a, cook: c, lit: l } });
  s.record(run(), { p1: per(17, 9, 2), p2: per(8, 4, 1) });
  s.record(run(), { p1: per(5, 1, 0), p2: per(30, 2, 3) });
  s.record(run({ players: 1 }), { p1: per(999, 999, 999) });
  const v = JSON.parse(s.view({ rooms: 0, players: 0 }));
  assert.deepStrictEqual([v.apples, v.cooked, v.lit], [60, 16, 6], 'rodada que não conta não soma');
  assert.deepStrictEqual(v.records, { cookOne: 9, cookGroup: 13, appleOne: 30, appleGroup: 35, litOne: 3, litGroup: 3, timeSec: 960, timePlayers: 3, timeAt: T0 / 1000 });
  const txt = JSON.stringify(v); assert.ok(!txt.includes('p1') && !txt.includes('p2'), 'sem ids de jogador');
  const f = tmp(), A = mk({ file: f }); A.record(run(), { p1: per(4, 2, 1) }); A.write();
  assert.strictEqual(JSON.parse(mk({ file: f }).view({})).apples, 4, 'persiste e recarrega');
  s.record(run(), { p1: { ct: { 'col.fruta': 'x', cook: -3, lit: NaN } }, p2: null, p3: 5 });
});
