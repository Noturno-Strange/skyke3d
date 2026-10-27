/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Configuração de ambiente e constantes.
 */
'use strict';

const net = require('net');
const { firstClientIp } = require('./netutil');

function ipOf(q) {
  return firstClientIp({
    remote: q.socket.remoteAddress || '?',
    xff: oneHeader(q, 'x-forwarded-for'),
    cf: oneHeader(q, 'cf-connecting-ip'),
    cfEnabled: TRUST_CF_CONNECTING_IP,
    trusted: trustedIp
  });
}

function envInt(name, def, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  if (!/^\d+$/.test(raw)) {
    console.error(name + ' inválido: use um inteiro entre ' + min + ' e ' + max + '.');
    process.exit(1);
  }
  const n = +raw;
  if (n < min || n > max) {
    console.error(name + ' inválido: use um inteiro entre ' + min + ' e ' + max + '.');
    process.exit(1);
  }
  return n;
}

const MAX = envInt('MAX', 25, 1, 100);
const MAXROOMS = 75;
const PORT = envInt('PORT', 3000, 0, 65535);
const KDEF = 780000;
const KEXTRA = 21000;
const KMAX = 780000;
const MAXCONN = 400;
const PERIP = envInt('PERIP', 6, 1, 1000);
const HTTP_RATE = envInt('HTTP_RATE', 120, 0, 1000000);
const MAX_HITS_KEYS = 10000;

const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
const RECONNECT_MS = Math.max(100, Math.min(300000, Number(process.env.RECONNECT_MS) || 30000));

const TURN_URLS = String(process.env.TURN_URL || '').split(',').map(x => x.trim()).filter(Boolean).filter(u => {
  if (/^turns?:[^\s]+$/i.test(u)) return true;
  console.warn('TURN_URL ignorado (use turn: ou turns:): ' + u);
  return false;
});
const TURN_USER = process.env.TURN_USER || '';
const TURN_PASS = process.env.TURN_PASS || '';
const TURN_SECRET = process.env.TURN_SECRET || '';
const TURN_HAS_STATIC = !!(TURN_USER && TURN_PASS);
const TURN_TTL = envInt('TURN_TTL', 3600, 60, 86400);
const TURN_LABEL = (process.env.TURN_LABEL || 'skyke3d').replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 64) || 'skyke3d';
const TURN_ALLOW_STATIC = /^(1|true|yes|on)$/i.test(String(process.env.TURN_ALLOW_STATIC || ''));

if (process.env.RELAY_ONLY) console.warn('RELAY_ONLY foi removido: o TURN agora é usado apenas como fallback (iceTransportPolicy=all).');

function parseOrigin(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s !== raw || s === 'null' || s.endsWith('/')) return null;
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.pathname !== '/' || u.search || u.hash || u.username || u.password) return null;
  return { origin: u.origin, scheme: u.protocol.slice(0, -1), host: u.hostname.toLowerCase(), port: u.port ? +u.port : null };
}

function parseHost(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s !== raw || /[\s/\\@?#]/.test(s)) return null;
  let u;
  try { u = new URL('http://' + s); } catch (e) { return null; }
  if (u.pathname !== '/' || u.search || u.hash || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!host) return null;
  let port = u.port ? +u.port : null;
  if (port === 80 || port === 443) port = null;
  return { host, port };
}

const hostKey = (host, port) => port ? host + ':' + port : host;

function publicHost(host) {
  let h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h || net.isIP(h)) return false;
  return h !== 'localhost' && !h.endsWith('.localhost') && !h.endsWith('.local') && !h.endsWith('.ts.net');
}

const PUBLIC_URL = (() => {
  const raw = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  const o = parseOrigin(raw);
  if (!o || o.scheme !== 'https' || !publicHost(o.host)) {
    console.error('PUBLIC_URL inválida: use um domínio público em https, ex.: https://jogo.exemplo.com');
    process.exit(1);
  }
  return o.origin;
})();

const PROD = !!PUBLIC_URL;

if (TURN_URLS.length) {
  if (PROD && !TURN_SECRET && !TURN_ALLOW_STATIC) {
    console.error('TURN_SECRET é obrigatório em produção quando TURN_URL está definido. Use TURN_ALLOW_STATIC=1 apenas para aceitar credenciais estáticas conscientemente.');
    process.exit(1);
  }
  if (!TURN_SECRET && TURN_HAS_STATIC) console.warn((PROD ? 'TURN com credenciais estáticas permitido por TURN_ALLOW_STATIC=1.' : 'TURN usando credenciais estáticas (desenvolvimento).') + ' Prefira TURN_SECRET.');
  if (!TURN_SECRET && !TURN_HAS_STATIC) console.warn('TURN_URL definido sem TURN_SECRET nem TURN_USER/TURN_PASS: o TURN será ignorado.');
  if (TURN_SECRET && TURN_HAS_STATIC) console.warn('TURN_USER/TURN_PASS ignorados porque TURN_SECRET está definido.');
} else if (TURN_SECRET) {
  console.warn('TURN_SECRET definido sem TURN_URL: nenhum servidor TURN será anunciado.');
}

