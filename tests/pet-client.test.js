'use strict';
// Painel do mascote (assets/app-pet.js): script comum, no mesmo escopo global dos outros app-*.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const pet = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app-pet.js'), 'utf8');

test('mascote: o arquivo roda dentro de uma função (declaração em bloco vira global e sobrescreveria ask(), draw(), view()…)', () => {
  const ini = pet.indexOf('\n(()=>{\n');
  assert.ok(ini > 0, 'abre uma função');
  assert.match(pet.trimEnd(), /\}\)\(\);$/, 'fecha e chama');
  const fora = pet.slice(0, ini);
  assert.ok(!/^\s*(?:async )?function |^\s*(?:const|let|var) /m.test(fora), 'nada declarado fora da função');
  assert.ok(!/^\{$/m.test(pet), 'sem o bloco {} antigo');
  // o que os outros arquivos usam sai só por window.*
  const saidas = [...new Set([...pet.matchAll(/window\.(pet\w+)=/g)].map(m => m[1]))].sort();
  assert.deepStrictEqual(saidas, ['petBoot', 'petMenu', 'petMsg', 'petReset']);
});
