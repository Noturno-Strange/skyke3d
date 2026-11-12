'use strict';
// Correções do cenário: bonés retirados, preenchimento dos vazios, modelos de árvore e cacto ligados e peças da colônia apoiadas
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const C = require('../assets/catalog.js');
const V = require('../lib/validate.js');
const R = require('../assets/recovery.js');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const avatar = read('assets/app-avatar.js');
const scene = read('assets/app-scene.js');

test('bonés retirados: a lista de chapéus volta a ter quatro opções e quem tinha boné fica sem chapéu, sem erro', () => {
  assert.deepStrictEqual(C.HATS, ['Sem chapéu', 'Gorro', 'Bucket', 'Cowboy']);
  assert.ok(!JSON.stringify(C).includes('Boné'), 'nenhum boné no catálogo');
  assert.deepStrictEqual(C.CFG_GONE.hat, { 4: 0, 5: 0 });
  for (const hat of [4, 5]) {
    assert.strictEqual(V.cleanCfg({ hat, hc: 7 }).hat, 0, 'servidor (sala, perfil): boné vira sem chapéu');
    const look = { fc: 1, skin: 2, eye: 3, hs: 5, hair: 4, hat, hc: 7, shirt: 6, bt: 0, pc: 8, shoes: 1, sc: 9 };
    const r = R.decode(R.encode({ name: 'Ana', look, gloss: 0 }));
    assert.ok(r.ok, 'código de recuperação gerado com boné continua valendo');
    assert.strictEqual(r.look.hat, 0);
    assert.strictEqual(r.look.hc, 7, 'a cor do chapéu fica guardada');
  }
  assert.strictEqual(V.cleanCfg({ hat: 6 }), null, 'id que nunca existiu continua recusado');
  assert.ok(!avatar.includes('h===4') && !avatar.includes('h===5'), 'o modelo dos bonés saiu do avatar');
});

test('colônia: peças pequenas apoiadas de verdade (caixa da pilha e caixa de dados da estação)', () => {
  const colony = read('assets/app-colony.js');
  // pilha: a caixa de baixo vai até 0,7; a de cima (0,55 de altura) tem a base em 0,975 - 0,275 = 0,7 e, girada 0,2, cabe na base
  assert.ok(colony.includes('B(.95,.7,.75,F(hull2Of(o)),0,.35,0)'));
  assert.ok(colony.includes('B(.6,.55,.6,F(hullOf(o)),.05,.975,.02).rotation.y=.2;B(.8,.5,.6,F(DARK),.95,.25,-.2);'), 'a caixa escura do lado continua lá');
  const half = 0.3 * Math.cos(0.2) + 0.3 * Math.sin(0.2);
  assert.ok(0.05 + half < 0.475 && 0.02 + half < 0.375, 'os cantos da caixa girada ficam dentro da de baixo');
  // estação: caixa encostada no poste (raio 0,04) e presa por braçadeira
  assert.ok(colony.includes('C(.065,.12,ST,0,.5,0);B(.5,.34,.3,F(hullOf(o)),.29,.5,0)'));
  assert.ok(0.29 - 0.25 <= 0.04 + 1e-9, 'a face da caixa encosta no poste');
  assert.ok(colony.includes("B(.4,.04,.04,F(o.edge),0,1.9,0)},"), 'a travessa do poste continua lá');
});

