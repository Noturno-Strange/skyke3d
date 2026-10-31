'use strict';

// Perfil (botão 👤 da barra): código e link ficam mascarados até clicar no olho, e a tela inicial tem as ações compactas.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html'), css = read('assets/app.css'), surv = read('assets/app-surv.js'), ui = read('assets/app-ui.js');

test('perfil: botão na barra, janela com foto, nome, código e link mascarados com olho e cópia', () => {
  assert.match(html, /<button id="bPerf"[^>]*>👤<\/button>/);
  assert.match(html, /id="pFace"|id="pfFace"/);
  for (const id of ['pfName', 'pfRec', 'pfRecEye', 'pfRecCp', 'pfLink', 'pfLinkEye', 'pfLinkCp', 'pfMake', 'pfOpen', 'pfNew', 'pfDel'])
    assert.match(html, new RegExp('id="' + id + '"'), id);
  for (const id of ['pfRec', 'pfLink']) assert.match(html, new RegExp('<input id="' + id + '" readonly value="\\*{12}"'), id + ' nasce mascarado e só de leitura');
  for (const id of ['pfRecEye', 'pfLinkEye']) assert.match(html, new RegExp('id="' + id + '"[^>]*aria-pressed="false"'), id + ' acessível');
  assert.ok(html.indexOf('id="pPerf"') < html.indexOf('id="pSet"'));
});

test('perfil: volta a mascarar ao fechar, copia sem expor e não deixa o rosto sem fallback', () => {
  assert.match(surv, /MASK='\*{12}'/);
  assert.match(surv, /classList\.contains\('hide'\)\)hideAll\(\)/, 'fechar a janela oculta de novo');
  assert.match(surv, /pfRecCp'\)\.onclick=async\(\)=>note\(await PST\.copy\(recText\(\)\)/, 'copiar o código usa o texto real mesmo oculto');
  assert.match(surv, /catch\(e\)\{x\.font=/, 'sem WebGL no segundo desenhista, usa um emoji');
  assert.match(surv, /forceContextLoss/, 'o contexto extra é liberado');
  for (const f of ['pPerf']) assert.ok(ui.includes("'" + f + "'"), 'janela arrastável e com ✖: ' + f);
  assert.match(css, /\.pfhead canvas\{position:static/, 'o canvas da foto não herda o estilo da cena inteira');
});

test('tela inicial: ações compactas (duas linhas), Sobrevivência avermelhado e sempre à vista', () => {
  const acts = html.match(/<div class="sec acts">[\s\S]*?<small id="serr"/)[0];
  assert.strictEqual((acts.match(/class="actrow"/g) || []).length, 2, 'duas linhas');
  for (const id of ['go', 'goSv', 'code', 'join', 'bn']) assert.match(acts, new RegExp('id="' + id + '"'), id);
  assert.match(acts, /id="goSv"/); assert.match(acts, /class="big sv" id="goSv"/);
  assert.ok(!/<div class="st">(Criar sala|Entrar com código)<\/div>/.test(acts), 'títulos repetidos saíram');
  assert.match(css, /button\.sv\{background:linear-gradient\(135deg,var\(--sv1\),var\(--sv2\)\)/);
  assert.match(css, /--sv1:#e2553f;--sv2:#b12a1d/);
  assert.match(css, /\.acts\{[^}]*position:sticky;bottom:-24px/, 'ações coladas no fim do painel');
  assert.match(css, /:root\[data-hc=on\] button\.sv\{/, 'alto contraste');
  assert.ok(!/Minhas estatísticas<\/summary>/.test(surv), 'o bloco de estatísticas saiu da tela inicial (vive no Perfil)');
});

test('código de recuperação: nunca sai do navegador (nem em rede, nem em link, nem no servidor) e se oculta sozinho', () => {
  const net = read('assets/app-net.js'), srvSrc = read('server.js'), valid = read('validate.js');
  // só o navegador monta e lê o código; o servidor nem importa essas funções
  assert.ok(!/SKYREC\.(encode|decode)/.test(srvSrc + valid), 'o servidor nunca codifica nem decodifica códigos de recuperação');
  for (const f of ['assets/app-net.js', 'assets/app-surv.js']) {
    const code = read(f);
    for (const m of code.matchAll(/(fetch|send|XMLHttpRequest|sendBeacon|WebSocket)\s*\(([^)]*)\)/g)) assert.ok(!/recText|SKYREC\.encode|\.recout|pfRec/.test(m[2]), f + ': ' + m[0] + ' envia o código de recuperação');
  }
  assert.ok(!/localStorage\.setItem\([^)]*recText/.test(surv + net), 'o código não é guardado em lugar nenhum');
  assert.match(surv, /setTimeout\(\(\)=>\{showRec=false;[^}]*\},30000\)/, 'oculta de novo em 30 s');
  assert.match(surv, /visibilitychange',\(\)=>\{if\(document\.hidden&&showRec\)/, 'oculta quando a aba some');
  assert.match(html, /secreto: quem tiver copia seu nome e visual/);
});

test('uma página pública só: ranking e perfil na mesma página, sem arquivo separado do jogador', () => {
  const pg = read('estatisticas.html');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'jogador.html')), 'jogador.html foi unido a estatisticas.html');
  for (const id of ['rk', 'prof', 'pnm', 'pal', 'pcl', 'plt']) assert.match(pg, new RegExp('id="' + id + '"'), id);
  assert.match(pg, /location\.pathname\.match\(\/\^\\\/jogador/);
  assert.ok(!/nenhum nome, endereço ou jogador aparece/.test(pg), 'o texto antigo (sem nomes) saiu');
  assert.ok(!/<script[^>]+src=/.test(pg) && !/\bon\w+=/.test(pg), 'sem script externo nem atributo de evento (CSP por hash)');
});
