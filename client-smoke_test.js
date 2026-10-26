'use strict';
// Regressão estática do cliente: sintaxe, ids do DOM referenciados, CSP e barra de controles.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
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
  assert.deepStrictEqual(order, ['kshowq', 'bChat', 'bVid', 'bKar', 'bEmo', 'bMochila', 'bVis', 'bInvite', 'bSet', 'bExit']);
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
  assert.ok(html.includes("$('#mic').classList.toggle('talk',me.talk)"));
  assert.ok(html.includes('#mic.talk{'));
});
