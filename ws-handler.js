/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * WebSocket handler: connection, message routing, rate limits per connection.
 */
'use strict';

const config = require('./config');
const { normalizeMessage } = require('./validate');
const { kq, kmem, kstart, kbc, krot, kinvite, dropKaraoke, KINVITE_MS } = require('./karaoke');
const { stopVideo, handleVideo, handleVSync, handleVStop, handleVJoin } = require('./video');
const { createRateLimiter, over, blocked, conns, MAX_BUFFERED } = require('./rate-limit');
const { logError } = require('./cleanup'); // will be defined in cleanup.js

const pub = p => ({ id: p.id, name: p.name, cfg: p.cfg, x: p.x, z: p.z, ry: p.ry, y: p.y || 0, s: p.s || 0, bot: !!p.bot, item: p.item, talk: !!p.talk });
const humans = r => [...r.players.values()].filter(p => !p.bot);
const onlineHumans = r => [...r.players.values()].filter(p => !p.bot && p.online && p.ws);
const send = (w, m) => { if (!w || w.readyState !== 1) return; if (w.bufferedAmount > MAX_BUFFERED) { try { w.terminate(); } catch (e) { } return; } try { w.send(JSON.stringify(m)); } catch (e) { try { w.terminate(); } catch (x) { } } };
const bc = (r, m, ex) => { for (const p of r.players.values()) if (!p.bot && p.ready && p.online && p.ws && p.ws !== ex) send(p.ws, m); };

