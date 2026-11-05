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
 * próxima leitura, com geração e época novas.
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
 * @property {{pk: string, until: number}} [pending] troca de principal pedida pela recuperação, aguardando o prazo
 * @property {boolean} [legacy] identidade derivada de uma chave de aparelho antiga
 * @property {boolean} [used] já autenticou ao menos uma vez (só um sinal: não guarda quando nem de onde)
 */

/**
 * @typedef {Object} Result
 * @property {boolean} ok
 * @property {string} [reason]
 * @property {number} [gen]
 * @property {number} [rgen]
 * @property {number} [epoch]
 * @property {boolean} [idempotent]
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
  recover: (id, gen, newPk) => [DOMAIN, 'recover', id, String(gen), newPk].join('\n'),
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
 * @param {{file?: string, max?: number, unusedMs?: number, lazyMs?: number, now?: () => number, onError?: (what: string, e: any) => void,
 *   warn?: (msg: string) => void, writeFile?: (file: string, obj: any, opts?: {durable?: boolean}) => void}} [o]
 */
function createIdentityRegistry({
  file = '',
  max = 20000,
  unusedMs = 24 * 3600000,
  lazyMs = 30000,
  now = Date.now,
  onError = () => {},
  warn = () => {},
  writeFile = writeJsonAtomic
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
    /** @type {{pk: string, until: number}|undefined} */
    let pending;
    if (e.pending !== undefined) {
      if (!e.pending || typeof e.pending !== 'object') return null;
      if (typeof e.pending.pk !== 'string' || !PK_RE.test(e.pending.pk)) return null;
      if (!Number.isFinite(e.pending.until) || e.pending.until < 0) return null;
      pending = { pk: e.pending.pk, until: e.pending.until };
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
      ...(e.legacy === true ? { legacy: true } : {}),
      ...(e.used === true ? { used: true } : {})
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
    for (const [id, e] of Object.entries(src)) {
      if (!ID_RE.test(id)) return false;
      if (!e || typeof e !== 'object') return false;
      const rec = validRecord(id, e);
      if (!rec) return false;
      next.set(id, rec);
      if (rec.pending) nextPending.set(id, rec.pending.until);
    }
    if (max > 0 && next.size > max) return false;
    ids.clear();
    pendings.clear();
    unusedIds.clear();
    for (const [id, rec] of next) {
      ids.set(id, rec);
      if (!rec.used) unusedIds.add(id);
    }
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
        ...(e.pending ? { pending: { pk: e.pending.pk, until: e.pending.until } } : {}),
        ...(e.legacy ? { legacy: true } : {}),
        ...(e.used ? { used: true } : {})
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
      const next = { ...rec, pk: rec.pending.pk, gen: rec.gen + 1, epoch: rec.epoch + 1, at: t };
      delete next.pending;
      ids.set(id, next);
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
    return true;
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
    const next = { ...rec, rpk: newRpk, rgen: rec.rgen + 1, epoch: rec.epoch + 1, at: now() };
    delete next.pending; // trocar a recuperação cancela pedidos feitos com a chave antiga
    ids.set(id, next);
    if (!write()) {
      ids.set(id, rec);
      return { ok: false, reason: 'io' };
    }
    pendings.delete(id);
    return { ok: true, rgen: next.rgen, epoch: next.epoch };
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
    return { ok: true };
  }

  /**
   * Troca a chave principal usando só a chave de recuperação, com período de carência.
   * É o caminho para quem perdeu o aparelho: a principal antiga não é necessária. Durante
   * o prazo, a principal atual ainda pode cancelar (`cancelRecovery`), o que protege contra
   * uma chave de recuperação comprometida. `graceMs: 0` aplica na hora.
   * @param {{id: string, expectedGen: number, newPk: string, sigRec: string, graceMs?: number}} o
   * @returns {Result & {pending?: boolean, until?: number}}
   */
  function recoverPrimary({ id, expectedGen, newPk, sigRec, graceMs = 24 * 3600000 }) {
    if (corrupt) return { ok: false, reason: 'corrupt' };
    if (!settle()) return { ok: false, reason: 'io' };
    const rec = ids.get(id);
    if (!rec) return { ok: false, reason: 'notfound' };
    if (
      !Number.isInteger(expectedGen) ||
      !PK_RE.test(newPk) ||
      !importPublicKey(newPk) ||
      !Number.isFinite(graceMs) ||
      graceMs < 0
    )
      return { ok: false, reason: 'invalid' };
    if (expectedGen !== rec.gen) {
      if (rec.gen === expectedGen + 1 && rec.pk === newPk) return { ok: true, gen: rec.gen, idempotent: true };
      return { ok: false, reason: 'stale', gen: rec.gen };
    }
    if (rec.pending) {
      if (rec.pending.pk === newPk)
        return { ok: true, gen: rec.gen, epoch: rec.epoch, pending: true, until: rec.pending.until };
      return { ok: false, reason: 'pending', until: rec.pending.until };
    }
    const data = payload.recover(id, expectedGen, newPk);
    if (!verifySignature(rec.rpk, data, sigRec)) return { ok: false, reason: 'bad-signature' };
    if (graceMs === 0) {
      const applied = { ...rec, pk: newPk, gen: rec.gen + 1, epoch: rec.epoch + 1, at: now() };
      ids.set(id, applied);
      if (!write()) {
        ids.set(id, rec);
        return { ok: false, reason: 'io' };
      }
      return { ok: true, gen: applied.gen, epoch: applied.epoch };
    }
    const until = now() + graceMs;
    const next = { ...rec, pending: { pk: newPk, until }, at: now() };
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
    return { count: ids.size, unused: unusedIds.size, pending: pendings.size, max, corrupt, savedAt, bytes };
  }

  return {
    get,
    has,
    register,
    touch,
    sweepUnused,
    rotatePrimary,
    rotateRecovery,
    recoverPrimary,
    cancelRecovery,
    revokeSessions,
    remove,
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
  SIG_RE
};
