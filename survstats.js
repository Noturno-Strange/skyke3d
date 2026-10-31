'use strict';
// Estatísticas públicas do modo Sobrevivência: só totais, recordes e contagens por dia. Nenhum nome, IP, código de sala ou jogador
// é guardado: cada rodada que termina (com gente de verdade e tempo mínimo) só soma números a estes contadores.
const { readJsonFile, writeJsonAtomic } = require('./persist');

const DAY = 86400000, KEEP_DAYS = 60, SHOW_DAYS = 30;
const dayKey = t => new Date(t).toISOString().slice(0, 10);
const num = v => Number.isFinite(v) && v >= 0 ? v : 0;
const blank = () => ({ v: 1, tot: { runs: 0, wins: 0, nights: 0, meals: 0, faints: 0, sec: 0, players: 0 }, worlds: {}, causes: {}, dishes: {}, days: {}, extra: { apples: 0, cooked: 0, lit: 0, rec: { cookOne: 0, cookGroup: 0, appleOne: 0, appleGroup: 0, litOne: 0, litGroup: 0 } } });

function createSurvStats({ file, S, worlds, minPlayers = 2, minSec = 180, onError = () => {}, warn = () => {}, now = Date.now, delayMs = 5000 }) {
  let d = blank(), dirty = false, timer = null, cacheAt = 0, cache = '';
  const okWorld = w => typeof w === 'string' && worlds.includes(w), okDish = id => S.recipes.some(r => r.id === id), okCause = k => Object.prototype.hasOwnProperty.call(S.meters, k);
  if (file) {
    try {
      const j = readJsonFile(file);
      if (j && j.v === 1) {
        for (const k of Object.keys(d.tot)) d.tot[k] = num(j.tot && j.tot[k]);
        for (const [w, x] of Object.entries(j.worlds || {})) if (okWorld(w) && x) d.worlds[w] = { runs: num(x.runs), wins: num(x.wins), best: x.best && Number.isFinite(x.best.nights) ? { nights: num(x.best.nights), sec: num(x.best.sec), players: num(x.best.players), faints: num(x.best.faints), at: num(x.best.at) } : null };
        for (const [k, n] of Object.entries(j.causes || {})) if (okCause(k)) d.causes[k] = num(n);
        for (const [k, n] of Object.entries(j.dishes || {})) if (okDish(k)) d.dishes[k] = num(n);
        if (j.extra) { for (const k of ['apples', 'cooked', 'lit']) d.extra[k] = num(j.extra[k]); for (const k of Object.keys(d.extra.rec)) d.extra.rec[k] = num(j.extra.rec && j.extra.rec[k]); }
        for (const [k, x] of Object.entries(j.days || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && x) d.days[k] = { runs: num(x.runs), wins: num(x.wins) };
      }
    } catch (e) { warn('estatísticas: arquivo inválido, começando do zero.'); d = blank(); }
  }
  function write() { if (!file || !dirty) return; dirty = false; try { writeJsonAtomic(file, d); } catch (e) { onError('estatísticas', e); } }
  function save() { dirty = true; cacheAt = 0; if (timer) return; timer = setTimeout(() => { timer = null; write(); }, delayMs); if (timer.unref) timer.unref(); }
  // melhor rodada: mais noites, depois menos desmaios, depois menos tempo
  const better = (a, b) => !b || a.nights > b.nights || (a.nights === b.nights && (a.faints < b.faints || (a.faints === b.faints && a.sec < b.sec)));

  // sum vem do servidor (survival.summary); conta só rodada de verdade: gente suficiente e tempo mínimo
  function record(sum, per) {
    if (!sum || !okWorld(sum.world) || num(sum.players) < minPlayers || num(sum.sec) < minSec) return false;
    const t = d.tot, w = d.worlds[sum.world] || (d.worlds[sum.world] = { runs: 0, wins: 0, best: null }), win = sum.ok ? 1 : 0;
    t.runs++; t.wins += win; t.nights += num(sum.nights); t.meals += num(sum.meals); t.faints += num(sum.faints); t.sec += num(sum.sec); t.players += num(sum.players);
    w.runs++; w.wins += win;
    const run = { nights: num(sum.nights), sec: num(sum.sec), players: num(sum.players), faints: num(sum.faints), at: Math.floor(now() / 1000) };
    if (better(run, w.best)) w.best = run;
    for (const [k, n] of Object.entries(sum.causes || {})) if (okCause(k)) d.causes[k] = (d.causes[k] || 0) + num(n);
    for (const [k, n] of Object.entries(sum.dishes || {})) if (okDish(k)) d.dishes[k] = (d.dishes[k] || 0) + num(n);
    const dk = dayKey(now()), day = d.days[dk] || (d.days[dk] = { runs: 0, wins: 0 }); day.runs++; day.wins += win;
    // totais e recordes de maçãs colhidas, pratos cozinhados e fogueiras acesas (só números; nada de jogador)
    const E = d.extra, rec = E.rec; let a1 = 0, aS = 0, c1 = 0, cS = 0, l1 = 0, lS = 0;
    for (const x of Object.values(per && typeof per === 'object' ? per : {})) {
      const ct = x && x.ct || {}, a = num(ct['col.fruta']), c = num(ct.cook), l = num(ct.lit);
      a1 = Math.max(a1, a); aS += a; c1 = Math.max(c1, c); cS += c; l1 = Math.max(l1, l); lS += l;
    }
    E.apples += aS; E.cooked += cS; E.lit += lS;
    rec.appleOne = Math.max(rec.appleOne, a1); rec.appleGroup = Math.max(rec.appleGroup, aS); rec.cookOne = Math.max(rec.cookOne, c1); rec.cookGroup = Math.max(rec.cookGroup, cS); rec.litOne = Math.max(rec.litOne, l1); rec.litGroup = Math.max(rec.litGroup, lS);
    for (const k of Object.keys(d.days)) if (now() - Date.parse(k) > KEEP_DAYS * DAY) delete d.days[k];
    save();
    return true;
  }

  // JSON público: o mesmo texto serve a todos por alguns segundos; live vem de fora (salas abertas agora)
  function view(live) {
    const t = now();
    if (!cache || t - cacheAt > 5000) {
      const days = [];
      for (let i = SHOW_DAYS - 1; i >= 0; i--) { const k = dayKey(t - i * DAY), x = d.days[k] || { runs: 0, wins: 0 }; days.push({ d: k, runs: x.runs, wins: x.wins }); }
      const tt = d.tot;
      cache = {
        runs: tt.runs, wins: tt.wins, rate: tt.runs ? Math.round(tt.wins / tt.runs * 100) : 0,
        avgSec: tt.runs ? Math.round(tt.sec / tt.runs) : 0, meals: tt.meals, faints: tt.faints, avgPlayers: tt.runs ? Math.round(tt.players / tt.runs * 10) / 10 : 0,
        today: (d.days[dayKey(t)] || { runs: 0 }).runs,
        bestNights: Math.max(0, ...Object.values(d.worlds).map(w => w.best ? w.best.nights : 0)),
        worlds: Object.entries(d.worlds).map(([id, w]) => ({ id, runs: w.runs, wins: w.wins, best: w.best })).sort((a, b) => b.runs - a.runs),
        causes: Object.entries(d.causes).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n),
        dishes: Object.entries(d.dishes).map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n).slice(0, 5),
        days, apples: d.extra.apples, cooked: d.extra.cooked, lit: d.extra.lit, records: { ...d.extra.rec }
      };
      cacheAt = t;
    }
    return JSON.stringify({ ...cache, live, at: Math.floor(t / 1000) });
  }
  return { record, view, write, get totals() { return d.tot; } };
}

module.exports = { createSurvStats };
