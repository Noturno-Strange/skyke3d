'use strict';
// /launcher.json: o que o servidor aceita de launcher (versão mínima e, se configurado, só os .jar oficiais).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./harness.js');

const VERSION = fs.readFileSync(path.join(__dirname, '..', 'launcher', 'VERSION'), 'utf8').trim();

test('launcher: versão própria em launcher/VERSION (x.y.z), separada da versão do jogo', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  const build = fs.readFileSync(path.join(__dirname, '..', 'launcher', 'build.sh'), 'utf8');
  assert.ok(build.includes('< VERSION'), 'o build lê launcher/VERSION');
  assert.ok(build.includes('skyke3d-launcher.jar.sha256'), 'o build gera o SHA-256 para o Release');
  const ci = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
  assert.strictEqual((ci.match(/launcher\/build\/skyke3d-launcher\.jar launcher\/build\/skyke3d-launcher\.jar\.sha256/g) || []).length, 2);
  // o link de download do launcher é fixo no código (nunca vem do servidor, que pode ser de terceiros)
  const pol = fs.readFileSync(path.join(__dirname, '..', 'launcher', 'src', 'skyke3d', 'launcher', 'LauncherPolicy.java'), 'utf8');
  assert.match(pol, /OFFICIAL_PAGE = "https:\/\/github\.com\/Noturno-Strange\/skyke3d\/releases\/latest"/);
  assert.ok(!/str\(json, "download"\)/.test(pol), 'o launcher não usa o download que o servidor manda');
});

test('servidor: /launcher.json com a versão mínima padrão (a atual) e sem lista de .jar', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const r = await H.request(srv.port, '/launcher.json');
  assert.strictEqual(r.status, 200);
  const j = JSON.parse(r.body);
  assert.deepStrictEqual({ v: j.v, latest: j.latest, min: j.min }, { v: 1, latest: VERSION, min: VERSION });
  assert.strictEqual(j.sha256, undefined);
  assert.match(j.download, /^https:\/\/github\.com\/Noturno-Strange\/skyke3d\/releases\/latest\/download\/skyke3d-launcher\.jar$/);
});

test('servidor: LAUNCHER_MIN e LAUNCHER_SHA256 (valores inválidos são ignorados)', { skip: H.missing() }, async t => {
  const a = 'a'.repeat(64),
    B = 'B'.repeat(64);
  const srv = await H.startServer({ LAUNCHER_MIN: '1.0.5', LAUNCHER_SHA256: a + ', ' + B + ',lixo' });
  t.after(() => srv.stop());
  const j = JSON.parse((await H.request(srv.port, '/launcher.json')).body);
  assert.strictEqual(j.min, '1.0.5');
  assert.deepStrictEqual(j.sha256, [a, B.toLowerCase()]);
});
