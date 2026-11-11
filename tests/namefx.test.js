'use strict';
// Nome personalizado (cor e efeito, aba ✨ Nome do editor), rosto com óculos e a bochecha que não invade mais o olho.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../assets/catalog.js');
const V = require('../lib/validate.js');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const avatar = read('assets/app-avatar.js'),
  net = read('assets/app-net.js'),
  css = read('assets/app.css');

const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('nome: paleta legível nos dois temas (como está no escuro; 50 % com preto no claro) e efeitos com nome próprio', () => {
  assert.strictEqual(C.NCOL.length, 13, 'cor 0 = a do tema + 12 cores');
  for (const h of C.NCOL.slice(1)) {
    assert.ok(ratio(rgb(h), rgb('#2a231c')) >= 4.5, h + ' no painel escuro');
    assert.ok(ratio(rgb(h).map(v => v * 0.5), rgb('#fffaf0')) >= 4.5, h + ' (50 % preto) no painel claro');
  }
  assert.match(css, /:root\[data-theme=light\]\{--nk:50%;/, 'no claro a cor vai misturada ao preto');
  assert.match(css, /#start\{--nk:100%;/, 'a tela inicial é sempre escura: a prévia não escurece');
  assert.deepStrictEqual(C.NFX.slice(0, 9), ['Nenhum', 'Brilho', 'Neon', 'Degradê', 'Aurora', 'Arco-íris', 'Cintilar', 'Relevo', 'Cometa'], 'os efeitos antigos não mudam de posição');
  assert.deepStrictEqual(C.NFX.slice(9), ['Holograma', 'Fogo', 'Gelo', 'Ouro', 'Pulsar', 'Nebulosa'], 'efeitos novos entram no fim');
  // efeitos novos: toda cor fixa é da paleta NCOL (já conferida acima nos dois temas) e vai misturada com --nk como as outras
  for (let i = 9; i < C.NFX.length; i++) {
    const rule = (css.match(new RegExp('\\.nf' + i + '\\{[^}]*\\}')) || [''])[0];
    assert.ok(rule, 'regra do efeito ' + C.NFX[i]);
    for (const m of rule.matchAll(/color-mix\(in srgb,(#[0-9a-f]{6}) var\(--nk\),#000\)/g)) assert.ok(C.NCOL.includes(m[1]), C.NFX[i] + ': ' + m[1] + ' não é da paleta de nomes');
    assert.deepStrictEqual((rule.match(/#[0-9a-f]{6}/g) || []).filter(h => !C.NCOL.includes(h)), [], C.NFX[i] + ': só cores da paleta');
    assert.ok(!/font-size|letter-spacing|transform|filter/.test(rule), C.NFX[i] + ': não mexe no tamanho nem usa filtro (leve e legível)');
  }
  assert.match(css, /@keyframes nfPulse\{/);
  for (let i = 1; i < C.NFX.length; i++) assert.match(css, new RegExp('\\.nf' + i + '\\b'), 'estilo do efeito ' + C.NFX[i]);
});

test('nome: o servidor aceita só cor e efeito do catálogo (campos do visual como os outros)', () => {
  assert.strictEqual(C.CR.nc, C.NCOL.length);
  assert.strictEqual(C.CR.nf, C.NFX.length);
  const ok = V.cleanCfg({ nc: C.NCOL.length - 1, nf: C.NFX.length - 1 });
  assert.strictEqual(ok.nc, C.NCOL.length - 1);
  assert.strictEqual(ok.nf, C.NFX.length - 1);
  assert.strictEqual(V.cleanCfg({ nc: C.NCOL.length }), null, 'cor fora da paleta');
  assert.strictEqual(V.cleanCfg({ nf: -1 }), null, 'efeito negativo');
  assert.strictEqual(V.cleanCfg({ nf: 1.5 }), null, 'efeito não inteiro');
  assert.strictEqual(V.cleanCfg({}).nf, 0, 'sem escolha, sem efeito');
});

test('nome: efeito no rótulo e no chat da sala, só no nome (ícones fora), desligado no alto contraste e sem movimento se pedido', () => {
  assert.match(avatar, /function nameFx\(el,c\)\{/);
  assert.match(avatar, /nn\.textContent=a\.name;nameFx\(nn,c\);a\.nm\.append\(nn\);if\(a\.bot\)a\.nm\.append\(' 🤖'\)/, 'rótulo: o efeito vai num span só com o nome');
  assert.match(avatar, /fx=c\?\(c\.nc\|0\)\+'\.'\+\(c\.nf\|0\):''/, 'o rótulo se refaz quando cor ou efeito mudam');
  assert.match(net, /function say\(n,t,sys,id\)/);
  assert.match(net, /say\(m\.name,m\.text,0,m\.id\)/, 'chat da sala com o efeito de quem escreveu');
  assert.match(net, /\{g:3,k:'nc',n:'Cor do nome',c:NCOL\},\{g:3,k:'nf',n:'Efeito do nome',v:NFX\}/, 'aba ✨ Nome no editor');
  assert.match(net, /'✨ Nome'\]/);
  assert.match(net, /class="npv"/, 'prévia do nome');
  assert.match(read('assets/app-base.js'), /FACES,NCOL,NFX,EMO/, 'as listas novas saem de SKYCAT');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.nfx\{animation:none!important\}\}/);
  assert.match(css, /:root\[data-hc=on\] \.nfx\{color:var\(--fg\)!important;-webkit-text-fill-color:currentColor;background:none!important;text-shadow:none!important;animation:none!important\}/);
  assert.match(read('tools/contrast-audit.js'), /await run\('nomes coloridos'\)/, 'a auditoria de contraste mede as cores de nome');
});

test('rostos: bochecha abaixo do olho e fora do sorriso; novo rosto com óculos no fim da lista', () => {
  const m = avatar.match(/if\(fc===7\)for\(const sd of\[-1,1\]\)put\(bl,el\(x,y,sd\*\.(\d+),-\.(\d+),\.(\d+),\.(\d+)\)\)/);
  assert.ok(m, 'bochecha encontrada');
  const [cx, cy, rx, ry] = m.slice(1).map(s => +('.' + s));
  // olho: centro (±0,13; 0,06), raios 0,095 × 0,11, contorno de 0,011 → desce até y = -0,061
  assert.ok(-cy + ry < -0.061 - 0.015, 'a bochecha fica abaixo do olho, com folga: topo em ' + (-cy + ry).toFixed(3));
  assert.ok(cx - rx > 0.12, 'e fora do sorriso (|x| < 0,12): começa em ' + (cx - rx).toFixed(3));
  assert.strictEqual(C.FACES[12], 'Óculos');
  assert.match(avatar, /if\(fc===12\)\{const lq=el\(x,y,ex,\.06,\.122,\.128\)/, 'armação redonda em volta de cada olho');
  assert.match(avatar, /gap=Math\.max\(lq,-\(el\(x,y,ex,\.06,\.095,\.11\)-\.011\)\)/, 'lente só fora do olho (não acinzenta a íris)');
  assert.match(avatar, /else if\(fc===12\)put\(red,arc\(mx,my,0,0,\.085,\.024,false\)\)/, 'sorriso abaixo da armação');
});

test('nome: o visual inicial já tem cor e efeito (0) e o cliente nunca manda campo vazio (antes travava criar e entrar na sala)', () => {
  assert.match(read('assets/app-base.js'), /const cfg=\{name:'Visitante',style:'amazora',br:0,nc:0,nf:0,\.\.\.randomLook\(\)\}/);
  assert.match(net, /function fixCfg\(\)\{EDS\.forEach\(d=>\{const n=\(d\.c\|\|d\.v\)\.length,x=cfg\[d\.k\];if\(!Number\.isInteger\(x\)\|\|x<0\|\|x>=n\)cfg\[d\.k\]=0\}\);return cfg\}/);
  assert.match(net, /send\(\{t:'cfg',cfg:\{\.\.\.fixCfg\(\)\}\}\)/, 'mudança de visual dentro da sala');
  assert.match(net, /cfg:\{\.\.\.fixCfg\(\)\},token:id\.token/, 'criar e entrar na sala');
  assert.match(net, /cfg\[d\.k\]=\(\(cfg\[d\.k\]\|0\)\+ \+b\.dataset\.d\+n\)%n/, 'o seletor ◀ ▶ não faz conta com valor vazio');
  // o que acontecia: o servidor recusa o visual com um campo null (e com ele o create/join inteiro)
  assert.strictEqual(V.cleanCfg({ nc: 7, nf: null }), null);
});

test('nome: cria e entra na sala com cor e efeito, e os outros recebem o nome personalizado', { skip: require('./harness.js').missing() }, async t => {
  const H = require('./harness.js');
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  const send = (c, m) => c.ws.send(JSON.stringify(m));
  const look = { ...V.cleanCfg({}), nc: 7, nf: 2, fc: 12 };
  const a = await H.connect(srv.port, '203.0.113.171'), b = await H.connect(srv.port, '203.0.113.172');
  t.after(() => { a.ws.close(); b.ws.close(); });
  send(a, { t: 'create', style: 'amazora', bots: 0, name: 'Estrela', cfg: look });
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'joined'), 3000), 'criou a sala');
  const code = a.msgs.find(m => m.t === 'joined').code;
  send(b, { t: 'join', code, name: 'Cometa', cfg: { ...look, nc: 3, nf: 8 } });
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'joined'), 3000), 'entrou na sala');
  assert.ok(await H.until(() => a.msgs.some(m => m.t === 'pj' && m.p.name === 'Cometa'), 3000));
  const pj = a.msgs.find(m => m.t === 'pj' && m.p.name === 'Cometa');
  assert.deepStrictEqual([pj.p.cfg.nc, pj.p.cfg.nf], [3, 8], 'quem já estava vê a cor e o efeito de quem entrou');
  const me = b.msgs.find(m => m.t === 'joined').players.find(p => p.name === 'Estrela');
  assert.deepStrictEqual([me.cfg.nc, me.cfg.nf, me.cfg.fc], [7, 2, 12], 'quem entrou vê o nome e o rosto de quem já estava');
  // trocar o efeito dentro da sala chega aos outros
  send(a, { t: 'cfg', cfg: { ...look, nf: 4 } });
  assert.ok(await H.until(() => b.msgs.some(m => m.t === 'cfg' && m.cfg && m.cfg.nf === 4), 3000), 'mudança dentro da sala');
});

test('rótulos: com a sala cheia os nomes não se empilham (sobem um degrau ou ficam transparentes), do mais perto para o mais longe', () => {
  const ui = read('assets/app-ui.js');
  assert.match(ui, /vis\.sort\(\(p,q\)=>p\.d-q\.d\)/, 'do mais perto da câmera para o mais longe (o meu primeiro)');
  assert.match(ui, /d:a===me\?-1:v3\.z/);
  assert.match(ui, /for\(let k=0;k<3;k\+\+\)\{const y=v\.y-k\*h;if\(!hit\(/, 'até dois degraus acima');
  assert.match(ui, /if\(!fade\)placed\.push\(/, 'rótulo transparente não ocupa espaço');
  assert.match(ui, /if\(a\._lwk!==a\._lk\)\{a\._lwk=a\._lk;a\._lw=a\.el\.offsetWidth;/, 'só mede quando o texto muda');
  assert.match(css, /\.lbl\.lblf\{opacity:\.35\}\.lbl\.lblf\.talk\{opacity:1\}/, 'quem fala continua inteiro');
});
