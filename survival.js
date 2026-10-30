'use strict';
// Motor do modo Sobrevivência: regras puras, sem rede, relógio nem timers. Quem usa (server.js) chama tick(st,dt) em intervalos fixos
// e as ações dos jogadores; todos os números vêm de SURV (assets/catalog.js). Cooperativo: nenhuma ação afeta outro jogador para pior.
// Estado e ações devolvem { ok:1 } ou { err:'codigo' }; os fatos da rodada saem como eventos {t:...} de tick().
const { SURV } = require('./assets/catalog.js');

const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const err = e => ({ err: e });
const OK = { ok: 1 };

function create({ S = SURV, seed = 1, nights, nodes = [] } = {}) {
  const [lo, hi] = S.run.nights;
  return {
    S, rng: mulberry32(seed), t: 0, nights: clamp(Number.isInteger(nights) ? nights : S.run.def, lo, hi),
    fire: S.fire.start, fireLow: false, pot: null, over: null, P: new Map(),
    nodes: nodes.map(n => ({ ...n, at: 0 })),
    stats: { faints: 0, meals: 0, dishes: {}, causes: {} }
  };
}

const cycle = S => S.time.day + S.time.night;
const isNight = st => st.t % cycle(st.S) >= st.S.time.day;
const nightsDone = st => Math.floor(st.t / cycle(st.S));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fireAt = st => ({ x: st.S.fire.x, z: st.S.fire.z });
const nearFire = (st, p, r) => dist(p, fireAt(st)) <= r;

function addPlayer(st, id) {
  if (st.P.has(id)) return st.P.get(id);
  const m = {};
  for (const [k, v] of Object.entries(st.S.meters)) m[k] = v.start;
  const p = { id, x: st.S.walk.x, z: st.S.walk.z, m, faint: false, fw: 0, sick: 0, inv: {}, rev: null, revT: 0, nf: 0, nm: 0, nr: 0 };
  st.P.set(id, p);
  return p;
}
function removePlayer(st, id) {
  st.P.delete(id);
  for (const p of st.P.values()) if (p.rev === id) { p.rev = null; p.revT = 0; }
  if (st.pot && st.pot.by === id) st.pot.by = null;
}
// A posição vem da rede: fica sempre dentro da área andável do modo.
function setPos(st, id, x, z) {
  const p = st.P.get(id), w = st.S.walk;
  if (!p || !Number.isFinite(x) || !Number.isFinite(z)) return;
  const dx = x - w.x, dz = z - w.z, d = Math.hypot(dx, dz);
  if (d > w.r) { const s = w.r / d; x = w.x + dx * s; z = w.z + dz * s; }
  p.x = x; p.z = z;
}

function faintOf(st, p, meter, ev) {
  p.m[meter] = 0; p.faint = true; p.fw = 0; p.rev = null; p.revT = 0;
  p.nf++; st.stats.faints++; st.stats.causes[meter] = (st.stats.causes[meter] || 0) + 1;
  ev.push({ t: 'faint', id: p.id, meter });
}

