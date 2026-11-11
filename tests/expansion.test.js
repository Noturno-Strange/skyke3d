'use strict';
// Expansão: ~200 itens novos (plantas, ingredientes e receitas), loja maior, carteira única entre fazenda e culinária e o histórico
// dos renascimentos (estrela amarela por safra na fazenda, vermelha por estrela na culinária).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../assets/catalog.js');
const F = require('../lib/farm.js');
const K = require('../lib/cook.js');
const { xpFor, MAX_LEVEL } = require('../lib/levels.js');

const PID = 'a'.repeat(20);
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const clock = (t = 1_800_000_000_000) => ({ now: () => t, go: ms => (t += ms) });
const tmp = (t, name) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-exp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, name);
};
/** grava um registro direto no arquivo (o jeito de chegar ao nível 999 num teste) */
const farmAt = (file, rec) => fs.writeFileSync(file, JSON.stringify({ v: 2, p: { [PID]: rec } }));
const cookAt = (file, rec) => fs.writeFileSync(file, JSON.stringify({ v: 1, p: { [PID]: rec } }));

test('expansão: 200 itens novos, distribuídos entre plantas, ingredientes e receitas', () => {
  const crops = C.CROPS.filter(c => c.x),
    recipes = C.RECIPES.filter(r => r.b === 2),
    ings = C.ING.slice(50);
  assert.deepStrictEqual([crops.length, ings.length, recipes.length], [42, 38, 120]);
  assert.strictEqual(crops.length + ings.length + recipes.length, 200);
  assert.deepStrictEqual([C.CROPS.length, C.ING.length, C.RECIPES.length], [100, 88, 182]);
  // os antigos não mudaram de lugar: a posição e o id são a chave do progresso salvo
  assert.strictEqual(C.CROPS[57].id, 'arvore');
  assert.strictEqual(C.CROPS.findIndex(c => c.x), 58, 'as plantas novas entram no fim');
  assert.strictEqual(C.RECIPES[61].id, 'espeto_horta');
  assert.strictEqual(C.RECIPES.findIndex(r => r.b === 2), 62, 'as receitas novas entram no fim');
  assert.strictEqual(C.ING[49].id, 'castanha');
});

test('expansão: nada repetido; cada ingrediente tem ícone próprio (os espaços da combinação só mostram o ícone)', () => {
  const icons = C.ING.map(i => i.ic);
  assert.strictEqual(new Set(icons).size, icons.length, 'ícone de ingrediente repetido');
  assert.strictEqual(new Set(C.RECIPES.map(r => r.n)).size, C.RECIPES.length, 'nome de receita repetido');
  assert.strictEqual(new Set(C.CROPS.map(c => c.n)).size, C.CROPS.length, 'nome de planta repetido');
  assert.strictEqual(new Set(C.ING.map(i => i.n)).size, C.ING.length, 'nome de ingrediente repetido');
  for (const i of C.ING) assert.ok(i.n.length <= 20 && /\p{Extended_Pictographic}/u.test(i.ic), i.id);
  for (const c of C.CROPS) assert.ok(c.n.length <= 18 && /\p{Extended_Pictographic}/u.test(c.ic), c.id);
  for (const r of C.RECIPES.filter(x => x.b === 2)) assert.ok(r.n.length <= 16 && r.info.length <= 20, r.id);
});

test('expansão: todo ingrediente novo é usado e as receitas novas dão utilidade aos antigos também', () => {
  const novas = C.RECIPES.filter(r => r.b === 2),
    used = new Set(novas.flatMap(r => r.g));
  for (const i of C.ING.slice(50)) assert.ok(used.has(i.id), i.id + ' não aparece em nenhuma receita nova');
  assert.ok(C.ING.slice(0, 50).filter(i => used.has(i.id)).length >= 40, 'as receitas novas misturam ingredientes antigos e novos');
  assert.deepStrictEqual([novas.filter(r => r.m === 'cozinhar').length, novas.filter(r => r.m === 'assar').length], [60, 60], 'metade panela, metade brasa');
  const sizes = new Set(novas.map(r => r.g.length));
  for (const n of [2, 3, 4, 5, 6]) assert.ok(sizes.has(n), 'receitas de ' + n + ' ingredientes');
});

