/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Protocolo de identidade no WebSocket: desafio-resposta, registro, rotação, recuperação e
 * revogação. A lógica das chaves está em identity.js e auth.js; aqui ficam as mensagens, os
 * limites por IP e o encerramento de conexões. Tudo o que vem do servidor entra por `deps`.
 */
'use strict';

const { powOk, bitsFor } = require('./idpow');
const WA = require('./webauthn');

// Força bruta contra uma conta: depois de PK_FAIL_MAX falhas de passkey em PK_FAIL_MS para a mesma identidade, ela fica
// bloqueada para entrada por passkey até a janela passar (o código de recuperação e a chave do aparelho continuam valendo).
const PK_FAIL_MAX = 10,
  PK_FAIL_MS = 10 * 60000;

/**
 * @param {{AUTH: any, IDENTITY: any, send: Function, safeClose: Function, wss: {clients: Iterable<any>},
 *   over: Function, hitCount: Function, banStrike: Function, fidOf: Function, newId: Function,
 *   namesOn: boolean, legacyIdentity: boolean, graceMs: number,
 *   reg?: {powBase: number, powMax: number, recent: () => number, note: () => void, dayOver: (ip: string) => boolean},
 *   seclog?: {log: (ev: string, o?: any) => void}, passkeys?: boolean, countHits?: Function}} deps
 * `reg`: custo do registro (prova de trabalho que sobe com o ritmo do servidor e teto diário por origem)
 * `seclog`: registro de eventos de segurança (lib/seclog.js); `passkeys: false` desliga as passkeys
 */
