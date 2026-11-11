'use strict';
// Perfil público pelo WebSocket e por HTTP: ligar, ler, desligar, sair, privacidade e limites.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const H = require('./harness.js');
const { payload } = require('../lib/identity.js');
const { fidOf } = require('../lib/ids.js');
const { pidOf } = require('../lib/pubprofile.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const sign = (priv, data) =>
  crypto.sign('sha256', Buffer.from(data, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');
function kp() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { pk: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), priv: privateKey };
}
async function next(c, pred, ms = 3000) {
  assert.ok(await H.until(() => c.msgs.some(pred), ms), 'mensagem esperada: ' + String(pred));
  return c.msgs.find(pred);
}
async function enter(srv, ip, ch, name) {
  const c = await H.connect(srv.port, ip);
  const K = ch.repeat(43),
    id = fidOf(K),
    main = kp(),
    rec = kp();
  send(c, { t: 'idreg', k: K, pk: main.pk, rpk: rec.pk });
  await next(c, m => m.t === 'idok');
  send(c, { t: 'auth', id, action: 'join' });
  const chl = await next(c, m => m.t === 'challenge');
  send(c, {
    t: 'proof',
    id,
    nonce: chl.nonce,
    sig: sign(main.priv, payload.auth(id, chl.nonce, 'join')),
    action: 'join'
  });
  const s = await next(c, m => m.t === 'session');
  c.msgs.length = 0;
  send(c, { t: 'create', style: 'amazora', bots: 0, name, token: s.token });
  await next(c, m => m.t === 'joined');
  return { c, id };
}
const get = (srv, pid) => H.request(srv.port, '/profile.json?id=' + pid);

test('perfil público: liga, aparece em /profile.json, desliga e some', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const { c, id } = await enter(srv, '203.0.113.120', 'P', 'Luna');
  t.after(() => c.ws.close());
  const pid = pidOf(id);

  assert.strictEqual((await get(srv, pid)).status, 404, 'desligado por padrão');

  c.msgs.length = 0;
  send(c, { t: 'pubp', on: true, bio: 'Oi! <b>sou</b> a Luna' });
  const ok = await next(c, m => m.t === 'pubp');
  assert.strictEqual(ok.pp, pid);
  const r = await get(srv, pid);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers['cache-control'], 'no-store');
  assert.strictEqual(r.json.name, 'Luna');
  assert.strictEqual(r.json.online, true);
  assert.strictEqual(r.json.bio, 'Oi! bsou/b a Luna');
  assert.ok(Object.values(r.json.cfg).every(Number.isInteger), 'aparência só em índices do catálogo');
  // nada que identifique a pessoa além do que ela escolheu
  assert.deepStrictEqual(Object.keys(r.json).sort(), ['badges', 'bio', 'book', 'cfg', 'cook', 'farm', 'gifts', 'like', 'likes', 'mood', 'name', 'online', 'pet', 'seenAt', 'world']);
  assert.ok(!JSON.stringify(r.json).includes(id));

  await H.wait(400); // intervalo mínimo entre mensagens de perfil
  send(c, { t: 'pubp', on: false });
  await next(c, m => m.t === 'pubp' && m.on === 0);
  assert.strictEqual((await get(srv, pid)).status, 404);
});

test('perfil público: quem entra depois recebe o id na sala e, ao sair, o perfil fica offline', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.121', 'Q', 'Ana');
  const pid = pidOf(a.id);
  send(a.c, { t: 'pubp', on: true, bio: '' });
  await next(a.c, m => m.t === 'pubp');

  const code = a.c.msgs.find(m => m.t === 'joined').code;
  const b = await H.connect(srv.port, '203.0.113.122');
  t.after(() => b.ws.close());
  send(b, { t: 'join', code, name: 'Beto' });
  const j = await next(b, m => m.t === 'joined');
  const all = JSON.stringify(j);
  assert.ok(all.includes(pid), 'o resumo dos jogadores traz o id público de quem ligou');
  assert.ok(!all.includes(a.id), 'e nunca o id de identidade');

  a.c.ws.close();
  await H.wait(500);
  const r = await get(srv, pid);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.online, false);
  assert.ok(r.json.seenAt > 0);
});

