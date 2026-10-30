/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Teste de carga: sobe um servidor de teste (ou usa um que você indicar), enche salas com jogadores simulados que andam e conversam, e mede a cada
 * degrau o que o painel /status mede: tick, atraso do loop, CPU do processo, memória e banda. No fim sugere os limites de salas e de jogadores
 * por sala para o hardware onde o teste rodou.
 *
 * Uso:  node tools/loadtest.js [--steps 160,320,640,960,1280] [--per-room 32] [--hold 20] [--move 0.3] [--chat 30] [--pin 0] [--workers 6] [--out resultado.json]
 *   --steps      jogadores simultâneos em cada degrau (cada degrau acrescenta salas cheias); o total não passa de 3000
 *   --per-room   jogadores por sala (2 a 40)
 *   --hold       segundos medindo em cada degrau
 *   --move       fração dos jogadores andando ao mesmo tempo (0 a 1); o cliente real manda 10 posições/s só quando anda
 *   --chat       uma mensagem de chat a cada N s por jogador (0 desliga)
 *   --pin N      fixa o servidor no núcleo N (taskset) para medir o que um único núcleo aguenta; o gerador de carga usa os outros
 *   --workers    threads do gerador de carga (padrão: núcleos - 2, de 1 a 8)
 *   --url ws://host:porta --token TOKEN   mede um servidor já rodando (precisa de STATUS_TOKEN, TICKET_MODE=off e limites por IP altos; use só em teste)
 * Para um resultado fiel, rode na máquina de destino (o gerador compete por CPU: com 2 núcleos, use --pin 0 e rode o gerador de outra máquina com --url).
 */
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { monitorEventLoopDelay } = require('perf_hooks');
const WebSocket = require('ws');
const CAP = require('../capacity.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============================== jogadores simulados (threads) ==============================
if (!isMainThread) {
  const { port, host, perRoom, move, chat, id: wid } = workerData;
  const eld = monitorEventLoopDelay({ resolution: 10 }); eld.enable();
  const rooms = [], pending = [];
  const S = { joined: 0, failed: 0, dropped: 0, rxm: 0, rxb: 0, txm: 0, conns: 0 };
  let ipN = wid * 100000, connectsLeft = 0, lastConn = 0;
  const nextIp = () => { ipN++; return '10.' + ((ipN >> 16) & 255) + '.' + ((ipN >> 8) & 255) + '.' + (ipN & 255); };
  const clients = [];

  function open(room, first) {
    const c = { room, first, joined: false, x: (Math.random() - .5) * 10, z: (Math.random() - .5) * 6, ry: 0, moving: false, until: 0, lastTx: 0, ws: null, name: 'L' + wid + '_' + Math.random().toString(36).slice(2, 8) };
    const ws = new WebSocket('ws://' + host + ':' + port, { headers: { Origin: 'http://' + host + ':' + port, 'X-Forwarded-For': nextIp() }, perMessageDeflate: false });
    c.ws = ws; S.conns++;
    ws.on('open', () => ws.send(JSON.stringify(first ? { t: 'create', style: 'proxima', bots: 0, name: c.name } : { t: 'join', code: room.code, name: c.name })));
    ws.on('message', d => {
      S.rxm++; S.rxb += d.length;
      if (c.joined) return;
      let m; try { m = JSON.parse(d); } catch (e) { return; }
      if (m.t === 'joined') {
        c.joined = true; S.joined++; clients.push(c);
        if (first) { room.code = m.code; room.ready = true; }
      } else if (m.t === 'err') { S.failed++; c.dead = true; try { ws.close(); } catch (e) { /* já fechado */ } }
    });
    ws.on('close', () => { S.conns--; if (c.joined && !c.dead) { S.dropped++; S.joined--; } else if (!c.joined && !c.dead) S.failed++; c.dead = true; });
    ws.on('error', () => {});
    return c;
  }

  // abre no máximo ~60 conexões por segundo por thread: não é o que se mede
  setInterval(() => {
    for (const room of rooms) {
      if (room.started === undefined) { room.started = true; room.n = 1; open(room, true); continue; }
      if (room.ready && room.n < perRoom && connectsLeft > 0) { const k = Math.min(room.n === 1 ? 6 : 3, perRoom - room.n, connectsLeft); for (let i = 0; i < k; i++) { open(room, false); room.n++; connectsLeft--; } }
    }
    connectsLeft = Math.min(connectsLeft + 6, 60);
  }, 100);

  setInterval(() => {
    const now = Date.now();
    for (const c of clients) {
      if (c.dead || c.ws.readyState !== 1) continue;
      if (now > c.until) { c.moving = Math.random() < move; c.until = now + 2000 + Math.random() * 4000; c.dx = (Math.random() - .5) * .3; c.dz = (Math.random() - .5) * .3; }
      if (c.moving) {
        c.x += c.dx; c.z += c.dz; c.ry = Math.atan2(c.dx, c.dz);
        if (Math.abs(c.x) > 6) c.dx = -c.dx; if (Math.abs(c.z) > 4) c.dz = -c.dz;
        c.ws.send(JSON.stringify({ t: 'move', x: c.x, z: c.z, ry: c.ry, y: 0, s: 0 })); S.txm++; c.lastTx = now;
      } else if (now - c.lastTx > 2000) { c.ws.send(JSON.stringify({ t: 'move', x: c.x, z: c.z, ry: c.ry, y: 0, s: 0 })); S.txm++; c.lastTx = now; }
      if (chat > 0 && Math.random() < .1 / chat) { c.ws.send(JSON.stringify({ t: 'chat', text: 'oi ' + Math.random().toString(36).slice(2, 7) })); S.txm++; }
    }
  }, 100);

  setInterval(() => {
    parentPort.postMessage({ t: 'stat', ...S, lagP99: +(eld.percentile(99) / 1e6).toFixed(1), lagMax: +(eld.max / 1e6).toFixed(1) });
    S.rxm = 0; S.rxb = 0; S.txm = 0; eld.reset();
  }, 1000);

  parentPort.on('message', m => {
    if (m.cmd === 'rooms') { for (let i = 0; i < m.n; i++) rooms.push({ code: null, ready: false }); connectsLeft = 60; }
    if (m.cmd === 'stop') process.exit(0);
  });
  return;
}

// ============================== orquestração ==============================
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };
const steps = String(opt('steps', '160,320,640,960')).split(',').map(Number).filter(n => n > 0);
const perRoom = +opt('per-room', 32), hold = +opt('hold', 20), moveFrac = Math.max(0, Math.min(1, +opt('move', .3))), chatEvery = +opt('chat', 30);
const pin = opt('pin', null), outFile = opt('out', null), extUrl = opt('url', null);
const nWorkers = Math.max(1, Math.min(8, +opt('workers', Math.max(1, os.cpus().length - 2))));
const root = path.join(__dirname, '..');
const maxT = Math.max(...steps);
if (maxT > CAP.ABS.maxPlayers) { console.error('O servidor foi projetado para no máximo ' + CAP.ABS.maxPlayers + ' jogadores: reduza --steps.'); process.exit(1); }
if (!(perRoom >= CAP.ABS.minPerRoom && perRoom <= CAP.ABS.maxPerRoom)) { console.error('Use --per-room de ' + CAP.ABS.minPerRoom + ' a ' + CAP.ABS.maxPerRoom + '.'); process.exit(1); }
if (Math.ceil(maxT / perRoom) + 2 > CAP.ABS.maxRooms) { console.error('Com salas de ' + perRoom + ', o maior degrau (' + maxT + ') passa do teto de ' + CAP.ABS.maxRooms + ' salas: reduza --steps ou aumente --per-room.'); process.exit(1); }

