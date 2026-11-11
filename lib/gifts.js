/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Presentes entre jogadores: cada jogador tem uma caixa de presentes, que é uma coleção para mostrar (no jogo e no perfil público).
 *
 * - O presente é uma lembrança, não um item: fica na caixa de quem recebeu e NÃO vai para a mochila, não vira moeda, não é
 *   resgatado, retirado nem repassado. Por isso não cria nem move valor: não há o que duplicar na economia.
 * - Só dá para presentear o que o próprio jogador já produziu: uma planta que ele já colheu na fazenda ou um alimento de receita
 *   que ele já preparou. Quem confere é o servidor (`can`, ligado a lib/farm.js e lib/cook.js); o cliente só diz o destinatário,
 *   o tipo e o id do item. O presente não gasta nada de quem envia (plantas são vendidas na colheita e receitas não acabam).
 * - A caixa é por código público do jogador (o mesmo do perfil). Fica em `data/gifts.json` (0600, gravação atômica agrupada).
 *   Guarda, por presente: o código público e o nome de quem enviou (como estava na hora), o tipo, o id do item e a data.
 * - Limites contra abuso: `perDay` envios por jogador a cada 24 h, `perPair` para a mesma pessoa a cada 24 h e `boxMax`
 *   presentes por caixa (cheia, recusa presentes novos até o dono remover algum). Os limites saem dos próprios presentes
 *   guardados (índice na memória refeito ao carregar), então reiniciar o servidor não os zera.
 * - O dono pode remover um presente da própria caixa (é a moderação dele: um nome ou item que não quer mostrar). Remover não
 *   devolve nada a ninguém nem libera o limite de quem enviou.
 * - Quem visita vê os presentes sem o código de quem enviou: só o nome, o item e a data.
 */
'use strict';

const C = require('../assets/catalog.js');
const { readJsonFile, writeJsonAtomic } = require('./persist');

const PID_RE = /^[0-9a-f]{20}$/;
const DAY = 86400000;
const MAX_BOXES = 20000;
const BOX_MAX = 200;
const PER_DAY = 5;
const PER_PAIR = 1;
const KINDS = { c: C.CROP, r: C.RECIPE };
const has = (/** @type {any} */ o, /** @type {string} */ k) => Object.prototype.hasOwnProperty.call(o, k);
// controles, espaços invisíveis e marcas de direção: o nome de quem enviou vai para uma página pública
const CTRL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff<>]', 'g');
const cleanName = (/** @type {any} */ n) =>
  typeof n === 'string' ? n.replace(CTRL, '').trim().slice(0, C.LIMITS.name) : '';

/** o item existe no catálogo? `kind`: 'c' = planta da fazenda, 'r' = alimento de receita */
const itemOk = (/** @type {any} */ kind, /** @type {any} */ item) =>
  typeof kind === 'string' &&
  has(KINDS, kind) &&
  typeof item === 'string' &&
  has(KINDS[/** @type {'c'} */ (kind)], item);

/**
 * @typedef {{id: number, f: string, n: string, k: string, i: string, at: number}} Gift
 * @typedef {{g: Gift[], nx: number, u: number}} Box
 */

/**
 * @param {{file?: string, max?: number, boxMax?: number, perDay?: number, perPair?: number, delayMs?: number,
 *   now?: () => number, can?: (pid: string, kind: string, item: string) => boolean, onError?: (w: string, e: any) => void}} [o]
 * `can`: o jogador `pid` já produziu este item? (sem ela, ninguém pode enviar nada)
 */
