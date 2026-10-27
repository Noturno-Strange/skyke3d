/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Configuração TURN/ICE.
 */
'use strict';

const crypto = require('crypto');

function createIceConfig({ TURN_URLS, TURN_SECRET, TURN_USER, TURN_PASS, TURN_HAS_STATIC, TURN_TTL, TURN_LABEL }) {
  const ice = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (TURN_URLS.length && (TURN_SECRET || TURN_HAS_STATIC)) {
    let u = TURN_USER, c = TURN_PASS;
    if (TURN_SECRET) {
      u = String(Math.floor(Date.now() / 1000) + TURN_TTL) + ':' + TURN_LABEL;
      c = crypto.createHmac('sha1', TURN_SECRET).update(u).digest('base64');
    }
    ice.push({ urls: TURN_URLS, username: u, credential: c });
  }
  return { iceServers: ice };
}

module.exports = { createIceConfig };