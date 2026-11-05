/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Sons sintetizados: música da tela inicial e efeitos do jogo.
 * Os arquivos assets/app-*.js são scripts comuns carregados em ordem pelo index.html e dividem o mesmo escopo global: o que um
 * declara no nível de cima, os seguintes enxergam. Código que roda ao carregar só pode usar o que já veio antes.
 *
 * Identidade sonora (exploração espacial e colônia): avisos e interface soam como painéis de bordo, "pings" de vidro (seno com
 * um harmônico leve) na escala pentatônica de Dó, a mesma da música; ações do corpo são de traje espacial (baque grave + sopro
 * de ar); passos mudam com o chão do mundo; o ambiente é sempre grave e sem tons puros agudos. Tudo passa por uma cadeia única:
 * limitador suave e uma reverb curta compartilhada, para os sons parecerem do mesmo lugar. O volume de cada som é calibrado
 * pela tabela TRIM; `node tools/audio-audit.js` mede todos e aponta quem saiu do alvo.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
// ---------- sons (sintetizados) ----------
let SV=1,SB='sfxG';const VOLS={sfxG:['skyke_sfx',.8],bgG:['skyke_amb',.7]};// dois canais: efeitos sonoros (tudo que reage a ações e avisos) e som ambiente (fundo de cada mundo)
for(const k in VOLS){try{const v=parseFloat(localStorage.getItem(VOLS[k][0]));if(v>=0&&v<=1)VOLS[k][1]=v}catch(e){}}
let NBUF=null;const noiseBuf=()=>{if(!NBUF){const a=AC(),n=a.sampleRate*3,b=a.createBuffer(1,n,a.sampleRate),x=b.getChannelData(0);for(let i=0;i<n;i++)x[i]=Math.random()*2-1;NBUF=b}return NBUF};// um ruído só, reaproveitado por todos os sons
// limitador suave: reto até 0,6 e curva macia até 0,95, para vários sons juntos não estourarem
const LIM=(()=>{const c=new Float32Array(2049);for(let i=0;i<2049;i++){const x=i/1024-1,m=Math.abs(x);c[i]=Math.sign(x)*(m<.6?m:.6+.35*Math.tanh((m-.6)/.35))}return c})();
// reverb curta (1,1 s) gerada uma vez: ruído que decai e escurece, em estéreo
function irBuf(a){const n=a.sampleRate*1.1|0,b=a.createBuffer(2,n,a.sampleRate);for(let c=0;c<2;c++){const x=b.getChannelData(c);let y=0;for(let i=0;i<n;i++){y+=((Math.random()*2-1)-y)*(.55-.4*i/n);x[i]=y*Math.pow(1-i/n,3.2)*.9}}return b}
let ac=null;const AC=()=>{if(!ac){ac=new(window.AudioContext||window.webkitAudioContext)();
 const m=ac.master=ac.createWaveShaper();m.curve=LIM;m.connect(ac.destination);
 const cv=ac.createConvolver(),rv=ac.rvb=ac.createGain();cv.buffer=irBuf(ac);rv.connect(cv);cv.connect(m);// rvb: entrada da reverb
 for(const k in VOLS){const g=ac[k]=ac.createGain();g.gain.value=VOLS[k][1];g.connect(m)}
 const s=ac.createGain();s.gain.value=.22;ac.sfxG.connect(s);s.connect(rv)}// só os efeitos vão para a reverb; o ambiente fica seco
 if(ac.state==='suspended')ac.resume();return ac};
