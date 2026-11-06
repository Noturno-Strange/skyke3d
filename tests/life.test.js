'use strict';
// Vida do cenário (assets/app-life.js): chuva passageira por bioma, estrela cadente, bichos 2D de cada bioma, partículas do ar por
// bioma, luz da fogueira conforme a claridade do chão e a ilha seca no alagado.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../assets/catalog.js');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const life = read('assets/app-life.js'),
  scene = read('assets/app-scene.js'),
  sound = read('assets/app-sound.js'),
  ui = read('assets/app-ui.js'),
  base = read('assets/app-base.js'),
  html = read('index.html');
const worlds = Object.keys(C.ST);
const line = re => life.match(re)[0];

/** roda o sorteio da chuva e da estrela isolado (só precisa do hash e das tabelas) */
function clock() {
  const ctx = vm.createContext({ Math });
  vm.runInContext(
    [line(/const ih=n=>\{[^\n]*\};/), line(/const ksOf=[^\n]*;/), line(/const RAIN=\{[^\n]*\};/), line(/const RWIN=[^\n]*;/),
      life.slice(life.indexOf('function rainAt'), life.indexOf('function rainMesh')), line(/const SWIN=[^\n]*;/)]
      .join('\n').replace(/\bconst /g, 'var ') + '\nthis.rainAt=rainAt;this.ih=ih;',
    ctx
  );
  return ctx;
}

test('vida: script próprio, carregado antes do avatar (que monta a primeira sala) e ligado ao buildRoom e ao laço', () => {
  assert.ok(html.indexOf('/assets/app-colony.js') < html.indexOf('/assets/app-life.js') && html.indexOf('/assets/app-life.js') < html.indexOf('/assets/app-avatar.js'));
  assert.match(life, /\n\(\(\)=>\{\n/, 'tudo dentro de uma função (nada vaza para o escopo global)');
  assert.match(life, /window\.lifeBuild=k=>/);
  assert.match(life, /window\.lifeTick=dt=>/);
  assert.match(scene, /q\.receiveShadow=true\}\);lifeBuild\(k\)\}/, 'buildRoom cria a vida do bioma no fim');
  assert.match(ui, /emberTick\(t\);lifeTick\(dt\);/, 'o laço anima a cada quadro');
  assert.ok(!/window\.lifeArt|lifeScan/.test(life), 'sem ganchos de depuração nem varredura duplicada');
  assert.match(life, /for\(const o of FOOT\)/, 'os animais desviam das pegadas que declutter deixou');
});