let server = null, host = '127.0.0.1', port = 0, token = '';
async function startServer() {
  token = 'loadtest' + Math.random().toString(36).slice(2, 16) + Math.random().toString(36).slice(2, 10);
  const env = { ...process.env, PORT: '0', BIND_HOST: '127.0.0.1', STATUS_TOKEN: token, BAN_FILE: '0', RECORDS_FILE: '0', CAPACITY_FILE: '0', REPORTS_FILE: '0', TICKET_MODE: 'off', HTTP_RATE: '0',
    PERIP: '1000', PERIP_ROOM: '1000', PERIP_RATE: '1000000', GLOBAL_RATE: '0', MAXBOTS: '0', MAXROOMS: String(Math.ceil(maxT / perRoom) + 2), MAX_PER_ROOM: String(perRoom) };
  const useTaskset = pin !== null && spawnSync('which', ['taskset']).status === 0;
  if (pin !== null && !useTaskset) console.warn('taskset não encontrado: o servidor não foi fixado em um núcleo.');
  server = useTaskset ? spawn('taskset', ['-c', String(pin), process.execPath, 'server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stderr.on('data', d => { log += d; });
  port = await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('servidor não subiu: ' + log)), 20000);
    server.stdout.on('data', d => { log += d; const m = /escutando em [^:]+:(\d+)/.exec(log); if (m) { clearTimeout(to); resolve(+m[1]); } });
    server.on('exit', c => reject(new Error('servidor saiu (' + c + '): ' + log)));
  });
}
const getStatus = () => new Promise((resolve, reject) => {
  const r = http.get({ host, port, path: '/status.json', headers: { Authorization: 'Bearer ' + token } }, res => {
    const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(ch).toString('utf8'))); } catch (e) { reject(e); } });
  });
  r.on('error', reject); r.setTimeout(8000, () => r.destroy(new Error('tempo esgotado')));
});
const CLK = (() => { try { return +spawnSync('getconf', ['CLK_TCK']).stdout.toString() || 100; } catch (e) { return 100; } })();
const cpuTicks = () => { try { const f = fs.readFileSync('/proc/' + server.pid + '/stat', 'utf8'); const a = f.slice(f.lastIndexOf(')') + 2).split(' '); return +a[11] + +a[12]; } catch (e) { return null; } };
const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;

