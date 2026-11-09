'use strict';
// Regressão do perfil único de áudio: qualidade, SDP Opus e allowlist da sinalização.
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const validate = require('../lib/validate.js');

const html = require('./client-source').readClient();
const start = html.indexOf('// ---------- perfil único de áudio (testável) ----------');
const end = html.indexOf('// ---------- fim do núcleo do perfil de áudio ----------');
assert.ok(start >= 0 && end > start, 'núcleo do perfil de áudio ausente');
const ctx = vm.createContext({});
const voice = vm.runInContext(
  html.slice(start, end) +
    '\n({VOICE_PROFILE,effectiveVoice,relayFromStats,rateStep,signalRms,voiceLevel,agcNew,agcApply,VAGC,gateNew,musicGateStep,MUSIC_HOLD,MUSIC_OPEN,CROWD_PEERS,MIC_FX,MIC_FX_DEFAULT,MIC_RAW_TRIM,micRawTrim,parseMicFx,micFxConstraints})',
  ctx
);

test('perfil único: Opus mono 48 kHz, 48 kbps direto, 40 no relay e 32 com muita gente', () => {
  assert.deepStrictEqual(
    { ...voice.VOICE_PROFILE },
    {
      name: 'Voz & Música',
      kbps: 48,
      relayKbps: 40,
      crowdKbps: 32,
      stereo: false,
      music: true,
      dtx: false
    }
  );
  assert.strictEqual(voice.CROWD_PEERS, 5);
  assert.strictEqual(voice.MUSIC_HOLD, 3);
  assert.ok(voice.MUSIC_OPEN > 0 && voice.MUSIC_OPEN < 0.02, 'limiar baixo para música');
});

test('perfil efetivo reduz no relay e com muita gente', () => {
  assert.deepStrictEqual(
    { ...voice.effectiveVoice(false, false) },
    { name: 'Voz & Música', kbps: 48, stereo: false, music: true, dtx: false, relay: false, crowd: false }
  );
  assert.strictEqual(voice.effectiveVoice(true, false).kbps, 40, 'relay');
  assert.strictEqual(voice.effectiveVoice(false, true).kbps, 32, 'muita gente');
  assert.strictEqual(voice.effectiveVoice(true, true).kbps, 32, 'muita gente tem precedência');
  assert.strictEqual(voice.effectiveVoice(true, false).relay, true);
  assert.strictEqual(voice.effectiveVoice(false, true).crowd, true);
  assert.strictEqual(voice.effectiveVoice(true, true).relay, true);
  assert.strictEqual(voice.effectiveVoice(true, true).crowd, true);
});

test('bitrate WSS reduz com fila local e só recupera depois de estabilidade', () => {
  const s = { kbps: 32, lowAt: 0 };
  assert.strictEqual(voice.rateStep(s, 2049, 48, 100), 24);
  assert.strictEqual(voice.rateStep(s, 100, 48, 500), 24);
  assert.strictEqual(voice.rateStep(s, 100, 48, 2600), 48);
  assert.strictEqual(voice.rateStep(s, 3000, 48, 2700), 24);
});

test('microfone pede mono, 48 kHz e os filtros escolhidos', () => {
  assert.deepStrictEqual(
    { ...voice.MIC_FX_DEFAULT },
    { echoCancellation: true, noiseSuppression: false, autoGainControl: false }
  );
  const c = voice.micFxConstraints(voice.MIC_FX_DEFAULT);
  assert.strictEqual(c.channelCount, 1);
  assert.deepStrictEqual({ ...c.sampleRate }, { ideal: 48000 });
  assert.strictEqual(c.echoCancellation, true);
  assert.strictEqual(c.noiseSuppression, false);
  assert.strictEqual(c.autoGainControl, false);
});

test('preferências dos filtros são validadas e aplicadas nas constraints', () => {
  assert.deepStrictEqual({ ...voice.parseMicFx(null) }, { ...voice.MIC_FX_DEFAULT });
  assert.deepStrictEqual(
    { ...voice.parseMicFx('{"noiseSuppression":true,"autoGainControl":"sim","x":1}') },
    { echoCancellation: true, noiseSuppression: true, autoGainControl: false }
  );
  assert.deepStrictEqual({ ...voice.parseMicFx('{quebrado') }, { ...voice.MIC_FX_DEFAULT });
  const c = voice.micFxConstraints({ echoCancellation: false, noiseSuppression: true, autoGainControl: true });
  assert.strictEqual(c.echoCancellation, false);
  assert.strictEqual(c.noiseSuppression, true);
  assert.strictEqual(c.autoGainControl, true);
  assert.strictEqual(voice.micFxConstraints({ noiseSuppression: true }).echoCancellation, true, 'volta ao padrão');
});

