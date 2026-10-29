'use strict';

const test = require('node:test');
const assert = require('node:assert');
const B = require('../bots');
const V = require('../validate');

const mkBots = n => Array.from({ length: n }, (_, i) => ({ id: 'b' + i, name: 'Bot' + i }));
const seeded = () => { let s = 12345; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; };

test('normalize: minúsculas, sem acentos e sem pontuação', () => {
  assert.strictEqual(B.normalize('  Olá, Mundo!!! ÀÉÎÕÜ  '), 'ola mundo aeiou');
  assert.strictEqual(B.normalize(null), '');
});

test('qualquer mensagem recebe uma resposta engraçada, sem vazar {n}', () => {
  const st = B.state(), bots = mkBots(3);
  assert.ok(B.hear(st, 'hoje é quarta', bots, 1000, 'Ana', seeded()));
  assert.ok(!/\{n\}/.test(st.q[0].text));
  for (const s of B.JOKES) assert.ok(typeof s === 'string' && s.length < 100, s);
});

test('orçamento da sala: fila de 3, uma fala por vez, 5 falas por 30 s', () => {
  const rand = seeded(), bots = mkBots(20), st = B.state();
  let t = 1e6, said = [];
  for (let i = 0; i < 12; i++) B.hear(st, 'oi galera', bots, t, 'Ana', rand);
  assert.strictEqual(st.q.length, B.MAX_QUEUE, 'fila limitada');
  for (let k = 0; k < 600; k++) { const r = B.tick(st, t + k * 100, bots, true, rand); if (r) said.push({ at: t + k * 100, ...r }); }
  assert.ok(said.length >= 3);
  for (let i = 1; i < said.length; i++) assert.ok(said[i].at - said[i - 1].at >= B.GAP_MS, 'nunca falam juntos');
  const inWindow = said.filter(s => s.at - t < 30000).length;
  assert.ok(inWindow <= B.MAX_PER_WINDOW, 'no máximo ' + B.MAX_PER_WINDOW + ' falas em 30 s, teve ' + inWindow);
});

test('rodízio: cada bot fala uma vez antes de qualquer um repetir', () => {
  const rand = seeded(), bots = mkBots(6), st = B.state(), ids = [];
  let t = 5e6;
  for (let i = 0; i < 6; i++) {
    st.q.push({ due: t, text: 'x', prefer: null });
    st.next = 0;
    ids.push(B.tick(st, t, bots, true, rand).bot.id);
    t += 3000;
  }
  assert.strictEqual(new Set(ids).size, 6, ids.join());
});

test('citar o nome do bot o faz responder; bot em descanso cede a vez', () => {
  const rand = seeded(), bots = mkBots(10);
  bots[4].name = 'Marina';
  const st = B.state();
  assert.ok(B.hear(st, 'Marina, tudo bem?', bots, 2e6, 'Ana', rand));
  assert.strictEqual(st.q[0].prefer, 'b4');
  const r = B.tick(st, 2e6 + 5000, bots, true, rand);
  assert.strictEqual(r.bot.name, 'Marina');
  st.q.push({ due: 0, text: 'y', prefer: 'b4' }); st.next = 0;
  assert.notStrictEqual(B.tick(st, 2e6 + 8000, bots, true, rand).bot.id, 'b4', 'descansando, deixa outro falar');
});

test('sem bots ou sem gente online ninguém fala e a fila é descartada', () => {
  const st = B.state();
  assert.strictEqual(B.hear(st, 'oi', [], 1, 'Ana'), false);
  assert.ok(B.hear(st, 'oi', mkBots(2), 1, 'Ana', seeded()));
  assert.strictEqual(B.tick(st, 1e7, mkBots(2), false), null);
  assert.strictEqual(st.q.length, 0);
});

test('bots nunca puxam assunto: sem mensagem de pessoa, ninguém fala', () => {
  const rand = seeded(), bots = mkBots(20), st = B.state();
  for (let t = 0; t < 600000; t += 100) assert.strictEqual(B.tick(st, 1e6 + t, bots, true, rand), null);
});

test('uma mensagem gera exatamente uma resposta, de um só bot', () => {
  const rand = seeded(), bots = mkBots(20), st = B.state();
  assert.ok(B.hear(st, 'xyzzy qwerty', bots, 1e6, 'Ana', rand));
  const said = [];
  for (let t = 0; t < 60000; t += 100) { const r = B.tick(st, 1e6 + t, bots, true, rand); if (r) said.push(r); }
  assert.strictEqual(said.length, 1);
});

test('validador: até 20 bots na criação e em /bots; 21 é recusado', () => {
  assert.strictEqual(V.MAX_BOTS, 20);
  assert.strictEqual(V.normalizeMessage({ t: 'create', style: 'aeris', bots: 20, name: 'Ana' }).bots, 20);
  assert.strictEqual(V.normalizeMessage({ t: 'create', style: 'aeris', bots: 21, name: 'Ana' }), null);
  assert.deepStrictEqual(V.normalizeMessage({ t: 'bots', n: 20 }), { t: 'bots', n: 20 });
  assert.strictEqual(V.normalizeMessage({ t: 'bots', n: 21 }), null);
});
