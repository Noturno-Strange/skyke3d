'use strict';
/*
 * Amigos, convites e chat global. Nada vai para o disco: sem contas, sem lista de amigos no servidor.
 * - Cada aparelho tem uma chave secreta (43 caracteres); o id público de amigo é um hash dela (12 caracteres). Quem sabe
 *   o id não consegue se passar pela pessoa, e a lista de amigos fica só no navegador de cada um.
 * - O id de amigo nunca aparece para estranhos: no chat global e na lista da sala cada conexão usa um apelido aleatório
 *   (`h`), novo a cada entrada, que não deixa reconhecer a pessoa de uma sessão para outra. O id só é revelado a quem a
 *   própria pessoa pede ou aceita amizade; amigos mútuos recebem os apelidos atuais junto com a presença.
 * - Presença e convites só entre amigos mútuos (cada um tem o outro na lista): saber o id de alguém não revela nada.
 * - Pedido de amizade só para quem está na mesma sala ou falou no chat global nos últimos 10 minutos (não dá para
 *   sair mandando pedidos para ids aleatórios), no máximo um por par a cada 10 minutos; recusar não avisa ninguém. A
 *   resposta para um pedido que não pode ser entregue é sempre a mesma, esteja a pessoa online ou não.
 * - Chat global: só para quem está numa sala há pelo menos `minAge`, sem links, com filtro de palavrões, sem repetir
 *   a mesma frase e com um teto para o servidor inteiro (além do limite por pessoa em server.js).
 */
const crypto = require('crypto');
const { B32, fidOf, ID_RE } = require('./ids');

const TEN_MIN = 600000;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|br|io|gg|me|xyz|ly|tv|app|site|link)(?:\/\S*)?/gi;

/**
 * @param {{ send: (ws: any, m: any) => void, sendRaw?: (ws: any, s: string) => void, censor: (s: string) => string, now?: () => number,
 *   minAge?: number, cap?: number }} o
 */
