'use strict';

// Cliente do modo Sobrevivência rodando de verdade (vm com um DOM de mentira): os botões do resultado têm que chamar as funções DO JOGO.
// Antes, o botão do resultado chamava um leave() interno do arquivo que escondia o global e o jogador seguia na sala.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../assets/catalog.js'), REC = require('../assets/recovery.js'), MAP = require('../assets/survmap.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'assets/app-surv.js'), 'utf8');

function fakeEl(tag) {
  const set = new Set();
  let texto = '';
  const e = { tag, children: [], className: '', style: {}, dataset: {}, hidden: false, value: '', disabled: false,
    classList: { add: (...a) => a.forEach(x => set.add(x)), remove: (...a) => a.forEach(x => set.delete(x)), contains: c => set.has(c), toggle(c, f) { const on = f === undefined ? !set.has(c) : !!f; on ? set.add(c) : set.delete(c); return on; } },
    append(...c) { this.children.push(...c); }, insertBefore(c) { this.children.push(c); }, remove() {}, setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {}, querySelector() { return fakeEl('q'); }, querySelectorAll() { return []; }, closest() { return null; }, click() { if (this.onclick) this.onclick({ target: this }); } };
  Object.defineProperty(e, 'textContent', { get: () => texto, set(v) { texto = v; if (v === '') e.children.length = 0; } }); // como o DOM de verdade: limpar o texto esvazia os filhos
  return e;
}
const walk = (e, f) => { f(e); (e.children || []).forEach(c => c && c.children && walk(c, f)); };

function boot() {
  const calls = { leave: 0, start: [], sent: [], say: [] }, els = new Map(), $ = sel => { if (!els.has(sel)) els.set(sel, fakeEl(sel)); return els.get(sel); };
  const box = { SKYCAT: C, SKYREC: REC, SKYMAP: MAP, console, setInterval, clearInterval, setTimeout, clearTimeout, TextEncoder, Math, JSON, Object, Array, Set, Map, Promise, Number, String, Date,
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, performance: { now: () => 0 }, MutationObserver: class { observe() {} }, $,
    document: { body: fakeEl('body'), createElement: t => fakeEl(t), querySelectorAll: () => [], getElementById: () => fakeEl('x'), addEventListener() {}, hidden: false }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { origin: 'http://x' }, crypto: { getRandomValues: a => a }, fetch: async () => ({ ok: true }), navigator: {},
    THREE: { Sprite: class { constructor() { this.scale = { set() {} }; this.position = { set() {}, y: 0 }; this.material = { dispose() {} }; } }, Mesh: class { constructor(g, m) { this.geometry = { dispose() {} }; this.material = { dispose() {} }; this.rotation = {}; this.position = { set() {} }; this.scale = { set() {} }; } }, RingGeometry: class {}, MeshBasicMaterial: class {}, DoubleSide: 2 }, EDS: [], scene: { add() {}, remove() {} }, spr: () => ({ dispose() {} }),
    me: { id: 'p1', name: 'Ana', g: { position: { x: 0, z: 0 } } }, actors: new Map(), hostId: 'p1', cfg: {}, mode: 'play', WALK: { r: 10.2 }, SVSEED: 0, svFaint: false, svFire: 1,
    send: m => calls.sent.push(m), say: (n, t) => calls.say.push(t), sfx() {}, showEmo() {}, glossOn: () => false, cleanName: s => s, tog() {}, buildRoom() {}, dest: null, lastMv: '', camYaw: 0,
    recoveryCode: () => 'CODIGO', mkConfirm() {}, leave: () => { calls.leave++; }, start: m => { calls.start.push(m); } };
  box.window = box; box.globalThis = box;
  vm.createContext(box);
  vm.runInContext(src + '\n;this.__SURVC=SURVC;', box, { filename: 'app-surv.js' });
  return { box, calls, $ };
}
const pub = { t: 'svs', tm: 10, fire: 60, nt: 0, nd: 0, lv: 1, pot: null, pl: [['p1', 0, 0]], nx: [], ov: 0 };
const fim = { t: 'svend', over: true, why: 'desmaio', sec: 640, nights: 2, level: 3, meals: 4, faints: 2, seed: 99, counted: 1, rec: 1 };

