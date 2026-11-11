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
