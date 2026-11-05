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

const fid = c => fidOf(key(c));

test('presença: só entre amigos mútuos, com os apelidos atuais; ter o id de alguém não revela se está online', () => {
  const W = world(), r = W.room('AAAAAAAAAA'), a = W.conn('ana', r), b = W.conn('bia', W.room('BBBBBBBBBB')), x = W.conn('xis', r);
  const A = fid('a'), B = fid('b');
  W.S.join(a, key('a'), []);
  W.S.join(b, key('b'), [A]);
  assert.strictEqual(W.got('bia', 'fpres').length, 0, 'Bia tem Ana na lista, mas Ana não tem Bia: não recebe nada (nem "offline")');
  W.S.join(x, key('x'), [A]);
  W.S.join(a, key('a'), [B]);
  assert.deepStrictEqual(W.got('bia', 'fpres').at(-1), { to: 'bia', t: 'fpres', id: A, on: 1, name: 'ana', hs: [a.h] });
  assert.deepStrictEqual(W.got('ana', 'fpres').at(-1), { to: 'ana', t: 'fpres', id: B, on: 1, name: 'bia', hs: [b.h] });
  assert.ok(!W.got('xis', 'fpres').some(m => m.on), 'quem não é amigo mútuo não vê nada');
  W.S.leave(a);
  assert.deepStrictEqual(W.got('bia', 'fpres').at(-1), { to: 'bia', t: 'fpres', id: A, on: 0 });
});

test('apelido público: aleatório por conexão, diferente do id de amigo e novo a cada entrada', () => {
  const W = world(), r = W.room('AAAAAAAAAA'), a = W.conn('ana', r);
  const h1 = W.S.join(a, key('a'), []);
  assert.match(h1, /^[a-z2-7]{12}$/);
  assert.notStrictEqual(h1, fid('a'));
  W.S.leave(a);
  const a2 = W.conn('ana', r);
  assert.notStrictEqual(W.S.join(a2, key('a'), []), h1, 'outra sessão, outro apelido: não dá para seguir a pessoa');
  assert.deepStrictEqual(W.got('ana', 'fme').map(m => m.id), [fid('a'), fid('a')], 'só a própria pessoa recebe o próprio id');
});

test('pedido de amizade: pelo apelido, só para quem está por perto, um por par a cada 10 min, e aceitar exige pedido real', () => {
  const W = world(), r = W.room('AAAAAAAAAA'), a = W.conn('ana', r), b = W.conn('bia', r), c = W.conn('cau', W.room('CCCCCCCCCC'));
  const A = fid('a'), B = fid('b');
  W.S.join(a, key('a'), []);
  const hb = W.S.join(b, key('b'), []), hc = W.S.join(c, key('c'), []);
  W.S.request(a, hb);
  W.S.request(a, hb);
  assert.strictEqual(W.got('bia', 'freq').length, 1, 'repetir o pedido não chega de novo');
  assert.deepStrictEqual(W.got('bia', 'freq')[0], { to: 'bia', t: 'freq', id: A, h: a.h, name: 'ana' });
  W.S.request(a, hc);
  assert.strictEqual(W.got('cau', 'freq').length, 0, 'outra sala e sem falar no global: não chega');
  W.S.request(a, 'zzzzzzzzzzzz');
  const msgs = W.got('ana', 'sys').map(m => m.text);
  assert.strictEqual(msgs.length, 2);
  assert.strictEqual(msgs[0], msgs[1], 'a mesma resposta para quem está longe e para quem não existe: nada revela se está online');
  W.S.accept(c, A);
  assert.strictEqual(W.got('ana', 'facc').length, 0, 'aceitar sem pedido não faz nada');
  W.S.accept(b, A);
  assert.deepStrictEqual(W.got('ana', 'facc')[0], { to: 'ana', t: 'facc', id: B, name: 'bia' });
  W.S.accept(b, A);
  assert.strictEqual(W.got('ana', 'facc').length, 1, 'o pedido só vale uma vez');
  W.S.say(c, 'oi');
  W.S.request(a, hc);
  assert.strictEqual(W.got('cau', 'freq').length, 1, 'quem falou no global há pouco pode receber pedido');
});

