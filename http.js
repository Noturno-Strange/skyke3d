/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * HTTP server handling: static files, CSP, request routing.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const V = require('./validate');
const { FOOD, CODE_ALPHABET, cleanCfg, clampPos, normalizeMessage } = V;
const config = require('./config');
const { createIceConfig } = require('./turn');

function ifNoneMatch(q, etag) {
  return String(q.headers['if-none-match'] || '').split(',').some(x => x.trim() === etag);
}

function sendCached(q, s, buf, etag, type, cache) {
  const h = { ...config.HDR, 'Content-Type': type, 'Cache-Control': cache, 'ETag': etag, 'Content-Length': buf.length };
  if (ifNoneMatch(q, etag)) { delete h['Content-Length']; s.writeHead(304, h); return s.end(); }
  s.writeHead(200, h); s.end(q.method === 'HEAD' ? undefined : buf);
}

function plain(q, s, status, text, extra) {
  s.writeHead(status, { ...config.HDR, 'Content-Type': 'text/plain; charset=utf-8', ...extra });
  s.end(q.method === 'HEAD' ? undefined : text);
}

function readStatic(rel) {
  try { return fs.readFileSync(path.join(__dirname, rel)); }
  catch (e) { console.error('arquivo estático ausente ou ilegível: ' + rel); process.exit(1); }
}

const INDEX_BUF = readStatic('index.html');
const THREE_BUF = readStatic(path.join('vendor', 'three-r186.min.js'));

const etagOf = buf => '"' + crypto.createHash('sha256').update(buf).digest('base64url').slice(0, 27) + '"';
const INDEX_ETAG = etagOf(INDEX_BUF);
const THREE_ETAG = etagOf(THREE_BUF);

function inlineScriptHashes(html) {
  const out = new Set(), re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi; let m;
  while ((m = re.exec(html))) if (!/\bsrc\s*=/i.test(m[1])) out.add("'sha384-" + crypto.createHash('sha384').update(m[2], 'utf8').digest('base64') + "'");
  return [...out];
}

function buildCSP(config, STATUS_HTML) {
  const SCRIPT_HASHES = [...new Set([...inlineScriptHashes(INDEX_BUF.toString('utf8')), ...inlineScriptHashes(STATUS_HTML)])];
  const CONNECT_SRC = config.PROD ? ["'self'", ...[...config.ALLOWED_HOSTS].map(h => 'wss://' + h)].join(' ') : "'self' ws: wss:";
  const CSP = [
    "default-src 'self'",
    "script-src 'self' " + SCRIPT_HASHES.join(' ') + " https://www.youtube.com https://s.ytimg.com",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://i.ytimg.com https://img.youtube.com",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
    "connect-src " + CONNECT_SRC,
    "media-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join('; ');

  const HDR = {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
    'Content-Security-Policy': CSP
  };

  return { CSP, HDR, SCRIPT_HASHES };
}

function createRequestHandler({ config, rooms, wss, iceConfig, hits, over, blocked, logError, STATUS_ON, STATUS_HTML, hm, tokOk }) {
  return function onRequest(q, s) {
    try {
      const ip = config.rateKey(config.ipOf(q));
      if (config.HTTP_RATE > 0 && over(ip, 'http', config.HTTP_RATE, 60000)) return plain(q, s, 429, '429', { 'Retry-After': '60' });
      if (q.method !== 'GET' && q.method !== 'HEAD') return plain(q, s, 405, '405', { Allow: 'GET, HEAD' });
      const u = String(q.url || '').split('?')[0];
      if (u === '/status' || u === '/status.json') {
        if (!STATUS_ON) return plain(q, s, 404, '404');
        if (u === '/status') { s.writeHead(200, { ...config.HDR, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }); return s.end(q.method === 'HEAD' ? undefined : STATUS_HTML); }
        const J = { ...config.HDR, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
        if (blocked(ip, 'sf', 6, 600000)) { s.writeHead(429, J); return s.end('{"erro":"muitas tentativas"}'); }
        const a = String(q.headers.authorization || ''), t = a.startsWith('Bearer ') ? a.slice(7) : '';
        if (!tokOk(t)) { over(ip, 'sf', 999, 600000); s.writeHead(401, J); return s.end('{"erro":"não autorizado"}'); }
        // cache and stats handled by caller
        return { type: 'status-json', J };
      }
      if (u === '/' || u === '/index.html') return sendCached(q, s, INDEX_BUF, INDEX_ETAG, 'text/html; charset=utf-8', 'no-cache');
      if (u === '/vendor/three-r186.min.js') return sendCached(q, s, THREE_BUF, THREE_ETAG, 'application/javascript; charset=utf-8', 'public, max-age=31536000, immutable');
      return plain(q, s, 404, '404');
    } catch (e) {
      logError('http', e);
      if (!s.headersSent) try { s.writeHead(500, { ...config.HDR, 'Content-Type': 'text/plain; charset=utf-8' }); } catch (x) { }
      try { s.end('erro'); } catch (x) { }
    }
  };
}

module.exports = { ifNoneMatch, sendCached, plain, readStatic, INDEX_BUF, THREE_BUF, etagOf, INDEX_ETAG, THREE_ETAG, inlineScriptHashes, buildCSP, createRequestHandler };