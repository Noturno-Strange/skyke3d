'use strict';
// Painel /status: moderação por ID de IP (o painel nunca vê o endereço), métricas e segurança da página.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const H = require('./harness.js');

const TOKEN = 'token-de-teste-1234567890';
const ADMIN = '192.0.2.50';
const auth = (ip = ADMIN) => ({ authorization: 'Bearer ' + TOKEN, 'x-forwarded-for': ip });
const post = (srv, p, body, headers = auth()) => H.request(srv.port, p, { method: 'POST', headers, body });
const players = srv => H.request(srv.port, '/status/players.json', { headers: auth() });
const ID = /^[A-Za-z0-9_-]{12}$/;

async function create(srv, xff, name) {
  const c = await H.connect(srv.port, xff);
  c.ws.send(JSON.stringify({ t: 'create', style: 'proxima', bots: 0, name }));
  assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined')), 'criou a sala de ' + name);
  return { c, code: c.msgs.find(m => m.t === 'joined').code };
}
async function enter(srv, xff, name, code) {
  const c = await H.connect(srv.port, xff);
  c.ws.send(JSON.stringify({ t: 'join', code, name }));
  assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined')), name + ' entrou');
  return c;
}
const hostOf = async (srv, name) => (await players(srv)).json.hosts.find(h => h.players.some(p => p.name === name));

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

test('status.html: moderação por ID, sem campo para digitar IP', () => {
  for (const id of ['mod', 'mdur', 'mpl', 'mbn', 'mmsg', 'tick', 'lag', 'mps', 'buf', 'msearch', 'msort', 'mcount', 'bcount', 'mmatch'])
    assert.ok(page.includes('id="' + id + '"'), id);
  assert.ok(!page.includes('id="mip"') && !page.includes('id="mform"'), 'sem entrada de IP');
  assert.ok(/ID do IP/.test(page));
  assert.ok(!/body\.ip|\{ip:|\.ip\b/.test(script[0]), 'o script não manipula IP');
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

test('servidor: nenhum IP é guardado só para o painel exibir', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.ok(!/banLabels|labelBan|parseTarget/.test(src));
});

// ---------- servidor ----------
test('status: sem token ou com token errado nada é entregue', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const anon = { 'x-forwarded-for': '192.0.2.77' };
  assert.strictEqual((await H.request(srv.port, '/status/players.json', { headers: anon })).status, 401);
  assert.strictEqual((await post(srv, '/status/ban', { id: 'abcdef123456', minutes: 10 }, anon)).status, 401);
  assert.strictEqual((await H.request(srv.port, '/status/ban', { headers: auth() })).status, 405, 'GET não bane');
  const off = await H.startServer({});
  t.after(() => off.stop());
  assert.strictEqual((await H.request(off.port, '/status/players.json')).status, 404, 'sem STATUS_TOKEN o painel não existe');
  assert.strictEqual((await post(off, '/status/ban', { id: 'abcdef123456', minutes: 10 }, {})).status, 404);
});

test('privacidade: nenhuma resposta do painel contém o IP, só o ID', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const A = '203.0.113.9', B = '2001:db8:77:5::9';
  const { c: ana, code } = await create(srv, A, 'Ana');
  const bia = await enter(srv, B, 'Bia', code);

  const list = await players(srv);
  const status = await H.request(srv.port, '/status.json', { headers: auth() });
  assert.strictEqual(list.status, 200);
  assert.strictEqual(status.status, 200);
  for (const body of [list.body.toString(), status.body.toString()]) {
    assert.ok(!body.includes(A), 'IPv4 não aparece');
    assert.ok(!body.includes('2001:db8'), 'IPv6 não aparece');
    assert.ok(!body.includes(code), 'código da sala não aparece');
  }
  const a = list.json.hosts.find(h => h.players[0].name === 'Ana');
  assert.match(a.id, ID);
  assert.ok(!('ip' in a), 'sem campo ip');
  assert.deepStrictEqual(status.json.abuse.topConns.map(x => x[0]).sort(), list.json.hosts.map(h => h.id).sort(), 'topConns usa o mesmo ID');
  // o ID leva um segredo: não é o hash simples do IP, que qualquer um refaria testando endereços
  for (const ip of [A, '2001:db8:77:5::/64'])
    for (const k of [ip, '|' + ip, 'skyke3d|' + ip])
      assert.notStrictEqual(crypto.createHash('sha256').update(k).digest('base64url').slice(0, 12), a.id);
  ana.ws.close(); bia.ws.close();
});

