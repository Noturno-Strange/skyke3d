'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBadges, derived, GRANTED } = require('../lib/badges.js');

const PID = 'a'.repeat(20);
const P = (o = {}) => ({ bio: '', like: '', mood: '', world: '', likes: 0, ...o });

test('emblemas automáticos: perfil completo e querido pela galera', () => {
  assert.deepStrictEqual(derived(P()), []);
  assert.deepStrictEqual(derived(P({ bio: 'x'.repeat(20), like: 'a', mood: 'b', world: 'nyx' })).map(b => b.id), ['completo']);
  assert.deepStrictEqual(derived(P({ likes: 9 })), []);
  assert.deepStrictEqual(derived(P({ likes: 10 })).map(b => b.id), ['querido']);
});

test('concessão: só emblemas do catálogo e código válido; dar e tirar', () => {
  const B = createBadges();
  assert.strictEqual(B.set('nao', 'equipe', true).reason, 'pid');
  assert.strictEqual(B.set(PID, 'hacker', true).reason, 'badge');
  assert.deepStrictEqual(B.set(PID, 'equipe', true).badges, ['equipe']);
  assert.deepStrictEqual(B.set(PID, 'apoiador', true).badges, ['equipe', 'apoiador']);
  assert.deepStrictEqual(
    B.of(PID, P({ likes: 12 })).map(b => b.id),
    ['equipe', 'apoiador', 'querido']
  );
  assert.deepStrictEqual(B.set(PID, 'equipe', false).badges, ['apoiador']);
  B.set(PID, 'apoiador', false);
  assert.strictEqual(B.size(), 0);
  assert.ok(Object.keys(GRANTED).length >= 3);
});

test('persistência: grava (0600), volta depois de reiniciar e ignora lixo', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-bd-')), 'badges.json');
  const B = createBadges({ file, delayMs: 1 });
  B.set(PID, 'pioneiro', true);
  B.flush();
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { v: 1, g: { [PID]: ['pioneiro'] } });
  assert.deepStrictEqual(createBadges({ file }).of(PID, P()).map(b => b.id), ['pioneiro']);
  fs.writeFileSync(file, JSON.stringify({ v: 1, g: { [PID]: ['pioneiro', 'inventado'], '../x': ['equipe'], [PID.replace(/a/g, 'b')]: 'x' } }));
  const C = createBadges({ file });
  assert.deepStrictEqual(C.of(PID, P()).map(b => b.id), ['pioneiro']);
  assert.strictEqual(C.size(), 1);
  fs.writeFileSync(file, '{ quebrado');
  assert.doesNotThrow(() => createBadges({ file, onError: () => {} }));
});
