'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { createSurvStats } = require('../survstats');
const { SURV: S } = require('../assets/catalog.js');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-ss-')), 's.json');
const T0 = Date.parse('2026-10-30T12:00:00Z');
const mk = o => createSurvStats({ S, worlds: ['acampamento'], now: () => T0, delayMs: 20, ...o });
const run = o => ({ ok: true, world: 'acampamento', nights: 4, sec: 960, players: 3, meals: 5, faints: 1, causes: { sede: 1 }, dishes: { sopa: 2 }, ...o });

test('só conta rodada de verdade (gente e tempo mínimos, mundo conhecido)', () => {
  const s = mk();
  assert.strictEqual(s.record(run({ players: 1 })), false);
  assert.strictEqual(s.record(run({ sec: 100 })), false);
  assert.strictEqual(s.record(run({ world: 'proxima' })), false);
  assert.strictEqual(s.record(null), false);
  assert.strictEqual(s.record(run()), true);
  assert.strictEqual(s.totals.runs, 1);
});

test('totais, taxa de sucesso, melhor rodada, causas e pratos', () => {
  const s = mk();
  s.record(run()); s.record(run({ ok: false, nights: 2, sec: 500, faints: 3, causes: { fome: 2, calor: 1 }, dishes: {} })); s.record(run({ nights: 4, faints: 0 }));
  const v = JSON.parse(s.view({ rooms: 1, players: 2 }));
  assert.strictEqual(v.runs, 3); assert.strictEqual(v.wins, 2); assert.strictEqual(v.rate, 67);
  assert.deepStrictEqual(v.worlds[0].best, { nights: 4, sec: 960, players: 3, faints: 0, at: T0 / 1000 }, 'mais noites, depois menos desmaios');
  assert.deepStrictEqual(Object.fromEntries(v.causes.map(c => [c.k, c.n])), { sede: 2, fome: 2, calor: 1 });
  assert.deepStrictEqual(v.dishes, [{ id: 'sopa', n: 4 }]);
  assert.strictEqual(v.today, 3); assert.strictEqual(v.days.length, 30); assert.strictEqual(v.days[29].runs, 3); assert.deepStrictEqual(v.live, { rooms: 1, players: 2 });
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
