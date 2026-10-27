/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Entry point: wires all modules together.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const config = require('./config');
const { createIceConfig } = require('./turn');
const { INDEX_BUF, THREE_BUF, INDEX_ETAG, THREE_ETAG, buildCSP, createRequestHandler } = require('./http');
const { createStatusModule } = require('./status');
const { createWsHandler, send, bc, pub, humans, onlineHumans } = require('./ws-handler');
const { blocked, over, conns, cleanupHits } = require('./rate-limit');
const { newToken, addHuman, resumeSession, markOffline, dropPlayer } = require('./players');
const { newBot, fit, hostTransfer, destroyRoom, code } = require('./rooms');
const { kq, kmem, kcap, kstart, kbc, krot, kinvite, dropKaraoke, KINVITE_MS } = require('./karaoke');
const { stopVideo } = require('./video');
const { clampPos, rnd, rr, FOOD, CODE_ALPHABET, cleanCfg, tokenEq } = require('./validate');
const { logError, startCleanupIntervals } = require('./cleanup');

// ===== Rooms =====
const rooms = new Map();
let nid = 1;

// ===== Rate limiting =====
const hits = new Map();

// ===== Status module =====
const statusModule = createStatusModule({ config, rooms, wss: null });

// ===== Build CSP and HDR =====
const { CSP, HDR, SCRIPT_HASHES } = buildCSP(config, statusModule.STATUS_HTML);
config.HDR = HDR;

// ===== HTTP Server =====
let statusCache = null;
let statusCacheAt = 0;

// Create request handler with proper references
const requestHandler = createRequestHandler({
  config,
  rooms,
  wss: null, // will be set after wss creation
  iceConfig: () => createIceConfig(config),
  hits,
  over,
  blocked,
  logError,
  STATUS_ON: statusModule.STATUS_ON,
  STATUS_HTML: statusModule.STATUS_HTML,
  hm: statusModule.hm,
  tokOk: statusModule.tokOk
});

// Create HTTP server first
const server = http.createServer((q, s) => {
  const result = requestHandler(q, s);
  if (result && result.type === 'status-json') {
    if (!statusModule.cache || Date.now() - statusModule.cacheAt > 2000) {
      statusModule.cache = JSON.stringify(statusModule.stats());
      statusModule.cacheAt = Date.now();
    }
    s.writeHead(200, result.J);
    s.end(q.method === 'HEAD' ? undefined : statusModule.cache);
  }
});

// ===== WebSocket Server =====
const wss = new WebSocketServer({ server, maxPayload: 32768, verifyClient: (info, cb) => {
  try {
    const req = info.req, ip = config.rateKey(config.ipOf(req));
    if (over(ip, 'hs', 120, 60000)) return cb(false, 429, 'limite');
    const host = config.parseHost(config.oneHeader(req, 'host'));
    const origin = config.parseOrigin(config.oneHeader(req, 'origin'));
    if (!config.hostAllowed(host) || !config.originAllowed(origin, host)) {
      if (over(ip, 'hsbad', 30, 60000)) return cb(false, 429, 'limite');
      return cb(false, 403, 'origem negada');
    }
    if ((conns.get(ip) || 0) >= config.PERIP || wss.clients.size >= config.MAXCONN) return cb(false, 429, 'limite');
    cb(true);
  } catch (e) { logError('handshake', e); try { cb(false, 500, 'erro'); } catch (x) { } }
}});

// Update status module with real wss
Object.assign(statusModule, createStatusModule({ config, rooms, wss }));

// Update request handler with real wss
requestHandler.wss = wss;

// ===== joinPayload helper =====
function joinPayload(room, me, resume) {
  return {
    t: 'joined',
    url: config.PUBLIC_URL,
    ice: createIceConfig(config),
    id: me.id,
    code: room.code,
    style: room.style,
    host: room.host,
    want: room.want,
    players: [...room.players.values()].map(pub),
    kar: kq(room),
    kl: Math.max(0, room.karEnd - Date.now()),
    turn: room.karTurn,
    token: me.token,
    self: pub(me),
    reconnect: config.RECONNECT_MS,
    ...(resume ? { resume: 1 } : {})
  };
}

// ===== Wire up ws handler =====
const wsHandler = createWsHandler({
  rooms,
  wss,
  iceConfig: () => createIceConfig(config),
  addHuman: (opts) => addHuman({ ...opts, nid: nid++, bc, pub, joinPayload, iceConfig: () => createIceConfig(config) }),
  resumeSession: (opts) => resumeSession({ ...opts, bc, pub, joinPayload, iceConfig: () => createIceConfig(config), onlineHumans, hostTransfer, kq }),
  dropPlayer: (opts) => dropPlayer({ ...opts, bc, stopVideo, dropKaraoke, fit: (r) => fit(r, config.MAX, bc, pub), destroyRoom: (r) => destroyRoom(r, rooms), humans }),
  markOffline: (opts) => markOffline({ ...opts, RECONNECT_MS: config.RECONNECT_MS, dropPlayer, stopVideo, dropKaraoke, bc, hostTransfer }),
  fit: (r) => fit(r, config.MAX, bc, pub),
  hostTransfer,
  destroyRoom: (r) => destroyRoom(r, rooms),
  joinPayload,
  newToken,
  send,
  bc,
  pub,
  humans,
  onlineHumans
});

wss.on('connection', wsHandler);

// ===== Start cleanup intervals =====
startCleanupIntervals({
  rooms,
  wss,
  bc,
  pub,
  clampPos,
  rnd,
  rr,
  MAX: config.MAX,
  humans,
  logError,
  config,
  MAX_HITS_KEYS: config.MAX_HITS_KEYS
});

// ===== Graceful shutdown =====
process.on('uncaughtException', e => { console.error('erro fatal:', e && e.stack || e); process.exit(1); });
process.on('unhandledRejection', e => logError('promise', e));
server.on('error', e => { console.error('erro no servidor:', e && e.message || e); process.exit(1); });
server.headersTimeout = 20000;
server.requestTimeout = 30000;
server.keepAliveTimeout = 10000;
server.maxHeadersCount = 100;

let stopping = false;
function shutdown(sig) {
  if (stopping) return; stopping = true;
  console.log('Encerrando (' + sig + ')…');
  const done = () => { try { process.exit(0); } catch (e) { } };
  const force = setTimeout(() => { try { server.closeAllConnections(); } catch (e) { } done(); }, 3000);
  force.unref();
  for (const w of wss.clients) try { w.close(1001, 'servidor encerrando'); } catch (e) { }
  wss.close(() => server.close(done));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(config.PORT, config.BIND_HOST, () => {
  const addr = server.address(), port = addr && typeof addr === 'object' ? addr.port : config.PORT;
  console.log('Skyke3D ' + (config.PROD ? 'em produção: ' + config.PUBLIC_URL : 'em desenvolvimento') + ' — escutando em ' + config.BIND_HOST + ':' + port);
  if (!config.PROD) console.log('Aberto para loopback, rede privada, CGNAT e *.ts.net. Defina PUBLIC_URL=https://seu-dominio para produção.');
  if (statusModule.STATUS_ON) console.log('Painel de status ativo em /status (acesso por token).');
  if (config.TURN_URLS.length && (config.TURN_SECRET || config.TURN_HAS_STATIC)) console.log('TURN configurado (' + (config.TURN_SECRET ? 'credenciais temporárias' : 'credenciais estáticas') + ').');
  if (config.HTTP_RATE === 0) console.warn('Limite HTTP por IP desativado (HTTP_RATE=0).');
});