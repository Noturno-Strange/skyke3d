/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Barra de rolagem própria. As barras nativas não usam o cursor do jogo no
 * WebKitGTK (janela do desktop) nem no Firefox, então desenhamos trilho e
 * thumb dentro da área rolável. Assim o ponteiro fica sobre um elemento comum:
 * o cursor personalizado vale e o arrasto, o clique no trilho e a roda seguem
 * funcionando.
 */
(() => {
  if (!window.ResizeObserver) return;
  document.documentElement.classList.add('csb-on');
  const hosts = new Map();
  const pending = new Set();
  let frame = 0;

  const px = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d };
  const schedule = el => { pending.add(el); if (!frame) frame = requestAnimationFrame(flush) };
  const flush = () => { frame = 0; const list = [...pending]; pending.clear(); for (const el of list) sync(el) };

  function trackRoom(st) {
    const cs = getComputedStyle(st.bar);
    return Math.max(0, st.bar.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom));
  }

  function sync(el) {
    const st = hosts.get(el);
    if (!st) return;
    if (!el.isConnected) { hosts.delete(el); return; }
    if (!st.bar.isConnected) el.append(st.bar);
    if (!st.bar.isConnected) return;
    const ch = el.clientHeight;
    if (!ch) { st.bar.classList.add('off'); return; }
    let sh = el.scrollHeight;
    let need = sh > ch + 1;
    const extra = need || st.stable ? st.w : 0;
    const pad = st.base + extra + 'px';
    if (el.style.paddingRight !== pad) el.style.paddingRight = pad;
    if (extra) { sh = el.scrollHeight; need = sh > ch + 1; }
    st.bar.classList.toggle('off', !need);
    if (!need) return;
    st.bar.style.height = ch + 'px';
    st.bar.style.transform = 'translateY(' + el.scrollTop + 'px)';
    const cs = getComputedStyle(st.bar);
    const track = trackRoom(st);
    const maxScroll = Math.max(0, sh - ch);
    const minH = px(getComputedStyle(st.thumb).minHeight, 40);
    const th = Math.min(track, Math.max(minH, track * ch / sh));
    const maxTop = Math.max(0, track - th);
    const y = maxScroll ? Math.min(maxTop, Math.max(0, el.scrollTop / maxScroll * maxTop)) : 0;
    st.thumb.style.height = th + 'px';
    st.thumb.style.top = (px(cs.paddingTop) + y) + 'px';
  }

  function jump(el, st, e) {
    if (e.button !== 0) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) return;
    const r = st.bar.getBoundingClientRect();
    const h = st.bar.offsetHeight;
    if (!r.height || !h) return;
    const track = trackRoom(st);
    const maxTop = track - st.thumb.offsetHeight;
    if (maxTop <= 0) return;
    const scale = r.height / h;
    const y = (e.clientY - r.top) / scale - px(getComputedStyle(st.bar).paddingTop) - st.thumb.offsetHeight / 2;
    el.scrollTop = Math.min(1, Math.max(0, y / maxTop)) * maxScroll;
    e.preventDefault();
  }

  function drag(el, st, e) {
    if (e.button !== 0) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const track = trackRoom(st);
    const maxTop = track - st.thumb.offsetHeight;
    const h = st.bar.offsetHeight;
    const r = st.bar.getBoundingClientRect();
    if (maxScroll <= 0 || maxTop <= 0 || !h || !r.height) return;
    e.preventDefault();
    const startY = e.clientY;
    const startScroll = el.scrollTop;
    const scale = r.height / h;
    const move = ev => { el.scrollTop = startScroll + (ev.clientY - startY) / scale * maxScroll / maxTop };
    const end = () => {
      st.thumb.removeEventListener('pointermove', move);
      st.thumb.removeEventListener('pointerup', end);
      st.thumb.removeEventListener('pointercancel', end);
      st.thumb.removeEventListener('lostpointercapture', end);
    };
    st.thumb.setPointerCapture(e.pointerId);
    st.thumb.addEventListener('pointermove', move);
    st.thumb.addEventListener('pointerup', end);
    st.thumb.addEventListener('pointercancel', end);
    st.thumb.addEventListener('lostpointercapture', end);
  }

  function attach(el) {
    if (hosts.has(el)) return;
    if (/^(INPUT|TEXTAREA|SELECT|OPTION|IFRAME|VIDEO|CANVAS|SCRIPT|STYLE|LINK|META|TITLE|HEAD|HTML|BODY)$/.test(el.tagName)) return;
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY)) return;
    el.classList.add('csb-host');
    if (cs.position === 'static') el.style.position = 'relative';
    const bar = document.createElement('div');
    const thumb = document.createElement('div');
    bar.className = 'csb off';
    bar.setAttribute('aria-hidden', 'true');
    thumb.className = 'csb-th';
    bar.append(thumb);
    const st = {
      bar,
      thumb,
      base: px(cs.paddingRight),
      stable: /stable/.test(cs.scrollbarGutter || ''),
      w: px(cs.getPropertyValue('--csb-w'), 12) || 12
    };
    hosts.set(el, st);
    el.append(bar);
    el.addEventListener('scroll', () => schedule(el), { passive: true });
    thumb.addEventListener('pointerdown', e => drag(el, st, e));
    bar.addEventListener('pointerdown', e => { if (e.target !== thumb) jump(el, st, e) });
    new ResizeObserver(() => schedule(el)).observe(el);
    schedule(el);
  }

  function scan(root) {
    if (root.nodeType === 1) attach(root);
    for (const el of root.querySelectorAll('*')) attach(el);
  }

  scan(document);
  // Só recalcula as áreas roláveis que contêm a mudança (antes, qualquer texto que mudasse em qualquer lugar, como o relógio do
  // karaokê a cada meio segundo, fazia todas as áreas lerem o layout de novo). Mudança de tamanho da própria área fica com o
  // ResizeObserver.
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'childList') {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          attach(n);
          for (const el of n.querySelectorAll('*')) attach(el);
        }
      }
      for (let n = m.target; n && n !== document.body; n = n.parentNode) if (hosts.has(n)) schedule(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  addEventListener('resize', () => { for (const el of hosts.keys()) schedule(el) });
})();
