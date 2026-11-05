/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Auditoria de áudio: renderiza offline (OfflineAudioContext, no Chrome headless) todo som sintetizado de
 * assets/app-sound.js, com a mesma cadeia do jogo, e mede o volume de cada um. Os sons são descobertos no próprio
 * código (chaves do sfx, camadas de ambiente por mundo e a música), então um som novo entra sozinho na conta.
 *
 * Volume = maior RMS em janela de 100 ms (como o ouvido soma sons curtos), em dBFS, com o volume padrão dos Ajustes.
 * Cada categoria tem um alvo; fica fora quem passar de ±2 dB do alvo ou de -3 dBFS de pico.
 *
 * Uso:  node tools/audio-audit.js [--out pasta] [--json]
 *   --out   grava um WAV (float 32 bits, mono) de cada som, para abrir no Audacity
 *   --json  imprime as medidas em JSON
 * Sai com código 1 se algum som estiver fora do alvo. Precisa de Chrome/Chromium (variável CHROME para indicar o binário).
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const args = process.argv.slice(2);
const argv = k => {
  const i = args.indexOf(k);
  return i < 0 ? null : args[i + 1] || true;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SR = 44100;

// Alvos de volume (dBFS) por categoria. Frequentes e discretos ficam abaixo dos avisos e dos gestos.
const TARGET = { ui: -27, aviso: -22, acao: -23, passo: -29, emote: -25, ambiente: -36, musica: -24 };
const TOL = 2;
const PEAK_MAX = -3;
const AVISO = new Set(['notif', 'join', 'confirm']);
const UI = new Set(['click', 'chat', 'leave']);
const categoria = k => {
  if (k.startsWith('step_')) return 'passo';
  if (k.startsWith('e_') || k.startsWith('g_')) return 'emote';
  if (k.startsWith('n_') || AVISO.has(k)) return 'aviso';
  if (UI.has(k)) return 'ui';
  return 'acao';
};

// Roda dentro da página: renderiza um som e devolve as medidas (e as amostras, se pedido).
const PAGE_RENDER = `(async (src, j, withWav) => {
  const SR = ${SR};
  const oac = new OfflineAudioContext(1, SR * j.dur, SR);
  let T = 0;
  Object.defineProperty(oac, 'currentTime', { get: () => T });
  oac.resume = () => Promise.resolve();
  window.AudioContext = function () { return oac };
  window.$ = () => ({ setAttribute() {}, set onclick(v) {} });
  window.mode = j.kind === 'musica' ? 'menu' : 'play';
  window.CUR = null; window.actors = new Map(); window.me = null;
  const M = new Function('window', src + '\\n;return {sfx,ambSet,ambTick,AM,MUS,musTick,musGraph}')(window);
  if (j.kind === 'sfx') M.sfx(j.k, 1);
  else if (j.kind === 'ambiente') { M.ambSet(j.k); if (j.bolhas) { for (T = 0; T < j.dur; T += 0.25) M.ambTick(T * 1000 + 1e6); T = 0 } }
  else { M.musGraph(); for (T = 0; T < j.dur; T += 0.1) M.musTick(); T = 0 }
  const x = (await oac.startRendering()).getChannelData(0);
  const from = j.kind === 'sfx' ? 0 : SR * j.skip, W = SR / 10;
  let pk = 0, best = 0;
  for (let i = from; i < x.length; i++) { const v = Math.abs(x[i]); if (v > pk) pk = v }
  // maior RMS em janela de 100 ms (passo de 25 ms)
  for (let a = from; a + W <= x.length; a += W / 4) { let s = 0; for (let i = a; i < a + W; i++) s += x[i] * x[i]; if (s > best) best = s }
  const db = v => (v > 0 ? 20 * Math.log10(v) : -120);
  let last = 0; for (let i = x.length - 1; i >= 0; i--) if (Math.abs(x[i]) > 1e-3) { last = i; break }
  const out = { peak: db(pk), loud: db(Math.sqrt(best / W)), dur: last / SR };
  if (withWav) { const u = new Uint8Array(x.buffer.slice(0)); let b = ''; for (let i = 0; i < u.length; i += 8192) b += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); out.b64 = btoa(b) }
  return out;
})`;

function wavF32(buf, sr) {
  const n = buf.length / 4;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + n * 4, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(32, 34);
  h.write('data', 36);
  h.writeUInt32LE(n * 4, 40);
  return Buffer.concat([h, buf]);
}

async function main() {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'assets/app-sound.js'), 'utf8');
  const sfxKeys = [...new Set([...src.matchAll(/(?:case '|k===')([a-z_]+)'/g)].map(m => m[1]))].filter(
    k => k !== 'wind'
  );
  const amb = JSON.parse(
    src
      .match(/const AMB=(\{[^\n]*\});/)[1]
      .replace(/'/g, '"')
      .replace(/(\w+):/g, '"$1":')
  );
  const jobs = [
    ...sfxKeys.map(k => ({ kind: 'sfx', k, dur: 3 })),
    ...Object.entries(amb).map(([k, l]) => ({ kind: 'ambiente', k, dur: 12, skip: 6, bolhas: l.includes('bubbles') })),
    { kind: 'musica', k: 'menu', dur: 20, skip: 2 }
  ];
  const out = argv('--out');
  if (out) fs.mkdirSync(out, { recursive: true });

  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(
    process.env.CHROME || 'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--remote-debugging-port=' + port,
      '--autoplay-policy=no-user-gesture-required',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );
  const done = code => {
    try {
      chrome.kill();
    } catch {}
    process.exit(code);
  };
  try {
    await sleep(2000);
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise(r => ws.on('open', r));
    let id = 0;
    const pend = {};
    ws.on('message', m => {
      const d = JSON.parse(m);
      if (d.id && pend[d.id]) {
        pend[d.id](d.result || d.error);
        delete pend[d.id];
      }
    });
    const send = (method, params = {}) =>
      new Promise(r => {
        pend[++id] = r;
        ws.send(JSON.stringify({ id, method, params }));
      });
    await send('Runtime.enable');
    const rows = [];
    for (const j of jobs) {
      const expr = `${PAGE_RENDER}(${JSON.stringify(src)}, ${JSON.stringify(j)}, ${!!out})`;
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (!r.result || r.exceptionDetails) {
        console.error(`falhou ${j.kind}/${j.k}:`, JSON.stringify(r.exceptionDetails || r).slice(0, 300));
        done(2);
      }
      const v = r.result.value;
      if (out && v.b64)
        fs.writeFileSync(path.join(out, `${j.kind}-${j.k}.wav`), wavF32(Buffer.from(v.b64, 'base64'), SR));
      const cat = j.kind === 'sfx' ? categoria(j.k) : j.kind;
      const alvo = TARGET[cat];
      const ok = Math.abs(v.loud - alvo) <= TOL && v.peak <= PEAK_MAX;
      rows.push({
        kind: j.kind,
        k: j.k,
        cat,
        alvo,
        loud: +v.loud.toFixed(1),
        peak: +v.peak.toFixed(1),
        dur: +v.dur.toFixed(2),
        ok
      });
    }
    if (args.includes('--json')) console.log(JSON.stringify(rows, null, 1));
    else {
      console.log('categoria  som          volume  alvo  pico   dur   ');
      for (const r of rows)
        console.log(
          `${r.cat.padEnd(10)} ${r.k.padEnd(12)} ${String(r.loud).padStart(6)} ${String(r.alvo).padStart(5)} ${String(r.peak).padStart(6)} ${r.dur.toFixed(2).padStart(5)}s ${r.ok ? '' : ' <-- fora do alvo'}`
        );
    }
    const bad = rows.filter(r => !r.ok);
    console.log(bad.length ? `\n${bad.length} de ${rows.length} fora do alvo` : `\n${rows.length} sons dentro do alvo`);
    done(bad.length ? 1 : 0);
  } catch (e) {
    console.error(e);
    done(2);
  }
}
main();