(async () => {
  if (extUrl) { const u = new URL(extUrl); host = u.hostname; port = +u.port || 80; token = String(opt('token', '')); if (!token) { console.error('--url exige --token.'); process.exit(1); } }
  else await startServer();
  console.log('Teste de carga: ' + (extUrl ? extUrl : 'servidor local na porta ' + port + (pin !== null ? ' (fixado no núcleo ' + pin + ')' : '')) + ' · salas de ' + perRoom + ' · ' + Math.round(moveFrac * 100) + '% andando · degraus: ' + steps.join(', '));
  console.log('Máquina: ' + os.cpus().length + ' núcleos (' + (os.cpus()[0] || {}).model + '), ' + Math.round(os.totalmem() / 2 ** 30) + ' GB de RAM, Node ' + process.version + '\n');

  const workers = [], W = [];
  for (let i = 0; i < nWorkers; i++) {
    const w = new Worker(__filename, { workerData: { port, host, perRoom, move: moveFrac, chat: chatEvery, id: i } });
    const st = { joined: 0, failed: 0, dropped: 0, rxm: 0, rxb: 0, txm: 0, lagP99: 0, lagMax: 0 };
    w.on('message', m => { if (m.t === 'stat') Object.assign(st, m); });
    w.on('error', e => console.error('gerador:', e));
    workers.push(w); W.push(st);
  }
  const tot = k => W.reduce((s, x) => s + (x[k] || 0), 0);
  let rooms = 0; const rows = []; let stopWhy = '';

  for (const T of steps) {
    const need = Math.ceil(T / perRoom);
    for (let i = rooms; i < need; i++) workers[i % nWorkers].postMessage({ cmd: 'rooms', n: 1 });
    rooms = need;
    const target = need * perRoom, t0 = Date.now();
    process.stdout.write('Degrau ' + T + ' (' + need + ' salas × ' + perRoom + ')… entrando');
    while (tot('joined') < target * .98 && Date.now() - t0 < 60000 + target * 60) { await sleep(500); }
    const reached = tot('joined');
    if (reached < target * .98) { stopWhy = 'só ' + reached + ' de ' + target + ' jogadores conseguiram entrar'; console.log(' falhou (' + stopWhy + ', recusas: ' + tot('failed') + ')'); rows.push({ steps: T, players: reached, fail: true }); break; }
    await sleep(4000);
    process.stdout.write(' medindo ' + hold + ' s');
    const tick = [], tmax = [], p99 = [], lagG = [], cpu = [], out = [], rss = [], inS = [], outS = [], rxB = [];
    let c0 = cpuTicks(), tt0 = Date.now(), st0 = null, hostCpu = [];
    for (let s = 0; s < hold; s++) {
      await sleep(1000);
      try {
        const d = await getStatus(); st0 = d;
        tick.push(d.perf.tick.avg); tmax.push(d.perf.tick.max); p99.push(d.perf.loop.p99); out.push(d.perf.msgs.bytesOutPerSec); rss.push(d.resources.game.rss);
        inS.push(d.perf.msgs.inPerSec); outS.push(d.perf.msgs.outPerSec); hostCpu.push(d.resources.cpu.process * d.resources.cpu.cores);
      } catch (e) { /* amostra perdida */ }
      lagG.push(Math.max(...W.map(x => x.lagP99))); rxB.push(tot('rxb'));
    }
    const c1 = cpuTicks(), dt = (Date.now() - tt0) / 1000;
    const cpuCore = c0 !== null && c1 !== null ? (c1 - c0) / CLK / dt * 100 : avg(hostCpu);
    const row = { steps: T, rooms: need, players: tot('joined'), dropped: tot('dropped'), tickAvg: +avg(tick).toFixed(1), tickMax: +Math.max(...tmax, 0).toFixed(1), loopP99: +pct(p99, .95).toFixed(1), cpuCore: +cpuCore.toFixed(0),
      rssMB: +(Math.max(...rss, 0) / 2 ** 20).toFixed(0), outKBps: +(avg(out) / 1024).toFixed(0), outMsgs: +avg(outS).toFixed(0), inMsgs: +avg(inS).toFixed(0), genLagP99: +pct(lagG, .95).toFixed(1), rxKBps: +(avg(rxB.map((v, i, a) => i ? v - a[i - 1] : 0)) / 1024).toFixed(0) };
    row.kbpsPerPlayer = +(row.outKBps / Math.max(1, row.players)).toFixed(2);
    row.level = row.tickAvg > 50 || row.loopP99 > 100 || row.cpuCore > 90 ? 'crit' : row.tickAvg > 20 || row.loopP99 > 50 || row.cpuCore > 60 ? 'warn' : 'ok';
    rows.push(row);
    console.log(' → tick ' + row.tickAvg + ' ms (máx ' + row.tickMax + '), loop p99 ' + row.loopP99 + ' ms, CPU ' + row.cpuCore + '% de um núcleo, ' + row.outKBps + ' KB/s enviados [' + row.level + ']');
    if (row.dropped > row.players * .02) { stopWhy = 'conexões caindo (' + row.dropped + ')'; break; }
    if (row.level === 'crit') { stopWhy = 'o servidor passou do limite neste degrau'; break; }
  }
  workers.forEach(w => w.postMessage({ cmd: 'stop' }));
  if (server) { server.kill('SIGTERM'); }

  // ------------------------------ relatório ------------------------------
  const ok = rows.filter(r => r.level === 'ok'), safe = ok.length ? ok[ok.length - 1] : null;
  const pad = (v, n) => String(v).padStart(n);
  console.log('\nJogadores | salas | tick médio/máx (ms) | loop p99 | CPU (1 núcleo) | RAM | envio KB/s | KB/s por jogador | nível');
  for (const r of rows) if (!r.fail) console.log(pad(r.players, 9) + ' | ' + pad(r.rooms, 5) + ' | ' + pad(r.tickAvg + ' / ' + r.tickMax, 19) + ' | ' + pad(r.loopP99 + ' ms', 8) + ' | ' + pad(r.cpuCore + '%', 14) + ' | ' + pad(r.rssMB + ' MB', 6) + ' | ' + pad(r.outKBps, 10) + ' | ' + pad(r.kbpsPerPlayer, 16) + ' | ' + r.level + (r.genLagP99 > 50 ? ' (gerador saturado)' : ''));
  if (stopWhy) console.log('\nParou: ' + stopWhy + '.');
  const last = [...rows].reverse().find(r => !r.fail);
  const rec = { perRoom, safePlayers: safe ? safe.players : 0, recommended: 0, rooms: 0 };
  if (safe) {
    rec.recommended = Math.floor(safe.players * .75 / perRoom) * perRoom; rec.rooms = rec.recommended / perRoom;
    const monthly = safe.kbpsPerPlayer * 1024 * rec.recommended * 2.592e6 / 1e12;
    console.log('\nRecomendação para este hardware, com salas de ' + perRoom + ':');
    console.log('  • Maior degrau sem alerta: ' + safe.players + ' jogadores (tick ' + safe.tickAvg + ' ms, CPU ' + safe.cpuCore + '% de um núcleo).');
    console.log('  • Limite sugerido (75% do degrau, folga para picos): ' + rec.rooms + ' salas × ' + perRoom + ' = ' + rec.recommended + ' jogadores.');
    console.log('  • Banda medida: ' + safe.kbpsPerPlayer + ' KB/s por jogador → com ' + rec.recommended + ' sempre online, cerca de ' + monthly.toFixed(1) + ' TB/mês de envio do jogo (sem rádio do DJ, vídeo ou TURN).');
    console.log('  • Memória: ' + safe.rssMB + ' MB no degrau de ' + safe.players + ' jogadores.');
  } else console.log('\nNenhum degrau ficou sem alerta: reduza os degraus (--steps) para achar o limite.');
  if (last && last.genLagP99 > 50) console.log('\nAviso: o gerador de carga ficou saturado (atraso ' + last.genLagP99 + ' ms): rode-o de outra máquina (--url) ou com menos jogadores por degrau.');
  console.log('\nLimites de nível: OK = tick ≤ 20 ms, loop p99 ≤ 50 ms e CPU ≤ 60% de um núcleo; Atenção até 50 ms / 100 ms / 90%; Crítico acima disso.');
  if (outFile) fs.writeFileSync(String(outFile), JSON.stringify({ machine: { cores: os.cpus().length, model: (os.cpus()[0] || {}).model, ramGB: Math.round(os.totalmem() / 2 ** 30), node: process.version }, perRoom, pin, moveFrac, rows, recommendation: rec }, null, 1));
  process.exit(0);
})().catch(e => { console.error(e); if (server) server.kill('SIGTERM'); process.exit(1); });
