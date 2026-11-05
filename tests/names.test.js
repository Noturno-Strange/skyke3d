'use strict';
// Registro de nomes: posse pela chave do aparelho (skyke_fk), persistente entre reinícios, sem IP.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createNameRegistry } = require('../lib/names.js');

const key = ch => ch.repeat(43);
function tmpFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-names-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'names.json');
}

test('registro: o dono reserva o nome e outra chave não pode usar', t => {
  const r = createNameRegistry({ file: tmpFile(t), delayMs: 0 });
  const a = r.owner(key('A')),
    b = r.owner(key('B'));
  assert.strictEqual(r.free('ana', a), true);
  assert.strictEqual(r.claim('ana', a), true);
  assert.strictEqual(r.free('ana', a), true);
  assert.strictEqual(r.free('ana', b), false);
  assert.strictEqual(r.claim('ana', b), false);
  assert.strictEqual(r.size, 1);
  r.flush();
});

test('registro: a posse sobrevive ao reinício (mesmo salt, mesmo dono)', t => {
  const file = tmpFile(t);
  const r1 = createNameRegistry({ file, delayMs: 0 });
  const a = r1.owner(key('A'));
  assert.strictEqual(r1.claim('ana', a), true);
  r1.flush();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(saved.v, 1);
  assert.ok(saved.salt.length >= 16);
  assert.ok(saved.names.ana);
  const r2 = createNameRegistry({ file, delayMs: 0 });
  assert.strictEqual(r2.owner(key('A')), a, 'o salt salvo mantém o mesmo dono');
  assert.strictEqual(r2.free('ana', a), true);
  assert.strictEqual(r2.free('ana', r2.owner(key('B'))), false);
});

test('registro: teto por chave tira os nomes mais antigos', t => {
  let at = 1000;
  const r = createNameRegistry({ file: tmpFile(t), perKey: 2, delayMs: 0, now: () => at++ });
  const a = r.owner(key('A')),
    b = r.owner(key('B'));
  assert.strictEqual(r.claim('um', a), true);
  assert.strictEqual(r.claim('dois', a), true);
  assert.strictEqual(r.claim('tres', a), true);
  assert.strictEqual(r.size, 2);
  assert.strictEqual(r.free('um', b), true, 'o mais antigo foi liberado');
  assert.strictEqual(r.free('dois', b), false);
  assert.strictEqual(r.free('tres', b), false);
});

test('registro: teto global tira o nome mais antigo', t => {
  let at = 1000;
  const r = createNameRegistry({ file: tmpFile(t), max: 2, perKey: 10, delayMs: 0, now: () => at++ });
  assert.strictEqual(r.claim('um', r.owner(key('A'))), true);
  assert.strictEqual(r.claim('dois', r.owner(key('B'))), true);
  assert.strictEqual(r.claim('tres', r.owner(key('C'))), true);
  assert.strictEqual(r.size, 2);
  assert.strictEqual(r.free('um', r.owner(key('D'))), true);
  assert.strictEqual(r.free('dois', r.owner(key('D'))), false);
});

test('registro: arquivo inválido vira .bak e começa limpo', t => {
  const file = tmpFile(t);
  fs.writeFileSync(file, '{ nao e json');
  const warns = [];
  const r = createNameRegistry({ file, warn: m => warns.push(m), delayMs: 0 });
  assert.ok(fs.existsSync(file + '.bak'), 'guarda o arquivo antigo');
  assert.ok(warns.some(m => /nomes/.test(m)));
  assert.strictEqual(r.claim('ana', r.owner(key('A'))), true);
});

test('registro desligado: tudo livre e nada é gravado', t => {
  const r = createNameRegistry({ file: '', delayMs: 0 });
  const a = r.owner(key('A')),
    b = r.owner(key('B'));
  assert.strictEqual(r.claim('ana', a), true);
  assert.strictEqual(r.free('ana', b), true);
  assert.strictEqual(r.size, 0);
  r.flush();
});

// SK-03: o teto global tira o nome usado há mais tempo em O(1); quem acabou de usar o nome não perde a reserva.
test('registro: teto global descarta por ordem de uso e quem reusou o nome fica', t => {
  let clock = 1000;
  const r = createNameRegistry({ file: tmpFile(t), max: 3, perKey: 0, now: () => clock++ });
  r.claim('ana', r.owner(key('A')));
  r.claim('bia', r.owner(key('B')));
  r.claim('caio', r.owner(key('C')));
  r.claim('ana', r.owner(key('A'))); // a dona de "ana" voltou: "ana" passa a ser a mais recente
  r.claim('duda', r.owner(key('D'))); // estoura o teto: sai "bia" (usada há mais tempo)
  assert.strictEqual(r.size, 3);
  assert.strictEqual(r.free('bia', r.owner(key('X'))), true, 'bia foi liberado');
  assert.strictEqual(r.free('ana', r.owner(key('X'))), false, 'ana continua reservado');
  assert.strictEqual(r.free('caio', r.owner(key('X'))), false);
  assert.strictEqual(r.free('duda', r.owner(key('X'))), false);
});

test('registro lotado: nome novo não varre o registro inteiro', t => {
  const r = createNameRegistry({ file: tmpFile(t), max: 100000, perKey: 0 });
  const o = r.owner(key('A'));
  for (let i = 0; i < 100000; i++) r.claim('n' + i, o);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 3000; i++) r.claim('x' + i, o);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.strictEqual(r.size, 100000);
  assert.ok(ms < 1500, `3000 nomes novos com o registro cheio levaram ${ms.toFixed(0)} ms`);
});