test('expansão: a fazenda dá o que a culinária usa (plantas que não serviam para nada agora viram ingrediente)', () => {
  const gives = C.CROPS.filter(c => c.g);
  assert.strictEqual(gives.length, 59, 'eram 36 plantas com ingrediente');
  for (const id of ['pepino', 'alface', 'laranja', 'melancia', 'cereja', 'pessego', 'kiwi', 'melao', 'maca', 'cafe', 'gengibre', 'rosa', 'hibisco', 'girassol', 'lotus', 'trevo', 'cerejeira'])
    assert.strictEqual(C.CROP[id].g, id, id + ' (planta antiga) agora dá ingrediente');
  assert.strictEqual(C.CROP.cacto.g, 'palma');
  assert.strictEqual(C.CROP.margarida.g, 'camomila');
  for (const id of ['ervilha', 'azeitona', 'erva_mate', 'cha_verde']) assert.strictEqual(C.CROP[id].g, id, id + ' (planta nova)');
  // todo ingrediente de origem vegetal novo que tem planta com o mesmo id aponta para ela
  for (const c of gives) assert.ok(C.INGR[c.g], c.id);
});

test('expansão: progressão equilibrada (níveis 21 a 400, tempo e experiência crescem juntos, preço sai da experiência)', () => {
  const novas = C.CROPS.filter(c => c.x);
  assert.strictEqual(Math.max(...C.CROPS.filter(c => !c.x).map(c => c.lv)), 20, 'as antigas vão até o nível 20');
  for (let i = 0; i < novas.length; i++) {
    const c = novas[i];
    assert.ok(c.lv >= 21 && c.lv <= 400, c.id + ': nível');
    if (i) assert.ok(c.lv > novas[i - 1].lv, c.id + ': cada planta nova libera num nível maior que a anterior');
    assert.ok(c.t >= 480 && c.t <= 86400, c.id + ': de 8 min a 24 h');
    // mesma curva das antigas (experiência ~ tempo^0,8): planta mais demorada rende mais no total e menos por minuto
    const rate = c.xp / c.t;
    assert.ok(rate >= 0.015 && rate <= 0.05, c.id + ': experiência por segundo ' + rate.toFixed(4));
    assert.strictEqual(c.$, Math.max(1, Math.round(c.xp / 3)), c.id + ': preço');
  }
  const by = (a, b) => a.t - b.t,
    sorted = [...novas].filter(c => c.c !== 'Especiais').sort(by);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].xp >= sorted[i - 1].xp, sorted[i].id + ': mais tempo, mais experiência');
  assert.ok(novas.filter(c => c.lv >= 130).every(c => c.c === 'Especiais'), 'do nível 130 em diante, só as especiais dos planetas');
  for (const cat of ['Hortaliças', 'Frutas', 'Temperos', 'Flores', 'Especiais']) assert.ok(novas.some(c => c.c === cat), cat);
});

test('expansão: loja com níveis novos de propriedade e casa (gasto para as moedas dos níveis altos)', () => {
  assert.deepStrictEqual([C.FARM_PROP.length, C.FARM_HOUSE.length], [8, 8]);
  assert.deepStrictEqual(C.FARM_PROP.slice(0, 5).map(x => x.n), ['Sítio', 'Chácara', 'Fazenda', 'Grande Fazenda', 'Fazenda Modelo'], 'os níveis comprados continuam os mesmos');
  assert.deepStrictEqual(C.FARM_HOUSE.slice(0, 5).map(x => x.n), ['Barraca', 'Casinha', 'Casa', 'Casarão', 'Mansão']);
  for (const list of [C.FARM_PROP, C.FARM_HOUSE])
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].$ > list[i - 1].$ * 1.5 && list[i].lv > list[i - 1].lv && list[i].b > list[i - 1].b, list[i].n);
      assert.ok(list[i].$ <= F.COINS_MAX);
    }
  assert.ok(C.FARM_PROP.at(-1).b <= 0.7 && C.FARM_HOUSE.at(-1).b <= 0.35, 'bônus com teto');
});

