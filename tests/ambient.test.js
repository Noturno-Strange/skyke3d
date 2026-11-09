'use strict';

// Som ambiente: só bichos de vez em quando, com silêncio entre eles. Nenhum ruído contínuo (água, vento, folhagem, poeira e insetos
// soavam como mar ou chiado de rádio) e nenhum tom puro agudo que soe como apito (grilos e sinos de seno foram retirados).
// Realismo: cada chamado vem de um ponto sorteado (distância, ar e eco da mata, lado no estéreo), assobios com envelope liso e vozes
// de bicho por formantes; cada mundo tem aves do seu bioma.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../assets/catalog.js');
const sound = fs.readFileSync(path.join(__dirname, '..', 'assets/app-sound.js'), 'utf8');
const codigo = sound.replace(/\/\/[^\n]*/g, '');
const amb = eval('(' + sound.match(/const AMB=(\{[^\n]*\});/)[1] + ')');

test('ambiente: todo mundo tem bichos conhecidos, sem grilos nem sinos', () => {
  const conhecidas = new Set(['bubbles', 'croak', 'frogs', 'hoot', 'tap', 'goat', 'moo', 'birds', 'arara', 'seriema', 'sabia', 'rolinha', 'bemtevi', 'queroquero']);
  for (const id of Object.keys(C.ST)) {
    assert.ok(Array.isArray(amb[id]) && amb[id].length, `mundo ${id} sem ambiente`);
    for (const k of amb[id]) assert.ok(conhecidas.has(k), `${id}: camada ${k}`);
  }
  assert.ok(!/crickets|chime/.test(codigo), 'o código dos grilos e dos sinos saiu');
});

