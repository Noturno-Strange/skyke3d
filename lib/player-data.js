'use strict';
// Dados privados da conta. Nunca entram nas respostas HTTP do perfil público.
const { readJsonFile, writeJsonAtomic } = require('./persist');
const { cleanCfgOut, cleanText } = require('./pubprofile');
const { ID_RE } = require('./ids');

function createPlayerData({ file = '', max = 20000, delayMs = 1000, onError = (_where, _error) => {} } = {}) {
  const players = new Map();
  let timer = null;
  let dirty = false;
  function clean(r) {
    if (!r || typeof r !== 'object') return null;
    return {
      name: cleanText(r.name, 16),
      cfg: cleanCfgOut(r.cfg),
      friendNames: Object.fromEntries(
        Object.entries(r.friendNames || {})
          .filter(([id]) => ID_RE.test(id))
          .slice(0, 100)
          .map(([id, name]) => [id, cleanText(name, 16)])
      ),
      friends: Array.isArray(r.friends)
        ? [...new Set(r.friends.filter(id => typeof id === 'string' && ID_RE.test(id)))].slice(0, 100)
        : null
    };
  }
  try {
    const data = file ? readJsonFile(file) : null;
    if (data && data.v === 1 && data.p)
      for (const [id, r] of Object.entries(data.p)) {
        if (players.size >= max) break;
        const value = ID_RE.test(id) && clean(r);
        if (value) players.set(id, value);
      }
  } catch (e) {
    onError('dados dos jogadores', e);
  }
  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!dirty || !file) return;
    try {
      writeJsonAtomic(file, { v: 1, p: Object.fromEntries(players) });
      dirty = false;
    } catch (e) {
      onError('dados dos jogadores', e);
    }
  }
  function update(id, patch) {
    if (!ID_RE.test(id) || (!players.has(id) && players.size >= max)) return false;
    const value = clean({ ...players.get(id), ...patch });
    if (!value) return false;
    players.set(id, value);
    dirty = true;
    if (file && !timer) {
      timer = setTimeout(flush, delayMs);
      timer.unref();
    }
    return true;
  }
  return {
    get: id => (players.has(id) ? structuredClone(players.get(id)) : null),
    update,
    flush
  };
}
module.exports = { createPlayerData };
