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

// Reproduz todos os participantes num único nó. O relógio usa currentFrame do
// AudioContext, para conservar a agenda e o buffer adaptativo definidos pelo cliente.
class VoiceMixer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = new Map();
    this.meterFrames = 0;
    this.meter = new Map();
    this.port.onmessage = e => {
      const m = e.data;
      if (m.type === 'drop') {
        this.voices.delete(m.id);
        this.meter.delete(m.id);
      } else if (m.type === 'gain') {
        const v = this.voices.get(m.id);
        if (v) v.gain = m.value;
      } else if (m.type === 'frame') {
        let v = this.voices.get(m.id);
        if (!v) {
          v = { gain: m.gain, blocks: [] };
          this.voices.set(m.id, v);
          this.meter.set(m.id, 0);
        }
        const b = { start: m.start, data: m.data };
        let i = v.blocks.length;
        while (i && v.blocks[i - 1].start > b.start) i--;
        v.blocks.splice(i, 0, b);
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0][0], start = currentFrame, end = start + out.length;
    out.fill(0);
    if (!this.voices.size) {
      this.meterFrames = 0;
      return true;
    }
    for (const [id, v] of this.voices) {
      while (v.blocks.length && v.blocks[0].start + v.blocks[0].data.length <= start) v.blocks.shift();
      let sum = 0;
      for (const b of v.blocks) {
        if (b.start >= end) break;
        const from = Math.max(start, b.start), to = Math.min(end, b.start + b.data.length);
        for (let frame = from; frame < to; frame++) {
          const sample = b.data[frame - b.start] * v.gain;
          out[frame - start] += sample;
          sum += sample * sample;
        }
      }
      this.meter.set(id, (this.meter.get(id) || 0) + sum);
    }
    this.meterFrames += out.length;
    if (this.meterFrames >= sampleRate * 0.05) {
      const levels = [];
      for (const [id, sum] of this.meter) levels.push([id, Math.sqrt(sum / this.meterFrames)]);
      this.port.postMessage({ type: 'levels', levels });
      this.meter.clear();
      for (const id of this.voices.keys()) this.meter.set(id, 0);
      this.meterFrames = 0;
    }
    return true;
  }
}
registerProcessor('voice-mixer', VoiceMixer);
