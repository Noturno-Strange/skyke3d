'use strict';
/*
 * Registro mínimo de identidades do Skyke3D.
 *
 * Cada identidade é um id opaco (12 caracteres base32) ligado a duas chaves públicas
 * P-256 independentes:
 *   - `pk`  chave principal, usada para autenticar as sessões do dia a dia;
 *   - `rpk` chave de recuperação, usada para autorizar a troca da principal quando ela
 *           é perdida ou comprometida.
 *
 * O servidor nunca recebe, guarda ou registra chave privada. O arquivo JSON guarda só
 * chave pública, gerações (`gen`/`rgen`), época de revogação de sessões (`epoch`) e datas
 * técnicas. Não há nome, IP, avatar, amigos, mensagem ou histórico.
 *
 * Todas as operações são síncronas e gravam antes de confirmar: se a escrita falhar, a
 * memória volta ao estado anterior. Se o arquivo estiver corrompido, as operações de
 * identidade falham fechadas em vez de apagar registros.
 *
 * Perder o aparelho não perde a identidade: `recoverPrimary` troca a chave principal usando
 * só a chave de recuperação, com um período de carência durante o qual a principal atual
 * ainda pode cancelar o pedido (`cancelRecovery`). Vencido o prazo, a troca é aplicada na
 * próxima leitura, com geração e época novas. O pedido leva também uma chave de recuperação
 * NOVA: quando a troca vale, o código usado morre junto com a chave antiga (uso único).
 *
 * Passkeys (`pks`, até MAX_PASSKEYS por identidade) são a alternativa ao código: quem prova
 * uma passkey cadastrada (lib/webauthn.js confere) torna o aparelho atual o principal na hora
 * (`attachDevice`), sem carência, porque a passkey é presa ao autenticador e pede a digital,
 * o rosto ou o PIN dele. Do registro saem só chave pública, id e contador de cada passkey.
 */
const crypto = require('crypto');
const fs = require('fs');
const { readJsonFile, writeJsonAtomic } = require('./persist');
const { ID_RE, identityIdOf } = require('./ids');

const V = 1;
const MAX_GEN = 0x7fffffff;
// SPKI DER de P-256 tem 91 bytes; base64url fica com 122 caracteres.
const PK_RE = /^[A-Za-z0-9_-]{80,200}$/;
// Assinatura ECDSA no formato IEEE P1363 (r||s) tem 64 bytes; base64url fica com 86.
const SIG_RE = /^[A-Za-z0-9_-]{80,100}$/;
const DOMAIN = 'skyke3d/id/v1';
const KEY_CACHE_MAX = 4096;
const MAX_PASSKEYS = 10;
const PK_NAME_MAX = 40;
const CID_RE = /^[A-Za-z0-9_-]{16,1366}$/;
const CRED_PK_RE = /^[A-Za-z0-9_-]{40,1200}$/;
const CRED_ALGS = new Set([-7, -8, -257]);
// Keypass: renovação da chave de recuperação pelo próprio jogador. Cada conta tem KEYPASS_MAX oportunidades, com pelo menos
// KEYPASS_INTERVAL_MS entre uma e outra; a quarta só com o administrador liberando uma oportunidade (`keypassGrant`).
const KEYPASS_MAX = 3;
const KEYPASS_INTERVAL_MS = 30 * 24 * 3600000;
const KEYPASS_LOG_MAX = 12;

/**
 * @typedef {Object} Identity
 * @property {string} id
 * @property {string} pk chave pública principal (SPKI DER base64url)
 * @property {number} gen geração da chave principal
 * @property {string} rpk chave pública de recuperação (SPKI DER base64url)
 * @property {number} rgen geração da chave de recuperação
 * @property {number} epoch época de revogação de sessões
 * @property {number} created
 * @property {number} at
 * @property {{pk: string, until: number, rpk?: string}} [pending] troca de principal pedida pela recuperação, aguardando o prazo
 *   (`rpk`: a chave de recuperação nova, que substitui a usada no pedido)
 * @property {Passkey[]} [pks] passkeys cadastradas
 * @property {boolean} [legacy] identidade derivada de uma chave de aparelho antiga
 * @property {boolean} [used] já autenticou ao menos uma vez (só um sinal: não guarda quando nem de onde)
 * @property {{n: number, at: number, log: number[], adm?: number}} [kp] Keypass: renovações da chave de recuperação já usadas (`n`),
 *   quando foi a última (`at`), as datas (`log`) e quantas oportunidades o administrador liberou (`adm`). Nunca guarda chave.
 */

/**
 * @typedef {Object} Passkey
 * @property {string} cid id da credencial (base64url)
 * @property {string} pk chave pública (SPKI DER base64url)
 * @property {number} alg algoritmo COSE (-7, -8 ou -257)
 * @property {number} sc contador de assinaturas
 * @property {string} name apelido escolhido pelo jogador
 * @property {number} created
 * @property {number} [used] última entrada com ela
 */

/**
 * @typedef {Object} Result
 * @property {boolean} ok
 * @property {string} [reason]
 * @property {number} [gen]
 * @property {number} [rgen]
 * @property {number} [epoch]
 * @property {boolean} [idempotent]
 * @property {number} [until] Keypass: a partir de quando dá para renovar de novo
 * @property {{used: number, max: number, left: number, next: number, last: number, log: number[], intervalMs: number}} [keypass]
 */

