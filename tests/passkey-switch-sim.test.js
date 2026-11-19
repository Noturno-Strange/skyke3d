'use strict';
// Simulado com passkeys: 5 jogadores ao mesmo tempo trocando de conta pela passkey (cada conta tem a sua; umas sincronizadas,
// com contador 0, outras como chave física FIDO2, com contador que sobe), com cache do navegador limpo a cada troca e queda de
// conexão no meio da entrada. Usa o cliente de verdade (assets/identity.js num vm) e um autenticador de mentira que entrega os
// mesmos bytes de um navegador (tests/fake-authn.js), contra o servidor de verdade. Confere também que o código de recuperação e
// a passkey continuam valendo um depois do outro, e que a passkey de uma conta nunca entra em outra.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const H = require('./harness.js');
const FA = require('./fake-authn.js');
const SKYREC = require('../assets/recovery.js');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'assets', 'identity.js'), 'utf8');
const N = 5;
const GRACE = 1000;

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
const ab = buf => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const b64 = u8 => Buffer.from(u8).toString('base64url');

/**
 * Autenticador de uma conta: `counted` simula chave física (o contador sobe a cada uso); sem ele, passkey sincronizada (contador 0).
 * Guarda as passkeys que criou; na entrada usa a mais recente.
 */
function authenticator(origin, counted) {
  const creds = [];
  const err = name => Object.assign(new Error(name), { name });
  return {
    creds,
    credentials: {
      create: async ({ publicKey: o }) => {
        if (o.authenticatorSelection.userVerification !== 'required') throw err('NotSupportedError');
        const cred = FA.makeCred('es256');
        if (counted) cred.count = 1;
        creds.push(cred);
        const reg = FA.register(cred, { rpId: o.rp.id, origin, challenge: b64(o.challenge) });
        return {
          rawId: ab(cred.cidBuf),
          response: {
            clientDataJSON: ab(Buffer.from(reg.cd, 'base64url')),
            getAuthenticatorData: () => ab(Buffer.from(reg.ad, 'base64url')),
            getPublicKey: () => ab(Buffer.from(cred.spki, 'base64url')),
            getPublicKeyAlgorithm: () => -7
          }
        };
      },
      get: async ({ publicKey: o }) => {
        const cred = creds[creds.length - 1];
        if (!cred) throw err('NotAllowedError');
        if (counted) cred.count++;
        const a = FA.assert(cred, { rpId: o.rpId, origin, challenge: b64(o.challenge) });
        return {
          rawId: ab(cred.cidBuf),
          response: {
            clientDataJSON: ab(Buffer.from(a.cd, 'base64url')),
            authenticatorData: ab(Buffer.from(a.ad, 'base64url')),
            signature: ab(Buffer.from(a.sig, 'base64url'))
          }
        };
      }
    }
  };
}

/** um navegador em localhost (passkeys exigem https ou localhost), com o autenticador que estiver "plugado" (`authn`) */
class Device {
  constructor(port, ip, label) {
    this.port = port;
    this.ip = ip;
    this.label = label;
    this.authn = null;
    this.lastNew = '';
    this.dropReplies = false;
    this.wipe();
  }
  /** cache do navegador limpo: IndexedDB, localStorage e memória da página começam do zero */
  wipe(seed) {
    this.idb = fakeIDB(seed);
    this.storage = fakeStorage();
    function AuthenticatorAttestationResponse() {}
    AuthenticatorAttestationResponse.prototype.getPublicKey = function () {};
    AuthenticatorAttestationResponse.prototype.getAuthenticatorData = function () {};
    const dev = this;
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
      SKYREC,
      isSecureContext: true,
      PublicKeyCredential: function () {},
      AuthenticatorAttestationResponse,
      navigator: {
        credentials: {
          create: o => dev.authn.credentials.create(o),
          get: o => dev.authn.credentials.get(o)
        }
      }
    };
    vm.runInContext(SOURCE, vm.createContext(sandbox), { filename: 'identity.js' });
    this.id = sandbox.SKYID;
    this.id.setUi({ confirmNew: async code => ((this.lastNew = code), true) });
    if (this.conn) this.id.bind(m => this.send(m));
  }
  send(m) {
    this.conn.ws.send(JSON.stringify(m));
  }
  async open() {
    if (this.conn) this.conn.ws.terminate();
    const conn = await H.connect(this.port, this.ip, { host: 'localhost' });
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
  drop() {
    if (this.conn) this.conn.ws.terminate();
  }
  close() {
    if (this.conn) this.conn.ws.close();
  }
}

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

