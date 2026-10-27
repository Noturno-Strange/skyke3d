'use strict';
// Regressão dos modos de voz: núcleo de qualidade, SDP Opus e allowlist da sinalização.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const validate = require('./validate.js');

const html = require('./client-source').readClient();
const start = html.indexOf('// ---------- núcleo dos modos de voz (testável) ----------');
const end = html.indexOf('// ---------- fim do núcleo dos modos de voz ----------');
assert.ok(start >= 0 && end > start, 'núcleo dos modos de voz ausente');
const ctx = vm.createContext({});
const voice = vm.runInContext(
  html.slice(start, end) + '\n({VOICE_MODES,VQ_ORDER,MIC_FX,MIC_FX_KEYS,MIC_FX_DEFAULT,parseMicFx,micFxForMode,micFxMismatch,effectiveVoice,relayFromStats,vadNew,vadStep,VAD,CROWD_PEERS,CROWD_KBPS})',
  ctx
);

test('modos de voz têm os tetos combinados', () => {
  const expected = { eco: 24, padrao: 32, alta: 48, musica: 48, estereo: 96 };
  assert.deepStrictEqual(Object.keys(voice.VOICE_MODES), [...voice.VQ_ORDER]);
  for (const [mode, kbps] of Object.entries(expected)) {
    assert.strictEqual(voice.VOICE_MODES[mode].kbps, kbps, mode);
  }
  assert.strictEqual(voice.VOICE_MODES.estereo.stereo, true);
  assert.strictEqual(voice.VOICE_MODES.musica.music, true);
  assert.strictEqual(voice.VOICE_MODES.alta.dtx, true);
  assert.strictEqual(voice.VOICE_MODES.estereo.dtx, false);
});

test('modo efetivo usa o menor entre emissor e receptor', () => {
  const cases = [
    ['estereo', 'alta', false, 48, false, false],
    ['estereo', 'estereo', false, 96, true, true],
    ['musica', 'padrao', false, 32, false, false],
    ['eco', 'estereo', false, 24, false, false],
    ['estereo', 'alta', true, 24, false, false],
    ['estereo', 'musica', true, 32, false, true],
    ['alta', 'padrao', true, 24, false, false]
  ];
  for (const [local, remote, relay, kbps, stereo, music] of cases) {
    const e = voice.effectiveVoice(local, remote, relay);
    assert.strictEqual(e.kbps, kbps, local + '/' + remote + '/' + relay);
    assert.strictEqual(e.stereo, stereo, local + '/' + remote + '/' + relay);
    assert.strictEqual(e.music, music, local + '/' + remote + '/' + relay);
  }
});

test('modo inválido cai em padrão nos dois lados', () => {
  const e = voice.effectiveVoice('xpto', null, false);
  assert.strictEqual(e.mode, 'padrao');
  assert.strictEqual(e.kbps, 32);
});

test('filtros do microfone: padrão desligado; só liga por escolha e música/estéreo forçam desligado', () => {
  const defaults = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  const allOn = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  assert.deepStrictEqual({ ...voice.MIC_FX_DEFAULT }, defaults);
  assert.deepStrictEqual({ ...voice.parseMicFx(null) }, defaults);
  assert.deepStrictEqual({ ...voice.parseMicFx('{') }, defaults);
  assert.deepStrictEqual({ ...voice.parseMicFx('{"noiseSuppression":true,"x":1}') }, {
    ...defaults,
    noiseSuppression: true
  });
  assert.deepStrictEqual({ ...voice.micFxForMode('padrao', allOn) }, allOn);
  assert.deepStrictEqual({ ...voice.micFxForMode('padrao', voice.parseMicFx(null)) }, defaults);
  for (const q of ['musica', 'estereo']) {
    assert.deepStrictEqual({ ...voice.micFxForMode(q, defaults) }, {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    });
  }
});

test('filtros: detecta quando o dispositivo não honrou o pedido', () => {
  const prefs = voice.parseMicFx('{"echoCancellation":true,"noiseSuppression":true,"autoGainControl":true}');
  assert.deepStrictEqual(
    [...voice.micFxMismatch('padrao', prefs, { echoCancellation: false, noiseSuppression: true, autoGainControl: true })],
    ['echoCancellation']
  );
  assert.deepStrictEqual(
    [...voice.micFxMismatch('padrao', voice.parseMicFx(null), { echoCancellation: true, noiseSuppression: false, autoGainControl: false })],
    ['echoCancellation']
  );
  assert.deepStrictEqual(
    [...voice.micFxMismatch('musica', prefs, { echoCancellation: false, noiseSuppression: false, autoGainControl: true })],
    ['autoGainControl']
  );
  assert.deepStrictEqual([...voice.micFxMismatch('musica', prefs, {})], []);
  assert.deepStrictEqual([...voice.micFxMismatch('musica', prefs, null)], []);
});