test('resultado: só um botão, "Sair", que sai da sala pela função do jogo e volta à tela inicial (sem criar sala nova)', t => {
  const { box, calls } = boot(), S = box.__SURVC; t.after(() => S.leave());
  S.enter({ sv: { seed: 7, pub } });
  S.msg({ ...fim });
  const botoes = []; walk(box.document.body, e => { if (e.tag === 'button') botoes.push(e); });
  const ver = rx => botoes.filter(b => rx.test(b.textContent));
  assert.strictEqual(ver(/Sair/).length, 1); assert.strictEqual(botoes.filter(b => !/^🚪 Sair$/.test(b.textContent) && b.tag === 'button' && /Ranking|Jogar|Ficar|Fechar/i.test(b.textContent)).length, 0, 'nenhum outro botão no resultado');
  for (const rx of [/Jogar de novo/, /^Ficar$/, /^Fechar$/]) assert.strictEqual(ver(rx).length, 0, 'o resultado não tem mais ' + rx);
  ver(/Sair/)[0].click();
  assert.strictEqual(calls.leave, 1, 'chamou o leave() do JOGO (antes chamava um interno e ficava na sala)');
  assert.strictEqual(calls.start.length, 0, 'e não abre sala nova: a tela inicial deixa escolher o modo');
});

test('resultado: mostra o tempo sobrevivido e o recorde', t => {
  const { box } = boot(), S = box.__SURVC; t.after(() => S.leave()); S.enter({ sv: { seed: 7, pub } }); S.msg({ ...fim });
  const textos = []; walk(box.document.body, e => { if (e.textContent) textos.push(e.textContent); });
  const todo = textos.join(' | ');
  assert.match(todo, /10:40/); assert.match(todo, /Novo recorde/); assert.match(todo, /Nível/);
});

