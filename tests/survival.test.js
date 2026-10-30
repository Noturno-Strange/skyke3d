'use strict';

// Motor do modo Sobrevivência (survival.js): regras puras, testadas sem rede nem relógio.
const test = require('node:test');
const assert = require('node:assert');
const SV = require('../survival');
const { SURV: S } = require('../assets/catalog.js');

const mk = (o = {}) => { const st = SV.create({ seed: 7, ...o }); SV.addPlayer(st, 'a'); return st; };
const run = (st, sec, step = 1) => { const ev = []; for (let t = 0; t < sec; t += step) ev.push(...SV.tick(st, step)); return ev; };
const put = (st, id, x, z) => SV.setPos(st, id, x, z);
const give = (st, id, res, n = 1) => { const p = st.P.get(id); p.inv[res] = (p.inv[res] || 0) + n; };
const far = st => put(st, 'a', 20, 0);
// sem desgaste dos medidores: para testar o relógio e os eventos sem o grupo desmaiar no meio
const calm = st => { st.S = { ...S, meters: Object.fromEntries(Object.entries(S.meters).map(([k, m]) => [k, { ...m, drain: 0 }])) }; return st; };

test('dia vira noite e a noite vira dia, com o número da noite', () => {
  const st = calm(mk({ nights: 3 }));
  const ev = run(st, S.time.day + S.time.night + 1).filter(e => e.t === 'night' || e.t === 'day');
  assert.deepStrictEqual(ev.map(e => e.t + e.n), ['night1', 'day1']);
  assert.strictEqual(SV.nightsDone(st), 1);
});

test('medidores caem; noite gasta mais; perto da fogueira o calor sobe', () => {
  const st = mk(); far(st);
  run(st, 10);
  const dia = S.meters.fome.start - st.P.get('a').m.fome;
  assert.ok(Math.abs(dia - S.meters.fome.drain * 10) < 1e-6);
  st.t = S.time.day; const antes = st.P.get('a').m.calor; run(st, 10);
  assert.ok(antes - st.P.get('a').m.calor > S.meters.calor.drain * 10 * 2, 'calor cai mais à noite');
  const b = mk(); put(b, 'a', 1, 0); b.P.get('a').m.calor = 50; run(b, 5);
  assert.ok(b.P.get('a').m.calor > 50, 'sobe junto da fogueira');
});

test('fogueira gasta mais à noite, apaga e sem combustível não aquece', () => {
  const d = mk(), n = mk(); n.t = S.time.day;
  run(d, 10); run(n, 10);
  assert.ok(n.fire < d.fire);
  const st = mk(); st.fire = .1; put(st, 'a', 1, 0); st.P.get('a').m.calor = 50;
  const ev = run(st, 3);
  assert.ok(ev.some(e => e.t === 'fireout') && st.fire === 0);
  assert.ok(st.P.get('a').m.calor < 50, 'apagada: volta a esfriar');
});

test('combustível: lenha repõe, apagada exige gravetos para reacender', () => {
  const st = mk(); put(st, 'a', 1, 0);
  assert.strictEqual(SV.addFuel(st, 'a', 'lenha').err, 'sem_item');
  give(st, 'a', 'lenha', 2); const f0 = st.fire;
  assert.deepStrictEqual(SV.addFuel(st, 'a', 'lenha'), { ok: 1 });
  assert.strictEqual(st.fire, f0 + S.res.lenha.fuel);
  assert.strictEqual(SV.relight(st, 'a').err, 'acesa');
  st.fire = 0;
  assert.strictEqual(SV.addFuel(st, 'a', 'lenha').err, 'apagada');
  assert.strictEqual(SV.relight(st, 'a').err, 'sem_item');
  give(st, 'a', 'graveto', 3);
  assert.deepStrictEqual(SV.relight(st, 'a'), { ok: 1 });
  assert.strictEqual(st.fire, S.fire.relightFuel); assert.strictEqual(st.P.get('a').inv.graveto, 0);
  far(st); assert.strictEqual(SV.addFuel(st, 'a', 'lenha').err, 'longe');
});