// oscilador com ataque curto e queda exponencial; at = tempo de subida (padrão 8 ms)
function tone(type,f0,f1,t0,d,v,at){const a=AC(),o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(f0,t0);if(f1!==f0)o.frequency.exponentialRampToValueAtTime(f1,t0+d);g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(v*SV,t0+Math.min(at||.008,d*.5));g.gain.exponentialRampToValueAtTime(.001,t0+d);o.connect(g);g.connect(a[SB]);o.start(t0);o.stop(t0+d+.02)}
// ruído filtrado; o = {ty: tipo do filtro (bandpass), at: subida, f1: frequência final da varredura}
function burst(t0,d,f,v,q,o){o=o||{};const a=AC(),s=a.createBufferSource(),fl=a.createBiquadFilter(),g=a.createGain();s.buffer=noiseBuf();fl.type=o.ty||'bandpass';fl.frequency.setValueAtTime(f,t0);if(o.f1)fl.frequency.exponentialRampToValueAtTime(o.f1,t0+d);fl.Q.value=q||1;g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(v*SV,t0+Math.min(o.at||.004,d*.5));g.gain.exponentialRampToValueAtTime(.001,t0+d);s.connect(fl);fl.connect(g);g.connect(a[SB]);s.start(t0,Math.random()*Math.max(0,2.9-d),d+.02)}
// "ping" de painel: seno com um harmônico leve uma oitava acima
function ping(f,t0,d,v){tone('sine',f,f,t0,d,v,.006);tone('sine',f*2,f*2,t0,d*.45,v*.2,.006)}
// voz sintética (serra filtrada) com vibrato opcional: gritos, risadas, lamentos
function vox(f0,f1,t0,d,v,lp,vib){const a=AC(),o=a.createOscillator(),fl=a.createBiquadFilter(),g=a.createGain();o.type='sawtooth';o.frequency.setValueAtTime(f0,t0);o.frequency.exponentialRampToValueAtTime(f1,t0+d);fl.type='lowpass';fl.frequency.value=lp||1600;fl.Q.value=2;g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(v*SV,t0+Math.min(.03,d*.3));g.gain.exponentialRampToValueAtTime(.001,t0+d);
 if(vib){const l=a.createOscillator(),lg=a.createGain();l.frequency.value=vib;lg.gain.value=f0*.025;l.connect(lg);lg.connect(o.frequency);l.start(t0);l.stop(t0+d+.02)}
 o.connect(fl);fl.connect(g);g.connect(a[SB]);o.start(t0);o.stop(t0+d+.02)}
// atalhos com tempo relativo ao início do som (t): T tom, B ruído, P ping, X voz; dl = atraso
const sfxKit=t=>({T:(ty,f0,f1,d,v,dl)=>tone(ty,f0,f1,t+(dl||0),d,v),B:(d,f,v,q,dl,o)=>burst(t+(dl||0),d,f,v,q,o),P:(f,d,v,dl)=>ping(f,t+(dl||0),d,v),X:(f0,f1,d,v,lp,vib,dl)=>vox(f0,f1,t+(dl||0),d,v,lp,vib)});
// ganho de calibração de cada som (medido por tools/audio-audit.js): iguala o volume dentro de cada categoria
const TRIM={eat:1.61,drink:0.99,notif:1.79,scream:1.12,fart:0.91,join:2,leave:1.54,chat:2.74,click:4.34,confirm:2.19,sit:1.24,stand:3.04,jump:3.51,land:1.4,step_sand:1.58,step_snow:2.02,step_grass:2.03,step_water:2.03,step_rock:1.68,step_metal:1.91,e_laugh:2.5,e_love:1.54,e_party:2.13,e_clap:3.9,e_fire:2.66,e_sparkle:4.49,e_sad:2.14,e_angry:1.87,e_wow:2.14,e_sleep:2.71,e_pop:3.96,g_whoosh:2.66,g_dance:1.38,n_video:2.32,n_dj:1.25,n_karaoke:2.32};
function sfx(k,vm){SV=(vm==null?1:vm)*(TRIM[k]||1);SB='sfxG';try{const a=AC(),t=a.currentTime,{T,B,P,X}=sfxKit(t),R=Math.random;
 if(k==='eat')for(let i=0;i<6;i++){const d=i*.25+R()*.03,g=1-i*.1;
  for(let c=0;c<5;c++)B(.012+R()*.018,2600+R()*3800,.34*g,1.8,d+c*.007+R()*.008);// estalos pequenos
  B(.085,1100+R()*700,.34*g,1.1,d);// corpo da mordida
  T('sine',170+R()*40,80,.09,.2*g,d)}
 else if(k==='drink')for(let i=0;i<3;i++){const d=i*.38;T('sine',300,140,.18,.3,d);B(.12,500,.1,2,d,{ty:'lowpass'});T('sine',420+R()*80,780,.08,.1,d+.19)}// três goles
 else if(k==='notif'){B(.025,4000,.08,.8,0,{ty:'highpass'});P(784,.22,.13);P(1047,.44,.12,.12);T('sine',392,392,.5,.05,0)}// transmissão recebida
 else if(k==='scream'){X(500,1050,.7,.2,2000,6);X(1050,620,.8,.2,2000,6,.7);B(1.4,2200,.12,.7)}
 else if(k==='fart'){const o=a.createOscillator(),g=a.createGain(),l=a.createOscillator(),lg=a.createGain(),fl=a.createBiquadFilter();o.type='sawtooth';o.frequency.setValueAtTime(95,t);o.frequency.exponentialRampToValueAtTime(48,t+.75);fl.type='lowpass';fl.frequency.value=420;g.gain.setValueAtTime(.15*SV,t);g.gain.setValueAtTime(.15*SV,t+.55);g.gain.linearRampToValueAtTime(0,t+.8);l.frequency.setValueAtTime(34,t);l.frequency.exponentialRampToValueAtTime(18,t+.75);lg.gain.value=.14*SV;l.connect(lg);lg.connect(g.gain);o.connect(fl);fl.connect(g);g.connect(a[SB]);o.start(t);l.start(t);o.stop(t+.8);l.stop(t+.8);B(.7,260,.2,.6)}
 else sfxMore(k,{T,B,P,X})}catch(e){}SV=1;SB='sfxG'}