test('cenário: preenchimento dos vazios depois de montar o resto, longe da área de jogo e fora das montanhas', () => {
  assert.ok(scene.includes('forestFlora(o,zones);farField(o,zones);fillGaps(o,zones)}'), 'roda depois de tudo posto');
  const fn = scene.slice(scene.indexOf('function gapSpots'), scene.indexOf('// junta as peças de um grupo'));
  assert.ok(/if\(d<14\|\|d>40\)continue/.test(fn), 'nem no centro nem colado nas montanhas');
  assert.ok(/inMountain\(jx,jz,4\)/.test(fn), 'vazio dentro do pé da montanha não conta');
  assert.ok(/!inMountain\(x,z,r\+\.4\)/.test(fn), 'cada peça confere a montanha');
  assert.ok(/zones\.push\(\{x,z,r\}\)/.test(fn), 'cada peça ocupa seu lugar');
  assert.ok(/north<\.3/.test(fn), 'o corredor da frente continua aberto');
  assert.ok(/forestTree\(|forestBush\(|rock\(|tuft\(/.test(fn), 'usa os modelos que já existem');
});

test('cenário: cacto e árvores distantes sem peças soltas; árvore torta perto com galho na terceira copa', () => {
  const far = scene.slice(scene.indexOf('const farTree='), scene.indexOf('put(8,160,38,52,400'));
  // cacto: braço em L encostado no tronco (raio do tronco .17-.2 q)
  assert.ok(far.includes("mesh(new THREE.CylinderGeometry(.09*q,.09*q,.36*q,5),col,.27*q,.95*q,0,g).rotation.z=PI/2"));
  // redonda: o tronco (1,7 q) chega na base da copa (2,23 q - 0,86 q = 1,37 q)
  assert.ok(far.includes('CylinderGeometry(.12*q,.16*q,1.7*q,5),bark,0,.85*q,0,g'));
  assert.ok(far.includes("else if(kd==='twisted'){"), 'árvore torta não vira pinheiro de longe');
  assert.ok(scene.includes('const t=cyl(.07,1.08,bark,.23,1.98,-.125,g,.12);t.rotation.x=-.23'), 'galho da terceira copa');
});

test('colônia: tanque e caixa da torre de perfuração no chão, fora da plataforma (antes no ar, na beira dela)', () => {
  const colony = read('assets/app-colony.js');
  assert.ok(colony.includes('B(2.3,.22,2.3,DK,0,.11,0);B(2.34,.07,2.34,F(o.edge),0,.2,0);'), 'plataforma de ±1,15 (borda ±1,17)');
  // tanque: raio 0,55 e altura 1 com centro em 0,5 (base no chão); fica todo depois da borda da plataforma
  assert.ok(colony.includes('C(.55,1.0,F(hullOf(o)),1.78,.5,-.5);C(.56,.12,F(o.edge),1.78,.7,-.5);'));
  assert.ok(1.78 - 0.56 > 1.17, 'o tanque (com a faixa) não entra na plataforma');
  // caixa: 0,9 × 0,7 com centro em 0,35 (base no chão), lado de dentro em -1,2
  assert.ok(colony.includes('B(.9,.7,.8,F(hull2Of(o)),-1.65,.35,-.6);B(.5,.2,.06,E(o.glass),-1.65,.55,-.2)'));
  assert.ok(-1.65 + 0.45 < -1.17, 'a caixa não entra na plataforma');
  // o raio reservado continua 1,9: aumentar tirava a pilha de caixas e o gerador do núcleo de mineração (sem lugar)
  assert.ok(colony.includes('drillRig:1.9,'));
});

test('colônia: para-brisa do veículo colado na frente da cabine', () => {
  const colony = read('assets/app-colony.js');
  // medidas lidas do próprio modelo: B(largura, altura, profundidade, cor, x, y, z)
  const m = colony.match(/B\(\.8,\.42,\.85,F\(hull2Of\(o\)\),([\d.]+),([\d.]+),0\);B\(([\d.]+),([\d.]+),[\d.]+,E\(o\.glass\),([\d.]+),([\d.]+),0\);/);
  assert.ok(m, 'cabine seguida do para-brisa');
  const [cx, cy, gw, gh, gx, gy] = m.slice(1).map(Number);
  const cabFront = cx + 0.8 / 2;
  assert.ok(gx - gw / 2 <= cabFront && gx + gw / 2 > cabFront, 'o painel atravessa a face da frente da cabine: fica colado nela');
  assert.ok(gy - gh / 2 >= cy - 0.42 / 2 && gy + gh / 2 <= cy + 0.42 / 2, 'dentro da altura da cabine');
});

test('cliente: todos os scripts do jogo compilam (comentário no meio de uma linha não pode engolir código)', () => {
  const vm = require('vm');
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'assets')).filter(f => /^app-.*\.js$/.test(f)))
    assert.doesNotThrow(() => new vm.Script(read('assets/' + f), { filename: f }), f);
});
