'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const RECONNECT_MS = 1500;
let srv = null;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function startServer(extra = {}) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: '0',
      BIND_HOST: '127.0.0.1',
      RECONNECT_MS: String(RECONNECT_MS),
      PUBLIC_URL: '',
      ORIGINS: '',
      ALLOWED_HOSTS: '',
      TRUST_PROXY: '',
      TRUST_CF_CONNECTING_IP: '',
      STATUS_TOKEN: '',
      HTTP_RATE: '120',
      PERIP: '6',
      TURN_URL: '',
      TURN_SECRET: '',
      TURN_USER: '',
      TURN_PASS: '',
      TURN_ALLOW_STATIC: '',
      TURN_TTL: '3600',
      TURN_LABEL: '',
      ...extra
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  const port = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('servidor não iniciou: ' + logs)), 8000);
    const onData = d => {
      logs += String(d);
      const m = logs.match(/escutando em 127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(+m[1]);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', d => { logs += String(d); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error('servidor saiu com código ' + code + ': ' + logs));
    });
  });
  return port.then(p => ({
    port: p,
    child,
    logs: () => logs,
    stop() {
      try { child.kill('SIGTERM'); } catch (e) { /* ignore */ }
    }
  }));
}

function connect(port, origin = `http://127.0.0.1:${port}`, headers) {
  const opts = {};
  if (origin) opts.origin = origin;
  if (headers) opts.headers = headers;
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, opts);
  const queue = [];
  const waiters = new Set();

  ws.on('error', () => {});
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(String(raw)); } catch (e) { return; }
    queue.push(m);
    for (const w of [...waiters]) {
      if (!w.pred(m)) continue;
      waiters.delete(w);
      clearTimeout(w.timer);
      w.resolve(m);
    }
  });

  const opened = new Promise((resolve, reject) => {
    let done = false;
    ws.once('open', () => { if (!done) { done = true; resolve(ws); } });
    ws.once('error', e => { if (!done) { done = true; reject(e); } });
    ws.once('unexpected-response', (req, res) => {
      res.resume();
      if (!done) { done = true; reject(new Error('HTTP ' + res.statusCode)); }
    });
  });

  function next(pred = () => true, timeout = 3000) {
    const idx = queue.findIndex(pred);
    if (idx >= 0) return Promise.resolve(queue.splice(idx, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve, reject, timer: null };
      w.timer = setTimeout(() => {
        waiters.delete(w);
        reject(new Error('timeout esperando mensagem; recebidas: ' + JSON.stringify(queue.slice(-6))));
      }, timeout);
      waiters.add(w);
    });
  }

  function noMessage(pred, timeout = 300) {
    return new Promise((resolve, reject) => {
      const h = raw => {
        let m;
        try { m = JSON.parse(String(raw)); } catch (e) { return; }
        if (!pred(m)) return;
        clearTimeout(timer);
        ws.off('message', h);
        reject(new Error('mensagem inesperada: ' + JSON.stringify(m)));
      };
      const timer = setTimeout(() => {
        ws.off('message', h);
        resolve();
      }, timeout);
      ws.on('message', h);
    });
  }

  return {
    ws,
    opened,
    queue,
    next,
    noMessage,
    send(m) { ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }
  };
}

function waitClose(ws, timeout = 3000) {
  if (ws.readyState === WebSocket.CLOSED) return Promise.resolve({ code: 1006, reason: '' });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout esperando fechamento')), timeout);
    ws.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: String(reason) });
    });
  });
}

function bootExit(env) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: '0',
        BIND_HOST: '127.0.0.1',
        PUBLIC_URL: '',
        TRUST_PROXY: '',
        TRUST_CF_CONNECTING_IP: '',
        TURN_URL: '',
        TURN_SECRET: '',
        TURN_USER: '',
        TURN_PASS: '',
        TURN_ALLOW_STATIC: '',
        TURN_TTL: '3600',
        TURN_LABEL: '',
        HTTP_RATE: '120',
        PERIP: '6',
        ...env
      },
      stdio: 'ignore'
    });
    const timer = setTimeout(() => {
      try { child.kill(); } catch (e) { /* ignore */ }
      resolve(null);
    }, 5000);
    child.once('exit', code => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

function httpGet(port, requestPath, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: requestPath, method, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

function inlineScriptHashes(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!/\bsrc\s*=/i.test(m[1])) out.push(crypto.createHash('sha384').update(m[2], 'utf8').digest('base64'));
  }
  return out;
}

