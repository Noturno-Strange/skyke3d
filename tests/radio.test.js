'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createRadio, REASONS } = require('../radio');

const PUBLIC = '93.184.216.34';
const listen = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const get = (port, path = '/') => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path }, res => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => resolve({ res, body: Buffer.concat(chunks) }));
    res.on('error', reject);
  }).on('error', reject);
});

// "Rádio" falsa: / → áudio contínuo; /ogg, /html, /404, /go → redirecionamentos
function fakeUpstream() {
  const st = { conns: 0, opts: [] };
  const srv = http.createServer((q, s) => {
    st.opts.push({ url: q.url, headers: q.headers });
    if (q.url === '/ogg') { s.writeHead(200, { 'Content-Type': 'audio/ogg' }); return s.end('x'); }
    if (q.url === '/html') { s.writeHead(200, { 'Content-Type': 'text/html' }); return s.end('<b>x</b>'); }
    if (q.url === '/404') { s.writeHead(404); return s.end(); }
    if (q.url === '/go') { s.writeHead(302, { Location: 'https://radio.example.com/live' }); return s.end(); }
    if (q.url === '/loop') { s.writeHead(302, { Location: 'https://radio.example.com/loop' }); return s.end(); }
    if (q.url === '/evil') { s.writeHead(302, { Location: 'https://interno.example.net/live' }); return s.end(); }
    st.conns++;
    s.writeHead(200, { 'Content-Type': 'audio/mpeg', 'icy-name': 'x', 'Set-Cookie': 'a=b' });
    const iv = setInterval(() => s.write(Buffer.alloc(2048, 7)), 20);
    q.on('close', () => clearInterval(iv));
    s.on('close', () => clearInterval(iv));
  });
  return { srv, st };
}

async function setup(t, extra = {}) {
  const up = fakeUpstream();
  const upPort = await listen(up.srv);
  t.after(() => up.srv.close());
  const seen = [];
  const radio = createRadio({
    lookup: async host => (host === 'interno.example.net' ? [{ address: '10.0.0.5', family: 4 }] : [{ address: PUBLIC, family: 4 }]),
    request: (o, cb) => {
      seen.push(o);
      return http.request({ host: '127.0.0.1', port: upPort, path: o.path, method: o.method, headers: o.headers }, cb);
    },
    graceMs: 100,
    ...extra
  });
  return { radio, up, seen };
}

test('probe: aceita MP3/AAC e explica cada recusa', async t => {
  const { radio } = await setup(t);
  assert.deepStrictEqual(await radio.probe('https://radio.example.com/live'), { ok: true });
  const why = async p => (await radio.probe('https://radio.example.com' + p)).reason;
  assert.strictEqual(await why('/ogg'), 'ogg');
  assert.strictEqual(await why('/html'), 'type');
  assert.strictEqual(await why('/404'), 'status');
  assert.strictEqual(await why('/loop'), 'redirects');
  assert.deepStrictEqual(await radio.probe('https://radio.example.com/go'), { ok: true }, 'segue redirecionamento');
  assert.strictEqual((await radio.probe('https://radio.example.com/evil')).reason, 'dns', 'redirecionamento para host interno é recusado');
  for (const r of ['http://radio.example.com/live', 'https://127.0.0.1/x', 'https://localhost/x', 'https://u:p@radio.example.com/x'])
    assert.strictEqual((await radio.probe(r)).reason, 'url', r);
  for (const k of ['url', 'dns', 'timeout', 'connect', 'status', 'redirects', 'ogg', 'type']) assert.ok(REASONS[k], k);
});

test('probe: DNS que devolve endereço privado (ou mistura) é recusado', async t => {
  const up = fakeUpstream();
  const port = await listen(up.srv);
  t.after(() => up.srv.close());
  for (const list of [[{ address: '127.0.0.1', family: 4 }], [{ address: PUBLIC, family: 4 }, { address: '192.168.0.9', family: 4 }], [{ address: '::1', family: 6 }], []]) {
    const radio = createRadio({ lookup: async () => list, request: (o, cb) => http.request({ host: '127.0.0.1', port, path: o.path }, cb) });
    assert.strictEqual((await radio.probe('https://radio.example.com/live')).reason, 'dns', JSON.stringify(list));
  }
  const slow = createRadio({ lookup: () => new Promise(() => {}), request: () => { throw new Error('não deveria conectar'); } });
  assert.strictEqual((await slow.probe('https://radio.example.com/live')).reason, 'dns');
});

