'use strict';
// Bonés (acessórios de cabeça) e as correções do cenário: preenchimento dos vazios, modelos de árvore e cacto ligados
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

test('bonés: duas opções novas no fim da lista de chapéus (os ids antigos não mudam)', () => {
  assert.deepStrictEqual(C.HATS, ['Sem chapéu', 'Gorro', 'Bucket', 'Cowboy', 'Boné para frente', 'Boné para trás']);
  assert.strictEqual(C.CR.hat, 6, 'o limite do servidor sai do tamanho da lista');
});

test('bonés: o servidor aceita os dois e recusa um id que não existe', () => {
  for (const hat of [4, 5]) {
    const c = V.cleanCfg({ hat, hc: 7, hs: 3 });
    assert.ok(c, 'boné ' + hat + ' aceito');
    assert.strictEqual(c.hat, hat);
    assert.strictEqual(c.hc, 7, 'a cor do chapéu continua sendo hc');
  }
  assert.strictEqual(V.cleanCfg({ hat: 6 }), null, 'id fora da lista é recusado');
});

test('bonés: o código de recuperação guarda e devolve o boné e a cor', () => {
  for (const hat of [4, 5]) {
    const look = { fc: 1, skin: 2, eye: 3, hs: 5, hair: 4, hat, hc: C.PAL.length - 1, shirt: 6, bt: 0, pc: 8, shoes: 1, sc: 9 };
    const r = R.decode(R.encode({ name: 'Boné', look, gloss: 1 }));
    assert.ok(r.ok);
    assert.strictEqual(r.look.hat, hat);
    assert.strictEqual(r.look.hc, look.hc);
  }
});

test('bonés: modelados no mesmo motor dos chapéus, com aba virada para a frente (+z, o rosto) ou para trás', () => {
  assert.ok(avatar.includes('else if(h===4||h===5){'), 'ramo próprio no hatGeo');
  assert.ok(/bk=h===5,sz=bk\?-1:1/.test(avatar), 'o boné para trás espelha só a aba');
  assert.ok(/zz=z\*sz/.test(avatar), 'a aba usa a frente real do avatar');
  // cor: a copa usa a cor escolhida (c1 = hc); a aba é a mesma cor um pouco mais escura
  assert.ok(/bc\(x,y,z\)<d\(x,y,z\)\)return c1\.clone\(\)\.multiplyScalar\(\.8\)/.test(avatar));
  // o chapéu vai na cabeça (hd), então acompanha rotação e animação da cabeça; troca o cabelo como os outros chapéus
  assert.ok(avatar.includes('if(c.hat){hatNew(hd,c)'));
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
