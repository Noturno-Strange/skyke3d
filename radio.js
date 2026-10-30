/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Proxy de rádio (Icecast/Shoutcast em MP3/AAC) para o DJ da sala.
 *
 * O servidor abre UMA conexão https com a rádio por sala e reparte o áudio entre
 * os ouvintes: o servidor da rádio só vê o IP deste servidor, nunca o de quem ouve.
 * Segurança (anti-SSRF):
 *  - a URL passa por `streamUrl` (só https, domínio público, sem usuário/senha);
 *  - o DNS é resolvido aqui e a conexão é feita no IP validado (sem rebinding);
 *  - redirecionamentos (até 3) repetem a validação em cada salto;
 *  - só aceita resposta 200 com `audio/*` de MP3/AAC (Ogg não: ouvinte que entra no meio não decodifica);
 *  - limites de conexão, de tempo ocioso, de taxa (bytes/s) e de buffer por ouvinte.
 * As dependências (DNS, request) são injetáveis para os testes.
 */
'use strict';

const dns = require('dns');
const https = require('https');
const { isPublicAddress } = require('./netutil');
const { streamUrl } = require('./validate');

const CONNECT_MS = 8000;
const DNS_MS = 3000;
const IDLE_MS = 15000;
const GRACE_MS = 20000;
const MAX_REDIRECTS = 3;
const MAX_BPS = 96 * 1024;
const RATE_WINDOW_MS = 5000;
const MAX_LISTENER_BUF = 512 * 1024;
const OK_TYPE = /^audio\/(mpeg|mp3|mpeg3|x-mpeg|x-mpeg-3|x-mp3|aac|aacp|x-aac|aacplus|mp4|x-m4a|mp4a-latm)\b/i;
const OGG_TYPE = /^(audio|application)\/(ogg|x-ogg)\b/i;

const fail = reason => Object.assign(new Error(reason), { reason });