function tick(st, dt) {
  const ev = [];
  if (st.over || !(dt > 0)) return ev;
  dt = Math.min(dt, 5);
  const S = st.S, was = isNight(st);
  st.t += dt;
  const night = isNight(st);
  if (night !== was) ev.push({ t: night ? 'night' : 'day', n: nightsDone(st) + (night ? 1 : 0) });

  if (st.fire > 0) {
    st.fire = Math.max(0, st.fire - S.fire.burn * (night ? S.fire.nightX : 1) * dt);
    if (st.fire === 0) ev.push({ t: 'fireout' });
    else if (!st.fireLow && st.fire < S.fire.max * .2) { st.fireLow = true; ev.push({ t: 'firelow' }); }
    if (st.fire >= S.fire.max * .2) st.fireLow = false;
  }

  for (const p of st.P.values()) {
    if (p.faint) {
      // ninguém chegou a tempo: acorda sozinho, fraco e enjoado (a rodada continua se houver mais alguém de pé)
      if ((p.fw += dt) >= S.revive.auto && !(st.P.size > 0 && [...st.P.values()].every(q => q.faint))) {
        for (const k of Object.keys(p.m)) p.m[k] = Math.max(p.m[k], S.revive.autoBack);
        p.faint = false; p.fw = 0; p.sick = S.sick.dur; ev.push({ t: 'wake', id: p.id });
      }
      continue;
    }
    const warm = st.fire > 0 && nearFire(st, p, S.fire.heat);
    for (const [k, c] of Object.entries(S.meters)) {
      if (k === 'calor' && warm) { p.m[k] = Math.min(c.max, p.m[k] + c.nearFire * dt); continue; }
      p.m[k] -= c.drain * (night ? c.nightX : 1) * (p.sick > 0 ? S.sick.drainX : 1) * dt;
      if (p.m[k] <= 0) { faintOf(st, p, k, ev); break; }
    }
    if (p.sick > 0) p.sick = Math.max(0, p.sick - dt);
  }

  for (const p of st.P.values()) {
    if (p.rev === null) continue;
    const q = st.P.get(p.rev);
    if (p.faint || !q || !q.faint || dist(p, q) > S.revive.radius) { p.rev = null; p.revT = 0; continue; }
    p.revT += dt;
    if (p.revT >= S.revive.hold) {
      for (const k of Object.keys(q.m)) q.m[k] = Math.max(q.m[k], S.revive.back);
      q.faint = false; p.nr++; ev.push({ t: 'revive', id: q.id, by: p.id }); p.rev = null; p.revT = 0;
    }
  }

  const pot = st.pot;
  if (pot && st.fire > 0) {
    const r = S.recipes.find(x => x.id === pot.rid);
    if (!pot.ready) { pot.el += dt; if (pot.el >= r.time) { pot.ready = true; ev.push({ t: 'ready', rid: pot.rid }); } }
    else {
      pot.wait += dt;
      if (pot.wait >= S.cook.burn) {
        const by = pot.by && st.P.get(pot.by);
        if (by) by.sick = S.sick.dur;
        st.pot = null; ev.push({ t: 'burnt', rid: pot.rid, by: pot.by });
      }
    }
  }

  if (st.t >= st.nights * cycle(S)) { st.over = { ok: true }; ev.push({ t: 'end', ok: true }); }
  else if (st.P.size && [...st.P.values()].every(p => p.faint)) { st.over = { ok: false, why: 'desmaio' }; ev.push({ t: 'end', ok: false, why: 'desmaio' }); }
  return ev;
}

// Quem age precisa estar na rodada e acordado.
function who(st, id) {
  const p = st.P.get(id);
  if (st.over) return err('fim');
  if (!p) return err('jogador');
  if (p.faint) return err('desmaiado');
  return p;
}
const take = (p, res, n = 1) => { if ((p.inv[res] || 0) < n) return false; p.inv[res] -= n; return true; };
const has = (p, need) => Object.entries(need).every(([k, n]) => (p.inv[k] || 0) >= n);
const gain = (st, p, give) => { for (const [k, c] of Object.entries(st.S.meters)) if (give[k] > 0) p.m[k] = Math.min(c.max, p.m[k] + give[k]); };

function collect(st, id, i) {
  const p = who(st, id); if (p.err) return p;
  const n = st.nodes[i]; if (!n) return err('ponto');
  if (dist(p, n) > st.S.coleta.radius) return err('longe');
  if (st.t < n.at) return err('vazio');
  const r = st.S.res[n.res];
  p.inv[n.res] = (p.inv[n.res] || 0) + r.give;
  n.at = st.t + r.respawn * Math.min(1, st.S.run.ref / Math.max(1, st.P.size)); // grupo grande: o recurso volta mais rápido
  return OK;
}
function eat(st, id, res) {
  const p = who(st, id); if (p.err) return p;
  const S = st.S, dish = S.recipes.find(x => x.id === res), r = dish || S.res[res];
  if (!r || (!dish && r.kind !== 'food' && r.kind !== 'drink')) return err('item');
  if (!take(p, res)) return err('sem_item');
  if (dish) { // prato: comer perto de outro jogador acordado rende mais
    const x = [...st.P.values()].some(q => q !== p && !q.faint && dist(p, q) <= S.cook.groupRadius) ? S.cook.groupX : 1;
    const give = {}; for (const k of Object.keys(S.meters)) if (dish[k] > 0) give[k] = Math.round(dish[k] * x);
    gain(st, p, give); p.nm++; st.stats.meals++;
    return OK;
  }
  gain(st, p, r);
  if (r.sick && st.rng() < r.sick) p.sick = S.sick.dur;
  return OK;
}
function addFuel(st, id, res) {
  const p = who(st, id); if (p.err) return p;
  const r = st.S.res[res];
  if (!r || r.kind !== 'fuel') return err('item');
  if (!nearFire(st, p, st.S.cook.radius)) return err('longe');
  if (st.fire <= 0) return err('apagada');
  if (!take(p, res)) return err('sem_item');
  st.fire = Math.min(st.S.fire.max, st.fire + r.fuel);
  return OK;
}
function relight(st, id) {
  const p = who(st, id); if (p.err) return p;
  if (st.fire > 0) return err('acesa');
  if (!nearFire(st, p, st.S.cook.radius)) return err('longe');
  if (!has(p, st.S.fire.relight)) return err('sem_item');
  for (const [k, n] of Object.entries(st.S.fire.relight)) take(p, k, n);
  st.fire = st.S.fire.relightFuel; st.fireLow = false;
  return OK;
}

