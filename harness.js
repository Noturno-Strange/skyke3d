/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Apoio aos testes de integração: sobe o servidor numa porta livre, faz
 * requisições HTTP e abre clientes WebSocket. Os testes que usam isto pulam
 * sozinhos quando `ws` ou `vendor/three-r128.min.js` não existem.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const root = __dirname;

// Variáveis de ambiente que o servidor lê. Os testes ignoram as do seu terminal (STATUS_TOKEN, PUBLIC_URL,
// BAN, TICKET_MODE…) para o resultado não depender da sua configuração.
const SERVER_VARS = (() => {
  try {
    const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    return [...new Set([...src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)|\benvInt\('([A-Z][A-Z0-9_]*)'/g)].map(m => m[1] || m[2]))];
  } catch (e) { return []; }
})();
function cleanEnv() {
  const e = { ...process.env };
  for (const k of SERVER_VARS) delete e[k];
  return e;
}

function missing() {
  try { require.resolve('ws', { paths: [root] }); } catch (e) { return 'precisa de ws instalado (npm install)'; }
  if (!fs.existsSync(path.join(root, 'vendor', 'three-r128.min.js'))) return 'precisa de vendor/three-r128.min.js';
  return false;
}

/** Sobe `node server.js` em porta efêmera. Devolve `{ port, stop }`. */
async function startServer(env = {}) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...cleanEnv(), PORT: '0', BIND_HOST: '127.0.0.1', BAN_FILE: '0', RECORDS_FILE: '0', CAPACITY_FILE: '0', REPORTS_FILE: '0', HTTP_RATE: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stderr.on('data', d => { log += d; });
  const port = await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('servidor não subiu: ' + log)), 15000);
    child.stdout.on('data', d => {
      log += d;
      const m = /escutando em [^:]+:(\d+)/.exec(log);
      if (m) { clearTimeout(to); resolve(+m[1]); }
    });
    child.on('exit', c => reject(new Error('servidor saiu (' + c + '): ' + log)));
  });
  return { port, log: () => log, stop: () => new Promise(r => { child.once('exit', r); child.kill('SIGTERM'); }) };
}

/** Requisição HTTP simples. `body` objeto vira JSON. */
function request(port, p, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const h = { ...headers };
    if (data) { h['content-length'] = data.length; if (!h['content-type']) h['content-type'] = 'application/json'; }
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: h }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        if (/json/.test(res.headers['content-type'] || '')) { try { json = JSON.parse(buf.toString('utf8')); } catch (e) { /* corpo não é JSON */ } }
        resolve({ status: res.statusCode, headers: res.headers, body: buf, json });
      });
    });
    r.on('error', reject);
    r.end(data || undefined);
  });
}

/**
 * Abre um WebSocket do jogo. `xff` simula o IP do cliente atrás do proxy local
 * (127.0.0.1 é confiável por padrão). Resolve com `{ ws, msgs, closed }` ou
 * rejeita com `{ status }` quando o handshake é recusado.
 */
function connect(port, xff) {
  const WebSocket = require(require.resolve('ws', { paths: [root] }));
  return new Promise((resolve, reject) => {
    const headers = { Origin: 'http://127.0.0.1:' + port };
    if (xff) headers['X-Forwarded-For'] = xff;
    const ws = new WebSocket('ws://127.0.0.1:' + port, { headers });
    const msgs = [];
    const closed = new Promise(r => ws.on('close', code => r(code)));
    // o estado das posições vem em binário (ver stPack no servidor); o resto é JSON
    ws.on('message', (d, bin) => msgs.push(bin ? { t: 'st', bin: Buffer.from(d) } : JSON.parse(d)));
    ws.on('open', () => resolve({ ws, msgs, closed }));
    ws.on('unexpected-response', (req, res) => { res.resume(); reject({ status: res.statusCode }); });
    ws.on('error', () => {});
  });
}

const wait = ms => new Promise(r => setTimeout(r, ms));

/** Espera até `fn()` ser verdadeiro (ou estoura o tempo). */
async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await wait(25); }
  return !!fn();
}

module.exports = { missing, startServer, request, connect, wait, until, root };
