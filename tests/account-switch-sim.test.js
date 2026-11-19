'use strict';
// Simulado: 5 jogadores ao mesmo tempo trocando de conta várias vezes com o código de recuperação, usando o cliente de verdade
// (assets/identity.js num vm, com IndexedDB e localStorage de mentira) contra o servidor de verdade. Cobre:
//   - troca de conta com o cache do navegador limpo (IndexedDB e localStorage novos) e com "Esquecer conta" (forget);
//   - queda de conexão no meio do pedido de recuperação (o servidor recebe, a resposta se perde) e durante o jogo (resume);
//   - dois aparelhos restaurando a mesma conta ao mesmo tempo com o mesmo código;
//   - cache limpo durante a carência (o pedido guardado no aparelho se perde);
//   - código usado e chave do aparelho antigo deixando de valer; os dados (nome) acompanham a conta, não o aparelho.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const H = require('./harness.js');
const SKYREC = require('../assets/recovery.js');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'assets', 'identity.js'), 'utf8');
const GRACE = 1200;
const N = 5;

function fakeIDB(seed) {
  const data = new Map(seed || []);
  const stores = new Set(seed ? ['keys'] : []);
  const later = fn => setTimeout(fn, 0);
  const request = result => {
    const r = {};
    later(() => {
      r.result = result;
      if (r.onsuccess) r.onsuccess();
    });
    return r;
  };
  const db = {
    objectStoreNames: { contains: n => stores.has(n) },
    createObjectStore: n => stores.add(n),
    transaction: () => ({
      objectStore: () => ({
        get: k => request(data.get(k)),
        put: (v, k) => (data.set(k, v), request(undefined)),
        delete: k => (data.delete(k), request(undefined))
      })
    })
  };
  return {
    _data: data,
    open: () => {
      const r = {};
      later(() => {
        r.result = db;
        if (!stores.size && r.onupgradeneeded) r.onupgradeneeded();
        if (r.onsuccess) r.onsuccess();
      });
      return r;
    }
  };
}
function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

/** um navegador: identidade (vm), armazenamento e uma conexão que pode cair e voltar */
class Device {
  constructor(port, ip, label) {
    this.port = port;
    this.ip = ip;
    this.label = label;
    this.lastNew = '';
    this.dropReplies = false;
    this.wipe();
  }
  /** cache do navegador limpo: IndexedDB, localStorage e a página (memória) começam do zero */
  wipe() {
    this.idb = fakeIDB();
    this.storage = fakeStorage();
    const sandbox = {
      crypto: crypto.webcrypto,
      indexedDB: this.idb,
      localStorage: this.storage,
      btoa: s => Buffer.from(s, 'binary').toString('base64'),
      atob: s => Buffer.from(s, 'base64').toString('binary'),
      TextEncoder,
      TextDecoder,
      setTimeout,
      clearTimeout,
      console,
      SKYREC
    };
    vm.runInContext(SOURCE, vm.createContext(sandbox), { filename: 'identity.js' });
    this.id = sandbox.SKYID;
    // o jogador sempre guarda o código novo que aparece antes do pedido
    this.id.setUi({ confirmNew: async code => ((this.lastNew = code), true) });
    if (this.conn) this.id.bind(m => this.send(m));
  }
  send(m) {
    this.conn.ws.send(JSON.stringify(m));
  }
  async open() {
    if (this.conn) this.conn.ws.terminate();
    const conn = await H.connect(this.port, this.ip);
    this.conn = conn;
    conn.ws.on('message', (d, bin) => {
      if (bin || this.dropReplies) return;
      try {
        this.id.onMessage(JSON.parse(d));
      } catch (e) {
        /* mensagem que não é de identidade */
      }
    });
    this.id.bind(m => this.send(m));
    return conn;
  }
  /** queda de conexão: o socket morre sem fechamento limpo */
  drop() {
    if (this.conn) this.conn.ws.terminate();
  }
  close() {
    if (this.conn) this.conn.ws.close();
  }
}

