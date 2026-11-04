'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createPubProfiles, pidOf, cleanBio, look, PID_RE } = require('../lib/pubprofile.js');

const conn = (name = 'Ana', cfg = { skin: 1, hs: 2, hat: 1 }) => ({ me: { name, cfg } });

test('pidOf: estável, opaco e sem revelar o id de identidade', () => {
  const id = 'a'.repeat(20);
  assert.strictEqual(pidOf(id), pidOf(id));
  assert.notStrictEqual(pidOf(id), pidOf('b'.repeat(20)));
  assert.match(pidOf(id), PID_RE);
  assert.ok(!pidOf(id).includes(id.slice(0, 6)));
});

test('cleanBio: sem marcação, sem controle e com limite', () => {
  assert.strictEqual(cleanBio('  oi <b>mundo</b> & "tchau"\n\n\tfim '), 'oi bmundo/b  tchau fim'.replace('  ', ' '));
  assert.strictEqual(cleanBio('x'.repeat(500)).length, 140);
  assert.strictEqual(cleanBio(null), '');
  assert.ok(!/[<>&"'`\u0000-\u001f\u200b]/.test(cleanBio('a\u200bb<script>`\'"&')));
});

test('look: índices fora da faixa caem no primeiro item e nada quebra', () => {
  const l = look({ skin: 999, hair: -1, hs: 'x', hat: 1 });
  assert.match(l.skin, /^#[0-9a-f]{6}$/i);
  assert.strictEqual(l.hat, 'Gorro');
  assert.ok(typeof look(null).hairStyle === 'string');
});

test('perfil ao vivo usa o nome e a aparência atuais da conexão', () => {
  const P = createPubProfiles();
  const c = conn('Ana');
  const pid = pidOf('x'.repeat(20));
  assert.strictEqual(P.publish(pid, c, ' Olá! '), true);
  assert.deepStrictEqual(
    [P.get(pid).name, P.get(pid).bio, P.get(pid).online],
    ['Ana', 'Olá!', true]
  );
  c.me.name = 'Ana B';
  assert.strictEqual(P.get(pid).name, 'Ana B');
});

test('desligar o perfil apaga tudo na hora', () => {
  const P = createPubProfiles();
  const pid = pidOf('y'.repeat(20)),
    c = conn();
  P.publish(pid, c, 'oi');
  P.withdraw(pid);
  assert.strictEqual(P.get(pid), null);
});

test('ao sair, fica um instantâneo offline que vence pelo tempo', () => {
  let t = 1000;
  const P = createPubProfiles({ ttlMs: 5000, now: () => t });
  const pid = pidOf('z'.repeat(20)),
    c = conn('Bia');
  P.publish(pid, c, 'oi');
  P.leave(pid, c, { name: 'Bia', cfg: c.me.cfg });
  const g = P.get(pid);
  assert.strictEqual(g.online, false);
  assert.strictEqual(g.seenAt, 1000);
  t += 5001;
  assert.strictEqual(P.get(pid), null);
  assert.strictEqual(P.stats().total, 0);
});

test('duas abas: o perfil continua online até a última sair', () => {
  const P = createPubProfiles();
  const pid = pidOf('w'.repeat(20)),
    a = conn('Cris'),
    b = conn('Cris');
  P.publish(pid, a, '');
  P.publish(pid, b, '');
  P.leave(pid, a, { name: 'Cris', cfg: {} });
  assert.strictEqual(P.get(pid).online, true);
  P.leave(pid, b, { name: 'Cris', cfg: {} });
  assert.strictEqual(P.get(pid).online, false);
});

test('curtidas: uma por pessoa, não curte a si mesmo e morre com o perfil', () => {
  const P = createPubProfiles();
  const dono = pidOf('d'.repeat(20)),
    v1 = pidOf('v1'),
    v2 = pidOf('v2');
  P.publish(dono, conn('Dona'), '');
  assert.deepStrictEqual(P.like(dono, dono), { ok: false, reason: 'self' });
  assert.strictEqual(P.like(v1, dono).reason, 'notfound', 'curtir um perfil que não existe falha');
  assert.strictEqual(P.like(dono, v1).count, 1);
  assert.strictEqual(P.like(dono, v1).dup, true, 'repetir não soma');
  assert.strictEqual(P.like(dono, v2).count, 2);
  assert.strictEqual(P.get(dono).likes, 2);
  assert.strictEqual(P.like('nao-e-id', v1).reason, 'invalid');
  P.withdraw(dono);
  P.publish(dono, conn('Dona'), '');
  assert.strictEqual(P.get(dono).likes, 0, 'desligar e ligar zera: não é registro permanente');
});

test('id inválido é recusado; teto de memória preserva perfis ao vivo', () => {
  const P = createPubProfiles({ max: 2 });
  assert.strictEqual(P.publish('../etc', conn(), ''), false);
  assert.strictEqual(P.get('nao-e-id'), null);
  const a = conn('A'),
    b = conn('B');
  assert.strictEqual(P.publish(pidOf('1'), a, ''), true);
  assert.strictEqual(P.publish(pidOf('2'), b, ''), true);
  assert.strictEqual(P.publish(pidOf('3'), conn('C'), ''), false, 'cheio de perfis ao vivo: recusa');
  P.leave(pidOf('1'), a, { name: 'A', cfg: {} });
  assert.strictEqual(P.publish(pidOf('3'), conn('C'), ''), true, 'abre espaço tirando o offline mais antigo');
  assert.strictEqual(P.get(pidOf('1')), null);
});