test('o arquivo não define uma função leave própria (esconderia a global do jogo)', () => {
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/function leave\s*\(/.test(codigo), 'use teardown');
  assert.ok(!/(?<![.\w])leave\(/.test(codigo), 'sair da sala é sempre window.leave()');
});

test('ninguém de pé: o jogo sai sozinho da sala depois da contagem; "Sair" antes do tempo sai uma vez só', async t => {
  const todos = []; t.after(() => todos.forEach(x => x.leave()));
  let { box, calls } = boot(), S = box.__SURVC; todos.push(S);
  S.enter({ sv: { seed: 7, pub } }); S.msg({ ...fim, auto: 1 });
  assert.strictEqual(calls.leave, 0);
  await new Promise(r => setTimeout(r, 1400));
  assert.strictEqual(calls.leave, 1, 'saiu sozinho'); assert.strictEqual(calls.start.length, 0, 'e não abre sala nova sozinho');
  ({ box, calls } = boot()); S = box.__SURVC; todos.push(S);
  S.enter({ sv: { seed: 7, pub } }); S.msg({ ...fim, auto: 1 });
  const r = []; walk(box.document.body, e => { if (e.tag === 'button' && /Sair/.test(e.textContent)) r.push(e); }); r[0].click();
  await new Promise(r => setTimeout(r, 1400));
  assert.strictEqual(calls.leave, 1, 'a contagem parou: saiu uma vez só');
});

test('verificação de presença: chip com botões de resposta, sem pausar o jogo; responder envia a escolha; resultado some o chip', t => {
  const { box, calls } = boot(), S = box.__SURVC; t.after(() => S.leave());
  S.enter({ sv: { seed: 7, pub } });
  S.msg({ t: 'svc', id: 5, kind: 'maior', q: 'Qual número é o maior?', opts: ['12', '47', '31'], sec: 45 });
  const botoes = []; walk(box.document.body, e => { if (e.tag === 'button') botoes.push(e); });
  const op = botoes.filter(b => ['12', '47', '31'].includes(b.textContent));
  assert.strictEqual(op.length, 3, 'um botão por opção (nada de digitar: o teclado é o WASD)');
  op.find(b => b.textContent === '47').click();
  assert.ok(calls.sent.some(m => m.t === 'sv' && m.a === 'chk' && m.id === 5 && m.v === '47'), 'enviou a escolha');
  S.msg({ t: 'svcr', ok: 1, done: 1 });
  assert.ok(calls.say.some(x => /Verificado/.test(x)));
  S.msg({ t: 'svcr', ok: 0, done: 1, why: 'tempo' });
  assert.ok(calls.say.some(x => /fora do ranking/.test(x)), 'avisa o efeito (só nas estatísticas)');
  S.msg({ t: 'svc', id: 6, kind: 'soma', q: '3 + 4 = ?' });
});

test('coleta: perto do ponto aparece o botão; perto de um ponto vazio aparece "volta em N s" desabilitado, com a contagem do servidor', t => {
  const n0 = MAP.generate(7).nodes[0], find = (box, re) => { const r = []; walk(box.document.body, e => { if (e.tag === 'button' && re.test(e.textContent)) r.push(e); }); return r; };
  let { box } = boot(), S = box.__SURVC; t.after(() => S.leave());
  box.me.g.position.x = n0.x; box.me.g.position.z = n0.z;
  S.enter({ sv: { seed: 7, pub } });
  assert.ok(find(box, /Coletar|Pegar/).length >= 1, 'ponto disponível: botão de coletar');
  ({ box } = boot()); const S2 = box.__SURVC; t.after(() => S2.leave());
  box.me.g.position.x = n0.x; box.me.g.position.z = n0.z;
  S2.enter({ sv: { seed: 7, pub: { ...pub, nx: [0], nt: [30] } } });
  const vazio = find(box, /volta em/);
  assert.strictEqual(vazio.length, 1, 'ponto vazio: aviso com contagem'); assert.strictEqual(vazio[0].disabled, true); assert.match(vazio[0].textContent, /volta em (29|30) s/);
  assert.strictEqual(find(box, /Coletar|Pegar/).length, 0, 'e nada para coletar');
});

test('coleta: anel dourado e ⏳ são um só objeto cada (sem pesar) e saem da cena ao sair do modo', () => {
  assert.match(src, /new THREE\.RingGeometry\(/); assert.match(src, /ghost=new THREE\.Sprite\(spr\('⏳'\)\)/);
  assert.match(src, /marks_clear\(\)\{[^\n]*scene\.remove\(ring\)[^\n]*scene\.remove\(ghost\)/, 'limpa o anel e o fantasma');
  assert.strictEqual((src.match(/new THREE\.RingGeometry\(/g) || []).length, 1, 'um anel só, não um por ponto');
});

test('mochila e cozinha: comer, dar a outro jogador e cozinhar mandam a ação certa ao servidor', t => {
  const { box, calls, $ } = boot(), S = box.__SURVC; t.after(() => S.leave());
  box.actors.set('p9', { id: 'p9', name: 'Beto', g: { position: { x: 1, z: 1 } } });
  S.enter({ sv: { seed: 7, pub } });
  S.msg({ t: 'svm', m: { calor: 90, fome: 40, sede: 90 }, inv: { fruta: 2, raiz: 1 }, f: 0, k: 0, rv: '' });
  const botoes = () => { const r = []; walk(box.document.body, e => { if (e.tag === 'button') r.push(e); }); return r; };
  $('#bMochila').onclick();
  botoes().find(b => /Comer/.test(b.textContent)).click();
  assert.ok(calls.sent.some(m => m.a === 'eat' && m.res === 'fruta'), 'comer a maçã');
  walk(box.document.body, e => { if (e.tag === 'select') e.value = 'p9'; }); // o DOM de mentira não copia a opção marcada para value
  botoes().find(b => b.textContent === 'Dar 1').click();
  assert.ok(calls.sent.some(m => m.a === 'give' && m.to === 'p9' && m.res === 'fruta' && m.n === 1), 'dar 1 ao Beto');
  botoes().find(b => b.textContent === 'Dar tudo').click();
  assert.ok(calls.sent.some(m => m.a === 'give' && m.n === 2), 'dar tudo');
  S.msg({ t: 'svm', m: { calor: 90, fome: 40, sede: 90 }, inv: { raiz: 1 }, f: 0, k: 0, rv: '' }); // o servidor confirma: só sobrou a raiz
  botoes().find(b => /Cozinhar/.test(b.textContent) && /^🍲/.test(b.textContent)).click(); // botão da fogueira abre a cozinha
  const receita = botoes().find(b => b.textContent === 'Cozinhar' && !b.disabled);
  assert.ok(receita, 'há uma receita possível (raiz assada)'); receita.click();
  assert.ok(calls.sent.some(m => m.a === 'cook' && m.rid === 'raiz_assada'), 'cozinhar a raiz');
});

test('navegador: o vigia de sair não reclama de quem já entrou em outra sala', () => {
  const net = fs.readFileSync(path.join(__dirname, '..', 'assets/app-net.js'), 'utf8');
  assert.match(net, /const j0=joinN;setTimeout\(\(\)=>\{if\(mode!=='menu'&&!recon&&joinN===j0\)reportBug\('leave'/);
  assert.match(net, /me\.id=m\.id;joinN\+\+;/, 'cada entrada em sala conta');
});
