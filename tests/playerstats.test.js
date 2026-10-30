'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { createPlayerStats } = require('../playerstats');
const REC = require('../assets/recovery.js');
const H = require('../harness.js');

const DAY = 86400000, T0 = Date.parse('2026-10-30T12:00:00Z');
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-ps-')), 'p.json');
const code = s => REC.viewCode(s);
const run = o => ({ ok: true, nights: 4, target: 4, sec: 960, players: 3, world: 'acampamento', meals: 5, faints: 1, revives: 2, ...o });

test('código de visualização: 16 caracteres, estável e diferente por segredo', () => {
  assert.match(code('a'.repeat(43)), /^[0-9A-HJKMNP-TV-Z]{16}$/);
  assert.strictEqual(code('x'), code('x')); assert.notStrictEqual(code('x'), code('y'));
  assert.ok(!code('x').includes('x'.repeat(4)));
});

test('só existe página para quem criou; registra rodadas e totais; sem criar, nada é guardado', () => {
  const P = createPlayerStats({ now: () => T0 }), c = code('s1');
  assert.strictEqual(P.record(c, 'Ana', run()), false, 'sem página criada não guarda nada');
  assert.strictEqual(P.get(c), null);
  assert.strictEqual(P.register(c, '  Ana <b>  '), true);
  assert.strictEqual(P.record(c, 'Ana', run()), true); P.record(c, 'Ana', run({ ok: false, nights: 2 }));
  const d = P.get(c);
  assert.deepStrictEqual([d.name, d.runs, d.wins, d.best, d.meals, d.faints, d.revives], ['Ana b', 2, 1, 4, 10, 2, 4].map((v, i) => i === 0 ? d.name : v));
  assert.ok(!/[<>]/.test(d.name)); assert.strictEqual(d.last.length, 2); assert.strictEqual(d.last[0].ok, 0, 'mais nova primeiro');
});

test('código inválido, limite de páginas, só 10 rodadas guardadas', () => {
  const P = createPlayerStats({ now: () => T0, max: 2 });
  assert.strictEqual(P.register('curto', 'x'), false); assert.strictEqual(P.get('../../etc'), null);
  assert.ok(P.register(code('a'), 'A')); assert.ok(P.register(code('b'), 'B')); assert.strictEqual(P.register(code('c'), 'C'), false);
  assert.ok(P.register(code('a'), 'A2'), 'atualizar a própria página sempre pode');
  for (let i = 0; i < 15; i++) P.record(code('a'), 'A', run());
  assert.strictEqual(P.get(code('a')).last.length, 10); assert.strictEqual(P.get(code('a')).runs, 15);
});

test('apagar, trocar de link (histórico vai junto) e expirar por inatividade', () => {
  let t = T0; const P = createPlayerStats({ now: () => t, ttlMs: 30 * DAY }), a = code('a'), b = code('b');
  P.register(a, 'Ana'); P.record(a, 'Ana', run());
  assert.strictEqual(P.move(a, b), true); assert.strictEqual(P.get(a), null); assert.strictEqual(P.get(b).runs, 1);
  assert.strictEqual(P.move(b, b), false); assert.strictEqual(P.move(code('z'), code('y')), false);
  assert.strictEqual(P.remove(b), true); assert.strictEqual(P.remove(b), false);
  P.register(a, 'Ana'); t += 31 * DAY; assert.strictEqual(P.prune(), 1); assert.strictEqual(P.has(a), false);
});

test('grava, recarrega, descarta o vencido e o lixo; arquivo inválido começa do zero', () => {
  const f = tmp(); let t = T0; const A = createPlayerStats({ file: f, now: () => t, delayMs: 10, ttlMs: 30 * DAY });
  A.register(code('a'), 'Ana'); A.record(code('a'), 'Ana', run()); A.write();
  assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
  const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.players.lixo = { name: 'x' }; j.players[code('old')] = { name: 'Velho', at: 1, last: [] }; fs.writeFileSync(f, JSON.stringify(j));
  const B = createPlayerStats({ file: f, now: () => t, ttlMs: 30 * DAY });
  assert.strictEqual(B.size, 1); assert.strictEqual(B.get(code('a')).runs, 1);
  fs.writeFileSync(f, '{x'); const w = []; assert.strictEqual(createPlayerStats({ file: f, warn: m => w.push(m) }).size, 0); assert.strictEqual(w.length, 1);
});

const post = (srv, p, body) => H.request(srv.port, p, { method: 'POST', body });
const secret = n => Buffer.alloc(32, n).toString('base64url');

