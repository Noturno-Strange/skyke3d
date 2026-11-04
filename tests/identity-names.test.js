'use strict';
// Migração da posse de nome (lib/names.js): o dono antigo (fk) e o novo (id) convivem no mesmo registro,
// sem reescrever `o`, para que nomes existentes sobrevivam e o rollback continue possível.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createNameRegistry } = require('../lib/names.js');
const { newId } = require('../lib/ids.js');

const key = ch => ch.repeat(43);
function tmpFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-identity-names-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'names.json');
}
function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('ownerId e owner são vínculos diferentes para o mesmo registro', () => {
  const r = createNameRegistry({ file: '' });
  const id = newId(),
    fk = key('A');
  assert.match(r.ownerId(id), /^[A-Za-z0-9_-]{43}$/);
  assert.notStrictEqual(r.ownerId(id), r.owner(fk));
  assert.strictEqual(r.ownerId(id), r.ownerId(id));
  assert.notStrictEqual(r.ownerId(id), r.ownerId(newId()));
});

test('claimFor aceita o dono legado, grava oi e preserva o', t => {
  const file = tmpFile(t);
  const fk = key('A'),
    id = newId();
  const r = createNameRegistry({ file, delayMs: 0 });
  const legado = r.owner(fk);
  assert.strictEqual(r.claim('ana', legado), true);
  r.flush();
  const antes = read(file).names.ana;
  assert.strictEqual(antes.o, legado);
  assert.strictEqual(antes.oi, undefined);

  assert.deepStrictEqual(r.claimFor('ana', { id, fk }), { ok: true, migrated: true });
  r.flush();
  const depois = read(file).names.ana;
  assert.strictEqual(depois.o, legado, 'o vínculo antigo não pode ser reescrito');
  assert.strictEqual(depois.oi, r.ownerId(id));
  assert.ok(Number.isFinite(depois.at));
});

test('depois da migração, a identidade nova sozinha reserva o nome', t => {
  const file = tmpFile(t);
  const fk = key('B'),
    id = newId();
  const r = createNameRegistry({ file, delayMs: 0 });
  r.claim('bia', r.owner(fk));
  r.claimFor('bia', { id, fk });
  r.flush();

  assert.strictEqual(r.free('bia', r.ownerId(id)), true);
  assert.deepStrictEqual(r.claimFor('bia', { id }), { ok: true });
  assert.strictEqual(r.free('bia', r.ownerId(newId())), false);
  assert.deepStrictEqual(r.claimFor('bia', { id: newId() }), { ok: false });
  r.flush();
});

test('nome novo nasce só com oi, sem vínculo legado', t => {
  const file = tmpFile(t);
  const id = newId();
  const r = createNameRegistry({ file, delayMs: 0 });
  assert.deepStrictEqual(r.claimFor('novo', { id }), { ok: true });
  r.flush();
  const e = read(file).names.novo;
  assert.strictEqual(e.o, '');
  assert.strictEqual(e.oi, r.ownerId(id));
  assert.strictEqual(r.free('novo', r.ownerId(id)), true);
});

test('fk errado não migra nome de outra pessoa', t => {
  const file = tmpFile(t);
  const fk = key('C');
  const r = createNameRegistry({ file, delayMs: 0 });
  r.claim('caio', r.owner(fk));
  assert.deepStrictEqual(r.claimFor('caio', { id: newId(), fk: key('D') }), { ok: false });
  assert.deepStrictEqual(r.claimFor('caio', { id: newId() }), { ok: false });
  r.flush();
  assert.strictEqual(read(file).names.caio.oi, undefined);
});

test('o e oi sobrevivem ao reinício e o caminho antigo continua valendo (rollback)', t => {
  const file = tmpFile(t);
  const fk = key('E'),
    id = newId();
  const r = createNameRegistry({ file, delayMs: 0 });
  const legado = r.owner(fk);
  r.claim('eva', legado);
  r.claimFor('eva', { id, fk });
  r.flush();

  const r2 = createNameRegistry({ file, delayMs: 0 });
  assert.strictEqual(r2.size, 1);
  assert.strictEqual(r2.free('eva', r2.ownerId(id)), true);
  assert.strictEqual(r2.free('eva', r2.owner(fk)), true);
  assert.strictEqual(r2.free('eva', r2.owner(key('F'))), false);
  // rollback: voltar a usar só a chave antiga ainda funciona
  assert.strictEqual(r2.claim('eva', r2.owner(fk)), true);
  assert.deepStrictEqual(r2.claimFor('eva', { id }), { ok: true });
  r2.flush();
});

test('registro antigo sem oi carrega normalmente', t => {
  const file = tmpFile(t);
  const r = createNameRegistry({ file, delayMs: 0 });
  const fk = key('G');
  r.claim('gil', r.owner(fk));
  r.flush();
  const j = read(file);
  assert.strictEqual(j.names.gil.oi, undefined);
  const r2 = createNameRegistry({ file });
  assert.strictEqual(r2.free('gil', r2.owner(fk)), true);
  assert.strictEqual(r2.free('gil', r2.ownerId(newId())), false);
});
