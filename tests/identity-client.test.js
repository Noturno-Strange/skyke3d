'use strict';
// Identidade no navegador (assets/identity.js): troca de recuperação interrompida.
// A chave nova é guardada antes do pedido; se a resposta se perder, a próxima entrada
// conclui a troca com o mesmo pedido idempotente e não deixa a identidade sem recuperação.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const H = require('./harness.js');
const { fidOf } = require('../lib/ids.js');
const { payload: serverPayload } = require('../lib/identity.js');
const SKYREC = require('../assets/recovery.js');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'assets', 'identity.js'), 'utf8');

// IndexedDB mínimo: um mapa por banco, com get/put/delete assíncronos como no navegador.
function fakeIDB() {
  const data = new Map();
  const stores = new Set();
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
        put: (v, k) => {
          data.set(k, v);
          return request(undefined);
        },
        delete: k => {
          data.delete(k);
          return request(undefined);
        }
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
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k)
  };
}

// Servidor de mentira: registra, autentica e aplica a troca de recuperação antes de "perder" a resposta.
function fakeServer() {
  const st = { id: '', gen: 1, rgen: 1, epoch: 0, rpk: '', token: 'token-1' };
  let instance = null,
    drop = false;
  const sent = [];
  const reply = m => instance && instance.onMessage(m);
  const session = () => ({
    t: 'session',
    id: st.id,
    token: st.token,
    exp: Date.now() + 3600000,
    gen: st.gen,
    rgen: st.rgen,
    epoch: st.epoch,
    scope: 'primary'
  });
  function send(m) {
    sent.push(m);
    if (m.t === 'idreg') {
      st.id = fidOf(m.k);
      reply({ t: 'idok', op: 'register', id: st.id, gen: st.gen, rgen: st.rgen, epoch: st.epoch });
      return;
    }
    if (m.t === 'auth') {
      reply({
        t: 'challenge',
        id: m.id,
        action: m.action,
        nonce: 'n' + sent.length,
        exp: Date.now() + 60000,
        gen: st.gen,
        rgen: st.rgen,
        epoch: st.epoch
      });
      return;
    }
    if (m.t === 'proof') {
      reply(session());
      return;
    }
    if (m.t === 'idrot' && m.rpk) {
      // aplica a troca (mesmo que a resposta não chegue ao cliente)
      if (st.rgen === m.rgen) {
        st.rgen++;
        st.epoch++;
        st.rpk = m.rpk;
        st.token = 'token-2';
      }
      if (drop) {
        drop = false;
        throw new Error('resposta perdida');
      }
      if (st.rgen === m.rgen + 1 && st.rpk === m.rpk) {
        reply({
          t: 'idok',
          op: 'rotate-recovery',
          id: st.id,
          gen: st.gen,
          rgen: st.rgen,
          epoch: st.epoch,
          token: st.token,
          exp: Date.now() + 3600000
        });
      } else reply({ t: 'err', scope: 'idrot', code: 'stale', msg: 'stale' });
    }
  }
  return {
    st,
    sent,
    send,
    loseNextResponse: () => {
      drop = true;
    },
    bind: id => {
      instance = id;
    }
  };
}

function boot(server, idb, storage) {
  const sandbox = {
    crypto: crypto.webcrypto,
    indexedDB: idb,
    localStorage: storage,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    console,
    SKYREC
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SOURCE, ctx, { filename: 'identity.js' });
  const id = sandbox.SKYID;
  id.bind(server.send);
  server.bind(id);
  return id;
}

test('payloads do cliente batem com os do servidor (mesma string canônica)', () => {
  const id = boot(fakeServer(), fakeIDB(), fakeStorage());
  const pk = 'A'.repeat(124);
  assert.strictEqual(id.payload.register('abcdefghijkl', pk, pk), serverPayload.register('abcdefghijkl', pk, pk));
  assert.strictEqual(id.payload.auth('abcdefghijkl', 'nonce', 'join'), serverPayload.auth('abcdefghijkl', 'nonce', 'join'));
  assert.strictEqual(id.payload.rotate('abcdefghijkl', 3, pk), serverPayload.rotate('abcdefghijkl', 3, pk));
  assert.strictEqual(
    id.payload.rotateRecovery('abcdefghijkl', 4, pk),
    serverPayload.rotateRecovery('abcdefghijkl', 4, pk)
  );
  assert.strictEqual(id.payload.revoke('abcdefghijkl', 5), serverPayload.revoke('abcdefghijkl', 5));
  assert.strictEqual(id.payload.recover('abcdefghijkl', 6, pk), serverPayload.recover('abcdefghijkl', 6, pk));
  assert.strictEqual(
    id.payload.cancelRecovery('abcdefghijkl', 7),
    serverPayload.cancelRecovery('abcdefghijkl', 7)
  );
});

