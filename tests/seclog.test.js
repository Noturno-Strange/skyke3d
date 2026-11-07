'use strict';
// Registro de eventos de segurança (lib/seclog.js): sem segredos, sem IP, códigos estáveis com o mesmo segredo e giro do arquivo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSecLog } = require('../lib/seclog.js');

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-seclog-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'security.log');
}

test('cada evento vira uma linha JSON sem id, IP nem segredo, e eventos desconhecidos são ignorados', t => {
  const file = tmp(t);
  const L = createSecLog({ file });
  L.log('passkey.add', { id: 'abcdefghijkl', ip: '203.0.113.7', cred: 'CRED-ID-SECRETO-xyz', n: 2 });
  L.log('auth.fail', { id: 'abcdefghijkl', ip: '203.0.113.7', ok: false, reason: 'join' });
  L.log('passkey.fail', { ok: false, reason: 'Isto Não É Um Motivo' }); // motivo fora do formato: não entra
  L.log('inventado', { id: 'x' });
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.strictEqual(lines.length, 3);
  const text = fs.readFileSync(file, 'utf8');
  for (const v of ['abcdefghijkl', '203.0.113.7', 'CRED-ID-SECRETO']) assert.ok(!text.includes(v), v);
  assert.strictEqual(lines[0].ev, 'passkey.add');
  assert.strictEqual(lines[0].ok, true);
  assert.strictEqual(lines[0].n, 2);
  assert.match(lines[0].who, /^[A-Za-z0-9_-]{16}$/);
  assert.match(lines[0].from, /^[A-Za-z0-9_-]{12}$/);
  assert.match(lines[0].cred, /^[A-Za-z0-9_-]{12}$/);
  assert.strictEqual(lines[0].who, lines[1].who, 'a mesma conta tem o mesmo código');
  assert.strictEqual(lines[1].reason, 'join');
  assert.strictEqual(lines[2].reason, undefined);
  assert.strictEqual(L.whoOf('abcdefghijkl'), lines[0].who);
  const st = L.stats();
  assert.strictEqual(st.counts['passkey.add'], 1);
  assert.strictEqual(st.counts['auth.fail:fail'], 1);
  assert.strictEqual(st.recent[0].ev, 'passkey.fail');
  assert.strictEqual((fs.statSync(file).mode & 0o777).toString(8), '600');
});

test('o segredo fica num arquivo ao lado (permissão 600): os códigos continuam iguais depois de reiniciar', t => {
  const file = tmp(t);
  createSecLog({ file }).log('identity.create', { id: 'abcdefghijkl' });
  createSecLog({ file }).log('identity.create', { id: 'abcdefghijkl' });
  const [a, b] = fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.strictEqual(a.who, b.who);
  const key = path.join(path.dirname(file), 'security.key');
  assert.strictEqual((fs.statSync(key).mode & 0o777).toString(8), '600');
  // o código da origem muda de um dia para o outro (não dá para seguir um IP por muito tempo)
  let t0 = Date.UTC(2026, 0, 1, 12);
  const L = createSecLog({ file, now: () => t0 });
  L.log('auth.fail', { ip: '203.0.113.7', ok: false });
  t0 += 86400000;
  L.log('auth.fail', { ip: '203.0.113.7', ok: false });
  const [x, y] = L.stats().recent;
  assert.notStrictEqual(x.from, y.from);
});

test('o arquivo gira ao passar do tamanho máximo', t => {
  const file = tmp(t);
  const L = createSecLog({ file, maxBytes: 400 });
  for (let i = 0; i < 20; i++) L.log('sessions.revoke', { id: 'abcdefghijkl' });
  assert.ok(fs.statSync(file).size <= 400);
  assert.ok(fs.existsSync(file + '.1'));
});