function createRadio(opts = {}) {
  const lookup = opts.lookup || ((h, o) => dns.promises.lookup(h, o));
  const request = opts.request || ((o, cb) => https.request(o, cb));
  const maxHubs = opts.maxHubs == null ? 10 : opts.maxHubs;
  const timers = { connect: opts.connectMs || CONNECT_MS, idle: opts.idleMs || IDLE_MS, grace: opts.graceMs || GRACE_MS };
  const hubs = new Map();

  async function resolveHost(host) {
    let timer;
    try {
      const list = await Promise.race([lookup(host, { all: true }), new Promise((_, no) => { timer = setTimeout(() => no(fail('dns')), DNS_MS); })]);
      if (!Array.isArray(list) || !list.length || !list.every(a => isPublicAddress(a.address))) return null;
      return { address: list[0].address, family: list[0].family };
    } catch (e) { return null; } finally { clearTimeout(timer); }
  }

  /** Abre a rádio e devolve { res, req } já validada (200 + áudio MP3/AAC). */
  async function open(url, left = MAX_REDIRECTS) {
    const norm = streamUrl(url);
    if (!norm) throw fail('url');
    const u = new URL(norm);
    const addr = await resolveHost(u.hostname);
    if (!addr) throw fail('dns');
    return new Promise((resolve, reject) => {
      let settled = false, req = null, timer = null;
      const done = (err, val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) { try { req && req.destroy(); } catch (e) { /* já fechado */ } reject(err); } else resolve(val);
      };
      try {
        req = request({
          protocol: 'https:', host: u.hostname, hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
          method: 'GET', servername: u.hostname, agent: false,
          headers: { 'User-Agent': 'Skyke3D-Radio/1.0', Accept: 'audio/*', 'Icy-MetaData': '0', Connection: 'close' },
          // conecta no IP já validado: o nome não é resolvido de novo
          lookup: (h, o, cb) => (o && o.all ? cb(null, [{ address: addr.address, family: addr.family }]) : cb(null, addr.address, addr.family))
        }, res => {
          const code = res.statusCode;
          if (code >= 300 && code < 400 && res.headers.location) {
            res.resume();
            if (left <= 0) return done(fail('redirects'));
            let next;
            try { next = new URL(res.headers.location, u).href; } catch (e) { return done(fail('url')); }
            try { req.destroy(); } catch (e) { /* já fechado */ }
            settled = true;
            clearTimeout(timer);
            return resolve(open(next, left - 1));
          }
          if (code !== 200) { res.resume(); return done(fail('status')); }
          const ct = String(res.headers['content-type'] || '');
          if (OGG_TYPE.test(ct)) { res.resume(); return done(fail('ogg')); }
          if (!OK_TYPE.test(ct)) { res.resume(); return done(fail('type')); }
          done(null, { res, req, ct: ct.split(';')[0].trim().toLowerCase() });
        });
      } catch (e) { return done(fail('url')); }
      timer = setTimeout(() => done(fail('timeout')), timers.connect);
      req.on('error', () => done(fail('connect')));
      req.end();
    });
  }

  /** Confere que a rádio responde como streaming de áudio, sem manter a conexão. */
  async function probe(url) {
    try {
      const { res, req } = await open(url);
      try { res.destroy(); req.destroy(); } catch (e) { /* já fechado */ }
      return { ok: true };
    } catch (e) { return { ok: false, reason: e.reason || 'connect' }; }
  }

  function closeHub(h, endListeners) {
    if (h.closed) return;
    h.closed = true;
    clearTimeout(h.grace);
    clearInterval(h.rateTimer);
    hubs.delete(h.key);
    try { h.up && h.up.destroy(); h.req && h.req.destroy(); } catch (e) { /* já fechado */ }
    if (endListeners) for (const l of h.listeners) { try { l.headersSent ? l.end() : l.writeHead(502).end(); } catch (e) { /* já fechado */ } }
    h.listeners.clear();
  }

  function head(h, res, extra) {
    if (res.headersSent) return;
    res.writeHead(200, { ...extra, 'Content-Type': h.ct, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'none' });
    if (res.flushHeaders) res.flushHeaders();
  }

  function connect(h, extra) {
    h.state = 'connecting';
    open(h.url).then(({ res, req, ct }) => {
      if (h.closed || !h.listeners.size) { try { res.destroy(); req.destroy(); } catch (e) { /* já fechado */ } if (!h.closed) closeHub(h, false); return; }
      h.up = res; h.req = req; h.ct = ct; h.state = 'live'; h.bytes = 0;
      for (const l of h.listeners) head(h, l, extra);
      h.rateTimer = setInterval(() => {
        if (h.bytes / (RATE_WINDOW_MS / 1000) > MAX_BPS) closeHub(h, true);
        h.bytes = 0;
      }, RATE_WINDOW_MS);
      if (h.rateTimer.unref) h.rateTimer.unref();
      res.setTimeout(timers.idle, () => closeHub(h, true));
      res.on('data', chunk => {
        h.bytes += chunk.length;
        for (const l of h.listeners) {
          if (!l.headersSent) continue;
          if (l.writableLength > MAX_LISTENER_BUF) { l.destroy(); continue; }
          l.write(chunk);
        }
      });
      res.on('end', () => closeHub(h, true));
      res.on('error', () => closeHub(h, true));
    }).catch(() => closeHub(h, true));
  }

  /**
   * Liga um ouvinte (resposta HTTP) à rádio da sala `key`.
   * Devolve 'ok', 'full' (limite de rádios) ou 'busy' (a sala já usa outra URL).
   */
  function attach(key, url, res, extraHeaders = {}) {
    let h = hubs.get(key);
    if (h && h.url !== url) { closeHub(h, true); h = null; }
    if (!h) {
      if (hubs.size >= maxHubs) return 'full';
      h = { key, url, listeners: new Set(), up: null, req: null, ct: 'audio/mpeg', state: 'idle', closed: false, grace: null, rateTimer: null, bytes: 0 };
      hubs.set(key, h);
    }
    clearTimeout(h.grace);
    h.listeners.add(res);
    res.on('close', () => {
      h.listeners.delete(res);
      if (!h.closed && !h.listeners.size) { h.grace = setTimeout(() => closeHub(h, false), timers.grace); if (h.grace.unref) h.grace.unref(); }
    });
    if (h.state === 'live') head(h, res, extraHeaders);
    else if (h.state === 'idle') connect(h, extraHeaders);
    return 'ok';
  }

  function stop(key) { const h = hubs.get(key); if (h) closeHub(h, true); }
  function stats() { let listeners = 0; for (const h of hubs.values()) listeners += h.listeners.size; return { hubs: hubs.size, listeners }; }

  return { attach, stop, probe, stats, open };
}

const REASONS = {
  url: 'Link inválido. Use o link de uma rádio online.',
  dns: 'Não foi possível encontrar essa rádio.',
  timeout: 'A rádio não respondeu a tempo.',
  connect: 'Não foi possível conectar à rádio. Confira o link.',
  status: 'Essa rádio não está disponível ou o link não é de uma transmissão de áudio.',
  redirects: 'Não foi possível abrir essa rádio.',
  ogg: 'Esse formato de rádio não é suportado. Tente outra rádio.',
  type: 'Esse link não é de uma transmissão de áudio.'
};

module.exports = { createRadio, REASONS };
