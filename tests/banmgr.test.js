'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { createBanManager } = require('../banmgr');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-ban-')), 'bans.json');
const mk = o => createBanManager({ on: true, levels: [1000, 5000], resetMs: 60000, max: 100, delayMs: 20, ...o });

test('strike bane, avisa e chave não revela o IP', () => {
  const calls = [];
  const M = mk({ onStrike: (w, ms) => calls.push([w, ms]) });
  assert.strictEqual(M.check('1.2.3.4'), 0);
  const ms = M.strike('1.2.3.4', 'teste');
  assert.strictEqual(ms, 1000);
  assert.ok(M.check('1.2.3.4') > 0);
  assert.deepStrictEqual(calls, [['teste', 1000]]);
  assert.ok(!M.key('1.2.3.4').includes('1.2.3.4'));
  assert.strictEqual(M.hostId('1.2.3.4'), M.key('1.2.3.4').slice(0, 12));
});

test('desligado: nada é banido nem gravado', () => {
  const f = tmp(); const M = mk({ on: false, file: f });
  assert.strictEqual(M.strike('9.9.9.9', 'x'), 0);
  assert.strictEqual(M.check('9.9.9.9'), 0);
  M.flush();
  assert.strictEqual(fs.existsSync(f), false);
});

test('flush grava, e um novo gerenciador recarrega bans e sal', () => {
  const f = tmp(); const A = mk({ file: f });
  A.strike('5.6.7.8', 'x'); A.flush();
  assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
  const B = mk({ file: f });
  assert.strictEqual(B.key('5.6.7.8'), A.key('5.6.7.8'));
  assert.ok(B.check('5.6.7.8') > 0);
});

test('gravação adiada acontece sozinha', async () => {
  const f = tmp(); const A = mk({ file: f });
  A.strike('1.1.1.1', 'x');
  assert.strictEqual(fs.existsSync(f), false);
  await new Promise(r => setTimeout(r, 80));
  assert.strictEqual(fs.existsSync(f), true);
});

test('arquivo inválido vai para .bak e começa limpo', () => {
  const f = tmp(); fs.writeFileSync(f, '{ruim');
  const w = []; const M = mk({ file: f, warn: m => w.push(m) });
  assert.strictEqual(w.length, 1);
  assert.ok(fs.existsSync(f + '.bak'));
  assert.strictEqual(M.check('1.2.3.4'), 0);
});
