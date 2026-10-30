'use strict';
// Denúncias: validação, dados guardados (sem IP), chat recente, limites, painel (banir pela denúncia mesmo offline, arquivar) e aviso no Discord.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const H = require('../harness.js');

const TOKEN = 'token-de-teste-1234567890', ADMIN = '192.0.2.50';
const auth = { authorization: 'Bearer ' + TOKEN, 'x-forwarded-for': ADMIN };
const send = (c, m) => c.ws.send(JSON.stringify(m));
const got = (c, f) => c.msgs.filter(f);
const reps = srv => H.request(srv.port, '/status/reports.json', { headers: auth });

async function room(srv, t, ips, bots = 0) {
  const cl = [];
  for (let i = 0; i < ips.length; i++) {
    const c = await H.connect(srv.port, ips[i]); t.after(() => { try { c.ws.close(); } catch (e) { /* já fechada */ } }); cl.push(c);
    send(c, i === 0 ? { t: 'create', style: 'proxima', bots, name: 'R' + i } : { t: 'join', code: cl[0].msgs.find(m => m.t === 'joined').code, name: 'R' + i });
    assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined')));
  }
  return cl.map(c => ({ c, id: c.msgs.find(m => m.t === 'joined').id, j: c.msgs.find(m => m.t === 'joined') }));
}

test('denúncia: grava nomes, IDs anônimos, motivo, nota e o chat recente; o painel nunca vê IP nem a chave de banimento', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, ['203.0.113.201', '203.0.113.202']);
  send(a.c, { t: 'chat', text: 'oi gente' }); await H.wait(800);
  send(b.c, { t: 'chat', text: 'você é um lixo' }); await H.wait(800);
  send(a.c, { t: 'report', id: b.id, reason: 'assedio', note: 'me xingou\u0000 no chat' });
  assert.ok(await H.until(() => got(a.c, m => m.t === 'rep').length === 1));
  assert.deepStrictEqual(got(a.c, m => m.t === 'rep')[0], { t: 'rep', ok: 1 });
  const r = await reps(srv);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers['cache-control'], 'no-store');
  const x = r.json.reports[0];
  assert.strictEqual(x.reason, 'assedio');
  assert.strictEqual(x.note, 'me xingou no chat', 'caractere de controle removido');
  assert.strictEqual(x.target.name, 'R1');
  assert.match(x.target.host, /^[A-Za-z0-9_-]{12}$/);
  assert.notStrictEqual(x.target.host, x.by.host);
  assert.deepStrictEqual(x.chat.map(c => [c.name, c.text, c.who]), [['R0', 'oi gente', 'autor'], ['R1', 'você é um lixo', 'alvo']]);
  const raw = r.body.toString();
  assert.ok(!/203\.0\.113\.|192\.0\.2\./.test(raw), 'sem IP');
  assert.ok(!/"tk"|"rk"/.test(raw), 'a chave de banimento não sai do servidor');
  assert.strictEqual((await H.request(srv.port, '/status/reports.json', { headers: { 'x-forwarded-for': ADMIN } })).status, 401, 'exige token');
  // repetir a mesma denúncia logo depois não duplica
  await H.wait(15500);
  send(a.c, { t: 'report', id: b.id, reason: 'spam' });
  assert.ok(await H.until(() => got(a.c, m => m.t === 'rep').length === 2));
  assert.strictEqual(got(a.c, m => m.t === 'rep')[1].dup, 1);
  assert.strictEqual((await reps(srv)).json.reports.length, 1);
});

test('denúncia: recusa a si mesmo, bot, quem não está na sala e motivo fora da lista; clique repetido não derruba', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const [a] = await room(srv, t, ['203.0.113.211'], 2);
  assert.ok(await H.until(() => a.c.msgs.some(m => m.t === 'add' && m.p && m.p.bot) || (a.j.players || []).some(p => p.bot)));
  const bot = ((a.j.players || []).find(p => p.bot) || (a.c.msgs.find(m => m.t === 'add' && m.p && m.p.bot) || {}).p);
  send(a.c, { t: 'report', id: a.id, reason: 'spam' });
  assert.ok(await H.until(() => got(a.c, m => m.t === 'rep' && /si mesmo/.test(m.err)).length === 1));
  send(a.c, { t: 'report', id: bot.id, reason: 'spam' });   // rápido demais: só avisa, não pune
  send(a.c, { t: 'report', id: 'p999999', reason: 'spam' });
  send(a.c, { t: 'report', id: 'p999999', reason: 'nada' });
  send(a.c, { t: 'report', id: 'p999999', reason: '__proto__' });
  await H.wait(600);
  assert.ok(got(a.c, m => m.t === 'rep' && /Aguarde/.test(m.err)).length >= 1, 'aviso de espera');
  assert.strictEqual(a.c.ws.readyState, 1, 'continua conectado');
  await H.wait(15200);
  const n = got(a.c, m => m.t === 'rep').length;
  send(a.c, { t: 'report', id: bot.id, reason: 'spam' });   // bots têm id "b…": o validador recusa antes de chegar à denúncia
  await H.wait(500);
  assert.strictEqual(got(a.c, m => m.t === 'rep').length, n, 'bot não pode ser denunciado');
  assert.strictEqual(a.c.ws.readyState, 1);
  assert.strictEqual((await reps(srv)).json.reports.length, 0);
});

