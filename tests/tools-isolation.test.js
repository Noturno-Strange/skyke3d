'use strict';

// As ferramentas que sobem um servidor de teste não podem gravar em data/ (ali ficam as identidades, nomes e perfis de verdade).
// Antes, tools/contrast-audit.js e tools/world-shots.js só desligavam RECORDS_FILE e BAN_FILE: cada execução com o navegador
// registrava uma identidade de teste no data/identity.json de quem rodava (e nomes em data/names.json).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const ARQUIVOS = [...new Set([...server.matchAll(/process\.env\.([A-Z]+_FILE)/g)].map(m => m[1]))];

test('o servidor lê os arquivos de estado esperados (se aparecer um novo *_FILE, as ferramentas precisam saber)', () => {
  for (const f of ['BAN_FILE', 'RECORDS_FILE', 'NAMES_FILE', 'CAPACITY_FILE', 'REPORTS_FILE', 'IDENTITY_FILE', 'PETS_FILE', 'COOK_FILE', 'PROFILES_FILE', 'BADGES_FILE'])
    assert.ok(ARQUIVOS.includes(f), f);
});

test('toda ferramenta que sobe o server.js desliga TODOS os arquivos de estado (valor 0 = só memória)', () => {
  const tools = fs.readdirSync(path.join(root, 'tools')).filter(f => f.endsWith('.js'));
  const sobem = tools.filter(f => /spawn\([^)]*server\.js|'server\.js'|"server\.js"/.test(fs.readFileSync(path.join(root, 'tools', f), 'utf8')));
  assert.ok(sobem.length >= 3, 'ferramentas que sobem o servidor: ' + sobem.join(', '));
  for (const f of sobem) {
    const src = fs.readFileSync(path.join(root, 'tools', f), 'utf8');
    for (const v of ARQUIVOS) assert.match(src, new RegExp(v + "\\s*:\\s*'0'"), `tools/${f} precisa de ${v}: '0'`);
  }
});
