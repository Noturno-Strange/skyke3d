'use strict';
// Voz pelo WebSocket sob carga, com o servidor de verdade e várias conexões locais (127.0.0.1): várias salas falando ao mesmo tempo,
// quadros malformados, cliente que não lê, queda inesperada e o chat e o movimento seguindo durante tudo isso.
// Rede local: não reproduz perda, latência nem banda de conexões reais.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./harness.js');

const TOKEN = 'token-de-teste-1234567890';
const send = (c, m) => c.ws.send(JSON.stringify(m));
const frame = (seq, n = 120) => {
  const b = Buffer.alloc(3 + n, 0xf8);
  b[0] = 2;
  b[1] = 1;
  b[2] = seq & 255;
  return b;
};
const voiceOf = (c, fromId) =>
  c.msgs.filter(m => m.t === 'st' && m.bin[0] === 2 && (!fromId || 'p' + m.bin.readUInt32LE(1) === fromId));
// posição x de `id` no estado binário mais recente que a trouxe (tipo 1, 12 bytes por jogador)
const lastX = (c, id) => {
  let x = null;
  for (const m of c.msgs) {
    if (m.t !== 'st' || m.bin[0] !== 1) continue;
    for (let o = 1; o + 12 <= m.bin.length; o += 12)
      if ('p' + (m.bin.readUInt32LE(o) & 0x7fffffff) === id) x = m.bin.readInt16LE(o + 4) / 100;
  }
  return x;
};
const status = async srv =>
  (await H.request(srv.port, '/status.json', { headers: { authorization: 'Bearer ' + TOKEN, 'x-forwarded-for': '192.0.2.50' } }))
    .json;

let ipN = 10;
async function room(srv, t, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = await H.connect(srv.port, '198.51.100.' + ipN++);
    t.after(() => c.ws.terminate());
    // nomes únicos no servidor todo (o mesmo nome em outra sala é recusado)
    const name = ['Ana', 'Beto', 'Caio', 'Duda', 'Eva', 'Gil', 'Iris', 'Juca'][ipN % 8] + ipN;
    if (i === 0) send(c, { t: 'create', style: 'amazora', bots: 0, name });
    else send(c, { t: 'join', code: out[0].j.code, name });
    assert.ok(await H.until(() => c.msgs.some(m => m.t === 'joined')), 'join #' + i + ': ' + JSON.stringify(c.msgs.slice(-5)));
    out.push({ c, j: c.msgs.find(m => m.t === 'joined') });
  }
  for (const p of out) send(p.c, { t: 'vlisten', v: true });
  for (const p of out) send(p.c, { t: 'speak', v: true });
  await H.wait(200);
  return out;
}
// cada um manda um quadro a cada 20 ms (a voz normal do jogo) por `ms`
async function talk(people, ms) {
  let seq = 0;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    seq++;
    for (const p of people) if (p.c.ws.readyState === 1) p.c.ws.send(frame(seq));
    await H.wait(20);
  }
  return seq;
}

test('voz sob carga: duas salas, todos falando ao mesmo tempo, sem perda nem mistura', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const s1 = await room(srv, t, 3),
    s2 = await room(srv, t, 3);
  const sent = await talk([...s1, ...s2], 2000);
  await H.wait(300);
  for (const sala of [s1, s2])
    for (const ouvinte of sala)
      for (const fala of sala) {
        if (fala === ouvinte) continue;
        const n = voiceOf(ouvinte.c, fala.j.id).length;
        assert.strictEqual(n, sent, ouvinte.j.id + ' ouviu ' + n + ' de ' + sent + ' quadros de ' + fala.j.id);
      }
  // ninguém ouve a outra sala
  const ids2 = new Set(s2.map(p => p.j.id));
  for (const p of s1) assert.ok(voiceOf(p.c).every(m => !ids2.has('p' + m.bin.readUInt32LE(1))));
  for (const p of [...s1, ...s2]) assert.strictEqual(p.c.ws.readyState, 1);
  await H.wait(1100);
  const v = (await status(srv)).perf.voice;
  assert.strictEqual(v.talking, 6);
  assert.strictEqual(v.limited, 0, 'a voz normal nunca bate no limite por jogador');
  assert.strictEqual(v.malformed, 0);
  assert.strictEqual(v.dropped, 0);
  assert.strictEqual(v.framesIn, sent * 6);
  assert.strictEqual(v.framesOut, sent * 6 * 2);
});

