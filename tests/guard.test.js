'use strict';
// Antifraude da fazenda e da culinária (lib/guard.js): ritmo de robô, rajada, descanso, cansaço do dia, identidades em série.
const test = require('node:test');
const assert = require('node:assert');
const { createGuard } = require('../lib/guard.js');

const P = 'a'.repeat(20),
  Q = 'b'.repeat(20);
const clock = (t = 1e12) => {
  const c = { t, now: () => c.t, go: ms => (c.t += ms) };
  return c;
};

test('pessoa jogando normal (intervalos irregulares) não é sinalizada e ganha tudo', () => {
  const k = clock(),
    g = createGuard({ now: k.now });
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 200; i++) {
    k.go(400 + rnd() * 3000);
    assert.ok(g.check(P).ok);
    g.act(P);
  }
  assert.strictEqual(g.report().watched, 0);
  assert.strictEqual(g.factor(P, 'farm', 10), 1);
});

test('ritmo de robô: intervalos iguais somam suspeita, cortam o ganho pela metade e depois dão descanso', () => {
  const k = clock(),
    g = createGuard({ now: k.now });
  for (let i = 0; i < 17; i++) {
    k.go(1000);
    g.act(P);
  }
  let r = g.report();
  assert.strictEqual(r.watched, 1);
  assert.strictEqual(r.top[0].why, 'ritmo de robô');
  assert.strictEqual(r.top[0].id, P.slice(0, 8), 'só o código encurtado vai para o painel');
  assert.strictEqual(r.robo, 1);
  for (let i = 0; i < 17; i++) {
    k.go(1000);
    g.act(P);
  }
  assert.strictEqual(g.factor(P, 'farm', 10), 0.5, 'suspeita alta: metade do ganho');
  for (let i = 0; i < 34; i++) {
    k.go(1000);
    g.act(P);
  }
  const c = g.check(P);
  assert.strictEqual(c.ok, false);
  assert.strictEqual(c.reason, 'descanso');
  assert.ok(c.wait > 0 && c.wait <= 600);
  assert.strictEqual(g.factor(P, 'farm', 10), 0, 'em descanso não ganha nada');
  assert.ok(g.check(Q).ok, 'os outros jogadores não são afetados');
  // descanso acaba e a suspeita cai com o tempo
  k.go(601000);
  assert.ok(g.check(P).ok);
  k.go(3600000);
  assert.strictEqual(g.report().watched, 0, 'a suspeita some com o tempo');
  r = g.report();
  assert.ok(r.descanso >= 1);
});

test('rajada: ações demais em pouco tempo, mesmo irregulares, somam suspeita', () => {
  const k = clock(),
    g = createGuard({ now: k.now, burst: 90 });
  const gaps = [100, 300, 150, 420, 90, 260];
  for (let i = 0; i < 24; i++) {
    k.go(gaps[i % gaps.length]);
    g.act(P);
  }
  const r = g.report();
  assert.strictEqual(r.rajada, 1);
  assert.strictEqual(r.top[0].why, 'rajada');
});

test('cansaço: acima do teto do dia rende metade, acima do dobro um quinto; volta ao normal depois de 24 h', () => {
  const k = clock(),
    g = createGuard({ now: k.now, caps: { farm: 100, cook: 50 } });
  assert.strictEqual(g.factor(P, 'farm', 60), 1);
  assert.strictEqual(g.factor(P, 'farm', 60), 1, 'ainda abaixo do teto antes de somar');
  assert.strictEqual(g.factor(P, 'farm', 60), 0.5, '120 ≥ 100');
  assert.strictEqual(g.factor(P, 'farm', 60), 0.5, '180 ainda abaixo do dobro');
  assert.strictEqual(g.factor(P, 'farm', 60), 0.2, '240 ≥ 200: um quinto');
  assert.strictEqual(g.factor(P, 'cook', 10), 1, 'cada sistema tem o seu teto');
  k.go(25 * 3600000);
  assert.strictEqual(g.factor(P, 'farm', 10), 1, 'as 24 h passaram');
});

test('identidades em série: cada origem abre poucas fazendas e cozinhas novas por dia', () => {
  const k = clock(),
    g = createGuard({ now: k.now, newPerDay: 2 });
  for (let i = 0; i < 2; i++) {
    assert.ok(g.mayOpen('203.0.113.9', 'farm'));
    g.opened('203.0.113.9', 'farm');
  }
  assert.strictEqual(g.mayOpen('203.0.113.9', 'farm'), false);
  assert.ok(g.mayOpen('203.0.113.9', 'cook'), 'a cozinha conta à parte');
  assert.ok(g.mayOpen('198.51.100.1', 'farm'), 'outra origem não é afetada');
  assert.ok(g.mayOpen('203.0.113.9', 'farm') === false && g.report().novos >= 2);
  k.go(24 * 3600000 + 1);
  assert.ok(g.mayOpen('203.0.113.9', 'farm'), 'no dia seguinte libera');
});

test('memória limitada: o jogador mais antigo sai quando passa do teto', () => {
  const g = createGuard({ max: 3 });
  for (const id of ['1', '2', '3', '4', '5']) g.act(id.repeat(20));
  assert.strictEqual(g.size(), 3);
});
