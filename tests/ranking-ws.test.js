'use strict';
// Ranking e contas: nome limpo e único, banimento só pelo administrador, recuperação com segredo, e os motivos de recusa chegam ao jogador.
const test = require('node:test');
const assert = require('node:assert');
const H = require('../harness.js');
const REC = require('../assets/recovery.js');

const TOKEN = 'token-do-painel-com-16+';
const post = (srv, p, body, headers) => H.request(srv.port, p, { method: 'POST', body, headers });
const adm = { authorization: 'Bearer ' + TOKEN };
const seg = n => Buffer.alloc(32, n).toString('base64url');
const link = k => '/jogador/' + REC.viewCode(k) + '.json';
const vc = k => REC.viewCode(k);

test('entrada: nome com palavrão, ódio ou de equipe é recusado na sala (criar e entrar); nome comum passa', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  for (const [i, ruim] of ['Hitler', 'p0rr4', 'Admin', 'n a z i'].entries()) {
    const c = await H.connect(srv.port, '203.0.113.' + (60 + i)); t.after(() => c.ws.close());
    c.ws.send(JSON.stringify({ t: 'create', name: ruim, cfg: {} }));
    assert.ok(await H.until(() => c.msgs.some(m => m.t === 'err'), 3000), ruim + ' recusado');
    assert.match(c.msgs.find(m => m.t === 'err').msg, /nome não é permitido|Escolha um nome/, 'recusado com um aviso sobre o nome');
    assert.strictEqual(c.msgs.some(m => m.t === 'joined'), false);
  }
  const ok = await H.connect(srv.port, '203.0.113.70'); t.after(() => ok.ws.close());
  ok.ws.send(JSON.stringify({ t: 'create', name: 'Nazim', cfg: {} }));
  assert.ok(await H.until(() => ok.msgs.some(m => m.t === 'joined'), 3000), 'nome parecido mas normal entra');
});

test('ranking: nome impróprio e nome repetido são recusados com o motivo; o dono mantém o dele; sair libera o nome', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const a = seg(31), b = seg(32), c = seg(33);
  assert.strictEqual((await post(srv, '/jogador/criar', { k: a, name: 'Ana' })).status, 200);
  const ruim = await post(srv, '/jogador/criar', { k: b, name: 'Hitler' }); assert.strictEqual(ruim.status, 422); assert.strictEqual(ruim.json.erro, 'nome_improprio');
  for (const igual of ['ana', 'ÁNÃ', 'A.n.a', '4na']) { const r = await post(srv, '/jogador/criar', { k: b, name: igual }); assert.strictEqual(r.status, 409, igual); assert.strictEqual(r.json.erro, 'nome_em_uso'); }
  assert.strictEqual((await H.request(srv.port, link(b))).status, 404, 'a página recusada não existe');
  assert.strictEqual((await post(srv, '/jogador/criar', { k: a, name: 'Ana' })).status, 200, 'o dono pode registrar de novo');
  assert.strictEqual((await post(srv, '/jogador/criar', { k: b, name: 'Beto' })).status, 200);
  assert.strictEqual((await post(srv, '/jogador/apagar', { k: a })).status, 200, 'sair do ranking é uma ação explícita');
  assert.strictEqual((await post(srv, '/jogador/criar', { k: c, name: 'Ana' })).status, 200, 'o nome ficou livre');
});

test('ranking: só o administrador tira alguém (por regra violada); o banido não volta nem com outro código no mesmo nome; desbanir devolve', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN }); t.after(() => srv.stop());
  const a = seg(41), outro = seg(42);
  await post(srv, '/jogador/criar', { k: a, name: 'Fraude' });
  assert.strictEqual((await post(srv, '/status/rank-ban', { code: vc(a), why: 'x' })).status, 401, 'sem token não bane');
  assert.strictEqual((await H.request(srv.port, '/status/ranking.json')).status, 401);
  const lista = await H.request(srv.port, '/status/ranking.json', { headers: adm });
  assert.strictEqual(lista.status, 200); assert.deepStrictEqual(lista.json.players.map(p => p.name), ['Fraude']);
  assert.strictEqual((await post(srv, '/status/rank-ban', { code: 'curto', why: 'x' }, adm)).status, 400);
  assert.strictEqual((await post(srv, '/status/rank-ban', { code: vc(a).match(/.{4}/g).join('-'), why: 'nome falso' }, adm)).status, 200);
  assert.strictEqual((await H.request(srv.port, link(a))).status, 404, 'saiu do ranking');
  const re = await post(srv, '/jogador/criar', { k: a, name: 'Fraude' }); assert.strictEqual(re.status, 403); assert.strictEqual(re.json.erro, 'banido');
  assert.strictEqual((await post(srv, '/jogador/criar', { k: outro, name: 'Fraude' })).status, 422, 'o nome do banido fica bloqueado');
  assert.strictEqual((await post(srv, '/jogador/trocar', { k: a, n: outro })).status, 200, 'resposta uniforme, mas...');
  assert.strictEqual((await H.request(srv.port, link(outro))).status, 404, '...não dá para escapar do banimento trocando de link');
  const b = await H.request(srv.port, '/status/ranking.json', { headers: adm }); assert.deepStrictEqual(b.json.banned.map(x => [x.name, x.why]), [['Fraude', 'nome falso']]);
  assert.strictEqual((await post(srv, '/status/rank-unban', { code: vc(a) }, adm)).status, 200);
  assert.strictEqual((await post(srv, '/jogador/criar', { k: a, name: 'Fraude' })).status, 200, 'desbanido volta');
});

test('recuperação: o código novo leva o segredo; a página continua valendo em outro aparelho com o mesmo segredo; "esquecer" local não mexe no servidor', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const k = seg(51), look = Object.fromEntries(REC.FIELDS.map(f => [f, 0]));
  await post(srv, '/jogador/criar', { k, name: 'Ana' });
  const codigo = REC.encode({ name: 'Ana', look, gloss: 0, secret: k });
  const d = REC.decode(codigo);
  assert.strictEqual(d.secret, k, 'o segredo viaja dentro do código (só no navegador)');
  assert.strictEqual((await H.request(srv.port, '/jogador/' + REC.viewCode(d.secret) + '.json')).status, 200, 'com o segredo recuperado, a página é a mesma');
  assert.strictEqual((await H.request(srv.port, link(k))).status, 200, 'apagar dados no aparelho não tira ninguém do ranking (só limpa o navegador)');
});

test('na sala: quem entra com nome já usado no ranking é avisado e mantém o nome antigo na página', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const a = seg(61), b = seg(62);
  await post(srv, '/jogador/criar', { k: a, name: 'Ana' }); await post(srv, '/jogador/criar', { k: b, name: 'Beto' });
  const c = await H.connect(srv.port, '203.0.113.80'); t.after(() => c.ws.close());
  c.ws.send(JSON.stringify({ t: 'create', surv: true, name: 'Ana', cfg: {} }));
  assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined'), 4000));
  c.ws.send(JSON.stringify({ t: 'pst', k: b }));
  assert.ok(await H.until(() => c.msgs.some(m => m.t === 'pstno'), 3000), 'avisado');
  assert.deepStrictEqual([c.msgs.find(m => m.t === 'pstno').err, c.msgs.find(m => m.t === 'pstno').kept], ['nome_em_uso', 1]);
  assert.strictEqual((await H.request(srv.port, link(b))).json.name, 'Beto', 'a página ficou com o nome que já tinha');
  assert.ok(c.msgs.some(m => m.t === 'pstok'), 'e continua valendo para as rodadas');
});
