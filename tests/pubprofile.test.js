'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPubProfiles, pidOf, cleanBio, cleanFields, cleanCfgOut, PID_RE } = require('../lib/pubprofile.js');

const conn = (name = 'Ana', cfg = { skin: 1, hs: 2, hat: 1 }) => ({ me: { name, cfg } });
const F = (o = {}) => ({ bio: '', like: '', mood: '', world: '', ...o });
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'skyke-prof-')), 'profiles.json');

test('pidOf: estável, opaco e sem revelar o id de identidade', () => {
  const id = 'a'.repeat(20);
  assert.strictEqual(pidOf(id), pidOf(id));
  assert.notStrictEqual(pidOf(id), pidOf('b'.repeat(20)));
  assert.match(pidOf(id), PID_RE);
  assert.ok(!pidOf(id).includes(id.slice(0, 6)));
});

test('cleanBio: sem marcação, sem controle e com limite', () => {
  assert.strictEqual(cleanBio('x'.repeat(500)).length, 300);
  assert.strictEqual(cleanBio(null), '');
  assert.ok(!/[<>&"'`\u0000-\u001f\u200b]/.test(cleanBio('a\u200bb<script>`\'"&')));
  assert.strictEqual(cleanBio('  oi\n\n  tudo   bem  '), 'oi tudo bem');
});

test('cleanFields: limites por campo, mundo do catálogo e links recusados', () => {
  const r = cleanFields({ bio: 'a'.repeat(400), like: 'b'.repeat(200), mood: 'c'.repeat(200), world: 'kepler' });
  assert.deepStrictEqual([r.bio.length, r.like.length, r.mood.length, r.world], [300, 80, 60, 'kepler']);
  assert.strictEqual(cleanFields({ world: 'mundo-que-nao-existe' }).world, '');
  assert.strictEqual(cleanFields({ bio: 'veja https://golpe.com' }).reason, 'link');
  assert.strictEqual(cleanFields({ like: 'meu site ab . com' }).reason, 'link');
  assert.strictEqual(cleanFields({ mood: 'discord.gg/x' }).reason, 'link');
  assert.strictEqual(cleanFields(null).ok, true);
  assert.strictEqual(cleanFields({ bio: 'oi' }, s => s.toUpperCase()).bio, 'OI', 'aplica o filtro de palavrões');
});

test('cleanCfgOut: só inteiros dentro da faixa do catálogo', () => {
  const o = cleanCfgOut({ skin: 3, hs: 999, hat: -1, eye: 'x', evil: 1, fc: 2.5, br: 1 });
  assert.deepStrictEqual(o, { skin: 3, br: 1 });
  assert.deepStrictEqual(cleanCfgOut(null), {});
});

test('perfil ao vivo usa o nome e a aparência atuais da conexão', () => {
  const P = createPubProfiles();
  const c = conn('Ana');
  const pid = pidOf('x'.repeat(20));
  assert.strictEqual(P.publish(pid, c, F({ bio: 'Olá!', like: 'música', mood: 'feliz', world: 'kepler' })), true);
  const g = P.get(pid);
  assert.deepStrictEqual([g.name, g.bio, g.like, g.mood, g.world, g.online], ['Ana', 'Olá!', 'música', 'feliz', 'Kepler', true]);
  c.me.name = 'Ana B';
  assert.strictEqual(P.get(pid).name, 'Ana B');
});

test('desligar o perfil apaga tudo na hora', () => {
  const P = createPubProfiles();
  const pid = pidOf('y'.repeat(20));
  P.publish(pid, conn(), F({ bio: 'oi' }));
  P.withdraw(pid);
  assert.strictEqual(P.get(pid), null);
  assert.strictEqual(P.fieldsOf(pid), null);
});

test('depois que o dono sai, o perfil continua (offline) e guarda o nome e a aparência de então', () => {
  let t = 1000;
  const P = createPubProfiles({ now: () => t });
  const pid = pidOf('z'.repeat(20)),
    c = conn('Bia');
  P.publish(pid, c, F({ bio: 'oi' }));
  t += 5000;
  P.leave(pid, c, { name: 'Bia 2', cfg: { skin: 3 } });
  t += 3 * 86400000;
  const g = P.get(pid);
  assert.strictEqual(g.online, false);
  assert.strictEqual(g.name, 'Bia 2');
  assert.strictEqual(g.bio, 'oi');
  assert.strictEqual(g.seenAt, 6000);
});

test('perfil parado há mais de 180 dias é apagado; quem volta renova o prazo', () => {
  let t = 0;
  const P = createPubProfiles({ now: () => t });
  const a = pidOf('1'),
    b = pidOf('2'),
    ca = conn('A'),
    cb = conn('B');
  P.publish(a, ca, F());
  P.publish(b, cb, F());
  P.leave(a, ca, { name: 'A', cfg: {} });
  P.leave(b, cb, { name: 'B', cfg: {} });
  t = 100 * 86400000;
  P.publish(b, conn('B'), F()); // B volta
  t = 200 * 86400000;
  P.sweep();
  assert.strictEqual(P.get(a), null, 'A sumiu (200 dias parado)');
  assert.ok(P.get(b), 'B ficou (voltou aos 100 dias)');
});

test('duas abas: o perfil continua online até a última sair', () => {
  const P = createPubProfiles();
  const pid = pidOf('w'.repeat(20)),
    a = conn('Cris'),
    b = conn('Cris');
  P.publish(pid, a, F());
  P.publish(pid, b, F());
  P.leave(pid, a, { name: 'Cris', cfg: {} });
  assert.strictEqual(P.get(pid).online, true);
  P.leave(pid, b, { name: 'Cris', cfg: {} });
  assert.strictEqual(P.get(pid).online, false);
});

test('persistência: grava no arquivo, volta depois de reiniciar e desligar apaga do arquivo', () => {
  const file = tmp();
  const P = createPubProfiles({ file, delayMs: 1 });
  const pid = pidOf('p'.repeat(20)),
    c = conn('Dani', { skin: 2, hs: 3 });
  P.publish(pid, c, F({ bio: 'Gosto de explorar', like: 'doces', mood: 'curiosa', world: 'nyx' }));
  P.leave(pid, c, { name: 'Dani', cfg: { skin: 2, hs: 3 } });
  P.flush();
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(raw.v, 1);
  assert.deepStrictEqual(Object.keys(raw.p[pid]).sort(), ['at', 'b', 'c', 'l', 'm', 'n', 'w']);
  assert.ok(!JSON.stringify(raw).includes('x'.repeat(20)), 'só o código público, nunca o id de identidade');
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);

  const Q = createPubProfiles({ file });
  const g = Q.get(pid);
  assert.deepStrictEqual([g.name, g.bio, g.like, g.mood, g.world, g.online], ['Dani', 'Gosto de explorar', 'doces', 'curiosa', 'Nyx', false]);
  Q.withdraw(pid);
  Q.flush();
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).p, {});
});

