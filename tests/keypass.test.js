'use strict';
// Keypass (lib/identity.js): renovação da chave de recuperação pelo próprio jogador, com 3 oportunidades, uma por mês, e a
// quarta só com o administrador. O servidor nunca guarda a chave: só a pública, a contagem e as datas.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createIdentityRegistry, payload, KEYPASS_MAX, KEYPASS_INTERVAL_MS } = require('../lib/identity.js');
const { newId } = require('../lib/ids.js');
const { writeJsonAtomic } = require('../lib/persist.js');

const MONTH = KEYPASS_INTERVAL_MS;
function kp() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { pk: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), priv: privateKey };
}
const sign = (priv, data) =>
  crypto.sign('sha256', Buffer.from(data, 'utf8'), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');

function setup(t, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-keypass-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'identity.json');
  const clock = { t: 1_800_000_000_000 };
  const r = createIdentityRegistry({ file, now: () => clock.t, ...opts });
  const id = newId(),
    main = kp(),
    state = { rec: kp(), rgen: 1 };
  assert.strictEqual(r.register({ id, pk: main.pk, rpk: state.rec.pk }).ok, true);
  /** renova a chave de recuperação com as duas assinaturas certas; devolve a resposta e, se valeu, passa a usar a chave nova */
  const renew = (next = kp()) => {
    const data = payload.rotateRecovery(id, state.rgen, next.pk);
    const args = { id, expectedRgen: state.rgen, newRpk: next.pk, sigRec: sign(state.rec.priv, data), sigOld: sign(main.priv, data) };
    const out = r.rotateRecovery(args);
    if (out.ok && !out.idempotent) {
      state.old = state.rec;
      state.rec = next;
      state.rgen = out.rgen;
    }
    return { out, args, next };
  };
  return { file, dir, r, id, main, state, clock, renew };
}

test('Keypass: cada conta tem exatamente 3 renovações e começa com todas', t => {
  const { r, id } = setup(t);
  assert.strictEqual(KEYPASS_MAX, 3);
  assert.strictEqual(MONTH, 30 * 24 * 3600000, 'intervalo de um mês (30 dias)');
  assert.deepStrictEqual(r.keypass(id), { used: 0, max: 3, left: 3, next: 0, last: 0, log: [], intervalMs: MONTH });
  assert.strictEqual(r.keypass(newId()), null, 'conta que não existe não tem Keypass');
});

test('Keypass: a primeira renovação vale na hora; a seguinte só depois de um mês', t => {
  const { r, id, clock, renew } = setup(t);
  const a = renew();
  assert.strictEqual(a.out.ok, true);
  assert.deepStrictEqual({ used: a.out.keypass.used, left: a.out.keypass.left }, { used: 1, left: 2 });
  assert.strictEqual(a.out.keypass.next, clock.t + MONTH, 'o jogador vê quando pode gerar a próxima');

  const early = renew();
  assert.strictEqual(early.out.ok, false);
  assert.strictEqual(early.out.reason, 'keypass-wait');
  assert.strictEqual(early.out.until, a.out.keypass.next);
  assert.strictEqual(r.keypass(id).used, 1, 'tentativa recusada não gasta oportunidade');
  assert.strictEqual(r.get(id).rpk, a.next.pk, 'a chave continua a da última renovação aceita');

  clock.t += MONTH - 1;
  assert.strictEqual(renew().out.reason, 'keypass-wait', 'um milissegundo antes do mês ainda não vale');
  clock.t += 1;
  const b = renew();
  assert.strictEqual(b.out.ok, true, 'exatamente um mês depois já vale');
  assert.strictEqual(b.out.keypass.used, 2);
});

test('Keypass: depois de 3 renovações acabou; a quarta é recusada mesmo passado o mês', t => {
  const { r, id, clock, renew } = setup(t);
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(renew().out.ok, true, 'renovação ' + (i + 1));
    clock.t += MONTH;
  }
  assert.deepStrictEqual({ used: r.keypass(id).used, left: r.keypass(id).left, next: r.keypass(id).next }, { used: 3, left: 0, next: 0 });
  const rpk = r.get(id).rpk,
    rgen = r.get(id).rgen;
  for (let i = 0; i < 5; i++) {
    clock.t += MONTH * 2;
    const x = renew();
    assert.strictEqual(x.out.ok, false);
    assert.strictEqual(x.out.reason, 'keypass-limit', 'quarta tentativa: só com o administrador');
  }
  assert.strictEqual(r.get(id).rpk, rpk, 'nenhuma chave mudou');
  assert.strictEqual(r.get(id).rgen, rgen);
  assert.strictEqual(r.keypass(id).log.length, 3, 'as três datas ficam registradas');
});

