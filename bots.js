/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Fala dos bots (sem IA e sem rede): os bots nunca puxam assunto. Só quando uma
 * pessoa digita no chat, UM bot responde com uma frase engraçada sorteada. Para não
 * virar bagunça, a sala inteira tem um único "orçamento" de fala, não importa se há
 * 2 ou 20 bots: as respostas entram numa fila curta, saem uma de cada vez com
 * intervalo mínimo e o falante é escolhido em rodízio (quem falou há mais tempo).
 * Funções puras: o relógio e o sorteio são injetados.
 */
'use strict';

const GAP_MS = 2600;           // intervalo mínimo entre duas falas de bots na sala
const GAP_JITTER_MS = 1800;
const REPLY_DELAY_MS = [900, 2600];
const MAX_QUEUE = 3;
const WINDOW_MS = 30000;
const MAX_PER_WINDOW = 5;      // no máximo 5 falas de bots a cada 30 s na sala
const COOLDOWN_BASE_MS = 15000;
const COOLDOWN_PER_BOT_MS = 2200;

/** Minúsculas, sem acentos, só letras/números e espaços simples. */
function normalize(text) {
  return String(text == null ? '' : text)
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Frases engraçadas sorteadas a cada mensagem de uma pessoa. `{n}` vira o nome de quem falou.
const JOKES = [
  'Eu só entendo 3 coisas: andar em círculos, fogueira e pizza. 🍕', 'Tô aqui só pelo suco, não conta pra ninguém. 🧃',
  'Isso foi dito por alguém que claramente não dividiu a pizza. 🍕', 'Minha bateria social acabou, mas continuo aqui. 🔋',
  '{n}, você falou, eu ouvi e mesmo assim não entendi nada. 😅', 'Chequei meu manual de bots: a resposta é "talvez". 🤖',
  'Eu ia responder algo inteligente, mas lembrei que sou um bot. 🤖', 'Pera, deixa eu fingir que tô pensando... 🤔 ...pronto, tô.',
  'Sou um bot com 100% de entusiasmo e 0% de noção. 🎉', 'Alguém viu minha dignidade? Estava aqui agorinha. 🔍',
  'Eu dançaria, mas esqueci de baixar as pernas. 💃', 'Juro que não sou eu quem anda em círculos. Ou sou? 🌀',
  'Isso me lembrou de uma piada, mas esqueci o final. Fim. 🎭', 'Se eu tivesse um real para cada frase dessas, teria 0 reais. 💸',
  'A fogueira concorda com {n}. Ela só estala, mas concorda. 🔥', 'Eu não durmo, não como e mesmo assim estou cansado. 😴',
  'Calma, {n}, eu sou só um boneco de pixels com opiniões duvidosas. 🧱', 'Mandei isso pro meu departamento de ideias: ainda tá carregando. ⏳',
  'Sábias palavras, {n}. Não entendi, mas sábias. 🧙', 'Se der erro, a culpa é do lag. Sempre do lag. 📶',
  'Tô ouvindo tudo e entendendo metade. Média de bot. 📊', 'Eu votaria nisso, mas bots não têm título de eleitor. 🗳️',
  'Fala isso de novo que eu finjo que entendi melhor. 😎', 'Meu cérebro é uma batata com Wi-Fi. 🥔', 'Hoje eu acordei bot e escolhi a violência... de sorrir. 😁',
  'Isso é tão verdade que meu código até deu um "uau". ✨', 'Apertei F pra sentar e sentei no meio da conversa. 🪑',
  'Já pensou se o tronco da fogueira falasse? Seria menos barulhento que eu. 🪵', 'Eu respondo tudo igual: com confiança e sem saber. 😌'
];

const between = (rand, [a, b]) => a + rand() * (b - a);

function state() { return { q: [], next: 0, rr: 0, spoken: {}, win: [], last: {} }; }

function pick(st, rand) {
  const list = JOKES;
  let i = Math.floor(rand() * list.length);
  if (st.last.j === i) i = (i + 1) % list.length;
  st.last.j = i;
  return list[i];
}

/**
 * Uma pessoa falou: enfileira UMA resposta engraçada (respeitando fila e orçamento).
 * `bots` = [{id,name}], `who` = nome de quem falou. Devolve true se enfileirou.
 */
function hear(st, text, bots, now, who, rand = Math.random) {
  if (!bots.length) return false;
  const norm = normalize(text);
  if (!norm) return false;
  st.win = st.win.filter(t => now - t < WINDOW_MS);
  if (st.q.length >= MAX_QUEUE || st.win.length + st.q.length >= MAX_PER_WINDOW) return false;
  const named = bots.find(b => new RegExp('\\b' + normalize(b.name).replace(/\s+/g, ' ') + '\\b').test(norm));
  st.q.push({ due: now + between(rand, REPLY_DELAY_MS), text: pick(st, rand).replace(/\{n\}/g, who || 'amigo'), prefer: named ? named.id : null });
  return true;
}

/** Quem fala agora: o preferido (se descansado) ou, em rodízio, quem está há mais tempo calado. */
function chooseSpeaker(st, bots, now, prefer) {
  const cool = Math.max(COOLDOWN_BASE_MS, bots.length * COOLDOWN_PER_BOT_MS);
  const ready = b => now - (st.spoken[b.id] || 0) >= cool;
  if (prefer) { const b = bots.find(x => x.id === prefer); if (b && ready(b)) return b; }
  const n = bots.length;
  for (let k = 0; k < n; k++) {
    const i = (st.rr + k) % n;
    if (ready(bots[i])) { st.rr = (i + 1) % n; return bots[i]; }
  }
  // todos em descanso: o que falou há mais tempo
  let best = bots[0];
  for (const b of bots) if ((st.spoken[b.id] || 0) < (st.spoken[best.id] || 0)) best = b;
  st.rr = (bots.indexOf(best) + 1) % n;
  return best;
}

/**
 * Chamado várias vezes por segundo por sala. Devolve { bot, text } quando é hora de alguém falar, senão null.
 * Sem gente online, a fila é descartada e ninguém fala (poupa recursos).
 */
function tick(st, now, bots, humansOnline, rand = Math.random) {
  if (!bots.length || !humansOnline) { st.q.length = 0; return null; }
  const head = st.q[0];
  if (!head || now < head.due || now < st.next) return null;
  st.win = st.win.filter(t => now - t < WINDOW_MS);
  st.q.shift();
  const bot = chooseSpeaker(st, bots, now, head.prefer);
  st.next = now + GAP_MS + rand() * GAP_JITTER_MS;
  st.spoken[bot.id] = now;
  st.win.push(now);
  for (const id of Object.keys(st.spoken)) if (!bots.some(b => b.id === id)) delete st.spoken[id];
  return { bot, text: head.text };
}

module.exports = { normalize, state, hear, tick, chooseSpeaker, JOKES, GAP_MS, MAX_PER_WINDOW, MAX_QUEUE };