test('emblemas antigos não mudam com a expansão; os grupos novos têm os seus', () => {
  const farm = F.createFarm(),
    cook = K.createCook();
  const fb = Object.fromEntries(F.BADGES.map(b => [b.id, b])),
    kb = Object.fromEntries(K.BADGES.map(b => [b.id, b]));
  const classic = Object.fromEntries(C.CROPS.filter(c => !c.x).map(c => [c.id, 1])),
    all = Object.fromEntries(C.CROPS.map(c => [c.id, 1]));
  assert.strictEqual(fb.mestre_fazenda.ok({ d: classic }), true, 'quem colheu as 58 do lançamento continua Mestre da Fazenda');
  assert.match(fb.mestre_fazenda.t, /58 plantas clássicas/);
  assert.strictEqual(fb.colheita_estelar.ok({ d: classic }), false);
  assert.strictEqual(fb.colheita_estelar.ok({ d: all }), true);
  assert.match(fb.colheita_estelar.t, /42 plantas da expansão/);
  assert.strictEqual(fb.milionario.ok({ me: 999999 }), false);
  assert.strictEqual(fb.milionario.ok({ me: 1000000 }), true);
  const done46 = Object.fromEntries(C.RECIPES.filter(r => !r.b).map(r => [r.id, 1]));
  assert.strictEqual(kb.mestre_cuca.ok({ d: done46 }), true, 'as 46 clássicas continuam bastando para o Mestre-cuca');
  assert.strictEqual(kb.banquete_estelar.ok({ d: done46 }), false);
  assert.match(kb.banquete_estelar.t, /120 receitas da expansão/);
  assert.strictEqual(kb.gourmet.ok({ distinct: 60 }), true);
  // os ids antigos continuam na mesma ordem (o painel desenha por posição)
  assert.deepStrictEqual(F.BADGES.slice(0, 13).map(b => b.id), ['semente', 'horta', 'jardineiro', 'pomar', 'regador', 'cesto', 'celeiro', 'sortudo', 'fazendeiro', 'mestre_fazenda', 'safra1', 'safra5', 'safra10']);
  assert.deepStrictEqual(K.BADGES.slice(0, 10).map(b => b.id), ['aprendiz', 'cozinheiro', 'mestre_panela', 'mestre_braseiro', 'chef', 'mestre_cuca', 'sabores_brasil', 'estrela1', 'estrela5', 'estrela10']);
  assert.strictEqual(farm.size() + cook.size(), 0);
});

test('carteira única: as moedas da culinária entram na carteira da fazenda, só pelo servidor', () => {
  const farm = F.createFarm();
  assert.strictEqual(farm.earn(PID, 12), 12);
  assert.strictEqual(farm.earn(PID, 8), 8);
  const v = farm.view(PID);
  assert.deepStrictEqual([v.coins, v.rec.earned, v.rec.cooked], [20, 20, 20]);
  for (const bad of [0, -5, 1.5, NaN, Infinity, '10', null, undefined]) assert.strictEqual(farm.earn(PID, bad), 0, 'valor inválido: ' + bad);
  assert.strictEqual(farm.earn('xyz', 10), 0, 'código inválido');
  assert.strictEqual(farm.view(PID).coins, 20);
  assert.ok(!('spend' in farm) && !('give' in farm) && !('transfer' in farm), 'moedas só saem pela loja; nunca vão de um jogador para outro');
  assert.strictEqual(farm.publicOf(PID).coins, undefined, 'o saldo continua fora da página pública');
});