/** espera a carência e conclui a restauração (o aparelho novo não precisa do código de novo) */
async function finish(d) {
  for (let i = 0; i < 40; i++) {
    try {
      return await d.id.finishRestore();
    } catch (e) {
      if (e.code !== 'recover-pending' && e.code !== 'recover-other') throw e;
      await H.wait(Math.max(50, Math.min(400, (e.until || Date.now() + 200) - Date.now() + 50)));
    }
  }
  throw new Error(d.label + ': a restauração não terminou');
}

/** troca a conta do aparelho para a do código, conferindo que o código novo aparece e que a chave nova passa a valer */
async function restore(d, code) {
  d.lastNew = '';
  const r = await d.id.restoreCode(code);
  assert.strictEqual(r.ok, true, d.label + ': código aceito');
  assert.ok(d.lastNew && d.lastNew !== code, d.label + ': código novo mostrado antes do pedido');
  const newCode = d.lastNew;
  await finish(d);
  const st = d.id.status();
  assert.strictEqual(st.hasPrimary, true, d.label + ': aparelho virou o principal');
  return { id: r.id, newCode };
}

/** abre uma conexão nova e entra na sala com o token da identidade */
async function enter(d, room, name) {
  const c = await d.open();
  const s = await d.id.login();
  c.msgs.length = 0;
  d.send(room ? { t: 'join', code: room, name, token: s.token } : { t: 'create', style: 'amazora', bots: 0, name, token: s.token });
  assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined' || m.t === 'err'), 5000), d.label + ': resposta da entrada');
  const j = c.msgs.find(m => m.t === 'joined');
  assert.ok(j, d.label + ': entrou (' + JSON.stringify(c.msgs.filter(m => m.t === 'err')) + ')');
  return j;
}

/** dados da conta (nome guardado) pelo token: confirma que os dados seguem a conta, não o aparelho */
async function accountName(d) {
  const s = await d.id.login();
  d.conn.msgs.length = 0;
  d.send({ t: 'accountget', token: s.token });
  assert.ok(await H.until(() => d.conn.msgs.some(m => m.t === 'account'), 4000));
  const a = d.conn.msgs.find(m => m.t === 'account');
  assert.ok(!a.err, d.label + ': conta carregada');
  return a.data && a.data.name;
}

/** um código usado (ou de chave revogada) não pode restaurar mais nada */
async function codeIsDead(port, ip, code) {
  const v = new Device(port, ip, 'verificador');
  await v.open();
  const r = await v.id.restoreCode(code);
  assert.strictEqual(r.ok, true, 'o código ainda decodifica localmente');
  await assert.rejects(v.id.finishRestore(), e => e.code === 'bad-signature', 'o servidor recusa o código antigo');
  v.close();
}

/** a chave do aparelho antigo (cópia do IndexedDB de antes da troca) não autentica mais */
async function oldKeyIsDead(port, ip, snapshot, storageFk) {
  const v = new Device(port, ip, 'aparelho-antigo');
  const sandbox = {
    crypto: crypto.webcrypto,
    indexedDB: fakeIDB(snapshot),
    localStorage: fakeStorage(),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    console,
    SKYREC
  };
  sandbox.localStorage.setItem('skyke_fk', storageFk);
  vm.runInContext(SOURCE, vm.createContext(sandbox), { filename: 'identity.js' });
  v.id = sandbox.SKYID;
  await v.open();
  await v.id.load();
  await assert.rejects(v.id.auth('join'), e => e.code === 'bad-signature');
  v.close();
}

