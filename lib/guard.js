/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Antifraude da fazenda e da culinária. O servidor já decide tudo (receita, crescimento, colheita, preços), então o cliente não
 * consegue inventar experiência nem moedas. O que sobra para fraudar é repetir o que vale: robô clicando sem parar, uma pessoa
 * com muitas identidades para multiplicar o ganho, e farmar dia e noite. Este módulo olha o comportamento de cada jogador e responde
 * na proporção, sem punir quem joga normalmente:
 *
 * - Ritmo de robô: pessoas tocam em intervalos irregulares; um script repete o mesmo intervalo. Com 16 ações seguidas em menos de
 *   4 s cada e variação abaixo de 10% (coeficiente de variação dos intervalos), o jogador ganha pontos de suspeita. Ações demais
 *   num minuto (acima de `burst`) também somam.
 * - Suspeita: os pontos caem com o tempo (1 a cada 5 min). A partir de 5, o ganho (experiência e moedas) cai pela metade; a partir de
 *   10, as ações ficam paradas por 10 minutos ("descanso"). Ninguém perde o que já tem.
 * - Cansaço: ganho acima do teto diário (24 h corridas, por sistema) rende menos: metade acima do teto, um quinto acima do dobro.
 *   O corte é proporcional à parte de cada ganho que passa do teto (uma colheita gigante de uma vez não escapa dele).
 *   Jogar muito continua valendo, mas um robô ligado o dia todo não vale a pena.
 * - Identidades em série: cada origem (IP, /64 no IPv6) abre no máximo `newPerDay` fazendas e cozinhas novas por dia.
 * - Não há troca de moedas nem de itens entre jogadores, então contas extras não conseguem passar ganho para a principal.
 *
 * Tudo fica só na memória, com teto de jogadores (`max`, os mais antigos saem primeiro). O painel /status mostra os sinalizados
 * (código público encurtado, pontos e motivo), sem nome nem IP.
 */
'use strict';

const HOUR = 3600000;
const DAY = 24 * HOUR;

/**
 * @param {{now?: () => number, max?: number, caps?: Record<string, number>, burst?: number, newPerDay?: number}} [o]
 */
