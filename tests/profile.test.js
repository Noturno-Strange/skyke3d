'use strict';

// Perfil (botão 👤) e Segurança (botão 🔐): identidade P-256, código de recuperação mascarado, segurança, backup cifrado e Meus dados.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html'), css = read('assets/app.css'), panels = read('assets/app-panels.js'), net = read('assets/app-net.js'), ui = read('assets/app-ui.js'), id = read('assets/identity.js'), rec = read('assets/recovery.js'), priv = read('privacidade.html');

test('perfil: botão na barra, foto, identidade, código mascarado e ações de segurança', () => {
  assert.match(html, /<button id="bPerf"[^>]*>👤<\/button>/);
  assert.match(html, /id="pfFace"/);
  for (const i of ['pfName', 'pfId', 'pfRec', 'pfRecEye', 'pfRecCp', 'pfRotRec', 'pfRotMain', 'pfRevoke', 'pfSecMsg', 'pfMsg', 'pfData', 'pfDataBox', 'pfExp', 'pfBackup', 'pfRestore', 'pfBkFile', 'pfForget'])
    assert.match(html, new RegExp('id="' + i + '"'), i);
  assert.match(html, /<input id="pfRec" readonly value="\*{12}"/, 'o código nasce mascarado e só de leitura');
  assert.match(html, /id="pfRecEye"[^>]*aria-pressed="false"/, 'olho acessível');
  assert.match(html, /Código de recuperação <small>\(secreto\)<\/small>/);
  assert.match(html, /<button type="button" id="pfData"[^>]*>🔒 Meus dados<\/button>/);
  assert.match(html, /id="pfRotRec"[^>]*>🔑 Nova chave de recuperação</, 'gerar nova chave de recuperação');
  assert.match(html, /id="pfRotMain"[^>]*>🔐 Trocar a chave deste aparelho</, 'trocar a chave principal');
  assert.match(html, /id="pfRevoke"[^>]*>🚪 Sair dos outros aparelhos</, 'encerrar sessões antigas');
  assert.match(html, /id="pfBackup"[^>]*>🔐 Baixar cópia protegida por senha</, 'backup cifrado');
  assert.ok(html.indexOf('id="pPerf"') < html.indexOf('id="pSet"'));
  assert.match(css, /\.pfid\{/);
  assert.match(css, /\.pfact\{[^}]*display:flex/);
});

test('código de recuperação: nunca sai do navegador (nem em rede, nem em link, nem no servidor) e se oculta sozinho', () => {
  const srvSrc = [read('server.js'), ...fs.readdirSync(path.join(__dirname, '..', 'lib')).map(f => read('lib/' + f))].join('\n');
  assert.ok(!/SKYREC\.(encode|decode)|recoveryCode/.test(srvSrc), 'o servidor nunca monta nem lê códigos de recuperação');
  for (const [f, code] of [['assets/app-net.js', net], ['assets/app-panels.js', panels]])
    for (const m of code.matchAll(/(fetch|send|XMLHttpRequest|sendBeacon|WebSocket)\s*\(([^)]*)\)/g)) assert.ok(!/recText|recoveryCode|SKYREC\.encode|SKYID\.backupCode|pfRec/.test(m[2]), f + ': ' + m[0] + ' envia o código');
  assert.ok(!/localStorage\.setItem\([^)]*(recText|recoveryCode|SKYID\.backupCode)/.test(panels + net), 'o código não é guardado em lugar nenhum');
  for (const m of (panels + net).matchAll(/recoveryCode\(\)/g)) {
    const antes = (panels + net).slice(Math.max(0, m.index - 60), m.index);
    assert.ok(!/(send|fetch|XMLHttpRequest|WebSocket|localStorage\.setItem)\s*\([^)]*$/.test(antes), 'recoveryCode() não vai para a rede nem para o armazenamento: ' + antes);
  }
  assert.match(panels, /MASK='\*{12}'/);
  assert.match(panels, /setTimeout\(\(\)=>\{showRec=false;clearCode\(\);note\('Código oculto de novo\.'\);paint\(\)\},30000\)/, 'oculta de novo em 30 s');
  assert.match(panels, /visibilitychange',\(\)=>\{if\(document\.hidden&&showRec\)/, 'oculta quando a aba some');
  assert.match(panels, /classList\.contains\('hide'\)\)hideAll\(\)/, 'fechar a janela oculta de novo');
  assert.match(panels, /catch\(e\)\{x\.font=/, 'sem WebGL no segundo desenhista, usa um emoji');
  assert.match(panels, /forceContextLoss/, 'o contexto extra é liberado');
  assert.match(css, /\.pfhead canvas\{position:static/, 'o canvas da foto não herda o estilo da cena inteira');
  assert.ok(ui.includes("'pPerf'"), 'janela arrastável e com ✖');
});

test('identidade: chave principal não exportável no IndexedDB, recuperação independente e servidor só com chaves públicas', () => {
  assert.match(id, /indexedDB/, 'as chaves ficam no IndexedDB');
  assert.match(id, /genKeys\(false\)/, 'a chave principal nasce não exportável');
  assert.match(id, /genKeys\(true\)/, 'a chave de recuperação é exportável para o backup/código');
  assert.match(id, /namedCurve: 'P-256'/);
  assert.match(id, /hash: 'SHA-256'/);
  assert.ok(!/localStorage\.setItem\([^)]*(pk|rpk|primary|recovery|CryptoKey|private)/.test(id), 'nenhuma chave privada no localStorage');
  assert.match(id, /PBKDF2/, 'backup usa PBKDF2');
  assert.match(id, /150000/);
  assert.match(id, /AES-GCM/);
  assert.match(id, /pkcs8/);
  assert.match(rec, /encodeV2/);
  assert.match(rec, /decodeAny/);
  const payload = id.match(/encodeV2\(\{([\s\S]*?)\}\);/);
  assert.ok(payload, 'o código v2 é montado por encodeV2');
  assert.match(payload[1], /rec: der/, 'o código v2 leva a chave de recuperação');
  assert.ok(!/primary|rec\.primary/.test(payload[1]), 'o código não leva a chave principal');
  assert.ok(html.indexOf('/assets/identity.js') > html.indexOf('/assets/recovery.js') && html.indexOf('/assets/identity.js') < html.indexOf('/assets/app-net.js'), 'identidade carrega antes da rede');
  assert.match(priv, /IndexedDB/);
  assert.match(priv, /não exportável/);
  assert.match(priv, /chaves públicas/);
  assert.ok(!/chave privada.*servidor/i.test(priv.replace(/nunca a chave privada/g, '')), 'a política não sugere chave privada no servidor');
});

test('Meus dados: exportar sem o código, backup cifrado com senha e esquecer só neste aparelho', () => {
  assert.match(panels, /pfExp'\)\.onclick=/);
  assert.match(panels, /a\.download='skyke3d-meus-dados\.txt'/, 'texto simples, não JSON');
  assert.match(panels, /type:'text\/plain;charset=utf-8'/);
  const exp = panels.match(/pfExp'\)\.onclick=[\s\S]*?note\('✔ Arquivo baixado\.'\)/)[0];
  assert.ok(!/JSON\.stringify/.test(exp), 'uma linha por item, sem chaves nem aspas');
  assert.ok(!/recoveryCode|recText|SKYID\.backupCode/.test(exp), 'o arquivo exportado não leva o código de recuperação');
  assert.match(panels, /SKYID\.encryptBackup/, 'backup é cifrado');
  assert.match(panels, /p\.length<10/, 'senha do backup tem mínimo (10 caracteres)');
  assert.match(panels, /a\.download='skyke3d-backup\.txt'/);
  assert.match(panels, /SKYID\.decryptBackup/);
  assert.match(panels, /SKYID\.restoreCode/);
  assert.match(panels, /mkConfirm\(\$\('#pfForget'\),\{html:'<b>Esquecer neste aparelho\?<\/b>[^']*código de recuperação/);
  assert.match(panels, /SKYID\.forget\(\)/);
  assert.match(net, /class="fgno">Não/); assert.match(net, /class="dng fgyes"/);
  assert.match(net, /b\.onclick=open;/, 'o clique no botão só abre a confirmação');
  assert.match(net, /fgyes'\)\.onclick=\(\)=>\{[^}]*o\.onYes\(\)/, 'só o Sim executa');
  assert.match(net, /Para voltar, use o <b>código de recuperação<\/b>/);
  assert.match(css, /\.fgc\{/);
});

test('tela inicial: ações compactas em duas linhas, sempre à vista', () => {
  const acts = html.match(/<div class="sec acts">[\s\S]*?<small id="serr"/)[0];
  assert.strictEqual((acts.match(/class="actrow"/g) || []).length, 2, 'duas linhas');
  for (const i of ['go', 'code', 'join', 'bn']) assert.match(acts, new RegExp('id="' + i + '"'), i);
  assert.ok(!/<div class="st">(Criar sala|Entrar com código)<\/div>/.test(acts), 'títulos repetidos saíram');
  assert.match(css, /\.acts\{[^}]*position:sticky;bottom:-24px/, 'ações coladas no fim do painel');
});

test('mínimo de dados: o navegador não manda relatos de erro e o servidor não tem rota para recebê-los', () => {
  const all = ['assets/app-base.js', 'assets/app-net.js', 'assets/app-ui.js', 'assets/app-panels.js', 'server.js'].map(read).join('\n');
  assert.ok(!/['"]\/erro['"]|reportBug|createErrorLog|CLIENT_ERR/.test(all));
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'clienterrors.js')));
});

// SK-04: a chave de recuperação não fica no aparelho; o código só sai da memória e a interface pede o código quando precisa.
test('SK-04 (fonte): conta nova só guarda a chave pública de recuperação e a privada vive na memória', () => {
  assert.match(id, /rec = \{ id: r\.id, gen: r\.gen, rgen: r\.rgen, epoch: r\.epoch, pk, rpk, primary: primary\.privateKey \}/, 'conta nova: só a principal e as chaves públicas');
  assert.match(id, /holdRecovery\(recovery\.privateKey\)/, 'a privada nova vai só para a memória');
  assert.ok(!/recovery: [a-z]+\.privateKey/.test(id), 'nenhum registro leva a privada de recuperação');
  const atribuicoes = [...id.matchAll(/\brec\.recovery\s*=[^=]/g)];
  assert.strictEqual(atribuicoes.length, 1, 'só uma atribuição a rec.recovery (a troca pendente de versão antiga)');
  assert.match(id.slice(atribuicoes[0].index, atribuicoes[0].index + 40), /rec\.recovery = p\.recovery/);
  assert.match(id, /const RECOVERY_MEM_MS = 10 \* 60000/, 'a chave some da memória em 10 minutos');
  assert.match(id, /delete rec\.recovery/, 'confirmar o código (ou gerar chave nova) remove a chave que o aparelho ainda guardava');
  assert.match(id, /pendingRecovery = pending/);
  assert.match(id, /const pending = \{ rpk: newRpk, rgen: rec\.rgen \}/, 'a troca pendente leva só dados públicos');
  assert.ok(!/localStorage\.setItem\([^)]*(memRecovery|holdRecovery)/.test(id));
  assert.match(priv, /não fica guardada no navegador/, 'a política de privacidade descreve o novo modelo');
  assert.ok(!/também fica no IndexedDB/.test(priv), 'a política não diz mais que a chave de recuperação fica no IndexedDB');
});

test('SK-04 (fonte): a interface pede o código colado, mostra o código novo antes de valer e apaga o campo ao fechar', () => {
  for (const i of ['pCode', 'codeWhy', 'codeIn', 'codeErr', 'codeGo', 'codeNo', 'pCodeNew', 'codeNewV', 'codeNewEye', 'codeNewCp', 'codeNewGo', 'codeNewNo', 'pfRecNote', 'pfRecOk', 'pfRecNew'])
    assert.match(html, new RegExp('id="' + i + '"'), i);
  assert.match(html, /<input id="codeIn" type="password"/, 'o código colado fica oculto');
  assert.match(html, /<input id="codeNewV" type="password" readonly/, 'o código novo nasce oculto e só de leitura');
  assert.match(net, /SKYID\.setUi\(\{askCode:askRecoveryCode,confirmNew:showNewRecoveryCode,profile:profileNow\}\)/);
  assert.match(net, /function askRecoveryCode\(why,tentar\)/);
  assert.match(net, /inp\.value='';go\.onclick=no\.onclick=/, 'o campo do código é apagado ao fechar a janela');
  assert.match(net, /v\.value='';v\.type='password'/, 'o código novo é apagado da tela ao fechar');
  assert.match(net, /Copie ou mostre o código antes de trocar/, 'só troca depois de o jogador ver ou copiar o código novo');
  assert.match(net, /if\(SKYID\.status\(\)\)return ''/, 'com identidade e sem a chave, o "código" não vira um código antigo sem a chave de recuperação');
  assert.match(panels, /SKYID\.confirmRecovery/);
  assert.match(panels, /SKYID\.refreshCode/);
  assert.match(panels, /SKYID\.rotateRecovery\(profileNow\(\)\)/);
  // o que a interface lê da identidade para decidir o que mostrar
  for (const campo of ['codeReady', 'recoveryOnDevice', 'recoveryChecked']) assert.match(id, new RegExp(campo + ':'), campo);
  // o código colado nunca vai para a rede nem para o armazenamento
  for (const [f, code] of [['assets/app-net.js', net], ['assets/app-panels.js', panels]])
    for (const m of code.matchAll(/(fetch|send|XMLHttpRequest|sendBeacon|WebSocket)\s*\(([^)]*)\)/g)) assert.ok(!/codeIn|codeNewV|askRecoveryCode|refreshCode|confirmRecovery/.test(m[2]), f + ': ' + m[0]);
  assert.ok(!/localStorage\.setItem\([^)]*(codeIn|codeNewV|refreshCode)/.test(panels + net));
});
