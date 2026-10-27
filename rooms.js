/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Gerenciamento de salas: criação, destruição, fit, hostTransfer.
 */
'use strict';

const crypto = require('crypto');
const config = require('./config');
const { CODE_ALPHABET, cleanCfg, clampPos } = require('./validate');

const BN = ['Marina', 'Caio', 'Duda', 'Bruno', 'Lia', 'Theo', 'Nina', 'Davi', 'Bia'];
const BL = ['Opa, bem-vindo!', 'Esse lugar tá incrível ✨', 'Já provou o suco?', 'Alguém quer cantar no karaokê?', 'Que poção boa!'];

const rnd = n => Math.floor(Math.random() * n);
const rr = (a, b) => a + Math.random() * (b - a);
const code = () => [...crypto.randomBytes(10)].map(x => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');

function newBot(r, nid) {
  const used = new Set([...r.players.values()].map(p => p.name));
  const id = 'b' + nid++;
  const b = {
    id, bot: 1,
    name: BN.find(n => !used.has(n)) || 'Bot' + nid,
    cfg: cleanCfg({ skin: rnd(4), eye: rnd(4), shirt: rnd(20), hair: rnd(12), h2: rnd(12), hc: rnd(20), hs: rnd(24), fc: rnd(8), hat: rnd(3) ? 0 : 1 + rnd(5), bt: rnd(2), pc: rnd(20), sc: rnd(20), shoes: rnd(3) }),
    x: rr(-6, 6), z: rr(-2, 4), ry: 0, y: 0, s: 0, item: null, next: 0
  };
  b.tx = b.x; b.tz = b.z;
  r.players.set(id, b);
  return { bot: b, nextNid: nid };
}

function fit(r, MAX, bc, pub) {
  const humans = [...r.players.values()].filter(p => !p.bot);
  const target = Math.max(0, Math.min(r.want, MAX - humans.length));
  const bots = [...r.players.values()].filter(p => p.bot);

  while (bots.length > target) {
    const b = bots.pop();
    r.players.delete(b.id);
    bc(r, { t: 'pl', id: b.id });
  }
  while (bots.length < target) {
    const used = new Set([...r.players.values()].map(p => p.name));
    const id = 'b' + (++nid);
    const b = {
      id, bot: 1,
      name: BN.find(n => !used.has(n)) || 'Bot' + nid,
      cfg: cleanCfg({ skin: rnd(4), eye: rnd(4), shirt: rnd(20), hair: rnd(12), h2: rnd(12), hc: rnd(20), hs: rnd(24), fc: rnd(8), hat: rnd(3) ? 0 : 1 + rnd(5), bt: rnd(2), pc: rnd(20), sc: rnd(20), shoes: rnd(3) }),
      x: rr(-6, 6), z: rr(-2, 4), ry: 0, y: 0, s: 0, item: null, next: 0
    };
    b.tx = b.x; b.tz = b.z;
    r.players.set(id, b);
    bots.push(b);
    bc(r, { t: 'pj', p: pub(b) });
  }
}

function hostTransfer(r, onlineHumans, bc) {
  const cur = r.host && r.players.get(r.host);
  if (cur && !cur.bot && cur.online && cur.ws) return;
  const h = onlineHumans(r)[0];
  if (h) {
    if (r.host !== h.id) { r.host = h.id; bc(r, { t: 'host', id: h.id }); }
  } else if (r.host) {
    r.host = null;
    bc(r, { t: 'host', id: null });
  }
}

function destroyRoom(r, rooms) {
  for (const p of r.players.values()) if (p.retire) { clearTimeout(p.retire); p.retire = null; }
  r.players.clear(); r.kar = []; r.vid = null; r.vs = null; rooms.delete(r.code);
}

function createRoom({ style, bots, rooms, code, bc, pub, addHuman, ws, ip, name, cfg, nid }) {
  if (rooms.size >= config.MAXROOMS) return { error: 'Servidor cheio (limite de ' + config.MAXROOMS + ' salas).' };
  let c;
  do c = code(); while (rooms.has(c));
  const room = { code: c, style, host: null, kar: [], karEnd: 0, karHead: null, karTurn: 0, karAt: 0, kdur: false, kcap: false, vid: null, vs: null, players: new Map(), want: bots, inviteAt: 0 };
  rooms.set(c, room);
  const p = addHuman(room, ws, ip, name, cfg);
  return { room, player: p };
}

function joinRoom({ code, rooms, MAX, bc, pub, addHuman, ws, ip, name, cfg }) {
  const room = rooms.get(code);
  if (!room) return { error: 'Sala não encontrada. Confira o código.' };
  if ([...room.players.values()].filter(p => !p.bot).length >= MAX) return { error: 'Sala lotada (limite de ' + MAX + ' pessoas).' };
  const p = addHuman(room, ws, ip, name, cfg);
  return { room, player: p };
}

module.exports = { newBot, fit, hostTransfer, destroyRoom, createRoom, joinRoom, code };