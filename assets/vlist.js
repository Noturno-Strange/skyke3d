/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Lista com rolagem virtual (regras.md 12.1): só os itens visíveis (mais uma margem) existem no DOM, e os elementos são
 * reaproveitados ao rolar. Serve para listas que só crescem (mochila, culinária, amigos). Script comum, no escopo global.
 *
 *   const L = vlist(host, { bind(el, row, i), label })
 *   L.set(rows)   // rows = [{ h: altura em px no texto padrão, ...dados }]: cabeçalhos de grupo e linhas de itens, cada uma com a sua altura
 *   L.refresh()   // repinta as linhas visíveis (um dado mudou, o conteúdo da linha é refeito)
 *   L.reveal(i)   // rola até a linha i
 *
 * As alturas acompanham o ajuste "Texto" (variável CSS --tx; regras.md 12.3): com texto 1,6× cada linha fica 1,6× mais alta, senão as
 * linhas se sobrepõem. Quando o ajuste muda, o jogo dispara o evento `skyke:tx` e todas as listas se refazem.
 * Com `fit: true`, a altura do `host` acompanha o conteúdo (o CSS limita com max-height e flex), para o painel não sobrar vazio.
 * `host` é o elemento que rola (altura limitada no CSS: o painel não cresce com a quantidade de itens). Cada linha é um elemento
 * posicionado por transform; `bind` precisa refazer todo o conteúdo da linha, porque o elemento serve a outra linha depois.
 * Teclado: ↑ e ↓ andam entre os controles das linhas visíveis e rolam a lista; Home e End vão ao primeiro e ao último.
 */
function vlist(/** @type {HTMLElement} */ host, /** @type {any} */ o) {
  const inner = document.createElement('div');
  inner.className = 'vl-in';
  host.append(inner);
  host.classList.add('vl');
  /** @type {any[]} */
  let rows = [];
  /** @type {number[]} */
  let tops = [];
  /** @type {number[]} */
  let hs = [];
  /** @type {HTMLElement[]} */
  const pool = [];
  let raf = 0,
    total = 0;
  const OVER = 120; // px de margem acima e abaixo da área visível

  /** escala do texto (--tx); 1 fora do navegador */
  function tx() {
    try {
      return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tx')) || 1;
    } catch {
      return 1;
    }
  }
  function layout() {
    const k = tx();
    tops = [];
    hs = [];
    let y = 0;
    for (const r of rows) {
      const h = Math.round(r.h * k);
      tops.push(y);
      hs.push(h);
      y += h;
    }
    total = y;
    inner.style.height = y + 'px';
    if (o.fit) host.style.height = y + 'px';
  }
  /** primeira linha cujo fim passa de y (busca binária) */
  function firstAt(/** @type {number} */ y) {
    let lo = 0,
      hi = rows.length - 1,
      r = rows.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tops[mid] + hs[mid] > y) {
        r = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    return r;
  }
  function paint() {
    raf = 0;
    const y = host.scrollTop,
      end = y + (host.clientHeight || 300) + OVER;
    let n = 0;
    for (let i = firstAt(y - OVER); i < rows.length && tops[i] < end; i++, n++) {
      let el = pool[n];
      if (!el) {
        el = document.createElement('div');
        el.className = 'vl-r';
        inner.append(el);
        pool.push(el);
      }
      el.hidden = false;
      el.style.transform = 'translateY(' + tops[i] + 'px)';
      el.style.height = hs[i] + 'px';
      el.dataset.row = String(i);
      o.bind(el, rows[i], i);
    }
    for (; n < pool.length; n++) pool[n].hidden = true;
  }
  const soon = () => {
    if (!raf) raf = requestAnimationFrame(paint);
  };
  host.addEventListener('scroll', soon, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(soon).observe(host);
  if (typeof addEventListener === 'function')
    addEventListener('skyke:tx', () => {
      layout();
      paint();
    });

  /** índices das linhas que têm um controle (botão) e o próximo/anterior a partir de i */
  function stepFocus(/** @type {number} */ from, /** @type {number} */ dir) {
    for (let i = from + dir; i >= 0 && i < rows.length; i += dir) if (rows[i].k !== 'none' && !rows[i].skip) return i;
    return -1;
  }
  function focusRow(/** @type {number} */ i) {
    reveal(i);
    paint();
    const el = inner.querySelector('[data-row="' + i + '"]:not([hidden])');
    const b = el && (/** @type {HTMLElement|null} */ (el.querySelector('button,[tabindex]')));
    if (b) b.focus();
  }
  host.addEventListener('keydown', e => {
    const k = e.key;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(k)) return;
    const cur = e.target instanceof Element ? e.target.closest('[data-row]') : null;
    const i = cur ? +(/** @type {HTMLElement} */ (cur).dataset.row) : -1;
    const to = k === 'Home' ? stepFocus(-1, 1) : k === 'End' ? stepFocus(rows.length, -1) : stepFocus(i < 0 ? (k === 'ArrowDown' ? -1 : rows.length) : i, k === 'ArrowDown' ? 1 : -1);
    if (to >= 0) {
      e.preventDefault();
      focusRow(to);
    }
  });

  function reveal(/** @type {number} */ i) {
    if (i < 0 || i >= rows.length) return;
    const top = tops[i],
      bot = top + hs[i],
      H = host.clientHeight;
    if (top < host.scrollTop) host.scrollTop = top;
    else if (bot > host.scrollTop + H) host.scrollTop = bot - H;
  }
  return {
    el: host,
    /** troca as linhas (busca, grupo recolhido, dados novos); a posição de rolagem é mantida dentro do novo tamanho */
    set(/** @type {any[]} */ r) {
      rows = r;
      layout();
      const maxTop = Math.max(0, total - host.clientHeight);
      if (host.scrollTop > maxTop) host.scrollTop = maxTop;
      paint();
    },
    refresh: paint,
    reveal,
    size: () => rows.length
  };
}
