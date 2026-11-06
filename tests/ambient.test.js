'use strict';

// Som ambiente: nada de tons puros agudos que soem como apito (grilos e sinos foram retirados de todos os mundos).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../assets/catalog.js');
const sound = fs.readFileSync(path.join(__dirname, '..', 'assets/app-sound.js'), 'utf8');

test('ambiente: todo mundo tem camadas conhecidas, sem grilos nem sinos', () => {
  const amb = eval('(' + sound.match(/const AMB=(\{[^\n]*\});/)[1] + ')');
  const conhecidas = new Set(['wind', 'water', 'bubbles', 'leaves', 'dust', 'croak', 'hoot']);
  for (const id of Object.keys(C.ST)) {
    assert.ok(Array.isArray(amb[id]) && amb[id].length, `mundo ${id} sem ambiente`);
    for (const k of amb[id]) assert.ok(conhecidas.has(k), `${id}: camada ${k}`);
  }
  assert.ok(!/crickets|chime/.test(sound.replace(/\/\/[^\n]*/g, '')), 'o código dos grilos e dos sinos saiu');
});

test('ambiente: o vento fica na faixa grave e larga (sem assobio) e só existem as camadas que os biomas usam', () => {
  const m = sound.match(/nsrc\(a,m,'bandpass',(\d+),([\d.]+)\);AM\.src\.push\(n\.s,lfo\(a,\.13/);
  assert.ok(m, 'filtro do vento encontrado');
  assert.ok(+m[1] <= 500 && +m[2] <= 0.7, `centro ${m[1]} Hz, Q ${m[2]}`);
  const amb = eval('(' + sound.match(/const AMB=(\{[^\n]*\});/)[1] + ')'),
    usadas = new Set(Object.values(amb).flat()),
    codigo = sound.replace(/\/\/[^\n]*/g, '');
  for (const k of ['windcold', 'rumble', 'drone', 'surf', 'hum', 'spores', 'crackle', 'creak', 'swell'])
    assert.ok(!usadas.has(k) && !codigo.includes("'" + k + "'"), 'camada sem bioma saiu do código: ' + k);
});

test('ambiente: cada mundo tem um conjunto próprio de camadas, e toda camada tem som no código', () => {
  const amb = eval('(' + sound.match(/const AMB=(\{[^\n]*\});/)[1] + ')');
  const conjuntos = Object.values(amb).map(l => [...l].sort().join('+'));
  assert.strictEqual(new Set(conjuntos).size, conjuntos.length, 'dois mundos com o mesmo ambiente');
  const codigo = sound.replace(/\/\/[^\n]*/g, '');
  for (const k of new Set(Object.values(amb).flat()))
    assert.ok(codigo.includes("'" + k + "'") && (codigo.includes("kind==='" + k + "'") || codigo.includes("ks.includes('" + k + "')") || /wind/.test(k)), `camada ${k} sem som`);
});
