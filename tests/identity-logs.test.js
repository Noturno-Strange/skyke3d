'use strict';
// Nenhuma credencial (chave do aparelho, chaves públicas, nonce, assinatura, token) pode
// aparecer na saída do servidor, nem em fluxos de sucesso nem em erros e mensagens malformadas.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const H = require('./harness.js');
const { payload } = require('../lib/identity.js');
const { fidOf } = require('../lib/ids.js');

const send = (c, m) => c.ws.send(JSON.stringify(m));
const sign = (priv, data) =>
  crypto.sign('sha256', Buffer.from(data, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');
function kp() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { pk: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), priv: privateKey };
}
async function next(c, pred) {
  assert.ok(await H.until(() => c.msgs.some(pred), 3000), 'mensagem esperada: ' + String(pred));
  return c.msgs.find(pred);
}

test('identidade: segredos nunca aparecem no log do servidor', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  let stopped = false;
  const stop = async () => {
    if (!stopped) {
      stopped = true;
      await srv.stop();
    }
  };
  t.after(stop);
  const c = await H.connect(srv.port, '203.0.113.90');
  t.after(() => c.ws.close());
  const K = 'Q'.repeat(43),
    id = fidOf(K),
    main = kp(),
    rec = kp(),
    secrets = [K, main.pk, rec.pk];

  send(c, { t: 'idreg', k: K, pk: main.pk, rpk: rec.pk });
  await next(c, m => m.t === 'idok');

  send(c, { t: 'auth', id, action: 'join' });
  const ch = await next(c, m => m.t === 'challenge');
  const sig = sign(main.priv, payload.auth(id, ch.nonce, 'join'));
  send(c, { t: 'proof', id, nonce: ch.nonce, sig, action: 'join' });
  const s = await next(c, m => m.t === 'session');
  secrets.push(ch.nonce, sig, s.token);

  // caminhos de erro: assinatura errada, nonce repetido, token inventado, escopo errado
  const badSig = sign(main.priv, 'outra coisa');
  send(c, { t: 'proof', id, nonce: ch.nonce, sig: badSig, action: 'join' });
  const fakeTok = 'Z'.repeat(43);
  send(c, { t: 'idrot', token: fakeTok, gen: 1, pk: kp().pk, sigOld: badSig, sigRec: badSig });
  send(c, { t: 'idrev', token: fakeTok, epoch: 0, sigOld: badSig });
  send(c, { t: 'idrec', token: s.token, gen: 1, pk: kp().pk, sigRec: badSig });
  secrets.push(badSig, fakeTok);

  // mensagem malformada com campos sensíveis
  c.ws.send('{"t":"idrot","token":' + JSON.stringify(s.token) + ',"pk":{"x":1}');
  send(c, { t: 'idrot', token: s.token, gen: 'x', pk: 123, sigOld: [], sigRec: {} });

  // dá tempo de o servidor processar tudo e registrar o que for registrar
  await H.wait(400);
  await stop();
  const log = srv.log();
  for (const v of secrets) assert.ok(!log.includes(v), 'segredo vazou no log: ' + v.slice(0, 6) + '…');
});
