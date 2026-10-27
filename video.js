/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Lógica de vídeo da sala: iniciar, parar, sync, join.
 */
'use strict';

function stopVideo(r, by, bc) {
  if (r.vid && r.vid.by === by) { r.vid = null; r.vs = null; bc(r, { t: 'vstop' }); }
}

function handleVideo({ room, m, me, bc, send }) {
  if (room.vid && room.vid.by !== me.id) { send(ws, { t: 'vbusy' }); return false; }
  const swap = !!(room.vid && room.vid.by === me.id);
  if (swap && room.vid.vid === m.vid) return false;
  room.vid = { vid: m.vid, by: me.id, name: me.name };
  room.vs = { time: 0, playing: true, at: Date.now() };
  const msg = { t: 'vinv', vid: room.vid.vid, name: me.name, ...(swap ? { swap: 1 } : {}) };
  if (swap) bc(room, msg); else bc(room, msg, ws);
  return true;
}

function handleVSync({ room, m, me, bc }) {
  if (room.vid && room.vid.by === me.id) { room.vs = { time: m.time, playing: m.playing, at: Date.now() }; bc(room, { t: 'vsync', time: m.time, playing: m.playing }, ws); }
}

function handleVStop({ room, m, me, bc }) {
  if (room.vid && (room.vid.by === me.id || room.host === me.id)) { room.vid = null; room.vs = null; bc(room, { t: 'vstop' }, ws); }
}

function handleVJoin({ room, m, send }) {
  if (room.vid && room.vs) {
    const e = room.vs.playing ? (Date.now() - room.vs.at) / 1000 : 0;
    send(ws, { t: 'vsync', time: Math.max(0, Math.min(config.MAX_VIDEO_TIME, room.vs.time + e)), playing: room.vs.playing });
  }
}

module.exports = { stopVideo, handleVideo, handleVSync, handleVStop, handleVJoin };