// ---------- música da tela inicial (sintetizada) ----------
const MUS={on:true,mg:null,lp:null,step:0,next:0,iv:null},NF=n=>440*Math.pow(2,(n-69)/12);
const CHD=[[48,52,55],[45,48,52],[41,45,48],[43,47,50]],BS={0:-12,3:0,6:-12,8:0,11:-12,14:0};
const MEL=[[72,0,76,79,0,76,74,0,72,0,76,0,79,81,79,0],[69,0,72,76,0,72,71,0,69,0,72,0,76,74,72,0],[65,0,69,72,0,69,67,0,65,0,69,72,74,72,69,0],[67,0,71,74,0,71,72,0,74,0,71,0,67,69,71,0]];
function mo(type,f,t,d,v,f2,at){const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+(at||.01));g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(MUS.mg);o.start(t);o.stop(t+d+.02)}
function mn(t,d,type,f,v){const s=ac.createBufferSource(),fl=ac.createBiquadFilter(),g=ac.createGain();s.buffer=noiseBuf();fl.type=type;fl.frequency.value=f;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);s.connect(fl);fl.connect(g);g.connect(MUS.mg);s.start(t,Math.random()*2.5,d+.02)}
function musTick(){const spb=60/126/4;while(MUS.next<ac.currentTime+.3){const s=MUS.step%64,bar=s>>4,st=s&15,t=MUS.next,ch=CHD[bar];
 if(st===0)ch.forEach(n=>mo('sine',NF(n+12),t,spb*17,.05,0,.6));// colchão de acordes: dá a sensação de espaço aberto
 if(st%4===0)mo('sine',150,t,.16,.75,45);if(st===4||st===12){mn(t,.14,'bandpass',1800,.5);mo('triangle',220,t,.08,.2,120)}if(st%2===0)mn(t,.05,'highpass',7000,st%4===2?.22:.12);
 if(st in BS)mo('triangle',NF(ch[0]+BS[st]),t,spb*2.2,.5);
 if(st%4===2)ch.forEach(n=>mo('triangle',NF(n+12),t,spb*2,.07));
 const m=MEL[bar][st];if(m)mo('square',NF(m),t,spb*2.4,.06);
 MUS.next+=spb;MUS.step++}}