test('rotas: criar, ver pelo link, trocar e apagar; link errado ou apagado dá a mesma resposta', { skip: H.missing() }, async t => {
  const srv = await H.startServer({}); t.after(() => srv.stop());
  const k = secret(1), vc = REC.viewCode(k), link = vc.match(/.{4}/g).join('-');
  assert.strictEqual((await H.request(srv.port, '/jogador/' + link + '.json')).status, 404, 'antes de criar não existe');
  assert.strictEqual((await post(srv, '/jogador/criar', { k, name: 'Ana' })).status, 200);
  const j = await H.request(srv.port, '/jogador/' + link + '.json');
  assert.strictEqual(j.status, 200); assert.strictEqual(JSON.parse(j.body.toString()).name, 'Ana');
  assert.match(j.headers['cache-control'], /no-store/); assert.match(j.headers['x-robots-tag'], /noindex/); assert.strictEqual(j.headers['referrer-policy'], 'no-referrer');
  const sem = await H.request(srv.port, '/jogador/' + vc.toLowerCase() + '.json'); assert.strictEqual(sem.status, 200, 'traços e caixa não importam');
  const pg = await H.request(srv.port, '/jogador/' + link); assert.strictEqual(pg.status, 200); assert.match(pg.headers['content-security-policy'], /script-src[^;]*'sha384-/);
  const errado = await H.request(srv.port, '/jogador/AAAAAAAAAAAAAAAA.json'), curto = await H.request(srv.port, '/jogador/abc.json');
  assert.strictEqual(errado.status, 404); assert.strictEqual(errado.body.toString(), JSON.stringify({ erro: 'não encontrada' }));
  assert.strictEqual(curto.status, 404);
  assert.strictEqual((await post(srv, '/jogador/criar', { k: 'curto' })).status, 400);
  assert.strictEqual((await post(srv, '/jogador/criar', { name: 'x' })).status, 400);
  const k2 = secret(2); assert.strictEqual((await post(srv, '/jogador/trocar', { k, n: k2 })).status, 200);
  assert.strictEqual((await H.request(srv.port, '/jogador/' + link + '.json')).status, 404, 'o link antigo deixou de funcionar');
  assert.strictEqual((await H.request(srv.port, '/jogador/' + REC.viewCode(k2) + '.json')).status, 200);
  assert.strictEqual((await post(srv, '/jogador/apagar', { k: k2 })).status, 200);
  assert.strictEqual((await H.request(srv.port, '/jogador/' + REC.viewCode(k2) + '.json')).status, 404);
  assert.strictEqual((await H.request(srv.port, '/jogador/' + link + '.json', { method: 'POST', body: {} })).status, 405);
});

test('uma rodada de verdade entra na página de quem criou e só nela', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ SURVIVAL_SPEED: '60' }); t.after(() => srv.stop());
  const ka = secret(5), kb = secret(6), kc = secret(7);
  for (const [k, n] of [[ka, 'Ana'], [kb, 'Beto']]) assert.strictEqual((await post(srv, '/jogador/criar', { k, name: n })).status, 200);
  const open = async (ip, m) => { const c = await H.connect(srv.port, ip); c.ws.send(JSON.stringify({ cfg: {}, ...m })); assert.ok(await H.until(() => c.msgs.some(x => x.t === 'joined'), 4000)); return c; };
  const a = await open('203.0.113.201', { t: 'create', surv: true, name: 'Ana' }); t.after(() => a.ws.close());
  const b = await open('203.0.113.202', { t: 'join', code: a.msgs.find(m => m.t === 'joined').code, name: 'Beto' }); t.after(() => b.ws.close());
  const c = await open('203.0.113.203', { t: 'join', code: a.msgs.find(m => m.t === 'joined').code, name: 'Cris' }); t.after(() => c.ws.close());
  a.ws.send(JSON.stringify({ t: 'pst', k: ka })); b.ws.send(JSON.stringify({ t: 'pst', k: kb }));
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'pstok') && b.msgs.some(m => m.t === 'pstok'), 3000));
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'svend'), 20000), 'a rodada acabou (todos desmaiaram)');
  const vista = async k => JSON.parse((await H.request(srv.port, '/jogador/' + REC.viewCode(k) + '.json')).body.toString());
  await H.wait(300);
  const da = await vista(ka), db = await vista(kb);
  assert.strictEqual(da.runs, 1); assert.strictEqual(db.runs, 1); assert.strictEqual(da.name, 'Ana'); assert.strictEqual(da.faints, 1); assert.strictEqual(da.last.length, 1);
  assert.strictEqual((await H.request(srv.port, '/jogador/' + REC.viewCode(kc) + '.json')).status, 404, 'quem não criou página não aparece');
  const pub = await H.request(srv.port, '/estatisticas.json'); const txt = pub.body.toString();
  for (const x of ['Ana', 'Beto', 'Cris', REC.viewCode(ka)]) assert.ok(!txt.includes(x), 'a página pública nunca mostra ' + x);
  assert.strictEqual(a.msgs.find(m => m.t === 'svend').per, undefined, 'o resumo enviado à sala não traz dados por jogador');
});
