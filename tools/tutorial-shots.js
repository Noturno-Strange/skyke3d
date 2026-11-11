/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Capturas do tutorial: refaz as 10 imagens do "Como jogar" (assets/tut-1.jpg … tut-10.jpg) a partir do jogo atual, para o
 * tutorial nunca mostrar mundos, botões ou janelas que já mudaram. Cada imagem é uma cena montada como um jogador faria
 * (nome, editor, sala com bots, chat, emojis, mochila, karaokê, vídeo, rádio, sino e amigos).
 *
 * Uso:  node tools/tutorial-shots.js [--out assets] [--world cerron] [--bots 8]
 * Sobe um servidor próprio na porta 3998 (nada é gravado em data/) e usa Chrome/Chromium (variável CHROME) com GL por
 * software. O sorteio do navegador é fixo (mesma semente), então o visual do avatar sai igual a cada execução.
 * Sino e amigos usam as mesmas funções que o jogo chama quando chegam convites e pedidos (ntAdd, soc, gsay), com nomes
 * de exemplo, porque um teste local não tem outros jogadores de verdade.
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const args = process.argv.slice(2);
const argv = (k, d) => {
  const i = args.indexOf(k);
  return i < 0 || !args[i + 1] ? d : args[i + 1];
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const W = 1280,
  H = 720,
  SCALE = 0.8; // 1280×720 na tela, 1024×576 na imagem (o tamanho que o index.html declara)

// sorteio fixo no navegador (mulberry32): o 🎲 e o visual inicial saem sempre iguais
// ids de exemplo no formato do jogo (12 letras base32) para os amigos da cena 10
const rid = s =>
  Array.from({ length: 12 }, (_, j) => 'abcdefghijklmnopqrstuvwxyz234567'[(s * 7 + j * 13 + s * j) % 32]).join('');
const FRIENDS = [
  ['Bia', 2],
  ['Caio', 3]
];
const SEED = `(()=>{let a=20261106;Math.random=()=>{a|=0;a=a+0x6d2b79f5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}})()`;

async function main() {
  const out = path.resolve(argv('--out', path.join(__dirname, '..', 'assets')));
  const world = argv('--world', 'cerron');
  const bots = Math.max(0, Math.min(20, parseInt(argv('--bots', '8'), 10) || 0));
  fs.mkdirSync(out, { recursive: true });

  // nada em data/: o servidor de teste guarda tudo só na memória (senão os jogadores de teste iam para o data/ de verdade)
  const env = {
    ...process.env,
    PORT: '3998',
    BAN_FILE: '0',
    RECORDS_FILE: '0',
    NAMES_FILE: '0',
    CAPACITY_FILE: '0',
    REPORTS_FILE: '0',
    IDENTITY_FILE: '0',
    PETS_FILE: '0',
    COOK_FILE: '0',
    FARM_FILE: '0',
    GIFTS_FILE: '0',
    PROFILES_FILE: '0',
    BADGES_FILE: '0'
  };
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' });
  const url = 'http://localhost:3998/';
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
      `--window-size=${W},${H}`,
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
    const pend = {},
      errs = [];
    ws.on('message', m => {
      const d = JSON.parse(m);
      if (d.method === 'Runtime.exceptionThrown') {
        const x = d.params.exceptionDetails;
        errs.push((x.exception && x.exception.description) || x.text);
      }
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
      if (r && r.exceptionDetails) {
        const x = r.exceptionDetails;
        throw new Error(
          'falhou no navegador: ' + e.slice(0, 90) + '\n' + ((x.exception && x.exception.description) || x.text)
        );
      }
      return r && r.result ? r.result.value : null;
    };
    const until = async (e, ms = 20000) => {
      for (let t = 0; t < ms; t += 250) {
        if (await ev(e)) return true;
        await sleep(250);
      }
      throw new Error('demorou demais: ' + e);
    };
    const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
    const key = async k => {
      const code = { Enter: 13, Escape: 27 }[k];
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code });
    };
    const type = async (sel, text) => {
      await ev(`document.querySelector(${JSON.stringify(sel)}).focus()`);
      await send('Input.insertText', { text });
    };
    // painéis abertos de uma cena não vazam para a próxima
    const closeAll = () =>
      ev(
        "['pNotif','pFr','pMochila','pVid','pDJ','pKar','pKFila','pEmo','pYt'].forEach(i=>{const e=document.getElementById(i);if(e)e.classList.add('hide')})"
      );
    let n = 0;
    const shot = async (wait = 1200) => {
      await sleep(wait);
      const r = await send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 82,
        clip: { x: 0, y: 0, width: W, height: H, scale: SCALE }
      });
      const file = path.join(out, 'tut-' + ++n + '.jpg');
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      console.log(file);
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: SEED });
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    await until("document.readyState==='complete'&&typeof TERMS_VER==='string'");
    // dois amigos já salvos no aparelho (o painel de amigos da cena 10 mostra os dois online)
    await ev(
      `localStorage.setItem('skyke_adult','1');localStorage.setItem('skyke_terms',TERMS_VER);localStorage.setItem('skyke_friends',${JSON.stringify(JSON.stringify(FRIENDS.map(([n, s]) => ({ id: rid(s), n }))))})`
    );
    await send('Page.navigate', { url });
    await until("document.readyState==='complete'&&!!document.querySelector('#iPlay')");
    await sleep(1500);
    await click('#iPlay');
    await until("!!document.querySelector('#name')&&document.querySelector('#name').offsetParent!==null");

    // 1. tela inicial: nome, mundo e o editor na aba do cabelo
    await type('#name', 'Luna');
    for (let i = 0; i < 6 && (await ev('cfg.style')) !== world; i++) {
      await click('#stNext');
      await sleep(900);
    }
    await click('[data-eg="1"]');
    await shot(3500);

    // 2. sala criada com bots, chat aberto com a mensagem de boas-vindas
    await ev(`document.querySelector('#bn').value='${bots}'`);
    await click('#go');
    await until("mode==='play'", 30000);
    await sleep(6000);
    await ev("if(document.getElementById('chat').classList.contains('hide'))document.getElementById('bChat').click()");
    await shot(1500);

    // 3. conversa: duas mensagens e as respostas dos bots
    await type('#msg', 'Oi, gente! Bora explorar o cerrado? 🌵');
    await key('Enter');
    await sleep(3200);
    await type('#msg', 'Depois tem karaokê! 🎤');
    await key('Enter');
    await shot(6000);

    // 4. emojis: painel aberto e um emoji flutuando sobre o avatar
    await click('#bChat');
    await click('#bEmo');
    await sleep(500);
    // a janela de emojis abre no meio da tela; como o jogador faria, ela vai para o lado para o emoji aparecer sobre o avatar
    await ev(
      "(()=>{const p=document.getElementById('pEmo');p.style.left=(innerWidth-p.offsetWidth-24)+'px';p.style.top='70px';p.style.right='auto';p.style.bottom='auto';p.style.transform='none'})()"
    );
    await click('#eEmo button');
    await shot(700);
    await closeAll();

    // 5. mochila: painel aberto e um lanche na mão
    await click('#bMochila');
    await sleep(500);
    await ev("(()=>{const s=[...document.querySelectorAll('#pMochila .slot')];const b=s[3]||s[0];if(b)b.click()})()");
    await shot(1200);
    await closeAll();

    // 6. karaokê
    await click('#bKar');
    await shot(1200);
    await closeAll();

    // 7. vídeo: link colado, pronto para "Iniciar para todos"
    await click('#bVid');
    await type('#vurl', 'https://www.youtube.com/watch?v=exemplo');
    await shot(1000);
    await closeAll();

    // 8. rádio (DJ): link da rádio colado
    await click('#bDJ');
    await type('#djurl', 'https://radio.exemplo.com.br/aovivo');
    await shot(1000);
    await closeAll();

    // 9. sino com convites guardados (os mesmos textos que o jogo usa)
    await ev(`(()=>{const f=()=>{};
      ntAdd('karaoke','🎤 Bia abriu o karaokê. Quer participar?',f);
      ntAdd('video:x','🎬 Caio quer assistir um vídeo com você!',f);
      ntAdd('dj','🎧 Davi colocou uma rádio (radio.exemplo.com.br). Quer ouvir?',f)})()`);
    await click('#bNotif');
    await shot(1200);
    await closeAll();

    // 10. amigos (pedido e amigos online) e o chat Global, a aba azul
    // as mesmas mensagens que o servidor manda: pedido de amizade, amigos online e falas no Global
    const msgs = [
      { t: 'freq', id: rid(1), name: 'Rafa' },
      ...FRIENDS.map(([name, s]) => ({ t: 'fpres', id: rid(s), on: true, name, hs: [] })),
      { t: 'gchat', id: rid(2), name: 'Bia', text: 'Alguém pro karaokê? 🎤' },
      { t: 'gchat', id: rid(4), name: 'Davi', text: 'Bora! Qual sala?' },
      { t: 'gchat', id: rid(3), name: 'Caio', text: 'Te mandei convite 📨' }
    ];
    await ev(`${JSON.stringify(msgs)}.forEach(m=>window.soc(m))`);
    await click('#bChat');
    await click('#ctG');
    await click('#bFr');
    await shot(1200);

    if (errs.length) {
      console.error('erros na página:\n' + errs.join('\n'));
      done(1);
    }
    done(0);
  } catch (e) {
    console.error(e);
    done(2);
  }
}
main();
