'use strict';

// Itens, gestos e emojis do tema e os pares de cor normal/brilhante: o que o cliente oferece o servidor precisa aceitar.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../validate');

const base = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app-base.js'), 'utf8');
const clientItems = [...base.match(/const ITEMS=\[[\s\S]*?\];/)[0].matchAll(/\{id:'([a-z_]+)'/g)].map(m => m[1]);
const clientGests = [...base.match(/const GESTS=\[[\s\S]*?\]\];/)[0].matchAll(/\['([a-z0-9]+)','/g)].map(m => m[1]);
const clientEmo = base.match(/const EMO=\[([^\]]*)\]/)[1].split(',').length;
const clientEye = base.match(/EYE=\[([^\]]*)\]/)[1].split(',').length;

test('todo item, gesto e emoji do cliente é aceito pelo servidor', () => {
  for (const id of clientItems) assert.ok(V.normalizeMessage({ t: 'item', item: id }), 'item ' + id);
  for (const g of [...clientGests, 'stop']) assert.ok(V.normalizeMessage({ t: 'gest', g }), 'gesto ' + g);
  assert.strictEqual(V.MAX_EMO, clientEmo - 1, 'último índice de emoji igual ao do cliente');
  assert.ok(V.normalizeMessage({ t: 'emo', i: clientEmo - 1 }));
  assert.strictEqual(V.normalizeMessage({ t: 'emo', i: clientEmo }), null, 'índice além da lista');
  assert.strictEqual(V.normalizeMessage({ t: 'gest', g: 'dance23' }), null);
  assert.strictEqual(V.normalizeMessage({ t: 'item', item: 'foguete' }), null);
});

test('itens, gestos e emojis do tema estão nas listas', () => {
  for (const id of ['pocao_solar', 'pocao_nebulosa', 'pocao_cometa', 'bolo_planeta', 'bala_estelar', 'rosquinha', 'queijo_lunar', 'pirulito']) assert.ok(clientItems.includes(id), id);
  for (const g of ['rocket', 'spell', 'alien', 'scope', 'star', 'dance20', 'dance21', 'dance22']) assert.ok(clientGests.includes(g), g);
  assert.ok(base.includes("'🪐','🚀','🌙','🌟','☄️','👽','🛸','🌌','🔭','🪄'"), 'emojis do tema no fim da lista');
  const ui = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app-ui.js'), 'utf8');
  for (const g of ['rocket', 'spell', 'alien', 'scope', 'star', 'dance20', 'dance21', 'dance22']) assert.match(ui, new RegExp('\\n ' + g + ':\\('), 'animação de ' + g);
  assert.ok(!/[áa]lcool/i.test(base), 'sem a palavra álcool');
});

test('cores em pares: olhos, camisa, calça, calçado e chapéu têm versão brilhante', () => {
  assert.strictEqual(V.CR.eye, clientEye, 'paleta de olhos igual à do cliente');
  assert.ok(clientEye >= 16);
  const cfg = V.cleanCfg({ eye: clientEye - 1, eb: 1, sb: 1, pb: 0, cb: 1, hb: 1 });
  assert.deepStrictEqual([cfg.eye, cfg.eb, cfg.sb, cfg.pb, cfg.cb, cfg.hb], [clientEye - 1, 1, 1, 0, 1, 1]);
  assert.strictEqual(V.cleanCfg({ sb: 2 }), null, 'brilho é 0 ou 1');
  assert.strictEqual(V.cleanCfg({ eye: clientEye }), null, 'cor de olho além da paleta');
  const old = V.cleanCfg({ shirt: 3, br: 1 });
  assert.deepStrictEqual([old.br, old.eb, old.sb], [1, 0, 0], 'cliente antigo, sem os campos novos, continua válido');
});
