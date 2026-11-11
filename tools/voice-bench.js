/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Medição da voz pelo WebSocket: sobe um servidor de teste, enche uma sala com jogadores simulados e faz alguns deles "falarem"
 * (quadros do tamanho de um quadro Opus de 20 ms, 50 por segundo). Mede o que interessa para decidir entre WebSocket e WebRTC:
 *   - atraso do repasse (do envio de quem fala até a chegada em quem ouve): mediana, p95 e p99;
 *   - quadros perdidos ou descartados;
 *   - CPU e memória do servidor e a banda de voz que ele envia;
 * e põe ao lado o que a malha WebRTC gastaria no MESMO cenário (conta fechada: na malha o servidor não repassa áudio, mas cada pessoa
 * que fala envia uma cópia para cada ouvinte e todo mundo mantém uma conexão com cada um da sala).
 *
 * Uso:  node tools/voice-bench.js [--cenarios 2:1,10:2,20:3,40:4] [--segundos 8] [--bytes 80] [--out resultado.json]
 *   --cenarios   lista de "pessoas na sala:quantas falam ao mesmo tempo"
 *   --segundos   tempo de medição de cada cenário
 *   --bytes      tamanho do áudio de cada quadro (80 ≈ Opus a 32 kbps; 120 ≈ 48 kbps do karaokê)
 * É uma medição do servidor e do transporte, com quadros sintéticos na mesma máquina: não mede a qualidade do som nem redes ruins.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { monitorEventLoopDelay } = require('perf_hooks');
const WebSocket = require('ws');

const root = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i < 0 || argv[i + 1] === undefined ? d : argv[i + 1];
};
const SCEN = String(arg('cenarios', '2:1,10:2,20:3,40:4'))
  .split(',')
  .map(s => s.split(':').map(Number))
  .filter(([n, k]) => Number.isInteger(n) && Number.isInteger(k) && n >= 2 && n <= 40 && k >= 1 && k < n);
const SECS = Math.max(3, Math.min(120, Number(arg('segundos', 8)) || 8));
const BYTES = Math.max(20, Math.min(500, Number(arg('bytes', 80)) || 80));
const OUT = arg('out', '');
if (!SCEN.length) {
  console.error(
    'Use --cenarios no formato pessoas:falantes, com 2 a 40 pessoas e pelo menos um ouvinte (ex.: 10:2,40:4).'
  );
  process.exit(1);
}

let server = null,
  port = 0;
const token = 'voicebench' + Math.random().toString(36).slice(2, 16) + Math.random().toString(36).slice(2, 12);
async function startServer() {
  const env = {
    ...process.env,
    PORT: '0',
    BIND_HOST: '127.0.0.1',
    STATUS_TOKEN: token,
    VOICE_TRANSPORT: 'ws',
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
    BADGES_FILE: '0',
    SECURITY_LOG: '0',
    TICKET_MODE: 'off',
    HTTP_RATE: '0',
    PERIP: '1000',
    PERIP_ROOM: '1000',
    PERIP_RATE: '1000000',
    GLOBAL_RATE: '0',
    MAXBOTS: '0',
    MAX_PER_ROOM: '40'
  };
  server = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stderr.on('data', d => (log += d));
  port = await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('o servidor não subiu: ' + log)), 30000);
    server.stdout.on('data', d => {
      log += d;
      const m = /escutando em [^:]+:(\d+)/.exec(log);
      if (m) {
        clearTimeout(to);
        resolve(+m[1]);
      }
    });
    server.on('exit', c => reject(new Error('o servidor saiu (' + c + '): ' + log)));
  });
}
const status = () =>
  new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: '/status.json', headers: { authorization: 'Bearer ' + token } }, res => {
        const ch = [];
        res.on('data', c => ch.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(ch).toString('utf8')));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });

