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
  assert.ok(ci.includes('ASSETS=(launcher/build/skyke3d-launcher.jar launcher/build/skyke3d-launcher.jar.sha256)'), 'o Release leva o .jar e o SHA-256');
  assert.strictEqual((ci.match(/gh release create "\$TAG" "\$\{ASSETS\[@\]\}"/g) || []).length, 2);
  // pacotes instaláveis: Windows (.exe pelo NSIS), Debian/Ubuntu (.deb) e qualquer Linux (.tar.gz com install.sh), com o mesmo .jar
  for (const f of ['skyke3d-launcher-setup.exe', 'skyke3d-launcher.deb', 'skyke3d-launcher-linux.tar.gz', 'SHA256SUMS.txt']) {
    assert.ok(build.includes(f), 'o build gera ' + f);
    assert.ok(ci.includes(f), 'o Release anexa ' + f);
  }
  const pk = f => fs.readFileSync(path.join(__dirname, '..', 'launcher', 'packaging', f), 'utf8');
  const nsi = pk('windows/installer.nsi');
  assert.match(nsi, /RequestExecutionLevel user/, 'instala sem pedir administrador');
  assert.match(nsi, /WriteUninstaller/, 'tem desinstalador');
  assert.match(nsi, /CreateShortcut "\$DESKTOP\\Skyke3D\.lnk"/, 'atalho na área de trabalho');
  // o atalho abre o Skyke3D.exe (programa em C, compilado com o MinGW-w64), não mais o cmd.exe com um .cmd
  assert.match(nsi, /ExecWait '"\$INSTDIR\\Skyke3D\.exe" \/skyke3d-java-check' \$0/, 'avisa quando não há Java (a busca é a do .exe)');
  assert.match(nsi, /CreateShortcut "\$DESKTOP\\Skyke3D\.lnk" "\$INSTDIR\\Skyke3D\.exe"/);
  assert.ok(!nsi.split('\n').some(l => /^\s*(CreateShortcut|Exec)/.test(l) && /cmd\.exe/.test(l)), 'nenhum atalho passa pelo cmd.exe');
  assert.match(nsi, /Delete "\$INSTDIR\\Skyke3D\.cmd"/, 'quem atualiza perde o .cmd antigo');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'launcher', 'packaging', 'windows', 'Skyke3D.cmd')));
  const exe = pk('windows/skyke3d.c');
  assert.match(exe, /L"\\"%ls\\" -jar \\"%ls\\"%ls%ls"/, 'abre javaw -jar skyke3d-launcher.jar com os argumentos');
  for (const w of ['JAVA_HOME', 'SearchPathW(NULL, L"javaw.exe"', 'SOFTWARE\\\\JavaSoft\\\\%ls', 'L"Eclipse Adoptium"'])
    assert.ok(exe.includes(w), 'procura o Java em: ' + w);
  assert.match(exe, /\/skyke3d-java-check"\)\) return findJava\(java, MAX_PATH\) \? 0 : 2;/);
  assert.match(pk('windows/skyke3d.rc'), /1 ICON "skyke3d\.ico"/);
  assert.match(pk('windows/skyke3d.manifest'), /level="asInvoker"/, 'não pede administrador');
  // assinatura: só com certificado; o makensis assina o desinstalador e o instalador antes do SHA256SUMS
  const sign = pk('windows/sign.sh');
  assert.match(sign, /if \[ -z "\$\{SIGN_STORETYPE:-\}" \]; then[\s\S]*?exit 0/, 'sem certificado não faz nada');
  assert.match(sign, /JSIGN_SHA256=[0-9a-f]{64}/, 'jsign com SHA-256 fixo');
  assert.match(sign, /--tsmode RFC3161/, 'com carimbo de tempo');
  assert.match(nsi, /!uninstfinalize '"\$\{SIGNCMD\}" "%1"' = 0/);
  assert.match(nsi, /!finalize '"\$\{SIGNCMD\}" "%1"' = 0/);
  assert.ok(build.indexOf('packaging/windows/sign.sh "$WIN/Skyke3D.exe"') > 0 && build.indexOf('-DSIGNCMD=') < build.indexOf('SHA256SUMS.txt'));
  assert.match(ci, /SIGN_STORETYPE: \$\{\{ secrets\.SIGN_STORETYPE \}\}/);
  assert.match(ci, /gcc-mingw-w64-x86-64/);
  assert.match(pk('linux/install.sh'), /--remover/, 'o instalador do Linux também desinstala');
  assert.match(pk('linux/skyke3d-launcher.desktop'), /^Exec=skyke3d-launcher %u$/m);
  assert.match(pk('linux/skyke3d-launcher'), /exec "\$JAVA" -jar "\$JAR" "\$@"/);
  assert.ok(fs.statSync(path.join(__dirname, '..', 'launcher', 'packaging', 'windows', 'skyke3d.ico')).size > 1000, 'ícone do instalador');
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
