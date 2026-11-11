'use strict';
// Culinária (lib/cook.js): receita pela combinação, desbloqueio, experiência, atributos, emblemas e persistência.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../assets/catalog.js');
const K = require('../lib/cook.js');

const PID = 'a'.repeat(20);
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-cook-')), 'cook.json');
const R = id => C.RECIPE[id];
const make = (cook, id, order) => cook.cook(PID, R(id).m, order ? [...R(id).g].reverse() : R(id).g);

test('catálogo de culinária: ingredientes, receitas e alimentos formam um conjunto consistente', () => {
  assert.ok(C.ING.length >= 40 && C.RECIPES.length >= 40, 'variedade de ingredientes e receitas');
  const ids = new Set(C.ING.map(i => i.id));
  assert.strictEqual(ids.size, C.ING.length, 'ingrediente repetido');
  const keys = new Set(),
    used = new Set();
  for (const r of C.RECIPES) {
    assert.ok(Object.prototype.hasOwnProperty.call(C.COOK_METHODS, r.m), r.id + ': método');
    assert.ok(r.g.length >= 2 && r.g.length <= C.COOK_SLOTS && new Set(r.g).size === r.g.length, r.id + ': de 2 a 6 ingredientes diferentes');
    for (const g of r.g) {
      assert.ok(ids.has(g), `${r.id}: ingrediente ${g} não existe`);
      used.add(g);
    }
    const k = C.recipeKey(r.m, r.g);
    assert.ok(!keys.has(k), r.id + ': mesma combinação de outra receita');
    keys.add(k);
    assert.ok(!ids.has(r.id), r.id + ' é nome de ingrediente');
    const it = C.ITEM[r.id];
    assert.ok(it && it.rc === 1 && it.food === 1 && it.c === 'Receitas', r.id + ': vira alimento bloqueado na mochila');
    assert.match(r.ic, /\p{Extended_Pictographic}/u);
  }
  for (const i of C.ING) {
    assert.ok(used.has(i.id), i.id + ' não é usado em nenhuma receita');
    assert.match(i.p, /^l?d?$/, i.id + ': preparo é l (lavar) e/ou d (descascar)');
  }
  assert.ok(C.ING.some(i => i.p.includes('l')) && C.ING.some(i => i.p.includes('d')), 'há o que lavar e o que descascar');
  assert.ok(C.RECIPES.some(r => r.m === 'cozinhar') && C.RECIPES.some(r => r.m === 'assar') && C.RECIPES.some(r => r.g.length === 6), 'os dois métodos e receitas de 6 ingredientes');
  assert.ok(C.ITEMS.filter(i => !i.rc).length === C.ITEMS.length - C.RECIPES.length, 'os itens antigos continuam livres');
});

test('culinária: a receita sai da combinação, em qualquer ordem, e desbloqueia o alimento só na primeira vez', () => {
  const cook = K.createCook({});
  assert.strictEqual(cook.unlocked(PID, 'batata_assada'), false);
  const a = make(cook, 'batata_assada', true);
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.recipe, 'batata_assada');
  assert.strictEqual(a.first, true);
  assert.strictEqual(a.xp, 30, '10 por ingrediente na primeira vez, sem bônus ainda');
  assert.strictEqual(cook.unlocked(PID, 'batata_assada'), true);
  assert.strictEqual(cook.unlocked(PID, 'sopa_legumes'), false, 'outras receitas continuam bloqueadas');
  assert.strictEqual(cook.unlocked('b'.repeat(20), 'batata_assada'), false, 'o desbloqueio é por jogador');
  const b = make(cook, 'batata_assada');
  assert.strictEqual(b.first, false);
  assert.ok(b.xp < a.xp, 'repetir rende menos');
  assert.strictEqual(cook.view(PID).done.batata_assada, 2);
});