test('persistência: arquivo corrompido ou com lixo não derruba nem entra nos perfis', () => {
  const file = tmp();
  fs.writeFileSync(file, '{ não é json');
  const warns = [];
  assert.doesNotThrow(() => createPubProfiles({ file, warn: m => warns.push(m) }));
  assert.ok(warns.length === 1 && fs.existsSync(file + '.bak'));
  const ok = pidOf('ok');
  fs.writeFileSync(
    file,
    JSON.stringify({
      v: 1,
      p: {
        [ok]: { n: 'Eva<script>', c: { skin: 999, hs: 2 }, b: 'x'.repeat(900), l: '', m: '', w: 'nao-existe', at: Date.now() },
        '../../etc': { n: 'x', c: {}, b: '', l: '', m: '', w: '', at: Date.now() },
        [pidOf('velho')]: { n: 'Velho', c: {}, b: '', l: '', m: '', w: '', at: 1 }
      }
    })
  );
  const P = createPubProfiles({ file });
  assert.strictEqual(P.stats().total, 1, 'só o válido e recente');
  const g = P.get(ok);
  assert.strictEqual(g.name, 'Evascript');
  assert.strictEqual(g.bio.length, 300);
  assert.strictEqual(g.world, '');
  assert.strictEqual(g.cfg.skin, undefined, 'índice fora da faixa é descartado');
  assert.strictEqual(g.cfg.hs, 2);
  assert.strictEqual(g.cfg.evil, undefined);
});

test('curtidas e recados são temporários: somem 24 h depois que o dono sai, o perfil fica', () => {
  let t = 0;
  const P = createPubProfiles({ now: () => t });
  const dono = pidOf('d'.repeat(20)),
    c = conn('Dona');
  P.publish(dono, c, F());
  assert.strictEqual(P.like(dono, pidOf('v1')).count, 1);
  assert.strictEqual(P.post(dono, pidOf('v1'), 'Beto', 'oi').ok, true);
  P.leave(dono, c, { name: 'Dona', cfg: {} });
  t = 23 * 3600000;
  P.sweep();
  assert.strictEqual(P.get(dono).likes, 1);
  t = 25 * 3600000;
  P.sweep();
  const g = P.get(dono);
  assert.ok(g, 'o perfil continua');
  assert.deepStrictEqual([g.likes, g.book.length], [0, 0]);
});