test('medidor escala em decibéis e acompanha o ganho aplicado', () => {
  assert.strictEqual(voice.voiceLevel(0), 0);
  assert.strictEqual(voice.voiceLevel(0.18), 1);
  const quiet = new Float32Array(1024).fill(0.003);
  const processed = voice.agcApply(voice.agcNew(), quiet);
  const rms = voice.signalRms(processed);
  assert.ok(rms > 0.02, 'sinal baixo foi elevado pelo nivelador');
  assert.ok(voice.voiceLevel(rms) > 0.45, 'o medidor usa o nível RMS processado');
  assert.strictEqual(voice.signalRms(new Float32Array(0)), 0);
});

test('voz crua: reduz a saída em 10% quando todos os efeitos do microfone estão desligados', () => {
  const raw = Float32Array.of(0.1, -0.2);
  const quiet = voice.micRawTrim(raw, { echoCancellation: false, noiseSuppression: false, autoGainControl: false });
  assert.ok(Math.abs(quiet[0] - 0.09) < 1e-6 && Math.abs(quiet[1] + 0.18) < 1e-6);
  const processed = Float32Array.of(0.1, -0.2);
  const withEffect = voice.micRawTrim(processed, { echoCancellation: true, noiseSuppression: false, autoGainControl: false });
  assert.ok(Math.abs(withEffect[0] - 0.1) < 1e-6 && Math.abs(withEffect[1] + 0.2) < 1e-6, 'preserva o nível quando algum efeito está ligado');
});

test('voz baixa abre o gate e o nivelador compensa microfones com sinal fraco', () => {
  const gate = voice.gateNew();
  assert.strictEqual(voice.musicGateStep(gate, 0.003, 1 / 60), true, 'voz baixa não exige V');
  const agc = voice.agcNew();
  const quiet = new Float32Array(1024).fill(0.003);
  const out = voice.agcApply(agc, quiet);
  assert.ok(Math.sqrt(out.reduce((s, x) => s + x * x, 0) / out.length) > 0.02, 'nivelamento eleva sinal baixo');
  assert.ok(Math.max(...out) < 1, 'limitador mantém margem sem clipping');
});

