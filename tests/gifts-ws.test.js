'use strict';
// Presentes e carteira única pelo WebSocket: o servidor confere quem envia, o item e os limites; a culinária paga na carteira da
// fazenda; o Keypass limita a renovação da chave de recuperação e o administrador libera a quarta.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const H = require('./harness.js');
const C = require('../assets/catalog.js');
const { payload } = require('../lib/identity.js');
const { fidOf } = require('../lib/ids.js');
const { pidOf } = require('../lib/pubprofile.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const sign = (priv, data) => crypto.sign('sha256', Buffer.from(data, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');
const kp = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { pk: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), priv: privateKey };
};
async function next(c, pred, ms = 4000) {
  assert.ok(await H.until(() => c.msgs.some(pred), ms), 'mensagem esperada: ' + String(pred));
  return c.msgs.find(pred);
}
/** registra a identidade, autentica e entra numa sala; devolve também as chaves (para o Keypass) e a mensagem de sessão */
async function enter(srv, ip, ch, name, code) {
  const c = await H.connect(srv.port, ip);
  const k = ch.repeat(43),
    id = fidOf(k),
    main = kp(),
    rec = kp();
  send(c, { t: 'idreg', k, pk: main.pk, rpk: rec.pk });
  await next(c, m => m.t === 'idok');
  send(c, { t: 'auth', id, action: 'join' });
  const chl = await next(c, m => m.t === 'challenge');
  send(c, { t: 'proof', id, nonce: chl.nonce, sig: sign(main.priv, payload.auth(id, chl.nonce, 'join')), action: 'join' });
  const s = await next(c, m => m.t === 'session');
  c.msgs.length = 0;
  send(c, code ? { t: 'join', code, name, token: s.token, k } : { t: 'create', style: 'amazora', bots: 0, name, token: s.token, k });
  const j = await next(c, m => m.t === 'joined');
  return { c, id, pid: pidOf(id), me: j.id, code: j.code, main, rec, session: s };
}
const rid = () => crypto.randomBytes(8).toString('hex');
const R = id => C.RECIPE[id];
/** cozinha uma receita (perto da fogueira) e devolve a resposta */
async function cook(p, id) {
  const m = { t: 'cookdo', m: R(id).m, g: R(id).g, rid: rid() };
  send(p.c, m);
  return next(p.c, x => x.t === 'cookr' && x.rid === m.rid);
}
async function pubOn(p) {
  send(p.c, { t: 'pubp', on: true });
  await next(p.c, m => m.t === 'pubp' && m.on === 1);
}
async function gift(p, to, k, i) {
  const m = { t: 'giftsend', to, k, i, rid: rid() };
  send(p.c, m);
  return next(p.c, x => x.t === 'giftr' && x.rid === m.rid);
}

test('culinária paga na carteira da fazenda: uma economia só, com bônus pelos ingredientes da própria horta', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.210', 'A', 'Cozi');
  t.after(() => a.c.ws.close());
  send(a.c, { t: 'move', x: 1, z: 2, ry: 0, y: 0, s: 0 });
  send(a.c, { t: 'farmget' });
  assert.strictEqual((await next(a.c, m => m.t === 'farm')).coins, 0, 'carteira vazia no começo');

  const r1 = await cook(a, 'batata_assada');
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.xp, 30);
  assert.strictEqual(r1.coins, 10, 'um terço da experiência de base, como o preço das plantas');
  assert.strictEqual(r1.home, 0, 'nada da horta ainda');
  assert.strictEqual(r1.wallet, 10, 'a resposta já traz o saldo da carteira');
  assert.ok(!('g' in r1), 'os ingredientes não voltam na resposta (o cliente já sabe a receita)');

  a.c.msgs.length = 0;
  await H.wait(600);
  send(a.c, { t: 'farmget' });
  const farm = await next(a.c, m => m.t === 'farm');
  assert.strictEqual(farm.coins, 10, 'o painel da fazenda mostra as mesmas moedas');
  assert.strictEqual(farm.rec.earned, 10);
  assert.strictEqual(farm.rec.cooked, 10, 'o recorde separa o que veio da culinária');

  await H.wait(1300);
  const r2 = await cook(a, 'batata_assada');
  assert.strictEqual(r2.coins, 3, 'repetir a receita rende pouco (9 de experiência → 3 moedas)');
  assert.strictEqual(r2.wallet, 13);

  // o cliente não escolhe o valor: campos a mais são descartados pelo validador
  await H.wait(1300);
  const m = { t: 'cookdo', m: R('batata_assada').m, g: R('batata_assada').g, rid: rid(), coins: 999999, wallet: 999999, home: 6 };
  send(a.c, m);
  const r3 = await next(a.c, x => x.t === 'cookr' && x.rid === m.rid);
  assert.strictEqual(r3.wallet, 16, 'só +3, o que o servidor calculou');
});