test('carteira única: teto de moedas e teto de fazendas valem também para o que vem da culinária', () => {
  const farm = F.createFarm({ max: 1 });
  assert.strictEqual(farm.earn(PID, F.COINS_MAX - 5), F.COINS_MAX - 5);
  assert.strictEqual(farm.earn(PID, 100), 5, 'só entra o que cabe até o teto');
  assert.strictEqual(farm.earn(PID, 100), 0);
  assert.strictEqual(farm.view(PID).coins, F.COINS_MAX);
  assert.strictEqual(farm.earn('b'.repeat(20), 10), 0, 'sem vaga para um registro novo, nada é creditado');
});

test('culinária: moedas saem da experiência de base (um terço), sem inflar com o nível, e o antifraude corta junto', () => {
  assert.strictEqual(K.COIN_RATE, 1 / 3);
  const cook = K.createCook(),
    r = C.RECIPE.batata_assada;
  const a = cook.cook(PID, r.m, r.g);
  assert.deepStrictEqual([a.xp, a.coins], [30, 10]);
  const b = cook.cook(PID, r.m, r.g);
  assert.deepStrictEqual([b.first, b.coins], [false, 3]);
  // antifraude: o mesmo fator vale para a experiência e para as moedas
  const half = K.createCook({ gain: () => 0.5 }).cook(PID, r.m, r.g);
  assert.deepStrictEqual([half.xp, half.coins, half.cut], [15, 5, 50]);
  const zero = K.createCook({ gain: () => 0 }).cook(PID, r.m, r.g);
  assert.deepStrictEqual([zero.xp, zero.coins], [0, 0], 'em descanso não ganha moeda');
  // receita grande rende mais; nenhuma receita, na primeira vez, passa de 20 moedas (6 ingredientes)
  const top = Math.max(...C.RECIPES.map(x => Math.round(10 * x.g.length * K.COIN_RATE)));
  assert.strictEqual(top, 20);
});

test('culinária: no nível 500 a experiência vale ×6, mas as moedas não mudam; cada estrela soma 5%', t => {
  const file = tmp(t, 'cook.json'),
    r = C.RECIPE.costela_fogo;
  cookAt(file, { x: xpFor(500), d: { batata_assada: 1 }, k: { cozinhar: 0, assar: 1 }, u: [] });
  const hi = K.createCook({ file }).cook(PID, r.m, r.g);
  // base: 10 por ingrediente (20) + 4% dos atributos (Fogo 1 e Paladar 1) = 21
  assert.strictEqual(hi.xp, Math.round(21 * 5.99), 'experiência cresce 1% por nível');
  assert.strictEqual(hi.coins, 7, '21 de base → 7 moedas, em qualquer nível');
  cookAt(file, { x: 0, d: { batata_assada: 1 }, k: { cozinhar: 0, assar: 1 }, u: [], st: 4, sh: [1, 2, 3, 4] });
  assert.strictEqual(K.createCook({ file }).cook(PID, r.m, r.g).coins, 8, '4 estrelas: +20% (21 / 3 × 1,2 = 8)');
});

test('bônus da horta: ingrediente que o jogador já colheu vale +10% de moedas na receita', t => {
  const file = tmp(t, 'farm.json');
  farmAt(file, { x: 0, s: {}, d: { batata: 3, trigo: 1, cacto: 1 }, q: 0, h: 5, w: 0, p: 5, m: 0, me: 0 });
  const farm = F.createFarm({ file });
  assert.strictEqual(F.HOME_BONUS, 0.1);
  assert.strictEqual(farm.grown(PID, ['batata', 'manteiga', 'sal']), 1);
  assert.strictEqual(farm.grown(PID, ['farinha', 'batata', 'palma']), 3, 'trigo dá farinha e cacto dá palma');
  assert.strictEqual(farm.grown(PID, ['tomate']), 0, 'planta que ele não colheu');
  assert.strictEqual(farm.grown('b'.repeat(20), ['batata']), 0, 'quem não tem fazenda não tem bônus');
  assert.strictEqual(farm.harvested(PID, 'batata'), true);
  assert.strictEqual(farm.harvested(PID, 'tomate'), false);
  assert.strictEqual(farm.harvested(PID, 'toString'), false, 'chave herdada não é planta');
});