function createWsHandler({ rooms, wss, iceConfig, addHuman, resumeSession, dropPlayer, markOffline, fit, hostTransfer, destroyRoom, joinPayload, newToken, send, bc, pub, humans, onlineHumans }) {
  return function (ws, req) {
    const ip = config.rateKey(config.ipOf(req));
    conns.set(ip, (conns.get(ip) || 0) + 1);
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => { });

    let me = null, room = null, n = 0, sigN = 0;
    const { rl, lt, lastTxt, lastAt, lastWarn, badHits, defer, rate, waitFor, trail, violation, clear: clearRateLimit } = createRateLimiter();

    const iv = setInterval(() => { n = 0; sigN = 0; }, 1000);
    const jt = setTimeout(() => { if (!me) ws.close(); }, 15000);

    const closePolicy = text => { try { send(ws, { t: 'sys', text }); } catch (e) { }; try { ws.close(1008, 'policy'); } catch (e) { } };

    ws.on('message', raw => {
      try {
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { if (++n > 150) closePolicy('Muitas mensagens. A conexão foi encerrada.'); else violation(); return; }
        const isSig = !!msg && msg.t === 'sig';
        if (isSig) { if (++sigN > 120) return; }
        else if (++n > 150) { closePolicy('Muitas mensagens. A conexão foi encerrada.'); return; }

        const m = normalizeMessage(msg);
        if (!m) {
          violation();
          if (!me && msg && msg.t === 'join') send(ws, { t: 'err', msg: 'Não foi possível entrar: confira o código da sala e os dados do avatar.' });
          else if (!me && msg && msg.t === 'resume') {
            send(ws, { t: 'err', scope: 'resume', msg: 'Sessão expirada ou inválida. Entre novamente com o código da sala.' });
            try { ws.close(1000, 'resume'); } catch (e) { }
          }
          return;
        }

        if (!rate(m.t)) {
          if (m.t === 'sig') return;
          if (require('./rate-limit').TRAIL.has(m.t) && !(m.t === 'item' && m.use)) { trail(m); return; }
          if (require('./rate-limit').SOFT.has(m.t)) return;
          if (m.t === 'chat' && Date.now() - lastWarn > 5000) { lastWarn = Date.now(); send(ws, { t: 'sys', text: '⏳ Calma! Aguarde um instante entre mensagens.' }); }
          violation(); return;
        }

        if (!me) {
          if (m.t === 'create') {
            if (over(ip, 'cr', 5, 60000)) return send(ws, { t: 'err', msg: 'Muitas salas criadas. Aguarde um minuto.' });
            if (rooms.size >= config.MAXROOMS) return send(ws, { t: 'err', msg: 'Servidor cheio (limite de ' + config.MAXROOMS + ' salas).' });
            let c; do c = require('./rooms').code(); while (rooms.has(c));
            room = { code: c, style: m.style, host: null, kar: [], karEnd: 0, karHead: null, karTurn: 0, karAt: 0, kdur: false, kcap: false, vid: null, vs: null, players: new Map(), want: m.bots, inviteAt: 0 };
            rooms.set(c, room);
            me = addHuman({ room, ws, ip, name: m.name, cfg: m.cfg });
            clearTimeout(jt); return;
          }
          if (m.t === 'join') {
            if (over(ip, 'jn', 15, 60000)) return send(ws, { t: 'err', msg: 'Muitas tentativas. Aguarde um minuto.' });
            if (blocked(ip, 'jf', 8, 600000)) return send(ws, { t: 'err', msg: 'Muitas tentativas incorretas. Aguarde 10 minutos.' });
            room = rooms.get(m.code);
            if (!room) { over(ip, 'jf', 999, 600000); return send(ws, { t: 'err', msg: 'Sala não encontrada. Confira o código.' }); }
            if (humans(room).length >= config.MAX) return send(ws, { t: 'err', msg: 'Sala lotada (limite de ' + config.MAX + ' pessoas).' });
            me = addHuman({ room, ws, ip, name: m.name, cfg: m.cfg });
            clearTimeout(jt); return;
          }
          if (m.t === 'resume') {
            if (over(ip, 'rs', 60, 60000)) { send(ws, { t: 'err', scope: 'resume', msg: 'Muitas tentativas de reconexão. Aguarde um minuto.' }); try { ws.close(1000, 'resume'); } catch (e) { }; return; }
            room = rooms.get(m.code);
            if (!room) { send(ws, { t: 'err', scope: 'resume', msg: 'Sessão expirada ou inválida. Entre novamente com o código da sala.' }); try { ws.close(1000, 'resume'); } catch (e) { }; return; }
            const result = resumeSession({ room, ws, ip, m });
            if (result.player) { me = result.player; clearTimeout(jt); }
            return;
          }
          return;
        }

        switch (m.t) {
          case 'leave': { const p = me, r = room; me = null; room = null; dropPlayer({ r, p }); try { ws.close(4000, 'leave'); } catch (e) { }; break; }
          case 'move': me.x = m.x; me.z = m.z; me.ry = m.ry; me.y = m.y; me.s = m.s; break;
          case 'cfg': me.cfg = m.cfg; bc(room, { t: 'cfg', id: me.id, cfg: me.cfg }, ws); break;
          case 'chat': { const now = Date.now(); if (m.text === lastTxt && now - lastAt < 5000) break; lastTxt = m.text; lastAt = now; bc(room, { t: 'chat', name: me.name, text: m.text }); break; }
          case 'item': { if (m.use) { if (!m.item || me.item !== m.item) break; bc(room, { t: 'item', id: me.id, item: me.item, use: 1 }); if (require('./validate').FOOD.has(me.item)) me.item = null; break; } me.item = m.item; bc(room, { t: 'item', id: me.id, item: me.item, use: 0 }); break; }
          case 'gest': { if (m.g === 'scream' || m.g === 'fart') { const now = Date.now(); lt.sl = (lt.sl || []).filter(x => now - x < 60000); if (now - (lt.snd || 0) < 5000 || lt.sl.length >= 6) { send(ws, { t: 'sys', text: '⏳ Gestos com som têm limite para evitar spam.' }); break; } lt.snd = now; lt.sl.push(now); } bc(room, { t: 'gest', id: me.id, g: m.g }, ws); break; }
          case 'emo': bc(room, { t: 'emo', id: me.id, i: m.i }, ws); break;
          case 'speak': { const v = m.v; if (v === !!me.talk) break; me.talk = v; bc(room, { t: 'speak', id: me.id, v }, ws); break; }
          case 'ice': send(ws, { t: 'ice', ice: iceConfig() }); break;
          case 'bots': if (room.host !== me.id) break; room.want = m.n; fit(room); bc(room, { t: 'bots', want: room.want }); break;
          case 'sig': { const to = room.players.get(m.to); if (!to || to.bot || to === me || !to.online || !to.ws) break; send(to.ws, { t: 'sig', from: me.id, data: m.data }); break; }
          case 'video': handleVideo({ room, m, me, bc, send, ws }); break;
          case 'vsync': handleVSync({ room, m, me, bc, ws }); break;
          case 'vstop': handleVStop({ room, m, me, bc, ws }); break;
          case 'vjoin': handleVJoin({ room, m, send, ws }); break;
          case 'kjoin': { if (kmem(room, me.id) || room.kar.length >= config.MAX) break; const was = !room.kar.length; room.kar.push({ id: me.id, vid: m.vid }); kbc(room, bc); if (was) kinvite(room, me); break; }
          case 'ksong': { const k = room.kar.find(x => x.id === me.id); if (!k) break; const hd = room.kar[0] === k; if (hd && k.vid) break; k.vid = m.vid; if (hd) kstart(room); kbc(room, bc); break; }
          case 'kleave': dropKaraoke(room, me.id, bc); break;
          case 'kpass': if (room.kar.length && room.kar[0].id === me.id) krot(room, bc); break;
          case 'kdur': if (room.kar[0] && room.kar[0].id === me.id && !room.kdur) { room.kdur = true; const cap = require('./karaoke').kcap(room), end = Date.now() + m.d * 1000 + config.KEXTRA; room.karEnd = Math.min(end, cap); room.kcap = end >= cap; kbc(room, bc); } break;
          case 'kend': if (room.kar[0] && room.kar[0].id === me.id && Date.now() - room.karAt > 10000) krot(room, bc); break;
          case 'ksync': if (room.kar[0] && room.kar[0].id === me.id) { const o = { t: 'ksync', time: m.time, playing: m.playing }; for (const p of room.players.values()) if (!p.bot && p.ready && p.online && p.ws && p !== me && kmem(room, p.id)) send(p.ws, o); } break;
        }
      } catch (e) { logError('mensagem', e); }
    });

    ws.on('close', code => {
      try {
        clearInterval(iv);
        clearTimeout(jt);
        clearRateLimit();
        const c = (conns.get(ip) || 1) - 1;
        if (c > 0) conns.set(ip, c); else conns.delete(ip);
        if (!me) return;
        const p = me; me = null;
        if (code === 4000 || code === 1008 || code === 1009) dropPlayer({ r: room, p }); else markOffline({ r: room, p });
      } catch (e) { logError('close', e); }
    });
  };
}

module.exports = { createWsHandler, send, bc, pub, humans, onlineHumans };