/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Fala dos bots por mapeamento de palavras-chave (sem IA e sem rede): cada frase
 * de uma pessoa é normalizada e comparada com uma tabela de padrões; o primeiro
 * padrão que casa escolhe uma resposta pronta. Para poupar recursos e não virar
 * bagunça, a sala inteira tem um único "orçamento" de fala, não importa se há 2
 * ou 20 bots: as respostas entram numa fila curta, saem uma de cada vez com
 * intervalo mínimo e o falante é escolhido em rodízio (quem falou há mais tempo).
 * Funções puras: o relógio e o sorteio são injetados.
 */
'use strict';

const GAP_MS = 2600;           // intervalo mínimo entre duas falas de bots na sala
const GAP_JITTER_MS = 1800;
const REPLY_DELAY_MS = [900, 2600];
const AMBIENT_MS = [18000, 38000];
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

// Cada regra: padrão sobre o texto normalizado → respostas. `{n}` vira o nome de quem falou.
const RULES = [
  { id: 'tchau', re: /\b(tchau|flw|falou|ate (mais|logo|amanha)|vou nessa|fui|bye|good ?bye)\b/, say: ['Tchau, {n}! Volta logo! 👋', 'Até mais, {n}!', 'Falou! Foi bom te ver por aqui.'] },
  { id: 'obrigado', re: /\b(obrigad[oa]s?|valeu|vlw|brigad[oa]|thanks|thx)\b/, say: ['De nada, {n}! 😄', 'Tamo junto!', 'Imagina, sempre às ordens.'] },
  { id: 'parabens', re: /\b(parabens|feliz aniversario|niver)\b/, say: ['Parabéns! 🎉🎂', 'Feliz aniversário! Vamos cantar?', 'Que dia especial! 🎉'] },
  { id: 'karaoke', re: /\b(karaoke|karaok[eê]|cantar|cantora?|microfone|mic)\b/, say: ['Eu quero cantar também! 🎤', 'Bora pro karaokê! Cole o link de uma música.', 'Quem vai abrir o karaokê hoje?'] },
  { id: 'dj', re: /\b(dj|radio|streaming|icecast|ouvir musica)\b/, say: ['Rádio na sala? Adoro! 🎧', 'Coloca uma música animada, DJ!', 'Abre o painel do DJ que a gente escuta.'] },
  { id: 'musica', re: /\b(musica|musicas|som|playlist|banda|cantor)\b/, say: ['Música boa faz o dia melhor 🎶', 'Qual música você curte?', 'Eu também amo música!'] },
  { id: 'video', re: /\b(video|videos|filme|assistir|youtube|serie|clipe)\b/, say: ['Vamos assistir juntos? 🎬', 'Cola um link do YouTube em Música/Vídeo!', 'Boa ideia, eu topo ver um vídeo.'] },
  { id: 'comida', re: /\b(fome|comida|lanche|pizza|suco|pocao|pocoes|cupcake|biscoito|sorvete|maca|comer|beber|sede)\b/, say: ['Já provou o suco? Abre a mochila! 🎒', 'Tô com fome também... 🍕', 'As poções da mochila são ótimas! ✨'] },
  { id: 'danca', re: /\b(danca|dancar|dancando|baile|balada|festa)\b/, say: ['Bora dançar! 💃', 'Usa os gestos 🎭 pra dançar!', 'Festa na fogueira! 🔥'] },
  { id: 'fogueira', re: /\b(fogueira|fogo|lenha|tronco|troncos|acampamento)\b/, say: ['A fogueira tá linda 🔥', 'Senta num tronco e relaxa.', 'Cuidado pra não chegar muito perto do fogo!'] },
  { id: 'mundo', re: /\b(cenario|mundo|mundos|planeta|planetas|espaco|estrelas?|lua)\b/, say: ['São dezesseis mundos, já viu todos? 🪐', 'Esse cenário é lindo!', 'Troca de mundo pra ver os outros planetas.'] },
  { id: 'ajuda', re: /\b(ajuda|como (jogo|joga|faz|funciona)|tutorial|nao sei|duvida|socorro)\b/, say: ['Dá uma olhada no Tutorial na tela inicial! 📖', 'Use WASD pra andar e F pra sentar.', 'Pergunta aí que a gente ajuda!'] },
  { id: 'bot', re: /\b(bot|bots|robo|robos|ia|inteligencia artificial)\b/, say: ['Sou um bot, mas sou simpático! 🤖', 'Bot com orgulho! 🤖', 'Só sei algumas palavrinhas, mas tô aqui!'] },
  { id: 'estado', re: /\b(tudo bem|como (vai|esta|voce)|td bem|blz|beleza|e voce|suave)\b/, say: ['Tudo ótimo, e você, {n}?', 'Tudo bem por aqui! 😊', 'Beleza! Curtindo a sala.'] },
  { id: 'elogio', re: /\b(legal|lindo|linda|incrivel|top|massa|show|demais|gostei|amei|maravilh\w+)\b/, say: ['Também achei demais! ✨', 'Concordo, tá incrível.', 'Aqui é sempre assim, {n}! 😄'] },
  { id: 'risada', re: /\b(k{3,}|ha(ha)+|he(he)+|rs+|lol|kkk+)\b/, say: ['Hahaha 😂', 'Kkkk muito bom!', 'Rindo aqui também 😄'] },
  { id: 'oi', re: /\b(oi+|oie|ola|opa|eae|e ai|salve|hey|hello|hi|bom dia|boa tarde|boa noite|fala)\b/, say: ['Oi, {n}! Bem-vindo! 👋', 'Opa, {n}! Tudo bem?', 'E aí, {n}! Curtindo a sala?', 'Olá! Que bom te ver por aqui ✨'] }
];
const FALLBACK = { id: 'pergunta', say: ['Boa pergunta! 🤔', 'Hmm, não sei dizer, mas acho legal.', 'Quem sabe alguém aqui responde!'] };
const AMBIENT = [
  'Esse lugar tá incrível ✨', 'Alguém quer cantar no karaokê? 🎤', 'Já provou o suco? 🧃', 'Que poção boa!', 'A fogueira tá quentinha 🔥',
  'Já viu todos os mundos?', 'Bora dançar um pouco? 💃', 'Cola um vídeo em Música/Vídeo e vamos assistir!', 'Tem rádio no painel do DJ 🎧',
  'Senta num tronco e conversa com a gente.', 'Que céu lindo hoje 🌌', 'Alguém aí com fome? 🍕'
];

