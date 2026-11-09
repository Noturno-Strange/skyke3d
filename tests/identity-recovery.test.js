'use strict';
// Recuperação (lib/identity.js): troca da principal só com a chave de recuperação, período de
// carência cancelável pela principal atual, aplicação preguiçosa e persistência do pedido.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createIdentityRegistry, payload } = require('../lib/identity.js');
const { newId } = require('../lib/ids.js');

function kp() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { pk: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), priv: privateKey };
}
const sign = (priv, data) =>
  crypto.sign('sha256', Buffer.from(data, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');

function tmpFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-recovery-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'identity.json');
}

function setup(t, opts = {}) {
  let clock = 1000000;
  const file = tmpFile(t);
  const r = createIdentityRegistry({ file, now: () => clock, ...opts });
  const id = newId(),
    main = kp(),
    rec = kp();
  assert.strictEqual(r.register({ id, pk: main.pk, rpk: rec.pk }).ok, true);
  return { file, r, id, main, rec, tick: ms => (clock += ms), at: () => clock };
}

test('sem carência, a recuperação troca a principal sozinha e invalida a antiga', t => {
  const { r, id, main, rec } = setup(t);
  const next = kp();
  const data = payload.recover(id, 1, next.pk);
  assert.deepStrictEqual(r.recoverPrimary({ id, expectedGen: 1, newPk: next.pk, sigRec: sign(rec.priv, data), graceMs: 0 }), {
    ok: true,
    gen: 2,
    rgen: 1,
    epoch: 1
  });
  const after = r.get(id);
  assert.strictEqual(after.pk, next.pk);
  assert.strictEqual(after.gen, 2);
  assert.strictEqual(after.epoch, 1);
  assert.strictEqual(after.rpk, rec.pk);
  const auth = payload.auth(id, 'n', 'join');
  assert.strictEqual(r.verify(id, auth, sign(main.priv, auth)), false);
  assert.strictEqual(r.verify(id, auth, sign(next.priv, auth)), true);
});

test('a troca pela recuperação exige a assinatura da chave de recuperação', t => {
  const { r, id, main } = setup(t);
  const next = kp();
  const data = payload.recover(id, 1, next.pk);
  assert.deepStrictEqual(
    r.recoverPrimary({ id, expectedGen: 1, newPk: next.pk, sigRec: sign(main.priv, data), graceMs: 0 }),
    { ok: false, reason: 'bad-signature' }
  );
  assert.deepStrictEqual(
    r.recoverPrimary({ id, expectedGen: 1, newPk: next.pk, sigRec: sign(kp().priv, data), graceMs: 0 }),
    { ok: false, reason: 'bad-signature' }
  );
  assert.strictEqual(r.get(id).pk, main.pk);
});

test('com carência, a principal atual continua valendo até o prazo', t => {
  const { r, id, main, rec, tick, at } = setup(t);
  const next = kp();
  const data = payload.recover(id, 1, next.pk);
  const res = r.recoverPrimary({ id, expectedGen: 1, newPk: next.pk, sigRec: sign(rec.priv, data), graceMs: 1000 });
  assert.deepStrictEqual(res, { ok: true, gen: 1, epoch: 0, pending: true, until: at() + 1000 });
  assert.strictEqual(r.get(id).pk, main.pk);
  assert.deepStrictEqual(r.get(id).pending, { pk: next.pk, until: at() + 1000 });
  assert.strictEqual(r.stats().pending, 1);

  const auth = payload.auth(id, 'n', 'join');
  assert.strictEqual(r.verify(id, auth, sign(main.priv, auth)), true);
  assert.strictEqual(r.verify(id, auth, sign(next.priv, auth)), false);
  tick(999);
  assert.strictEqual(r.get(id).pending.pk, next.pk);
});

test('vencido o prazo, a troca é aplicada na próxima leitura e incrementa geração e época', t => {
  const { r, id, main, rec, tick } = setup(t);
  const next = kp();
  const data = payload.recover(id, 1, next.pk);
  r.recoverPrimary({ id, expectedGen: 1, newPk: next.pk, sigRec: sign(rec.priv, data), graceMs: 1000 });
  tick(1001);
  const after = r.get(id);
  assert.strictEqual(after.pk, next.pk);
  assert.strictEqual(after.gen, 2);
  assert.strictEqual(after.epoch, 1);
  assert.strictEqual(after.pending, undefined);
  assert.strictEqual(r.stats().pending, 0);
  const auth = payload.auth(id, 'n', 'join');
  assert.strictEqual(r.verify(id, auth, sign(main.priv, auth)), false);
  assert.strictEqual(r.verify(id, auth, sign(next.priv, auth)), true);
});

