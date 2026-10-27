/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Lógica do karaokê: fila, rotação, convites, timing.
 */
'use strict';

const config = require('./config');

const KINVITE_MS = 15000;

function kq(r) { return r.kar.map(k => ({ id: k.id, name: (r.players.get(k.id) || {}).name || '?', vid: k.vid })); }
function kmem(r, id) { return r.kar.some(k => k.id === id); }
function kcap(r) { return (r.karAt || Date.now()) + config.KMAX; }

function kstart(r) { const h = r.kar[0]; r.karEnd = Date.now() + (h && h.vid ? config.KDEF : 120000); r.karAt = Date.now(); r.kdur = false; r.kcap = !!(h && h.vid); r.karTurn++; }

function kbc(r, bc) { const h = r.kar[0] && r.kar[0].id; if (h !== r.karHead) { r.karHead = h; if (h) kstart(r); } bc(r, { t: 'kar', q: kq(r), left: Math.max(0, r.karEnd - Date.now()), turn: r.karTurn }); }

function krot(r, bc) { if (!r.kar.length) return; const f = r.kar.shift(); f.vid = null; r.kar.push(f); if (r.kar.some(k => k.vid)) { let n = r.kar.length; while (!r.kar[0].vid && n-- > 0) r.kar.push(r.kar.shift()); } r.karHead = r.kar[0].id; kstart(r); kbc(r, bc); }

function kinvite(r, from, KINVITE_MS) { const now = Date.now(); if (now - (r.inviteAt || 0) < KINVITE_MS) return; r.inviteAt = now; for (const p of r.players.values()) if (!p.bot && p.ready && p.online && p.ws && p.id !== from.id && !kmem(r, p.id)) send(p.ws, { t: 'kinv', name: from.name }); }

function dropKaraoke(r, id, bc) { if (kmem(r, id)) { r.kar = r.kar.filter(k => k.id !== id); kbc(r, bc); } }

module.exports = { kq, kmem, kcap, kstart, kbc, krot, kinvite, dropKaraoke, KINVITE_MS };