'use strict';
// Registro de identidades (lib/identity.js): P-256, rotação atômica com dupla assinatura, revogação de
// sessões, concorrência, falha fechada em corrupção e ausência total de material privado no disco.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createIdentityRegistry, payload, identityIdOf } = require('../lib/identity.js');
const { newId, fidOf } = require('../lib/ids.js');
const { writeJsonAtomic } = require('../lib/persist.js');

function tmpFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-identity-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'identity.json');
}

// Par de chaves P-256 como o WebCrypto usa: chave pública SPKI DER em base64url e assinatura r||s.
function kp() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { pk: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), priv: privateKey };
}
function sign(priv, data) {
  return crypto.sign('sha256', Buffer.from(data, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}

/** Registro com uma identidade pronta; devolve as chaves para os testes. */
function setup(t, opts = {}) {
  const file = tmpFile(t);
  const r = createIdentityRegistry({ file, ...opts });
  const id = newId();
  const main = kp();
  const rec = kp();
  assert.deepStrictEqual(r.register({ id, pk: main.pk, rpk: rec.pk }), { ok: true, gen: 1, rgen: 1, epoch: 0 });
  return { file, r, id, main, rec };
}

test('registra, lê e recarrega do disco', t => {
  const file = tmpFile(t);
  const r = createIdentityRegistry({ file, now: () => 1000 });
  const id = newId(),
    main = kp(),
    rec = kp();
  assert.deepStrictEqual(r.register({ id, pk: main.pk, rpk: rec.pk }), { ok: true, gen: 1, rgen: 1, epoch: 0 });
  assert.strictEqual(r.size, 1);
  assert.strictEqual(r.has(id), true);
  assert.deepStrictEqual(r.get(id), {
    id,
    pk: main.pk,
    gen: 1,
    rpk: rec.pk,
    rgen: 1,
    epoch: 0,
    created: 1000,
    at: 1000
  });
  // cópia: mexer no retorno não altera o registro
  r.get(id).gen = 99;
  assert.strictEqual(r.get(id).gen, 1);

  const r2 = createIdentityRegistry({ file });
  assert.deepStrictEqual(r2.get(id), r.get(id));
  assert.strictEqual(r2.corrupt, false);
});

test('recusa id inválido, chave que não é P-256, duplicata e registro cheio', t => {
  const file = tmpFile(t);
  const r = createIdentityRegistry({ file, max: 2 });
  const id = newId(),
    main = kp(),
    rec = kp();
  const ed = crypto.generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');

  assert.deepStrictEqual(r.register({ id: 'ABC', pk: main.pk, rpk: rec.pk }), { ok: false, reason: 'invalid' });
  assert.deepStrictEqual(r.register({ id, pk: 'x'.repeat(122), rpk: rec.pk }), { ok: false, reason: 'invalid' });
  assert.deepStrictEqual(r.register({ id, pk: main.pk, rpk: 'x'.repeat(122) }), { ok: false, reason: 'invalid' });
  assert.deepStrictEqual(r.register({ id, pk: ed, rpk: rec.pk }), { ok: false, reason: 'invalid' });
  assert.strictEqual(r.size, 0);

  assert.strictEqual(r.register({ id, pk: main.pk, rpk: rec.pk }).ok, true);
  assert.deepStrictEqual(r.register({ id, pk: main.pk, rpk: rec.pk }), { ok: false, reason: 'exists' });

  const id2 = newId();
  assert.strictEqual(r.register({ id: id2, pk: main.pk, rpk: rec.pk }).ok, true);
  const id3 = newId();
  assert.deepStrictEqual(r.register({ id: id3, pk: main.pk, rpk: rec.pk }), { ok: false, reason: 'full' });
  assert.strictEqual(r.has(id3), false);
});

test('rotação válida: gen+1, epoch+1, chave antiga deixa de autenticar', t => {
  const { r, id, main, rec } = setup(t);
  const next = kp();
  const data = payload.rotate(id, 1, next.pk);
  assert.deepStrictEqual(r.rotatePrimary({ id, expectedGen: 1, newPk: next.pk, sigOld: sign(main.priv, data), sigRec: sign(rec.priv, data) }), {
    ok: true,
    gen: 2,
    epoch: 1
  });
  const after = r.get(id);
  assert.strictEqual(after.pk, next.pk);
  assert.strictEqual(after.gen, 2);
  assert.strictEqual(after.epoch, 1);
  assert.strictEqual(after.rpk, rec.pk);

  const auth = payload.auth(id, 'nonce-1', 'join');
  assert.strictEqual(r.verify(id, auth, sign(main.priv, auth)), false);
  assert.strictEqual(r.verify(id, auth, sign(next.priv, auth)), true);
  assert.strictEqual(r.verifyRecovery(id, auth, sign(rec.priv, auth)), true);
});

test('rotação com geração obsoleta devolve stale e não altera nada', t => {
  const { r, id, main, rec } = setup(t);
  const next = kp(),
    other = kp();
  const d1 = payload.rotate(id, 1, next.pk);
  assert.strictEqual(
    r.rotatePrimary({ id, expectedGen: 1, newPk: next.pk, sigOld: sign(main.priv, d1), sigRec: sign(rec.priv, d1) }).ok,
    true
  );
  const before = r.get(id);
  const d2 = payload.rotate(id, 1, other.pk);
  assert.deepStrictEqual(
    r.rotatePrimary({ id, expectedGen: 1, newPk: other.pk, sigOld: sign(main.priv, d2), sigRec: sign(rec.priv, d2) }),
    { ok: false, reason: 'stale', gen: 2 }
  );
  assert.deepStrictEqual(r.get(id), before);
});

test('rotação exige as duas assinaturas: principal sozinha ou recuperação sozinha não passam', t => {
  const { r, id, main, rec } = setup(t);
  const next = kp();
  const data = payload.rotate(id, 1, next.pk);
  assert.deepStrictEqual(
    r.rotatePrimary({ id, expectedGen: 1, newPk: next.pk, sigOld: sign(kp().priv, data), sigRec: sign(rec.priv, data) }),
    { ok: false, reason: 'bad-signature' }
  );
  assert.deepStrictEqual(
    r.rotatePrimary({ id, expectedGen: 1, newPk: next.pk, sigOld: sign(main.priv, data), sigRec: sign(kp().priv, data) }),
    { ok: false, reason: 'bad-signature' }
  );
  assert.deepStrictEqual(
    r.rotatePrimary({ id, expectedGen: 1, newPk: next.pk, sigOld: sign(main.priv, data), sigRec: sign(main.priv, data) }),
    { ok: false, reason: 'bad-signature' }
  );
  assert.strictEqual(r.get(id).gen, 1);
  assert.strictEqual(r.get(id).pk, main.pk);
});

test('duas rotações com a mesma geração: a primeira vence, a segunda recebe stale', t => {
  const { r, id, main, rec } = setup(t);
  const a = kp(),
    b = kp();
  const da = payload.rotate(id, 1, a.pk),
    db = payload.rotate(id, 1, b.pk);
  const ra = r.rotatePrimary({ id, expectedGen: 1, newPk: a.pk, sigOld: sign(main.priv, da), sigRec: sign(rec.priv, da) });
  const rb = r.rotatePrimary({ id, expectedGen: 1, newPk: b.pk, sigOld: sign(main.priv, db), sigRec: sign(rec.priv, db) });
  assert.strictEqual(ra.ok, true);
  assert.deepStrictEqual(rb, { ok: false, reason: 'stale', gen: 2 });
  assert.strictEqual(r.get(id).pk, a.pk);
});

test('repetir a mesma rotação é idempotente (resposta perdida depois da gravação)', t => {
  const { r, id, main, rec } = setup(t);
  const next = kp();
  const data = payload.rotate(id, 1, next.pk);
  const args = { id, expectedGen: 1, newPk: next.pk, sigOld: sign(main.priv, data), sigRec: sign(rec.priv, data) };
  assert.deepStrictEqual(r.rotatePrimary(args), { ok: true, gen: 2, epoch: 1 });
  assert.deepStrictEqual(r.rotatePrimary(args), { ok: true, gen: 2, idempotent: true });
  assert.strictEqual(r.get(id).gen, 2);
});

test('rotação da recuperação: rgen+1, epoch+1 e troca exige as duas chaves', t => {
  const { r, id, main, rec } = setup(t);
  const next = kp();
  const data = payload.rotateRecovery(id, 1, next.pk);

  assert.deepStrictEqual(
    r.rotateRecovery({ id, expectedRgen: 1, newRpk: next.pk, sigRec: sign(rec.priv, data) }),
    { ok: false, reason: 'bad-signature' }
  );
  assert.deepStrictEqual(
    r.rotateRecovery({ id, expectedRgen: 1, newRpk: next.pk, sigRec: sign(main.priv, data), sigOld: sign(main.priv, data) }),
    { ok: false, reason: 'bad-signature' }
  );
  assert.deepStrictEqual(
    r.rotateRecovery({ id, expectedRgen: 1, newRpk: next.pk, sigRec: sign(rec.priv, data), sigOld: sign(main.priv, data) }),
    { ok: true, rgen: 2, epoch: 1 }
  );
  assert.strictEqual(r.get(id).rpk, next.pk);
  assert.strictEqual(r.get(id).rgen, 2);
  assert.strictEqual(r.get(id).pk, main.pk);

  const auth = payload.auth(id, 'n', 'join');
  assert.strictEqual(r.verifyRecovery(id, auth, sign(rec.priv, auth)), false);
  assert.strictEqual(r.verifyRecovery(id, auth, sign(next.priv, auth)), true);
});

test('repetir a mesma troca de recuperação é idempotente (resposta perdida depois da gravação)', t => {
  const { r, id, main, rec } = setup(t);
  const next = kp();
  const data = payload.rotateRecovery(id, 1, next.pk);
  const args = { id, expectedRgen: 1, newRpk: next.pk, sigRec: sign(rec.priv, data), sigOld: sign(main.priv, data) };
  assert.deepStrictEqual(r.rotateRecovery(args), { ok: true, rgen: 2, epoch: 1 });
  assert.deepStrictEqual(r.rotateRecovery(args), { ok: true, rgen: 2, idempotent: true });
  assert.strictEqual(r.get(id).rgen, 2);
  assert.strictEqual(r.get(id).rpk, next.pk);
});

test('duas trocas de recuperação com a mesma geração: a primeira vence, a segunda recebe stale', t => {
  const { r, id, main, rec } = setup(t);
  const a = kp(),
    b = kp();
  const da = payload.rotateRecovery(id, 1, a.pk),
    db = payload.rotateRecovery(id, 1, b.pk);
  const ra = r.rotateRecovery({ id, expectedRgen: 1, newRpk: a.pk, sigRec: sign(rec.priv, da), sigOld: sign(main.priv, da) });
  const rb = r.rotateRecovery({ id, expectedRgen: 1, newRpk: b.pk, sigRec: sign(rec.priv, db), sigOld: sign(main.priv, db) });
  assert.strictEqual(ra.ok, true);
  assert.deepStrictEqual(rb, { ok: false, reason: 'stale', rgen: 2 });
  assert.strictEqual(r.get(id).rpk, a.pk);
  assert.strictEqual(r.get(id).rgen, 2);
});

test('revogação de sessões: epoch+1, repetição segura e assinatura de outro domínio recusada', t => {
  const { r, id, main } = setup(t);
  const data = payload.revoke(id, 0);
  assert.strictEqual(r.revokeSessions({ id, expectedEpoch: 0, sigOld: sign(main.priv, payload.rotate(id, 1, main.pk)) }).reason, 'bad-signature');
  assert.deepStrictEqual(r.revokeSessions({ id, expectedEpoch: 0, sigOld: sign(main.priv, data) }), { ok: true, epoch: 1 });
  assert.deepStrictEqual(r.revokeSessions({ id, expectedEpoch: 0, sigOld: sign(main.priv, data) }), {
    ok: true,
    epoch: 1,
    idempotent: true
  });
  assert.deepStrictEqual(r.revokeSessions({ id, expectedEpoch: 5, sigOld: sign(main.priv, data) }), {
    ok: false,
    reason: 'stale',
    epoch: 1
  });
  // revogar não troca chave nenhuma
  assert.strictEqual(r.get(id).pk, main.pk);
  assert.strictEqual(r.get(id).gen, 1);
});

test('assinatura de um domínio não vale para outro', t => {
  const { r, id, main, rec } = setup(t);
  const rotateSig = sign(main.priv, payload.rotate(id, 1, kp().pk));
  assert.strictEqual(r.revokeSessions({ id, expectedEpoch: 0, sigOld: rotateSig }).reason, 'bad-signature');
  const auth = payload.auth(id, 'nonce', 'join');
  assert.strictEqual(r.verify(id, payload.auth(id, 'nonce', 'rotate'), sign(main.priv, auth)), false);
  assert.strictEqual(r.verifyRecovery(id, payload.rotate(id, 1, rec.pk), sign(rec.priv, auth)), false);
});

test('falha de escrita não altera a memória e devolve io', t => {
  const file = tmpFile(t);
  let fail = false;
  const r = createIdentityRegistry({
    file,
    writeFile: (f, o, opts) => {
      if (fail) throw new Error('disco cheio');
      writeJsonAtomic(f, o, opts);
    }
  });
  const id = newId(),
    main = kp(),
    rec = kp();
  assert.deepStrictEqual(r.register({ id, pk: main.pk, rpk: rec.pk }), { ok: true, gen: 1, rgen: 1, epoch: 0 });

  fail = true;
  const next = kp();
  const data = payload.rotate(id, 1, next.pk);
  assert.deepStrictEqual(
    r.rotatePrimary({ id, expectedGen: 1, newPk: next.pk, sigOld: sign(main.priv, data), sigRec: sign(rec.priv, data) }),
    { ok: false, reason: 'io' }
  );
  assert.strictEqual(r.get(id).pk, main.pk);
  assert.strictEqual(r.get(id).gen, 1);
  assert.strictEqual(r.revokeSessions({ id, expectedEpoch: 0, sigOld: sign(main.priv, payload.revoke(id, 0)) }).reason, 'io');
  assert.strictEqual(r.get(id).epoch, 0);

  fail = false;
  assert.strictEqual(r.rotatePrimary({ id, expectedGen: 1, newPk: next.pk, sigOld: sign(main.priv, data), sigRec: sign(rec.priv, data) }).ok, true);
  assert.strictEqual(r.get(id).pk, next.pk);
});

test('arquivo principal corrompido com .bak válido carrega o .bak', t => {
  const file = tmpFile(t);
  const warns = [];
  const r = createIdentityRegistry({ file, warn: m => warns.push(m) });
  const a = newId(),
    b = newId(),
    main = kp(),
    rec = kp();
  r.register({ id: a, pk: main.pk, rpk: rec.pk });
  r.register({ id: b, pk: main.pk, rpk: rec.pk }); // o .bak guarda a geração anterior (só `a`)
  assert.strictEqual(r.size, 2);

  fs.writeFileSync(file, '{corrompido');
  const r2 = createIdentityRegistry({ file, warn: m => warns.push(m) });
  assert.strictEqual(r2.corrupt, false);
  assert.strictEqual(r2.has(a), true);
  assert.strictEqual(r2.has(b), false);
  assert.ok(warns.some(m => m.includes('.bak')));
  // não copia o principal inválido por cima do .bak bom
  const bak = fs.readFileSync(file + '.bak', 'utf8');
  r2.register({ id: newId(), pk: main.pk, rpk: rec.pk });
  assert.strictEqual(fs.readFileSync(file + '.bak', 'utf8'), bak);
});

test('principal e .bak corrompidos: falha fechada, arquivo intocado e operações bloqueadas', t => {
  const file = tmpFile(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{quebrado');
  fs.writeFileSync(file + '.bak', 'também');
  const r = createIdentityRegistry({ file });
  assert.strictEqual(r.corrupt, true);
  assert.strictEqual(r.size, 0);
  const main = kp(),
    rec = kp();
  assert.deepStrictEqual(r.register({ id: newId(), pk: main.pk, rpk: rec.pk }), { ok: false, reason: 'corrupt' });
  assert.strictEqual(r.flush(), false);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '{quebrado');
  assert.strictEqual(fs.readFileSync(file + '.bak', 'utf8'), 'também');
});

test('esquema inválido no disco também falha fechado (gen, epoch, id, chave)', t => {
  const file = tmpFile(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const main = kp(),
    rec = kp();
  const base = { pk: main.pk, gen: 1, rpk: rec.pk, rgen: 1, epoch: 0, created: 1, at: 1 };
  const casos = [
    { id: 'a'.repeat(11), e: base },
    { id: newId(), e: { ...base, gen: 0 } },
    { id: newId(), e: { ...base, epoch: -1 } },
    { id: newId(), e: { ...base, rgen: 1.5 } },
    { id: newId(), e: { ...base, pk: 'curta' } }
  ];
  for (const { id, e } of casos) {
    fs.writeFileSync(file, JSON.stringify({ v: 1, savedAt: 1, ids: { [id]: e } }));
    try {
      fs.unlinkSync(file + '.bak');
    } catch (x) {
      /* não existia */
    }
    assert.strictEqual(createIdentityRegistry({ file }).corrupt, true, JSON.stringify(e));
  }
});

test('o JSON não guarda nenhum material privado', t => {
  const { file, r, id, main, rec } = setup(t);
  const next = kp();
  const data = payload.rotate(id, 1, next.pk);
  r.rotatePrimary({ id, expectedGen: 1, newPk: next.pk, sigOld: sign(main.priv, data), sigRec: sign(rec.priv, data) });
  const raw = fs.readFileSync(file, 'utf8');
  const j = JSON.parse(raw);
  assert.deepStrictEqual(Object.keys(j).sort(), ['ids', 'savedAt', 'v']);
  const allowed = ['at', 'created', 'epoch', 'gen', 'legacy', 'pending', 'pk', 'rgen', 'rpk'];
  for (const e of Object.values(j.ids)) {
    assert.deepStrictEqual(Object.keys(e).filter(k => !allowed.includes(k)), []);
    assert.ok(!('d' in e) && !('priv' in e) && !('pkcs8' in e) && !('jwk' in e));
  }
  assert.ok(!raw.includes('PRIVATE'));
  // as chaves exportadas só têm a parte pública (SPKI P-256 = 91 bytes)
  assert.strictEqual(Buffer.from(main.pk, 'base64url').length, 91);
});

test('arquivo em modo 0600 e estatísticas corretas', t => {
  const file = tmpFile(t);
  const r = createIdentityRegistry({ file, max: 10, now: () => 5000 });
  const id = newId(),
    main = kp(),
    rec = kp();
  r.register({ id, pk: main.pk, rpk: rec.pk });
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  const s = r.stats();
  assert.strictEqual(s.count, 1);
  assert.strictEqual(s.max, 10);
  assert.strictEqual(s.corrupt, false);
  assert.strictEqual(s.savedAt, 5000);
  assert.ok(s.bytes > 0);
  assert.strictEqual(r.flush(), true);
  assert.strictEqual(r.savedAt, 5000);
});

test('remove exige a chave principal e apaga o registro', t => {
  const { r, id, main } = setup(t);
  assert.strictEqual(r.remove({ id, sigOld: sign(kp().priv, payload.remove(id)) }).reason, 'bad-signature');
  assert.strictEqual(r.has(id), true);
  assert.deepStrictEqual(r.remove({ id, sigOld: sign(main.priv, payload.remove(id)) }), { ok: true });
  assert.strictEqual(r.has(id), false);
  assert.strictEqual(r.size, 0);
});

test('id inexistente responde notfound em toda operação', t => {
  const r = createIdentityRegistry({ file: '' });
  const id = newId();
  assert.strictEqual(r.get(id), null);
  assert.strictEqual(r.has(id), false);
  assert.strictEqual(r.verify(id, 'x', 'y'), false);
  assert.strictEqual(r.verifyRecovery(id, 'x', 'y'), false);
  assert.strictEqual(r.rotatePrimary({ id, expectedGen: 1, newPk: kp().pk, sigOld: '', sigRec: '' }).reason, 'notfound');
  assert.strictEqual(r.rotateRecovery({ id, expectedRgen: 1, newRpk: kp().pk, sigRec: '', sigOld: '' }).reason, 'notfound');
  assert.strictEqual(r.revokeSessions({ id, expectedEpoch: 0, sigOld: '' }).reason, 'notfound');
  assert.strictEqual(r.remove({ id, sigOld: '' }).reason, 'notfound');
});

test('identidade legada mantém o id de amigo', t => {
  const { r, id, main, rec } = setup(t);
  const fk = 'A'.repeat(43);
  const legacyId = identityIdOf(fk);
  assert.strictEqual(legacyId, fidOf(fk));
  assert.deepStrictEqual(r.register({ id: legacyId, pk: main.pk, rpk: rec.pk, legacy: true }), {
    ok: true,
    gen: 1,
    rgen: 1,
    epoch: 0
  });
  assert.strictEqual(r.get(legacyId).legacy, true);
  assert.strictEqual(r.get(id).legacy, undefined);
});

// SK-02: o registro tem teto e não expirava nada; quem enchia com identidades que nunca autenticam trancava o cadastro para sempre.
test('registro cheio: identidade antiga que nunca autenticou abre vaga; as usadas e as recentes ficam', t => {
  let clock = 1_000_000;
  const r = createIdentityRegistry({ file: tmpFile(t), max: 3, unusedMs: 1000, now: () => clock });
  const [a, b, c, d, e, f] = [1, 2, 3, 4, 5, 6].map(() => newId());
  const reg = id => r.register({ id, pk: kp().pk, rpk: kp().pk });
  assert.strictEqual(reg(a).ok, true);
  clock += 1;
  assert.strictEqual(reg(b).ok, true);
  clock += 1;
  assert.strictEqual(reg(c).ok, true);
  r.touch(a); // a já autenticou: nunca é reciclada

  clock += 10;
  assert.deepStrictEqual(reg(d), { ok: false, reason: 'full' }, 'tudo recente: ninguém sai e o cadastro recusa');
  assert.strictEqual(r.size, 3);

  clock += 1500; // b e c passaram de unusedMs sem autenticar
  assert.strictEqual(reg(d).ok, true, 'o cadastro cheio recicla a mais antiga que nunca autenticou');
  assert.strictEqual(r.get(b), null, 'b (a mais antiga sem uso) saiu');
  assert.ok(r.get(a), 'a (usada) continua');
  assert.ok(r.get(c), 'c (sem uso, mas é a próxima da fila) continua por enquanto');
  assert.strictEqual(r.size, 3);
  clock += 1;
  assert.strictEqual(reg(e).ok, true);
  assert.strictEqual(r.get(c), null, 'agora c saiu');
  clock += 1;
  assert.deepStrictEqual(reg(f), { ok: false, reason: 'full' }, 'd e e são recentes e sem uso: o cadastro volta a recusar');
  assert.ok(r.get(a) && r.get(d) && r.get(e));
  assert.strictEqual(r.stats().unused, 2, 'd e e ainda não autenticaram');
});

test('registro: a faxina remove só o que nunca autenticou e passou do prazo, e grava uma vez', t => {
  let clock = 5_000_000;
  const file = tmpFile(t);
  let writes = 0;
  const r = createIdentityRegistry({
    file,
    max: 100,
    unusedMs: 1000,
    now: () => clock,
    writeFile: (f, o, opts) => {
      writes++;
      writeJsonAtomic(f, o, opts);
    }
  });
  const ids = Array.from({ length: 6 }, () => newId());
  ids.forEach(id => {
    r.register({ id, pk: kp().pk, rpk: kp().pk });
    clock += 1;
  });
  r.touch(ids[0]);
  r.touch(ids[1]);
  clock += 5000;
  const before = writes;
  assert.strictEqual(r.sweepUnused(), 4, 'as 4 sem uso e vencidas saem');
  assert.strictEqual(writes - before, 1, 'uma única gravação para a faxina toda');
  assert.ok(r.get(ids[0]) && r.get(ids[1]));
  assert.strictEqual(r.get(ids[2]), null);
  assert.strictEqual(r.sweepUnused(), 0);
  // unusedMs 0 desliga a reciclagem
  const off = createIdentityRegistry({ file: tmpFile(t), max: 1, unusedMs: 0, now: () => clock });
  off.register({ id: newId(), pk: kp().pk, rpk: kp().pk });
  clock += 1e9;
  assert.deepStrictEqual(off.register({ id: newId(), pk: kp().pk, rpk: kp().pk }), { ok: false, reason: 'full' });
  assert.strictEqual(off.sweepUnused(), 0);
});

test('registro: o sinal "já usada" é gravado depois (sem fsync na hora) e sobrevive ao reinício, sem guardar quando nem de onde', async t => {
  const file = tmpFile(t);
  const r = createIdentityRegistry({ file, max: 10, lazyMs: 5 });
  const id = newId();
  r.register({ id, pk: kp().pk, rpk: kp().pk });
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).ids[id].used, undefined, 'recém-registrada: sem sinal');
  r.touch(id);
  await new Promise(res => setTimeout(res, 60));
  const disk = JSON.parse(fs.readFileSync(file, 'utf8')).ids[id];
  assert.strictEqual(disk.used, true);
  assert.deepStrictEqual(Object.keys(disk).sort(), ['at', 'created', 'epoch', 'gen', 'pk', 'rgen', 'rpk', 'used'].sort(), 'só um sinal, nenhum horário novo');
  const again = createIdentityRegistry({ file, max: 10 });
  assert.strictEqual(again.stats().unused, 0, 'depois de reiniciar, a identidade continua marcada como usada');
});

test('registro: gravação que falha ao reciclar devolve a identidade que ia sair', t => {
  let clock = 9_000_000,
    fail = false;
  const r = createIdentityRegistry({
    file: tmpFile(t),
    max: 1,
    unusedMs: 1000,
    now: () => clock,
    writeFile: (f, o, opts) => {
      if (fail) throw new Error('disco cheio');
      writeJsonAtomic(f, o, opts);
    }
  });
  const old = newId(),
    novo = newId();
  assert.strictEqual(r.register({ id: old, pk: kp().pk, rpk: kp().pk }).ok, true);
  clock += 5000;
  fail = true;
  assert.strictEqual(r.register({ id: novo, pk: kp().pk, rpk: kp().pk }).reason, 'io');
  assert.ok(r.get(old), 'a antiga continua no registro');
  assert.strictEqual(r.get(novo), null);
  fail = false;
  assert.strictEqual(r.register({ id: novo, pk: kp().pk, rpk: kp().pk }).ok, true);
});
