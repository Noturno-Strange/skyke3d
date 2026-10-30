'use strict';
// Monta o aviso de denúncia para o Discord. Nenhuma menção (@everyone, @here, cargos) é processada e o texto vai escapado.
const mdEsc = s => String(s).replace(/[\\`*_~|>#\[\]()]/g, '\\$&').replace(/@/g, '@\u200b');
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

function hookBody(r, reasons) {
  const chat = r.chat.slice(-10).map(x => (x.who === 'alvo' ? '➡ ' : '') + mdEsc(x.name) + ': ' + mdEsc(x.text)).join('\n');
  const tv = (r.voice || []).filter(x => x.who === 'alvo');
  const vs = tv.length ? tv.length + ' fala(s), ' + Math.round(tv.reduce((n, x) => n + (x.to - x.from), 0) / 1000) + ' s no total nos últimos 10 min' : '';
  return {
    username: 'Skyke3D · Denúncias', allowed_mentions: { parse: [] },
    embeds: [{
      title: clip('🚩 ' + reasons[r.reason], 250), color: 0xff5a5a, timestamp: new Date(r.at).toISOString(),
      fields: [
        { name: 'Denunciado', value: clip(mdEsc(r.target.name) + ' · ID ' + r.target.host, 1000), inline: true },
        { name: 'Denunciante', value: clip(mdEsc(r.by.name) + ' · ID ' + r.by.host, 1000), inline: true },
        { name: 'Sala', value: r.room + ' · ' + r.style, inline: true },
        ...(r.note ? [{ name: 'Observação', value: clip(mdEsc(r.note), 1000) }] : []),
        ...(chat ? [{ name: 'Chat recente', value: clip(chat, 1000) }] : []),
        ...(vs ? [{ name: 'Voz do denunciado', value: vs }] : []),
        { name: 'Denúncia', value: r.id }],
      footer: { text: 'Para punir: painel /status → Moderação → Denúncias' }
    }]
  };
}

module.exports = { hookBody, mdEsc, clip };
