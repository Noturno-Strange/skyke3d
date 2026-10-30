/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Auditoria de contraste (WCAG 2.x) do texto da interface em tema escuro, claro e alto contraste.
 * Abre o jogo no Chrome headless, percorre a tela inicial e cada janela do jogo e mede a razão de contraste
 * de todo texto visível contra o fundo efetivo (cores semitransparentes compostas; em gradiente vale o pior ponto).
 *
 * Uso:  node tools/contrast-audit.js [--url http://localhost:3999/] [--json]
 * Sem --url, sobe um servidor próprio na porta 3998. Sai com código 1 se houver algo abaixo do mínimo.
 * Mínimos: 4,5:1 (3:1 em texto grande); em alto contraste 7:1 (4,5:1 em texto grande).
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const args = process.argv.slice(2);
const argv = k => { const i = args.indexOf(k); return i < 0 ? null : (args[i + 1] || true); };
const AS_JSON = args.includes('--json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Roda dentro da página: devolve os textos abaixo do mínimo do modo atual.
const PAGE_AUDIT = `(hc => {
  const parse = s => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const page = parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  // Fundos possíveis atrás de um elemento: lista de cores opacas (várias quando há gradiente).
  const backs = el => {
    const chain = []; for (let e = el; e; e = e.parentElement) chain.push(e);
    let opts = [{ r: page.r, g: page.g, b: page.b, a: 1 }];
    for (const e of chain.reverse()) {
      const cs = getComputedStyle(e), layers = [];
      const bc = parse(cs.backgroundColor); if (bc && bc.a > 0) layers.push([bc]);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        const cols = (cs.backgroundImage.match(/rgba?\\([^)]+\\)/g) || []).map(parse).filter(Boolean);
        if (cols.length) layers.push(cols);
      }
      for (const l of layers) opts = opts.flatMap(o => l.map(c => over(c, o)));
    }
    return opts;
  };
  const seen = new Map(), out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const t = n.nodeValue.replace(/\\s+/g, ' ').trim(); if (!t) continue;
    const el = n.parentElement; if (!el || /^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(el.tagName)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
    let vis = true, alpha = 1;
    for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') { vis = false; break; } alpha *= +cs.opacity; }
    if (!vis || alpha < .05) continue;
    if (!/[A-Za-z0-9À-ÿ]/.test(t)) continue; // só emoji/símbolo: o contraste de ícone é 3:1 e não entra aqui
    const cs = getComputedStyle(el), fg = parse(cs.color); if (!fg || fg.a === 0 || el.closest(':disabled')) continue; // texto de gradiente (cor transparente) e controle desativado ficam de fora
    fg.a *= alpha;
    const px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
    const big = px >= 24 || (px >= 18.66 && bold);
    const min = hc ? (big ? 4.5 : 7) : (big ? 3 : 4.5);
    let worst = 99, wb = null;
    for (const b of backs(el)) { const rr = ratio(over(fg, b), b); if (rr < worst) { worst = rr; wb = b; } }
    if (worst >= min) continue;
    const id = el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
    let anc = ''; for (let e = el.parentElement; e; e = e.parentElement) if (e.id) { anc = '#' + e.id + ' '; break; }
    const key = anc + id + '|' + cs.color + '|' + (wb ? wb.r | 0 : 0) + (wb ? wb.g | 0 : 0) + (wb ? wb.b | 0 : 0);
    if (seen.has(key)) { seen.get(key).n++; continue; }
    const rec = { sel: anc + id, text: t.slice(0, 28), ratio: +worst.toFixed(2), min, px: +px.toFixed(1), fg: cs.color, bg: wb ? 'rgb(' + [wb.r, wb.g, wb.b].map(v => v | 0).join(',') + ')' : '?', n: 1 };
    seen.set(key, rec); out.push(rec);
  }
  return out;
})`;

async function main() {
  let server = null;
  let url = argv('--url');
  if (!url) {
    server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: '3998', RECORDS_FILE: '0', BAN_FILE: '0' }, stdio: 'ignore'
    });
    url = 'http://localhost:3998/';
    for (let i = 0; i < 40; i++) { try { await fetch(url); break; } catch { await sleep(250); } }
  }
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--window-size=1280,720', '--remote-debugging-port=' + port, '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  const done = code => { try { chrome.kill(); } catch {} try { server && server.kill(); } catch {} process.exit(code); };
  try {
    await sleep(2500);
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));
    let id = 0; const pend = {};
    ws.on('message', m => { const d = JSON.parse(m); if (d.id && pend[d.id]) { pend[d.id](d.result || d.error); delete pend[d.id]; } });
    const send = (method, params = {}) => new Promise(r => { pend[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
    const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result ? r.result.value : null; };
    await send('Runtime.enable'); await send('Page.enable');
    const q = url + (url.includes('?') ? '&' : '?') + 'q=low';
    await send('Page.navigate', { url: q }); await sleep(3500);
    await ev("localStorage.setItem('skyke_adult','1')");
    await send('Page.navigate', { url: q }); await sleep(3000);
    await ev("localStorage.setItem('skyke_terms',TERMS_VER)");// aceite com a versão atual do documento
    await send('Page.navigate', { url: q }); await sleep(4500);

    const setMode = (theme, hc) => ev(`(()=>{const R=document.documentElement;R.dataset.theme=${JSON.stringify(theme)};R.dataset.hc=${JSON.stringify(hc ? 'on' : 'off')}})()`);
    const MODES = [['escuro', 'dark', false], ['claro', 'light', false], ['escuro+AC', 'dark', true], ['claro+AC', 'light', true]];
    const results = [];
    const run = async (scene) => {
      for (const [name, th, hc] of MODES) {
        await setMode(th, hc); await sleep(600);
        for (const r of await ev(PAGE_AUDIT + '(' + hc + ')') || []) results.push({ scene, mode: name, ...r });
      }
    };

    await ev("document.querySelector('#iPlay') && document.querySelector('#iPlay').click()"); await sleep(800);
    await run('inicio');
    await ev("(()=>{const i=document.querySelector('#name');i.value='Auditor';i.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await ev("document.querySelector('#go').click()"); await sleep(9000);
    await run('jogo');
    const PANELS = ['bChat', 'bVid', 'bDJ', 'bKar', 'bEmo', 'bGes', 'bMochila', 'bVis', 'bInvite', 'bSet', 'bNotif'];
    for (const b of PANELS) {
      await ev(`(()=>{const b=document.getElementById('${b}');b&&b.click()})()`); await sleep(500);
      await run('janela ' + b);
      await ev(`(()=>{const b=document.getElementById('${b}');b&&b.click()})()`); await sleep(200);
    }

    // tira repetidos entre cenas (mesmo seletor/modo/cores)
    const uniq = new Map();
    for (const r of results) { const k = [r.mode, r.sel, r.fg, r.bg].join('|'); if (!uniq.has(k)) uniq.set(k, r); }
    const list = [...uniq.values()].sort((a, b) => a.ratio - b.ratio);
    if (AS_JSON) console.log(JSON.stringify(list, null, 1));
    else {
      console.log(list.length ? list.length + ' texto(s) abaixo do mínimo:' : 'Nenhum texto abaixo do mínimo de contraste.');
      for (const r of list) console.log(`${String(r.ratio).padStart(5)}:1 (mín ${r.min}) [${r.mode}] ${r.sel} "${r.text}" ${r.px}px  fg ${r.fg}  bg ${r.bg}  (${r.scene})`);
    }
    done(list.length ? 1 : 0);
  } catch (e) { console.error(e); done(2); }
}
main();
