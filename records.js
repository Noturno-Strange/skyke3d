'use strict';
// Recordes desde sempre (máximo de jogadores, picos de memória e de rede), persistidos em JSON.
const { readJsonFile, writeJsonAtomic } = require('./persist');

/** @param {{file?:string, keys:string[], onError?:(what:string, e:any)=>void, warn?:(msg:string)=>void, now?:()=>number}} o */
function createRecords({ file, keys, onError = () => {}, warn = () => {}, now = Date.now }) {
  const records = Object.fromEntries(keys.map(k => [k, { v: 0, at: 0 }]));
  let dirty = false, savedAt = 0;
  if (file) {
    try {
      const j = readJsonFile(file);
      for (const k of keys) {
        const x = j && j.records && j.records[k];
        if (x && Number.isFinite(x.v) && x.v >= 0 && Number.isFinite(x.at)) records[k] = { v: x.v, at: x.at };
      }
    } catch (e) { warn('recordes: arquivo inválido, começando do zero.'); }
  }
  // Só sobe: valores menores, NaN ou chaves desconhecidas são ignorados.
  const up = (k, v) => {
    if (records[k] && Number.isFinite(v) && v > records[k].v) {
      records[k] = { v: Math.round(v * 10) / 10, at: Math.floor(now() / 1000) };
      dirty = true;
    }
  };
  function write() {
    if (!file || !dirty) return;
    dirty = false; savedAt = now();
    try { writeJsonAtomic(file, { v: 1, savedAt: now(), records }); } catch (e) { onError('recordes', e); }
  }
  return { records, up, write, get dirty() { return dirty; }, get savedAt() { return savedAt; } };
}

module.exports = { createRecords };
