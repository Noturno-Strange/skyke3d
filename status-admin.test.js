'use strict';
// Painel /status: moderação por IP, métricas de desempenho e segurança da página.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./harness.js');

const TOKEN = 'token-de-teste-1234567890';
const ADMIN = '192.0.2.50';
const auth = (ip = ADMIN) => ({ authorization: 'Bearer ' + TOKEN, 'x-forwarded-for': ip });
const post = (srv, p, body, headers = auth()) => H.request(srv.port, p, { method: 'POST', headers, body });
const players = srv => H.request(srv.port, '/status/players.json', { headers: auth() });

// ---------- a página (sem servidor) ----------
const page = fs.readFileSync(path.join(__dirname, 'status.html'), 'utf8');
const script = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

test('status.html: o script compila e todo id usado existe', () => {
  assert.strictEqual(script.length, 1);
  assert.doesNotThrow(() => new vm.Script(script[0], { filename: 'status-inline' }));
  const ids = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const used = new Set([...script[0].matchAll(/\$\(["']([A-Za-z][\w-]*)["']\)/g)].map(m => m[1]));
  assert.deepStrictEqual([...used].filter(i => !ids.has(i)), []);
  const all = [...page.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(all.filter((id, i) => all.indexOf(id) !== i), [], 'ids duplicados');
});

test('status.html: nomes de jogadores só entram como texto (sem innerHTML)', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(script[0]));
  assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(page.replace(/<script>[\s\S]*?<\/script>/g, '')), 'sem handlers inline');
});

test('status.html: tem o menu de moderação, as durações e os cartões de desempenho', () => {
  for (const id of ['mod', 'mdur', 'mpl', 'mform', 'mip', 'mban', 'mbn', 'mmsg', 'tick', 'lag', 'mps', 'buf'])
    assert.ok(page.includes('id="' + id + '"'), id);
  const mins = [...page.matchAll(/<option value="(\d+)"(?: selected)?>/g)].map(m => +m[1]).filter(n => n >= 10);
  assert.deepStrictEqual(mins, [10, 60, 360, 1440, 10080, 43200]);
  assert.ok(script[0].includes('confirm('), 'pede confirmação antes de banir');
});

test('servidor: sem timer por conexão e janela de mensagens renovada sob demanda', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.ok(!/setInterval\(\(\)=>\{n=0;sigN=0\}/.test(src), 'timer por conexão removido');
  assert.ok(!/clearInterval\(iv\)/.test(src));
  assert.ok(src.includes('if(sec!==winSec){winSec=sec;n=0;sigN=0}'));
});

// ---------- servidor ----------
test('status: sem token ou com token errado nada é entregue', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const anon = { 'x-forwarded-for': '192.0.2.77' };
  assert.strictEqual((await H.request(srv.port, '/status/players.json', { headers: anon })).status, 401);
  assert.strictEqual((await post(srv, '/status/ban', { ip: '203.0.113.1', minutes: 10 }, anon)).status, 401);
  assert.strictEqual((await H.request(srv.port, '/status/ban', { headers: auth() })).status, 405, 'GET não bane');
  const off = await H.startServer({});
  t.after(() => off.stop());
  assert.strictEqual((await H.request(off.port, '/status/players.json')).status, 404, 'sem STATUS_TOKEN o painel não existe');
  assert.strictEqual((await post(off, '/status/ban', { ip: '203.0.113.1', minutes: 10 }, {})).status, 404);
});

test('moderação: lista, bane, encerra conexões, bloqueia e desbane', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const BAD = '203.0.113.9', OTHER = '198.51.100.20';

  const ana = await H.connect(srv.port, BAD);
  ana.ws.send(JSON.stringify({ t: 'create', style: 'aeris', bots: 0, name: 'Ana' }));
  assert.ok(await H.until(() => ana.msgs.some(m => m.t === 'joined')));
  const code = ana.msgs.find(m => m.t === 'joined').code;
  const beto = await H.connect(srv.port, BAD);
  beto.ws.send(JSON.stringify({ t: 'join', code, name: 'Beto' }));
  const caio = await H.connect(srv.port, OTHER);
  caio.ws.send(JSON.stringify({ t: 'join', code, name: 'Caio' }));
  assert.ok(await H.until(() => beto.msgs.some(m => m.t === 'joined') && caio.msgs.some(m => m.t === 'joined')));

  // lista de jogadores agrupada por IP, sem expor o código da sala
  const l1 = await players(srv);
  assert.strictEqual(l1.status, 200);
  assert.strictEqual(l1.headers['cache-control'], 'no-store');
  assert.ok(!l1.body.toString().includes(code), 'o código de entrada não aparece');
  const g = l1.json.ips.find(x => x.ip === BAD);
  assert.deepStrictEqual(g.players.map(p => p.name).sort(), ['Ana', 'Beto']);
  assert.match(g.players[0].room, /^[0-9a-f]{4}$/);
  assert.strictEqual(g.players[0].style, 'aeris');
  assert.strictEqual(g.players[0].online, true);
  assert.strictEqual(l1.json.ips.find(x => x.ip === OTHER).players.length, 1);
  assert.strictEqual(l1.json.ban.on, true);

  // validações
  assert.strictEqual((await post(srv, '/status/ban', { ip: ADMIN, minutes: 10 })).status, 409, 'não bane o próprio IP');
  assert.strictEqual((await post(srv, '/status/ban', { ip: '127.0.0.1', minutes: 10 })).status, 409, 'não bane proxy confiável');
  assert.strictEqual((await post(srv, '/status/ban', { ip: 'abc', minutes: 10 })).status, 400);
  assert.strictEqual((await post(srv, '/status/ban', { ip: BAD, minutes: 0 })).status, 400);
  assert.strictEqual((await post(srv, '/status/ban', { ip: BAD, minutes: 99999 })).status, 400);
  assert.strictEqual((await post(srv, '/status/ban', { ip: BAD, minutes: '10' })).status, 400);
  assert.strictEqual((await post(srv, '/status/ban', [1])).status, 400);
  assert.strictEqual((await post(srv, '/status/ban', '{quebrado')).status, 400);
  assert.strictEqual((await post(srv, '/status/ban', 'x'.repeat(3000))).status, 413);
  assert.strictEqual((await post(srv, '/status/ban', { ip: BAD, minutes: 10 }, { ...auth(), 'content-type': 'text/plain' })).status, 415);
  assert.strictEqual((await players(srv)).json.ips.find(x => x.ip === BAD).players.length, 2, 'nada foi banido ainda');

  // banir
  const ban = await post(srv, '/status/ban', { ip: BAD, minutes: 10 });
  assert.strictEqual(ban.status, 200, JSON.stringify(ban.json));
  assert.deepStrictEqual({ ip: ban.json.ip, minutes: ban.json.minutes, removidos: ban.json.removidos }, { ip: BAD, minutes: 10, removidos: 2 });
  assert.strictEqual(await ana.closed, 1008);
  assert.strictEqual(await beto.closed, 1008);
  assert.ok(ana.msgs.some(m => m.t === 'sys' && /administrador/.test(m.text)), 'avisa quem foi removido');
  assert.strictEqual(caio.ws.readyState, 1, 'outros IPs seguem conectados');

  // a nova entrada do IP banido é recusada, a dos demais não
  await assert.rejects(() => H.connect(srv.port, BAD), { status: 429 });
  assert.strictEqual((await H.request(srv.port, '/', { headers: { 'x-forwarded-for': BAD } })).status, 429);
  const outro = await H.connect(srv.port, '198.51.100.21');
  outro.ws.close();

  // banimentos ativos
  let l2;
  for (let i = 0; i < 40; i++) { l2 = (await players(srv)).json; if (!l2.ips.some(x => x.ip === BAD)) break; await H.wait(50); }
  assert.ok(!l2.ips.some(x => x.ip === BAD), 'jogadores banidos saíram da lista');
  assert.strictEqual(l2.bans.length, 1);
  assert.strictEqual(l2.bans[0].label, BAD);
  assert.ok(l2.bans[0].left > 590000 && l2.bans[0].left <= 600000);
  assert.match(l2.bans[0].id, /^[A-Za-z0-9_-]{12}$/);

  // desbanir
  assert.strictEqual((await post(srv, '/status/unban', { id: 'naoexiste12' })).status, 404);
  assert.strictEqual((await post(srv, '/status/unban', { id: l2.bans[0].id })).status, 200);
  assert.strictEqual((await players(srv)).json.bans.length, 0);
  const back = await H.connect(srv.port, BAD);
  back.ws.close();
  caio.ws.close();
});

test('moderação: IPv6 vale para o bloco /64 e o desbanir aceita o IP digitado', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const ban = await post(srv, '/status/ban', { ip: '2001:db8:1:2:aaaa:bbbb:cccc:dddd', minutes: 60 });
  assert.strictEqual(ban.status, 200);
  assert.strictEqual(ban.json.ip, '2001:db8:1:2::/64');
  await assert.rejects(() => H.connect(srv.port, '2001:db8:1:2:9:9:9:9'), { status: 429 });
  const ok = await H.connect(srv.port, '2001:db8:1:3::1');
  ok.ws.close();
  assert.strictEqual((await post(srv, '/status/unban', { ip: '2001:db8:1:2::/64' })).status, 200);
  const back = await H.connect(srv.port, '2001:db8:1:2:9:9:9:9');
  back.ws.close();
});

