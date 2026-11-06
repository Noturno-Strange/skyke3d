'use strict';
// Karaokê: uma queda rápida de conexão não tira da fila quem só espera a vez (achado da bateria com 20 avatares por sala).
const test = require('node:test');
const assert = require('node:assert');
const H = require('./harness.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const lastQ = c => { const m = [...c.msgs].reverse().find(x => x.t === 'kar'); return m ? m.q.map(k => k.id) : []; };

test('karaokê: quem espera a vez e cai mantém o lugar e volta com ele; o cantor que cai sai; a vez pula quem está fora', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ RECONNECT_MS: '4000' });
  t.after(() => srv.stop());
  const cl = [];
  for (let i = 0; i < 4; i++) {
    const c = await H.connect(srv.port, '203.0.113.' + (60 + i));
    send(c, i === 0 ? { t: 'create', style: 'amazora', bots: 0, name: 'K' + i } : { t: 'join', code: cl[0].code, name: 'K' + i });
    await H.until(() => c.msgs.some(m => m.t === 'joined'), 4000);
    const j = c.msgs.find(m => m.t === 'joined');
    Object.assign(c, { id: j.id, token: j.token, code: j.code });
    cl.push(c);
  }
  t.after(() => cl.forEach(c => c.ws.close()));
  const [a, b, c, d] = cl;
  for (const x of cl) { send(x, { t: 'kjoin', vid: 'dQw4w9WgXcQ' }); await H.wait(120); }
  assert.ok(await H.until(() => lastQ(a).length === 4, 3000), 'fila com 4');
  assert.deepStrictEqual(lastQ(a), [a.id, b.id, c.id, d.id]);

  // c (esperando) cai: continua na fila
  c.ws.terminate();
  await H.wait(600);
  assert.deepStrictEqual(lastQ(a), [a.id, b.id, c.id, d.id], 'quem espera não perde o lugar numa queda');
  // e volta com o token: o lugar está lá
  const c2 = await H.connect(srv.port, '203.0.113.62');
  t.after(() => c2.ws.close());
  send(c2, { t: 'resume', code: c.code, token: c.token });
  assert.ok(await H.until(() => c2.msgs.some(m => m.t === 'joined'), 4000), 'voltou');
  assert.strictEqual(c2.msgs.find(m => m.t === 'joined').id, c.id, 'mesmo jogador');
  assert.ok(c2.msgs.find(m => m.t === 'joined').kar.some(k => k.id === c.id), 'ainda na fila ao voltar');

  // a (cantando) cai: sai da fila e a vez passa para b
  a.ws.terminate();
  assert.ok(await H.until(() => lastQ(b)[0] === b.id && !lastQ(b).includes(a.id), 3000), 'o cantor que cai sai e a vez passa: ' + lastQ(b));

  // d cai e a vez chega nele: é pulado (vai para o fim, sem sair) e canta quem está conectado
  d.ws.terminate();
  await H.wait(300);
  send(b, { t: 'kpass' });
  assert.ok(await H.until(() => lastQ(b)[0] === c.id, 3000), 'a vez foi para c (conectado): ' + lastQ(b));
  send(c2, { t: 'kpass' });
  assert.ok(await H.until(() => lastQ(b)[0] === b.id && lastQ(b).includes(d.id), 3000), 'd, fora, foi pulado sem sair: ' + lastQ(b));

  // d não volta a tempo: sai de vez
  assert.ok(await H.until(() => !lastQ(b).includes(d.id), 7000), 'quem não volta sai da fila no fim da espera');
});
