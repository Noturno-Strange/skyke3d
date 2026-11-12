'use strict';
// Regressões achadas pela auditoria de interface (tools/ui-audit.js) e a ligação das telas novas (presentes e Keypass) no cliente.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html'),
  css = read('assets/app.css'),
  cook = read('assets/app-cook.js'),
  farm = read('assets/app-farm.js'),
  gift = read('assets/app-gift.js'),
  net = read('assets/app-net.js'),
  ui = read('assets/app-ui.js'),
  social = read('assets/app-social.js'),
  panels = read('assets/app-panels.js'),
  ident = read('assets/identity.js'),
  readme = read('README.md');
const scripts = fs.readdirSync(path.join(root, 'assets')).filter(f => /^app-.*\.js$/.test(f));

test('abas: cada painel liga os cliques na PRÓPRIA lista de abas (as da Culinária ficavam mudas: pegavam a primeira da página)', () => {
  assert.match(cook, /el\('#pCook \.cktabs'\)\.onclick=/);
  assert.match(cook, /el\('#pCook \.cktabs'\)\.onkeydown=/);
  assert.match(farm, /el\('#pFarm \.cktabs'\)\.onclick=/);
  assert.match(gift, /el\('#pGift \.cktabs'\)\.onclick=/);
  for (const f of scripts) assert.ok(!/(\$|el)\('\.cktabs'\)/.test(read('assets/' + f)), f + ': seletor de abas sem o painel');
  // três painéis usam a mesma classe: sem o id do painel, só o primeiro do HTML responderia
  assert.strictEqual((html.match(/class="cktabs"/g) || []).length, 3);
  // cada aba aponta para um painel de conteúdo que existe
  for (const m of html.matchAll(/role="tab"[^>]*aria-controls="(\w+)"/g)) assert.match(html, new RegExp('id="' + m[1] + '"[^>]*role="tabpanel"'), m[1]);
});

test('painéis laterais cabem na tela entre 481 e 700 px e em tablet em pé (saíam 10 px pela esquerda)', () => {
  const block = css.slice(css.indexOf('@media (max-width:700px),(max-aspect-ratio:1/1){'));
  assert.match(block.slice(0, 1200), /\.side\{width:calc\(100% - 24px\);box-sizing:border-box\}/, 'a largura conta a borda e o preenchimento');
  assert.match(css, /\.cook\{[^}]*max-width:calc\(100% - 24px\)[^}]*box-sizing:border-box/, 'culinária, fazenda e presentes nunca passam da tela');
  // contraste achado pela auditoria (tools/contrast-audit.js): moedas da fazenda no tema claro e a tela inicial no alto contraste
  assert.match(css, /\.ckl small\.fmcoins\{opacity:1\}/);
  assert.match(css, /:root\[data-hc=on\] \.iBtn\.dc,:root\[data-hc=on\] \.iBtn\.ln\{background:#000;color:#fff;border:2px solid #fff\}:root\[data-hc=on\] \.iFoot\{opacity:1\}/);
  const audit = read('tools/contrast-audit.js');
  for (const b of ['bFarm', 'bGift', 'bCook']) assert.ok(audit.includes("'" + b + "'"), 'a auditoria de contraste abre ' + b);
});

test('presentes: botão na barra, painel com abas e o script dentro de uma função, depois da fazenda e da culinária', () => {
  assert.match(html, /<button id="bGift"[^>]*aria-controls="pGift">🎁<\/button>/);
  assert.match(html, /<div id="pGift" class="p side cook gift hide" role="dialog" aria-label="Presentes">/);
  for (const i of ['gft0', 'gft1', 'gft2', 'gfP0', 'gfP1', 'gfP2', 'gfBox', 'gfDet', 'gfTo', 'gfLeft', 'gfq', 'gfL', 'gfSend', 'gfRes', 'gfWho', 'gfOther', 'gfGive']) assert.match(html, new RegExp('id="' + i + '"'), i);
  assert.ok(html.indexOf('/assets/app-gift.js') > html.indexOf('/assets/app-farm.js'), 'usa farmHas e cookHas');
  assert.match(gift, /^\(\(\)=>\{$/m);
  assert.match(gift, /\}\)\(\);\s*$/);
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(gift), 'nome de quem enviou nunca vira HTML');
  const sent = [...new Set([...gift.matchAll(/t:'(\w+)'/g)].map(m => m[1]))].sort();
  assert.deepStrictEqual(sent, ['giftdel', 'giftget', 'giftsee', 'giftsend'], 'o painel só manda as mensagens de presente');
  assert.match(gift, /send\(\{t:'giftsend',to:GF\.to,k:GF\.sel\.slice\(0,i\),i:GF\.sel\.slice\(i\+1\),rid:GF\.rid\}\)/, 'só destinatário, tipo, item e rid: quem envia e o nome saem da sessão');
});

