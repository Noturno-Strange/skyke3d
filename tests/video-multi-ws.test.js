'use strict';
// Vários vídeos ao mesmo tempo na sala: cada jogador pode iniciar o seu, e a sincronização só vai para quem assiste aquele vídeo.
const test = require('node:test');
const assert = require('node:assert');
const H = require('../harness.js');

const V1 = 'dQw4w9WgXcQ', V2 = 'aaaaaaaaaaa', V3 = 'bbbbbbbbbbb';
const send = (c, m) => c.ws.send(JSON.stringify(m));
const got = (c, f) => c.msgs.filter(f);

test('um jogador pode iniciar o seu vídeo enquanto outro já está com o dele', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const mk = async (ip) => { const c = await H.connect(srv.port, ip); t.after(() => c.ws.close()); return c; };
  const a = await mk('203.0.113.71'), b = await mk('203.0.113.72'), c = await mk('203.0.113.73');
  send(a, { t: 'create', style: 'proxima', bots: 0, name: 'Ana' });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')));
  const code = a.msgs.find(m => m.t === 'joined').code;
  for (const [cl, nm] of [[b, 'Beto'], [c, 'Caio']]) { send(cl, { t: 'join', code, name: nm }); assert.ok(await H.until(() => cl.msgs.some(m => m.t === 'joined'))); }
  const idA = a.msgs.find(m => m.t === 'joined').id;
  const idB = b.msgs.find(m => m.t === 'joined').id;

  send(a, { t: 'video', vid: V1 });
  assert.ok(await H.until(() => got(b, m => m.t === 'vinv' && m.by === idA).length === 1 && got(c, m => m.t === 'vinv' && m.by === idA).length === 1), 'convite do vídeo da Ana');
  send(c, { t: 'vjoin', by: idA }); // Caio assiste ao vídeo da Ana
  assert.ok(await H.until(() => got(c, m => m.t === 'vsync' && m.by === idA).length >= 1), 'Caio recebe o ponto atual');

  send(b, { t: 'video', vid: V2 }); // Beto inicia o dele
  assert.ok(await H.until(() => got(a, m => m.t === 'vinv' && m.by === idB).length === 1 && got(c, m => m.t === 'vinv' && m.by === idB).length === 1), 'convite do vídeo do Beto');
  assert.strictEqual(got(b, m => m.t === 'vbusy').length, 0, 'Beto não recebe "já existe um vídeo"');

  const cA = got(c, m => m.t === 'vsync' && m.by === idA).length;
  send(a, { t: 'vsync', time: 5, playing: true });
  assert.ok(await H.until(() => got(c, m => m.t === 'vsync' && m.by === idA).length > cA), 'Caio recebe a sincronia do vídeo da Ana');
  send(b, { t: 'vsync', time: 9, playing: true });
  await H.wait(400);
  assert.strictEqual(got(c, m => m.t === 'vsync' && m.by === idB).length, 0, 'Caio não recebe a sincronia do vídeo do Beto');
  assert.strictEqual(got(b, m => m.t === 'vsync' && m.by === idA).length, 0, 'Beto não recebe a sincronia do vídeo da Ana');

  send(c, { t: 'vleave', by: idA }); await H.wait(150);
  const n = got(c, m => m.t === 'vsync').length;
  send(a, { t: 'vsync', time: 8, playing: true }); await H.wait(400);
  assert.strictEqual(got(c, m => m.t === 'vsync').length, n, 'depois de sair, Caio não recebe mais');

  send(a, { t: 'vstop' });
  assert.ok(await H.until(() => got(b, m => m.t === 'vstop' && m.by === idA).length === 1), 'encerrar o vídeo da Ana avisa só o dela');
  assert.strictEqual(got(b, m => m.t === 'vstop' && m.by === idB).length, 0);
});

test('limite de vídeos simultâneos por sala e fim do vídeo quando o dono sai', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const cl = [];
  for (let i = 0; i < 5; i++) {
    const c = await H.connect(srv.port, '203.0.113.' + (80 + i)); t.after(() => c.ws.close()); cl.push(c);
    send(c, i === 0 ? { t: 'create', style: 'proxima', bots: 0, name: 'P' + i } : { t: 'join', code: cl[0].msgs.find(m => m.t === 'joined').code, name: 'P' + i });
    assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined')));
  }
  for (let i = 0; i < 4; i++) { send(cl[i], { t: 'video', vid: [V1, V2, V3, 'ccccccccccc'][i] }); await H.wait(120); }
  send(cl[4], { t: 'video', vid: 'ddddddddddd' });
  assert.ok(await H.until(() => got(cl[4], m => m.t === 'vbusy').length === 1), 'o quinto vídeo é recusado');
  const id0 = cl[0].msgs.find(m => m.t === 'joined').id;
  cl[0].ws.close();
  assert.ok(await H.until(() => got(cl[4], m => m.t === 'vstop' && m.by === id0).length === 1, 4000), 'sair encerra o vídeo do dono');
});