test('a conexão usa o IP já validado e não manda cookies nem metadados', async t => {
  const { radio, seen } = await setup(t);
  await radio.probe('https://radio.example.com:8443/live?x=1');
  const o = seen[0];
  assert.strictEqual(o.hostname, 'radio.example.com');
  assert.strictEqual(String(o.port), '8443');
  assert.strictEqual(o.path, '/live?x=1');
  assert.strictEqual(o.servername, 'radio.example.com');
  const got = await new Promise(r => o.lookup('radio.example.com', {}, (e, a, f) => r([a, f])));
  assert.deepStrictEqual(got, [PUBLIC, 4]);
  const all = await new Promise(r => o.lookup('radio.example.com', { all: true }, (e, l) => r(l)));
  assert.deepStrictEqual(all, [{ address: PUBLIC, family: 4 }]);
  assert.strictEqual(o.headers['Icy-MetaData'], '0');
  assert.ok(!('Cookie' in o.headers) && !('Authorization' in o.headers));
});

test('uma conexão com a rádio atende vários ouvintes; o IP do ouvinte nunca chega à rádio', async t => {
  const { radio, up } = await setup(t);
  const proxy = http.createServer((q, s) => { radio.attach('SALA1', 'https://radio.example.com/live', s, { 'X-T': '1' }); });
  const port = await listen(proxy);
  t.after(() => { radio.stop('SALA1'); proxy.close(); });

  const listeners = [0, 1, 2].map(() => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/' }, res => {
      let n = 0;
      res.on('data', c => { n += c.length; if (n > 6000) { res.destroy(); resolve(res); } });
      res.on('error', () => {});
    }).on('error', reject);
  }));
  const [first] = await Promise.all(listeners);
  assert.strictEqual(first.statusCode, 200);
  assert.strictEqual(first.headers['content-type'], 'audio/mpeg');
  assert.strictEqual(first.headers['cache-control'], 'no-store');
  assert.strictEqual(first.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(first.headers['x-t'], '1');
  assert.ok(!first.headers['set-cookie'] && !first.headers['icy-name'], 'cabeçalhos da rádio não vazam');
  assert.strictEqual(up.st.conns, 1, 'uma só conexão com a rádio');
  assert.ok(up.st.opts.every(o => !('x-forwarded-for' in o.headers) && !('forwarded' in o.headers)));
});

test('sem ouvintes a conexão fecha; stop() encerra todos; limite de rádios por servidor', async t => {
  const { radio } = await setup(t, { maxHubs: 1 });
  const mk = key => {
    const s = http.createServer((q, r) => { if (radio.attach(key, 'https://radio.example.com/live', r) === 'full') { r.writeHead(503); r.end(); } });
    return listen(s).then(port => ({ s, port }));
  };
  const a = await mk('A'), b = await mk('B');
  t.after(() => { radio.stop('A'); radio.stop('B'); a.s.close(); b.s.close(); });
  const ended = new Promise(resolve => {
    http.get({ host: '127.0.0.1', port: a.port }, res => { res.on('data', () => {}); res.on('close', resolve); res.on('error', () => {}); });
  });
  await new Promise(r => setTimeout(r, 250));
  assert.deepStrictEqual(radio.stats(), { hubs: 1, listeners: 1 });
  const refused = await get(b.port);
  assert.strictEqual(refused.res.statusCode, 503, 'segunda rádio acima do limite');
  radio.stop('A');
  await ended;
  assert.deepStrictEqual(radio.stats(), { hubs: 0, listeners: 0 });

  const c = await mk('A');
  t.after(() => c.s.close());
  const sock = await new Promise(resolve => http.get({ host: '127.0.0.1', port: c.port }, res => { res.on('data', () => {}); resolve(res); }));
  assert.strictEqual(radio.stats().hubs, 1);
  sock.destroy();
  await new Promise(r => setTimeout(r, 400));
  assert.strictEqual(radio.stats().hubs, 0, 'fecha a conexão com a rádio depois de um tempo sem ouvintes');
});
