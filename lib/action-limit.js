/*
 * Skyke3D — GPL-3.0-only
 * Limites de ações por identidade, compartilhados entre abas e reconexões.
 * Só ações aceitas consomem a janela. Excesso é descartado, nunca fica numa fila.
 */
'use strict';
const { createLimiter } = require('./limits');

/** @param {{rules: Record<string, number[]>, now?: () => number, maxKeys?: number}} o */
function createActionLimit({ rules, now = Date.now, maxKeys = 100000 }) {
  const limits = createLimiter({ maxKeys, maxAgeMs: 120000 });
  let accepted = 0,
    discarded = 0;
  function take(id, action) {
    if (!id || !Object.hasOwn(rules, action)) return true;
    const [min, max, win] = rules[action],
      at = now(),
      key = id + '|' + action,
      gap = key + '|gap';
    if ((min && limits.blocked(gap, 1, min, at)) || limits.blocked(key, max, win, at)) {
      discarded++;
      return false;
    }
    if (min) limits.hit(gap, 1, min, at);
    limits.hit(key, max, win, at);
    accepted++;
    return true;
  }
  return { take, report: () => ({ accepted, discarded, keys: limits.size() }) };
}
module.exports = { createActionLimit };
