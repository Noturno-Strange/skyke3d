'use strict';
// Clientes autenticados para cenários de jogo; todo estado fica em uma pasta temporária.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const H = require('./harness');
const { payload } = require('../lib/identity');
const { fidOf } = require('../lib/ids');
const { pidOf } = require('../lib/pubprofile');
const send = (c, m) => c.ws.send(JSON.stringify(m));
async function next(c, pred, timeout = 6000) {
  assert.ok(await H.until(() => c.msgs.some(pred), timeout), 'resposta: ' + pred);
  return c.msgs.splice(c.msgs.findIndex(pred), 1)[0];
}
function identity(ch) {
  const pair = () => {
    const p = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    return { pub: p.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), priv: p.privateKey };
  };
  const k = ch.repeat(43), id = fidOf(k);
  return { k, id, pid: pidOf(id), main: pair(), rec: pair() };
}
async function enter(srv, ident, name, code, ip = '203.0.113.20', token = '') {
  const c = await H.connect(srv.port, ip);
  try {
    if (!token) {
      send(c, { t: 'idreg', k: ident.k, pk: ident.main.pub, rpk: ident.rec.pub });
      await next(c, m => m.t === 'idok');
      send(c, { t: 'auth', id: ident.id, action: 'join' });
      const ch = await next(c, m => m.t === 'challenge');
      const sig = crypto.sign('sha256', Buffer.from(payload.auth(ident.id, ch.nonce, 'join')), { key: ident.main.priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');
      send(c, { t: 'proof', id: ident.id, nonce: ch.nonce, action: 'join', sig });
      token = (await next(c, m => m.t === 'session')).token;
    }
    send(c, code ? { t: 'join', code, name, token } : { t: 'create', style: 'amazora', bots: 0, name, token });
    const joined = await next(c, m => m.t === 'joined');
    send(c, { t: 'ready' });
    return { c, ident, name, token, joined };
  } catch (e) { c.ws.close(); throw e; }
}
async function action(p, message, response) {
  const rid = (message.t.startsWith('med') ? 'med' : '') + crypto.randomBytes(9).toString('hex');
  send(p.c, { ...message, rid });
  return next(p.c, m => m.t === response && m.rid === rid);
}
function lastX(c, id) {
  let x = null;
  for (const m of c.msgs) if (m.t === 'st' && m.bin[0] === 1)
    for (let o = 1; o + 12 <= m.bin.length; o += 12)
      if ('p' + (m.bin.readUInt32LE(o) & 0x7fffffff) === id) x = m.bin.readInt16LE(o + 4) / 100;
  return x;
}
module.exports = { send, next, identity, enter, action, lastX };