function createGifts({
  file = '',
  max = MAX_BOXES,
  boxMax = BOX_MAX,
  perDay = PER_DAY,
  perPair = PER_PAIR,
  delayMs = 5000,
  now = Date.now,
  can = () => false,
  onError = () => {}
} = {}) {
  /** @type {Map<string, Box>} */
  const boxes = new Map();
  /** @type {Map<string, {at: number, to: string}[]>} quem enviou → envios das últimas 24 h */
  const sent = new Map();
  let dirty = false,
    timer = /** @type {any} */ (null);
  const stats = { sent: 0, refused: 0 };

  /** valida uma caixa lida do disco: nada do que está no arquivo é confiado */
  function clean(/** @type {any} */ b) {
    if (!b || typeof b !== 'object' || !Array.isArray(b.g)) return null;
    /** @type {Gift[]} */
    const g = [];
    let top = 0;
    for (const x of b.g.slice(-boxMax)) {
      if (!x || typeof x !== 'object' || !PID_RE.test(x.f) || !itemOk(x.k, x.i)) continue;
      if (!Number.isSafeInteger(x.at) || x.at <= 0) continue;
      const id = Number.isSafeInteger(x.id) && x.id > top ? x.id : top + 1;
      top = id;
      g.push({ id, f: x.f, n: cleanName(x.n) || 'Jogador', k: x.k, i: x.i, at: x.at });
    }
    if (!g.length) return null;
    const nx = Number.isSafeInteger(b.nx) && b.nx > top ? b.nx : top + 1,
      u = Number.isInteger(b.u) && b.u >= 0 ? Math.min(b.u, g.length) : 0;
    return { g, nx, u };
  }
  function note(/** @type {string} */ from, /** @type {string} */ to, /** @type {number} */ at) {
    let l = sent.get(from);
    if (!l) sent.set(from, (l = []));
    l.push({ at, to });
  }

  if (file) {
    let obj = null;
    try {
      obj = readJsonFile(file);
    } catch (e) {
      onError('presentes', e);
    }
    if (obj && obj.v === 1 && obj.b && typeof obj.b === 'object') {
      const t = now();
      for (const [pid, b] of Object.entries(obj.b)) {
        if (boxes.size >= max) break;
        const box = PID_RE.test(pid) ? clean(b) : null;
        if (!box) continue;
        boxes.set(pid, box);
        for (const x of box.g) if (t - x.at < DAY) note(x.f, pid, x.at);
      }
    }
  }

  function write() {
    if (!file || !dirty) return;
    dirty = false;
    /** @type {Record<string, Box>} */
    const b = {};
    for (const [pid, box] of boxes) b[pid] = box;
    try {
      writeJsonAtomic(file, { v: 1, b });
    } catch (e) {
      dirty = true;
      onError('presentes', e);
    }
  }
  function save() {
    if (!file) return;
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      write();
    }, delayMs);
    if (timer.unref) timer.unref();
  }
  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    write();
  }

  /** envios de `from` nas últimas 24 h (a lista é podada aqui) */
  function recent(/** @type {string} */ from) {
    const l = sent.get(from);
    if (!l) return [];
    const t = now(),
      keep = l.filter(x => t - x.at < DAY);
    if (keep.length) sent.set(from, keep);
    else sent.delete(from);
    return keep;
  }

  /**
   * Quantos presentes `from` ainda pode enviar hoje e quando o limite volta (para o painel mostrar antes de o jogador tentar).
   * @param {string} from
   */
  function quota(from) {
    const l = recent(from),
      left = Math.max(0, perDay - l.length);
    return { left, perDay, next: left ? 0 : Math.min(...l.map(x => x.at)) + DAY };
  }

  /**
   * Envia um presente. Tudo é conferido aqui; nenhuma parte do pedido é confiada.
   * @param {string} from código público de quem envia (da sessão autenticada, nunca do pedido)
   * @param {string} to código público de quem recebe
   * @param {string} kind 'c' (planta) ou 'r' (alimento de receita)
   * @param {string} item
   * @param {string} name nome atual de quem envia (o servidor é quem informa)
   */
  function send(from, to, kind, item, name) {
    const no = (/** @type {string} */ reason, extra = {}) => {
      stats.refused++;
      return { ok: false, reason, ...extra };
    };
    if (!PID_RE.test(from) || !PID_RE.test(to)) return no('pid');
    if (from === to) return no('self');
    if (!itemOk(kind, item)) return no('item');
    if (!can(from, kind, item)) return no('nao_tem');
    const l = recent(from);
    if (l.length >= perDay) return no('dia', { wait: Math.ceil((Math.min(...l.map(x => x.at)) + DAY - now()) / 1000) });
    const pair = l.filter(x => x.to === to);
    if (pair.length >= perPair)
      return no('par', { wait: Math.ceil((Math.min(...pair.map(x => x.at)) + DAY - now()) / 1000) });
    let box = boxes.get(to);
    if (!box) {
      if (boxes.size >= max) return no('full');
      box = { g: [], nx: 1, u: 0 };
    }
    if (box.g.length >= boxMax) return no('cheia');
    const at = now(),
      gift = { id: box.nx++, f: from, n: cleanName(name) || 'Jogador', k: kind, i: item, at };
    box.g.push(gift);
    box.u = Math.min(box.g.length, box.u + 1);
    boxes.set(to, box);
    note(from, to, at);
    stats.sent++;
    save();
    return {
      ok: true,
      gift: { id: gift.id, n: gift.n, k: kind, i: item, at },
      left: Math.max(0, perDay - l.length - 1)
    };
  }

  /**
   * A caixa do próprio jogador: todos os presentes (mais novos primeiro), com o id para remover, e quantos ainda não foram vistos.
   * @param {string} pid
   */
  function box(pid) {
    const b = boxes.get(pid);
    return {
      total: b ? b.g.length : 0,
      max: boxMax,
      unseen: b ? b.u : 0,
      list: b ? b.g.map(x => ({ id: x.id, n: x.n, k: x.k, i: x.i, at: x.at })).reverse() : []
    };
  }

  /** o dono abriu a caixa: zera o contador de presentes novos */
  function seen(/** @type {string} */ pid) {
    const b = boxes.get(pid);
    if (!b || !b.u) return;
    b.u = 0;
    save();
  }

  /** presentes novos desde a última vez que o dono abriu a caixa (o aviso ao entrar) */
  function unseen(/** @type {string} */ pid) {
    const b = boxes.get(pid);
    return b ? b.u : 0;
  }

  /**
   * A caixa para quem visita (perfil público e painel de outro jogador): sem o código de quem enviou nem o id do presente.
   * @param {string} pid
   * @param {number} [limit]
   */
  function publicOf(pid, limit = 60) {
    const b = boxes.get(pid);
    if (!b) return { total: 0, list: [] };
    return {
      total: b.g.length,
      list: b.g
        .slice(-limit)
        .map(x => ({ n: x.n, k: x.k, i: x.i, at: x.at }))
        .reverse()
    };
  }

  /**
   * O dono remove um presente da própria caixa. Não devolve nada nem libera o limite de quem enviou.
   * @param {string} pid
   * @param {number} id
   */
  function remove(pid, id) {
    const b = boxes.get(pid);
    if (!b) return false;
    const k = b.g.findIndex(x => x.id === id);
    if (k < 0) return false;
    b.g.splice(k, 1);
    b.u = Math.min(b.u, b.g.length);
    if (!b.g.length) boxes.delete(pid);
    save();
    return true;
  }

  return {
    send,
    quota,
    box,
    seen,
    unseen,
    publicOf,
    remove,
    flush,
    size: () => boxes.size,
    stats: () => ({ boxes: boxes.size, ...stats })
  };
}

module.exports = { createGifts, itemOk, PID_RE, BOX_MAX, PER_DAY, PER_PAIR, MAX_BOXES };
