'use strict';
// Cliente da fazenda: botão na barra, painel com canteiros e sementes, ligações com a rede e a página pública /fazenda.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html'), farm = read('assets/app-farm.js'), net = read('assets/app-net.js'), social = read('assets/app-social.js'), ui = read('assets/app-ui.js'), css = read('assets/app.css');
const page = read('fazenda.html'), profile = read('profile.html');

test('fazenda: botão na barra inferior ao lado da culinária e painel com abas, canteiros e sementes', () => {
  assert.match(html, /<button id="bFarm"[^>]*aria-label="Abrir Fazenda"[^>]*aria-controls="pFarm"/);
  assert.ok(html.indexOf('id="bCook"') < html.indexOf('id="bFarm"') && html.indexOf('id="bFarm"') < html.indexOf('id="bVis"'), 'depois da culinária');
  for (const i of ['pFarm', 'fmProg', 'fmLv', 'fmXp', 'fmBar', 'fmRec', 'fmBadges', 'fmt0', 'fmt1', 'fmP0', 'fmP1', 'fmGrid', 'fmSeed', 'fmPick', 'fmPlantAll', 'fmWaterAll', 'fmHarvestAll', 'fmDig', 'fmRes', 'fmOpen', 'fmCopy', 'fmq', 'fmL', 'fmDet', 'fmCount'])
    assert.match(html, new RegExp('id="' + i + '"'), i);
  assert.match(html, /id="fmBar"[^>]*role="progressbar"/);
  assert.ok(html.indexOf('/assets/app-farm.js') > html.indexOf('/assets/app-cook.js'), 'depois da culinária');
  assert.match(css, /\.fmc \.fbar i\{/, 'barra de progresso em cada canteiro');
});

test('fazenda: o arquivo roda dentro de uma função e só manda farmget e farmdo', () => {
  assert.match(farm, /\n\(\(\)=>\{\n/);
  assert.match(farm.trimEnd(), /\}\)\(\);$/);
  assert.doesNotThrow(() => new vm.Script(farm));
  const sent = [...new Set([...farm.matchAll(/\{t:'(\w+)'/g)].map(m => m[1]))].sort();
  assert.deepStrictEqual(sent, ['farmdo', 'farmget']);
  for (const f of ['window.farmBoot=', 'window.farmMsg=']) assert.ok(farm.includes(f), f);
  assert.match(farm, /lastAt\+200-Date\.now\(\)/, 'espaça as ações para o limite do servidor');
});

test('fazenda: ligações com a rede, os painéis e o perfil público', () => {
  assert.match(net, /case 'farm':case 'farmr':case 'farmfx':if\(window\.farmMsg\)window\.farmMsg\(m\)/);
  assert.match(net, /function tog\(id\)\{\['#pMochila','#pCook','#pFarm'/, 'abrir a fazenda fecha os outros painéis');
  assert.strictEqual((ui.match(/'pFarm'/g) || []).length, 4, 'arrastável, dentro da tela, com X e marcada na barra');
  assert.match(social, /window\.farmBoot\)window\.farmBoot\(\)/, 'pede a fazenda ao entrar');
  assert.match(social, /window\.pubPp=\(\)=>/, 'link de /fazenda só com perfil público');
});

test('página /fazenda: mapa 2D, barras de progresso, recordes e conquistas, sem nada além do próprio servidor', () => {
  assert.match(page, /<canvas id="map"[^>]*role="img"/);
  assert.match(page, /id="grow"/);
  assert.match(page, /role', 'progressbar'/);
  assert.match(page, /fetch\('\/farm\.json\?id=' \+ id, \{ cache: 'no-store', credentials: 'omit' \}\)/);
  assert.match(page, /<script src="\/assets\/catalog\.js"><\/script>/);
  assert.ok(!/https?:\/\//.test(page.replace(/<!--[\s\S]*?-->/g, '')), 'sem recursos de fora');
  assert.ok(!/innerHTML/.test(page), 'texto do jogador nunca vira HTML');
  assert.match(profile, /id="fm" class="box" hidden/, 'o perfil tem a seção da fazenda');
  assert.match(profile, /'\/fazenda#' \+ location\.hash\.slice\(1\)/);
});

test('fazenda: moedas no topo, aba Loja com terreno, propriedade e casa; o mapa público desenha a casa e a propriedade', () => {
  for (const i of ['fmCoins', 'fmt2', 'fmP2', 'fmShop']) assert.match(html, new RegExp('id="' + i + '"'), i);
  assert.match(farm, /\{t:'farmdo',k,b:buy,rid:FM\.rid\}/, 'compra manda só o item; o preço e o nível são do servidor');
  assert.match(farm, /\['land','🧱 Terreno',FARM_LAND/);
  assert.match(farm, /\['prop','🏡 Propriedade',FARM_PROP/);
  assert.match(farm, /\['house','🏠 Casa',FARM_HOUSE/);
  assert.match(farm, /reason==='descanso'/, 'explica o descanso do antifraude');
  assert.match(farm, /openSet=\(\)=>new Set\(farmOpen\(/, 'canteiros abertos pelo terreno comprado');
  assert.match(page, /CAT\.farmOpen\(data\.land/);
  assert.match(page, /tier\(CAT\.FARM_HOUSE, data\.house\)/, 'a casa do mapa sai do catálogo (índice conferido)');
});

test('safra e estrela: botão só no nível máximo, confirmação em dois cliques e aviso na sala', () => {
  const cook = read('assets/app-cook.js');
  assert.match(html, /id="fmRenew"[^>]*hidden/);
  assert.match(html, /id="ckRenew"[^>]*hidden/);
  assert.ok(html.indexOf('id="fmRenew"') < html.indexOf('aria-label="Seções da fazenda"'), 'fora da linha recolhível, visível');
  assert.match(farm, /rb\.hidden=!\(s&&s\.max\)/);
  assert.match(farm, /Date\.now\(\)-rnAt>5000\)\{rnAt=Date\.now\(\);b\.textContent='Clique de novo/, 'dois cliques para confirmar');
  assert.match(farm, /m\.t==='farmfx'&&m\.sf/);
  assert.match(cook, /send\(\{t:'cookrenew',rid:rnRid\}\)/);
  assert.match(cook, /m\.t==='cookfx'&&m\.st/);
  assert.match(page, /el\('span', 'stars', rank <= 5 \?/, 'a página pública mostra uma estrela amarela por safra');
});

test('página /fazenda: só redesenha o mapa quando algo muda e atualiza a lista sem refazê-la (antes refazia tudo a cada segundo)', () => {
  assert.match(page, /function drawBase\(cv\)/, 'grama, cerca, casa e terra ficam numa camada desenhada uma vez');
  assert.match(page, /if \(!force && sig === lastSig\) return;/, 'sem mudança visível, o mapa não é redesenhado');
  assert.match(page, /if \(key !== rowsKey\) \{/, 'as linhas da lista só são recriadas quando os canteiros mudam');
  assert.match(page, /if \(data && !document\.hidden\) refresh\(false\)/, 'só com a aba visível');
  assert.match(page, /@media \(min-width:900px\)/, 'tela larga: mapa e listas lado a lado');
  assert.match(page, /id="tiles"/, 'resumo no topo');
  assert.match(page, /class="legend"/, 'legenda do mapa');
  assert.match(page, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(profile, /id="gf" class="box" hidden/, 'o perfil mostra a caixa de presentes');
  assert.match(profile, /'\/#presente=' \+ location\.hash\.slice\(1\)/, 'o botão de presente abre o jogo com o destinatário escolhido');
  assert.ok(!/innerHTML/.test(profile), 'nome de quem enviou nunca vira HTML');
});

// roda o script do perfil público com um DOM mínimo e devolve a lista de presentes desenhada
async function profileGifts(gifts) {
  class El {
    constructor(tag) { this.tagName = tag; this.kids = []; this.text = ''; this.attrs = {}; this.style = {}; this.className = ''; }
    get firstChild() { return this.kids[0] || null; }
    get lastChild() { return this.kids[this.kids.length - 1] || null; }
    get textContent() { return this.text + this.kids.map(k => k.textContent).join(''); }
    set textContent(v) { this.text = String(v); this.kids = []; }
    appendChild(k) { this.kids.push(k); return k; }
    removeChild(k) { this.kids.splice(this.kids.indexOf(k), 1); return k; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k]; }
  }
  const ids = {}, byId = i => ids[i] || (ids[i] = new El('div'));
  byId('st').appendChild(new El('span'));
  const prof = { name: 'Dono', online: false, seenAt: Date.now(), likes: 0, badges: [], book: [], cfg: {}, gifts };
  const src = profile.slice(profile.lastIndexOf('<script>') + 8, profile.lastIndexOf('</script>'));
  const ctx = vm.createContext({
    window: { SKYCAT: require('../assets/catalog.js') },
    document: { getElementById: byId, createElement: t => new El(t), createTextNode: t => ({ textContent: String(t) }), addEventListener() {} },
    location: { hash: '#' + 'a'.repeat(20) },
    fetch: async () => ({ ok: true, status: 200, json: async () => prof }),
    addEventListener() {}, setTimeout() {}, clearTimeout() {}, navigator: {}, Date, JSON, Object, String, Number, Array
  });
  vm.runInContext(src, ctx);
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  return { head: byId('gft').textContent, rows: byId('gfl').kids };
}

test('perfil público: presentes em uma linha por quem enviou, com o nome inteiro, itens somados e quem enviou por último primeiro', async () => {
  const C = require('../assets/catalog.js'), now = Date.now(), D = 864e5;
  const long = 'W'.repeat(C.LIMITS.name);
  const g = (n, k, i, ago) => ({ n, k, i, at: now - ago * D });
  const { head, rows } = await profileGifts({
    total: 9,
    list: [
      g('Mariazinha_2010', 'c', 'cenoura', 0), g(long, 'r', 'arroz_doce', 1), g('Mariazinha_2010', 'r', 'sopa_legumes', 2),
      g('Mariazinha_2010', 'c', 'cenoura', 3), g(long, 'c', 'tomate', 4), g('Ana', 'c', 'nao_existe', 5), g('', 'c', 'morango', 6), g('Ana', 'c', 'tulipa', 400)
    ]
  });
  const who = r => r.kids[0].kids[0].textContent, day = r => r.kids[0].kids[1].textContent, chips = r => r.kids[1].kids.map(c => c.getAttribute('aria-label'));
  assert.deepStrictEqual(rows.map(who), ['Mariazinha_2010', long, 'Jogador', 'Ana'], 'um por pessoa, do presente mais recente para o mais antigo; sem nome vira Jogador');
  assert.strictEqual(who(rows[1]).length, C.LIMITS.name, 'o nome aparece inteiro, até o limite do jogo');
  assert.deepStrictEqual(chips(rows[0]), [C.CROP.cenoura.n + ' ×2', C.RECIPE.sopa_legumes.n], 'itens repetidos somados');
  assert.strictEqual(rows[0].kids[1].kids[0].textContent, C.CROP.cenoura.ic + '×2');
  assert.deepStrictEqual(chips(rows[3]), [C.CROP.tulipa.n], 'item fora do catálogo não aparece');
  assert.strictEqual(day(rows[0]), 'hoje');
  assert.strictEqual(day(rows[1]), 'ontem');
  assert.match(day(rows[3]), /^\d{2}\/\d{2}\/\d{4}$/, 'de outro ano: a data inteira');
  assert.strictEqual(head, '9 presentes recebidos (os 7 mais recentes, de 4 pessoas)');
  assert.doesNotMatch(profile, /#gfl [^{]*\{[^}]*(ellipsis|nowrap)/, 'nada na lista de presentes corta o nome');
});