test('simulado: 5 jogadores trocam de conta várias vezes ao mesmo tempo, com queda de conexão e cache limpo', { skip: H.missing(), timeout: 180000 }, async t => {
  const srv = await H.startServer({ IDENTITY_GRACE_MS: String(GRACE), PLAYER_DATA_FILE: '0' });
  t.after(() => srv.stop());
  const devs = Array.from({ length: N }, (_, i) => new Device(srv.port, '198.51.100.' + (10 + i), 'jogador' + (i + 1)));
  t.after(() => devs.forEach(d => d.close()));
  const names = Array.from({ length: N }, (_, i) => 'Conta' + (i + 1));
  /** conta → código atual, id e quem a usa agora */
  const acct = [];

  // rodada 0: cada jogador cria a sua conta, entra na mesma sala e guarda o código
  await devs[0].open();
  await devs[0].id.ensure();
  const host = await enter(devs[0], '', names[0]);
  const room = host.code;
  await Promise.all(
    devs.slice(1).map(async (d, k) => {
      await d.open();
      await d.id.ensure();
      await enter(d, room, names[k + 1]);
    })
  );
  for (let i = 0; i < N; i++) {
    const code = await devs[i].id.backupCode({ name: names[i] });
    assert.ok(code);
    acct.push({ id: devs[i].id.id(), code, name: names[i] });
    assert.strictEqual(await accountName(devs[i]), names[i]);
  }
  assert.strictEqual(new Set(acct.map(a => a.id)).size, N, 'contas distintas');

  // rodadas 1..4: todos trocam de conta AO MESMO TEMPO (o jogador i pega a conta i+r). Cada rodada mistura cache limpo,
  // "Esquecer conta" e queda de conexão no meio do pedido de recuperação.
  const holder = acct.map((_, i) => i); // conta → aparelho que a usa
  for (let r = 1; r <= 4; r++) {
    const snaps = devs.map(d => ({ data: new Map(d.idb._data), fk: d.storage.getItem('skyke_fk') }));
    const plan = devs.map((_, i) => (i + r) % N); // aparelho i → conta plan[i]
    const results = await Promise.all(
      devs.map(async (d, i) => {
        const a = acct[plan[i]];
        const mode = (i + r) % 3; // 0: cache limpo · 1: esquecer conta · 2: cache limpo + queda no meio do pedido
        if (mode === 1) await d.id.forget();
        else d.wipe();
        await d.open();
        if (mode !== 2) return { i, ...(await restore(d, a.code)) };
        // queda: o pedido de recuperação chega ao servidor, mas a resposta se perde e a conexão cai
        d.lastNew = '';
        assert.strictEqual((await d.id.restoreCode(a.code)).ok, true);
        const newCode = d.lastNew;
        d.dropReplies = true;
        const lost = d.id.finishRestore().catch(e => e);
        await H.wait(300);
        d.drop();
        d.dropReplies = false;
        const e = await lost;
        assert.ok(e && typeof e.message === 'string', d.label + ': o pedido sem resposta falha (' + (e && e.message) + ')');
        await d.open(); // reconecta: o aparelho conclui com as MESMAS chaves, sem pedir o código de novo
        await finish(d);
        assert.strictEqual(d.id.status().hasPrimary, true);
        return { i, id: a.id, newCode };
      })
    );
    for (const res of results) {
      const a = acct[plan[res.i]];
      assert.strictEqual(res.id, a.id, devs[res.i].label + ' ficou com a conta certa');
      assert.strictEqual(devs[res.i].id.id(), a.id);
      const oldCode = a.code;
      a.code = res.newCode;
      // o aparelho que tinha a conta antes: a chave guardada nele não autentica mais
      const prev = holder[plan[res.i]];
      await oldKeyIsDead(srv.port, '192.0.2.' + (10 + res.i), snaps[prev].data, snaps[prev].fk);
      holder[plan[res.i]] = res.i;
      // o código usado morreu
      await codeIsDead(srv.port, '192.0.2.' + (30 + res.i), oldCode);
    }
    // todos voltam para a sala com a conta nova; os dados (nome) acompanham a conta
    const joined = await Promise.all(devs.map((d, i) => enter(d, room, acct[plan[i]].name)));
    for (let i = 0; i < N; i++) assert.strictEqual(await accountName(devs[i]), acct[plan[i]].name, 'os dados seguem a conta');
    const last = joined[joined.length - 1];
    assert.ok(last.players.filter(p => !p.bot).length >= N, 'os 5 na mesma sala');
  }

  // queda de conexão durante o jogo: todos caem e voltam com resume
  const rks = await Promise.all(
    devs.map(async (d, i) => {
      const j = await enter(d, room, acct[(i + 4) % N].name);
      return j.token;
    })
  );
  devs.forEach(d => d.drop());
  await H.wait(200);
  const resumed = await Promise.all(
    devs.map(async (d, i) => {
      const c = await d.open();
      d.send({ t: 'resume', code: room, token: rks[i] });
      assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined' || (m.t === 'err' && m.scope === 'resume')), 5000));
      return c.msgs.find(m => m.t === 'joined');
    })
  );
  assert.ok(resumed.every(j => j && j.resume === 1), 'todos voltaram para a sala depois da queda: ' + JSON.stringify(devs.map(d => d.conn.msgs.filter(m => m.t === 'err'))));
  // depois do resume a conexão continua com a conta sem mandar o token de novo: fazenda e dados da conta respondem
  for (const d of devs) {
    d.conn.msgs.length = 0;
    d.send({ t: 'farmget' });
    d.send({ t: 'accountget' });
    assert.ok(await H.until(() => d.conn.msgs.some(m => m.t === 'account'), 4000));
    assert.ok(!d.conn.msgs.some(m => m.t === 'err' && m.scope === 'farm'), d.label + ': fazenda depois da queda');
    const a = d.conn.msgs.find(m => m.t === 'account');
    assert.ok(!a.err, d.label + ': conta depois da queda');
    assert.strictEqual(a.data.name, acct[(devs.indexOf(d) + 4) % N].name, d.label + ': a mesma conta depois da queda');
  }

  assert.ok(!/erro fatal|unhandled|TypeError/.test(srv.log()), srv.log());
});

