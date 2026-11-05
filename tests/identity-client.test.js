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
    removeItem: k => m.delete(k),
    _keys: () => [...m.keys()]
  };
}

// verifica uma assinatura P-256 (IEEE P1363) com a chave pública em SPKI base64url, como o servidor faz
function verifies(spki, data, sig) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(spki, 'base64url'), format: 'der', type: 'spki' });
    return crypto.verify('sha256', Buffer.from(data, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
  } catch (e) {
    return false;
  }
}
// a chave pública (SPKI, base64url) da chave privada que está dentro de um código v2
function pubOfCode(code) {
  const dec = SKYREC.decodeV2(code);
  return crypto
    .createPublicKey(crypto.createPrivateKey({ key: Buffer.from(dec.rec, 'base64url'), format: 'der', type: 'pkcs8' }))
    .export({ format: 'der', type: 'spki' })
    .toString('base64url');
}

// Servidor de mentira: registra, autentica e aplica a troca de recuperação antes de "perder" a resposta.
function fakeServer() {
  const st = { id: '', gen: 1, rgen: 1, epoch: 0, pk: '', rpk: '', token: 'token-1', joinFails: false, idrecs: [], pendingUntil: 0, dropRec: false };
  let instance = null,
    drop = false,
    dropBefore = false;
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
      st.pk = m.pk;
      st.rpk = m.rpk;
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
      // a chave nova de uma recuperação em carência ainda não vale: o servidor responde como o real
      if (m.action === 'join' && st.joinFails) reply({ t: 'err', scope: 'proof', code: 'bad-signature', msg: 'Assinatura inválida.' });
      else reply(session());
      return;
    }
    if (m.t === 'idrec') {
      st.idrecs.push(m);
      if (st.dropRec) {
        st.dropRec = false;
        throw new Error('resposta perdida');
      }
      reply({ t: 'idok', op: 'recover', id: st.id, gen: st.gen, rgen: st.rgen, epoch: st.epoch, pending: true, until: st.pendingUntil });
      return;
    }
    if (m.t === 'idrot' && m.pk) {
      // troca da chave principal: exige a assinatura da principal E a da recuperação, como o servidor real
      const data = serverPayload.rotate(st.id, m.gen, m.pk);
      if (!verifies(st.pk, data, m.sigOld) || !verifies(st.rpk, data, m.sigRec)) {
        reply({ t: 'err', scope: 'idrot', code: 'bad-signature', msg: 'Assinatura inválida.' });
        return;
      }
      st.pk = m.pk;
      st.gen++;
      st.epoch++;
      st.token = 'token-3';
      reply({ t: 'idok', op: 'rotate', id: st.id, gen: st.gen, rgen: st.rgen, epoch: st.epoch, token: st.token, exp: Date.now() + 3600000 });
      return;
    }
    if (m.t === 'idrot' && m.rpk) {
      if (dropBefore) {
        dropBefore = false;
        throw new Error('pedido perdido'); // o pedido nem chega ao servidor
      }
      // aplica a troca (mesmo que a resposta não chegue ao cliente); a geração certa exige as DUAS assinaturas
      if (st.rgen === m.rgen) {
        const data = serverPayload.rotateRecovery(st.id, m.rgen, m.rpk);
        if (!verifies(st.rpk, data, m.sigRec) || !verifies(st.pk, data, m.sigOld)) {
          reply({ t: 'err', scope: 'idrot', code: 'bad-signature', msg: 'Assinatura inválida.' });
          return;
        }
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
    loseNextRequest: () => {
      dropBefore = true;
    },
    bind: id => {
      instance = id;
    }
  };
}

