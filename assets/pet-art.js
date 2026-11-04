/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Desenho 2D dos mascotes. Cada criatura é montada em Canvas 2D a partir dos genes (inteiros pequenos que o servidor
 * sorteou), juntando peças vetoriais: corpo, cabeça, orelhas, olhos, cauda, pés, padrões e características especiais.
 * Não há imagem para baixar nem textura na memória: todas as criaturas reaproveitam o mesmo código e as mesmas tabelas.
 *
 * Usado no painel do mascote (assets/app-pet.js) e na página do perfil público (profile.html). Também roda no Node
 * (module.exports) para os testes desenharem todas as combinações num contexto de mentira.
 *
 * Animação: estados (idle, happy, sleep, eat, play, sad) com transição suave. O animador só desenha enquanto o canvas está
 * visível e a aba está aberta, e usa poucos quadros por segundo quando a cena é calma.
 */
(function (root) {
  'use strict';

  /** Cada paleta: [base, sombra, destaque, barriga]. A ordem é o gene `pl` e só pode crescer no fim. */
  const PALETTES = [
    ['#ffb38a', '#f08a5d', '#ff6b6b', '#ffe3cf'],
    ['#8de0c0', '#4fbf9f', '#2f9e8f', '#e0fff3'],
    ['#8cc8ff', '#5a9be0', '#3b6fd0', '#e3f3ff'],
    ['#c3a6ff', '#9a78ea', '#7a4fd6', '#f1e8ff'],
    ['#e8f27a', '#c3cf3c', '#8aa11f', '#fbffd6'],
    ['#ff9ec7', '#ee6aa5', '#d63f86', '#ffe3f0'],
    ['#ff8f7a', '#e8604f', '#c93d3d', '#ffe1da'],
    ['#ffd166', '#e8a93a', '#c27d1a', '#fff2cc'],
    ['#5fd3d9', '#2fa9b5', '#1e7f95', '#d6fbfd'],
    ['#9ccf6f', '#6ea84a', '#477f2f', '#e8f7d2'],
    ['#b57bd6', '#8a54ad', '#623382', '#ecd9f7'],
    ['#8b93a8', '#5f677d', '#3d4358', '#dfe3ee'],
    ['#f6e3c3', '#d9bf94', '#b08a55', '#fffaf0'],
    ['#ffa24d', '#e87b1e', '#c45a0a', '#ffe6cc'],
    ['#7fe3b0', '#47b6e0', '#8a6ae0', '#e3fff2'],
    ['#e86ad3', '#bd43a9', '#8f2a82', '#ffe0fa']
  ];

  /** Corpos: [rx, ry, expoente, afinamento no topo]. */
  const BODIES = [
    [58, 50, 2, 0],
    [50, 56, 2, 0.28],
    [48, 58, 2.1, 0.14],
    [62, 44, 2.4, 0],
    [54, 54, 2, 0],
    [44, 62, 2.2, 0.08],
    [66, 42, 2.6, 0],
    [48, 58, 1.9, 0.38]
  ];
  /** Cabeças: [rx, ry, expoente, afinamento]. */
  const HEADS = [
    [40, 36, 2, 0],
    [46, 32, 2.2, 0],
    [34, 40, 2, 0],
    [44, 34, 2.5, 0.05],
    [42, 34, 3, 0],
    [38, 38, 1.8, 0.3]
  ];
  const EYE_SIZE = [0.82, 1, 1.28];
  const STAGE_SCALE = [0.8, 0.9, 0.98, 1.05];

  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /** Mistura duas cores #rrggbb. */
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16),
      pb = parseInt(b.slice(1), 16);
    const c = i => Math.round(lerp((pa >> i) & 255, (pb >> i) & 255, t));
    return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
  }

  /** Cores finais de uma criatura (já com o tom claro/escuro). */
  function colorsOf(g) {
    const pal = PALETTES[g.pl] || PALETTES[0];
    const t = g.tn === 1 ? ['#ffffff', 0.2] : g.tn === 2 ? ['#241a30', 0.14] : null;
    const f = c => (t ? mix(c, t[0], t[1]) : c);
    return { base: f(pal[0]), shade: f(pal[1]), accent: f(pal[2]), belly: f(pal[3]), ink: '#2a2233', eyeInk: '#241a30' };
  }

  // ---------- peças ----------
  /** Caminho de uma superelipse (forma arredondada que vai de elipse a quase retângulo). */
  function superPath(ctx, cx, cy, rx, ry, n, taper) {
    const N = 36,
      e = 2 / n;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2,
        c = Math.cos(a),
        s = Math.sin(a);
      let x = rx * Math.sign(c) * Math.pow(Math.abs(c), e);
      const y = ry * Math.sign(s) * Math.pow(Math.abs(s), e);
      x *= 1 - taper * (1 - (y / ry + 1) / 2);
      if (i === 0) ctx.moveTo(cx + x, cy + y);
      else ctx.lineTo(cx + x, cy + y);
    }
    ctx.closePath();
  }

  function ellipse(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2);
  }

  function star(ctx, x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + (i * Math.PI) / 5 - Math.PI / 2,
        rr = i % 2 ? r * 0.45 : r;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function fillStroke(ctx, fill, stroke, w) {
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = w || 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  function drawTail(ctx, g, C, sway) {
    if (!g.tl) return;
    ctx.save();
    ctx.translate(150, 132);
    ctx.rotate(sway * 0.12);
    if (g.tl === 1) {
      ellipse(ctx, 6, 0, 11, 10);
      fillStroke(ctx, C.base, C.shade, 2);
    } else if (g.tl === 2) {
      ctx.beginPath();
      ctx.moveTo(-6, 6);
      ctx.bezierCurveTo(24, 10, 34, -14, 16, -26);
      ctx.bezierCurveTo(30, -10, 14, 2, -6, -4);
      ctx.closePath();
      fillStroke(ctx, C.base, C.shade, 2);
    } else if (g.tl === 3) {
      ctx.beginPath();
      ctx.moveTo(-6, 6);
      ctx.lineTo(20, -6);
      ctx.lineTo(17, 8);
      ctx.lineTo(22, 16);
      ctx.closePath();
      fillStroke(ctx, C.accent, C.shade, 2);
    } else {
      for (let i = -1; i <= 1; i++) {
        ctx.save();
        ctx.rotate(i * 0.5);
        ellipse(ctx, 14, -4, 12, 5);
        fillStroke(ctx, i === 0 ? C.accent : C.base, C.shade, 1.5);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawFeet(ctx, g, C, hop) {
    for (const sx of [-1, 1]) {
      const x = 100 + sx * 24,
        y = 163 - hop;
      if (g.ft === 2) {
        ellipse(ctx, x, y, 17, 7);
        fillStroke(ctx, C.accent, C.shade, 1.8);
        ctx.strokeStyle = C.shade;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 3);
        ctx.lineTo(x - 6, y + 5);
        ctx.moveTo(x + 6, y - 3);
        ctx.lineTo(x + 6, y + 5);
        ctx.stroke();
      } else {
        ellipse(ctx, x, y, g.ft === 1 ? 14 : 12, 8);
        fillStroke(ctx, C.base, C.shade, 2);
        if (g.ft === 1) {
          ctx.fillStyle = C.shade;
          for (const d of [-5, 0, 5]) {
            ellipse(ctx, x + d, y + 3, 1.6, 1.6);
            ctx.fill();
          }
        }
      }
    }
  }

  function drawArms(ctx, C, up, wave, rx) {
    for (const sx of [-1, 1]) {
      ctx.save();
      ctx.translate(100 + sx * (rx - 4), 112);
      ctx.rotate(sx * (0.5 - up * 1.5) + (up > 0.3 ? Math.sin(wave * 6 + sx) * 0.2 : 0));
      ellipse(ctx, sx * 7, 6, 8, 14, 0);
      fillStroke(ctx, C.base, C.shade, 2);
      ctx.restore();
    }
  }

  function drawBody(ctx, g, C, bodyK) {
    const [rx, ry, n, tp] = BODIES[g.bd] || BODIES[0];
    const cx = 100,
      cy = 114;
    superPath(ctx, cx, cy, rx * bodyK[0], ry * bodyK[1], n, tp);
    const gr = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    gr.addColorStop(0, C.base);
    gr.addColorStop(1, mix(C.base, C.shade, 0.55));
    fillStroke(ctx, gr, C.shade, 2.4);
    ctx.save();
    superPath(ctx, cx, cy, rx * bodyK[0] - 1, ry * bodyK[1] - 1, n, tp);
    ctx.clip();
    // barriga e padrões, sempre recortados pelo corpo
    if (g.pt === 1 || g.pt === 4) {
      ellipse(ctx, cx, cy + ry * 0.28, rx * 0.55, ry * 0.55);
      ctx.fillStyle = C.belly;
      ctx.fill();
    }
    if (g.pt === 2) {
      ctx.fillStyle = mix(C.base, C.accent, 0.55);
      for (const [dx, dy, r] of [[-26, -8, 8], [24, 4, 9], [-10, 28, 7], [18, -22, 6], [-34, 22, 5]]) {
        ellipse(ctx, cx + dx, cy + dy, r, r * 0.9);
        ctx.fill();
      }
    }
    if (g.pt === 3) {
      ctx.strokeStyle = mix(C.base, C.shade, 0.7);
      ctx.lineWidth = 7;
      for (let i = -1; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - rx, cy - 6 + i * 18);
        ctx.quadraticCurveTo(cx, cy + 6 + i * 18, cx + rx, cy - 6 + i * 18);
        ctx.stroke();
      }
    }
    if (g.pt === 5) {
      ctx.fillStyle = mix(C.base, C.shade, 0.75);
      ctx.fillRect(cx - rx, cy + ry * 0.12, rx * 2, ry);
    }
    ctx.restore();
  }

  function drawEars(ctx, g, C, headY, tilt) {
    const e = g.ea;
    if (!e) return;
    const h = HEADS[g.hd] || HEADS[0],
      w = h[0],
      top = headY - h[1];
    ctx.save();
    if (e === 1) {
      for (const sx of [-1, 1]) {
        ellipse(ctx, 100 + sx * (w * 0.62), top + 6, 12, 13);
        fillStroke(ctx, C.base, C.shade, 2);
        ellipse(ctx, 100 + sx * (w * 0.62), top + 7, 6, 7);
        ctx.fillStyle = C.belly;
        ctx.fill();
      }
    } else if (e === 2) {
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(100 + sx * (w * 0.25), top + 6);
        ctx.lineTo(100 + sx * (w * 0.78), top - 20);
        ctx.lineTo(100 + sx * (w * 0.9), top + 14);
        ctx.closePath();
        fillStroke(ctx, C.base, C.shade, 2);
        ctx.beginPath();
        ctx.moveTo(100 + sx * (w * 0.5), top + 2);
        ctx.lineTo(100 + sx * (w * 0.76), top - 12);
        ctx.lineTo(100 + sx * (w * 0.8), top + 8);
        ctx.closePath();
        ctx.fillStyle = C.accent;
        ctx.fill();
      }
    } else if (e === 3) {
      for (const sx of [-1, 1]) {
        ctx.save();
        ctx.translate(100 + sx * (w * 0.88), headY - 4);
        ctx.rotate(sx * (0.35 + tilt * 0.1));
        ellipse(ctx, 0, 14, 10, 22);
        fillStroke(ctx, C.shade, mix(C.shade, '#000000', 0.2), 2);
        ctx.restore();
      }
    } else if (e === 4) {
      for (const sx of [-1, 1]) {
        ctx.strokeStyle = C.shade;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(100 + sx * 10, top + 4);
        ctx.quadraticCurveTo(100 + sx * 22, top - 20, 100 + sx * (28 + tilt * 3), top - 32);
        ctx.stroke();
        ellipse(ctx, 100 + sx * (28 + tilt * 3), top - 34, 6, 6);
        fillStroke(ctx, C.accent, C.shade, 1.8);
      }
    } else if (e === 5) {
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(100 + sx * (w * 0.4), top + 8);
        ctx.quadraticCurveTo(100 + sx * (w * 0.62), top - 6, 100 + sx * (w * 0.5), top - 24);
        ctx.quadraticCurveTo(100 + sx * (w * 0.84), top - 8, 100 + sx * (w * 0.76), top + 14);
        ctx.closePath();
        fillStroke(ctx, C.accent, C.shade, 2);
      }
    } else if (e === 6) {
      ctx.beginPath();
      ctx.moveTo(100, top + 6);
      ctx.quadraticCurveTo(100, top - 14, 100, top - 18);
      ctx.strokeStyle = '#3f9a49';
      ctx.lineWidth = 3;
      ctx.stroke();
      for (const sx of [-1, 1]) {
        ctx.save();
        ctx.translate(100, top - 14);
        ctx.rotate(sx * 0.7 + tilt * 0.08);
        ellipse(ctx, sx * 10, 0, 12, 6);
        fillStroke(ctx, '#6bd16f', '#3f9a49', 1.8);
        ctx.restore();
      }
    } else if (e === 7) {
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(100 + i * 9 - 6, top + 8);
        ctx.lineTo(100 + i * 12, top - 18 + Math.abs(i) * 6);
        ctx.lineTo(100 + i * 9 + 6, top + 8);
        ctx.closePath();
        fillStroke(ctx, i % 2 ? C.base : C.accent, C.shade, 1.8);
      }
    }
    ctx.restore();
  }

  function eyeAt(ctx, g, C, x, y, k, open, joy, size) {
    const s = EYE_SIZE[g.es] * size;
    if (open < 0.12 || joy > 0.5) {
      // olho fechado ou de alegria: um arco
      ctx.strokeStyle = C.eyeInk;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (joy > 0.5) ctx.arc(x, y + 2, 6 * s, Math.PI * 1.1, Math.PI * 1.9);
      else ctx.arc(x, y - 2, 6 * s, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      return;
    }
    const sh = g.ey;
    const o = clamp01(open);
    if (sh === 0 || sh === 4) {
      ellipse(ctx, x, y, 7 * s, 7.5 * s * o);
      ctx.fillStyle = C.eyeInk;
      ctx.fill();
      if (sh === 4) {
        ellipse(ctx, x, y + 1, 4 * s, 4.5 * s * o);
        ctx.fillStyle = mix(C.accent, '#ffffff', 0.15);
        ctx.fill();
        ellipse(ctx, x + 2 * s, y - 3 * s, 1.8 * s, 1.8 * s);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ellipse(ctx, x - 2.5 * s, y + 2.5 * s, 1.1 * s, 1.1 * s);
        ctx.fill();
      }
    } else if (sh === 1) {
      ellipse(ctx, x, y, 5.6 * s, 9 * s * o);
      ctx.fillStyle = C.eyeInk;
      ctx.fill();
    } else if (sh === 2) {
      ellipse(ctx, x, y, 9 * s, 6 * s * o);
      ctx.fillStyle = C.eyeInk;
      ctx.fill();
    } else if (sh === 3) {
      ellipse(ctx, x, y, 7 * s, 7 * s * o);
      ctx.fillStyle = C.eyeInk;
      ctx.fill();
      ctx.fillStyle = mix(C.base, C.shade, 0.5);
      ctx.fillRect(x - 9 * s, y - 8 * s * o, 18 * s, 8 * s * o);
      ctx.strokeStyle = C.eyeInk;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8 * s, y - 0.5);
      ctx.lineTo(x + 8 * s, y - 0.5);
      ctx.stroke();
    } else if (sh === 5) {
      ellipse(ctx, x, y, 7.5 * s, 8 * s * o);
      ctx.fillStyle = mix(C.accent, '#ffe9a8', 0.4);
      ctx.fill();
      ellipse(ctx, x, y, 2.2 * s, 7 * s * o);
      ctx.fillStyle = C.eyeInk;
      ctx.fill();
      ctx.strokeStyle = C.eyeInk;
      ctx.lineWidth = 1.6;
      ellipse(ctx, x, y, 7.5 * s, 8 * s * o);
      ctx.stroke();
    } else {
      ellipse(ctx, x, y, 4.3 * s, 4.6 * s * o);
      ctx.fillStyle = C.eyeInk;
      ctx.fill();
    }
    if (sh !== 4 && sh !== 5) {
      ellipse(ctx, x + 2 * s, y - 2.6 * s * o, 1.7 * s, 1.7 * s);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }

  function drawFace(ctx, g, C, headY, P, t) {
    const dx = 17,
      ey = headY + 3;
    if (g.ck) {
      for (const sx of [-1, 1]) {
        if (g.ck === 1) {
          ellipse(ctx, 100 + sx * 27, headY + 16, 7, 4.4);
          ctx.fillStyle = mix(C.accent, C.base, 0.35);
          ctx.globalAlpha = 0.55;
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          star(ctx, 100 + sx * 27, headY + 16, 5, 0);
          ctx.fillStyle = mix(C.accent, '#ffffff', 0.25);
          ctx.fill();
        }
      }
    }
    if (g.pt === 4) {
      ctx.fillStyle = mix(C.shade, '#000000', 0.15);
      for (const sx of [-1, 1])
        for (const [a, b] of [[-3, 0], [3, 2], [0, 5]]) {
          ellipse(ctx, 100 + sx * 29 + a, headY + 12 + b, 1.1, 1.1);
          ctx.fill();
        }
    }
    eyeAt(ctx, g, C, 100 - dx, ey, 1, P.open, P.joy, 1);
    eyeAt(ctx, g, C, 100 + dx, ey, 1, P.open, P.joy, 1);
    // boca
    const my = headY + 20;
    ctx.strokeStyle = C.eyeInk;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    if (P.mouth > 0.12) {
      const mo = P.mouth;
      ellipse(ctx, 100, my + 2, 6 + 3 * mo, 2 + 7 * mo);
      ctx.fillStyle = '#6a2a3a';
      ctx.fill();
      ellipse(ctx, 100, my + 5 + 3 * mo, 3.6, 2.2 * mo + 0.6);
      ctx.fillStyle = '#ff8fa8';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(100 - 8, my);
      ctx.quadraticCurveTo(100, my + P.smile * 9 + 1, 100 + 8, my);
      ctx.stroke();
    }
    void t;
  }

  function drawSpecialBack(ctx, g, C, t) {
    if (g.sp === 1 || g.sp === 5) {
      const r = 84 + Math.sin(t * 2) * 4;
      const gr = ctx.createRadialGradient(100, 108, 24, 100, 108, r);
      const col = g.sp === 5 ? '#a98bff' : C.accent;
      gr.addColorStop(0, mix(col, '#ffffff', 0.4) + '88');
      gr.addColorStop(1, col + '00');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(100, 108, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSpecialFront(ctx, g, C, t, headY) {
    const [rx, ry, n, tp] = BODIES[g.bd] || BODIES[0];
    if (g.sp === 2) {
      star(ctx, 100, headY - 14, 6, 0);
      fillStroke(ctx, '#ffe27a', '#d9a21a', 1.4);
    } else if (g.sp === 3) {
      ctx.save();
      superPath(ctx, 100, 114, rx, ry, n, tp);
      ctx.clip();
      const gr = ctx.createLinearGradient(40, 60, 160, 170);
      ['#ff6b6b', '#ffd166', '#6bdc8a', '#5ab8ff', '#b07cff'].forEach((c, i) => gr.addColorStop(i / 4, c));
      ctx.globalAlpha = 0.33;
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 200, 180);
      ctx.restore();
    } else if (g.sp === 4) {
      const pts = [[78, 100], [96, 88], [118, 104], [106, 126], [128, 138], [84, 138]];
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      pts.forEach((p, i) => {
        ellipse(ctx, p[0], p[1], 2 + (i % 2), 2 + (i % 2));
        ctx.fill();
      });
    } else if (g.sp === 5) {
      ctx.save();
      superPath(ctx, 100, 114, rx, ry, n, tp);
      ctx.clip();
      const gr = ctx.createLinearGradient(0, 60, 0, 170);
      gr.addColorStop(0, 'rgba(30,20,80,.55)');
      gr.addColorStop(1, 'rgba(60,20,110,.75)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 200, 180);
      ctx.fillStyle = '#ffffff';
      for (const [x, y, k] of [[74, 100, 0], [118, 94, 1], [96, 126, 2], [128, 130, 3], [82, 148, 4], [112, 148, 5]]) {
        const tw = 0.5 + 0.5 * Math.sin(t * 2.2 + k * 1.7);
        ellipse(ctx, x, y, 1.2 + tw * 1.4, 1.2 + tw * 1.4);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawCosmetic(ctx, g, C, cos, headY) {
    const h = HEADS[g.hd] || HEADS[0];
    if (cos === 1) {
      ctx.save();
      ctx.translate(100 + h[0] * 0.55, headY - h[1] * 0.78);
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(sx * 15, -9);
        ctx.lineTo(sx * 15, 9);
        ctx.closePath();
        fillStroke(ctx, '#ff5d8f', '#c93a6c', 1.6);
      }
      ellipse(ctx, 0, 0, 4.5, 4.5);
      fillStroke(ctx, '#ff8fb3', '#c93a6c', 1.4);
      ctx.restore();
    } else if (cos === 2) {
      ctx.beginPath();
      ctx.moveTo(60, headY + h[1] * 0.78);
      ctx.quadraticCurveTo(100, headY + h[1] * 0.78 + 14, 140, headY + h[1] * 0.78);
      ctx.lineTo(138, headY + h[1] * 0.78 + 11);
      ctx.quadraticCurveTo(100, headY + h[1] * 0.78 + 26, 62, headY + h[1] * 0.78 + 11);
      ctx.closePath();
      fillStroke(ctx, '#e8604f', '#a63a2f', 1.6);
      ctx.beginPath();
      ctx.moveTo(122, headY + h[1] * 0.78 + 14);
      ctx.lineTo(134, headY + h[1] * 0.78 + 36);
      ctx.lineTo(120, headY + h[1] * 0.78 + 33);
      ctx.closePath();
      fillStroke(ctx, '#e8604f', '#a63a2f', 1.4);
    } else if (cos === 3) {
      const y = headY - h[1] + 4;
      ctx.beginPath();
      ctx.moveTo(82, y);
      ctx.lineTo(86, y - 14);
      ctx.lineTo(93, y - 5);
      ctx.lineTo(100, y - 17);
      ctx.lineTo(107, y - 5);
      ctx.lineTo(114, y - 14);
      ctx.lineTo(118, y);
      ctx.closePath();
      fillStroke(ctx, '#ffd84d', '#c79a12', 1.6);
      star(ctx, 100, y - 7, 3.4, 0);
      ctx.fillStyle = '#ff7aa8';
      ctx.fill();
    } else if (cos === 4) {
      ctx.strokeStyle = '#3a2f4a';
      ctx.lineWidth = 2.4;
      for (const sx of [-1, 1]) {
        ellipse(ctx, 100 + sx * 17, headY + 3, 12, 12);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(100 - 5, headY + 3);
      ctx.lineTo(100 + 5, headY + 3);
      ctx.stroke();
    }
  }

  /** Brilhos do estágio (só detalhes finos, a identidade não muda). */
  function drawStage(ctx, C, stage, t) {
    if (stage < 1) return;
    ctx.fillStyle = mix(C.accent, '#ffffff', 0.45);
    const n = stage >= 3 ? 4 : stage >= 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = t * 0.8 + (i * Math.PI * 2) / n;
      star(ctx, 100 + Math.cos(a) * 82, 96 + Math.sin(a) * 40, 3.2 + (stage >= 3 ? 1 : 0), a);
      ctx.fill();
    }
  }

  /** Parâmetros-alvo de cada estado (a transição suave fica no animador). */
  const STATES = {
    idle: { open: 1, joy: 0, smile: 0.5, mouth: 0, bounce: 0, bob: 1, arms: 0, headDrop: 0, rate: 1 },
    happy: { open: 1, joy: 1, smile: 1, mouth: 0.4, bounce: 1, bob: 0, arms: 1, headDrop: 0, rate: 1 },
    sleep: { open: 0, joy: 0, smile: 0.2, mouth: 0, bounce: 0, bob: 0.4, arms: 0, headDrop: 3, rate: 0.5 },
    eat: { open: 1, joy: 0, smile: 0.6, mouth: 1, bounce: 0, bob: 0.6, arms: 0.4, headDrop: 0, rate: 1 },
    play: { open: 1, joy: 1, smile: 1, mouth: 0.6, bounce: 1.6, bob: 0, arms: 1, headDrop: 0, rate: 1 },
    sad: { open: 0.7, joy: 0, smile: -0.8, mouth: 0, bounce: 0, bob: 0.3, arms: 0, headDrop: 4, rate: 0.6 }
  };
  const PARAM_KEYS = ['open', 'joy', 'smile', 'mouth', 'bounce', 'bob', 'arms', 'headDrop', 'rate'];

  /**
   * Desenha um quadro.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} W largura do canvas @param {number} H altura do canvas
   * @param {Record<string, number>} g genes
   * @param {{t?: number, p?: Record<string, number>, state?: string, stage?: number, cos?: number, blink?: number, flash?: string}} [o]
   */
  function draw(ctx, W, H, g, o) {
    o = o || {};
    const t = o.t || 0,
      stage = Math.max(0, Math.min(3, o.stage | 0)),
      cos = o.cos | 0;
    const P = Object.assign({}, STATES[o.state || 'idle'] || STATES.idle, o.p || {});
    const C = colorsOf(g);
    const k = STAGE_SCALE[stage];
    const rate = P.rate;
    const bounce = P.bounce ? -Math.abs(Math.sin(t * 5.2 * rate)) * 9 * P.bounce : 0;
    const bob = Math.sin(t * 2.1 * rate) * 1.8 * P.bob;
    const dy = bounce + bob;
    const blink = o.blink === undefined ? 1 : o.blink;
    const face = { open: P.open * blink, joy: P.joy, smile: P.smile + Math.sin(t * 1.3) * 0.05, mouth: P.mouth * (o.state === 'eat' ? 0.5 + 0.5 * Math.abs(Math.sin(t * 9)) : 1) };
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.scale(W / 200, H / 180);
    drawSpecialBack(ctx, g, C, t);
    // sombra no chão
    ellipse(ctx, 100, 170, 52 * k - bounce * 0.4, 7);
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.fill();
    // tudo o que é do bicho sobe e desce junto, ancorado no chão
    ctx.translate(100, 168);
    ctx.scale(k, k);
    ctx.translate(-100, -168 + dy);
    const breath = 1 + Math.sin(t * 2.1 * rate) * 0.014 * (P.bob ? 1 : 0.4);
    const headY = 66 + P.headDrop;
    drawTail(ctx, g, C, Math.sin(t * 3.1));
    drawFeet(ctx, g, C, Math.max(0, bounce * -0.15));
    drawArms(ctx, C, P.arms, t, (BODIES[g.bd] || BODIES[0])[0]);
    drawBody(ctx, g, C, [1, breath]);
    drawSpecialFront(ctx, g, C, t, headY);
    drawEars(ctx, g, C, headY, Math.sin(t * 2.4) * (P.bounce ? 2 : 0.6));
    const [hx, hy, hn, ht] = HEADS[g.hd] || HEADS[0];
    const hk = stage === 0 ? 1.1 : 1;
    superPath(ctx, 100, headY, hx * hk, hy * hk, hn, ht);
    const gr = ctx.createLinearGradient(0, headY - hy, 0, headY + hy);
    gr.addColorStop(0, mix(C.base, '#ffffff', 0.08));
    gr.addColorStop(1, C.base);
    fillStroke(ctx, gr, C.shade, 2.4);
    drawFace(ctx, g, C, headY, face, t);
    drawCosmetic(ctx, g, C, cos, headY);
    drawStage(ctx, C, stage, t);
    // detalhes dos estados
    if (o.state === 'sleep') {
      ctx.fillStyle = mix(C.accent, '#ffffff', 0.3);
      ctx.font = 'bold 15px sans-serif';
      for (let i = 0; i < 3; i++) {
        const a = (t * 0.7 + i / 3) % 1;
        ctx.globalAlpha = 1 - a;
        ctx.fillText('z', 128 + a * 14 + i * 4, 52 - a * 30);
      }
      ctx.globalAlpha = 1;
    }
    if (o.state === 'happy' || o.state === 'play') {
      for (let i = 0; i < 2; i++) {
        const a = (t * 0.9 + i / 2) % 1;
        ctx.globalAlpha = 1 - a;
        star(ctx, 60 + i * 80 + a * 6, 52 - a * 22, 5, a * 2);
        ctx.fillStyle = '#ffd166';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (o.state === 'eat') {
      ellipse(ctx, 100 + Math.sin(t * 3) * 3, headY + 36, 6, 6);
      fillStroke(ctx, '#ff7a59', '#c24a2f', 1.6);
    }
    if (o.state === 'play') {
      const by = 138 - Math.abs(Math.sin(t * 5.2)) * 34;
      ellipse(ctx, 160, by, 9, 9);
      fillStroke(ctx, C.accent, mix(C.accent, '#000000', 0.3), 1.8);
    }
    if (o.state === 'sad') {
      ellipse(ctx, 100 + 26, headY + 14 + ((t * 18) % 14), 2.4, 3.6);
      ctx.fillStyle = '#8fd0ff';
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Animador: um por canvas. Só desenha com o canvas visível e a aba aberta, e usa poucos quadros quando a cena é calma.
   * @param {HTMLCanvasElement} canvas
   * @param {Record<string, number>} genes
   * @param {{stage?: number, cos?: number, state?: string}} [opt]
   */
  function createAnimator(canvas, genes, opt) {
    opt = opt || {};
    const ctx = canvas.getContext('2d');
    let state = opt.state || 'idle',
      base = state,
      stage = opt.stage | 0,
      cos = opt.cos | 0,
      raf = 0,
      last = 0,
      lastDraw = 0,
      t0 = 0,
      blinkAt = 2,
      flashUntil = 0,
      running = false;
    const cur = Object.assign({}, STATES[state]);

    function resolve(now) {
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      const target = STATES[state] || STATES.idle;
      const k = 1 - Math.exp(-dt * 7);
      for (const key of PARAM_KEYS) cur[key] = lerp(cur[key], target[key], k);
      if (flashUntil && now > flashUntil) {
        flashUntil = 0;
        state = base;
      }
    }
    function frame(now) {
      raf = 0;
      if (!running) return;
      if (document.hidden || !canvas.isConnected || canvas.offsetParent === null) {
        running = false; // painel fechado ou aba em segundo plano: não gasta nada
        return;
      }
      const calm = state === 'idle' || state === 'sleep' || state === 'sad';
      const gap = calm ? 1000 / 14 : 1000 / 28;
      if (now - lastDraw >= gap) {
        resolve(now);
        lastDraw = now;
        const t = (now - t0) / 1000;
        let blink = 1;
        if (t > blinkAt) {
          const x = (t - blinkAt) / 0.16;
          blink = x < 1 ? Math.abs(1 - 2 * x) : 1;
          if (x >= 1) blinkAt = t + 2.4 + ((t * 7.3) % 2.6);
        }
        draw(ctx, canvas.width, canvas.height, genes, { t, p: cur, state, stage, cos, blink });
      }
      raf = requestAnimationFrame(frame);
    }
    const api = {
      start() {
        if (running) return;
        running = true;
        t0 = t0 || performance.now();
        last = performance.now();
        if (!raf) raf = requestAnimationFrame(frame);
      },
      stop() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      },
      /** Estado de fundo (o que o humor pede). */
      setState(s) {
        if (!STATES[s]) return;
        base = s;
        if (!flashUntil) state = s;
        api.still();
      },
      /** Animação curta de uma ação (comer, brincar...), depois volta ao estado de fundo. */
      flash(s, ms) {
        if (!STATES[s]) return;
        state = s;
        flashUntil = performance.now() + (ms || 2200);
        api.start();
      },
      setLook(o) {
        if (o.stage !== undefined) stage = o.stage | 0;
        if (o.cos !== undefined) cos = o.cos | 0;
        api.still();
      },
      /** Um quadro parado (para painel fechado ou aba em segundo plano). */
      still() {
        const t = (performance.now() - (t0 || performance.now())) / 1000;
        draw(ctx, canvas.width, canvas.height, genes, { t, p: cur, state, stage, cos });
      },
      get running() {
        return running;
      }
    };
    return api;
  }

  const api = { PALETTES, BODIES, HEADS, STATES, draw, createAnimator, colorsOf, mix };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PetArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
