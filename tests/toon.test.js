'use strict';

// Estilo toon (desenho animado): 3 faixas duras de luz, sombra com a cor do mundo e contorno no tom escuro de cada mundo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const base = read('assets/app-base.js');
const avatar = read('assets/app-avatar.js');
const scene = read('assets/app-scene.js');

test('toon: o Three vendorizado ainda tem o trecho que o jogo ajusta para ler o gradiente em RGB', () => {
  const three = read('vendor/three-r186.min.js');
  assert.ok(three.includes('vec3( texture2D( gradientMap, coord ).r )'), 'o shader do Three mudou: revisar o ajuste em app-base.js');
  assert.ok(base.includes("sc.gradientmap_pars_fragment.replace('vec3( texture2D( gradientMap, coord ).r )','texture2D( gradientMap, coord ).rgb')"));
});

test('toon: 3 faixas (sombra, meio-tom, luz), da mais escura para a mais clara, sem sombra preta demais', () => {
  const tonb = eval(base.match(/const TONB=(\[[^\n]*\]);/)[1]);
  assert.strictEqual(tonb.length, 2, 'avatares e cenário');
  for (const [faixas, tinta] of tonb) {
    assert.strictEqual(faixas.length, 3);
    assert.strictEqual(tinta.length, 3);
    assert.ok(faixas[0] < faixas[1] && faixas[1] < faixas[2] && faixas[2] === 255, 'faixas crescentes, a de luz em 255');
    assert.ok(faixas[0] >= 100, 'a sombra não pode ficar preta');
    assert.strictEqual(tinta[2], 0, 'a faixa de luz não leva cor');
  }
  assert.ok(tonb[1][0][0] < tonb[0][0][0], 'o cenário tem sombra mais forte que os avatares (rosto limpo)');
  // textura RGBA de 3 texels: 4 bytes por faixa (antes o passo era 3 e as faixas saíam desalinhadas)
  assert.ok(base.includes('new Uint8Array(12)') && base.includes('d[i*4+j]'));
});

test('contorno: o tom vem da paleta do mundo, num objeto só lido por avatares e cenário', () => {
  assert.ok(/const OLC=new THREE\.Color\(/.test(base));
  assert.ok(base.includes('THREE.SRGBColorSpace'), 'matiz e luminosidade em sRGB (em linear o contorno ficaria claro)');
  assert.ok(/toonTint\(k\)\{[^\n]*outlineTint\(k\)\}/.test(base), 'toonTint troca a cor do contorno junto com o mundo');
  assert.ok(avatar.includes('col:{value:OLC}'), 'avatares leem OLC');
  assert.strictEqual((avatar.match(/col:\{value:OLC\}/g) || []).length, 2, 'corpo e cabelo');
  assert.ok(scene.includes('OLM.color.copy(OLC)'), 'peças do cenário leem OLC');
  assert.ok(!avatar.includes("new THREE.Color('#0a0705')"), 'sem contorno preto fixo nos avatares');
});
