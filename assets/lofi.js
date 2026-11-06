/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Músicas lofi do jogo, compostas para o Skyke3D: uma para a tela inicial ("menu"), uma para o tutorial em quadrinhos ("tutorial")
 * e uma para cada mundo (mesmo id do mundo).
 * Aqui só ficam as composições (acordes, melodia, ritmo e timbre de cada faixa) e o leitor delas; quem toca é assets/app-sound.js,
 * sintetizando tudo em Web Audio (nenhum arquivo de áudio). O catálogo de mundos vive em assets/catalog.js.
 *
 * Notação:
 * - ch: um acorde por compasso (4 tempos), como "Ebmaj9 Cm9 Fm9 Bb13" (qualidades em QUAL).
 * - mel: um texto por compasso com 16 posições (semicolcheias): nota com oitava (G5, Bb4, F#5), "." pausa, "-" prolonga a anterior.
 *   A melodia tem o mesmo número de compassos que os acordes; ela toca duas vezes (a segunda mais enxuta) e depois descansa.
 * - comp, bass, k, s, h: 16 posições. comp = quando o piano elétrico toca o acorde; bass: x raiz, f quinta, o oitava;
 *   k = bumbo, s = caixa/aro, h = chimbal: x forte, o suave, "." nada.
 * - lead: timbre da melodia (rhodes, bell, pluck, kalimba, flute, marimba, koto). warm = corte do passa-baixa (Hz, menor = mais abafado),
 *   crackle = chiado de vinil (0 a 1), wob = oscilação de fita em cents, pad = volume do colchão de acordes, sw = swing (0 a 0,4).
 * Para acrescentar um mundo ou mudar uma faixa: edite aqui; os testes (tests/lofi.test.js) conferem a notação, as faixas distintas e a
 * calibração de volume (tools/audio-audit.js) dá o ganho `mus_<id>` na tabela TRIM de app-sound.js.
 */
(function (/** @type {any} */ root) {
  'use strict';
  const T = (/** @type {any} */ o) => o;
  const TRACKS = {
    menu: T({
      n: 'Órbita', bpm: 72, sw: 0.3, lead: 'bell', pad: 0.7, warm: 2800, crackle: 0.5, wob: 6,
      ch: 'Ebmaj9 Cm9 Fm9 Bb13', comp: 'x.....x...x.....', bass: 'x.....f...x.....',
      k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xo',
      mel: ['G5 . . Bb5 . . G5 . F5 . . . Eb5 . . .', 'Eb5 . G5 . . F5 Eb5 . . . D5 . C5 . . .', 'C5 . . Eb5 . F5 . . Ab5 . G5 . . . F5 .', 'D5 . F5 . . . Eb5 . D5 . C5 . Bb4 . . .']
    }),
    // tutorial: leve e saltitante, para ler os quadrinhos (Fá maior, koto dedilhado)
    tutorial: T({
      n: 'Página Virada', bpm: 76, sw: 0.3, lead: 'koto', pad: 0.6, warm: 3100, crackle: 0.45, wob: 7,
      ch: 'Fmaj9 Dm9 Gm9 C13', comp: 'x...x.....x.....', bass: 'x.....x...f.....',
      k: 'x.....x...x.....', s: '....x.......x..o', h: 'x.o.x.o.x.o.x.oo',
      mel: ['A5 . C6 . . A5 . G5 . . F5 . . . G5 .', 'A5 . . D6 . . C6 . A5 . . . G5 . . .', 'Bb5 . . A5 . G5 . . F5 . G5 . . . D5 .', 'E5 . G5 . . . A5 . . G5 . . F5 . . .']
    }),
    amazora: T({
      n: 'Chuva em Amazora', bpm: 74, sw: 0.3, lead: 'kalimba', pad: 0.6, warm: 3200, crackle: 0.5, wob: 6,
      ch: 'Gmaj9 Em9 Cmaj9 D13', comp: 'x.....x...x.....', bass: 'x.....x.......f.',
      k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.',
      mel: ['B5 . D6 . . B5 . . A5 . G5 . . . A5 .', 'G5 . . B5 . . E6 . D6 . B5 . . . G5 .', 'E5 . G5 . . . B5 . C6 . . . B5 . G5 .', 'A5 . . F#5 . . D6 . . . C6 . A5 . . .']
    }),
    cerron: T({
      n: 'Entardecer no Cerron', bpm: 78, sw: 0.32, lead: 'rhodes', pad: 0.6, warm: 3000, crackle: 0.5, wob: 8,
      ch: 'Cmaj9 Am9 Dm9 G13', comp: 'x.....x...x...x.', bass: 'x.....x.f.....x.',
      k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.',
      mel: ['E5 . . G5 . . A5 . G5 . E5 . . . D5 .', 'C5 . . E5 . . G5 . . A5 . . G5 . . .', 'A4 . D5 . . F5 . . E5 . D5 . . . A4 .', 'B4 . D5 . G5 . . F5 . . D5 . B4 . . .']
    }),
    atlanthia: T({
      n: 'Neblina de Atlanthia', bpm: 68, sw: 0.3, lead: 'marimba', pad: 0.9, warm: 2400, crackle: 0.55, wob: 8,
      ch: 'Bbmaj9 Gm9 Ebmaj9 F13', comp: 'x.......x.......', bass: 'x.....x.........',
      k: 'x.......x.......', s: '........x.......', h: '..o...o...o...o.',
      mel: ['D5 - - - F5 - - - Bb5 - - A5 G5 - - -', 'G5 - - - Bb5 - - - A5 - G5 - D5 - - -', 'Eb5 - - G5 - - Bb5 - C6 - - - Bb5 - - -', 'A5 - - - G5 - F5 - C5 - - - . . . .']
    }),
    caatara: T({
      n: 'Sol de Caatara', bpm: 66, sw: 0.3, lead: 'flute', pad: 0.7, warm: 2600, crackle: 0.5, wob: 7,
      ch: 'Dm7 Ebmaj7 Dm7 Cmaj7', comp: 'x.....x.........', bass: 'x.......x.....x.',
      k: 'x..x....x..x....', s: '....o.......o...', h: 'x.o.x.o.x.o.x.o.',
      mel: ['A5 - - Bb5 A5 - - - F5 - G5 - A5 - - -', 'G5 - - - Bb5 - A5 - G5 - F5 - Eb5 - - -', 'F5 - - A5 - - G5 - F5 - E5 - D5 - - -', 'E5 - - G5 - - B5 - A5 - G5 - E5 - - -']
    }),
    panthara: T({
      n: 'Cheia de Panthara', bpm: 62, sw: 0.36, lead: 'rhodes', pad: 0.8, warm: 2300, crackle: 0.5, wob: 15,
      ch: 'Dbmaj9 Bbm9 Gbmaj9 Ab13', comp: 'x.....x...x...x.', bass: 'x...x...x.....x.',
      k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.',
      mel: ['F5 . Ab5 . . F5 . . Eb5 . Db5 . . . Eb5 .', 'Db5 . . F5 . . Bb5 . Ab5 . F5 . . . Db5 .', 'Bb5 . . Ab5 . . Db6 . Bb5 . . . Gb5 . . .', 'Eb5 . . Gb5 . . Bb5 . . Ab5 . . Gb5 . . .']
    }),
    pamphora: T({
      n: 'Campos de Pamphora', bpm: 68, sw: 0.28, lead: 'pluck', pad: 0.5, warm: 3000, crackle: 0.4, wob: 6,
      ch: 'Am9 Fmaj9 Dm9 E7b9', comp: 'x.....x...x.....', bass: 'x.......f.......',
      k: 'x.......x.......', s: '........x.......', h: 'o.o.o.o.o.o.o.o.',
      mel: ['E5 . . A5 . . B5 . C6 . . B5 A5 . . .', 'A5 . . C6 . . A5 . F5 . . A5 C6 . . .', 'F5 . . A5 . . D5 . F5 . . E5 . . D5 .', 'E5 . . G#5 . . B5 . . . A5 . . . E5 .']
    })
  };

  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  /** @type {Record<string, number[]>} */
  const QUAL = {
    maj9: [0, 4, 7, 11, 14], maj7: [0, 4, 7, 11], 'maj7#11': [0, 4, 7, 11, 18], m9: [0, 3, 7, 10, 14], m7: [0, 3, 7, 10], m11: [0, 3, 7, 10, 17],
    13: [0, 4, 10, 14, 21], 9: [0, 4, 7, 10, 14], '7b9': [0, 4, 7, 10, 13], 7: [0, 4, 7, 10], 6: [0, 4, 7, 9]
  };
  /** classe de altura (0 a 11) de "C", "Eb", "F#" */
  function pitchClass(/** @type {string} */ s) {
    const m = /^([A-G])([#b]?)$/.exec(s);
    if (!m) throw new Error('nota inválida: ' + s);
    return (NOTE[/** @type {'C'} */ (m[1])] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  }
  /** acorde "Ebmaj9": baixo (C2 a B2) e as notas do piano (de 57 a 76), sem a raiz */
  function parseChord(/** @type {string} */ s) {
    const m = /^([A-G][#b]?)(.+)$/.exec(s);
    if (!m || !QUAL[m[2]]) throw new Error('acorde inválido: ' + s);
    const r = pitchClass(m[1]);
    const notes = [...new Set(QUAL[m[2]].slice(1).map(i => {
      let n = 48 + r + i;
      while (n < 57) n += 12;
      while (n > 76) n -= 12;
      return n;
    }))].sort((a, b) => a - b);
    return { name: s, bass: 36 + r, notes };
  }
  /** um compasso de melodia: 16 posições, cada uma null ou { m: nota MIDI, len: posições } */
  function parseBar(/** @type {string} */ s) {
    const tk = s.trim().split(/\s+/);
    if (tk.length !== 16) throw new Error('compasso com ' + tk.length + ' posições (precisa de 16): ' + s);
    /** @type {({m: number, len: number}|null)[]} */
    const out = Array(16).fill(null);
    let last = -1;
    tk.forEach((t, i) => {
      if (t === '.') {
        last = -1;
        return;
      }
      if (t === '-') {
        if (last < 0) throw new Error('"-" sem nota antes: ' + s);
        /** @type {any} */ (out[last]).len++;
        return;
      }
      const m = /^([A-G][#b]?)(\d)$/.exec(t);
      if (!m) throw new Error('nota inválida: ' + t);
      out[i] = { m: 12 * (+m[2] + 1) + pitchClass(m[1]), len: 1 };
      last = i;
    });
    return out;
  }
  const row = (/** @type {string} */ s, /** @type {string} */ ok) => {
    if (typeof s !== 'string' || s.length !== 16 || [...s].some(c => c !== '.' && !ok.includes(c))) throw new Error('padrão inválido: ' + s);
    return s;
  };
  /** faixa pronta para tocar (acordes, melodia e padrões já lidos) */
  function build(/** @type {string} */ id) {
    const t = TRACKS[/** @type {keyof typeof TRACKS} */ (id)];
    if (!t) return null;
    const chords = t.ch.split(/\s+/).map(parseChord);
    if (t.mel.length !== chords.length) throw new Error(id + ': melodia e acordes com tamanhos diferentes');
    return {
      id, n: t.n, bpm: t.bpm, sw: t.sw, lead: t.lead, pad: t.pad, warm: t.warm, crackle: t.crackle, wob: t.wob, nb: chords.length, chords,
      mel: t.mel.map(parseBar), comp: row(t.comp, 'x'), bass: row(t.bass, 'xfo'), k: row(t.k, 'xo'), s: row(t.s, 'xo'), h: row(t.h, 'xo')
    };
  }
  const LEADS = ['rhodes', 'bell', 'pluck', 'kalimba', 'flute', 'marimba', 'koto'];
  const API = { TRACKS, LEADS, QUAL, build, parseChord, parseBar, pitchClass };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.SKYLOFI = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
