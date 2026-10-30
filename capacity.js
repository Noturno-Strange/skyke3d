/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Capacidade do servidor: limite de salas e de jogadores por sala (ajustáveis pelo painel /status), tetos de projeto e
 * estimativa de carga. O servidor foi projetado para no máximo ABS.maxPlayers jogadores ao mesmo tempo; o painel nunca
 * aceita um valor acima dos tetos, e o limite de conexões é calculado a partir de salas × jogadores por sala.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Tetos de projeto (não ajustáveis): por sala o cliente desenha todos os avatares, e o servidor manda a cada tick o estado de quem se mexeu
// para todos da sala (custo ~ jogadores²). Em total, descritores de arquivo, banda e CPU de um servidor comum.
const ABS = { minRooms: 1, maxRooms: 150, minPerRoom: 2, maxPerRoom: 40, maxPlayers: 3000 };
const DEFAULTS = { rooms: 20, perRoom: 32 };

const TICK_HZ = 10;          // o servidor envia o estado das salas a cada 100 ms
const STATE_BYTES = 38;      // um jogador no pacote 'st': [id,x,z,ry,y,s] em JSON
const WARN_BPS = 12.5e6, CRIT_BPS = 37.5e6; // pior caso de envio: 100 e 300 Mbit/s
const WARN_TICK = 50, CRIT_TICK = 80;       // ms de um tick de 100 ms
const FD_WARN = 900;         // o padrão do Linux (ulimit -n) é 1024 descritores

const isInt = v => typeof v === 'number' && Number.isInteger(v);

function validate(rooms, perRoom) {
  if (!isInt(rooms) || rooms < ABS.minRooms || rooms > ABS.maxRooms)
    return { ok: false, erro: 'Limite de salas inválido (de ' + ABS.minRooms + ' a ' + ABS.maxRooms + ').' };
  if (!isInt(perRoom) || perRoom < ABS.minPerRoom || perRoom > ABS.maxPerRoom)
    return { ok: false, erro: 'Limite de jogadores por sala inválido (de ' + ABS.minPerRoom + ' a ' + ABS.maxPerRoom + ').' };
  if (rooms * perRoom > ABS.maxPlayers)
    return { ok: false, erro: 'O servidor foi projetado para no máximo ' + ABS.maxPlayers + ' jogadores ao mesmo tempo (salas × jogadores por sala = ' + rooms * perRoom + ').' };
  return { ok: true, rooms, perRoom };
}

// Conexões simultâneas aceitas: todos os lugares das salas + 5% (quem reconecta ocupa a vaga antiga por alguns segundos) + 25 de folga.
const connLimit = (rooms, perRoom) => Math.ceil(rooms * perRoom * 1.05) + 25;

// perf = { avgTickMs, population } medidos agora: com população suficiente dá para projetar o custo do tick (cresce com o número de jogadores).
function estimate(rooms, perRoom, perf) {
  const players = rooms * perRoom, conns = connLimit(rooms, perRoom);
  const bytesWorst = rooms * perRoom * perRoom * STATE_BYTES * TICK_HZ;
  const tickMs = perf && perf.population >= 10 && perf.avgTickMs > 0 ? +(perf.avgTickMs / perf.population * players).toFixed(1) : null;
  const fds = conns + 200;
  const notes = [];
  let level = 'ok';
  const up = l => { if (l === 'crit' || level === 'ok') level = l; };
  if (bytesWorst > CRIT_BPS) { up('crit'); notes.push('Banda de envio no pior caso acima de 300 Mbit/s.'); }
  else if (bytesWorst > WARN_BPS) { up('warn'); notes.push('Banda de envio no pior caso acima de 100 Mbit/s: confira o link do servidor.'); }
  if (tickMs !== null && tickMs > CRIT_TICK) { up('crit'); notes.push('O tick projetado passa de ' + CRIT_TICK + ' ms (o orçamento é 100 ms): o jogo vai travar.'); }
  else if (tickMs !== null && tickMs > WARN_TICK) { up('warn'); notes.push('O tick projetado passa de ' + WARN_TICK + ' ms (o orçamento é 100 ms).'); }
  if (fds > FD_WARN) { up('warn'); notes.push('São necessários cerca de ' + fds + ' descritores de arquivo: confira o limite do sistema (ulimit -n / LimitNOFILE), que costuma ser 1024.'); }
  if (tickMs === null) notes.push('Custo do tick: ainda sem jogadores suficientes online para projetar (precisa de pelo menos 10).');
  return { players, conns, fds, msgsPerSec: players * TICK_HZ, bytesWorst, mbitWorst: +(bytesWorst * 8 / 1e6).toFixed(1), tickMs, level, notes };
}

// Arquivo de configuração: lido só se for válido; gravado de forma atômica (arquivo temporário + rename).
function loadFile(file) {
  if (!file) return null;
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const v = validate(j && j.rooms, j && j.perRoom);
    return v.ok ? { rooms: v.rooms, perRoom: v.perRoom } : null;
  } catch (e) { return null; }
}
function saveFile(file, rooms, perRoom) {
  if (!file) return true;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, savedAt: Date.now(), rooms, perRoom }), { mode: 0o600 });
    fs.renameSync(tmp, file);
    return true;
  } catch (e) { return false; }
}

module.exports = { ABS, DEFAULTS, validate, connLimit, estimate, loadFile, saveFile, TICK_HZ, STATE_BYTES };