test('ambiente: nenhum ruído contínuo (som de mar ou chiado de rádio), nem no ambiente nem na música', () => {
  const ambSet = sound.match(/function ambSet\(k\)\{[^\n]*\n[^\n]*/)[0];
  assert.ok(!/nsrc\(|kind===|lfo\(/.test(ambSet), 'o ambiente não cria camadas contínuas');
  const usadas = new Set(Object.values(amb).flat());
  for (const k of ['water', 'wind', 'leaves', 'dust', 'insects', 'windcold', 'rumble', 'drone', 'surf', 'hum', 'spores', 'crackle', 'creak', 'swell'])
    assert.ok(!usadas.has(k) && !codigo.includes("kind==='" + k + "'"), 'camada contínua saiu: ' + k);
  assert.ok(!/AM\.bug|AM\.wind|'gust'/.test(codigo), 'restos das camadas contínuas saíram');
  // ruído em laço só existe na chuva, que vem e vai
  const resto = codigo.replace(/function nsrc\(/, '').replace(/function rainSnd\(w\)\{[\s\S]*?\nfunction ambStop/, '');
  assert.ok(!resto.includes('nsrc('), 'ruído contínuo fora da chuva');
  assert.ok(!/MUS\.bed|estalos de vinil|crackle/.test(sound), 'a música não tem chiado nem estalos de vinil');
});

test('ambiente: pássaros em todo mundo, em sílabas curtas e agudas com pausa (o único tom agudo do ambiente)', () => {
  for (const id of Object.keys(C.ST)) assert.ok(amb[id].includes('birds'), id + ' sem pássaros');
  const b = sound.match(/AM\.bird=\[0,0,0\]\.map\([^\n]*/)[0];
  assert.match(b, /f:2200\+R\(\)\*2200/, 'altura do canto entre 2,2 e 4,4 kHz');
  assert.match(b, /d:\.015\+R\(\)\*\.05/, 'sílabas de 15 a 65 ms');
  assert.match(sound, /birds:\[2500,9000\]/, 'frases espaçadas');
});

test('ambiente: cada mundo tem um conjunto próprio de bichos, e todo bicho tem som no código', () => {
  const conjuntos = Object.values(amb).map(l => [...l].sort().join('+'));
  assert.strictEqual(new Set(conjuntos).size, conjuntos.length, 'dois mundos com o mesmo ambiente');
  for (const k of new Set(Object.values(amb).flat())) {
    assert.ok(new RegExp('\\n ' + k + ':\\(t,R\\)=>').test(sound), `bicho ${k} sem som`);
    assert.ok(new RegExp('[{,\\s]' + k + ':\\[\\d+,\\d+\\]').test(sound), `bicho ${k} sem intervalo`);
  }
  // todo chamado sai pelo lugar sorteado, que termina no ganho calibrado do mundo
  assert.match(sound, /amSpot\(a,\.25\+\.75\*R\(\)\);AMB_CALL\[k\]\(t,R\)/);
  assert.match(sound, /function amSpot\(a,d\)\{[^\n]*\n[^\n]*p\.connect\(AM\.g\)\}else lp\.connect\(AM\.g\)/, 'os bichos passam pelo volume calibrado do mundo');
});

test('ambiente: perereca e pica-pau são ruído (nunca oscilador); a chuva corta o grave e não repete o mesmo trecho', () => {
  for (const k of ['frogs', 'tap']) {
    const l = sound.match(new RegExp('\\n ' + k + ':\\(t,R\\)=>[^\\n]*'))[0];
    assert.ok(l.includes('burst(') && !/tone\(|vox\(|amTone\(|amVox\(/i.test(l), k + ' só com ruído');
  }
  assert.match(sound, /function nsrc\([^)]*\)\{[^\n]*s\.buffer=longBuf\(\)[^\n]*s\.start\(0,Math\.random\(\)\*/, 'cada faixa começa num ponto sorteado do ruído longo');
  const rain = sound.match(/function rainSnd\(w\)\{([^\n]*\n){1,8}/)[0];
  const hp = rain.match(/hp\.type='highpass';hp\.frequency\.value=(\d+)/);
  assert.ok(hp && +hp[1] >= 120, 'a chuva corta o grave (chuva de verdade quase não tem nada abaixo de 150 Hz)');
});

test('ambiente realista: distância, ar e eco da mata, estéreo e envelopes lisos; nada em laço nos chamados', () => {
  const spot = sound.match(/function amSpot\(a,d\)\{[^\n]*\n[^\n]*\n[^\n]*/)[0];
  assert.match(spot, /g\.gain\.value=1-\.5\*d/, 'longe é mais baixo');
  assert.match(spot, /lp\.type='lowpass';lp\.frequency\.value=13000-9500\*d/, 'longe é mais abafado (o ar come os agudos)');
  assert.match(spot, /createStereoPanner/, 'lado no estéreo');
  assert.match(spot, /s\.connect\(AM\.rv\)/, 'eco da mata');
  // o eco da mata passa pelo ganho do mundo (o controle de volume do ambiente vale para ele)
  assert.match(sound, /cv\.connect\(g\);AM\.rv=cv/);
  assert.match(sound, /function amEnv\([^)]*\)\{[^\n]*setValueCurveAtTime/, 'envelope liso nos assobios e vozes');
  const calls = sound.slice(sound.indexOf('const AMB_CALL='), sound.indexOf('function ambTick('));
  assert.ok(calls.length > 2000, 'leu os chamados');
  assert.ok(!/loop=true|nsrc\(|lfo\(|setInterval/.test(calls), 'nenhum chamado fica tocando sem parar');
  // as aves do bioma estão no mundo certo
  const bioma = { amazora: 'arara', cerron: 'seriema', atlanthia: 'sabia', caatara: 'rolinha', panthara: 'bemtevi', pamphora: 'queroquero' };
  for (const [w, k] of Object.entries(bioma)) assert.ok(amb[w].includes(k), w + ' sem ' + k);
  // volume de cada bicho calibrado (todo bicho com valor) e aplicado antes do chamado
  const lv = eval('(' + sound.match(/const AMB_LV=(\{[^\n]*\});/)[1] + ')');
  for (const k of new Set(Object.values(amb).flat())) assert.ok(lv[k] > 0 && lv[k] <= 2, k + ' sem volume');
  assert.match(sound, /SV=AMB_LV\[k\]\|\|1;amSpot/);
});

test('a chuva continua a mesma (a melhoria é só nos bichos)', () => {
  const rain = sound.match(/function rainSnd\(w\)\{[\s\S]*?\n(?=function ambStop)/)[0];
  assert.match(rain, /\['bandpass',900,\.5,\.09,\.023,\.03\],\['bandpass',2600,\.6,\.05,\.031,\.025\],\['highpass',6000,0,\.035,\.017,\.018\]/);
  assert.match(sound, /TRIM=\{rain:0\.53,/);
});
