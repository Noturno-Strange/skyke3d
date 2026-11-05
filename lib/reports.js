'use strict';
// Armazém das denúncias: no máximo `max`, por até `ttl` ms, validadas ao carregar e gravadas com atraso.
const { readJsonFile, writeJsonAtomic } = require('./persist');

/** @param {{file?:string, reasons:any, max?:number, ttl?:number, perAuthor?:number, onError?:(what:string, e:any)=>void, warn?:(msg:string)=>void, delayMs?:number, now?:()=>number}} o */
function createReports({
  file,
  reasons,
  max = 500,
  ttl = 30 * 86400000,
  perAuthor = 10,
  onError = () => {},
  warn = () => {},
  delayMs = 3000,
  now = Date.now
}) {
  const list = [];
  let dirty = false,
    timer = null;

  const valid = r =>
    r &&
    typeof r.id === 'string' &&
    /^[0-9a-f]{12}$/.test(r.id) &&
    Number.isFinite(r.at) &&
    now() - r.at < ttl &&
    typeof r.tk === 'string' &&
    reasons[r.reason] &&
    r.by &&
    r.target &&
    Array.isArray(r.chat);
  if (file) {
    try {
      const j = readJsonFile(file);
      for (const r of j && Array.isArray(j.reports) ? j.reports : []) if (valid(r)) list.push(r);
      list.splice(max);
    } catch (e) {
      warn('denúncias: arquivo inválido, começando vazio.');
    }
  }

  function write() {
    if (!file || !dirty) return;
    dirty = false;
    try {
      writeJsonAtomic(file, { v: 1, reports: list });
    } catch (e) {
      onError('denúncias', e);
    }
  }
  function save() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      write();
    }, delayMs);
    if (timer.unref) timer.unref();
  }
  const expire = () => {
    const t = now();
    for (let i = list.length - 1; i >= 0; i--) if (t - list[i].at > ttl) list.splice(i, 1);
  };
  // Passou do teto: sai primeiro o que já foi resolvido (arquivado ou banido), o mais antigo antes; se só sobraram denúncias abertas,
  // sai a mais antiga de quem tem MAIS denúncias abertas (quem inunda a fila perde as próprias, não as dos outros).
  // Antes, a lista simplesmente cortava as mais antigas: 50 origens mandando denúncias falsas apagavam as verdadeiras.
  function evict() {
    while (list.length > max) {
      let i = -1;
      for (let k = list.length - 1; k >= 0; k--)
        if (list[k].status !== 'open') {
          i = k;
          break;
        }
      if (i < 0) {
        const n = new Map();
        for (const x of list) n.set(x.rk, (n.get(x.rk) || 0) + 1);
        /** @type {[string, number]|null} */
        let top = null;
        for (const [rk, c] of n) if (!top || c > top[1]) top = [rk, c];
        const alvo = top ? top[0] : list[list.length - 1].rk;
        for (let k = list.length - 1; k >= 0; k--)
          if (list[k].rk === alvo) {
            i = k;
            break;
          }
      }
      list.splice(i, 1);
    }
  }
  // Mais nova primeiro. Devolve false (sem guardar) quando o autor já tem `perAuthor` denúncias abertas.
  const add = r => {
    if (perAuthor > 0 && list.filter(x => x.rk === r.rk && x.status === 'open').length >= perAuthor) return false;
    list.unshift(r);
    evict();
    save();
    return true;
  };
  // Já existe denúncia do mesmo autor contra o mesmo alvo nos últimos `ms`?
  const recent = (rk, tk, ms) => {
    const t = now();
    return list.some(r => r.rk === rk && r.tk === tk && t - r.at < ms);
  };
  const find = id => list.find(x => x.id === id);

  return { list, save, write, expire, add, recent, find };
}

module.exports = { createReports };
