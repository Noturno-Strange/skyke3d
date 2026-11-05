'use strict';
// Cenários: cada mundo tem identidade própria (núcleos da colônia e relevo), sem espelhamento e sem montanhas duplicadas.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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
  assert.ok(scene.includes('function mountGeo('), 'geometria das montanhas centralizada');
  assert.ok(scene.includes('colony(o,zones)') && scene.includes('outcrops(o,zones)'), 'spaceScene monta a colônia e os afloramentos');
  assert.ok(!/put\(10,300,36,54,200/.test(scene), 'sem as pedras espalhadas por igual do campo distante');
});

test('colônia: as peças ficam no chão e a casa, a estufa e os painéis continuam sendo únicos', () => {
  assert.ok(colony.includes('userData.colony=1'), 'grupos marcados');
  assert.ok(scene.includes('uniqDo(()=>greenhouse(') && scene.includes('uniqDo(()=>lunarHouse(k))'), 'peças fixas preservadas');
  assert.ok(colony.includes('uniqDo(()=>COLONY_PROPS[name]('), 'peças da colônia não saem na limpeza de sobreposição');
  assert.ok(!/mergeGroup\(/.test(colony), 'sem mergeGroup: o mergeStatic junta por material em toda a cena');
});

test('colônia: casco com tom do mundo, módulos habitacionais variados e plataforma sobre a água em Trappist', () => {
  assert.ok(colony.includes('const hullOf=') && colony.includes('F(hullOf(o))'), 'o casco muda de tom conforme o mundo');
  assert.ok(!colony.includes('F(HULL)'), 'nenhuma peça usa o branco fixo');
  assert.ok(/habPod\([^)]*\)\{[\s\S]*Math\.floor\(Math\.abs\(rn\(x\*1\.7\+z\*2\.3\)\)\*3\)/.test(colony), 'variação do módulo por posição');
  assert.ok(/trappist:\{[^}]*deck:1\}/.test(colony) && colony.includes('function deck('), 'núcleos de Trappist ficam sobre plataformas');
});

test('montanhas: todas são tetraedros (cone de 3 lados) e só variam em proporção, altura e inclinação da ponta', () => {
  const g = block(scene, 'function mountGeo(');
  assert.deepStrictEqual([...g.matchAll(/new THREE\.(\w+Geometry)\(([^;]*)\)/g)].map(m => [m[1], /,3,3\)$/.test(m[0])]), [['ConeGeometry', true]], 'uma única geometria: cone de 3 lados');
  assert.ok(!/CylinderGeometry|OctahedronGeometry|IcosahedronGeometry|SphereGeometry|BoxGeometry/.test(g), 'nenhuma outra forma');
  assert.ok(scene.includes('function skewTetra(') && scene.includes('skewTetra(g,'), 'ponta deslocada por cisalhamento (continua tetraedro)');
  const rel = block(scene, 'const MREL=');
  const shapes = new Set([...rel.matchAll(/\['([a-z]+)',\d+\]/g)].map(m => m[1]));
  for (const s of shapes) assert.ok(['alpine', 'needle', 'crystal', 'broad', 'dune'].includes(s), 'forma desconhecida: ' + s);
  assert.ok(!shapes.has('mesa'), 'sem platô de topo reto');
  // cada mundo mistura pelo menos duas proporções, então nenhuma serra é uma fileira de picos iguais
  for (const w of worlds) assert.ok((new RegExp(w + ':\\{m:\\[(.*?)\\],n:').exec(rel)[1].match(/\[/g) || []).length >= 2, 'mistura pobre em ' + w);
});

