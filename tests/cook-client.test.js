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
  assert.match(net, /case 'cook':case 'cookr':case 'cookfx':if\(window\.cookMsg\)window\.cookMsg\(m\)/);
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
  assert.match(social, /vlist\(host,\{bind:frBind,fit:true\}\)/, 'amigos usam a lista virtual, que encolhe até o conteúdo');
  assert.ok(!/classList\.toggle\('hide',!many\)/.test(social), 'a busca de amigos não some mais');
  assert.match(html, /<div class="cksearch frs"><input id="frq" type="search"[^>]*><\/div>/, 'busca fixa fora da área que rola, na largura toda');
  assert.match(html, /<h3 class="grip"><span class="frt">⠿ 👥 Amigos<\/span><span id="frCount" class="frcnt" role="status" aria-live="polite"><\/span><\/h3>/, 'contador no título da janela');
  assert.match(css, /\.gmin\{min-width:36px;min-height:32px\}/, 'botão de minimizar confortável');
  assert.match(css, /\.p button:not\(\.slot\):not\(\.cks\):not\(\.mgh\)\{min-width:32px;min-height:32px\}/, 'alvo mínimo de 32 px nos painéis');
  assert.match(css, /@media \(max-width:480px\)\{\.side,#chat,#pNotif,#pFr,#pVid,#pDJ\{box-sizing:border-box;max-width:calc\(100vw - 16px\)\}/, 'painéis cabem na largura do celular');
});

test('regras 12.3: a lista virtual acompanha o ajuste Texto (--tx) e se refaz quando ele muda', () => {
  const { El } = fakeDom();
  const listeners = {};
  let tx = '1.5';
  const ctx = vm.createContext({
    document: { createElement: t => new El(t), documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: k => (k === '--tx' ? tx : '') }),
    addEventListener: (t, f) => ((listeners[t] ||= []).push(f)),
    requestAnimationFrame: () => 1,
    console
  });
  vm.runInContext(read('assets/vlist.js') + '\nthis.vlist = vlist;', ctx);
  const host = new El('div');
  const L = ctx.vlist(host, { bind: () => {}, fit: true });
  L.set(Array.from({ length: 10 }, () => ({ h: 40 })));
  const inner = host.children[0];
  assert.strictEqual(inner.style.height, '600px', 'linhas 1,5× mais altas com texto 1,5×');
  assert.strictEqual(host.style.height, '600px', 'fit: a lista encolhe até o conteúdo');
  assert.strictEqual(inner.children[0].style.height, '60px');
  tx = '1';
  listeners['skyke:tx'].forEach(f => f());
  assert.strictEqual(inner.style.height, '400px', 'o evento skyke:tx refaz as alturas');
  assert.match(ui, /R\.style\.setProperty\('--tx',e\.target\.value\);dispatchEvent\(new Event\('skyke:tx'\)\)/, 'o ajuste Texto avisa as listas');
});

test('amigos: janela flutuante e arrastável como as outras, linhas enxutas e ações com texto embaixo da lista', () => {
  assert.match(html, /<div id="pFr"[^>]*><h3 class="grip"><span class="frt">⠿ 👥 Amigos<\/span>/, 'alça de arrastar no título');
  assert.match(social, /function ava\(name,dot,big\)/, 'avatar com inicial e status');
  assert.match(social, /s\.className='frsel'/, 'botão do nome com classe própria (a .frn é do nome de amigo no chat global)');
  assert.ok(!/id="pFr"[^>]*>[^<]*<div class="grip" style="cursor:default"/.test(html), 'sem a alça falsa');
  for (const re of [/function clampPanels\(\)[^\n]*'pFr'/, /\['chat','pMochila','pCook','pFr'[^\]]*\]\.forEach\(dragify\)/, /\['pMochila','pCook','pFr'[^\]]*\]\.forEach\(id=>\{const p=\$\('#'\+id\),g=p\.querySelector\('\.grip'\)/])
    assert.match(ui, re);
  assert.match(html, /id="frDet" class="ckdet frdet" aria-live="polite" hidden/, 'caixa de ações da pessoa selecionada');
  assert.match(social, /function row\(key,name,dot,tag,\.\.\.bs\)/, 'linha: status, nome, situação e no máximo uma ação');
  assert.match(social, /btn\('✖ Remover'/, 'remover com texto e confirmação');
  assert.match(css, /#pFr\{[^}]*width:min\(21em,calc\(100% - 24px\)\);max-height:calc\(100% - 190px\)/, 'tamanho relativo à fonte e à área da interface');
});

test('culinária: receitas grandes (duas linhas, ícones dos ingredientes) e a lista fica com o espaço que sobra', () => {
  assert.match(cook, /'r:',58\)/, 'linha de receita mais alta');
  assert.match(cook, /c\.g\.map\(g=>INGR\[g\]\.ic\)\.join\(' '\)\)\}/, 'ícones dos ingredientes embaixo do nome');
  assert.match(html, /<details id="ckProg" class="ckhead">/, 'atributos e emblemas recolhíveis');
  assert.match(cook, /pg\.addEventListener\('toggle',\(\)=>LS\(PK,pg\.open\?'1':null\)\)/, 'a escolha fica salva');
  assert.match(css, /\.cook \.ckl0\{flex:1 1 0;min-height:12em\}/, 'lista flexível com mínimo de ~5 linhas');
  assert.match(css, /@container \(min-width:600px\)\{#ckP1:not\(\[hidden\]\)/, 'janela larga: lista e detalhes lado a lado');
  assert.ok(!/\.ckl0\{height:/.test(css), 'sem altura fixa em px');
});

test('vídeo e karaokê: alça de redimensionar no canto inferior da janela (mouse, toque e teclado), sem o canto nativo na caixa do vídeo', () => {
  const net = read('assets/app-net.js');
  assert.ok(!/\.vwrap\{[^}]*resize:both/.test(css), 'a caixa do vídeo não tem mais o canto nativo (ficava no meio da janela e não aceitava toque)');
  assert.match(net, /\[\['pVid','#vbox'\],\['pKar','#kbox'\]\]\.forEach/, 'nas duas janelas de vídeo');
  assert.match(net, /g\.className='vgrip'/);
  assert.match(net, /g\.onpointerdown=/, 'arrastar com mouse ou toque');
  assert.match(net, /g\.onkeydown=e=>\{const d=\{ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1\}/, 'setas do teclado');
  assert.match(net, /function vSize\(bx,w\)\{const z=typeof UZ==='function'\?UZ\(\):1;/, 'limite respeita o ajuste Interface');
  assert.match(css, /\.p \.vgrip\{position:absolute;right:3px;bottom:3px;[^}]*cursor:nwse-resize;touch-action:none/, 'no canto inferior direito da janela');
  assert.match(css, /#vwatch\.hide~\.vgrip,#kwatch\.hide~\.vgrip\{display:none\}/, 'só aparece com vídeo na tela');
});
