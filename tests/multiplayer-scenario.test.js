'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const H = require('./harness');
const G = require('./game-clients');
const C = require('../assets/catalog');

test('oito jogadores em duas salas colhem, cozinham, presenteiam e curam; ações aleatórias continuam isoladas', { skip: H.missing() }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-coop-'));
  const ids = [...'ABCDEFGH'].map(G.identity), farm = {}, health = {}, at = Date.now();
  for (const [i, id] of ids.entries()) {
    farm[id.pid] = { x: 1, s: Object.fromEntries(['tomate', 'salsa', 'batata'].map((c, j) => [C.farmOpen(0)[j], { c, a: at - 3600000, e: at - 1000, w: 1 }])) };
    if (i % 2) health[id.pid] = { ill: 'fadiga' };
  }
  const write = (n, data) => { const file = path.join(dir, n + '.json'); fs.writeFileSync(file, JSON.stringify(data)); return file; };
  const token = 'cooperative-test-token-32-bytes-long';
  const srv = await H.startServer({ FARM_FILE: write('farm', { v: 2, p: farm }), HEALTH_FILE: write('health', { v: 1, p: health }), STATUS_TOKEN: token });
  const players = [], latency = []; let requests = 0, events = 0;
  t.after(async () => { players.forEach(p => p.c.ws.close()); await srv.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  for (let i = 0; i < ids.length; i++) players.push(await G.enter(srv, ids[i], 'Pessoa' + i, i % 4 ? players[i - i % 4].joined.code : '', '203.0.113.' + (30 + i)));
  const request = async (p, m, type) => { const start = performance.now(), r = await G.action(p, m, type); latency.push(performance.now() - start); requests++; return r; };
  for (const p of players) { G.send(p.c, { t: 'friends', ids: ids.filter(id => id.id !== p.ident.id).map(id => id.id) }); G.send(p.c, { t: 'move', x: 1, z: 2, ry: 0, y: 0, s: 0 }); }
  await Promise.all(players.map(p => G.next(p.c, m => m.t === 'fme')));
  const harvests = await Promise.all(players.map(p => request(p, { t: 'farmdo', k: 'harvest', i: -1 }, 'farmr')));
  harvests.forEach(r => { assert.equal(r.ok, true); assert.ok(r.state.pantry.tomate >= 2 && r.state.pantry.salsa >= 2 && r.state.pantry.batata >= 3); });
  await H.wait(200);
  const planted = await Promise.all(players.map(p => request(p, { t: 'farmdo', k: 'plant', i: -1, c: 'tomate' }, 'farmr')));planted.forEach(r => assert.equal(r.ok, true));
  await H.wait(200);
  (await Promise.all(players.map(p => request(p, { t: 'farmdo', k: 'water', i: -1 }, 'farmr')))).forEach(r => assert.equal(r.ok, true));
  for (const ingredient of ['manteiga', 'sal']) { (await Promise.all(players.map(p => request(p, { t: 'supply', i: ingredient }, 'supplyr')))).forEach(r => assert.equal(r.ok, true)); await H.wait(350); }
  const recipe = C.RECIPE.batata_assada;
  (await Promise.all(players.map(p => request(p, { t: 'cookdo', m: recipe.m, g: recipe.g }, 'cookr')))).forEach(r => assert.equal(r.ok, true));
  (await Promise.all(players.map(p => request(p, { t: 'medcraft', i: 'tonico_solar' }, 'medr')))).forEach(r => assert.equal(r.ok, true));
  (await Promise.all(players.map((p, i) => request(p, { t: 'giftsend', to: ids[i ^ 1].pid, k: 'c', i: 'tomate' }, 'giftr')))).forEach(r => assert.equal(r.ok, true));
  await Promise.all(players.map(p => G.next(p.c, m => m.t === 'giftin')));
  for (let i = 0; i < players.length; i += 2) { const r = await request(players[i], { t: 'medheal', i: 'tonico_solar', to: players[i + 1].joined.id }, 'medr'); assert.equal(r.ok, true); assert.equal((await G.next(players[i + 1].c, m => m.t === 'health')).tired, false); }
  for (const p of players) { G.send(p.c, { t: 'giftget' }); assert.equal((await G.next(p.c, m => m.t === 'gifts')).total, 1); }
  // Semente fixa: decisões reproduzíveis; a chegada e o processamento continuam concorrentes.
  let seed = 0x51a7;const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const last = players.map(() => ({ chat: 0, emo: 0, cfg: 0, farm: 0 }));
  for (let round = 0; round < 50; round++) {
    const pending = [];
    for (const [i, p] of players.entries()) {
      const now = Date.now(), burst = 1 + Math.floor(random() * 3);
      for (let j = 0; j < burst; j++) { G.send(p.c, { t: 'move', x: random() * 6 - 3, z: random() * 4 - 2, ry: random() * 6, y: 0, s: 0 }); events++; }
      if (random() < .14 && now - last[i].chat > 1600) { G.send(p.c, { t: 'chat', text: 'Sala ' + Math.floor(i / 4) + ' rodada ' + round }); last[i].chat = now; events++; }
      if (random() < .18 && now - last[i].emo > 600) { G.send(p.c, { t: 'emo', i: Math.floor(random() * 6) }); last[i].emo = now; events++; }
      if (random() < .14 && now - last[i].cfg > 900) { G.send(p.c, { t: 'cfg', cfg: { skin: Math.floor(random() * 5) } }); last[i].cfg = now; events++; }
      if (random() < .1 && now - last[i].farm > 1000) { pending.push(request(p, { t: 'farmdo', k: 'harvest', i: -1 }, 'farmr').then(r => assert.ok(r.ok || r.reason === 'pronta' || r.reason === 'crescendo' || r.reason === 'vazio'))); last[i].farm = now; }
    }
    await Promise.all(pending);await H.wait(120);
  }
  for (const [i, p] of players.entries()) {
    assert.equal(p.c.ws.readyState, 1, 'jogador normal permanece conectado');
    assert.ok(!p.c.msgs.some(m => m.t === 'chat' && m.text.startsWith('Sala ' + (1 - Math.floor(i / 4)))), 'chat não atravessa salas');
    G.send(p.c, { t: 'healthget' });assert.equal((await G.next(p.c, m => m.t === 'health')).tired, false);
  }
  latency.sort((a, b) => a - b);assert.ok(!/erro fatal|unhandled|TypeError/.test(srv.log()));
  const stats = await H.request(srv.port, '/status.json', { headers: { authorization: 'Bearer ' + token } });
  assert.equal(stats.status, 200);assert.equal(stats.json.abuse.fraude.resting, 0, 'cooperação e cliques em lote não dão descanso');
  t.diagnostic(JSON.stringify({ players: 8, rooms: 2, seed: '0x51a7', rounds: 50, requests, events, p95ms: Math.round(latency[Math.floor(latency.length * .95)]) }));
});
