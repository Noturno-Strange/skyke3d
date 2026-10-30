// Joga uma rodada do modo Sobrevivência com N clientes WebSocket de verdade contra um servidor de verdade (sem navegador).
// Uso: node tools/survplay.js [jogadores=5] [velocidade=10]   (velocidade acelera só o relógio da rodada: SURVIVAL_SPEED)
// Cada cliente usa só o que o jogo real usa: a semente do mapa, svs/svm e as ações {t:'sv'}; anda a 3,2 m/s mandando 'move'.
const H = require('../harness.js'), M = require('../assets/survmap.js'), { SURV: S } = require('../assets/catalog.js');
const N = +process.argv[2] || 5, SPEED = +process.argv[3] || 10;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

(async () => {
  const srv = await H.startServer({ SURVIVAL_SPEED: String(SPEED), PERIP: '50', PERIP_ROOM: '50', PERIP_RATE: '1000' });
  const t0 = Date.now(), bots = [], log = { events: {}, err: {}, svs: 0, svm: 0, bytes: 0 };
  const mk = async i => {
    const c = await H.connect(srv.port, '203.0.113.' + (10 + i)); c.ws.on('message', d => { log.bytes += d.length; });
    c.ws.send(JSON.stringify(i === 0 ? { t: 'create', surv: true, name: 'Bot' + i, cfg: {} } : { t: 'join', code: bots[0].code, name: 'Bot' + i, cfg: {} }));
    if (!await H.until(() => c.msgs.some(m => m.t === 'joined'), 6000)) throw new Error('bot ' + i + ' não entrou');
    const j = c.msgs.find(m => m.t === 'joined');
    return { c, id: j.id, code: j.code, seed: j.sv.seed, nodes: M.generate(j.sv.seed).nodes, x: 0, z: 5, pub: j.sv.pub, me: { m: {}, inv: {}, f: 0 }, end: null, i };
  };
  for (let i = 0; i < N; i++) bots.push(await mk(i));
  const tap = b => b.c.ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'svs') { b.pub = m; log.svs++; } else if (m.t === 'svm') { b.me = m; log.svm++; }
    else if (m.t === 'sve' && b.i === 0) m.e.forEach(e => log.events[e.t] = (log.events[e.t] || 0) + 1);
    else if (m.t === 'sverr') log.err[m.e] = (log.err[m.e] || 0) + 1; else if (m.t === 'svend') b.end = m; });
  bots.forEach(tap);
  console.log(`${N} jogadores na sala ${bots[0].code}, semente ${bots[0].seed}, velocidade ×${SPEED}`);

  const act = (b, o) => b.c.ws.send(JSON.stringify({ t: 'sv', ...o }));
  const F = { x: S.fire.x, z: S.fire.z };
  const step = b => {
    const p = { x: b.x, z: b.z }, inv = b.me.inv || {}, m = b.me.m || {}, pub = b.pub;
    if (b.me.f || pub.ov) return;
    const nearF = dist(p, F) <= S.cook.radius;
    let target = null;
    if (nearF) {
      if (pub.fire <= 0) act(b, { a: 'relight' });
      else if (pub.fire < 60 && inv.lenha > 0) act(b, { a: 'fuel', res: 'lenha' });
      else if (pub.fire < 80 && inv.graveto > 0) act(b, { a: 'fuel', res: 'graveto' });
      if (pub.pot && pub.pot.ok) act(b, { a: 'take' });
      else if (!pub.pot && inv.raiz > 0 && (m.fome || 0) < 70) act(b, { a: 'cook', rid: 'raiz_assada' });
    }
    if ((m.sede || 0) < 60 && inv.agua > 0) act(b, { a: 'eat', res: 'agua' });
    const food = ['fruta', 'cogumelo'].find(k => inv[k] > 0);
    if ((m.fome || 0) < 55 && food) act(b, { a: 'eat', res: food });
    for (const q of pub.pl) if (q[1] && q[0] !== b.id) { const o = bots.find(x => x.id === q[0]); if (o && dist(p, o) <= S.revive.radius) { act(b, { a: 'rev', to: q[0] }); return; } else if (o) target = { x: o.x, z: o.z }; }
    if (!target) {
      const need = pub.fire < 70 && !(inv.lenha > 0 || inv.graveto > 0) ? ['lenha', 'graveto'] : (m.sede || 0) < 70 && !inv.agua ? ['agua'] : (m.fome || 0) < 70 && !(inv.fruta || inv.raiz || inv.cogumelo) ? ['raiz', 'fruta', 'cogumelo'] : null;
      if (need) { let bd = 1e9; b.nodes.forEach((n, i) => { if (pub.nx.includes(i) || !need.includes(n.res)) return; const d = dist(p, n); if (d < bd) { bd = d; target = { x: n.x, z: n.z, i }; } }); }
    }
    if (!target) target = { x: F.x + 1 + b.i * .3, z: F.z + 1 };
    const d = dist(p, target);
    if (d > 1.4) { const k = Math.min(3.2 * .1, d) / d; b.x += (target.x - b.x) * k; b.z += (target.z - b.z) * k; b.c.ws.send(JSON.stringify({ t: 'move', x: b.x, z: b.z, ry: 0, y: 0, s: 0 })); }
    else if (target.i != null) act(b, { a: 'collect', i: target.i });
  };
  const iv = setInterval(() => bots.forEach(b => { try { step(b); } catch (e) { console.error(e); } }), 100);
  const cpu0 = process.cpuUsage();
  const ended = await H.until(() => bots.every(b => b.end), 1500000);
  clearInterval(iv);
  const e = bots[0].end, real = (Date.now() - t0) / 1000;
  console.log(ended ? 'rodada terminou' : 'TEMPO ESGOTADO', JSON.stringify(e));
  console.log(`tempo real ${real.toFixed(0)} s para ${e ? e.sec : '?'} s de jogo; svs=${log.svs} svm=${log.svm}; tráfego recebido ${(log.bytes / 1024).toFixed(0)} KiB (${(log.bytes / 1024 / real / N).toFixed(1)} KiB/s por jogador)`);
  console.log('eventos', JSON.stringify(log.events), '| erros de ação', JSON.stringify(log.err));
  const st = JSON.parse((await H.request(srv.port, '/estatisticas.json')).body.toString('utf8'));
  console.log('estatísticas públicas:', JSON.stringify({ runs: st.runs, wins: st.wins, faints: st.faints, meals: st.meals, live: st.live }));
  console.log('todos viram o mesmo resultado:', bots.every(b => b.end && b.end.seed === e.seed && b.end.nights === e.nights && b.end.ok === e.ok));
  bots.forEach(b => b.c.ws.close()); await srv.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
