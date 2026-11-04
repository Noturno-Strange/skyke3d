'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPets, RELEASE_LOCK } = require('../lib/pets.js');
const { pidOf } = require('../lib/pubprofile.js');
const G = require('../lib/pet-genes.js');

const H = 3600000,
  D = 86400000;
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-pets-')), 'pets.json');
const clock = (t = Date.UTC(2026, 10, 4, 12)) => {
  const f = () => t;
  f.add = ms => (t += ms);
  return f;
};
const A = pidOf('a'),
  B = pidOf('b'),
  Cc = pidOf('c');

test('adoção: um mascote por dono, nome limpo e sem link, e a seed nunca sai do servidor', () => {
  const now = clock();
  const P = createPets({ now });
  assert.strictEqual(P.adopt('nao-e-id', 'Bolo').reason, 'invalid');
  assert.strictEqual(P.adopt(A, '   ').reason, 'name');
  assert.strictEqual(P.adopt(A, 'veja ab . com').reason, 'name');
  const r = P.adopt(A, '  <b>Bolinha</b> ');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.pet.name, 'bBolinha/b');
  assert.ok(!JSON.stringify(r).includes('seed') && !('sd' in r.pet));
  assert.strictEqual(P.adopt(A, 'Outro').reason, 'exists');
  assert.strictEqual(P.size(), 1);
});

test('unicidade: mil adoções não repetem nenhum genoma', () => {
  const P = createPets({ now: clock() });
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const r = P.adopt(pidOf('dono' + i), 'Pet' + i);
    assert.strictEqual(r.ok, true);
    const k = G.genomeKey(r.pet.genes);
    assert.ok(!seen.has(k), 'genoma repetido');
    seen.add(k);
  }
  assert.strictEqual(P.genomeCount(), 1000);
});

test('unicidade: se a seed sorteada cai num genoma já usado, ele sorteia de novo', () => {
  const g0 = G.genesFromSeed('aaaaaaaaaaaaaaaa', 0);
  let calls = 0;
  const P = createPets({ now: clock(), randomSeed: () => (calls++ < 2 ? 'aaaaaaaaaaaaaaaa' : 'bbbbbbbbbbbbbbbb') });
  const a = P.adopt(A, 'Um'),
    b = P.adopt(B, 'Dois');
  assert.deepStrictEqual(a.pet.genes, g0);
  assert.notDeepStrictEqual(b.pet.genes, g0, 'o segundo não repete o primeiro');
});

test('ações: só o dono (pelo código), com espera, e pedido repetido não duplica', () => {
  const now = clock();
  const P = createPets({ now });
  P.adopt(A, 'Bolo');
  assert.strictEqual(P.act(B, 'feed', 'rid-000001').reason, 'none', 'outro código não tem mascote');
  assert.strictEqual(P.act(A, 'feed', 'x').reason, 'rid', 'pedido precisa de identificador');
  now.add(8 * H);
  const r1 = P.act(A, 'feed', 'rid-000002');
  assert.strictEqual(r1.ok, true);
  const f1 = r1.pet.a.food;
  const r2 = P.act(A, 'feed', 'rid-000002');
  assert.strictEqual(r2.dup, true);
  assert.strictEqual(r2.pet.a.food, f1, 'pedido repetido devolve o mesmo resultado');
  assert.strictEqual(P.view(A).stats.feed, 1, 'e conta uma vez só');
  const r3 = P.act(A, 'feed', 'rid-000003');
  assert.deepStrictEqual([r3.ok, r3.reason], [false, 'cooldown']);
  assert.strictEqual(P.act(A, 'inventada', 'rid-000004').reason, 'action');
});

test('o tempo passa sozinho: depois de dias offline o mascote está mais velho e com necessidades menores', () => {
  const now = clock();
  const P = createPets({ now });
  P.adopt(A, 'Bolo');
  const v0 = P.view(A);
  now.add(8 * D);
  const v1 = P.view(A);
  assert.strictEqual(v1.age, 8);
  assert.ok(v1.a.food < v0.a.food && v1.a.health >= 30);
  assert.ok(v1.ach.some(x => x.id === 'uma-semana'), 'marco de idade sem precisar jogar');
});

test('persistência: reiniciar o servidor mantém seed, genes, idade, histórico e espera', () => {
  const file = tmp(),
    now = clock();
  let P = createPets({ file, now, delayMs: 1 });
  const adopted = P.adopt(A, 'Bolo');
  now.add(10 * H);
  P.act(A, 'feed', 'rid-000001');
  P.flush();
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  assert.match(raw.pets[A].sd, /^[0-9a-f]{16}$/);
  assert.deepStrictEqual(G.genesFromSeed(raw.pets[A].sd, raw.pets[A].n), adopted.pet.genes, 'seed reconstrói a aparência');
  assert.ok(!JSON.stringify(raw).includes('"a"' + 'x'.repeat(30)));
  now.add(5 * D);
  P = createPets({ file, now });
  const v = P.view(A);
  assert.strictEqual(v.name, 'Bolo');
  assert.deepStrictEqual(v.genes, adopted.pet.genes);
  assert.strictEqual(v.age, 5);
  assert.strictEqual(v.stats.feed, 1);
  assert.strictEqual(P.adopt(A, 'Outro').reason, 'exists');
  assert.strictEqual(P.genomeCount(), 1);
});