function cookStart(st, id, rid) {
  const p = who(st, id); if (p.err) return p;
  const r = st.S.recipes.find(x => x.id === rid);
  if (!r) return err('receita');
  if (st.pot) return err('ocupada');
  if (st.fire <= 0) return err('apagada');
  if (!nearFire(st, p, st.S.cook.radius)) return err('longe');
  const need = {}; for (const i of r.ins) need[i] = (need[i] || 0) + 1;
  if (!has(p, need)) return err('sem_item');
  for (const [k, n] of Object.entries(need)) take(p, k, n);
  st.pot = { rid, by: id, el: 0, wait: 0, ready: false };
  return OK;
}
// O prato pronto vai para a mochila de quem o pega (`give` porções); depois dá para comer ou compartilhar.
function cookTake(st, id) {
  const p = who(st, id); if (p.err) return p;
  if (!st.pot || !st.pot.ready) return err('nada');
  if (!nearFire(st, p, st.S.cook.radius)) return err('longe');
  const r = st.S.recipes.find(x => x.id === st.pot.rid), n = r.give || 1;
  p.inv[r.id] = (p.inv[r.id] || 0) + n;
  st.stats.dishes[r.id] = (st.stats.dishes[r.id] || 0) + 1;
  st.pot = null;
  return { ok: 1, got: { res: r.id, n } };
}
// Dá itens (recurso ou prato) a outro jogador da sala, onde quer que ele esteja. Só doação: nunca tira nada de ninguém.
function giveItem(st, id, to, res, n) {
  const p = who(st, id); if (p.err) return p;
  const q = st.P.get(to);
  if (!q || q === p) return err('alvo');
  if (!Number.isInteger(n) || n < 1) return err('quantidade');
  if (!Object.prototype.hasOwnProperty.call(st.S.res, res) && !st.S.recipes.some(r => r.id === res)) return err('item');
  if (!take(p, res, n)) return err('sem_item');
  q.inv[res] = (q.inv[res] || 0) + n;
  return { ok: 1, gave: { from: id, to, res, n } };
}

function reviveStart(st, id, target) {
  const p = who(st, id); if (p.err) return p;
  const q = st.P.get(target);
  if (!q || q === p || !q.faint) return err('alvo');
  if (dist(p, q) > st.S.revive.radius) return err('longe');
  p.rev = target; p.revT = 0;
  return OK;
}
function reviveStop(st, id) { const p = st.P.get(id); if (p) { p.rev = null; p.revT = 0; } return OK; }

function summary(st) {
  return { ok: !!(st.over && st.over.ok), why: st.over && st.over.why || '', over: !!st.over, nights: nightsDone(st), target: st.nights, sec: Math.round(st.t),
    per: Object.fromEntries([...st.P.values()].map(p => [p.id, { f: p.nf, m: p.nm, r: p.nr }])), players: st.P.size, faints: st.stats.faints, meals: st.stats.meals, dishes: { ...st.stats.dishes }, causes: { ...st.stats.causes } };
}

module.exports = { create, addPlayer, removePlayer, setPos, tick, collect, eat, addFuel, relight, cookStart, cookTake, giveItem, reviveStart, reviveStop, summary, isNight, nightsDone };
