/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Formato da sala, do jogador e das sessões de vídeo e karaokê, num lugar só. Toda sala e todo jogador nascem aqui com
 * todos os campos, para o código não criar campos soltos no meio do caminho e o TypeScript (npm run check) conferir
 * os nomes.
 */
'use strict';

/**
 * @typedef {Object} VideoSession Vídeo de um jogador (cada um pode ter o seu).
 * @property {string} vid id do vídeo no YouTube
 * @property {string} by id do dono
 * @property {string} name nome do dono
 * @property {{ time: number, playing: boolean, at: number }} vs última posição enviada pelo dono
 * @property {Set<string>} viewers ids de quem aceitou assistir
 * @property {number} [ended] quando o vídeo terminou (0/ausente: tocando)
 * @property {NodeJS.Timeout} [endT] encerra a sessão se o dono não colocar outro vídeo
 */

/**
 * @typedef {Object} KarEntry Lugar na fila do karaokê.
 * @property {string} id id do jogador
 * @property {string|null} vid música escolhida
 */

/**
 * @typedef {Object} DjSession Rádio da sala (o áudio passa pelo servidor, ver radio.js).
 * @property {string} url
 * @property {string} by
 * @property {string} name
 */

/**
 * @typedef {Object} Player Jogador humano ou bot. Os campos marcados como "humano" ficam vazios nos bots.
 * @property {string} id 'p<n>' para humano, 'b<n>' para bot
 * @property {number} bot 1 para bot, 0 para humano
 * @property {string} name
 * @property {Object} cfg visual do avatar (já validado)
 * @property {number} x
 * @property {number} z
 * @property {number} ry giro
 * @property {number} y altura (pulo)
 * @property {number} s 1 sentado
 * @property {string|null} item
 * @property {boolean} talk falando agora
 * @property {number} talkAt início da fala atual (registro de voz)
 * @property {string} lst última posição enviada no estado binário
 * @property {string} ip humano: chave de limite do IP (nunca o IP em texto para o painel)
 * @property {string} mk humano: chave para silenciar (mesmo IP na mesma sala)
 * @property {Room|null} room humano: sala
 * @property {import('ws').WebSocket|null} ws humano: conexão atual (null enquanto reconecta)
 * @property {boolean} ready humano: já recebeu o 'joined'
 * @property {boolean} online humano: conectado
 * @property {NodeJS.Timeout|null} retire humano: tira da sala se não reconectar a tempo
 * @property {string} token humano: token de reconexão (troca a cada reconexão)
 * @property {string} rk humano: chave da rádio
 * @property {Map<string, { t: number, d: number, n: number }>} sigW humano: janela da sinalização de voz por destinatário
 * @property {import('http').ServerResponse|null} radioRes humano: resposta HTTP da rádio em andamento
 * @property {number} tx bot: alvo x
 * @property {number} tz bot: alvo z
 * @property {number} next bot: quando sorteia um novo alvo
 */

/**
 * @typedef {Object} Room
 * @property {string} code
 * @property {string} style cenário
 * @property {string|null} host id do anfitrião
 * @property {number} want bots pedidos pelo anfitrião
 * @property {Map<string, Player>} players
 * @property {KarEntry[]} kar fila do karaokê (o primeiro canta)
 * @property {number} karEnd fim da vez atual
 * @property {string|null} karHead quem estava cantando no último aviso
 * @property {number} karTurn contador de vezes
 * @property {number} karAt início da vez atual
 * @property {boolean} kdur o cantor já informou a duração da música
 * @property {boolean} kcap a vez atual termina no teto de 13 min
 * @property {Object|null} ks último ksync do cantor (para quem entra na fila)
 * @property {number} inviteAt último convite para o karaokê
 * @property {Map<string, VideoSession>} vids vídeos por dono
 * @property {DjSession|null} dj
 * @property {{ at: number, id: string, name: string, text: string }[]} log últimas mensagens do chat (vão junto com a denúncia)
 * @property {{ id: string, name: string, from: number, to: number }[]} vlog registro de voz: quem falou e quando
 * @property {Object|null} botChat estado da conversa dos bots (bots.js), criado quando há bots
 * @property {number} botAt próximo passo da conversa dos bots
 * @property {number} fullAt próximo envio completo do estado binário
 */

/**
 * @param {string} code
 * @param {string} style
 * @param {number} want
 * @returns {Room}
 */
function newRoom(code, style, want) {
  return {
    code,
    style,
    host: null,
    want,
    players: new Map(),
    kar: [],
    karEnd: 0,
    karHead: null,
    karTurn: 0,
    karAt: 0,
    kdur: false,
    kcap: false,
    ks: null,
    inviteAt: 0,
    vids: new Map(),
    dj: null,
    log: [],
    vlog: [],
    botChat: null,
    botAt: 0,
    fullAt: 0
  };
}

/** @returns {Player} campos comuns, com os de humano e de bot vazios */
function basePlayer(id, bot, name, cfg, x, z) {
  return {
    id,
    bot,
    name,
    cfg,
    x,
    z,
    ry: 0,
    y: 0,
    s: 0,
    item: null,
    talk: false,
    talkAt: 0,
    lst: '',
    ip: '',
    mk: '',
    room: null,
    ws: null,
    ready: false,
    online: false,
    retire: null,
    token: '',
    rk: '',
    sigW: new Map(),
    radioRes: null,
    tx: x,
    tz: z,
    next: 0
  };
}

/**
 * @param {{ id: string, ip: string, mk: string, name: string, cfg: Object, room: Room,
 *   ws: import('ws').WebSocket, token: string, rk: string }} o
 * @returns {Player}
 */
function newHuman(o) {
  const p = basePlayer(o.id, 0, o.name, o.cfg, 0, 5);
  p.ip = o.ip;
  p.mk = o.mk;
  p.room = o.room;
  p.ws = o.ws;
  p.online = true;
  p.token = o.token;
  p.rk = o.rk;
  return p;
}

/**
 * @param {{ id: string, name: string, cfg: Object, x: number, z: number }} o
 * @returns {Player}
 */
function newBot(o) {
  return basePlayer(o.id, 1, o.name, o.cfg, o.x, o.z);
}

module.exports = { newRoom, newHuman, newBot };
