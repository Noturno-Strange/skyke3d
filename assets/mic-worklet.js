/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Captura do microfone na linha de áudio (AudioWorklet), fora da linha principal que desenha o 3D: um quadro lento do jogo não
 * corta mais a voz. Junta os blocos de 128 amostras em blocos de 1024 e entrega cada um ao jogo (assets/app-voice.js), que
 * detecta a fala, nivela e codifica. Não toca som nenhum.
 */
'use strict';
const N = 1024;
class MicTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.b = new Float32Array(N);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let i = 0;
    while (i < ch.length) {
      const k = Math.min(ch.length - i, N - this.n);
      this.b.set(ch.subarray(i, i + k), this.n);
      this.n += k;
      i += k;
      if (this.n === N) {
        this.port.postMessage(this.b, [this.b.buffer]);
        this.b = new Float32Array(N);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('mic-tap', MicTap);
