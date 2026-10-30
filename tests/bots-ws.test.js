'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');

function startServer(env = {}, t) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: '0',
        RECORDS_FILE: '0',
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


test('sala com 20 bots: uma mensagem recebe UMA resposta de bot em poucos segundos, sem enxurrada', async t => {
  const { port } = await startServer({ MAX_PER_ROOM: '25' }, t);// o padrão é 16 por sala: aqui a sala precisa caber 20 bots
  const ws = await connect(port);
  ws.send(JSON.stringify({ t: 'create', style: 'proxima', bots: 20, name: 'Ana', cfg: {} }));
  const joined = await nextMessage(ws, m => m.t === 'joined');
  assert.strictEqual(joined.players.filter(p => p.bot).length, 20);
  const names = new Set(joined.players.filter(p => p.bot).map(p => p.name));
  assert.strictEqual(names.size, 20, 'nomes únicos');
  const said = [];
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'chat' && m.name !== 'Ana') said.push(m); });
  ws.send(JSON.stringify({ t: 'chat', text: 'oi pessoal' }));
  await new Promise(r => setTimeout(r, 4500));
  assert.strictEqual(said.length, 1, JSON.stringify(said));
  assert.ok(names.has(said[0].name));
  assert.ok(said[0].text.length > 0);
  ws.close();
});

test('mais de 20 bots é recusado pelo validador sem derrubar a sala', async t => {
  const { port } = await startServer({}, t);
  const ws = await connect(port);
  ws.send(JSON.stringify({ t: 'create', style: 'proxima', bots: 3, name: 'Ana', cfg: {} }));
  await nextMessage(ws, m => m.t === 'joined');
  ws.send(JSON.stringify({ t: 'bots', n: 21 }));
  const bc = nextMessage(ws, m => m.t === 'bots');
  ws.send(JSON.stringify({ t: 'bots', n: 20 }));
  assert.strictEqual((await bc).want, 20);
  ws.close();
});