function boot(server, idb, storage, extra = {}) {
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
    SKYREC,
    ...extra
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

test('troca de recuperação sem resposta: só a chave PÚBLICA fica pendente e a próxima entrada confere com o servidor', async () => {
  const server = fakeServer(),
    idb = fakeIDB(),
    storage = fakeStorage();

  // primeira entrada: registra e autentica
  const first = boot(server, idb, storage);
  const shown = [];
  first.setUi({
    confirmNew: async code => {
      shown.push(code);
      return true;
    }
  });
  const login = await first.ensure();
  assert.strictEqual(login.id, server.st.id);
  assert.strictEqual(first.status().rgen, 1);

  // o servidor aplica a troca, mas a resposta se perde
  server.loseNextResponse();
  await assert.rejects(first.rotateRecovery({ name: 'Ana' }), /resposta perdida/);
  assert.strictEqual(shown.length, 1, 'o jogador viu o código novo ANTES do pedido');
  const pending = first.status();
  assert.strictEqual(pending.pendingRecovery, true, 'a troca fica registrada até o servidor confirmar');
  assert.strictEqual(pending.rgen, 1, 'a geração local ainda é a antiga');
  const stored = idb._data.get('me');
  assert.deepStrictEqual(Object.keys(stored.pendingRecovery).sort(), ['rgen', 'rpk'], 'a troca pendente leva só dados públicos');
  assert.ok(!('recovery' in stored), 'nenhuma chave privada de recuperação no IndexedDB');

  // "recarregar a página": outra instância com o mesmo IndexedDB e o mesmo servidor
  const second = boot(server, idb, storage);
  const again = await second.ensure();
  assert.strictEqual(again.id, server.st.id);
  assert.strictEqual(again.recovery, 'applied', 'o jogador fica sabendo que vale o código novo');
  assert.strictEqual(second.status().pendingRecovery, false, 'a pendência foi concluída');
  assert.strictEqual(second.status().rgen, 2, 'a geração da recuperação avançou');
  assert.strictEqual(server.st.rgen, 2);
  assert.strictEqual(second.status().codeReady, false, 'depois de recarregar a chave de recuperação não está em lugar nenhum do aparelho');
  assert.strictEqual(await second.backupCode({ name: 'Ana' }), null);

  // o código que o jogador viu antes do pedido é o que o servidor passou a aceitar
  assert.strictEqual(pubOfCode(shown[0]), server.st.rpk);
});

test('troca de recuperação que o servidor não recebeu: a próxima entrada descarta a pendência e avisa que vale o código anterior', async () => {
  const server = fakeServer(),
    idb = fakeIDB(),
    storage = fakeStorage();
  const first = boot(server, idb, storage);
  first.setUi({ confirmNew: async () => true });
  await first.ensure();
  const rpkAntes = server.st.rpk;
  server.loseNextRequest();
  await assert.rejects(first.rotateRecovery(), /pedido perdido/);
  assert.strictEqual(first.status().pendingRecovery, true);

  const second = boot(server, idb, storage);
  const again = await second.ensure();
  assert.strictEqual(again.recovery, 'dropped', 'o jogador fica sabendo que a troca não valeu');
  assert.strictEqual(second.status().pendingRecovery, false);
  assert.strictEqual(server.st.rgen, 1, 'o servidor continua com a chave de recuperação anterior');
  assert.strictEqual(server.st.rpk, rpkAntes);
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
async function realClient(port, idb = fakeIDB(), storage = fakeStorage(), spy = null) {
  const conn = await H.connect(port, '203.0.113.90');
  const bridge = {
    id: null,
    send: m => {
      if (spy) spy.push(m);
      conn.ws.send(JSON.stringify(m));
    },
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
  // carência 0: o operador liberou a recuperação imediata de propósito (o padrão do servidor é 24 h)
  const srv = await H.startServer({ IDENTITY_FILE: path.join(dir, 'identity.json'), IDENTITY_GRACE_MS: '0' });
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
  assert.strictEqual(dev2.id.status().gen, 3, 'com carência 0 do operador a recuperação troca a principal na hora');
  assert.strictEqual(dev2.id.status().epoch, 4);

  // a chave principal antiga não autentica mais depois da recuperação
  const old = await realClient(srv.port, idb, storage);
  t.after(() => old.close());
  await old.id.load();
  await assert.rejects(old.id.auth('join'), e => e.code === 'bad-signature');
});

// SK-01 (cliente): o navegador não pede carência menor; a chave nova fica guardada e a próxima entrada conclui.
// SK-04: a chave de recuperação do código só fica na memória; durante a espera o aparelho novo não pede o código de novo.
test('cliente: recuperação em carência guarda só a chave principal nova, não repete o pedido e conclui depois', async () => {
  const server = fakeServer(),
    idb = fakeIDB(),
    storage = fakeStorage();
  const a = boot(server, idb, storage);
  await a.ensure();
  const code = await a.backupCode({ name: 'Ana' });
  // outro aparelho restaura o código: sem chave principal ainda
  const bIdb = fakeIDB(),
    bStorage = fakeStorage();
  const b = boot(server, bIdb, bStorage);
  assert.strictEqual((await b.restoreCode(code)).ok, true);
  assert.ok(!('recovery' in bIdb._data.get('me')), 'a chave de recuperação do código não vai para o IndexedDB');
  server.st.pendingUntil = Date.now() + 5000;
  await assert.rejects(b.finishRestore(), e => e.code === 'recover-pending' && e.until === server.st.pendingUntil);
  assert.strictEqual(server.st.idrecs.length, 1);
  assert.strictEqual('grace' in server.st.idrecs[0], false, 'o navegador não manda "grace": quem decide a carência é o servidor');
  const st1 = b.status();
  assert.strictEqual(st1.hasPrimary, false);
  assert.strictEqual(st1.pendingPrimary, true, 'a chave nova está guardada');
  assert.strictEqual(st1.pendingUntil, server.st.pendingUntil);
  assert.strictEqual(st1.codeReady, false, 'o pedido foi aceito: a chave de recuperação saiu da memória');
  assert.ok(!('recovery' in bIdb._data.get('me')));

  // a carência ainda corre: a página recarrega e NADA é pedido de novo (nem o código ao jogador, nem outra chave)
  server.st.joinFails = true;
  const b2 = boot(server, bIdb, bStorage);
  let asked = 0;
  b2.setUi({
    askCode: async () => {
      asked++;
      return null;
    }
  });
  await assert.rejects(b2.finishRestore(), e => e.code === 'recover-pending' && e.until === server.st.pendingUntil);
  assert.strictEqual(asked, 0, 'durante a espera o jogador não precisa colar o código de novo');
  assert.strictEqual(server.st.idrecs.length, 1, 'não repete o pedido');

  // a carência venceu: a chave nova já é a principal do servidor e a tentativa seguinte entra com ela, sem novo pedido
  server.st.joinFails = false;
  const done = await b2.finishRestore();
  assert.strictEqual(done.id, server.st.id);
  assert.strictEqual(server.st.idrecs.length, 1, 'não pede recuperação de novo depois que a chave já vale');
  const st2 = b2.status();
  assert.strictEqual(st2.hasPrimary, true);
  assert.strictEqual(st2.pendingPrimary, false);
});

test('cliente: pedido de recuperação sem resposta é repetido com a MESMA chave nova, e o código é pedido de novo se a página recarregou', async () => {
  const server = fakeServer();
  const a = boot(server, fakeIDB(), fakeStorage());
  await a.ensure();
  const code = await a.backupCode({ name: 'Ana' });
  const bIdb = fakeIDB(),
    bStorage = fakeStorage();
  const b = boot(server, bIdb, bStorage);
  await b.restoreCode(code);
  server.st.dropRec = true; // o servidor registra o pedido, mas a resposta se perde
  await assert.rejects(b.finishRestore(), /resposta perdida/);
  assert.strictEqual(b.status().pendingPrimary, true);
  const pk1 = server.st.idrecs[0].pk;

  // a página recarrega: o jogo pede o código e o jogador cola
  server.st.joinFails = true;
  server.st.pendingUntil = Date.now() + 5000;
  const b2 = boot(server, bIdb, bStorage);
  const why = [];
  b2.setUi({
    askCode: async (w, tryCode) => {
      why.push(w);
      const r = await tryCode(code);
      return r.ok ? r.value : null;
    }
  });
  await assert.rejects(b2.finishRestore(), e => e.code === 'recover-pending');
  assert.strictEqual(why.join(), 'recover');
  assert.strictEqual(server.st.idrecs.length, 2);
  assert.strictEqual(server.st.idrecs[1].pk, pk1, 'mesma chave pública no pedido repetido');
});

test('cliente: a sessão da chave principal avisa de um pedido de recuperação pendente', async () => {
  const server = fakeServer();
  const id = boot(server, fakeIDB(), fakeStorage());
  await id.ensure();
  // o servidor passa a avisar na prova de "join"
  const realSend = server.send;
  const warned = { ...server };
  server.send = m => {
    if (m.t === 'proof' && m.action === 'join') {
      const until = Date.now() + 3600000;
      id.onMessage({ t: 'session', id: server.st.id, token: 'tok-aviso', exp: Date.now() + 3600000, gen: 1, rgen: 1, epoch: 0, scope: 'primary', pending: { until } });
      return;
    }
    realSend(m);
  };
  id.bind(server.send);
  const again = await id.auth('join');
  assert.ok(again.pending && again.pending.until > Date.now());
  assert.ok(id.status().alert > Date.now(), 'status expõe o aviso para a interface');
  void warned;
});

test('servidor real: restaurar em outro aparelho espera a carência e conclui; o dono é avisado e pode cancelar', { skip: H.missing() }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-idgrace-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const srv = await H.startServer({ IDENTITY_FILE: path.join(dir, 'identity.json'), IDENTITY_GRACE_MS: '700' });
  t.after(() => srv.stop());

  // dono: tem a chave principal neste aparelho e gera o código de recuperação
  const idb = fakeIDB(),
    storage = fakeStorage();
  const owner = await realClient(srv.port, idb, storage);
  t.after(() => owner.close());
  await owner.id.ensure();
  const code = await owner.id.backupCode({ name: 'Ana' });

  // quem tem o código tenta restaurar em outro aparelho: fica em carência
  const spy = [];
  const dev2 = await realClient(srv.port, fakeIDB(), fakeStorage(), spy);
  t.after(() => dev2.close());
  assert.strictEqual((await dev2.id.restoreCode(code)).ok, true);
  await assert.rejects(dev2.id.finishRestore(), e => e.code === 'recover-pending' && e.until > Date.now());
  assert.ok(spy.some(m => m.t === 'idrec'), 'o pedido foi enviado');
  assert.ok(spy.filter(m => m.t === 'idrec').every(m => !('grace' in m)), 'sem "grace" no pedido do navegador');
  assert.strictEqual(dev2.id.status().hasPrimary, false);

  // o dono entra de novo e é avisado; a chave principal dele continua valendo
  const owner2 = await realClient(srv.port, idb, storage);
  t.after(() => owner2.close());
  const login = await owner2.id.ensure();
  assert.ok(login.pending > Date.now(), 'o dono vê o pedido pendente ao entrar');
  assert.ok(owner2.id.status().alert > 0);

  // o dono cancela: o aviso some e a chave nova do outro aparelho deixa de ser aplicada
  await owner2.id.cancelRecovery();
  assert.strictEqual(owner2.id.status().alert, 0);
  await new Promise(r => setTimeout(r, 900)); // a carência original venceria agora
  const retry = await realClient(srv.port, idb, storage);
  t.after(() => retry.close());
  const still = await retry.id.ensure();
  assert.ok(!still.pending, 'sem pedido pendente depois do cancelamento');
  assert.strictEqual(retry.id.status().gen, 1, 'a chave do dono não foi trocada');

  // sem cancelar, a carência vence e o outro aparelho conclui com a mesma chave nova
  const dev3 = await realClient(srv.port, fakeIDB(), fakeStorage());
  t.after(() => dev3.close());
  await dev3.id.restoreCode(code);
  await assert.rejects(dev3.id.finishRestore(), e => e.code === 'recover-pending');
  await new Promise(r => setTimeout(r, 900));
  const fin = await dev3.id.finishRestore();
  assert.strictEqual(fin.id, owner.id.id());
  assert.strictEqual(dev3.id.status().hasPrimary, true);
  assert.strictEqual(dev3.id.status().pendingPrimary, false);
});

// SK-02 (cliente): o navegador paga a prova de trabalho do registro e se registra de novo se o servidor perdeu a identidade.
test('servidor real: o cliente resolve a prova de trabalho do registro sozinho', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ IDENTITY_POW: '12' });
  t.after(() => srv.stop());
  const spy = [];
  const a = await realClient(srv.port, fakeIDB(), fakeStorage(), spy);
  t.after(() => a.close());
  const login = await a.id.ensure();
  assert.ok(login.token, 'registrou e entrou');
  const regs = spy.filter(m => m.t === 'idreg');
  assert.strictEqual(regs.length, 2, 'primeiro pedido sem prova, depois com a prova que o servidor pediu');
  assert.strictEqual(regs[0].pow, undefined);
  assert.match(regs[1].pow, /^\d{1,12}$/);
});

