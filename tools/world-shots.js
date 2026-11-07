/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Capturas dos mundos: entra numa sala de teste (com alguns bots, para aparecerem avatares), troca para cada mundo e salva um PNG
 * por mundo. Serve para comparar "antes e depois" de mudanças de luz, material, contorno ou relevo, em todos os mundos de uma vez.
 * Mede também o custo de desenho de cada mundo (draw calls e triângulos do renderer).
 *
 * Uso:  node tools/world-shots.js --out pasta [--worlds nyx,duna] [--bots 4] [--json]
 * Sobe um servidor próprio na porta 3997 e usa Chrome/Chromium (variável CHROME) com GL por software (SwiftShader): serve para
 * comparar versões entre si, não para medir FPS de verdade.
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

async function main() {
  const out = argv('--out');
  if (!out || out === true) {
    console.error('uso: node tools/world-shots.js --out pasta [--worlds a,b] [--bots 4] [--json]');
    process.exit(2);
  }
  fs.mkdirSync(out, { recursive: true });
  const bots = Math.max(0, Math.min(20, parseInt(argv('--bots'), 10) || 4));
  const only = argv('--worlds') && argv('--worlds') !== true ? String(argv('--worlds')).split(',') : null;

  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    // nada em data/: o servidor de teste guarda tudo só na memória (senão as identidades e nomes dos jogadores de teste iam para o data/ de verdade)
    env: {
      ...process.env,
      PORT: '3997',
      BAN_FILE: '0',
      RECORDS_FILE: '0',
      NAMES_FILE: '0',
      CAPACITY_FILE: '0',
      REPORTS_FILE: '0',
      IDENTITY_FILE: '0',
      PETS_FILE: '0',
      COOK_FILE: '0',
      FARM_FILE: '0',
      PROFILES_FILE: '0',
      BADGES_FILE: '0'
    },
    stdio: 'ignore'
  });
  const url = 'http://localhost:3997/';
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(url);
      break;
    } catch {
      await sleep(250);
    }
  }
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(
    process.env.CHROME || 'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--window-size=1280,720',
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
    try {
      server.kill();
    } catch {}
    process.exit(code);
  };
  try {
    await sleep(2500);
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl, { maxPayload: 128 * 1024 * 1024 });
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
    const ev = async e => {
      const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
      return r.result ? r.result.value : null;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    await sleep(3500);
    await ev("localStorage.setItem('skyke_adult','1')");
    await send('Page.navigate', { url });
    await sleep(3000);
    await ev("localStorage.setItem('skyke_terms',TERMS_VER)");
    await send('Page.navigate', { url });
    await sleep(4500);
    await ev("document.querySelector('#iPlay') && document.querySelector('#iPlay').click()");
    await sleep(800);
    await ev(
      `(()=>{const i=document.querySelector('#name');i.value='Foto';i.dispatchEvent(new Event('input',{bubbles:true}));const b=document.querySelector('#bn');if(b)b.value='${bots}'})()`
    );
    await ev("document.querySelector('#go').click()");
    await sleep(9000);
    // esconde tudo que não seja o canvas do jogo (painéis, botões, nomes), para a captura mostrar só o mundo
    await ev(
      "[...document.body.children].forEach(e=>{if(e!==renderer.domElement)e.style.visibility='hidden'});document.querySelectorAll('.lbl').forEach(e=>{e.style.visibility='hidden'})"
    );
    const worlds = (await ev('Object.keys(ST)')) || [];
    const rows = [];
    let n = 0;
    for (const k of worlds) {
      n++;
      if (only && !only.includes(k)) continue;
      await ev(`buildRoom(${JSON.stringify(k)})`);
      await sleep(2500);
      const info = await ev('({calls:renderer.info.render.calls,tris:renderer.info.render.triangles})');
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(out, String(n).padStart(2, '0') + '-' + k + '.png');
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      rows.push({ mundo: k, calls: info && info.calls, tris: info && info.tris, arquivo: file });
    }
    if (args.includes('--json')) console.log(JSON.stringify(rows, null, 1));
    else
      for (const r of rows)
        console.log(
          `${r.mundo.padEnd(10)} ${String(r.calls).padStart(4)} calls ${String(r.tris).padStart(7)} tris  ${r.arquivo}`
        );
    done(rows.length ? 0 : 1);
  } catch (e) {
    console.error(e);
    done(2);
  }
}
main();
