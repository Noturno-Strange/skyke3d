/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Apoio aos testes que examinam o código do servidor como texto. `serverSource()` junta `server.js` e `lib/*.js`
 * (o código pode mudar de arquivo sem quebrar o teste) e `hasCode()` compara sem espaços, quebras de linha e ";",
 * para o teste não depender da formatação (npm run format).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function serverSource() {
  const lib = path.join(ROOT, 'lib');
  const files = fs.readdirSync(lib).filter(f => f.endsWith('.js')).sort().map(f => path.join(lib, f));
  return [path.join(ROOT, 'server.js'), ...files].map(f => fs.readFileSync(f, 'utf8')).join('\n');
}

const squash = s => s.replace(/[\s;]+/g, '');
const hasCode = (src, snippet) => squash(src).includes(squash(snippet));

module.exports = { serverSource, hasCode, squash };