function spki() {
  return crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
}

test('servidor real: servidor que perdeu o registro recebe as mesmas chaves de novo e o jogador entra sem perceber', { skip: H.missing() }, async t => {
  const idb = fakeIDB(),
    storage = fakeStorage();
  const spy = [];
  const srvA = await H.startServer({});
  const a = await realClient(srvA.port, idb, storage, spy);
  await a.id.ensure();
  a.close();
  await srvA.stop();
  const original = spy.find(m => m.t === 'idreg');

  // outro servidor, sem a identidade (reciclada por falta de uso, ou arquivo restaurado de um backup antigo)
  const srvB = await H.startServer({});
  t.after(() => srvB.stop());
  const spyB = [];
  const b = await realClient(srvB.port, idb, storage, spyB);
  t.after(() => b.close());
  const login = await b.id.ensure();
  assert.ok(login.token, 'entrou depois de se registrar de novo');
  const again = spyB.find(m => m.t === 'idreg');
  assert.ok(again, 'o cliente se registrou de novo');
  assert.strictEqual(again.pk, original.pk, 'mesma chave pública principal');
  assert.strictEqual(again.rpk, original.rpk, 'mesma chave pública de recuperação');
  assert.strictEqual(b.id.status().gen, 1);
});

test('servidor real: identidade que existe com OUTRAS chaves não é sobrescrita pelo cliente', { skip: H.missing() }, async t => {
  const idb = fakeIDB(),
    storage = fakeStorage();
  const srvA = await H.startServer({});
  const a = await realClient(srvA.port, idb, storage);
  await a.id.ensure();
  a.close();
  await srvA.stop();

  const srvB = await H.startServer({});
  t.after(() => srvB.stop());
  // alguém registra no servidor B o mesmo id (mesma chave do aparelho) com chaves próprias
  const k = storage.getItem('skyke_fk');
  const intruder = await H.connect(srvB.port, '203.0.113.95');
  t.after(() => intruder.ws.close());
  intruder.ws.send(JSON.stringify({ t: 'idreg', k, pk: spki(), rpk: spki() }));
  assert.ok(await H.until(() => intruder.msgs.some(m => m.t === 'idok'), 3000));

  const b = await realClient(srvB.port, idb, storage);
  t.after(() => b.close());
  await assert.rejects(b.id.ensure(), e => e.code === 'bad-signature', 'o erro original segue: o servidor não trocou as chaves');
});