function createSocial({
  send,
  sendRaw = (ws, s) => send(ws, JSON.parse(s)),
  censor,
  now = Date.now,
  minAge = 20000,
  cap = 30,
  ipCap = 5
}) {
  /** @type {Map<string, Set<any>>} id → conexões (a mesma chave pode estar em várias abas do mesmo navegador) */
  const online = new Map();
  const asked = new Map(); // 'de>para' → quando pediu amizade
  const invited = new Map(); // 'de>para' → quando convidou
  const spoke = new Map(); // id → última fala no chat global
  const handles = new Map(); // apelido público da conexão → conexão
  let shown = -1; // última contagem de pessoas online enviada
  let people = 0; // conexões com chave (cada aba conta como uma pessoa na sala)
  let burst = [];
  const ipBurst = new Map(); // chave de IP → falas no chat global nos últimos 10 s (fatia de cada IP no teto `cap`)

  const tabs = id => online.get(id) || new Set();
  const active = c => !!(c && c.me && c.room && c.fid && tabs(c.fid).has(c));
  const one = id => tabs(id).values().next().value; // qualquer aba da pessoa: todas têm a mesma lista de amigos
  const mutual = (a, b) => !!(a && b && a.watch.has(b.fid) && b.watch.has(a.fid));
  const toAll = (id, m) => tabs(id).forEach(o => send(o.ws, m));
  /**
   * Presença de `c` para a conexão `to`. Só entre amigos mútuos: `to.shown` guarda de quem `to` já recebeu "online", e o
   * "offline" só vai para quem foi avisado do contrário. Assim, quem NÃO é amigo mútuo não recebe nada, nem "offline"
   * (antes, quem conhecia um id e o listava recebia `fpres on:0` se o dono estivesse online e silêncio se não estivesse:
   * dava para saber quem está online).
   */
  const pres = (to, c, on) => {
    const shown = to.shown || (to.shown = new Set());
    if (on) {
      shown.add(c.fid);
      send(to.ws, { t: 'fpres', id: c.fid, on: 1, name: c.me.name, hs: [...tabs(c.fid)].map(x => x.h) });
    } else if (shown.delete(c.fid)) send(to.ws, { t: 'fpres', id: c.fid, on: 0 });
  };
  function newHandle() {
    let h;
    do h = [...crypto.randomBytes(12)].map(x => B32[x & 31]).join('');
    while (handles.has(h));
    return h;
  }
  const fresh = (map, key, ms) => (map.get(key) || 0) > now() - ms;
  function prune() {
    const old = now() - TEN_MIN;
    for (const m of [asked, invited, spoke]) if (m.size > 500) for (const [k, t] of m) if (t < old) m.delete(k);
  }

  /** entra (ou atualiza a lista de amigos) com um id de identidade já resolvido */
  function joinFid(c, fid, ids) {
    if (typeof fid !== 'string' || !ID_RE.test(fid)) return '';
    if (c.fid && c.fid !== fid) leave(c);
    const was = c.watch || new Set();
    c.fid = fid;
    c.watch = new Set(ids.filter(x => x !== fid));
    if (!online.has(fid)) online.set(fid, new Set());
    const set = tabs(fid);
    if (!set.has(c)) people++;
    set.add(c);
    if (!c.h) handles.set((c.h = newHandle()), c);
    send(c.ws, { t: 'fme', id: fid, h: c.h });
    for (const id of new Set([...was, ...c.watch])) {
      const o = one(id);
      if (!o) continue;
      const m = mutual(c, o);
      pres(c, o, m);
      if (o.watch.has(fid)) tabs(id).forEach(x => pres(x, c, m));
    }
    return c.h;
  }
  /** entra (ou atualiza a lista de amigos): a chave do aparelho vira o id de amigo */
  function join(c, key, ids) {
    return joinFid(c, fidOf(key), ids);
  }
  /** saiu da sala ou caiu: some para os amigos quando fecha a última aba */
  function leave(c) {
    const set = c.fid ? online.get(c.fid) : null;
    if (set && set.delete(c)) {
      people--;
      const rest = one(c.fid); // outra aba da mesma pessoa continua: os amigos recebem os apelidos que sobraram
      if (!set.size) online.delete(c.fid);
      for (const id of c.watch)
        tabs(id).forEach(o => o.watch.has(c.fid) && (rest ? mutual(o, rest) && pres(o, rest, 1) : pres(o, c, 0)));
    }
    handles.delete(c.h);
    c.h = '';
    c.fid = '';
    c.watch = new Set();
    c.shown = new Set();
    c.gOn = false;
  }

  /** pedido pelo apelido público (`to`); a mesma resposta para quem saiu, para quem não existe e para quem está longe */
  function request(c, h) {
    if (!active(c)) return;
    const t = handles.get(h),
      to = t && active(t) ? t.fid : '';
    if (to && (to === c.fid || mutual(c, t))) return;
    const near = !!to && [...tabs(to)].some(o => o.room === c.room);
    if (!near && !(to && fresh(spoke, to, TEN_MIN)))
      return send(c.ws, {
        t: 'sys',
        text: 'Pedido não enviado: só dá para pedir amizade a quem está na sua sala ou falou no chat global há pouco.'
      });
    const k = c.fid + '>' + to;
    if (fresh(asked, k, TEN_MIN)) return;
    asked.set(k, now());
    prune();
    toAll(to, { t: 'freq', id: c.fid, h: c.h, name: c.me.name });
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
    if (on) send(c.ws, { t: 'gn', n: people });
  }
  function say(c, text) {
    if (!active(c)) return;
    const n = now();
    if (n - (c.since || 0) < minAge)
      return send(c.ws, { t: 'gsys', text: '⏳ Fique um pouquinho na sala antes de falar no chat global.' });
    if (text === c.gLast && n - (c.gLastAt || 0) < 60000) return;
    burst = burst.filter(x => n - x < 10000);
    // um IP (várias abas/conexões) não ocupa o teto do servidor inteiro: passou da fatia dele, só ele espera
    const ipk = c.ip || '',
      mine = (ipBurst.get(ipk) || []).filter(x => n - x < 10000);
    if (burst.length >= cap || mine.length >= ipCap)
      return send(c.ws, {
        t: 'gsys',
        text: '⏳ O chat global está muito movimentado. Tente de novo em alguns segundos.'
      });
    const clean = censor(text.replace(LINK, '🔗')).trim();
    if (!clean || clean === '🔗') return;
    c.gLast = text;
    c.gLastAt = n;
    burst.push(n);
    mine.push(n);
    ipBurst.set(ipk, mine);
    if (ipBurst.size > 1000) for (const [k, a] of ipBurst) if (!a.length || n - a[a.length - 1] >= 10000) ipBurst.delete(k);
    spoke.set(c.fid, n);
    prune();
    const m = { t: 'gchat', id: c.h, name: c.me.name, text: clean, at: n };
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
    joinFid,
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