test('gate musical mantém 3 s de cauda e fecha no silêncio', () => {
  const s = voice.gateNew();
  assert.strictEqual(voice.musicGateStep(s, 0.001, 1 / 60), false, 'silêncio não abre');
  assert.strictEqual(voice.musicGateStep(s, 0.02, 1 / 60), true, 'som abre');
  assert.strictEqual(voice.musicGateStep(s, 0, 2.9), true, 'mantém durante o hold');
  assert.strictEqual(voice.musicGateStep(s, 0, 0.2), false, 'fecha depois de 3 s');
  const t = voice.gateNew();
  voice.musicGateStep(t, 0.02, 1 / 60);
  assert.strictEqual(voice.musicGateStep(t, 0.001, 1), true, 'pausa curta não corta');
  assert.strictEqual(voice.musicGateStep(t, 0.02, 1 / 60), true, 'som reabre e renova o hold');
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

test('SDP Opus pede mono 48 kbps, sem DTX e com FEC', () => {
  const src = html.slice(html.indexOf('function tuneSdp(sdp){'), html.indexOf('\nasync function tuneSender('));
  const tuneSdp = vm.runInContext(src + '\ntuneSdp', vm.createContext({ VOICE_PROFILE: { kbps: 48 } }));
  const sdp = [
    'v=0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;usedtx=1;maxaveragebitrate=96000',
    'a=rtpmap:63 red/48000/2',
    'a=fmtp:63 111/111'
  ].join('\r\n');
  const out = tuneSdp(sdp);
  const opus = out.split('\r\n').find(l => l.startsWith('a=fmtp:111'));
  for (const kv of ['maxaveragebitrate=48000', 'stereo=0', 'sprop-stereo=0', 'usedtx=0', 'cbr=0', 'useinbandfec=1']) {
    assert.ok(opus.includes(kv), kv);
  }
  assert.ok(out.includes('a=fmtp:63 111/111'), 'outro codec preservado');
});

test('servidor continua aceitando vq antigo, mas recusa valor desconhecido', () => {
  for (const q of validate.VOICE_Q) {
    assert.deepStrictEqual(
      validate.normalizeMessage({ t: 'sig', to: 'p1', data: { x: 'vq', q } }),
      { t: 'sig', to: 'p1', data: { x: 'vq', q } }
    );
  }
  assert.strictEqual(
    validate.normalizeMessage({ t: 'sig', to: 'p1', data: { x: 'vq', q: 'xpto' } }),
    null
  );
});

test('ajustes mostram o perfil único, sem seletor de modos nem tráfego vq', () => {
  assert.ok(!html.includes('<select id="sVoiceQ">'), 'seletor de modos removido');
  assert.ok(html.includes('<summary>Voz e microfone</summary>'), 'seção de voz e microfone recolhível nos Ajustes');
  assert.ok(!html.includes('Voz e música'), 'sem o rótulo antigo');
  assert.ok(html.includes('<small id="voiceQMsg" aria-live="polite"></small>'));
  assert.ok(html.includes('Transmissão em mono a '), 'texto informativo direto');
  assert.ok(html.includes('segure V ou 🗣️ enquanto fala'), 'push-to-talk explica como falar');
  assert.ok(html.includes("localTrack.contentHint='music'"));
  assert.ok(!html.includes("d.x==='vq'"), 'cliente novo não recebe vq');
  assert.ok(!html.includes("data:{x:'vq'"), 'cliente novo não envia vq');
});

test('filtros do microfone funcionam, ficam salvos e podem ser trocados ao vivo', () => {
  for (const [id, label] of [
    ['sAec', 'Cancelamento de eco'],
    ['sNs', 'Redução de ruído'],
    ['sAgc', 'Ganho automático']
  ]) {
    assert.ok(html.includes(`<input type="checkbox" id="${id}"> ${label}`), id);
  }
  assert.ok(html.includes('<small id="micFxMsg" aria-live="polite"></small>'));
  assert.ok(html.includes("const FX_KEY='skyke_mic_fx'"), 'preferência persistida');
  assert.ok(html.includes('localStorage.setItem(FX_KEY,JSON.stringify(micFxPrefs))'), 'salva ao trocar');
  assert.ok(html.includes('await localTrack.applyConstraints(want)'), 'aplica ao vivo');
  assert.ok(html.includes('await restartMic()'), 'reinicia se o dispositivo ignorar');
  assert.ok(html.includes('const VAGC={target:.18,min:.5,max:24,open:.0015,up:.05,down:.35'), 'nivelador compensa entrada baixa');
  assert.ok(html.includes('vwsMeterRms=signalRms(f)'), 'medidor lê o sinal de saída real do nivelador');
  assert.ok(html.includes('Sem fone, deixe o cancelamento de eco ligado'), 'aviso de vazamento');
  assert.ok(html.includes('Discord, música'), 'aviso sobre outros aplicativos');
  assert.ok(!html.includes('Indisponível no perfil de música'), 'não desabilita mais por perfil');
});

test('escuta só acontece com o microfone local ligado', () => {
  assert.ok(html.includes('function voiceOn(){return !!(stream&&localTrack)}'));
  assert.ok(html.includes('function applyListen(){'));
  assert.ok(html.includes('au.muted=muted(id)||!voiceOn()'));
  assert.ok(html.includes('applyListen();updateMicFxUI();micTxt'), 'ao ligar o mic, reavalia a escuta');
  assert.ok(html.includes('if(c)try{c.close()}catch(e){}applyListen()'), 'ao desligar, silencia os peers');
  assert.ok(html.includes('você não está ouvindo a sala'), 'aviso visível');
  assert.ok(html.includes('if(!voiceOn())msg='), 'status avisa quando o mic está desligado');
  assert.ok(html.includes('updateMicFxUI();\nupdateVoiceStatus();'), 'status atualizado ao carregar');
});

test('voz indisponível explica que falta TURN no servidor', () => {
  assert.ok(html.includes("c.reason==='turn'"), 'cliente lê o motivo do servidor');
  assert.ok(html.includes('o servidor de voz não está configurado'), 'botão explica o motivo');
  assert.ok(html.includes('use VOICE_PRIVACY=direct'), 'status ensina o teste local');
  assert.ok(
    require('../package.json').scripts['start:direct'].includes('VOICE_PRIVACY=direct'),
    'atalho npm run start:direct'
  );
});

test('seletor de kbps acompanha o tema claro/escuro', () => {
  assert.ok(html.includes(':root[data-theme=light]{color-scheme:light}'));
  assert.ok(html.includes(':root[data-theme=dark]{color-scheme:dark}'));
  assert.ok(/prefers-color-scheme:light\)\{:root:not\(\[data-theme=dark\]\)\{color-scheme:light\}/.test(html));
});

test('SDP: pacotes de 20 ms e uma só vez, sem duplicar ptime', () => {
  const src = html.slice(html.indexOf('function tuneSdp(sdp){'), html.indexOf('\nasync function tuneSender('));
  const tuneSdp = vm.runInContext(src + '\ntuneSdp', vm.createContext({ VOICE_PROFILE: { kbps: 48 } }));
  const sdp = [
    'v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
    'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1',
    'a=rtpmap:63 red/48000/2', 'a=fmtp:63 111/111', 'a=ptime:20', 'a=maxptime:20'
  ].join('\r\n');
  const out = tuneSdp(sdp).split('\r\n');
  assert.deepStrictEqual(out.filter(l => /^a=ptime:/.test(l)), ['a=ptime:20']);
  assert.deepStrictEqual(out.filter(l => /^a=maxptime:/.test(l)), ['a=maxptime:60']);
  assert.ok(out.find(l => l.startsWith('a=fmtp:111')).includes('useinbandfec=1'), 'FEC embutido preservado');
  const again = tuneSdp(out.join('\r\n')).split('\r\n');
  assert.strictEqual(again.filter(l => /^a=ptime:/.test(l)).length, 1, 'idempotente');
  const noFmtp = tuneSdp(['m=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=rtpmap:111 opus/48000/2'].join('\n')).split('\n');
  assert.ok(noFmtp.includes('a=ptime:20'), 'sem fmtp ainda recebe ptime');
});
