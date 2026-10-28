'use strict';
// Assets com hash no nome: reescrita do HTML, cache imutável e cliente separado em arquivos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assets = require('./assets.js');
const { readClient } = require('./client-source.js');
const H = require('./harness.js');

const mk = files => name => {
  if (!(name in files)) throw new Error('ausente: ' + name);
  return Buffer.from(files[name]);
};

test('build: reescreve href e src com o hash do conteúdo', () => {
  const html = '<link rel="stylesheet" href="/assets/app.css"><script src="/assets/app.js"></script>';
  const r = assets.build(html, mk({ 'app.css': 'a{}', 'app.js': 'var x=1' }));
  const out = r.html.toString();
  const urls = [...r.files.keys()];
  assert.strictEqual(urls.length, 2);
  assert.match(urls[0], /^\/assets\/app\.[0-9a-f]{10}\.css$/);
  assert.match(urls[1], /^\/assets\/app\.[0-9a-f]{10}\.js$/);
  for (const u of urls) assert.ok(out.includes('"' + u + '"'));
  assert.ok(!out.includes('"/assets/app.css"') && !out.includes('"/assets/app.js"'));
  assert.strictEqual(r.files.get(urls[0]).type, 'text/css; charset=utf-8');
  assert.strictEqual(r.files.get(urls[1]).type, 'application/javascript; charset=utf-8');
});

test('build: o hash muda só quando o conteúdo muda', () => {
  const html = '<script src="/assets/app.js"></script>';
  const a = assets.build(html, mk({ 'app.js': 'var x=1' }));
  const b = assets.build(html, mk({ 'app.js': 'var x=1' }));
  const c = assets.build(html, mk({ 'app.js': 'var x=2' }));
  assert.deepStrictEqual([...a.files.keys()], [...b.files.keys()]);
  assert.notDeepStrictEqual([...a.files.keys()], [...c.files.keys()]);
});

test('build: arquivo repetido no HTML é lido uma vez', () => {
  let reads = 0;
  const r = assets.build('<script src="/assets/a.js"></script><script src="/assets/a.js"></script>', n => { reads++; return Buffer.from(n); });
  assert.strictEqual(reads, 1);
  assert.strictEqual(r.files.size, 1);
});

test('build: imagens .jpg ganham hash e tipo image/jpeg', () => {
  const r = assets.build('<img src="/assets/a.jpg">', mk({ 'a.jpg': 'x' }));
  const [[url, f]] = [...r.files];
  assert.match(url, /^\/assets\/a\.[0-9a-f]{10}\.jpg$/);
  assert.strictEqual(f.type, 'image/jpeg');
});

test('build: extensão desconhecida, arquivo ausente e caminhos fora da pasta', () => {
  assert.throws(() => assets.build('<img src="/assets/a.png">', mk({ 'a.png': 'x' })), /não suportado/);
  assert.throws(() => assets.build('<script src="/assets/falta.js"></script>', mk({})), /ausente/);
  const html = '<script src="/assets/../server.js"></script><script src="/assets/a/b.js"></script><a href="/outro/x.js">';
  const r = assets.build(html, mk({}));
  assert.strictEqual(r.html.toString(), html, 'nada fora de /assets/<nome> é tocado');
  assert.strictEqual(r.files.size, 0);
});

test('cliente: HTML sem CSS/JS inline, apontando para assets/ que existem', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(!/<style[\s>]/i.test(html), 'sem <style> inline');
  assert.ok(!/<script>/i.test(html), 'sem <script> inline');
  const all = [...html.matchAll(/\b(?:href|src)="\/assets\/([^"]+)"/g)].map(m => m[1]);
  const refs = all.filter(n => /\.(css|js)$/.test(n));
  assert.deepStrictEqual(refs, ['app.css', 'app.js', 'intro.js']);
  const imgs = all.filter(n => /\.jpg$/.test(n));
  assert.ok(imgs.length >= 7, 'tutorial em quadrinhos com suas imagens');
  for (const n of imgs) assert.ok(fs.statSync(path.join(__dirname, 'assets', n)).size > 0, n);
  for (const r of refs) assert.ok(fs.statSync(path.join(__dirname, 'assets', r)).size > 0, r);
  assert.ok(html.indexOf('/assets/app.js') < html.indexOf('/assets/intro.js'), 'ordem dos scripts preservada');
  assert.ok(html.indexOf('/vendor/three-r128.min.js') < html.indexOf('/assets/app.js'), 'three.js carrega antes do jogo');
});

test('cliente: readClient recompõe o HTML com tudo no lugar', () => {
  const full = readClient();
  assert.strictEqual((full.match(/<style>/g) || []).length, 1);
  assert.strictEqual((full.match(/<script>/g) || []).length, 2);
  assert.ok(!full.replace(/src="\/assets\/[\w.-]+\.jpg"/g, '').includes('/assets/'));
});

test('servidor: assets com hash são imutáveis, comprimidos e sem caminho para fora', { skip: H.missing() }, async t => {
  const srv = await H.startServer();
  t.after(() => srv.stop());
  const page = await H.request(srv.port, '/');
  const html = page.body.toString('utf8');
  const every = [...html.matchAll(/\b(?:href|src)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
  const urls = every.filter(u => /\.(css|js)$/.test(u));
  assert.strictEqual(urls.length, 3);
  for (const u of every.filter(u => /\.jpg$/.test(u))) {
    assert.match(u, /\.[0-9a-f]{10}\.jpg$/, 'imagem com hash');
    const img = await H.request(srv.port, u);
    assert.strictEqual(img.status, 200, u);
    assert.match(img.headers['content-type'], /image\/jpeg/);
    assert.match(img.headers['cache-control'], /immutable/);
  }
  assert.ok(urls.every(u => /\.[0-9a-f]{10}\.(css|js)$/.test(u)), 'todos com hash');

  for (const u of urls) {
    const disk = fs.readFileSync(path.join(__dirname, 'assets', path.basename(u).replace(/\.[0-9a-f]{10}(\.\w+)$/, '$1')));
    const raw = await H.request(srv.port, u);
    assert.strictEqual(raw.status, 200, u);
    assert.ok(raw.body.equals(disk), u + ' igual ao arquivo');
    assert.match(raw.headers['cache-control'], /public, max-age=31536000, immutable/);
    assert.match(raw.headers['content-type'], /text\/css|javascript/);
    const br = await H.request(srv.port, u, { headers: { 'accept-encoding': 'br' } });
    assert.strictEqual(br.headers['content-encoding'], 'br');
    assert.ok(zlib.brotliDecompressSync(br.body).equals(disk));
    assert.ok(br.body.length < disk.length, u + ' comprimido');
    const nm = await H.request(srv.port, u, { headers: { 'if-none-match': raw.headers.etag } });
    assert.strictEqual(nm.status, 304);
  }

  assert.strictEqual((await H.request(srv.port, '/assets/app.js')).status, 404, 'nome sem hash não existe');
  assert.strictEqual((await H.request(srv.port, '/assets/../server.js')).status, 404);
  assert.strictEqual((await H.request(srv.port, '/assets/%2e%2e/server.js')).status, 404);

  const csp = page.headers['content-security-policy'];
  assert.match(csp, /script-src 'self' /);
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), 'sem unsafe-inline nos scripts');
});

test('o HTML muda de ETag quando um asset muda (o navegador baixa o novo)', () => {
  const html = '<script src="/assets/app.js"></script>';
  const a = assets.build(html, mk({ 'app.js': 'v1' })).html;
  const b = assets.build(html, mk({ 'app.js': 'v2' })).html;
  assert.ok(!a.equals(b));
});
