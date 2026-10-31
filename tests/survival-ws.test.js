'use strict';
// Modo Sobrevivência de ponta a ponta: sala própria, mapa por semente igual para todos, ações validadas no servidor, sem vídeo/rádio/karaokê.
const test = require('node:test');
const assert = require('node:assert');
const H = require('../harness.js');
const M = require('../assets/survmap.js');
const { SURV: S } = require('../assets/catalog.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const last = (c, t) => c.msgs.filter(m => m.t === t).pop();
const collect = async (c, i, res) => { for (let k = 0; k < 6; k++) { send(c, { t: 'sv', a: 'collect', i }); if (await H.until(() => (last(c, 'svm') || {}).inv && last(c, 'svm').inv[res] >= 1, 700)) return true; } return false; };
const open = async (srv, ip, m) => { const c = await H.connect(srv.port, ip); send(c, { name: 'Ana', ...m }); assert.ok(await H.until(() => c.msgs.some(x => x.t === 'joined'), 4000), 'entrou'); return c; };

test('sobrevivência: sala própria com semente, mapa igual nos dois lados, estado e medidores pelo servidor', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const a = await open(srv, '203.0.113.170', { t: 'create', surv: true, bots: 5 }); t.after(() => a.ws.close());
  const j = a.msgs.find(m => m.t === 'joined');
  assert.strictEqual(j.style, 'acampamento');
  assert.ok(Number.isInteger(j.sv.seed)); assert.strictEqual(j.sv.nights, undefined, 'sem número de noites: a rodada não tem fim marcado');
  assert.strictEqual(j.sv.pub.t, 'svs'); assert.strictEqual(j.sv.pub.fire, S.fire.start); assert.strictEqual(j.sv.pub.lv, 1);
  assert.strictEqual(j.want, 0, 'sem bots no modo');
  assert.ok(await H.until(() => last(a, 'svm'), 3000), 'recebe o próprio estado');
  const m0 = last(a, 'svm'); assert.strictEqual(m0.m.fome, S.meters.fome.start); assert.deepStrictEqual(m0.inv, {});
  const b = await open(srv, '203.0.113.171', { t: 'join', code: j.code, name: 'Beto' }); t.after(() => b.ws.close());
  assert.strictEqual(b.msgs.find(m => m.t === 'joined').sv.seed, j.sv.seed, 'mesma semente para todos da sala');
  assert.ok(await H.until(() => last(a, 'svs') && last(a, 'svs').pl.length === 2, 3000), 'estado público lista os dois');
});

test('sobrevivência: coleta só perto do ponto (o servidor confere), recurso some e a mochila enche', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const a = await open(srv, '203.0.113.172', { t: 'create', surv: true }); t.after(() => a.ws.close());
  const j = a.msgs.find(m => m.t === 'joined'), map = M.generate(j.sv.seed);
  send(a, { t: 'sv', a: 'collect', i: 0 });
  assert.ok(await H.until(() => last(a, 'sverr'), 2000)); assert.strictEqual(last(a, 'sverr').e, 'longe');
  const n = map.nodes.findIndex(x => x.res === 'lenha'), p = map.nodes[n];
  send(a, { t: 'move', x: p.x, z: p.z, ry: 0, y: 0, s: 0 });
  assert.ok(await collect(a, n, 'lenha'), 'lenha na mochila');
  assert.ok(await H.until(() => last(a, 'svs') && last(a, 'svs').nx.includes(n), 3000), 'ponto marcado como indisponível');
  send(a, { t: 'sv', a: 'collect', i: n });
  assert.ok(await H.until(() => a.msgs.filter(m => m.t === 'sverr').some(m => m.e === 'vazio'), 2000));
});

test('sobrevivência: entradas inválidas são recusadas; fora do modo as ações não fazem nada; sem vídeo/rádio/karaokê', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const a = await open(srv, '203.0.113.173', { t: 'create', surv: true }); t.after(() => a.ws.close());
  for (const bad of [{ a: 'eat', res: '__proto__' }, { a: 'collect', i: -1 }, { a: 'collect', i: 999 }, { a: 'cook', rid: 'x' }, { a: 'rev', to: '../x' }, { a: 'x' }]) send(a, { t: 'sv', ...bad });
  send(a, { t: 'video', vid: 'dQw4w9WgXcQ' });
  await H.wait(500);
  assert.ok(a.ws.readyState === 1, 'continua conectado (ação de interface não derruba)');
  assert.strictEqual(a.msgs.some(m => m.t === 'vinv'), false, 'vídeo bloqueado no modo');
  const n = await open(srv, '203.0.113.174', { t: 'create', style: 'proxima' }); t.after(() => n.ws.close());
  assert.strictEqual(n.msgs.find(m => m.t === 'joined').sv, undefined);
  send(n, { t: 'sv', a: 'again' }); await H.wait(300);
  assert.strictEqual(n.msgs.some(m => m.t === 'svs' || m.t === 'sverr' || m.t === 'svnew'), false, 'sala normal ignora o modo');
  const c = await H.connect(srv.port, '203.0.113.175'); t.after(() => c.ws.close());
  send(c, { t: 'create', style: 'acampamento', name: 'Cris', cfg: {} });
  await H.wait(600);
  assert.strictEqual(c.msgs.some(m => m.t === 'joined'), false, 'o mapa do modo não nasce sem o modo');
});

