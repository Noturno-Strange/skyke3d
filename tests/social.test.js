'use strict';

// Amigos, convites e chat global (lib/social.js): sem guardar nada, presença só entre amigos mútuos e anti-spam.
const test = require('node:test');
const assert = require('node:assert');
const { createSocial, fidOf } = require('../lib/social');
const V = require('../lib/validate');
const H = require('./harness.js');

const key = c => c.repeat(43);
function world(o = {}) {
  let t = 1000000;
  const out = [];
  const S = createSocial({ send: (ws, m) => out.push({ to: ws.n, ...m }), censor: s => s.replace(/bobo/gi, '****'), now: () => t, minAge: 20000, cap: 3, ...o });
  const room = code => ({ code });
  const conn = (n, r) => ({ ws: { n }, me: { name: n }, room: r, since: t - 60000, fid: '', watch: new Set(), gOn: false, gLast: '', gLastAt: 0 });
  return { S, out, room, conn, tick: ms => (t += ms), got: (n, type) => out.filter(m => m.to === n && (!type || m.t === type)) };
}

test('id de amigo: 12 caracteres, sempre o mesmo para a mesma chave e diferente entre chaves', () => {
  assert.match(fidOf(key('a')), /^[a-z2-7]{12}$/);
  assert.strictEqual(fidOf(key('a')), fidOf(key('a')));
  assert.notStrictEqual(fidOf(key('a')), fidOf(key('b')));
});

test('validação: chave, ids e texto do chat global com formato e tamanho certos', () => {
  const id = fidOf(key('a'));
  assert.deepStrictEqual(V.normalizeMessage({ t: 'friends', k: key('a'), ids: [id, id] }), { t: 'friends', k: key('a'), ids: [id] });
  for (const bad of [{ t: 'friends', k: 'curta', ids: [] }, { t: 'friends', k: key('a'), ids: Array(101).fill(id) }, { t: 'friends', k: key('a'), ids: ['ID-INVALIDO'] }, { t: 'freq', to: 'x' }, { t: 'gchat', text: 'ab'.repeat(71) }, { t: 'gchat', text: '   ' }, { t: 'gsub', on: 1 }])
    assert.strictEqual(V.normalizeMessage(bad), null, JSON.stringify(bad).slice(0, 60));
  assert.strictEqual(V.normalizeMessage({ t: 'gchat', text: '  oi\n\n  gente  ' }).text, 'oi gente');
});

test('presença: só entre amigos mútuos; ter o id de alguém não revela se está online', () => {
  const W = world(), r = W.room('AAAAAAAAAA'), a = W.conn('ana', r), b = W.conn('bia', W.room('BBBBBBBBBB')), x = W.conn('xis', r);
  const A = W.S.join(a, key('a'), []), B = W.S.join(b, key('b'), [A]);
  assert.strictEqual(W.got('bia', 'fpres').length ? W.got('bia', 'fpres').at(-1).on : 0, 0, 'Bia tem Ana na lista, mas Ana não tem Bia');
  W.S.join(x, key('x'), [A]);
  W.S.join(a, key('a'), [B]);
  assert.deepStrictEqual(W.got('bia', 'fpres').at(-1), { to: 'bia', t: 'fpres', id: A, on: 1 });
  assert.deepStrictEqual(W.got('ana', 'fpres').at(-1), { to: 'ana', t: 'fpres', id: B, on: 1 });
  assert.ok(!W.got('xis', 'fpres').some(m => m.on), 'quem não é amigo mútuo não vê nada');
  W.S.leave(a);
  assert.deepStrictEqual(W.got('bia', 'fpres').at(-1), { to: 'bia', t: 'fpres', id: A, on: 0 });
});

