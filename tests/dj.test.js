'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const WebSocket = require('ws');
const V = require('../validate');
const { isPublicAddress } = require('../netutil');

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


test('nome obrigatório: sem nome, "Visitante" ou só símbolos invisíveis não entram', () => {
  for (const name of [undefined, '', '   ', 'Visitante', 'visitante', '\u200b\u200b', 'admin']) {
    const m = V.normalizeMessage({ t: 'create', style: 'proxima', name });
    assert.strictEqual(m.named, false, JSON.stringify(name));
  }
  assert.strictEqual(V.normalizeMessage({ t: 'create', style: 'proxima', name: 'Ana' }).named, true);
  assert.strictEqual(V.normalizeMessage({ t: 'join', code: 'ABCDEFGHJK', name: 'Théo' }).named, true);
});

test('servidor recusa criar e entrar sem nome, com mensagem clara e sem punir', async t => {
  const { port } = await startServer({}, t);
  const ws = await connect(port);
  for (const first of [{ t: 'create', style: 'proxima', bots: 0, cfg: {} }, { t: 'create', style: 'proxima', bots: 0, name: 'Visitante', cfg: {} }, { t: 'join', code: 'ABCDEFGHJK', cfg: {} }]) {
    const err = nextMessage(ws, m => m.t === 'err');
    ws.send(JSON.stringify(first));
    assert.match((await err).msg, /Escolha um nome/);
  }
  const joined = nextMessage(ws, m => m.t === 'joined');
  ws.send(JSON.stringify({ t: 'create', style: 'proxima', bots: 0, name: 'Ana', cfg: {} }));
  assert.ok((await joined).code, 'com nome entra na mesma conexão');
  ws.close();
});

test('DJ: só https, domínio público, sem usuário/senha, sem IP e sem nome local', () => {
  const good = ['https://radio.example.com/stream.mp3', 'https://ice.radio.org:8443/live?x=1#frag', 'https://Stream.Zeno.FM/abc'];
  for (const u of good) assert.ok(V.streamUrl(u), u);
  assert.strictEqual(V.streamUrl('https://ice.radio.org:8443/live?x=1#frag'), 'https://ice.radio.org:8443/live?x=1');
  const bad = [
    'http://radio.com/a.mp3', 'ftp://radio.com/a', 'javascript:alert(1)', 'data:audio/mp3;base64,AAAA', 'file:///etc/passwd',
    'https://localhost/a', 'https://127.0.0.1/a', 'https://10.0.0.5:8000/a', 'https://192.168.1.2/a', 'https://[::1]/a', 'https://[fe80::1]/a',
    'https://2130706433/a', 'https://0x7f.0.0.1/a', 'https://user:pw@radio.com/a', 'https://radio/a', 'https://box.local/a',
    'https://api.internal/a', 'https://radio.com/a b', 'https://radio.com/"x', 'https://radio.com:99999/a', 'https://radio.com/' + 'a'.repeat(300),
    'https://evil.com\\@127.0.0.1/a', '', '  ', 5, null, {}, undefined
  ];
  for (const u of bad) assert.strictEqual(V.streamUrl(u), null, String(u).slice(0, 60));
  assert.deepStrictEqual(V.normalizeMessage({ t: 'dj', url: 'https://radio.example.com/s' }), { t: 'dj', url: 'https://radio.example.com/s' });
  assert.strictEqual(V.normalizeMessage({ t: 'dj', url: 'http://radio.example.com/s' }), null);
  assert.deepStrictEqual(V.normalizeMessage({ t: 'djstop' }), { t: 'djstop' });
});

test('isPublicAddress: recusa loopback, rede privada, CGNAT, link-local e IPv6 local', () => {
  for (const a of ['1.1.1.1', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111']) assert.strictEqual(isPublicAddress(a), true, a);
  for (const a of ['127.0.0.1', '10.1.2.3', '172.16.5.5', '172.31.255.255', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '198.18.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::808:808', '2001:db8::1', 'abc', '', null, undefined])
    assert.strictEqual(isPublicAddress(a), false, String(a));
});

test('DJ: domínio que não resolve é recusado com djerr; a conexão continua', async t => {
  const { port } = await startServer({}, t);
  const ws = await connect(port);
  ws.send(JSON.stringify({ t: 'create', style: 'proxima', bots: 0, name: 'Dj', cfg: {} }));
  await nextMessage(ws, m => m.t === 'joined');
  const err = nextMessage(ws, m => m.t === 'djerr', 8000);
  ws.send(JSON.stringify({ t: 'dj', url: 'https://radio.nao-existe-skyke3d-xyz.com/stream.mp3' }));
  assert.match((await err).msg, /público|encontrado/);
  const pong = nextMessage(ws, m => m.t === 'chat');
  ws.send(JSON.stringify({ t: 'chat', text: 'oi' }));
  assert.strictEqual((await pong).text, 'oi');
  ws.send(JSON.stringify({ t: 'djstop' }));
  ws.close();
});

test('DJ: CSP só do próprio servidor e a barra tem o botão 🎧', () => {
  const server = require('node:fs').readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(server, /media-src 'self' blob: data:"/);
  assert.ok(!/media-src[^"]*https?:/.test(server), 'o áudio da rádio vem do próprio servidor (proxy), sem liberar https: externo');
  const html = require('node:fs').readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('id="bDJ"') && html.includes('id="pDJ"') && html.includes('id="djurl"'));
});

test('/radio: exige a chave do jogador na sala; sem rádio ou chave errada é 404, só GET', async t => {
  const { port } = await startServer({}, t);
  const ws = await connect(port);
  ws.send(JSON.stringify({ t: 'create', style: 'proxima', bots: 0, name: 'Ouvinte', cfg: {} }));
  const joined = await nextMessage(ws, m => m.t === 'joined');
  assert.match(joined.rk, /^[A-Za-z0-9_-]{43}$/);
  assert.notStrictEqual(joined.rk, joined.token, 'a chave da rádio não é o token de sessão');
  const req = (p, method = 'GET') => new Promise((resolve, reject) => {
    require('node:http').request({ host: '127.0.0.1', port, path: p, method }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject).end();
  });
  assert.strictEqual(await req('/radio'), 404);
  assert.strictEqual(await req('/radio?c=' + joined.code + '&k=' + joined.rk), 404, 'sala sem DJ');
  assert.strictEqual(await req('/radio?c=' + joined.code + '&k=' + 'x'.repeat(43)), 404, 'chave errada');
  assert.strictEqual(await req('/radio?c=' + joined.code + '&k=' + joined.token), 404, 'o token de sessão não vale');
  assert.strictEqual(await req('/radio?c=' + joined.code + '&k=' + joined.rk, 'HEAD'), 405);
  ws.close();
});

test('sino: notificações expiram em 20 minutos e a janela de gestos não ganha barra de rolagem', () => {
  const fs = require('node:fs');
  const js = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');
  assert.ok(js.includes('TTL:20*60000') && js.includes('function ntPrune()') && js.includes('setInterval(ntPrune,'));
  assert.ok(js.includes('now-i.at<NT.TTL'), 'compara com o instante em que o item entrou no sino');
  const css = fs.readFileSync(path.join(ROOT, 'assets/app.css'), 'utf8');
  assert.match(css, /#eGes \.emog\{[^}]*overflow:hidden/, 'sem rolagem por padrão');
  assert.match(css, /@media \(max-height:620px\)\{#eGes \.emog\{overflow-y:auto\}\}/, 'rolagem só em janela baixa');
});
