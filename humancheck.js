'use strict';
// Prova de presença humana do modo Sobrevivência, leve e sem atrapalhar o jogo:
// - só aparece depois de `first` segundos de rodada (rodadas curtas nunca são interrompidas) e depois a cada `every` segundos (com sorteio);
// - é um chip pequeno, que não pausa nada: uma conta simples, "qual é o maior" ou "toque na figura" (30 s para responder, 3 tentativas);
// - quem não responde (ou responde rápido demais para ler) NÃO é punido no jogo: a rodada só deixa de contar para o ranking, os recordes e as conquistas dele;
// - a resposta certa fica só no servidor.
// Isso dificulta farmar o ranking com programas; não é à prova de um robô feito de propósito, por isso o efeito é só nas estatísticas.
const CFG = { first: 600, every: 900, jitter: 180, window: 45, tries: 3, minReact: 700, retry: 240 };
const FIGURAS = [['🍎', 'maçã'], ['🔥', 'fogueira'], ['💧', 'gota de água'], ['🍄', 'cogumelo'], ['🪵', 'tronco'], ['🥔', 'raiz'], ['🌿', 'folha'], ['🍲', 'panela']];

const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const shuffle = (rng, l) => { const a = l.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// desafio novo: { kind, q, opts?, ans } (ans nunca sai do servidor)
function make(rng) {
  const kind = ['soma', 'maior', 'figura'][ri(rng, 0, 2)];
  if (kind === 'soma') {
    // sempre com 4 botões (nada de digitar: o teclado do jogo é o WASD e no celular o teclado cobriria a tela)
    const soma = rng() < .5, a = soma ? ri(rng, 6, 29) : ri(rng, 3, 9), b = soma ? ri(rng, 6, 29) : ri(rng, 2, 9), certa = soma ? a + b : a * b;
    const outras = new Set(); while (outras.size < 3) { const d = ri(rng, 1, 6) * (rng() < .5 ? -1 : 1), v = certa + d; if (v > 0 && v !== certa) outras.add(v); }
    return { kind, q: `${a} ${soma ? '+' : '×'} ${b} = ?`, opts: shuffle(rng, [certa, ...outras]).map(String), ans: String(certa) };
  }
  if (kind === 'maior') {
    const n = new Set(); while (n.size < 3) n.add(ri(rng, 10, 99));
    const l = shuffle(rng, [...n]); return { kind, q: 'Qual número é o maior?', opts: l.map(String), ans: String(Math.max(...l)) };
  }
  const f = shuffle(rng, FIGURAS).slice(0, 4), alvo = f[ri(rng, 0, 3)];
  return { kind, q: `Toque na figura: ${alvo[1]}`, opts: f.map(x => x[0]), ans: alvo[0] };
}

const create = () => ({ next: null, pending: null, issued: 0, passed: 0, missed: 0, fast: 0, seq: 0 });

// chamada a cada tique da rodada: devolve { ch } para enviar um desafio novo e/ou { miss } se o anterior venceu o prazo
function poll(h, t, now, rng, cfg = CFG) {
  const out = {};
  if (h.pending && now > h.pending.until) { h.missed++; h.pending = null; h.next = t + cfg.retry; out.miss = true; }
  if (h.pending) return out;
  if (h.next === -1) h.next = t + cfg.retry; // depois de perder o prazo, tenta de novo mais tarde
  if (h.next === null) h.next = cfg.first + rng() * cfg.jitter;
  if (t >= h.next) {
    const c = make(rng); h.seq++; h.issued++;
    h.pending = { id: h.seq, ans: c.ans, tries: 0, at: now, until: now + cfg.window * 1000 };
    h.next = t + cfg.every + (rng() - .5) * 2 * cfg.jitter;
    out.ch = { id: h.seq, kind: c.kind, q: c.q, opts: c.opts || null, sec: cfg.window };
  }
  return out;
}

// resposta do jogador: { ok, done, why }. Certa mas rápida demais (menos que um humano leva para ler) vale como erro.
function answer(h, id, v, now, cfg = CFG) {
  const p = h.pending;
  if (!p || p.id !== id) return { ok: false, done: false, why: 'sem_desafio' };
  if (now > p.until) { h.missed++; h.pending = null; h.next = -1; return { ok: false, done: true, why: 'tempo' }; }
  const certa = typeof v === 'string' && v === p.ans;
  if (certa && now - p.at >= cfg.minReact) { h.passed++; h.pending = null; return { ok: true, done: true }; }
  if (certa) h.fast++;
  if (++p.tries >= cfg.tries) { h.missed++; h.pending = null; return { ok: false, done: true, why: certa ? 'rapido' : 'erros' }; }
  return { ok: false, done: false, why: certa ? 'rapido' : 'errada' };
}

// a rodada do jogador vale para o perfil/ranking? Rodada curta nunca é cobrada; depois de `first` segundos, precisa ter passado e não ter falhado
function verified(h, sec, cfg = CFG) {
  if (sec < cfg.first) return true;
  return h.missed === 0 && h.passed >= 1;
}

module.exports = { CFG, make, create, poll, answer, verified, FIGURAS };
