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
 * @param {{ send: (ws: any, m: any) => void, sendRaw?: (ws: any, s: string) => void, censor: (s: string) => string, now?: () => number,
 *   minAge?: number, cap?: number, histMax?: number }} o
 */
function createSocial({
  send,
  sendRaw = (ws, s) => send(ws, JSON.parse(s)),
  censor,
  now = Date.now,
  minAge = 20000,
  cap = 30,
  histMax = 25
}) {
  /** @type {Map<string, Set<any>>} id → conexões (a mesma chave pode estar em várias abas do mesmo navegador) */
  const online = new Map();
  const asked = new Map(); // 'de>para' → quando pediu amizade
  const invited = new Map(); // 'de>para' → quando convidou
  const spoke = new Map(); // id → última fala no chat global
  const hist = [];
  let shown = -1; // última contagem de pessoas online enviada
  let people = 0; // conexões com chave (cada aba conta como uma pessoa na sala)
  let burst = [];

  const tabs = id => online.get(id) || new Set();
  const active = c => !!(c && c.me && c.room && c.fid && tabs(c.fid).has(c));
  const one = id => tabs(id).values().next().value; // qualquer aba da pessoa: todas têm a mesma lista de amigos
  const mutual = (a, b) => !!(a && b && a.watch.has(b.fid) && b.watch.has(a.fid));
  const toAll = (id, m) => tabs(id).forEach(o => send(o.ws, m));
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
    if (!online.has(fid)) online.set(fid, new Set());
    const set = tabs(fid);
    if (!set.has(c)) people++;
    set.add(c);
    send(c.ws, { t: 'fme', id: fid });
    for (const id of new Set([...was, ...c.watch])) {
      const o = one(id);
      if (!o) continue;
      const m = mutual(c, o);
      pres(c, o, m);
      if (o.watch.has(fid)) tabs(id).forEach(x => pres(x, c, m));
    }
    return fid;
  }
  /** saiu da sala ou caiu: some para os amigos quando fecha a última aba */
  function leave(c) {
    const set = c.fid ? online.get(c.fid) : null;
    if (set && set.delete(c)) {
      people--;
      if (!set.size) {
        online.delete(c.fid);
        for (const id of c.watch) tabs(id).forEach(o => o.watch.has(c.fid) && pres(o, c, 0));
      }
    }
    c.fid = '';
    c.watch = new Set();
    c.gOn = false;
  }

  function request(c, to) {
    const t = one(to);
    if (!active(c) || !t || to === c.fid || mutual(c, t)) return;
    const near = [...tabs(to)].some(o => o.room === c.room);
    if (!near && !fresh(spoke, to, TEN_MIN))
      return send(c.ws, { t: 'sys', text: 'Essa pessoa não está mais por perto para receber o pedido.' });
    const k = c.fid + '>' + to;
    if (fresh(asked, k, TEN_MIN)) return;
    asked.set(k, now());
    prune();
    toAll(to, { t: 'freq', id: c.fid, name: c.me.name });
  }
  function accept(c, from) {
    const k = from + '>' + c.fid;
    if (!active(c) || !fresh(asked, k, TEN_MIN)) return;
    asked.delete(k);
    toAll(from, { t: 'facc', id: c.fid, name: c.me.name });
  }
  function invite(c, to) {
    const k = c.fid + '>' + to;
    if (!active(c) || !mutual(c, one(to)) || fresh(invited, k, 30000)) return;
    const away = [...tabs(to)].filter(o => o.room !== c.room);
    if (!away.length) return;
    invited.set(k, now());
    prune();
    const m = { t: 'finv', id: c.fid, name: c.me.name, code: c.room.code };
    away.forEach(o => send(o.ws, m));
  }

  const each = f => online.forEach(set => set.forEach(o => o.gOn && active(o) && f(o)));
  function subscribe(c, on) {
    if (!active(c)) return;
    c.gOn = on;
    if (on) {
      send(c.ws, { t: 'ghist', list: hist });
      send(c.ws, { t: 'gn', n: people });
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
    const str = JSON.stringify(m); // serializa uma vez para todos
    each(o => sendRaw(o.ws, str));
  }

  /** a cada poucos segundos (server.js): manda o total de pessoas online, só quando mudou */
  function tick() {
    if (people === shown) return;
    shown = people;
    each(o => send(o.ws, { t: 'gn', n: shown }));
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
      return people;
    }
  };
}

module.exports = { createSocial, fidOf };
