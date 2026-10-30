'use strict';
// tools/loadtest.js: valida os argumentos e roda uma carga bem pequena de ponta a ponta (servidor de teste + jogadores simulados).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');
const H = require('../harness.js');

const root = path.join(__dirname, '..');
const run = (args, ms = 90000) => spawnSync(process.execPath, ['tools/loadtest.js', ...args], { cwd: root, encoding: 'utf8', timeout: ms });

test('loadtest: recusa degraus acima do teto de projeto', () => {
  const r = run(['--steps', '5000']);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /3000/);
  const s = run(['--steps', '2400', '--per-room', '10']);
  assert.notStrictEqual(s.status, 0, '240 salas passam do teto de 150');
  assert.match(s.stderr, /150 salas/);
  assert.notStrictEqual(run(['--steps', '40', '--per-room', '1']).status, 0);
});

test('loadtest: sobe um servidor, enche salas, mede e recomenda', { skip: H.missing() }, () => {
  const r = run(['--steps', '12,24', '--per-room', '6', '--hold', '3', '--workers', '1']);
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /Degrau 12 \(2 salas × 6\)/);
  assert.match(r.stdout, /Degrau 24 \(4 salas × 6\)/);
  assert.match(r.stdout, /Jogadores \| salas \| tick médio/);
  assert.match(r.stdout, /Recomendação para este hardware, com salas de 6/);
  assert.match(r.stdout, /KB\/s por jogador/);
});
