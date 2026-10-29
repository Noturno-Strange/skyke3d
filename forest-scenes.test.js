'use strict';
// Regressão: troncos limpos, tocos na fogueira, cenários de floresta com fogueira,
// botão do GitHub, janela de vídeo sem textos de ajuda e texto da quantidade de mundos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const validate = require('./validate.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const html = require('./client-source').readClient(), server = read('server.js'), readme = read('README.md');
const slice = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
// Cada tabela vai do seu início até o fim da declaração (";" no começo da linha seguinte à última entrada).
const table = name => { const i = html.indexOf('const ' + name + '='); assert.ok(i >= 0, name); return html.slice(i, html.indexOf('\nconst ', i + 10)); };

const FIRE = ['proxima', 'kepler', 'gliese', 'osiris', 'tauri', 'esmera', 'ambar', 'nyx', 'lumen', 'duna', 'mira', 'sakura', 'nivis', 'cinder', 'trappist', 'draugr'];
const ADDED = FIRE.slice(6);
const ALL = FIRE;

test('troncos: sem manchas/objetos achatados por cima', () => {
  const fireLog = slice('function fireLog(', 'function fireStump(');
  assert.ok(!/o\.moss/.test(fireLog));
});

test('fogueira: 3 tocos para sentar, nos vãos entre os troncos e voltados para o fogo', () => {
  assert.ok(html.includes('FIRE_STUMPS=[90,180,270]'));
  assert.ok(html.includes('FIRE_STUMPS.forEach(a=>fireStump('));
  assert.ok(slice('function fireStump(', 'function forestCenter(').includes('seat(x,z,WALK.x,WALK.z,H,.08,1.4)'));
});