test('simulado: dois aparelhos restauram a mesma conta ao mesmo tempo com o mesmo código', { skip: H.missing(), timeout: 60000 }, async t => {
  const srv = await H.startServer({ IDENTITY_GRACE_MS: String(GRACE) });
  t.after(() => srv.stop());
  const owner = new Device(srv.port, '198.51.100.60', 'dono');
  await owner.open();
  await owner.id.ensure();
  const code = await owner.id.backupCode({ name: 'Ana' });
  const a = new Device(srv.port, '198.51.100.61', 'A'),
    b = new Device(srv.port, '198.51.100.62', 'B');
  t.after(() => [owner, a, b].forEach(d => d.close()));
  await Promise.all([a.open(), b.open()]);
  assert.strictEqual((await a.id.restoreCode(code)).ok, true);
  assert.strictEqual((await b.id.restoreCode(code)).ok, true);
  const codeA = a.lastNew,
    codeB = b.lastNew;
  const [ra, rb] = await Promise.allSettled([finish(a), finish(b)]);
  const ok = [ra, rb].filter(x => x.status === 'fulfilled').length;
  assert.strictEqual(ok, 1, 'só um dos dois fica com a conta: ' + JSON.stringify([ra.status, rb.status, ra.reason && ra.reason.message, rb.reason && rb.reason.message]));
  const [win, lose, winCode, loseCode] = ra.status === 'fulfilled' ? [a, b, codeA, codeB] : [b, a, codeB, codeA];
  assert.strictEqual(win.id.status().hasPrimary, true);
  assert.strictEqual(lose.id.status().hasPrimary, false);
  // o dono antigo e o código usado não valem mais; o código novo do perdedor nunca foi registrado; o do vencedor vale
  assert.strictEqual(await owner.conn.closed, 4001, 'a sessão do dono antigo foi encerrada pelo servidor');
  await owner.open();
  await assert.rejects(owner.id.auth('join'), e => e.code === 'bad-signature');
  await codeIsDead(srv.port, '192.0.2.70', code);
  await codeIsDead(srv.port, '192.0.2.71', loseCode);
  const c = new Device(srv.port, '198.51.100.63', 'C');
  t.after(() => c.close());
  await c.open();
  const r = await restore(c, winCode);
  assert.strictEqual(r.id, owner.id.id());
});

