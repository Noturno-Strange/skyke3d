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
  const conhecidas = new Set([
    'wind',
    'windcold',
    'rumble',
    'water',
    'drone',
    'bubbles',
    'leaves',
    'dust',
    'surf',
    'hum',
    'spores',
    'crackle',
    'creak',
    'croak',
    'hoot',
    'swell'
  ]);
  for (const id of Object.keys(C.ST)) {
    assert.ok(Array.isArray(amb[id]) && amb[id].length, `mundo ${id} sem ambiente`);
    for (const k of amb[id]) assert.ok(conhecidas.has(k), `${id}: camada ${k}`);
  }
  assert.ok(!/crickets|chime/.test(sound.replace(/\/\/[^\n]*/g, '')), 'o código dos grilos e dos sinos saiu');
});

test('ambiente: o vento frio fica na faixa grave e larga (antes assobiava perto de 900 Hz)', () => {
  const m = sound.match(/nsrc\(a,m,'bandpass',kind==='wind'\?(\d+):(\d+),kind==='wind'\?([\d.]+):([\d.]+)\)/);
  assert.ok(m, 'filtro do vento encontrado');
  const [, vento, frio, qv, qf] = m.map(Number);
  assert.ok(vento <= 500 && frio <= 600, `centros ${vento}/${frio} Hz`);
  assert.ok(qv <= .7 && qf <= .5, 'filtro largo, sem ressonância');
});

test('ambiente: cada mundo tem um conjunto próprio de camadas, e toda camada tem som no código', () => {
  const amb = eval('(' + sound.match(/const AMB=(\{[^\n]*\});/)[1] + ')');
  const conjuntos = Object.values(amb).map(l => [...l].sort().join('+'));
  assert.strictEqual(new Set(conjuntos).size, conjuntos.length, 'dois mundos com o mesmo ambiente');
  const codigo = sound.replace(/\/\/[^\n]*/g, '');
  for (const k of new Set(Object.values(amb).flat()))
    assert.ok(codigo.includes("'" + k + "'") && (codigo.includes("kind==='" + k + "'") || codigo.includes("ks.includes('" + k + "')") || /wind/.test(k)), `camada ${k} sem som`);
});
