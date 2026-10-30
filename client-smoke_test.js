'use strict';
// Regressão estática do cliente: sintaxe, ids do DOM referenciados, CSP e barra de controles.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = require('./client-source').readClient();
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

test('os scripts inline compilam', () => {
  assert.strictEqual(scripts.length, 2);
  scripts.forEach((s, i) => assert.doesNotThrow(() => new vm.Script(s, { filename: 'inline' + i })));
});

test('todo id usado via $("#id") existe no HTML (ou é criado por script)', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const dynamic = new Set(['ytapi']);
  const used = new Set([...scripts.join('\n').matchAll(/\$\('#([A-Za-z][\w-]*)'\)/g)].map(m => m[1]));
  const missing = [...used].filter(i => !ids.has(i) && !dynamic.has(i));
  assert.deepStrictEqual(missing, []);
});

test('ids duplicados não existem', () => {
  const all = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const dup = all.filter((id, i) => all.indexOf(id) !== i);
  assert.deepStrictEqual(dup, []);
});

test('compatível com o CSP: sem handlers inline, eval ou new Function', () => {
  assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(html.replace(/<script>[\s\S]*?<\/script>/g, '')), 'handler inline no HTML');
  const js = scripts.join('\n');
  assert.ok(!/\beval\s*\(/.test(js));
  assert.ok(!/new Function\s*\(/.test(js));
});

test('barra: ordem agrupada e tamanho esperado', () => {
  const bar = html.match(/<div id="bar"[\s\S]*?<div id="pMochila"/)[0];
  const order = [...bar.matchAll(/<button id="(\w+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(order, ['bChat', 'bVid', 'bDJ', 'bKar', 'bEmo', 'bGes', 'bMochila', 'bVis', 'bInvite', 'bSet', 'bExit']);
});

test('tela cheia fica na barra de controles, ao lado de + e do volume', () => {
  assert.ok(!/\.fsbtn\{/.test(html), 'CSS antigo do botão flutuante ainda presente');
  for (const [stage, box, fs, vol] of [['vstage', 'vbox', 'vfs', 'vvol'], ['kstage', 'kbox', 'kfs', 'kvol']]) {
    const stageStart = html.indexOf(`<div class="vstage" id="${stage}">`);
    assert.ok(stageStart >= 0, stage + ' ausente');
    const barStart = html.indexOf('<div class="vctl">', stageStart);
    assert.ok(barStart > stageStart, stage + ': barra ausente');
    const stageHtml = html.slice(stageStart, barStart);
    assert.ok(stageHtml.includes(`id="${box}"`), stage + ': vídeo fora do palco');
    assert.ok(!stageHtml.includes('data-rs=') && !stageHtml.includes('class="kvol"'), stage + ': controles dentro do palco');
    const barHtml = html.slice(barStart, html.indexOf('</div></div>', barStart));
    assert.ok(barHtml.indexOf('data-d="1"') < barHtml.indexOf(`id="${fs}"`), stage + ': tela cheia deve vir depois do +');
    assert.ok(barHtml.indexOf(`id="${fs}"`) < barHtml.indexOf(`id="${vol}"`), stage + ': volume deve vir depois da tela cheia');
  }
});

test('recursos de desempenho presentes e com opt-out', () => {
  for (const s of ['?perf', 'perfTick', 'adaptRes', 'mergeStatic', 'NOMERGE', 'disposeTree', 'partBuild'])
    assert.ok(html.includes(s === '?perf' ? 'perf(=|&|$)' : s), s);
});

test('cenário: descampado por bioma e troncos no lugar de sofás/mesas', () => {
  for (const k of ['proxima', 'kepler', 'gliese', 'osiris', 'tauri', 'esmera'])
    assert.ok(new RegExp(k + ":\\['#").test(html.slice(html.indexOf('const DESC='))), 'DESC ' + k);
  assert.ok(html.includes('descampado(CUR)'));
  assert.ok(!html.includes('TorusGeometry(10.5'), 'borda brilhante antiga removida');
  const lounge = html.slice(html.indexOf('function themeLounge'), html.indexOf('function holo('));
  assert.ok(!/sof[áa]/i.test(lounge.replace(/\/\/[^\n]*\n/g, '')) && !lounge.includes('TorusGeometry'), 'sofá/mesa removidos');
});

test('casa lunar de sacos de terra: domo ogival em anéis, porta em arco e sem o ônibus espacial', () => {
  const house = html.slice(html.indexOf('function lunarHouse'), html.indexOf('const NOMERGE'));
  for (const k of ['LatheGeometry', 'ExtrudeGeometry', 'absarc', 'MPAL'])
    assert.ok(house.includes(k), k);
  assert.ok(html.includes('lunarHouse(k)') && !html.includes('spaceBus') && !html.includes('jetTick'), 'ônibus e turbinas removidos');
});

test('microfone: um só botão no HUD superior, sem botão duplicado na barra', () => {
  assert.ok(!html.includes('id="bMic"') && !html.includes('#bMic'), 'bMic antigo removido');
  const hud = html.match(/<div id="hud"[\s\S]*?<\/div>\n/)[0];
  assert.ok(/<button class="p" id="mic" type="button"[^>]*aria-pressed="false"/.test(hud), 'botão #mic no HUD');
  assert.ok(html.includes("$('#mic').onclick=()=>stream?stopMic():startMic();"));
  assert.ok(html.includes('#mic[data-s=on]{border-color:var(--kg);box-shadow:0 0 0 1px var(--kg)}'), 'só uma borda verde fina quando ligado');
  assert.ok(!html.includes('#mic.talk') && !html.includes("$('#mic').classList.toggle('talk'"), 'sem brilho extra ao falar');
  assert.ok(!/#mic\{[^}]*border-left/.test(html), 'sem borda lateral grossa');
});

test('HUD: sem botões de sala/pessoas; fila do karaokê ao lado do microfone', () => {
  const hud = html.match(/<div id="hud"[\s\S]*?<\/div>\n/)[0];
  assert.ok(!hud.includes('id="hn"') && !hud.includes('id="cnt"'), 'botões de sala e pessoas removidos');
  assert.ok(!html.includes('id="pPpl"') && !html.includes('renderPpl') && !html.includes('updCnt'), 'lista de pessoas removida');
  const ids = [...hud.matchAll(/<(?:button|span) class="p[^"]*" id="(\w+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(ids.slice(0, 2), ['mic', 'kshowq']);
  assert.ok(/id="kshowq"/.test(hud) && !html.match(/<div id="bar"[\s\S]*?<div id="pMochila"/)[0].includes('kshowq'));
  assert.ok(/<button class="p hide" id="kshowq"/.test(hud), 'começa oculto até entrar no karaokê');
});

test('gestos: botão na barra ao lado de emojis, sem abas no painel', () => {
  assert.ok(html.indexOf('id="bEmo"') < html.indexOf('id="bGes"') && html.indexOf('id="bGes"') < html.indexOf('id="bMochila"'));
  assert.ok(!html.includes('id="emoTabs"') && !html.includes('data-etab'));
  assert.ok(html.includes("$('#bGes').onclick=()=>emoToggle('eGes')"));
  assert.ok(html.includes("$('#bEmo').onclick=()=>emoToggle('eEmo')"));
});

test('fila do karaokê: sem textos Cantando e Você', () => {
  const fn = html.slice(html.indexOf('function renderK(){'), html.indexOf('function syncK('));
  assert.ok(!fn.includes("tag('Cantando')") && !fn.includes("tag('Você')"));
  assert.ok(fn.includes("(isMe?' mine':'')"), 'linha própria destacada sem texto');
});

test('favicon e cursores embutidos (data: URI) e liberados pelo CSP', () => {
  const icons = [...html.matchAll(/<link rel="icon"[^>]*href="([^"]+)"/g)].map(m => m[1]);
  assert.strictEqual(icons.length, 2, 'SVG + PNG de reserva');
  const svg = decodeURIComponent(icons[0].replace('data:image/svg+xml,', ''));
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>') && svg.includes('viewBox'), 'favicon SVG válido');
  assert.ok(icons[1].startsWith('data:image/png;base64,'));
  assert.ok(Buffer.from(icons[1].split(',')[1], 'base64').slice(1, 4).toString() === 'PNG', 'PNG de verdade');
  for (const v of ['--cur', '--cur-ptr']) {
    const m = html.match(new RegExp(v + ':url\\("(data:image/svg\\+xml,[^"]+)"\\) 5 3,(auto|pointer)'));
    assert.ok(m, v);
    const s = decodeURIComponent(m[1].replace('data:image/svg+xml,', ''));
    assert.ok(s.startsWith('<svg') && s.includes("width='32'") && s.endsWith('</svg>'), v + ' é SVG 32x32');
  }
  assert.ok(html.includes('html,body{cursor:var(--cur)}'));
  assert.ok(html.indexOf('{cursor:var(--cur-ptr)}') < html.indexOf('button:disabled{opacity:.5;cursor:not-allowed}'), 'desabilitado mantém not-allowed');
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.ok(/img-src 'self' data:/.test(server), 'CSP precisa liberar data: para ícone e cursor');
});

const IDS16 = ['proxima', 'kepler', 'gliese', 'osiris', 'tauri', 'esmera', 'ambar', 'nyx', 'lumen', 'duna', 'mira', 'sakura', 'nivis', 'cinder', 'trappist', 'draugr'];
const tableOf = name => { const i = html.indexOf('const ' + name + '='); assert.ok(i >= 0, name); return html.slice(i, html.indexOf('\nconst ', i + 10)); };

test('todas as tabelas por mundo cobrem os 16 mundos (luz, montanhas, ambiente, passos, partículas)', () => {
  for (const t of ['FILL', 'MPAL', 'MPROF', 'AMB', 'STEPK', 'PFX', 'THEME', 'SKY', 'FOGD', 'RIMT', 'BUILD'])
    for (const k of IDS16) assert.ok(new RegExp('\\b' + k + ':').test(tableOf(t)), t + ' ' + k);
});

test('ajustes de som: só efeitos sonoros e som ambiente (o controle de notificações foi absorvido)', () => {
  assert.ok(html.includes('id="sSfx"') && html.includes('id="sSfxBg"'));
  assert.ok(!html.includes('sSfxUi') && !html.includes('uiG'));
  assert.ok(html.includes('Efeitos sonoros') && html.includes('Som ambiente'));
});

test('câmera: botão direito gira, clique rápido vai à frente e o menu do navegador é bloqueado', () => {
  for (const k of ["addEventListener('contextmenu'", "e.button!==2", "camHintShow(", 'camYawS', 'id="camHint"'])
    assert.ok(html.includes(k), k);
  assert.ok(html.includes('e.button!==0||mode!==\'play\''), 'clique esquerdo só com o botão principal');
});

test('cenário: decoração espelhada, casa lunar única e sem código morto do ônibus e do acampamento', () => {
  for (const k of ['function mirrorDecor(', 'nomir.push(', 'function lunarHouse(', 'function mountains('])
    assert.ok(html.includes(k), k);
  for (const k of ['spaceBus', 'jetTick', 'campScene', 'stumpStool', 'function tent(', 'orbs=', 'jets='])
    assert.ok(!html.includes(k), 'removido: ' + k);
});

test('versão: o servidor envia a versão do package.json e o cliente a mostra no chat', () => {
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.ok(server.includes("require('./package.json').version") && server.includes('ver:VER'));
  assert.ok(html.includes("'Skyke3D v'+m.ver"));
});

test('termos: caixas de 18+ e de regras de convivência bloqueiam criar e entrar até serem marcadas', () => {
  for (const k of ['id="tAge"', 'id="tRules"', 'id="tRulesBtn"', 'id="pRules"', 'regras de convivência', '18 anos ou mais'])
    assert.ok(html.includes(k), k);
  const start = html.slice(html.indexOf('async function start('), html.indexOf('async function start(') + 1200);
  assert.ok(/\$\('#tAge'\)\.checked\|\|!\$\('#tRules'\)\.checked/.test(start.replace(/\s+/g, '')) || (start.includes("!$('#tAge').checked||!$('#tRules').checked") && start.includes('return}')), 'start() confere as duas caixas');
  assert.ok(html.includes("localStorage.setItem('skyke_terms'"), 'a escolha fica salva no navegador');
  assert.ok(html.includes('Palavrões são trocados'), 'as regras citam o filtro');
});

test('vídeo: cada jogador pode iniciar o seu; quem aceitou o vídeo de outro só assiste (trocar é do controlador)', () => {
  for (const k of ["send({t:'vleave',by:", "send({t:'vjoin',by:", "const INV={}", "m.by===VW.owner", 'id="vendMsg"'])
    assert.ok(html.includes(k), k);
  assert.ok(html.includes("$('#vchange').classList.toggle('hide',!ctl)"), 'o campo de trocar só aparece para o controlador');
  assert.ok(!html.includes('Colocar o meu vídeo') && !html.includes('vchangeLabels'), 'sem opção de trocar para quem só assiste');
  assert.ok(html.includes("$('#vswap').onclick=()=>{if(!VW.ctl||swapWait)return;"), 'só o controlador troca o vídeo');
  assert.ok(!html.includes('curInv'), 'convite único antigo removido');
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.ok(server.includes('vids:new Map()') && server.includes('const MAX_VIDS=4'));
  assert.ok(!server.includes('vidStale'), 'o bloqueio por vídeo alheio foi removido');
});

test('janelas: X de fechar em todas; só o karaokê minimiza para um botão flutuante e fecha ao sair da fila', () => {
  assert.ok(html.includes("b.textContent=kar?'➖':'✖'"), 'X nas janelas, ➖ só no karaokê');
  assert.ok(html.includes('id="cMin" aria-label="Fechar chat" title="Fechar chat">✖'), 'chat com X');
  for (const k of ['id="kFloat"', 'function minimizeK(', 'function setKMin(', "$('#kFloat').onclick="])
    assert.ok(html.includes(k), k);
  assert.ok(html.includes("$('#pKar').classList.add('hide');exitFullscreenIf($('#kstage'));setKMin(false)"), 'sair da fila fecha a janela do karaokê');
  assert.ok(html.includes('<span id="emoTitle">'), 'o título dos emojis não apaga o botão de fechar');
});

test('cores: 40 de roupa/chapéu e 32 de cabelo (com neon e preto brilhante), iguais aos limites do servidor', () => {
  const V = require('./validate.js');
  assert.deepStrictEqual([V.CR.shirt, V.CR.hc, V.CR.pc, V.CR.sc, V.CR.hair], [40, 40, 40, 40, 32]);
  const list = name => { const i = html.indexOf('const ' + name + '=['), j = html.indexOf('\n', i); return html.slice(i, j); };
  const hexes = s => (s.match(/'#[0-9a-fA-F]{6}'/g) || []).length;
  assert.strictEqual(hexes(list('PAL')), 40, 'PAL');
  const hair = html.slice(html.indexOf('HAIRC=['), html.indexOf('\n', html.indexOf('HAIRC=[')));
  assert.strictEqual(hexes(hair), 32, 'HAIRC');
  for (const c of ["'#39ff14'", "'#ff2bd6'", "'#0a0a10'"]) assert.ok(html.includes(c), c);
  assert.ok(html.includes('float gl=1.-smoothstep(') && html.includes('float neon='), 'brilho do preto e do neon no shader');
  assert.ok(html.includes('class="swb"'), 'seletor de cores em grade');
});

test('vídeo: depois do fim a janela espera por um novo vídeo e fecha sozinha, apagando o convite do sino', () => {
  for (const k of ['function endedState(', 'function clearEnded(', "case 'vend':if(m.by===VW.owner", "send({t:'vend'});endedState(180000)", "m.why==='idle'"])
    assert.ok(html.includes(k), k);
  assert.ok(!html.includes("send({t:'vend'});closeVid(false)"), 'o fim do vídeo não fecha a janela na hora');
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.ok(server.includes("envInt('VIDEO_IDLE_MS',180000"), 'espera de 3 minutos configurável');
  assert.ok(server.includes("dropVid(rm,by,'idle')"), 'o servidor encerra a sessão ociosa');
});

test('vídeo: quem controla um vídeo e aceita o de outro jogador passa a só assistir', () => {
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.ok(server.includes('dropVid(room,me.id,undefined,ws);// quem aceita o vídeo de outro jogador'), 'o servidor encerra o vídeo de quem aceita outro');
  assert.ok(html.includes("function openVid(id,ctl,owner){clearEnded();if(!ctl)clearSwapWait();"), 'aceitar um vídeo cancela uma troca pendente');
});

test('vídeo: sem botão "Fechar vídeo" (o ✖ da janela já fecha e encerra o vídeo de quem o controla)', () => {
  assert.ok(!html.includes('id="vclose"') && !html.includes('Fechar vídeo') && !html.includes("$('#vclose')"));
  assert.ok(html.includes("if(id==='pVid'){closeVid(true);return}"), 'o ✖ da janela chama closeVid(true)');
});
