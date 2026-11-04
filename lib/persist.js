'use strict';
// Persistência em JSON: leitura tolerante e escrita atômica (tmp + rename, modo 0600).
const fs = require('fs'),
  path = require('path');

// Devolve o objeto lido, ou null se o arquivo não existe. Lança se existir mas for inválido.
function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') return null;
    throw e;
  }
}

/**
 * Grava sem nunca deixar o arquivo pela metade. Lança em caso de erro (quem chama registra).
 * `durable` força o conteúdo e o rename no disco antes de retornar (usado em registros de
 * segurança, como as identidades): sem ele, uma queda de energia pode perder a última troca.
 * @param {string} file
 * @param {any} obj
 * @param {{durable?: boolean}} [opts]
 */
function writeJsonAtomic(file, obj, opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  const data = JSON.stringify(obj);
  if (opts.durable) {
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
      fs.writeFileSync(fd, data);
      try {
        fs.fsyncSync(fd);
      } catch (e) {
        /* sistema sem fsync */
      }
    } finally {
      fs.closeSync(fd);
    }
  } else {
    fs.writeFileSync(tmp, data, { mode: 0o600 });
  }
  try {
    fs.chmodSync(tmp, 0o600);
  } catch (e) {
    /* sistema sem chmod */
  }
  fs.renameSync(tmp, file);
  if (opts.durable) {
    // fsync do diretório: o rename também precisa sobreviver a uma queda de energia.
    try {
      const dfd = fs.openSync(path.dirname(file), 'r');
      try {
        fs.fsyncSync(dfd);
      } finally {
        fs.closeSync(dfd);
      }
    } catch (e) {
      /* alguns sistemas não permitem abrir diretório */
    }
  }
}

module.exports = { readJsonFile, writeJsonAtomic };
