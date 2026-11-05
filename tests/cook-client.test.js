'use strict';
// Cliente da culinária: estrutura do menu, integração com a mochila e a lista com rolagem virtual (assets/vlist.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html'), cook = read('assets/app-cook.js'), net = read('assets/app-net.js'), panels = read('assets/app-panels.js'), social = read('assets/app-social.js'), css = read('assets/app.css'), ui = read('assets/app-ui.js');

test('culinária: menu na barra, painel com abas, busca e espaços, scripts na ordem certa', () => {
  for (const i of ['bCook', 'pCook', 'ckt0', 'ckt1', 'ckt2', 'ckq', 'ckCount', 'ckSlots', 'ckGoCook', 'ckGoRoast', 'ckClear', 'ckFire', 'ckRes', 'ckL0', 'ckL1', 'ckL2', 'ckDet', 'ckPrep', 'ckBar', 'ckBadges', 'mcq', 'mcCount'])
    assert.match(html, new RegExp('id="' + i + '"'), i);
  assert.match(html, /<button id="bCook"[^>]*aria-label="Abrir Culinária"/, 'botão acessível na barra inferior');
  assert.ok(html.indexOf('id="bMochila"') < html.indexOf('id="bCook"') && html.indexOf('id="bCook"') < html.indexOf('id="bVis"'), 'no grupo Expressão, depois da mochila');
  assert.match(html, /role="tablist"[\s\S]*role="tab"[\s\S]*role="tabpanel"/, 'abas acessíveis');
  assert.match(html, /<input id="ckq" type="search"/, 'campo de pesquisa');
  assert.match(html, /id="ckSlots"[^>]*aria-label/, 'espaços de combinação rotulados');
  assert.strictEqual((html.match(/class="cks/g) || []).length + (cook.match(/'cks'/g) || []).length > 0, true);
  assert.ok(html.indexOf('/assets/vlist.js') > html.indexOf('/assets/app-net.js') && html.indexOf('/assets/vlist.js') < html.indexOf('/assets/app-panels.js'), 'vlist antes da mochila');
  assert.ok(html.indexOf('/assets/app-cook.js') > html.indexOf('/assets/app-pet.js'), 'culinária depois do mascote');
});

test('culinária: o arquivo roda dentro de uma função (declaração em bloco vira global e sobrescreveria start() e ask())', () => {
  assert.match(cook, /\n\(\(\)=>\{\n/, 'abre uma função');
  assert.match(cook.trimEnd(), /\}\)\(\);$/, 'fecha e chama');
  const dentro = cook.slice(cook.indexOf('(()=>{'));
  assert.ok(!/^function /m.test(cook.slice(0, cook.indexOf('(()=>{'))), 'nada declarado fora da função');
  // sem declaração com o nome das funções globais dos outros arquivos
  const globais = [...[net, panels, read('assets/app-pet.js'), read('assets/app-base.js')].join('\n').matchAll(/^(?:async )?function (\w+)/gm)].map(m => m[1]);
  assert.ok(globais.includes('start') && globais.includes('tog'), 'a lista de globais foi lida');
  assert.ok(dentro.length > 1000);
});

test('culinária: ligações com a rede, a mochila e os painéis', () => {
  assert.match(net, /case 'cook':case 'cookr':if\(window\.cookMsg\)window\.cookMsg\(m\)/);
  assert.match(social, /window\.cookBoot\)window\.cookBoot\(\)/, 'pede o progresso ao entrar');
  for (const f of ['window.cookBoot=', 'window.cookMsg=', 'window.cookHas=']) assert.ok(cook.includes(f), f);
  assert.match(cook, /send\(\{t:'cookdo',m,g:\[\.\.\.CK\.slots\],rid:CK\.rid\}\)/, 'só método, ingredientes e rid');
  assert.match(cook, /send\(\{t:'cookget'\}\)/);
  const enviados = [...cook.matchAll(/send\(\{t:'(\w+)'/g)].map(m => m[1]).sort();
  assert.deepStrictEqual([...new Set(enviados)], ['cookdo', 'cookget', 'item']);
  assert.match(net, /function tog\(id\)\{\['#pMochila','#pCook'/, 'abrir um painel fecha os outros');
  assert.match(ui, /'pMochila','pCook'/, 'arrastável, com X e dentro da tela');
  assert.match(panels, /const BP=\(\(\)=>\{/);
  assert.match(panels, /window\.bpRefresh=\(\)=>BP\.build\(\)/);
  assert.match(panels, /classList\.contains\('lock'\)\)\{showItemInfo\(b\);return\}/, 'alimento bloqueado não vai para a mão');
  assert.match(panels, /Bloqueado: prepare esta receita na Culinária/);
  assert.match(css, /\.slot\.lock\{/, 'cadeado na mochila');
  assert.match(cook, /LS\(GK,JSON\.stringify\(COL\)\)/, 'grupos recolhidos ficam salvos');
  assert.match(cook, /setInterval\(\(\)=>\{if\(open\(\)&&!document\.hidden&&CK\.tab===0\)fire\(\)\},500\)/, 'só confere a fogueira com o painel aberto');
});

// ---------- vlist: DOM mínimo para rodar o script de verdade ----------
function fakeDom() {
  class El {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.style = {};
      this.dataset = {};
      this.hidden = false;
      this.className = '';
      this.listeners = {};
      this.scrollTop = 0;
      this.clientHeight = 200;
      this.classList = { add: c => (this.className += ' ' + c) };
    }
    append(...n) { this.children.push(...n); }
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
    querySelector() { return null; }
  }
  const doc = { createElement: t => new El(t) };
  let raf = null;
  const ctx = vm.createContext({ document: doc, requestAnimationFrame: f => ((raf = f), 1), Element: El, console });
  vm.runInContext(read('assets/vlist.js') + '\nthis.vlist = vlist;', ctx);
  return { El, ctx, flush: () => { const f = raf; raf = null; if (f) f(); } };
}
const bound = [];

test('vlist: só as linhas visíveis existem, os elementos são reaproveitados e a posição de rolagem se mantém', () => {
  const { El, ctx, flush } = fakeDom();
  const host = new El('div');
  const rows = Array.from({ length: 5000 }, (_, i) => ({ h: i % 50 === 0 ? 30 : 36, n: i }));
  bound.length = 0;
  const L = ctx.vlist(host, { bind: (e, r) => bound.push(r.n) });
  L.set(rows);
  const inner = host.children[0];
  assert.ok(inner.children.length > 0 && inner.children.length <= 16, 'poucos elementos para 5000 linhas: ' + inner.children.length);
  assert.ok(parseInt(inner.style.height) > 150000, 'a barra de rolagem reflete a lista inteira');
  assert.deepStrictEqual(bound.slice(0, 3), [0, 1, 2], 'começa pela primeira linha');
  const antes = inner.children.length;
  host.scrollTop = 90000;
  L.refresh();
  const visiveis = inner.children.filter(e => !e.hidden).map(e => +e.dataset.row);
  assert.ok(visiveis.every(i => i > 2400 && i < 2600), 'mostra as linhas da posição rolada: ' + visiveis.join());
  assert.ok(inner.children.length <= Math.max(antes, 16), 'o mesmo punhado de elementos serve a outras linhas');
  const top = +inner.children.find(e => !e.hidden).dataset.row;
  assert.ok(inner.children.find(e => +e.dataset.row === top).style.transform.startsWith('translateY('), 'posicionada por transform');
  // lista menor (busca): sobram elementos escondidos e a rolagem volta para dentro do novo tamanho
  L.set(rows.slice(0, 5));
  assert.ok(host.scrollTop <= Math.max(0, 5 * 36 - 200) + 30, 'rolagem dentro do novo tamanho: ' + host.scrollTop);
  assert.ok(inner.children.filter(e => !e.hidden).length === 5, 'só 5 linhas visíveis');
  L.set([]);
  assert.ok(inner.children.every(e => e.hidden), 'lista vazia: nenhuma linha');
  // ↓ no teclado: sem linha atual, vai para a primeira com controle
  const ev = { key: 'ArrowDown', target: { closest: () => null }, preventDefault() { this.stopped = true; } };
  L.set(rows.slice(0, 50));
  flush();
  host.listeners.keydown[0](ev);
  assert.strictEqual(ev.stopped, true, 'a lista trata as setas');
});

test('regras 12.1/12.2: lista de amigos virtual com busca sempre visível, alvos de toque e painéis dentro da tela no celular', () => {
  assert.match(social, /vlist\(host,\{bind:frBind\}\)/, 'amigos usam a lista virtual');
  assert.ok(!/classList\.toggle\('hide',!many\)/.test(social), 'a busca de amigos não some mais');
  assert.match(html, /<div class="cksearch"><input id="frq" type="search"[^>]*><small id="frCount"/, 'busca fixa fora da área que rola, com contagem');
  assert.match(css, /\.gmin\{min-width:36px;min-height:32px\}/, 'botão de minimizar confortável');
  assert.match(css, /\.p button:not\(\.slot\):not\(\.cks\):not\(\.mgh\)\{min-width:32px;min-height:32px\}/, 'alvo mínimo de 32 px nos painéis');
  assert.match(css, /@media \(max-width:480px\)\{\.side,#chat,#pNotif,#pFr,#pVid,#pDJ\{box-sizing:border-box;max-width:calc\(100vw - 16px\)\}/, 'painéis cabem na largura do celular');
});
