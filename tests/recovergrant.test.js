'use strict';
// Recuperação assistida: a autorização de uso único do administrador (`recoverGrant`) e o uso dela pelo jogador
// (`recoverRedeem`), que troca a chave de recuperação sem assinatura — a autorização é a prova.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createIdentityRegistry, payload, REC_GRANT_TTL } = require('../lib/identity.js');
const { newId } = require('../lib/ids.js');

const TOKEN_RE = /^r[0-9a-f]{20}$/;

function kp() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { pk: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), priv: privateKey };
}
const sign = (priv, data) =>
  crypto.sign('sha256', Buffer.from(data, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');

function setup(t, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-recgrant-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'identity.json');
  const clock = { t: 1_800_000_000_000 };
  const r = createIdentityRegistry({ file, now: () => clock.t, ...opts });
  const id = newId(),
    main = kp(),
    rec = kp();
  assert.strictEqual(r.register({ id, pk: main.pk, rpk: rec.pk }).ok, true);
  return { file, dir, r, id, main, rec, clock };
}

test('autorização: formato, prazo de 24 h e consulta pelo painel', t => {
  const { r, id, clock } = setup(t);
  assert.strictEqual(REC_GRANT_TTL, 24 * 3600000, 'prazo fixo de 24 h');
  assert.strictEqual(r.recoverGrantInfo(id), null, 'nada emitido ainda');
  const g = r.recoverGrant(id);
  assert.strictEqual(g.ok, true);
  assert.match(g.token, TOKEN_RE);
  assert.strictEqual(g.exp, clock.t + REC_GRANT_TTL, 'vale 24 h');
  assert.deepStrictEqual(r.recoverGrantInfo(id), { active: true, exp: g.exp, used: false });
});

test('autorização: conta que não existe e registro corrompido', t => {
  const { r, dir, id } = setup(t);
  assert.strictEqual(r.recoverGrant(newId()).reason, 'notfound');
  // arquivo inválido: as operações falham fechadas
  const bad = path.join(dir, 'quebrado.json');
  fs.writeFileSync(bad, '{"v":1,"ids":{"x":lixo}}');
  const broken = createIdentityRegistry({ file: bad });
  assert.strictEqual(broken.recoverGrant(id).reason, 'corrupt');
});

test('autorização: nova emissão substitui a anterior e o token antigo morre', t => {
  const { r, id } = setup(t);
  const a = r.recoverGrant(id),
    b = r.recoverGrant(id);
  assert.notStrictEqual(a.token, b.token);
  const out = r.recoverRedeem({ token: a.token, rpk: kp().pk });
  assert.strictEqual(out.ok, false, 'o token antigo não é reconhecido');
  assert.strictEqual(out.reason, 'invalid');
  assert.strictEqual(r.recoverRedeem({ token: b.token, rpk: kp().pk }).ok, true, 'o token novo vale');
});

test('uso: troca a chave de recuperação sem assinatura, sobe geração e época e é idempotente na repetição', t => {
  const { r, id, clock, file } = setup(t);
  const g = r.recoverGrant(id),
    before = r.get(id);
  const nr = kp();
  const out = r.recoverRedeem({ token: g.token, rpk: nr.pk });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.id, id);
  assert.strictEqual(out.gen, before.gen, 'a principal não muda');
  assert.strictEqual(out.rgen, before.rgen + 1);
  assert.strictEqual(out.epoch, before.epoch + 1, 'as sessões antigas morrem');
  assert.strictEqual(r.get(id).rpk, nr.pk);
  assert.strictEqual(r.get(id).rgen, out.rgen);
  // repetição com a mesma chave (resposta perdida): mesma resposta
  clock.t += 1000;
  const again = r.recoverRedeem({ token: g.token, rpk: nr.pk });
  assert.strictEqual(again.ok, true);
  assert.strictEqual(again.idempotent, true);
  assert.strictEqual(again.rgen, out.rgen, 'não sobe de novo');
  // chave diferente com o mesmo token: recusada
  const other = r.recoverRedeem({ token: g.token, rpk: kp().pk });
  assert.strictEqual(other.ok, false);
  assert.strictEqual(other.reason, 'used');
  assert.strictEqual(r.get(id).rpk, nr.pk, 'nada mudou na recusa');
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(!JSON.stringify(j).includes(nr.priv), 'o registro nunca guarda chave privada');
  assert.ok(!JSON.stringify(j).includes(g.token), 'o arquivo guarda só o hash da autorização, nunca o token');
});