function createIdentityWs(deps) {
  const { AUTH, IDENTITY, send, safeClose, wss, over, hitCount, banStrike, fidOf, newId } = deps;
  const SEC = deps.seclog || { log: () => {} };
  /** quantas vezes a chave foi contada na janela, sem contar de novo */
  const COUNT = deps.countHits || (() => 0);
  const PASSKEYS = deps.passkeys !== false;
  const REG = deps.reg || { powBase: 0, powMax: 0, recent: () => 0, note: () => {}, dayOver: () => false };
  const NAMES_ON = deps.namesOn,
    LEGACY_IDENTITY = deps.legacyIdentity,
    IDENTITY_GRACE_MS = deps.graceMs;
  /**
   * Mensagens de identidade (lib/identity.js + lib/auth.js). A chave privada nunca chega aqui:
   * o cliente assina um nonce e o servidor confere com a chave pública registrada.
   */
  const ID_MSG = {
    invalid: 'Dados de identidade inválidos.',
    notfound: 'Identidade não encontrada.',
    exists: 'Esta identidade já foi registrada. Use a chave de recuperação.',
    stale: 'A identidade mudou. Atualize a página e tente de novo.',
    'bad-signature': 'Assinatura inválida.',
    pending: 'Já existe uma recuperação em andamento.',
    full: 'Limite de identidades do servidor atingido.',
    corrupt: 'O registro de identidades está indisponível. Tente mais tarde.',
    io: 'Não foi possível salvar a identidade. Tente de novo.',
    challenge: 'Desafio inválido ou expirado. Peça outro.',
    expired: 'Desafio expirado. Peça outro.',
    busy: 'Muitas tentativas. Aguarde um instante.',
    session: 'Sessão expirada. Entre novamente.',
    scope: 'Esta sessão não permite essa ação.',
    rate: 'Muitas tentativas. Aguarde um minuto.',
    limit: 'Muitas contas novas deste local hoje. Tente de novo amanhã.',
    pow: 'O servidor está recebendo muitos registros agora. Tente de novo em instantes.',
    required: 'Entre com sua identidade para jogar.',
    registered: 'Esta identidade já foi registrada. Atualize a página e entre com sua chave.',
    'pk-off': 'As passkeys estão desligadas neste servidor.',
    'pk-origin': 'Passkeys só funcionam pelo endereço do jogo com https (ou em localhost).',
    'pk-full': 'Você já tem 10 passkeys. Remova uma para cadastrar outra.',
    'pk-exists': 'Esta passkey já está cadastrada na sua conta.',
    'pk-missing': 'Passkey não encontrada.',
    'pk-fail': 'Passkey não reconhecida. Use uma passkey cadastrada nesta conta.',
    'pk-locked': 'Muitas tentativas com passkey nesta conta. Aguarde alguns minutos ou use o código de recuperação.'
  };
  const idErr = (ws, scope, code, msg = ID_MSG[code] || ID_MSG.invalid, extra) =>
    send(ws, { t: 'err', scope, code, msg, ...(extra || {}) });

  /** guarda na conexão e no jogador a geração/época da identidade autenticada */
  function setIdent(c, id, gen, epoch, scope) {
    c.identId = id;
    c.identGen = gen;
    c.identEpoch = epoch;
    c.identScope = scope;
    if (c.ws) {
      c.ws.identId = id;
      c.ws.identGen = gen;
      c.ws.identEpoch = epoch;
      c.ws.identScope = scope;
    }
    if (c.me) c.me.ident = { id, gen, epoch };
  }

  /**
   * encerra as outras conexões da mesma identidade (a do pedido fica); com `scope`, só as daquele escopo (quando uma recuperação
   * vence a carência caem as sessões da chave principal antiga, e não o aparelho novo que está concluindo a recuperação)
   * @param {string} id
   * @param {any} except
   * @param {string} [scope]
   */
  function closeIdentityConns(id, except, scope) {
    if (!id) return;
    for (const w of wss.clients) {
      if (w === except || w.identId !== id) continue;
      if (scope && w.identScope !== scope) continue;
      try {
        send(w, { t: 'err', scope: 'identity', code: 'revoked', msg: 'Sessão encerrada por segurança.' });
      } catch (e) {
        /* a conexão pode já ter caído */
      }
      safeClose(w, 4001, 'identity revoked');
    }
  }

  /**
   * Resolve a identidade de quem está entrando: token de sessão (preferido) ou a chave antiga
   * do aparelho, aceita só enquanto a identidade ainda não foi registrada. Sem registro de
   * nomes, uma conexão sem chave ganha um id efêmero para não quebrar os testes e o modo local.
   * @param {any} c
   * @param {any} m
   * @returns {{id: string, fk: string, gen: number, epoch: number, scope: string}|null}
   */
  function identityOf(c, m) {
    const { ws } = c;
    if (m.token) {
      const v = AUTH.verifyToken(m.token, 'join');
      if (!v) {
        idErr(ws, 'auth', 'session');
        return null;
      }
      return { id: v.id, fk: m.k || '', gen: v.gen, epoch: v.epoch, scope: v.scope };
    }
    if (!LEGACY_IDENTITY) {
      idErr(ws, 'auth', 'required');
      return null;
    }
    if (!m.k) {
      if (NAMES_ON) {
        idErr(ws, 'auth', 'required', 'Atualize a página para entrar: falta a chave deste aparelho.');
        return null;
      }
      if (!c.ephId) c.ephId = newId();
      return { id: c.ephId, fk: '', gen: 0, epoch: 0, scope: '' };
    }
    const id = fidOf(m.k);
    if (IDENTITY.has(id)) {
      idErr(ws, 'auth', 'registered');
      return null;
    }
    return { id, fk: m.k, gen: 0, epoch: 0, scope: '' };
  }

  function authChallenge(c, m) {
    const { ws, ip } = c;
    if (over(ip, 'idauth', 60, 60000)) {
      idErr(ws, 'auth', 'rate');
      return true;
    }
    const r = AUTH.challenge({ id: m.id, action: m.action });
    if (!r.ok) {
      idErr(ws, 'auth', r.reason || 'invalid');
      return true;
    }
    // Sem gen/rgen/epoch: com eles, um id já rotacionado respondia diferente de um id inexistente (revelava quem existe).
    // Esses números só vão depois de uma prova válida, na mensagem `session`.
    send(ws, { t: 'challenge', id: m.id, action: m.action, nonce: r.nonce, exp: r.exp });
    return true;
  }

  function authProof(c, m) {
    const { ws, ip } = c;
    if (over(ip, 'idproof', 60, 60000)) {
      idErr(ws, 'proof', 'rate');
      return true;
    }
    const r = AUTH.verifyProof({ id: m.id, nonce: m.nonce, sig: m.sig, action: m.action });
    if (!r.ok) {
      const fails = hitCount(ip, 'idfail', 20, 600000);
      if (fails.count === 21) banStrike(ip, 'identidade');
      // só falhas de assinatura: desafio vencido é rotina (aba esquecida aberta), não tentativa de entrar
      if (r.reason === 'bad-signature') SEC.log('auth.fail', { id: m.id, ip, ok: false, reason: m.action });
      idErr(ws, 'proof', r.reason || 'invalid');
      return true;
    }
    setIdent(c, m.id, r.gen, r.epoch, r.scope);
    // Há um pedido de recuperação em carência? Quem entra com a chave principal precisa saber, para cancelar a tempo.
    const cur = IDENTITY.get(m.id);
    send(ws, {
      t: 'session',
      id: m.id,
      token: r.token,
      exp: r.exp,
      gen: r.gen,
      rgen: r.rgen,
      epoch: r.epoch,
      scope: r.scope,
      ...(cur && cur.pending ? { pending: { until: cur.pending.until } } : {})
    });
    return true;
  }

  function idRegister(c, m) {
    const { ws, ip } = c;
    if (over(ip, 'idreg', 20, 60000)) {
      idErr(ws, 'idreg', 'rate');
      return true;
    }
    const id = fidOf(m.k),
      cur = IDENTITY.get(id);
    if (cur) {
      if (cur.pk === m.pk && cur.rpk === m.rpk) {
        send(ws, { t: 'idok', op: 'register', id, gen: cur.gen, rgen: cur.rgen, epoch: cur.epoch, existed: true });
      } else {
        idErr(ws, 'idreg', 'exists');
      }
      return true;
    }
    // Registrar custa: prova de trabalho (sobe com o ritmo de registros do servidor inteiro) e teto diário por origem.
    // Quem já tem a identidade (acima) não paga nada: só o registro novo.
    const bits = bitsFor(REG.powBase, REG.powMax, REG.recent());
    if (bits > 0 && !powOk(m.k, m.pk, m.rpk, m.pow, bits)) {
      idErr(ws, 'idreg', 'pow', undefined, { bits });
      return true;
    }
    if (REG.dayOver(ip)) {
      idErr(ws, 'idreg', 'limit');
      return true;
    }
    const r = IDENTITY.register({ id, pk: m.pk, rpk: m.rpk, legacy: true });
    if (!r.ok) {
      idErr(ws, 'idreg', r.reason || 'invalid');
      return true;
    }
    REG.note();
    SEC.log('identity.create', { id, ip });
    send(ws, { t: 'idok', op: 'register', id, gen: r.gen, rgen: r.rgen, epoch: r.epoch });
    return true;
  }

  function idRotate(c, m) {
    const { ws } = c;
    const action = m.pk ? 'rotate' : 'rotate-recovery';
    const v = AUTH.verifyToken(m.token, action);
    if (!v) {
      idErr(ws, 'idrot', 'session');
      return true;
    }
    if (v.scope !== 'primary') {
      idErr(ws, 'idrot', 'scope');
      return true;
    }
    const r = m.pk
      ? IDENTITY.rotatePrimary({ id: v.id, expectedGen: m.gen, newPk: m.pk, sigOld: m.sigOld, sigRec: m.sigRec })
      : IDENTITY.rotateRecovery({
          id: v.id,
          expectedRgen: m.rgen,
          newRpk: m.rpk,
          sigRec: m.sigRec,
          sigOld: m.sigOld
        });
    if (!r.ok) {
      if (r.reason === 'bad-signature')
        SEC.log(m.pk ? 'key.rotate' : 'recovery-code.rotate', { id: v.id, ip: c.ip, ok: false, reason: r.reason });
      idErr(ws, 'idrot', r.reason || 'invalid');
      return true;
    }
    if (!r.idempotent) SEC.log(m.pk ? 'key.rotate' : 'recovery-code.rotate', { id: v.id, ip: c.ip });
    // A rotação muda geração e época: todos os tokens antigos morrem, inclusive o do pedido.
    AUTH.revokeSessions(v.id);
    const rec = IDENTITY.get(v.id);
    if (!rec) {
      idErr(ws, 'idrot', 'notfound');
      return true;
    }
    const fresh = AUTH.issue({ id: v.id, scope: 'primary' });
    setIdent(c, v.id, rec.gen, rec.epoch, 'primary');
    closeIdentityConns(v.id, ws);
    send(ws, {
      t: 'idok',
      op: action,
      id: v.id,
      gen: rec.gen,
      rgen: rec.rgen,
      epoch: rec.epoch,
      ...(fresh ? { token: fresh.token, exp: fresh.exp } : {})
    });
    return true;
  }

  function idRecover(c, m) {
    const { ws } = c;
    const v = AUTH.verifyToken(m.token, 'recover');
    if (!v) {
      idErr(ws, 'idrec', 'session');
      return true;
    }
    if (v.scope !== 'recovery') {
      idErr(ws, 'idrec', 'scope');
      return true;
    }
    // A carência é o que dá ao dono tempo de cancelar um pedido feito com uma chave de recuperação vazada. Quem decide o
    // mínimo é o servidor (IDENTITY_GRACE_HOURS): o cliente pode pedir MAIS tempo, nunca menos. Antes o servidor aceitava
    // o `grace` do cliente (inclusive 0) e a troca saía na hora, só com a chave de recuperação.
    const graceMs = Math.max(IDENTITY_GRACE_MS, m.grace === undefined ? 0 : m.grace);
    const wasPending = !!(IDENTITY.get(v.id) || {}).pending;
    // O pedido traz a chave de recuperação NOVA (m.rpk): quando a troca valer, o código usado aqui deixa de valer (uso único).
    const r = IDENTITY.recoverPrimary({
      id: v.id,
      expectedGen: m.gen,
      newPk: m.pk,
      newRpk: m.rpk,
      sigRec: m.sigRec,
      graceMs
    });
    if (!r.ok) {
      if (r.reason === 'bad-signature' || r.reason === 'notfound')
        SEC.log('recovery.request', { id: v.id, ip: c.ip, ok: false, reason: 'bad-signature' });
      // não revelar se o id existe para quem só tem uma chave de recuperação qualquer
      idErr(
        ws,
        'idrec',
        r.reason === 'notfound' ? 'bad-signature' : r.reason || 'invalid',
        undefined,
        r.reason === 'pending' ? { until: r.until } : undefined
      );
      return true;
    }
    const rec = IDENTITY.get(v.id);
    if (!rec) {
      idErr(ws, 'idrec', 'notfound');
      return true;
    }
    if (r.pending) {
      if (!wasPending) SEC.log('recovery.request', { id: v.id, ip: c.ip, n: Math.round(graceMs / 3600000) });
      send(ws, {
        t: 'idok',
        op: 'recover',
        id: v.id,
        gen: r.gen,
        rgen: rec.rgen,
        epoch: r.epoch,
        pending: true,
        until: r.until
      });
      return true;
    }
    if (!r.idempotent) SEC.log('recovery.apply', { id: v.id, ip: c.ip });
    AUTH.revokeSessions(v.id);
    const fresh = AUTH.issue({ id: v.id, scope: 'recovery' });
    setIdent(c, v.id, rec.gen, rec.epoch, 'recovery');
    closeIdentityConns(v.id, ws);
    send(ws, {
      t: 'idok',
      op: 'recover',
      id: v.id,
      gen: rec.gen,
      rgen: rec.rgen,
      epoch: rec.epoch,
      ...(fresh ? { token: fresh.token, exp: fresh.exp } : {})
    });
    return true;
  }

  function idCancel(c, m) {
    const { ws } = c;
    const v = AUTH.verifyToken(m.token, 'cancel-recovery');
    if (!v) {
      idErr(ws, 'idcancel', 'session');
      return true;
    }
    if (v.scope !== 'primary') {
      idErr(ws, 'idcancel', 'scope');
      return true;
    }
    const had = !!(IDENTITY.get(v.id) || {}).pending;
    const r = IDENTITY.cancelRecovery({ id: v.id, expectedGen: m.gen, sigOld: m.sigOld });
    if (!r.ok) {
      idErr(ws, 'idcancel', r.reason || 'invalid');
      return true;
    }
    if (had) SEC.log('recovery.cancel', { id: v.id, ip: c.ip });
    const rec = IDENTITY.get(v.id);
    send(ws, { t: 'idok', op: 'cancel-recovery', id: v.id, gen: r.gen, rgen: rec ? rec.rgen : 0, epoch: v.epoch });
    return true;
  }

  function idRevoke(c, m) {
    const { ws } = c;
    const v = AUTH.verifyToken(m.token, 'revoke');
    if (!v) {
      idErr(ws, 'idrev', 'session');
      return true;
    }
    if (v.scope === 'primary') {
      if (!m.sigOld) {
        idErr(ws, 'idrev', 'invalid');
        return true;
      }
      const r = IDENTITY.revokeSessions({ id: v.id, expectedEpoch: m.epoch, sigOld: m.sigOld });
      if (!r.ok) {
        idErr(ws, 'idrev', r.reason || 'invalid');
        return true;
      }
      if (!r.idempotent) SEC.log('sessions.revoke', { id: v.id, ip: c.ip, reason: 'primary' });
      AUTH.revokeSessions(v.id);
      const rec = IDENTITY.get(v.id);
      if (!rec) {
        idErr(ws, 'idrev', 'notfound');
        return true;
      }
      const fresh = AUTH.issue({ id: v.id, scope: 'primary' });
      setIdent(c, v.id, rec.gen, rec.epoch, 'primary');
      closeIdentityConns(v.id, ws);
      send(ws, {
        t: 'idok',
        op: 'revoke',
        id: v.id,
        gen: rec.gen,
        rgen: rec.rgen,
        epoch: rec.epoch,
        ...(fresh ? { token: fresh.token, exp: fresh.exp } : {})
      });
      return true;
    }
    // Escopo de recuperação: derruba as sessões vivas sem mudar a época. A revogação
    // definitiva da chave antiga é a troca da principal (idrec), que incrementa a época.
    SEC.log('sessions.revoke', { id: v.id, ip: c.ip, reason: 'recovery' });
    AUTH.revokeSessions(v.id);
    const rec = IDENTITY.get(v.id);
    if (!rec) {
      idErr(ws, 'idrev', 'notfound');
      return true;
    }
    const fresh = AUTH.issue({ id: v.id, scope: 'recovery' });
    setIdent(c, v.id, rec.gen, rec.epoch, 'recovery');
    closeIdentityConns(v.id, ws);
    send(ws, {
      t: 'idok',
      op: 'revoke',
      id: v.id,
      gen: rec.gen,
      rgen: rec.rgen,
      epoch: rec.epoch,
      scope: 'recovery',
      ...(fresh ? { token: fresh.token, exp: fresh.exp } : {})
    });
    return true;
  }

  // ---------- passkeys (lib/webauthn.js) ----------

  /** origem da página (validada no handshake) e o rpId das passkeys; '' quando o endereço não serve para passkey */
  function rpOf(c) {
    const origin = (c.ws && c.ws.pageOrigin) || '';
    return { origin, rpId: origin ? WA.rpIdOf(origin) : '' };
  }

  /** sessão da chave principal para gerenciar passkeys; responde o erro e devolve null se não for */
  function pkSession(c, m, scope) {
    const v = AUTH.verifyToken(m.token, 'passkey');
    if (!v) {
      idErr(c.ws, scope, 'session');
      return null;
    }
    if (v.scope !== 'primary') {
      idErr(c.ws, scope, 'scope');
      return null;
    }
    return v;
  }

  /** desafio para cadastrar (com a sessão da chave principal) ou para entrar (sem identidade ainda) */
  function pkOptions(c, m) {
    const { ws, ip } = c;
    if (!PASSKEYS) return idErr(ws, 'pkopt', 'pk-off'), true;
    if (over(ip, 'pkopt', 30, 60000)) return idErr(ws, 'pkopt', 'rate'), true;
    const { rpId } = rpOf(c);
    if (!rpId) return idErr(ws, 'pkopt', 'pk-origin'), true;
    if (m.purpose === 'reg') {
      const v = pkSession(c, m, 'pkopt');
      if (!v) return true;
      const ch = AUTH.pkChallenge({ purpose: 'reg', id: v.id, owner: ws });
      if (!ch.ok) return idErr(ws, 'pkopt', ch.reason || 'busy'), true;
      send(ws, {
        t: 'pkopt',
        purpose: 'reg',
        challenge: ch.challenge,
        exp: ch.exp,
        rpId,
        user: WA.userHandle(v.id),
        exclude: IDENTITY.passkeys(v.id).map(p => p.cid)
      });
      return true;
    }
    const ch = AUTH.pkChallenge({ purpose: 'login', owner: ws });
    if (!ch.ok) return idErr(ws, 'pkopt', ch.reason || 'busy'), true;
    send(ws, { t: 'pkopt', purpose: 'login', challenge: ch.challenge, exp: ch.exp, rpId });
    return true;
  }

  function pkRegister(c, m) {
    const { ws, ip } = c;
    if (!PASSKEYS) return idErr(ws, 'pkreg', 'pk-off'), true;
    const v = pkSession(c, m, 'pkreg');
    if (!v) return true;
    const { origin, rpId } = rpOf(c);
    if (!rpId) return idErr(ws, 'pkreg', 'pk-origin'), true;
    const ch = AUTH.takePkChallenge({ challenge: m.challenge, purpose: 'reg', owner: ws, id: v.id });
    if (!ch.ok) return idErr(ws, 'pkreg', ch.reason || 'challenge'), true;
    const r = WA.verifyRegistration({
      origin,
      rpId,
      challenge: m.challenge,
      cd: m.cd,
      ad: m.ad,
      spki: m.spki,
      alg: m.alg,
      cid: m.cid
    });
    if (!r.ok) {
      SEC.log('passkey.add', { id: v.id, ip, ok: false, reason: r.reason });
      return idErr(ws, 'pkreg', 'pk-fail', 'O navegador não entregou uma passkey válida. Tente de novo.'), true;
    }
    const a = IDENTITY.addPasskey({ id: v.id, cred: r.cred, name: m.name || '' });
    if (!a.ok) return idErr(ws, 'pkreg', a.reason || 'invalid'), true;
    SEC.log('passkey.add', { id: v.id, ip, cred: r.cred.cid, n: a.n });
    send(ws, { t: 'idok', op: 'pkreg', id: v.id, list: IDENTITY.passkeys(v.id) });
    return true;
  }

  function pkList(c, m) {
    const v = pkSession(c, m, 'pklist');
    if (!v) return true;
    send(c.ws, { t: 'idok', op: 'pklist', id: v.id, list: IDENTITY.passkeys(v.id), on: PASSKEYS && !!rpOf(c).rpId });
    return true;
  }

  function pkDelete(c, m) {
    const v = pkSession(c, m, 'pkdel');
    if (!v) return true;
    const cids = m.all ? IDENTITY.passkeys(v.id).map(p => p.cid) : [m.cid];
    for (const cid of cids) {
      const r = IDENTITY.removePasskey({ id: v.id, cid });
      if (!r.ok) return idErr(c.ws, 'pkdel', r.reason || 'invalid'), true;
      SEC.log('passkey.remove', { id: v.id, ip: c.ip, cred: cid, n: r.n });
    }
    send(c.ws, { t: 'idok', op: 'pkdel', id: v.id, list: IDENTITY.passkeys(v.id) });
    return true;
  }

  /**
   * Entrada por passkey. Respostas de falha são todas iguais ('pk-fail'): quem tenta não descobre se a passkey existe, de quem
   * é ou o que deu errado. Dá certo: o aparelho que entrou vira o principal (chave nova `m.pk`, gerada aqui e nunca exportada),
   * a chave antiga e todas as sessões morrem, e um pedido de recuperação em carência é cancelado.
   */
  function pkLogin(c, m) {
    const { ws, ip } = c;
    if (!PASSKEYS) return idErr(ws, 'pklogin', 'pk-off'), true;
    if (over(ip, 'pklogin', 10, 60000)) return idErr(ws, 'pklogin', 'rate'), true;
    const { origin, rpId } = rpOf(c);
    if (!rpId) return idErr(ws, 'pklogin', 'pk-origin'), true;
    const fail = (id, reason) => {
      const fails = hitCount(ip, 'idfail', 20, 600000);
      if (fails.count === 21) banStrike(ip, 'passkey');
      if (id) hitCount('@pk', id, PK_FAIL_MAX, PK_FAIL_MS);
      SEC.log(reason === 'clone' ? 'passkey.clone' : 'passkey.fail', {
        id,
        ip,
        ok: false,
        reason,
        ...(id ? { cred: m.cid } : {})
      });
      idErr(ws, 'pklogin', 'pk-fail');
      return true;
    };
    const ch = AUTH.takePkChallenge({ challenge: m.challenge, purpose: 'login', owner: ws });
    if (!ch.ok) return idErr(ws, 'pklogin', ch.reason || 'challenge'), true;
    const hit = IDENTITY.passkeyByCid(m.cid);
    if (!hit) return fail('', 'unknown');
    if (COUNT('@pk', hit.id, PK_FAIL_MS) >= PK_FAIL_MAX) {
      SEC.log('passkey.fail', { id: hit.id, ip, ok: false, reason: 'locked' });
      return idErr(ws, 'pklogin', 'pk-locked'), true;
    }
    const r = WA.verifyAssertion({
      origin,
      rpId,
      challenge: m.challenge,
      cd: m.cd,
      ad: m.ad,
      sig: m.sig,
      cred: hit.cred
    });
    if (!r.ok) return fail(hit.id, r.reason);
    // Renova tudo: sessões antigas morrem antes de a chave mudar, e a troca muda geração e época (tokens antigos não valem mais).
    AUTH.revokeSessions(hit.id);
    const a = IDENTITY.attachDevice({ id: hit.id, cid: m.cid, sc: r.sc, newPk: m.pk });
    if (!a.ok) return idErr(ws, 'pklogin', a.reason || 'invalid'), true;
    SEC.log('passkey.login', { id: hit.id, ip, cred: m.cid });
    if (a.cancelled) SEC.log('recovery.cancel', { id: hit.id, ip, reason: 'passkey' });
    const rec = IDENTITY.get(hit.id);
    const fresh = AUTH.issue({ id: hit.id, scope: 'primary' });
    if (!rec || !fresh) return idErr(ws, 'pklogin', 'io'), true;
    setIdent(c, hit.id, rec.gen, rec.epoch, 'primary');
    closeIdentityConns(hit.id, ws);
    send(ws, {
      t: 'idok',
      op: 'pklogin',
      id: hit.id,
      gen: rec.gen,
      rgen: rec.rgen,
      epoch: rec.epoch,
      rpk: rec.rpk,
      token: fresh.token,
      exp: fresh.exp,
      ...(a.cancelled ? { cancelled: true } : {})
    });
    return true;
  }

  /** despacha as mensagens de identidade; devolve true quando consumiu */
  function identityMsg(c, m) {
    switch (m.t) {
      case 'auth':
        return authChallenge(c, m);
      case 'proof':
        return authProof(c, m);
      case 'idreg':
        return idRegister(c, m);
      case 'idrot':
        return idRotate(c, m);
      case 'idrec':
        return idRecover(c, m);
      case 'idcancel':
        return idCancel(c, m);
      case 'idrev':
        return idRevoke(c, m);
      case 'pkopt':
        return pkOptions(c, m);
      case 'pkreg':
        return pkRegister(c, m);
      case 'pklist':
        return pkList(c, m);
      case 'pkdel':
        return pkDelete(c, m);
      case 'pklogin':
        return pkLogin(c, m);
      default:
        return false;
    }
  }

  return { identityOf, setIdent, identityMsg, closeIdentityConns };
}

module.exports = { createIdentityWs };
