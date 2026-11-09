'use strict';
/*
 * Autenticação por desafio-resposta e tokens de sessão.
 *
 * A chave privada nunca sai do aparelho: o cliente assina um nonce de uso único e o
 * servidor confere com a chave pública do registro de identidades. O token resultante é
 * aleatório, fica só em memória e carrega a geração e a época em que foi emitido — assim
 * rotação de chave ou revogação de sessões invalidam todos os tokens antigos na hora.
 *
 * A chave de recuperação autentica num escopo limitado: só revogar sessões e pedir a troca
 * da principal. Ela não abre sessão de jogo nem troca a própria chave de recuperação.
 *
 * Tudo é síncrono: não há await entre ler o nonce e consumi-lo, então dois pedidos
 * simultâneos com o mesmo nonce não conseguem passar os dois.
 *
 * O servidor guarda só o SHA-256 de cada token (quem lesse a memória do processo não teria
 * tokens para usar). Os desafios das passkeys (`pkChallenge`/`takePkChallenge`) seguem as
 * mesmas regras: aleatórios, de uso único, com prazo curto e presos à conexão que pediu.
 */
const crypto = require('crypto');
const { ID_RE } = require('./ids');
const { payload, verifySignature } = require('./identity');

// Chave "fantasma": id desconhecido também passa por uma verificação ECDSA completa, para não responder mais rápido
// do que um id que existe (a diferença de tempo revelaria quais ids estão registrados).
const GHOST_PK = crypto
  .generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  .publicKey.export({ format: 'der', type: 'spki' })
  .toString('base64url');

const HOUR = 3600000;
/** Só o hash do token fica no mapa de sessões. */
const tokenKey = t => crypto.createHash('sha256').update(t).digest('base64url');

/** Ação → quem pode assinar: só a principal, só a recuperação, ou as duas. */
const ACTIONS = {
  join: 'primary',
  rotate: 'primary',
  'rotate-recovery': 'primary',
  revoke: 'both',
  remove: 'primary',
  recover: 'recovery',
  'cancel-recovery': 'primary',
  // cadastrar, listar e remover passkeys: só com a sessão da chave principal (verifyToken; não há desafio para esta ação)
  passkey: 'primary'
};

/** O que um token emitido pela chave de recuperação pode fazer. */
const RECOVERY_ACTIONS = new Set(['revoke', 'recover']);

/**
 * @typedef {Object} Session
 * @property {string} id
 * @property {number} gen
 * @property {number} epoch
 * @property {'primary'|'recovery'} scope
 * @property {number} exp
 */

/**
 * @param {{identity: {get:(id:string)=>{gen:number,rgen:number,epoch:number}|null, touch?:(id:string)=>void,
 *   verify:(id:string,data:string,sig:string)=>boolean,
 *   verifyRecovery:(id:string,data:string,sig:string)=>boolean},
 *   challengeTtlMs?: number, sessionTtlMs?: number, recoverySessionTtlMs?: number,
 *   maxChallenges?: number, maxSessions?: number, pkChallengeTtlMs?: number, now?: () => number}} o
 */
