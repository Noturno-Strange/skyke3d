'use strict';
// Músicas lofi (assets/lofi.js): uma faixa para a tela inicial e uma original para cada mundo, tudo sintetizado.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../assets/lofi.js');
const C = require('../assets/catalog.js');

const root = path.join(__dirname, '..');
const sound = fs.readFileSync(path.join(root, 'assets/app-sound.js'), 'utf8');
const ids = Object.keys(L.TRACKS);

test('lofi: a tela inicial, o tutorial e cada mundo do catálogo têm a sua faixa, e não sobra faixa sem mundo', () => {
  assert.ok(ids.includes('menu') && ids.includes('tutorial'));
  for (const w of Object.keys(C.ST)) assert.ok(ids.includes(w), 'mundo sem música: ' + w);
  for (const id of ids) assert.ok(id === 'menu' || id === 'tutorial' || C.ST[id], 'faixa sem mundo: ' + id);
  assert.strictEqual(ids.length, Object.keys(C.ST).length + 2);
});

test('lofi: toda faixa é lida sem erro, com acordes, melodia e padrões no formato e dentro de faixas musicais razoáveis', () => {
  for (const id of ids) {
    const b = L.build(id);
    assert.ok(b && b.n && b.n.length <= 24, id + ': título');
    assert.ok(b.bpm >= 56 && b.bpm <= 84, `${id}: andamento lofi (${b.bpm})`);
    assert.ok(b.sw >= 0 && b.sw <= 0.4, id + ': swing');
    assert.ok(L.LEADS.includes(b.lead), id + ': timbre ' + b.lead);
    assert.ok(b.warm >= 1500 && b.warm <= 4500, id + ': passa-baixa');
    assert.ok(b.wob >= 0 && b.wob <= 20 && b.pad > 0 && b.pad <= 1.2, id + ': textura');
    assert.strictEqual(b.chords.length, 4, id + ': quatro compassos');
    assert.strictEqual(b.mel.length, b.chords.length);
    for (const c of b.chords) {
      assert.ok(c.bass >= 36 && c.bass <= 47, `${id} ${c.name}: baixo`);
      assert.ok(c.notes.length >= 3 && c.notes.every(n => n >= 57 && n <= 76), `${id} ${c.name}: notas do piano`);
    }
    const notes = b.mel.flat().filter(Boolean);
    assert.ok(notes.length >= 10, id + ': melodia com notas');
    assert.ok(notes.every(e => e.m >= 62 && e.m <= 92), id + ': melodia dentro do registro');
    assert.ok(b.k.includes('x') || b.k.includes('o'), id + ': tem bumbo');
    assert.ok(b.h.includes('x') || b.h.includes('o'), id + ': tem chimbal');
  }
});

test('lofi: cada faixa é distinta (acordes, melodia e andamento), com variedade de tons e de timbres', () => {
  const sets = (f) => new Set(ids.map(f));
  assert.strictEqual(sets(i => L.TRACKS[i].ch).size, ids.length, 'progressões repetidas');
  assert.strictEqual(sets(i => L.TRACKS[i].mel.join('|')).size, ids.length, 'melodias repetidas');
  assert.strictEqual(sets(i => L.TRACKS[i].n).size, ids.length, 'títulos repetidos');
  // menu + tutorial + 6 mundos: no máximo um par repetido em andamento e timbre, tons todos diferentes
  assert.ok(sets(i => L.TRACKS[i].bpm).size >= ids.length - 1, 'andamentos variados');
  assert.strictEqual(sets(i => L.parseChord(L.TRACKS[i].ch.split(' ')[0]).bass % 12).size, ids.length, 'tons de partida variados');
  assert.ok(sets(i => L.TRACKS[i].lead).size >= ids.length - 1, 'timbres de melodia variados');
  assert.ok(sets(i => L.TRACKS[i].k + L.TRACKS[i].s + L.TRACKS[i].h).size >= ids.length - 2, 'ritmos variados');
});

test('lofi: o leitor recusa notação errada', () => {
  assert.throws(() => L.parseBar('C5 . . .'), /precisa de 16/);
  assert.throws(() => L.parseBar('- . . . . . . . . . . . . . . .'), /sem nota/);
  assert.throws(() => L.parseBar('H5 . . . . . . . . . . . . . . .'), /inválida/);
  assert.throws(() => L.parseChord('Hm9'), /inválido/);
  assert.throws(() => L.parseChord('Cfoo'), /inválido/);
  assert.deepStrictEqual(L.parseChord('Cmaj7').notes, [59, 64, 67]);
  assert.strictEqual(L.parseBar('G5 - - . . . . . . . . . . . . .')[0].len, 3, '"-" prolonga a nota');
  assert.strictEqual(L.parseBar('Eb5 . . . . . . . . . . . . . . .')[0].m, 75);
});

test('música: tudo sintetizado, sem arquivo de áudio, com canal próprio, calibração por faixa e pausa durante vídeo, rádio e karaokê', () => {
  const audio = fs.readdirSync(path.join(root, 'assets')).filter(f => /\.(wav|mp3|ogg|flac|m4a|opus)$/i.test(f));
  assert.deepStrictEqual(audio, [], 'sem arquivos de áudio');
  assert.match(sound, /musG:\['skyke_mus',\.6\]/, 'canal de volume da música');
  for (const id of ids) assert.match(sound, new RegExp('mus_' + id + ':\\d'), 'ganho calibrado de ' + id);
  assert.match(sound, /SKYLOFI\.build\(k\)/, 'toca as faixas do lofi.js');
  assert.match(sound, /if\(mode==='menu'\)return tutOn\(\)\?'tutorial':'menu'/, 'a tela inicial tem faixa própria, e o tutorial aberto a dele');
  assert.match(sound, /return CUR\|\|'amazora'/, 'na sala toca a faixa do mundo atual');
  assert.match(sound, /VW\.id[\s\S]*KW\.id[\s\S]*DJ\.on\)\)return''/, 'pausa com vídeo, karaokê ou rádio');
  assert.match(sound, /musSync\(\);\n if\(mode!=='play'/, 'a troca de mundo é acompanhada a cada quadro');
  assert.ok(!/\bsquare\b/.test(sound.slice(sound.indexOf('música lofi'), sound.indexOf('$(\'#bMus\')'))), 'sem a onda quadrada eletrônica da música antiga');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="sMus"/);
  assert.match(html, /id="musNow"[^>]*aria-live/, 'a faixa que toca é anunciada');
  assert.match(fs.readFileSync(path.join(root, 'assets/app-voice.js'), 'utf8'), /\['sMus','musG'\]/);
});