test('rota pela seleção ICE detecta relay local ou remoto', () => {
  const mk = (pairs, candidates) => {
    const st = new Map();
    for (const [id, c] of Object.entries(candidates)) st.set(id, { id, type: 'candidate', ...c });
    for (const [id, p] of Object.entries(pairs)) st.set(id, { id, type: 'candidate-pair', ...p });
    return st;
  };
  const direct = mk(
    { p1: { localCandidateId: 'l1', remoteCandidateId: 'r1', nominated: true, state: 'succeeded' } },
    { l1: { candidateType: 'host' }, r1: { candidateType: 'srflx' } }
  );
  assert.strictEqual(voice.relayFromStats(direct), false);
  const localRelay = mk(
    { p1: { localCandidateId: 'l1', remoteCandidateId: 'r1', nominated: true, state: 'succeeded' } },
    { l1: { candidateType: 'relay' }, r1: { candidateType: 'host' } }
  );
  assert.strictEqual(voice.relayFromStats(localRelay), true);
  const remoteRelay = mk(
    { p1: { localCandidateId: 'l1', remoteCandidateId: 'r1', selected: true, state: 'succeeded' } },
    { l1: { candidateType: 'host' }, r1: { candidateType: 'relay' } }
  );
  assert.strictEqual(voice.relayFromStats(remoteRelay), true);
  const selected = mk(
    {
      p1: { localCandidateId: 'l1', remoteCandidateId: 'r1', nominated: true, state: 'succeeded' },
      p2: { localCandidateId: 'l2', remoteCandidateId: 'r2', nominated: true, state: 'succeeded' }
    },
    { l1: { candidateType: 'host' }, r1: { candidateType: 'host' }, l2: { candidateType: 'relay' }, r2: { candidateType: 'host' } }
  );
  selected.set('t1', { id: 't1', type: 'transport', selectedCandidatePairId: 'p2' });
  assert.strictEqual(voice.relayFromStats(selected), true);
  const none = mk({}, {});
  assert.strictEqual(voice.relayFromStats(none), null);
});

test('SDP Opus fica permissivo para o ajuste por setParameters', () => {
  const src = html.slice(
    html.indexOf('function tuneSdp(sdp){'),
    html.indexOf('\nasync function tuneSender(')
  );
  const tuneSdp = vm.runInContext(src + '\ntuneSdp', vm.createContext({}));
  const sdp = [
    'v=0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10;useinbandfec=1;stereo=0;sprop-stereo=0;usedtx=1;maxaveragebitrate=24000',
    'a=rtpmap:63 red/48000/2',
    'a=fmtp:63 111/111'
  ].join('\r\n');
  const out = tuneSdp(sdp);
  const opus = out.split('\r\n').find(l => l.startsWith('a=fmtp:111'));
  for (const kv of ['maxaveragebitrate=96000', 'stereo=1', 'sprop-stereo=1', 'usedtx=0', 'cbr=0']) {
    assert.ok(opus.includes(kv), kv);
  }
  assert.ok(out.includes('a=fmtp:63 111/111'), 'outro codec preservado');
});

test('servidor aceita somente modos conhecidos em vq', () => {
  for (const q of voice.VQ_ORDER) {
    assert.deepStrictEqual(
      validate.normalizeMessage({ t: 'sig', to: 'p1', data: { x: 'vq', q } }),
      { t: 'sig', to: 'p1', data: { x: 'vq', q } }
    );
  }
  assert.strictEqual(
    validate.normalizeMessage({ t: 'sig', to: 'p1', data: { x: 'vq', q: 'xpto' } }),
    null
  );
  assert.deepStrictEqual([...validate.VOICE_Q].sort(), [...voice.VQ_ORDER].sort());
});

test('ajustes têm o seletor e o status da qualidade de voz', () => {
  assert.ok(html.includes('<select id="sVoiceQ">'));
  assert.ok(html.includes('<small id="voiceQMsg"></small>'));
  assert.ok(html.includes("setVoiceQ('musica',true)"), 'fallback de fonte mono');
  assert.ok(html.includes("localTrack.contentHint=VOICE_MODES[voiceQ].music?'music':'speech'"));
  assert.ok(html.includes("d.x==='vq'"), 'recepção de vq no cliente');
});

test('ajustes têm os três filtros de microfone e aplicação ao vivo', () => {
  for (const [id, label] of [
    ['sAec', 'Cancelamento de eco'],
    ['sNs', 'Redução de ruído'],
    ['sAgc', 'Ganho automático']
  ]) {
    assert.ok(html.includes(`<input type="checkbox" id="${id}"> ${label}`), id);
  }
  assert.ok(html.includes('<small id="micFxMsg" aria-live="polite"></small>'));
  assert.ok(html.includes("FX_KEY='skyke3d.micFx'"));
  assert.ok(html.includes('micFxForMode(voiceQ,micFxPrefs)'));
  assert.ok(html.includes('applyConstraints(c)'));
  assert.ok(html.includes('await restartMic()'));
  assert.ok(html.includes('el.disabled=music||!can'));
  assert.ok(html.includes('function micFxCanSet(k,on)'));
  assert.ok(!html.includes('Música/Estéreo desligam os filtros'), 'sem aviso extra no painel');
});

