'use strict';
// Páginas pessoais de estatísticas (modo Sobrevivência): só existem para quem criou a página (opt-in) e só são vistas por quem tem o
// link com o código de visualização. O servidor nunca guarda o segredo do jogador, só o código derivado dele (SKYREC.viewCode).
// Guarda totais e as últimas rodadas; sai sozinho depois de `ttlMs` sem atividade e pode ser apagado a qualquer momento.
const { readJsonFile, writeJsonAtomic } = require('./persist');
const ACH = require('./assets/catalog.js').SURV.ach;

const DAY = 86400000, CODE_RE = /^[0-9A-HJKMNP-TV-Z]{16}$/, KEEP = 10, KEY = /^[a-z][a-z0-9_.]{0,30}$/, MAXKEYS = 80;
const num = v => Number.isFinite(v) && v >= 0 ? Math.min(v, 1e9) : 0, ts = v => Number.isFinite(v) && v >= 0 ? v : 0; // ts: carimbo de tempo em segundos (passa de 1e9)
const cleanName = s => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) : '';

const nums = o => { const out = {}; let n = 0; for (const [k, v] of Object.entries(o && typeof o === 'object' ? o : {})) if (KEY.test(k) && n++ < MAXKEYS) out[k] = num(v); return out; };
function createPlayerStats({ ach = ACH, file, ttlMs = 365 * DAY, max = 50000, onError = () => {}, warn = () => {}, now = Date.now, delayMs = 5000 }) {
  const M = new Map();
  const unlocked = o => { const out = {}; for (const a of ach) if (o && typeof o === 'object' && Number.isFinite(o[a.id])) out[a.id] = o[a.id]; return out; };
  let dirty = false, timer = null;
  if (file) {
    try {
      const j = readJsonFile(file);
      for (const [k, x] of Object.entries(j && j.players || {})) {
        if (!CODE_RE.test(k) || !x || now() - ts(x.at) * 1000 > ttlMs) continue;
        M.set(k, { name: cleanName(x.name), runs: num(x.runs), wins: num(x.wins), best: num(x.best), meals: num(x.meals), faints: num(x.faints), revives: num(x.revives), at: ts(x.at), t: nums(x.t), r: nums(x.r), a: unlocked(x.a),
          last: (Array.isArray(x.last) ? x.last : []).slice(0, KEEP).map(r => ({ at: ts(r.at), ok: r.ok ? 1 : 0, nights: num(r.nights), target: num(r.target), sec: num(r.sec), players: num(r.players), world: typeof r.world === 'string' ? r.world.slice(0, 20) : '' })) });
        if (M.size >= max) break;
      }
    } catch (e) { warn('páginas pessoais: arquivo inválido, começando do zero.'); M.clear(); }
  }
  const touch = x => { x.at = Math.floor(now() / 1000); };
  function write() { if (!file || !dirty) return; dirty = false; try { writeJsonAtomic(file, { v: 1, players: Object.fromEntries(M) }); } catch (e) { onError('páginas pessoais', e); } }
  function save() { dirty = true; if (timer) return; timer = setTimeout(() => { timer = null; write(); }, delayMs); if (timer.unref) timer.unref(); }

  // cria a página (ou só atualiza o nome); false se o código for inválido ou o limite de páginas acabou
  function register(code, name) {
    if (!CODE_RE.test(code)) return false;
    let x = M.get(code);
    if (!x) { if (M.size >= max) return false; x = { name: '', runs: 0, wins: 0, best: 0, meals: 0, faints: 0, revives: 0, at: 0, last: [], t: {}, r: {}, a: {} }; M.set(code, x); }
    x.name = cleanName(name) || x.name; touch(x); save(); return true;
  }
  function record(code, name, run) {
    const x = M.get(code); if (!x) return false;
    x.name = cleanName(name) || x.name;
    x.runs++; if (run.ok) x.wins++; x.best = Math.max(x.best, num(run.nights));
    x.meals += num(run.meals); x.faints += num(run.faints); x.revives += num(run.revives);
    x.last.unshift({ at: Math.floor(now() / 1000), ok: run.ok ? 1 : 0, nights: num(run.nights), target: num(run.target), sec: num(run.sec), players: num(run.players), world: String(run.world || '').slice(0, 20) });
    x.last.length = Math.min(x.last.length, KEEP);
    // contadores: total de todas as rodadas (t) e melhor rodada (r); win e night são somados aqui
    const ct = { ...(run.ct && typeof run.ct === 'object' ? run.ct : {}), win: run.ok ? 1 : 0, night: num(run.nights) };
    for (const [k, v] of Object.entries(ct)) {
      const n = num(v); if (!KEY.test(k) || !n || (!(k in x.t) && Object.keys(x.t).length >= MAXKEYS)) continue;
      x.t[k] = num((x.t[k] || 0) + n); x.r[k] = Math.max(x.r[k] || 0, n);
    }
    // conquistas novas desta rodada
    const novas = [], now_ = Math.floor(now() / 1000);
    for (const a of ach) if (!x.a[a.id] && (a.run ? x.r[a.m] || 0 : x.t[a.m] || 0) >= a.goal) { x.a[a.id] = now_; novas.push(a.id); }
    touch(x); save(); return novas;
  }
  const get = code => {
    const x = CODE_RE.test(code) && M.get(code); if (!x) return null;
    const list = ach.map(a => ({ id: a.id, ic: a.ic, n: a.n, d: a.d, goal: a.goal, run: a.run ? 1 : 0, prog: Math.min(a.goal, a.run ? x.r[a.m] || 0 : x.t[a.m] || 0), done: x.a[a.id] || 0, c: a.c, cn: a.cn }));
    return { name: x.name, runs: x.runs, wins: x.wins, best: x.best, meals: x.meals, faints: x.faints, revives: x.revives, last: x.last, at: x.at,
      ach: list, coll: list.filter(a => a.done).map(a => ({ c: a.c, cn: a.cn, from: a.n })),
      rec: { cook: x.r.cook || 0, apple: x.r['col.fruta'] || 0, lit: x.r.lit || 0, water: x.r['col.agua'] || 0 },
      tot: { cook: x.t.cook || 0, apple: x.t['col.fruta'] || 0, lit: x.t.lit || 0, water: x.t['col.agua'] || 0, give: x.t.give || 0 } };
  };
  const has = code => CODE_RE.test(code) && M.has(code);
  const remove = code => { if (!M.delete(code)) return false; save(); return true; };
  // "gerar novo link": o histórico vai para o código novo e o antigo deixa de existir
  function move(from, to) { if (!CODE_RE.test(to) || to === from || M.has(to) || !M.has(from)) return false; M.set(to, M.get(from)); M.delete(from); save(); return true; }
  function prune() { const lim = now() - ttlMs; let n = 0; for (const [k, x] of M) if (x.at * 1000 < lim) { M.delete(k); n++; } if (n) save(); return n; }
  return { register, record, get, has, remove, move, prune, write, get size() { return M.size; } };
}

module.exports = { createPlayerStats, CODE_RE };