test('presentes: só com identidade, só o que o jogador produziu, só para quem tem perfil público; a caixa aparece no perfil', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.211', 'A', 'Ana');
  const b = await enter(srv, '203.0.113.212', 'B', 'Bia', a.code);
  t.after(() => { a.c.ws.close(); b.c.ws.close(); });
  send(a.c, { t: 'move', x: 1, z: 2, ry: 0, y: 0, s: 0 });

  // quem recebe não ligou o perfil público: não recebe presentes
  assert.strictEqual((await cook(a, 'batata_assada')).ok, true);
  assert.strictEqual((await gift(a, b.pid, 'r', 'batata_assada')).reason, 'sem_perfil');
  await pubOn(b);

  // item que o jogador nunca produziu (receita não preparada e planta não colhida) é recusado, mesmo o cliente pedindo
  await H.wait(2100);
  assert.strictEqual((await gift(a, b.pid, 'r', 'brigadeiro')).reason, 'nao_tem');
  await H.wait(2100);
  assert.strictEqual((await gift(a, b.pid, 'c', 'tomate')).reason, 'nao_tem');

  // presente de verdade: fica na caixa de quem recebeu e ele é avisado na hora
  await H.wait(2100);
  b.c.msgs.length = 0;
  const ok = await gift(a, b.pid, 'r', 'batata_assada');
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual([ok.gift.k, ok.gift.i, ok.gift.n], ['r', 'batata_assada', 'Ana'], 'o nome de quem envia é o da sessão');
  assert.strictEqual(ok.left, 4, 'restam 4 dos 5 presentes do dia');
  const inn = await next(b.c, m => m.t === 'giftin');
  assert.deepStrictEqual([inn.n, inn.k, inn.i, inn.unseen], ['Ana', 'r', 'batata_assada', 1]);
  assert.ok(!JSON.stringify(inn).includes(a.pid) && !JSON.stringify(inn).includes(a.id), 'o aviso não leva o código nem o id de quem enviou');

  // o item NÃO foi para a mochila de quem recebeu: a receita continua bloqueada para ele
  b.c.msgs.length = 0;
  send(b.c, { t: 'item', item: 'batata_assada' });
  await H.wait(400);
  assert.ok(!b.c.msgs.some(m => m.t === 'item'), 'presente não desbloqueia alimento nem entra no inventário');
  send(b.c, { t: 'farmget' });
  assert.strictEqual((await next(b.c, m => m.t === 'farm')).coins, 0, 'nem vira moeda');
  // quem enviou não perdeu nada
  a.c.msgs.length = 0;
  send(a.c, { t: 'item', item: 'batata_assada' });
  await next(a.c, m => m.t === 'item' && m.item === 'batata_assada');

  // repetir o envio (mesma pessoa no mesmo dia) não duplica
  await H.wait(2100);
  assert.strictEqual((await gift(a, b.pid, 'r', 'batata_assada')).reason, 'par');
  // presentear a si mesmo
  await pubOn(a);
  await H.wait(2100);
  assert.strictEqual((await gift(a, a.pid, 'r', 'batata_assada')).reason, 'self');

  // a caixa: o dono vê tudo e zera os novos; os outros veem pelo jogo e pelo perfil público, sem código de ninguém
  send(b.c, { t: 'giftget', seen: true });
  const mine = await next(b.c, m => m.t === 'gifts');
  assert.deepStrictEqual([mine.total, mine.unseen, mine.list[0].i, mine.left], [1, 0, 'batata_assada', 5]);
  send(a.c, { t: 'giftsee', to: b.pid });
  const seen = await next(a.c, m => m.t === 'giftbox' && m.to === b.pid);
  assert.deepStrictEqual([seen.name, seen.total, seen.list[0].n, seen.list[0].i], ['Bia', 1, 'Ana', 'batata_assada']);
  const prof = await H.request(srv.port, '/profile.json?id=' + b.pid);
  assert.deepStrictEqual(prof.json.gifts, { total: 1, list: [{ n: 'Ana', k: 'r', i: 'batata_assada', at: ok.gift.at }] });
  assert.ok(!prof.body.toString().includes(a.pid) && !prof.body.toString().includes(a.id));
  assert.deepStrictEqual(prof.json.cook, { lv: 1, max: false, rank: 0, hist: [], kinds: 0, total: C.RECIPES.length }, 'o perfil mostra as estrelas da culinária');

  // caixa de quem desligou o perfil não aparece
  send(b.c, { t: 'pubp', on: false });
  await next(b.c, m => m.t === 'pubp' && m.on === 0);
  a.c.msgs.length = 0;
  await H.wait(600);
  send(a.c, { t: 'giftsee', to: b.pid });
  assert.strictEqual((await next(a.c, m => m.t === 'giftbox')).none, 1);
  assert.strictEqual((await H.request(srv.port, '/profile.json?id=' + b.pid)).status, 404);

  // o dono tira o presente da própria caixa; outro jogador não consegue
  send(a.c, { t: 'giftdel', id: mine.list[0].id });
  await next(a.c, m => m.t === 'gifts');
  b.c.msgs.length = 0;
  await H.wait(600);
  send(b.c, { t: 'giftget' });
  assert.strictEqual((await next(b.c, m => m.t === 'gifts')).total, 1, 'giftdel de outro jogador mexe só na caixa dele (vazia)');
  b.c.msgs.length = 0;
  send(b.c, { t: 'giftdel', id: mine.list[0].id });
  assert.strictEqual((await next(b.c, m => m.t === 'gifts')).total, 0);
});