const ORIGINS = (() => {
  const out = new Set();
  for (const raw of String(process.env.ORIGINS || '').split(',')) {
    const s = raw.trim(); if (!s) continue;
    const o = parseOrigin(s);
    if (!o) { console.warn('ORIGINS ignorado (origem inválida): ' + s); continue; }
    if (PROD && o.scheme !== 'https') { console.warn('ORIGINS ignorado (produção exige https): ' + s); continue; }
    out.add(o.origin);
  }
  return out;
})();

const ALLOWED_HOSTS = (() => {
  const out = new Set();
  if (PUBLIC_URL) { const u = new URL(PUBLIC_URL); out.add(hostKey(u.hostname.toLowerCase(), u.port ? +u.port : null)); }
  for (const o of ORIGINS) { const u = new URL(o); out.add(hostKey(u.hostname.toLowerCase(), u.port ? +u.port : null)); }
  for (const raw of String(process.env.ALLOWED_HOSTS || '').split(',')) {
    const s = raw.trim(); if (!s) continue;
    const h = parseHost(s);
    if (!h) { console.warn('ALLOWED_HOSTS ignorado (host inválido): ' + s); continue; }
    out.add(hostKey(h.host, h.port));
  }
  return out;
})();

const TRUST_PROXY = (() => {
  const raw = process.env.TRUST_PROXY === undefined ? '127.0.0.1,::1' : process.env.TRUST_PROXY;
  const list = new net.BlockList();
  for (const rawEntry of raw.split(',')) {
    const s = rawEntry.trim(); if (!s) continue;
    try {
      if (s.includes('/')) {
        const [addr, bits] = s.split('/');
        const type = net.isIP(addr);
        if (!type || !Number.isInteger(+bits)) throw new Error('cidr');
        list.addSubnet(addr, +bits, type === 6 ? 'ipv6' : 'ipv4');
      } else {
        const type = net.isIP(s);
        if (!type) throw new Error('ip');
        list.addAddress(s, type === 6 ? 'ipv6' : 'ipv4');
      }
    } catch (e) { console.warn('TRUST_PROXY ignorado: ' + s); }
  }
  return list;
})();

const TRUST_CF_CONNECTING_IP = /^(1|true|yes|on)$/i.test(String(process.env.TRUST_CF_CONNECTING_IP || ''));
const trustedIp = ip => { const type = net.isIP(ip); return !!type && TRUST_PROXY.check(ip, type === 6 ? 'ipv6' : 'ipv4'); };

function devHostAllowed(host) {
  let h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.ts.net')) return true;
  if (h.startsWith('::ffff:') && net.isIP(h.slice(7)) === 4) h = h.slice(7);
  const v = net.isIP(h);
  if (v === 4) {
    const p = h.split('.').map(Number);
    return p[0] === 127 || p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || (p[0] === 169 && p[1] === 254);
  }
  if (v === 6) return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:');
  return false;
}

function hostAllowed(h) {
  if (!h) return false;
  if (ALLOWED_HOSTS.has(hostKey(h.host, h.port))) return true;
  return !PROD && devHostAllowed(h.host);
}

function originAllowed(o, h) {
  if (!o || !h) return false;
  if (PROD && o.scheme !== 'https') return false;
  if (ORIGINS.has(o.origin)) return true;
  const np = p => p === 80 || p === 443 ? null : p;
  return o.host === h.host && np(o.port) === np(h.port);
}

function oneHeader(req, name) {
  let val = null, count = 0;
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (String(req.rawHeaders[i]).toLowerCase() === name) { count++; val = req.rawHeaders[i + 1]; }
  }
  return count === 1 ? val : null;
}

module.exports = {
  MAX, MAXROOMS, PORT, KDEF, KEXTRA, KMAX, MAXCONN, PERIP, HTTP_RATE, MAX_HITS_KEYS,
  BIND_HOST, RECONNECT_MS,
  TURN_URLS, TURN_USER, TURN_PASS, TURN_SECRET, TURN_HAS_STATIC, TURN_TTL, TURN_LABEL, TURN_ALLOW_STATIC,
  PUBLIC_URL, PROD,
  ORIGINS, ALLOWED_HOSTS,
  TRUST_PROXY, TRUST_CF_CONNECTING_IP, trustedIp,
  hostKey, hostAllowed, originAllowed, oneHeader,
  parseOrigin, parseHost,
  devHostAllowed, publicHost,
  ipOf
};