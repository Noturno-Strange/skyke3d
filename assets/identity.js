/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Identidade do jogador no navegador (o servidor está em lib/identity.js e lib/auth.js).
 * - A chave primária P-256 é gerada não exportável e fica no IndexedDB como CryptoKey: um XSS
 *   pode assinar enquanto a página está aberta, mas não consegue copiar a chave para fora.
 * - A chave de recuperação é independente e só ela entra no código de recuperação. O código v2
 *   leva o id opaco, a chave de recuperação e o perfil/amigos (assets/recovery.js).
 * - Nada de chave privada em localStorage. O token de sessão fica só em memória.
 * - Backup opcional: arquivo cifrado com AES-GCM e senha (PBKDF2-SHA-256), para guardar fora
 *   do aparelho sem deixar a chave de recuperação em texto.
 * Este script é carregado antes de app-net.js e conversa com o WebSocket por dois ganchos:
 * `SKYID.bind(send)` e `SKYID.onMessage(m)`.
 */
(function (/** @type {any} */ root) {
  'use strict';
  const DB = 'skyke_identity',
    STORE = 'keys',
    RKEY = 'me',
    FK = 'skyke_fk',
    DOMAIN = 'skyke3d/id/v1',
    B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
    ID_RE = /^[a-z2-7]{12}$/,
    FKEY = /^[A-Za-z0-9_-]{43}$/,
    MAX_AGE = 11 * 3600000;

  const subtle = () => {
    const c = root.crypto || root.msCrypto;
    if (!c || !c.subtle) throw new Error('Este navegador não tem Web Crypto. Use HTTPS e um navegador atualizado.');
    return c.subtle;
  };
  const enc = new TextEncoder(),
    dec = new TextDecoder();
  const b64u = b => {
    let s = '';
    const u = new Uint8Array(b);
    for (const x of u) s += String.fromCharCode(x);
    return root.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64u = s => {
    if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
    const t = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    try {
      return Uint8Array.from(root.atob(t), c => c.charCodeAt(0));
    } catch (e) {
      return null;
    }
  };
  // As mesmas strings canônicas do servidor (lib/identity.js): separação por domínio e ação.
  const payload = {
    register: (id, pk, rpk) => [DOMAIN, 'register', id, pk, rpk].join('\n'),
    auth: (id, nonce, action) => [DOMAIN, 'auth', id, nonce, action].join('\n'),
    rotate: (id, gen, newPk) => [DOMAIN, 'rotate', id, String(gen), newPk].join('\n'),
    rotateRecovery: (id, rgen, newRpk) => [DOMAIN, 'rotate-recovery', id, String(rgen), newRpk].join('\n'),
    revoke: (id, epoch) => [DOMAIN, 'revoke', id, String(epoch)].join('\n'),
    recover: (id, gen, newPk) => [DOMAIN, 'recover', id, String(gen), newPk].join('\n'),
    cancelRecovery: (id, gen) => [DOMAIN, 'cancel-recovery', id, String(gen)].join('\n')
  };
  const ALG = { name: 'ECDSA', namedCurve: 'P-256' },
    SIGN = { name: 'ECDSA', hash: 'SHA-256' };
  const genKeys = extractable => subtle().generateKey(ALG, extractable, ['sign', 'verify']);
  const pubOf = async kp => b64u(await subtle().exportKey('spki', kp.publicKey));
  const privOf = async key => b64u(await subtle().exportKey('pkcs8', key));
  const importPriv = (der, extractable) => subtle().importKey('pkcs8', der, ALG, extractable, ['sign']);
  const sign = async (key, data) => b64u(await subtle().sign(SIGN, key, enc.encode(data)));

  // ---------- chave antiga do aparelho ----------
  // Só serve para registrar a identidade e migrar nomes antigos; não autentica mais sozinha.
  function deviceKey() {
    try {
      let k = root.localStorage.getItem(FK);
      if (!FKEY.test(k || '')) {
        const b = new Uint8Array(32);
        (root.crypto || root.msCrypto).getRandomValues(b);
        k = b64u(b);
        root.localStorage.setItem(FK, k);
      }
      return k;
    } catch (e) {
      return '';
    }
  }
  function setDeviceKey(k) {
    try {
      if (FKEY.test(k || '')) root.localStorage.setItem(FK, k);
    } catch (e) {
      /* sem armazenamento: a identidade ainda funciona nesta sessão */
    }
  }

  // ---------- IndexedDB ----------
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const idb = root.indexedDB;
      if (!idb) return reject(new Error('Este navegador não tem IndexedDB. A identidade não pode ser guardada.'));
      const r = idb.open(DB, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('IndexedDB indisponível.'));
      r.onblocked = () => reject(new Error('Feche outras abas do jogo para atualizar a identidade.'));
    });
    return dbp;
  }
  function store(mode) {
    return db().then(d => d.transaction(STORE, mode).objectStore(STORE));
  }
  function idbGet() {
    return store('readonly').then(
      s =>
        new Promise((resolve, reject) => {
          const r = s.get(RKEY);
          r.onsuccess = () => resolve(r.result || null);
          r.onerror = () => reject(r.error);
        })
    );
  }
  function idbPut(v) {
    return store('readwrite').then(
      s =>
        new Promise((resolve, reject) => {
          const r = s.put(v, RKEY);
          r.onsuccess = () => resolve();
          r.onerror = () => reject(r.error);
        })
    );
  }
  function idbDel() {
    return store('readwrite').then(
      s =>
        new Promise((resolve, reject) => {
          const r = s.delete(RKEY);
          r.onsuccess = () => resolve();
          r.onerror = () => reject(r.error);
        })
    );
  }

  // ---------- estado ----------
  /** @type {{id:string,gen:number,rgen:number,epoch:number,pk:string,rpk:string,primary:any,recovery:any,pendingRecovery?:{rpk:string,rgen:number,recovery:any}}|null} */
  let rec = null,
    token = '',
    tokenExp = 0,
    sender = null,
    loadP = null,
    opP = Promise.resolve();
  const valid = r =>
    !!r &&
    typeof r === 'object' &&
    ID_RE.test(r.id || '') &&
    Number.isInteger(r.gen) &&
    r.gen >= 0 &&
    Number.isInteger(r.rgen) &&
    r.rgen >= 0 &&
    Number.isInteger(r.epoch) &&
    r.epoch >= 0 &&
    !!r.recovery;
  // Versões anteriores guardavam o par de chaves inteiro; o que assina é a chave privada.
  // A migração mantém quem já tinha identidade criada por essas versões.
  const priv = v => (v && typeof v === 'object' && v.privateKey ? v.privateKey : v);
  function load() {
    if (loadP) return loadP;
    loadP = idbGet()
      .then(r => {
        if (valid(r)) {
          const p = priv(r.primary),
            k = priv(r.recovery),
            pend = r.pendingRecovery ? { ...r.pendingRecovery, recovery: priv(r.pendingRecovery.recovery) } : null;
          const changed = p !== r.primary || k !== r.recovery || (pend && pend.recovery !== r.pendingRecovery.recovery);
          r.primary = p;
          r.recovery = k;
          if (pend) r.pendingRecovery = pend;
          rec = r;
          if (changed) idbPut(rec).catch(() => {});
        }
        return rec;
      })
      .catch(() => rec);
    return loadP;
  }
  function save() {
    return rec ? idbPut(rec).catch(() => {}) : Promise.resolve();
  }
  // As operações de segurança mexem nas mesmas gerações: uma de cada vez evita que um
  // duplo clique gere duas chaves e deixe a segunda resposta obsoleta no meio do caminho.
  function serial(fn) {
    const run = opP.then(fn, fn);
    opP = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
  function idErr(m) {
    const e = new Error((m && m.msg) || 'Falha na identidade.');
    e.code = (m && m.code) || '';
    e.scope = (m && m.scope) || '';
    return e;
  }

  // ---------- pedido/resposta no WebSocket ----------
  const waiters = [];
  function settle(m) {
    for (let i = waiters.length - 1; i >= 0; i--)
      if (waiters[i].pred(m)) {
        const w = waiters[i];
        waiters.splice(i, 1);
        clearTimeout(w.tm);
        w.resolve(m);
      }
  }
  function req(msg, pred, ms = 10000) {
    if (!sender) return Promise.reject(new Error('Sem conexão com o servidor.'));
    return new Promise((resolve, reject) => {
      const w = { pred, resolve, reject };
      w.tm = setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) waiters.splice(i, 1);
        reject(new Error('O servidor não respondeu. Tente de novo.'));
      }, ms);
      waiters.push(w);
      try {
        sender(msg);
      } catch (e) {
        clearTimeout(w.tm);
        waiters.splice(waiters.indexOf(w), 1);
        reject(e);
      }
    });
  }
  function onMessage(m) {
    if (!m || typeof m !== 'object') return false;
    if (m.t === 'challenge' || m.t === 'session') {
      settle(m);
      return true;
    }
    if (m.t === 'idok') {
      settle(m);
      return true;
    }
    if (m.t === 'err' && ['idreg', 'idrot', 'idrec', 'idcancel', 'idrev', 'auth', 'proof'].includes(m.scope)) {
      settle(m);
      return true;
    }
    return false;
  }
  function bind(send) {
    sender = send;
  }

  // ---------- registro e autenticação ----------
  async function enroll() {
    const k = deviceKey();
    if (!k) throw new Error('Não foi possível criar a chave deste aparelho (armazenamento bloqueado).');
    const primary = await genKeys(false),
      recovery = await genKeys(true),
      pk = await pubOf(primary),
      rpk = await pubOf(recovery);
    const r = await req(
      { t: 'idreg', k, pk, rpk },
      m => (m.t === 'idok' && m.op === 'register') || (m.t === 'err' && m.scope === 'idreg')
    );
    if (r.t === 'err') throw idErr(r);
    if (!r.id || !ID_RE.test(r.id)) throw new Error('Resposta de registro inválida.');
    rec = { id: r.id, gen: r.gen, rgen: r.rgen, epoch: r.epoch, pk, rpk, primary: primary.privateKey, recovery: recovery.privateKey };
    await save();
    return rec;
  }
  async function auth(action) {
    if (!rec) throw new Error('Identidade não encontrada neste aparelho.');
    const key = action === 'recover' ? rec.recovery : rec.primary;
    if (!key) throw new Error(action === 'recover' ? 'Chave de recuperação ausente.' : 'Chave principal ausente.');
    const ch = await req(
      { t: 'auth', id: rec.id, action },
      m => m.t === 'challenge' || (m.t === 'err' && m.scope === 'auth')
    );
    if (ch.t === 'err') throw idErr(ch);
    const sig = await sign(key, payload.auth(rec.id, ch.nonce, action));
    const s = await req(
      { t: 'proof', id: rec.id, action, nonce: ch.nonce, sig },
      m => m.t === 'session' || (m.t === 'err' && m.scope === 'proof')
    );
    if (s.t === 'err') throw idErr(s);
    rec.gen = s.gen;
    rec.rgen = Number.isInteger(s.rgen) ? s.rgen : rec.rgen;
    rec.epoch = s.epoch;
    await save();
    token = s.token;
    tokenExp = Math.min(s.exp || 0, Date.now() + MAX_AGE);
    return s;
  }
  /** entra com a identidade; registra na primeira vez (a chave antiga do aparelho define o id) */
  async function login() {
    await load();
    if (!rec) await enroll();
    if (!rec.primary) throw new Error('Esta identidade foi restaurada sem chave principal: conclua a recuperação.');
    if (token && tokenExp > Date.now() + 60000) return { id: rec.id, token, k: deviceKey(), gen: rec.gen, epoch: rec.epoch };
    const s = await auth('join');
    return { id: rec.id, token: s.token, k: deviceKey(), gen: rec.gen, epoch: rec.epoch };
  }
  /** prepara a identidade para entrar: registra na primeira vez ou conclui uma restauração pendente */
  async function ensure() {
    await load();
    if (!rec) await enroll();
    else if (!rec.primary) await finishRestore();
    if (rec && rec.pendingRecovery) await settleRecovery();
    return login();
  }

  // ---------- operações de segurança ----------
  async function rotatePrimary() {
    const s = await login();
    const kp = await genKeys(false),
      newPk = await pubOf(kp),
      data = payload.rotate(rec.id, rec.gen, newPk),
      sigOld = await sign(rec.primary, data),
      sigRec = await sign(rec.recovery, data);
    const r = await req(
      { t: 'idrot', token: s.token, gen: rec.gen, pk: newPk, sigOld, sigRec },
      m => (m.t === 'idok' && m.op === 'rotate') || (m.t === 'err' && m.scope === 'idrot')
    );
    if (r.t === 'err') throw idErr(r);
    rec.primary = kp.privateKey;
    rec.pk = newPk;
    rec.gen = r.gen;
    rec.rgen = Number.isInteger(r.rgen) ? r.rgen : rec.rgen;
    rec.epoch = r.epoch;
    token = r.token || '';
    tokenExp = r.exp || 0;
    await save();
    return r;
  }
  /**
   * Conclui uma troca de recuperação que ficou pendente. A chave nova é guardada antes do
   * pedido; se a resposta se perder, o servidor já pode tê-la aplicado. Reenviar o mesmo
   * pedido é idempotente (mesma geração e mesma chave pública), então nenhuma chave se perde.
   * @returns {Promise<boolean>}
   */
  async function settleRecovery() {
    const p = rec && rec.pendingRecovery;
    if (!p || !rec.primary || !rec.recovery) return false;
    // Outra sessão avançou a geração: o pedido antigo não vale mais.
    if (p.rgen !== rec.rgen) {
      delete rec.pendingRecovery;
      await save();
      return false;
    }
    let s;
    try {
      s = await login();
    } catch (e) {
      return false;
    }
    const data = payload.rotateRecovery(rec.id, p.rgen, p.rpk);
    let sigRec, sigOld;
    try {
      sigRec = await sign(rec.recovery, data);
      sigOld = await sign(rec.primary, data);
    } catch (e) {
      return false;
    }
    let r;
    try {
      r = await req(
        { t: 'idrot', token: s.token, rgen: p.rgen, rpk: p.rpk, sigOld, sigRec },
        m => (m.t === 'idok' && m.op === 'rotate-recovery') || (m.t === 'err' && m.scope === 'idrot')
      );
    } catch (e) {
      return false; // sem resposta: mantém a chave pendente para a próxima entrada
    }
    if (r.t === 'err') {
      // Erros definitivos descartam a pendência; os passageiros (rede/limite) tentam de novo.
      if (!['session', 'rate', 'busy', 'io', 'corrupt'].includes(r.code)) {
        delete rec.pendingRecovery;
        await save();
      }
      return false;
    }
    rec.recovery = p.recovery;
    rec.rpk = p.rpk;
    rec.gen = Number.isInteger(r.gen) ? r.gen : rec.gen;
    rec.rgen = Number.isInteger(r.rgen) ? r.rgen : p.rgen + 1;
    rec.epoch = r.epoch;
    token = r.token || '';
    tokenExp = r.exp || 0;
    delete rec.pendingRecovery;
    await save();
    return true;
  }
  async function rotateRecovery() {
    await load();
    if (!rec) throw new Error('Identidade não encontrada neste aparelho.');
    if (!rec.primary || !rec.recovery) throw new Error('As chaves desta identidade não estão neste aparelho.');
    // Uma troca anterior sem resposta é concluída antes de gerar outra chave.
    if (rec.pendingRecovery) {
      if (await settleRecovery()) return { ok: true, gen: rec.gen, rgen: rec.rgen, epoch: rec.epoch };
      if (rec.pendingRecovery) throw new Error('A troca anterior ficou pendente. Tente de novo em instantes.');
    }
    const s = await login();
    const kp = await genKeys(true),
      newRpk = await pubOf(kp),
      pending = { rpk: newRpk, rgen: rec.rgen, recovery: kp.privateKey };
    // Guardar a chave nova ANTES do pedido: se a resposta se perder, ela ainda está aqui.
    rec.pendingRecovery = pending;
    await save();
    const data = payload.rotateRecovery(rec.id, pending.rgen, pending.rpk);
    let sigRec, sigOld;
    try {
      sigRec = await sign(rec.recovery, data);
      sigOld = await sign(rec.primary, data);
    } catch (e) {
      delete rec.pendingRecovery;
      await save();
      throw e;
    }
    let r;
    try {
      r = await req(
        { t: 'idrot', token: s.token, rgen: pending.rgen, rpk: pending.rpk, sigOld, sigRec },
        m => (m.t === 'idok' && m.op === 'rotate-recovery') || (m.t === 'err' && m.scope === 'idrot')
      );
    } catch (e) {
      throw e; // sem resposta: a pendência fica guardada e será concluída depois
    }
    if (r.t === 'err') {
      if (!['session', 'rate', 'busy', 'io', 'corrupt'].includes(r.code)) {
        delete rec.pendingRecovery;
        await save();
      }
      throw idErr(r);
    }
    rec.recovery = pending.recovery;
    rec.rpk = pending.rpk;
    rec.gen = Number.isInteger(r.gen) ? r.gen : rec.gen;
    rec.rgen = Number.isInteger(r.rgen) ? r.rgen : pending.rgen + 1;
    rec.epoch = r.epoch;
    token = r.token || '';
    tokenExp = r.exp || 0;
    delete rec.pendingRecovery;
    await save();
    return r;
  }
  async function revokeSessions() {
    await load();
    if (!rec) throw new Error('Identidade não encontrada neste aparelho.');
    // Token de recuperação também pode revogar; a principal assina a época para provar posse.
    let s;
    if (rec.primary) {
      s = await login();
      const sigOld = await sign(rec.primary, payload.revoke(rec.id, rec.epoch));
      const r = await req(
        { t: 'idrev', token: s.token, epoch: rec.epoch, sigOld },
        m => (m.t === 'idok' && m.op === 'revoke') || (m.t === 'err' && m.scope === 'idrev')
      );
      if (r.t === 'err') throw idErr(r);
      rec.gen = r.gen;
      rec.rgen = Number.isInteger(r.rgen) ? r.rgen : rec.rgen;
      rec.epoch = r.epoch;
      token = r.token || '';
      tokenExp = r.exp || 0;
      await save();
      return r;
    }
    s = await auth('recover');
    const r = await req(
      { t: 'idrev', token: s.token, epoch: rec.epoch },
      m => (m.t === 'idok' && m.op === 'revoke') || (m.t === 'err' && m.scope === 'idrev')
    );
    if (r.t === 'err') throw idErr(r);
    rec.gen = r.gen;
    rec.rgen = Number.isInteger(r.rgen) ? r.rgen : rec.rgen;
    rec.epoch = r.epoch;
    token = r.token || '';
    tokenExp = r.exp || 0;
    await save();
    return r;
  }
  /** troca a chave principal usando só a chave de recuperação (sem confiar na principal antiga) */
  async function recoverPrimary() {
    await load();
    if (!rec) throw new Error('Identidade não encontrada neste aparelho.');
    if (!rec.recovery) throw new Error('Chave de recuperação ausente.');
    const s = await auth('recover');
    const kp = await genKeys(false),
      newPk = await pubOf(kp),
      sigRec = await sign(rec.recovery, payload.recover(rec.id, rec.gen, newPk));
    const r = await req(
      { t: 'idrec', token: s.token, gen: rec.gen, pk: newPk, sigRec, grace: 0 },
      m => (m.t === 'idok' && m.op === 'recover') || (m.t === 'err' && m.scope === 'idrec')
    );
    if (r.t === 'err') throw idErr(r);
    if (r.pending) throw new Error('A recuperação ficou pendente. Tente de novo em instantes.');
    rec.primary = kp.privateKey;
    rec.pk = newPk;
    rec.gen = r.gen;
    rec.rgen = Number.isInteger(r.rgen) ? r.rgen : rec.rgen;
    rec.epoch = r.epoch;
    await save();
    token = '';
    tokenExp = 0;
    await auth('join');
    return r;
  }
  async function cancelRecovery() {
    const s = await login();
    const sigOld = await sign(rec.primary, payload.cancelRecovery(rec.id, rec.gen));
    const r = await req(
      { t: 'idcancel', token: s.token, gen: rec.gen, sigOld },
      m => (m.t === 'idok' && m.op === 'cancel-recovery') || (m.t === 'err' && m.scope === 'idcancel')
    );
    if (r.t === 'err') throw idErr(r);
    return r;
  }

  // ---------- códigos e backup ----------
  /** código v2: id + chave de recuperação + perfil/amigos (nunca a chave principal) */
  async function backupCode(profile) {
    await load();
    if (!rec || !rec.recovery) return null;
    const der = await privOf(rec.recovery);
    return root.SKYREC.encodeV2({
      id: rec.id,
      rec: der,
      fk: deviceKey(),
      name: (profile && profile.name) || '',
      look: (profile && profile.look) || {},
      gloss: profile && profile.gloss ? 1 : 0,
      friends: (profile && profile.friends) || []
    });
  }
  /** restaura um código v2 (ou o v1 antigo, que só tem a chave do aparelho) sem confiar no conteúdo */
  async function restoreCode(code) {
    const r = root.SKYREC.decodeAny(code);
    if (!r.ok) return r;
    // O código é secreto e traz a chave do aparelho: recuperá-la mantém o mesmo id de amigo
    // e permite migrar nomes antigos, sem depender da chave principal perdida.
    if (r.fk) setDeviceKey(r.fk);
    if (r.v === 1) return { ok: true, v: 1, fk: r.fk, name: r.name, look: r.look, gloss: r.gloss, friends: r.friends };
    const der = unb64u(r.rec);
    if (!der) return { ok: false, err: 'formato' };
    let recovery;
    try {
      recovery = await importPriv(der, true);
    } catch (e) {
      return { ok: false, err: 'formato' };
    }
    rec = { id: r.id, gen: 0, rgen: 0, epoch: 0, pk: '', rpk: '', primary: null, recovery };
    token = '';
    tokenExp = 0;
    loadP = Promise.resolve(rec);
    await save();
    return { ok: true, v: 2, id: r.id, fk: r.fk, name: r.name, look: r.look, gloss: r.gloss, friends: r.friends };
  }
  /** completa a restauração: troca a principal usando a recuperação e volta com um token de jogo */
  async function finishRestore() {
    if (!rec) throw new Error('Nenhuma identidade restaurada.');
    if (rec.primary) return login();
    await recoverPrimary();
    return login();
  }

  // Backup em arquivo: AES-GCM 256 com chave derivada da senha (PBKDF2-SHA-256, 150 mil voltas).
  const PBKDF2 = 150000;
  async function deriveKey(pass, salt, usage) {
    const base = await subtle().importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      [usage]
    );
  }
  async function encryptBackup(obj, pass) {
    if (typeof pass !== 'string' || pass.length < 8) throw new Error('Use uma senha de pelo menos 8 caracteres.');
    const salt = root.crypto.getRandomValues(new Uint8Array(16)),
      iv = root.crypto.getRandomValues(new Uint8Array(12)),
      key = await deriveKey(pass, salt, 'encrypt'),
      ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return ['skyke-backup-v1', b64u(salt), b64u(iv), b64u(ct)].join('.');
  }
  async function decryptBackup(text, pass) {
    if (typeof text !== 'string' || typeof pass !== 'string') throw new Error('Backup ou senha inválidos.');
    const p = text.trim().split('.');
    if (p.length !== 4 || p[0] !== 'skyke-backup-v1') throw new Error('Este arquivo não é um backup do Skyke3D.');
    const salt = unb64u(p[1]),
      iv = unb64u(p[2]),
      ct = unb64u(p[3]);
    if (!salt || !iv || !ct) throw new Error('Backup corrompido.');
    const key = await deriveKey(pass, salt, 'decrypt');
    let raw;
    try {
      raw = await subtle().decrypt({ name: 'AES-GCM', iv }, key, ct);
    } catch (e) {
      throw new Error('Senha incorreta ou backup corrompido.');
    }
    return JSON.parse(dec.decode(raw));
  }

  async function forget() {
    rec = null;
    token = '';
    tokenExp = 0;
    loadP = null;
    await idbDel().catch(() => {});
  }

  const API = {
    payload,
    deviceKey,
    setDeviceKey,
    bind,
    onMessage,
    load,
    login,
    ensure,
    auth,
    rotatePrimary: () => serial(rotatePrimary),
    rotateRecovery: () => serial(rotateRecovery),
    revokeSessions: () => serial(revokeSessions),
    recoverPrimary: () => serial(recoverPrimary),
    cancelRecovery: () => serial(cancelRecovery),
    settleRecovery,
    backupCode,
    restoreCode,
    finishRestore,
    encryptBackup,
    decryptBackup,
    forget,
    status: () =>
      rec
        ? {
            id: rec.id,
            gen: rec.gen,
            rgen: rec.rgen,
            epoch: rec.epoch,
            hasPrimary: !!rec.primary,
            hasRecovery: !!rec.recovery,
            pendingRecovery: !!rec.pendingRecovery
          }
        : null,
    id: () => (rec ? rec.id : ''),
    token: () => token
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.SKYID = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
