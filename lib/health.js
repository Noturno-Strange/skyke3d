'use strict';
// Saúde lúdica: sem morte, dano permanente, contágio ou receitas médicas reais.
const { readJsonFile, writeJsonAtomic } = require('./persist');
const { PID_RE } = require('./pubprofile');
const { MEDICINE, ILLNESSES } = require('../assets/medicine');
const { levelInfo, xpFor, MAX_LEVEL } = require('./levels');
const ACTIVE_MS = 30 * 60000;
const REST_MS = 10 * 60000;
const STOCK_MAX = 99;

function createHealth({
  file = '',
  max = 20000,
  delayMs = 1000,
  now = Date.now,
  rng = Math.random,
  consume = (_pid, _ids) => Boolean(false),
  onError = (_w, _e) => {}
} = {}) {
  const players = new Map();
  let timer = null,
    dirty = false;
  const number = (v, cap) => (Number.isSafeInteger(v) && v >= 0 ? Math.min(v, cap) : 0);
  function clean(r) {
    if (!r || typeof r !== 'object') return null;
    const meds = Object.fromEntries(
      Object.entries(r.meds || {})
        .filter(([id, n]) => Object.hasOwn(MEDICINE, id) && number(n, STOCK_MAX) > 0)
        .map(([id, n]) => [id, number(n, STOCK_MAX)])
    );
    return {
      ill: Object.hasOwn(ILLNESSES, r.ill) ? r.ill : '',
      until: number(r.until, now() + REST_MS),
      active: number(r.active, ACTIVE_MS),
      immune: number(r.immune, now() + ACTIVE_MS),
      meds,
      xp: number(r.xp, xpFor(MAX_LEVEL)),
      helped: number(r.helped, 1000000)
    };
  }
  try {
    const data = file ? readJsonFile(file) : null;
    if (data && data.v === 1 && data.p)
      for (const [pid, r] of Object.entries(data.p)) {
        if (players.size >= max) break;
        const value = PID_RE.test(pid) && clean(r);
        if (value) players.set(pid, value);
      }
  } catch (e) {
    onError('saúde', e);
  }
  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!file || !dirty) return;
    try {
      writeJsonAtomic(file, { v: 1, p: Object.fromEntries(players) });
      dirty = false;
    } catch (e) {
      onError('saúde', e);
    }
  }
  function save() {
    dirty = true;
    if (file && !timer) {
      timer = setTimeout(flush, delayMs);
      timer.unref();
    }
  }
  function own(pid) {
    if (!PID_RE.test(pid)) return null;
    if (!players.has(pid)) {
      if (players.size >= max) return null;
      players.set(pid, { ill: '', until: 0, active: 0, immune: 0, meds: {}, xp: 0, helped: 0 });
    }
    return players.get(pid);
  }
  function settle(r) {
    if (r && r.ill && now() >= r.until) {
      r.ill = '';
      r.until = 0;
      r.active = 0;
      r.immune = now() + ACTIVE_MS;
      save();
    }
  }
  function publicOf(pid) {
    const r = players.get(pid);
    settle(r);
    return { ill: r ? r.ill : '', tired: !!(r && r.ill), until: r && r.ill ? r.until : 0 };
  }
  function view(pid) {
    const r = players.get(pid);
    return {
      ...publicOf(pid),
      ...levelInfo(r ? r.xp : 0),
      meds: r ? { ...r.meds } : {},
      helped: r ? r.helped : 0,
      now: now()
    };
  }
  function tick(pid, elapsedMs) {
    const r = own(pid);
    if (!r) return false;
    const was = r.ill;
    settle(r);
    if (!r.ill && now() >= r.immune) {
      r.active = Math.min(ACTIVE_MS, r.active + Math.max(0, Math.min(10000, elapsedMs)));
      if (r.active >= ACTIVE_MS) {
        const ids = Object.keys(ILLNESSES);
        r.ill = ids[Math.min(ids.length - 1, Math.floor(Math.max(0, rng()) * ids.length))];
        r.until = now() + REST_MS;
        r.active = 0;
      }
      save();
    }
    return was !== r.ill;
  }
  function craft(pid, id) {
    if (!Object.hasOwn(MEDICINE, id)) return { ok: false, reason: 'receita' };
    const r = own(pid);
    if (!r) return { ok: false, reason: 'full' };
    if ((r.meds[id] || 0) >= STOCK_MAX) return { ok: false, reason: 'cheio' };
    if (!consume(pid, MEDICINE[id].g)) return { ok: false, reason: 'despensa' };
    r.meds[id] = (r.meds[id] || 0) + 1;
    save();
    return { ok: true, state: view(pid) };
  }
  // Autorizações de amizade, alcance e conexão são conferidas pelo servidor antes de chamar.
  function heal(healer, patient, id) {
    if (!Object.hasOwn(MEDICINE, id)) return { ok: false, reason: 'receita' };
    const r = players.get(healer),
      p = players.get(patient);
    settle(p);
    if (!p || !p.ill) return { ok: false, reason: 'saudavel' };
    if (!r || !(r.meds[id] > 0)) return { ok: false, reason: 'remedio' };
    r.meds[id]--;
    if (!r.meds[id]) delete r.meds[id];
    p.ill = '';
    p.until = 0;
    p.active = 0;
    p.immune = now() + ACTIVE_MS;
    if (healer !== patient) {
      r.helped = Math.min(1000000, r.helped + 1);
      r.xp = Math.min(xpFor(MAX_LEVEL), r.xp + 20);
    }
    save();
    return { ok: true, state: view(healer), patient: publicOf(patient) };
  }
  return { view, publicOf, tick, craft, heal, flush };
}
module.exports = { createHealth, ACTIVE_MS, REST_MS, STOCK_MAX };