test('presentes: sem identidade autenticada não envia nem tem caixa; pedidos malformados são descartados', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const c = await H.connect(srv.port, '203.0.113.213');
  t.after(() => c.ws.close());
  send(c, { t: 'create', style: 'amazora', bots: 0, name: 'Sem' });
  await next(c, m => m.t === 'joined');
  send(c, { t: 'giftsend', to: 'b'.repeat(20), k: 'c', i: 'tomate', rid: rid() });
  await next(c, m => m.t === 'err' && m.scope === 'gift');
  c.msgs.length = 0;
  for (const bad of [
    { t: 'giftsend', to: 'b'.repeat(20), k: 'c', i: 'nao_existe', rid: rid() },
    { t: 'giftsend', to: 'b'.repeat(20), k: 'x', i: 'tomate', rid: rid() },
    { t: 'giftsend', to: 'curto', k: 'c', i: 'tomate', rid: rid() },
    { t: 'giftsend', to: 'b'.repeat(20), k: 'c', i: 'tomate' },
    { t: 'giftsee', to: 'B'.repeat(20) },
    { t: 'giftdel', id: 0 },
    { t: 'giftdel', id: '1' }
  ])
    send(c, bad);
  await H.wait(400);
  assert.ok(!c.msgs.some(m => /^gift/.test(m.t)), 'nenhum pedido inválido chega ao tratador');
});