test('Keypass: a chave antiga morre na hora e não volta a valer (reutilização recusada)', t => {
  const { r, id, main, state, clock, renew } = setup(t);
  const first = state.rec;
  const a = renew();
  assert.strictEqual(a.out.ok, true);
  const auth = payload.auth(id, 'nonce', 'recover');
  assert.strictEqual(r.verifyRecovery(id, auth, sign(first.priv, auth)), false, 'a chave anterior não autentica mais');
  assert.strictEqual(r.verifyRecovery(id, auth, sign(a.next.priv, auth)), true, 'só a nova vale');

  // tentar renovar de novo assinando com a chave ANTIGA (depois do mês): assinatura inválida, nada muda e nada é gasto
  clock.t += MONTH;
  const next = kp(),
    data = payload.rotateRecovery(id, state.rgen, next.pk);
  const stolen = r.rotateRecovery({ id, expectedRgen: state.rgen, newRpk: next.pk, sigRec: sign(first.priv, data), sigOld: sign(main.priv, data) });
  assert.deepStrictEqual(stolen, { ok: false, reason: 'bad-signature' });
  assert.strictEqual(r.keypass(id).used, 1);
  // pedido de recuperação da conta com a chave antiga também é recusado
  const np = kp(),
    nr = kp();
  const rec = r.recoverPrimary({ id, expectedGen: 1, newPk: np.pk, newRpk: nr.pk, sigRec: sign(first.priv, payload.recover(id, 1, np.pk, nr.pk)), graceMs: 0 });
  assert.deepStrictEqual(rec, { ok: false, reason: 'bad-signature' });
  // repetir o pedido antigo (replay da mensagem que valeu): a geração já passou, não troca de volta nem gasta
  const replay = r.rotateRecovery(a.args);
  assert.deepStrictEqual(replay, { ok: true, rgen: 2, idempotent: true });
  assert.strictEqual(r.get(id).rpk, a.next.pk);
  assert.strictEqual(r.keypass(id).used, 1);
});

test('Keypass: quem não prova que é o dono não gasta nem descobre o limite (precisa da chave do aparelho E do código atual)', t => {
  const { r, id, main, state, clock, renew } = setup(t);
  for (let i = 0; i < 3; i++) {
    renew();
    clock.t += MONTH;
  }
  const next = kp(),
    data = payload.rotateRecovery(id, state.rgen, next.pk),
    other = kp();
  // só a chave do aparelho (sem o código atual), só o código (sem o aparelho) e chaves de outra pessoa
  for (const [sigRec, sigOld] of [
    [sign(main.priv, data), sign(main.priv, data)],
    [sign(state.rec.priv, data), sign(state.rec.priv, data)],
    [sign(other.priv, data), sign(other.priv, data)]
  ])
    assert.deepStrictEqual(
      r.rotateRecovery({ id, expectedRgen: state.rgen, newRpk: next.pk, sigRec, sigOld }),
      { ok: false, reason: 'bad-signature' },
      'sem as duas assinaturas a resposta é a mesma, com ou sem renovações sobrando'
    );
  // assinatura de outra ação (rotação da principal) não serve para renovar a recuperação
  const wrong = payload.rotate(id, 1, next.pk);
  assert.strictEqual(
    r.rotateRecovery({ id, expectedRgen: state.rgen, newRpk: next.pk, sigRec: sign(state.rec.priv, wrong), sigOld: sign(main.priv, wrong) }).reason,
    'bad-signature'
  );
  assert.strictEqual(r.rotateRecovery({ id, expectedRgen: state.rgen, newRpk: 'curta', sigRec: 'x', sigOld: 'y' }).reason, 'invalid', 'chave nova malformada');
  assert.strictEqual(r.keypass(id).used, 3);
});