test('renascimento da fazenda: só no 999, volta ao nível 1 com experiência zerada, +1 estrela e a data registrada', t => {
  const file = tmp(t, 'farm.json'),
    k = clock();
  farmAt(file, { x: xpFor(MAX_LEVEL), s: {}, d: { tomate: 9 }, q: 30, h: 9, w: 2, p: 9, m: 500, me: 900, tl: 3, tp: 1, th: 1 });
  const farm = F.createFarm({ file, now: k.now, delayMs: 5 });
  assert.strictEqual(farm.view(PID).lv, MAX_LEVEL);
  const t1 = k.now();
  const r = farm.renew(PID);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual([r.rank, r.state.lv, r.state.xp, r.state.rank], [1, 1, 0, 1], 'nível 1, experiência zerada, uma estrela');
  assert.deepStrictEqual(r.state.hist, [t1], 'o histórico guarda quando foi');
  assert.deepStrictEqual([r.state.coins, r.state.land, r.state.prop, r.state.house, r.state.rec.harvests], [500, 3, 1, 1, 9], 'o resto fica');
  // repetir a mensagem (duplicação): a segunda já encontra o nível 1
  for (let i = 0; i < 10; i++) assert.deepStrictEqual(farm.renew(PID), { ok: false, reason: 'nivel' });
  assert.strictEqual(farm.view(PID).rank, 1, 'dez pedidos seguidos, uma estrela');
  assert.strictEqual(farm.publicOf(PID).rank, 1, 'a página pública mostra as estrelas');
  assert.deepStrictEqual(farm.publicOf(PID).hist, [t1]);
  farm.flush();
  const again = F.createFarm({ file, now: k.now });
  assert.deepStrictEqual([again.view(PID).rank, again.view(PID).hist], [1, [t1]], 'o registro do renascimento persiste');
});

test('renascimento: o arquivo não é confiado (não dá para inventar datas além das estrelas, nem estrelas pelo cliente)', t => {
  const file = tmp(t, 'farm.json');
  farmAt(file, { x: 10, s: {}, d: {}, q: 0, h: 0, w: 0, p: 1, m: 0, me: 0, sf: 2, sh: [5, 'x', -1, 7, 9, 11, 1.5] });
  const v = F.createFarm({ file }).view(PID);
  assert.deepStrictEqual([v.rank, v.hist], [2, [9, 11]], 'no máximo uma data por estrela, só inteiros positivos');
  farmAt(file, { x: 10, s: {}, d: {}, q: 0, h: 0, w: 0, p: 1, m: 0, me: 0, sf: 0, sh: [5, 7] });
  assert.deepStrictEqual(F.createFarm({ file }).view(PID).hist, [], 'sem estrela, sem histórico');
  const cfile = tmp(t, 'cook.json');
  cookAt(cfile, { x: 10, d: { batata_assada: 1 }, k: { cozinhar: 0, assar: 1 }, u: [], st: 1, sh: [3, 4, 5] });
  assert.deepStrictEqual(K.createCook({ file: cfile }).view(PID).hist, [5]);
  // o cliente não manda estrela: a mensagem de renascer só leva o rid
  const V = require('../lib/validate.js');
  assert.deepStrictEqual(V.normalizeMessage({ t: 'farmdo', k: 'renew', rid: 'abcdef12', sf: 99, rank: 99, x: 0 }), { t: 'farmdo', k: 'renew', rid: 'abcdef12' });
  assert.deepStrictEqual(V.normalizeMessage({ t: 'cookrenew', rid: 'abcdef12', st: 99 }), { t: 'cookrenew', rid: 'abcdef12' });
});