/** Roda `mountPlan` isolada (só precisa de rn, PI, GROUND, MREL e mixPick). */
function plans() {
  const base = read('app-base.js');
  const rn = /const rn=i=>\{[^\n]*\}/.exec(base)[0].replace(/^const rn=/, 'var rn=');
  const src = [
    rn,
    'var PI=Math.PI,GROUND=150;',
    'var ' + 'MREL=' + block(scene, 'const MREL=').slice(0) + ';',
    scene.slice(scene.indexOf('const mixPick='), scene.indexOf('\n', scene.indexOf('const mixPick='))),
    scene.slice(scene.indexOf('function mountPlan('), scene.indexOf('function mountains('))
  ].join('\n');
  const ctx = vm.createContext({ Math });
  vm.runInContext(src, ctx);
  return Object.fromEntries(worlds.map(w => [w, vm.runInContext('mountPlan(' + JSON.stringify(w) + ')', ctx)]));
}

test('muralha: em todo mundo as duas camadas fecham o anel de 360° com picos que se emendam (sem vãos)', () => {
  const P = plans();
  for (const w of worlds) {
    for (const L of [0, 1]) {
      const ring = P[w].filter(m => m.L === L).sort((a, b) => a.a - b.a);
      assert.ok(ring.length >= 17, w + ' camada ' + L + ' com poucos picos: ' + ring.length);
      let touching = 0;
      for (let i = 0; i < ring.length; i++) {
        const A = ring[i],
          B = ring[(i + 1) % ring.length];
        const d = Math.hypot(Math.sin(A.a) * A.d - Math.sin(B.a) * B.d, Math.cos(A.a) * A.d - Math.cos(B.a) * B.d);
        if (d <= (A.W + B.W) * 0.8) touching++;
      }
      assert.ok(touching / ring.length >= 0.97, w + ' camada ' + L + ': picos vizinhos que se emendam ' + touching + '/' + ring.length);
    }
  }
});

test('muralha: anel concêntrico ao cenário, cumes e depressões variados e nenhuma montanha repetida', () => {
  const P = plans();
  const shapes = new Set();
  for (const w of worlds) {
    const m = P[w];
    for (const k of m) {
      assert.ok(k.d >= 58 && k.d <= 90, w + ' distância fora do anel: ' + k.d);
      shapes.add(k.shape);
    }
    const H = m.map(k => k.H),
      W = m.map(k => k.W);
    assert.ok(Math.max(...H) / Math.min(...H) >= 1.6, w + ' alturas pouco variadas');
    assert.ok(Math.max(...W) / Math.min(...W) >= 1.4, w + ' larguras pouco variadas');
    const key = new Set(m.map(k => [k.L, Math.round(k.a * 100), Math.round(k.W * 10)].join()));
    assert.strictEqual(key.size, m.length, w + ' tem montanha duplicada');
    for (let i = 0; i < m.length; i++)
      for (let j = i + 1; j < m.length; j++)
        assert.ok(m[i].L !== m[j].L || Math.abs(m[i].a - m[j].a) > 0.01, w + ' duas montanhas no mesmo lugar');
  }
  assert.ok(shapes.size >= 4, 'proporções usadas: ' + [...shapes]);
  // espelhamento: nenhum mundo tem a camada rodada 180° igual a si mesma
  for (const w of worlds) {
    const near = P[w].filter(k => k.L === 0);
    const opp = near.filter(k => near.some(o => o !== k && Math.abs(Math.abs(o.a - k.a) - Math.PI) < 0.02 && Math.abs(o.W - k.W) < 0.05));
    assert.ok(opp.length < near.length * 0.2, w + ' tem montanhas gêmeas em lados opostos');
  }
});

test('muralha: cada mundo tem seu relevo (plano determinístico e diferente dos outros)', () => {
  const P = plans(),
    P2 = plans();
  assert.strictEqual(JSON.stringify(P), JSON.stringify(P2), 'o mesmo mundo sempre gera o mesmo anel');
  const sig = worlds.map(w => JSON.stringify(P[w].slice(0, 6).map(k => [k.shape, Math.round(k.H)])));
  assert.strictEqual(new Set(sig).size, worlds.length, 'dois mundos com o mesmo relevo');
});
