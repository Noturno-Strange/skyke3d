'use strict';
// Cenários: cada mundo tem identidade própria (núcleos da colônia e relevo), sem espelhamento e sem montanhas duplicadas.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const CAT = require('../assets/catalog.js');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'assets', f), 'utf8');
const colony = read('app-colony.js'),
  scene = read('app-scene.js');
const worlds = Object.keys(CAT.ST);

/** Texto entre chaves/colchetes que fecha o bloco que começa em `start`. */
function block(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, 'não achei ' + start);
  const open = src.indexOf('{', i);
  let d = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0) return src.slice(open, j + 1);
  }
  throw new Error('bloco aberto: ' + start);
}
const keysOf = b => [...b.matchAll(/(?:^|[\s,{])([a-z0-9]+):\{/g)].map(m => m[1]);

test('colônia: todo mundo do catálogo tem um conjunto de núcleos e um relevo próprio', () => {
  const kits = keysOf(block(colony, 'const KITS=')),
    rel = keysOf(block(scene, 'const MREL='));
  for (const w of worlds) {
    assert.ok(kits.includes(w), 'KITS sem ' + w);
    assert.ok(rel.includes(w), 'MREL sem ' + w);
  }
});

test('colônia: os núcleos só usam peças que existem e que têm raio reservado', () => {
  const nuclei = block(colony, 'const NUCLEI='),
    props = block(colony, 'const COLONY_PROPS='),
    radii = block(colony, 'const PROP_R=');
  const used = new Set([...nuclei.matchAll(/\['([A-Za-z]+)',/g)].map(m => m[1]));
  assert.ok(used.size >= 10, 'variedade de peças: ' + used.size);
  for (const name of used) {
    assert.ok(new RegExp('\\n ' + name + '\\(x,z,ry,s,o\\)').test(props), 'peça sem construtor: ' + name);
    assert.ok(new RegExp('\\b' + name + ':').test(radii), 'peça sem raio: ' + name);
  }
});

test('colônia: os mundos não são cópias uns dos outros (núcleos diferentes e relevos diferentes)', () => {
  const kits = block(colony, 'const KITS=');
  const sets = worlds.map(w => (new RegExp(w + ':\\{n:\\[([^\\]]*)\\]').exec(kits) || [])[1]);
  assert.ok(sets.every(Boolean));
  assert.ok(new Set(sets).size >= 12, 'combinações de núcleos distintas: ' + new Set(sets).size);
  const rel = block(scene, 'const MREL=');
  const mixes = worlds.map(w => (new RegExp(w + ':\\{m:\\[(.*?)\\],n:').exec(rel) || [])[1]);
  assert.ok(mixes.every(Boolean));
  assert.ok(new Set(mixes).size >= 14, 'relevos distintos: ' + new Set(mixes).size);
});

test('cenário: sem espelhamento, sem cópia espelhada de montanhas e sem peças soltas fora do lugar', () => {
  assert.ok(!scene.includes('mirrorDecor'), 'sem a cópia girada 180° da metade norte');
  const m = block(scene, 'function mountains(k)');
  assert.ok(!m.includes('mi*PI') || m.includes('const mi=0'), 'montanhas não são copiadas em espelho');
  assert.ok(scene.includes('function mountGeo(') && scene.includes("case 'mesa'"), 'formas de montanha variadas');
  assert.ok(scene.includes('colony(o,zones)') && scene.includes('outcrops(o,zones)'), 'spaceScene monta a colônia e os afloramentos');
  assert.ok(!/put\(10,300,36,54,200/.test(scene), 'sem as pedras espalhadas por igual do campo distante');
});

test('colônia: as peças ficam no chão e a casa, a estufa e os painéis continuam sendo únicos', () => {
  assert.ok(colony.includes('userData.colony=1'), 'grupos marcados');
  assert.ok(scene.includes('uniqDo(()=>greenhouse(') && scene.includes('uniqDo(()=>lunarHouse(k))'), 'peças fixas preservadas');
  assert.ok(colony.includes('uniqDo(()=>COLONY_PROPS[name]('), 'peças da colônia não saem na limpeza de sobreposição');
  assert.ok(!/mergeGroup\(/.test(colony), 'sem mergeGroup: o mergeStatic junta por material em toda a cena');
});