test('a principal atual cancela o pedido durante a carência', t => {
  const { r, id, main, rec, tick } = setup(t);
  const next = kp();
  const data = payload.recover(id, 1, next.pk);
  r.recoverPrimary({ id, expectedGen: 1, newPk: next.pk, sigRec: sign(rec.priv, data), graceMs: 1000 });
  const cancel = payload.cancelRecovery(id, 1);
  assert.deepStrictEqual(r.cancelRecovery({ id, expectedGen: 1, sigOld: sign(rec.priv, cancel) }), {
    ok: false,
    reason: 'bad-signature'
  });
  assert.deepStrictEqual(r.cancelRecovery({ id, expectedGen: 1, sigOld: sign(main.priv, cancel) }), {
    ok: true,
    gen: 1
  });
  assert.strictEqual(r.get(id).pending, undefined);
  assert.strictEqual(r.stats().pending, 0);
  tick(2000);
  assert.strictEqual(r.get(id).pk, main.pk);
  assert.strictEqual(r.get(id).gen, 1);
  // cancelar de novo é seguro
  assert.deepStrictEqual(r.cancelRecovery({ id, expectedGen: 1, sigOld: sign(main.priv, cancel) }), {
    ok: true,
    gen: 1
  });
});

test('repetir o pedido é idempotente antes e depois de aplicar', t => {
  const { r, id, rec, tick } = setup(t);
  const next = kp();
  const data = payload.recover(id, 1, next.pk);
  const a = r.recoverPrimary({ id, expectedGen: 1, newPk: next.pk, sigRec: sign(rec.priv, data), graceMs: 500 });
  const b = r.recoverPrimary({ id, expectedGen: 1, newPk: next.pk, sigRec: sign(rec.priv, data), graceMs: 500 });
  assert.deepStrictEqual(b, a);
  tick(501);
  r.get(id);
  assert.deepStrictEqual(r.recoverPrimary({ id, expectedGen: 1, newPk: next.pk, sigRec: sign(rec.priv, data) }), {
    ok: true,
    gen: 2,
    idempotent: true
  });
});

test('pedido diferente durante a carência devolve pending, sem trocar o alvo', t => {
  const { r, id, rec } = setup(t);
  const a = kp(),
    b = kp();
  r.recoverPrimary({ id, expectedGen: 1, newPk: a.pk, sigRec: sign(rec.priv, payload.recover(id, 1, a.pk)), graceMs: 500 });
  const res = r.recoverPrimary({
    id,
    expectedGen: 1,
    newPk: b.pk,
    sigRec: sign(rec.priv, payload.recover(id, 1, b.pk)),
    graceMs: 500
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'pending');
  assert.strictEqual(r.get(id).pending.pk, a.pk);
});

test('rotação autorizada pelas duas chaves cancela o pedido de recuperação', t => {
  const { r, id, main, rec, tick } = setup(t);
  const next = kp();
  r.recoverPrimary({
    id,
    expectedGen: 1,
    newPk: next.pk,
    sigRec: sign(rec.priv, payload.recover(id, 1, next.pk)),
    graceMs: 1000
  });
  const other = kp();
  const data = payload.rotate(id, 1, other.pk);
  assert.strictEqual(
    r.rotatePrimary({ id, expectedGen: 1, newPk: other.pk, sigOld: sign(main.priv, data), sigRec: sign(rec.priv, data) }).ok,
    true
  );
  assert.strictEqual(r.get(id).pending, undefined);
  tick(2000);
  assert.strictEqual(r.get(id).pk, other.pk);
  assert.strictEqual(r.get(id).gen, 2);
});

test('trocar a recuperação cancela o pedido feito com a chave antiga', t => {
  const { r, id, main, rec, tick } = setup(t);
  const next = kp();
  r.recoverPrimary({
    id,
    expectedGen: 1,
    newPk: next.pk,
    sigRec: sign(rec.priv, payload.recover(id, 1, next.pk)),
    graceMs: 1000
  });
  const rec2 = kp();
  const data = payload.rotateRecovery(id, 1, rec2.pk);
  assert.strictEqual(
    r.rotateRecovery({ id, expectedRgen: 1, newRpk: rec2.pk, sigRec: sign(rec.priv, data), sigOld: sign(main.priv, data) })
      .ok,
    true
  );
  assert.strictEqual(r.get(id).pending, undefined);
  tick(2000);
  assert.strictEqual(r.get(id).pk, main.pk);
});

test('revogar sessões não cancela o pedido de recuperação', t => {
  const { r, id, main, rec } = setup(t);
  const next = kp();
  r.recoverPrimary({
    id,
    expectedGen: 1,
    newPk: next.pk,
    sigRec: sign(rec.priv, payload.recover(id, 1, next.pk)),
    graceMs: 1000
  });
  assert.strictEqual(r.revokeSessions({ id, expectedEpoch: 0, sigOld: sign(main.priv, payload.revoke(id, 0)) }).ok, true);
  assert.strictEqual(r.get(id).pending.pk, next.pk);
  assert.strictEqual(r.get(id).epoch, 1);
});

test('o pedido pendente sobrevive ao reinício e vence pelo relógio novo', t => {
  const { file, r, id, rec, at } = setup(t);
  const next = kp();
  r.recoverPrimary({
    id,
    expectedGen: 1,
    newPk: next.pk,
    sigRec: sign(rec.priv, payload.recover(id, 1, next.pk)),
    graceMs: 500
  });
  const r2 = createIdentityRegistry({ file, now: () => at() + 501 });
  const after = r2.get(id);
  assert.strictEqual(after.pk, next.pk);
  assert.strictEqual(after.gen, 2);
  assert.strictEqual(after.pending, undefined);
});

test('pedido pendente inválido no disco falha fechado', t => {
  const file = tmpFile(t);
  const id = newId(),
    main = kp(),
    rec = kp();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      v: 1,
      savedAt: 1,
      ids: {
        [id]: {
          pk: main.pk,
          gen: 1,
          rpk: rec.pk,
          rgen: 1,
          epoch: 0,
          created: 1,
          at: 1,
          pending: { pk: 'curta', until: 1 }
        }
      }
    })
  );
  assert.strictEqual(createIdentityRegistry({ file }).corrupt, true);
});