test('Keypass: pedidos simultâneos ou repetidos não rendem mais chaves do que o limite', t => {
  const { r, id, main, state, clock } = setup(t);
  // 20 pedidos válidos "ao mesmo tempo" (mesma geração, chaves novas diferentes): só o primeiro passa
  const tries = Array.from({ length: 20 }, () => {
    const next = kp(),
      data = payload.rotateRecovery(id, 1, next.pk);
    return { next, args: { id, expectedRgen: 1, newRpk: next.pk, sigRec: sign(state.rec.priv, data), sigOld: sign(main.priv, data) } };
  });
  const outs = tries.map(x => r.rotateRecovery(x.args));
  assert.strictEqual(outs.filter(o => o.ok).length, 1, 'uma única troca vale');
  assert.ok(outs.slice(1).every(o => o.reason === 'stale'), 'as outras encontram a geração nova');
  assert.strictEqual(r.keypass(id).used, 1);
  assert.strictEqual(r.get(id).rpk, tries[0].next.pk, 'só uma chave ficou válida');
  // o mesmo pedido repetido 50 vezes: idempotente, sem gastar
  for (let i = 0; i < 50; i++) assert.strictEqual(r.rotateRecovery(tries[0].args).idempotent, true);
  assert.strictEqual(r.keypass(id).used, 1);
  // adiantar o relógio do cliente não adianta: quem conta o mês é o servidor
  clock.t += MONTH - 1000;
  const next = kp(),
    data = payload.rotateRecovery(id, 2, next.pk);
  assert.strictEqual(
    r.rotateRecovery({ id, expectedRgen: 2, newRpk: next.pk, sigRec: sign(tries[0].next.priv, data), sigOld: sign(main.priv, data) }).reason,
    'keypass-wait'
  );
});

test('Keypass: falha ao gravar não gasta a oportunidade nem deixa o jogador sem chave (ou com duas)', t => {
  let fail = false;
  const { r, id, state, renew } = setup(t, {
    writeFile: (file, obj, opts) => {
      if (fail) throw new Error('disco cheio');
      writeJsonAtomic(file, obj, opts);
    },
    onError: () => {}
  });
  const before = r.get(id);
  fail = true;
  const x = renew();
  assert.deepStrictEqual(x.out, { ok: false, reason: 'io' });
  assert.deepStrictEqual(r.get(id), before, 'o registro voltou inteiro: chave antiga, geração e época');
  assert.strictEqual(r.keypass(id).used, 0, 'a oportunidade não foi gasta');
  const auth = payload.auth(id, 'n', 'recover');
  assert.strictEqual(r.verifyRecovery(id, auth, sign(state.rec.priv, auth)), true, 'a chave anterior continua valendo');
  assert.strictEqual(r.verifyRecovery(id, auth, sign(x.next.priv, auth)), false, 'a nova, que não foi gravada, não vale');
  fail = false;
  assert.strictEqual(renew().out.ok, true, 'com o disco de volta, a renovação funciona');
  assert.strictEqual(r.keypass(id).used, 1);
});

test('Keypass: o disco guarda só chaves PÚBLICAS, a contagem e as datas; recarregar mantém o limite', t => {
  const { file, r, id, state, clock, renew } = setup(t);
  const privs = [state.rec.priv];
  for (let i = 0; i < 2; i++) {
    privs.push(renew().next.priv);
    clock.t += MONTH;
  }
  const raw = fs.readFileSync(file, 'utf8'),
    obj = JSON.parse(raw);
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepStrictEqual(Object.keys(obj.ids[id].kp).sort(), ['at', 'log', 'n'], 'Keypass no disco: só contagem e datas');
  assert.strictEqual(obj.ids[id].kp.n, 2);
  for (const p of privs) {
    const der = p.export({ format: 'der', type: 'pkcs8' }).toString('base64url'),
      d = p.export({ format: 'jwk' }).d;
    assert.ok(!raw.includes(der) && !raw.includes(d), 'nenhuma chave privada (nem a atual nem as antigas) no arquivo');
  }
  // a chave pública guardada é P-256 de verdade: 256 bits sorteados pelo sistema, impossível de adivinhar na prática
  const pub = crypto.createPublicKey({ key: Buffer.from(obj.ids[id].rpk, 'base64url'), format: 'der', type: 'spki' });
  assert.strictEqual(pub.asymmetricKeyDetails.namedCurve, 'prime256v1');
  assert.strictEqual(new Set(privs.map(p => p.export({ format: 'jwk' }).d)).size, privs.length, 'cada renovação tem uma chave diferente');
  if (fs.existsSync(file + '.bak')) assert.ok(!privs.some(p => fs.readFileSync(file + '.bak', 'utf8').includes(p.export({ format: 'jwk' }).d)));

  // reiniciar o servidor não zera o Keypass
  const again = createIdentityRegistry({ file, now: () => clock.t });
  assert.strictEqual(again.keypass(id).used, 2);
  assert.strictEqual(again.keypass(id).left, 1);
  assert.strictEqual(again.get(id).rpk, r.get(id).rpk);

  // arquivo adulterado (contagem negativa para ganhar renovações): o registro inteiro é recusado, falha fechada
  obj.ids[id].kp.n = -5;
  fs.writeFileSync(file, JSON.stringify(obj));
  fs.rmSync(file + '.bak', { force: true });
  const bad = createIdentityRegistry({ file, now: () => clock.t });
  assert.strictEqual(bad.get(id), null);
  assert.strictEqual(bad.rotateRecovery({ id, expectedRgen: 3, newRpk: kp().pk, sigRec: 'a', sigOld: 'b' }).reason, 'corrupt');
});

