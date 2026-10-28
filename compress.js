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
const fs = require('fs');
const { execFileSync } = require('child_process');

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

/**
 * Igual a `build`, para vários buffers, mas a compressão roda num processo
 * filho que termina em seguida. O brotli em nível alto reserva muita memória
 * nativa e o sistema não a devolve ao processo que comprimiu (cerca de 10 MB a
 * mais, para sempre); no filho essa memória volta toda ao sistema na saída.
 * Se o filho falhar por qualquer motivo, comprime aqui mesmo.
 * Devolve um array de variantes, na mesma ordem de `bufs`.
 */
function buildMany(bufs, { execPath = process.execPath, ...opts } = {}) {
  try {
    const frames = [];
    for (const b of bufs) {
      const h = Buffer.alloc(4);
      h.writeUInt32BE(b.length);
      frames.push(h, b);
    }
    const out = execFileSync(execPath, [__filename, '--worker', JSON.stringify(opts)], {
      input: Buffer.concat(frames),
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 120000
    });
    let at = 0;
    const take = () => {
      const n = out.readUInt32BE(at);
      at += 4;
      const chunk = n ? out.subarray(at, at + n) : null;
      at += n;
      return chunk && Buffer.from(chunk);
    };
    const res = bufs.map(raw => {
      const v = { raw };
      const br = take(), gz = take();
      if (br) v.br = br;
      if (gz) v.gzip = gz;
      return v;
    });
    if (at !== out.length) throw new Error('resposta do filho incompleta');
    return res;
  } catch (e) {
    return bufs.map(b => build(b, opts));
  }
}

/** Modo filho: lê buffers da entrada, comprime e escreve br e gzip de cada um. */
function worker() {
  const opts = JSON.parse(process.argv[3] || '{}');
  const input = fs.readFileSync(0);
  const parts = [];
  const put = b => {
    const h = Buffer.alloc(4);
    h.writeUInt32BE(b ? b.length : 0);
    parts.push(h);
    if (b) parts.push(b);
  };
  for (let at = 0; at < input.length;) {
    const n = input.readUInt32BE(at);
    const v = build(input.subarray(at + 4, at + 4 + n), opts);
    at += 4 + n;
    put(v.br);
    put(v.gzip);
  }
  process.stdout.write(Buffer.concat(parts));
}

if (require.main === module && process.argv[2] === '--worker') worker();

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

module.exports = { build, buildMany, parseAccept, pick, etagFor, MIN_BYTES };