test('perfil público: id inválido, limite de consultas e página sem script externo', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  assert.strictEqual((await get(srv, '../../etc/passwd')).status, 404);
  assert.strictEqual((await get(srv, '')).status, 404);
  const page = await H.request(srv.port, '/profile');
  assert.strictEqual(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.headers['x-robots-tag'], /noindex/);
  const html = page.body.toString('utf8');
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map(m => m[1]);
  assert.ok(srcs.length >= 5 && srcs.every(u => /^\/(assets|vendor)\//.test(u)), 'só scripts do próprio servidor: ' + srcs);
  assert.ok(srcs.some(u => /portrait\.[0-9a-f]{10}\.js$/.test(u)), 'rosto desenhado com o código do avatar do jogo');
  for (const u of srcs) assert.strictEqual((await H.request(srv.port, u)).status, 200, u);
  assert.ok(!/Jogar Skyke3D|Cabelo|Pele|Olhos|Camisa|Chapéu|Calçado|Expressão/.test(html), 'sem detalhes de aparência nem botão de jogar');
  assert.ok(!/innerHTML|document\.write|eval\(/.test(html), 'só textContent');
  const js = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  const h = "'sha384-" + crypto.createHash('sha384').update(js, 'utf8').digest('base64') + "'";
  assert.ok(page.headers['content-security-policy'].includes(h), 'hash do script na CSP');
  let limited = 0;
  for (let i = 0; i < 70; i++) if ((await get(srv, 'a'.repeat(20))).status === 429) limited++;
  assert.ok(limited > 0, 'consultas em excesso levam 429');
});

test('perfil público: outro jogador curte uma vez e o contador aparece na página', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.130', 'U', 'Ana');
  t.after(() => a.c.ws.close());
  const b = await enter(srv, '203.0.113.131', 'V', 'Beto');
  t.after(() => b.c.ws.close());
  const pid = pidOf(a.id);
  send(a.c, { t: 'pubp', on: true, bio: '' });
  await next(a.c, m => m.t === 'pubp');

  send(b.c, { t: 'plike', to: pid });
  const r1 = await next(b.c, m => m.t === 'plike');
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.count, 1);
  await H.wait(600);
  b.c.msgs.length = 0;
  send(b.c, { t: 'plike', to: pid });
  const r2 = await next(b.c, m => m.t === 'plike');
  assert.strictEqual(r2.dup, true);
  assert.strictEqual(r2.count, 1, 'repetir não soma');
  assert.strictEqual((await get(srv, pid)).json.likes, 1);

  await H.wait(600);
  a.c.msgs.length = 0;
  send(a.c, { t: 'plike', to: pid });
  assert.strictEqual((await next(a.c, m => m.t === 'plike')).reason, 'self');
});

test('livro de visitas: recado chega ao dono, aparece na página, link é recusado e o dono apaga', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.140', 'W', 'Ana');
  t.after(() => a.c.ws.close());
  const b = await enter(srv, '203.0.113.141', 'X', 'Beto');
  t.after(() => b.c.ws.close());
  const pid = pidOf(a.id);
  send(a.c, { t: 'pubp', on: true, bio: '' });
  await next(a.c, m => m.t === 'pubp');

  send(b.c, { t: 'gbook', to: pid, text: 'veja https://golpe.example.com' });
  assert.strictEqual((await next(b.c, m => m.t === 'gbook')).reason, 'link');
  await H.wait(2100);
  b.c.msgs.length = 0;
  a.c.msgs.length = 0;
  send(b.c, { t: 'gbook', to: pid, text: 'Adorei seu perfil!' });
  assert.strictEqual((await next(b.c, m => m.t === 'gbook')).ok, true);
  const pushed = await next(a.c, m => m.t === 'gblist' && m.list.length === 1);
  assert.strictEqual(pushed.list[0].name, 'Beto');
  assert.strictEqual(pushed.list[0].text, 'Adorei seu perfil!');
  const pj = (await get(srv, pid)).json;
  assert.strictEqual(pj.book.length, 1);
  assert.deepStrictEqual(Object.keys(pj.book[0]).sort(), ['at', 'name', 'text']);

  a.c.msgs.length = 0;
  send(a.c, { t: 'gbdel', id: pushed.list[0].id });
  assert.strictEqual((await next(a.c, m => m.t === 'gblist')).list.length, 0);
  assert.strictEqual((await get(srv, pid)).json.book.length, 0);

  // quem não é o dono não apaga nada pelo id dele
  await H.wait(2100);
  send(b.c, { t: 'gbook', to: pid, text: 'outro recado' });
  await next(b.c, m => m.t === 'gbook' && m.ok);
  b.c.msgs.length = 0;
  send(b.c, { t: 'gbdel', id: 1 });
  await next(b.c, m => m.t === 'gblist');
  assert.strictEqual((await get(srv, pid)).json.book.length, 1);
});