test('recuperação em id inexistente e carência inválida são recusadas', t => {
  const { r, id, rec } = setup(t);
  const ghost = newId();
  assert.strictEqual(
    r.recoverPrimary({ id: ghost, expectedGen: 1, newPk: kp().pk, sigRec: sign(rec.priv, 'x'), graceMs: 0 }).reason,
    'notfound'
  );
  const next = kp();
  assert.strictEqual(
    r.recoverPrimary({
      id,
      expectedGen: 1,
      newPk: next.pk,
      sigRec: sign(rec.priv, payload.recover(id, 1, next.pk)),
      graceMs: -1
    }).reason,
    'invalid'
  );
});

test('o código de recuperação vale uma vez: quando a troca vale, a chave de recuperação usada morre e vale a nova', t => {
  /** @type {string[]} */
  const settled = [];
  const { r, id, rec, tick } = setup(t, { onSettle: x => settled.push(x) });
  const next = kp(),
    nextRec = kp();
  const data = payload.recover(id, 1, next.pk, nextRec.pk);
  // a assinatura cobre também a chave de recuperação nova: trocar a nova por outra invalida o pedido
  const other = kp();
  assert.strictEqual(
    r.recoverPrimary({ id, expectedGen: 1, newPk: next.pk, newRpk: other.pk, sigRec: sign(rec.priv, data), graceMs: 1000 })
      .reason,
    'bad-signature'
  );
  // a nova não pode ser a mesma de agora (o código continuaria valendo)
  const same = payload.recover(id, 1, next.pk, rec.pk);
  assert.strictEqual(
    r.recoverPrimary({ id, expectedGen: 1, newPk: next.pk, newRpk: rec.pk, sigRec: sign(rec.priv, same), graceMs: 1000 })
      .reason,
    'invalid'
  );
  const p = r.recoverPrimary({ id, expectedGen: 1, newPk: next.pk, newRpk: nextRec.pk, sigRec: sign(rec.priv, data), graceMs: 1000 });
  assert.strictEqual(p.ok, true);
  assert.strictEqual(p.pending, true);
  // durante a carência nada mudou: o código antigo ainda vale
  assert.strictEqual(r.get(id).rpk, rec.pk);
  assert.deepStrictEqual(settled, []);
  tick(1001);
  const after = r.get(id);
  assert.strictEqual(after.pk, next.pk);
  assert.strictEqual(after.rpk, nextRec.pk);
  assert.strictEqual(after.gen, 2);
  assert.strictEqual(after.rgen, 2);
  assert.strictEqual(after.epoch, 1);
  assert.deepStrictEqual(settled, [id], 'o servidor fica sabendo para derrubar as sessões antigas');
  // o código usado não serve para outra recuperação
  const again = kp();
  const d2 = payload.recover(id, 2, again.pk, kp().pk);
  assert.strictEqual(
    r.recoverPrimary({ id, expectedGen: 2, newPk: again.pk, newRpk: kp().pk, sigRec: sign(rec.priv, d2), graceMs: 0 }).reason,
    'bad-signature'
  );
});

test('o pedido com a chave de recuperação nova sobrevive a reiniciar o servidor', t => {
  const { r, id, rec, file, tick, at } = setup(t);
  const next = kp(),
    nextRec = kp();
  const data = payload.recover(id, 1, next.pk, nextRec.pk);
  assert.strictEqual(
    r.recoverPrimary({ id, expectedGen: 1, newPk: next.pk, newRpk: nextRec.pk, sigRec: sign(rec.priv, data), graceMs: 500 }).ok,
    true
  );
  const again = createIdentityRegistry({ file, now: at });
  assert.strictEqual(again.get(id).pending.rpk, nextRec.pk);
  tick(600);
  assert.strictEqual(again.get(id).rpk, nextRec.pk);
});
