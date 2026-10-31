'use strict';

// Instalar como aplicativo (PWA): manifesto, ícones e um service worker que não guarda nada (só mostra um aviso sem conexão).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../harness.js');
const ROOT = path.join(__dirname, '..');

test('pwa: manifesto com nome, início, tela cheia e ícones 192, 512 e adaptável', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa', 'manifest.webmanifest'), 'utf8'));
  assert.strictEqual(m.name, 'Skyke3D'); assert.strictEqual(m.start_url, '/'); assert.strictEqual(m.display, 'standalone');
  const sz = m.icons.map(i => i.sizes + ' ' + i.purpose);
  for (const s of ['192x192 any', '512x512 any', '512x512 maskable']) assert.ok(sz.includes(s), s);
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(ROOT, 'pwa', i.src.slice(1))), i.src);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(fs.readFileSync(path.join(ROOT, 'assets', 'app-base.js'), 'utf8'), /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
});

test('pwa: o service worker não guarda nada e só atende páginas', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'pwa', 'sw.js'), 'utf8');
  assert.ok(!/caches\b|indexedDB|localStorage|postMessage|fetch\([^e]/.test(sw), 'sem cache, armazenamento ou envio de dados');
  assert.match(sw, /if \(e\.request\.mode !== 'navigate'\) return;/);
  assert.match(sw, /fetch\(e\.request\)\.catch\(/);
});

test('pwa: o servidor entrega manifesto, service worker e ícones com o tipo certo', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  for (const [u, type] of [['/manifest.webmanifest', 'application/manifest+json'], ['/sw.js', 'application/javascript'], ['/icon-192.png', 'image/png'], ['/icon-512.png', 'image/png'], ['/icon-maskable-512.png', 'image/png']]) {
    const r = await H.request(srv.port, u);
    assert.strictEqual(r.status, 200, u); assert.ok(r.headers['content-type'].startsWith(type), u);
  }
  assert.strictEqual((await H.request(srv.port, '/sw.js')).headers['cache-control'], 'no-cache', 'atualizações do service worker chegam logo');
});
