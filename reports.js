'use strict';
// Armazém das denúncias: no máximo `max`, por até `ttl` ms, validadas ao carregar e gravadas com atraso.
const { readJsonFile, writeJsonAtomic } = require('./persist');

function createReports({ file, reasons, max = 500, ttl = 30 * 86400000, onError = () => {}, warn = () => {}, delayMs = 3000, now = Date.now }) {
  const list = [];
  let dirty = false, timer = null;

  const valid = r => r && typeof r.id === 'string' && /^[0-9a-f]{12}$/.test(r.id) && Number.isFinite(r.at) && now() - r.at < ttl &&
    typeof r.tk === 'string' && reasons[r.reason] && r.by && r.target && Array.isArray(r.chat);
  if (file) {
    try {
      const j = readJsonFile(file);
      for (const r of (j && Array.isArray(j.reports) ? j.reports : [])) if (valid(r)) list.push(r);
      list.splice(max);
    } catch (e) { warn('denúncias: arquivo inválido, começando vazio.'); }
  }

  function write() {
    if (!file || !dirty) return;
    dirty = false;
    try { writeJsonAtomic(file, { v: 1, reports: list }); } catch (e) { onError('denúncias', e); }
  }
  function save() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => { timer = null; write(); }, delayMs);
    if (timer.unref) timer.unref();
  }
  const expire = () => { const t = now(); for (let i = list.length - 1; i >= 0; i--) if (t - list[i].at > ttl) list.splice(i, 1); };
  // Mais nova primeiro; passando do teto, as mais antigas saem.
  const add = r => { list.unshift(r); list.splice(max); save(); };
  // Já existe denúncia do mesmo autor contra o mesmo alvo nos últimos `ms`?
  const recent = (rk, tk, ms) => { const t = now(); return list.some(r => r.rk === rk && r.tk === tk && t - r.at < ms); };
  const find = id => list.find(x => x.id === id);

  return { list, save, write, expire, add, recent, find };
}

module.exports = { createReports };