/** Primeira regra que casa com o texto (ou null). */
function match(norm) {
  for (const r of RULES) if (r.re.test(norm)) return r;
  return null;
}

const between = (rand, [a, b]) => a + rand() * (b - a);

function state() { return { q: [], next: 0, rr: 0, amb: 0, spoken: {}, win: [], last: {} }; }

function pick(st, rule, rand) {
  const list = rule.say;
  let i = Math.floor(rand() * list.length);
  if (list.length > 1 && st.last[rule.id] === i) i = (i + 1) % list.length;
  st.last[rule.id] = i;
  return list[i];
}

/**
 * Uma pessoa falou: se casar com uma palavra-chave, enfileira UMA resposta (respeitando fila e orçamento).
 * `bots` = [{id,name}], `who` = nome de quem falou. Devolve true se enfileirou.
 */
function hear(st, text, bots, now, who, rand = Math.random) {
  if (!bots.length) return false;
  const norm = normalize(text);
  if (!norm) return false;
  let rule = match(norm);
  if (!rule && String(text).includes('?') && rand() < .35) rule = FALLBACK;
  if (!rule) return false;
  st.win = st.win.filter(t => now - t < WINDOW_MS);
  if (st.q.length >= MAX_QUEUE || st.win.length + st.q.length >= MAX_PER_WINDOW) return false;
  const named = bots.find(b => new RegExp('\\b' + normalize(b.name).replace(/\s+/g, ' ') + '\\b').test(norm));
  st.q.push({ due: now + between(rand, REPLY_DELAY_MS), text: pick(st, rule, rand).replace(/\{n\}/g, who || 'amigo'), prefer: named ? named.id : null });
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
  if (!bots.length || !humansOnline) { st.q.length = 0; st.amb = 0; return null; }
  if (!st.amb) st.amb = now + between(rand, AMBIENT_MS);
  if (now >= st.amb) {
    st.amb = now + between(rand, AMBIENT_MS);
    if (!st.q.length) st.q.push({ due: now, text: AMBIENT[Math.floor(rand() * AMBIENT.length)], prefer: null });
  }
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

module.exports = { normalize, match, state, hear, tick, chooseSpeaker, RULES, AMBIENT, GAP_MS, MAX_PER_WINDOW, MAX_QUEUE };