test('Keypass: o administrador libera UMA renovação por vez (a quarta em diante), sem tocar em chave nenhuma', t => {
  const { r, id, clock, renew } = setup(t);
  assert.deepStrictEqual(r.keypassGrant(id), { ok: false, reason: 'not-needed' }, 'quem ainda pode renovar sozinho não precisa do administrador');
  assert.strictEqual(r.keypassGrant(newId()).reason, 'notfound');
  for (let i = 0; i < 3; i++) {
    renew();
    clock.t += MONTH;
  }
  assert.strictEqual(renew().out.reason, 'keypass-limit');
  const rpk = r.get(id).rpk;
  const g = r.keypassGrant(id);
  assert.strictEqual(g.ok, true);
  assert.deepStrictEqual({ left: g.keypass.left, next: g.keypass.next }, { left: 1, next: 0 });
  assert.strictEqual(r.get(id).rpk, rpk, 'liberar não troca a chave: quem renova é o jogador, com o código atual dele');
  assert.strictEqual(r.get(id).kp.adm, 1, 'a liberação fica registrada');
  assert.strictEqual(renew().out.ok, true, 'a quarta renovação, liberada');
  assert.strictEqual(renew().out.reason, 'keypass-limit', 'e acabou de novo: cada liberação vale uma renovação');
  assert.strictEqual(r.keypassGrant(id).ok, true);
  assert.strictEqual(r.keypassGrant(id).reason, 'not-needed', 'liberar duas vezes seguidas não acumula');
  assert.strictEqual(r.keypass(id).left, 1);
});

test('Keypass: o administrador também pode tirar a espera do mês de quem ainda tem renovações', t => {
  const { r, id, renew } = setup(t);
  renew();
  assert.strictEqual(renew().out.reason, 'keypass-wait');
  const g = r.keypassGrant(id);
  assert.strictEqual(g.ok, true);
  assert.deepStrictEqual({ used: g.keypass.used, left: g.keypass.left, next: g.keypass.next }, { used: 1, left: 2, next: 0 });
  assert.strictEqual(renew().out.ok, true);
  assert.strictEqual(r.keypass(id).used, 2, 'tirar a espera não devolve oportunidade');
});

test('Keypass: a recuperação da conta (aparelho perdido) continua funcionando e não gasta renovação', t => {
  const { r, id, state, clock, renew } = setup(t);
  for (let i = 0; i < 3; i++) {
    renew();
    clock.t += MONTH;
  }
  const np = kp(),
    nr = kp(),
    gen = r.get(id).gen;
  const out = r.recoverPrimary({ id, expectedGen: gen, newPk: np.pk, newRpk: nr.pk, sigRec: sign(state.rec.priv, payload.recover(id, gen, np.pk, nr.pk)), graceMs: 0 });
  assert.strictEqual(out.ok, true, 'sem renovações sobrando, quem perdeu o aparelho ainda recupera a conta com o código');
  assert.strictEqual(r.get(id).rpk, nr.pk, 'o código usado na recuperação vale uma vez só');
  assert.strictEqual(r.keypass(id).used, 3, 'recuperar a conta não é uma renovação do Keypass');
});