test('arquivo corrompido ou adulterado: lixo é ignorado, dois genomas iguais não entram, nada derruba', () => {
  const file = tmp(),
    now = clock();
  fs.writeFileSync(file, '{ quebrado');
  const w = [];
  assert.doesNotThrow(() => createPets({ file, now, warn: m => w.push(m) }));
  assert.ok(w.length === 1 && fs.existsSync(file + '.bak'));
  const P0 = createPets({ now });
  P0.adopt(A, 'Bolo');
  const rec = JSON.parse(JSON.stringify(P0.view(A)));
  const base = { sd: '0123456789abcdef', n: 0, g: rec.genes, nm: 'X<script>', c: now() - D, t: now() - D, a: { food: 9999, energy: -5, joy: 'x' }, cd: { feed: now() + 99 * D }, ct: { feed: -1 }, hs: [['feed', 1], ['hack', 2], 'x'], un: { 'um-mes': now(), inventada: 1 }, cos: 99, bd: { d: 1, g: 9999 } };
  fs.writeFileSync(file, JSON.stringify({ v: 1, pets: { [A]: base, [B]: { ...base }, '../x': base, [Cc]: { ...base, g: { ...rec.genes, bd: 99 } } }, rel: {} }));
  const P = createPets({ file, now });
  assert.strictEqual(P.size(), 1, 'só o primeiro; o idêntico, o id ruim e o gene inválido saem');
  const v = P.view(A);
  assert.strictEqual(v.name, 'Xscript');
  assert.ok(v.a.food <= 100 && v.a.energy >= 0, 'valores limitados à faixa');
  assert.ok(v.cos === 0 && !v.cd.feed, 'acessório e espera absurdos são descartados');
  assert.ok(v.hist.every(h => h[0] === 'adotado' || h[0] === 'feed'));
});

test('soltar: apaga o mascote e trava nova adoção por 30 dias (sem sortear até sair um raro)', () => {
  const now = clock();
  const P = createPets({ now });
  const a = P.adopt(A, 'Bolo');
  assert.strictEqual(P.release(A).ok, true);
  assert.strictEqual(P.has(A), false);
  assert.strictEqual(P.genomeCount(), 0);
  const r = P.adopt(A, 'Novo');
  assert.deepStrictEqual([r.ok, r.reason], [false, 'locked']);
  now.add(RELEASE_LOCK + 1);
  assert.strictEqual(P.adopt(A, 'Novo').ok, true);
  assert.ok(a.ok);
});

test('trava de soltar sobrevive ao reinício', () => {
  const file = tmp(),
    now = clock();
  let P = createPets({ file, now, delayMs: 1 });
  P.adopt(A, 'Bolo');
  P.release(A);
  P.flush();
  now.add(10 * D);
  P = createPets({ file, now });
  assert.strictEqual(P.adopt(A, 'Novo').reason, 'locked');
});

test('acessório: só o liberado; o genótipo não muda', () => {
  const now = clock();
  const P = createPets({ now });
  const g = JSON.stringify(P.adopt(A, 'Bolo').pet.genes);
  assert.strictEqual(P.dress(A, 3).reason, 'locked');
  now.add(31 * D);
  P.view(A);
  const pet = P.act(A, 'pet', 'rid-000001').pet;
  assert.ok(pet.cosOk.includes(3), 'um mês liberou a coroa');
  assert.strictEqual(P.dress(A, 3).ok, true);
  assert.strictEqual(JSON.stringify(P.view(A).genes), g);
});

test('interações sociais: não mudam nada do mascote, têm espera por pessoa e limite por dia', () => {
  const now = clock();
  const P = createPets({ now });
  P.adopt(A, 'Bolo');
  const antes = JSON.stringify(P.view(A).a);
  assert.strictEqual(P.visit(A, A, 'wave').reason, 'self');
  assert.strictEqual(P.visit(B, Cc, 'wave').reason, 'none');
  assert.strictEqual(P.visit(A, B, 'voar').reason, 'kind');
  assert.strictEqual(P.visit(A, B, 'wave').counts.wave, 1);
  assert.strictEqual(P.visit(A, B, 'wave').reason, 'cooldown');
  assert.strictEqual(P.visit(A, B, 'hug').counts.hug, 1);
  assert.strictEqual(P.visit(A, Cc, 'gift').counts.gift, 1);
  assert.strictEqual(JSON.stringify(P.view(A).a), antes, 'necessidades intactas');
  assert.deepStrictEqual(P.publicOf(A).social, { wave: 1, hug: 1, gift: 1 });
  now.add(7 * H);
  assert.strictEqual(P.visit(A, B, 'wave').ok, true, 'depois de 6 h pode de novo');
  for (let i = 0; i < 250; i++) P.visit(A, pidOf('v' + i), 'wave');
  assert.strictEqual(P.visit(A, pidOf('zz'), 'wave').reason, 'busy', 'teto diário');
});

test('resumo público: aparência, idade e marcos; nunca necessidades, seed nem id', () => {
  const now = clock();
  const P = createPets({ now });
  P.adopt(A, 'Bolo');
  now.add(2 * D);
  const pub = P.publicOf(A);
  const txt = JSON.stringify(pub);
  assert.ok(pub.age === 2 && pub.name === 'Bolo' && pub.genes && pub.stageName === 'Filhote');
  assert.ok(!/"a":|"sd"|seed|"cd":|"food"|"energy"/.test(txt));
  assert.strictEqual(P.publicOf(B), null);
});

test('teto de mascotes: recusa novas adoções quando cheio', () => {
  const P = createPets({ now: clock(), max: 2 });
  assert.ok(P.adopt(A, 'A').ok && P.adopt(B, 'B').ok);
  assert.strictEqual(P.adopt(Cc, 'C').reason, 'full');
});