// grafo da música: ganho (com subida suave) -> passa-baixa que tira o brilho áspero da onda quadrada -> saída e reverb
function musGraph(){const a=AC();MUS.mg=a.createGain();MUS.mg.gain.value=0;MUS.mg.gain.setTargetAtTime(.22,a.currentTime,.6);const lp=MUS.lp=a.createBiquadFilter(),s=a.createGain();lp.type='lowpass';lp.frequency.value=3400;s.gain.value=.16;MUS.mg.connect(lp);lp.connect(a.master);lp.connect(s);s.connect(a.rvb);MUS.next=a.currentTime+.1;MUS.step=0}
function startMusic(){if(!MUS.on||MUS.iv||mode!=='menu')return;try{musGraph();MUS.iv=setInterval(musTick,60)}catch(e){}}
function stopMusic(){if(MUS.iv){clearInterval(MUS.iv);MUS.iv=null}const g=MUS.mg;MUS.mg=null;const lp=MUS.lp;MUS.lp=null;if(g&&ac){try{g.gain.setTargetAtTime(0,ac.currentTime,.2)}catch(e){}setTimeout(()=>{try{g.disconnect()}catch(e){}try{lp.disconnect()}catch(e){}},1500)}}
$('#bMus').onclick=()=>{MUS.on=!MUS.on;$('#bMus').textContent=MUS.on?'🔊 Música: ligada':'🔇 Música: desligada';$('#bMus').setAttribute('aria-pressed',MUS.on);if(MUS.on)startMusic();else stopMusic()};
['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>{startMusic();if(ac&&ac.state==='suspended')ac.resume()},{passive:true}));
startMusic();
// ---------- efeitos sonoros do jogo (sintetizados; passam pelo volume de efeitos dos Ajustes) ----------
function sfxMore(k,{T,B,P,X}){
 const R=Math.random;
 switch(k){
  // interface e presença: pings de painel na escala de Dó (523 587 659 784 880 1047)
  case 'join':P(523,.22,.1);P(659,.22,.1,.08);P(784,.4,.11,.16);break;// chegada: tríade subindo
  case 'leave':P(784,.2,.08);P(523,.36,.08,.1);break;// partida: duas notas descendo
  case 'chat':P(659,.1,.06);P(880,.12,.045,.055);break;
  case 'click':T('triangle',880,560,.045,.08);B(.012,3500,.05,1.2,0,{ty:'highpass'});break;
  case 'confirm':[523,659,784,1047].forEach((f,i)=>P(f,.26,.1,i*.08));break;
  // corpo no traje espacial: baque grave + sopro de ar
  case 'sit':T('sine',130,70,.2,.22);B(.14,420,.22,.7);B(.12,3500,.04,.8,.04,{ty:'highpass'});break;
  case 'stand':T('sine',180,300,.12,.1);B(.1,1200,.1,1);B(.14,3200,.04,.8,0,{ty:'highpass'});break;
  case 'jump':B(.18,500,.2,.7,0,{f1:1800});T('sine',240,520,.12,.08);break;// propulsor curto
  case 'land':T('sine',110,50,.16,.22);B(.1,300,.2,.7,0,{ty:'lowpass'});B(.06,2200,.05,1);break;
  // passos: cada chão tem timbre próprio; r varia o tom de cada passo para não soar repetido
  case 'step_sand':{const r=.9+Math.random()*.2;T('sine',95*r,55*r,.1,.1);B(.12,1100*r,.17,.5,0,{f1:380*r});break}// areia: chiado que desce
  case 'step_snow':{const r=.9+Math.random()*.2;T('sine',85*r,50*r,.1,.08);B(.1,900*r,.1,.8);for(let i=0;i<3;i++)B(.012,2600+R()*2200,.1,1.5,.012+i*.022);break}// neve: cristais estalando
  case 'step_grass':{const r=.9+Math.random()*.2;T('sine',100*r,60*r,.08,.09);B(.1,1900*r,.1,.8,0,{f1:900*r});break}// grama: farfalhar
  case 'step_water':{const r=.9+Math.random()*.2;T('sine',90*r,55*r,.08,.07);B(.13,380*r,.12,.6);T('sine',260*r,520*r,.07,.05,.02);T('sine',330*r,700*r,.05,.03,.07);break}// água: chape e bolha
  case 'step_rock':{const r=.9+Math.random()*.2;T('sine',120*r,65*r,.07,.12);B(.04,1500*r,.16,1.4);B(.03,2800*r,.07,1.5,.012);break}// pedra: estalo seco
  case 'step_metal':{const r=.9+Math.random()*.2;T('sine',110*r,70*r,.08,.09);B(.03,2200*r,.1,1.5);T('sine',640*r,610*r,.14,.025,.005);T('sine',1010*r,990*r,.1,.015,.005);break}// piso de colônia: baque com eco metálico
  // emoções: curtas, na mesma escala
  case 'e_laugh':[0,1,2].forEach(i=>X(430-i*20,350-i*20,.09,.14,1500,0,i*.12));break;
  case 'e_love':P(523,.32,.09);P(784,.44,.09,.12);T('sine',659,659,.5,.035,.12);break;
  case 'e_party':B(.3,1800,.14,.6,0,{f1:6000});[523,659,784,1047].forEach((f,i)=>P(f,.2,.07,.06+i*.07));break;
  case 'e_clap':[0,.12,.22,.36,.46].forEach(d=>{B(.045,1500+R()*300,.35,1.1,d);B(.03,2600,.15,1,d)});break;
  case 'e_fire':B(.45,180,.3,.5,0,{ty:'lowpass'});B(.5,700,.2,.5);for(let i=0;i<6;i++)B(.012,2000+R()*2500,.2,1.3,R()*.4);break;// brasa estalando
  case 'e_sparkle':[1047,1319,1568].forEach((f,i)=>T('triangle',f,f,.14,.045,.05+i*.06));break;
  case 'e_sad':X(392,294,.35,.1,1100,5);X(330,247,.4,.1,1100,5,.25);break;
  case 'e_angry':X(150,100,.3,.12,500,22);B(.25,300,.1,.8);break;
  case 'e_wow':X(330,740,.22,.12,1800);break;
  case 'e_sleep':B(.55,500,.15,.7,0,{at:.2,f1:300});T('sine',220,160,.5,.05,0);break;
  case 'e_pop':T('sine',520,1000,.07,.08);break;
  case 'g_whoosh':B(.3,3000,.14,.5,0,{f1:700});T('sine',300,700,.25,.03);break;
  case 'g_dance':T('sine',120,60,.12,.2);T('triangle',165,165,.12,.07,.12);break;
  // avisos de sala
  case 'n_video':B(.04,3000,.2,2);T('sine',196,392,.25,.08);P(784,.2,.1,.1);P(1047,.36,.1,.22);break;// tela ligando
  case 'n_dj':T('sine',130,45,.16,.28);[523,659,784].forEach(f=>T('triangle',f,f,.3,.05,.12));break;// batida e acorde
  case 'n_karaoke':B(.05,900,.25,2);P(659,.2,.1,.1);P(880,.32,.1,.2);break;// microfone ligando
 }}
const EMO_SFX={'😂':'e_laugh','😍':'e_love','❤️':'e_love','🥳':'e_party','🎉':'e_party','👏':'e_clap','🙌':'e_clap','🔥':'e_fire','✨':'e_sparkle','😭':'e_sad','😡':'e_angry','🤢':'e_angry','😱':'e_wow','😎':'e_wow','😴':'e_sleep','💃':'g_dance'};
const emoKind=ic=>EMO_SFX[ic]||'e_pop';
// volume pela distância até quem fez o som (você mesmo = 1)
function dvol(a){if(!a||a===me||!a.g)return 1;const d=Math.hypot(a.g.position.x-me.g.position.x,a.g.position.z-me.g.position.z);return Math.pow(Math.max(0,1-d/20),1.5)}
const STEPK={proxima:'sand',kepler:'sand',gliese:'rock',osiris:'rock',tauri:'grass',esmera:'grass',ambar:'grass',nyx:'grass',lumen:'metal',duna:'sand',mira:'grass',sakura:'grass',nivis:'snow',cinder:'rock',trappist:'water',draugr:'rock'};
// ambiente de cada mundo: camadas contínuas (vento, água, zumbido grave) e pontuais (bolhas). Sem tons puros agudos: nada de grilos nem sinos, que soavam como apito
const AMB={proxima:['wind'],kepler:['wind'],gliese:['windcold'],osiris:['rumble','wind'],tauri:['wind'],esmera:['wind'],ambar:['wind'],nyx:['drone'],lumen:['windcold'],duna:['wind'],mira:['bubbles','drone'],sakura:['wind'],nivis:['windcold'],cinder:['rumble','wind'],trappist:['water','bubbles'],draugr:['drone','windcold']};
const AM={k:null,g:null,src:[],at:{}};
function nsrc(a,dest,type,f,q){const s=a.createBufferSource(),fl=a.createBiquadFilter();s.buffer=noiseBuf();s.loop=true;fl.type=type;fl.frequency.value=f;if(q)fl.Q.value=q;s.connect(fl);fl.connect(dest);s.start();return{s,fl}}
function lfo(a,hz,depth,target,type){const o=a.createOscillator(),g=a.createGain();o.type=type||'sine';o.frequency.value=hz;g.gain.value=depth;o.connect(g);g.connect(target);o.start();return o}
function ambStop(){if(!AM.g||!ac)return;const g=AM.g,src=AM.src;g.gain.setTargetAtTime(0,ac.currentTime,.4);setTimeout(()=>{src.forEach(s=>{try{s.stop()}catch(e){}});try{g.disconnect()}catch(e){}},2200);AM.g=null;AM.src=[];AM.k=null;AM.at={}}
function ambSet(k){ambStop();const a=AC(),g=a.createGain();g.gain.value=0;g.gain.setTargetAtTime((AMB[k]||[]).filter(x=>x!=='bubbles').length>1?.75:1,a.currentTime,1.2);g.connect(a.bgG);AM.g=g;AM.k=k;AM.src=[];
 for(const kind of AMB[k]||[]){
  if(kind==='wind'||kind==='windcold'){const m=a.createGain();m.gain.value=kind==='wind'?.18:.12;m.connect(g);const n=nsrc(a,m,'bandpass',kind==='wind'?450:520,kind==='wind'?.6:.35);AM.src.push(n.s,lfo(a,.13,kind==='wind'?220:140,n.fl.frequency),lfo(a,.07,.05,m.gain))}
  else if(kind==='rumble'){const m=a.createGain();m.gain.value=.22;m.connect(g);const n=nsrc(a,m,'lowpass',110);AM.src.push(n.s)}
  else if(kind==='water'){const m=a.createGain();m.gain.value=.12;m.connect(g);const n=nsrc(a,m,'lowpass',600);AM.src.push(n.s,lfo(a,.22,.06,m.gain))}
  else if(kind==='drone'){const fl=a.createBiquadFilter(),m=a.createGain();fl.type='lowpass';fl.frequency.value=500;m.gain.value=.0095;fl.connect(m);m.connect(g);[110,111.7,164.8].forEach(f=>{const o=a.createOscillator();o.frequency.value=f;o.connect(fl);o.start();AM.src.push(o)});AM.src.push(lfo(a,.05,.005,m.gain))}
 }}
function ambTick(now){const ks=AMB[AM.k]||[];
 if(ks.includes('bubbles')&&now>(AM.at.bub||0)){AM.at.bub=now+600+Math.random()*1600;const f=250+Math.random()*300,a=AC();SV=.7;SB='bgG';tone('sine',f,f+500,a.currentTime,.12,.04);SV=1;SB='sfxG'}}
// por quadro: passos, pulo/aterrissagem, sentar/levantar e ambiente
function sfxTick(dt){const now=performance.now();
 if(mode!=='play'||document.hidden){if(AM.g)ambStop();return}
 if(CUR&&AM.k!==CUR&&ac)ambSet(CUR);
 if(AM.g)ambTick(now);
 if(!ac)return;
 for(let n=-1,it=actors.values();n<actors.size;n++){const a=n<0?me:it.next().value;if(!a||!a.g)continue;const p=a.g.position,air=p.y>.12;
  if(a._sit!==undefined&&a._sit!==!!a.sit){const v=dvol(a);if(v>.03)sfx(a.sit?'sit':'stand',v)}a._sit=!!a.sit;
  if(a._air!==undefined&&a._air!==air){const v=dvol(a);if(v>.03)sfx(air?'jump':'land',v)}a._air=air;
  if(a._sx!==undefined){const d=Math.hypot(p.x-a._sx,p.z-a._sz);if(d<1.5&&!a.sit&&!air){a._st=(a._st||0)+d;if(a._st>.8){a._st=0;const v=dvol(a);if(v>.04)sfx('step_'+(STEPK[CUR]||'sand'),v*.8)}}}
  a._sx=p.x;a._sz=p.z}}