test('uso: recusas honestas — formato, token desconhecido e prazo vencido', t => {
  const { r, id, clock } = setup(t);
  assert.strictEqual(r.recoverRedeem({ token: 'x', rpk: kp().pk }).reason, 'invalid', 'formato');
  assert.strictEqual(r.recoverRedeem({ token: 'rzzzzzzzzzzzzzzzzzzzz', rpk: kp().pk }).reason, 'invalid', 'não emitido');
  assert.strictEqual(r.recoverRedeem({ token: 'r0123456789abcdef0123', rpk: 'chave-lixo' }).reason, 'invalid', 'rpk inválido');
  const g = r.recoverGrant(id);
  clock.t += REC_GRANT_TTL - 1;
  assert.strictEqual(r.recoverRedeem({ token: g.token, rpk: kp().pk }).ok, true, 'um milissegundo antes do prazo ainda vale');
  clock.t += 1;
  assert.strictEqual(r.recoverRedeem({ token: g.token, rpk: kp().pk }).reason, 'expired', 'vencida');
});

test('uso: cancela um pedido de recuperação em carência (a autorização vem do dono)', t => {
  const { r, id, rec } = setup(t);
  const newMain = kp(),
    newRec = kp();
  const data = payload.recover(id, 1, newMain.pk, newRec.pk);
  const pend = r.recoverPrimary({ id, expectedGen: 1, newPk: newMain.pk, newRpk: newRec.pk, sigRec: sign(rec.priv, data), graceMs: 60000 });
  assert.strictEqual(pend.ok, true);
  assert.strictEqual(pend.pending, true);
  const g = r.recoverGrant(id);
  const out = r.recoverRedeem({ token: g.token, rpk: kp().pk });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.cancelled, true, 'o pedido em carência foi cancelado');
  assert.strictEqual(r.get(id).pending, undefined, 'não há mais troca de principal pendente');
  assert.strictEqual(r.get(id).pk, r.get(id).pk, 'a principal continua a antiga');
});

test('uso: sobrevive a reinício (o hash fica no arquivo) e morre quando outra troca de chave acontece', t => {
  const { r, id, main, clock, file } = setup(t);
  const g = r.recoverGrant(id);
  const nr = kp();
  // reinício: mesmo arquivo, relógio adiante dentro do prazo
  clock.t += 60000;
  const again = createIdentityRegistry({ file, now: () => clock.t });
  assert.strictEqual(again.get(id).rpk, r.get(id).rpk);
  const rr = again.recoverRedeem({ token: g.token, rpk: nr.pk });
  assert.strictEqual(rr.ok, true, 'a autorização sobrevive ao reinício (motivo: ' + rr.reason + ')');
  // o dono de volta renova a chave normalmente: a autorização usada deixa de valer
  const r2 = kp();
  const data = payload.rotateRecovery(id, 2, r2.pk);
  const rot = again.rotateRecovery({ id, expectedRgen: 2, newRpk: r2.pk, sigRec: sign(nr.priv, data), sigOld: sign(main.priv, data) });
  assert.strictEqual(rot.ok, true);
  assert.strictEqual(again.get(id).recGrant, undefined, 'a renovação normal apaga a autorização');
  assert.strictEqual(again.recoverRedeem({ token: g.token, rpk: nr.pk }).reason, 'invalid');
});
