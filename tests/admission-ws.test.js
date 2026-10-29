'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');
const { powOk } = require('../admission');

const ROOT = path.join(__dirname, '..');

function startServer(env = {}, t) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: '0',
        BIND_HOST: '127.0.0.1',
        PUBLIC_URL: '',
        BAN: '0',
        TICKET_MODE: 'off',
        HTTP_RATE: '0',
        GLOBAL_RATE: '0',
        PERIP_RATE: '1000',
        ...env
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    const timer = setTimeout(() => reject(new Error('servidor não subiu: ' + out)), 8000);
    timer.unref();
    child.stdout.on('data', d => {
      out += d;
      const m = out.match(/escutando em [^\s]*:(\d+)/);
      if (!m) return;
      clearTimeout(timer);
      if (t) t.after(() => child.kill('SIGKILL'));
      resolve({ child, port: +m[1] });
    });
    child.stderr.on('data', d => { out += d; });
    child.on('exit', code => {
      clearTimeout(timer);
      reject(new Error('servidor saiu (' + code + '): ' + out));
    });
  });
}

function connect(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/', { origin: 'http://127.0.0.1:' + port });
    ws.once('open', () => resolve(ws));
    ws.once('unexpected-response', (req, res) => {
      res.resume();
      reject(Object.assign(new Error('http ' + res.statusCode), { status: res.statusCode }));
    });
    ws.once('error', reject);
  });
}

function nextMessage(ws, pred, ms = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', on); reject(new Error('timeout aguardando mensagem')); }, ms);
    function on(raw) {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (!pred(m)) return;
      clearTimeout(timer);
      ws.off('message', on);
      resolve(m);
    }
    ws.on('message', on);
  });
}

function getTicket(port) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/ticket' }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(Object.assign(new Error('ticket ' + res.statusCode), { status: res.statusCode }));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

test('PERIP limita conexões simultâneas por IP', async t => {
  const { port } = await startServer({ PERIP: '2' }, t);
  const a = await connect(port);
  const b = await connect(port);
  await assert.rejects(connect(port), e => e.status === 429);
  a.close(); b.close();
});

test('PERIP_ROOM limita conexões do mesmo IP na sala', async t => {
  const { port } = await startServer({ PERIP: '6', PERIP_ROOM: '1' }, t);
  const host = await connect(port);
  host.send(JSON.stringify({ t: 'create', style: 'proxima', bots: 0, name: 'Host', cfg: {} }));
  const joined = await nextMessage(host, m => m.t === 'joined');

  const guest = await connect(port);
  const err = nextMessage(guest, m => m.t === 'err');
  guest.send(JSON.stringify({ t: 'join', code: joined.code, name: 'Guest', cfg: {} }));
  const msg = await err;
  assert.match(msg.msg, /Muitas conexões deste local/);
  host.close(); guest.close();
});

test('ticket é obrigatório em enforce e vale para o mesmo IP', async t => {
  const { port } = await startServer({ TICKET_MODE: 'enforce', POW_MAX: '0' }, t);
  await assert.rejects(connect(port), e => e.status === 403);

  const tk = await getTicket(port);
  assert.strictEqual(tk.v, 1);
  const param = [tk.c, tk.e, tk.d, tk.k, 0].join('.');
  const ws = await new Promise((resolve, reject) => {
    const w = new WebSocket('ws://127.0.0.1:' + port + '/?ticket=' + encodeURIComponent(param), {
      origin: 'http://127.0.0.1:' + port
    });
    w.once('open', () => resolve(w));
    w.once('unexpected-response', (req, res) => { res.resume(); reject(new Error('http ' + res.statusCode)); });
    w.once('error', reject);
  });
  ws.close();
});

test('ticket não pode ser reutilizado', async t => {
  const { port } = await startServer({ TICKET_MODE: 'enforce', POW_MAX: '0', PERIP: '6' }, t);
  const tk = await getTicket(port);
  const param = [tk.c, tk.e, tk.d, tk.k, 0].join('.');
  const open = () => new Promise((resolve, reject) => {
    const w = new WebSocket('ws://127.0.0.1:' + port + '/?ticket=' + encodeURIComponent(param), {
      origin: 'http://127.0.0.1:' + port
    });
    w.once('open', () => resolve(w));
    w.once('unexpected-response', (req, res) => { res.resume(); reject(Object.assign(new Error('http ' + res.statusCode), { status: res.statusCode })); });
    w.once('error', reject);
  });
  const a = await open();
  await assert.rejects(open(), e => e.status === 403);
  a.close();
});

test('dificuldade sobe sob pressão e a prova é aceita', async t => {
  const { port } = await startServer({ TICKET_MODE: 'enforce', POW_MAX: '8' }, t);
  let tk;
  for (let i = 0; i < 5; i++) tk = await getTicket(port);
  tk = await getTicket(port);
  assert.strictEqual(tk.d, 8, 'sexto ticket no mesmo minuto exige PoW');
  let nonce = 0;
  while (!powOk(tk.c, tk.d, String(nonce))) nonce++;
  const param = [tk.c, tk.e, tk.d, tk.k, nonce].join('.');
  const ws = await new Promise((resolve, reject) => {
    const w = new WebSocket('ws://127.0.0.1:' + port + '/?ticket=' + encodeURIComponent(param), {
      origin: 'http://127.0.0.1:' + port
    });
    w.once('open', () => resolve(w));
    w.once('unexpected-response', (req, res) => { res.resume(); reject(new Error('http ' + res.statusCode)); });
    w.once('error', reject);
  });
  ws.close();
});

test('banimento sobrevive ao reinício via BAN_FILE', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyke3d-ban-'));
  const file = path.join(dir, 'bans.json');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const first = await startServer({ BAN: '1', BAN_FILE: file }, t);
  const ws = await connect(first.port);
  const closed = once(ws, 'close');
  for (let i = 0; i < 9; i++) ws.send('x');
  await closed;
  first.child.kill('SIGTERM');
  await once(first.child, 'exit');

  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(saved.v, 1);
  assert.ok(typeof saved.salt === 'string' && saved.salt.length >= 16);
  assert.ok(Object.keys(saved.bans).length >= 1, 'banimento gravado');

  const second = await startServer({ BAN: '1', BAN_FILE: file }, t);
  await assert.rejects(connect(second.port), e => e.status === 429);
});