let ipN = 0;
/** um jogador simulado: entra na sala e conta os quadros de voz que recebe, com o atraso de cada um */
function join(code) {
  return new Promise((resolve, reject) => {
    ipN++;
    const ws = new WebSocket('ws://127.0.0.1:' + port, {
      headers: {
        Origin: 'http://127.0.0.1:' + port,
        'X-Forwarded-For': '10.9.' + ((ipN >> 8) & 255) + '.' + (ipN & 255)
      }
    });
    const c = { ws, code: '', id: '', got: 0, lat: [], seqGap: 0, last: new Map() };
    const to = setTimeout(() => reject(new Error('não entrou na sala')), 15000);
    ws.on('open', () =>
      ws.send(
        JSON.stringify(
          code ? { t: 'join', code, name: 'V' + ipN } : { t: 'create', style: 'amazora', bots: 0, name: 'V' + ipN }
        )
      )
    );
    ws.on('message', (d, bin) => {
      if (bin) {
        // [2][u32 id][codec][seq][8 bytes: hora do envio em ns][enchimento]
        if (d[0] !== 2 || d.length < 15) return;
        const from = d.readUInt32LE(1),
          seq = d[6],
          sent = d.readBigUInt64LE(7);
        c.got++;
        c.lat.push(Number(process.hrtime.bigint() - sent) / 1e6);
        const prev = c.last.get(from);
        if (prev !== undefined) c.seqGap += (seq - prev - 1 + 256) % 256;
        c.last.set(from, seq);
        return;
      }
      const m = JSON.parse(d);
      if (m.t === 'joined') {
        clearTimeout(to);
        c.code = m.code;
        c.id = m.id;
        resolve(c);
      } else if (m.t === 'err') {
        clearTimeout(to);
        reject(new Error(m.msg || 'erro ao entrar'));
      }
    });
    ws.on('error', reject);
  });
}
const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);

async function scenario(n, k) {
  const cs = [await join('')];
  for (let i = 1; i < n; i++) cs.push(await join(cs[0].code));
  // todos ouvem (microfone ligado); os k primeiros falam. Opus para a sala inteira
  for (const c of cs) {
    c.ws.send(JSON.stringify({ t: 'vcap', opus: true }));
    c.ws.send(JSON.stringify({ t: 'vlisten', v: true }));
  }
  await sleep(400);
  for (let i = 0; i < k; i++) cs[i].ws.send(JSON.stringify({ t: 'speak', v: true }));
  await sleep(1200); // deixa a janela de 10 s do painel começar limpa
  const eld = monitorEventLoopDelay({ resolution: 5 });
  eld.enable();
  for (const c of cs) {
    c.got = 0;
    c.lat.length = 0;
    c.seqGap = 0;
    c.last.clear();
  }
  let sent = 0,
    seq = 0;
  const cpu0 = process.cpuUsage();
  const t0 = Date.now();
  const frame = Buffer.alloc(3 + 8 + Math.max(0, BYTES - 8));
  frame[0] = 2;
  frame[1] = 1;
  const tm = setInterval(() => {
    seq = (seq + 1) & 255;
    for (let i = 0; i < k; i++) {
      const b = Buffer.from(frame);
      b[2] = seq;
      b.writeBigUInt64LE(process.hrtime.bigint(), 3);
      if (cs[i].ws.readyState === 1) {
        cs[i].ws.send(b);
        sent++;
      }
    }
  }, 20);
  const cpuS = [],
    rssS = [];
  const poll = setInterval(async () => {
    try {
      const s = await status();
      // o painel dá a CPU do processo como fração da máquina inteira: vezes os núcleos, vira "% de um núcleo" (o servidor usa um só)
      cpuS.push(s.resources.cpu.process * s.resources.cpu.cores);
      rssS.push(s.resources.game.rss);
    } catch (e) {
      /* a próxima leitura tenta de novo */
    }
  }, 1000);
  await sleep(SECS * 1000);
  clearInterval(tm);
  await sleep(600);
  clearInterval(poll);
  const st = await status();
  const secs = (Date.now() - t0 - 600) / 1000;
  eld.disable();
  const genCpu = process.cpuUsage(cpu0);
  const all = cs.flatMap(c => c.lat).sort((a, b) => a - b);
  // cada quadro deve chegar a todos menos a quem falou
  const expected = sent * (n - 1),
    got = cs.reduce((a, c) => a + c.got, 0);
  const bitrate = (BYTES * 8 * 50) / 1000; // kbps de áudio por pessoa que fala
  const row = {
    pessoas: n,
    falando: k,
    enviados: sent,
    esperados: expected,
    recebidos: got,
    perdidos: expected - got,
    atraso_ms: {
      mediana: +pct(all, 0.5).toFixed(2),
      p95: +pct(all, 0.95).toFixed(2),
      p99: +pct(all, 0.99).toFixed(2),
      max: +(all[all.length - 1] || 0).toFixed(2)
    },
    servidor: {
      cpu_pct: cpuS.length ? +(cpuS.reduce((a, b) => a + b, 0) / cpuS.length).toFixed(1) : 0,
      rss_mb: rssS.length ? Math.round(Math.max(...rssS) / 1048576) : 0,
      voz_saida_kbps: Math.round((st.perf.voice.bytesOutPerSec * 8) / 1000),
      descartados: st.perf.voice.dropped,
      laco_p99_ms: st.perf.loop.p99
    },
    gerador: {
      laco_p99_ms: +(eld.percentile(99) / 1e6).toFixed(1),
      cpu_pct: +(((genCpu.user + genCpu.system) / 1e4 / secs) | 0)
    },
    // o mesmo cenário na malha WebRTC (conta, não medição): o servidor não repassa áudio; quem fala manda uma cópia para cada um
    webrtc_malha: {
      servidor_voz_kbps: 0,
      envio_de_quem_fala_kbps: Math.round(bitrate * (n - 1)),
      conexoes_por_pessoa: n - 1,
      conexoes_na_sala: (n * (n - 1)) / 2
    },
    ws: {
      envio_de_quem_fala_kbps: Math.round(bitrate + (3 * 8 * 50) / 1000),
      recebe_cada_ouvinte_kbps: Math.round((k * (BYTES + 7) * 8 * 50) / 1000),
      conexoes_por_pessoa: 1
    }
  };
  for (const c of cs) c.ws.close();
  await sleep(500);
  return row;
}

