/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Identidade do jogador no navegador (o servidor está em lib/identity.js e lib/auth.js).
 * - A chave primária P-256 é gerada não exportável e fica no IndexedDB como CryptoKey: um XSS
 *   pode assinar enquanto a página está aberta, mas não consegue copiar a chave para fora.
 * - A chave de recuperação é independente e NÃO fica guardada no navegador. Ela nasce na memória, vira o
 *   código de recuperação (que o jogador guarda fora do aparelho) e é descartada: o IndexedDB guarda só a
 *   chave pública dela. Trocar chaves ou restaurar em outro aparelho pede o código de novo, e a chave só
 *   existe na memória durante a operação (ou por alguns minutos logo depois de criada, para o jogador
 *   copiar o código). Assim, quem copia o perfil do navegador ou roda um script na página não leva as
 *   duas chaves juntas: o servidor exige as duas assinaturas para trocar qualquer chave. Contas criadas
 *   por versões antigas ainda têm a chave no aparelho até o jogador conferir o código e removê-la.
 * - O código v2 leva o id opaco, a chave de recuperação e o perfil/amigos (assets/recovery.js).
 * - Passkeys (WebAuthn) são a alternativa ao código: a conta pode ter várias (celular, computador, chave física). Entrar com
 *   uma delas torna este aparelho o principal na hora (chave nova gerada aqui; a do aparelho antigo e as sessões morrem).
 *   Nenhuma impressão digital do navegador é usada: só as chaves.
 * - O código de recuperação vale uma vez: restaurar com ele já gera a chave de recuperação NOVA (o código novo aparece antes
 *   do pedido) e, quando a troca vale, o código usado deixa de funcionar.
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
    recover: (id, gen, newPk, newRpk) => [DOMAIN, 'recover', id, String(gen), newPk, ...(newRpk ? [newRpk] : [])].join('\n'),
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
  // A conexão aberta é reaproveitada. Se a abertura falhar (aba privada, outra aba atualizando) ou o navegador fechar a conexão
  // (o Safari fecha as ociosas), a próxima chamada tenta de novo em vez de repetir o mesmo erro até recarregar a página.
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    const p = new Promise((resolve, reject) => {
      const idb = root.indexedDB;
      if (!idb) return reject(new Error('Este navegador não consegue guardar sua conta. Use outro navegador ou saia da aba privada.'));
      const r = idb.open(DB, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      r.onsuccess = () => {
        const d = r.result;
        const drop = () => {
          if (dbp === p) dbp = null;
        };
        d.onclose = drop;
        d.onversionchange = () => {
          d.close();
          drop();
        };
        resolve(d);
      };
      r.onerror = () => reject(r.error || new Error('IndexedDB indisponível.'));
      r.onblocked = () => reject(new Error('Feche outras abas do jogo para atualizar a identidade.'));
    });
    dbp = p;
    p.catch(() => {
      if (dbp === p) dbp = null;
    });
    return p;
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
  // `recovery` (a chave privada de recuperação) só existe aqui em registros de versões antigas, até o jogador conferir o código e
  // removê-la (confirmRecovery). Contas novas guardam só `rpk` (a pública): a privada vive na memória (memRecovery) e no código.
  /** @type {{id:string,gen:number,rgen:number,epoch:number,pk:string,rpk:string,primary:any,recovery?:any,rconf?:boolean,restoring?:boolean,pendingRecovery?:{rpk:string,rgen:number,recovery?:any},pendingPrimary?:{key:any,pk:string,until:number,rpk?:string,sent?:boolean}}|null} */
  let rec = null,
    token = '',
    tokenExp = 0,
    sender = null,
    loadP = null,
    alertUntil = 0,
    // Keypass: quantas renovações da chave de recuperação a conta já usou e quando pode renovar de novo. Quem informa é o servidor,
    // depois de uma entrada com a chave principal (só contagem e datas); o limite de verdade é ele que impõe.
    /** @type {{used:number,max:number,left:number,next:number,last:number}|null} */
    keypass = null,
    opP = Promise.resolve();
  /** @type {any} */
  let memRecovery = null; // a chave de recuperação (exportável, só na memória) enquanto o jogador precisa dela
  /** @type {any} */
  let memTimer = 0;
  /** @type {any} */
  let ui = null; // ganchos da interface: askCode(motivo, tentar) e confirmNew(código)
  const RECOVERY_MEM_MS = 10 * 60000;
  let recovered = false; // a recuperação valeu nesta sessão: a interface oferece revogar as passkeys antigas
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
    // pelo menos uma chave (ou uma restauração em andamento): um registro só com o id não serve para nada
    (!!r.primary || !!r.recovery || !!r.pendingPrimary || r.restoring === true);
  // Versões anteriores guardavam o par de chaves inteiro; o que assina é a chave privada.
  // A migração mantém quem já tinha identidade criada por essas versões.
  const priv = v => (v && typeof v === 'object' && v.privateKey ? v.privateKey : v);
  function load() {
    if (loadP) return loadP;
    loadP = idbGet()
      .then(r => {
        if (valid(r)) {
          const p = priv(r.primary),
            k = r.recovery ? priv(r.recovery) : null,
            pr = r.pendingRecovery && r.pendingRecovery.recovery ? priv(r.pendingRecovery.recovery) : null;
          const changed = p !== r.primary || (k && k !== r.recovery) || (pr && pr !== r.pendingRecovery.recovery);
          r.primary = p;
          if (k) r.recovery = k;
          if (pr) r.pendingRecovery = { ...r.pendingRecovery, recovery: pr };
          rec = r;
          if (changed) idbPut(rec).catch(() => {});
        }
        return rec;
      })
      .catch(() => rec);
    return loadP;
  }
  /** guarda a chave de recuperação só na memória, por alguns minutos (o suficiente para o jogador copiar o código) */
  function holdRecovery(key) {
    clearTimeout(memTimer);
    memRecovery = key;
    memTimer = setTimeout(dropRecovery, RECOVERY_MEM_MS);
    if (memTimer && typeof memTimer === 'object' && memTimer.unref) memTimer.unref();
  }
  function dropRecovery() {
    clearTimeout(memTimer);
    memTimer = 0;
    memRecovery = null;
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
    // Keypass recusado: quando dá para renovar de novo e a situação que o servidor informou
    if (m && Number.isFinite(m.until)) e.until = m.until;
    if (m && m.kp) setKeypass(m.kp);
    return e;
  }

  /** guarda a situação do Keypass que o servidor mandou (números inteiros e datas, conferidos antes de usar) */
  function setKeypass(k) {
    const n = v => (Number.isFinite(v) && v >= 0 ? v : 0);
    if (k && typeof k === 'object') keypass = { used: n(k.used), max: n(k.max), left: n(k.left), next: n(k.next), last: n(k.last) };
  }
  /** o Keypass deixa renovar agora? Devolve o erro que explica por que não (ou null quando pode, ou quando ainda não se sabe) */
  function keypassBlock() {
    const k = keypass;
    if (!k) return null;
    if (k.left <= 0)
      return codeErr(
        'keypass-limit',
        'Você já usou as ' + k.max + ' renovações da chave de recuperação. Para renovar de novo, fale com o administrador do servidor.'
      );
    if (k.next > Date.now()) {
      const e = codeErr('keypass-wait', 'A chave de recuperação só pode ser renovada uma vez por mês.');
      e.until = k.next;
      return e;
    }
    return null;
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
    if (m.t === 'pkopt') {
      settle(m);
      return true;
    }
    if (
      m.t === 'err' &&
      ['idreg', 'idrot', 'idrec', 'idcancel', 'idrev', 'auth', 'proof', 'pkopt', 'pkreg', 'pklist', 'pkdel', 'pklogin'].includes(m.scope)
    ) {
      settle(m);
      return true;
    }
    return false;
  }
  function bind(send) {
    sender = send;
    // os desafios de passkey ficam presos à conexão que os pediu: conexão nova, desafios novos
    for (const k of Object.keys(pkCache)) delete pkCache[k];
  }

  // ---------- chave de recuperação fora do aparelho ----------
  /** a interface diz como pedir o código ao jogador (askCode) e como mostrar um código novo antes de ele valer (confirmNew) */
  function setUi(h) {
    ui = h && typeof h === 'object' ? h : null;
  }
  function codeErr(code, msg) {
    const e = new Error(msg);
    e.code = code;
    return e;
  }
  // Cabeçalho fixo do SPKI de uma chave pública P-256 (o formato que o servidor guarda em `pk`/`rpk`).
  const SPKI_P256 = Uint8Array.from([
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01,
    0x07, 0x03, 0x42, 0x00, 0x04
  ]);
  /** a chave pública (SPKI, base64url) de uma chave privada exportável: sai do JWK (x, y), sem depender do que o PKCS#8 traz */
  async function spkiOfPrivate(key) {
    const jwk = await subtle().exportKey('jwk', key);
    const pad = s => {
      const u = unb64u(s);
      if (!u || u.length > 32) return null;
      const o = new Uint8Array(32);
      o.set(u, 32 - u.length);
      return o;
    };
    const x = pad(jwk.x),
      y = pad(jwk.y);
    if (!x || !y) throw codeErr('bad-code', 'Código não reconhecido. Confira se copiou tudo.');
    const out = new Uint8Array(SPKI_P256.length + 64);
    out.set(SPKI_P256);
    out.set(x, SPKI_P256.length);
    out.set(y, SPKI_P256.length + 32);
    return b64u(out);
  }
  /** abre um código colado pelo jogador: confere que é desta conta e que é o código atual, e devolve a chave (só na memória) */
  async function keyFromCode(code) {
    const r = root.SKYREC.decodeAny(code);
    if (!r.ok || r.v !== 2) throw codeErr('bad-code', 'Código não reconhecido. Confira se copiou tudo.');
    if (!rec || r.id !== rec.id) throw codeErr('wrong-account', 'Este código é de outra conta.');
    const der = unb64u(r.rec);
    let key;
    try {
      if (!der) throw new Error('formato');
      key = await importPriv(der, true);
    } catch (e) {
      throw codeErr('bad-code', 'Código não reconhecido. Confira se copiou tudo.');
    }
    if (rec.rpk) {
      const spki = await spkiOfPrivate(key);
      // uma troca de recuperação sem resposta ainda pode ter valido: o código novo também serve até o servidor dizer qual vale
      const pr = rec.pendingRecovery && rec.pendingRecovery.rpk,
        pp = rec.pendingPrimary && rec.pendingPrimary.rpk;
      if (spki !== rec.rpk && spki !== pr && spki !== pp)
        throw codeErr('stale-code', 'Este código não é o atual: a chave de recuperação foi trocada depois. Use o código mais recente.');
    }
    return key;
  }
  /**
   * A chave de recuperação para assinar agora: a que está na memória (conta nova, ou código colado há pouco), a que contas
   * antigas ainda guardam no aparelho, ou o código que o jogador cola na hora (a interface valida e devolve a chave).
   */
  async function needRecovery(why) {
    if (memRecovery) return memRecovery;
    if (rec && rec.recovery) return rec.recovery;
    if (!ui || typeof ui.askCode !== 'function') throw codeErr('need-code', 'Cole o código de recuperação para continuar.');
    const key = await ui.askCode(why, async code => {
      try {
        return { ok: true, value: await keyFromCode(code) };
      } catch (e) {
        return { ok: false, msg: (e && e.message) || 'Código inválido.' };
      }
    });
    if (!key) throw codeErr('cancelled', 'Cancelado.');
    return key;
  }
  /** monta o código v2 com uma chave de recuperação exportável e o perfil do jogador (nome, visual, amigos) */
  async function encodeWith(key, profile) {
    const der = await privOf(key);
    return root.SKYREC.encodeV2({
      id: rec ? rec.id : '',
      rec: der,
      fk: deviceKey(),
      name: (profile && profile.name) || '',
      look: (profile && profile.look) || {},
      gloss: profile && profile.gloss ? 1 : 0,
      friends: (profile && profile.friends) || []
    });
  }

  // ---------- registro e autenticação ----------
  // Prova de trabalho do registro (lib/idpow.js no servidor): acha n tal que SHA-256('skyke3d/idreg|k|pk|rpk|n') começa com `bits` zeros.
  // Cede o controle ao navegador a cada ~25 ms de cálculo para a tela não congelar. A cessão usa MessageChannel (sem o piso de 4 ms do
  // setTimeout e sem a limitação de abas em segundo plano; quando não existe, cai para setTimeout): ceder por setTimeout custava
  // mais do que o próprio cálculo.
  const cede = () =>
    typeof root.MessageChannel === 'function'
      ? new Promise(r => {
          const c = new root.MessageChannel();
          c.port1.onmessage = () => {
            c.port1.close();
            r();
          };
          c.port2.postMessage(0);
        })
      : new Promise(r => setTimeout(r, 0));
  async function solveReg(k, pk, rpk, bits) {
    const sha = root.SKYREC && root.SKYREC.sha256;
    if (!sha) throw new Error('Este navegador não consegue preparar o registro. Atualize a página.');
    const head = enc.encode('skyke3d/idreg|' + k + '|' + pk + '|' + rpk + '|'),
      m = new Uint8Array(head.length + 12), // o número tem até 12 dígitos: um buffer só, reaproveitado
      inteiros = bits >> 3,
      resto = bits & 7,
      mascara = resto ? (0xff << (8 - resto)) & 0xff : 0;
    m.set(head);
    let fatia = Date.now();
    for (let n = 0; ; n++) {
      const d = String(n);
      for (let i = 0; i < d.length; i++) m[head.length + i] = d.charCodeAt(i);
      const h = sha(m.subarray(0, head.length + d.length));
      let ok = true;
      for (let i = 0; i < inteiros && ok; i++) if (h[i] !== 0) ok = false;
      if (ok && mascara && (h[inteiros] & mascara) !== 0) ok = false;
      if (ok) return d;
      if ((n & 255) === 255 && Date.now() - fatia > 25) {
        await cede();
        fatia = Date.now();
      }
    }
  }
  /** registra `pk`/`rpk` para a chave do aparelho `k`; paga a prova de trabalho se o servidor pedir (a dificuldade pode subir entre as tentativas) */
  async function registerKeys(k, pk, rpk) {
    const ask = pow =>
      req(
        { t: 'idreg', k, pk, rpk, ...(pow ? { pow } : {}) },
        m => (m.t === 'idok' && m.op === 'register') || (m.t === 'err' && m.scope === 'idreg')
      );
    let r = await ask('');
    for (let i = 0; i < 3 && r.t === 'err' && r.code === 'pow' && Number.isInteger(r.bits) && r.bits > 0 && r.bits <= 24; i++)
      r = await ask(await solveReg(k, pk, rpk, r.bits));
    return r;
  }
  async function enroll() {
    const k = deviceKey();
    if (!k) throw new Error('Não foi possível criar a chave deste aparelho (armazenamento bloqueado).');
    const primary = await genKeys(false),
      recovery = await genKeys(true),
      pk = await pubOf(primary),
      rpk = await pubOf(recovery);
    const r = await registerKeys(k, pk, rpk);
    if (r.t === 'err') throw idErr(r);
    if (!r.id || !ID_RE.test(r.id)) throw new Error('Resposta de registro inválida.');
    // Só a chave PÚBLICA de recuperação vai para o IndexedDB. A privada fica na memória para o jogador copiar o código agora
    // e é descartada depois (ou quando a página fecha): ninguém que leia o perfil do navegador leva as duas chaves.
    rec = { id: r.id, gen: r.gen, rgen: r.rgen, epoch: r.epoch, pk, rpk, primary: primary.privateKey };
    await save();
    holdRecovery(recovery.privateKey);
    return rec;
  }
  async function auth(action, keyOverride) {
    if (!rec) throw new Error('Identidade não encontrada neste aparelho.');
    const key = keyOverride || (action === 'recover' ? await needRecovery('recover') : rec.primary);
    if (!key) throw new Error('Não encontrei a chave deste aparelho.');
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
    // O servidor avisa de um pedido de recuperação em carência (só a chave principal entra para ver): o dono pode cancelar.
    alertUntil = action === 'join' && s.pending && Number.isFinite(s.pending.until) ? s.pending.until : 0;
    if (s.kp) setKeypass(s.kp);
    await save();
    token = s.token;
    tokenExp = Math.min(s.exp || 0, Date.now() + MAX_AGE);
    return s;
  }
  /** entra com a identidade; registra na primeira vez (a chave antiga do aparelho define o id) */
  async function login() {
    await load();
    if (!rec) await enroll();
    if (!rec.primary) throw new Error('Falta terminar a recuperação da conta neste aparelho.');
    if (token && tokenExp > Date.now() + 60000)
      return { id: rec.id, token, k: deviceKey(), gen: rec.gen, epoch: rec.epoch, ...(alertUntil ? { pending: alertUntil } : {}) };
    let s;
    try {
      s = await auth('join');
    } catch (e) {
      // O servidor pode ter perdido este registro (identidade que nunca autenticou foi reciclada, ou o arquivo do servidor
      // foi restaurado de um backup antigo). Quem tem a chave do aparelho registra de novo as MESMAS chaves públicas; se a
      // identidade existe com outras chaves, o servidor recusa e o erro original segue.
      if (e.code !== 'bad-signature') throw e;
      // a chave deste aparelho não vale mais: a conta entrou em outro aparelho (passkey, código ou troca de chave)
      if (!(await reregister()))
        throw codeErr(
          'key-revoked',
          'A chave deste aparelho não vale mais: sua conta entrou em outro aparelho. Para voltar aqui, use o código de recuperação ou 🗝️ Entrar com passkey, em 🔑 Recuperar conta.'
        );
      s = await auth('join');
    }
    return { id: rec.id, token: s.token, k: deviceKey(), gen: rec.gen, epoch: rec.epoch, ...(alertUntil ? { pending: alertUntil } : {}) };
  }
  /** registra de novo as chaves públicas atuais deste aparelho (identidade que o servidor não conhece mais) */
  async function reregister() {
    const k = deviceKey();
    if (!rec || !k || !rec.primary || !rec.pk || !rec.rpk) return false;
    try {
      const r = await registerKeys(k, rec.pk, rec.rpk);
      if (r.t !== 'idok' || r.id !== rec.id) return false;
      rec.gen = r.gen;
      rec.rgen = r.rgen;
      rec.epoch = r.epoch;
      await save();
      return true;
    } catch (e) {
      return false;
    }
  }
  /** prepara a identidade para entrar: registra na primeira vez ou conclui uma restauração pendente */
  async function ensure() {
    await load();
    if (!rec) await enroll();
    else if (!rec.primary) await finishRestore();
    // troca de recuperação que ficou sem resposta: o servidor diz qual chave vale e o jogador fica sabendo o resultado
    let outcome = '';
    if (rec && rec.pendingRecovery) outcome = (await settleRecovery()) ? 'applied' : rec && rec.pendingRecovery ? '' : 'dropped';
    const l = await login();
    // a recuperação valeu agora: a interface avisa e oferece revogar as passkeys antigas (podem estar no aparelho perdido)
    const done = recovered;
    recovered = false;
    return { ...l, ...(outcome ? { recovery: outcome } : {}), ...(done ? { recovered: true } : {}) };
  }

  // ---------- operações de segurança ----------
  async function rotatePrimary() {
    const s = await login();
    // O código de recuperação é pedido ANTES de gerar qualquer coisa: se o jogador cancelar ou colar o código errado, nada foi enviado.
    const rk = await needRecovery('rotate-primary');
    const kp = await genKeys(false),
      newPk = await pubOf(kp),
      data = payload.rotate(rec.id, rec.gen, newPk),
      sigOld = await sign(rec.primary, data),
      sigRec = await sign(rk, data);
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
   * Conclui uma troca de recuperação que ficou sem resposta. O pedido só leva a chave PÚBLICA nova (a privada nunca é guardada no
   * aparelho). Se a resposta se perdeu, o servidor pode ou não ter aplicado a troca, e a geração que ele informa ao entrar diz qual
   * foi o caso. O jogador já viu o código novo antes do pedido; aqui ele fica sabendo se vale o novo ou continua valendo o anterior.
   * @returns {Promise<boolean>} true se a troca valeu
   */
  async function settleRecovery() {
    const p = rec && rec.pendingRecovery;
    if (!p || !rec || !rec.primary) return false;
    if (p.recovery) return settleLegacyRecovery(p);
    let s;
    try {
      s = await auth('join'); // sessão nova: a geração que o servidor informa é a verdade
    } catch (e) {
      return false; // sem rede ou sem sessão agora: a próxima entrada tenta de novo
    }
    const applied = Number.isInteger(s.rgen) && s.rgen === p.rgen + 1;
    if (applied) {
      rec.rpk = p.rpk;
      rec.rconf = false;
    }
    delete rec.pendingRecovery;
    await save();
    return applied;
  }
  /**
   * Troca pendente de uma versão antiga (a chave nova privada foi guardada no aparelho): reenvia o mesmo pedido, que é
   * idempotente (mesma geração e mesma chave pública), então nenhuma chave se perde.
   * @param {{rpk:string,rgen:number,recovery?:any}} p
   * @returns {Promise<boolean>}
   */
  async function settleLegacyRecovery(p) {
    if (!rec || !rec.primary || !rec.recovery) return false;
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
  /**
   * Gera uma chave de recuperação nova. Pede o código ATUAL (a chave antiga assina junto com a principal), mostra o código NOVO ao
   * jogador antes de o servidor trocar (uma falha no meio nunca o deixa sem ele) e depois só guarda a chave pública. A privada nova
   * fica na memória por alguns minutos para o jogador copiar o código, e nunca vai para o IndexedDB.
   * @param {{name?:string,look?:any,gloss?:any,friends?:string[]}} [profile] o que entra no código novo além da chave
   */
  async function rotateRecovery(profile) {
    await load();
    if (!rec) throw new Error('Identidade não encontrada neste aparelho.');
    if (!rec.primary) throw new Error('As chaves desta identidade não estão neste aparelho.');
    // Uma troca anterior sem resposta é concluída antes de gerar outra chave.
    if (rec.pendingRecovery) {
      if (await settleRecovery()) return { ok: true, gen: rec.gen, rgen: rec.rgen, epoch: rec.epoch };
      if (rec.pendingRecovery) throw new Error('A troca anterior ficou pendente. Tente de novo em instantes.');
    }
    await login();
    // Keypass: pergunta ao servidor ANTES de pedir o código atual e de mostrar um código novo. Sem isso, o jogador sem renovações
    // (ou dentro do mês) guardaria um código que o servidor ia recusar em seguida. O servidor confere tudo de novo no pedido.
    const s = await auth('join');
    const blocked = keypassBlock();
    if (blocked) throw blocked;
    const oldKey = await needRecovery('rotate-recovery'); // o código atual (ou a chave que ainda está na memória)
    const kp = await genKeys(true),
      newRpk = await pubOf(kp);
    // O jogador vê (e guarda) o código novo ANTES de o servidor trocar: se a resposta se perder, ele não fica sem ele.
    if (ui && typeof ui.confirmNew === 'function' && !(await ui.confirmNew(await encodeWith(kp.privateKey, profile))))
      throw codeErr('cancelled', 'Cancelado.');
    // Só dados PÚBLICOS vão para o registro: se a resposta se perder, a próxima entrada compara a geração que o servidor informa.
    const pending = { rpk: newRpk, rgen: rec.rgen };
    rec.pendingRecovery = pending;
    await save();
    const data = payload.rotateRecovery(rec.id, pending.rgen, pending.rpk);
    let sigRec, sigOld;
    try {
      sigRec = await sign(oldKey, data);
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
    rec.rpk = pending.rpk;
    delete rec.recovery; // conta antiga: a chave guardada no aparelho morreu com a troca, e a nova nunca é guardada aqui
    rec.rconf = false;
    rec.gen = Number.isInteger(r.gen) ? r.gen : rec.gen;
    rec.rgen = Number.isInteger(r.rgen) ? r.rgen : pending.rgen + 1;
    rec.epoch = r.epoch;
    token = r.token || '';
    tokenExp = r.exp || 0;
    if (r.kp) setKeypass(r.kp);
    delete rec.pendingRecovery;
    await save();
    holdRecovery(kp.privateKey); // para o jogador copiar o código nesta sessão
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
  /** erro de "recuperação em andamento": quando a troca passa a valer (ms desde 1970) e o que o jogador deve fazer */
  function pendingErr(until) {
    const e = new Error('Recuperação em andamento.');
    e.code = 'recover-pending';
    e.until = until || 0;
    return e;
  }
  /**
   * Troca a chave principal usando só a chave de recuperação (sem confiar na principal antiga). O SERVIDOR impõe uma carência
   * (padrão 1 minuto) em que a principal atual pode cancelar; o cliente não pede carência menor (antes mandava `grace: 0` e a troca
   * saía na hora). Enquanto a carência corre, a chave principal nova fica guardada (`pendingPrimary`) e cada nova entrada tenta
   * concluir: entra com ela se já valeu, ou informa quando vale. A chave de recuperação só é necessária para ENVIAR o pedido (ou
   * repeti-lo, se a resposta se perdeu): durante a espera o jogador não precisa colar o código de novo.
   */
  async function recoverPrimary() {
    await load();
    if (!rec) throw new Error('Identidade não encontrada neste aparelho.');
    let pp = rec.pendingPrimary;
    // pedido já enviado antes (pedidos de versões anteriores não têm `rpk` e sempre foram enviados logo depois de criados)
    if (pp && (pp.sent || !pp.rpk)) {
      // pedido anterior: a carência pode ter vencido, e então a chave nova já é a principal do servidor
      try {
        await auth('join', pp.key);
        return promote(pp, true);
      } catch (e) {
        if (e.code !== 'bad-signature') throw e;
      }
      // o servidor já confirmou o pedido e a carência ainda corre: é só esperar
      if (pp.until > Date.now()) throw pendingErr(pp.until);
    }
    // Pedir (ou repetir o pedido) exige a chave de recuperação: a que está na memória ou o código que o jogador cola.
    const rk = await needRecovery('recover');
    // pedido sem a chave de recuperação nova (versão anterior, ou restauração feita sem passar por restoreCode): prepara agora
    if (!pp || !pp.rpk) pp = await prepareRecovery(pp, null);
    const s = await auth('recover', rk);
    const sigRec = await sign(rk, payload.recover(rec.id, rec.gen, pp.pk, pp.rpk));
    if (!pp.sent) {
      pp.sent = true; // a partir daqui o servidor pode ter recebido: a próxima entrada tenta primeiro com a chave nova
      await save();
    }
    const r = await req(
      { t: 'idrec', token: s.token, gen: rec.gen, pk: pp.pk, rpk: pp.rpk, sigRec },
      m => (m.t === 'idok' && m.op === 'recover') || (m.t === 'err' && m.scope === 'idrec')
    );
    if (r.t === 'err') {
      // outro pedido (de outra chave) já está em carência, ou a identidade mudou: o que sobrou aqui não vale mais
      if (r.code === 'pending') {
        const other = pendingErr(r.until);
        other.code = 'recover-other'; // outro pedido (de outra chave) já corre; o nosso fica guardado
        throw other;
      }
      if (r.code !== 'rate' && r.code !== 'busy' && r.code !== 'io') {
        delete rec.pendingPrimary;
        await save();
      }
      throw idErr(r);
    }
    dropRecovery(); // o pedido foi aceito: esta chave não é mais necessária neste aparelho
    if (r.pending) {
      pp.until = Number.isFinite(r.until) ? r.until : 0;
      await save();
      throw pendingErr(pp.until);
    }
    rec.gen = r.gen;
    rec.rgen = Number.isInteger(r.rgen) ? r.rgen : rec.rgen;
    rec.epoch = r.epoch;
    return promote(pp, false);
  }
  /**
   * Prepara um pedido de recuperação: a chave principal nova deste aparelho (não exportável) e a chave de recuperação NOVA, que
   * vira o código novo. O jogador vê e guarda o código novo ANTES do pedido (o código usado agora vale uma vez só: quando a troca
   * valer, só o novo funciona). Fica guardado só o que é público da recuperação nova; a privada existe só no código mostrado.
   * @param {{key:any,pk:string,until:number}|undefined|null} pp pedido anterior sem a chave nova (mantém a mesma principal)
   * @param {any} profile o que entra no código novo além da chave (nome, visual, amigos)
   */
  async function prepareRecovery(pp, profile) {
    const nr = await genKeys(true);
    const prof = profile || (ui && typeof ui.profile === 'function' ? ui.profile() : null);
    if (ui && typeof ui.confirmNew === 'function' && !(await ui.confirmNew(await encodeWith(nr.privateKey, prof), 'recover')))
      throw codeErr('cancelled', 'Cancelado.');
    let key = pp && pp.key,
      pk = pp && pp.pk;
    if (!key) {
      const kp = await genKeys(false);
      key = kp.privateKey;
      pk = await pubOf(kp);
    }
    rec.pendingPrimary = { key, pk, until: 0, rpk: await pubOf(nr) };
    await save(); // guardado ANTES do pedido: se a resposta se perder, o próximo pedido usa as mesmas chaves
    return rec.pendingPrimary;
  }
  /** a chave nova passou a valer: vira a principal deste aparelho (`logged`: já entramos com ela, não precisa de nova prova) */
  async function promote(pp, logged) {
    rec.primary = pp.key;
    rec.pk = pp.pk;
    // o código usado na recuperação morreu junto: vale o novo, mostrado antes do pedido
    if (pp.rpk) {
      rec.rpk = pp.rpk;
      rec.rconf = false;
    }
    delete rec.recovery;
    delete rec.pendingPrimary;
    delete rec.restoring;
    recovered = true;
    if (!logged) {
      token = '';
      tokenExp = 0;
    }
    await save();
    if (!logged) await auth('join');
    return { ok: true, gen: rec.gen, epoch: rec.epoch };
  }
  async function cancelRecovery() {
    const s = await login();
    const sigOld = await sign(rec.primary, payload.cancelRecovery(rec.id, rec.gen));
    const r = await req(
      { t: 'idcancel', token: s.token, gen: rec.gen, sigOld },
      m => (m.t === 'idok' && m.op === 'cancel-recovery') || (m.t === 'err' && m.scope === 'idcancel')
    );
    if (r.t === 'err') throw idErr(r);
    alertUntil = 0;
    keypass = null;
    return r;
  }

  // ---------- códigos e backup ----------
  /**
   * código v2: id + chave de recuperação + perfil/amigos (nunca a chave principal). Só dá para montá-lo enquanto a chave está na
   * memória (conta nova, troca recente) ou, em contas antigas, guardada no aparelho; senão devolve null e o jogador usa o código
   * que guardou (refreshCode monta um igual, com os amigos de agora, a partir dele).
   */
  async function backupCode(profile) {
    await load();
    const key = memRecovery || (rec && rec.recovery);
    if (!rec || !key) return null;
    return encodeWith(key, profile);
  }
  /**
   * O jogador cola o código que guardou: se confere com a chave de recuperação desta conta, a chave que ainda estivesse neste
   * aparelho (contas antigas) ou na memória é removida e fica só o código dele. É a prova de que ele TEM o código antes de a cópia
   * do aparelho ser apagada. Lança bad-code / wrong-account / stale-code quando não confere.
   */
  async function confirmRecovery(code) {
    await load();
    if (!rec) throw new Error('Identidade não encontrada neste aparelho.');
    await keyFromCode(code);
    dropRecovery();
    delete rec.recovery;
    rec.rconf = true;
    await save();
    return { ok: true };
  }
  /** o jogador cola o código que guardou e recebe um igual, com o perfil e os amigos de agora (a chave é a mesma; nada é guardado) */
  async function refreshCode(code, profile) {
    await load();
    if (!rec) throw new Error('Identidade não encontrada neste aparelho.');
    return encodeWith(await keyFromCode(code), profile);
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
    let recovery, rpk;
    try {
      recovery = await importPriv(der, true);
      rpk = await spkiOfPrivate(recovery);
    } catch (e) {
      return { ok: false, err: 'formato' };
    }
    // A chave de recuperação do código fica só na memória (o suficiente para pedir a recuperação logo em seguida); o registro
    // guarda a chave pública dela, para conferir códigos colados depois.
    const prev = rec;
    rec = { id: r.id, gen: 0, rgen: 0, epoch: 0, pk: '', rpk, primary: null, restoring: true };
    token = '';
    tokenExp = 0;
    loadP = Promise.resolve(rec);
    // O código vale uma vez: o código NOVO sai agora, antes de qualquer pedido, ainda na tela inicial (sem pressa e sem conexão
    // aberta). Se o jogador desistir, nada mudou neste aparelho.
    try {
      await prepareRecovery(null, { name: r.name, look: r.look, gloss: r.gloss, friends: r.friends });
    } catch (e) {
      rec = prev;
      loadP = null;
      if (e && e.code === 'cancelled') return { ok: false, err: 'cancelado' };
      throw e;
    }
    holdRecovery(recovery);
    return { ok: true, v: 2, id: r.id, fk: r.fk, name: r.name, look: r.look, gloss: r.gloss, friends: r.friends };
  }
  /** completa a restauração: troca a principal usando a recuperação e volta com um token de jogo */
  async function finishRestore() {
    await load();
    if (!rec) throw new Error('Nenhuma identidade restaurada.');
    if (rec.primary) return login();
    await recoverPrimary();
    return login();
  }

  // ---------- passkeys (WebAuthn; o servidor confere em lib/webauthn.js) ----------
  /** @type {Record<string, any>} opções (desafio) já pedidas ao servidor, por finalidade */
  const pkCache = {};
  /** o navegador cria e usa passkeys aqui? (https ou localhost, e getPublicKey para entregar a chave ao servidor) */
  function passkeySupported() {
    try {
      const A = root.AuthenticatorAttestationResponse;
      return !!(
        root.isSecureContext &&
        root.PublicKeyCredential &&
        root.navigator &&
        root.navigator.credentials &&
        A &&
        typeof A.prototype.getPublicKey === 'function' &&
        typeof A.prototype.getAuthenticatorData === 'function'
      );
    } catch (e) {
      return false;
    }
  }
  /**
   * Pede o desafio ao servidor ANTES do clique do jogador: alguns navegadores (Safari) só abrem a passkey se a chamada sair
   * direto do clique, sem esperar a rede. O desafio é de uso único e vence em 2 minutos.
   * @param {'reg'|'login'} purpose
   */
  async function preparePasskey(purpose) {
    const c = pkCache[purpose];
    if (c && c.exp - Date.now() > 20000) return c;
    const msg = { t: 'pkopt', purpose };
    if (purpose === 'reg') msg.token = (await login()).token;
    const r = await req(msg, m => (m.t === 'pkopt' && m.purpose === purpose) || (m.t === 'err' && m.scope === 'pkopt'));
    if (r.t === 'err') throw idErr(r);
    pkCache[purpose] = r;
    return r;
  }
  function takeOpt(purpose) {
    const c = pkCache[purpose];
    delete pkCache[purpose];
    return c && c.exp - Date.now() > 5000 ? c : null;
  }
  /** erro do navegador ao usar a passkey, em português */
  function pkErr(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'AbortError') return codeErr('cancelled', 'Passkey cancelada ou o tempo acabou. Clique de novo para tentar.');
    if (n === 'InvalidStateError') return codeErr('pk-exists', 'Esta passkey já está cadastrada na sua conta.');
    if (n === 'NotSupportedError') return codeErr('pk-unsupported', 'Este aparelho não tem um tipo de passkey compatível.');
    if (n === 'SecurityError') return codeErr('pk-origin', 'Passkeys só funcionam pelo endereço do jogo com https.');
    return e instanceof Error ? e : new Error('Não foi possível usar a passkey.');
  }
  const bytes = s => {
    const u = unb64u(s);
    if (!u) throw new Error('Resposta do servidor inválida.');
    return u;
  };
  /**
   * Cadastra uma passkey neste aparelho (ou num celular/chave física, pelo navegador). Precisa da sessão da chave principal.
   * @param {string} name apelido para reconhecer a passkey na lista (ex.: "Celular")
   * @param {string} [label] como a conta aparece no gerenciador de passkeys (ex.: o nome do jogador)
   */
  async function addPasskey(name, label) {
    if (!passkeySupported()) throw codeErr('pk-unsupported', 'Este navegador não cria passkeys. Use um navegador atualizado com https.');
    const s = await login();
    const o = takeOpt('reg') || (await preparePasskey('reg'), takeOpt('reg'));
    if (!o) throw new Error('O servidor não respondeu. Tente de novo.');
    const who = String(label || 'Skyke3D').slice(0, 40);
    let cred;
    try {
      cred = await root.navigator.credentials.create({
        publicKey: {
          rp: { id: o.rpId, name: 'Skyke3D' },
          user: { id: bytes(o.user), name: who, displayName: who },
          challenge: bytes(o.challenge),
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -8 },
            { type: 'public-key', alg: -257 }
          ],
          authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
          attestation: 'none',
          timeout: 120000,
          excludeCredentials: (o.exclude || []).map(id => ({ type: 'public-key', id: bytes(id) }))
        }
      });
    } catch (e) {
      throw pkErr(e);
    }
    const resp = cred && cred.response;
    const spki = resp && resp.getPublicKey && resp.getPublicKey();
    if (!spki) throw codeErr('pk-unsupported', 'Esta passkey usa um tipo de chave que o jogo não aceita.');
    const r = await req(
      {
        t: 'pkreg',
        token: s.token,
        challenge: o.challenge,
        cd: b64u(resp.clientDataJSON),
        ad: b64u(resp.getAuthenticatorData()),
        spki: b64u(spki),
        alg: resp.getPublicKeyAlgorithm(),
        cid: b64u(cred.rawId),
        name: String(name || '').slice(0, 40)
      },
      m => (m.t === 'idok' && m.op === 'pkreg') || (m.t === 'err' && m.scope === 'pkreg')
    );
    if (r.t === 'err') throw idErr(r);
    return r.list || [];
  }
  /** as passkeys da conta (apelido, quando foi criada e a última entrada com ela) */
  async function listPasskeys() {
    const s = await login();
    const r = await req({ t: 'pklist', token: s.token }, m => (m.t === 'idok' && m.op === 'pklist') || (m.t === 'err' && m.scope === 'pklist'));
    if (r.t === 'err') throw idErr(r);
    return { list: r.list || [], on: r.on !== false };
  }
  /** revoga uma passkey (ou todas, com `all`): depois disso ela não entra mais nesta conta */
  async function removePasskey(cid, all) {
    const s = await login();
    const r = await req(
      { t: 'pkdel', token: s.token, ...(all ? { all: true } : { cid }) },
      m => (m.t === 'idok' && m.op === 'pkdel') || (m.t === 'err' && m.scope === 'pkdel')
    );
    if (r.t === 'err') throw idErr(r);
    return r.list || [];
  }
  /**
   * Entra com uma passkey, sem nada guardado neste aparelho (aparelho novo, navegador limpo). Este aparelho vira o principal:
   * a chave principal nova nasce aqui (não exportável) e o servidor troca a antiga na hora, derrubando as sessões abertas e
   * cancelando um pedido de recuperação em carência. O que havia de outra conta neste aparelho é substituído.
   */
  async function passkeyLogin() {
    if (!passkeySupported()) throw codeErr('pk-unsupported', 'Este navegador não usa passkeys. Use um navegador atualizado com https.');
    const o = takeOpt('login') || (await preparePasskey('login'), takeOpt('login'));
    if (!o) throw new Error('O servidor não respondeu. Tente de novo.');
    let a;
    try {
      a = await root.navigator.credentials.get({
        publicKey: { challenge: bytes(o.challenge), rpId: o.rpId, userVerification: 'required', timeout: 120000, allowCredentials: [] }
      });
    } catch (e) {
      throw pkErr(e);
    }
    const kp = await genKeys(false),
      pk = await pubOf(kp);
    const r = await req(
      {
        t: 'pklogin',
        challenge: o.challenge,
        cid: b64u(a.rawId),
        cd: b64u(a.response.clientDataJSON),
        ad: b64u(a.response.authenticatorData),
        sig: b64u(a.response.signature),
        pk
      },
      m => (m.t === 'idok' && m.op === 'pklogin') || (m.t === 'err' && m.scope === 'pklogin')
    );
    if (r.t === 'err') throw idErr(r);
    dropRecovery();
    alertUntil = 0;
    keypass = null;
    rec = { id: r.id, gen: r.gen, rgen: r.rgen, epoch: r.epoch, pk, rpk: r.rpk, primary: kp.privateKey };
    loadP = Promise.resolve(rec);
    token = r.token;
    tokenExp = Math.min(r.exp || 0, Date.now() + MAX_AGE);
    await save();
    return { ok: true, id: r.id, cancelled: !!r.cancelled };
  }

  // Backup em arquivo: AES-GCM 256 com chave derivada da senha (PBKDF2-SHA-256).
  // v2 (atual): 600 mil voltas (o mínimo que a OWASP recomenda hoje para PBKDF2-SHA-256) e o cabeçalho "versão.voltas" entra como dado
  // autenticado do AES-GCM: quem mexer no número de voltas do arquivo faz a abertura falhar (não dá para rebaixar a derivação).
  // v1 (150 mil voltas, sem cabeçalho autenticado) continua abrindo, mas os backups novos saem sempre em v2.
  const PBKDF2 = 600000,
    PBKDF2_V1 = 150000,
    PBKDF2_MIN = 100000,
    PBKDF2_MAX = 2000000,
    PASS_MIN = 10;
  async function deriveKey(pass, salt, usage, iterations) {
    const base = await subtle().importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      [usage]
    );
  }
  async function encryptBackup(obj, pass) {
    if (typeof pass !== 'string' || pass.length < PASS_MIN) throw new Error('Use uma senha de pelo menos ' + PASS_MIN + ' caracteres.');
    if (new Set(pass).size < 5) throw new Error('A senha é simples demais: misture letras e números, ou use uma frase.');
    const salt = root.crypto.getRandomValues(new Uint8Array(16)),
      iv = root.crypto.getRandomValues(new Uint8Array(12)),
      head = 'skyke-backup-v2.' + PBKDF2,
      key = await deriveKey(pass, salt, 'encrypt', PBKDF2),
      ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(head) }, key, enc.encode(JSON.stringify(obj)));
    return [head, b64u(salt), b64u(iv), b64u(ct)].join('.');
  }
  async function decryptBackup(text, pass) {
    if (typeof text !== 'string' || typeof pass !== 'string') throw new Error('Backup ou senha inválidos.');
    const p = text.trim().split('.');
    let iterations = 0,
      aad = null,
      body;
    if (p.length === 4 && p[0] === 'skyke-backup-v1') {
      iterations = PBKDF2_V1;
      body = p.slice(1);
    } else if (p.length === 5 && p[0] === 'skyke-backup-v2' && /^\d{5,8}$/.test(p[1])) {
      iterations = +p[1];
      // limites: um arquivo adulterado não pode pedir 1 voltas (senha fraca) nem bilhões (travar o navegador)
      if (iterations < PBKDF2_MIN || iterations > PBKDF2_MAX) throw new Error('Este arquivo não é um backup do Skyke3D.');
      aad = enc.encode(p[0] + '.' + p[1]);
      body = p.slice(2);
    } else throw new Error('Este arquivo não é um backup do Skyke3D.');
    const salt = unb64u(body[0]),
      iv = unb64u(body[1]),
      ct = unb64u(body[2]);
    if (!salt || !iv || !ct) throw new Error('Backup corrompido.');
    const key = await deriveKey(pass, salt, 'decrypt', iterations);
    let raw;
    try {
      raw = await subtle().decrypt({ name: 'AES-GCM', iv, ...(aad ? { additionalData: aad } : {}) }, key, ct);
    } catch (e) {
      throw new Error('Senha incorreta ou backup corrompido.');
    }
    return JSON.parse(dec.decode(raw));
  }

  async function forget() {
    alertUntil = 0;
    keypass = null;
    recovered = false;
    dropRecovery();
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
    passkeySupported,
    preparePasskey: purpose => preparePasskey(purpose),
    addPasskey: (name, label) => serial(() => addPasskey(name, label)),
    listPasskeys,
    removePasskey: cid => serial(() => removePasskey(cid, false)),
    removeAllPasskeys: () => serial(() => removePasskey('', true)),
    passkeyLogin: () => serial(passkeyLogin),
    rotatePrimary: () => serial(rotatePrimary),
    rotateRecovery: profile => serial(() => rotateRecovery(profile)),
    // Keypass: a situação que o servidor informou na última entrada (null antes dela) e uma consulta nova
    keypass: () => (keypass ? { ...keypass } : null),
    keypassRefresh: () =>
      serial(async () => {
        await load();
        if (!rec || !rec.primary) return null;
        await auth('join');
        return keypass ? { ...keypass } : null;
      }),
    revokeSessions: () => serial(revokeSessions),
    recoverPrimary: () => serial(recoverPrimary),
    cancelRecovery: () => serial(cancelRecovery),
    settleRecovery,
    setUi,
    backupCode,
    confirmRecovery,
    refreshCode,
    discardRecovery: dropRecovery,
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
            // a identidade tem chave de recuperação registrada (a privada NÃO costuma estar neste aparelho)
            hasRecovery: !!rec.rpk || !!rec.recovery,
            // dá para mostrar/copiar o código agora: a chave está na memória (conta nova ou troca recente) ou, em contas antigas, no aparelho
            codeReady: !!memRecovery || !!rec.recovery,
            // conta de versão antiga: a chave de recuperação ainda está guardada neste aparelho até o jogador conferir o código
            recoveryOnDevice: !!rec.recovery,
            // o jogador provou que tem o código (colou e conferiu)
            recoveryChecked: !!rec.rconf,
            pendingRecovery: !!rec.pendingRecovery,
            // restauração em carência neste aparelho (quando a troca da chave passa a valer, ms) e aviso de pedido de terceiros
            pendingPrimary: !!rec.pendingPrimary,
            pendingUntil: rec.pendingPrimary ? rec.pendingPrimary.until : 0,
            alert: alertUntil,
            passkeys: passkeySupported()
          }
        : null,
    id: () => (rec ? rec.id : ''),
    token: () => token
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.SKYID = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