test('voz sob carga: malha completa de 2, 10, 20 e 40 participantes', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN, MAX_PER_ROOM: 40 });
  t.after(() => srv.stop());
  let framesIn = 0, framesOut = 0;
  for (const size of [2, 10, 20, 40]) {
    const people = await room(srv, t, size);
    for (let i = 0; i < people.length; i++) people[i].c.ws.send(frame(i + 1, 80));
    for (const ouvinte of people) {
      assert.ok(await H.until(() => voiceOf(ouvinte.c).length === size - 1, 5000), ouvinte.j.id + ' recebeu ' + voiceOf(ouvinte.c).length + ' de ' + (size - 1));
      assert.strictEqual(voiceOf(ouvinte.c).length, size - 1);
    }
    framesIn += size;
    framesOut += size * (size - 1);
  }
  const v = (await status(srv)).perf.voice;
  assert.strictEqual(v.framesIn, framesIn);
  assert.strictEqual(v.framesOut, framesOut);
  assert.strictEqual(v.limited, 0);
  assert.strictEqual(v.dropped, 0);
});

test('voz sob carga: quadros malformados contam como violação e derrubam só quem mandou', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const [a, b, c] = await room(srv, t, 3);
  // 2 malformados: continua conectado (pode ser um erro isolado)
  a.c.ws.send(Buffer.alloc(700, 2));
  a.c.ws.send(Buffer.from([2, 77, 1, 1]));
  await H.wait(200);
  assert.strictEqual(a.c.ws.readyState, 1);
  // pacotes muito acima do tamanho (até o maxPayload): a 8ª violação em 10 s derruba
  for (let i = 0; i < 8; i++) a.c.ws.send(Buffer.alloc(30000, 2));
  assert.strictEqual(await Promise.race([a.c.closed, H.wait(3000).then(() => 'aberta')]), 1008);
  // os outros seguem falando e conversando
  b.c.ws.send(frame(1));
  assert.ok(await H.until(() => voiceOf(c.c, b.j.id).length === 1));
  send(c.c, { t: 'chat', text: 'ainda aqui' });
  assert.ok(await H.until(() => b.c.msgs.some(m => m.t === 'chat' && m.text === 'ainda aqui')));
  await H.wait(1100);
  const v = (await status(srv)).perf.voice;
  assert.ok(v.malformed >= 8, JSON.stringify(v));
});

test('voz sob carga: quem manda áudio sem parar e acima do limite só perde o excesso; o chat segue', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2);
  // 100 quadros por segundo de 400 bytes por 2 s: o dobro dos quadros e mais de 3× os bytes permitidos, mas abaixo da enxurrada
  const end = Date.now() + 2000;
  let i = 0;
  while (Date.now() < end) {
    for (let k = 0; k < 4; k++) a.c.ws.send(frame(i++, 400));
    await H.wait(40);
  }
  await H.wait(300);
  const n = voiceOf(b.c, a.j.id).length;
  assert.ok(n > 0 && n <= 3 * Math.ceil(12000 / 403), 'repassou ' + n + ' de ' + i);
  assert.strictEqual(a.c.ws.readyState, 1, 'excesso de voz é descartado, não derruba');
  send(a.c, { t: 'chat', text: 'falando muito' });
  assert.ok(await H.until(() => b.c.msgs.some(m => m.t === 'chat' && m.text === 'falando muito')));
  await H.wait(1100);
  const v = (await status(srv)).perf.voice;
  assert.ok(v.limited > 0 && v.limited + v.framesIn === i, JSON.stringify(v));
});

