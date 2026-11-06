'use strict';
// Vida do cenário (assets/app-life.js): chuva passageira por bioma, estrela cadente, bichos 2D de cada bioma, partículas do ar por
// bioma, luz da fogueira conforme a claridade do chão e a ilha seca no alagado.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../assets/catalog.js');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const life = read('assets/app-life.js'),
  scene = read('assets/app-scene.js'),
  sound = read('assets/app-sound.js'),
  ui = read('assets/app-ui.js'),
  base = read('assets/app-base.js'),
  html = read('index.html');
const worlds = Object.keys(C.ST);
const line = re => life.match(re)[0];

/** roda o sorteio da chuva e da estrela isolado (só precisa do hash e das tabelas) */
function clock() {
  const ctx = vm.createContext({ Math });
  vm.runInContext(
    [line(/const ih=n=>\{[^\n]*\};/), line(/const ksOf=[^\n]*;/), line(/const RAIN=\{[^\n]*\};/), line(/const RWIN=[^\n]*;/),
      life.slice(life.indexOf('function rainAt'), life.indexOf('function rainMesh')), line(/const SWIN=[^\n]*;/)]
      .join('\n').replace(/\bconst /g, 'var ') + '\nthis.rainAt=rainAt;this.ih=ih;',
    ctx
  );
  return ctx;
}

test('vida: script próprio, carregado antes do avatar (que monta a primeira sala) e ligado ao buildRoom e ao laço', () => {
  assert.ok(html.indexOf('/assets/app-colony.js') < html.indexOf('/assets/app-life.js') && html.indexOf('/assets/app-life.js') < html.indexOf('/assets/app-avatar.js'));
  assert.match(life, /\n\(\(\)=>\{\n/, 'tudo dentro de uma função (nada vaza para o escopo global)');
  assert.match(life, /window\.lifeBuild=k=>/);
  assert.match(life, /window\.lifeTick=dt=>/);
  assert.match(scene, /q\.receiveShadow=true\}\);lifeBuild\(k\)\}/, 'buildRoom cria a vida do bioma no fim');
  assert.match(ui, /emberTick\(t\);lifeTick\(dt\);/, 'o laço anima a cada quadro');
  assert.ok(!/window\.lifeArt|lifeScan/.test(life), 'sem ganchos de depuração nem varredura duplicada');
  assert.match(life, /for\(const o of FOOT\)/, 'os animais desviam das pegadas que declutter deixou');
});