test('coleta: só perto, uma vez por retorno do recurso', () => {
  const st = mk({ nodes: [{ res: 'fruta', x: 15, z: 0 }] }); put(st, 'a', 5, 0);
  assert.strictEqual(SV.collect(st, 'a', 0).err, 'longe');
  assert.strictEqual(SV.collect(st, 'a', 9).err, 'ponto');
  put(st, 'a', 15.5, 0);
  assert.deepStrictEqual(SV.collect(st, 'a', 0), { ok: 1 });
  assert.strictEqual(st.P.get('a').inv.fruta, 1);
  assert.strictEqual(SV.collect(st, 'a', 0).err, 'vazio');
  st.t += S.res.fruta.respawn; assert.deepStrictEqual(SV.collect(st, 'a', 0), { ok: 1 });
});

test('comer cru restaura e cogumelo pode enjoar (sorteio por semente, igual sempre)', () => {
  const st = mk(); give(st, 'a', 'fruta'); st.P.get('a').m.fome = 10;
  assert.deepStrictEqual(SV.eat(st, 'a', 'fruta'), { ok: 1 });
  assert.strictEqual(st.P.get('a').m.fome, 10 + S.res.fruta.fome);
  assert.strictEqual(SV.eat(st, 'a', 'lenha').err, 'item');
  assert.strictEqual(SV.eat(st, 'a', 'fruta').err, 'sem_item');
  const enjoos = seed => { const s = SV.create({ seed }); SV.addPlayer(s, 'a'); give(s, 'a', 'cogumelo', 40); let n = 0; for (let i = 0; i < 40; i++) { s.P.get('a').sick = 0; SV.eat(s, 'a', 'cogumelo'); if (s.P.get('a').sick) n++; } return n; };
  assert.strictEqual(enjoos(3), enjoos(3));
  assert.ok(enjoos(3) > 5 && enjoos(3) < 35);
});

test('desmaio ao zerar, causa registrada, sem agir; reanimar volta com o mínimo', () => {
  const st = mk(); SV.addPlayer(st, 'b'); far(st); put(st, 'b', 20, 1);
  st.P.get('a').m.sede = .01;
  const ev = run(st, 1);
  assert.ok(ev.some(e => e.t === 'faint' && e.id === 'a' && e.meter === 'sede'));
  assert.strictEqual(SV.eat(st, 'a', 'fruta').err, 'desmaiado');
  assert.strictEqual(SV.reviveStart(st, 'b', 'b').err, 'alvo');
  assert.deepStrictEqual(SV.reviveStart(st, 'b', 'a'), { ok: 1 });
  const evr = run(st, S.revive.hold + 1);
  assert.ok(evr.some(e => e.t === 'revive' && e.id === 'a' && e.by === 'b'));
  const a = st.P.get('a'); assert.strictEqual(a.faint, false);
  assert.ok(Object.values(a.m).every(v => v >= S.revive.back - 1), 'volta com o mínimo (menos o desgaste do tique seguinte)');
  assert.strictEqual(st.stats.causes.sede, 1);
});

test('reanimar para se o colega se afasta ou se quem reanima desmaia', () => {
  const st = mk(); SV.addPlayer(st, 'b'); put(st, 'a', 20, 0); put(st, 'b', 20, 1); st.P.get('a').faint = true;
  SV.reviveStart(st, 'b', 'a'); run(st, 1); put(st, 'b', 25, 0); run(st, S.revive.hold + 2);
  assert.strictEqual(st.P.get('a').faint, true); assert.strictEqual(st.P.get('b').rev, null);
  assert.strictEqual(SV.reviveStart(st, 'b', 'a').err, 'longe');
});