test('culinária: o método faz parte da receita e combinação inválida não vira nada nem grava', () => {
  const cook = K.createCook({});
  assert.strictEqual(cook.cook(PID, 'cozinhar', R('batata_assada').g).reason, 'nada', 'mesmos ingredientes, outro método');
  assert.strictEqual(cook.cook(PID, 'assar', ['batata', 'sal']).reason, 'nada', 'sem receita');
  assert.strictEqual(cook.cook(PID, 'assar', ['batata']).reason, 'ingredientes', 'poucos ingredientes');
  assert.strictEqual(cook.cook(PID, 'assar', ['batata', 'batata', 'sal']).reason, 'ingredientes', 'ingrediente repetido');
  assert.strictEqual(cook.cook(PID, 'assar', ['batata', 'manteiga', 'sal', 'ovo', 'leite', 'mel', 'acucar']).reason, 'ingredientes', 'mais de 6');
  assert.strictEqual(cook.cook(PID, 'assar', ['batata', 'nao_existe']).reason, 'ingredientes');
  assert.strictEqual(cook.cook(PID, 'fritar', ['batata', 'sal']).reason, 'metodo');
  assert.strictEqual(cook.cook('xyz', 'assar', R('batata_assada').g).reason, 'pid');
  assert.strictEqual(cook.size(), 0, 'nada disso cria registro');
  assert.strictEqual(cook.view(PID).xp, 0);
});

test('culinária: experiência, nível, atributos e emblemas crescem com as receitas feitas', () => {
  const cook = K.createCook({});
  assert.deepStrictEqual([K.xpFor(1), K.xpFor(2), K.xpFor(3), K.levelOf(0), K.levelOf(49), K.levelOf(50), K.levelOf(1e9)], [0, 50, 150, 1, 1, 2, K.MAX_LEVEL]);
  const first = make(cook, 'batata_assada');
  assert.deepStrictEqual(first.badges.map(b => b.id), ['aprendiz'], 'primeira receita: emblema de aprendiz');
  assert.strictEqual(first.lvUp, false);
  const second = make(cook, 'milho_brasa'); // 30 xp: 60 no total, sobe para o nível 2
  assert.strictEqual(second.lvUp, true);
  assert.strictEqual(second.lv, 2);
  assert.ok(second.state.xp >= 50);
  for (const r of C.RECIPES.slice(0, 20)) make(cook, r.id);
  const v = cook.view(PID);
  assert.ok(v.attrs.find(a => a.id === 'paladar').r >= 4, 'paladar sobe com receitas diferentes');
  assert.ok(v.attrs.find(a => a.id === 'despensa').v >= 10, 'despensa conta ingredientes diferentes');
  assert.ok(v.attrs.every(a => a.r >= 0 && a.r <= 10));
  const ids = v.badges.filter(b => b.on).map(b => b.id);
  assert.ok(ids.includes('cozinheiro') && ids.includes('chef'), 'cozinheiro (5) e chef (20 diferentes): ' + ids);
  assert.ok(!ids.includes('mestre_cuca'));
  assert.deepStrictEqual(cook.badgesOf(PID).map(b => b.id), ids, 'o perfil público mostra os mesmos emblemas');
  for (const r of C.RECIPES) make(cook, r.id);
  assert.ok(cook.view(PID).badges.find(b => b.id === 'mestre_cuca').on, 'todas as receitas: mestre-cuca');
  assert.ok(cook.view(PID).badges.find(b => b.id === 'sabores_brasil').on, 'todas as dos biomas: sabores do Brasil');
  // quem fez as 46 clássicas continua mestre-cuca depois que o catálogo ganhou receitas novas (o emblema não pode sumir do perfil)
  const old = K.createCook({});
  for (const r of C.RECIPES.filter(x => !x.b)) make(old, r.id);
  const ob = old.view(PID).badges;
  assert.strictEqual(C.RECIPES.filter(x => !x.b).length, 46, 'as 46 receitas do lançamento da culinária');
  assert.ok(ob.find(b => b.id === 'mestre_cuca').on && !ob.find(b => b.id === 'sabores_brasil').on);
  assert.strictEqual(C.RECIPES.filter(x => x.b === 1).length, 16);
  assert.strictEqual(C.RECIPES.filter(x => x.b === 2).length, 120, 'as 120 receitas da expansão, com o emblema delas');
  const bonus = K.createCook({});
  for (const r of C.RECIPES) make(bonus, r.id);
  const again = make(bonus, 'batata_assada');
  assert.ok(again.xp > 9, 'os atributos dão um bônus pequeno de experiência (repetir sem bônus daria 9)');
});

