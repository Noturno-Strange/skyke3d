'use strict';

// O catálogo (assets/catalog.js) é a única lista de itens, gestos, emojis, cores e mundos. Estes testes impedem as mudanças que
// quebrariam o jogo sem aviso: posição trocada numa lista salva no navegador, id sem tradução, item sem ícone, gesto sem animação.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../assets/catalog.js');
const V = require('../validate');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sound = read('assets/app-sound.js'), base = read('assets/app-base.js'), scene = read('assets/app-scene.js'), ui = read('assets/app-ui.js'), net = read('assets/app-net.js');
const ORDER = JSON.parse(read('tests/catalog-order.json'));

test('listas por posição só crescem no fim (o índice vai pela rede e fica salvo no navegador)', () => {
  for (const [k, old] of Object.entries(ORDER)) {
    if (k.startsWith('_')) continue;
    assert.ok(C[k].length >= old.length, `${k}: a lista encolheu (${old.length} → ${C[k].length}); remover muda o visual de quem já escolheu`);
    old.forEach((v, i) => assert.strictEqual(C[k][i], v, `${k}[${i}] mudou de ${v} para ${C[k][i]}: acrescente no fim em vez de trocar ou reordenar`));
  }
});

test('ids são únicos e os ids antigos de mundo apontam para mundos que existem', () => {
  for (const [k, ids] of [['ITEMS', C.ITEMS.map(i => i.id)], ['GESTS', C.GESTS.map(g => g.id)], ['ST', Object.keys(C.ST)]]) {
    assert.strictEqual(new Set(ids).size, ids.length, k + ' com id repetido');
    for (const id of ids) assert.match(id, /^[a-z][a-z0-9_]*$/, `${k}: id "${id}" (só minúsculas, números e _)`);
  }
  for (const [old, now] of Object.entries(C.ST_LEGACY)) {
    assert.ok(C.ST[now], `ST_LEGACY.${old} aponta para ${now}, que não existe`);
    assert.ok(!C.ST[old], `${old} é id atual e antigo ao mesmo tempo`);
  }
});

test('o servidor aceita tudo o que o catálogo oferece, e nada além', () => {
  for (const it of C.ITEMS) assert.ok(V.normalizeMessage({ t: 'item', item: it.id }), 'item ' + it.id);
  for (const g of [...C.GESTS.map(x => x.id), 'stop']) assert.ok(V.normalizeMessage({ t: 'gest', g }), 'gesto ' + g);
  assert.ok(V.normalizeMessage({ t: 'emo', i: C.EMO.length - 1 }));
  assert.strictEqual(V.normalizeMessage({ t: 'emo', i: C.EMO.length }), null, 'índice além da lista de emojis');
  assert.strictEqual(V.normalizeMessage({ t: 'item', item: 'nao_existe' }), null);
  assert.strictEqual(V.normalizeMessage({ t: 'gest', g: 'nao_existe' }), null);
  assert.deepStrictEqual([...V.FOOD].sort(), C.ITEMS.filter(i => i.food).map(i => i.id).sort());
  assert.deepStrictEqual([...V.SOUND_G].sort(), C.GESTS.filter(g => g.sfx).map(g => g.id).sort());
  for (const id of Object.keys(C.ST)) assert.ok(V.STY.has(id), 'mundo ' + id);
  for (const [k, n] of Object.entries(C.CR)) {
    assert.ok(V.cleanCfg({ [k]: n - 1 }), `${k} = ${n - 1} aceito`);
    assert.strictEqual(V.cleanCfg({ [k]: n }), null, `${k} = ${n} recusado`);
  }
  const old = V.cleanCfg({ shirt: 3, br: 1 });
  assert.deepStrictEqual([old.br, old.eb, old.sb], [1, 0, 0], 'cliente antigo, sem os campos novos, continua válido');
});

