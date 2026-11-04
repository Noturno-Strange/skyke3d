/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Mascotes: adoção, persistência, ações do dono e interações sociais de quem visita.
 *
 * - Cada mascote pertence a um código público derivado do id de identidade (o mesmo do perfil público). Quem fala com
 *   este módulo (server.js) só passa o código do dono já autenticado: o cliente nunca informa de quem é o mascote.
 * - Tudo é decidido aqui: seed, genes, hora, necessidades, esperas. O cliente só pede uma ação pelo nome.
 * - Fica em `data/pets.json` (0600, gravação atômica agrupada). Só ações do dono gravam; ler não grava.
 * - Soltar o mascote apaga o registro, mas deixa uma trava de 30 dias para não dar para sortear de novo até sair um raro.
 * - Os mascotes não ficam todos "ativos": é um mapa de registros pequenos, sem timer por mascote.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { readJsonFile, writeJsonAtomic } = require('./persist');
const G = require('./pet-genes');
const C = require('./pet-care');
const { cleanText, hasLink } = require('./pubprofile');

const PID_RE = /^[0-9a-f]{20}$/;
const NAME_MAX = 16;
const MAX_PETS = 20000;
const RELEASE_LOCK = 30 * 86400000;
const RID_RE = /^[A-Za-z0-9_-]{6,24}$/;
const RID_KEEP = 16;
const SOCIAL_KINDS = ['wave', 'hug', 'gift'];
const SOCIAL_COOLDOWN = 6 * 3600000;
const SOCIAL_DAY_CAP = 200;
const DAY = 86400000;

/**
 * @param {{file?: string, max?: number, delayMs?: number, now?: () => number, onError?: (w: string, e: any) => void,
 *   warn?: (m: string) => void, randomSeed?: () => string}} [o]
 */
