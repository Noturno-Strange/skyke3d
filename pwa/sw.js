/*
 * Skyke3D — service worker (instalar como aplicativo).
 * Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
 *
 * Não guarda nada: nenhum cache, nenhum dado do jogador. O jogo é multijogador e precisa da rede; este arquivo só existe para o
 * navegador oferecer "Instalar" e, sem conexão, mostrar um aviso em vez da página de erro. Pedidos que não são de página
 * (scripts, imagens, WebSocket, voz) nem passam por aqui.
 */
'use strict';
const OFFLINE = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>Skyke3D — sem conexão</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#17121f;color:#f4efe6;' +
  'font:600 18px system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}button{margin-top:16px;font:inherit;padding:10px 22px;' +
  'border:0;border-radius:12px;background:#ffb23e;color:#17121f;cursor:pointer}</style></head><body><div>☁️<p>Sem conexão com a internet.</p>' +
  '<p style="font-weight:400;opacity:.8">O Skyke3D precisa da rede para jogar com os outros.</p><button onclick="location.reload()">Tentar de novo</button></div></body></html>';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })));
});
