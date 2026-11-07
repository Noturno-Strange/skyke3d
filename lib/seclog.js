'use strict';
/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Registro de eventos de segurança da identidade: criação, uso, recuperação e revogação de credenciais.
 *
 * Nunca entra segredo: nada de chave privada, código de recuperação, token de sessão, desafio, assinatura ou IP.
 * Cada linha (JSON) leva a hora, o evento, se deu certo e o motivo, e dois códigos curtos:
 *   - `who`: HMAC do id de identidade com um segredo do servidor (liga os eventos da mesma conta sem expor o id);
 *   - `from`: HMAC do IP com o segredo e o dia (liga os eventos da mesma origem naquele dia, sem guardar o IP);
 *   - `cred`: HMAC do id da passkey, quando o evento é de uma passkey.
 * O arquivo gira ao passar de `maxBytes` (fica um `.1` com o anterior). Os últimos eventos ficam também na memória para o
 * painel /status. Falha ao gravar nunca derruba a operação: o registro é melhor esforço.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** Eventos conhecidos (o painel conta por tipo). */
const EVENTS = new Set([
  'identity.create',
  'identity.remove',
  'auth.fail',
  'key.rotate',
  'recovery-code.rotate',
  'recovery.request',
  'recovery.apply',
  'recovery.cancel',
  'sessions.revoke',
  'passkey.add',
  'passkey.remove',
  'passkey.login',
  'passkey.fail',
  'passkey.clone'
]);

/**
 * @param {{file?: string, maxBytes?: number, secret?: string|Buffer, keep?: number, now?: () => number,
 *   onError?: (what: string, e: any) => void}} [o]
 */
function createSecLog({
  file = '',
  maxBytes = 2 * 1024 * 1024,
  secret,
  keep = 200,
  now = Date.now,
  onError = () => {}
} = {}) {
  const key = secret ? Buffer.from(secret) : loadSecret(file, onError);
  /** @type {any[]} */
  const recent = [];
  /** @type {Map<string, number>} */
  const counts = new Map();
  let bytes = 0;
  if (file) {
    try {
      bytes = fs.statSync(file).size;
    } catch (e) {
      bytes = 0;
    }
  }

  /** @param {string} kind @param {string} v @param {number} [len] */
  const mac = (kind, v, len = 16) =>
    crypto
      .createHmac('sha256', key)
      .update(kind + '|' + v)
      .digest('base64url')
      .slice(0, len);

  /**
   * @param {string} ev
   * @param {{id?: string, ip?: string, ok?: boolean, reason?: string, cred?: string, n?: number}} [o]
   */
  function log(ev, { id, ip, ok = true, reason, cred, n } = {}) {
    if (!EVENTS.has(ev)) return;
    const t = now();
    const day = new Date(t).toISOString().slice(0, 10);
    /** @type {Record<string, any>} */
    const e = { at: new Date(t).toISOString(), ev, ok: !!ok };
    if (id) e.who = mac('id', id);
    if (ip) e.from = mac('ip', day + '|' + ip, 12);
    if (cred) e.cred = mac('cred', cred, 12);
    if (reason && /^[a-z-]{1,24}$/.test(reason)) e.reason = reason;
    if (Number.isInteger(n) && /** @type {number} */ (n) >= 0) e.n = n;
    recent.push(e);
    if (recent.length > keep) recent.splice(0, recent.length - keep);
    const k = ev + (e.ok ? '' : ':fail');
    counts.set(k, (counts.get(k) || 0) + 1);
    if (!file) return;
    const line = JSON.stringify(e) + '\n';
    try {
      if (bytes + line.length > maxBytes) {
        try {
          fs.renameSync(file, file + '.1');
        } catch (x) {
          /* primeiro arquivo */
        }
        bytes = 0;
      }
      fs.appendFileSync(file, line, { mode: 0o600 });
      bytes += Buffer.byteLength(line);
    } catch (x) {
      onError('seclog', x);
    }
  }

  /** O código curto de uma conta, para o painel achar os eventos dela sem expor o id. */
  function whoOf(id) {
    return mac('id', id);
  }

  function stats() {
    return { counts: Object.fromEntries(counts), recent: recent.slice(-50).reverse(), bytes, file: !!file };
  }

  return { log, whoOf, stats };
}

/**
 * O segredo dos HMACs fica num arquivo ao lado do registro (permissão 600), para os códigos continuarem iguais depois de
 * reiniciar. Sem arquivo (só memória), um segredo novo a cada início.
 * @param {string} file
 * @param {(what: string, e: any) => void} onError
 */
function loadSecret(file, onError) {
  if (!file) return crypto.randomBytes(32);
  const kf = path.join(path.dirname(file), 'security.key');
  try {
    const s = fs.readFileSync(kf);
    if (s.length >= 32) return s;
  } catch (e) {
    /* ainda não existe */
  }
  const s = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(kf), { recursive: true });
    fs.writeFileSync(kf, s, { mode: 0o600, flag: 'wx' });
    return s;
  } catch (e) {
    // outro processo criou ao mesmo tempo: usa o dele
    try {
      const again = fs.readFileSync(kf);
      if (again.length >= 32) return again;
    } catch (x) {
      onError('seclog', x);
    }
    return s;
  }
}

module.exports = { createSecLog, EVENTS };