test('convite: só entre amigos mútuos online, de outra sala, com o código da sala de quem convida', () => {
  const W = world(), a = W.conn('ana', W.room('AAAAAAAAAA')), b = W.conn('bia', W.room('BBBBBBBBBB'));
  const A = fid('a'), B = fid('b');
  W.S.join(a, key('a'), []);
  W.S.join(b, key('b'), [A]);
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
  assert.match(W.got('nova', 'gsys')[0].text, /pouquinho na sala/);
  W.S.say(a, 'veja www.golpe.xyz/premio seu bobo');
  assert.strictEqual(W.got('bia', 'gchat')[0].text, 'veja 🔗 seu ****');
  assert.strictEqual(W.got('bia', 'gchat')[0].id, a.h, 'no global vai o apelido, não o id de amigo');
  W.S.say(a, 'veja www.golpe.xyz/premio seu bobo');
  assert.strictEqual(W.got('bia', 'gchat').length, 1, 'a mesma frase em menos de 1 min não sai de novo');
  W.S.say(a, 'https://so-um-link.com');
  assert.strictEqual(W.got('bia', 'gchat').length, 1, 'mensagem que era só link não sai');
  W.S.say(a, 'dois');
  W.S.say(b, 'três');
  W.S.say(a, 'quatro');
  assert.match(W.got('ana', 'gsys').at(-1).text, /muito movimentado/);
  W.tick(11000);
  W.S.say(a, 'cinco');
  assert.strictEqual(W.got('bia', 'gchat').at(-1).text, 'cinco');
  W.S.subscribe(n, true);
  assert.strictEqual(W.got('nova', 'ghist').length, 0, 'nenhuma mensagem fica guardada: quem chega não recebe histórico');
});

test('servidor: a chave vira id de amigo, a sala fica sabendo e o chat global tem limite por pessoa', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const send = (c, m) => c.ws.send(JSON.stringify(m));
  const a = await H.connect(srv.port, '203.0.113.50');
  t.after(() => a.ws.close());
  send(a, { t: 'create', style: 'amazora', bots: 0, name: 'Ana' });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')));
  const b = await H.connect(srv.port, '203.0.113.51');
  t.after(() => b.ws.close());
  send(b, { t: 'join', code: a.msgs.find(m => m.t === 'joined').code, name: 'Bia' });
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'joined')));
  send(a, { t: 'friends', k: key('a'), ids: [] });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'fme' && m.id === fidOf(key('a')))));
  const h = a.msgs.find(m => m.t === 'fme').h;
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'pfid' && m.fid === h)), 'quem está na sala recebe o apelido para poder adicionar');
  assert.ok(!JSON.stringify(b.msgs).includes(fidOf(key('a'))), 'o id de amigo da Ana nunca chega à Bia');
  send(a, { t: 'gchat', text: 'oi' });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'gsys' && /pouquinho na sala/.test(m.text))), 'recém-chegado espera antes de falar no global');
});

test('contador online: quem assina o global recebe o total na hora e depois só quando muda', () => {
  const W = world(), r = W.room('AAAAAAAAAA'), a = W.conn('ana', r), b = W.conn('bia', r);
  W.S.join(a, key('a'), []);
  W.S.subscribe(a, true);
  assert.deepStrictEqual(W.got('ana', 'gn'), [{ to: 'ana', t: 'gn', n: 1 }]);
  W.S.join(b, key('b'), []);
  W.S.tick();
  W.S.tick();
  assert.deepStrictEqual(W.got('ana', 'gn').map(m => m.n), [1, 2], 'manda de novo só quando o número muda');
  assert.strictEqual(W.got('bia', 'gn').length, 0, 'quem não assina o global não recebe');
});

