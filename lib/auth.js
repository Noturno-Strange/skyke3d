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
 */
const crypto = require('crypto');
const { ID_RE } = require('./ids');
const { payload } = require('./identity');

const HOUR = 3600000;

/** Ação → quem pode assinar: só a principal, só a recuperação, ou as duas. */
const ACTIONS = {
  join: 'primary',
  rotate: 'primary',
  'rotate-recovery': 'primary',
  revoke: 'both',
  remove: 'primary',
  recover: 'recovery',
  'cancel-recovery': 'primary'
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
 * @param {{identity: {get:(id:string)=>{gen:number,epoch:number}|null,
 *   verify:(id:string,data:string,sig:string)=>boolean,
 *   verifyRecovery:(id:string,data:string,sig:string)=>boolean},
 *   challengeTtlMs?: number, sessionTtlMs?: number, recoverySessionTtlMs?: number,
 *   maxChallenges?: number, maxSessions?: number, now?: () => number}} o
 */
function createAuth({
  identity,
  challengeTtlMs = 60000,
  sessionTtlMs = 12 * HOUR,
  recoverySessionTtlMs = 15 * 60000,
  maxChallenges = 20000,
  maxSessions = 100000,
  now = Date.now
}) {
  if (!identity || typeof identity.get !== 'function')
    throw new TypeError('createAuth: registro de identidades obrigatório');

  /** @type {Map<string, {id: string, action: string, exp: number}>} */
  const challenges = new Map();
  /** @type {Map<string, Session>} */
  const sessions = new Map();
  /** @type {Map<string, Set<string>>} id → tokens (para revogar sem varrer tudo) */
  const byId = new Map();

  /** @param {string} token */
  function dropSession(token) {
    const s = sessions.get(token);
    if (!s) return;
    sessions.delete(token);
    const set = byId.get(s.id);
    if (set) {
      set.delete(token);
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
    return n;
  }

  function sweepSessions() {
    const t = now();
    let n = 0;
    for (const [token, s] of sessions)
      if (s.exp <= t) {
        dropSession(token);
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
   * @returns {{ok: boolean, reason?: string, nonce?: string, exp?: number, gen?: number, epoch?: number}}
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
    return { ok: true, nonce, exp, gen: rec ? rec.gen : 1, epoch: rec ? rec.epoch : 0 };
  }

  /**
   * Confere a assinatura do desafio e emite um token. O nonce é consumido mesmo quando a
   * assinatura está errada: cada desafio vale uma única tentativa.
   * @param {{id: string, nonce: string, sig: string, action: string}} o
   * @returns {{ok: boolean, reason?: string, token?: string, exp?: number, gen?: number, epoch?: number, scope?: string}}
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
    if (!rec) return { ok: false, reason: 'bad-signature' };
    const data = payload.auth(id, nonce, action);
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

    if (maxSessions > 0 && sessions.size >= maxSessions) {
      sweepSessions();
      while (sessions.size >= maxSessions) {
        const oldest = sessions.keys().next().value;
        if (typeof oldest !== 'string') break;
        dropSession(oldest);
      }
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const exp = now() + (scope === 'recovery' ? recoverySessionTtlMs : sessionTtlMs);
    const s = { id, gen: rec.gen, epoch: rec.epoch, scope, exp };
    sessions.set(token, s);
    let set = byId.get(id);
    if (!set) byId.set(id, (set = new Set()));
    set.add(token);
    return { ok: true, token, exp, gen: rec.gen, epoch: rec.epoch, scope };
  }

  /**
   * Valida um token. Devolve null se não existe, venceu, a identidade sumiu, a geração ou
   * a época mudaram (rotação/revogação) ou o escopo não permite a ação pedida.
   * @param {string} token
   * @param {string} [action]
   * @returns {{ok: boolean, id: string, gen: number, epoch: number, scope: string, exp: number}|null}
   */
  function verifyToken(token, action) {
    if (typeof token !== 'string') return null;
    const s = sessions.get(token);
    if (!s) return null;
    if (s.exp <= now()) {
      dropSession(token);
      return null;
    }
    const rec = identity.get(s.id);
    if (!rec) {
      dropSession(token);
      return null;
    }
    if (rec.gen !== s.gen || rec.epoch !== s.epoch) {
      dropSession(token);
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
    for (const token of [...set]) dropSession(token);
    return n;
  }

  function stats() {
    return { challenges: challenges.size, sessions: sessions.size, ids: byId.size };
  }

  return { challenge, verifyProof, verifyToken, revokeSessions, sweep, stats };
}

module.exports = { createAuth, ACTIONS, RECOVERY_ACTIONS };
