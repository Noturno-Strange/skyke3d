'use strict';
// Nomes: a reserva sobrevive ao reinício do servidor e só a mesma chave do código de recuperação retoma o nome.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const H = require('./harness.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const key = ch => ch.repeat(43);
const create = (name, k) => ({ t: 'create', style: 'amazora', bots: 0, name, ...(k ? { k } : {}) });

test('nomes: reserva sobrevive ao reinício e só a mesma chave retoma', { skip: H.missing() }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-names-'));
  const file = path.join(dir, 'names.json');
  let s1 = await H.startServer({ NAMES_FILE: file });
  t.after(() => (s1 ? s1.stop() : null));

  const a = await H.connect(s1.port, '203.0.113.10');
  t.after(() => a.ws.close());
  send(a, create('Ana', key('A')));
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')), 'cria a sala');
  send(a, { t: 'leave' });
  await H.wait(200);
  await s1.stop();
  s1 = null;

  const s2 = await H.startServer({ NAMES_FILE: file });
  t.after(async () => {
    await s2.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // a mesma chave, depois de reiniciar o servidor, retoma o nome
  const b = await H.connect(s2.port, '203.0.113.11');
  t.after(() => b.ws.close());
  send(b, create('ana', key('A')));
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'joined')), 'mesma chave retoma o nome');

  // outra chave, com o mesmo nome normalizado, é recusada
  const c = await H.connect(s2.port, '203.0.113.12');
  t.after(() => c.ws.close());
  send(c, create('ÂNA', key('B')));
  assert.ok(await H.until(() => c.msgs.some(m => m.t === 'err')), 'outra chave é recusada');
  const e = c.msgs.find(m => m.t === 'err');
  assert.ok(e && e.field === 'name' && /já está em uso/.test(e.msg));
  assert.ok(!c.msgs.some(m => m.t === 'joined'));

  // com o registro ligado, a entrada sem a chave do aparelho é recusada
  const d = await H.connect(s2.port, '203.0.113.13');
  t.after(() => d.ws.close());
  send(d, create('Outro'));
  assert.ok(await H.until(() => d.msgs.some(m => m.t === 'err')));
  assert.ok(/Atualize/.test(d.msgs.find(m => m.t === 'err').msg));
  assert.ok(!d.msgs.some(m => m.t === 'joined'));
});

test('nomes: mesma chave online tem mensagem própria; outra pessoa tem a de uso', { skip: H.missing() }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-names-'));
  const srv = await H.startServer({ NAMES_FILE: path.join(dir, 'names.json') });
  t.after(async () => {
    await srv.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const a = await H.connect(srv.port, '203.0.113.20');
  t.after(() => a.ws.close());
  send(a, create('Ana', key('A')));
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined')), 'cria a sala');

  // a mesma chave, online em outra janela, recebe a mensagem de nome online
  const b = await H.connect(srv.port, '203.0.113.21');
  t.after(() => b.ws.close());
  send(b, create('ana', key('A')));
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'err')), 'mesma chave online é recusada');
  const own = b.msgs.find(m => m.t === 'err');
  assert.strictEqual(own.field, 'name');
  assert.match(own.msg, /^Este nome está online em outra janela\.$/);
  assert.ok(own.sug && own.sug !== 'ana', 'sugere outro nome');
  assert.ok(!b.msgs.some(m => m.t === 'joined'));

  // outra chave recebe a mensagem de nome de outra pessoa
  const c = await H.connect(srv.port, '203.0.113.22');
  t.after(() => c.ws.close());
  send(c, create('ÂNA', key('B')));
  assert.ok(await H.until(() => c.msgs.some(m => m.t === 'err')), 'outra chave é recusada');
  const other = c.msgs.find(m => m.t === 'err');
  assert.strictEqual(other.field, 'name');
  assert.match(other.msg, /^Este nome já está em uso por outra pessoa\.$/);
  assert.ok(!c.msgs.some(m => m.t === 'joined'));

  // a sugestão da mesma chave continua valendo
  const d = await H.connect(srv.port, '203.0.113.23');
  t.after(() => d.ws.close());
  send(d, create(own.sug, key('A')));
  assert.ok(await H.until(() => d.msgs.some(m => m.t === 'joined')), 'a sugestão entra com a mesma chave');
});