// SK-08: o backup cifrado usava PBKDF2 com 150 mil voltas e senha de 8 caracteres. Agora: 600 mil voltas, cabeçalho autenticado,
// senha de 10+ caracteres, e os backups antigos (v1) continuam abrindo.
test('backup v2: 600 mil voltas, ida e volta, senha errada e cabeçalho adulterado falham', async () => {
  const id = boot(fakeServer(), fakeIDB(), fakeStorage());
  const dado = { v: 2, code: 'XXXX-YYYY', nome: 'Ana' };
  const text = await id.encryptBackup(dado, 'uma frase bem longa 2026');
  const p = text.split('.');
  assert.strictEqual(p.length, 5);
  assert.strictEqual(p[0], 'skyke-backup-v2');
  assert.strictEqual(p[1], '600000', 'o número de voltas vai no arquivo');
  assert.strictEqual(JSON.stringify(await id.decryptBackup(text, 'uma frase bem longa 2026')), JSON.stringify(dado)); // (objeto de outro contexto: compara como JSON)
  await assert.rejects(id.decryptBackup(text, 'outra frase qualquer 123'), /Senha incorreta/);
  // adulterar as voltas (para uma derivação mais fraca) não abre o arquivo: o cabeçalho é dado autenticado e a chave muda
  const fraco = ['skyke-backup-v2', '100000', ...p.slice(2)].join('.');
  await assert.rejects(id.decryptBackup(fraco, 'uma frase bem longa 2026'), /Senha incorreta/);
  // adulterar o texto cifrado também falha
  const ct = p[4];
  const quebrado = [...p.slice(0, 4), (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1)].join('.');
  await assert.rejects(id.decryptBackup(quebrado, 'uma frase bem longa 2026'), /Senha incorreta/);
});