/** nome guardado na conta e acesso à fazenda pela conexão atual (sem mandar o token de novo) */
async function accountCheck(d) {
  d.conn.msgs.length = 0;
  d.send({ t: 'farmget' });
  d.send({ t: 'accountget' });
  assert.ok(await H.until(() => d.conn.msgs.some(m => m.t === 'account'), 4000));
  assert.ok(!d.conn.msgs.some(m => m.t === 'err' && m.scope === 'farm'), d.label + ': fazenda');
  const a = d.conn.msgs.find(m => m.t === 'account');
  assert.ok(!a.err, d.label + ': conta');
  return a.data && a.data.name;
}

/** a chave guardada num aparelho (cópia do IndexedDB) não autentica mais */
async function oldKeyIsDead(port, ip, snapshot) {
  const v = new Device(port, ip, 'aparelho-antigo');
  v.wipe(snapshot);
  await v.open();
  await v.id.load();
  await assert.rejects(v.id.auth('join'), e => e.code === 'bad-signature');
  v.close();
}

/** espera a carência e conclui a restauração pelo código */
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

test('simulado com passkey: 5 jogadores trocam de conta ao mesmo tempo, com cache limpo e queda de conexão', { skip: H.missing(), timeout: 240000 }, async t => {
  const srv = await H.startServer({ IDENTITY_GRACE_MS: String(GRACE) });
  t.after(() => srv.stop());
  const origin = 'http://localhost:' + srv.port;
  const devs = Array.from({ length: N }, (_, i) => new Device(srv.port, '198.51.100.' + (110 + i), 'jogador' + (i + 1)));
  t.after(() => devs.forEach(d => d.close()));
  // contas ímpares com chave física (contador), pares com passkey sincronizada
  const acct = Array.from({ length: N }, (_, i) => ({ name: 'Passe' + (i + 1), authn: authenticator(origin, i % 2 === 1), id: '', code: '' }));

  // rodada 0: cada um cria a conta, entra na sala, cadastra a passkey da conta e guarda o código
  await devs[0].open();
  await devs[0].id.ensure();
  const room = (await enter(devs[0], '', acct[0].name)).code;
  await Promise.all(
    devs.slice(1).map(async (d, k) => {
      await d.open();
      await d.id.ensure();
      await enter(d, room, acct[k + 1].name);
    })
  );
  await Promise.all(
    devs.map(async (d, i) => {
      d.authn = acct[i].authn;
      await d.id.preparePasskey('reg');
      const list = await d.id.addPasskey('Chave ' + (i + 1), acct[i].name);
      assert.strictEqual(list.length, 1);
      acct[i].id = d.id.id();
      acct[i].code = await d.id.backupCode({ name: acct[i].name });
      assert.ok(acct[i].code);
    })
  );
  assert.strictEqual(new Set(acct.map(a => a.id)).size, N);

  // rodadas 1..4: trocam de conta ao mesmo tempo, sempre com o cache limpo. Rodadas 1, 2 e 4 pela passkey (uma parte com queda
  // de conexão no meio da entrada); rodada 3 pelo código de recuperação, para conferir que código e passkey convivem.
  const holder = acct.map((_, i) => i);
  for (let r = 1; r <= 4; r++) {
    const snaps = devs.map(d => new Map(d.idb._data));
    const plan = devs.map((_, i) => (i + r) % N);
    const byCode = r === 3;
    await Promise.all(
      devs.map(async (d, i) => {
        const a = acct[plan[i]];
        d.wipe();
        d.authn = a.authn;
        await d.open();
        if (byCode) {
          d.lastNew = '';
          assert.strictEqual((await d.id.restoreCode(a.code)).ok, true, d.label + ': o código continua valendo depois da passkey');
          await finish(d);
          a.code = d.lastNew;
        } else if ((i + r) % 2 === 0) {
          // queda: o servidor recebe a entrada e troca a chave, mas a resposta se perde; a passkey entra de novo sem problema
          d.dropReplies = true;
          const lost = d.id.passkeyLogin().catch(e => e);
          await H.wait(400);
          d.drop();
          d.dropReplies = false;
          const e = await lost;
          assert.ok(e && typeof e.message === 'string', d.label + ': a entrada sem resposta falha');
          await d.open();
          const res = await d.id.passkeyLogin();
          assert.strictEqual(res.id, a.id);
        } else {
          const res = await d.id.passkeyLogin();
          assert.strictEqual(res.id, a.id, d.label + ': a passkey entra na conta dela');
        }
        assert.strictEqual(d.id.id(), a.id);
        assert.strictEqual(d.id.status().hasPrimary, true);
      })
    );
    for (let i = 0; i < N; i++) {
      await oldKeyIsDead(srv.port, '192.0.2.' + (110 + i), snaps[holder[plan[i]]]);
      holder[plan[i]] = i;
    }
    await Promise.all(devs.map((d, i) => enter(d, room, acct[plan[i]].name)));
    for (let i = 0; i < N; i++) assert.strictEqual(await accountCheck(devs[i]), acct[plan[i]].name, 'os dados seguem a conta');
    // a lista de passkeys continua na conta depois de cada troca (pela passkey ou pelo código)
    for (let i = 0; i < N; i++) assert.strictEqual((await devs[i].id.listPasskeys()).list.length, 1);
  }

  // queda durante o jogo: todos voltam por resume, ainda com a conta
  const tokens = await Promise.all(devs.map(async (d, i) => (await enter(d, room, acct[(i + 4) % N].name)).token));
  devs.forEach(d => d.drop());
  await H.wait(200);
  await Promise.all(
    devs.map(async (d, i) => {
      const c = await d.open();
      d.send({ t: 'resume', code: room, token: tokens[i] });
      assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined'), 5000), d.label + ': voltou depois da queda');
    })
  );
  for (let i = 0; i < N; i++) assert.strictEqual(await accountCheck(devs[i]), acct[(i + 4) % N].name);
  assert.ok(!/erro fatal|unhandled|TypeError/.test(srv.log()), srv.log());
});