test('culinária: tudo é gravado em arquivo e volta igual; o arquivo não é confiado', () => {
  const file = tmp();
  const a = K.createCook({ file, delayMs: 10000 });
  make(a, 'batata_assada');
  make(a, 'sopa_legumes');
  a.flush();
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  const b = K.createCook({ file });
  assert.deepStrictEqual(b.view(PID), a.view(PID), 'receitas, xp, atributos e emblemas persistem');
  assert.strictEqual(b.unlocked(PID, 'sopa_legumes'), true);
  // arquivo adulterado: receita inventada, contagem absurda, ingrediente que não existe, código de jogador inválido
  fs.writeFileSync(file, JSON.stringify({ v: 1, p: { [PID]: { x: 999999, d: { batata_assada: 3, inventada: 9, sopa_legumes: -2 }, k: { cozinhar: 'x', assar: 1e12 }, u: ['sal', 'veneno', 'sal'] }, nope: { x: 5, d: {}, k: {}, u: [] } } }));
  const c = K.createCook({ file });
  const v = c.view(PID);
  assert.strictEqual(c.size(), 1);
  assert.strictEqual(v.lv, K.MAX_LEVEL);
  assert.ok(v.xp <= K.xpFor(K.MAX_LEVEL));
  assert.deepStrictEqual(Object.keys(v.done), ['batata_assada']);
  assert.strictEqual(c.unlocked(PID, 'inventada'), false);
  assert.strictEqual(v.attrs.find(a => a.id === 'despensa').v, 1, 'ingrediente falso e repetido descartados');
  fs.writeFileSync(file, 'isto não é json');
  assert.strictEqual(K.createCook({ file, onError: () => {} }).size(), 0, 'arquivo quebrado não derruba');
});

test('culinária: teto de jogadores e sem estado compartilhado entre jogadores', () => {
  const cook = K.createCook({ max: 2 });
  for (const p of ['a', 'b']) assert.strictEqual(cook.cook(p.repeat(20), 'assar', R('batata_assada').g).ok, true);
  assert.strictEqual(cook.cook('c'.repeat(20), 'assar', R('batata_assada').g).reason, 'full');
  assert.strictEqual(cook.cook('a'.repeat(20), 'assar', R('milho_brasa').g).ok, true, 'quem já tem registro continua');
  assert.strictEqual(cook.view('b'.repeat(20)).total, 1);
});

test('antifraude: o fator de ganho corta a experiência da receita e o resultado avisa quanto', () => {
  const { createCook } = require('../lib/cook.js');
  const C = require('../assets/catalog.js');
  const seen = [];
  const k = createCook({ gain: (pid, xp) => (seen.push(xp), 0.5) });
  const r = C.RECIPES[0];
  const out = k.cook('c'.repeat(20), r.m, r.g);
  assert.ok(out.ok);
  assert.deepStrictEqual(seen, [10 * r.g.length], 'o antifraude vê o ganho bruto');
  assert.strictEqual(out.xp, Math.round((10 * r.g.length) / 2));
  assert.strictEqual(out.cut, 50);
  assert.ok(k.has('c'.repeat(20)) && !k.has('d'.repeat(20)));
});

test('estrela: só no nível 999; volta ao 1 com +1 estrela, guarda receitas e emblemas e rende +10% daí em diante', () => {
  const file = tmp();
  fs.writeFileSync(file, JSON.stringify({ v: 1, p: { [PID]: { x: K.xpFor(K.MAX_LEVEL), d: { batata_assada: 2 }, k: { cozinhar: 0, assar: 2 }, u: ['batata', 'sal'] } } }));
  const c = K.createCook({ file });
  assert.strictEqual(c.renew('e'.repeat(20)).reason, 'nivel');
  const r = c.renew(PID);
  assert.ok(r.ok && r.rank === 1);
  assert.deepStrictEqual(r.badges.map(b => b.id), ['estrela1']);
  assert.strictEqual(r.state.lv, 1);
  assert.strictEqual(r.state.rank, 1);
  assert.deepStrictEqual(r.state.done, { batata_assada: 2 }, 'receitas continuam');
  assert.strictEqual(c.unlocked(PID, 'batata_assada'), true, 'o alimento continua desbloqueado');
  const ranks = c.view(PID).attrs.reduce((n, a) => n + a.r, 0);
  const again = make(c, 'batata_assada');
  const base = Math.round(3 * R('batata_assada').g.length * (1 + 0.02 * ranks));
  assert.strictEqual(again.xp, Math.round(base * 1.1), 'repetir com 1 estrela: +10%');
  c.flush();
  assert.strictEqual(K.createCook({ file }).view(PID).rank, 1, 'a estrela fica gravada');
});