test('renascimento da culinária: só no 999, +1 estrela vermelha com data; receitas e emblemas ficam', t => {
  const file = tmp(t, 'cook.json'),
    k = clock();
  cookAt(file, { x: xpFor(MAX_LEVEL), d: { batata_assada: 4, sopa_legumes: 1 }, k: { cozinhar: 1, assar: 4 }, u: ['batata', 'sal'] });
  const cook = K.createCook({ file, now: k.now, delayMs: 5 });
  assert.deepStrictEqual(K.createCook().renew(PID), { ok: false, reason: 'nivel' }, 'sem nível 999 não renasce');
  const t1 = k.now(),
    r = cook.renew(PID);
  assert.deepStrictEqual([r.ok, r.rank, r.state.lv, r.state.xp], [true, 1, 1, 0]);
  assert.deepStrictEqual(r.state.hist, [t1]);
  assert.deepStrictEqual(r.badges.map(b => b.id), ['estrela1']);
  assert.strictEqual(cook.unlocked(PID, 'batata_assada'), true, 'os alimentos continuam desbloqueados');
  assert.deepStrictEqual(cook.renew(PID), { ok: false, reason: 'nivel' }, 'repetir não rende outra estrela');
  assert.deepStrictEqual(cook.publicOf(PID), { lv: 1, max: false, rank: 1, hist: [t1], kinds: 2, total: C.RECIPES.length });
  cook.flush();
  assert.deepStrictEqual(K.createCook({ file }).view(PID).hist, [t1]);
});

test('renascimento: o histórico tem teto (as datas mais recentes) e a contagem continua valendo', t => {
  const file = tmp(t, 'farm.json'),
    k = clock();
  farmAt(file, { x: xpFor(MAX_LEVEL), s: {}, d: {}, q: 0, h: 0, w: 0, p: 1, m: 0, me: 0, sf: 250, sh: Array.from({ length: 300 }, (_, i) => i + 1) });
  const farm = F.createFarm({ file, now: k.now });
  assert.strictEqual(farm.view(PID).rank, 250);
  assert.strictEqual(farm.renew(PID).rank, 251);
  assert.strictEqual(farm.view(PID).hist.length, 12, 'o painel recebe só as últimas');
  assert.strictEqual(farm.view(PID).hist.at(-1), k.now());
  farm.flush();
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).p[PID].sh.length, F.HIST_MAX, 'no disco, no máximo ' + F.HIST_MAX);
});

test('interface: estrela amarela na fazenda e vermelha na culinária, legíveis nos dois temas', () => {
  const panels = read('assets/app-panels.js'),
    farm = read('assets/app-farm.js'),
    cook = read('assets/app-cook.js'),
    css = read('assets/app.css');
  assert.match(panels, /function rankStars\(n,kind\)\{/);
  assert.match(farm, /rankStars\(s\.rank,'farm'\)/);
  assert.match(cook, /rankStars\(s\.rank,'cook'\)/);
  assert.match(css, /\.rst-farm\{color:var\(--rsy\)\}\.rst-cook\{color:var\(--rsr\)\}/);
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lin = v => ((v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const dark = css.match(/:root\{--rsy:(#[0-9a-f]{6});--rsr:(#[0-9a-f]{6})\}/),
    light = css.match(/:root\[data-theme=light\]\{--rsy:(#[0-9a-f]{6});--rsr:(#[0-9a-f]{6})\}/);
  for (const c of dark.slice(1)) assert.ok(ratio(hex(c), hex('#2a231c')) >= 4.5, c + ' no painel escuro');
  for (const c of light.slice(1)) assert.ok(ratio(hex(c), hex('#fffaf0')) >= 4.5, c + ' no painel claro');
  // amarela e vermelha de verdade (matiz), para as duas não se confundirem
  const hue = c => { const [r, g, b] = hex(c).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; return (((mx === r ? (g - b) / d : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60) + 360) % 360; };
  for (const m of [dark, light]) {
    assert.ok(hue(m[1]) >= 35 && hue(m[1]) <= 60, 'estrela da fazenda é amarela: ' + m[1]);
    assert.ok(hue(m[2]) <= 15 || hue(m[2]) >= 350, 'estrela da culinária é vermelha: ' + m[2]);
  }
  assert.match(cook, /if\(window\.farmCoins&&Number\.isInteger\(m\.wallet\)\)farmCoins\(m\.wallet\)/, 'a culinária atualiza o saldo no painel da fazenda');
  assert.match(farm, /window\.farmCoins=n=>/);
});