test('simulado: cache limpo durante a carência — vale o código novo mostrado antes do pedido', { skip: H.missing(), timeout: 60000 }, async t => {
  const srv = await H.startServer({ IDENTITY_GRACE_MS: String(GRACE) });
  t.after(() => srv.stop());
  const owner = new Device(srv.port, '198.51.100.80', 'dono');
  await owner.open();
  await owner.id.ensure();
  const code = await owner.id.backupCode({ name: 'Ana' });
  const d = new Device(srv.port, '198.51.100.81', 'novo');
  t.after(() => [owner, d].forEach(x => x.close()));
  await d.open();
  await d.id.restoreCode(code);
  const code1 = d.lastNew;
  await assert.rejects(d.id.finishRestore(), e => e.code === 'recover-pending');
  // o jogador limpa o cache no meio da carência e tenta de novo com o código ANTIGO: o servidor mantém o primeiro pedido
  d.wipe();
  await d.open();
  await d.id.restoreCode(code);
  await assert.rejects(d.id.finishRestore(), e => e.code === 'recover-other' || e.code === 'recover-pending');
  await H.wait(GRACE + 300);
  // a carência venceu: o primeiro pedido valeu e o código antigo morreu; o código novo #1 (mostrado na 1ª tentativa) entra
  await codeIsDead(srv.port, '192.0.2.90', code);
  d.wipe();
  await d.open();
  const r = await restore(d, code1);
  assert.strictEqual(r.id, owner.id.id());
});

test('simulado: depois de revogar as sessões com o código, a reconexão volta à sala mas sem a conta', { skip: H.missing(), timeout: 60000 }, async t => {
  const { payload } = require('../lib/identity.js');
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const d = new Device(srv.port, '198.51.100.90', 'dono');
  t.after(() => d.close());
  await d.open();
  await d.id.ensure();
  const code = await d.id.backupCode({ name: 'Ana' });
  const j = await enter(d, '', 'Ana');
  d.drop();
  // quem tem o código derruba as sessões da conta (escopo de recuperação: não muda a época)
  const rk = crypto.createPrivateKey({ key: Buffer.from(SKYREC.decodeV2(code).rec, 'base64url'), format: 'der', type: 'pkcs8' });
  const sign = data => crypto.sign('sha256', Buffer.from(data), { key: rk, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const c = await H.connect(srv.port, '198.51.100.91');
  t.after(() => c.ws.close());
  const id = d.id.id();
  c.ws.send(JSON.stringify({ t: 'auth', id, action: 'revoke' }));
  assert.ok(await H.until(() => c.msgs.some(m => m.t === 'challenge')));
  const ch = c.msgs.find(m => m.t === 'challenge');
  c.ws.send(JSON.stringify({ t: 'proof', id, nonce: ch.nonce, action: 'revoke', sig: sign(payload.auth(id, ch.nonce, 'revoke')) }));
  assert.ok(await H.until(() => c.msgs.some(m => m.t === 'session')));
  const s = c.msgs.find(m => m.t === 'session');
  assert.strictEqual(s.scope, 'recovery');
  c.ws.send(JSON.stringify({ t: 'idrev', token: s.token, epoch: s.epoch }));
  assert.ok(await H.until(() => c.msgs.some(m => m.t === 'idok' && m.op === 'revoke')), JSON.stringify(c.msgs.filter(m => m.t === 'err')));
  // a reconexão volta para a sala, mas a conta não: fazenda e dados pedem para entrar de novo
  const r = await d.open();
  d.send({ t: 'resume', code: j.code, token: j.token });
  assert.ok(await H.until(() => r.msgs.some(m => m.t === 'joined')));
  r.msgs.length = 0;
  d.send({ t: 'farmget' });
  d.send({ t: 'accountget' });
  assert.ok(await H.until(() => r.msgs.some(m => m.t === 'account')));
  assert.strictEqual(r.msgs.find(m => m.t === 'account').err, 'session');
  assert.ok(r.msgs.some(m => m.t === 'err' && m.scope === 'farm'));
});