test('culinária: cozinha, fica pronta, serve todos perto com bônus de grupo', () => {
  const st = mk(); SV.addPlayer(st, 'b'); put(st, 'a', 1, 0); put(st, 'b', 2, 1);
  st.P.get('a').m.fome = 10; st.P.get('b').m.fome = 10;
  assert.strictEqual(SV.cookStart(st, 'a', 'raiz_assada').err, 'sem_item');
  assert.strictEqual(SV.cookStart(st, 'a', 'x').err, 'receita');
  give(st, 'a', 'raiz');
  assert.deepStrictEqual(SV.cookStart(st, 'a', 'raiz_assada'), { ok: 1 });
  assert.strictEqual(SV.cookStart(st, 'a', 'raiz_assada').err, 'ocupada');
  assert.strictEqual(SV.cookTake(st, 'a').err, 'nada');
  const ev = run(st, 9, .5); assert.ok(ev.some(e => e.t === 'ready'));
  const r = SV.cookTake(st, 'b');
  assert.deepStrictEqual(r.fed.sort(), ['a', 'b']);
  const v = Math.round(S.recipes.find(x => x.id === 'raiz_assada').fome * S.cook.groupX);
  assert.ok(st.P.get('a').m.fome >= 10 + v - 6 && st.P.get('b').m.fome >= 10 + v - 6, 'recebe o prato (menos o desgaste de 9 s)');
  assert.strictEqual(st.stats.meals, 2); assert.strictEqual(st.pot, null);
});

test('prato esquecido queima e enjoa quem cozinhou; sem fogo a panela espera', () => {
  const st = mk(); put(st, 'a', 1, 0); give(st, 'a', 'fruta'); SV.cookStart(st, 'a', 'fruta_assada');
  st.fire = 0; run(st, 100);
  assert.strictEqual(st.pot.ready, false, 'sem fogo não avança');
  st.fire = 90; const ev = run(st, S.recipes[0].time + S.cook.burn + 3);
  assert.ok(ev.some(e => e.t === 'burnt'));
  assert.strictEqual(st.pot, null);
  assert.ok(st.P.get('a').sick > 0 || ev.length);
});

test('vence ao fim das noites; perde se todos desmaiam; depois do fim nada age', () => {
  const st = mk({ nights: 3 }); put(st, 'a', 1, 0);
  st.fire = 1e9; st.S = { ...S, fire: { ...S.fire, burn: 0 }, meters: Object.fromEntries(Object.entries(S.meters).map(([k, m]) => [k, { ...m, drain: 0 }])) };
  const ev = run(st, 3 * (S.time.day + S.time.night) + 1, 5);
  assert.ok(ev.some(e => e.t === 'end' && e.ok));
  assert.strictEqual(SV.summary(st).ok, true); assert.strictEqual(SV.summary(st).nights, 3);
  assert.strictEqual(SV.eat(st, 'a', 'fruta').err, 'fim'); assert.deepStrictEqual(SV.tick(st, 1), []);
  const lose = mk(); lose.P.get('a').faint = true;
  const e2 = SV.tick(lose, 1); assert.ok(e2.some(e => e.t === 'end' && !e.ok));
  assert.strictEqual(SV.summary(lose).why, 'desmaio');
});

test('defesa: tempo absurdo, posição fora da área e número de noites fora da faixa', () => {
  const st = mk(); SV.tick(st, 1e9); assert.ok(st.t <= 5);
  SV.tick(st, NaN); SV.tick(st, -3); assert.ok(st.t <= 5);
  put(st, 'a', 1e6, 1e6); const p = st.P.get('a');
  assert.ok(Math.hypot(p.x - S.walk.x, p.z - S.walk.z) <= S.walk.r + 1e-9);
  put(st, 'a', NaN, 3); assert.ok(Number.isFinite(p.x));
  assert.strictEqual(SV.create({ nights: 99 }).nights, S.run.nights[1]);
  assert.strictEqual(SV.create({ nights: 0 }).nights, S.run.nights[0]);
  assert.strictEqual(SV.collect(st, 'zzz', 0).err, 'jogador');
});

test('mesma semente e mesmas ações dão a mesma rodada', () => {
  const jogo = () => { const s = SV.create({ seed: 42 }); SV.addPlayer(s, 'a'); give(s, 'a', 'cogumelo', 20); put(s, 'a', 20, 0); const out = []; for (let i = 0; i < 20; i++) { SV.eat(s, 'a', 'cogumelo'); out.push(s.P.get('a').sick > 0); SV.tick(s, 1); } return out; };
  assert.deepStrictEqual(jogo(), jogo());
});