function createAuth({
  identity,
  challengeTtlMs = 60000,
  sessionTtlMs = 12 * HOUR,
  recoverySessionTtlMs = 15 * 60000,
  maxChallenges = 20000,
  maxSessions = 100000,
  pkChallengeTtlMs = 120000,
  now = Date.now
}) {
  if (!identity || typeof identity.get !== 'function')
    throw new TypeError('createAuth: registro de identidades obrigatório');

  /** @type {Map<string, {id: string, action: string, exp: number}>} */
  const challenges = new Map();
  /** @type {Map<string, Session>} */
  const sessions = new Map();
  /** @type {Map<string, Set<string>>} id → hashes dos tokens (para revogar sem varrer tudo) */
  const byId = new Map();
  /** @type {Map<string, {purpose: string, id: string, owner: any, exp: number}>} desafios das passkeys */
  const pkChallenges = new Map();
  /** @type {WeakMap<object, Map<string, string>>} conexão → finalidade → desafio vivo (um por conexão e finalidade) */
  const pkByOwner = new WeakMap();

  /** @param {string} key hash do token */
  function dropSession(key) {
    const s = sessions.get(key);
    if (!s) return;
    sessions.delete(key);
    const set = byId.get(s.id);
    if (set) {
      set.delete(key);
      if (!set.size) byId.delete(s.id);
    }
  }

  function sweepChallenges() {
    const t = now();
    let n = 0;
    for (const [nonce, c] of challenges)
      if (c.exp <= t) {
        challenges.delete(nonce);
        n++;
      }
    for (const [nonce, c] of pkChallenges)
      if (c.exp <= t) {
        pkChallenges.delete(nonce);
        n++;
      }
    return n;
  }

  function sweepSessions() {
    const t = now();
    let n = 0;
    for (const [key, s] of sessions)
      if (s.exp <= t) {
        dropSession(key);
        n++;
      }
    return n;
  }

  /** Descarta desafios e sessões vencidos. */
  function sweep() {
    return { challenges: sweepChallenges(), sessions: sweepSessions() };
  }

  /**
   * Emite um nonce de uso único para a ação pedida. Id desconhecido recebe o mesmo formato
   * de desafio (a prova é que falha depois), para não revelar quem existe.
   * @param {{id: string, action: string}} o
   * @returns {{ok: boolean, reason?: string, nonce?: string, exp?: number, gen?: number, rgen?: number, epoch?: number}}
   */
  function challenge({ id, action }) {
    if (typeof id !== 'string' || !ID_RE.test(id) || typeof action !== 'string' || !ACTIONS[action])
      return { ok: false, reason: 'invalid' };
    if (maxChallenges > 0) {
      if (challenges.size >= maxChallenges) sweepChallenges();
      if (challenges.size >= maxChallenges) return { ok: false, reason: 'busy' };
    }
    const rec = identity.get(id);
    const nonce = crypto.randomBytes(32).toString('base64url');
    const exp = now() + challengeTtlMs;
    challenges.set(nonce, { id, action, exp });
    return { ok: true, nonce, exp, gen: rec ? rec.gen : 1, rgen: rec ? rec.rgen : 1, epoch: rec ? rec.epoch : 0 };
  }

  /**
   * Confere a assinatura do desafio e emite um token. O nonce é consumido mesmo quando a
   * assinatura está errada: cada desafio vale uma única tentativa.
   * @param {{id: string, nonce: string, sig: string, action: string}} o
   * @returns {{ok: boolean, reason?: string, token?: string, exp?: number, gen?: number, rgen?: number, epoch?: number, scope?: string}}
   */
  function verifyProof({ id, nonce, sig, action }) {
    if (typeof id !== 'string' || typeof nonce !== 'string' || typeof sig !== 'string' || typeof action !== 'string')
      return { ok: false, reason: 'invalid' };
    const c = challenges.get(nonce);
    if (!c) return { ok: false, reason: 'challenge' };
    challenges.delete(nonce);
    if (c.id !== id || c.action !== action) return { ok: false, reason: 'challenge' };
    if (c.exp <= now()) return { ok: false, reason: 'expired' };
    const rec = identity.get(id);
    const data = payload.auth(id, nonce, action);
    if (!rec) {
      verifySignature(GHOST_PK, data, sig);
      return { ok: false, reason: 'bad-signature' };
    }
    const rule = ACTIONS[action];
    /** @type {'primary'|'recovery'|''} */
    let scope = '';
    if (rule === 'primary') {
      if (identity.verify(id, data, sig)) scope = 'primary';
    } else if (rule === 'recovery') {
      if (identity.verifyRecovery(id, data, sig)) scope = 'recovery';
    } else if (identity.verify(id, data, sig)) {
      scope = 'primary';
    } else if (identity.verifyRecovery(id, data, sig)) {
      scope = 'recovery';
    }
    if (!scope) return { ok: false, reason: 'bad-signature' };
    if (scope === 'primary' && typeof identity.touch === 'function') identity.touch(id); // já usada: sai da fila de reciclagem
    return mint(id, rec, scope);
  }

  /**
   * Cria um token preso à geração e à época atuais. Só o servidor usa isto, depois de uma
   * operação já autenticada (rotação/revogação): o token antigo morreu com a mudança e o
   * cliente precisa continuar sem uma nova volta de desafio.
   * @param {string} id
   * @param {{gen: number, rgen: number, epoch: number}} rec
   * @param {'primary'|'recovery'} scope
   * @returns {{ok: boolean, token: string, exp: number, gen: number, rgen: number, epoch: number, scope: string}}
   */
  function mint(id, rec, scope) {
    if (maxSessions > 0 && sessions.size >= maxSessions) {
      sweepSessions();
      while (sessions.size >= maxSessions) {
        const oldest = sessions.keys().next().value;
        if (typeof oldest !== 'string') break;
        dropSession(oldest);
      }
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const key = tokenKey(token);
    const exp = now() + (scope === 'recovery' ? recoverySessionTtlMs : sessionTtlMs);
    const s = { id, gen: rec.gen, epoch: rec.epoch, scope, exp };
    sessions.set(key, s);
    let set = byId.get(id);
    if (!set) byId.set(id, (set = new Set()));
    set.add(key);
    return { ok: true, token, exp, gen: rec.gen, rgen: rec.rgen, epoch: rec.epoch, scope };
  }

  /**
   * Emite um token novo sem desafio. Uso interno do servidor, sempre depois de verificar a
   * operação de segurança que mudou a geração/época.
   * @param {{id: string, scope: 'primary'|'recovery'}} o
   * @returns {{ok: boolean, token: string, exp: number, gen: number, rgen: number, epoch: number, scope: string}|null}
   */
  function issue({ id, scope }) {
    if (scope !== 'primary' && scope !== 'recovery') return null;
    const rec = identity.get(id);
    if (!rec) return null;
    return mint(id, rec, scope);
  }

  /**
   * Valida um token. Devolve null se não existe, venceu, a identidade sumiu, a geração ou
   * a época mudaram (rotação/revogação) ou o escopo não permite a ação pedida.
   * @param {string} token
   * @param {string} [action]
   * @returns {{ok: boolean, id: string, gen: number, epoch: number, scope: string, exp: number}|null}
   */
  function verifyToken(token, action) {
    if (typeof token !== 'string' || !token || token.length > 200) return null;
    const key = tokenKey(token);
    const s = sessions.get(key);
    if (!s) return null;
    if (s.exp <= now()) {
      dropSession(key);
      return null;
    }
    const rec = identity.get(s.id);
    if (!rec) {
      dropSession(key);
      return null;
    }
    if (rec.gen !== s.gen || rec.epoch !== s.epoch) {
      dropSession(key);
      return null;
    }
    if (action !== undefined) {
      if (typeof action !== 'string' || !ACTIONS[action]) return null;
      if (s.scope === 'recovery') {
        if (!RECOVERY_ACTIONS.has(action)) return null;
      } else if (ACTIONS[action] === 'recovery') return null;
    }
    return { ok: true, id: s.id, gen: s.gen, epoch: s.epoch, scope: s.scope, exp: s.exp };
  }

  /**
   * Derruba na hora todos os tokens de uma identidade.
   * @param {string} id
   * @returns {number} quantos tokens foram descartados
   */
  function revokeSessions(id) {
    const set = byId.get(id);
    if (!set) return 0;
    const n = set.size;
    for (const key of [...set]) dropSession(key);
    return n;
  }

  /**
   * Desafio de passkey: `purpose` 'reg' (cadastrar, preso à identidade `id`) ou 'login' (entrar, sem identidade ainda). Fica
   * preso a `owner` (a conexão que pediu): outra conexão não consegue usar o mesmo desafio.
   * @param {{purpose: 'reg'|'login', id?: string, owner: any}} o
   * @returns {{ok: boolean, reason?: string, challenge?: string, exp?: number}}
   */
  function pkChallenge({ purpose, id = '', owner }) {
    if (purpose !== 'reg' && purpose !== 'login') return { ok: false, reason: 'invalid' };
    if (maxChallenges > 0) {
      if (pkChallenges.size >= maxChallenges) sweepChallenges();
      if (pkChallenges.size >= maxChallenges) return { ok: false, reason: 'busy' };
    }
    if (!owner || typeof owner !== 'object') return { ok: false, reason: 'invalid' };
    // um desafio vivo por conexão e finalidade: pedir outro descarta o anterior
    let mine = pkByOwner.get(owner);
    if (!mine) pkByOwner.set(owner, (mine = new Map()));
    const prev = mine.get(purpose);
    if (prev) pkChallenges.delete(prev);
    const challenge = crypto.randomBytes(32).toString('base64url');
    const exp = now() + pkChallengeTtlMs;
    pkChallenges.set(challenge, { purpose, id, owner, exp });
    mine.set(purpose, challenge);
    return { ok: true, challenge, exp };
  }

  /**
   * Consome um desafio de passkey (uso único: some mesmo quando a verificação falha depois).
   * @param {{challenge: string, purpose: string, owner: any, id?: string}} o
   * @returns {{ok: boolean, reason?: string}}
   */
  function takePkChallenge({ challenge, purpose, owner, id = '' }) {
    if (typeof challenge !== 'string') return { ok: false, reason: 'challenge' };
    const c = pkChallenges.get(challenge);
    if (!c) return { ok: false, reason: 'challenge' };
    pkChallenges.delete(challenge);
    const mine = pkByOwner.get(c.owner);
    if (mine && mine.get(c.purpose) === challenge) mine.delete(c.purpose);
    if (c.purpose !== purpose || c.owner !== owner || c.id !== id) return { ok: false, reason: 'challenge' };
    if (c.exp <= now()) return { ok: false, reason: 'expired' };
    return { ok: true };
  }

  function stats() {
    return { challenges: challenges.size + pkChallenges.size, sessions: sessions.size, ids: byId.size };
  }

  return { challenge, verifyProof, issue, verifyToken, revokeSessions, pkChallenge, takePkChallenge, sweep, stats };
}

module.exports = { createAuth, ACTIONS, RECOVERY_ACTIONS };
