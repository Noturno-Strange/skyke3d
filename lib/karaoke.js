/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Karaokê da sala: fila (o primeiro canta), tempo de cada vez, convite e sincronização do vídeo do cantor.
 * O servidor passa as funções de envio e os limites; aqui não há estado próprio, tudo fica na sala (lib/room.js).
 */
'use strict';

/** @typedef {import('./room').Room} Room */
/** @typedef {import('./room').Player} Player */
/** @typedef {{ ws: import('ws').WebSocket, me: Player, room: Room }} Ctx */

/**
 * @param {{
 *   bc: (r: Room, m: Object, except?: any) => void,
 *   send: (ws: any, m: Object) => void,
 *   maxQueue: () => number,
 *   syncAt: (ts: any) => number,
 *   KDEF: number, KEXTRA: number, KMAX: number, KINVITE_MS: number
 * }} o
 */
function createKaraoke({ bc, send, maxQueue, syncAt, KDEF, KEXTRA, KMAX, KINVITE_MS }) {
  /** fila como o cliente vê */
  const kq = r => r.kar.map(k => ({ id: k.id, name: (r.players.get(k.id) || {}).name || '?', vid: k.vid }));
  /** está na fila? */
  const kmem = (r, id) => r.kar.some(k => k.id === id);
  /** teto da vez atual (13 min) */
  const kcap = r => (r.karAt || Date.now()) + KMAX;
  /** @param {Room} r */
  const listening = (r, p) => !p.bot && p.ready && p.online && p.ws && kmem(r, p.id);

  /** começa a vez de quem está na frente da fila */
  function kstart(r) {
    r.ks = null;
    const h = r.kar[0];
    r.karEnd = Date.now() + (h && h.vid ? KDEF : 120000);
    r.karAt = Date.now();
    r.kdur = false;
    r.kcap = !!(h && h.vid);
    r.karTurn++;
  }
  /** avisa a sala da fila (e começa a vez se a frente mudou) */
  function kbc(r) {
    const h = r.kar[0] && r.kar[0].id;
    if (h !== r.karHead) {
      r.karHead = h;
      if (h) kstart(r);
    }
    bc(r, { t: 'kar', q: kq(r), left: Math.max(0, r.karEnd - Date.now()), turn: r.karTurn });
  }
  /** passa a vez: o cantor vai para o fim e a frente passa para o próximo com música escolhida */
  function krot(r) {
    if (!r.kar.length) return;
    const f = r.kar.shift();
    f.vid = null;
    r.kar.push(f);
    if (r.kar.some(k => k.vid)) {
      let n = r.kar.length;
      while (!r.kar[0].vid && n-- > 0) r.kar.push(r.kar.shift());
    }
    r.karHead = r.kar[0].id;
    kstart(r);
    kbc(r);
  }
  /** convida quem está na sala e fora da fila (no máximo a cada KINVITE_MS) */
  function kinvite(r, from) {
    const now = Date.now();
    if (now - (r.inviteAt || 0) < KINVITE_MS) return;
    r.inviteAt = now;
    for (const p of r.players.values())
      if (!p.bot && p.ready && p.online && p.ws && p.id !== from.id && !kmem(r, p.id))
        send(p.ws, { t: 'kinv', name: from.name, by: from.id });
  }
  /** tira o jogador da fila */
  function drop(r, id) {
    if (kmem(r, id)) {
      r.kar = r.kar.filter(k => k.id !== id);
      kbc(r);
    }
  }
  /** chamado a cada passo do servidor: fim do tempo passa a vez */
  function tick(r, now) {
    if (r.kar.length && now >= r.karEnd) {
      bc(r, {
        t: 'chat',
        name: '🎶 Karaokê',
        text: r.kcap ? '⏱ Limite de 13 min do karaokê atingido! Próximo cantor.' : 'Fim da música! Próximo cantor.'
      });
      krot(r);
    }
  }
  /** o que quem entra na sala precisa saber */
  function greet(ws, r) {
    if (r.kar.length) send(ws, { t: 'kinv', name: (r.players.get(r.kar[0].id) || {}).name || 'Alguém' });
  }
  const singing = (r, me) => r.kar.length > 0 && r.kar[0].id === me.id;

  /** @type {Record<string, (c: Ctx, m: any) => void>} */
  const handlers = {
    kjoin({ ws, me, room }, m) {
      if (kmem(room, me.id) || room.kar.length >= maxQueue()) return;
      const was = !room.kar.length;
      room.kar.push({ id: me.id, vid: m.vid });
      kbc(room);
      if (was) kinvite(room, me);
      else if (room.ks) send(ws, room.ks);
    },
    ksong({ me, room }, m) {
      const k = room.kar.find(x => x.id === me.id);
      if (!k) return;
      const hd = room.kar[0] === k;
      if (hd && k.vid) return;
      k.vid = m.vid;
      if (hd) kstart(room);
      kbc(room);
    },
    kleave({ me, room }) {
      drop(room, me.id);
    },
    kpass({ me, room }) {
      if (singing(room, me)) krot(room);
    },
    kdur({ me, room }, m) {
      if (!singing(room, me) || room.kdur) return;
      room.kdur = true;
      const cap = kcap(room),
        end = Date.now() + m.d * 1000 + KEXTRA;
      room.karEnd = Math.min(end, cap);
      room.kcap = end >= cap;
      kbc(room);
    },
    kend({ me, room }) {
      if (singing(room, me) && Date.now() - room.karAt > 10000) krot(room);
    },
    ksync({ me, room }, m) {
      if (!singing(room, me)) return;
      const o = { t: 'ksync', time: m.time, playing: m.playing, at: syncAt(m.ts) };
      room.ks = o;
      for (const p of room.players.values()) if (p !== me && listening(room, p)) send(p.ws, o);
    }
  };

  return { kq, kmem, kbc, krot, drop, tick, greet, handlers };
}

module.exports = { createKaraoke };
