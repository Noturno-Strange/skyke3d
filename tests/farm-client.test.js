'use strict';
// Cliente da fazenda: botão na barra, painel com canteiros e sementes, ligações com a rede e a página pública /fazenda.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html'), farm = read('assets/app-farm.js'), net = read('assets/app-net.js'), social = read('assets/app-social.js'), ui = read('assets/app-ui.js'), css = read('assets/app.css');
const page = read('fazenda.html'), profile = read('profile.html');

test('fazenda: botão na barra inferior ao lado da culinária e painel com abas, canteiros e sementes', () => {
  assert.match(html, /<button id="bFarm"[^>]*aria-label="Abrir Fazenda"[^>]*aria-controls="pFarm"/);
  assert.ok(html.indexOf('id="bCook"') < html.indexOf('id="bFarm"') && html.indexOf('id="bFarm"') < html.indexOf('id="bVis"'), 'depois da culinária');
  for (const i of ['pFarm', 'fmProg', 'fmLv', 'fmXp', 'fmBar', 'fmRec', 'fmBadges', 'fmt0', 'fmt1', 'fmP0', 'fmP1', 'fmGrid', 'fmSeed', 'fmPick', 'fmPlantAll', 'fmWaterAll', 'fmHarvestAll', 'fmDig', 'fmRes', 'fmOpen', 'fmCopy', 'fmq', 'fmL', 'fmDet', 'fmCount'])
    assert.match(html, new RegExp('id="' + i + '"'), i);
  assert.match(html, /id="fmBar"[^>]*role="progressbar"/);
  assert.ok(html.indexOf('/assets/app-farm.js') > html.indexOf('/assets/app-cook.js'), 'depois da culinária');
  assert.match(css, /\.fmc \.fbar i\{/, 'barra de progresso em cada canteiro');
});

test('fazenda: o arquivo roda dentro de uma função e só manda farmget e farmdo', () => {
  assert.match(farm, /\n\(\(\)=>\{\n/);
  assert.match(farm.trimEnd(), /\}\)\(\);$/);
  assert.doesNotThrow(() => new vm.Script(farm));
  const sent = [...new Set([...farm.matchAll(/\{t:'(\w+)'/g)].map(m => m[1]))].sort();
  assert.deepStrictEqual(sent, ['farmdo', 'farmget']);
  for (const f of ['window.farmBoot=', 'window.farmMsg=']) assert.ok(farm.includes(f), f);
  assert.match(farm, /lastAt\+200-Date\.now\(\)/, 'espaça as ações para o limite do servidor');
});

test('fazenda: ligações com a rede, os painéis e o perfil público', () => {
  assert.match(net, /case 'farm':case 'farmr':case 'farmfx':if\(window\.farmMsg\)window\.farmMsg\(m\)/);
  assert.match(net, /function tog\(id\)\{\['#pMochila','#pCook','#pFarm'/, 'abrir a fazenda fecha os outros painéis');
  assert.strictEqual((ui.match(/'pFarm'/g) || []).length, 3, 'arrastável, dentro da tela e com X');
  assert.match(social, /window\.farmBoot\)window\.farmBoot\(\)/, 'pede a fazenda ao entrar');
  assert.match(social, /window\.pubPp=\(\)=>/, 'link de /fazenda só com perfil público');
});

test('página /fazenda: mapa 2D, barras de progresso, recordes e conquistas, sem nada além do próprio servidor', () => {
  assert.match(page, /<canvas id="map"[^>]*role="img"/);
  assert.match(page, /id="grow"/);
  assert.match(page, /role', 'progressbar'/);
  assert.match(page, /fetch\('\/farm\.json\?id=' \+ id, \{ cache: 'no-store', credentials: 'omit' \}\)/);
  assert.match(page, /<script src="\/assets\/catalog\.js"><\/script>/);
  assert.ok(!/https?:\/\//.test(page.replace(/<!--[\s\S]*?-->/g, '')), 'sem recursos de fora');
  assert.ok(!/innerHTML/.test(page), 'texto do jogador nunca vira HTML');
  assert.match(profile, /id="fm" class="box" hidden/, 'o perfil tem a seção da fazenda');
  assert.match(profile, /'\/fazenda#' \+ location\.hash\.slice\(1\)/);
});
