// Teste de carga do modo Sobrevivência: várias salas com vários clientes WebSocket andando e agindo ao mesmo tempo, contra um servidor de verdade.
// Uso: node tools/survload.js [salas=10] [jogadores por sala=5] [segundos=40]
// Mede o tempo de resposta (ida e volta de 'tsync'), mensagens e bytes por segundo e o que o próprio servidor informa (tique médio, atraso do loop, memória).
const H = require('../harness.js'), M = require('../assets/survmap.js'), { SURV: S } = require('../assets/catalog.js');
const ROOMS = +process.argv[2] || 10, PER = +process.argv[3] || 5, SECS = +process.argv[4] || 40;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
const TOKEN = 'token-de-carga-1234567890';

(async () => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN, PERIP: '1000', PERIP_ROOM: '1000', PERIP_RATE: '100000', GLOBAL_RATE: '100000', MAXROOMS: '150', HTTP_RATE: '0' });
  const bots = [], rtt = [], st = { msgs: 0, bytes: 0, err: 0 };
  let ip = 1;
  for (let r = 0; r < ROOMS; r++) {
    let code = null, seed = 0;
    for (let i = 0; i < PER; i++) {
      const c = await H.connect(srv.port, '10.' + (ip >> 8) + '.' + (ip & 255) + '.7'); ip++;
      c.ws.send(JSON.stringify(i === 0 ? { t: 'create', surv: true, name: 'B' + r + '_' + i, cfg: {} } : { t: 'join', code, name: 'B' + r + '_' + i, cfg: {} }));
      if (!await H.until(() => c.msgs.some(m => m.t === 'joined'), 8000)) throw new Error('sala ' + r + ' bot ' + i + ' não entrou');
      const j = c.msgs.find(m => m.t === 'joined'); if (i === 0) { code = j.code; seed = j.sv.seed; }
      const b = { c, nodes: M.generate(seed).nodes, x: 0, z: 5, t: 0 }; bots.push(b);
      c.ws.on('message', d => { st.msgs++; st.bytes += d.length; if (typeof d === 'string' || d[0] === 0x7b) { try { const m = JSON.parse(d); if (m.t === 'tsync' && m.c) rtt.push(Date.now() - m.c); if (m.t === 'sverr') st.err++; } catch (e) { /* binário */ } } });
      c.msgs.length = 0; // não acumula na memória do teste
    }
  }
  console.log(`${ROOMS} salas × ${PER} jogadores = ${bots.length} clientes conectados; rodando ${SECS} s…`);
  const t0 = Date.now();
  const iv = setInterval(() => bots.forEach((b, k) => {
    const n = b.nodes[(k + Math.floor((Date.now() - t0) / 3000)) % b.nodes.length], d = Math.hypot(n.x - b.x, n.z - b.z) || 1, v = Math.min(.32, d);
    b.x += (n.x - b.x) / d * v; b.z += (n.z - b.z) / d * v;
    b.c.ws.send(JSON.stringify({ t: 'move', x: b.x, z: b.z, ry: 0, y: 0, s: 0 }));
    if (++b.t % 10 === 0) b.c.ws.send(JSON.stringify({ t: 'sv', a: 'collect', i: (k + b.t) % b.nodes.length }));
    if (b.t % 10 === 5) b.c.ws.send(JSON.stringify({ t: 'tsync', c: Date.now() }));
  }), 100);
  await sleep(SECS * 1000); clearInterval(iv);
  const s = await H.request(srv.port, '/status.json', { headers: { authorization: 'Bearer ' + TOKEN } });
  const j = s.json || {}, perf = j.perf || {}, res = j.resources || j.res || {};
  const real = (Date.now() - t0) / 1000;
  console.log(`resposta (ida e volta): p50 ${pct(rtt, .5)} ms · p95 ${pct(rtt, .95)} ms · p99 ${pct(rtt, .99)} ms (${rtt.length} medidas)`);
  console.log(`tráfego recebido: ${(st.msgs / real).toFixed(0)} msg/s · ${(st.bytes / 1024 / real).toFixed(0)} KiB/s no total · ${(st.bytes / 1024 / real / bots.length).toFixed(2)} KiB/s por jogador · ações recusadas: ${st.err}`);
  console.log('servidor:', JSON.stringify({ salas: j.rooms, jogadores: j.humans, tique: perf.tick, atrasoLoop: perf.loop || perf.lag, memoriaMB: res.rss ? Math.round(res.rss / 1048576) : undefined }));
  bots.forEach(b => b.c.ws.close()); await srv.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
