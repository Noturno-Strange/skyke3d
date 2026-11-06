/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 */
'use strict';
// Voz pelo WebSocket: o navegador manda quadros de áudio já codificados (Opus ou IMA-ADPCM) e o servidor só os repassa, na memória,
// para quem está perto. Nada é decodificado, gravado ou guardado. Este módulo tem as partes puras (formato dos quadros e quem ouve quem),
// testáveis sem servidor.
//
// Quadro que chega do cliente: [u8 tipo=2][u8 codec][u8 seq][dados]
// Quadro que sai para os outros: [u8 tipo=2][u32 id do jogador][u8 codec][u8 seq][dados]

const FRAME_IN = 2;
const CODEC = { opus: 1, adpcm: 2 };
const CODECS = new Set(Object.values(CODEC));
// 40 ms de Opus a 32 kbps ≈ 160 bytes; 40 ms de ADPCM a 16 kHz = 320 bytes + 3 de estado. Folga para picos do Opus (VBR).
const MAX_FRAME = 600;
// Um quadro a cada 20 a 40 ms: até 50 por segundo. E no máximo MAX_BPS bytes por segundo: uma voz real usa ~4 KB/s (Opus a 32 kbps)
// ou ~8,5 KB/s (ADPCM). Sem o teto de bytes, um cliente modificado mandaria ~30 KB/s e o servidor repassaria isso a cada ouvinte.
// Acima dos dois limites o quadro é descartado (a enxurrada de mensagens é tratada à parte, por conexão, no server.js).
const MAX_FPS = 50;
const MAX_BPS = 12000;
// Cada pessoa ouve no máximo esta quantidade de vozes ao mesmo tempo: as mais próximas que estiverem falando.
const MAX_HEAR = 8;
// Fila de saída acima disto: o quadro de voz é descartado para essa pessoa (áudio atrasado não serve; o jogo não pode travar).
const VOICE_BUFFER = 256 * 1024;

/**
 * @param {Buffer} buf
 * @returns {{ codec: number, seq: number, data: Buffer } | null}
 */
function parseIn(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4 || buf.length > MAX_FRAME) return null;
  if (buf[0] !== FRAME_IN || !CODECS.has(buf[1])) return null;
  return { codec: buf[1], seq: buf[2], data: buf.subarray(3) };
}

/** id 'p123' → 123 (o mesmo número do estado binário das posições) */
const idNum = id => Number(String(id).slice(1)) & 0x7fffffff;

/**
 * @param {string} id
 * @param {{ codec: number, seq: number, data: Buffer }} f
 */
function packOut(id, f) {
  const b = Buffer.allocUnsafe(7 + f.data.length);
  b[0] = FRAME_IN;
  b.writeUInt32LE(idNum(id) >>> 0, 1);
  b[5] = f.codec;
  b[6] = f.seq;
  f.data.copy(b, 7);
  return b;
}

/**
 * Janela de 1 s de quadros e bytes por jogador. Devolve false quando passou de um dos limites (o quadro é descartado).
 * @param {{ t: number, n: number, b: number }} w
 * @param {number} now
 * @param {number} [len] tamanho do quadro em bytes
 */
function frameOk(w, now, len = 0) {
  if (now - w.t >= 1000) {
    w.t = now;
    w.n = 0;
    w.b = 0;
  }
  if (w.n >= MAX_FPS || w.b + len > MAX_BPS) return false;
  w.n++;
  w.b += len;
  return true;
}

const d2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z);

/**
 * Quem deve receber a voz de `from`: humanos prontos da sala, que estão ouvindo, não o silenciaram e para quem `from` está entre as
 * MAX_HEAR vozes mais próximas que estão falando agora.
 * @template {{ id: string, bot: number|boolean, ready: boolean, online: boolean, ws: any, talk: boolean, x: number, z: number,
 *   vlisten?: boolean, vmute?: Set<string> }} P
 * @param {Iterable<P>} players
 * @param {P} from
 * @returns {P[]}
 */
function listeners(players, from) {
  const all = [...players],
    talkers = all.filter(p => !p.bot && p.talk && p.online);
  const out = [];
  for (const p of all) {
    if (p === from || p.bot || !p.ready || !p.online || !p.ws || !p.vlisten) continue;
    if (p.vmute && p.vmute.has(from.id)) continue;
    if (talkers.length > MAX_HEAR) {
      const mine = d2(p, from);
      let closer = 0;
      for (const t of talkers) if (t !== from && t !== p && d2(p, t) < mine && ++closer >= MAX_HEAR) break;
      if (closer >= MAX_HEAR) continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * A sala usa Opus só quando todos os humanos que já informaram o navegador conseguem codificar e decodificar Opus; senão, ADPCM, que
 * qualquer navegador decodifica em JavaScript. Quem ainda não informou não conta.
 * @param {Iterable<{ bot: number|boolean, vop?: boolean|null }>} players
 */
function roomOpus(players) {
  for (const p of players) if (!p.bot && p.vop === false) return false;
  return true;
}

module.exports = {
  FRAME_IN,
  CODEC,
  MAX_FRAME,
  MAX_FPS,
  MAX_BPS,
  MAX_HEAR,
  VOICE_BUFFER,
  parseIn,
  packOut,
  frameOk,
  listeners,
  roomOpus,
  idNum
};
