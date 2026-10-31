'use strict';
// Canal de erros do cliente: limpeza de dados pessoais, junção dos repetidos, limites, painel do administrador e o lado do navegador.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createErrorLog, scrub } = require('../clienterrors');
const H = require('../harness.js');

const rel = (o = {}) => ({ k: 'error', m: 'x is not a function', s: 'TypeError\n    at f (/assets/app-surv.js:10:5)', v: '2.5.0', d: 'surv', u: 'Mozilla/5.0 Chrome/120', ...o });

test('limpeza: some endereço com query, código de perfil, sala, token, e-mail e caractere de controle', () => {
  const t = scrub('falhou em https://skyke.example/jogador/ABCD-EFGH-JKMN-PQRS?x=1#y e /jogador/ABCDEFGHJKMNPQRS, sala G3JLV-ARFWW, token ' + 'a'.repeat(43) + ', ana@mail.com \u0007fim', 500);
  for (const x of ['ABCD', 'x=1', '#y', 'G3JLV', 'a'.repeat(30), 'ana@mail.com', '\u0007']) assert.ok(!t.includes(x), 'ainda tem ' + x);
  assert.match(t, /\/jogador\/_/); assert.match(t, /_sala_/); assert.match(t, /_tok_/); assert.match(t, /_email_/);
  assert.strictEqual(scrub(undefined, 10), ''); assert.strictEqual(scrub('abc '.repeat(20), 10).length, 10);
});

test('registro: repetidos viram um item com contagem, versão e tela; tipo inválido e vazio são recusados', () => {
  const L = createErrorLog({ now: () => 1000000 });
  assert.strictEqual(L.add(rel()), true); assert.strictEqual(L.add(rel({ s: 'TypeError\n    at f (/assets/app-surv.js:99:7)', v: '2.6.0', d: 'play' })), true);
  assert.strictEqual(L.size, 1, 'mesmo erro (a coluna e a linha mudam)'); const x = L.list()[0];
  assert.strictEqual(x.n, 2); assert.deepStrictEqual(Object.keys(x.ver).sort(), ['2.5.0', '2.6.0']); assert.deepStrictEqual(x.mode, { surv: 1, play: 1 });
  assert.strictEqual(L.add(rel({ m: 'outro erro' })), true); assert.strictEqual(L.size, 2);
  for (const ruim of [null, 'texto', { k: 'xpto', m: 'a' }, rel({ m: '' }), rel({ m: 5 })]) assert.strictEqual(L.add(ruim), false);
  assert.strictEqual(createErrorLog({}).add(rel({ v: '<script>' })), true, 'versão estranha vira ?');
});

test('limite: guarda no máximo `max` tipos, tirando o mais antigo; grava e recarrega', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-ce-')), 'e.json'); let t = 1000;
  const L = createErrorLog({ file: f, max: 3, now: () => (t += 1000) });
  for (let i = 0; i < 5; i++) L.add(rel({ m: 'erro tipo ' + 'abcde'[i] }));
  assert.strictEqual(L.size, 3); assert.deepStrictEqual(L.list().map(x => x.msg), ['erro tipo e', 'erro tipo d', 'erro tipo c']);
  L.write(); assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
  assert.strictEqual(createErrorLog({ file: f }).size, 3); fs.writeFileSync(f, '{x'); assert.strictEqual(createErrorLog({ file: f }).size, 0, 'arquivo inválido: começa vazio');
});

const TOKEN = 'token-do-painel-com-16+';
test('servidor: relato entra, sai limpo no painel, tem limite por IP, exige token para ler e pode ser desligado', { skip: H.missing() }, async t => {
  const srv = await H.startServer({ STATUS_TOKEN: TOKEN }); t.after(() => srv.stop());
  const post = b => H.request(srv.port, '/erro', { method: 'POST', body: b });
  assert.strictEqual((await post(rel({ m: 'falha em https://x/y?token=abc na sala G3JLV-ARFWW' }))).status, 200);
  assert.strictEqual((await H.request(srv.port, '/erro', { method: 'POST', body: '{nao json', headers: { 'content-type': 'text/plain' } })).status, 400);
  assert.strictEqual((await H.request(srv.port, '/erro')).status, 405);
  assert.strictEqual((await H.request(srv.port, '/status/erros.json')).status, 401, 'sem token não lê');
  const l = await H.request(srv.port, '/status/erros.json', { headers: { authorization: 'Bearer ' + TOKEN } });
  assert.strictEqual(l.status, 200); assert.strictEqual(l.json.items.length, 1); assert.ok(!/token=abc|G3JLV/.test(l.json.items[0].msg), 'o painel só vê o texto limpo');
  let bloqueou = false; for (let i = 0; i < 14; i++) if ((await post(rel({ m: 'rajada ' + i }))).status === 429) bloqueou = true;
  assert.ok(bloqueou, 'passou de 10 por minuto: 429');
  const lim = await H.request(srv.port, '/status/erros-limpar', { method: 'POST', body: {}, headers: { authorization: 'Bearer ' + TOKEN } }); assert.strictEqual(lim.status, 200);
  assert.strictEqual((await H.request(srv.port, '/status/erros.json', { headers: { authorization: 'Bearer ' + TOKEN } })).json.items.length, 0);
  const off = await H.startServer({ CLIENT_ERRORS: '0' }); t.after(() => off.stop());
  assert.strictEqual((await H.request(off.port, '/erro', { method: 'POST', body: rel() })).status, 404, 'desligado');
});

test('navegador: relata no máximo 8, sem repetir, com a pilha sem endereço e sem dados pessoais; erros de fora do site são ignorados', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets/app-base.js'), 'utf8');
  const bloco = src.slice(src.indexOf('const BUG='), src.indexOf("addEventListener('unhandledrejection'") + 200);
  const enviados = [], ouvintes = {};
  const box = { fetch: (u, o) => { enviados.push({ ...JSON.parse(o.body), url: u }); return Promise.resolve(); }, document: { body: { classList: { contains: () => true } } }, navigator: { userAgent: 'Mozilla Chrome/120' },
    location: { origin: 'https://skyke.example' }, mode: 'play', addEventListener: (n, f) => { ouvintes[n] = f; }, String, JSON, Set };
  vm.createContext(box); vm.runInContext(bloco + '\nthis.__r=reportBug;', box);
  box.__r('custom', 'falha em /jogador/ABC?x=1'); box.__r('custom', 'falha em /jogador/ABC?x=1');
  assert.strictEqual(enviados.length, 1, 'não repete'); assert.strictEqual(enviados[0].url, '/erro'); assert.strictEqual(enviados[0].d, 'surv'); assert.ok(!enviados[0].m.includes('x=1'));
  box.__r('error', 'erro', 'Error\n at https://skyke.example/assets/app-ui.js:3:4'); assert.ok(!enviados[1].s.includes('https://'), 'pilha sem o endereço do site');
  for (let i = 0; i < 20; i++) box.__r('custom', 'outro ' + i); assert.strictEqual(enviados.length, 8, 'no máximo 8 por visita');
  ouvintes.error({ message: 'de extensão', filename: 'chrome-extension://abc/x.js', lineno: 1 }); assert.strictEqual(enviados.length, 8);
});
