'use strict';
// Banimento por IP: chave com sal (o IP nunca é guardado nem exposto), strikes progressivos e persistência com gravação adiada.
const crypto = require('crypto'), fs = require('fs');
const { createBanStore } = require('./limits');
const { readJsonFile, writeJsonAtomic } = require('./persist');

function createBanManager({ on, file, levels, resetMs, max, onStrike = () => {}, onError = () => {}, warn = () => {}, delayMs = 5000 }) {
  const bans = createBanStore({ levels, resetMs, max });
  let salt = '', timer = null, pending = false;
  const key = k => crypto.createHash('sha256').update(salt).update('|').update(k).digest('base64url');
  // ID público de um IP: prefixo do hash salgado. É o único identificador que o painel conhece.
  const hostId = ip => key(ip).slice(0, 12);
  const check = ip => on ? bans.check(key(ip)) : 0;

  function write() {
    if (!on || !file || !pending) return;
    pending = false;
    try { writeJsonAtomic(file, { v: 1, salt, savedAt: Date.now(), bans: bans.snapshot() }); } catch (e) { onError('bans', e); }
  }
  function save() {
    if (!on || !file) return;
    pending = true;
    if (timer) return;
    timer = setTimeout(() => { timer = null; write(); }, delayMs);
    if (timer.unref) timer.unref();
  }
  // Grava já o que estiver pendente (usado ao encerrar).
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending) write();
  }
  function strike(ip, why) {
    if (!on) return 0;
    const r = bans.strike(key(ip));
    onStrike(why, r.ms);
    save();
    return r.ms;
  }
  function load() {
    if (on && file) {
      let obj = null;
      try { obj = readJsonFile(file); }
      catch (e) {
        try { fs.renameSync(file, file + '.bak'); } catch (x) { /* já sumiu */ }
        warn('bans: arquivo inválido, começando limpo.');
      }
      if (obj && obj.v === 1) {
        if (typeof obj.salt === 'string' && obj.salt.length >= 16) salt = obj.salt;
        if (obj.bans) bans.restore(obj.bans);
      }
    }
    if (!salt) salt = crypto.randomBytes(24).toString('base64url');
  }
  load();
  return { bans, key, hostId, check, strike, save, flush };
}

module.exports = { createBanManager };