// Payloads canônicos: cliente e servidor assinam exatamente a mesma string. A separação
// por domínio e por ação impede reaproveitar uma assinatura de rotação numa revogação.
const payload = {
  register: (id, pk, rpk) => [DOMAIN, 'register', id, pk, rpk].join('\n'),
  auth: (id, nonce, action) => [DOMAIN, 'auth', id, nonce, action].join('\n'),
  rotate: (id, gen, newPk) => [DOMAIN, 'rotate', id, String(gen), newPk].join('\n'),
  rotateRecovery: (id, rgen, newRpk) => [DOMAIN, 'rotate-recovery', id, String(rgen), newRpk].join('\n'),
  revoke: (id, epoch) => [DOMAIN, 'revoke', id, String(epoch)].join('\n'),
  remove: id => [DOMAIN, 'remove', id].join('\n'),
  // com a chave de recuperação nova (uso único do código); sem ela, o formato antigo
  recover: (id, gen, newPk, newRpk) =>
    [DOMAIN, 'recover', id, String(gen), newPk, ...(newRpk ? [newRpk] : [])].join('\n'),
  cancelRecovery: (id, gen) => [DOMAIN, 'cancel-recovery', id, String(gen)].join('\n')
};

/** @type {Map<string, any>} */
const keyCache = new Map();

/**
 * Importa uma chave pública P-256 em SPKI DER base64url, exigindo a curva certa.
 * @param {string} b64
 * @returns {any|null}
 */
function importPublicKey(b64) {
  if (typeof b64 !== 'string' || !PK_RE.test(b64)) return null;
  const hit = keyCache.get(b64);
  if (hit) return hit;
  let key;
  try {
    key = crypto.createPublicKey({ key: Buffer.from(b64, 'base64url'), format: 'der', type: 'spki' });
  } catch (e) {
    return null;
  }
  if (
    key.asymmetricKeyType !== 'ec' ||
    !key.asymmetricKeyDetails ||
    key.asymmetricKeyDetails.namedCurve !== 'prime256v1'
  )
    return null;
  if (keyCache.size >= KEY_CACHE_MAX) keyCache.clear();
  keyCache.set(b64, key);
  return key;
}

/**
 * Verifica uma assinatura ECDSA P-256/SHA-256 no formato do WebCrypto (r||s, 64 bytes).
 * @param {string} pk
 * @param {string} data
 * @param {string} sig
 * @returns {boolean}
 */
function verifySignature(pk, data, sig) {
  if (typeof data !== 'string' || typeof sig !== 'string' || !SIG_RE.test(sig)) return false;
  const key = importPublicKey(pk);
  if (!key) return false;
  let s;
  try {
    s = Buffer.from(sig, 'base64url');
  } catch (e) {
    return false;
  }
  if (s.length !== 64) return false;
  try {
    return crypto.verify('sha256', Buffer.from(data, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }, s);
  } catch (e) {
    return false;
  }
}

/**
 * @param {any} p
 * @returns {Passkey|null}
 */
function validPasskey(p) {
  if (!p || typeof p !== 'object') return null;
  if (typeof p.cid !== 'string' || !CID_RE.test(p.cid)) return null;
  if (typeof p.pk !== 'string' || !CRED_PK_RE.test(p.pk)) return null;
  if (!CRED_ALGS.has(p.alg)) return null;
  if (!Number.isInteger(p.sc) || p.sc < 0 || p.sc > 0xffffffff) return null;
  if (typeof p.name !== 'string' || p.name.length > PK_NAME_MAX) return null;
  if (!Number.isFinite(p.created)) return null;
  if (p.used !== undefined && !Number.isFinite(p.used)) return null;
  return {
    cid: p.cid,
    pk: p.pk,
    alg: p.alg,
    sc: p.sc,
    name: p.name,
    created: p.created,
    ...(p.used !== undefined ? { used: p.used } : {})
  };
}

/**
 * @param {{file?: string, max?: number, unusedMs?: number, lazyMs?: number, now?: () => number, onError?: (what: string, e: any) => void,
 *   warn?: (msg: string) => void, writeFile?: (file: string, obj: any, opts?: {durable?: boolean}) => void,
 *   onSettle?: (id: string) => void, keypassMax?: number, keypassIntervalMs?: number}} [o]
 * `onSettle`: chamado depois de aplicar uma recuperação que venceu a carência (o servidor derruba as sessões antigas)
 */