function createGuard({
  now = Date.now,
  max = 20000,
  caps = { farm: 6000, cook: 3000 },
  burst = 90,
  newPerDay = 3
} = {}) {
  /**
   * @typedef {{t: number[], score: number, at: number, until: number, why: string, gain: Record<string, number[]>,
   *   hour: number, seen: number}} P
   */
  /** @type {Map<string, P>} */
  const ps = new Map();
  /** @type {Map<string, number[]>} origem → quando abriu progresso novo */
  const fresh = new Map();
  const stats = { robo: 0, rajada: 0, descanso: 0, cansaco: 0, novos: 0 };

  function get(/** @type {string} */ pid) {
    let p = ps.get(pid);
    if (!p) {
      if (ps.size >= max) ps.delete(ps.keys().next().value);
      p = { t: [], score: 0, at: now(), until: 0, why: '', gain: {}, hour: Math.floor(now() / HOUR), seen: 0 };
      ps.set(pid, p);
    }
    // pontos caem 1 a cada 5 minutos
    const n = now(),
      drop = Math.floor((n - p.at) / 300000);
    if (drop > 0) {
      p.score = Math.max(0, p.score - drop);
      p.at += drop * 300000;
    }
    if (!p.score && p.until < n) p.why = '';
    return p;
  }
  function flag(/** @type {P} */ p, /** @type {number} */ pts, /** @type {string} */ why) {
    p.score += pts;
    p.why = why;
    if (p.score >= 10 && p.until < now()) {
      p.until = now() + 600000;
      stats.descanso++;
    }
  }

  /**
   * Antes de uma ação: parado em descanso? (o servidor responde 'descanso' com a espera em segundos)
   * @param {string} pid
   */
  function check(pid) {
    const p = get(pid),
      n = now();
    return p.until > n ? { ok: false, reason: 'descanso', wait: Math.ceil((p.until - n) / 1000) } : { ok: true };
  }

  /**
   * Depois de uma ação aceita: entra na análise de ritmo.
   * @param {string} pid
   */
  function act(pid) {
    const p = get(pid),
      n = now();
    p.t.push(n);
    if (p.t.length > 24) p.t.shift();
    // rajada: mais de `burst` ações no último minuto
    const lastMin = p.t.filter(x => n - x < 60000).length;
    if (p.t.length >= 24 && lastMin >= 24 && n - p.t[0] < (24 * 60000) / burst) {
      flag(p, 2, 'rajada');
      stats.rajada++;
      p.t.length = 0;
      return;
    }
    // ritmo de robô: 16 intervalos quase iguais e curtos
    if (p.t.length >= 17) {
      const iv = [];
      for (let i = p.t.length - 16; i < p.t.length; i++) iv.push(p.t[i] - p.t[i - 1]);
      const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
      const sd = Math.sqrt(iv.reduce((a, b) => a + (b - mean) * (b - mean), 0) / iv.length);
      if (mean < 4000 && mean > 0 && sd / mean < 0.1) {
        flag(p, 3, 'ritmo de robô');
        stats.robo++;
        p.t.length = 0;
      }
    }
  }

  /**
   * Quanto do ganho vale agora (0 a 1), pela suspeita e pelo cansaço do dia, e registra o ganho bruto.
   * @param {string} pid
   * @param {string} kind 'farm' ou 'cook'
   * @param {number} amount experiência de base desta ação (sem bônus de nível e de renascimento)
   * @param {number} [scale] o teto do dia vezes isto (a fazenda passa o tamanho do terreno: mais canteiros, mais ganho legítimo)
   */
  function factor(pid, kind, amount, scale = 1) {
    const p = get(pid),
      h = Math.floor(now() / HOUR);
    // ganho por hora nas últimas 24 h (24 posições que giram)
    const g = p.gain[kind] || (p.gain[kind] = new Array(24).fill(0));
    for (let k = p.hour + 1; k <= h && k <= p.hour + 24; k++) for (const key in p.gain) p.gain[key][k % 24] = 0;
    p.hour = Math.max(p.hour, h);
    const day = g.reduce((a, b) => a + b, 0),
      cap = (caps[kind] || Infinity) * Math.max(1, scale);
    // O corte vale para a PARTE do ganho que passa do teto: até o teto vale inteiro, do teto ao dobro vale metade, acima do dobro
    // um quinto. Antes o fator saía só do que já tinha sido ganho, então uma colheita enorme de uma vez (muitos canteiros de planta
    // demorada) passava inteira mesmo estourando o teto.
    const amt = Math.max(0, amount);
    let f = day >= cap * 2 ? 0.2 : day >= cap ? 0.5 : 1;
    if (amt > 0 && Number.isFinite(cap)) {
      const part = (/** @type {number} */ lo, /** @type {number} */ hi) =>
        Math.max(0, Math.min(day + amt, hi) - Math.max(day, lo));
      f = (part(0, cap) + part(cap, cap * 2) * 0.5 + part(cap * 2, Infinity) * 0.2) / amt;
    }
    if (f < 1) stats.cansaco++;
    if (p.score >= 5) f *= 0.5;
    if (p.until > now()) f = 0;
    g[h % 24] += Math.max(0, amount);
    return f;
  }

  /**
   * Uma origem pode abrir progresso novo (fazenda ou cozinha) hoje? Só confere; `opened` registra quando o progresso nasce de
   * fato (uma receita que deu certo, a primeira planta), para tentativa que falha não gastar a vaga.
   * @param {string} origin chave da origem (IP, ou bloco IPv6)
   * @param {string} kind
   */
  function mayOpen(origin, kind) {
    const k = kind + '|' + origin,
      n = now(),
      list = (fresh.get(k) || []).filter(x => n - x < DAY);
    fresh.set(k, list);
    if (list.length < newPerDay) return true;
    stats.novos++;
    return false;
  }
  function opened(/** @type {string} */ origin, /** @type {string} */ kind) {
    const k = kind + '|' + origin;
    (fresh.get(k) || fresh.set(k, []).get(k) || []).push(now());
    if (fresh.size > max) fresh.delete(fresh.keys().next().value);
  }

  /** Para o painel: sinalizados (código encurtado, pontos, motivo, descanso) e contadores. */
  function report() {
    const n = now(),
      list = [];
    for (const [pid] of ps) {
      const p = get(pid);
      if (p.score > 0 || p.until > n)
        list.push({
          id: pid.slice(0, 8),
          score: p.score,
          why: p.why,
          rest: p.until > n ? Math.ceil((p.until - n) / 1000) : 0
        });
    }
    list.sort((a, b) => b.score - a.score);
    return { watched: list.length, resting: list.filter(x => x.rest).length, top: list.slice(0, 20), ...stats };
  }

  return { check, act, factor, mayOpen, opened, report, size: () => ps.size };
}

module.exports = { createGuard };