test('pedido de amizade: só para quem está por perto, um por par a cada 10 min, e aceitar exige pedido real', () => {
  const W = world(), r = W.room('AAAAAAAAAA'), a = W.conn('ana', r), b = W.conn('bia', r), c = W.conn('cau', W.room('CCCCCCCCCC'));
  const A = W.S.join(a, key('a'), []), B = W.S.join(b, key('b'), []), C = W.S.join(c, key('c'), []);
  W.S.request(a, B);
  W.S.request(a, B);
  assert.strictEqual(W.got('bia', 'freq').length, 1, 'repetir o pedido não chega de novo');
  W.S.request(a, C);
  assert.strictEqual(W.got('cau', 'freq').length, 0, 'outra sala e sem falar no global: não chega');
  W.S.accept(c, A);
  assert.strictEqual(W.got('ana', 'facc').length, 0, 'aceitar sem pedido não faz nada');
  W.S.accept(b, A);
  assert.deepStrictEqual(W.got('ana', 'facc')[0], { to: 'ana', t: 'facc', id: B, name: 'bia' });
  W.S.accept(b, A);
  assert.strictEqual(W.got('ana', 'facc').length, 1, 'o pedido só vale uma vez');
  W.S.say(c, 'oi');
  W.S.request(a, C);
  assert.strictEqual(W.got('cau', 'freq').length, 1, 'quem falou no global há pouco pode receber pedido');
});

test('convite: só entre amigos mútuos online, de outra sala, com o código da sala de quem convida', () => {
  const W = world(), a = W.conn('ana', W.room('AAAAAAAAAA')), b = W.conn('bia', W.room('BBBBBBBBBB'));
  const A = W.S.join(a, key('a'), []), B = W.S.join(b, key('b'), [A]);
  W.S.invite(a, B);
  assert.strictEqual(W.got('bia', 'finv').length, 0, 'sem amizade mútua, nada');
  W.S.join(a, key('a'), [B]);
  W.S.invite(a, B);
  W.S.invite(a, B);
  assert.deepStrictEqual(W.got('bia', 'finv'), [{ to: 'bia', t: 'finv', id: A, name: 'ana', code: 'AAAAAAAAAA' }], 'um convite a cada 30 s');
});

test('chat global: tempo mínimo na sala, sem links, filtro, sem repetir e teto do servidor', () => {
  const W = world(), r = W.room('AAAAAAAAAA'), a = W.conn('ana', r), b = W.conn('bia', r), n = W.conn('nova', r);
  [a, b, n].forEach((c, i) => W.S.join(c, key('abn'[i]), []));
  W.S.subscribe(b, true);
  n.since = 999000;
  W.S.say(n, 'oi');
  assert.match(W.got('nova', 'sys')[0].text, /pouquinho na sala/);
  W.S.say(a, 'veja www.golpe.xyz/premio seu bobo');
  assert.strictEqual(W.got('bia', 'gchat')[0].text, 'veja 🔗 seu ****');
  W.S.say(a, 'veja www.golpe.xyz/premio seu bobo');
  assert.strictEqual(W.got('bia', 'gchat').length, 1, 'a mesma frase em menos de 1 min não sai de novo');
  W.S.say(a, 'https://so-um-link.com');
  assert.strictEqual(W.got('bia', 'gchat').length, 1, 'mensagem que era só link não sai');
  W.S.say(a, 'dois');
  W.S.say(b, 'três');
  W.S.say(a, 'quatro');
  assert.match(W.got('ana', 'sys').at(-1).text, /muito movimentado/);
  W.tick(11000);
  W.S.say(a, 'cinco');
  assert.strictEqual(W.got('bia', 'gchat').at(-1).text, 'cinco');
  W.S.subscribe(n, true);
  assert.deepStrictEqual(W.got('nova', 'ghist')[0].list.map(m => m.text), ['veja 🔗 seu ****', 'dois', 'três', 'cinco']);
});

test('servidor: a chave vira id de amigo, a sala fica sabendo e o chat global tem limite por pessoa', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const send = (c, m) => c.ws.send(JSON.stringify(m));
  const a = await H.connect(srv.port, '203.0.113.50');
  t.after(() => a.ws.close());
  send(a, { t: 'create', style: 'proxima', bots: 0, name: 'Ana' });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')));
  const b = await H.connect(srv.port, '203.0.113.51');
  t.after(() => b.ws.close());
  send(b, { t: 'join', code: a.msgs.find(m => m.t === 'joined').code, name: 'Bia' });
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'joined')));
  send(a, { t: 'friends', k: key('a'), ids: [] });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'fme' && m.id === fidOf(key('a')))));
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'pfid' && m.fid === fidOf(key('a')))), 'quem está na sala recebe o id para poder adicionar');
  send(a, { t: 'gchat', text: 'oi' });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'sys' && /pouquinho na sala/.test(m.text))), 'recém-chegado espera antes de falar no global');
});