test('curtidas: uma por pessoa, não curte a si mesmo e valem mesmo com o dono offline', () => {
  const P = createPubProfiles();
  const dono = pidOf('d'.repeat(20)),
    v1 = pidOf('v1'),
    v2 = pidOf('v2'),
    c = conn('Dona');
  P.publish(dono, c, F());
  assert.deepStrictEqual(P.like(dono, dono), { ok: false, reason: 'self' });
  assert.strictEqual(P.like(v1, dono).reason, 'notfound');
  assert.strictEqual(P.like(dono, v1).count, 1);
  assert.strictEqual(P.like(dono, v1).dup, true);
  P.leave(dono, c, { name: 'Dona', cfg: {} });
  assert.strictEqual(P.like(dono, v2).count, 2, 'dono offline também recebe');
  assert.strictEqual(P.like('nao-e-id', v1).reason, 'invalid');
  P.withdraw(dono);
  P.publish(dono, conn('Dona'), F());
  assert.strictEqual(P.get(dono).likes, 0);
});

test('livro de visitas: texto curto, sem link, limite por autor e o dono apaga', () => {
  const P = createPubProfiles();
  const dono = pidOf('d'.repeat(20)),
    v1 = pidOf('v1'),
    v2 = pidOf('v2');
  P.publish(dono, conn('Dona'), F());
  assert.strictEqual(P.post(dono, dono, 'Dona', 'oi').reason, 'self');
  assert.strictEqual(P.post(v1, dono, 'X', 'oi').reason, 'notfound');
  assert.strictEqual(P.post(dono, v1, 'Beto', '   ').reason, 'empty');
  for (const t of ['veja https://x.io', 'entra em www.site.com', 'discord.gg/abc', 'meu site: ab . com', 'x.com.br/y', '//evil'])
    assert.strictEqual(P.post(dono, v1, 'Beto', t).reason, 'link', t);
  for (const t of ['Gostei do seu perfil!', 'segundo', 'terceiro']) assert.strictEqual(P.post(dono, v1, 'Beto', t).ok, true);
  assert.strictEqual(P.post(dono, v1, 'Beto', 'quarto').reason, 'limit', '3 por autor');
  assert.strictEqual(P.post(dono, v2, 'Cris', '<b>oi</b>').ok, true);
  const b = P.get(dono).book;
  assert.strictEqual(b[0].text, 'boi/b');
  assert.deepStrictEqual(Object.keys(b[0]).sort(), ['at', 'name', 'text']);
  const l = P.listBook(dono);
  assert.strictEqual(l.length, 4);
  assert.strictEqual(P.removeNote(dono, l[0].id), true);
  assert.strictEqual(P.listBook(dono).length, 3);
});

test('livro de visitas: o teto de recados descarta os mais antigos', () => {
  const P = createPubProfiles();
  const dono = pidOf('d'.repeat(20));
  P.publish(dono, conn(), F());
  for (let i = 0; i < 30; i++) P.post(dono, pidOf('a' + i), 'N' + i, 'msg ' + i);
  const b = P.get(dono).book;
  assert.strictEqual(b.length, 20);
  assert.strictEqual(b[0].text, 'msg 29');
  assert.strictEqual(b[19].text, 'msg 10');
});

test('id inválido é recusado; no teto de perfis sai o mais parado e nunca quem está online', () => {
  let t = 0;
  const P = createPubProfiles({ max: 2, now: () => t });
  assert.strictEqual(P.publish('../etc', conn(), F()), false);
  assert.strictEqual(P.get('nao-e-id'), null);
  const a = conn('A'),
    b = conn('B');
  assert.strictEqual(P.publish(pidOf('1'), a, F()), true);
  t = 10;
  assert.strictEqual(P.publish(pidOf('2'), b, F()), true);
  assert.strictEqual(P.publish(pidOf('3'), conn('C'), F()), false, 'todos online: recusa');
  P.leave(pidOf('1'), a, { name: 'A', cfg: {} });
  assert.strictEqual(P.publish(pidOf('3'), conn('C'), F()), true, 'tira o offline');
  assert.strictEqual(P.get(pidOf('1')), null);
  assert.ok(P.get(pidOf('2')));
});