test('chuva: passageira, com chance e duração por bioma, igual para todos (hash inteiro, não seno) e entrando aos poucos', () => {
  const ctx = clock();
  assert.ok(!/Math\.sin/.test(line(/const ih=n=>\{[^\n]*\};/)) && /Math\.imul/.test(line(/const ih=n=>\{[^\n]*\};/)), 'hash inteiro: o seno pode variar entre navegadores');
  const t0 = 1793900000,
    frac = {};
  for (const k of worlds) {
    let on = 0,
      n = 0;
    for (let t = t0; t < t0 + 86400 * 4; t += 20) {
      const w = ctx.rainAt(k, t);
      assert.ok(w >= 0 && w <= 1, k + ' intensidade fora de 0..1');
      n++;
      if (w > 0) on++;
    }
    frac[k] = on / n;
  }
  // floresta úmida chove mais; o pampa e o cerrado de vez em quando; a caatinga quase nunca; nenhum bioma fica com chuva o tempo todo
  assert.ok(frac.amazora > frac.atlanthia && frac.atlanthia > frac.panthara && frac.panthara > frac.cerron && frac.cerron > frac.caatara, JSON.stringify(frac));
  for (const k of worlds) assert.ok(frac[k] > 0 && frac[k] < 0.4, k + ': ' + frac[k]);
  // entra e sai aos poucos: de um segundo para o outro a intensidade muda no máximo 1/8
  for (let t = t0; t < t0 + 86400; t++) assert.ok(Math.abs(ctx.rainAt('amazora', t + 1) - ctx.rainAt('amazora', t)) <= 1 / 8 + 1e-9);
  // céu fechado com a mesma conta do ajuste de brilho; sol e planetas somem atrás das nuvens; som próprio e calibrado
  assert.match(life, /hemi\.intensity=T\.h\[2\]\*\.8\*LGH\*BRI\*\(1-\.22\*w\)/);
  assert.match(life, /for\(const\[m,o\]of L\.sun\)m\.opacity=o\*\(1-\.85\*w\)/);
  assert.match(base, /skyG\.children\[skyG\.children\.length-1\]\.userData\.sun=1/, 'o sol fica marcado no céu');
  assert.match(sound, /function rainSnd\(w\)\{/);
  assert.match(sound, /const TRIM=\{rain:[\d.]+,/, 'volume da chuva calibrado (tools/audio-audit.js mede a chuva)');
  assert.match(read('tools/audio-audit.js'), /k: 'chuva', rain: 1/);
});

test('estrela cadente: de vez em quando, na faixa do céu que a câmera vê, acima das montanhas e nunca na chuva forte', () => {
  const ctx = clock();
  const [, win] = life.match(/const SWIN=(\d+),SDUR=([\d.]+);/);
  let n = 0;
  for (let s = 0; s < 1000; s++) if (ctx.ih(s * 31337 + 11) < 0.5) n++;
  const perMin = (n / 1000) * (60 / +win);
  assert.ok(perMin > 0.4 && perMin < 1.2, 'uma a cada ~1 a 2 min: ' + perMin.toFixed(2) + '/min');
  const m = life.match(/e:\.(\d+)\+ih\(s\*389\+2\)\*\.(\d+),daz:[^,]*,de:-\.(\d+)/);
  const e0 = +('.' + m[1]), de = +('.' + m[2]), fall = +('.' + m[3]), deg = r => (r * 180) / Math.PI;
  assert.ok(deg(e0 + de) <= 14, 'começa abaixo do topo da tela (~13°): ' + deg(e0 + de).toFixed(1));
  assert.ok(deg(e0 - fall) >= 5.8, 'termina acima das montanhas (4,2°) e dos planetas mais baixos: ' + deg(e0 - fall).toFixed(1));
  assert.match(life, /if\(isRm\(\)\|\|L\.w>\.3\|\|/, 'sem estrela com reduzir movimento ou chuva forte');
});

test('bichos 2D: aves e animais de chão próprios de cada bioma, poucos, com sombra e respeitando reduzir movimento', () => {
  const fauna = vm.runInNewContext('(' + life.match(/const FAUNA=(\{[\s\S]*?\}\});/)[1] + ')');
  const spc = life.slice(life.indexOf('const SPC={'), life.indexOf('const FAUNA='));
  const seen = new Map();
  for (const w of worlds) {
    const F = fauna[w];
    assert.ok(F && F.a.length >= 1 && F.c.length >= 2, w + ': ao menos uma ave e dois animais de chão');
    const total = [...F.a, ...F.c].reduce((t, [, q]) => t + q, 0);
    assert.ok(total >= 6 && total <= 10, w + ': quantidade moderada (' + total + ')');
    for (const [n] of [...F.a, ...F.c]) {
      assert.ok(new RegExp('\\b' + n + ':\\{d:(bird|quad|rept|ema),s:[\\d.]+,v:[\\d.]+').test(spc), 'espécie sem desenho: ' + n);
      (seen.get(n) || seen.set(n, []).get(n)).push(w);
    }
    for (const [n] of F.a) assert.ok(new RegExp('\\b' + n + ':\\{d:bird,').test(spc), w + ': ' + n + ' voa');
  }
  // cada bioma com uma combinação própria (só o carcará aparece em dois: cerrado e caatinga)
  const sets = worlds.map(w => [...fauna[w].a, ...fauna[w].c].map(x => x[0]).sort().join());
  assert.strictEqual(new Set(sets).size, worlds.length);
  for (const [n, ws] of seen) assert.ok(ws.length === 1 || n === 'carcara', n + ' repetido em ' + ws);
  assert.match(life, /new THREE\.MeshBasicMaterial\(\{map:blobTex\(\)/, 'animais de chão com sombra (nada flutuando)');
  assert.match(life, /const free=\(x,z,r\)=>\{const d=Math\.hypot\(x-WALK\.x,z-WALK\.z\);if\(d<13\.5\|\|d>33\)return false;/, 'fora da clareira dos jogadores e antes das montanhas');
  assert.match(life, /A\.spr\.visible=!still;if\(still\)continue;/, 'reduzir movimento: aves escondidas');
  assert.match(life, /ol='#'\+OLC\.getHexString\(\)/, 'contorno na cor de contorno do mundo (estilo toon)');
});

test('bichos de chão: sprite direcional (perfil, frente e costas), passo de 4 quadros pela distância e viradas suaves', () => {
  assert.match(life, /const FB=new Map\(\[\[quad,quadFB\],\[rept,reptFB\],\[ema,emaFB\]\]\);/, 'todo tipo de animal de chão tem frente e costas');
  for (const f of ['quadFB', 'reptFB', 'emaFB']) assert.match(life, new RegExp('function ' + f + '\\(g,q,p,ol,back\\)\\{'));
  assert.match(life, /return ART\[n\]=sTex\(640,512,g=>\{for\(let r=0;r<4;r\+\+\)for\(let c=0;c<5;c\+\+\)\{g\.save\(\);g\.beginPath\(\);g\.rect\(c\*128,r\*128,128,128\);g\.clip\(\);/, 'folha 5 × 4, cada quadro recortado');
  assert.match(life, /const POSE=\[\{sw:0,b:0\},\{sw:1,b:0\},\{sw:0,b:-1\.5\},\{sw:-1,b:0\},\{sw:0,b:0,gz:1\}\],WALK4=\[1,2,3,2\];/);
  assert.match(life, /return a<\(v===3\?48:40\)\?3:a>\(v===2\?132:140\)\?2:sd>0\?0:1/, 'vista pela direção do corpo em relação à câmera, com folga');
  assert.match(life, /A\.ft\+=st\/\(S\.s\*\.55\)/, 'o passo acompanha a distância andada');
  assert.match(life, /S\.v\*dt\*Math\.max\(\.15,Math\.cos\(df\)\)/, 'anda devagar enquanto vira');
  assert.match(life, /A\.beh=S\.gz&&r<\.45\?'graze':r<\.7\?'look':'stand'/, 'paradas: pasta, olha ou fica parado');
  assert.match(life, /A\.sh\.rotation\.z=A\.h-Math\.PI\/2/, 'sombra alongada na direção do corpo');
  assert.match(life, /if\(!still\)\{const tr=/, 'reduzir movimento: animais parados');
  for (const n of ['anta', 'capivara', 'cavalo', 'veado']) assert.match(life, new RegExp('\\b' + n + ':\\{d:quad,s:[\\d.]+,v:[\\d.]+,gz:1,'), n + ' pasta');
});

test('partículas do ar: duas camadas próprias de cada bioma, só com formas desenhadas', () => {
  const pfx = vm.runInNewContext('(' + scene.match(/const PFX=(\{[\s\S]*?\]\]\});/)[1] + ')');
  const kinds = new Set(['dot', 'leaf', 'petal', 'seed', 'butterfly']);
  for (const w of worlds) {
    assert.strictEqual(pfx[w].length, 2, w);
    for (const [col, size, , , kind, , n] of pfx[w]) {
      assert.match(col, /^#[0-9a-f]{6}$/);
      assert.ok(size > 0 && size < 0.4 && n > 0 && n <= 70, w + ' ' + kind);
      assert.ok(kinds.has(kind), 'forma ' + kind);
      if (kind !== 'dot') assert.ok(scene.includes("kind==='" + kind + "'"), 'desenho de ' + kind);
    }
  }
  assert.ok(!/kind==='ring'|dotT/.test(scene), 'sem as bolhas do oceano antigo nem textura sem uso');
  assert.match(scene, /function partTick\(dt\)\{if\(rm\)return;for\(const P of PT\)/);
});

test('luz e cor: fogueira mais contida em chão claro e clareira seca no alagado', () => {
  assert.match(base, /let FIREK=1;/);
  assert.match(scene, /FIREK=GAVG\?Math\.max\(\.55,Math\.min\(1,1\.25-h\.l\)\):1/, 'força da fogueira pela claridade do chão');
  assert.match(ui, /\*LG\*FIREK;fireL\.distance=/);
  assert.match(ui, /m\.material\.opacity=Math\.min\(1,Math\.max\(\.55,\.4\+\.6\*q\)\)\*FIREK/, 'o brilho no chão acompanha');
  assert.match(scene, /function waterRing\(\)\{/);
  assert.match(scene, /mesh\(waterRing\(\),/, 'água em anel em volta da clareira');
  assert.match(scene, /R=r<1\.25\?11\.6:r<1\.75\?14\.2:95/, 'borda de dentro esmaecendo entre 11,6 e 14,2 m');
});

test('retorno das ações (regras.md 13.1): prato pronto sobre a fogueira para todos, som e efeito nos acertos e nos erros', () => {
  const cook = read('assets/app-cook.js'), net = read('assets/app-net.js'), social = read('assets/app-social.js'), media = read('assets/app-media.js'),
    avatar = read('assets/app-avatar.js'), css = read('assets/app.css'), server = read('server.js');
  // prato pronto: aparece flutuando, gira com partículas, toca o som e some em ~4 s; só então vai para a mão
  assert.match(life, /window\.lifeShow=\(ic,x,y,z,o\)=>/);
  assert.match(life, /if\(!still\)\{S\.card\.rotation\.y=t\*1\.7;/, 'gira no próprio eixo (parado com reduzir movimento)');
  assert.match(life, /if\(t>=S\.dur\)\{scene\.remove\(S\.g\);S\.card\.geometry\.dispose\(\)/, 'some e libera a memória');
  assert.match(cook, /const DISH_S=4;/);
  assert.match(cook, /dish\(r\);sfx\('cook_done',1\)/);
  assert.match(cook, /send\(\{t:'item',item:m\.recipe\}\)\},DISH_S\*1000-200\)/, 'vai para a mão quando o prato some');
  assert.match(server, /if \(r\.ok\) bc\(c\.room, \{ t: 'cookfx', id: c\.me\.id, r: r\.recipe \}, c\.ws\);/, 'a sala vê o prato (só id e receita)');
  assert.match(cook, /if\(m\.t==='cookfx'\)\{const r=RECIPE\[m\.r\],a=actors\.get\(m\.id\);if\(!r\|\|!a\|\|mode!=='play'\)return;dish\(r\);const v=dvol\(a\)/, 'para os outros, com o som pela distância');
  // sons novos, calibrados (tools/audio-audit.js)
  for (const k of ['erro', 'pickup', 'wash', 'peel', 'cook_done']) {
    assert.match(sound, new RegExp("case '" + k + "':"), 'som ' + k);
    assert.match(sound, new RegExp('const TRIM=\\{[^}]*\\b' + k + ':[\\d.]+'), 'volume calibrado de ' + k);
  }
  // ajudante único de retorno de interface, com versão para reduzir movimento
  assert.match(sound, /function fb\(el,ok,k\)\{/);
  assert.match(css, /\.fbok\{animation:fbOk \.6s ease-out\}\.fberr\{animation:fbErr \.45s ease-in-out\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.fbok\{animation:none;outline:2px solid var\(--ac\);outline-offset:2px\}\.fberr\{animation:fbErrRm \.6s\}\}/);
  // culinária: espaço preenchido, erros (repetido, cheio, falta preparo, longe, combinação errada) e preparo
  assert.match(cook, /fb\(el\('#ckSlots'\)\.children\[CK\.slots\.length-1\],1,'pickup'\)/);
  assert.ok((cook.match(/fb\(el\('#ckSlots'\),0\)/g) || []).length >= 3, 'erros dos espaços tremem');
  assert.match(cook, /sfx\(c==='l'\?'wash':'peel',\.9\)/);
  // item na mão, amigos, recado, curtida, denúncia e notificação guardada
  assert.match(net, /setHeld\(a\.g,it\);if\(it&&mode==='play'\)\{const v=dvol\(a\);if\(v>\.03\)sfx\('pickup',v\*\.9\)\}/);
  assert.match(avatar, /o item aparece crescendo na mão/);
  for (const re of [/send\(\{t:'freq',to:h\}\);fb\(null,1\)/, /send\(\{t:'facc',to:id\}\);addFr\(id,n\);fb\(null,1,'join'\)/, /send\(\{t:'finv',to:id\}\);fb\(null,1\)/, /fb\(\$\('#gbMsg'\),0\)/, /if\(m\.ok&&!m\.dup\)showEmo\(me,'❤️'\);else fb\(null,!!m\.ok\)/])
    assert.match(social, re);
  assert.match(net, /case 'rep':fb\(\$\('#repMsg'\),!!m\.ok\)/);
  assert.match(media, /if\(\/\^\(fr\|inv\):\/\.test\(kind\)\)sfx\('notif',\.8\)/, 'só pedido e convite de amigo tocam no sino (os de mídia já tocaram ao chegar)');
});