test('depois que o vídeo termina o dono tem um tempo para colocar outro; sem isso a sessão é encerrada para todos', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ VIDEO_IDLE_MS: '900' });
  t.after(() => srv.stop());
  const mk = async ip => { const c = await H.connect(srv.port, ip); t.after(() => c.ws.close()); return c; };
  const a = await mk('203.0.113.91'), b = await mk('203.0.113.92');
  send(a, { t: 'create', style: 'proxima', bots: 0, name: 'Ana' });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')));
  const code = a.msgs.find(m => m.t === 'joined').code, idA = a.msgs.find(m => m.t === 'joined').id;
  send(b, { t: 'join', code, name: 'Beto' });
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'joined')));
  send(a, { t: 'video', vid: V1 });
  assert.ok(await H.until(() => got(b, m => m.t === 'vinv' && m.by === idA).length === 1));
  send(b, { t: 'vjoin', by: idA });
  assert.ok(await H.until(() => got(b, m => m.t === 'vsync').length >= 1));

  send(a, { t: 'vend' }); // o vídeo acabou
  assert.ok(await H.until(() => got(b, m => m.t === 'vend' && m.by === idA).length === 1), 'o espectador é avisado de que terminou');
  assert.strictEqual(got(b, m => m.t === 'vstop').length, 0, 'a janela ainda não fecha');
  assert.ok(await H.until(() => got(b, m => m.t === 'vstop' && m.by === idA && m.why === 'idle').length === 1, 4000), 'sem novo vídeo, tudo é encerrado por inatividade');
  assert.ok(await H.until(() => got(a, m => m.t === 'vstop' && m.by === idA && m.why === 'idle').length === 1, 1000), 'o dono também recebe');
});

test('colocar um novo vídeo durante a espera cancela o encerramento e quem assiste acompanha', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ VIDEO_IDLE_MS: '900' });
  t.after(() => srv.stop());
  const mk = async ip => { const c = await H.connect(srv.port, ip); t.after(() => c.ws.close()); return c; };
  const a = await mk('203.0.113.93'), b = await mk('203.0.113.94');
  send(a, { t: 'create', style: 'proxima', bots: 0, name: 'Ana' });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')));
  const code = a.msgs.find(m => m.t === 'joined').code, idA = a.msgs.find(m => m.t === 'joined').id;
  send(b, { t: 'join', code, name: 'Beto' });
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'joined')));
  send(a, { t: 'video', vid: V1 });
  assert.ok(await H.until(() => got(b, m => m.t === 'vinv' && m.by === idA).length === 1));
  send(b, { t: 'vjoin', by: idA });
  send(a, { t: 'vend' });
  assert.ok(await H.until(() => got(b, m => m.t === 'vend').length === 1));
  send(a, { t: 'video', vid: V1 }); // o mesmo vídeo de novo também vale depois de terminar
  assert.ok(await H.until(() => got(b, m => m.t === 'vinv' && m.swap && m.by === idA).length === 1), 'quem assiste recebe a troca');
  await H.wait(1500);
  assert.strictEqual(got(b, m => m.t === 'vstop').length, 0, 'o encerramento foi cancelado');
  // quem entra depois que o vídeo terminou de novo recebe o aviso de término ao tentar assistir
  send(a, { t: 'vend' });
  assert.ok(await H.until(() => got(b, m => m.t === 'vend').length === 2));
  const c = await mk('203.0.113.95');
  send(c, { t: 'join', code, name: 'Caio' });
  assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined')));
  assert.strictEqual(got(c, m => m.t === 'vinv').length, 0, 'não convida para um vídeo que já terminou');
});

test('quem controla um vídeo e aceita o de outro jogador passa a só assistir: o vídeo dele é encerrado', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const mk = async ip => { const c = await H.connect(srv.port, ip); t.after(() => c.ws.close()); return c; };
  const a = await mk('203.0.113.101'), b = await mk('203.0.113.102'), c = await mk('203.0.113.103');
  send(a, { t: 'create', style: 'proxima', bots: 0, name: 'Ana' });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')));
  const code = a.msgs.find(m => m.t === 'joined').code, idA = a.msgs.find(m => m.t === 'joined').id;
  for (const [cl, nm] of [[b, 'Beto'], [c, 'Caio']]) { send(cl, { t: 'join', code, name: nm }); assert.ok(await H.until(() => cl.msgs.some(m => m.t === 'joined'))); }
  const idB = b.msgs.find(m => m.t === 'joined').id;
  send(a, { t: 'video', vid: V1 });
  assert.ok(await H.until(() => got(c, m => m.t === 'vinv' && m.by === idA).length === 1));
  send(c, { t: 'vjoin', by: idA }); // Caio assiste ao vídeo da Ana
  send(b, { t: 'video', vid: V2 });
  assert.ok(await H.until(() => got(a, m => m.t === 'vinv' && m.by === idB).length === 1), 'Ana recebe o convite do Beto');
  send(a, { t: 'vjoin', by: idB }); // Ana aceita o vídeo do Beto
  assert.ok(await H.until(() => got(c, m => m.t === 'vstop' && m.by === idA).length === 1), 'o vídeo da Ana termina para quem o assistia');
  assert.ok(await H.until(() => got(a, m => m.t === 'vsync' && m.by === idB).length >= 1), 'Ana acompanha o vídeo do Beto');
  const n = got(c, m => m.t === 'vsync').length;
  send(a, { t: 'vsync', time: 3, playing: true }); // a Ana já não controla nada
  await H.wait(400);
  assert.strictEqual(got(c, m => m.t === 'vsync').length, n, 'a sincronia da Ana não chega a ninguém');
  assert.strictEqual(got(b, m => m.t === 'vstop' && m.by === idB).length, 0, 'o vídeo do Beto continua');
});
