'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../lib/pet-care.js');
const G = require('../lib/pet-genes.js');

const H = 3600000,
  D = 86400000,
  T0 = Date.UTC(2026, 10, 4, 12);
const mk = (pe = 3, now = T0) => {
  const genes = { ...G.genesFromSeed('0123456789abcdef', 0), pe, ac: 0 };
  return C.newPet({ seed: '0123456789abcdef', attempt: 0, genes, name: 'Bolinha', now });
};

test('começa saudável, com a conquista do primeiro dia e sem vínculo', () => {
  const p = mk();
  assert.strictEqual(p.a.health, 100);
  assert.strictEqual(p.a.bond, 0);
  assert.ok(p.un.adotado);
  assert.strictEqual(C.ageDays(p, T0), 0);
});

test('as necessidades caem com o tempo, inclusive offline, e nunca passam do piso (não morre)', () => {
  const p = mk();
  C.settle(p, T0 + 10 * H);
  assert.ok(p.a.food < 70 && p.a.food > 30, 'comida cai ~3 por hora: ' + p.a.food);
  C.settle(p, T0 + 400 * D);
  for (const k of C.NEEDS) assert.ok(p.a[k] >= C.FLOOR[k], k + ' respeita o piso: ' + p.a[k]);
  assert.ok(p.a.health >= 30, 'saúde nunca abaixo de 30');
  assert.ok(p.a.food >= 8);
  const q = mk();
  C.settle(q, T0 + 96 * H);
  const r = mk();
  C.settle(r, T0 + 5000 * H);
  assert.deepStrictEqual(r.a, q.a, 'ausência acima de 96 h não pesa mais');
});

test('settle é idempotente para o mesmo instante e ignora relógio que volta', () => {
  const p = mk();
  C.settle(p, T0 + 5 * H);
  const a = JSON.stringify(p.a);
  C.settle(p, T0 + 5 * H);
  C.settle(p, T0 + 2 * H);
  assert.strictEqual(JSON.stringify(p.a), a);
});

test('personalidade muda o ritmo: o guloso passa fome mais rápido que o calmo', () => {
  const g = mk(4),
    c = mk(3);
  C.settle(g, T0 + 8 * H);
  C.settle(c, T0 + 8 * H);
  assert.ok(g.a.food < c.a.food);
});

test('alimentar: aumenta a comida, tem espera e recusa quando já está cheio', () => {
  const p = mk();
  C.settle(p, T0 + 10 * H);
  const antes = p.a.food;
  const r = C.act(p, 'feed', T0 + 10 * H);
  assert.strictEqual(r.ok, true);
  assert.ok(p.a.food > antes + 25);
  assert.ok(p.un['primeira-refeicao'], 'conquista liberada');
  const again = C.act(p, 'feed', T0 + 10 * H + 60000);
  assert.deepStrictEqual([again.ok, again.reason], [false, 'cooldown']);
  assert.ok(again.wait > 0 && again.wait <= 15 * 60000);
  const cheio = mk();
  cheio.a.food = 99;
  assert.strictEqual(C.act(cheio, 'feed', T0).reason, 'full');
});

test('condições: cansado não brinca, descansado não descansa, limpo não toma banho', () => {
  const p = mk();
  p.a.energy = 10;
  assert.strictEqual(C.act(p, 'play', T0).reason, 'tired');
  p.a.energy = 95;
  assert.strictEqual(C.act(p, 'rest', T0).reason, 'rested');
  p.a.clean = 95;
  assert.strictEqual(C.act(p, 'clean', T0).reason, 'clean');
  assert.strictEqual(C.act(p, 'inventada', T0).reason, 'action');
  assert.strictEqual(C.act(p, '__proto__', T0).reason, 'action');
  assert.strictEqual(p.ct.total, 0, 'recusar não conta');
});