test('moderação: lista, bane por ID, encerra conexões, bloqueia e desbane', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const BAD = '203.0.113.9', OTHER = '198.51.100.20';

  const { c: ana, code } = await create(srv, BAD, 'Ana');
  const beto = await enter(srv, BAD, 'Beto', code);
  const caio = await enter(srv, OTHER, 'Caio', code);

  const l1 = await players(srv);
  assert.strictEqual(l1.headers['cache-control'], 'no-store');
  assert.strictEqual(l1.json.ban.on, true);
  const g = await hostOf(srv, 'Ana');
  assert.deepStrictEqual(g.players.map(p => p.name).sort(), ['Ana', 'Beto']);
  assert.match(g.players[0].room, /^[0-9a-f]{4}$/);
  assert.strictEqual(g.players[0].style, 'proxima');
  assert.strictEqual(g.players[0].online, true);
  assert.strictEqual(g.self, false);
  assert.strictEqual((await hostOf(srv, 'Caio')).players.length, 1);
  assert.notStrictEqual(g.id, (await hostOf(srv, 'Caio')).id);

  // validações
  const body = (o, h) => post(srv, '/status/ban', o, h);
  assert.strictEqual((await body({ ip: BAD, minutes: 10 })).status, 400, 'IP em claro não é aceito');
  assert.strictEqual((await body({ id: 'curto', minutes: 10 })).status, 400);
  assert.strictEqual((await body({ id: 'x'.repeat(50), minutes: 10 })).status, 400);
  assert.strictEqual((await body({ id: g.id, minutes: 0 })).status, 400);
  assert.strictEqual((await body({ id: g.id, minutes: 99999 })).status, 400);
  assert.strictEqual((await body({ id: g.id, minutes: '10' })).status, 400);
  assert.strictEqual((await body({ id: 'naoexiste123', minutes: 10 })).status, 404);
  assert.strictEqual((await body([1])).status, 400);
  assert.strictEqual((await body('{quebrado')).status, 400);
  assert.strictEqual((await body('x'.repeat(3000))).status, 413);
  assert.strictEqual((await body({ id: g.id, minutes: 10 }, { ...auth(), 'content-type': 'text/plain' })).status, 415);
  assert.strictEqual((await hostOf(srv, 'Ana')).players.length, 2, 'nada foi banido ainda');

  // banir
  const ban = await body({ id: g.id, minutes: 10 });
  assert.strictEqual(ban.status, 200, JSON.stringify(ban.json));
  assert.deepStrictEqual(ban.json, { ok: 1, id: g.id, minutes: 10, removidos: 2 });
  assert.ok(!ban.body.toString().includes(BAD));
  assert.strictEqual(await ana.closed, 1008);
  assert.strictEqual(await beto.closed, 1008);
  assert.ok(ana.msgs.some(m => m.t === 'sys' && /administrador/.test(m.text)), 'avisa quem foi removido');
  assert.strictEqual(caio.ws.readyState, 1, 'outros IPs seguem conectados');

  // a nova entrada do IP banido é recusada, a dos demais não
  await assert.rejects(() => H.connect(srv.port, BAD), { status: 429 });
  assert.strictEqual((await H.request(srv.port, '/', { headers: { 'x-forwarded-for': BAD } })).status, 429);
  (await H.connect(srv.port, '198.51.100.21')).ws.close();

  // banimentos ativos: só ID e tempo restante
  let l2;
  for (let i = 0; i < 40; i++) { l2 = (await players(srv)).json; if (!l2.hosts.some(x => x.id === g.id)) break; await H.wait(50); }
  assert.ok(!l2.hosts.some(x => x.id === g.id), 'jogadores banidos saíram da lista');
  assert.strictEqual(l2.bans.length, 1);
  assert.deepStrictEqual(Object.keys(l2.bans[0]).sort(), ['id', 'left']);
  assert.strictEqual(l2.bans[0].id, g.id);
  assert.ok(l2.bans[0].left > 590000 && l2.bans[0].left <= 600000);

  // desbanir
  assert.strictEqual((await post(srv, '/status/unban', { id: 'naoexiste123' })).status, 404);
  assert.strictEqual((await post(srv, '/status/unban', { ip: BAD })).status, 400, 'desbanir também não aceita IP');
  assert.strictEqual((await post(srv, '/status/unban', { id: g.id })).status, 200);
  assert.strictEqual((await players(srv)).json.bans.length, 0);
  (await H.connect(srv.port, BAD)).ws.close();
  caio.ws.close();
});

