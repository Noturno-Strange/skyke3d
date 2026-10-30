'use strict';
// Página de privacidade e termos: servida em /privacidade e /termos, com responsável e contato do ambiente (escapados) e cabeçalhos de segurança.
const test = require('node:test');
const assert = require('node:assert');
const H = require('../harness.js');

test('privacidade: responsável e contato vêm do ambiente, escapados; a página descreve o que o jogo faz', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ PRIVACY_CONTROLLER: 'Fulana <b>de Tal</b>', PRIVACY_EMAIL: 'contato@exemplo.com' });
  t.after(() => srv.stop());
  for (const p of ['/privacidade', '/termos']) {
    const r = await H.request(srv.port, p);
    assert.strictEqual(r.status, 200, p);
    assert.match(r.headers['content-type'], /text\/html/);
    assert.ok(r.headers['content-security-policy'], 'mesma CSP do jogo');
    const h = r.body.toString('utf8');
    assert.ok(h.includes('Fulana &lt;b&gt;de Tal&lt;/b&gt;') && !h.includes('<b>de Tal</b>'), 'nome escapado');
    assert.ok(h.includes('contato@exemplo.com'));
    assert.ok(!h.includes('{{'), 'sem marcadores sobrando');
    for (const k of ['não é guardado', 'não é gravada', 'últimas 30 mensagens', '30 dias', 'YouTube', 'Discord', '18 anos', 'art. 18', 'Termos de Uso', 'Regras de convivência', 'Fim do documento', 'id="doc"'])
      assert.ok(h.includes(k), k);
  }
  assert.strictEqual((await H.request(srv.port, '/privacidade', { method: 'HEAD' })).body.length, 0);
});

test('privacidade sem responsável configurado: a página avisa e o servidor alerta no log', { skip: H.missing() }, async t => {
  const srv = await H.startServer({});
  t.after(() => srv.stop());
  assert.match(srv.log(), /PRIVACY_CONTROLLER/);
  const h = (await H.request(srv.port, '/privacidade')).body.toString('utf8');
  assert.ok(h.includes('[responsável ainda não informado]') && h.includes('[contato ainda não informado]'));
});