test('ação recusada não muda nada (nem espera, nem história)', () => {
  const p = mk();
  p.a.energy = 95;
  const antes = JSON.stringify(p);
  C.act(p, 'rest', T0);
  assert.strictEqual(JSON.stringify(p), antes);
});

test('vínculo: sobe com o cuidado, tem teto diário e nunca diminui com o tempo', () => {
  const p = mk();
  let t = T0;
  for (let i = 0; i < 200; i++) {
    t += 11 * 60000;
    p.a.energy = 80;
    p.a.food = 50;
    p.a.clean = 50;
    p.a.fun = 50;
    for (const a of ['pet', 'feed', 'play', 'clean', 'rest', 'special']) C.act(p, a, t);
  }
  assert.ok(p.a.bond <= 100);
  const dia0 = Math.floor(T0 / D);
  assert.ok(p.bd.g <= C.BOND_PER_DAY, 'não passa de ' + C.BOND_PER_DAY + ' por dia');
  const b = p.a.bond;
  C.settle(p, t + 90 * D);
  assert.strictEqual(p.a.bond, b, 'o vínculo não cai');
  assert.ok(dia0 >= 0);
});

test('o limite diário de vínculo vale mesmo com muitas ações no mesmo dia', () => {
  const p = mk();
  let t = T0;
  for (let i = 0; i < 60; i++) {
    t += 10 * 60000 + 1;
    p.a.energy = 80;
    C.act(p, 'pet', t);
  }
  assert.ok(p.a.bond <= C.BOND_PER_DAY + 1e-9, 'bond ' + p.a.bond);
});

test('idade e estágio vêm da data de criação, não do tempo conectado', () => {
  const p = mk();
  assert.deepStrictEqual([C.ageDays(p, T0 + 2 * D), C.stageOf(2).name], [2, 'Filhote']);
  assert.strictEqual(C.stageOf(3).name, 'Jovem');
  assert.strictEqual(C.stageOf(10).name, 'Crescido');
  assert.strictEqual(C.stageOf(30).name, 'Veterano');
  C.unlock(p, T0 + 8 * D);
  assert.ok(p.un['uma-semana']);
  C.unlock(p, T0 + 31 * D);
  assert.ok(p.un['um-mes']);
});

test('acessórios: só os liberados e o inicial; trocar mantém os genes', () => {
  const p = mk();
  assert.deepStrictEqual(C.unlockedCosmetics(p), [0]);
  assert.strictEqual(C.dress(p, 3), false);
  C.unlock(p, T0 + 31 * D);
  assert.strictEqual(C.dress(p, 3), true);
  assert.strictEqual(p.cos, 3);
  assert.strictEqual(C.dress(p, 99), false);
  assert.strictEqual(C.dress(p, 1.5), false);
  const g = JSON.stringify(p.g);
  C.dress(p, 0);
  assert.strictEqual(JSON.stringify(p.g), g);
});

test('estado de ânimo e atenção', () => {
  const p = mk();
  assert.ok(!C.needsAttention(p));
  assert.strictEqual(C.mood(p).state, 'idle');
  p.a.joy = 90;
  assert.strictEqual(C.mood(p).state, 'happy');
  p.a.food = 10;
  assert.ok(C.needsAttention(p));
  assert.strictEqual(C.mood(p).text, 'Está com fome.');
  p.a.energy = 5;
  assert.strictEqual(C.mood(p).state, 'sleep');
});

test('visão pública não traz necessidades nem seed; a do dono traz o que a tela precisa', () => {
  const p = mk();
  const pub = C.publicView(p, T0 + D);
  assert.ok(!('a' in pub) && !('sd' in pub) && !('seed' in pub) && !('cd' in pub));
  assert.strictEqual(pub.age, 1);
  assert.ok(pub.bondName && pub.ach.length >= 1);
  const own = C.ownerView(p, T0);
  assert.ok(own.a.food >= 0 && own.cd && own.mood && Array.isArray(own.next));
  assert.ok(!('sd' in own) && !('seed' in own), 'nem o dono recebe a seed');
});