function createPets({
  file = '',
  max = MAX_PETS,
  delayMs = 5000,
  now = Date.now,
  onError = () => {},
  warn = () => {},
  randomSeed = () => crypto.randomBytes(8).toString('hex')
} = {}) {
  /** @type {Map<string, any>} */
  const pets = new Map();
  /** @type {Set<string>} */
  const genomes = new Set();
  /** @type {Map<string, number>} */
  const released = new Map();
  /** @type {Map<string, Map<string, any>>} últimas respostas por pedido, para repetir sem refazer */
  const recent = new Map();
  /** @type {Map<string, {counts: Record<string, number>, by: Map<string, number>, day: number, n: number}>} */
  const social = new Map();
  let dirty = false,
    timer = /** @type {any} */ (null);

  // ---------- arquivo ----------
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  function cleanRecord(e, t) {
    if (!e || typeof e !== 'object') return null;
    const g = G.cleanGenes(e.g);
    if (
      !g ||
      typeof e.sd !== 'string' ||
      !/^[0-9a-f]{16}$/.test(e.sd) ||
      !Number.isInteger(e.n) ||
      e.n < 0 ||
      e.n > 200
    )
      return null;
    const c = num(e.c, NaN);
    if (!Number.isFinite(c) || c > t + DAY) return null;
    const a = e.a && typeof e.a === 'object' ? e.a : {};
    const att = {};
    for (const k of [...C.NEEDS, 'bond']) att[k] = Math.max(0, Math.min(100, num(a[k], 50)));
    const cd = {};
    if (e.cd && typeof e.cd === 'object')
      for (const k of C.ACTION_IDS)
        if (Number.isFinite(e.cd[k]) && e.cd[k] > t && e.cd[k] < t + 5 * 3600000) cd[k] = e.cd[k];
    const ct = { feed: 0, play: 0, rest: 0, clean: 0, pet: 0, special: 0, total: 0 };
    if (e.ct && typeof e.ct === 'object')
      for (const k of Object.keys(ct)) if (Number.isInteger(e.ct[k]) && e.ct[k] >= 0 && e.ct[k] < 1e9) ct[k] = e.ct[k];
    const hs = [];
    if (Array.isArray(e.hs))
      for (const h of e.hs.slice(-20))
        if (
          Array.isArray(h) &&
          typeof h[0] === 'string' &&
          (h[0] === 'adotado' || C.ACTION_IDS.includes(h[0])) &&
          Number.isFinite(h[1])
        )
          hs.push([h[0], h[1]]);
    const known = new Set(C.ACHIEVEMENTS.map(x => x.id));
    const un = {};
    if (e.un && typeof e.un === 'object')
      for (const [id, ts] of Object.entries(e.un)) if (known.has(id) && Number.isFinite(ts)) un[id] = ts;
    const bd =
      e.bd && Number.isFinite(e.bd.d) && Number.isFinite(e.bd.g)
        ? { d: e.bd.d, g: Math.max(0, Math.min(C.BOND_PER_DAY, e.bd.g)) }
        : { d: 0, g: 0 };
    return {
      sd: e.sd,
      n: e.n,
      g,
      nm: cleanText(e.nm, NAME_MAX) || 'Mascote',
      c,
      t: Math.min(num(e.t, c), t),
      a: att,
      cd,
      ct,
      hs,
      un,
      cos: Number.isInteger(e.cos) && e.cos >= 0 && e.cos < C.COSMETICS.length ? e.cos : 0,
      bd
    };
  }
  function load() {
    if (!file) return;
    let obj = null;
    try {
      obj = readJsonFile(file);
    } catch (e) {
      try {
        fs.renameSync(file, file + '.bak');
      } catch (x) {
        /* já não existe */
      }
      warn('mascotes: arquivo inválido, começando limpo (o antigo ficou em .bak).');
    }
    if (!obj || obj.v !== 1) return;
    const t = now();
    if (obj.pets && typeof obj.pets === 'object')
      for (const [pid, e] of Object.entries(obj.pets)) {
        if (pets.size >= max || !PID_RE.test(pid)) continue;
        const r = cleanRecord(e, t);
        if (!r) continue;
        const key = G.genomeKey(r.g);
        if (genomes.has(key)) continue; // genoma repetido no arquivo: o primeiro vale
        genomes.add(key);
        pets.set(pid, r);
      }
    if (obj.rel && typeof obj.rel === 'object')
      for (const [pid, ts] of Object.entries(obj.rel))
        if (PID_RE.test(pid) && Number.isFinite(ts) && t - /** @type {number} */ (ts) < RELEASE_LOCK)
          released.set(pid, /** @type {number} */ (ts));
  }
  function write() {
    if (!file || !dirty) return;
    dirty = false;
    const out = Object.create(null),
      rel = Object.create(null);
    for (const [pid, p] of pets) out[pid] = p;
    for (const [pid, ts] of released) rel[pid] = ts;
    try {
      writeJsonAtomic(file, { v: 1, savedAt: now(), pets: out, rel });
    } catch (e) {
      dirty = true;
      onError('mascotes', e);
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

  // ---------- operações do dono ----------
  /**
   * Adota o mascote de um dono (um por pessoa).
   * @param {string} pid código público do dono, já autenticado
   * @param {string} name
   */
  function adopt(pid, name) {
    if (!PID_RE.test(pid)) return { ok: false, reason: 'invalid' };
    if (pets.has(pid)) return { ok: false, reason: 'exists' };
    const t = now();
    const lock = released.get(pid);
    if (lock && t - lock < RELEASE_LOCK) return { ok: false, reason: 'locked', wait: RELEASE_LOCK - (t - lock) };
    const nm = cleanText(name, NAME_MAX);
    if (!nm || hasLink(nm)) return { ok: false, reason: 'name' };
    if (pets.size >= max) return { ok: false, reason: 'full' };
    const gen = G.generateUnique(genomes, randomSeed);
    if (!gen) return { ok: false, reason: 'busy' };
    const p = C.newPet({ seed: gen.seed, attempt: gen.attempt, genes: gen.genes, name: nm, now: t });
    pets.set(pid, p);
    genomes.add(G.genomeKey(gen.genes));
    released.delete(pid);
    save();
    return { ok: true, pet: C.ownerView(p, t) };
  }

  /** @param {string} pid */
  function view(pid) {
    const p = pets.get(pid);
    if (!p) return null;
    const t = now();
    C.settle(p, t);
    C.unlock(p, t);
    return C.ownerView(p, t);
  }

  /**
   * Ação de cuidado. Um pedido repetido (mesmo `rid`) devolve o mesmo resultado sem refazer nada.
   * @param {string} pid @param {string} action @param {string} rid
   */
  function act(pid, action, rid) {
    const p = pets.get(pid);
    if (!p) return { ok: false, reason: 'none' };
    if (typeof rid !== 'string' || !RID_RE.test(rid)) return { ok: false, reason: 'rid' };
    let memo = recent.get(pid);
    if (memo && memo.has(rid)) return { ...memo.get(rid), dup: true };
    const t = now();
    const r = C.act(p, action, t);
    const out = r.ok
      ? { ok: true, gain: r.gain, fresh: r.fresh, action, pet: C.ownerView(p, t) }
      : { ...r, pet: C.ownerView(p, t) };
    if (r.ok) save();
    if (!memo) recent.set(pid, (memo = new Map()));
    memo.set(rid, out);
    while (memo.size > RID_KEEP) memo.delete(memo.keys().next().value);
    return out;
  }

  /** @param {string} pid @param {number} id */
  function dress(pid, id) {
    const p = pets.get(pid);
    if (!p) return { ok: false, reason: 'none' };
    if (!C.dress(p, id)) return { ok: false, reason: 'locked' };
    save();
    return { ok: true, pet: C.ownerView(C.settle(p, now()), now()) };
  }

  /** Solta o mascote: apaga tudo e trava uma nova adoção por 30 dias. */
  function release(pid) {
    const p = pets.get(pid);
    if (!p) return { ok: false, reason: 'none' };
    genomes.delete(G.genomeKey(p.g));
    pets.delete(pid);
    recent.delete(pid);
    social.delete(pid);
    released.set(pid, now());
    save();
    return { ok: true };
  }

  // ---------- perfil público e interações sociais ----------
  const socialOf = pid => {
    let s = social.get(pid);
    if (!s) {
      s = { counts: { wave: 0, hug: 0, gift: 0 }, by: new Map(), day: 0, n: 0 };
      social.set(pid, s);
    }
    return s;
  };

  /** Resumo público (o servidor só mostra se o dono ligou o perfil público). */
  function publicOf(pid) {
    const p = pets.get(pid);
    if (!p) return null;
    const t = now();
    C.unlock(p, t);
    const s = social.get(pid);
    return { ...C.publicView(p, t), social: s ? { ...s.counts } : { wave: 0, hug: 0, gift: 0 } };
  }

  /**
   * Interação simbólica de quem visita. Não muda necessidade nem dado nenhum do mascote: só um contador temporário.
   * @param {string} pid mascote visitado @param {string} voter código público de quem visita @param {string} kind
   */
  function visit(pid, voter, kind) {
    if (!PID_RE.test(pid) || !PID_RE.test(voter)) return { ok: false, reason: 'invalid' };
    if (!SOCIAL_KINDS.includes(kind)) return { ok: false, reason: 'kind' };
    if (pid === voter) return { ok: false, reason: 'self' };
    if (!pets.has(pid)) return { ok: false, reason: 'none' };
    const t = now(),
      s = socialOf(pid),
      day = Math.floor(t / DAY);
    if (s.day !== day) {
      s.day = day;
      s.n = 0;
    }
    if (s.n >= SOCIAL_DAY_CAP) return { ok: false, reason: 'busy' };
    const key = voter + ':' + kind,
      last = s.by.get(key) || 0;
    if (t - last < SOCIAL_COOLDOWN) return { ok: false, reason: 'cooldown', wait: SOCIAL_COOLDOWN - (t - last) };
    s.by.set(key, t);
    s.counts[kind] += 1;
    s.n += 1;
    return { ok: true, counts: { ...s.counts } };
  }

  /** Limpa interações antigas da memória (vencem junto com a espera de 6 h). */
  function sweep() {
    const t = now();
    for (const [pid, s] of social) {
      for (const [k, ts] of s.by) if (t - ts >= SOCIAL_COOLDOWN) s.by.delete(k);
      if (!s.by.size && t - s.day * DAY >= DAY) social.delete(pid);
    }
    for (const [pid, ts] of released) if (t - ts >= RELEASE_LOCK) released.delete(pid);
  }

  load();
  return {
    adopt,
    view,
    act,
    dress,
    release,
    publicOf,
    visit,
    sweep,
    flush,
    has: pid => pets.has(pid),
    size: () => pets.size,
    genomeCount: () => genomes.size
  };
}

module.exports = { createPets, PID_RE, NAME_MAX, MAX_PETS, RELEASE_LOCK, SOCIAL_KINDS };
