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
  assert.deepStrictEqual(order, ['bMic', 'kshowq', 'bChat', 'bVid', 'bKar', 'bEmo', 'bMochila', 'bVis', 'bInvite', 'bSet', 'bExit']);
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