test('backup: voltas absurdas no cabeçalho são recusadas antes de derivar (nem travam o navegador, nem enfraquecem)', async () => {
  const id = boot(fakeServer(), fakeIDB(), fakeStorage());
  const resto = 'AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAA.' + 'A'.repeat(40);
  for (const voltas of ['1', '99999', '2000001', '99999999', '999999999999', '60e4', '-600000'])
    await assert.rejects(id.decryptBackup(`skyke-backup-v2.${voltas}.${resto}`, 'qualquer senha longa'), /não é um backup/, 'voltas ' + voltas);
  await assert.rejects(id.decryptBackup('skyke-backup-v3.600000.' + resto, 'x'), /não é um backup/);
  await assert.rejects(id.decryptBackup('skyke-backup-v2.' + resto, 'x'), /não é um backup/, 'v2 sem o número de voltas');
});

test('backup v1 (150 mil voltas) continua abrindo; os novos nunca saem em v1', async () => {
  const id = boot(fakeServer(), fakeIDB(), fakeStorage());
  // monta um arquivo v1 exatamente como a versão antiga fazia
  const subtle = crypto.webcrypto.subtle,
    b64u = b => Buffer.from(b).toString('base64url');
  const salt = crypto.randomBytes(16),
    iv = crypto.randomBytes(12);
  const base = await subtle.importKey('raw', Buffer.from('senha-antiga-8'), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, Buffer.from(JSON.stringify({ v: 2, code: 'ANTIGO' })));
  const v1 = ['skyke-backup-v1', b64u(salt), b64u(iv), b64u(ct)].join('.');
  assert.strictEqual(JSON.stringify(await id.decryptBackup(v1, 'senha-antiga-8')), JSON.stringify({ v: 2, code: 'ANTIGO' }));
  assert.ok((await id.encryptBackup({ a: 1 }, 'frase longa e nova 99')).startsWith('skyke-backup-v2.'));
});

