/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Apoio aos testes do cliente. O código do jogo vive em `assets/` (CSS e JS
 * separados do HTML), mas os testes de regressão examinam o cliente como um
 * texto só. `readClient()` devolve o `index.html` com cada
 *   <link rel="stylesheet" href="/assets/x.css">   → <style>…</style>
 *   <script src="/assets/x.js"></script>           → <script>…</script>
 * reinserido no lugar, ou seja, o mesmo texto do antigo arquivo único.
 * Scripts de outras origens (como /vendor/three-r186.min.js) não são tocados.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function readClient(dir = __dirname) {
  const asset = name => fs.readFileSync(path.join(dir, 'assets', name), 'utf8');
  return fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
    .replace(/<link rel="stylesheet" href="\/assets\/([A-Za-z0-9][\w.-]*\.css)">/g, (m, n) => '<style>' + asset(n) + '</style>')
    .replace(/<script src="\/assets\/([A-Za-z0-9][\w.-]*\.js)"><\/script>/g, (m, n) => '<script>' + asset(n) + '</script>');
}

module.exports = { readClient };