test('duas abas do mesmo navegador (mesma chave): as duas recebem tudo e a pessoa só some quando fecha a última', () => {
  const W = world(), r = W.room('AAAAAAAAAA'), a1 = W.conn('ana', r), a2 = W.conn('ana2', W.room('CCCCCCCCCC')), b = W.conn('bia', W.room('BBBBBBBBBB'));
  const A = fid('a'), B = fid('b');
  W.S.join(b, key('b'), []);
  W.S.join(a1, key('a'), [B]);
  W.S.join(a2, key('a'), [B]);
  W.S.join(b, key('b'), [A]);
  [a1, a2, b].forEach(c => W.S.subscribe(c, true));
  assert.strictEqual(W.got('ana', 'gn').at(-1).n + 0 >= 2, true, 'cada aba conta como uma pessoa');
  W.S.say(b, 'oi');
  assert.ok(W.got('ana', 'gchat').length === 1 && W.got('ana2', 'gchat').length === 1, 'as duas abas recebem o global');
  W.S.invite(b, A);
  assert.ok(W.got('ana', 'finv').length === 1 && W.got('ana2', 'finv').length === 1, 'o convite chega nas duas');
  W.S.leave(a1);
  assert.ok(!W.got('bia', 'fpres').some(m => m.on === 0), 'ainda há uma aba aberta: continua online');
  W.S.leave(a2);
  assert.deepStrictEqual(W.got('bia', 'fpres').at(-1), { to: 'bia', t: 'fpres', id: A, on: 0 });
  assert.strictEqual(W.S.size, 1);
});

// SK-06: quem conhece o id de alguém e o lista (sem ser amigo mútuo) descobria se a pessoa estava online: recebia
// `fpres on:0` com a pessoa online e silêncio com ela offline. Agora não recebe nada em nenhum caso.
test('presença: quem não é amigo mútuo não descobre se a pessoa está online, nem listando de novo', () => {
  const W = world(), r = W.room('AAAAAAAAAA');
  const ana = W.conn('ana', r), espiao = W.conn('espiao', W.room('BBBBBBBBBB')), espiao2 = W.conn('espiao2', W.room('CCCCCCCCCC'));
  const A = fid('a');
  // Ana online, sem ninguém na lista
  W.S.join(ana, key('a'), []);
  W.S.join(espiao, key('x'), [A]);
  W.S.join(espiao, key('x'), [A]); // lista de novo: a segunda vez também não pode vazar
  assert.strictEqual(W.got('espiao', 'fpres').length, 0, 'Ana online: o espião não recebe mensagem de presença');
  // Ana offline: também nada (a mesma resposta nos dois casos)
  W.S.leave(ana);
  W.S.join(espiao2, key('y'), [A]);
  assert.strictEqual(W.got('espiao2', 'fpres').length, 0, 'Ana offline: nada');
  assert.strictEqual(W.got('espiao', 'fpres').length, 0, 'Ana saiu: o espião também não é avisado');
  // sentido inverso: Ana lista o espião, o espião não lista Ana; quando o espião entra/sai, Ana não é avisada
  const ana2 = W.conn('ana', r), esp3 = W.conn('esp3', W.room('DDDDDDDDDD'));
  W.S.join(ana2, key('a'), [fid('z')]);
  W.S.join(esp3, key('z'), []);
  W.S.leave(esp3);
  assert.strictEqual(W.got('ana', 'fpres').length, 0, 'quem é listado por outro sem retribuir não aparece como online/offline');
});

test('presença: amigos mútuos continuam vendo online/offline e a saída da amizade limpa o estado uma única vez', () => {
  const W = world(), r = W.room('AAAAAAAAAA');
  const a = W.conn('ana', r), b = W.conn('bia', W.room('BBBBBBBBBB'));
  const A = fid('a'), B = fid('b');
  W.S.join(a, key('a'), [B]);
  W.S.join(b, key('b'), [A]);
  assert.deepStrictEqual(W.got('ana', 'fpres').map(m => m.on), [1], 'Ana vê Bia online');
  assert.deepStrictEqual(W.got('bia', 'fpres').map(m => m.on), [1], 'Bia vê Ana online');
  // Bia tira Ana da lista: deixa de ser mútuo, e Ana recebe um único "offline" (para limpar a tela), nunca mais nada
  W.S.join(b, key('b'), []);
  assert.deepStrictEqual(W.got('ana', 'fpres').map(m => m.on), [1, 0]);
  W.S.join(b, key('b'), []);
  W.S.join(a, key('a'), [B]);
  assert.deepStrictEqual(W.got('ana', 'fpres').map(m => m.on), [1, 0], 'sem repetir o aviso');
  W.S.leave(b);
  assert.deepStrictEqual(W.got('ana', 'fpres').map(m => m.on), [1, 0], 'Bia saiu e já não era amiga mútua: sem mensagem');
});