test('backup: senha curta ou simples demais é recusada na criação', async () => {
  const id = boot(fakeServer(), fakeIDB(), fakeStorage());
  await assert.rejects(id.encryptBackup({}, 'curta'), /pelo menos 10/);
  await assert.rejects(id.encryptBackup({}, '123456789'), /pelo menos 10/);
  await assert.rejects(id.encryptBackup({}, 'aaaaaaaaaaaa'), /simples demais/);
  await assert.rejects(id.encryptBackup({}, '1212121212121'), /simples demais/);
  assert.ok(await id.encryptBackup({}, 'cafe com leite 2026'));
});

// ---------- SK-04: a chave de recuperação não fica no aparelho ----------
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
// registro de uma versão antiga: a chave de recuperação (exportável) guardada junto da principal
async function plantLegacyRecovery(idb, code) {
  const dec = SKYREC.decodeV2(code);
  idb._data.get('me').recovery = await crypto.webcrypto.subtle.importKey('pkcs8', Buffer.from(dec.rec, 'base64url'), ECDSA, true, ['sign']);
}
// "o jogador cola o código que guardou": responde ao pedido do cliente com um código fixo e anota o que o cliente achou dele
const pasting = (code, log = []) => ({
  askCode: async (why, tryCode) => {
    const r = await tryCode(code);
    log.push(r.ok ? 'ok' : r.msg);
    return r.ok ? r.value : null;
  }
});

test('SK-04: conta nova guarda só a chave pública de recuperação; a privada nunca vai ao IndexedDB nem ao localStorage', async () => {
  const server = fakeServer(),
    idb = fakeIDB(),
    storage = fakeStorage();
  const a = boot(server, idb, storage);
  await a.ensure();
  assert.strictEqual(a.status().codeReady, true, 'o jogador pode copiar o código nesta sessão');
  assert.strictEqual(a.status().recoveryOnDevice, false);
  const stored = idb._data.get('me');
  assert.ok(stored.rpk, 'a chave pública de recuperação fica (serve para conferir códigos)');
  assert.ok(!('recovery' in stored) && !('pendingRecovery' in stored));

  // varredura: tudo o que um script da própria página conseguiria ler do IndexedDB
  const found = [];
  (function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (typeof v.type === 'string' && v.algorithm && v.usages) found.push(v);
    else Object.values(v).forEach(walk);
  })(stored);
  assert.strictEqual(found.length, 1, 'só uma chave privada no aparelho: a principal');
  assert.strictEqual(found[0].type, 'private');
  assert.strictEqual(found[0].extractable, false);
  await assert.rejects(crypto.webcrypto.subtle.exportKey('pkcs8', found[0]), 'a principal não sai do aparelho');
  assert.strictEqual(storage._keys().join(), 'skyke_fk', 'o localStorage só tem a chave antiga do aparelho (que não autentica)');

  // a página recarrega: a chave de recuperação não está em lugar nenhum
  const b = boot(server, idb, storage);
  await b.ensure();
  assert.strictEqual(b.status().codeReady, false);
  assert.strictEqual(await b.backupCode({ name: 'Ana' }), null);
  assert.strictEqual(b.status().hasRecovery, true, 'a conta continua tendo chave de recuperação (guardada pelo jogador)');
});