test('troca de recuperação sem resposta: a chave nova fica pendente e a próxima entrada conclui', async () => {
  const server = fakeServer(),
    idb = fakeIDB(),
    storage = fakeStorage();

  // primeira entrada: registra e autentica
  const first = boot(server, idb, storage);
  const login = await first.ensure();
  assert.strictEqual(login.id, server.st.id);
  assert.strictEqual(first.status().rgen, 1);

  // o servidor aplica a troca, mas a resposta se perde
  server.loseNextResponse();
  await assert.rejects(first.rotateRecovery(), /resposta perdida/);
  const pending = first.status();
  assert.strictEqual(pending.pendingRecovery, true, 'a chave nova fica guardada antes da resposta');
  assert.strictEqual(pending.rgen, 1, 'a geração local ainda é a antiga');

  // "recarregar a página": outra instância com o mesmo IndexedDB e o mesmo servidor
  const second = boot(server, idb, storage);
  const again = await second.ensure();
  assert.strictEqual(again.id, server.st.id);
  assert.strictEqual(second.status().pendingRecovery, false, 'a pendência foi concluída');
  assert.strictEqual(second.status().rgen, 2, 'a geração da recuperação avançou');
  assert.strictEqual(server.st.rgen, 2);

  // a chave promovida é a mesma que o servidor aceitou (e não a antiga)
  const code = await second.backupCode({ name: 'Ana' });
  const dec = SKYREC.decodeV2(code);
  assert.strictEqual(dec.ok, true);
  const pub = crypto
    .createPublicKey(crypto.createPrivateKey({ key: Buffer.from(dec.rec, 'base64url'), format: 'der', type: 'pkcs8' }))
    .export({ format: 'der', type: 'spki' })
    .toString('base64url');
  assert.strictEqual(pub, server.st.rpk);
});

test('duas trocas simultâneas: a fila local evita duas chaves e a segunda não gera pendência', async () => {
  const server = fakeServer(),
    idb = fakeIDB(),
    storage = fakeStorage();
  const id = boot(server, idb, storage);
  await id.ensure();

  const [a, b] = await Promise.all([id.rotateRecovery(), id.rotateRecovery()]);
  assert.strictEqual(a.t, 'idok');
  assert.strictEqual(b.t, 'idok');
  assert.strictEqual(server.st.rgen, 3, 'cada troca avança uma geração, sem perder chave');
  assert.strictEqual(id.status().pendingRecovery, false);
});

// Ponte entre um WebSocket real do servidor e o módulo do navegador rodando no VM.
async function realClient(port, idb = fakeIDB(), storage = fakeStorage()) {
  const conn = await H.connect(port, '203.0.113.90');
  const bridge = {
    id: null,
    send: m => conn.ws.send(JSON.stringify(m)),
    bind: id => {
      bridge.id = id;
    }
  };
  conn.ws.on('message', (d, bin) => {
    if (bin || !bridge.id) return;
    try {
      bridge.id.onMessage(JSON.parse(d));
    } catch (e) {
      /* mensagem que não é de identidade */
    }
  });
  return { conn, id: boot(bridge, idb, storage), close: () => conn.ws.close() };
}

test('servidor real: registrar, trocar chaves, revogar sessões e restaurar em outro aparelho', { skip: H.missing() }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-idclient-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const srv = await H.startServer({ IDENTITY_FILE: path.join(dir, 'identity.json') });
  t.after(() => srv.stop());

  // primeiro aparelho: registra e entra; o id vem da chave antiga do aparelho
  const idb = fakeIDB(),
    storage = fakeStorage();
  const a = await realClient(srv.port, idb, storage);
  t.after(() => a.close());
  const first = await a.id.ensure();
  assert.strictEqual(first.id, fidOf(storage.getItem('skyke_fk')));
  assert.strictEqual(a.id.status().gen, 1);
  assert.strictEqual(a.id.status().rgen, 1);

  // troca da recuperação: a geração avança e a chave nova passa a valer
  const rr = await a.id.rotateRecovery();
  assert.strictEqual(rr.t, 'idok');
  assert.strictEqual(a.id.status().rgen, 2);
  assert.strictEqual(a.id.status().epoch, 1);

  // troca da principal: geração e época avançam
  const rp = await a.id.rotatePrimary();
  assert.strictEqual(rp.t, 'idok');
  assert.strictEqual(a.id.status().gen, 2);
  assert.strictEqual(a.id.status().epoch, 2);

  // segunda conexão da mesma identidade (outra aba) cai na revogação de sessões
  const b = await realClient(srv.port, idb, storage);
  t.after(() => b.close());
  await b.id.ensure();
  await a.id.revokeSessions();
  assert.strictEqual(a.id.status().epoch, 3);
  assert.strictEqual(await b.conn.closed, 4001, 'a outra sessão é encerrada');

  // o código tem de ser emitido depois das trocas: o antigo já não vale
  const code = await a.id.backupCode({ name: 'Ana' });
  assert.ok(code);
  const dev2 = await realClient(srv.port, fakeIDB(), fakeStorage());
  t.after(() => dev2.close());
  const restored = await dev2.id.restoreCode(code);
  assert.strictEqual(restored.ok, true);
  assert.strictEqual(restored.v, 2);
  assert.strictEqual(restored.id, a.id.id());
  const done = await dev2.id.finishRestore();
  assert.strictEqual(done.id, restored.id);
  assert.strictEqual(dev2.id.status().gen, 3, 'a recuperação troca a principal sem carência');
  assert.strictEqual(dev2.id.status().epoch, 4);

  // a chave principal antiga não autentica mais depois da recuperação
  const old = await realClient(srv.port, idb, storage);
  t.after(() => old.close());
  await old.id.load();
  await assert.rejects(old.id.auth('join'), e => e.code === 'bad-signature');
});
