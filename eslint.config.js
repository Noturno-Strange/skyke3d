/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Lint (npm run lint) do servidor, dos testes e das ferramentas. Os scripts do jogo (assets/app-*.js) dividem
 * variáveis globais entre si e ficam de fora até virarem módulos ES; tests/client-lint.test.js os confere juntos, na ordem
 * da página (nome indefinido ou declarado duas vezes).
 */
'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['assets/**', 'vendor/**', 'desktop/**', 'pwa/**', 'data/**', 'node_modules/**', 'tools/hair-gallery.html'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // catch (e) {} sem usar o erro é comum aqui (fechar conexão que já caiu, arquivo que não existe)
      'no-unused-vars': ['error', { caughtErrors: 'none', args: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      // os validadores recusam caracteres de controle de propósito
      'no-control-regex': 'off'
    }
  }
];
