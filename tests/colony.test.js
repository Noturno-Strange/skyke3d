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
  const sizes = worlds.map(w => (new RegExp(w + ':\\{g:\\[(.*?)\\]\\}').exec(rel) || [])[1]);
  assert.ok(sizes.every(Boolean));
  assert.ok(new Set(sizes).size >= 3, 'tamanhos de cordilheira distintos: ' + new Set(sizes).size);
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

test('montanhas: exceção às regras, todas são morros em hemisfério (parte curva para cima), sem outras formas', () => {
  const g = block(scene, 'function mountGeo(');
  assert.deepStrictEqual(
    [...g.matchAll(/new THREE\.(\w+Geometry)\(([^;]*)\)/g)].map(m => m[1]),
    ['SphereGeometry'],
    'uma única geometria: esfera cortada'
  );
  assert.ok(/SphereGeometry\(R,\d+,\d+,0,2\*PI,0,PI\/2\)/.test(g), 'só a metade de cima da esfera (theta de 0 a 90°)');
  assert.ok(!/ConeGeometry|CylinderGeometry|OctahedronGeometry|IcosahedronGeometry|BoxGeometry/.test(g), 'nenhuma outra forma');
  assert.ok(!scene.includes('skewTetra'), 'sem cisalhamento de tetraedro');
  const rel = block(scene, 'const MREL=');
  for (const w of worlds) assert.ok(new RegExp(w + ':\\{g:\\[\\d,\\d\\]\\}').test(rel), 'relevo de ' + w);
});

/** Roda `mountPlan` isolada (só precisa de rn, PI, MREL e MWALL). */
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
    scene.slice(scene.indexOf('const MGAP='), scene.indexOf('const MPC={}'))
  ].join('\n');
  const ctx = vm.createContext({ Math });
  vm.runInContext(src, ctx);
  return {
    plan: Object.fromEntries(worlds.map(w => [w, JSON.parse(JSON.stringify(vm.runInContext('mountPlan(' + JSON.stringify(w) + ')', ctx)))])),
    wall: JSON.parse(JSON.stringify(vm.runInContext('MWALL', ctx))),
    sep: (a, b) => vm.runInContext('hillSep(' + JSON.stringify(a) + ',' + JSON.stringify(b) + ')', ctx),
    ground: r => vm.runInContext('hillG(' + r + ')', ctx),
    rel: JSON.parse(JSON.stringify(vm.runInContext('MREL', ctx)))
  };
}
const CAM_Y = 4.8,
  CAM_FAR = 19.4; // pior posição da câmera: 10,2 m de caminhada + 9,2 m atrás do jogador
// elevação da tangente da câmera à cúpula (centro 1,5 m abaixo do chão, raio = altura): é a linha do horizonte que o jogador enxerga
const skyline = k => {
  const D = k.d - CAM_FAR,
    dy = -1.5 - CAM_Y;
  return ((Math.atan2(dy, D) + Math.asin(k.H / Math.hypot(D, dy))) * 180) / Math.PI;
};

test('muralha: cada camada é uma circunferência exata de 360°, com morros que se emendam sem se atravessar', () => {
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
  const { plan, sep, ground } = plans();
  for (const w of worlds) {
    const m = plan[w];
    for (let i = 0; i < m.length; i++) {
      // hemisfério com centro 1,5 m abaixo do chão: sai do chão num círculo de raio > 0 e o topo fica acima dele
      assert.ok(ground(m[i].W) > 5 && m[i].H - 1.5 > 3, w + ' morro sem apoio no chão');
      for (let j = i + 1; j < m.length; j++) {
        if (Math.abs(m[i].d - m[j].d) > 40) continue;
        assert.ok(sep(m[i], m[j]) >= 0.1, w + ' morros ' + i + ' e ' + j + ' (camadas ' + m[i].L + '/' + m[j].L + ') se atravessam');
      }
    }
  }
});

test('montanhas: degradê do tema de cada mundo, da base escura ao pico mais claro', () => {
  const pal = block(scene, 'const MPAL='),
    lum = h => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
  for (const w of worlds) {
    const m = new RegExp(w + ":\\['(#\\w+)','(#\\w+)','(#\\w+)'").exec(pal);
    assert.ok(m, 'paleta de ' + w);
    assert.ok(lum(m[1]) < lum(m[2]) && lum(m[2]) < lum(m[3]), w + ': a paleta precisa clarear da base para o pico');
  }
  const fn = block(scene, 'function mountains(k)');
  assert.ok(/peak=lt\.clone\(\)\.lerp\(new THREE\.Color\('#ffffff'\)/.test(fn) && /lerp\(peak,/.test(fn), 'o degradê termina num pico mais claro que a rocha');
  assert.ok(/MPC\[k\]/.test(fn), 'plano calculado uma vez por mundo');
});

test('montanhas: visual de desenho animado (degraus de cor, 3 faixas de luz e contorno escuro em volta de cada morro)', () => {
  const fn = block(scene, 'function mountains(k)');
  assert.ok(/MBANDS=4/.test(scene) && /Math\.floor\(rv\*MBANDS\)/.test(fn), 'altura em degraus (4 faixas)');
  assert.ok(/lq=lit<\.18\?0:lit<\.55\?\.55:1/.test(fn), 'luz em 3 faixas, como o resto do cenário');
  assert.ok(!/rn\(x\*1\.7/.test(fn), 'sem grão por vértice: cada face tem uma cor só');
  assert.ok(/side:THREE\.BackSide/.test(fn) && /OLP?\b|OP\.push/.test(fn), 'contorno: casco inflado visto por dentro');
  assert.ok(/OLC/.test(fn), 'cor do contorno parte da cor de contorno do mundo');
  const mp = block(scene, 'const MPAL=');
  const hex = [...mp.matchAll(/#[0-9a-f]{6}/gi)].map(m => m[0]);
  assert.ok(new Set(hex).size >= 53, 'cada mundo com sua paleta própria: ' + new Set(hex).size + ' cores');
});

test('muralha: todo morro é um hemisfério de verdade (raio igual à altura)', () => {
  const { plan } = plans();
  for (const w of worlds) for (const k of plan[w]) assert.strictEqual(k.W, k.H, w + ' morro achatado ou esticado');
});

test('muralha: tamanho padronizado igual em todos os mundos, sem picos pequenos e sem passar do teto', () => {
  const { plan, wall } = plans();
  const hmin = L => (L ? wall.far : wall.near).H[0] * wall.floor * 0.999,
    hmax = L => (L ? wall.far : wall.near).H[1] * 1.001;
  for (const w of worlds)
    for (const k of plan[w]) {
      assert.ok(k.H >= hmin(k.L) && k.H <= hmax(k.L), w + ' altura fora do padrão: ' + k.H.toFixed(2));
      assert.ok(k.H >= 5.5, w + ' pico pequeno demais: ' + k.H.toFixed(2));
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
  for (const w of worlds) {
    const m = plan[w];
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
  const sig = worlds.map(w => JSON.stringify(plan[w].slice(0, 8).map(k => [Math.round(k.W * 10)])));
  assert.strictEqual(new Set(sig).size, worlds.length, 'dois mundos com o mesmo relevo');
});
