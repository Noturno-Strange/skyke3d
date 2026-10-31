'use strict';
// Páginas dos jogadores do modo Sobrevivência (públicas e listadas no ranking): só existem para quem criou a página (opt-in).
// O servidor nunca guarda o segredo do jogador, só o código derivado dele (SKYREC.viewCode).
// Regras do ranking: nome limpo (sem palavrão nem ódio) e único; ninguém sai do ranking sozinho por inatividade (só páginas que nunca jogaram expiram);
// só sai quem pede para sair ou quem foi banido por violar as regras (lista de banimento do ranking, por código e por nome).
const { readJsonFile, writeJsonAtomic } = require('./persist');
const ACH = require('./assets/catalog.js').SURV.ach;
const { badName, nameKey } = require('./profanity');

const DAY = 86400000, CODE_RE = /^[0-9A-HJKMNP-TV-Z]{16}$/, KEEP = 10, KEY = /^[a-z][a-z0-9_.]{0,30}$/, MAXKEYS = 80;
const num = v => Number.isFinite(v) && v >= 0 ? Math.min(v, 1e9) : 0, ts = v => Number.isFinite(v) && v >= 0 ? v : 0; // ts: carimbo de tempo em segundos (passa de 1e9)
const cleanName = s => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) : '';

const nums = o => { const out = {}; let n = 0; for (const [k, v] of Object.entries(o && typeof o === 'object' ? o : {})) if (KEY.test(k) && n++ < MAXKEYS) out[k] = num(v); return out; };
function createPlayerStats({ ach = ACH, file, ttlMs = 365 * DAY, max = 50000, onError = () => {}, warn = () => {}, now = Date.now, delayMs = 5000 }) {
  const M = new Map(), byName = new Map(), bans = new Map(); // byName: chave do nome → código; bans: código → { code, name, key, why, at }
  const unlocked = o => { const out = {}; for (const a of ach) if (o && typeof o === 'object' && Number.isFinite(o[a.id])) out[a.id] = o[a.id]; return out; };
  let dirty = false, timer = null;
  if (file) {
    try {
      const j = readJsonFile(file);
      for (const [k, x] of Object.entries(j && j.players || {})) {
        if (!CODE_RE.test(k) || !x || now() - ts(x.at) * 1000 > ttlMs) continue;
        M.set(k, { name: cleanName(x.name), runs: num(x.runs), best: num(x.best), meals: num(x.meals), faints: num(x.faints), revives: num(x.revives), at: ts(x.at), t: nums(x.t), r: nums(x.r), a: unlocked(x.a),
          last: (Array.isArray(x.last) ? x.last : []).slice(0, KEEP).map(r => ({ at: ts(r.at), nights: num(r.nights), sec: num(r.sec), players: num(r.players), world: typeof r.world === 'string' ? r.world.slice(0, 20) : '' })) });
        const e = M.get(k); const key = nameKey(e.name); if (key && !byName.has(key)) byName.set(key, k);
        if (M.size >= max) break;
      }
      for (const b of Array.isArray(j && j.banned) ? j.banned : []) if (b && CODE_RE.test(b.code)) bans.set(b.code, { code: b.code, name: cleanName(b.name), key: typeof b.key === 'string' ? b.key.slice(0, 40) : '', why: typeof b.why === 'string' ? b.why.slice(0, 80) : '', at: ts(b.at) });
    } catch (e) { warn('páginas pessoais: arquivo inválido, começando do zero.'); M.clear(); byName.clear(); bans.clear(); }
  }
  const touch = x => { x.at = Math.floor(now() / 1000); };
  function write() { if (!file || !dirty) return; dirty = false; try { writeJsonAtomic(file, { v: 1, players: Object.fromEntries(M), banned: [...bans.values()] }); } catch (e) { onError('páginas pessoais', e); } }
  function save() { dirty = true; if (timer) return; timer = setTimeout(() => { timer = null; write(); }, delayMs); if (timer.unref) timer.unref(); }

  // nome do ranking: limpo, não banido e que ninguém mais use (a chave ignora acento, maiúscula, separador, letra repetida e troca por número)
  const bannedKeys = () => new Set([...bans.values()].map(b => b.key).filter(Boolean));
  function nameCheck(code, name) {
    const n = cleanName(name); if (!n) return { empty: true };
    if (badName(n).bad) return { err: 'nome_improprio' };
    const k = nameKey(n); if (!k || bannedKeys().has(k)) return { err: 'nome_improprio' };
    const o = byName.get(k); if (o && o !== code && M.has(o)) return { err: 'nome_em_uso' };
    return { name: n, key: k };
  }
  // devolve o motivo de recusa ou '' (nome vazio é ignorado: fica o que já havia)
  function setName(code, x, name) {
    const c = nameCheck(code, name); if (c.err) return c.err; if (c.empty) return '';
    const antigo = nameKey(x.name); if (antigo && byName.get(antigo) === code) byName.delete(antigo);
    x.name = c.name; byName.set(c.key, code); return '';
  }

  // cria a página (ou atualiza o nome): { ok, err?, kept? }. kept = a página existe, mas o nome pedido foi recusado e ficou o antigo.
  function register(code, name) {
    if (!CODE_RE.test(code)) return { ok: false, err: 'invalido' };
    if (bans.has(code)) return { ok: false, err: 'banido' };
    let x = M.get(code);
    if (!x) {
      const c = nameCheck(code, name); if (c.err) return { ok: false, err: c.err }; if (c.empty) return { ok: false, err: 'nome_improprio' };
      if (M.size >= max) return { ok: false, err: 'limite' };
      x = { name: '', runs: 0, best: 0, meals: 0, faints: 0, revives: 0, at: 0, last: [], t: {}, r: {}, a: {} }; M.set(code, x); setName(code, x, name);
      touch(x); save(); return { ok: true };
    }
    const e = setName(code, x, name); touch(x); save();
    return e ? { ok: true, kept: e } : { ok: true };
  }
  function record(code, name, run) {
    const x = M.get(code); if (!x) return false;
    setName(code, x, name); // se o nome mudou para um recusado, fica o antigo
    x.runs++; const pb = num(run.sec) > x.best; x.best = Math.max(x.best, num(run.sec));
    x.meals += num(run.meals); x.faints += num(run.faints); x.revives += num(run.revives);
    x.last.unshift({ at: Math.floor(now() / 1000), nights: num(run.nights), sec: num(run.sec), players: num(run.players), world: String(run.world || '').slice(0, 20) });
    x.last.length = Math.min(x.last.length, KEEP);
    // contadores: total de todas as rodadas (t) e melhor rodada (r); time e night são somados aqui
    const ct = { ...(run.ct && typeof run.ct === 'object' ? run.ct : {}), time: num(run.sec), night: num(run.nights) };
    for (const [k, v] of Object.entries(ct)) {
      const n = num(v); if (!KEY.test(k) || !n || (!(k in x.t) && Object.keys(x.t).length >= MAXKEYS)) continue;
      x.t[k] = num((x.t[k] || 0) + n); x.r[k] = Math.max(x.r[k] || 0, n);
    }
    // conquistas novas desta rodada
    const novas = [], now_ = Math.floor(now() / 1000);
    for (const a of ach) if (!x.a[a.id] && (a.run ? x.r[a.m] || 0 : x.t[a.m] || 0) >= a.goal) { x.a[a.id] = now_; novas.push(a.id); }
    touch(x); save(); return { ach: novas, pb };
  }
  const get = code => {
    const x = CODE_RE.test(code) && M.get(code); if (!x) return null;
    const list = ach.map(a => ({ id: a.id, ic: a.ic, n: a.n, d: a.d, goal: a.goal, run: a.run ? 1 : 0, prog: Math.min(a.goal, a.run ? x.r[a.m] || 0 : x.t[a.m] || 0), done: x.a[a.id] || 0, c: a.c, cn: a.cn }));
    return { name: x.name, runs: x.runs, best: x.best, meals: x.meals, faints: x.faints, revives: x.revives, last: x.last, at: x.at,
      ach: list, coll: list.filter(a => a.done).map(a => ({ c: a.c, cn: a.cn, from: a.n })),
      rec: { cook: x.r.cook || 0, apple: x.r['col.fruta'] || 0, lit: x.r.lit || 0, water: x.r['col.agua'] || 0 },
      tot: { sec: x.t.time || 0, cook: x.t.cook || 0, apple: x.t['col.fruta'] || 0, lit: x.t.lit || 0, water: x.t['col.agua'] || 0, give: x.t.give || 0 } };
  };
  // ranking público: quem já jogou pelo menos uma rodada, do maior tempo sobrevivido para o menor
  const top = (n = 50) => [...M.entries()].filter(([, x]) => x.runs > 0 && x.name).sort((a, b) => b[1].best - a[1].best || b[1].runs - a[1].runs)
    .slice(0, n).map(([code, x]) => ({ code, name: x.name, best: x.best, runs: x.runs, ach: Object.keys(x.a).length, total: ach.length }));
  const has = code => CODE_RE.test(code) && M.has(code);
  // sair do ranking por vontade própria (definitivo): libera o nome; quem foi banido continua banido
  const remove = code => { const x = M.get(code); if (!x) return false; const k = nameKey(x.name); if (k && byName.get(k) === code) byName.delete(k); M.delete(code); save(); return true; };
  // "gerar novo link": o histórico vai para o código novo e o antigo deixa de existir
  function move(from, to) {
    if (!CODE_RE.test(to) || to === from || M.has(to) || !M.has(from) || bans.has(to) || bans.has(from)) return false;
    M.set(to, M.get(from)); M.delete(from); const k = nameKey(M.get(to).name); if (k && byName.get(k) === from) byName.set(k, to); save(); return true;
  }
  // só expira a página que nunca jogou (sem lugar no ranking); quem já jogou fica até pedir para sair ou ser banido
  function prune() { const lim = now() - ttlMs; let n = 0; for (const [k, x] of M) if (x.runs === 0 && x.at * 1000 < lim) { const nk = nameKey(x.name); if (nk && byName.get(nk) === k) byName.delete(nk); M.delete(k); n++; } if (n) save(); return n; }
  // lista de banimento do ranking (por quem tem as regras violadas): tira do ranking, bloqueia o código e o nome
  function ban(code, why) {
    if (!CODE_RE.test(code)) return false;
    const x = M.get(code); bans.set(code, { code, name: x ? x.name : '', key: x ? nameKey(x.name) : '', why: String(why || '').slice(0, 80), at: Math.floor(now() / 1000) });
    if (x) { const k = nameKey(x.name); if (k && byName.get(k) === code) byName.delete(k); M.delete(code); }
    save(); return true;
  }
  const unban = code => { if (!bans.delete(code)) return false; save(); return true; };
  const banned = () => [...bans.values()].sort((a, b) => b.at - a.at);
  const all = () => [...M.entries()].map(([code, x]) => ({ code, name: x.name, runs: x.runs, best: x.best, at: x.at })).sort((a, b) => b.best - a.best || b.runs - a.runs);
  return { register, record, get, has, top, remove, move, prune, ban, unban, banned, all, write, get size() { return M.size; } };
}

module.exports = { createPlayerStats, CODE_RE };
