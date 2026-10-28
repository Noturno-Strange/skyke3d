'use strict';
// Compressão de estáticos: negociação de Accept-Encoding, ETag por codificação e resposta real do servidor.
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const compress = require('./compress.js');
const H = require('./harness.js');

const sample = Buffer.from('<!doctype html><title>x</title>' + '<p>skyke3d mundos dezesseis</p>'.repeat(400));

test('build: gera br e gzip menores e idênticos ao original ao descomprimir', () => {
  const v = compress.build(sample);
  assert.ok(v.br && v.gzip && v.br.length < sample.length && v.gzip.length < sample.length);
  assert.ok(zlib.brotliDecompressSync(v.br).equals(sample));
  assert.ok(zlib.gunzipSync(v.gzip).equals(sample));
  assert.strictEqual(v.raw, sample);
});

test('build: arquivo pequeno ou incompressível fica sem variantes', () => {
  assert.deepStrictEqual(Object.keys(compress.build(Buffer.from('oi'))), ['raw']);
  const noise = require('crypto').randomBytes(4096);
  const v = compress.build(noise);
  assert.ok(!v.br && !v.gzip, 'ruído aleatório não deve virar variante maior');
});

test('pick: prefere br, depois gzip, depois original', () => {
  const v = compress.build(sample);
  assert.strictEqual(compress.pick(v, 'gzip, deflate, br').enc, 'br');
  assert.strictEqual(compress.pick(v, 'gzip, deflate').enc, 'gzip');
  assert.strictEqual(compress.pick(v, 'identity').enc, '');
  assert.strictEqual(compress.pick(v, undefined).enc, '');
  assert.strictEqual(compress.pick(v, '').buf, sample);
});

test('pick: respeita q=0 e curinga', () => {
  const v = compress.build(sample);
  assert.strictEqual(compress.pick(v, 'br;q=0, gzip').enc, 'gzip');
  assert.strictEqual(compress.pick(v, 'br;q=0, gzip;q=0').enc, '');
  assert.strictEqual(compress.pick(v, '*').enc, 'br');
  assert.strictEqual(compress.pick(v, '*;q=0').enc, '');
  assert.strictEqual(compress.pick(v, 'gzip;q=abc').enc, '', 'q inválido não habilita');
});

test('etagFor: um ETag distinto por codificação', () => {
  assert.strictEqual(compress.etagFor('"abc"', ''), '"abc"');
  assert.strictEqual(compress.etagFor('"abc"', 'br'), '"abc-br"');
  assert.strictEqual(compress.etagFor('"abc"', 'gzip'), '"abc-gzip"');
});

test('buildMany: mesmo resultado de build, na mesma ordem, via processo filho', () => {
  const a = Buffer.from('<html>' + 'alfa beta gama '.repeat(300));
  const b = Buffer.from('/* js */ ' + 'function x(){return 1}\n'.repeat(500));
  const tiny = Buffer.from('oi');
  const r = compress.buildMany([a, tiny, b]);
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual(r.map(v => v.raw), [a, tiny, b]);
  assert.ok(zlib.brotliDecompressSync(r[0].br).equals(a) && zlib.gunzipSync(r[0].gzip).equals(a));
  assert.ok(!r[1].br && !r[1].gzip, 'arquivo pequeno fica sem variantes');
  assert.ok(zlib.brotliDecompressSync(r[2].br).equals(b) && zlib.gunzipSync(r[2].gzip).equals(b));
  const direct = compress.build(a);
  assert.ok(r[0].br.equals(direct.br) && r[0].gzip.equals(direct.gzip), 'idêntico à compressão no próprio processo');
});

test('buildMany: lista vazia e opções são respeitadas', () => {
  assert.deepStrictEqual(compress.buildMany([]), []);
  const a = Buffer.from('<html>' + 'alfa beta gama '.repeat(300));
  const r = compress.buildMany([a], { brotli: false });
  assert.ok(!r[0].br && r[0].gzip);
});

test('buildMany: se o processo filho falhar, comprime no próprio processo', () => {
  const a = Buffer.from('<html>' + 'alfa beta gama '.repeat(300));
  const r = compress.buildMany([a], { execPath: '/caminho/que/nao/existe' });
  assert.ok(zlib.brotliDecompressSync(r[0].br).equals(a));
  assert.ok(zlib.gunzipSync(r[0].gzip).equals(a));
});

// ---- integração: só roda quando ws e vendor/three-r128.min.js existem (como no repositório) ----
test('servidor: entrega br/gzip/original, ETag por codificação e 304', { skip: H.missing() }, async t => {
  const srv = await H.startServer();
  t.after(() => srv.stop());
  const get = (h, method) => H.request(srv.port, '/', { headers: h, method });

  const raw = await get({});
  assert.strictEqual(raw.status, 200);
  assert.strictEqual(raw.headers['content-encoding'], undefined);
  assert.match(raw.headers['content-type'], /text\/html/);

  const br = await get({ 'accept-encoding': 'gzip, br' });
  assert.strictEqual(br.headers['content-encoding'], 'br');
  assert.match(br.headers['vary'], /Accept-Encoding/i);
  assert.ok(zlib.brotliDecompressSync(br.body).equals(raw.body));
  assert.ok(br.body.length < raw.body.length, 'brotli deve encolher o HTML');

  const gz = await get({ 'accept-encoding': 'gzip' });
  assert.strictEqual(gz.headers['content-encoding'], 'gzip');
  assert.ok(zlib.gunzipSync(gz.body).equals(raw.body));

  assert.notStrictEqual(br.headers.etag, gz.headers.etag);
  assert.notStrictEqual(gz.headers.etag, raw.headers.etag);

  const nm = await get({ 'accept-encoding': 'br', 'if-none-match': br.headers.etag });
  assert.strictEqual(nm.status, 304);
  assert.strictEqual(nm.body.length, 0);
  assert.strictEqual(nm.headers['content-encoding'], undefined);

  const mismatch = await get({ 'accept-encoding': 'gzip', 'if-none-match': br.headers.etag });
  assert.strictEqual(mismatch.status, 200, 'ETag de br não valida corpo gzip');

  const head = await get({ 'accept-encoding': 'br' }, 'HEAD');
  assert.strictEqual(head.status, 200);
  assert.strictEqual(+head.headers['content-length'], br.body.length);
  assert.strictEqual(head.body.length, 0);

  const three = await H.request(srv.port, '/vendor/three-r128.min.js', { headers: { 'accept-encoding': 'br' } });
  assert.strictEqual(three.status, 200);
  assert.strictEqual(three.headers['content-encoding'], 'br');
  assert.match(three.headers['cache-control'], /immutable/);
});
