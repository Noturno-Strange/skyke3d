'use strict';
// O servidor aplica o filtro de palavrões antes de transmitir o chat (e antes dos bots lerem a frase).
const test = require('node:test');
const assert = require('node:assert');
const H = require('../harness.js');

test('chat: palavrão chega aos outros jogadores como !@#$% e o resto da frase fica igual', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const a = await H.connect(srv.port, '203.0.113.61');
  a.ws.send(JSON.stringify({ t: 'create', style: 'proxima', bots: 0, name: 'Ana' }));
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')));
  const code = a.msgs.find(m => m.t === 'joined').code;
  const b = await H.connect(srv.port, '203.0.113.62');
  b.ws.send(JSON.stringify({ t: 'join', code, name: 'Beto' }));
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'joined')));
  a.ws.send(JSON.stringify({ t: 'chat', text: 'que porra de jogo, mas o computador é legal' }));
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'chat')), 'Beto recebeu o chat');
  const msg = b.msgs.find(m => m.t === 'chat');
  assert.ok(!/porra/i.test(msg.text), msg.text);
  assert.ok(/^que [!@#$%&*]{3,7} de jogo, mas o computador é legal$/.test(msg.text), msg.text);
  const own = a.msgs.find(m => m.t === 'chat');
  assert.ok(own && !/porra/i.test(own.text), 'quem escreveu também vê a versão censurada');
  a.ws.close(); b.ws.close();
});