test('moderação: não bane o próprio IP nem proxy confiável', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const { c: eu, code } = await create(srv, ADMIN, 'Operador');          // mesmo IP de quem opera o painel
  const proxy = await enter(srv, undefined, 'Direto', code);           // sem XFF: chega como 127.0.0.1 (proxy confiável)
  const me = await hostOf(srv, 'Operador'), direct = await hostOf(srv, 'Direto');
  assert.strictEqual(me.self, true);
  assert.strictEqual(direct.self, false);
  assert.strictEqual((await post(srv, '/status/ban', { id: me.id, minutes: 10 })).status, 409);
  assert.strictEqual((await post(srv, '/status/ban', { id: direct.id, minutes: 10 })).status, 409);
  assert.strictEqual(eu.ws.readyState, 1);
  assert.strictEqual(proxy.ws.readyState, 1);
  eu.ws.close(); proxy.ws.close();
});

test('moderação: IPv6 vale para o bloco /64', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const { c: v6 } = await create(srv, '2001:db8:1:2:aaaa:bbbb:cccc:dddd', 'Vera');
  const h = await hostOf(srv, 'Vera');
  const ban = await post(srv, '/status/ban', { id: h.id, minutes: 60 });
  assert.strictEqual(ban.status, 200);
  assert.strictEqual(await v6.closed, 1008);
  await assert.rejects(() => H.connect(srv.port, '2001:db8:1:2:9:9:9:9'), { status: 429 });
  (await H.connect(srv.port, '2001:db8:1:3::1')).ws.close();
  assert.strictEqual((await post(srv, '/status/unban', { id: h.id })).status, 200);
  (await H.connect(srv.port, '2001:db8:1:2:9:9:9:9')).ws.close();
});

test('moderação: com BAN=0 as ações são recusadas e o ID continua com segredo', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN, BAN: '0' });
  t.after(() => srv.stop());
  const IP = '203.0.113.44';
  const { c } = await create(srv, IP, 'Zed');
  const h = await hostOf(srv, 'Zed');
  assert.strictEqual((await players(srv)).json.ban.on, false);
  assert.strictEqual((await post(srv, '/status/ban', { id: h.id, minutes: 10 })).status, 409);
  assert.strictEqual((await post(srv, '/status/unban', { id: 'abcdefabcdef' })).status, 409);
  for (const k of [IP, '|' + IP])
    assert.notStrictEqual(crypto.createHash('sha256').update(k).digest('base64url').slice(0, 12), h.id, 'mesmo com BAN=0 o ID é salgado');
  c.ws.close();
});