test('SK-04: trocar a chave principal exige o código; sem ele, com código errado, de outra conta ou antigo nada é enviado', async () => {
  const server = fakeServer(),
    idb = fakeIDB(),
    storage = fakeStorage();
  const first = boot(server, idb, storage);
  await first.ensure();
  const old = await first.backupCode({ name: 'Ana' });
  const other = boot(fakeServer(), fakeIDB(), fakeStorage());
  await other.ensure();
  const otherCode = await other.backupCode({ name: 'Zé' });
  await first.rotateRecovery({ name: 'Ana' }); // o código de antes fica obsoleto
  const current = await first.backupCode({ name: 'Ana' });
  assert.notStrictEqual(old, current);

  const dev = boot(server, idb, storage); // a página recarregou: a chave de recuperação não está mais no aparelho
  await dev.ensure();
  const idrots = () => server.sent.filter(m => m.t === 'idrot').length;
  const before = idrots();
  await assert.rejects(dev.rotatePrimary(), e => e.code === 'need-code', 'sem como pedir o código nada acontece');
  const log = [];
  for (const bad of ['ABCDE-FGHIJ', otherCode, old]) {
    dev.setUi(pasting(bad, log));
    await assert.rejects(dev.rotatePrimary(), e => e.code === 'cancelled');
  }
  assert.strictEqual(log.length, 3);
  assert.match(log[0], /não reconhecido/);
  assert.match(log[1], /outra conta/);
  assert.match(log[2], /não é o atual/);
  assert.strictEqual(idrots(), before, 'nenhum pedido de troca saiu com código errado');

  // o código certo: o servidor de mentira confere as DUAS assinaturas (a da recuperação tem de vir da chave do código)
  dev.setUi(pasting(current));
  assert.strictEqual((await dev.rotatePrimary()).t, 'idok');
  assert.strictEqual(idrots(), before + 1);
  assert.strictEqual(dev.status().gen, 2);
  assert.strictEqual(dev.status().codeReady, false, 'o código colado não fica guardado depois da operação');
});

test('SK-04: conta de versão antiga continua funcionando; conferir o código remove a chave de recuperação do aparelho', async () => {
  const server = fakeServer(),
    idb = fakeIDB(),
    storage = fakeStorage();
  const first = boot(server, idb, storage);
  await first.ensure();
  const code = await first.backupCode({ name: 'Ana' });
  await plantLegacyRecovery(idb, code);

  const dev = boot(server, idb, storage);
  await dev.ensure();
  assert.strictEqual(dev.status().recoveryOnDevice, true);
  assert.strictEqual(dev.status().codeReady, true);
  assert.ok(await dev.backupCode({ name: 'Ana' }), 'o código ainda pode ser copiado');
  assert.strictEqual((await dev.rotatePrimary()).t, 'idok', 'sem interface alguma: a chave guardada no aparelho ainda assina');

  await assert.rejects(dev.confirmRecovery('ABCDE-FGHIJ'), e => e.code === 'bad-code');
  assert.ok('recovery' in idb._data.get('me'), 'código errado não remove nada');
  assert.strictEqual((await dev.confirmRecovery(code)).ok, true);
  assert.ok(!('recovery' in idb._data.get('me')), 'a chave saiu do IndexedDB');
  const st = dev.status();
  assert.strictEqual(st.recoveryOnDevice, false);
  assert.strictEqual(st.recoveryChecked, true);
  assert.strictEqual(st.codeReady, false);
  await assert.rejects(dev.rotatePrimary(), e => e.code === 'need-code', 'agora só com o código colado');

  // recarregar mantém tudo assim
  const dev2 = boot(server, idb, storage);
  await dev2.ensure();
  assert.strictEqual(dev2.status().recoveryOnDevice, false);
  assert.strictEqual(dev2.status().recoveryChecked, true);
});

test('SK-04: gerar uma chave nova mostra o código antes de enviar e tira a chave antiga do aparelho', async () => {
  const server = fakeServer(),
    idb = fakeIDB(),
    storage = fakeStorage();
  const first = boot(server, idb, storage);
  await first.ensure();
  await plantLegacyRecovery(idb, await first.backupCode({ name: 'Ana' }));
  const dev = boot(server, idb, storage);
  await dev.ensure();

  // o jogador desiste ao ver o código novo: nada foi enviado e a conta fica como estava
  dev.setUi({ confirmNew: async () => false });
  const before = server.sent.filter(m => m.t === 'idrot').length;
  await assert.rejects(dev.rotateRecovery({ name: 'Ana' }), e => e.code === 'cancelled');
  assert.strictEqual(server.sent.filter(m => m.t === 'idrot').length, before);
  assert.ok('recovery' in idb._data.get('me') && !('pendingRecovery' in idb._data.get('me')));

  // confirma: o código novo é o que o servidor passa a aceitar, e nenhuma chave de recuperação fica no aparelho
  const shown = [];
  dev.setUi({
    confirmNew: async c => {
      shown.push(c);
      return true;
    }
  });
  assert.strictEqual((await dev.rotateRecovery({ name: 'Ana' })).t, 'idok');
  assert.strictEqual(pubOfCode(shown[0]), server.st.rpk);
  assert.ok(!('recovery' in idb._data.get('me')), 'a chave nova nunca é guardada no aparelho');
  assert.strictEqual(dev.status().recoveryOnDevice, false);
  assert.strictEqual(dev.status().codeReady, true, 'o jogador ainda pode copiar o código novo nesta sessão');
  assert.strictEqual(pubOfCode(await dev.backupCode({ name: 'Ana' })), server.st.rpk);
});