test('presentes: ligações com a rede, os painéis, a lista de amigos, a fazenda e a culinária', () => {
  assert.match(net, /case 'gifts':case 'giftbox':case 'giftr':case 'giftin':if\(window\.giftMsg\)window\.giftMsg\(m\);break;/);
  assert.match(net, /function tog\(id\)\{\[[^\]]*'#pGift'/, 'abrir outro painel fecha o de presentes');
  assert.strictEqual((ui.match(/'pGift'/g) || []).length, 3, 'arrastável, com ✖ e mantido dentro da tela');
  assert.match(social, /if\(window\.giftBoot\)window\.giftBoot\(\)/, 'pede a caixa ao entrar (aviso de presentes novos)');
  assert.strictEqual((social.match(/btn\('🎁 Presentes'/g) || []).length, 2, 'ação em 👥 para amigos e para quem está na sala');
  assert.match(social, /async function giftOf\(id,n\)\{const pp=await ppOf\(id\);if\(pp&&window\.giftTo\)giftTo\(pp,n\)\}/);
  assert.match(farm, /window\.farmHas=id=>/);
  assert.match(gift, /window\.farmHas&&farmHas\(id\)/);
  assert.match(gift, /window\.cookHas&&cookHas\(id\)/);
  assert.match(gift, /location\.hash\.match\(\/presente=\(\[0-9a-f\]\{20\}\)\/\)/, 'o link do perfil público escolhe o destinatário');
  assert.match(gift, /ntAdd\('gift',txt,/, 'aviso no sino');
  assert.match(css, /#bGift\.gfnew::after\{/, 'bolinha no botão com presente novo');
});

test('presentes: dois toques para enviar e para tirar da caixa; nada roda com o painel fechado', () => {
  assert.match(gift, /if\(Date\.now\(\)-GF\.okAt>5000\)\{GF\.okAt=Date\.now\(\);drawSend\(\);return\}/);
  assert.match(gift, /if\(Date\.now\(\)-GF\.rmAt>5000\)\{GF\.rmAt=Date\.now\(\);b\.textContent='Tocar de novo: some para sempre';return\}/);
  assert.ok(!/setInterval/.test(gift), 'sem relógio próprio: só reage a mensagens e a cliques');
  assert.ok(!/resgat|retirar para|mochila\b[^.]*enviar/i.test(gift.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')), 'não há resgate');
});

test('Keypass no cliente: confere com o servidor antes de pedir o código atual e de mostrar um código novo', () => {
  const rot = ident.slice(ident.indexOf('async function rotateRecovery(profile)'), ident.indexOf('async function revokeSessions()'));
  const iBlock = rot.indexOf('keypassBlock()'),
    iOld = rot.indexOf("needRecovery('rotate-recovery')"),
    iShow = rot.indexOf('ui.confirmNew');
  assert.ok(iBlock > 0 && iBlock < iOld && iOld < iShow, 'ordem: Keypass, depois o código atual, depois mostrar o novo');
  assert.match(rot, /const s = await auth\('join'\);/, 'situação nova do servidor, não a guardada');
  assert.match(ident, /if \(s\.kp\) setKeypass\(s\.kp\);/);
  assert.match(ident, /keypass: \(\) => \(keypass \? \{ \.\.\.keypass \} : null\)/);
  assert.ok(!/localStorage[^\n]*keypass|idbPut[^\n]*keypass/i.test(ident), 'o Keypass não é guardado no aparelho: vale o que o servidor diz');
  assert.match(html, /<small id="pfKp" class="pfkp" role="status"><\/small>/);
  assert.match(panels, /restam '\+k\.left\+' renovações/);
  assert.match(panels, /fale com o administrador do servidor/);
  assert.match(panels, /if\(\$\('#pfRotRec'\)&&\(out\|\|wait\)\)\$\('#pfRotRec'\)\.disabled=true/, 'sem renovação disponível o botão fica desligado');
  assert.match(net, /c==='keypass-limit'/);
  assert.match(net, /c==='keypass-wait'/);
});

test('termos: a versão do aceite acompanha a data da política (a caixa de presentes é um dado novo)', () => {
  const priv = read('privacidade.html');
  const d = /versão de (\d\d)\/(\d\d)\/(\d{4})/.exec(priv),
    v = /const TERMS_VER='(\d{4})-(\d\d)-(\d\d)\.\d+'/.exec(net);
  assert.ok(d && v);
  assert.deepStrictEqual([v[1], v[2], v[3]], [d[3], d[2], d[1]]);
  assert.match(priv, /<td>Presentes \(opcional\)<\/td>/);
  assert.match(priv, /não vai para a mochila nem vira moeda/);
});

test('ferramentas: auditoria de interface e medição da voz existem, estão no README e não gravam em data/', () => {
  for (const f of ['tools/ui-audit.js', 'tools/voice-bench.js']) {
    const src = read(f);
    assert.match(readme, new RegExp('node ' + f.replace('.', '\\.')), f + ' no README');
    assert.match(src, /GIFTS_FILE: '0'/);
    assert.match(src, /IDENTITY_FILE: '0'/);
  }
  const audit = read('tools/ui-audit.js');
  assert.ok((audit.match(/\{ n: '/g) || []).length >= 9, 'pelo menos 9 combinações de tela, zoom e ajustes');
  for (const w of ['fora da tela', 'rolagem horizontal', 'alvo pequeno', 'não fechou', 'não mostrou o conteúdo', 'Runtime.exceptionThrown']) assert.ok(audit.includes(w), w);
});

test('chat: marcador de lotação ao lado de Sala, com o limite que o servidor informa', () => {
  const server = read('server.js');
  assert.match(server, /max: MAX,\n {4}players:/, 'o joined leva o limite da sala');
  assert.match(server, /for \(const r of rooms\.values\(\)\) bc\(r, \{ t: 'cap', max: MAX \}\);/, 'mudar a capacidade no painel avisa as salas');
  assert.match(net, /function roomBadge\(\)\{const b=\$\('#ctS'\);if\(!b\)return;const n=roomCount\(\);/);
  assert.match(net, /function roomCount\(\)\{let n=mode==='play'\?1:0;for\(const a of actors\.values\(\)\)if\(!a\.bot\)n\+\+;return n\}/, 'conta você e os outros jogadores; bots não contam');
  assert.match(net, /c\.textContent='👥 '\+\(ROOM_MAX\?n\+'\/'\+ROOM_MAX:String\(n\)\)/, 'selo próprio, com o ícone');
  assert.match(css, /\.ctab \.rn\{display:inline-block;[^}]*font-size:\.95em[^}]*background:#1d1a16;color:#fff6e8/, 'legível (antes ~9 px), com cores próprias que passam no contraste em todos os temas');
  assert.match(net, /'Você entrou na sala '\+fmtCode\(roomCode\)\+\(ROOM_MAX\?' \('\+roomCount\(\)\+' de '\+ROOM_MAX\+' pessoas\)':''\)/, 'a lotação também vai na mensagem de entrada');
  assert.match(net, /case 'cap':roomMax\(m\.max\);break;/);
  assert.match(net, /case 'pj':addActor\(m\.p\);roomBadge\(\);/);
  assert.match(net, /delActor\(m\.id\);roomBadge\(\);break\}/);
  assert.match(net, /ROOM_MAX=Number\.isInteger\(m\.max\)&&m\.max>=2&&m\.max<=99\?m\.max:0;/, 'valor estranho do servidor vira "sem limite conhecido"');
  assert.match(net, /mode='play';roomBadge\(\);/);
});

test('construções com porta: a porta cabe um avatar em pé em qualquer escala usada, e os vizinhos não encostam', () => {
  const colony = read('assets/app-colony.js'),
    scene = read('assets/app-scene.js');
  const c = /const AVATAR_H=([\d.]+),DOOR_H=([\d.]+),DOOR_W=([\d.]+);/.exec(colony);
  assert.ok(c, 'medidas da porta num lugar só');
  const [avatar, doorH, doorW] = c.slice(1).map(Number);
  assert.strictEqual(avatar, 2.5, 'altura medida do avatar (pé ao topo do cabelo)');
  // escala de cada peça = escala no núcleo × escala do mundo × 1,12
  const nuclei = colony.slice(colony.indexOf('const NUCLEI='), colony.indexOf('/** Núcleos por mundo'));
  const kits = [...colony.slice(colony.indexOf('const KITS='), colony.indexOf('const PROP_R=')).matchAll(/,s:([\d.]+)/g)].map(m => +m[1]);
  const minKit = Math.min(...kits) * 1.12;
  const R = Object.fromEntries([...colony.slice(colony.indexOf('const PROP_R=')).split('\n')[0].matchAll(/(\w+):([\d.]+)/g)].map(m => [m[1], +m[2]]));
  let doors = 0;
  for (const m of nuclei.matchAll(/\['(habPod|labHut)',[-\d.]+,[-\d.]+,[-\d.]+,([\d.]+)\]/g)) {
    doors++;
    const h = (m[1] === 'labHut' ? doorH - 0.05 : doorH) * +m[2] * minKit;
    assert.ok(h >= avatar + 0.1, m[1] + ' na escala ' + m[2] + ': porta de ' + h.toFixed(2) + ' m');
    assert.ok(doorW * +m[2] * minKit >= 1.05, m[1] + ': largura da porta');
  }
  assert.ok(doors >= 5, 'módulos e postos conferidos: ' + doors);
  assert.match(colony, /B\(DOOR_W,DOOR_H,\.08,DK,-\.75,\.45\+DOOR_H\/2,1\.12\)/, 'módulo: a porta começa na soleira');
  assert.match(colony, /B\(3\.4,3\.2,2\.2,H,0,1\.95,0\)/, 'módulo: o casco inteiro cresceu com a porta (3,2 m de altura)');
  assert.match(colony, /C\(1\.8,2\.7,H,0,1\.75,0\)/, 'posto: parede de 2,7 m');
  // casa lunar: vão em arco mais alto que o avatar
  const arch = /dr=arch\(([\d.]+),([\d.]+),/.exec(scene);
  assert.ok(arch && +arch[2] >= avatar + 0.4 && +arch[1] >= 2, 'casa: vão de ' + (arch && arch[2]) + ' m');
  // vizinhança: dentro de cada núcleo, nenhuma peça entra no raio reservado da outra, e ninguém sai do espaço do núcleo
  const NUC_R = +/const NUCLEUS_R=([\d.]+)/.exec(colony)[1];
  for (const line of nuclei.split('\n').filter(l => /^ \w+:\[/.test(l))) {
    const name = line.trim().split(':')[0];
    const ps = [...line.matchAll(/\['(\w+)',([-\d.]+),([-\d.]+),[-\d.]+,([\d.]+)\]/g)].map(m => ({ n: m[1], x: +m[2], z: +m[3], r: (R[m[1]] || 1) * +m[4] }));
    for (let i = 0; i < ps.length; i++) {
      if (/habPod|labHut/.test(line)) assert.ok(Math.hypot(ps[i].x, ps[i].z) + ps[i].r * 0.6 <= NUC_R + 0.5, name + ': ' + ps[i].n + ' dentro do espaço do núcleo');
      for (let j = i + 1; j < ps.length; j++)
        if (/habPod|labHut/.test(ps[i].n + ps[j].n)) {
          const d = Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z);
          assert.ok(d >= (ps[i].r + ps[j].r) * 0.95, name + ': ' + ps[i].n + ' e ' + ps[j].n + ' a ' + d.toFixed(2) + ' m (raios ' + ps[i].r.toFixed(2) + ' + ' + ps[j].r.toFixed(2) + ')');
        }
    }
  }
});

test('aviso do YouTube: genérico, vale para vídeo e karaokê (antes citava o karaokê ao abrir um vídeo)', () => {
  const yt = html.slice(html.indexOf('<div id="pYt"'), html.indexOf('<div id="pNotif"'));
  assert.ok(yt.includes('▶️ Conteúdo do YouTube') && yt.includes('Este conteúdo é exibido pelo player do <b>YouTube (Google)</b>'));
  assert.doesNotMatch(yt, /karaok/i, 'o aviso não fala de karaokê nem de vídeo em particular');
  const media = read('assets/app-media.js');
  assert.ok(media.includes("say('','▶️ Conteúdo não aberto: ele precisa do player do YouTube. O aviso aparece de novo da próxima vez.',1)"));
  assert.doesNotMatch(media, /Os vídeos e o karaokê precisam/);
});

test('tutorial: nomes iguais aos da tela (🎬 Vídeos, abas do chat) e o marcador de lotação explicado', () => {
  assert.ok(html.includes('Assistam juntos! Em <b>🎬 Vídeos</b>') && html.includes('<h3 class="grip">⠿ 🎬 Vídeos</h3>'));
  assert.ok(!html.includes('Música/Vídeo'), 'o painel não se chama mais Música/Vídeo');
  assert.ok(!html.includes('aba azul'), 'a aba selecionada usa a cor de destaque, não azul');
  assert.ok(html.includes('o <b>👥</b> mostra quantas pessoas estão na sala e o limite dela'));
});