async function withServer(extra, fn) {
  const s = await startServer(extra);
  try { return await fn(s); } finally { s.stop(); }
}

async function createRoom(c, name = 'Ana', cfg = { skin: 1 }) {
  c.send({ t: 'create', name, cfg });
  const j = await c.next(m => m.t === 'joined');
  assert.equal(j.t, 'joined');
  return j;
}

async function joinRoom(c, code, name = 'Bia', cfg = { skin: 2 }) {
  c.send({ t: 'join', code, name, cfg });
  return c.next(m => m.t === 'joined');
}

async function leave(c) {
  if (!c || c.ws.readyState === WebSocket.CLOSED) return;
  const closed = waitClose(c.ws);
  c.send({ t: 'leave' });
  await closed;
}

before(async () => { srv = await startServer(); });
after(async () => { if (srv) srv.stop(); });

test('handshake exige Origin e Host válidos', async () => {
  const noOrigin = connect(srv.port, null);
  await assert.rejects(noOrigin.opened, /403/);
  noOrigin.ws.terminate();

  const badOrigin = connect(srv.port, 'http://evil.example');
  await assert.rejects(badOrigin.opened, /403/);
  badOrigin.ws.terminate();

  const ok = connect(srv.port);
  await ok.opened;
  ok.ws.terminate();
});

test('modo produção exige PUBLIC_URL segura e Host/Origin exatos', async () => {
  assert.equal(await bootExit({ PUBLIC_URL: 'http://exemplo.com' }), 1);
  assert.equal(await bootExit({ PUBLIC_URL: 'https://localhost' }), 1);
  assert.equal(await bootExit({ PUBLIC_URL: 'https://127.0.0.1' }), 1);
  assert.equal(await bootExit({ PUBLIC_URL: 'https://maquina.ts.net' }), 1);

  const prod = await startServer({ PUBLIC_URL: 'https://jogo.example.com' });
  try {
    const host = { Host: 'jogo.example.com' };
    const ok = connect(prod.port, 'https://jogo.example.com', host);
    await ok.opened;
    ok.ws.terminate();

    const insecure = connect(prod.port, 'http://jogo.example.com', host);
    await assert.rejects(insecure.opened, /403/);
    insecure.ws.terminate();

    const wrongHost = connect(prod.port, 'https://jogo.example.com', { Host: '127.0.0.1:' + prod.port });
    await assert.rejects(wrongHost.opened, /403/);
    wrongHost.ws.terminate();

    const wrongOrigin = connect(prod.port, 'https://evil.example.com', host);
    await assert.rejects(wrongOrigin.opened, /403/);
    wrongOrigin.ws.terminate();
  } finally {
    prod.stop();
  }
});

