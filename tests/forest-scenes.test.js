'use strict';
// Regressão: troncos limpos, tocos na fogueira, cenários de floresta com fogueira,
// botão do GitHub, janela de vídeo sem textos de ajuda e texto da quantidade de mundos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const validate = require('../lib/validate.js');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = require('./client-source').readClient(), readme = read('README.md');
const slice = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
// Cada tabela vai do seu início até o fim da declaração (";" no começo da linha seguinte à última entrada).
const table = name => { const i = html.indexOf('const ' + name + '='); assert.ok(i >= 0, name); return html.slice(i, html.indexOf('\nconst ', i + 10)); };

// os 6 mundos, um por bioma brasileiro (Amazônia, Cerrado, Mata Atlântica, Caatinga, Pantanal e Pampa)
const FIRE = ['amazora', 'cerron', 'atlanthia', 'caatara', 'panthara', 'pamphora'];
const ADDED = FIRE;
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

test('todos os 6 mundos têm fogueira, troncos e árvores, sem o sistema solar e o anel do centro', () => {
  assert.ok(!html.includes('function holo(') && !html.includes('function themeLounge(') && !html.includes('holo(0,'));
  const build = table('BUILD');
  assert.strictEqual([...build.matchAll(/\b\w+:\(\)=>spaceScene\(\{gtex:/g)].length, 6);
  assert.strictEqual([...build.matchAll(/\btree:\[/g)].length, 6, 'cada bioma com uma só paleta de árvores (sem campo repetido)');
  assert.ok(slice('function spaceScene(', 'const BUILD=').includes('uniqDo(()=>forestCenter(o));'));
});

test('são 6 mundos; todos (com fogueira) estão no cliente, no validador e no servidor', () => {
  assert.strictEqual(validate.STY.size, 6);
  assert.deepStrictEqual([...validate.STY].sort(), [...ALL].sort());
  const st = table('ST'); assert.strictEqual([...st.matchAll(/\b(\w+):\{n:'/g)].length, 6);
  assert.deepStrictEqual([...st.matchAll(/\b(\w+):\{n:'/g)].map(m => m[1]), FIRE, 'ordem da seleção de cenário');
  for (const t of ['THEME', 'LDIR', 'FOGD', 'SKY', 'DESC', 'RIMT', 'PFX'])
    for (const k of ALL) assert.ok(new RegExp('\\b' + k + ':').test(table(t)), t + ' ' + k);
  const build = table('BUILD');
  for (const k of FIRE) assert.ok(new RegExp('\\b' + k + ':\\(\\)=>spaceScene\\(\\{gtex:').test(build), 'BUILD ' + k);
  const statusPage = read('status.html');
  for (const k of ADDED) assert.ok(new RegExp('\\b' + k + ":'[^']+'").test(statusPage), 'status ' + k);
  for (const k of ADDED) assert.strictEqual(validate.normalizeMessage({ t: 'create', style: k }).style, k);
  assert.strictEqual(validate.normalizeMessage({ t: 'create', style: 'xpto' }), null);
});

test('cada cenário novo usa só tipos de árvore, texturas e clareiras implementados', () => {
  const build = table('BUILD'), seeds = new Set();
  const treeKinds = new Set(['round', 'pine', 'spire', 'twisted', 'cactus', 'mushroom']);
  for (const k of ['twisted', 'cactus', 'mushroom']) assert.ok(html.includes(`k==='${k}'`), 'árvore ' + k);
  assert.ok(!html.includes("k==='crystal'"), 'árvore de cristal saiu (nenhum bioma usa)');
  const gt = table('GT');
  for (const m of build.matchAll(/kinds:\[([^\]]*)\]/g)) for (const x of m[1].split(',')) assert.ok(treeKinds.has(x.trim().replace(/'/g, '')), x);
  for (const m of build.matchAll(/gtex:'tex:(\w+):90:90'/g)) assert.ok(new RegExp('\\b' + m[1] + ':\\[|k===\'' + m[1] + '\'').test(gt + html), 'textura ' + m[1]);
  for (const m of build.matchAll(/seed:(\d+)/g)) { assert.ok(!seeds.has(m[1]), 'seed repetida'); seeds.add(m[1]); }
  // tipos de clareira desenhados em descTex: pedrisco ou folhas caídas (LEAFC)
  const known = new Set(['pebble', 'leaf']);
  for (const m of table('DESC').matchAll(/'(\w+)'\]/g)) assert.ok(known.has(m[1]), 'clareira ' + m[1]);
  assert.ok(html.includes("kind==='pebble'") && /LEAFC=\{leaf:/.test(html), 'os dois tipos têm desenho');
  for (const k of FIRE) {
    const sky = table('SKY'); assert.ok(new RegExp(k + ":\\{t:'#").test(sky), 'céu ' + k);
  }
});

test('tela inicial: botão do GitHub e texto com a quantidade de mundos', () => {
  const intro = html.slice(html.indexOf('<div class="iBtns">'), html.indexOf('<div class="iFoot">'));
  assert.ok(/<a class="iBtn gh" href="https:\/\/github\.com\/Noturno-Strange\/skyke3d" target="_blank" rel="noopener noreferrer">/.test(intro));
  assert.ok(intro.indexOf('iBtn dc') < intro.indexOf('iBtn gh'), 'GitHub depois do Discord');
  assert.ok(!/Explore 16 mundos/.test(html) && (html.match(/Explore 6 mundos\./g) || []).length === 2);
  assert.ok(/\b6 mundos/.test(readme) && !/(?:\b16|dezesseis) mundos/.test(readme));
  const pl = html.slice(html.indexOf('const PL=['), html.indexOf('\nconst rnd='));
  assert.strictEqual([...pl.matchAll(/\['#[0-9a-f]{6}','#[0-9a-f]{6}'\]/g)].length, 6, 'um planeta por mundo');
  assert.ok(html.includes('i/PL.length'));
});

test('janela Vídeos: sem os textos de ajuda removidos', () => {
  assert.ok(!html.includes('Você controla'));
  assert.ok(html.includes('<h3 class="grip">⠿ 🎬 Vídeos</h3>'));
  assert.ok(!/Música\/Vídeo[^<]*arraste aqui/.test(html));
});

test('seleção de cenário por setas: sem grade de botões, com volta ao início e teclado', () => {
  const vm = require('vm');
  assert.ok(html.includes('id="stPrev"') && html.includes('id="stNext"') && html.includes('id="stName"') && html.includes('id="stIdx"'));
  assert.ok(!html.includes('data-s=\\"${k}\\"') && !html.includes('#styles button'), 'grade de botões removida');
  assert.ok(html.includes("e.key==='ArrowLeft'||e.key==='ArrowRight'"), 'setas do teclado');
  assert.ok(html.includes('buildRoom(cfg.style);mark()}'), 'rótulo correto ao sair da sala');
  const st = table('ST');
  const ctx = vm.createContext({ cfg: { style: 'amazora' }, built: [], marked: 0, texts: {} });
  vm.runInContext(st + '\n' + slice('const SK=', 'function mark()') +
    '\nconst $=s=>({set textContent(v){texts[s]=v}});function buildRoom(k){built.push(k)}function mark(){marked++;stLabel(cfg.style)}', ctx);
  const step = d => vm.runInContext('stepStyle(' + d + ');cfg.style', ctx);
  assert.strictEqual(step(1), 'cerron');
  assert.strictEqual(step(-1), 'amazora');
  assert.strictEqual(step(-1), 'pamphora', 'de Amazora volta para o último');
  assert.strictEqual(step(1), 'amazora', 'do último volta para o primeiro');
  assert.strictEqual(ctx.texts['#stIdx'], '1 / 6');
  assert.strictEqual(ctx.texts['#stName'], 'Amazora');
  assert.deepStrictEqual(ctx.built, ['cerron', 'amazora', 'pamphora', 'amazora']);
});

test('ids antigas dos mundos continuam aceitas e viram o bioma que as substituiu', () => {
  // os 16 planetas anteriores e os nomes mais antigos deles: links, salas e perfis guardados com essas ids continuam funcionando
  const old = { proxima: 'cerron', kepler: 'caatara', gliese: 'pamphora', osiris: 'caatara', tauri: 'amazora', esmera: 'atlanthia', ambar: 'cerron', nyx: 'atlanthia',
    lumen: 'atlanthia', duna: 'caatara', mira: 'amazora', sakura: 'pamphora', nivis: 'pamphora', cinder: 'caatara', trappist: 'panthara', draugr: 'atlanthia',
    aeris: 'cerron', brontis: 'caatara', cryon: 'pamphora', pyra: 'caatara', sylvaris: 'amazora', verdara: 'atlanthia', ambara: 'cerron', nyxara: 'atlanthia',
    lumeris: 'atlanthia', dunara: 'caatara', mycelis: 'amazora', rosara: 'pamphora', nivara: 'pamphora', cindara: 'caatara', marinis: 'panthara', umbris: 'atlanthia' };
  assert.strictEqual(Object.keys(old).length, 32);
  for (const [o, n] of Object.entries(old)) {
    assert.ok(validate.STY.has(n), n);
    assert.ok(!validate.STY.has(o), 'id antiga não é mundo: ' + o);
    assert.strictEqual(validate.normalizeMessage({ t: 'create', style: o }).style, n, o);
  }
  // todo bioma recebe pelo menos um mundo antigo
  assert.deepStrictEqual([...new Set(Object.values(old))].sort(), [...ALL].sort());
  assert.strictEqual(validate.normalizeMessage({ t: 'create', style: 'constructor' }), null);
  assert.strictEqual(validate.normalizeMessage({ t: 'create', style: '__proto__' }), null);
  // o mundo favorito do perfil público também converte a id antiga
  const { cleanFields } = require('../lib/pubprofile.js');
  assert.strictEqual(cleanFields({ world: 'trappist' }).world, 'panthara');
  assert.strictEqual(cleanFields({ world: 'nyxara' }).world, 'atlanthia');
});

test('cenários: peças de várias malhas ficam num grupo, nada fica dentro das montanhas e as peças únicas são protegidas na limpeza', () => {
  const src = slice('function forestBush(', 'function forestPatch(');
  assert.ok(src.includes('const g=piece(x,z);g.userData.ol=1;'), 'arbusto em grupo');
  assert.ok(src.includes('function forestFern(x,z,s,i,o){\n const g=piece(x,z);') && src.includes('function forestShroom(x,z,s,o){\n const g=piece(x,z);'), 'samambaia e cogumelo em grupo');
  assert.ok(html.includes('const farTree=(x,z,q,n)=>{') && html.includes('g=piece(x,z);g.userData.ol=1;') && html.includes('new THREE.CylinderGeometry(.12*q,.16*q,1.3*q,5)'), 'árvore distante: tronco e copas juntos, no tipo do mundo');
  assert.ok(html.includes('for(const A of L)if(!A.keep&&inMountain(A.x,A.z,A.r*.5))kill(A.o);'), 'o que estiver dentro da encosta de uma montanha sai');
  assert.ok(html.includes('keep:!!o.userData.uniq'), 'só as peças únicas são protegidas');
  for (const u of ['uniqDo(()=>garden(x,z,Math.atan2(WALK.x-x,WALK.z-z),o))', 'uniqDo(()=>wind?windPair(x,z,o):decorSolar(x,z,s,o))', 'uniqDo(()=>lunarHouse(k))']) assert.ok(html.includes(u), u);
  // sem estufa: a horta ao ar livre aproveita o canteiro, a árvore, as lajotas e as luzinhas; fica ao lado da casa, nunca do lado oposto
  assert.ok(!/function greenhouse\(|SphereGeometry\(R,24,12,0,PI\*2,0,PI\/2\),GL/.test(html), 'estufa removida');
  const G = html.match(/const GARDEN=\{x:([\d.-]+),z:([\d.-]+),r:([\d.]+)\};/);
  assert.ok(G, 'posição da horta');
  const [gx, gz, gr] = G.slice(1).map(Number), bus = { x: 0, z: -15.3 }, walk = { x: 0, z: 1.2 };
  assert.ok(gz < walk.z, 'na mesma metade do cenário que a casa (a casa fica ao norte)');
  const toHouse = Math.atan2(bus.x - walk.x, bus.z - walk.z), toGarden = Math.atan2(gx - walk.x, gz - walk.z), diff = Math.abs(Math.atan2(Math.sin(toGarden - toHouse), Math.cos(toGarden - toHouse)));
  assert.ok(diff < Math.PI / 3, 'ao lado da casa vista da fogueira, nunca do lado oposto: ' + (diff * 180 / Math.PI).toFixed(0) + '°');
  assert.ok(Math.hypot(gx - bus.x, gz - bus.z) > 3.6 + gr, 'sem encostar na casa (domo de 3,3 m de raio, 3,6 m com a base)');
  assert.ok(Math.hypot(gx - walk.x, gz - walk.z) - gr > 11.2 - 0.5, 'fora da clareira da fogueira');
});

test('satélites e aerogeradores: dois satélites com painéis do lado da casa, dois pares de aerogeradores do lado oposto, tudo parado', () => {
  const L = html.match(/\[\[-13\.6,10\.2,1\.2,1\],\[13\.6,10\.2,1\.2,1\],\[-13\.6,-7\.8,1\.2,0\],\[13\.6,-7\.8,1\.2,0\]\]/);
  assert.ok(L, 'aerogeradores no sul (z > 0, longe da casa em z = -15,3) e satélites no norte, perto dela');
  assert.ok(html.includes('COLONY_PROPS.windTurbine('), 'aerogerador reaproveita a peça da colônia');
  assert.ok(html.includes('const g=decorGroup(x,z,Math.atan2(WALK.x-x,WALK.z-z))'), 'satélite parado, virado para a fogueira');
  assert.ok(!/decorTick|decors\.push|decors=\[/.test(html), 'sem o giro que acompanhava a câmera');
});

test('sombras: horta sem mancha de contato, painéis só nos pés e manchas do chão com a claridade do chão', () => {
  assert.ok(html.includes('g.userData.noblob=1'), 'horta marcada sem mancha (tem a própria base de terra)');
  assert.ok(html.includes('g.userData.blobBase=1') && html.includes('function groundFeet('), 'painéis: mancha só nas partes rente ao chão');
  assert.ok(html.includes('o.userData.noblob') && html.includes('groundFeet(o,L)'), 'contactShadows respeita as marcas');
  assert.ok(html.includes('GAVG=avg.clone().convertLinearToSRGB()') && html.includes('cc.setHSL(_ph.h,Math.max(_ph.s,_gh.s),_gh.l*.9)'), 'mancha sem escurecer o chão');
});

test('passos: baque grave e abafado, com variação de tom', () => {
  // os tipos de chão que os 6 biomas usam (STEPK): cada um tem o seu som de passo
  const used = [...new Set([...table('STEPK').matchAll(/:'(\w+)'/g)].map(m => m[1]))].sort();
  assert.deepStrictEqual(used, ['grass', 'rock', 'sand', 'water']);
  assert.ok(!/case 'step_(snow|metal)'/.test(html), 'passos de neve e metal saíram (nenhum bioma usa)');
  for (const k of used) {
    const m = html.match(new RegExp("case 'step_" + k + "':\\{const r=\\.9\\+Math\\.random\\(\\)\\*\\.2;T\\('sine',(\\d+)\\*r"));
    assert.ok(m && +m[1] <= 120, k + ': começa com seno grave');
  }
});
