'use strict';
// 3.26: o jogo é só para computador (Chrome, Edge, Firefox, Opera e Safari). Confere que o código de celular saiu, que as páginas
// avulsas usam a largura da tela, as correções de compatibilidade entre navegadores e o retorno visual e sonoro novo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html'),
  css = read('assets/app.css'),
  base = read('assets/app-base.js'),
  net = read('assets/app-net.js'),
  ui = read('assets/app-ui.js'),
  voice = read('assets/app-voice.js'),
  intro = read('assets/intro.js'),
  panels = read('assets/app-panels.js'),
  media = read('assets/app-media.js'),
  social = read('assets/app-social.js'),
  pet = read('assets/app-pet.js'),
  sound = read('assets/app-sound.js'),
  scroll = read('assets/app-scroll.js'),
  ident = read('assets/identity.js'),
  profile = read('profile.html'),
  farm = read('fazenda.html'),
  status = read('status.html'),
  priv = read('privacidade.html');
const scripts = fs.readdirSync(path.join(root, 'assets')).filter(f => f.endsWith('.js'));

// contraste WCAG entre duas cores #rrggbb
const lum = h => {
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const vars = (src, sel) => {
  const m = src.match(new RegExp(sel.replace(/[[\]]/g, '\\$&') + '\\{([^}]*)\\}'));
  return Object.fromEntries([...(m ? m[1] : '').matchAll(/--([\w-]+):(#[0-9a-f]{6})/g)].map(x => [x[1], x[2]]));
};

test('só computador: sem barra de toque, ponteiro grosso, notch nem trava de zoom', () => {
  assert.ok(!/id="touchbar"|id="tJump"|id="tSit"|id="tUse"|id="tPtt"/.test(html), 'sem os botões de toque');
  assert.ok(!/\.tb\{|#tPtt/.test(css), 'sem o estilo da barra de toque');
  for (const f of scripts) {
    const src = read('assets/' + f);
    assert.ok(!/pointer:coarse|pointer:fine|\bCOARSE\b|touchbar|#tPtt/.test(src), f + ': sem ramo de toque');
  }
  assert.ok(!/pointer:coarse|hover:none|max-aspect-ratio|safe-area-inset|tap-highlight|100dvh|touch-action:manipulation/.test(css), 'app.css sem regras de celular');
  for (const [n, src] of [['index.html', html], ['profile.html', profile], ['fazenda.html', farm], ['status.html', status], ['privacidade.html', priv]]) {
    assert.ok(!/viewport-fit|maximum-scale|user-scalable|safe-area-inset|apple-touch-icon|touch-action/.test(src), n + ': sem ajustes de celular');
    assert.match(src, /<meta name="viewport" content="width=device-width, ?initial-scale=1">/, n + ': zoom do navegador livre');
  }
  // o tutorial passa só com botões, bolinhas e teclado; o texto não fala mais em celular nem em arrastar com o dedo
  assert.ok(!/pointerType|pointerdown/.test(intro));
  assert.ok(!/No celular|arrastando|ou 🗣️/.test(html), 'textos sem celular');
  assert.ok(!/['>]Toque (em|num|no|de novo|para)|'Tocar (de novo|para)/.test(scripts.map(f => read('assets/' + f)).join('\n') + html), 'clique no lugar de toque');
  // a janela de meia tela (em pé) fica com o layout de computador; a câmera do menu segue a mesma largura do CSS
  assert.match(ui, /port=innerWidth<=700;/);
  assert.match(css, /@media \(max-width:700px\)\{\n #start\{/);
});

test('o PWA continua para instalar no Chrome e no Edge do computador', () => {
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(base, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
});

test('navegadores: WebGL 2 conferido antes e falha do renderizador vira aviso, não tela preta', () => {
  assert.match(base, /getContext\('webgl2'\)\)throw noGL\(\);/, 'o three.js r186 só cria contexto WebGL 2');
  assert.match(base, /let renderer;try\{renderer=new THREE\.WebGLRenderer\(\{antialias:true,powerPreference:'high-performance'\}\)\}catch\(e\)\{throw noGL\(\)\}/);
  assert.match(base, /window\.SKY_NOGL=true;document\.body\.insertAdjacentHTML\('beforeend','<div id="err">/);
  assert.match(base, /Chrome, Edge, Firefox, Opera ou Safari atualizados, com a aceleração por hardware/);
});

test('navegadores: desfoque com prefixo do Safari, busca sem a caixa nativa e áudio que volta do estado interrompido', () => {
  const plain = (css.match(/(?<!-webkit-)backdrop-filter:blur/g) || []).length;
  const pref = (css.match(/-webkit-backdrop-filter:blur/g) || []).length;
  assert.ok(plain > 0 && pref >= plain, 'todo backdrop-filter tem a versão -webkit- (Safari até a 17)');
  assert.match(css, /@supports \(backdrop-filter:blur\(1px\)\) or \(-webkit-backdrop-filter:blur\(1px\)\)\{/);
  assert.match(css, /#hud \.p\{-webkit-backdrop-filter:none;backdrop-filter:none\}/, 'sem desfoque nos botões fixos (custo por quadro)');
  assert.match(css, /input\[type=search\]\{-webkit-appearance:none;appearance:none\}/);
  assert.match(sound, /if\(ac\.state!=='running'&&ac\.state!=='closed'\)ac\.resume\(\)\.catch\(\(\)=>\{\}\);return ac\};/);
  assert.match(voice, /ctx=a;if\(a\.state!=='running'\)a\.resume\(\)\.catch\(\(\)=>\{\}\);/, 'o microfone não fica mudo se o contexto nascer suspenso');
});

test('navegadores: copiar o código de recuperação funciona no Safari (a cópia sai dentro do clique)', () => {
  assert.match(base, /async function copyLater\(p\)\{/);
  assert.match(base, /cb\.write\(\[new ClipboardItem\(\{'text\/plain':t\.then\(/);
  assert.match(base, /await cb\.writeText\(v\);return v/, 'sem ClipboardItem, espera o texto e usa writeText');
  assert.ok(!/await recoveryCode\(\);let ok=false/.test(net), 'nada de esperar o código antes de copiar');
  assert.match(net, /p=recoveryCode\(\),ok=!!\(await copyLater\(p\)\)/);
  assert.match(panels, /\$\('#pfRecCp'\)\.onclick=async\(\)=>\{const ok=!!\(await copyLater\(recText\(\)\)\)/);
});

test('navegadores: a conexão do IndexedDB é refeita depois de falhar ou de o navegador fechá-la', () => {
  assert.match(ident, /d\.onclose = drop;/);
  assert.match(ident, /p\.catch\(\(\) => \{\n {6}if \(dbp === p\) dbp = null;/);
});

test('erros corrigidos: digitar na denúncia, botões de segurança, dica da câmera, chat e mascote', () => {
  // a área de texto da denúncia não tinha stopPropagation: espaço usava item e WASD andava enquanto se digitava
  assert.match(ui, /const typing=t=>!!t&&\(t\.tagName==='INPUT'\|\|t\.tagName==='TEXTAREA'\|\|t\.tagName==='SELECT'\|\|t\.isContentEditable\);/);
  assert.match(ui, /addEventListener\('keydown',e=>\{if\(typing\(e\.target\)\|\|e\.ctrlKey\|\|e\.metaKey\|\|e\.altKey\)return;/);
  // $ é querySelector: sem o #, os dois botões nunca eram ligados de novo depois do Keypass
  assert.match(panels, /for\(const id of \['#pfRotRec','#pfRotMain'\]\)if\(\$\(id\)\)\$\(id\)\.disabled=/);
  // a dica fica dentro de #ui, que é escalado pela Interface
  assert.match(ui, /camHint\.style\.left=x\/UZ\(\)\+'px';camHint\.style\.top=y\/UZ\(\)\+'px';/);
  // chat: quem rolou para ler o histórico não é puxado para o fim; a barra desenhada não é apagada nem herda a margem das linhas
  assert.match(net, /function chatNearEnd\(L\)\{return L\.scrollHeight-L\.scrollTop-L\.clientHeight<48\}/);
  assert.match(net, /function chatTrim\(L\)\{/);
  assert.match(social, /stick=chatNearEnd\(L\)\|\|m\.id===SO\.h;L\.append\(d\);chatTrim\(L\);/);
  assert.ok(!/children\.length>80\)L\.firstChild\.remove\(\)/.test(net + social));
  assert.match(css, /#log>div:not\(\.csb\)\{/);
  assert.match(css, /#glog>div:not\(\.csb\)\{/);
  // o mascote não tinha ✖
  assert.match(ui, /'pSeg','pPet','pFarm','pGift'\]\.forEach\(id=>\{const p=\$\('#'\+id\),g=p\.querySelector\('\.grip'\);/);
  // a barra de rolagem desenhada só mede de novo a área que mudou
  assert.match(scroll, /if \(hosts\.has\(n\)\) schedule\(n\);/);
});

test('barra de baixo numa linha no notebook, chat sempre acima dela e ícones dentro do espaço com Texto grande', () => {
  // com left:50% a barra só podia usar metade da tela e quebrava em duas linhas já em 1366 px
  assert.match(css, /#bar\{[^}]*left:50%;[^}]*width:max-content;max-width:calc\(100% - 16px\);/);
  assert.match(ui, /function chatAboveBar\(\)\{/);
  assert.match(ui, /p\.style\.top=\(p\.offsetTop\+dy\/z\)\+'px'\}\);chatAboveBar\(\)\}/, 'conferido junto com as outras janelas (resize, Interface, Texto)');
  assert.match(css, /\.emog \.slot\{width:46px;height:46px;font-size:min\(1\.5em,28px\)\}/);
  assert.match(css, /\.slot\{width:56px;height:56px;[^}]*font-size:min\(1\.9em,34px\);/);
  // janela alta (meia tela em pé): a câmera do menu se afasta e o avatar aparece inteiro ao lado do painel
  assert.match(ui, /const far=Math\.max\(0,1\.25-innerWidth\/innerHeight\)\*6;/);
});

test('Interface acima de 100 %: medidas da tela dentro de #ui descontam a escala', () => {
  for (const r of [
    '#items .mc{height:min(296px,calc(100vh / var(--ui) - 230px))}',
    '#klist{max-height:min(calc(62vh / var(--ui)),540px);',
    '#pDJ{width:min(380px,calc(100vw / var(--ui) - 24px))}',
    '#nlist{display:flex;flex-direction:column;gap:6px;max-height:min(calc(50vh / var(--ui)),320px);',
    '.rulesBox{max-width:560px;max-height:calc(100vh / var(--ui) - 32px);',
    '.termsBox{width:min(860px,calc(96vw / var(--ui)));max-height:min(calc(88vh / var(--ui)),900px);',
    '.perfil{width:min(calc(92vw / var(--ui)),340px)}'
  ])
    assert.ok(css.includes(r), r);
  assert.match(html, /id="pNotif"[^>]*width:min\(340px,calc\(100vw \/ var\(--ui\) - 24px\)\)/);
});

test('retorno: barra marca a janela aberta, Esc fecha, ajustes ficam guardados e ações sem resposta ganharam som e imagem', () => {
  assert.match(ui, /const M=\{bChat:'chat',bVid:'pVid',bDJ:'pDJ',bKar:'pKar',bEmo:'pEmo',bGes:'pEmo',/);
  assert.match(ui, /btn\.setAttribute\('aria-expanded',String\(on\)\)/);
  assert.match(ui, /if\(e\.key!=='Escape'\|\|e\.defaultPrevented\|\|mode!=='play'\)return;if\(typing\(e\.target\)\)\{e\.target\.blur\(\);return\}/);
  assert.match(ui, /\.p \.grip \.gmin/, 'Esc usa o próprio ✖ da janela');
  assert.match(ui, /const VIEW_KEY='skyke_view'/);
  assert.match(ui, /viewNum\(VIEW\.ui,\.8,1\.5\)/, 'valor guardado conferido antes de usar');
  assert.match(ui, /if\(!viewBoot\)fb\(e\.target,true\)/, 'sem som ao aplicar o que estava guardado');
  assert.match(pet, /function doAct\(a,b\)\{if\(PET\.busy\|\|mode!=='play'\)\{if\(b\)fb\(b,false\);return\}/);
  assert.match(pet, /const bt=PET\.btn&&PET\.btn\.isConnected\?PET\.btn:null;PET\.btn=null;fb\(bt,!!m\.ok\);/);
  for (const [src, id] of [[media, 'djurl'], [media, 'vurl'], [media, 'vurl2'], [panels, 'ksong']]) assert.ok(src.includes("fb($('#" + id + "'),false)"), id + ' treme com link inválido');
  assert.match(voice, /if\(!voiceOn\(\)\)\{const m=\$\('#mic'\);if\(m\)fb\(m,false\);/);
  assert.match(html, /<small id="vmsg" aria-live="polite">/);
  assert.match(html, /<small id="kmsg" aria-live="polite">/);
});

test('perfil público: página larga de computador, listas que rolam dentro da caixa e cores com contraste', () => {
  assert.match(profile, /main\{width:100%;max-width:1120px;margin:0 auto;/);
  assert.match(profile, /\.hero\{display:grid;grid-template-columns:auto minmax\(0,1fr\) auto;/, 'foto, nome e ações numa linha');
  assert.match(profile, /\.cols\{display:grid;grid-template-columns:minmax\(0,5fr\) minmax\(0,7fr\);/);
  assert.match(profile, /#gfl\{[^}]*grid-template-columns:repeat\(auto-fill,minmax\(17rem,1fr\)\);[^}]*max-height:24rem\}/, 'presentes em colunas, rolando dentro da caixa');
  for (const id of ['bdl', 'gfl', 'gbl']) assert.match(profile, new RegExp('<ul id="' + id + '" class="scr" tabindex="0" aria-label="'), id + ': rolável pelo teclado');
  assert.match(profile, /@media \(max-width:860px\)\{/, 'janela estreita ou zoom alto: uma coluna');
  assert.match(profile, /<meta name="color-scheme" content="light dark">/);
  assert.match(profile, /<main>\n/, 'a página inteira não é mais uma região que se anuncia sozinha');
  assert.match(profile, /\$\('fmx'\)\.setAttribute\('aria-valuenow', String\(pc\)\);/);
  assert.match(profile, /badges\.slice\(0, 40\)/, 'todos os emblemas (antes 12)');
  const light = vars(profile, ':root'),
    dark = vars(profile, ':root[data-theme=dark]');
  assert.ok(ratio(light.acc, light.card) >= 4.5, 'links e botão principal no tema claro: ' + ratio(light.acc, light.card).toFixed(2));
  assert.ok(ratio(light.mut, light.card) >= 4.5);
  assert.ok(ratio(dark.acc, dark.card) >= 4.5);
});

test('fazenda e status: largura de computador, lista de plantas rolável e cores com contraste', () => {
  assert.match(farm, /@media \(min-width:900px\)\{main\{max-width:1120px\}/);
  assert.match(farm, /#grow\{[^}]*max-height:24rem;overflow-y:auto/);
  assert.match(farm, /#map\{[^}]*max-height:calc\(100vh - 140px\)/, 'o mapa cabe na altura da janela');
  assert.match(farm, /<ul id="bdl" tabindex="0" aria-label="Conquistas">/);
  const fl = vars(farm, ':root');
  assert.ok(ratio(fl.ready, fl.card) >= 4.5, '"pronta!" no tema claro: ' + ratio(fl.ready, fl.card).toFixed(2));
  assert.match(status, /--er:#ff7a7a\}/);
  assert.match(status, /--er:#b3261e\}\}/, 'erro legível no tema claro');
  assert.ok(!/#err\{color:#ff7a7a|\.er\{color:#ff7a7a/.test(status));
  assert.match(status, /pl\.style\.stroke=c\[2\]/, 'linhas do gráfico nas cores do tema');
  assert.match(status, /new Date\(\)\.toLocaleTimeString\('pt-BR'\)/);
});