test('perfil público persistente: campos editáveis sobrevivem à saída e ao reinício do servidor', { skip: H.missing() }, async t => {
  const file = require('node:path').join(require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'sk-')), 'p.json');
  let srv = await H.startServer({ PROFILES_FILE: file });
  let stopped = false;
  const stop = async () => {
    if (!stopped) {
      stopped = true;
      await srv.stop();
    }
  };
  t.after(stop);
  const a = await enter(srv, '203.0.113.150', 'Y', 'Ana');
  const pid = pidOf(a.id);
  send(a.c, { t: 'pubp', on: true, bio: 'Moro em Cerron e gosto de dançar', like: 'dança e música', mood: 'bom dia!', world: 'cerron' });
  const ack = await next(a.c, m => m.t === 'pubp');
  assert.deepStrictEqual(ack.f, { bio: 'Moro em Cerron e gosto de dançar', like: 'dança e música', mood: 'bom dia!', world: 'cerron' });

  // link em qualquer campo é recusado e não troca o que estava salvo
  await H.wait(400);
  a.c.msgs.length = 0;
  send(a.c, { t: 'pubp', on: true, bio: 'visite https://golpe.example.com', like: '', mood: '', world: '' });
  const bad = await next(a.c, m => m.t === 'pubp');
  assert.strictEqual(bad.err, 'link');
  assert.strictEqual((await get(srv, pid)).json.bio, 'Moro em Cerron e gosto de dançar');

  a.c.ws.close();
  await H.wait(500);
  await stop();
  srv = await H.startServer({ PROFILES_FILE: file });
  stopped = false;
  const r = await get(srv, pid);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(
    [r.json.name, r.json.bio, r.json.like, r.json.mood, r.json.world, r.json.online],
    ['Ana', 'Moro em Cerron e gosto de dançar', 'dança e música', 'bom dia!', 'Cerron', false]
  );
  assert.ok(!require('node:fs').readFileSync(file, 'utf8').includes(a.id), 'o id de identidade nunca vai para o arquivo');
});

test('emblemas: só o administrador concede; completo é automático; jogador não consegue se dar um', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: 'token-do-painel-de-teste' });
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.160', 'Z', 'Ana');
  t.after(() => a.c.ws.close());
  const pid = pidOf(a.id);
  send(a.c, {
    t: 'pubp',
    on: true,
    bio: 'Gosto de explorar mundos e de fazer amigos',
    like: 'música',
    mood: 'oi!',
    world: 'cerron',
    badges: ['equipe']
  });
  await next(a.c, m => m.t === 'pubp');
  const auth = { Authorization: 'Bearer token-do-painel-de-teste' };
  let r = await get(srv, pid);
  assert.deepStrictEqual(
    r.json.badges.map(b => b.id),
    ['completo'],
    'o campo badges enviado pelo jogador é ignorado; só o automático aparece'
  );

  const post = (body, headers = auth) =>
    H.request(srv.port, '/status/badge', { method: 'POST', headers, body });
  assert.strictEqual((await post({ pid, badge: 'equipe', on: true }, {})).status, 401, 'sem token não passa');
  assert.strictEqual((await post({ pid: 'xx', badge: 'equipe', on: true })).status, 400);
  assert.strictEqual((await post({ pid, badge: 'inventado', on: true })).status, 400);
  const ok = await post({ pid, badge: 'equipe', on: true });
  assert.strictEqual(ok.status, 200);
  r = await get(srv, pid);
  assert.deepStrictEqual(
    r.json.badges.map(b => b.id),
    ['equipe', 'completo']
  );
  assert.strictEqual(r.json.badges[0].icon, '🛡️');
  assert.strictEqual((await post({ pid, badge: 'equipe', on: false })).status, 200);
  assert.deepStrictEqual(
    (await get(srv, pid)).json.badges.map(b => b.id),
    ['completo']
  );
});

test('perfil público: sem identidade autenticada não liga', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.123');
  t.after(() => c.ws.close());
  send(c, { t: 'create', style: 'amazora', bots: 0, name: 'Sem' });
  await H.wait(500);
  send(c, { t: 'pubp', on: true, bio: 'x' });
  await H.wait(300);
  assert.ok(!c.msgs.some(m => m.t === 'pubp' && m.on === 1));
});
