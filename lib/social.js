'use strict';
/*
 * Amigos, convites e chat global. Nada vai para o disco: sem contas, sem lista de amigos no servidor.
 * - Cada aparelho tem uma chave secreta (43 caracteres); o id público de amigo é um hash dela (12 caracteres). Quem sabe
 *   o id não consegue se passar pela pessoa, e a lista de amigos fica só no navegador de cada um.
 * - Presença e convites só entre amigos mútuos (cada um tem o outro na lista): saber o id de alguém não revela nada.
 * - Pedido de amizade só para quem está na mesma sala ou falou no chat global nos últimos 10 minutos (não dá para
 *   sair mandando pedidos para ids aleatórios), no máximo um por par a cada 10 minutos; recusar não avisa ninguém.
 * - Chat global: só para quem está numa sala há pelo menos `minAge`, sem links, com filtro de palavrões, sem repetir
 *   a mesma frase e com um teto para o servidor inteiro (além do limite por pessoa em server.js).
 */
const crypto = require('crypto');

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
/** id público de amigo: 60 bits do SHA-256 da chave secreta, em base32 minúsculo */
function fidOf(key) {
  const h = crypto
    .createHash('sha256')
    .update('skyke3d/amigo|' + key)
    .digest();
  let out = '';
  for (let i = 0, acc = 0, bits = 0; out.length < 12; ) {
    if (bits < 5) {
      acc = (acc << 8) | h[i++];
      bits += 8;
    }
    out += B32[(acc >> (bits - 5)) & 31];
    bits -= 5;
  }
  return out;
}

const TEN_MIN = 600000;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|br|io|gg|me|xyz|ly|tv|app|site|link)(?:\/\S*)?/gi;

/**
 * @param {{ send: (ws: any, m: any) => void, censor: (s: string) => string, now?: () => number,
 *   minAge?: number, cap?: number, histMax?: number }} o
 */
function createSocial({ send, censor, now = Date.now, minAge = 20000, cap = 30, histMax = 25 }) {
  /** @type {Map<string, any>} id → conexão (a mais recente, se a mesma chave abrir em duas abas) */
  const online = new Map();
  const asked = new Map(); // 'de>para' → quando pediu amizade
  const invited = new Map(); // 'de>para' → quando convidou
  const spoke = new Map(); // id → última fala no chat global
  const hist = [];
  let shown = -1; // última contagem de pessoas online enviada
  let burst = [];

  const active = c => !!(c && c.me && c.room && c.fid && online.get(c.fid) === c);
  const mutual = (a, b) => a.watch.has(b.fid) && b.watch.has(a.fid);
  const pres = (to, c, on) =>
    send(to.ws, on ? { t: 'fpres', id: c.fid, on: 1, name: c.me.name } : { t: 'fpres', id: c.fid, on: 0 });
  const fresh = (map, key, ms) => (map.get(key) || 0) > now() - ms;
  function prune() {
    const old = now() - TEN_MIN;
    for (const m of [asked, invited, spoke]) if (m.size > 500) for (const [k, t] of m) if (t < old) m.delete(k);
  }

  /** entra (ou atualiza a lista de amigos): devolve o id público */
  function join(c, key, ids) {
    const fid = fidOf(key);
    if (c.fid && c.fid !== fid) leave(c);
    const was = c.watch || new Set();
    c.fid = fid;
    c.watch = new Set(ids.filter(x => x !== fid));
    const prev = online.get(fid);
    if (prev && prev !== c) prev.fid = '';
    online.set(fid, c);
    send(c.ws, { t: 'fme', id: fid });
    for (const id of new Set([...was, ...c.watch])) {
      const o = online.get(id);
      if (!o || !o.watch) continue;
      const m = mutual(c, o);
      pres(c, o, m);
      if (o.watch.has(fid)) pres(o, c, m);
    }
    return fid;
  }
  /** saiu da sala ou caiu: some para os amigos */
  function leave(c) {
    if (c.fid && online.get(c.fid) === c) {
      online.delete(c.fid);
      for (const id of c.watch) {
        const o = online.get(id);
        if (o && o.watch.has(c.fid)) pres(o, c, 0);
      }
    }
    c.fid = '';
    c.watch = new Set();
    c.gOn = false;
  }

  function request(c, to) {
    const t = online.get(to);
    if (!active(c) || !active(t) || t === c || mutual(c, t)) return;
    if (t.room !== c.room && !fresh(spoke, to, TEN_MIN))
      return send(c.ws, { t: 'sys', text: 'Essa pessoa não está mais por perto para receber o pedido.' });
    const k = c.fid + '>' + to;
    if (fresh(asked, k, TEN_MIN)) return;
    asked.set(k, now());
    prune();
    send(t.ws, { t: 'freq', id: c.fid, name: c.me.name });
  }
  function accept(c, from) {
    const k = from + '>' + c.fid,
      f = online.get(from);
    if (!active(c) || !fresh(asked, k, TEN_MIN)) return;
    asked.delete(k);
    if (active(f)) send(f.ws, { t: 'facc', id: c.fid, name: c.me.name });
  }
  function invite(c, to) {
    const t = online.get(to),
      k = c.fid + '>' + to;
    if (!active(c) || !active(t) || !mutual(c, t) || t.room === c.room || fresh(invited, k, 30000)) return;
    invited.set(k, now());
    prune();
    send(t.ws, { t: 'finv', id: c.fid, name: c.me.name, code: c.room.code });
  }

  function subscribe(c, on) {
    if (!active(c)) return;
    c.gOn = on;
    if (on) {
      send(c.ws, { t: 'ghist', list: hist });
      send(c.ws, { t: 'gn', n: online.size });
    }
  }
  function say(c, text) {
    if (!active(c)) return;
    const n = now();
    if (n - (c.since || 0) < minAge)
      return send(c.ws, { t: 'sys', text: '⏳ Fique um pouquinho na sala antes de falar no chat global.' });
    if (text === c.gLast && n - (c.gLastAt || 0) < 60000) return;
    burst = burst.filter(x => n - x < 10000);
    if (burst.length >= cap)
      return send(c.ws, {
        t: 'sys',
        text: '⏳ O chat global está muito movimentado. Tente de novo em alguns segundos.'
      });
    const clean = censor(text.replace(LINK, '🔗')).trim();
    if (!clean || clean === '🔗') return;
    c.gLast = text;
    c.gLastAt = n;
    burst.push(n);
    spoke.set(c.fid, n);
    prune();
    const m = { t: 'gchat', id: c.fid, name: c.me.name, text: clean, at: n };
    hist.push(m);
    if (hist.length > histMax) hist.shift();
    for (const o of online.values()) if (o.gOn && active(o)) send(o.ws, m);
  }

  /** a cada poucos segundos (server.js): manda o total de pessoas online, só quando mudou */
  function tick() {
    if (online.size === shown) return;
    shown = online.size;
    for (const o of online.values()) if (o.gOn && active(o)) send(o.ws, { t: 'gn', n: shown });
  }

  return {
    tick,
    join,
    leave,
    request,
    accept,
    invite,
    subscribe,
    say,
    get size() {
      return online.size;
    }
  };
}

module.exports = { createSocial, fidOf };