test('simulado com passkey: a passkey de uma conta não entra em outra, a revogada não entra e a mesma passkey em dois aparelhos fica com o último', { skip: H.missing(), timeout: 60000 }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const origin = 'http://localhost:' + srv.port;
  const ka = authenticator(origin, false),
    kb = authenticator(origin, false);
  const A = new Device(srv.port, '198.51.100.130', 'A'),
    B = new Device(srv.port, '198.51.100.131', 'B');
  t.after(() => [A, B].forEach(d => d.close()));
  await Promise.all([A.open(), B.open()]);
  await Promise.all([A.id.ensure(), B.id.ensure()]);
  A.authn = ka;
  B.authn = kb;
  await A.id.preparePasskey('reg');
  await A.id.addPasskey('A', 'Ana');
  await B.id.preparePasskey('reg');
  await B.id.addPasskey('B', 'Beto');

  // dois aparelhos novos entram com a MESMA passkey (sincronizada) quase ao mesmo tempo: os dois são aceitos em sequência, mas só
  // o último fica com a conta; o outro é derrubado e a chave dele não vale mais
  const X = new Device(srv.port, '198.51.100.132', 'X'),
    Y = new Device(srv.port, '198.51.100.133', 'Y');
  t.after(() => [X, Y].forEach(d => d.close()));
  X.authn = ka;
  Y.authn = ka;
  await Promise.all([X.open(), Y.open()]);
  const [rx, ry] = await Promise.all([X.id.passkeyLogin(), Y.id.passkeyLogin()]);
  await Promise.all([X.open(), Y.open()]); // o servidor derruba a conexão do que perdeu: abre de novo para perguntar
  assert.strictEqual(rx.id, A.id.id());
  assert.strictEqual(ry.id, A.id.id());
  const xOk = await X.id.auth('join').then(() => true, () => false),
    yOk = await Y.id.auth('join').then(() => true, () => false);
  assert.strictEqual(Number(xOk) + Number(yOk), 1, 'só um aparelho fica com a conta: ' + JSON.stringify([xOk, yOk]));
  const win = xOk ? X : Y;

  // a passkey da conta B entra só na conta B
  const Z = new Device(srv.port, '198.51.100.134', 'Z');
  t.after(() => Z.close());
  Z.authn = kb;
  await Z.open();
  assert.strictEqual((await Z.id.passkeyLogin()).id, B.id.id());

  // revogada pelo dono, a passkey não entra mais
  await win.open();
  await win.id.removeAllPasskeys();
  const W = new Device(srv.port, '198.51.100.135', 'W');
  t.after(() => W.close());
  W.authn = ka;
  await W.open();
  await assert.rejects(W.id.passkeyLogin(), e => e.code === 'pk-fail');
  assert.strictEqual(W.id.status(), null, 'nada guardado depois da falha');
});