test('métricas: /status.json traz tick, atraso do loop, mensagens e buffer', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const a = await H.connect(srv.port, '203.0.113.30');
  a.ws.send(JSON.stringify({ t: 'create', style: 'proxima', bots: 3, name: 'Ana' }));
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

test('recordes: máximo de jogadores online, memória e rede aparecem no painel e persistem no arquivo', { skip: H.missing() }, async t => {
  const f = path.join(require('os').tmpdir(), 'skyke-records-' + process.pid + '-' + Date.now() + '.json');
  t.after(() => { try { fs.unlinkSync(f); } catch (e) {} });
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN, RECORDS_FILE: f });
  let stopped = false;
  const stop = async () => { if (!stopped) { stopped = true; await srv.stop(); } };
  t.after(stop);
  const a = await H.connect(srv.port, '203.0.113.41');
  const b = await H.connect(srv.port, '203.0.113.42');
  t.after(() => { a.ws.close(); b.ws.close(); });
  a.ws.send(JSON.stringify({ t: 'create', style: 'proxima', bots: 0, name: 'Ana' }));
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')));
  const code = a.msgs.find(m => m.t === 'joined').code;
  b.ws.send(JSON.stringify({ t: 'join', code, name: 'Beto' }));
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'joined')));
  await H.wait(300);
  const r = await H.request(srv.port, '/status.json', { headers: auth() });
  const rec = r.json.records;
  assert.ok(rec, 'records presente');
  for (const k of ['humans', 'rooms', 'rss', 'heap', 'sysMem', 'rx', 'tx'])
    assert.ok(rec[k] && Number.isFinite(rec[k].v) && rec[k].v >= 0 && Number.isFinite(rec[k].at), 'registro ' + k);
  assert.ok(rec.humans.v >= 2, 'máximo de jogadores online: ' + rec.humans.v);
  assert.ok(rec.rss.v > 0 && rec.heap.v > 0 && rec.sysMem.v > 0, 'picos de memória');
  assert.ok(!JSON.stringify(rec).includes('203.0.113'), 'sem IP nos recordes');
  a.ws.close(); b.ws.close();
  await H.wait(200);
  await stop();
  const saved = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.strictEqual(saved.v, 1);
  assert.ok(saved.records.humans.v >= 2, 'o recorde foi salvo ao encerrar');
});

test('status.html: seção Recordes com jogadores, salas, memória e rede', () => {
  for (const k of ['Recordes', 'Máx. jogadores online', 'Máx. memória do jogo', 'Máx. memória do sistema', 'Máx. rede recebida', 'Máx. rede enviada', 'recDraw(d.records)'])
    assert.ok(page.includes(k), k);
});

test('status.html: lista virtualizada com busca por nome, ID do jogador, ID do IP e sala (cabe ~1800 nomes)', () => {
  assert.ok(page.includes('id="msearch"') && /ID do jogador/.test(page) && /ID do IP/.test(page));
  for (const k of ['function vrender(', 'function vreset(', 'NODES', 'requestAnimationFrame', 'function matches(', 'sg!==SIG'])
    assert.ok(script[0].includes(k), k);
  assert.ok(/role="list"/.test(page), 'lista acessível');
  assert.ok(!/\.ip\b/.test(script[0]), 'a busca nunca manipula IP, só IDs');
});

test('painel: a lista de jogadores vai comprimida quando é grande (muitos jogadores online)', { skip: H.missing() }, async t => {
  const zlib = require('zlib');
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const { code } = await create(srv, '203.0.113.1', 'P0');
  for (let i = 1; i < 22; i++) await enter(srv, '198.51.100.' + (10 + i), 'P' + i, code);
  const plain = await players(srv);
  assert.ok(!plain.headers['content-encoding'], 'sem Accept-Encoding vai sem compressão');
  assert.ok(plain.body.length > 2048, 'a lista é grande o bastante');
  const gz = await H.request(srv.port, '/status/players.json', { headers: { ...auth(), 'accept-encoding': 'gzip' } });
  assert.strictEqual(gz.headers['content-encoding'], 'gzip');
  assert.match(gz.headers['vary'] || '', /Accept-Encoding/i);
  const j = JSON.parse(zlib.gunzipSync(gz.body).toString('utf8'));
  assert.strictEqual(j.hosts.reduce((n, h) => n + h.players.length, 0), 22);
  assert.ok(!/203\.0\.113\.1|198\.51\.100\./.test(zlib.gunzipSync(gz.body).toString('utf8')), 'continua sem nenhum IP');
});

// ---------- capacidade (limites de salas e de jogadores por sala) ----------
const cap = (srv, body, headers = auth()) => post(srv, '/status/capacity', body, headers);
const statusJson = srv => H.request(srv.port, '/status.json', { headers: auth() });