test('seletor de kbps acompanha o tema claro/escuro', () => {
  assert.ok(html.includes(':root[data-theme=light]{color-scheme:light}'));
  assert.ok(html.includes(':root[data-theme=dark]{color-scheme:dark}'));
  assert.ok(/prefers-color-scheme:light\)\{:root:not\(\[data-theme=dark\]\)\{color-scheme:light\}/.test(html));
  assert.ok(html.includes('#pSet select{background-color:var(--bg);color:var(--fg)}'));
  assert.ok(html.includes('#pSet select option{background-color:var(--bg);color:var(--fg)}'));
});

test('muitas conexões limitam só os modos de voz a 24 kbps', () => {
  for (const m of ['padrao', 'alta']) {
    const e = voice.effectiveVoice(m, m, false, true);
    assert.strictEqual(e.kbps, voice.CROWD_KBPS, m);
    assert.strictEqual(e.crowd, true, m);
  }
  assert.strictEqual(voice.effectiveVoice('eco', 'eco', false, true).crowd, false);
  assert.strictEqual(voice.effectiveVoice('musica', 'musica', false, true).kbps, 48);
  assert.strictEqual(voice.effectiveVoice('estereo', 'estereo', false, true).kbps, 96);
  assert.strictEqual(voice.effectiveVoice('alta', 'alta', false, false).kbps, 48);
  assert.strictEqual(voice.effectiveVoice('alta', 'alta', true, true).kbps, 24);
  assert.strictEqual(voice.CROWD_PEERS, 5);
});

test('VAD adaptativo: fala baixa abre, histerese, fecha e ruído constante some', () => {
  const run = (s, rms, secs, dt = 1 / 60) => { for (let i = 0; i < secs / dt; i++) voice.vadStep(s, rms, dt); return s.talk; };
  let s = voice.vadNew();
  assert.strictEqual(voice.vadStep(s, 0.015, 1 / 60), true, 'fala baixa (sem ganho automático) abre');
  assert.strictEqual(run(s, 0.009, 0.2), true, 'entre fechar e abrir, aberto continua aberto');
  assert.strictEqual(run(s, 0.001, 1), false, 'silêncio fecha depois do hold');
  s = voice.vadNew();
  assert.strictEqual(run(s, 0.009, 2), false, 'fechado não abre abaixo do limiar de abertura');
  s = voice.vadNew();
  assert.strictEqual(run(s, 0.01, 30), false, 'ruído de fundo estável não abre');
  s = voice.vadNew();
  assert.strictEqual(voice.vadStep(s, 0.03, 1 / 30), true);
  assert.strictEqual(run(s, 0.03, 60, 1 / 30), false, 'ruído constante alto para de transmitir');
  s = voice.vadNew();
  run(s, 0.2, 10);
  assert.ok(s.floor <= voice.VAD.floorMax, 'piso limitado');
  assert.strictEqual(voice.vadStep(voice.vadNew(), NaN, NaN), false, 'entrada inválida não abre');
});

test('SDP: pacotes de 40 ms e uma só vez, sem duplicar ptime', () => {
  const src = html.slice(html.indexOf('function tuneSdp(sdp){'), html.indexOf('\nasync function tuneSender('));
  const tuneSdp = vm.runInContext(src + '\ntuneSdp', vm.createContext({}));
  const sdp = [
    'v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
    'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1',
    'a=rtpmap:63 red/48000/2', 'a=fmtp:63 111/111', 'a=ptime:20', 'a=maxptime:20'
  ].join('\r\n');
  const out = tuneSdp(sdp).split('\r\n');
  assert.deepStrictEqual(out.filter(l => /^a=ptime:/.test(l)), ['a=ptime:40']);
  assert.deepStrictEqual(out.filter(l => /^a=maxptime:/.test(l)), ['a=maxptime:60']);
  assert.ok(out.find(l => l.startsWith('a=fmtp:111')).includes('useinbandfec=1'), 'FEC embutido preservado');
  const again = tuneSdp(out.join('\r\n')).split('\r\n');
  assert.strictEqual(again.filter(l => /^a=ptime:/.test(l)).length, 1, 'idempotente');
  const noFmtp = tuneSdp(['m=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=rtpmap:111 opus/48000/2'].join('\n')).split('\n');
  assert.ok(noFmtp.includes('a=ptime:40'), 'sem fmtp ainda recebe ptime');
});

test('RED fora da negociação e nova tentativa do teto de bitrate', () => {
  assert.ok(html.includes('function preferNoRed(tr)'));
  assert.ok(html.includes('preferNoRed(p.tr)') && html.includes('preferNoRed(t)'), 'oferta e resposta');
  assert.ok(html.includes('audio\\/red'));
  assert.ok(html.includes('p.tuneTry'), 'nova tentativa quando setParameters falha');
  assert.ok(html.includes('function syncCrowd()'));
});
