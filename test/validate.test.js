'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../validate');

test('videoId só aceita IDs do YouTube com 11 caracteres', () => {
  assert.equal(V.videoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(V.videoId('abc-_123456'), 'abc-_123456');
  for (const bad of ['', 'abc', 'dQw4w9WgXcQx', 'dQw4w9WgXc\n', 'https://youtu.be/dQw4w9WgXcQ', 123, null, {}, ['dQw4w9WgXcQ']]) {
    assert.equal(V.videoId(bad), null);
  }
});

test('normCode canonicaliza códigos e rejeita formatos inválidos', () => {
  assert.equal(V.normCode('abcde-fghjk'), 'ABCDEFGHJK');
  assert.equal(V.normCode('ABCDE FGHJK'), 'ABCDEFGHJK');
  assert.equal(V.normCode('ABCDE-FGHJ'), null);
  assert.equal(V.normCode('ABCDE-FGHJ0'), null);
  assert.equal(V.normCode('ABCDE-FGHJO'), null);
  assert.equal(V.normCode(null), null);
});

test('normToken exige token base64url de 32 bytes', () => {
  const token = Buffer.alloc(32, 7).toString('base64url');
  assert.equal(V.normToken(token), token);
  assert.equal(V.normToken(token.slice(0, -1)), null);
  assert.equal(V.normToken(token + '='), null);
  assert.equal(V.normToken(42), null);
});

test('cleanCfg rejeita tipos, frações e valores fora dos limites', () => {
  const ok = V.cleanCfg({ skin: 3, eye: 0, shirt: 19, hair: 11, h2: 0, hc: 0, hs: 0, hat: 5, bt: 1, pc: 0, sc: 0, shoes: 2, fc: 0 });
  assert.equal(ok.skin, 3);
  assert.equal(ok.shoes, 2);
  assert.equal(V.cleanCfg({}).skin, 0);
  for (const bad of [{ skin: 4 }, { eye: -1 }, { shirt: 1.5 }, { hair: '1' }, { hat: true }, [], 'x']) {
    assert.equal(V.cleanCfg(bad), null);
  }
});

test('normalizeMessage sanitiza criação e limita campos', () => {
  const m = V.normalizeMessage({ t: 'create', style: 'pyra', bots: 3, name: '<b>Ana</b>', cfg: { skin: 2 } });
  assert.deepEqual(m, { t: 'create', style: 'pyra', bots: 3, cfg: { ...m.cfg, skin: 2 }, name: 'bAna/b' });
  assert.equal(m.cfg.skin, 2);
  assert.equal(V.normalizeMessage({ t: 'create', style: 'invalido' }), null);
  assert.equal(V.normalizeMessage({ t: 'create', bots: 10 }), null);
  assert.equal(V.normalizeMessage({ t: 'create', bots: 1.5 }), null);
  assert.equal(V.normalizeMessage({ t: 'create', name: 'x'.repeat(65) }), null);
});

test('normalizeMessage valida join e resume sem ecoar payload bruto', () => {
  assert.deepEqual(V.normalizeMessage({ t: 'join', code: 'abcde-fghjk', name: 'Bia', cfg: { skin: 1 } }), {
    t: 'join', code: 'ABCDEFGHJK', name: 'Bia', cfg: { ...V.cleanCfg({ skin: 1 }), skin: 1 }
  });
  assert.equal(V.normalizeMessage({ t: 'join', code: 'curto' }), null);
  assert.equal(V.normalizeMessage({ t: 'join', code: 'ABCDE-FGHJK', extra: 'x'.repeat(5000) }).extra, undefined);
  assert.equal(V.normalizeMessage({ t: 'resume', code: 'ABCDE-FGHJK', token: 'x' }), null);
});

test('normalizeMessage valida movimento e posição', () => {
  const m = V.normalizeMessage({ t: 'move', x: 999, z: 999, ry: 999, y: 999, s: 1 });
  assert.equal(m.s, 1);
  assert.ok(Math.hypot(m.x, m.z - 1.2) <= 10.2 + 1e-9);
  assert.equal(m.ry, 10);
  assert.equal(m.y, 1.6);
  for (const bad of [
    { t: 'move', x: NaN, z: 0 },
    { t: 'move', x: Infinity, z: 0 },
    { t: 'move', x: '1', z: 0 },
    { t: 'move', x: 0, z: 0, s: 2 },
    { t: 'move', x: 0, z: 0, s: true },
    { t: 'move', x: 0, z: 0, ry: NaN }
  ]) assert.equal(V.normalizeMessage(bad), null);
});

test('normalizeMessage limita chat e remove controles', () => {
  const m = V.normalizeMessage({ t: 'chat', text: '  oi\u0000\u202e  ' });
  assert.equal(m.text, 'oi');
  assert.equal(V.normalizeMessage({ t: 'chat', text: '' }), null);
  assert.equal(V.normalizeMessage({ t: 'chat', text: 'x'.repeat(400) }).text, 'xxx');
  assert.equal(V.normalizeMessage({ t: 'chat', text: 'ab'.repeat(101) }), null);
  assert.equal(V.normalizeMessage({ t: 'chat', text: 42 }), null);
  assert.equal(V.normalizeMessage({ t: 'chat', text: 'https://a  https://b  https://c  https://d' }), null);
});

test('normalizeMessage aplica allowlist em itens, gestos e emojis', () => {
  assert.deepEqual(V.normalizeMessage({ t: 'item', item: 'pocao_cura', use: 1 }), { t: 'item', item: 'pocao_cura', use: 1 });
  assert.deepEqual(V.normalizeMessage({ t: 'item', item: null }), { t: 'item', item: null, use: 0 });
  assert.equal(V.normalizeMessage({ t: 'item', item: 'hack' }), null);
  assert.equal(V.normalizeMessage({ t: 'item', item: 'pocao_cura', use: 2 }), null);
  assert.deepEqual(V.normalizeMessage({ t: 'gest', g: 'dance19' }), { t: 'gest', g: 'dance19' });
  assert.equal(V.normalizeMessage({ t: 'gest', g: 'dance20' }), null);
  assert.deepEqual(V.normalizeMessage({ t: 'emo', i: 19 }), { t: 'emo', i: 19 });
  for (const i of [-1, 20, 1.5, '3', NaN]) assert.equal(V.normalizeMessage({ t: 'emo', i }), null);
});

test('normalizeMessage valida vídeo, sincronização e sinalização', () => {
  assert.deepEqual(V.normalizeMessage({ t: 'video', vid: 'dQw4w9WgXcQ' }), { t: 'video', vid: 'dQw4w9WgXcQ' });
  assert.equal(V.normalizeMessage({ t: 'video', vid: { toString: () => 'dQw4w9WgXcQ' } }), null);
  assert.equal(V.normalizeMessage({ t: 'vsync', time: 86401, playing: true }), null);
  assert.equal(V.normalizeMessage({ t: 'vsync', time: 1, playing: 1 }), null);
  assert.deepEqual(V.normalizeMessage({ t: 'vsync', time: 1.5, playing: false }), { t: 'vsync', time: 1.5, playing: false });
  assert.equal(V.normalizeMessage({ t: 'kdur', d: 9 }), null);
  assert.deepEqual(V.normalizeMessage({ t: 'kdur', d: 1800 }), { t: 'kdur', d: 1800 });
  assert.equal(V.normalizeMessage({ t: 'sig', to: 'x1', data: { x: 'busy' } }), null);
  assert.deepEqual(V.normalizeMessage({ t: 'sig', to: 'p1', data: { x: 'busy' } }), { t: 'sig', to: 'p1', data: { x: 'busy' } });
  assert.equal(V.normalizeMessage({ t: 'sig', to: 'p1', data: { d: { type: 'offer', sdp: 'x'.repeat(V.MAX_SDP + 1) } } }), null);
});

test('normalizeMessage rejeita tipos desconhecidos e payloads não-objeto', () => {
  for (const bad of [null, undefined, 1, 'x', [], {}, { t: 1 }, { t: 'nada' }]) assert.equal(V.normalizeMessage(bad), null);
  assert.deepEqual(V.normalizeMessage({ t: 'leave', extra: 'ignorado' }), { t: 'leave' });
});
