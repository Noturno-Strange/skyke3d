/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Auditoria das interfaces: abre o jogo no Chrome headless, entra numa sala e, em vários tamanhos de tela, níveis de zoom do
 * navegador e ajustes de Interface e Texto, aperta cada botão da barra, percorre as abas de cada painel e fecha no ✖. Aponta:
 *   - botão que não abre nada, painel que não fecha e aba que não mostra o conteúdo dela;
 *   - painel (ou parte dele) fora da tela e painel com rolagem horizontal;
 *   - botão, campo ou aba visível menor que o alvo mínimo (24 px, o mínimo da WCAG 2.2 para mouse);
 *   - texto cortado dentro de botão;
 *   - erro de JavaScript no console durante o percurso.
 *
 * Uso:  node tools/ui-audit.js [--url http://localhost:3999/] [--json] [--rapido]
 * Sem --url, sobe um servidor próprio na porta 3996. Use CHROME=/caminho/do/chrome para escolher o navegador.
 * Sai com código 1 se achar algum problema. --rapido testa só três tamanhos de tela. O jogo é só para computador: as telas são de
 * monitor e notebook, com zoom do navegador e com a janela pela metade (em pé).
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const args = process.argv.slice(2);
const argv = k => {
  const i = args.indexOf(k);
  return i < 0 ? '' : args[i + 1] || '';
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// largura × altura em pixels CSS, zoom do navegador (o zoom de 150 % numa janela de 1280 px deixa 853 px para a página) e os
// ajustes Interface (--ui) e Texto (--tx) do próprio jogo
const CASES = [
  { n: 'monitor Full HD 1920×1080', w: 1920, h: 1080, z: 1, ui: 1, tx: 1 },
  { n: 'notebook 1366×768', w: 1366, h: 768, z: 1, ui: 1, tx: 1 },
  { n: 'computador 1280×720', w: 1280, h: 720, z: 1, ui: 1, tx: 1 },
  { n: 'notebook 1024×600', w: 1024, h: 600, z: 1, ui: 1, tx: 1 },
  { n: 'meia tela em pé 960×1040', w: 960, h: 1040, z: 1, ui: 1, tx: 1 },
  { n: 'computador com zoom de 150 %', w: 853, h: 480, z: 1.5, ui: 1, tx: 1 },
  { n: 'computador com zoom de 200 %', w: 640, h: 360, z: 2, ui: 1, tx: 1 },
  { n: 'computador, Interface 125 % e Texto 130 %', w: 1280, h: 720, z: 1, ui: 1.25, tx: 1.3 },
  { n: 'Full HD, Interface 150 % e Texto 160 %', w: 1920, h: 1080, z: 1, ui: 1.5, tx: 1.6 }
];
const QUICK = ['computador 1280×720', 'meia tela em pé 960×1040', 'computador com zoom de 200 %'];
// botões da barra que não abrem painel: sair da sala e copiar o convite
const NO_PANEL = new Set(['bExit', 'bInvite']);

// Roda na página: aperta um botão e devolve o que mudou e o que está errado no painel que abriu
const PROBE = `(async btnId => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const vw = innerWidth, vh = innerHeight, out = { opened: [], issues: [] };
  const shown = e => { if (!e || e.classList.contains('hide') || e.hidden) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const panels = () => [...document.querySelectorAll('#ui .p, #ui #chat')].filter(e => e.id && e.id !== 'bar' && shown(e)).map(e => e.id);
  const name = e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/)[0] : '')) + (e.textContent ? ' "' + e.textContent.trim().slice(0, 18) + '"' : '');
  const before = new Set(panels());
  const b = document.getElementById(btnId);
  if (!b || !shown(b)) { out.issues.push('botão ' + btnId + ' não está visível'); return out; }
  b.click();
  await wait(450);
  const after = panels();
  out.opened = after.filter(p => !before.has(p));
  const closed = [...before].filter(p => !after.includes(p));
  if (!out.opened.length && !closed.length) { out.issues.push('o botão ' + btnId + ' não abriu nem fechou nada'); return out; }
  const MIN = 24;
  const check = (p, where) => {
    const r = p.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) out.issues.push(where + ': fora da tela (' + Math.round(r.left) + ',' + Math.round(r.top) + ' a ' + Math.round(r.right) + ',' + Math.round(r.bottom) + ' numa tela de ' + vw + '×' + vh + ')');
    if (p.scrollWidth > p.clientWidth + 2) out.issues.push(where + ': rolagem horizontal (' + p.scrollWidth + ' > ' + p.clientWidth + ')');
    for (const e of p.querySelectorAll('button, input, select, [role=tab]')) {
      if (!shown(e) || e.closest('[hidden]') || e.closest('.hide')) continue;
      const q = e.getBoundingClientRect();
      // só o que está à vista dentro do painel (o resto está rolado para fora) e não é linha de lista nem caixa de seleção nativa
      if (q.bottom < r.top || q.top > r.bottom || q.right < r.left || q.left > r.right) continue;
      if (e.type === 'checkbox' || e.type === 'radio' || e.type === 'range' || e.type === 'color' || e.classList.contains('ckrow') || e.classList.contains('mgh')) continue;
      if (q.width < MIN - .5 || q.height < MIN - .5) out.issues.push(where + ': alvo pequeno ' + name(e) + ' (' + Math.round(q.width) + '×' + Math.round(q.height) + ', mínimo ' + MIN + ')');
      if (e.tagName === 'BUTTON' && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).textOverflow !== 'ellipsis') out.issues.push(where + ': texto cortado em ' + name(e));
    }
  };
  for (const id of out.opened) {
    const p = document.getElementById(id);
    check(p, '#' + id);
    // abas: cada uma precisa mostrar o próprio conteúdo
    const tabs = [...p.querySelectorAll('[role=tab]')].filter(shown);
    for (const t of tabs) {
      t.click();
      await wait(200);
      const c = t.getAttribute('aria-controls'), tp = c && document.getElementById(c);
      if (t.getAttribute('aria-selected') !== 'true') out.issues.push('#' + id + ': a aba ' + name(t) + ' não ficou selecionada');
      if (tp && !shown(tp)) out.issues.push('#' + id + ': a aba ' + name(t) + ' não mostrou o conteúdo');
      check(p, '#' + id + ' › ' + (t.textContent || '').trim().slice(0, 14));
    }
    if (tabs.length) { tabs[0].click(); await wait(120); }
    // fechar: pelo ✖ do painel, ou pelo próprio botão da barra
    const x = p.querySelector('.px, .frx, [aria-label^="Fechar"]');
    if (x && shown(x)) x.click(); else b.click();
    await wait(300);
    if (shown(p)) { b.click(); await wait(300); }
    if (shown(p)) out.issues.push('#' + id + ': não fechou');
  }
  return out;
})`;

async function main() {
  let server = null;
  let url = argv('--url');
  if (!url) {
    server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      // nada em data/: o servidor de teste guarda tudo só na memória
      env: {
        ...process.env,
        PORT: '3996',
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
      },
      stdio: 'ignore'
    });
    url = 'http://localhost:3996/';
    for (let i = 0; i < 80; i++) {
      try {
        await fetch(url);
        break;
      } catch {
        await sleep(250);
      }
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
      if (server) server.kill();
    } catch {}
    process.exit(code);
  };
  try {
    await sleep(2500);
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise(r => ws.on('open', r));
    let id = 0;
    const pend = {},
      errors = [];
    ws.on('message', m => {
      const d = JSON.parse(m);
      if (d.id && pend[d.id]) {
        pend[d.id](d.result || d.error);
        delete pend[d.id];
      } else if (d.method === 'Runtime.exceptionThrown') {
        const x = d.params.exceptionDetails;
        errors.push((x.exception && x.exception.description ? x.exception.description.split('\n')[0] : x.text) + '');
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
    await ev("localStorage.setItem('skyke_adult','1');localStorage.setItem('skyke_terms',TERMS_VER)");
    await send('Page.navigate', { url });
    await sleep(4500);
    await ev("document.querySelector('#iPlay') && document.querySelector('#iPlay').click()");
    await sleep(800);
    await ev(
      "(()=>{const i=document.querySelector('#name');i.value='Auditor';i.dispatchEvent(new Event('input',{bubbles:true}))})()"
    );
    await ev("document.querySelector('#go').click()");
    for (let i = 0; i < 60 && (await ev("typeof mode!=='undefined'&&mode")) !== 'play'; i++) await sleep(500);
    if ((await ev('mode')) !== 'play') throw new Error('não consegui entrar numa sala');
    // o desenho 3D por software deixa o navegador lento: a auditoria é das janelas, então o quadro vira um ponto
    await ev('renderer.setPixelRatio(.1)');
    await sleep(1500);
    const buttons =
      (await ev("[...document.querySelectorAll('#bar button, #bNotif, #bFr')].map(b=>b.id).filter(Boolean)")) || [];
    const cases = args.includes('--rapido') ? CASES.filter(c => QUICK.includes(c.n)) : CASES;
    const rows = [];
    let total = 0;
    for (const c of cases) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: c.w,
        height: c.h,
        deviceScaleFactor: c.z,
        mobile: false
      });
      await ev(
        `document.documentElement.style.setProperty('--ui','${c.ui}');document.documentElement.style.setProperty('--tx','${c.tx}');dispatchEvent(new Event('resize'));dispatchEvent(new Event('skyke:tx'))`
      );
      await sleep(700);
      const issues = [];
      let opened = 0;
      // a barra precisa caber na tela
      const bar = await ev(
        "(()=>{const r=document.querySelector('#bar').getBoundingClientRect();return[r.left,r.top,r.right,r.bottom,innerWidth,innerHeight]})()"
      );
      if (bar && (bar[0] < -1 || bar[2] > bar[4] + 1 || bar[3] > bar[5] + 1 || bar[1] < -1))
        issues.push(
          '#bar: fora da tela (' +
            bar.slice(0, 4).map(Math.round).join(',') +
            ' numa tela de ' +
            bar[4] +
            '×' +
            bar[5] +
            ')'
        );
      for (const b of buttons) {
        if (NO_PANEL.has(b)) continue;
        const r = await ev(PROBE + '(' + JSON.stringify(b) + ')');
        if (!r) {
          issues.push(b + ': a página não respondeu');
          continue;
        }
        opened += r.opened.length;
        for (const i of r.issues) issues.push(i);
      }
      total += issues.length;
      rows.push({ tela: c.n, paineis: opened, problemas: issues.length, lista: [...new Set(issues)] });
    }
    const errs = [...new Set(errors)];
    if (args.includes('--json')) console.log(JSON.stringify({ botoes: buttons, telas: rows, erros: errs }, null, 1));
    else {
      console.log('Botões testados em cada tela: ' + buttons.filter(b => !NO_PANEL.has(b)).join(', ') + '\n');
      for (const r of rows) {
        console.log(
          (r.problemas ? '✗ ' : '✔ ') + r.tela + ': ' + r.paineis + ' painéis abertos, ' + r.problemas + ' problema(s)'
        );
        for (const i of r.lista) console.log('    ' + i);
      }
      console.log(
        errs.length ? '\nErros de JavaScript:\n  ' + errs.join('\n  ') : '\nNenhum erro de JavaScript no percurso.'
      );
    }
    done(total || errs.length ? 1 : 0);
  } catch (e) {
    console.error(e.message || e);
    done(2);
  }
}
main();
