'use strict';
// Persistência em JSON: leitura tolerante e escrita atômica (tmp + rename, modo 0600).
const fs = require('fs'), path = require('path');

// Devolve o objeto lido, ou null se o arquivo não existe. Lança se existir mas for inválido.
function readJsonFile(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

// Grava sem nunca deixar o arquivo pela metade. Lança em caso de erro (quem chama registra).
function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch (e) { /* sistema sem chmod */ }
  fs.renameSync(tmp, file);
}

module.exports = { readJsonFile, writeJsonAtomic };
