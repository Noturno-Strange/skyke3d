/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Compressão de arquivos estáticos feita uma única vez, na inicialização, e
 * negociação de `Accept-Encoding`. Funções puras e sem I/O: o servidor só
 * escolhe um buffer já pronto a cada requisição (custo de CPU zero em regime).
 */
'use strict';

const zlib = require('zlib');

const MIN_BYTES = 1024;

/**
 * Gera as variantes de um buffer. `raw` sempre existe; `br` e `gzip` só são
 * incluídas quando realmente ficam menores que o original.
 */
function build(buf, { brotli = true, gzip = true } = {}) {
  const out = { raw: buf };
  if (!Buffer.isBuffer(buf) || buf.length < MIN_BYTES) return out;
  const c = zlib.constants;
  if (brotli) {
    const b = zlib.brotliCompressSync(buf, {
      params: {
        [c.BROTLI_PARAM_QUALITY]: 11,
        [c.BROTLI_PARAM_MODE]: c.BROTLI_MODE_TEXT,
        [c.BROTLI_PARAM_SIZE_HINT]: buf.length
      }
    });
    if (b.length < buf.length) out.br = b;
  }
  if (gzip) {
    const g = zlib.gzipSync(buf, { level: 9 });
    if (g.length < buf.length) out.gzip = g;
  }
  return out;
}

/** Interpreta `Accept-Encoding` e devolve o valor q (0..1) de cada codificação citada. */
function parseAccept(header) {
  const q = Object.create(null);
  if (typeof header !== 'string' || !header) return q;
  for (const part of header.split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    let w = 1;
    for (const p of params) {
      if (!/^\s*q\s*=/.test(p)) continue;
      const m = /^\s*q\s*=\s*(\d(?:\.\d{0,3})?)\s*$/.exec(p);
      const n = m ? Number(m[1]) : NaN;
      w = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; // q malformado: não comprime
    }
    q[name] = w;
  }
  return q;
}

/**
 * Escolhe a melhor variante disponível. Preferência: br, depois gzip, depois
 * o original. Respeita `q=0` e o curinga `*`.
 * Devolve `{ enc, buf }`, onde `enc` é 'br', 'gzip' ou '' (sem codificação).
 */
function pick(variants, acceptEncoding) {
  const q = parseAccept(acceptEncoding);
  const ok = name => (name in q ? q[name] : ('*' in q ? q['*'] : 0)) > 0;
  if (variants.br && ok('br')) return { enc: 'br', buf: variants.br };
  if (variants.gzip && (ok('gzip') || ok('x-gzip'))) return { enc: 'gzip', buf: variants.gzip };
  return { enc: '', buf: variants.raw };
}

/** ETag próprio por codificação, para o cache não misturar corpos diferentes. */
function etagFor(base, enc) {
  return enc ? base.slice(0, -1) + '-' + enc + '"' : base;
}

module.exports = { build, parseAccept, pick, etagFor, MIN_BYTES };
