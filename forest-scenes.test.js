'use strict';
// Regressão: troncos limpos, tocos na fogueira, cenários de floresta com fogueira,
// botão do GitHub, janela de vídeo sem textos de ajuda e texto da quantidade de mundos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const validate = require('./validate.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const html = read('index.html'), server = read('server.js'), readme = read('README.md');
const slice = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
// Cada tabela vai do seu início até o fim da declaração (";" no começo da linha seguinte à última entrada).
const table = name => { const i = html.indexOf('const ' + name + '='); assert.ok(i >= 0, name); return html.slice(i, html.indexOf('\nconst ', i + 10)); };

const OLD = ['aeris', 'brontis', 'cryon', 'pyra', 'sylvaris', 'verdara'];
const FIRE = ['sylvaris', 'verdara', 'ambara', 'nyxara', 'lumeris', 'dunara', 'mycelis', 'rosara', 'nivara', 'cindara', 'marinis', 'umbris'];
const ADDED = FIRE.slice(2);
const ALL = [...OLD, ...ADDED];

test('troncos: sem manchas/objetos achatados por cima', () => {
  const fireLog = slice('function fireLog(', 'function fireStump(');
  const lounge = slice('function themeLounge(', 'function holo(');
  assert.ok(!/o\.moss/.test(fireLog) && !/R\*2-\.02/.test(lounge) && !/\btop\b/.test(lounge));
});

test('fogueira: 3 tocos para sentar, nos vãos entre os troncos e voltados para o fogo', () => {
  assert.ok(html.includes('FIRE_STUMPS=[90,180,270]'));
  assert.ok(html.includes('FIRE_STUMPS.forEach(a=>fireStump('));
  assert.ok(slice('function fireStump(', 'function forestCenter(').includes('seat(x,z,WALK.x,WALK.z,H,.08,1.4)'));
});

test('são 16 mundos; todos os novos (com fogueira) estão no cliente, no validador e no servidor', () => {
  assert.strictEqual(validate.STY.size, 16);
  assert.deepStrictEqual([...validate.STY].sort(), [...ALL].sort());
  const st = table('ST'); assert.strictEqual([...st.matchAll(/\b(\w+):\{n:'/g)].length, 16);
  for (const t of ['THEME', 'LDIR', 'FOGD', 'SKY', 'DESC', 'RIMT', 'PFX'])
    for (const k of ALL) assert.ok(new RegExp('\\b' + k + ':').test(table(t)), t + ' ' + k);
  const build = table('BUILD');
  for (const k of FIRE) assert.ok(new RegExp('\\b' + k + ':\\(\\)=>spaceScene\\(\\{forest:1,').test(build), 'BUILD ' + k);
  for (const k of ADDED) assert.ok(server.includes(k + ":\\'" + k[0].toUpperCase() + k.slice(1) + "\\'"), 'status ' + k);
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
  assert.ok(!html.includes('Seis mundos') && (html.match(/Dezesseis mundos\. Um só universo\./g) || []).length === 2);
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
  const ctx = vm.createContext({ cfg: { style: 'aeris' }, built: [], marked: 0, texts: {} });
  vm.runInContext(st + '\n' + slice('const SK=', 'function mark()') +
    '\nconst $=s=>({set textContent(v){texts[s]=v}});function buildRoom(k){built.push(k)}function mark(){marked++;stLabel(cfg.style)}', ctx);
  const step = d => vm.runInContext('stepStyle(' + d + ');cfg.style', ctx);
  assert.strictEqual(step(1), 'brontis');
  assert.strictEqual(step(-1), 'aeris');
  assert.strictEqual(step(-1), 'umbris', 'de Aeris volta para o último');
  assert.strictEqual(step(1), 'aeris', 'do último volta para o primeiro');
  assert.strictEqual(ctx.texts['#stIdx'], '1 / 16');
  assert.strictEqual(ctx.texts['#stName'], 'Aeris');
  assert.deepStrictEqual(ctx.built, ['brontis', 'aeris', 'umbris', 'aeris']);
});