test('cada item tem ícone, cada gesto tem animação e cada mundo tem cenário', () => {
  const icons = new Set([...base.matchAll(/\b([A-Z][A-Z_]+):(?:potion\(|\{svg)/g)].map(m => m[1]));
  for (const it of C.ITEMS) {
    if (/^[A-Z][A-Z_]+$/.test(it.ic)) assert.ok(icons.has(it.ic), `${it.id}: ícone ${it.ic} não existe em ICONS (assets/app-base.js)`);
    else assert.ok(/\p{Extended_Pictographic}/u.test(it.ic), `${it.id}: ic precisa ser um emoji ou uma chave de ICONS`);
    assert.ok(['Beber', 'Comer'].includes(it.a) && (it.food ? it.a === 'Comer' : it.a === 'Beber'), `${it.id}: comida usa Comer, bebida usa Beber`);
  }
  for (const g of C.GESTS) {
    assert.match(ui, new RegExp('\\n ' + g.id + ':\\('), `gesto ${g.id} sem animação (DANCES em assets/app-ui.js)`);
    assert.ok(g.dur > 0, `gesto ${g.id}: dur em segundos ou Infinity`);
    assert.strictEqual(g.loop, g.dur === Infinity ? 1 : 0, `gesto ${g.id}: loop vem de dur`);
    assert.strictEqual(C.GEST[g.id], g);
    if (g.sfx) assert.match(sound, new RegExp("k==='" + g.sfx + "'"), `gesto ${g.id}: som ${g.sfx} não existe em assets/app-sound.js`);
    if (g.emo) assert.ok(/\p{Extended_Pictographic}/u.test(g.emo), `gesto ${g.id}: emo precisa ser um emoji`);
  }
  const table = (src, name) => { const i = src.indexOf('const ' + name + '={'); assert.ok(i >= 0, name); const j = src.indexOf('\nconst ', i + 1); return src.slice(i, j < 0 ? undefined : j); };
  for (const [src, name] of [[base, 'THEME'], [base, 'SKY'], [scene, 'MPROF'], [scene, 'MPAL']]) {
    const t = table(src, name);
    for (const id of Object.keys(C.ST)) assert.match(t, new RegExp('[{,\\s]' + id + ':'), `mundo ${id} sem entrada em ${name}`);
  }
});

test('o comportamento dos gestos vem dos campos do catálogo, nunca do id', () => {
  for (const f of ['app-base', 'app-scene', 'app-avatar', 'app-sound', 'app-net', 'app-panels', 'app-media', 'app-voice', 'app-ui']) {
    const src = read('assets/' + f + '.js');
    assert.ok(!/startsWith\('dance'\)|g===?'(?:dance\d+|arms|scream|fart|rocket|spell|alien|scope|star)'/.test(src), `${f}.js decide pelo id do gesto: use os campos do catálogo (loop, snd) ou a tabela DANCES`);
  }
  // há gestos dos dois tipos, e o tipo sai só da duração
  assert.ok(C.GESTS.some(g => g.loop) && C.GESTS.some(g => !g.loop));
});

test('nomes curtos e campos do visual iguais no editor e no servidor', () => {
  for (const it of C.ITEMS) { assert.ok(it.n && it.n.length <= 16, `item ${it.id}: nome "${it.n}"`); assert.ok(it.info && it.info.length <= 20, `item ${it.id}: info "${it.info}"`); }
  for (const g of C.GESTS) assert.ok(g.n && g.n.length <= 16, `gesto ${g.id}: nome "${g.n}"`);
  for (const [id, w] of Object.entries(C.ST)) assert.ok(w.n && w.n.length <= 12, `mundo ${id}: nome "${w.n}"`);
  assert.ok(!/[áa]lcool/i.test(JSON.stringify(C.ITEMS)), 'sem a palavra álcool');
  const eds = [...net.match(/const EDS=\[[^\n]*\];/)[0].matchAll(/\bk:'(\w+)'/g)].map(m => m[1]);
  const flags = Object.values(C.BRK);
  assert.deepStrictEqual([...eds, ...flags].sort(), Object.keys(C.CR).filter(k => k !== 'br').sort(), 'cada campo do servidor tem controle no editor');
  assert.strictEqual(V.MAX_NAME, C.LIMITS.name);
});

test('toda cor do editor tem a chave de brilho e a grade a diferencia', () => {
  const edsSrc = net.match(/const EDS=\[[^\n]*\];/)[0];
  const cores = [...edsSrc.matchAll(/\{g:\d,k:'(\w+)',n:'[^']*',c:\w+(?:,b:'(\w+)')?\}/g)];
  assert.ok(cores.length >= 7);
  for (const [, k, b] of cores) { assert.ok(b, `cor ${k} sem chave de brilho`); assert.strictEqual(C.BRK[k] === b || Object.values(C.BRK).includes(b), true, `${k}: ${b}`); }
  assert.deepStrictEqual(cores.map(m => m[2]).sort(), Object.values(C.BRK).sort(), 'cada chave de brilho pertence a uma cor');
  assert.match(net, /data-ci\]'\)\.forEach\(b=>\{[^}]*classList\.toggle\('sw-gl',bg\)/, 'grade marca as bolinhas brilhantes com sw-gl');
});

test('cores brilhantes: cada cor de cada paleta tem uma par no mesmo índice, visivelmente diferente e do mesmo tom', () => {
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const hue = h => { const [r, g, b] = rgb(h), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); if (!d) return null; return ((mx === r ? (g - b) / d + 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) % 6) / 6; };
  const sat = h => { const [r, g, b] = rgb(h), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)); };
  for (const P of ['PAL', 'SKIN', 'EYE', 'HAIRC']) {
    assert.strictEqual(C.GLOSS[P].length, C[P].length, P);
    C[P].forEach((h, i) => {
      const g = C.GLOSS[P][i];
      assert.match(g, /^#[0-9a-f]{6}$/, P + i);
      const [a, b] = [rgb(h), rgb(g)];
      assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) >= 0.1, `${P}[${i}] ${h} → ${g}: a par brilhante tem de se ver diferente`);
      if (sat(h) >= 0.32) { const dh = Math.abs(hue(h) - hue(g)); assert.ok(Math.min(dh, 1 - dh) < 0.04, `${P}[${i}] ${h} → ${g}: o tom continua o mesmo`); }
    });
  }
});