function createIdentityRegistry({
  file = '',
  max = 20000,
  unusedMs = 24 * 3600000,
  lazyMs = 30000,
  now = Date.now,
  onError = () => {},
  warn = () => {},
  writeFile = writeJsonAtomic,
  onSettle = () => {},
  keypassMax = KEYPASS_MAX,
  keypassIntervalMs = KEYPASS_INTERVAL_MS
} = {}) {
  const enabled = !!file;
  /** @type {Map<string, Identity>} */
  const ids = new Map();
  /**
   * Identidades que nunca autenticaram, na ordem de criação (o Map/Set guarda a ordem de inserção). Quando o registro enche,
   * as mais antigas e ainda não usadas (`unusedMs`) abrem vaga: quem cria milhares de identidades só para encher o registro
   * não as usa, e o jogador de verdade autentica logo depois de registrar. `unusedMs: 0` desliga a reciclagem.
   * @type {Set<string>}
   */
  const unusedIds = new Set();
  let lazyTimer = /** @type {any} */ (null);
  /** @type {Map<string, number>} id → quando a troca pendente vence (só os que têm troca pendente) */
  const pendings = new Map();
  /** @type {Map<string, string>} id da passkey → id da identidade */
  const cidIdx = new Map();
  let savedAt = 0;
  let corrupt = false;
  let mainValid = false;

  /**
   * @param {string} id
   * @param {any} e
   * @returns {Identity|null}
   */
  function validRecord(id, e) {
    if (typeof e.pk !== 'string' || !PK_RE.test(e.pk)) return null;
    if (typeof e.rpk !== 'string' || !PK_RE.test(e.rpk)) return null;
    if (!Number.isInteger(e.gen) || e.gen < 1 || e.gen > MAX_GEN) return null;
    if (!Number.isInteger(e.rgen) || e.rgen < 1 || e.rgen > MAX_GEN) return null;
    if (!Number.isInteger(e.epoch) || e.epoch < 0 || e.epoch > MAX_GEN) return null;
    if (!Number.isFinite(e.created) || !Number.isFinite(e.at)) return null;
    /** @type {{pk: string, until: number, rpk?: string}|undefined} */
    let pending;
    if (e.pending !== undefined) {
      if (!e.pending || typeof e.pending !== 'object') return null;
      if (typeof e.pending.pk !== 'string' || !PK_RE.test(e.pending.pk)) return null;
      if (!Number.isFinite(e.pending.until) || e.pending.until < 0) return null;
      if (e.pending.rpk !== undefined && (typeof e.pending.rpk !== 'string' || !PK_RE.test(e.pending.rpk))) return null;
      pending = { pk: e.pending.pk, until: e.pending.until, ...(e.pending.rpk ? { rpk: e.pending.rpk } : {}) };
    }
    /** @type {Passkey[]} */
    const pks = [];
    if (e.pks !== undefined) {
      if (!Array.isArray(e.pks) || e.pks.length > MAX_PASSKEYS) return null;
      for (const p of e.pks) {
        const v = validPasskey(p);
        if (!v) return null;
        pks.push(v);
      }
    }
    /** @type {{n: number, at: number, log: number[], adm?: number}|undefined} */
    let kp;
    if (e.kp !== undefined) {
      const k = e.kp;
      if (!k || typeof k !== 'object') return null;
      if (!Number.isInteger(k.n) || k.n < 0 || k.n > MAX_GEN) return null;
      if (!Number.isFinite(k.at) || k.at < 0) return null;
      if (!Array.isArray(k.log) || k.log.length > KEYPASS_LOG_MAX || !k.log.every(Number.isFinite)) return null;
      if (k.adm !== undefined && (!Number.isInteger(k.adm) || k.adm < 0 || k.adm > MAX_GEN)) return null;
      kp = { n: k.n, at: k.at, log: [...k.log], ...(k.adm ? { adm: k.adm } : {}) };
    }
    return {
      id,
      pk: e.pk,
      gen: e.gen,
      rpk: e.rpk,
      rgen: e.rgen,
      epoch: e.epoch,
      created: e.created,
      at: e.at,
      ...(pending ? { pending } : {}),
      ...(pks.length ? { pks } : {}),
      ...(e.legacy === true ? { legacy: true } : {}),
      ...(e.used === true ? { used: true } : {}),
      ...(kp ? { kp } : {})
    };
  }

  /**
   * Lê e valida o arquivo; só troca o mapa em memória no fim, se tudo estiver certo.
   * @param {any} obj
   * @returns {boolean}
   */
  function parse(obj) {
    if (!obj || typeof obj !== 'object' || obj.v !== V) return false;
    const src = obj.ids;
    if (!src || typeof src !== 'object' || Array.isArray(src)) return false;
    /** @type {Map<string, Identity>} */
    const next = new Map();
    /** @type {Map<string, number>} */
    const nextPending = new Map();
    /** @type {Map<string, string>} */
    const nextCid = new Map();
    for (const [id, e] of Object.entries(src)) {
      if (!ID_RE.test(id)) return false;
      if (!e || typeof e !== 'object') return false;
      const rec = validRecord(id, e);
      if (!rec) return false;
      next.set(id, rec);
      if (rec.pending) nextPending.set(id, rec.pending.until);
      for (const p of rec.pks || []) {
        if (nextCid.has(p.cid)) return false; // a mesma passkey em duas contas: arquivo adulterado
        nextCid.set(p.cid, id);
      }
    }
    if (max > 0 && next.size > max) return false;
    ids.clear();
    pendings.clear();
    unusedIds.clear();
    cidIdx.clear();
    for (const [id, rec] of next) {
      ids.set(id, rec);
      if (!rec.used) unusedIds.add(id);
    }
    for (const [cid, id] of nextCid) cidIdx.set(cid, id);
    for (const [id, until] of nextPending) pendings.set(id, until);
    return true;
  }

  /**
   * @param {string} p
   * @returns {{found: boolean, ok: boolean}}
   */
  function readValid(p) {
    try {
      const obj = readJsonFile(p);
      if (obj === null) return { found: false, ok: false };
      return { found: true, ok: parse(obj) };
    } catch (e) {
      return { found: true, ok: false };
    }
  }

  if (enabled) {
    const main = readValid(file);
    if (main.ok) mainValid = true;
    else {
      const bak = readValid(file + '.bak');
      if (bak.ok) warn('identidade: arquivo principal inválido; usando ' + file + '.bak');
      else if (main.found || bak.found) {
        corrupt = true;
        warn('identidade: registro inválido em ' + file + '; operações de identidade bloqueadas até reparar.');
      }
    }
  }

  /**
   * Grava o estado atual. Devolve false (e não altera a memória) se a escrita falhar.
   * @returns {boolean}
   */
  function write() {
    if (!enabled) return true;
    if (corrupt) return false;
    const at = now();
    /** @type {Record<string, any>} */
    const out = Object.create(null);
    for (const [id, e] of ids) {
      out[id] = {
        pk: e.pk,
        gen: e.gen,
        rpk: e.rpk,
        rgen: e.rgen,
        epoch: e.epoch,
        created: e.created,
        at: e.at,
        ...(e.pending
          ? { pending: { pk: e.pending.pk, until: e.pending.until, ...(e.pending.rpk ? { rpk: e.pending.rpk } : {}) } }
          : {}),
        ...(e.pks && e.pks.length ? { pks: e.pks.map(p => ({ ...p })) } : {}),
        ...(e.legacy ? { legacy: true } : {}),
        ...(e.used ? { used: true } : {}),
        ...(e.kp ? { kp: { n: e.kp.n, at: e.kp.at, log: [...e.kp.log], ...(e.kp.adm ? { adm: e.kp.adm } : {}) } } : {})
      };
    }
    try {
      // O .bak guarda a geração anterior. Nunca copiar um arquivo principal inválido por
      // cima de um .bak bom: por isso a cópia só acontece depois de uma leitura válida.
      if (mainValid) {
        try {
          fs.copyFileSync(file, file + '.bak');
        } catch (e) {
          /* backup é melhor esforço */
        }
      }
      writeFile(file, { v: V, savedAt: at, ids: out }, { durable: true });
      savedAt = at;
      mainValid = true;
      return true;
    } catch (e) {
      onError('identidade', e);
      return false;
    }
  }

  /**
   * Aplica as trocas de chave pedidas pela recuperação cujo prazo de carência venceu.
   * Só percorre quem tem troca pendente (normalmente ninguém), então é barato o bastante
   * para rodar antes de qualquer leitura de estado. Se a gravação falhar, nada muda.
   * @returns {boolean}
   */
  function settle() {
    if (corrupt || !pendings.size) return true;
    const t = now();
    /** @type {string[]} */
    const due = [];
    for (const [id, until] of pendings) if (until <= t) due.push(id);
    if (!due.length) return true;
    /** @type {Map<string, Identity>} */
    const before = new Map();
    for (const id of due) {
      const rec = ids.get(id);
      if (!rec || !rec.pending) {
        pendings.delete(id);
        continue;
      }
      before.set(id, rec);
      ids.set(id, applyRecovery(rec, rec.pending, t));
      pendings.delete(id);
    }
    if (!before.size) return true;
    if (!write()) {
      for (const [id, rec] of before) {
        ids.set(id, rec);
        if (rec.pending) pendings.set(id, rec.pending.until);
      }
      return false;
    }
    for (const id of before.keys()) {
      try {
        onSettle(id);
      } catch (e) {
        onError('identidade', e);
      }
    }
    return true;
  }

  /**
   * A recuperação vale: chave principal nova (a do aparelho antigo morre), geração e época novas (todas as sessões morrem) e,
   * quando o pedido trouxe, a chave de recuperação nova (o código usado no pedido deixa de valer).
   * @param {Identity} rec
   * @param {{pk: string, rpk?: string}} p
   * @param {number} t
   * @returns {Identity}
   */
  function applyRecovery(rec, p, t) {
    const next = { ...rec, pk: p.pk, gen: rec.gen + 1, epoch: rec.epoch + 1, at: t };
    if (p.rpk) {
      next.rpk = p.rpk;
      next.rgen = rec.rgen + 1;
    }
    delete next.pending;
    return next;
  }

  /**
   * @param {string} id
   * @returns {Identity|null}
   */
  function get(id) {
    settle();
    const rec = ids.get(id);
    return rec ? { ...rec } : null;
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    return ids.has(id);
  }

  /**
   * @param {{id: string, pk: string, rpk: string, legacy?: boolean}} o
   * @returns {Result}
   */
  function register({ id, pk, rpk, legacy }) {
    if (corrupt) return { ok: false, reason: 'corrupt' };
    if (!ID_RE.test(id) || !PK_RE.test(pk) || !PK_RE.test(rpk)) return { ok: false, reason: 'invalid' };
    // A chave precisa importar de verdade como P-256: um registro com chave inútil deixaria a
    // identidade sem como autenticar e sem como recuperar.
    if (!importPublicKey(pk) || !importPublicKey(rpk)) return { ok: false, reason: 'invalid' };
    if (ids.has(id)) return { ok: false, reason: 'exists' };
    // Cheio: reaproveita a vaga da identidade mais antiga que nunca autenticou (só se já passou de `unusedMs`).
    /** @type {Identity|null} */
    let freed = null;
    if (max > 0 && ids.size >= max) {
      freed = reclaimOldestUnused();
      if (!freed) return { ok: false, reason: 'full' };
    }
    const at = now();
    const rec = { id, pk, gen: 1, rpk, rgen: 1, epoch: 0, created: at, at, ...(legacy ? { legacy: true } : {}) };
    ids.set(id, rec);
    unusedIds.add(id);
    if (!write()) {
      ids.delete(id);
      unusedIds.delete(id);
      if (freed) {
        ids.set(freed.id, freed);
        unusedIds.add(freed.id);
      }
      return { ok: false, reason: 'io' };
    }
    return { ok: true, gen: 1, rgen: 1, epoch: 0 };
  }

  /**
   * Tira do registro a identidade mais antiga que nunca autenticou, se já passou de `unusedMs`. Não grava: quem chama grava.
   * @returns {Identity|null} a identidade removida (para desfazer se a gravação falhar)
   */
  function reclaimOldestUnused() {
    if (!(unusedMs > 0)) return null;
    for (const id of unusedIds) {
      const rec = ids.get(id);
      if (!rec) {
        unusedIds.delete(id);
        continue;
      }
      if (now() - rec.created < unusedMs) return null; // a mais antiga ainda é recente: as outras também
      ids.delete(id);
      unusedIds.delete(id);
      pendings.delete(id);
      for (const p of rec.pks || []) cidIdx.delete(p.cid);
      return rec;
    }
    return null;
  }

  /**
   * Faxina periódica: remove de uma vez as identidades que nunca autenticaram e passaram de `unusedMs`.
   * @returns {number} quantas saíram
   */
  function sweepUnused() {
    if (corrupt || !(unusedMs > 0)) return 0;
    /** @type {Identity[]} */
    const gone = [];
    let rec;
    while ((rec = reclaimOldestUnused())) gone.push(rec);
    if (!gone.length) return 0;
    if (!write()) {
      for (const g of gone) {
        ids.set(g.id, g);
        unusedIds.add(g.id);
        if (g.pending) pendings.set(g.id, g.pending.until);
        for (const p of g.pks || []) cidIdx.set(p.cid, g.id);
      }
      return 0;
    }
    return gone.length;
  }

  /**
   * Marca a identidade como já usada (autenticou). A gravação é adiada (`lazyMs`): é só um sinal de faxina, não
   * muda chave nem geração, então não precisa do fsync imediato das operações de segurança.
   * @param {string} id
   */
  function touch(id) {
    const rec = ids.get(id);
    if (!rec || rec.used) return;
    rec.used = true;
    unusedIds.delete(id);
    if (!enabled || lazyTimer) return;
    lazyTimer = setTimeout(() => {
      lazyTimer = null;
      write();
    }, lazyMs);
    if (lazyTimer.unref) lazyTimer.unref();
  }

  /**
   * Troca a chave principal. Exige assinatura da principal atual E da recuperação: uma
   * principal comprometida sozinha não consegue trocar a chave e trancar o dono.
   * @param {{id: string, expectedGen: number, newPk: string, sigOld: string, sigRec: string}} o
   * @returns {Result}
   */
  function rotatePrimary({ id, expectedGen, newPk, sigOld, sigRec }) {
    if (corrupt) return { ok: false, reason: 'corrupt' };
    if (!settle()) return { ok: false, reason: 'io' };
    const rec = ids.get(id);
    if (!rec) return { ok: false, reason: 'notfound' };
    if (!Number.isInteger(expectedGen) || !PK_RE.test(newPk) || !importPublicKey(newPk))
      return { ok: false, reason: 'invalid' };
    if (expectedGen !== rec.gen) {
      // Retry depois de uma resposta perdida: a troca já está aplicada.
      if (rec.gen === expectedGen + 1 && rec.pk === newPk) return { ok: true, gen: rec.gen, idempotent: true };
      return { ok: false, reason: 'stale', gen: rec.gen };
    }
    const data = payload.rotate(id, expectedGen, newPk);
    if (!verifySignature(rec.pk, data, sigOld) || !verifySignature(rec.rpk, data, sigRec))
      return { ok: false, reason: 'bad-signature' };
    const next = { ...rec, pk: newPk, gen: rec.gen + 1, epoch: rec.epoch + 1, at: now() };
    delete next.pending; // a troca autorizada pelas duas chaves cancela um pedido de recuperação
    ids.set(id, next);
    if (!write()) {
      ids.set(id, rec);
      return { ok: false, reason: 'io' };
    }
    pendings.delete(id);
    return { ok: true, gen: next.gen, epoch: next.epoch };
  }

  /**
   * Troca a chave de recuperação. Exige a recuperação atual E a principal: uma principal
   * comprometida não substitui a recuperação, e uma recuperação comprometida não se
   * substitui sozinha.
   * @param {{id: string, expectedRgen: number, newRpk: string, sigRec: string, sigOld: string}} o
   * @returns {Result}
   */
  function rotateRecovery({ id, expectedRgen, newRpk, sigRec, sigOld }) {
    if (corrupt) return { ok: false, reason: 'corrupt' };
    if (!settle()) return { ok: false, reason: 'io' };
    const rec = ids.get(id);
    if (!rec) return { ok: false, reason: 'notfound' };
    if (!Number.isInteger(expectedRgen) || !PK_RE.test(newRpk) || !importPublicKey(newRpk))
      return { ok: false, reason: 'invalid' };
    if (expectedRgen !== rec.rgen) {
      if (rec.rgen === expectedRgen + 1 && rec.rpk === newRpk) return { ok: true, rgen: rec.rgen, idempotent: true };
      return { ok: false, reason: 'stale', rgen: rec.rgen };
    }
    const data = payload.rotateRecovery(id, expectedRgen, newRpk);
    if (!verifySignature(rec.rpk, data, sigRec) || !verifySignature(rec.pk, data, sigOld))
      return { ok: false, reason: 'bad-signature' };
    // Keypass: só depois das duas assinaturas (quem não prova que é o dono não fica sabendo nem gasta nada). O limite e o intervalo
    // são conferidos e a oportunidade é gasta na MESMA operação síncrona que troca a chave: dois pedidos ao mesmo tempo não passam os
    // dois (o segundo já encontra a geração nova e cai em `stale`), e a repetição do mesmo pedido volta como idempotente lá em cima.
    const t = now(),
      kp = rec.kp || { n: 0, at: 0, log: [] };
    if (kp.n >= keypassMax) return { ok: false, reason: 'keypass-limit', keypass: keypassOf(rec, t) };
    if (kp.n > 0 && kp.at > 0 && t - kp.at < keypassIntervalMs)
      return { ok: false, reason: 'keypass-wait', until: kp.at + keypassIntervalMs, keypass: keypassOf(rec, t) };
    // A chave antiga morre aqui: o registro passa a ter só a pública nova (a privada nunca chega ao servidor), com geração e época
    // novas. Se a gravação falhar, volta tudo (chave antiga e contador), então nunca ficam duas válidas nem nenhuma.
    const next = {
      ...rec,
      rpk: newRpk,
      rgen: rec.rgen + 1,
      epoch: rec.epoch + 1,
      at: t,
      kp: { ...kp, n: kp.n + 1, at: t, log: [...kp.log, t].slice(-KEYPASS_LOG_MAX) }
    };
    delete next.pending; // trocar a recuperação cancela pedidos feitos com a chave antiga
    ids.set(id, next);
    if (!write()) {
      ids.set(id, rec);
      return { ok: false, reason: 'io' };
    }
    pendings.delete(id);
    return { ok: true, rgen: next.rgen, epoch: next.epoch, keypass: keypassOf(next, t) };
  }

  /**
   * Situação do Keypass de um registro: quantas renovações já usou, quantas restam e a partir de quando pode renovar de novo
   * (`next`: 0 = já pode; só vale com `left` > 0). Só números e datas; nunca chave.
   * @param {Identity} rec
   * @param {number} t
   */
  function keypassOf(rec, t) {
    const kp = rec.kp || { n: 0, at: 0, log: [] },
      left = Math.max(0, keypassMax - kp.n),
      wait = kp.n > 0 && kp.at > 0 ? kp.at + keypassIntervalMs : 0;
    return {
      used: kp.n,
      max: keypassMax,
      left,
      next: left && wait > t ? wait : 0,
      last: kp.at,
      log: [...kp.log],
      intervalMs: keypassIntervalMs
    };
  }

  /**
   * Keypass da identidade `id` (para o painel de Segurança do jogador, depois de autenticado).
   * @param {string} id
   */
  function keypass(id) {
    const rec = ids.get(id);
    return rec ? keypassOf(rec, now()) : null;
  }

  /**
   * O administrador libera UMA oportunidade a mais de renovação (a quarta em diante) e tira a espera do mês. Não troca chave nenhuma:
   * o jogador continua precisando do código atual e do aparelho para renovar, então o administrador nunca vê nem escolhe uma chave.
   * @param {string} id
   * @returns {Result}
   */
  function keypassGrant(id) {
    if (corrupt) return { ok: false, reason: 'corrupt' };
    const rec = ids.get(id);
    if (!rec) return { ok: false, reason: 'notfound' };
    const kp = rec.kp || { n: 0, at: 0, log: [] };
    if (kp.n < keypassMax && !(kp.at > 0 && now() - kp.at < keypassIntervalMs))
      return { ok: false, reason: 'not-needed' };
    const next = { ...rec, kp: { ...kp, n: Math.min(kp.n, keypassMax - 1), at: 0, adm: (kp.adm || 0) + 1 } };
    ids.set(id, next);
    if (!write()) {
      ids.set(id, rec);
      return { ok: false, reason: 'io' };
    }
    return { ok: true, keypass: keypassOf(next, now()) };
  }

  /** ids de identidade registrados (o painel procura uma conta pelo código público, que é um hash do id) */
  function listIds() {
    return [...ids.keys()];
  }

  /**
   * Encerra todas as sessões emitidas antes da época atual. A principal autenticada
   * basta: quem tem a chave pode revogar, mas não consegue trocar as chaves.
   * @param {{id: string, expectedEpoch: number, sigOld: string}} o
   * @returns {Result}
   */
  function revokeSessions({ id, expectedEpoch, sigOld }) {
    if (corrupt) return { ok: false, reason: 'corrupt' };
    if (!settle()) return { ok: false, reason: 'io' };
    const rec = ids.get(id);
    if (!rec) return { ok: false, reason: 'notfound' };
    if (!Number.isInteger(expectedEpoch)) return { ok: false, reason: 'invalid' };
    if (expectedEpoch !== rec.epoch) {
      if (rec.epoch === expectedEpoch + 1) return { ok: true, epoch: rec.epoch, idempotent: true };
      return { ok: false, reason: 'stale', epoch: rec.epoch };
    }
    const data = payload.revoke(id, expectedEpoch);
    if (!verifySignature(rec.pk, data, sigOld)) return { ok: false, reason: 'bad-signature' };
    const next = { ...rec, epoch: rec.epoch + 1, at: now() };
    ids.set(id, next);
    if (!write()) {
      ids.set(id, rec);
      return { ok: false, reason: 'io' };
    }
    return { ok: true, epoch: next.epoch };
  }

  /**
   * Apaga o registro (pedido de exclusão). Exige a chave principal.
   * @param {{id: string, sigOld: string}} o
   * @returns {Result}
   */
  function remove({ id, sigOld }) {
    if (corrupt) return { ok: false, reason: 'corrupt' };
    if (!settle()) return { ok: false, reason: 'io' };
    const rec = ids.get(id);
    if (!rec) return { ok: false, reason: 'notfound' };
    const data = payload.remove(id);
    if (!verifySignature(rec.pk, data, sigOld)) return { ok: false, reason: 'bad-signature' };
    ids.delete(id);
    unusedIds.delete(id);
    if (!write()) {
      ids.set(id, rec);
      if (!rec.used) unusedIds.add(id);
      return { ok: false, reason: 'io' };
    }
    pendings.delete(id);
    for (const p of rec.pks || []) cidIdx.delete(p.cid);
    return { ok: true };
  }

  /**
   * Troca a chave principal usando só a chave de recuperação, com período de carência.
   * É o caminho para quem perdeu o aparelho: a principal antiga não é necessária. Durante
   * o prazo, a principal atual ainda pode cancelar (`cancelRecovery`), o que protege contra
   * uma chave de recuperação comprometida. `graceMs: 0` aplica na hora.
   * `newRpk` (a chave de recuperação nova, assinada junto) troca também a recuperação quando a troca vale: o código usado no
   * pedido é de uso único. O servidor exige `newRpk` (lib/identity-ws.js); aqui ele é opcional só para ler pedidos antigos.
   * @param {{id: string, expectedGen: number, newPk: string, newRpk?: string, sigRec: string, graceMs?: number}} o
   * @returns {Result & {pending?: boolean, until?: number}}
   */
  function recoverPrimary({ id, expectedGen, newPk, newRpk, sigRec, graceMs = 24 * 3600000 }) {
    if (corrupt) return { ok: false, reason: 'corrupt' };
    if (!settle()) return { ok: false, reason: 'io' };
    const rec = ids.get(id);
    if (!rec) return { ok: false, reason: 'notfound' };
    if (
      !Number.isInteger(expectedGen) ||
      !PK_RE.test(newPk) ||
      !importPublicKey(newPk) ||
      (newRpk !== undefined && (!PK_RE.test(newRpk) || !importPublicKey(newRpk) || newRpk === rec.rpk)) ||
      !Number.isFinite(graceMs) ||
      graceMs < 0
    )
      return { ok: false, reason: 'invalid' };
    if (expectedGen !== rec.gen) {
      if (rec.gen === expectedGen + 1 && rec.pk === newPk) return { ok: true, gen: rec.gen, idempotent: true };
      return { ok: false, reason: 'stale', gen: rec.gen };
    }
    if (rec.pending) {
      if (rec.pending.pk === newPk && (rec.pending.rpk || '') === (newRpk || ''))
        return { ok: true, gen: rec.gen, epoch: rec.epoch, pending: true, until: rec.pending.until };
      return { ok: false, reason: 'pending', until: rec.pending.until };
    }
    const data = payload.recover(id, expectedGen, newPk, newRpk);
    if (!verifySignature(rec.rpk, data, sigRec)) return { ok: false, reason: 'bad-signature' };
    if (graceMs === 0) {
      const applied = applyRecovery(rec, { pk: newPk, ...(newRpk ? { rpk: newRpk } : {}) }, now());
      ids.set(id, applied);
      if (!write()) {
        ids.set(id, rec);
        return { ok: false, reason: 'io' };
      }
      return { ok: true, gen: applied.gen, rgen: applied.rgen, epoch: applied.epoch };
    }
    const until = now() + graceMs;
    const next = { ...rec, pending: { pk: newPk, until, ...(newRpk ? { rpk: newRpk } : {}) }, at: now() };
    ids.set(id, next);
    if (!write()) {
      ids.set(id, rec);
      return { ok: false, reason: 'io' };
    }
    pendings.set(id, until);
    return { ok: true, gen: rec.gen, epoch: rec.epoch, pending: true, until };
  }

  /**
   * Cancela uma troca de principal pedida pela recuperação. Exige a principal atual, que
   * continua valendo durante a carência.
   * @param {{id: string, expectedGen: number, sigOld: string}} o
   * @returns {Result}
   */
  function cancelRecovery({ id, expectedGen, sigOld }) {
    if (corrupt) return { ok: false, reason: 'corrupt' };
    if (!settle()) return { ok: false, reason: 'io' };
    const rec = ids.get(id);
    if (!rec) return { ok: false, reason: 'notfound' };
    if (!Number.isInteger(expectedGen)) return { ok: false, reason: 'invalid' };
    if (expectedGen !== rec.gen) return { ok: false, reason: 'stale', gen: rec.gen };
    if (!rec.pending) return { ok: true, gen: rec.gen };
    const data = payload.cancelRecovery(id, expectedGen);
    if (!verifySignature(rec.pk, data, sigOld)) return { ok: false, reason: 'bad-signature' };
    const next = { ...rec, at: now() };
    delete next.pending;
    ids.set(id, next);
    if (!write()) {
      ids.set(id, rec);
      return { ok: false, reason: 'io' };
    }
    pendings.delete(id);
    return { ok: true, gen: rec.gen };
  }

  // ---------- passkeys ----------

  /**
   * Cadastra uma passkey já conferida (lib/webauthn.js) numa identidade. Quem chama garante que a sessão é da chave principal.
   * @param {{id: string, cred: {cid: string, pk: string, alg: number, sc: number}, name?: string}} o
   * @returns {Result & {n?: number}}
   */
  function addPasskey({ id, cred, name = '' }) {
    if (corrupt) return { ok: false, reason: 'corrupt' };
    if (!settle()) return { ok: false, reason: 'io' };
    const rec = ids.get(id);
    if (!rec) return { ok: false, reason: 'notfound' };
    const p = validPasskey({ ...cred, name: String(name).slice(0, PK_NAME_MAX), created: now() });
    if (!p) return { ok: false, reason: 'invalid' };
    if (cidIdx.has(p.cid)) return { ok: false, reason: cidIdx.get(p.cid) === id ? 'pk-exists' : 'invalid' };
    const list = rec.pks || [];
    if (list.length >= MAX_PASSKEYS) return { ok: false, reason: 'pk-full' };
    const next = { ...rec, pks: [...list, p], at: now() };
    ids.set(id, next);
    if (!write()) {
      ids.set(id, rec);
      return { ok: false, reason: 'io' };
    }
    cidIdx.set(p.cid, id);
    return { ok: true, n: next.pks.length };
  }

  /**
   * Remove uma passkey (revogação). Depois disso ela não entra mais, mesmo que o autenticador ainda a mostre.
   * @param {{id: string, cid: string}} o
   * @returns {Result & {n?: number}}
   */
  function removePasskey({ id, cid }) {
    if (corrupt) return { ok: false, reason: 'corrupt' };
    if (!settle()) return { ok: false, reason: 'io' };
    const rec = ids.get(id);
    if (!rec) return { ok: false, reason: 'notfound' };
    const list = rec.pks || [];
    const rest = list.filter(p => p.cid !== cid);
    if (rest.length === list.length) return { ok: false, reason: 'pk-missing' };
    const next = { ...rec, at: now() };
    if (rest.length) next.pks = rest;
    else delete next.pks;
    ids.set(id, next);
    if (!write()) {
      ids.set(id, rec);
      return { ok: false, reason: 'io' };
    }
    cidIdx.delete(cid);
    return { ok: true, n: rest.length };
  }

  /**
   * A passkey `cid` (de quem quer que seja), para conferir uma entrada. Não revela nada a quem chama de fora: o servidor só
   * usa para verificar a assinatura.
   * @param {string} cid
   * @returns {{id: string, cred: Passkey}|null}
   */
  function passkeyByCid(cid) {
    if (typeof cid !== 'string') return null;
    const id = cidIdx.get(cid);
    if (!id) return null;
    settle();
    const rec = ids.get(id);
    const cred = rec && (rec.pks || []).find(p => p.cid === cid);
    return rec && cred ? { id, cred: { ...cred } } : null;
  }

  /**
   * Lista as passkeys de uma identidade, sem a chave pública (só o que a tela precisa).
   * @param {string} id
   * @returns {{cid: string, name: string, created: number, used: number}[]}
   */
  function passkeys(id) {
    const rec = ids.get(id);
    return (rec && rec.pks ? rec.pks : []).map(p => ({
      cid: p.cid,
      name: p.name,
      created: p.created,
      used: p.used || 0
    }));
  }

  /**
   * Entrada por passkey (já conferida): o aparelho que entrou passa a ser o principal. A chave principal antiga morre, a época
   * muda (todas as sessões morrem) e um pedido de recuperação em carência é cancelado (quem tem a passkey é o dono).
   * O contador da passkey é atualizado no mesmo registro.
   * @param {{id: string, cid: string, sc: number, newPk: string}} o
   * @returns {Result & {cancelled?: boolean}}
   */
  function attachDevice({ id, cid, sc, newPk }) {
    if (corrupt) return { ok: false, reason: 'corrupt' };
    if (!settle()) return { ok: false, reason: 'io' };
    const rec = ids.get(id);
    if (!rec) return { ok: false, reason: 'notfound' };
    if (!PK_RE.test(newPk) || !importPublicKey(newPk) || !Number.isInteger(sc) || sc < 0)
      return { ok: false, reason: 'invalid' };
    const list = rec.pks || [];
    const i = list.findIndex(p => p.cid === cid);
    if (i < 0) return { ok: false, reason: 'pk-missing' };
    const t = now();
    const pks = list.map((p, j) => (j === i ? { ...p, sc, used: t } : p));
    const next = { ...rec, pk: newPk, gen: rec.gen + 1, epoch: rec.epoch + 1, pks, at: t, used: true };
    const cancelled = !!rec.pending;
    delete next.pending;
    ids.set(id, next);
    unusedIds.delete(id);
    if (!write()) {
      ids.set(id, rec);
      if (!rec.used) unusedIds.add(id);
      return { ok: false, reason: 'io' };
    }
    pendings.delete(id);
    return { ok: true, gen: next.gen, rgen: next.rgen, epoch: next.epoch, cancelled };
  }

  /**
   * @param {string} id
   * @param {string} data
   * @param {string} sig
   * @returns {boolean}
   */
  function verify(id, data, sig) {
    settle();
    const rec = ids.get(id);
    return !!rec && verifySignature(rec.pk, data, sig);
  }

  /**
   * @param {string} id
   * @param {string} data
   * @param {string} sig
   * @returns {boolean}
   */
  function verifyRecovery(id, data, sig) {
    settle();
    const rec = ids.get(id);
    return !!rec && verifySignature(rec.rpk, data, sig);
  }

  /** Toda alteração já é gravada na hora; flush existe para o desligamento. */
  function flush() {
    if (lazyTimer) {
      clearTimeout(lazyTimer);
      lazyTimer = null;
    }
    return enabled ? write() : true;
  }

  function stats() {
    let bytes = 0;
    if (enabled) {
      try {
        bytes = fs.statSync(file).size;
      } catch (e) {
        bytes = 0;
      }
    }
    return {
      count: ids.size,
      unused: unusedIds.size,
      pending: pendings.size,
      passkeys: cidIdx.size,
      max,
      corrupt,
      savedAt,
      bytes
    };
  }

  return {
    get,
    has,
    register,
    touch,
    sweepUnused,
    rotatePrimary,
    rotateRecovery,
    keypass,
    keypassGrant,
    listIds,
    recoverPrimary,
    cancelRecovery,
    revokeSessions,
    remove,
    addPasskey,
    removePasskey,
    passkeyByCid,
    passkeys,
    attachDevice,
    verify,
    verifyRecovery,
    flush,
    stats,
    get size() {
      return ids.size;
    },
    get savedAt() {
      return savedAt;
    },
    get corrupt() {
      return corrupt;
    }
  };
}

module.exports = {
  createIdentityRegistry,
  importPublicKey,
  verifySignature,
  payload,
  identityIdOf,
  V,
  MAX_GEN,
  PK_RE,
  SIG_RE,
  MAX_PASSKEYS,
  PK_NAME_MAX,
  KEYPASS_MAX,
  KEYPASS_INTERVAL_MS
};
