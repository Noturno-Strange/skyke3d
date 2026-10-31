'use strict';

// Cliente do modo Sobrevivência rodando de verdade (vm com um DOM de mentira): os botões do resultado têm que chamar as funções DO JOGO.
// Antes, "Jogar de novo" chamava um leave() interno do arquivo que escondia o global e o jogador seguia na sala.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../assets/catalog.js'), REC = require('../assets/recovery.js'), MAP = require('../assets/survmap.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'assets/app-surv.js'), 'utf8');

function fakeEl(tag) {
  const set = new Set();
  const e = { tag, children: [], className: '', textContent: '', style: {}, dataset: {}, hidden: false, value: '', disabled: false,
    classList: { add: (...a) => a.forEach(x => set.add(x)), remove: (...a) => a.forEach(x => set.delete(x)), contains: c => set.has(c), toggle(c, f) { const on = f === undefined ? !set.has(c) : !!f; on ? set.add(c) : set.delete(c); return on; } },
    append(...c) { this.children.push(...c); }, insertBefore(c) { this.children.push(c); }, remove() {}, setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {}, querySelector() { return fakeEl('q'); }, querySelectorAll() { return []; }, closest() { return null; }, click() { if (this.onclick) this.onclick({ target: this }); } };
  return e;
}
const walk = (e, f) => { f(e); (e.children || []).forEach(c => c && c.children && walk(c, f)); };

function boot() {
  const calls = { leave: 0, start: [], sent: [], say: [] }, els = new Map(), $ = sel => { if (!els.has(sel)) els.set(sel, fakeEl(sel)); return els.get(sel); };
  const box = { SKYCAT: C, SKYREC: REC, SKYMAP: MAP, console, setInterval, clearInterval, setTimeout, clearTimeout, TextEncoder, Math, JSON, Object, Array, Set, Map, Promise, Number, String, Date,
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, performance: { now: () => 0 }, MutationObserver: class { observe() {} }, $,
    document: { body: fakeEl('body'), createElement: t => fakeEl(t), querySelectorAll: () => [], getElementById: () => fakeEl('x'), addEventListener() {}, hidden: false }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { origin: 'http://x' }, crypto: { getRandomValues: a => a }, fetch: async () => ({ ok: true }), navigator: {},
    THREE: { Sprite: class { constructor() { this.scale = { set() {} }; this.position = { set() {}, y: 0 }; } } }, scene: { add() {}, remove() {} }, spr: () => ({ dispose() {} }),
    me: { id: 'p1', name: 'Ana', g: { position: { x: 0, z: 0 } } }, actors: new Map(), hostId: 'p1', cfg: {}, mode: 'play', WALK: { r: 10.2 }, SVSEED: 0, svFaint: false, svFire: 1,
    send: m => calls.sent.push(m), say: (n, t) => calls.say.push(t), sfx() {}, showEmo() {}, glossOn: () => false, cleanName: s => s, tog() {}, buildRoom() {}, dest: null, lastMv: '', camYaw: 0,
    leave: () => { calls.leave++; }, start: m => { calls.start.push(m); } };
  box.window = box; box.globalThis = box;
  vm.createContext(box);
  vm.runInContext(src + '\n;this.__SURVC=SURVC;', box, { filename: 'app-surv.js' });
  return { box, calls, $ };
}
const pub = { t: 'svs', tm: 10, fire: 60, nt: 0, nd: 0, lv: 1, pot: null, pl: [['p1', 0, 0]], nx: [], ov: 0 };
const fim = { t: 'svend', over: true, why: 'desmaio', sec: 640, nights: 2, level: 3, meals: 4, faints: 2, seed: 99, counted: 1, rec: 1 };

test('resultado: "Jogar de novo" sai da sala pela função do jogo e cria uma sala de Sobrevivência nova', t => {
  const { box, calls } = boot(), S = box.__SURVC; t.after(() => S.leave());
  S.enter({ sv: { seed: 7, pub } });
  S.msg({ ...fim });
  const botoes = []; walk(box.document.body, e => { if (e.tag === 'button') botoes.push(e); });
  const again = botoes.find(b => /Jogar de novo/.test(b.textContent)), sair = botoes.find(b => /Sair/.test(b.textContent));
  assert.ok(again && sair, 'os botões do resultado existem');
  again.click();
  assert.strictEqual(calls.leave, 1, 'chamou o leave() do JOGO (antes chamava um interno e ficava na sala)');
  assert.strictEqual(JSON.stringify(calls.start), JSON.stringify([{ t: 'create', surv: true }]), 'abriu uma sala de Sobrevivência nova');
  sair.click();
  assert.strictEqual(calls.leave, 2, 'Sair também sai de verdade');
  assert.strictEqual(calls.start.length, 1, 'Sair não cria sala');
});

test('resultado: mostra o tempo sobrevivido e o recorde', t => {
  const { box } = boot(), S = box.__SURVC; t.after(() => S.leave()); S.enter({ sv: { seed: 7, pub } }); S.msg({ ...fim });
  const textos = []; walk(box.document.body, e => { if (e.textContent) textos.push(e.textContent); });
  const todo = textos.join(' | ');
  assert.match(todo, /10:40/); assert.match(todo, /Novo recorde de tempo/); assert.match(todo, /Nível alcançado/);
});

test('o arquivo não define uma função leave própria (esconderia a global do jogo)', () => {
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/function leave\s*\(/.test(codigo), 'use teardown');
  assert.ok(!/(?<![.\w])leave\(/.test(codigo), 'sair da sala é sempre window.leave()');
});

test('ninguém de pé: o jogo sai sozinho da sala depois da contagem; "Ficar aqui" cancela; Jogar de novo não sai duas vezes', async t => {
  const find = (box, re) => { const r = []; walk(box.document.body, e => { if (e.tag === 'button' && re.test(e.textContent)) r.push(e); }); return r[0]; };
  // volta sozinho
  const todos = []; t.after(() => todos.forEach(x => x.leave()));
  let { box, calls } = boot(), S = box.__SURVC; todos.push(S);
  S.enter({ sv: { seed: 7, pub } }); S.msg({ ...fim, auto: 1 });
  assert.strictEqual(calls.leave, 0);
  await new Promise(r => setTimeout(r, 1400));
  assert.strictEqual(calls.leave, 1, 'saiu sozinho'); assert.strictEqual(calls.start.length, 0, 'e não abre sala nova sozinho');
  // ficar
  ({ box, calls } = boot()); S = box.__SURVC; todos.push(S);
  S.enter({ sv: { seed: 7, pub } }); S.msg({ ...fim, auto: 1 }); find(box, /Ficar aqui/).click();
  await new Promise(r => setTimeout(r, 1400));
  assert.strictEqual(calls.leave, 0, 'ficou: não sai sozinho');
  // jogar de novo antes do tempo
  ({ box, calls } = boot()); S = box.__SURVC; todos.push(S);
  S.enter({ sv: { seed: 7, pub } }); S.msg({ ...fim, auto: 1 }); find(box, /Jogar de novo/).click();
  await new Promise(r => setTimeout(r, 1400));
  assert.strictEqual(calls.leave, 1, 'a contagem parou: saiu uma vez só');
});