test('sobrevivência: raio andável de 28 m só no modo; sala normal continua em 10,2 m', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const a = await open(srv, '203.0.113.176', { t: 'create', surv: true }); t.after(() => a.ws.close());
  const n = await open(srv, '203.0.113.177', { t: 'create', style: 'proxima' }); t.after(() => n.ws.close());
  const viewer = await open(srv, '203.0.113.178', { t: 'join', code: n.msgs.find(m => m.t === 'joined').code }); t.after(() => viewer.ws.close());
  send(n, { t: 'move', x: 50, z: 0, ry: 0, y: 0, s: 0 });
  await H.wait(700);
  const bin = viewer.msgs.filter(m => m.t === 'st' && m.bin).map(m => m.bin).pop();
  assert.ok(bin, 'recebeu posições da sala normal');
  const idN = n.msgs.find(m => m.t === 'joined').id, num = Number(idN.slice(1));
  let x = null; for (let o = 1; o + 12 <= bin.length; o += 12) if ((bin.readUInt32LE(o) & 0x7fffffff) === num) x = bin.readInt16LE(o + 4) / 100;
  assert.ok(x !== null && x <= 10.3, 'sala normal recortada em 10,2 m: ' + x);
});

test('sobrevivência: compartilhar item da mochila com outro jogador da sala (evento para todos, nada se perde)', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const a = await open(srv, '203.0.113.180', { t: 'create', surv: true, name: 'Ana' }); t.after(() => a.ws.close());
  const j = a.msgs.find(m => m.t === 'joined'), map = M.generate(j.sv.seed);
  const b = await open(srv, '203.0.113.181', { t: 'join', code: j.code, name: 'Beto' }); t.after(() => b.ws.close());
  const idB = b.msgs.find(m => m.t === 'joined').id;
  const n = map.nodes.findIndex(x => x.res === 'lenha'), p = map.nodes[n];
  send(a, { t: 'move', x: p.x, z: p.z, ry: 0, y: 0, s: 0 });
  assert.ok(await collect(a, n, 'lenha'));
  send(a, { t: 'sv', a: 'give', to: idB, res: 'lenha', n: 1 });
  assert.ok(await H.until(() => (last(b, 'svm') || {}).inv && last(b, 'svm').inv.lenha === 1, 3000), 'Beto recebeu');
  assert.ok(await H.until(() => (last(a, 'svm') || {}).inv && !last(a, 'svm').inv.lenha, 3000), 'Ana ficou sem');
  assert.ok(a.msgs.concat(b.msgs).some(m => m.t === 'sve' && m.e.some(e => e.t === 'gave' && e.to === idB && e.res === 'lenha')), 'a sala é avisada');
  send(a, { t: 'sv', a: 'give', to: idB, res: 'lenha', n: 1 });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'sverr' && m.e === 'sem_item'), 2000), 'sem item não dá');
});

test('sobrevivência: sair desmaiado fecha a sala (ninguém fica travado) e a sala vazia some', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ SURVIVAL_SPEED: '60' }); t.after(() => srv.stop());
  const a = await open(srv, '203.0.113.185', { t: 'create', surv: true, name: 'Ana' }); t.after(() => a.ws.close());
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'svend'), 20000), 'sozinho e parado, desmaia e a rodada acaba');
  const fim = a.msgs.find(m => m.t === 'svend');
  assert.ok(fim.sec >= 180 && fim.level >= 1 && fim.nights >= 1, 'o resumo traz o tempo sobrevivido'); assert.ok(fim.auto > 0, 'avisa o cliente para voltar ao início sozinho'); assert.strictEqual(fim.ok, undefined);
  const live = async () => JSON.parse((await H.request(srv.port, '/estatisticas.json')).body.toString()).live;
  assert.deepStrictEqual(await live(), { rooms: 1, players: 1 });
  send(a, { t: 'leave' });
  await H.wait(800);
  assert.deepStrictEqual(await live(), { rooms: 0, players: 0 }, 'a sala foi fechada');
  const b = await H.connect(srv.port, '203.0.113.186'); t.after(() => b.ws.close());
  send(b, { t: 'create', surv: true, name: 'Beto', cfg: {} });
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'joined'), 4000), 'dá para criar outra sala logo depois');
});