(async () => {
  await startServer();
  const rows = [];
  try {
    for (const [n, k] of SCEN) {
      process.stdout.write('medindo ' + n + ' pessoas, ' + k + ' falando… ');
      const r = await scenario(n, k);
      rows.push(r);
      console.log(
        'atraso ' +
          r.atraso_ms.mediana +
          ' ms (p95 ' +
          r.atraso_ms.p95 +
          ', p99 ' +
          r.atraso_ms.p99 +
          '), perdidos ' +
          r.perdidos +
          ', CPU ' +
          r.servidor.cpu_pct +
          '%'
      );
    }
  } finally {
    server.kill('SIGTERM');
  }
  console.log(
    '\nVoz pelo WebSocket (medido) e a malha WebRTC no mesmo cenário (conta), com ' +
      BYTES +
      ' bytes por quadro de 20 ms:\n'
  );
  console.table(
    rows.map(r => ({
      pessoas: r.pessoas,
      falando: r.falando,
      'atraso med. (ms)': r.atraso_ms.mediana,
      'p95 (ms)': r.atraso_ms.p95,
      'p99 (ms)': r.atraso_ms.p99,
      perdidos: r.perdidos,
      'CPU serv. (% de 1 núcleo)': r.servidor.cpu_pct,
      'RSS (MB)': r.servidor.rss_mb,
      'voz serv. (kbps)': r.servidor.voz_saida_kbps,
      'WS: envio de quem fala (kbps)': r.ws.envio_de_quem_fala_kbps,
      'WebRTC: envio de quem fala (kbps)': r.webrtc_malha.envio_de_quem_fala_kbps,
      'WebRTC: conexões na sala': r.webrtc_malha.conexoes_na_sala
    }))
  );
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ bytes: BYTES, segundos: SECS, linhas: rows }, null, 1));
  if (rows.some(r => r.gerador.laco_p99_ms > 40))
    console.warn('Atenção: o gerador de carga atrasou (laço p99 acima de 40 ms); o atraso medido inclui esse atraso.');
  process.exit(0);
})().catch(e => {
  console.error(e.message || e);
  if (server) server.kill('SIGKILL');
  process.exit(1);
});
