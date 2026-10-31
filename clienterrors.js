'use strict';
// Canal de erros do cliente: o navegador manda um relato curto (mensagem, parte da pilha, versão, tela) e o servidor junta os repetidos num só item com contagem.
// Serve para achar problemas (como o "Jogar de novo" que não saía da sala) sem esperar alguém reclamar. Nada pessoal fica guardado: nomes, códigos de sala,
// endereços (query e #), códigos de perfil, tokens e e-mails são tirados do texto antes de guardar. Só se vê pelo painel /status (com token).
const { readJsonFile, writeJsonAtomic } = require('./persist');

const KINDS = new Set(['error', 'promise', 'leave', 'start', 'ws', 'custom']);
const MODES = new Set(['menu', 'play', '']);

// tira o que identifica gente ou sessão (a mesma limpeza roda no cliente e aqui: nunca se confia só no cliente)
function scrub(text, max) {
  let s = typeof text === 'string' ? text : '';
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, ' ')
    .replace(/https?:\/\/[^\s)'"]*/gi, u => { try { return new URL(u).pathname.replace(/\/jogador\/[^/]+/i, '/jogador/_'); } catch (e) { return '_url_'; } })
    .replace(/\/jogador\/[0-9A-Za-z-]{16,24}/gi, '/jogador/_')
    .replace(/[?#][^\s)'"]*/g, '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '_email_')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '_tok_')
    .replace(/\b[A-Z0-9]{5}-?[A-Z0-9]{5}\b/g, '_sala_');
  return s.slice(0, max);
}
// assinatura para juntar o mesmo erro: tipo + início da mensagem + primeira linha da pilha (sem números de coluna instáveis)
const sigOf = (kind, msg, stack) => kind + '|' + msg.slice(0, 100).replace(/\d+/g, '#') + '|' + (stack.split('\n').find(l => /\.js/.test(l)) || '').replace(/:\d+:\d+/, '').trim().slice(0, 80);

function createErrorLog({ file, max = 200, onError = () => {}, now = Date.now, delayMs = 5000 } = {}) {
  const M = new Map(); let dirty = false, timer = null;
  if (file) { try { const j = readJsonFile(file); for (const x of (j && Array.isArray(j.items) ? j.items : []).slice(0, max)) if (x && typeof x.sig === 'string') M.set(x.sig, x); } catch (e) { M.clear(); } }
  const write = () => { if (!file || !dirty) return; dirty = false; try { writeJsonAtomic(file, { v: 1, items: [...M.values()] }); } catch (e) { onError('erros do cliente', e); } };
  const save = () => { dirty = true; if (timer) return; timer = setTimeout(() => { timer = null; write(); }, delayMs); if (timer.unref) timer.unref(); };

  // r: { k, m, s, v, d (modo), u (navegador) } vindo do navegador; devolve false se o formato não presta
  function add(r) {
    if (!r || typeof r !== 'object' || !KINDS.has(r.k)) return false;
    const kind = r.k, msg = scrub(r.m, 300), stack = scrub(r.s, 900);
    if (!msg) return false;
    const mode = MODES.has(r.d) ? r.d : '', ver = typeof r.v === 'string' && /^[\w.+-]{1,20}$/.test(r.v) ? r.v : '?';
    const ua = scrub(r.u, 80).replace(/\([^)]*\)/g, '').trim().slice(0, 60);
    const sig = sigOf(kind, msg, stack), t = Math.floor(now() / 1000);
    let x = M.get(sig);
    if (!x) {
      if (M.size >= max) { let old = null; for (const y of M.values()) if (!old || y.last < old.last) old = y; if (old) M.delete(old.sig); }
      x = { sig, kind, msg, stack, n: 0, first: t, last: t, ver: {}, mode: {}, ua: {} }; M.set(sig, x);
    }
    x.n++; x.last = t; x.ver[ver] = (x.ver[ver] || 0) + 1; x.mode[mode || '-'] = (x.mode[mode || '-'] || 0) + 1; if (ua) x.ua[ua] = (x.ua[ua] || 0) + 1;
    for (const k of ['ver', 'mode', 'ua']) { const ks = Object.keys(x[k]); if (ks.length > 12) delete x[k][ks[0]]; }
    save(); return true;
  }
  const list = () => [...M.values()].sort((a, b) => b.last - a.last);
  const clear = () => { M.clear(); save(); };
  return { add, list, clear, write, get size() { return M.size; } };
}

module.exports = { createErrorLog, scrub, sigOf };
