/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Vídeos da sala: cada jogador pode ter o seu (até MAX_VIDS por sala), os outros aceitam o convite e assistem
 * sincronizados com o dono. Quem iniciou manda vsync a cada 2 s; depois que o vídeo termina, o dono tem
 * VIDEO_IDLE_MS para colocar outro antes de a sessão fechar.
 */
'use strict';

/** @typedef {import('./room').Room} Room */
/** @typedef {import('./room').Player} Player */
/** @typedef {import('./room').VideoSession} VideoSession */
/** @typedef {{ ws: import('ws').WebSocket, me: Player, room: Room }} Ctx */

/**
 * @param {{
 *   bc: (r: Room, m: Object, except?: any) => void,
 *   send: (ws: any, m: Object) => void,
 *   syncAt: (ts: any) => number,
 *   MAX_VIDS: number, VIDEO_IDLE_MS: number
 * }} o
 */
function createVideo({ bc, send, syncAt, MAX_VIDS, VIDEO_IDLE_MS }) {
  /** encerra o vídeo de `by` e avisa a sala */
  function dropVid(r, by, why, except) {
    const v = r.vids.get(by);
    if (!v) return false;
    clearTimeout(v.endT);
    r.vids.delete(by);
    bc(r, why ? { t: 'vstop', by, why } : { t: 'vstop', by }, except);
    return true;
  }
  /** o jogador saiu: deixa de assistir aos vídeos dos outros e o seu é encerrado */
  function leave(r, by) {
    for (const v of r.vids.values()) v.viewers.delete(by);
    dropVid(r, by);
  }
  /** a sala vai ser apagada */
  function clear(r) {
    r.vids.forEach(v => clearTimeout(v.endT));
    r.vids.clear();
  }
  /** convites dos vídeos tocando, para quem entra na sala */
  function greet(ws, r) {
    for (const v of r.vids.values()) if (!v.ended) send(ws, { t: 'vinv', vid: v.vid, name: v.name, by: v.by });
  }
  /** manda para quem assiste ao vídeo `v` */
  function toViewers(room, v, msg) {
    for (const id of v.viewers) {
      const p = room.players.get(id);
      if (p && p.ws) send(p.ws, msg);
    }
  }

  /** @type {Record<string, (c: Ctx, m: any) => void>} */
  const handlers = {
    video({ ws, me, room }, m) {
      const cur = room.vids.get(me.id),
        swap = !!cur;
      if (swap && cur.vid === m.vid && !cur.ended) return;
      if (swap) clearTimeout(cur.endT);
      if (!swap && room.vids.size >= MAX_VIDS) {
        send(ws, { t: 'vbusy' });
        return;
      }
      for (const v of room.vids.values()) v.viewers.delete(me.id);
      /** @type {VideoSession} */
      const sess = {
        vid: m.vid,
        by: me.id,
        name: me.name,
        vs: { time: 0, playing: true, at: Date.now() },
        viewers: swap ? cur.viewers : new Set()
      };
      room.vids.set(me.id, sess);
      const msg = { t: 'vinv', vid: m.vid, name: me.name, by: me.id, ...(swap ? { swap: 1 } : {}) };
      if (swap) bc(room, msg);
      else bc(room, msg, ws);
    },
    vsync({ me, room }, m) {
      const v = room.vids.get(me.id);
      if (!v || v.ended) return;
      const at = syncAt(m.ts);
      v.vs = { time: m.time, playing: m.playing, at };
      toViewers(room, v, { t: 'vsync', by: me.id, time: m.time, playing: m.playing, at });
    },
    vend({ me, room }) {
      const v = room.vids.get(me.id);
      if (!v || v.ended) return;
      v.ended = Date.now();
      clearTimeout(v.endT);
      const rm = room,
        by = me.id;
      v.endT = setTimeout(() => {
        if (rm.vids.get(by) === v) dropVid(rm, by, 'idle');
      }, VIDEO_IDLE_MS);
      if (v.endT.unref) v.endT.unref();
      toViewers(room, v, { t: 'vend', by, left: VIDEO_IDLE_MS });
    },
    vstop({ ws, me, room }, m) {
      const by = m.by || me.id,
        v = room.vids.get(by);
      if (v && (by === me.id || room.host === me.id)) dropVid(room, by, undefined, ws);
    },
    vjoin({ ws, me, room }, m) {
      const v = room.vids.get(m.by);
      if (!v || m.by === me.id) return;
      dropVid(room, me.id, undefined, ws); // quem aceita o vídeo de outro jogador deixa de controlar o próprio: ele passa a só assistir
      for (const o of room.vids.values()) o.viewers.delete(me.id);
      v.viewers.add(me.id);
      if (v.ended) {
        send(ws, { t: 'vend', by: v.by, left: Math.max(0, VIDEO_IDLE_MS - (Date.now() - v.ended)) });
        return;
      }
      send(ws, { t: 'vsync', by: v.by, time: v.vs.time, playing: v.vs.playing, at: v.vs.at });
    },
    vleave({ me, room }, m) {
      const v = room.vids.get(m.by);
      if (v) v.viewers.delete(me.id);
    }
  };

  return { dropVid, leave, clear, greet, handlers };
}

module.exports = { createVideo };