test('SK-04: a chave de recuperação na memória some sozinha em 10 minutos, ao descartar e ao esquecer a conta', async () => {
  const timers = [];
  const clock = {
    setTimeout: (fn, ms) => {
      const t = { fn, ms, unref() {} };
      timers.push(t);
      return t;
    },
    clearTimeout: () => {}
  };
  const a = boot(fakeServer(), fakeIDB(), fakeStorage(), clock);
  await a.ensure();
  assert.strictEqual(a.status().codeReady, true);
  const prazo = timers.find(x => x.ms === 10 * 60000);
  assert.ok(prazo, 'a chave tem prazo de 10 minutos');
  prazo.fn();
  assert.strictEqual(a.status().codeReady, false);

  const b = boot(fakeServer(), fakeIDB(), fakeStorage(), clock);
  await b.ensure();
  assert.strictEqual(b.status().codeReady, true);
  b.discardRecovery();
  assert.strictEqual(b.status().codeReady, false);

  const c = boot(fakeServer(), fakeIDB(), fakeStorage(), clock);
  await c.ensure();
  await c.forget();
  assert.strictEqual(await c.backupCode({ name: 'Ana' }), null, 'esquecer a conta também descarta a chave da memória');
});

test('SK-04: atualizar o código a partir do que o jogador guardou mantém a chave e traz os amigos de agora', async () => {
  const server = fakeServer(),
    idb = fakeIDB(),
    storage = fakeStorage();
  const first = boot(server, idb, storage);
  await first.ensure();
  const code = await first.backupCode({ name: 'Ana', friends: [] });
  const dev = boot(server, idb, storage);
  await dev.ensure();
  const fresh = await dev.refreshCode(code, { name: 'Ana Maria', friends: ['abcdefghijkl'] });
  const a = SKYREC.decodeV2(code),
    b = SKYREC.decodeV2(fresh);
  assert.strictEqual(b.rec, a.rec, 'a chave de recuperação é a mesma');
  assert.strictEqual(b.id, a.id);
  assert.strictEqual(b.name, 'Ana Maria');
  assert.strictEqual(b.friends.join(), 'abcdefghijkl');
  assert.strictEqual(dev.status().codeReady, false, 'nada foi guardado no aparelho');
  await assert.rejects(dev.refreshCode('ABCDE-FGHIJ', {}), e => e.code === 'bad-code');
});

test('servidor real: com a página recarregada, trocar a chave principal só funciona com o código colado', { skip: H.missing() }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-idcustody-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const srv = await H.startServer({ IDENTITY_FILE: path.join(dir, 'identity.json') });
  t.after(() => srv.stop());

  const idb = fakeIDB(),
    storage = fakeStorage();
  const a = await realClient(srv.port, idb, storage);
  await a.id.ensure();
  const code = await a.id.backupCode({ name: 'Ana' });
  assert.ok(code);
  a.close();

  // a página recarrega: a chave de recuperação não está mais no aparelho
  const b = await realClient(srv.port, idb, storage);
  t.after(() => b.close());
  await b.id.ensure();
  assert.strictEqual(b.id.status().codeReady, false);
  await assert.rejects(b.id.rotatePrimary(), e => e.code === 'need-code');

  // o servidor de verdade confere as duas assinaturas: a da recuperação sai da chave que veio do código colado
  const log = [];
  b.id.setUi(pasting(code, log));
  assert.strictEqual((await b.id.rotatePrimary()).t, 'idok');
  assert.deepStrictEqual(log, ['ok']);
  assert.strictEqual(b.id.status().gen, 2);
  assert.strictEqual(b.id.status().codeReady, false);
});