test('capacidade: /status.json traz limites, tetos de projeto e estimativa', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const j = (await statusJson(srv)).json;
  assert.strictEqual(j.maxRooms, 20);
  assert.strictEqual(j.maxPerRoom, 32);
  const c = j.capacity;
  assert.strictEqual(c.rooms, 20);
  assert.strictEqual(c.perRoom, 32);
  assert.strictEqual(c.conns, Math.ceil(20 * 32 * 1.05) + 25);
  assert.deepStrictEqual(c.ceilings, { minRooms: 1, maxRooms: 150, minPerRoom: 2, maxPerRoom: 40, maxPlayers: 3000 });
  assert.strictEqual(c.estimate.players, 640);
  assert.strictEqual(c.estimate.level, 'ok', 'o padrão 20 × 32 não gera alerta');
  assert.ok(['ok', 'warn', 'crit'].includes(c.estimate.level));
  assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(JSON.stringify(c)), 'sem IP');
});

test('capacidade: exige token, só aceita POST JSON e valida os limites', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  assert.strictEqual((await cap(srv, { rooms: 10, perRoom: 10 }, { 'x-forwarded-for': ADMIN })).status, 401, 'sem token');
  assert.strictEqual((await cap(srv, { rooms: 10, perRoom: 10 }, { authorization: 'Bearer errado-errado-errado', 'x-forwarded-for': ADMIN })).status, 401);
  assert.strictEqual((await H.request(srv.port, '/status/capacity', { headers: auth() })).status, 405, 'GET não muda nada');
  for (const body of [{ rooms: 151, perRoom: 10 }, { rooms: 10, perRoom: 41 }, { rooms: 0, perRoom: 10 }, { rooms: 10, perRoom: 1 }, { rooms: 100, perRoom: 40 },
    { rooms: '10', perRoom: 10 }, { rooms: 10.5, perRoom: 10 }, { perRoom: 10 }, {}]) {
    const r = await cap(srv, body);
    assert.strictEqual(r.status, 400, JSON.stringify(body));
    assert.ok(r.json.erro);
  }
  const j = (await statusJson(srv)).json;
  assert.strictEqual(j.maxRooms, 20, 'nada mudou');
  assert.strictEqual(j.maxPerRoom, 32);
});

test('capacidade: pré-visualização (dry) calcula sem aplicar', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const r = await cap(srv, { rooms: 20, perRoom: 10, dry: true });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.dry, 1);
  assert.strictEqual(r.json.capacity.estimate.players, 200);
  assert.strictEqual(r.json.capacity.conns, Math.ceil(200 * 1.05) + 25);
  assert.strictEqual((await statusJson(srv)).json.maxRooms, 20, 'o limite real não mudou');
});

test('capacidade: o novo limite vale na hora para salas e jogadores, sem derrubar quem já está dentro', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const { c: a, code } = await create(srv, '203.0.113.1', 'Ana');
  const b = await enter(srv, '203.0.113.2', 'Beto', code);
  const r = await cap(srv, { rooms: 1, perRoom: 2 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.capacity.rooms, 1);
  assert.strictEqual(r.json.capacity.perRoom, 2);
  assert.strictEqual(r.json.capacity.open.roomsOverLimit, 0);
  assert.strictEqual(r.json.saved, true);
  assert.strictEqual((await statusJson(srv)).json.maxPerRoom, 2, '/status.json já mostra o novo valor');
  // quem já estava continua conectado
  assert.strictEqual(a.ws.readyState, 1);
  assert.strictEqual(b.ws.readyState, 1);
  // sala cheia (2 de 2)
  const c3 = await H.connect(srv.port, '203.0.113.3');
  c3.ws.send(JSON.stringify({ t: 'join', code, name: 'Caio' }));
  assert.ok(await H.until(() => c3.msgs.some(m => m.t === 'err' && /lotada.*2 pessoas/.test(m.msg))), 'sala lotada com o limite novo');
  // servidor cheio (1 de 1 sala)
  const c4 = await H.connect(srv.port, '203.0.113.4');
  c4.ws.send(JSON.stringify({ t: 'create', style: 'proxima', bots: 0, name: 'Dani' }));
  assert.ok(await H.until(() => c4.msgs.some(m => m.t === 'err' && /Servidor cheio.*1 salas/.test(m.msg))), 'sem sala nova acima do limite');
  // voltar a subir libera de novo
  assert.strictEqual((await cap(srv, { rooms: 5, perRoom: 3 })).status, 200);
  const c5 = await enter(srv, '203.0.113.5', 'Eli', code);
  assert.strictEqual(c5.ws.readyState, 1);
});

