'use strict';
// Presentes (lib/gifts.js): a caixa é uma coleção para mostrar. O servidor confere quem envia, o item e os limites; nada vai para a
// mochila, nada vira moeda e nada volta para quem enviou.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../assets/catalog.js');
const { createGifts, itemOk, BOX_MAX, PER_DAY, PER_PAIR } = require('../lib/gifts.js');

const A = 'a'.repeat(20),
  B = 'b'.repeat(20),
  D = 'd'.repeat(20);
const HOUR = 3600000,
  DAY = 24 * HOUR;
const clock = (t = 1_800_000_000_000) => ({ now: () => t, go: ms => (t += ms) });
// "tem tudo": o jogador já colheu qualquer planta e preparou qualquer receita
const all = () => true;
const tmp = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-gift-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'gifts.json');
};

test('presentes: só o que o próprio jogador já colheu ou preparou pode ser enviado (quem confere é o servidor)', () => {
  const owns = new Set(['c:tomate', 'r:brigadeiro']);
  const g = createGifts({ can: (pid, k, i) => pid === A && owns.has(k + ':' + i) });
  assert.strictEqual(g.send(A, B, 'c', 'tomate', 'Ana').ok, true, 'planta que ele colheu');
  assert.strictEqual(g.send(A, D, 'r', 'brigadeiro', 'Ana').ok, true, 'receita que ele preparou');
  assert.strictEqual(g.send(A, D, 'c', 'cenoura', 'Ana').reason, 'nao_tem', 'planta que ele nunca colheu');
  assert.strictEqual(g.send(B, A, 'c', 'tomate', 'Bia').reason, 'nao_tem', 'o que é de um não vale para outro');
  assert.strictEqual(createGifts().send(A, B, 'c', 'tomate', 'Ana').reason, 'nao_tem', 'sem a conferência ligada, ninguém envia nada');
});

test('presentes: destinatário, tipo e item inválidos são recusados; não dá para presentear a si mesmo', () => {
  const g = createGifts({ can: all });
  assert.strictEqual(g.send(A, A, 'c', 'tomate', 'Ana').reason, 'self');
  assert.strictEqual(g.send('xyz', B, 'c', 'tomate', 'Ana').reason, 'pid');
  assert.strictEqual(g.send(A, 'B'.repeat(20), 'c', 'tomate', 'Ana').reason, 'pid', 'código público é hexadecimal minúsculo');
  assert.strictEqual(g.send(A, B, 'c', 'nao_existe', 'Ana').reason, 'item');
  assert.strictEqual(g.send(A, B, 'x', 'tomate', 'Ana').reason, 'item', 'tipo desconhecido');
  assert.strictEqual(g.send(A, B, 'r', 'tomate', 'Ana').reason, 'item', 'planta não é receita');
  assert.strictEqual(g.send(A, B, 'c', '__proto__', 'Ana').reason, 'item', 'chave herdada do objeto não é item');
  assert.strictEqual(g.send(A, B, 'c', 'constructor', 'Ana').reason, 'item');
  for (const it of ['pizza', 'pocao_cura', 'refri']) assert.strictEqual(itemOk('r', it), false, it + ': item livre da mochila não é presente');
  assert.strictEqual(g.size(), 0, 'nenhuma recusa cria caixa');
  assert.strictEqual(g.stats().refused, 8);
});

test('presentes: ficam na caixa de quem recebeu, com quem enviou, o item e a data; quem visita não vê o código de ninguém', () => {
  const k = clock(),
    g = createGifts({ can: all, now: k.now });
  const r = g.send(A, B, 'c', 'girassol', '  Ana‮<b>  ');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.gift, { id: 1, n: 'Anab', k: 'c', i: 'girassol', at: k.now() }, 'o nome vai limpo (sem controles nem marcação)');
  k.go(1000);
  g.send(D, B, 'r', 'feijoada', 'Duda');
  const box = g.box(B);
  assert.deepStrictEqual([box.total, box.unseen, box.max], [2, 2, BOX_MAX]);
  assert.deepStrictEqual(box.list.map(x => x.i), ['feijoada', 'girassol'], 'mais novos primeiro');
  assert.deepStrictEqual(Object.keys(box.list[0]).sort(), ['at', 'i', 'id', 'k', 'n'], 'o dono vê o id (para remover), nunca o código de quem enviou');
  const pub = g.publicOf(B);
  assert.strictEqual(pub.total, 2);
  assert.deepStrictEqual(Object.keys(pub.list[0]).sort(), ['at', 'i', 'k', 'n'], 'a página pública não leva id nem código');
  assert.ok(!JSON.stringify(pub).includes(A) && !JSON.stringify(box).includes(A), 'o código público de quem enviou não sai do servidor');
  assert.deepStrictEqual(g.publicOf(A), { total: 0, list: [] }, 'enviar não tira nem põe nada na caixa de quem enviou');
  assert.strictEqual(g.publicOf(B, 1).list.length, 1, 'a página pode pedir só os mais recentes');
});

