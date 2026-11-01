'use strict';
// Registro persistente de nomes: cada nome pertence à chave do aparelho (skyke_fk), a mesma que o código de
// recuperação carrega. O dono continua dono mesmo offline e depois de reiniciar o servidor; a posse nunca depende do
// IP. Fica gravado só o nome normalizado e um hash com salt da chave, nunca a chave em texto.
const crypto = require('crypto'),
  fs = require('fs');
const { readJsonFile, writeJsonAtomic } = require('./persist');

/**
 * @typedef {Object} NameEntry
 * @property {string} o dono (hash com salt da chave do aparelho)
 * @property {number} at último uso (ms)
 */

/**
 * @param {{file?:string, max?:number, perKey?:number, onError?:(what:string, e:any)=>void, warn?:(msg:string)=>void, delayMs?:number, now?:()=>number}} o
 */
function createNameRegistry({
  file,
  max = 100000,
  perKey = 5,
  onError = () => {},
  warn = () => {},
  delayMs = 2000,
  now = Date.now
}) {
  const enabled = !!file;
  /** @type {Map<string, NameEntry>} */
  const names = new Map();
  /** @type {Map<string, Set<string>>} dono → nomes reservados */
  const byOwner = new Map();
  let salt = '',
    dirty = false,
    timer = null,
    savedAt = 0;

  /** dono do nome: hash com salt da chave do aparelho (nunca a chave em texto) */
  const owner = key => crypto.createHmac('sha256', salt).update('k|').update(String(key)).digest('base64url');

  /** @param {string} name @param {NameEntry} e */
  function bind(name, e) {
    names.set(name, e);
    let set = byOwner.get(e.o);
    if (!set) byOwner.set(e.o, (set = new Set()));
    set.add(name);
  }
  /** @param {string} name */
  function unbind(name) {
    const e = names.get(name);
    if (!e) return;
    names.delete(name);
    const set = byOwner.get(e.o);
    if (set) {
      set.delete(name);
      if (!set.size) byOwner.delete(e.o);
    }
  }
  /** tira os nomes mais antigos de um dono até caber no teto por chave */
  function trimOwner(oid) {
    if (!perKey || perKey < 1) return;
    const set = byOwner.get(oid);
    if (!set) return;
    while (set.size > perKey) {
      let old = '',
        at = Infinity;
      for (const name of set) {
        const e = names.get(name);
        if (e && e.at < at) {
          at = e.at;
          old = name;
        }
      }
      if (!old) break;
      unbind(old);
    }
  }
  function trimGlobal() {
    while (max > 0 && names.size > max) {
      let old = '',
        at = Infinity;
      for (const [name, e] of names)
        if (e.at < at) {
          at = e.at;
          old = name;
        }
      if (!old) break;
      unbind(old);
    }
  }
  function load() {
    if (enabled) {
      let obj = null;
      try {
        obj = readJsonFile(file);
      } catch (e) {
        try {
          fs.renameSync(file, file + '.bak');
        } catch (x) {
          /* o arquivo já não existe */
        }
        warn('nomes: arquivo inválido, começando limpo.');
      }
      if (obj && obj.v === 1) {
        if (typeof obj.salt === 'string' && obj.salt.length >= 16) salt = obj.salt;
        const src = obj.names && typeof obj.names === 'object' && !Array.isArray(obj.names) ? obj.names : {};
        for (const [name, e] of Object.entries(src)) {
          if (typeof name !== 'string' || !name || name.length > 64) continue;
          if (max > 0 && names.size >= max) break;
          if (!e || typeof e !== 'object' || typeof e.o !== 'string' || !e.o || e.o.length > 128) continue;
          if (!Number.isFinite(e.at)) continue;
          bind(name, { o: e.o, at: e.at });
        }
        trimGlobal();
        for (const oid of [...byOwner.keys()]) trimOwner(oid);
      }
    }
    if (!salt) salt = crypto.randomBytes(24).toString('base64url');
  }
  function write() {
    if (!enabled || !dirty) return;
    dirty = false;
    savedAt = now();
    /** @type {Record<string, NameEntry>} */
    const out = Object.create(null);
    for (const [name, e] of names) out[name] = { o: e.o, at: e.at };
    try {
      writeJsonAtomic(file, { v: 1, salt, savedAt: now(), names: out });
    } catch (e) {
      dirty = true;
      onError('nomes', e);
    }
  }
  function save() {
    if (!enabled) return;
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      write();
    }, delayMs);
    if (timer.unref) timer.unref();
  }
  // Grava já o que estiver pendente (usado ao encerrar).
  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (dirty) write();
  }
  /** o nome está livre para este dono? (sem dono ou já é dele) */
  function free(name, oid) {
    if (!enabled) return true;
    const e = names.get(name);
    return !e || e.o === oid;
  }
  /** reserva o nome para o dono; false se já for de outra chave */
  function claim(name, oid) {
    if (!enabled) return true;
    const e = names.get(name);
    if (e) {
      if (e.o !== oid) return false;
      e.at = now();
      save();
      return true;
    }
    bind(name, { o: oid, at: now() });
    trimOwner(oid);
    trimGlobal();
    save();
    return true;
  }

  load();

  return {
    owner,
    free,
    claim,
    flush,
    write,
    get size() {
      return names.size;
    },
    get savedAt() {
      return savedAt;
    },
    get dirty() {
      return dirty;
    }
  };
}

module.exports = { createNameRegistry };