test('voz sob carga: um cliente que para de ler não atrasa a voz, o chat nem o movimento dos outros', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const [a, b, c, lento] = await room(srv, t, 4);
  lento.c.ws._socket.pause(); // não lê mais nada (a fila no servidor e no kernel cresce)
  const end = Date.now() + 2000;
  let seq = 0,
    x = 0;
  while (Date.now() < end) {
    seq++;
    a.c.ws.send(frame(seq));
    b.c.ws.send(frame(seq));
    send(a.c, { t: 'move', x: (x = (seq % 50) / 10), z: 1, ry: 0, y: 0, s: 0 });
    await H.wait(40);
  }
  send(b.c, { t: 'chat', text: 'oi lento' });
  assert.ok(await H.until(() => c.c.msgs.some(m => m.t === 'chat' && m.text === 'oi lento')), 'chat chega');
  await H.wait(300);
  assert.strictEqual(voiceOf(c.c, a.j.id).length, seq);
  assert.strictEqual(voiceOf(c.c, b.j.id).length, seq);
  assert.strictEqual(lastX(c.c, a.j.id), x, 'movimento chega');
  assert.strictEqual(srv.log().includes('erro'), false);
  // voltou a ler: continua conectado e recebe o que estava na fila
  lento.c.ws._socket.resume();
  assert.ok(await H.until(() => voiceOf(lento.c).length > 0));
  assert.strictEqual(lento.c.ws.readyState, 1);
});

test('voz sob carga: queda inesperada de quem fala não afeta os outros e libera a pessoa', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN });
  t.after(() => srv.stop());
  const [a, b, c] = await room(srv, t, 3);
  const meio = talk([a, b], 600);
  await H.wait(300);
  a.c.ws._socket.destroy(); // sem fechamento do WebSocket, como um cabo que caiu
  await meio;
  assert.ok(await H.until(() => c.c.msgs.some(m => m.t === 'speak' && m.id === a.j.id && m.v === false)), 'deixa de falar');
  const antes = voiceOf(c.c, b.j.id).length;
  await talk([b], 400);
  assert.ok(await H.until(() => voiceOf(c.c, b.j.id).length >= antes + 9), 'B continua sendo ouvido');
  // quem continua falando depois da queda não manda voz para quem caiu (nem quebra o servidor)
  send(b.c, { t: 'chat', text: 'e o Ana?' });
  assert.ok(await H.until(() => c.c.msgs.some(m => m.t === 'chat' && m.text === 'e o Ana?')));
  await H.wait(1100);
  const v = (await status(srv)).perf.voice;
  assert.strictEqual(v.talking, 2, JSON.stringify(v)); // B e C (A caiu)
  assert.strictEqual(v.listening, 2);
  assert.strictEqual(v.congested, 0);
});

test('voz: troca rápida de falando/calado acima do limite não perde o último estado', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const [a, b] = await room(srv, t, 2); // os dois já estão falando
  // calado → falando em menos de 100 ms (aperte para falar tocado duas vezes): antes, o segundo aviso era descartado
  const sp = () => b.c.msgs.filter(m => m.t === 'speak' && m.id === a.j.id);
  const n0 = sp().length;
  send(a.c, { t: 'speak', v: false });
  send(a.c, { t: 'speak', v: true });
  assert.ok(await H.until(() => sp().length === n0 + 2 && sp().at(-1).v === true), 'chega o último estado');
  a.c.ws.send(frame(9));
  assert.ok(await H.until(() => voiceOf(b.c, a.j.id).length === 1), 'a voz volta a passar');
  // e o contrário: falando → calado logo em seguida termina calado
  send(a.c, { t: 'speak', v: false });
  await H.wait(30);
  send(a.c, { t: 'speak', v: true });
  send(a.c, { t: 'speak', v: false });
  await H.wait(400);
  assert.strictEqual(sp().at(-1).v, false);
  a.c.ws.send(frame(10));
  await H.wait(200);
  assert.strictEqual(voiceOf(b.c, a.j.id).length, 1, 'calado não transmite');
});
