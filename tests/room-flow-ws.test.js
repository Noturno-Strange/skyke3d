'use strict';
// Fluxos da sala pelo WebSocket que não tinham teste próprio: cfg acima do limite (só o último vale), chat repetido,
// gesto com som limitado, fila do karaokê (passar a vez e sair) e sair da sala.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./harness.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const got = (c, f) => c.msgs.filter(f);

async function room(srv, t, n) {
  const cl = [];
  for (let i = 0; i < n; i++) {
    const c = await H.connect(srv.port, '203.0.113.' + (140 + i));
    t.after(() => c.ws.close());
    cl.push(c);
    send(
      c,
      i === 0
        ? { t: 'create', style: 'amazora', bots: 0, name: 'F' + i }
        : { t: 'join', code: cl[0].msgs.find(m => m.t === 'joined').code, name: 'F' + i }
    );
    assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined')));
  }
  return cl.map(c => ({ c, id: c.msgs.find(m => m.t === 'joined').id }));
}

test('cfg em rajada: quem está na sala recebe o último visual e a conexão continua aberta', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  for (let i = 0; i < 10; i++) send(a.c, { t: 'cfg', cfg: { shirt: i } });
  const last = () => got(b.c, m => m.t === 'cfg' && m.id === a.id).pop();
  assert.ok(await H.until(() => last() && last().cfg.shirt === 9), 'o último cfg chega depois do limite');
  assert.ok(got(b.c, m => m.t === 'cfg' && m.id === a.id).length < 10, 'os intermediários são descartados');
  send(a.c, { t: 'tsync', c: Date.now() });
  assert.ok(await H.until(() => got(a.c, m => m.t === 'tsync').length === 1), 'a conexão segue aberta');
});

test('chat: a mesma mensagem em menos de 5 s não se repete', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  send(a.c, { t: 'chat', text: 'oi pessoal' });
  assert.ok(await H.until(() => got(b.c, m => m.t === 'chat' && m.id === a.id).length === 1));
  await H.wait(800);
  send(a.c, { t: 'chat', text: 'oi pessoal' });
  send(a.c, { t: 'emo', i: 0 });
  assert.ok(await H.until(() => got(b.c, m => m.t === 'emo').length === 1));
  assert.strictEqual(got(b.c, m => m.t === 'chat' && m.id === a.id).length, 1);
});

test('gesto com som: o segundo em menos de 5 s é recusado com aviso', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  send(a.c, { t: 'gest', g: 'scream' });
  assert.ok(await H.until(() => got(b.c, m => m.t === 'gest').length === 1));
  await H.wait(1600);
  send(a.c, { t: 'gest', g: 'scream' });
  assert.ok(await H.until(() => got(a.c, m => m.t === 'sys' && /Gestos com som/.test(m.text)).length === 1));
  assert.strictEqual(got(b.c, m => m.t === 'gest').length, 1);
});

test('karaokê: fila, passar a vez e sair da fila', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  const queue = c => (got(c, m => m.t === 'kar').pop() || { q: [] }).q.map(x => x.id);
  send(a.c, { t: 'kjoin', vid: 'aaaaaaaaaaa' });
  assert.ok(await H.until(() => queue(b.c).join() === a.id));
  assert.ok(await H.until(() => got(b.c, m => m.t === 'kinv' && m.by === a.id).length === 1), 'quem está fora da fila é convidado');
  send(b.c, { t: 'kjoin', vid: 'bbbbbbbbbbb' });
  assert.ok(await H.until(() => queue(a.c).join() === [a.id, b.id].join()));
  const turn = got(a.c, m => m.t === 'kar').pop().turn;
  send(b.c, { t: 'kpass' });
  await H.wait(300);
  assert.strictEqual(queue(a.c).join(), [a.id, b.id].join(), 'só quem canta passa a vez');
  send(a.c, { t: 'kpass' });
  assert.ok(await H.until(() => queue(b.c).join() === [b.id, a.id].join()));
  assert.ok(got(b.c, m => m.t === 'kar').pop().turn > turn, 'nova vez');
  send(b.c, { t: 'kleave' });
  assert.ok(await H.until(() => queue(a.c).join() === a.id));
});

test('sair: a conexão fecha com 4000 e os outros veem a saída', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  const closed = new Promise(r => b.c.ws.once('close', code => r(code)));
  send(b.c, { t: 'leave' });
  assert.strictEqual(await closed, 4000);
  assert.ok(await H.until(() => got(a.c, m => m.t === 'pl' && m.id === b.id).length === 1));
});