// ---- verificação de presença humana (HC_FIRST=2 antecipa o primeiro desafio; SURVIVAL_SPEED=60 encurta a rodada)
const HC = require('../humancheck.js'), REC = require('../assets/recovery.js');
const resolver = ch => {
  if (ch.kind === 'soma') { const [, a, op, b] = ch.q.match(/^(\d+) ([+×]) (\d+)/); return String(op === '+' ? +a + +b : a * b); }
  if (ch.kind === 'maior') return String(Math.max(...ch.opts.map(Number)));
  const nome = ch.q.replace('Toque na figura: ', ''); return HC.FIGURAS.find(f => f[1] === nome)[0];
};
const post = (srv, p, body) => H.request(srv.port, p, { method: 'POST', body });
const segredo = n => Buffer.alloc(32, n).toString('base64url');

test('verificação: quem passa tem a rodada no perfil; quem ignora o desafio fica de fora do perfil e é avisado; o jogo segue igual', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ SURVIVAL_SPEED: '60', HC_FIRST: '2', HC_JITTER: '0' }); t.after(() => srv.stop());
  const ka = segredo(21), kb = segredo(22);
  await post(srv, '/jogador/criar', { k: ka, name: 'Ana' }); await post(srv, '/jogador/criar', { k: kb, name: 'Beto' });
  const a = await open(srv, '203.0.113.210', { t: 'create', surv: true, name: 'Ana' }); t.after(() => a.ws.close());
  const b = await open(srv, '203.0.113.211', { t: 'join', code: a.msgs.find(m => m.t === 'joined').code, name: 'Beto' }); t.after(() => b.ws.close());
  send(a, { t: 'pst', k: ka }); send(b, { t: 'pst', k: kb });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'svc') && b.msgs.some(m => m.t === 'svc'), 5000), 'os dois recebem o desafio');
  const ch = a.msgs.find(m => m.t === 'svc');
  assert.ok(!('ans' in ch) && ch.opts.length >= 3 && ch.sec > 0, 'sem a resposta no desafio');
  await H.wait(900); // uma pessoa leva mais que 0,7 s para ler
  send(a, { t: 'sv', a: 'chk', id: ch.id, v: 'errada' });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'svcr' && !m.ok && !m.done && m.why === 'errada'), 3000), 'resposta errada: tenta de novo');
  await H.wait(100); send(a, { t: 'sv', a: 'chk', id: ch.id, v: resolver(ch) });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'svcr' && m.ok), 3000), 'Ana passou');
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'svend'), 25000), 'a rodada acabou');
  await H.wait(400);
  const vista = async k => JSON.parse((await H.request(srv.port, '/jogador/' + REC.viewCode(k) + '.json')).body.toString());
  assert.strictEqual((await vista(ka)).runs, 1, 'a rodada de quem passou entrou no perfil');
  assert.strictEqual((await vista(kb)).runs, 0, 'quem ignorou o desafio ficou de fora do perfil');
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'sva' && m.unv), 3000), 'Beto foi avisado');
  const pub = JSON.parse((await H.request(srv.port, '/estatisticas.json')).body.toString());
  assert.strictEqual(pub.runs, 1, 'um humano passou: a rodada conta nas estatísticas gerais');
});

test('verificação: rodada longa sem nenhum humano verificado não conta nem nos recordes; resposta fora de hora é recusada', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ SURVIVAL_SPEED: '60', HC_FIRST: '2', HC_JITTER: '0' }); t.after(() => srv.stop());
  const a = await open(srv, '203.0.113.212', { t: 'create', surv: true, name: 'Ana' }); t.after(() => a.ws.close());
  const b = await open(srv, '203.0.113.213', { t: 'join', code: a.msgs.find(m => m.t === 'joined').code, name: 'Beto' }); t.after(() => b.ws.close());
  send(a, { t: 'sv', a: 'chk', id: 1, v: '5' });
  send(a, { t: 'sv', a: 'chk', id: 'x', v: '5' }); send(a, { t: 'sv', a: 'chk', id: 1 });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'svend'), 25000), 'a rodada acabou (ninguém respondeu)');
  await H.wait(300);
  const pub = JSON.parse((await H.request(srv.port, '/estatisticas.json')).body.toString());
  assert.strictEqual(pub.runs, 0, 'sem humano verificado, a rodada longa não conta'); assert.strictEqual(pub.bestSec, 0);
  assert.ok(a.ws.readyState === 1, 'continua conectado');
});