test('presentes: presentes novos são contados até o dono abrir a caixa', () => {
  const g = createGifts({ can: all });
  assert.strictEqual(g.unseen(B), 0);
  g.send(A, B, 'c', 'tomate', 'Ana');
  g.send(D, B, 'c', 'tomate', 'Duda');
  assert.strictEqual(g.unseen(B), 2);
  g.seen(B);
  assert.strictEqual(g.unseen(B), 0);
  assert.strictEqual(g.box(B).total, 2, 'ver não tira nada da caixa');
});

test('presentes: limite por dia e por pessoa; a janela é de 24 h corridas e o painel sabe quando volta', () => {
  const k = clock(),
    g = createGifts({ can: all, now: k.now });
  assert.deepStrictEqual([PER_DAY, PER_PAIR], [5, 1]);
  assert.deepStrictEqual(g.quota(A), { left: 5, perDay: 5, next: 0 });
  const t0 = k.now();
  assert.strictEqual(g.send(A, B, 'c', 'tomate', 'Ana').ok, true);
  const again = g.send(A, B, 'c', 'cenoura', 'Ana');
  assert.deepStrictEqual([again.ok, again.reason, again.wait], [false, 'par', 86400], 'um presente por pessoa a cada 24 h');
  const to = i => (i + 10).toString(16).repeat(20).slice(0, 20);
  for (let i = 0; i < 4; i++) {
    k.go(HOUR);
    assert.strictEqual(g.send(A, to(i + 2), 'c', 'tomate', 'Ana').ok, true, 'presente ' + (i + 2));
  }
  assert.deepStrictEqual(g.quota(A), { left: 0, perDay: 5, next: t0 + DAY }, 'acabou: volta 24 h depois do primeiro');
  const over = g.send(A, to(9), 'c', 'tomate', 'Ana');
  assert.deepStrictEqual([over.ok, over.reason], [false, 'dia']);
  assert.strictEqual(over.wait, (DAY - 4 * HOUR) / 1000);
  assert.strictEqual(g.send(D, B, 'c', 'tomate', 'Duda').ok, true, 'o limite é de quem envia, não de quem recebe');
  k.go(DAY - 4 * HOUR);
  assert.strictEqual(g.quota(A).left, 1, 'o primeiro envio saiu da janela');
  assert.strictEqual(g.send(A, B, 'c', 'cenoura', 'Ana').ok, true, 'e já dá para presentear a mesma pessoa de novo');
});

test('presentes: repetir o mesmo pedido não duplica o presente (limite por pessoa) e recusas não gastam o limite', () => {
  const g = createGifts({ can: (pid, k, i) => i === 'tomate' });
  const outs = Array.from({ length: 30 }, () => g.send(A, B, 'c', 'tomate', 'Ana'));
  assert.strictEqual(outs.filter(o => o.ok).length, 1, '30 pedidos iguais, um presente');
  assert.strictEqual(g.box(B).total, 1);
  for (let i = 0; i < 20; i++) g.send(A, D, 'c', 'cenoura', 'Ana');
  assert.strictEqual(g.quota(A).left, PER_DAY - 1, 'pedido recusado não conta como envio');
});

test('presentes: caixa cheia recusa novos; o dono pode tirar um presente, sem devolver nada a ninguém', () => {
  const g = createGifts({ can: all, boxMax: 3, perDay: 100 });
  const from = i => (i + 1).toString(16).padStart(2, '0').repeat(10);
  for (let i = 0; i < 3; i++) assert.strictEqual(g.send(from(i), B, 'c', 'tomate', 'J' + i).ok, true);
  assert.strictEqual(g.send(from(7), B, 'c', 'tomate', 'J7').reason, 'cheia');
  const id = g.box(B).list[0].id;
  assert.strictEqual(g.remove(A, id), false, 'só o dono mexe na própria caixa');
  assert.strictEqual(g.remove(B, 999), false);
  assert.strictEqual(g.remove(B, id), true);
  assert.strictEqual(g.box(B).total, 2);
  assert.strictEqual(g.quota(from(2)).left, 99, 'remover não devolve o envio a quem mandou');
  assert.strictEqual(g.send(from(2), B, 'c', 'cenoura', 'J2').reason, 'par', 'nem libera outro presente para a mesma pessoa no dia');
  assert.strictEqual(g.send(from(7), B, 'c', 'tomate', 'J7').ok, true, 'abriu vaga');
  assert.ok(!('take' in g) && !('claim' in g) && !('redeem' in g) && !('transfer' in g), 'não existe resgate, retirada nem transferência');
});