test('create e join devolvem estado, token e jogadores', async () => {
  const a = connect(srv.port);
  await a.opened;
  const ja = await createRoom(a, '<b>Ana</b>', { skin: 1, shirt: 3 });
  assert.equal(ja.code.length, 10);
  assert.match(ja.code, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.match(ja.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(ja.reconnect, RECONNECT_MS);
  assert.equal(ja.self.id, ja.id);
  assert.equal(ja.self.name, 'bAna/b');
  assert.equal(ja.resume, undefined);
  assert.equal(ja.players.length, 1);
  assert.equal(ja.style, 'aeris');

  const b = connect(srv.port);
  await b.opened;
  const jb = await joinRoom(b, ja.code, 'Bia', { skin: 2 });
  assert.equal(jb.code, ja.code);
  assert.equal(jb.host, ja.id);
  assert.equal(jb.players.length, 2);
  assert.ok(jb.players.some(p => p.id === ja.id));

  const pj = await a.next(m => m.t === 'pj' && m.p.id === jb.id);
  assert.equal(pj.p.name, 'Bia');

  b.send({ t: 'move', x: 999, z: 999, ry: 0, y: 0, s: 0 });
  const st = await a.next(m => m.t === 'st' && m.s.some(r => r[0] === ja.id));
  const row = st.s.find(r => r[0] === ja.id);
  assert.ok(Math.hypot(row[1], row[2] - 1.2) <= 10.25);
  assert.ok(Math.abs(row[3]) <= 10);

  const busy = connect(srv.port);
  await busy.opened;
  busy.send({ t: 'resume', code: ja.code, token: ja.token });
  const busyErr = await busy.next(m => m.t === 'err');
  assert.equal(busyErr.scope, 'resume');
  assert.equal(busyErr.retry, 1);
  await waitClose(busy.ws);

  await leave(b);
  await leave(a);
});

test('payloads inválidos são ignorados e IDs de vídeo são validados', async () => {
  const a = connect(srv.port);
  await a.opened;
  const ja = await createRoom(a);
  const b = connect(srv.port);
  await b.opened;
  await joinRoom(b, ja.code);

  a.send({ t: 'video', vid: 'curto' });
  await b.noMessage(m => m.t === 'vinv');

  a.send({ t: 'video', vid: { toString: () => 'dQw4w9WgXcQ' } });
  await b.noMessage(m => m.t === 'vinv');

  a.send({ t: 'video', vid: 'dQw4w9WgXcQ' });
  const vinv = await b.next(m => m.t === 'vinv');
  assert.equal(vinv.vid, 'dQw4w9WgXcQ');

  a.send({ t: 'emo', i: 15 });
  const emo = await b.next(m => m.t === 'emo');
  assert.deepEqual(emo, { t: 'emo', id: ja.id, i: 15 });

  a.send({ t: 'emo', i: 999 });
  a.send({ t: 'emo', i: '3' });
  a.send({ t: 'move', x: 'NaN', z: 0 });
  a.send({ t: 'chat', text: 42 });
  await b.noMessage(m => m.t === 'emo');

  await leave(b);
  await leave(a);
});

test('rate limit por ação derruba spam com código 1008', async () => {
  const a = connect(srv.port);
  await a.opened;
  const ja = await createRoom(a);
  const b = connect(srv.port);
  await b.opened;
  await joinRoom(b, ja.code);

  const closed = waitClose(a.ws);
  for (let i = 0; i < 9; i++) a.send({ t: 'chat', text: 'spam ' + i });
  const chat = await b.next(m => m.t === 'chat');
  assert.match(chat.text, /^spam 0$/);
  await b.noMessage(m => m.t === 'chat', 250);

  const c = await closed;
  assert.equal(c.code, 1008);
  await leave(b);
});

test('resume reidrata a sessão, rotaciona o token e mantém a posição', async () => {
  const a = connect(srv.port);
  await a.opened;
  const ja = await createRoom(a);
  const b = connect(srv.port);
  await b.opened;
  await joinRoom(b, ja.code);

  a.send({ t: 'move', x: 2, z: 3, ry: 0.5, y: 0, s: 0 });
  await b.next(m => m.t === 'st' && m.s.some(r => r[0] === ja.id && Math.abs(r[1] - 2) < 0.01 && Math.abs(r[2] - 3) < 0.01));

  const token1 = ja.token;
  a.ws.terminate();
  await sleep(120);

  const a2 = connect(srv.port);
  await a2.opened;
  a2.send({ t: 'resume', code: ja.code, token: token1 });
  const jr = await a2.next(m => m.t === 'joined');
  assert.equal(jr.resume, 1);
  assert.equal(jr.id, ja.id);
  assert.notEqual(jr.token, token1);
  assert.match(jr.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(jr.self.x, 2);
  assert.equal(jr.self.z, 3);
  const token2 = jr.token;

  a2.ws.terminate();
  await sleep(120);

  const a3 = connect(srv.port);
  await a3.opened;
  a3.send({ t: 'resume', code: ja.code, token: token1 });
  const bad = await a3.next(m => m.t === 'err');
  assert.equal(bad.scope, 'resume');
  await waitClose(a3.ws);

  const a4 = connect(srv.port);
  await a4.opened;
  a4.send({ t: 'resume', code: ja.code, token: token2 });
  const jr2 = await a4.next(m => m.t === 'joined');
  assert.equal(jr2.resume, 1);
  assert.equal(jr2.id, ja.id);

  await leave(a4);
  await leave(b);
});

test('sala e sessão expiram após a janela de reconexão', async () => {
  const a = connect(srv.port);
  await a.opened;
  const ja = await createRoom(a);
  a.ws.terminate();
  await sleep(RECONNECT_MS + 400);

  const late = connect(srv.port);
  await late.opened;
  late.send({ t: 'resume', code: ja.code, token: ja.token });
  const err = await late.next(m => m.t === 'err');
  assert.equal(err.scope, 'resume');
  await waitClose(late.ws);

  const join = connect(srv.port);
  await join.opened;
  join.send({ t: 'join', code: ja.code, name: 'Tarde' });
  const notFound = await join.next(m => m.t === 'err');
  assert.match(notFound.msg, /Sala não encontrada/);
  join.ws.terminate();
});

test('join inválido recebe erro amigável em vez de silêncio', async () => {
  const c = connect(srv.port);
  await c.opened;
  c.send({ t: 'join', code: 'curto' });
  const err = await c.next(m => m.t === 'err');
  assert.match(err.msg, /confira o código/i);
  c.ws.terminate();
});

test('IP real usa X-Forwarded-For da direita para a esquerda e agrupa IPv6 por /64', async () => {
  await withServer({ TRUST_PROXY: '127.0.0.1', PERIP: '2' }, async s => {
    const open = async xff => {
      const c = connect(s.port, undefined, { 'X-Forwarded-For': xff });
      await c.opened;
      return c;
    };

    const c1 = await open('198.51.100.1, 203.0.113.10');
    const c2 = await open('198.51.100.2, 203.0.113.10');
    const c3 = connect(s.port, undefined, { 'X-Forwarded-For': '198.51.100.3, 203.0.113.10' });
    await assert.rejects(c3.opened, /429/);
    c3.ws.terminate();

    const c4 = await open('198.51.100.4, 203.0.113.11');
    c1.ws.terminate();
    c2.ws.terminate();
    c4.ws.terminate();
    await sleep(150);

    const c5 = await open('2001:db8:aaaa:bbbb::1');
    const c6 = await open('2001:db8:aaaa:bbbb::2');
    const c7 = connect(s.port, undefined, { 'X-Forwarded-For': '2001:db8:aaaa:bbbb::3' });
    await assert.rejects(c7.opened, /429/);

    c7.ws.terminate();
    c5.ws.terminate();
    c6.ws.terminate();
  });
});

test('CF-Connecting-IP só é confiado com TRUST_CF_CONNECTING_IP=1', async () => {
  await withServer({ TRUST_PROXY: '127.0.0.1', TRUST_CF_CONNECTING_IP: '1', PERIP: '1' }, async s => {
    const c1 = connect(s.port, undefined, {
      'CF-Connecting-IP': '198.51.100.7',
      'X-Forwarded-For': '203.0.113.1'
    });
    await c1.opened;

    const c2 = connect(s.port, undefined, {
      'CF-Connecting-IP': '198.51.100.7',
      'X-Forwarded-For': '203.0.113.2'
    });
    await assert.rejects(c2.opened, /429/);

    c1.ws.terminate();
    c2.ws.terminate();
  });
});

test('CSP usa hashes dos scripts inline, three.js é local e o HTML tem ETag/cache', async () => {
  await withServer({ PUBLIC_URL: 'https://jogo.example.com', STATUS_TOKEN: 'abcdefghijklmnop', HTTP_RATE: '1000' }, async s => {
    const home = await httpGet(s.port, '/');
    assert.equal(home.status, 200);
    const csp = String(home.headers['content-security-policy'] || '');
    assert.ok(csp.includes("script-src-attr 'none'"));
    assert.ok(!csp.includes('cdnjs.cloudflare.com'));
    const parts = csp.split(';').map(x => x.trim());
    const scriptSrc = parts.find(x => x.startsWith('script-src '));
    assert.ok(scriptSrc);
    assert.ok(!scriptSrc.includes("'unsafe-inline'"));
    const connectSrc = parts.find(x => x.startsWith('connect-src '));
    assert.ok(connectSrc.includes("'self'"));
    assert.ok(connectSrc.includes('wss://jogo.example.com'));
    assert.ok(!connectSrc.includes(' ws:'));

    const html = home.body.toString('utf8');
    assert.ok(html.includes('src="/vendor/three-r128.min.js"'));
    assert.ok(!html.includes('cdnjs.cloudflare.com'));
    const hashes = inlineScriptHashes(html);
    assert.equal(hashes.length, 2);
    for (const h of hashes) assert.ok(csp.includes("'sha384-" + h + "'"));

    const etag = home.headers.etag;
    assert.ok(etag);
    const notModified = await httpGet(s.port, '/', { 'If-None-Match': etag });
    assert.equal(notModified.status, 304);
    assert.equal(notModified.body.length, 0);

    const head = await httpGet(s.port, '/', {}, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert.ok(+head.headers['content-length'] > 100000);

    const status = await httpGet(s.port, '/status');
    assert.equal(status.status, 200);
    assert.equal(status.headers['cache-control'], 'no-store');
    assert.equal(status.headers['x-robots-tag'], 'noindex');
    const statusCsp = String(status.headers['content-security-policy'] || '');
    const statusHashes = inlineScriptHashes(status.body.toString('utf8'));
    assert.equal(statusHashes.length, 1);
    assert.ok(statusCsp.includes("'sha384-" + statusHashes[0] + "'"));

    const vendor = await httpGet(s.port, '/vendor/three-r128.min.js');
    assert.equal(vendor.status, 200);
    assert.match(String(vendor.headers['content-type']), /application\/javascript/);
    assert.match(String(vendor.headers['cache-control']), /immutable/);
    assert.ok(vendor.body.length > 500000);
    assert.equal(vendor.body.toString('utf8', 0, 2), '/*');
    const vendor304 = await httpGet(s.port, '/vendor/three-r128.min.js', { 'If-None-Match': vendor.headers.etag });
    assert.equal(vendor304.status, 304);

    const missing = await httpGet(s.port, '/nope');
    assert.equal(missing.status, 404);
    assert.ok(String(missing.headers['content-security-policy']).includes("default-src 'self'"));
  });
});

test('HTTP_RATE limita requisições por IP e devolve Retry-After', async () => {
  await withServer({ HTTP_RATE: '1' }, async s => {
    const first = await httpGet(s.port, '/');
    assert.equal(first.status, 200);
    const second = await httpGet(s.port, '/');
    assert.equal(second.status, 429);
    assert.equal(second.headers['retry-after'], '60');
    assert.ok(String(second.headers['content-security-policy']).includes("default-src 'self'"));
  });
});

test('TURN gera credenciais temporárias e falha em produção sem segredo', async () => {
  assert.equal(await bootExit({
    PUBLIC_URL: 'https://jogo.example.com',
    TURN_URL: 'turn:turn.example.com:3478',
    TURN_SECRET: '',
    TURN_ALLOW_STATIC: ''
  }), 1);

  await withServer({
    TURN_URL: 'turn:turn.example.com:3478',
    TURN_SECRET: 'segredo',
    TURN_TTL: '1200',
    TURN_LABEL: 'skyke3d'
  }, async s => {
    const c = connect(s.port);
    await c.opened;
    const j = await createRoom(c);
    const turn = (j.ice.iceServers || []).find(x => {
      const urls = Array.isArray(x.urls) ? x.urls : [String(x.urls)];
      return urls.some(u => /^turns?:/.test(u));
    });
    assert.ok(turn);
    const [exp, label] = String(turn.username).split(':');
    assert.equal(label, 'skyke3d');
    const now = Math.floor(Date.now() / 1000);
    assert.ok(+exp >= now + 1190 && +exp <= now + 1210);
    const expected = crypto.createHmac('sha1', 'segredo').update(turn.username).digest('base64');
    assert.equal(turn.credential, expected);
    await leave(c);
  });
});

test('TURN_ALLOW_STATIC permite credenciais estáticas em produção', async () => {
  await withServer({
    PUBLIC_URL: 'https://jogo.example.com',
    TURN_URL: 'turn:turn.example.com:3478',
    TURN_USER: 'usuario',
    TURN_PASS: 'senha',
    TURN_ALLOW_STATIC: '1'
  }, async s => {
    const c = connect(s.port, 'https://jogo.example.com', { Host: 'jogo.example.com' });
    await c.opened;
    const j = await createRoom(c);
    const turn = (j.ice.iceServers || []).find(x => {
      const urls = Array.isArray(x.urls) ? x.urls : [String(x.urls)];
      return urls.some(u => /^turns?:/.test(u));
    });
    assert.ok(turn);
    assert.equal(turn.username, 'usuario');
    assert.equal(turn.credential, 'senha');
    await leave(c);
  });
});

test('rajada de sinalização não conta como violação nem derruba a sessão', async () => {
  await withServer({}, async s => {
    const a = connect(s.port);
    await a.opened;
    const ja = await createRoom(a);
    const b = connect(s.port);
    await b.opened;
    const jb = await joinRoom(b, ja.code);

    for (let i = 0; i < 320; i++) a.send({ t: 'sig', to: jb.id, data: { x: 'busy' } });
    await sleep(400);
    assert.equal(a.ws.readyState, WebSocket.OPEN);

    a.send({ t: 'chat', text: 'depois do flood' });
    const chat = await b.next(m => m.t === 'chat' && m.text === 'depois do flood', 4000);
    assert.equal(chat.name, 'Ana');

    await leave(b);
    await leave(a);
  });
});

test('anfitrião pode encerrar vídeo iniciado por outro jogador', async () => {
  await withServer({}, async s => {
    const a = connect(s.port);
    await a.opened;
    const ja = await createRoom(a);
    const b = connect(s.port);
    await b.opened;
    await joinRoom(b, ja.code);

    b.send({ t: 'video', vid: 'dQw4w9WgXcQ' });
    const inv = await a.next(m => m.t === 'vinv');
    assert.equal(inv.vid, 'dQw4w9WgXcQ');

    a.send({ t: 'vstop' });
    assert.deepEqual(await b.next(m => m.t === 'vstop'), { t: 'vstop' });

    await leave(b);
    await leave(a);
  });
});

test('convites de karaokê respeitam cooldown por sala', async () => {
  await withServer({}, async s => {
    const a = connect(s.port);
    await a.opened;
    const ja = await createRoom(a);
    const b = connect(s.port);
    await b.opened;
    await joinRoom(b, ja.code);

    b.send({ t: 'kjoin', vid: 'dQw4w9WgXcQ' });
    const inv = await a.next(m => m.t === 'kinv' && m.name === 'Bia');
    assert.equal(inv.name, 'Bia');

    b.send({ t: 'kleave' });
    await a.next(m => m.t === 'kar' && m.q.length === 0);

    const c = connect(s.port);
    await c.opened;
    const jc = await joinRoom(c, ja.code, 'Caio', { skin: 3 });
    c.send({ t: 'kjoin', vid: 'dQw4w9WgXcQ' });
    await a.noMessage(m => m.t === 'kinv', 600);

    await leave(c);
    await leave(b);
    await leave(a);
  });
});

test('PORT e limites inválidos encerram com código 1 em vez de estourar NaN', async () => {
  assert.equal(await bootExit({ PORT: 'abc' }), 1);
  assert.equal(await bootExit({ PORT: '70000' }), 1);
  assert.equal(await bootExit({ PERIP: '0' }), 1);
  assert.equal(await bootExit({ HTTP_RATE: 'abc' }), 1);
  assert.equal(await bootExit({ TURN_TTL: '10' }), 1);
});
