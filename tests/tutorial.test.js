'use strict';
// Tutorial em quadrinhos (página inicial): um quadrinho por vez, folhear, música própria e texto que bate com o jogo de verdade.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../assets/catalog.js');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html'),
  intro = read('assets/intro.js'),
  css = read('assets/app.css'),
  sound = read('assets/app-sound.js'),
  readme = read('README.md');
const tut = html.slice(html.indexOf('<div id="tut"'), html.indexOf('<div id="ui">'));
const num = re => {
  const m = re.exec(tut);
  assert.ok(m, 'trecho do tutorial não encontrado: ' + re);
  return +m[1];
};

test('tutorial: as contagens do texto batem com o catálogo (mundos, peles, cabelos, rostos, cores)', () => {
  assert.strictEqual(num(/escolha o <b>mundo<\/b> \(são (\d+)/), Object.keys(C.ST).length, 'mundos');
  assert.strictEqual(num(/(\d+) cores de pele/), C.SKIN.length, 'cores de pele');
  assert.strictEqual(num(/(\d+) cabelos/), C.HS.length, 'cabelos');
  assert.strictEqual(num(/(\d+) rostos/), C.FACES.length, 'rostos');
  assert.strictEqual(num(/com (\d+) cores de roupa/), C.PAL.length, 'cores de roupa');
  assert.strictEqual(num(/e (\d+) de cabelo/), C.HAIRC.length, 'cores de cabelo');
  // o README fala dos mesmos números
  assert.match(readme, new RegExp('\\*\\*' + Object.keys(C.ST).length + ' mundos\\*\\*'));
  assert.match(readme, new RegExp(C.FACES.length + ' rostos'));
  assert.match(readme, new RegExp(C.HS.length + ' cabelos'));
});

test('tutorial: os nomes de botões e padrões citados existem no jogo', () => {
  assert.match(html, /id="drop"[^>]*>🗑 Guardar</, 'botão de guardar da mochila');
  assert.match(tut, /use <b>🗑 Guardar<\/b>/);
  assert.match(html, /id="vgo">Iniciar para todos/, 'botão do vídeo');
  assert.match(tut, /<b>Iniciar para todos<\/b>/);
  assert.match(html, /Cada pessoa começa a ouvir quando clicar em <b>Ouvir<\/b>/, 'rádio: cada um clica em Ouvir');
  // microfone: só o cancelamento de eco começa ligado
  assert.match(read('assets/app-voice.js'), /MIC_FX_DEFAULT=\{echoCancellation:true,noiseSuppression:false,autoGainControl:false\}/);
  assert.ok(!/ganho automático já vem ligado/.test(tut), 'o tutorial não diz que o ganho automático vem ligado');
  assert.match(tut, /cancelamento de eco já vem ligado/);
  assert.match(tut, /aba <b>✨ Nome<\/b>/, 'nome personalizado');
});

test('tutorial: 10 imagens do jogo atual, refeitas por tools/tutorial-shots.js', () => {
  const imgs = [...tut.matchAll(/src="\/assets\/(tut-\d+\.jpg)"/g)].map(m => m[1]);
  assert.deepStrictEqual(imgs, Array.from({ length: 10 }, (_, i) => 'tut-' + (i + 1) + '.jpg'));
  for (const f of imgs) assert.ok(fs.statSync(path.join(root, 'assets', f)).size > 20000, f);
  const tool = read('tools/tutorial-shots.js');
  assert.match(tool, /'tut-' \+ \+\+n \+ '\.jpg'/, 'grava tut-1.jpg … tut-10.jpg');
  assert.match(tool, /width: W, height: H, scale: SCALE/, 'no tamanho que o index.html declara');
  assert.match(tool, /IDENTITY_FILE: '0'/, 'servidor de teste sem gravar em data/');
});

test('tutorial: um quadrinho por vez, com Anterior/Próximo, bolinhas, teclado e arrastar', () => {
  assert.match(tut, /<nav class="tutNav" aria-label="Quadrinhos do tutorial"><button id="tutPrev"/);
  assert.match(tut, /<span id="tutPos" aria-live="polite">1 de 11<\/span>/, 'posição anunciada');
  assert.match(tut, /<button id="tutNext" class="tutBtn" type="button" aria-label="Próximo quadrinho">/);
  assert.match(css, /\.pn\{[^}]*display:none;/, 'só o quadrinho atual aparece');
  assert.match(css, /\.pn\.on\{display:flex\}/);
  assert.match(intro, /prev\.disabled=i===0;next\.disabled=i===n-1;pos\.textContent=\(i\+1\)\+' de '\+n/, 'botões desligados nas pontas');
  assert.match(intro, /\{ArrowRight:1,PageDown:1,ArrowLeft:-1,PageUp:-1\}\[e\.key\]/, 'setas do teclado');
  assert.ok(!/pointerdown|pointerType/.test(intro), 'jogo só para computador: sem arrastar com o dedo');
  assert.match(intro, /\(i===n-1\?go:i===0\?next:prev\)\.focus/, 'o foco nunca fica num botão desligado nem num quadrinho escondido');
  assert.match(intro, /img\[loading=lazy\]'\)\.forEach\(im=>\{im\.loading='eager'\}\)/, 'imagens carregam quando o tutorial abre');
  assert.match(css, /\.tutHead p,\.tutDots,\.tutBtn \.tl\{display:none\}/, 'janela estreita ou zoom alto: os botões ficam só com as setas');
});

test('tutorial: a folha vira presa pela lombada, dentro do quadro, com som de papel; sem movimento, só esmaece', () => {
  assert.match(css, /\.tutGrid\{[^}]*perspective:3600px;overflow:hidden/, 'a folha não sai do quadro');
  assert.match(css, /\.pn\.leaf\{z-index:2;transform-origin:left center;backface-visibility:hidden/);
  assert.match(css, /@keyframes tutLeafGo\{from\{transform:rotateY\(0\)\}/);
  assert.match(css, /@keyframes tutLeafCome\{from\{transform:rotateY\(-104deg\)/);
  assert.match(css, /\.tutHead\{[^}]*z-index:3/);
  assert.match(css, /\.tutNav\{[^}]*z-index:3/);
  assert.match(intro, /if\(fwd\)\{from\.classList\.add\('leaf','go'\);to\.classList\.add\('dim'\)\}else\{to\.classList\.add\('leaf','come'\);from\.classList\.add\('under'\)\}/);
  assert.match(intro, /if\(moved&&snd&&!reduce\)/, 'com redução de movimento não há giro');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.pn\.on\{animation:tutFade \.25s ease-out\}/);
  assert.match(intro, /sfx\('page'\)/);
  assert.match(sound, /case 'page':B\(/, 'som de papel');
  assert.match(sound, /page:\d/, 'calibrado (tools/audio-audit.js)');
  assert.match(read('tools/audio-audit.js'), /const UI = new Set\(\['click', 'page',/, 'na categoria de interface');
});

test('tutorial: faixa lofi própria enquanto está aberto', () => {
  assert.match(sound, /function tutOn\(\)\{const t=document\.getElementById\('tut'\);return!!t&&!t\.classList\.contains\('hide'\)\}/);
  assert.match(sound, /if\(mode==='menu'\)return tutOn\(\)\?'tutorial':'menu'/);
  assert.match(sound, /mus_tutorial:\d/, 'volume calibrado');
});

test('README: o número de testes citado é o da suíte', () => {
  const n = fs
    .readdirSync(__dirname)
    .filter(f => f.endsWith('.test.js'))
    .reduce((s, f) => s + (fs.readFileSync(path.join(__dirname, f), 'utf8').match(/^\s*test\(/gm) || []).length, 0);
  const m = /suíte completa com `node:test` \((\d+) testes\)/.exec(readme);
  assert.ok(m, 'linha do npm test no README');
  assert.strictEqual(+m[1], n, 'atualize o número de testes no README');
});
