/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Arquivos do cliente com hash no nome. O HTML referencia `/assets/app.css`;
 * na inicialização o servidor lê cada arquivo, calcula o SHA-256 do conteúdo e
 * passa a servir `/assets/app.<hash>.css` com `Cache-Control: immutable`. O HTML
 * enviado ao navegador já aponta para os nomes com hash, então um deploy só
 * faz o navegador baixar de novo o que realmente mudou.
 * Funções puras: quem lê os arquivos é injetado (`readAsset`).
 */
'use strict';

const crypto = require('crypto');
const path = require('path');

const PREFIX = '/assets/';
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2'
};
// Só nomes simples, sem barras: não há como escapar da pasta assets/.
const REF = /\b(href|src)="\/assets\/([A-Za-z0-9][A-Za-z0-9._-]*)"/g;
// Dentro do CSS: url(/assets/x.woff2), com ou sem aspas (fontes hospedadas aqui mesmo).
const CSS_REF = /url\((['"]?)\/assets\/([A-Za-z0-9][A-Za-z0-9._-]*)\1\)/g;

const hashOf = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);

/**
 * Reescreve as referências `/assets/<nome>` do HTML para `/assets/<base>.<hash><ext>`.
 * Devolve `{ html: Buffer, files: Map<url, { buf, type }> }`.
 * Lança erro para extensão não suportada ou arquivo ilegível.
 */
function build(html, readAsset) {
  const text = Buffer.isBuffer(html) ? html.toString('utf8') : String(html);
  const files = new Map();
  const done = new Map();
  const resolve = (name, depth) => {
    let url = done.get(name);
    if (!url) {
      const ext = path.extname(name).toLowerCase();
      const type = TYPES[ext];
      if (!type) throw new Error('tipo de arquivo não suportado em /assets/: ' + name);
      let buf = readAsset(name);
      // CSS: as fontes que ele usa também ganham hash, e o CSS passa a apontar para elas (o hash do CSS muda junto)
      if (ext === '.css' && depth === 0) buf = Buffer.from(buf.toString('utf8').replace(CSS_REF, (m2, q, n2) => 'url(' + q + resolve(n2, 1) + q + ')'), 'utf8');
      url = PREFIX + name.slice(0, name.length - ext.length) + '.' + hashOf(buf) + ext;
      files.set(url, { buf, type });
      done.set(name, url);
    }
    return url;
  };
  const out = text.replace(REF, (m, attr, name) => attr + '="' + resolve(name, 0) + '"');
  return { html: Buffer.from(out, 'utf8'), files };
}

module.exports = { build, hashOf, PREFIX, TYPES };