test('chuva: passageira, com chance e duração por bioma, igual para todos (hash inteiro, não seno) e entrando aos poucos', () => {
  const ctx = clock();
  assert.ok(!/Math\.sin/.test(line(/const ih=n=>\{[^\n]*\};/)) && /Math\.imul/.test(line(/const ih=n=>\{[^\n]*\};/)), 'hash inteiro: o seno pode variar entre navegadores');
  const t0 = 1793900000,
    frac = {};
  for (const k of worlds) {
    let on = 0,
      n = 0;
    for (let t = t0; t < t0 + 86400 * 4; t += 20) {
      const w = ctx.rainAt(k, t);
      assert.ok(w >= 0 && w <= 1, k + ' intensidade fora de 0..1');
      n++;
      if (w > 0) on++;
    }
    frac[k] = on / n;
  }
  // floresta úmida chove mais; o pampa e o cerrado de vez em quando; a caatinga quase nunca; nenhum bioma fica com chuva o tempo todo
  assert.ok(frac.amazora > frac.atlanthia && frac.atlanthia > frac.panthara && frac.panthara > frac.cerron && frac.cerron > frac.caatara, JSON.stringify(frac));
  for (const k of worlds) assert.ok(frac[k] > 0 && frac[k] < 0.4, k + ': ' + frac[k]);
  // entra e sai aos poucos: de um segundo para o outro a intensidade muda no máximo 1/8
  for (let t = t0; t < t0 + 86400; t++) assert.ok(Math.abs(ctx.rainAt('amazora', t + 1) - ctx.rainAt('amazora', t)) <= 1 / 8 + 1e-9);
  // céu fechado com a mesma conta do ajuste de brilho; sol e planetas somem atrás das nuvens; som próprio e calibrado
  assert.match(life, /hemi\.intensity=T\.h\[2\]\*\.8\*LGH\*BRI\*\(1-\.22\*w\)/);
  assert.match(life, /for\(const\[m,o\]of L\.sun\)m\.opacity=o\*\(1-\.85\*w\)/);
  assert.match(base, /skyG\.children\[skyG\.children\.length-1\]\.userData\.sun=1/, 'o sol fica marcado no céu');
  assert.match(sound, /function rainSnd\(w\)\{/);
  assert.match(sound, /const TRIM=\{rain:[\d.]+,/, 'volume da chuva calibrado (tools/audio-audit.js mede a chuva)');
  assert.match(read('tools/audio-audit.js'), /k: 'chuva', rain: 1/);
});

test('estrela cadente: de vez em quando, na faixa do céu que a câmera vê, acima das montanhas e nunca na chuva forte', () => {
  const ctx = clock();
  const [, win] = life.match(/const SWIN=(\d+),SDUR=([\d.]+);/);
  let n = 0;
  for (let s = 0; s < 1000; s++) if (ctx.ih(s * 31337 + 11) < 0.5) n++;
  const perMin = (n / 1000) * (60 / +win);
  assert.ok(perMin > 0.4 && perMin < 1.2, 'uma a cada ~1 a 2 min: ' + perMin.toFixed(2) + '/min');
  const m = life.match(/e:\.(\d+)\+ih\(s\*389\+2\)\*\.(\d+),daz:[^,]*,de:-\.(\d+)/);
  const e0 = +('.' + m[1]), de = +('.' + m[2]), fall = +('.' + m[3]), deg = r => (r * 180) / Math.PI;
  assert.ok(deg(e0 + de) <= 14, 'começa abaixo do topo da tela (~13°): ' + deg(e0 + de).toFixed(1));
  assert.ok(deg(e0 - fall) >= 5.8, 'termina acima das montanhas (4,2°) e dos planetas mais baixos: ' + deg(e0 - fall).toFixed(1));
  assert.match(life, /if\(isRm\(\)\|\|L\.w>\.3\|\|/, 'sem estrela com reduzir movimento ou chuva forte');
});

test('bichos 2D: aves e animais de chão próprios de cada bioma, poucos, com sombra e respeitando reduzir movimento', () => {
  const fauna = vm.runInNewContext('(' + life.match(/const FAUNA=(\{[\s\S]*?\}\});/)[1] + ')');
  const spc = life.slice(life.indexOf('const SPC={'), life.indexOf('const FAUNA='));
  const seen = new Map();
  for (const w of worlds) {
    const F = fauna[w];
    assert.ok(F && F.a.length >= 1 && F.c.length >= 2, w + ': ao menos uma ave e dois animais de chão');
    const total = [...F.a, ...F.c].reduce((t, [, q]) => t + q, 0);
    assert.ok(total >= 6 && total <= 10, w + ': quantidade moderada (' + total + ')');
    for (const [n] of [...F.a, ...F.c]) {
      assert.ok(new RegExp('\\b' + n + ':\\{d:(bird|quad|rept|ema),s:[\\d.]+,v:[\\d.]+').test(spc), 'espécie sem desenho: ' + n);
      (seen.get(n) || seen.set(n, []).get(n)).push(w);
    }
    for (const [n] of F.a) assert.ok(new RegExp('\\b' + n + ':\\{d:bird,').test(spc), w + ': ' + n + ' voa');
  }
  // cada bioma com uma combinação própria (só o carcará aparece em dois: cerrado e caatinga)
  const sets = worlds.map(w => [...fauna[w].a, ...fauna[w].c].map(x => x[0]).sort().join());
  assert.strictEqual(new Set(sets).size, worlds.length);
  for (const [n, ws] of seen) assert.ok(ws.length === 1 || n === 'carcara', n + ' repetido em ' + ws);
  assert.match(life, /new THREE\.MeshBasicMaterial\(\{map:blobTex\(\)/, 'animais de chão com sombra (nada flutuando)');
  assert.match(life, /const free=\(x,z,r\)=>\{const d=Math\.hypot\(x-WALK\.x,z-WALK\.z\);if\(d<13\.5\|\|d>33\)return false;/, 'fora da clareira dos jogadores e antes das montanhas');
  assert.match(life, /A\.spr\.visible=!still;if\(still\)continue;/, 'reduzir movimento: aves escondidas');
  assert.match(life, /ol='#'\+OLC\.getHexString\(\)/, 'contorno na cor de contorno do mundo (estilo toon)');
});

test('partículas do ar: duas camadas próprias de cada bioma, só com formas desenhadas', () => {
  const pfx = vm.runInNewContext('(' + scene.match(/const PFX=(\{[\s\S]*?\]\]\});/)[1] + ')');
  const kinds = new Set(['dot', 'leaf', 'petal', 'seed', 'butterfly']);
  for (const w of worlds) {
    assert.strictEqual(pfx[w].length, 2, w);
    for (const [col, size, , , kind, , n] of pfx[w]) {
      assert.match(col, /^#[0-9a-f]{6}$/);
      assert.ok(size > 0 && size < 0.4 && n > 0 && n <= 70, w + ' ' + kind);
      assert.ok(kinds.has(kind), 'forma ' + kind);
      if (kind !== 'dot') assert.ok(scene.includes("kind==='" + kind + "'"), 'desenho de ' + kind);
    }
  }
  assert.ok(!/kind==='ring'|dotT/.test(scene), 'sem as bolhas do oceano antigo nem textura sem uso');
  assert.match(scene, /function partTick\(dt\)\{if\(rm\)return;for\(const P of PT\)/);
});

test('luz e cor: fogueira mais contida em chão claro e clareira seca no alagado', () => {
  assert.match(base, /let FIREK=1;/);
  assert.match(scene, /FIREK=GAVG\?Math\.max\(\.55,Math\.min\(1,1\.25-h\.l\)\):1/, 'força da fogueira pela claridade do chão');
  assert.match(ui, /\*LG\*FIREK;fireL\.distance=/);
  assert.match(ui, /m\.material\.opacity=Math\.min\(1,Math\.max\(\.55,\.4\+\.6\*q\)\)\*FIREK/, 'o brilho no chão acompanha');
  assert.match(scene, /function waterRing\(\)\{/);
  assert.match(scene, /mesh\(waterRing\(\),/, 'água em anel em volta da clareira');
  assert.match(scene, /R=r<1\.25\?11\.6:r<1\.75\?14\.2:95/, 'borda de dentro esmaecendo entre 11,6 e 14,2 m');
});
