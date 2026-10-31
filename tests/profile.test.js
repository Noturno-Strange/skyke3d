'use strict';

// Perfil (botão 👤 da barra): o código de recuperação fica mascarado até clicar no olho e nunca sai do navegador; tela inicial com ações compactas.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html'), css = read('assets/app.css'), panels = read('assets/app-panels.js'), net = read('assets/app-net.js'), ui = read('assets/app-ui.js');

test('perfil: botão na barra, janela com foto, nome e código mascarados com olho e cópia, e Meus dados', () => {
  assert.match(html, /<button id="bPerf"[^>]*>👤<\/button>/);
  assert.match(html, /id="pfFace"/);
  for (const id of ['pfName', 'pfRec', 'pfRecEye', 'pfRecCp', 'pfMsg', 'pfData', 'pfDataBox', 'pfExp', 'pfForget'])
    assert.match(html, new RegExp('id="' + id + '"'), id);
  assert.match(html, /<input id="pfRec" readonly value="\*{12}"/, 'o código nasce mascarado e só de leitura');
  assert.match(html, /id="pfRecEye"[^>]*aria-pressed="false"/, 'olho acessível');
  assert.match(html, /Código de recuperação <small>\(secreto\)<\/small>/);
  assert.match(html, /<button type="button" id="pfData"[^>]*>🔒 Meus dados<\/button>/);
  assert.ok(!/pfLink|pfMake|pfAll|ranking/i.test(html), 'sem nada de ranking no Perfil');
  assert.ok(html.indexOf('id="pPerf"') < html.indexOf('id="pSet"'));
});

test('código de recuperação: nunca sai do navegador (nem em rede, nem em link, nem no servidor) e se oculta sozinho', () => {
  const srvSrc = read('server.js'), valid = read('validate.js');
  assert.ok(!/SKYREC\.(encode|decode)|recoveryCode/.test(srvSrc + valid), 'o servidor nunca monta nem lê códigos de recuperação');
  for (const [f, code] of [['assets/app-net.js', net], ['assets/app-panels.js', panels]])
    for (const m of code.matchAll(/(fetch|send|XMLHttpRequest|sendBeacon|WebSocket)\s*\(([^)]*)\)/g)) assert.ok(!/recText|recoveryCode|SKYREC\.encode|\.recout|pfRec/.test(m[2]), f + ': ' + m[0] + ' envia o código');
  assert.ok(!/localStorage\.setItem\([^)]*(recText|recoveryCode)/.test(panels + net), 'o código não é guardado em lugar nenhum');
  for (const m of (panels + net).matchAll(/recoveryCode\(\)/g)) { const antes = (panels + net).slice(Math.max(0, m.index - 40), m.index); assert.ok(/writeText\($|copy\($|=>$|function $/.test(antes), 'recoveryCode() só vai para a área de transferência ou para a tela do Perfil: ' + antes); }
  assert.match(panels, /MASK='\*{12}'/);
  assert.match(panels, /setTimeout\(\(\)=>\{showRec=false;[^}]*\},30000\)/, 'oculta de novo em 30 s');
  assert.match(panels, /visibilitychange',\(\)=>\{if\(document\.hidden&&showRec\)/, 'oculta quando a aba some');
  assert.match(panels, /classList\.contains\('hide'\)\)hideAll\(\)/, 'fechar a janela oculta de novo');
  assert.match(panels, /catch\(e\)\{x\.font=/, 'sem WebGL no segundo desenhista, usa um emoji');
  assert.match(panels, /forceContextLoss/, 'o contexto extra é liberado');
  assert.match(css, /\.pfhead canvas\{position:static/, 'o canvas da foto não herda o estilo da cena inteira');
  assert.ok(ui.includes("'pPerf'"), 'janela arrastável e com ✖');
});

test('Meus dados: exportar sem o código, esquecer só neste aparelho com Sim/Não e aviso do código de recuperação', () => {
  assert.match(panels, /pfExp'\)\.onclick=/);
  assert.ok(!/recoveryCode|recText/.test(panels.match(/pfExp'\)\.onclick=[\s\S]*?note\('✔ Arquivo baixado\.'\)/)[0]), 'o arquivo exportado não leva o código de recuperação');
  assert.match(panels, /mkConfirm\(\$\('#pfForget'\),\{html:'<b>Esquecer neste aparelho\?<\/b>[^']*código de recuperação/);
  assert.match(net, /class="fgno">Não/); assert.match(net, /class="dng fgyes"/);
  assert.match(net, /b\.onclick=open;/, 'o clique no botão só abre a confirmação');
  assert.match(net, /fgyes'\)\.onclick=\(\)=>\{[^}]*o\.onYes\(\)/, 'só o Sim executa');
  assert.match(net, /Para voltar, use o <b>código de recuperação<\/b>/);
  assert.match(css, /\.fgc\{/);
});

test('tela inicial: ações compactas em duas linhas, sempre à vista', () => {
  const acts = html.match(/<div class="sec acts">[\s\S]*?<small id="serr"/)[0];
  assert.strictEqual((acts.match(/class="actrow"/g) || []).length, 2, 'duas linhas');
  for (const id of ['go', 'code', 'join', 'bn']) assert.match(acts, new RegExp('id="' + id + '"'), id);
  assert.ok(!/<div class="st">(Criar sala|Entrar com código)<\/div>/.test(acts), 'títulos repetidos saíram');
  assert.match(css, /\.acts\{[^}]*position:sticky;bottom:-24px/, 'ações coladas no fim do painel');
});

test('o modo Sobrevivência e o ranking foram removidos por inteiro (o código está na tag sobrevivencia-v2.6.3)', () => {
  const root = path.join(__dirname, '..');
  for (const f of ['survival.js', 'assets/survmap.js', 'assets/app-surv.js', 'humancheck.js', 'survstats.js', 'playerstats.js', 'estatisticas.html', 'jogador.html', 'docs/survival-balance.md'])
    assert.ok(!fs.existsSync(path.join(root, f)), f + ' ainda existe');
  const catalog = require('../assets/catalog.js');
  assert.strictEqual(catalog.SURV, undefined); assert.strictEqual(Object.keys(catalog.ST).length, 16);
  for (const [f, rx] of [['server.js', /survival|SURVIVAL|PSTATS|SURVSTATS|humancheck|estatisticas|\/jogador\//], ['validate.js', /SURV|'sv'|'pst'|acampamento/], ['index.html', /surv|Sobreviv|goSv|ranking/i],
    ['assets/app-net.js', /SURVC|PST\b|goSv/], ['assets/app-scene.js', /acampamento|survDecor|SVSEED/], ['assets/app-base.js', /svFaint|svFire|SKYMAP/], ['assets/app-ui.js', /svFaint|svFire/], ['assets/app.css', /\.sv-|body\.surv|button\.sv/]])
    assert.ok(!rx.test(read(f)), f + ' ainda tem resto do modo: ' + rx);
});
