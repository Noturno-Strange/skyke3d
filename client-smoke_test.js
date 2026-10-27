'use strict';
// Regressão estática do cliente: sintaxe, ids do DOM referenciados, CSP e barra de controles.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = require('./client-source').readClient();
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

test('os scripts inline compilam', () => {
  assert.strictEqual(scripts.length, 2);
  scripts.forEach((s, i) => assert.doesNotThrow(() => new vm.Script(s, { filename: 'inline' + i })));
});

test('todo id usado via $("#id") existe no HTML (ou é criado por script)', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const dynamic = new Set(['ytapi']);
  const used = new Set([...scripts.join('\n').matchAll(/\$\('#([A-Za-z][\w-]*)'\)/g)].map(m => m[1]));
  const missing = [...used].filter(i => !ids.has(i) && !dynamic.has(i));
  assert.deepStrictEqual(missing, []);
});

test('ids duplicados não existem', () => {
  const all = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const dup = all.filter((id, i) => all.indexOf(id) !== i);
  assert.deepStrictEqual(dup, []);
});

test('compatível com o CSP: sem handlers inline, eval ou new Function', () => {
  assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(html.replace(/<script>[\s\S]*?<\/script>/g, '')), 'handler inline no HTML');
  const js = scripts.join('\n');
  assert.ok(!/\beval\s*\(/.test(js));
  assert.ok(!/new Function\s*\(/.test(js));
});

test('barra: ordem agrupada e tamanho esperado', () => {
  const bar = html.match(/<div id="bar"[\s\S]*?<div id="pMochila"/)[0];
  const order = [...bar.matchAll(/<button id="(\w+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(order, ['bChat', 'bVid', 'bKar', 'bEmo', 'bGes', 'bMochila', 'bVis', 'bInvite', 'bSet', 'bExit']);
});

test('tela cheia fica na barra de controles, ao lado de + e do volume', () => {
  assert.ok(!/\.fsbtn\{/.test(html), 'CSS antigo do botão flutuante ainda presente');
  for (const [stage, box, fs, vol] of [['vstage', 'vbox', 'vfs', 'vvol'], ['kstage', 'kbox', 'kfs', 'kvol']]) {
    const stageStart = html.indexOf(`<div class="vstage" id="${stage}">`);
    assert.ok(stageStart >= 0, stage + ' ausente');
    const barStart = html.indexOf('<div class="vctl">', stageStart);
    assert.ok(barStart > stageStart, stage + ': barra ausente');
    const stageHtml = html.slice(stageStart, barStart);
    assert.ok(stageHtml.includes(`id="${box}"`), stage + ': vídeo fora do palco');
    assert.ok(!stageHtml.includes('data-rs=') && !stageHtml.includes('class="kvol"'), stage + ': controles dentro do palco');
    const barHtml = html.slice(barStart, html.indexOf('</div></div>', barStart));
    assert.ok(barHtml.indexOf('data-d="1"') < barHtml.indexOf(`id="${fs}"`), stage + ': tela cheia deve vir depois do +');
    assert.ok(barHtml.indexOf(`id="${fs}"`) < barHtml.indexOf(`id="${vol}"`), stage + ': volume deve vir depois da tela cheia');
  }
});

test('recursos de desempenho presentes e com opt-out', () => {
  for (const s of ['?perf', 'perfTick', 'adaptRes', 'mergeStatic', 'NOMERGE', 'disposeTree', 'partBuild'])
    assert.ok(html.includes(s === '?perf' ? 'perf(=|&|$)' : s), s);
});

test('cenário: descampado por bioma e troncos no lugar de sofás/mesas', () => {
  for (const k of ['aeris', 'brontis', 'cryon', 'pyra', 'sylvaris', 'verdara'])
    assert.ok(new RegExp(k + ":\\['#").test(html.slice(html.indexOf('const DESC='))), 'DESC ' + k);
  assert.ok(html.includes('descampado(CUR)'));
  assert.ok(!html.includes('TorusGeometry(10.5'), 'borda brilhante antiga removida');
  const lounge = html.slice(html.indexOf('function themeLounge'), html.indexOf('function holo('));
  assert.ok(!/sof[áa]/i.test(lounge.replace(/\/\/[^\n]*\n/g, '')) && !lounge.includes('TorusGeometry'), 'sofá/mesa removidos');
});

test('ônibus espacial: formas curvas, turbinas com fogo animado e sem escala achatada', () => {
  const bus = html.slice(html.indexOf('function spaceBus'), html.indexOf('const NOMERGE'));
  for (const k of ['LatheGeometry', 'ExtrudeGeometry', 'quadraticCurveTo', 'AdditiveBlending', 'jets.push'])
    assert.ok(bus.includes(k), k);
  assert.ok(!/SZ/.test(bus), 'escala não uniforme removida');
  assert.ok(html.includes('if(jets.length)jetTick(t)'), 'chamas animadas no loop');
  assert.ok(html.includes('jets=[];jetL=null;emb=null'), 'chamas reiniciadas em buildRoom');
});

test('microfone: um só botão no HUD superior, sem botão duplicado na barra', () => {
  assert.ok(!html.includes('id="bMic"') && !html.includes('#bMic'), 'bMic antigo removido');
  const hud = html.match(/<div id="hud"[\s\S]*?<\/div>\n/)[0];
  assert.ok(/<button class="p" id="mic" type="button"[^>]*aria-pressed="false"/.test(hud), 'botão #mic no HUD');
  assert.ok(html.includes("$('#mic').onclick=()=>stream?stopMic():startMic();"));
  assert.ok(html.includes('#mic[data-s=on]{border-color:var(--kg);box-shadow:0 0 0 1px var(--kg)}'), 'só uma borda verde fina quando ligado');
  assert.ok(!html.includes('#mic.talk') && !html.includes("$('#mic').classList.toggle('talk'"), 'sem brilho extra ao falar');
  assert.ok(!/#mic\{[^}]*border-left/.test(html), 'sem borda lateral grossa');
});

test('HUD: sem botões de sala/pessoas; fila do karaokê ao lado do microfone', () => {
  const hud = html.match(/<div id="hud"[\s\S]*?<\/div>\n/)[0];
  assert.ok(!hud.includes('id="hn"') && !hud.includes('id="cnt"'), 'botões de sala e pessoas removidos');
  assert.ok(!html.includes('id="pPpl"') && !html.includes('renderPpl') && !html.includes('updCnt'), 'lista de pessoas removida');
  const ids = [...hud.matchAll(/<(?:button|span) class="p[^"]*" id="(\w+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(ids.slice(0, 2), ['mic', 'kshowq']);
  assert.ok(/id="kshowq"/.test(hud) && !html.match(/<div id="bar"[\s\S]*?<div id="pMochila"/)[0].includes('kshowq'));
  assert.ok(/<button class="p hide" id="kshowq"/.test(hud), 'começa oculto até entrar no karaokê');
});

test('gestos: botão na barra ao lado de emojis, sem abas no painel', () => {
  assert.ok(html.indexOf('id="bEmo"') < html.indexOf('id="bGes"') && html.indexOf('id="bGes"') < html.indexOf('id="bMochila"'));
  assert.ok(!html.includes('id="emoTabs"') && !html.includes('data-etab'));
  assert.ok(html.includes("$('#bGes').onclick=()=>emoToggle('eGes')"));
  assert.ok(html.includes("$('#bEmo').onclick=()=>emoToggle('eEmo')"));
});

test('fila do karaokê: sem textos Cantando e Você', () => {
  const fn = html.slice(html.indexOf('function renderK(){'), html.indexOf('function syncK('));
  assert.ok(!fn.includes("tag('Cantando')") && !fn.includes("tag('Você')"));
  assert.ok(fn.includes("(isMe?' mine':'')"), 'linha própria destacada sem texto');
});

test('favicon e cursores embutidos (data: URI) e liberados pelo CSP', () => {
  const icons = [...html.matchAll(/<link rel="icon"[^>]*href="([^"]+)"/g)].map(m => m[1]);
  assert.strictEqual(icons.length, 2, 'SVG + PNG de reserva');
  const svg = decodeURIComponent(icons[0].replace('data:image/svg+xml,', ''));
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>') && svg.includes('viewBox'), 'favicon SVG válido');
  assert.ok(icons[1].startsWith('data:image/png;base64,'));
  assert.ok(Buffer.from(icons[1].split(',')[1], 'base64').slice(1, 4).toString() === 'PNG', 'PNG de verdade');
  for (const v of ['--cur', '--cur-ptr']) {
    const m = html.match(new RegExp(v + ':url\\("(data:image/svg\\+xml,[^"]+)"\\) 5 3,(auto|pointer)'));
    assert.ok(m, v);
    const s = decodeURIComponent(m[1].replace('data:image/svg+xml,', ''));
    assert.ok(s.startsWith('<svg') && s.includes("width='32'") && s.endsWith('</svg>'), v + ' é SVG 32x32');
  }
  assert.ok(html.includes('html,body{cursor:var(--cur)}'));
  assert.ok(html.indexOf('{cursor:var(--cur-ptr)}') < html.indexOf('button:disabled{opacity:.5;cursor:not-allowed}'), 'desabilitado mantém not-allowed');
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.ok(/img-src 'self' data:/.test(server), 'CSP precisa liberar data: para ícone e cursor');
});