test('presentes: a caixa é gravada em disco e volta depois de reiniciar o servidor', { skip: H.missing() }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-gw-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { GIFTS_FILE: path.join(dir, 'gifts.json'), COOK_FILE: path.join(dir, 'cook.json'), PROFILES_FILE: path.join(dir, 'profiles.json'), IDENTITY_FILE: path.join(dir, 'identity.json') };
  let srv = await H.startServer(env);
  const a = await enter(srv, '203.0.113.214', 'A', 'Ana');
  const b = await enter(srv, '203.0.113.215', 'B', 'Bia', a.code);
  send(a.c, { t: 'move', x: 1, z: 2, ry: 0, y: 0, s: 0 });
  await cook(a, 'batata_assada');
  await pubOn(b);
  assert.strictEqual((await gift(a, b.pid, 'r', 'batata_assada')).ok, true);
  a.c.ws.close();
  b.c.ws.close();
  await srv.stop();
  const disk = JSON.parse(fs.readFileSync(env.GIFTS_FILE, 'utf8'));
  assert.strictEqual(fs.statSync(env.GIFTS_FILE).mode & 0o777, 0o600);
  assert.deepStrictEqual(disk.b[b.pid].g.map(x => [x.f, x.n, x.k, x.i]), [[a.pid, 'Ana', 'r', 'batata_assada']]);
  assert.ok(!fs.readFileSync(env.GIFTS_FILE, 'utf8').includes(a.id), 'o arquivo guarda o código público, nunca o id de identidade');
  srv = await H.startServer(env);
  t.after(() => srv.stop());
  const prof = await H.request(srv.port, '/profile.json?id=' + b.pid);
  assert.strictEqual(prof.json.gifts.total, 1, 'a coleção é permanente');
});