test('capacidade: reduzir abaixo do que já está aberto não fecha salas e é informado', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const { code } = await create(srv, '203.0.113.1', 'Ana');
  for (let i = 2; i <= 4; i++) await enter(srv, '203.0.113.' + i, 'U' + i, code);
  await create(srv, '198.51.100.1', 'Bia');
  const r = await cap(srv, { rooms: 1, perRoom: 2 });
  assert.strictEqual(r.json.capacity.open.rooms, 2);
  assert.strictEqual(r.json.capacity.open.roomsOverLimit, 1);
  assert.strictEqual(r.json.capacity.open.roomsOverSize, 1, 'a sala com 4 pessoas passa do limite de 2');
  assert.strictEqual((await statusJson(srv)).json.rooms, 2, 'as salas seguem abertas');
});

test('capacidade: fica gravada em CAPACITY_FILE e vale depois de reiniciar; arquivo inválido é ignorado', { skip: H.missing() }, async t => {
  const fs2 = require('fs'), os = require('os');
  const dir = fs2.mkdtempSync(path.join(os.tmpdir(), 'skyke-capsrv-'));
  const file = path.join(dir, 'capacity.json');
  t.after(() => fs2.rmSync(dir, { recursive: true, force: true }));
  const a = await H.startServer({ STATUS_TOKEN: TOKEN, CAPACITY_FILE: file });
  assert.strictEqual((await cap(a, { rooms: 33, perRoom: 7 })).status, 200);
  await a.stop();
  assert.deepStrictEqual(JSON.parse(fs2.readFileSync(file, 'utf8')).rooms, 33);
  const b = await H.startServer({ STATUS_TOKEN: TOKEN, CAPACITY_FILE: file });
  const j = (await statusJson(b)).json;
  assert.strictEqual(j.maxRooms, 33);
  assert.strictEqual(j.maxPerRoom, 7);
  assert.strictEqual(j.capacity.persisted, true);
  await b.stop();
  fs2.writeFileSync(file, '{"rooms":9999,"perRoom":1}');
  const c = await H.startServer({ STATUS_TOKEN: TOKEN, CAPACITY_FILE: file });
  t.after(() => c.stop());
  assert.strictEqual((await statusJson(c)).json.maxRooms, 20, 'arquivo inválido: volta ao padrão');
});

test('capacidade: MAXROOMS e MAX_PER_ROOM do ambiente definem o ponto de partida (e são validados)', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN, MAXROOMS: '12', MAX_PER_ROOM: '8' });
  t.after(() => srv.stop());
  const j = (await statusJson(srv)).json;
  assert.strictEqual(j.maxRooms, 12);
  assert.strictEqual(j.maxPerRoom, 8);
  await assert.rejects(H.startServer({ MAXROOMS: '100', MAX_PER_ROOM: '40' }), /3000|saiu/, 'passa do teto de 3000 jogadores');
  await assert.rejects(H.startServer({ MAXROOMS: '9999' }), /inválido|saiu/);
});

test('status.html: seção Capacidade com limites de salas e jogadores por sala', () => {
  for (const id of ['crooms', 'cper', 'capply', 'creset', 'cmaxp', 'cplayers', 'cconns', 'cfds', 'cbw', 'ctick', 'cnotes', 'cmsg', 'clvl'])
    assert.ok(page.includes('id="' + id + '"'), id);
  assert.ok(script[0].includes("/status/capacity") && script[0].includes('confirm('), 'chama a API e confirma antes de aplicar');
  assert.ok(/Atenção|CRÍTICO/.test(script[0]) && script[0].includes('dry'), 'pré-visualiza e alerta antes de aplicar');
});