test('presentes: teto de caixas no servidor', () => {
  const g = createGifts({ can: all, max: 1, perDay: 10 });
  assert.strictEqual(g.send(A, B, 'c', 'tomate', 'Ana').ok, true);
  assert.strictEqual(g.send(A, D, 'c', 'tomate', 'Ana').reason, 'full');
  assert.strictEqual(g.send(D, B, 'c', 'tomate', 'Duda').ok, true, 'caixa que já existe continua recebendo');
});

test('presentes: gravados em arquivo (0600), voltam iguais e os limites do dia sobrevivem ao reinício', t => {
  const file = tmp(t),
    k = clock();
  const a = createGifts({ file, can: all, now: k.now, delayMs: 5 });
  a.send(A, B, 'c', 'tomate', 'Ana');
  k.go(HOUR);
  a.send(D, B, 'r', 'brigadeiro', 'Duda');
  a.seen(B);
  a.flush();
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  const b = createGifts({ file, can: all, now: k.now });
  assert.deepStrictEqual(b.box(B), a.box(B));
  assert.strictEqual(b.send(A, B, 'c', 'cenoura', 'Ana').reason, 'par', 'reiniciar o servidor não zera o limite por pessoa');
  assert.strictEqual(b.quota(A).left, PER_DAY - 1, 'nem o limite do dia');
  assert.strictEqual(b.box(B).list[0].id, 2);
  k.go(DAY);
  assert.strictEqual(b.send(A, B, 'c', 'cenoura', 'Ana').gift.id, 3, 'os ids continuam de onde pararam');
});

test('presentes: o arquivo não é confiado (itens falsos, datas e códigos inválidos são descartados)', t => {
  const file = tmp(t);
  fs.writeFileSync(
    file,
    JSON.stringify({
      v: 1,
      b: {
        [B]: {
          nx: 1,
          u: 99,
          g: [
            { id: 1, f: A, n: 'Ana', k: 'c', i: 'tomate', at: 1000 },
            { id: 1, f: A, n: 'Ana', k: 'c', i: 'diamante', at: 1000 },
            { id: 3, f: 'zzz', n: 'X', k: 'c', i: 'tomate', at: 1000 },
            { id: 4, f: A, n: 'Ana', k: 'moeda', i: 'tomate', at: 1000 },
            { id: 5, f: A, n: 'Ana', k: 'c', i: 'tomate', at: -5 },
            { id: 2, f: D, n: '<script>', k: 'r', i: 'brigadeiro', at: 2000 },
            null
          ]
        },
        invalido: { g: [{ id: 1, f: A, n: 'Ana', k: 'c', i: 'tomate', at: 1000 }] },
        [D]: { g: 'x' }
      }
    })
  );
  const g = createGifts({ file, can: all });
  assert.strictEqual(g.size(), 1);
  const box = g.box(B);
  assert.deepStrictEqual(box.list.map(x => [x.id, x.i, x.n]), [[2, 'brigadeiro', 'script'], [1, 'tomate', 'Ana']]);
  assert.strictEqual(box.unseen, 2, 'contador de novos nunca passa do que há na caixa');
  assert.strictEqual(g.send(D, B, 'c', 'tomate', 'Duda').gift.id, 3, 'o próximo id não repete nenhum');
  fs.writeFileSync(file, '{quebrado');
  assert.strictEqual(createGifts({ file, can: all, onError: () => {} }).size(), 0, 'arquivo quebrado não derruba');
});

test('presentes: o catálogo inteiro pode virar presente (plantas e receitas), e só ele', () => {
  for (const c of C.CROPS) assert.ok(itemOk('c', c.id), c.id);
  for (const r of C.RECIPES) assert.ok(itemOk('r', r.id), r.id);
  assert.strictEqual(itemOk('c', 123), false);
  assert.strictEqual(itemOk(null, 'tomate'), false);
});
