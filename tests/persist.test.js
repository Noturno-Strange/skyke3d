'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { readJsonFile, writeJsonAtomic } = require('../persist');
const { hookBody, mdEsc, clip } = require('../report-hook');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sk-persist-'));

test('grava atômico, cria a pasta, modo 0600 e não deixa .tmp', () => {
  const d = tmpDir(), f = path.join(d, 'a', 'b.json');
  writeJsonAtomic(f, { v: 1, x: [1, 2] });
  assert.deepStrictEqual(readJsonFile(f), { v: 1, x: [1, 2] });
  assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(f)), ['b.json']);
  writeJsonAtomic(f, { v: 2 });
  assert.strictEqual(readJsonFile(f).v, 2);
});

test('arquivo ausente vira null; JSON inválido lança', () => {
  const d = tmpDir();
  assert.strictEqual(readJsonFile(path.join(d, 'nao.json')), null);
  fs.writeFileSync(path.join(d, 'ruim.json'), '{');
  assert.throws(() => readJsonFile(path.join(d, 'ruim.json')));
});

test('aviso do Discord: sem menções, texto escapado e limites', () => {
  assert.strictEqual(mdEsc('@everyone *a*'), '@\u200beveryone \\*a\\*');
  assert.strictEqual(clip('abcdef', 4), 'abc…');
  const r = {
    id: 'a'.repeat(12), at: 0, room: 'S1', style: 'forest', reason: 'abuso', note: '@here',
    by: { name: 'Eu', host: 'h1' }, target: { name: '_x_', host: 'h2' },
    chat: Array.from({ length: 15 }, (_, i) => ({ name: 'n' + i, text: 't', who: i === 14 ? 'alvo' : '' })),
    voice: [{ who: 'alvo', from: 0, to: 4000 }, { who: '', from: 0, to: 9000 }]
  };
  const b = hookBody(r, { abuso: 'Abuso' });
  assert.deepStrictEqual(b.allowed_mentions, { parse: [] });
  assert.strictEqual(b.embeds[0].title, '🚩 Abuso');
  const f = Object.fromEntries(b.embeds[0].fields.map(x => [x.name, x.value]));
  assert.strictEqual(f['Denunciado'], '\\_x\\_ · ID h2');
  assert.strictEqual(f['Observação'], '@\u200bhere');
  assert.ok(f['Chat recente'].startsWith('n5') && f['Chat recente'].endsWith('➡ n14: t'));
  assert.strictEqual(f['Voz do denunciado'], '1 fala(s), 4 s no total nos últimos 10 min');
  const vazio = hookBody({ ...r, note: '', chat: [], voice: [] }, { abuso: 'Abuso' });
  assert.deepStrictEqual(vazio.embeds[0].fields.map(x => x.name), ['Denunciado', 'Denunciante', 'Sala', 'Denúncia']);
});