test('todos os 16 mundos têm fogueira, troncos e árvores, sem o sistema solar e o anel do centro', () => {
  assert.ok(!html.includes('function holo(') && !html.includes('function themeLounge(') && !html.includes('holo(0,'));
  const build = table('BUILD');
  assert.strictEqual([...build.matchAll(/\b\w+:\(\)=>spaceScene\(\{forest:1,/g)].length, 16);
  assert.strictEqual([...build.matchAll(/\btree:\[/g)].length, 16);
  assert.ok(slice('function spaceScene(', 'const BUILD=').includes('forestCenter(o);'));
});

test('são 16 mundos; todos os novos (com fogueira) estão no cliente, no validador e no servidor', () => {
  assert.strictEqual(validate.STY.size, 16);
  assert.deepStrictEqual([...validate.STY].sort(), [...ALL].sort());
  const st = table('ST'); assert.strictEqual([...st.matchAll(/\b(\w+):\{n:'/g)].length, 16);
  for (const t of ['THEME', 'LDIR', 'FOGD', 'SKY', 'DESC', 'RIMT', 'PFX'])
    for (const k of ALL) assert.ok(new RegExp('\\b' + k + ':').test(table(t)), t + ' ' + k);
  const build = table('BUILD');
  for (const k of FIRE) assert.ok(new RegExp('\\b' + k + ':\\(\\)=>spaceScene\\(\\{forest:1,').test(build), 'BUILD ' + k);
  const statusPage = read('status.html');
  for (const k of ADDED) assert.ok(new RegExp('\\b' + k + ":'[^']+'").test(statusPage), 'status ' + k);
  for (const k of ADDED) assert.strictEqual(validate.normalizeMessage({ t: 'create', style: k }).style, k);
  assert.strictEqual(validate.normalizeMessage({ t: 'create', style: 'xpto' }), null);
});

test('cada cenário novo usa só tipos de árvore, texturas e clareiras implementados', () => {
  const build = table('BUILD'), seeds = new Set();
  const treeKinds = new Set(['round', 'pine', 'spire', 'crystal', 'cactus', 'mushroom']);
  for (const k of ['crystal', 'cactus', 'mushroom']) assert.ok(html.includes(`k==='${k}'`), 'árvore ' + k);
  const gt = table('GT');
  for (const m of build.matchAll(/kinds:\[([^\]]*)\]/g)) for (const x of m[1].split(',')) assert.ok(treeKinds.has(x.trim().replace(/'/g, '')), x);
  for (const m of build.matchAll(/gtex:'tex:(\w+):90:90'/g)) assert.ok(new RegExp('\\b' + m[1] + ':\\[|k===\'' + m[1] + '\'').test(gt + html), 'textura ' + m[1]);
  for (const m of build.matchAll(/seed:(\d+)/g)) { assert.ok(!seeds.has(m[1]), 'seed repetida'); seeds.add(m[1]); }
  const known = new Set(['pebble', 'clay', 'frost', 'ash', 'leaf', 'glow', 'shard']);
  const extra = table('DUST') + html.slice(html.indexOf('const DUST='), html.indexOf('const RIMT='));
  for (const m of table('DESC').matchAll(/'(\w+)'\]/g)) assert.ok(known.has(m[1]) || new RegExp('\\b' + m[1] + ':').test(extra), 'clareira ' + m[1]);
  for (const k of FIRE) {
    const sky = table('SKY'); assert.ok(new RegExp(k + ":\\{t:'#").test(sky), 'céu ' + k);
  }
});

test('tela inicial: botão do GitHub e texto com a quantidade de mundos', () => {
  const intro = html.slice(html.indexOf('<div class="iBtns">'), html.indexOf('<div class="iFoot">'));
  assert.ok(/<a class="iBtn gh" href="https:\/\/github\.com\/Noturno-Strange\/skyke3d" target="_blank" rel="noopener noreferrer">/.test(intro));
  assert.ok(intro.indexOf('iBtn dc') < intro.indexOf('iBtn gh'), 'GitHub depois do Discord');
  assert.ok(!html.includes('Seis mundos') && (html.match(/Explore 16 mundos\./g) || []).length === 2);
  assert.ok(readme.includes('dezesseis mundos') && !/\bseis mundos/.test(readme));
  const pl = html.slice(html.indexOf('const PL=['), html.indexOf('\nconst rnd='));
  assert.strictEqual([...pl.matchAll(/\['#[0-9a-f]{6}','#[0-9a-f]{6}'\]/g)].length, 16, 'um planeta por mundo');
  assert.ok(html.includes('i/PL.length'));
});

test('janela Música/Vídeo: sem os textos de ajuda removidos', () => {
  assert.ok(!html.includes('Você controla'));
  assert.ok(html.includes('<h3 class="grip">⠿ 🎬 Música/Vídeo</h3>'));
  assert.ok(!/Música\/Vídeo[^<]*arraste aqui/.test(html));
});

test('seleção de cenário por setas: sem grade de botões, com volta ao início e teclado', () => {
  const vm = require('vm');
  assert.ok(html.includes('id="stPrev"') && html.includes('id="stNext"') && html.includes('id="stName"') && html.includes('id="stIdx"'));
  assert.ok(!html.includes('data-s=\\"${k}\\"') && !html.includes('#styles button'), 'grade de botões removida');
  assert.ok(html.includes("e.key==='ArrowLeft'||e.key==='ArrowRight'"), 'setas do teclado');
  assert.ok(html.includes('buildRoom(cfg.style);mark()}'), 'rótulo correto ao sair da sala');
  const st = table('ST');
  const ctx = vm.createContext({ cfg: { style: 'proxima' }, built: [], marked: 0, texts: {} });
  vm.runInContext(st + '\n' + slice('const SK=', 'function mark()') +
    '\nconst $=s=>({set textContent(v){texts[s]=v}});function buildRoom(k){built.push(k)}function mark(){marked++;stLabel(cfg.style)}', ctx);
  const step = d => vm.runInContext('stepStyle(' + d + ');cfg.style', ctx);
  assert.strictEqual(step(1), 'kepler');
  assert.strictEqual(step(-1), 'proxima');
  assert.strictEqual(step(-1), 'draugr', 'de Proxima volta para o último');
  assert.strictEqual(step(1), 'proxima', 'do último volta para o primeiro');
  assert.strictEqual(ctx.texts['#stIdx'], '1 / 16');
  assert.strictEqual(ctx.texts['#stName'], 'Proxima');
  assert.deepStrictEqual(ctx.built, ['kepler', 'proxima', 'draugr', 'proxima']);
});

test('ids antigas dos mundos continuam aceitas e viram as novas', () => {
  const old = { aeris: 'proxima', brontis: 'kepler', cryon: 'gliese', pyra: 'osiris', sylvaris: 'tauri', verdara: 'esmera', ambara: 'ambar', nyxara: 'nyx',
    lumeris: 'lumen', dunara: 'duna', mycelis: 'mira', rosara: 'sakura', nivara: 'nivis', cindara: 'cinder', marinis: 'trappist', umbris: 'draugr' };
  assert.strictEqual(Object.keys(old).length, 16);
  for (const [o, n] of Object.entries(old)) {
    assert.ok(validate.STY.has(n), n);
    assert.strictEqual(validate.normalizeMessage({ t: 'create', style: o }).style, n, o);
  }
  assert.strictEqual(validate.normalizeMessage({ t: 'create', style: 'constructor' }), null);
  assert.strictEqual(validate.normalizeMessage({ t: 'create', style: '__proto__' }), null);
});