test('painel: banir pela denúncia vale mesmo depois que o denunciado saiu; arquivar; ação inválida', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, ['203.0.113.221', '203.0.113.222']);
  send(a.c, { t: 'report', id: b.id, reason: 'odio' });
  assert.ok(await H.until(() => got(a.c, m => m.t === 'rep').length === 1));
  const id = (await reps(srv)).json.reports[0].id;
  b.c.ws.close(); await H.wait(300);
  const post = body => H.request(srv.port, '/status/report', { method: 'POST', headers: auth, body });
  assert.strictEqual((await post({ id, action: 'ban', minutes: 0 })).status, 400);
  assert.strictEqual((await post({ id, action: 'explodir' })).status, 400);
  assert.strictEqual((await post({ id: 'zzz', action: 'ban', minutes: 10 })).status, 400);
  assert.strictEqual((await post({ id: 'aaaaaaaaaaaa', action: 'ban', minutes: 10 })).status, 404);
  const r = await post({ id, action: 'ban', minutes: 60 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await reps(srv)).json.reports[0].status, 'banned');
  await assert.rejects(H.connect(srv.port, '203.0.113.222'), e => e.status === 429, 'o IP do denunciado ficou banido');
  const c = await H.connect(srv.port, '203.0.113.223'); t.after(() => c.ws.close());   // outro IP entra normalmente
  // arquivar
  const [d, e] = await room(srv, t, ['203.0.113.231', '203.0.113.232']);
  send(d.c, { t: 'report', id: e.id, reason: 'outro' });
  assert.ok(await H.until(() => got(d.c, m => m.t === 'rep').length === 1));
  const id2 = (await reps(srv)).json.reports.find(x => x.status === 'open').id;
  assert.strictEqual((await post({ id: id2, action: 'dismiss' })).status, 200);
  assert.strictEqual((await reps(srv)).json.reports.find(x => x.id === id2).status, 'dismissed');
});

test('Discord: só aceita URL de webhook do Discord; o aviso não faz menções', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN, DISCORD_REPORT_WEBHOOK: 'http://127.0.0.1:1/api/webhooks/1/x' });
  t.after(() => srv.stop());
  assert.match(srv.log(), /DISCORD_REPORT_WEBHOOK ignorado/);
  assert.strictEqual((await reps(srv)).json.webhook, false);
});

test('denúncia leva quem falou na voz e quando (sem áudio), marcando o denunciado', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, ['203.0.113.241', '203.0.113.242']);
  send(b.c, { t: 'speak', v: true }); await H.wait(700); send(b.c, { t: 'speak', v: false });
  await H.wait(200); send(a.c, { t: 'speak', v: true }); await H.wait(300); send(a.c, { t: 'speak', v: false });
  await H.wait(200); send(b.c, { t: 'speak', v: true }); await H.wait(400);   // ainda falando na hora da denúncia
  send(a.c, { t: 'report', id: b.id, reason: 'assedio' });
  assert.ok(await H.until(() => got(a.c, m => m.t === 'rep').length === 1));
  const v = (await reps(srv)).json.reports[0].voice;
  assert.deepStrictEqual(v.map(x => [x.name, x.who, x.live]), [['R1', 'alvo', 0], ['R0', 'autor', 0], ['R1', 'alvo', 1]]);
  assert.ok(v[0].to - v[0].from >= 600 && v[0].to - v[0].from < 2000, 'duração da primeira fala');
  assert.ok(v.every(x => Object.keys(x).sort().join() === 'from,live,name,to,who'), 'só nome, horários e marcação: nada de áudio, IP ou id');
});

test('silenciar: cada jogador tem uma chave (mk) estável na sala, diferente em outra sala, e o chat traz o id de quem escreveu', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, ['203.0.113.243', '203.0.113.244']);
  const mkB = (b.j.self || {}).mk;
  assert.match(mkB, /^[A-Za-z0-9_-]{12}$/);
  assert.ok(!/203\.0\.113/.test(mkB));
  const seen = (a.j.players || []).concat(a.c.msgs.filter(m => m.t === 'pj').map(m => m.p)).find(p => p && p.id === b.id);
  assert.strictEqual(seen && seen.mk, mkB, 'os outros veem a mesma chave');
  send(b.c, { t: 'chat', text: 'olá' });
  assert.ok(await H.until(() => got(a.c, m => m.t === 'chat' && m.text === 'olá').length === 1));
  assert.strictEqual(got(a.c, m => m.t === 'chat' && m.text === 'olá')[0].id, b.id);
  // reconectando pelo mesmo IP na mesma sala, a chave continua a mesma
  b.c.ws.close(); await H.wait(300);
  const b2 = await H.connect(srv.port, '203.0.113.244'); t.after(() => b2.ws.close());
  send(b2, { t: 'join', code: a.j.code, name: 'R1' });
  assert.ok(await H.until(() => b2.msgs.some(m => m.t === 'joined')));
  assert.strictEqual(b2.msgs.find(m => m.t === 'joined').self.mk, mkB);
  // em outra sala, outra chave
  const [c] = await room(srv, t, ['203.0.113.244']);
  assert.notStrictEqual(c.j.self.mk, mkB);
});
