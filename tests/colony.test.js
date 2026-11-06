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
  assert.strictEqual(new Set(sets.map(x => x.split(',').sort().join())).size, worlds.length, 'cada bioma com uma combinação própria de núcleos');
  const rel = block(scene, 'const MREL=');
  const mixes = worlds.map(w => (new RegExp(w + ':\\{m:\\[(.*?)\\],g:').exec(rel) || [])[1]);
  assert.ok(mixes.every(Boolean));
  assert.strictEqual(new Set(mixes).size, worlds.length, 'cada bioma com um relevo próprio');
});

test('cenário: sem espelhamento, sem cópia espelhada de montanhas e sem peças soltas fora do lugar', () => {
  assert.ok(!scene.includes('mirrorDecor'), 'sem a cópia girada 180° da metade norte');
  const m = block(scene, 'function mountains(k)');
  assert.ok(!m.includes('mi*PI') || m.includes('const mi=0'), 'montanhas não são copiadas em espelho');
  assert.ok(scene.includes('function tetraV(') && scene.includes('function tetraTris('), 'geometria das montanhas centralizada');
  assert.ok(scene.includes('colony(o,zones)') && scene.includes('outcrops(o,zones)'), 'spaceScene monta a colônia e os afloramentos');
  assert.ok(!/put\(10,300,36,54,200/.test(scene), 'sem as pedras espalhadas por igual do campo distante');
});

test('colônia: as peças ficam no chão e a casa, a estufa e os painéis continuam sendo únicos', () => {
  assert.ok(colony.includes('userData.colony=1'), 'grupos marcados');
  assert.ok(scene.includes('uniqDo(()=>greenhouse(') && scene.includes('uniqDo(()=>lunarHouse(k))'), 'peças fixas preservadas');
  assert.ok(colony.includes('uniqDo(()=>COLONY_PROPS[name]('), 'peças da colônia não saem na limpeza de sobreposição');
  assert.ok(!/mergeGroup\(/.test(colony), 'sem mergeGroup: o mergeStatic junta por material em toda a cena');
});

test('colônia: casco com tom do mundo, módulos habitacionais variados e plataforma sobre a água em Panthara', () => {
  assert.ok(colony.includes('const hullOf=') && colony.includes('F(hullOf(o))'), 'o casco muda de tom conforme o mundo');
  assert.ok(!colony.includes('F(HULL)'), 'nenhuma peça usa o branco fixo');
  assert.ok(/habPod\([^)]*\)\{[\s\S]*Math\.floor\(Math\.abs\(rn\(x\*1\.7\+z\*2\.3\)\)\*3\)/.test(colony), 'variação do módulo por posição');
  assert.ok(/panthara:\{[^}]*deck:1\}/.test(colony) && colony.includes('function deck('), 'núcleos de Panthara (alagado) ficam sobre plataformas');
});

test('montanhas: todas são tetraedros (4 vértices, 4 faces planas) e só variam em proporção, altura e inclinação da ponta', () => {
  assert.ok(!/function mountGeo\(|function skewTetra\(/.test(scene), 'sem geometria de cone ou cisalhamento: a malha sai direto dos 4 vértices');
  const fn = block(scene, 'function mountains(k)');
  assert.ok(/tetraTris\(V\)/.test(fn) && !/SphereGeometry|ConeGeometry|CylinderGeometry|OctahedronGeometry|IcosahedronGeometry|BoxGeometry/.test(fn + block(scene, 'function tetraTris(')), 'só tetraedros');
  const tt = block(scene, 'function tetraTris(');
  assert.ok(/const TFACE=\[\[0,2,1\],\[0,1,3\],\[1,2,3\],\[2,0,3\]\]/.test(scene) && /for\(const f of TFACE\)/.test(tt), 'exatamente 4 faces triangulares');
  const rel = block(scene, 'const MREL=');
  const shapes = new Set([...rel.matchAll(/\['([a-z]+)',\d+\]/g)].map(m => m[1]));
  for (const s of shapes) assert.ok(['alpine', 'needle', 'broad', 'dune'].includes(s), 'forma desconhecida: ' + s);
  assert.ok(!shapes.has('mesa'), 'sem platô de topo reto');
  // cada mundo mistura pelo menos duas proporções, então nenhuma serra é uma fileira de picos iguais
  for (const w of worlds) assert.ok((new RegExp(w + ':\\{m:\\[(.*?)\\],g:').exec(rel)[1].match(/\[/g) || []).length >= 2, 'mistura pobre em ' + w);
});

/** Roda `mountPlan` isolada (só precisa de rn, PI, MREL, MWALL e mixPick). */
let PLANS;
function plans() {
  return PLANS || (PLANS = buildPlans());
}
function buildPlans() {
  const base = read('app-base.js');
  const rn = /const rn=i=>\{[^\n]*\}/.exec(base)[0].replace(/^const rn=/, 'var rn=');
  const src = [
    rn,
    'var PI=Math.PI;',
    'var MREL=' + block(scene, 'const MREL=') + ';',
    'var MWALL=' + block(scene, 'const MWALL=') + ';',
    scene.slice(scene.indexOf('const mixPick='), scene.indexOf('\n', scene.indexOf('const mixPick='))),
    'var MGAP=' + /const MGAP=([\d.]+)/.exec(scene)[1] + ',MFOOTY=' + /MFOOTY=([\d.]+)/.exec(scene)[1] + ';',
    scene.slice(scene.indexOf('function tetraV('), scene.indexOf('const MPC={}'))
  ].join('\n');
  const ctx = vm.createContext({ Math });
  vm.runInContext(src, ctx);
  return {
    plan: Object.fromEntries(worlds.map(w => [w, JSON.parse(JSON.stringify(vm.runInContext('mountPlan(' + JSON.stringify(w) + ')', ctx)))])),
    wall: JSON.parse(JSON.stringify(vm.runInContext('MWALL', ctx))),
    sep: (a, b) => vm.runInContext('tetSep(tetraOf(' + JSON.stringify(a) + '),tetraOf(' + JSON.stringify(b) + '))', ctx),
    tetra: p => JSON.parse(JSON.stringify(vm.runInContext('tetraOf(' + JSON.stringify(p) + ')', ctx))),
    rel: JSON.parse(JSON.stringify(vm.runInContext('MREL', ctx)))
  };
}
const CAM_Y = 4.8,
  CAM_FAR = 19.4; // pior posição da câmera: 10,2 m de caminhada + 9,2 m atrás do jogador
const skyline = k => (Math.atan2(k.H - 1.5 - CAM_Y, k.d - CAM_FAR) * 180) / Math.PI;

test('muralha: cada camada é uma circunferência exata de 360°, com picos que se emendam sem se atravessar', () => {
  const { plan, wall, sep } = plans();
  for (const w of worlds) {
    for (const L of [0, 1]) {
      const ring = plan[w].filter(m => m.L === L).sort((a, b) => a.a - b.a);
      assert.ok(ring.length >= 20, w + ' camada ' + L + ' com poucos picos: ' + ring.length);
      assert.ok(
        ring.every(m => m.d === ring[0].d),
        w + ' camada ' + L + ': picos fora da circunferência (raio diferente)'
      );
      assert.ok(ring[0].d >= wall.near.d && ring[0].d <= 95, w + ' raio fora do anel: ' + ring[0].d);
      let touching = 0;
      for (let i = 0; i < ring.length; i++) {
        const A = ring[i],
          B = ring[(i + 1) % ring.length],
          s = sep(A, B);
        assert.ok(s >= 0.1, w + ' camada ' + L + ': picos vizinhos se atravessam (' + s.toFixed(2) + ' m)');
        if (s <= 2.5) touching++;
      }
      // vizinhos encostados (folga de até 2,5 m): a muralha não tem vãos
      assert.ok(touching / ring.length >= 0.97, w + ' camada ' + L + ': picos vizinhos que se emendam ' + touching + '/' + ring.length);
      // a circunferência fecha: o espaçamento angular entre vizinhos soma 360°
      let sum = 0;
      for (let i = 0; i < ring.length; i++) sum += (ring[(i + 1) % ring.length].a - ring[i].a + 2 * Math.PI) % (2 * Math.PI);
      assert.ok(Math.abs(sum - 2 * Math.PI) < 1e-6, w + ' camada ' + L + ' não fecha 360°: ' + sum);
    }
  }
});

test('muralha: nenhuma montanha atravessa outra (nem da mesma camada, nem da outra) e nenhuma flutua acima do chão', () => {
  const { plan, sep, tetra } = plans();
  for (const w of worlds) {
    const m = plan[w],
      T = m.map(tetra);
    for (let i = 0; i < m.length; i++) {
      // o pé fica abaixo do chão (y=0) e a parte visível sai do chão: a base visível é plana em y=0 e a ponta está acima
      assert.ok(T[i].slice(0, 3).every(v => Math.abs(v[1]) < 1e-9) && T[i][3][1] > 3, w + ' pico sem apoio no chão');
      for (let j = i + 1; j < m.length; j++) {
        if (Math.hypot(T[i][3][0] - T[j][3][0], T[i][3][2] - T[j][3][2]) > 70) continue;
        assert.ok(sep(m[i], m[j]) >= 0.1, w + ' picos ' + i + ' e ' + j + ' (camadas ' + m[i].L + '/' + m[j].L + ') se atravessam');
      }
    }
  }
});

test('montanhas: cor do solo do cenário (sem degradê), toon com uma faixa de luz por face e contorno fino e escuro', () => {
  const fn = block(scene, 'function mountains(k)');
  assert.ok(/GAVG/.test(fn) && /convertSRGBToLinear\(\)/.test(fn), 'a cor vem da cor média do chão do mundo (GAVG)');
  // uma cor por montanha (base), multiplicada por uma das 3 faixas de luz da face: sem degradê dentro da face
  assert.ok(/C\.push\(base\.r\*b\.r,base\.g\*b\.g,base\.b\*b\.b\)/.test(fn), 'cor da face = cor da montanha × faixa de luz');
  const shade = /const MSHADE=\[([\d.,]+)\]/.exec(scene)[1].split(',').map(Number);
  assert.strictEqual(shade.length, 3, '3 faixas de luz (luz, meio-tom, sombra)');
  assert.ok(shade[0] > shade[1] && shade[1] > shade[2] && shade[0] / shade[2] >= 1.6, 'luz e sombra bem distintas: ' + shade);
  assert.ok(/MSIDE\*lh/.test(fn), 'luz inclinada de lado quando bate de frente (nenhum pico chapado)');
  assert.ok(/if\(pk\.L\)base\.lerp\(fogc,MFAR\)/.test(fn), 'fileira de trás puxada para a névoa');
  assert.ok(/LineSegments\(rg/.test(fn) && /RP\.push\(R\[3\]/.test(fn), 'linha escura na aresta do meio');
  assert.ok(!/lerp\(peak|MBANDS|capHex|MPROF|sstep/.test(fn), 'sem degradê, degraus de altura nem neve/brilho no cume');
  assert.ok(/LM\(\{vertexColors:true,flatShading:true\}\)/.test(fn), 'material toon do jogo com faces planas (3 faixas de luz)');
  assert.ok(/side:THREE\.BackSide/.test(fn) && /OP\.push/.test(fn) && /OLC/.test(fn) && /tetraGrow\(/.test(fn), 'contorno: tetraedro ampliado visto por dentro, na cor de contorno do mundo');
  const olh = +/const OLH=([\d.]+)/.exec(scene)[1];
  assert.ok(olh <= 0.0025, 'contorno fino (' + olh + ' m por metro de distância)');
  assert.ok(/multiplyScalar\(\.12\)/.test(fn), 'contorno bem escuro');
  assert.ok(/MPC\[k\]/.test(fn), 'plano calculado uma vez por mundo');
  const mp = block(scene, 'const MPAL=');
  for (const w of worlds) assert.ok(new RegExp(w + ":'#[0-9a-f]{6}'").test(mp), 'cor da rocha (parede da casa) de ' + w);
});

test('muralha: as montanhas giram com a circunferência (base voltada para o centro) e tudo se repete igual', () => {
  const { plan } = plans();
  for (const w of worlds)
    for (const k of plan[w]) {
      assert.strictEqual(k.fl, Math.PI, w + ' pico sem a aresta voltada para o centro');
      const off = Math.abs((((k.rot - k.a) % Math.PI) + Math.PI * 1.5) % Math.PI - Math.PI / 2);
      assert.ok(off <= 0.1001, w + ' pico desalinhado da circunferência: ' + off.toFixed(3));
    }
});

test('muralha: tamanho padronizado igual em todos os mundos, sem picos pequenos e sem passar do teto', () => {
  const { plan, wall } = plans();
  const hmin = L => (L ? wall.far : wall.near).H[0] * wall.floor * 0.999,
    hmax = L => (L ? wall.far : wall.near).H[1] * 1.001;
  for (const w of worlds)
    for (const k of plan[w]) {
      assert.ok(k.H >= hmin(k.L) && k.H <= hmax(k.L), w + ' altura fora do padrão: ' + k.H.toFixed(2));
      assert.ok(k.H >= 5.5, w + ' pico pequeno demais: ' + k.H.toFixed(2));
      const ratio = k.W / k.H;
      assert.ok(ratio >= wall.slope * 0.85 * 0.9 * 0.8 && ratio <= wall.slope * 1.35 * 1.09, w + ' proporção da base: ' + ratio.toFixed(2));
      assert.ok(k.d >= 58 && k.d <= 95, w + ' fora do anel: ' + k.d);
    }
  // os principais de todos os mundos ocupam a mesma faixa (nenhum mundo tem montanhas maiores ou menores que os outros)
  for (const L of [0, 1]) {
    const mx = worlds.map(w => Math.max(...plan[w].filter(k => k.L === L).map(k => k.H)));
    assert.ok(Math.max(...mx) - Math.min(...mx) <= 0.9, 'topos diferentes entre mundos na camada ' + L);
  }
});

test('muralha: a linha das montanhas fica abaixo dos planetas do céu em todos os mundos', () => {
  const { plan } = plans();
  const base = read('app-base.js'),
    sky = base.slice(base.indexOf('const SKY={'), base.indexOf('const SKYR'));
  let minCenter = 99;
  for (const m of sky.matchAll(/\['(\w+)',(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),([\d.]+)\]/g)) {
    const [x, y, z] = [+m[2] * 3.2, 4.8 + (+m[3] - 4.8) * 3.2, +m[4] * 3.2];
    minCenter = Math.min(minCenter, (Math.asin(y / Math.hypot(x, y, z)) * 180) / Math.PI);
  }
  assert.ok(minCenter > 5 && minCenter < 7, 'centro do planeta mais baixo: ' + minCenter.toFixed(1));
  let top = 0;
  for (const w of worlds) for (const k of plan[w]) top = Math.max(top, skyline(k));
  assert.ok(top <= 4.3, 'linha do horizonte: ' + top.toFixed(2) + '°');
  assert.ok(top <= minCenter - 1.4, 'a muralha tem de ficar abaixo do centro de qualquer planeta');
  assert.ok(top >= 3, 'e não pode ser tão baixa que vire colina: ' + top.toFixed(2) + '°');
});

test('muralha: picos que se sobrepõem formam grupos, com um principal e ombros que descem', () => {
  const { plan, wall, rel } = plans();
  for (const w of worlds)
    for (const L of [0, 1]) {
      const ring = plan[w].filter(m => m.L === L);
      const groups = new Map();
      for (const k of ring) (groups.get(k.g) || groups.set(k.g, []).get(k.g)).push(k);
      assert.ok(groups.size >= 4, w + ' camada ' + L + ' com poucos grupos: ' + groups.size);
      for (const [g, list] of groups) {
        assert.ok(list.length >= rel[w].g[0] && list.length <= rel[w].g[1], w + ' grupo ' + g + ' com ' + list.length + ' picos');
        const mains = list.filter(k => k.main);
        assert.strictEqual(mains.length, 1, w + ' grupo ' + g + ' sem um principal só');
        const top = Math.max(...list.map(k => k.H));
        assert.ok(Math.abs(mains[0].H - top) < 1e-9, w + ' o principal não é o mais alto do grupo');
        for (const k of list) assert.ok(k.H >= top * wall.floor * 0.999, w + ' ombro abaixo do piso do grupo');
      }
      // grupos contíguos no anel: andando pelo anel, cada grupo aparece em um trecho só (exceto a emenda de fechamento)
      const seq = ring.sort((a, b) => a.a - b.a).map(k => k.g);
      let changes = 0;
      for (let i = 0; i < seq.length; i++) if (seq[i] !== seq[(i + 1) % seq.length]) changes++;
      assert.ok(changes <= groups.size + 2, w + ' grupos misturados no anel: ' + changes + ' trocas para ' + groups.size + ' grupos');
    }
});

test('muralha: cumes e depressões, nenhuma montanha repetida e cada mundo com seu relevo', () => {
  const { plan } = plans(),
    again = plans().plan;
  assert.strictEqual(JSON.stringify(plan), JSON.stringify(again), 'o mesmo mundo sempre gera o mesmo anel');
  const shapes = new Set();
  for (const w of worlds) {
    const m = plan[w];
    for (const k of m) shapes.add(k.shape);
    for (const L of [0, 1]) {
      const H = m.filter(k => k.L === L).map(k => k.H);
      assert.ok(Math.max(...H) / Math.min(...H) >= 1.3, w + ' camada ' + L + ' sem cumes e depressões');
    }
    const key = new Set(m.map(k => [k.L, Math.round(k.a * 100), Math.round(k.W * 10)].join()));
    assert.strictEqual(key.size, m.length, w + ' tem montanha duplicada');
    const near = m.filter(k => k.L === 0);
    const opp = near.filter(k => near.some(o => o !== k && Math.abs(Math.abs(o.a - k.a) - Math.PI) < 0.02 && Math.abs(o.W - k.W) < 0.05));
    assert.ok(opp.length < near.length * 0.2, w + ' tem montanhas gêmeas em lados opostos');
  }
  assert.ok(shapes.size >= 4, 'proporções usadas: ' + [...shapes]);
  const sig = worlds.map(w => JSON.stringify(plan[w].slice(0, 8).map(k => [k.shape, Math.round(k.W)])));
  assert.strictEqual(new Set(sig).size, worlds.length, 'dois mundos com o mesmo relevo');
});