test('Keypass pela rede: a sessão informa as renovações; o servidor impõe 3 por conta, uma por intervalo, e o painel libera a quarta', { skip: H.missing() }, async t => {
  const TOKEN = 'k'.repeat(40),
    admin = { authorization: 'Bearer ' + TOKEN, 'x-forwarded-for': '203.0.113.9' };
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN, KEYPASS_INTERVAL_MS: '1500', SECURITY_LOG: '0' });
  t.after(() => srv.stop());
  const a = await enter(srv, '203.0.113.216', 'A', 'Ana');
  t.after(() => a.c.ws.close());
  assert.deepStrictEqual(a.session.kp, { used: 0, max: 3, left: 3, next: 0, last: 0 }, 'ao entrar, o jogador sabe quantas renovações tem');

  let rgen = 1,
    recKey = a.rec,
    n = 0;
  /**
   * Pede a troca da chave de recuperação com as duas assinaturas certas. Cada pedido vai numa conexão nova, autenticada com a
   * chave do aparelho (a troca derruba as outras conexões da conta, e cada conexão aceita poucas trocas por minuto).
   */
  async function renew() {
    const c = await H.connect(srv.port, '203.0.113.' + (220 + n++));
    try {
      send(c, { t: 'auth', id: a.id, action: 'rotate-recovery' });
      const ch = await next(c, m => m.t === 'challenge');
      send(c, { t: 'proof', id: a.id, nonce: ch.nonce, sig: sign(a.main.priv, payload.auth(a.id, ch.nonce, 'rotate-recovery')), action: 'rotate-recovery' });
      const s = await next(c, m => m.t === 'session');
      const next0 = kp(),
        data = payload.rotateRecovery(a.id, rgen, next0.pk);
      send(c, { t: 'idrot', token: s.token, rgen, rpk: next0.pk, sigOld: sign(a.main.priv, data), sigRec: sign(recKey.priv, data) });
      const r = await next(c, m => (m.t === 'idok' && m.op === 'rotate-recovery') || (m.t === 'err' && m.scope === 'idrot'));
      if (r.t === 'idok') {
        rgen = r.rgen;
        recKey = next0;
      }
      return r;
    } finally {
      c.ws.close();
    }
  }
  const r1 = await renew();
  assert.strictEqual(r1.t, 'idok');
  assert.deepStrictEqual([r1.kp.used, r1.kp.left], [1, 2]);
  assert.ok(r1.kp.next > Date.now(), 'a resposta diz quando dá para renovar de novo');

  const early = await renew();
  assert.deepStrictEqual([early.t, early.code], ['err', 'keypass-wait'], 'antes do intervalo: recusado');
  assert.ok(early.until > Date.now() && early.kp.used === 1);

  await H.wait(1600);
  assert.strictEqual((await renew()).kp.used, 2);
  await H.wait(1600);
  const r3 = await renew();
  assert.deepStrictEqual([r3.kp.used, r3.kp.left, r3.kp.next], [3, 0, 0]);
  await H.wait(1600);
  const r4 = await renew();
  assert.deepStrictEqual([r4.t, r4.code, r4.kp.left], ['err', 'keypass-limit', 0], 'a quarta só com o administrador');
  assert.match(r4.msg, /administrador/);

  // painel: sem token não entra; com token consulta e libera UMA renovação, sem devolver chave nenhuma
  assert.strictEqual((await H.request(srv.port, '/status/keypass', { method: 'POST', body: { pid: a.pid } })).status, 401);
  assert.strictEqual((await H.request(srv.port, '/status/keypass', { method: 'POST', headers: admin, body: { pid: 'f'.repeat(20) } })).status, 404);
  assert.strictEqual((await H.request(srv.port, '/status/keypass', { method: 'POST', headers: admin, body: { pid: 'curto' } })).status, 400);
  const see = await H.request(srv.port, '/status/keypass', { method: 'POST', headers: admin, body: { pid: a.pid, dry: true } });
  assert.deepStrictEqual([see.status, see.json.keypass.used, see.json.keypass.left], [200, 3, 0]);
  const grant = await H.request(srv.port, '/status/keypass', { method: 'POST', headers: admin, body: { pid: a.pid } });
  assert.deepStrictEqual([grant.status, grant.json.keypass.left], [200, 1]);
  assert.ok(!/rpk|"pk"|priv/.test(grant.body.toString()), 'a resposta do painel não leva chave');
  const twice = await H.request(srv.port, '/status/keypass', { method: 'POST', headers: admin, body: { pid: a.pid } });
  assert.strictEqual(twice.status, 409, 'liberar de novo sem o jogador usar não acumula');

  const r5 = await renew();
  assert.strictEqual(r5.t, 'idok', 'liberada pelo administrador, a renovação é feita pelo próprio jogador');
  assert.strictEqual((await renew()).code, 'keypass-limit');

  // a chave de recuperação antiga não autentica mais: só a última
  const c2 = await H.connect(srv.port, '203.0.113.217');
  t.after(() => c2.ws.close());
  for (const [key, want] of [[a.rec, 'err'], [recKey, 'session']]) {
    c2.msgs.length = 0;
    send(c2, { t: 'auth', id: a.id, action: 'recover' });
    const ch = await next(c2, m => m.t === 'challenge');
    send(c2, { t: 'proof', id: a.id, nonce: ch.nonce, sig: sign(key.priv, payload.auth(a.id, ch.nonce, 'recover')), action: 'recover' });
    const out = await next(c2, m => m.t === 'session' || (m.t === 'err' && m.scope === 'proof'));
    assert.strictEqual(out.t, want, want === 'err' ? 'chave antiga recusada' : 'chave nova aceita');
    if (out.t === 'session') assert.strictEqual(out.kp, undefined, 'quem entra só com o código de recuperação não vê o Keypass');
  }
});
