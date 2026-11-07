'use strict';
// Os scripts do jogo (assets/*.js do index.html) são scripts comuns que dividem o escopo global, por isso ficam fora do npm run lint.
// Aqui eles são juntados na ordem em que a página os carrega e conferidos como um só: nome usado sem ter sido definido em nenhum
// arquivo (ReferenceError na hora em que aquela linha roda) e o mesmo nome declarado em dois arquivos (um sobrescreve o outro, ou a
// página nem carrega). Pega, por exemplo, uma lista nova do catálogo que não entrou no `const {…}=SKYCAT` do app-base.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { Linter } = require('eslint');
const globals = require('globals');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="\/assets\/([a-z0-9-]+)\.js"><\/script>/g)].map(m => m[1]);

test('scripts do jogo juntos: nenhum nome indefinido nem declarado duas vezes', () => {
  assert.ok(files.length >= 20 && files.includes('app-base') && files.includes('app-net'), 'leu a lista de scripts do index.html');
  let code = '';
  const starts = [];
  for (const f of files) {
    starts.push([code.split('\n').length, f]);
    code += fs.readFileSync(path.join(ROOT, 'assets', f + '.js'), 'utf8') + '\n';
  }
  const where = line => {
    let r = starts[0];
    for (const s of starts) if (s[0] <= line) r = s;
    return 'assets/' + r[1] + '.js:' + (line - r[0] + 1);
  };
  // o que um arquivo publica de propósito (window.X= ou root.X= nos que também rodam no Node) vale como global para os outros
  const pub = Object.fromEntries([...code.matchAll(/\b(?:window|root)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map(m => [m[1], 'readonly']));
  assert.ok(pub.SKYCAT && pub.SKYID, 'achou o que os arquivos publicam');
  const msgs = new Linter().verify(code, [
    {
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script',
        // THREE vem do vendor/; YT é a API do YouTube, carregada só com consentimento; module/require só nos arquivos que também
        // rodam no Node (catalog, lofi, recovery), sempre atrás de typeof
        globals: { ...globals.browser, ...pub, THREE: 'readonly', YT: 'readonly', module: 'readonly', require: 'readonly' }
      },
      rules: { 'no-undef': 'error', 'no-redeclare': 'error' }
    }
  ]);
  const out = msgs.map(m => (m.fatal ? 'não compila: ' : '') + where(m.line) + ' ' + m.message);
  assert.deepStrictEqual(out, []);
});
