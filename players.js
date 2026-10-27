/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Ciclo de vida dos jogadores: addHuman, resumeSession, markOffline, dropPlayer.
 */
'use strict';

const crypto = require('crypto');
const config = require('./config');
const { cleanCfg, tokenEq } = require('./validate');

function newToken() { return crypto.randomBytes(32).toString('base64url'); }

function addHuman({ room, ws, ip, name, cfg, bc, pub, joinPayload, iceConfig, nid }) {
  const p = { id: 'p' + nid++, ip, name, cfg, room, x: 0, z: 5, ry: 0, y: 0, s: 0, item: null, talk: false, ws, ready: false, online: true, retire: null, token: newToken() };
  room.players.set(p.id, p);
  if (!room.host) { room.host = p.id; bc(room, { t: 'host', id: p.id }); }
  fit(room);
  send(ws, joinPayload(room, p, false));
  if (room.vid) send(ws, { t: 'vinv', vid: room.vid.vid, name: room.vid.name });
  if (room.kar.length) send(ws, { t: 'kinv', name: (room.players.get(room.kar[0].id) || {}).name || 'Alguém' });
  bc(room, { t: 'pj', p: pub(p) });
  p.ready = true;
  return p;
}

function resumeSession({ room, ws, ip, m, bc, pub, joinPayload, iceConfig, onlineHumans, hostTransfer, kq }) {
  let p = null;
  for (const q of room.players.values()) if (!q.bot && q.token && tokenEq(q.token, m.token)) { p = q; break }
  if (!p) return { error: 'Sessão expirada ou inválida. Entre novamente com o código da sala.', close: true };
  if (p.online || p.ws) return { error: 'Sua sessão ainda está ativa. Tentando novamente…', retry: true, close: true };
  if (p.retire) { clearTimeout(p.retire); p.retire = null; }
  p.ws = ws; p.online = true; p.ready = false; p.ip = ip; p.token = newToken();
  if (!room.host) { room.host = p.id; bc(room, { t: 'host', id: p.id }); }
  send(ws, joinPayload(room, p, true));
  if (room.vid) send(ws, { t: 'vinv', vid: room.vid.vid, name: room.vid.name });
  if (room.kar.length) send(ws, { t: 'kinv', name: (room.players.get(room.kar[0].id) || {}).name || 'Alguém' });
  p.ready = true;
  return { player: p };
}

function markOffline({ r, p, RECONNECT_MS, dropPlayer, stopVideo, dropKaraoke, bc, hostTransfer }) {
  p.online = false; p.ready = false; p.ws = null;
  if (p.retire) clearTimeout(p.retire);
  p.retire = setTimeout(() => { p.retire = null; if (!p.online) dropPlayer(r, p); }, RECONNECT_MS);
  if (p.retire.unref) p.retire.unref();
  stopVideo(r, p.id);
  dropKaraoke(r, p.id);
  if (p.talk) { p.talk = false; bc(r, { t: 'speak', id: p.id, v: false }); }
  if (r.host === p.id) hostTransfer(r);
}

function dropPlayer({ r, p, bc, stopVideo, dropKaraoke, fit, destroyRoom, humans }) {
  if (!r.players.has(p.id)) return;
  if (p.retire) { clearTimeout(p.retire); p.retire = null; }
  p.online = false; p.ready = false; p.ws = null;
  stopVideo(r, p.id);
  dropKaraoke(r, p.id);
  if (p.talk) { p.talk = false; bc(r, { t: 'speak', id: p.id, v: false }); }
  r.players.delete(p.id);
  if (r.host === p.id) { r.host = null; hostTransfer(r); }
  bc(r, { t: 'pl', id: p.id });
  fit(r);
  if (!humans(r).length) destroyRoom(r);
}

module.exports = { newToken, addHuman, resumeSession, markOffline, dropPlayer };