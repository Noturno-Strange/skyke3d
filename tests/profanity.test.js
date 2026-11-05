'use strict';
// Filtro de palavrões do chat (pt-BR): troca por !@#$%, sem censurar palavras comuns.
const test = require('node:test');
const assert = require('node:assert');
const { censor, hasProfanity } = require('../lib/profanity');

const MASKED = /^[!@#$%&*]{3,7}$/;

test('palavrões simples viram símbolos e o resto da frase fica igual', () => {
  assert.strictEqual(censor('que porra é essa'), 'que !@#$% é essa');
  const r = censor('Isso é uma merda mesmo');
  assert.ok(/^Isso é uma [!@#$%&*]+ mesmo$/.test(r), r);
  assert.ok(!/merda/i.test(censor('MERDA!')));
});

test('maiúsculas, acentos, letras repetidas e plural também são pegos', () => {
  for (const t of ['PORRA', 'Porra', 'porrrrra', 'caralhos', 'FODA', 'foooda', 'putas', 'buceta', 'cuzão', 'Filho da puta', 'filhodaputa', 'VIADO', 'arrombado'])
    assert.ok(hasProfanity(t), t);
});

test('trocas de números e símbolos por letras, e separadores entre as letras', () => {
  for (const t of ['p0rra', 'c4ralho', 'm3rda', 'f0d@', 'f0da', 'b0sta', 'p.u.t.a', 'p u t a', 'f-o-d-a', 'put4'])
    assert.ok(hasProfanity(t), t);
});

test('abreviações comuns: fdp, pqp, vsf, vtnc', () => {
  for (const t of ['fdp', 'FDP', 'pqp', 'vsf', 'vtnc', 'vai tnc'])
    assert.ok(hasProfanity(t), t);
});

test('palavras comuns que contêm um palavrão dentro NÃO são censuradas', () => {
  for (const t of ['computador', 'pauta', 'cultura', 'cuidado', 'curso', 'escuta', 'classe', 'assassino', 'raputa', 'disputa', 'reputação',
    'bostela', 'cuco', 'pata', 'porrada', 'fodão', 'putrefato', 'oi pessoal', 'bom dia', 'vamos jogar', 'karaokê', 'música', 'fogueira', 'cenário',
    'ótimo', 'amigo', 'Marina', 'http://exemplo.com/cuidado', '2024', '1 2 3', 'oi!', 'tudo bem?', 'foda!!'.slice(0, 0) || 'ok'])
    assert.strictEqual(censor(t), t, t);
});

test('a máscara tem de 3 a 7 símbolos e só contém símbolos', () => {
  const r = censor('porra');
  assert.ok(MASKED.test(r), r);
  assert.ok(MASKED.test(censor('caralhooooooooo')), censor('caralhooooooooo'));
});

test('várias palavras na mesma frase e pontuação depois do palavrão', () => {
  const r = censor('porra, caralho! foda-se, né');
  assert.ok(!/porra|caralho|foda/i.test(r), r);
  assert.ok(r.includes(', ') && r.endsWith(', né'), r);
});

test('entradas inesperadas não quebram', () => {
  assert.strictEqual(censor(''), '');
  assert.strictEqual(censor(undefined), undefined);
  assert.strictEqual(censor(42), 42);
  assert.strictEqual(censor('😀 porra 😀').includes('porra'), false);
  assert.ok(censor('😀 porra 😀').startsWith('😀 ') && censor('😀 porra 😀').endsWith(' 😀'));
});

test('truques para fugir do filtro: largura cheia, letras cirílicas/gregas, separadores duplos, troca u/v e l/1, cadeias de números', () => {
  for (const w of ['ｐｕｔａ', 'рuta', 'саralho', 'ｃａｒａｌｈｏ', 'p__u__t__a', 'p - u - t - a', 'pvta', 'cara1ho', 'Pu74', 'v s f', 'f.d.p', 'crlh', 'vtmnc'])
    assert.ok(!censor('você é ' + w + ' mesmo').includes(w), w + ' → ' + censor('você é ' + w + ' mesmo'));
});

test('sem falso positivo em palavras comuns depois das melhorias', () => {
  for (const w of ['computador', 'pauta', 'cultura', 'disputa', 'fruta', 'escuta', 'acuado', 'Cuiabá', 'curriculo cv', 'você tem cv?', 'piscina', 'culpa', 'cuidado', 'aprovação', 'pula ta', 'vamos lá', 'caraíbas', 'putz'])
    assert.strictEqual(censor(w), w, w);
});

const { badName } = require('../lib/profanity');

test('nomes: bloqueia palavrão, ódio (nazismo, racismo, homofobia, 1488) e nome de equipe, em qualquer disfarce', () => {
  for (const ruim of ['Hitler', 'h1tler', 'H i t l e r', 'n a z i', 'Nazista', 'Xx_Nazi_xX', 'sieg heil', 'joao1488', '14/88', 'Hitlerzinho', 'nigger', 'F4ggot', 'macaco', 'bicha',
    'caralho', 'p0rr4', 'fdp', 'viado', 'Sapatão', 'Admin', 'ADM1N', 'Moderador', 'Skyke3D', 'skyke', 'Suporte', ''])
    assert.strictEqual(badName(ruim).bad, true, ruim || '(vazio)');
});

test('nomes: não bloqueia nome normal parecido (sem falso positivo)', () => {
  for (const bom of ['Ana', 'Nazim', 'Nazire', 'Fagner', 'Pedro', 'Pedra', 'Pedagogo', 'Cassio', 'Marta', 'Gabriel88', 'Retardo', 'Cooper', 'Paquito', 'Strange', 'Noturno', 'Spica', 'Dilma', 'Cuca', 'Computador'])
    assert.strictEqual(badName(bom).bad, false, bom);
});

// SK-05: nomes que imitam a equipe com letras parecidas passavam (250 de 870 variações: "ADMlN", "adm|n", "admın", "ᴀdmin").
// A checagem de nomes reservados agora compara o "esqueleto" (tudo que se confunde com uma letra vira a letra).
const V = require('../lib/validate');
// o mesmo caminho que o servidor segue ao entrar numa sala: nm() -> "Visitante" é recusado; depois badName()
const aceito = raw => {
  const name = V.nm(raw);
  if (V.nameKey(name) === 'visitante') return false;
  return !badName(name).bad;
};

test('nomes da equipe com letras parecidas são recusados (ADMlN, adm|n, admın, ᴀdmin…)', () => {
  for (const n of ['ADMlN', 'adm|n', 'admın', 'ᴀdmin', 'ɑdmin', 'admɪn', 'adrnin', 'rnoderador', 'M0derador', 'Sist3ma', 'SISTEMA', 'sistema', 'Skyke3D', '5kyke3d', 'skykeзd', 'Ѕtaff', 'Staf', 'suport3', 'ofiϲial', 'ofi(ial', 'oficiaӏ', 'ａｄｍｉｎ', 'Аdmin', 'Admin', 'Moderador', 'Equipe'])
    assert.strictEqual(aceito(n), n === 'Staf' ? true : false, 'deveria ser recusado: ' + JSON.stringify(n));
});

test('nomes comuns perto das palavras reservadas continuam valendo', () => {
  for (const n of ['Admiral', 'Adriana', 'Modesto', 'Botelho', 'Suportes', 'Oficina', 'Dominique', 'Lia', 'Ali', 'Nina', 'Iracema', 'Lili', 'Moda', 'Equipamento', 'Stafford', 'Sistemas', 'Rafa', 'Bruno', 'Carol', 'Léo', 'Ana Paula'])
    assert.strictEqual(aceito(n), true, 'deveria valer: ' + JSON.stringify(n));
});

test('varredura sistemática: nenhuma troca de uma letra por parecida escapa do filtro de nomes reservados', () => {
  const LOOK = { a: ['4', '@', 'а', 'ａ', 'α', 'ᴀ', 'ɑ'], b: ['8', 'ь', 'ｂ'], c: ['с', 'ϲ', '(', 'ｃ'], d: ['ԁ', 'ｄ', 'ɖ'], e: ['3', 'е', 'ε', 'ｅ', 'є', 'з'], g: ['9', 'ɡ', 'ｇ'], i: ['1', 'l', 'I', '|', 'і', 'ı', 'ｉ', 'ɪ', '!', 'ӏ'], k: ['κ', 'к', 'ｋ'], l: ['1', 'I', '|', 'ӏ', 'ｌ', 'i'], m: ['rn', 'м', 'ｍ'], n: ['п', 'ｎ', 'ո'], o: ['0', 'о', 'ο', 'ｏ', 'օ'], p: ['р', 'ρ', 'ｐ'], r: ['г', 'ｒ'], s: ['5', '$', 'ѕ', 'ｓ'], t: ['7', '+', 'т', 'ｔ', 'τ'], u: ['υ', 'ս', 'ｕ', 'v'], x: ['х', 'ｘ'], y: ['у', 'ү', 'ｙ'] };
  const escapou = [];
  let total = 0;
  for (const w of ['admin', 'moderador', 'skyke3d', 'sistema', 'suporte', 'staff', 'equipe', 'oficial', 'system', 'moderator', 'support', 'official', 'server', 'servidor']) {
    const ch = [...w];
    ch.forEach((c, i) =>
      (LOOK[c] || []).forEach(sub => {
        for (const up of [false, true]) {
          const v = ch.slice(0, i).join('') + sub + ch.slice(i + 1).join('');
          total++;
          if (aceito(up ? v.toUpperCase() : v)) escapou.push(up ? v.toUpperCase() : v);
        }
      })
    );
  }
  assert.ok(total > 600, 'varredura cobre centenas de variações: ' + total);
  assert.deepStrictEqual(escapou, [], 'variações aceitas: ' + escapou.join(' '));
});
