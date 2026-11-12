'use strict';
// Céu de cada planeta (ambientação fixa, sem custo por quadro), nuvens num desenho só e sombras refeitas só quando algo se mexe.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../assets/catalog.js');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'assets', f), 'utf8');
const base = read('app-base.js'),
  life = read('app-life.js'),
  ui = read('app-ui.js');
const SKYX = new Function(base.slice(base.indexOf('const SKYX={'), base.indexOf('// estrela grande: ponto com brilho suave')) + ';return SKYX')();
const SKY = new Function(base.slice(base.indexOf('const SKY={'), base.indexOf('const hx=')) + ';return SKY')();

test('céu: cada planeta tem a sua ambientação (cor do meio do domo, estrelas coloridas e faixa estelar)', () => {
  assert.deepStrictEqual(Object.keys(SKYX).sort(), Object.keys(C.ST).sort(), 'um conjunto por mundo do catálogo');
  const hex = /^#[0-9a-f]{6}$/,
    rgb = /^\d{1,3},\d{1,3},\d{1,3}$/;
  for (const [k, x] of Object.entries(SKYX)) {
    assert.match(x.mid, hex, k + ': cor do meio');
    assert.ok(x.sc.length >= 3 && x.sc.every(c => hex.test(c)) && x.sc[0] === '#ffffff', k + ': estrelas brancas e mais duas cores do planeta');
    assert.ok(x.big >= 6 && x.big <= 24, k + ': poucas estrelas grandes');
    assert.ok(rgb.test(x.band.a) && rgb.test(x.band.b) && x.band.o > 0.3 && x.band.o <= 0.7, k + ': faixa estelar discreta');
    assert.ok(x.band.p[1] >= 18 && x.band.p[1] <= 24, k + ': a faixa fica acima das nuvens e dos planetas');
  }
  // personalidade: nenhum planeta repete a combinação de cores do outro
  assert.strictEqual(new Set(Object.values(SKYX).map(x => x.mid)).size, 6);
  assert.strictEqual(new Set(Object.values(SKYX).map(x => x.band.a + '|' + x.band.b)).size, 6);
  assert.strictEqual(new Set(Object.values(SKYX).map(x => x.sc.join())).size, 6);
});

test('céu: enfeites próprios de cada bioma (aurora, Cruzeiro do Sul, lua, clarão do sol)', () => {
  assert.ok(SKYX.amazora.au, 'Amazônia: aurora');
  assert.ok(SKYX.atlanthia.cz && SKYX.panthara.cz, 'Mata Atlântica e Pantanal: Cruzeiro do Sul');
  assert.ok(SKYX.pamphora.moon, 'Pampa: lua crescente');
  assert.ok(SKYX.caatara.halo && SKY.caatara.sun, 'Caatinga: clarão em volta do sol (só onde há sol)');
  assert.ok(!SKYX.atlanthia.halo && !SKY.atlanthia.sun);
  assert.match(base, /\[\[0,1,1\],\[0,-1\.4,1\],\[-\.8,\.12,\.9\],\[\.72,\.02,\.9\],\[\.3,-\.5,\.5\]\]/, 'quatro estrelas em cruz e a intrometida, menor');
  for (const f of ['starTex', 'bandTex', 'auroraTex', 'moonTex', 'haloTex']) assert.match(base, new RegExp('const ' + f + '='), f);
});

test('céu: a cor do meio fica entre o horizonte e o alto (profundidade sem mudar a identidade do mundo)', () => {
  const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = h => { const [r, g, b] = rgbOf(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  for (const k of Object.keys(SKYX)) {
    const top = lum(SKY[k].t), hor = lum(SKY[k].h), mid = lum(SKYX[k].mid);
    assert.ok(mid > top && mid < hor, k + ': ' + [top, mid, hor].map(Math.round).join(' < '));
  }
  assert.match(base, /uniform vec3 mid;varying float vH;void main\(\)\{vec3 c=mix\(mix\(hor,mid,smoothstep\(0\.,\.3,vH\)\),top,smoothstep\(\.12,\.62,vH\)\)/);
});

test('céu: tudo é montado uma vez em buildSky; nada novo roda por quadro', () => {
  assert.strictEqual((base.match(/SKYX\[/g) || []).length, 2, 'SKYX só é lido ao montar o mundo (domo e enfeites)');
  for (const f of [life, ui]) assert.ok(!/SKYX|starTex|bandTex|auroraTex|moonTex|haloTex/.test(f), 'o laço do jogo não toca na ambientação');
  assert.match(base, /blending:THREE\.AdditiveBlending\}\);if\(rot\)m\.rotation=rot;/, 'enfeites somam luz, sem escrever profundidade');
  assert.match(base, /p\.userData\[sun\?'sun':'deco'\]=1/, 'enfeites marcados para a chuva apagá-los');
  // texturas pequenas (custo fixo de memória)
  for (const m of base.matchAll(/const (starTex|bandTex|auroraTex|moonTex|haloTex)=\([^)]*\)=>sTex\((\d+),(\d+)/g)) assert.ok(+m[2] * +m[3] <= 512 * 128, m[1] + ': ' + m[2] + '×' + m[3]);
});

test('céu: as 28 nuvens viram uma malha só (uma chamada de desenho em vez de 28)', () => {
  assert.match(base, /const cm=new THREE\.Mesh\(gc,new THREE\.MeshBasicMaterial\(\{map:cl,transparent:true,depthWrite:false,fog:false,opacity:\.9,side:THREE\.DoubleSide\}\)\);cm\.frustumCulled=false;cm\.userData\.cloud=1;skyG\.add\(cm\)/);
  assert.match(base, /for\(let i=0;i<14;i\+\+\)\{[^\n]*quad\(x,y,z,sx,sy\);quad\(-x,y,-z,sx,sy\)\}/, '14 nuvens e as espelhadas, nos mesmos lugares de antes');
  assert.ok(!/sp\(cl,/.test(base), 'nenhuma nuvem sobra como sprite separado');
});

test('chuva: nuvens, sol, planetas e enfeites do céu continuam escurecendo; a cor do meio do domo também', () => {
  assert.match(life, /c\.userData\.cloud\|\|\(c\.isSprite&&!c\.userData\.sun&&!c\.userData\.deco\)/, 'a malha das nuvens entra na lista que escurece');
  assert.match(life, /\.\.\.skyG\.children\.filter\(c=>c\.userData\.deco\)\]\.map\(c=>\[c\.material,c\.material\.opacity\]\)/, 'enfeites apagam junto com os planetas');
  assert.match(life, /if\(D\.mid\)D\.mid\.value\.copy\(D\.m\)\.lerp\(GREY,\.38\*w\)/);
  assert.match(base, /skyG\.children\[skyG\.children\.length-1\]\.userData\.sun=1/, 'o sol continua marcado');
});

test('sombras: o mapa é refeito em todo quadro (a atualização espaçada deixava copas e pedras sem desenho)', () => {
  assert.doesNotMatch(ui, /shadowMap\.autoUpdate=false/, 'sem desligar a atualização automática');
  assert.doesNotMatch(ui, /shadowMap\.needsUpdate=/, 'sem decidir no laço quando refazer');
  assert.match(ui, /\/\/ Sombras: o mapa é refeito em todo quadro \(padrão do three\.js\)/);
});