test('moderação: com BAN=0 as ações são recusadas e o painel avisa', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN, BAN: '0' });
  t.after(() => srv.stop());
  assert.strictEqual((await players(srv)).json.ban.on, false);
  assert.strictEqual((await post(srv, '/status/ban', { ip: '203.0.113.1', minutes: 10 })).status, 409);
  assert.strictEqual((await post(srv, '/status/unban', { id: 'abcdefabcdef' })).status, 409);
});

test('métricas: /status.json traz tick, atraso do loop, mensagens e buffer', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const a = await H.connect(srv.port, '203.0.113.30');
  a.ws.send(JSON.stringify({ t: 'create', style: 'aeris', bots: 3, name: 'Ana' }));
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')));
  for (let i = 0; i < 5; i++) { a.ws.send(JSON.stringify({ t: 'move', x: i, z: 2, ry: 0, y: 0, s: 0 })); await H.wait(40); }
  await H.wait(1300);
  const r = await H.request(srv.port, '/status.json', { headers: auth() });
  assert.strictEqual(r.status, 200);
  const p = r.json.perf;
  assert.ok(p, 'perf presente');
  assert.strictEqual(p.tick.budget, 100);
  for (const v of [p.tick.avg, p.tick.max, p.tick.last, p.loop.p50, p.loop.p99, p.loop.max, p.msgs.inPerSec, p.msgs.outPerSec, p.msgs.bytesOutPerSec, p.buffer.max])
    assert.ok(Number.isFinite(v) && v >= 0, 'número finito: ' + v);
  assert.ok(p.tick.avg < 50, 'tick saudável: ' + p.tick.avg);
  assert.ok(p.tick.max >= p.tick.avg);
  assert.ok(p.msgs.inTotal >= 6, 'contou as mensagens recebidas: ' + p.msgs.inTotal);
  assert.ok(p.msgs.outTotal >= 1, 'contou as mensagens enviadas');
  assert.ok(p.msgs.bytesOutPerSec >= 0 && p.buffer.terminated === 0);
  assert.ok(r.json.rooms === 1 && r.json.bots === 3, 'o resto do painel segue igual');
  a.ws.close();
});
