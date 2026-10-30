/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Sons sintetizados: música da tela inicial e efeitos do jogo.
 * Os arquivos assets/app-*.js são scripts comuns carregados em ordem pelo index.html e dividem o mesmo escopo global: o que um
 * declara no nível de cima, os seguintes enxergam. Código que roda ao carregar só pode usar o que já veio antes.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
// ---------- sons (sintetizados) ----------
let SV=1,SB='sfxG';const VOLS={sfxG:['skyke_sfx',.8],bgG:['skyke_amb',.7]};// dois canais: efeitos sonoros (tudo que reage a ações e avisos) e som ambiente (fundo de cada mundo)
for(const k in VOLS){try{const v=parseFloat(localStorage.getItem(VOLS[k][0]));if(v>=0&&v<=1)VOLS[k][1]=v}catch(e){}}
let ac=null;const AC=()=>{if(!ac){ac=new(window.AudioContext||window.webkitAudioContext)();for(const k in VOLS){const g=ac[k]=ac.createGain();g.gain.value=VOLS[k][1];g.connect(ac.destination)}}if(ac.state==='suspended')ac.resume();return ac};
function tone(type,f0,f1,t0,d,v){const a=AC(),o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(f0,t0);o.frequency.exponentialRampToValueAtTime(f1,t0+d);g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(v*SV,t0+.03);g.gain.exponentialRampToValueAtTime(.001,t0+d);o.connect(g);g.connect(a[SB]);o.start(t0);o.stop(t0+d+.02)}
function burst(t0,d,f,v,q){const a=AC(),b=a.createBuffer(1,Math.max(1,a.sampleRate*d|0),a.sampleRate),x=b.getChannelData(0);for(let i=0;i<x.length;i++)x[i]=Math.random()*2-1;const s=a.createBufferSource(),fl=a.createBiquadFilter(),g=a.createGain();s.buffer=b;fl.type='bandpass';fl.frequency.value=f;fl.Q.value=q||1;g.gain.setValueAtTime(v*SV,t0);g.gain.exponentialRampToValueAtTime(.001,t0+d);s.connect(fl);fl.connect(g);g.connect(a[SB]);s.start(t0)}
function sfx(k,vm){SV=vm==null?1:vm;SB='sfxG';try{const a=AC(),t=a.currentTime;
 if(k==='eat')for(let i=0;i<6;i++){const t0=t+i*.25+Math.random()*.03,g=1-i*.1,R=Math.random;
  for(let c=0;c<5;c++)burst(t0+c*.007+R()*.008,.012+R()*.018,2600+R()*3800,.34*g,1.8);// estalos pequenos
  burst(t0,.085,1100+R()*700,.34*g,1.1);// corpo da mordida
  tone('sine',170+R()*40,80,t0,.09,.2*g)}
 else if(k==='drink')for(let i=0;i<3;i++){tone('sine',320,140,t+i*.38,.2,.3);tone('sine',500,900,t+i*.38+.2,.1,.12)}
 else if(k==='notif'){tone('sine',784,784,t,.16,.14);tone('sine',1175,1175,t+.13,.34,.13);tone('triangle',2349,2349,t+.13,.2,.025)}
 else if(k==='scream'){tone('sawtooth',500,1100,t,.7,.18);tone('sawtooth',1100,650,t+.7,.8,.18);tone('square',510,1110,t,.7,.06);burst(t,1.4,2500,.15,.7)}
 else if(k==='fart'){const o=a.createOscillator(),g=a.createGain(),l=a.createOscillator(),lg=a.createGain();o.type='sawtooth';o.frequency.setValueAtTime(95,t);o.frequency.exponentialRampToValueAtTime(48,t+.75);g.gain.value=.15*SV;l.frequency.value=32;lg.gain.value=.14;l.connect(lg);lg.connect(g.gain);o.connect(g);g.connect(a[SB]);o.start(t);l.start(t);o.stop(t+.8);l.stop(t+.8);burst(t,.7,250,.2,.5)}else sfxMore(k,a,t)}catch(e){}SV=1;SB='sfxG'}

// ---------- música da tela inicial (sintetizada) ----------
const MUS={on:true,mg:null,step:0,next:0,iv:null},NF=n=>440*Math.pow(2,(n-69)/12);
const CHD=[[48,52,55],[45,48,52],[41,45,48],[43,47,50]],BS={0:-12,3:0,6:-12,8:0,11:-12,14:0};
const MEL=[[72,0,76,79,0,76,74,0,72,0,76,0,79,81,79,0],[69,0,72,76,0,72,71,0,69,0,72,0,76,74,72,0],[65,0,69,72,0,69,67,0,65,0,69,72,74,72,69,0],[67,0,71,74,0,71,72,0,74,0,71,0,67,69,71,0]];
function mo(type,f,t,d,v,f2){const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.01);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(MUS.mg);o.start(t);o.stop(t+d+.02)}
function mn(t,d,type,f,v){const n=Math.max(1,ac.sampleRate*d|0),b=ac.createBuffer(1,n,ac.sampleRate),x=b.getChannelData(0);for(let i=0;i<n;i++)x[i]=Math.random()*2-1;const s=ac.createBufferSource(),fl=ac.createBiquadFilter(),g=ac.createGain();s.buffer=b;fl.type=type;fl.frequency.value=f;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);s.connect(fl);fl.connect(g);g.connect(MUS.mg);s.start(t)}
function musTick(){const spb=60/126/4;while(MUS.next<ac.currentTime+.3){const s=MUS.step%64,bar=s>>4,st=s&15,t=MUS.next,ch=CHD[bar];
 if(st%4===0)mo('sine',150,t,.16,.9,45);if(st===4||st===12){mn(t,.14,'bandpass',1800,.5);mo('triangle',220,t,.08,.2,120)}if(st%2===0)mn(t,.05,'highpass',7000,st%4===2?.22:.12);
 if(st in BS)mo('triangle',NF(ch[0]+BS[st]),t,spb*2.2,.5);
 if(st%4===2)ch.forEach(n=>mo('triangle',NF(n+12),t,spb*2,.07));
 const m=MEL[bar][st];if(m)mo('square',NF(m),t,spb*2.4,.06);
 MUS.next+=spb;MUS.step++}}
function startMusic(){if(!MUS.on||MUS.iv||mode!=='menu')return;try{const a=AC();MUS.mg=a.createGain();MUS.mg.gain.value=0;MUS.mg.gain.setTargetAtTime(.32,a.currentTime,.6);MUS.mg.connect(a.destination);MUS.next=a.currentTime+.1;MUS.step=0;MUS.iv=setInterval(musTick,60)}catch(e){}}
function stopMusic(){if(MUS.iv){clearInterval(MUS.iv);MUS.iv=null}if(MUS.mg&&ac){try{MUS.mg.gain.setTargetAtTime(0,ac.currentTime,.2)}catch(e){}}}
$('#bMus').onclick=()=>{MUS.on=!MUS.on;$('#bMus').textContent=MUS.on?'🔊 Música: ligada':'🔇 Música: desligada';$('#bMus').setAttribute('aria-pressed',MUS.on);if(MUS.on)startMusic();else stopMusic()};
['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>{startMusic();if(ac&&ac.state==='suspended')ac.resume()},{passive:true}));
startMusic();
// ---------- efeitos sonoros do jogo (sintetizados; passam pelo volume de efeitos dos Ajustes) ----------
function sfxMore(k,a,t){
 const T=(ty,f0,f1,d,v,dl)=>tone(ty,f0,f1,t+(dl||0),d,v),B=(d,f,v,q,dl)=>burst(t+(dl||0),d,f,v,q);
 switch(k){
  case 'join':T('sine',660,660,.14,.12);T('sine',880,880,.22,.12,.1);T('triangle',1320,1320,.15,.03,.1);break;
  case 'leave':T('sine',784,784,.14,.1);T('sine',523,523,.22,.1,.1);break;
  case 'chat':T('sine',1200,1000,.07,.05);T('sine',1600,1500,.06,.035,.045);break;
  case 'click':T('triangle',900,600,.04,.06);break;
  case 'confirm':[523,659,784,1047].forEach((f,i)=>T('triangle',f,f,.2,.09,i*.09));break;
  case 'sit':T('sine',140,70,.18,.22);B(.12,400,.25,.8);break;
  case 'stand':T('sine',200,320,.1,.1);B(.08,1200,.12,1);break;
  case 'jump':B(.16,1000,.2,.6);T('sine',300,620,.12,.08);break;
  case 'land':T('sine',110,55,.14,.2);B(.07,350,.2,.8);break;
  // passos: baque grave (seno descendo) + ruído abafado em faixa baixa; r varia o tom de cada passo para não soar repetido
  case 'step_sand':{const r=.9+Math.random()*.2;T('sine',95*r,55*r,.09,.11);B(.08,420*r,.16,.7);break}
  case 'step_snow':{const r=.9+Math.random()*.2;T('sine',85*r,50*r,.1,.09);B(.1,620*r,.1,.8);B(.07,320*r,.1,.7,.03);break}
  case 'step_grass':{const r=.9+Math.random()*.2;T('sine',100*r,60*r,.08,.1);B(.08,520*r,.12,.6);break}
  case 'step_water':{const r=.9+Math.random()*.2;T('sine',90*r,55*r,.08,.08);T('sine',220*r,330*r,.07,.035);B(.11,380*r,.12,.6);break}
  case 'step_rock':{const r=.9+Math.random()*.2;T('sine',120*r,65*r,.07,.13);B(.05,550*r,.14,1.2);break}
  case 'step_metal':{const r=.9+Math.random()*.2;T('sine',110*r,70*r,.08,.1);T('triangle',260*r,200*r,.07,.035);B(.04,800*r,.1,1.5);break}
  case 'e_laugh':[0,1,2].forEach(i=>T('square',600+i*40,700+i*40,.07,.05,i*.09));break;
  case 'e_love':T('sine',523,784,.25,.1);T('sine',784,1046,.25,.1,.15);break;
  case 'e_party':B(.25,2500,.3,.5);[523,659,784,1046].forEach((f,i)=>T('triangle',f,f,.18,.07,.06+i*.07));break;
  case 'e_clap':for(let i=0;i<5;i++)B(.05,1800,.35,1,i*.11);break;
  case 'e_fire':B(.5,600,.3,.4);T('sawtooth',120,80,.4,.05);break;
  case 'e_sparkle':[1568,2093,2637].forEach((f,i)=>T('sine',f,f,.2,.05,.05+i*.06));break;
  case 'e_sad':T('sine',440,330,.4,.08);T('sine',330,220,.4,.08,.25);break;
  case 'e_angry':T('sawtooth',160,110,.3,.07);break;
  case 'e_wow':T('sine',400,900,.22,.09);break;
  case 'e_sleep':T('sine',300,200,.5,.07);break;
  case 'e_pop':T('sine',600,900,.08,.07);break;
  case 'g_whoosh':B(.3,1400,.12,.4);T('sine',300,700,.25,.04);break;
  case 'g_dance':T('triangle',330,330,.08,.06);T('triangle',440,440,.08,.06,.1);break;
  case 'n_video':B(.04,2500,.25,3);T('square',200,200,.05,.06,.05);T('sine',784,784,.16,.12,.12);T('sine',1175,1175,.3,.11,.25);break;
  case 'n_dj':T('sine',90,60,.15,.2);T('triangle',880,1320,.18,.07,.12);T('sine',1320,1320,.3,.08,.25);break;
  case 'n_karaoke':B(.05,900,.25,2);T('sine',659,880,.18,.1,.1);T('sine',880,1046,.25,.1,.2);break;
 }}
const EMO_SFX={'😂':'e_laugh','😍':'e_love','❤️':'e_love','🥳':'e_party','🎉':'e_party','👏':'e_clap','🙌':'e_clap','🔥':'e_fire','✨':'e_sparkle','😭':'e_sad','😡':'e_angry','🤢':'e_angry','😱':'e_wow','😎':'e_wow','😴':'e_sleep','💃':'g_dance'};
const emoKind=ic=>EMO_SFX[ic]||'e_pop';
// volume pela distância até quem fez o som (você mesmo = 1)
function dvol(a){if(!a||a===me||!a.g)return 1;const d=Math.hypot(a.g.position.x-me.g.position.x,a.g.position.z-me.g.position.z);return Math.pow(Math.max(0,1-d/20),1.5)}
const STEPK={proxima:'sand',kepler:'sand',gliese:'rock',osiris:'rock',tauri:'grass',acampamento:'grass',esmera:'grass',ambar:'grass',nyx:'grass',lumen:'metal',duna:'sand',mira:'grass',sakura:'grass',nivis:'snow',cinder:'rock',trappist:'water',draugr:'rock'};
// ambiente de cada mundo: camadas contínuas (vento, água...) e pontuais (sinos, bolhas)
const AMB={proxima:['wind'],kepler:['wind'],gliese:['windcold'],osiris:['rumble','wind'],tauri:['wind'],acampamento:['wind'],esmera:['chime'],ambar:['wind'],nyx:['drone','chime'],lumen:['chime','windcold'],duna:['wind'],mira:['bubbles','drone'],sakura:['wind','chime'],nivis:['windcold'],cinder:['rumble','wind'],trappist:['water','bubbles'],draugr:['drone','windcold']};
let NBUF=null;const noiseBuf=()=>{if(!NBUF){const a=AC(),n=a.sampleRate*3,b=a.createBuffer(1,n,a.sampleRate),x=b.getChannelData(0);for(let i=0;i<n;i++)x[i]=Math.random()*2-1;NBUF=b}return NBUF};
const AM={k:null,g:null,src:[],at:{}};
function nsrc(a,dest,type,f,q){const s=a.createBufferSource(),fl=a.createBiquadFilter();s.buffer=noiseBuf();s.loop=true;fl.type=type;fl.frequency.value=f;if(q)fl.Q.value=q;s.connect(fl);fl.connect(dest);s.start();return{s,fl}}
function lfo(a,hz,depth,target,type){const o=a.createOscillator(),g=a.createGain();o.type=type||'sine';o.frequency.value=hz;g.gain.value=depth;o.connect(g);g.connect(target);o.start();return o}
function ambStop(){if(!AM.g||!ac)return;const g=AM.g,src=AM.src;g.gain.setTargetAtTime(0,ac.currentTime,.4);setTimeout(()=>{src.forEach(s=>{try{s.stop()}catch(e){}});try{g.disconnect()}catch(e){}},2200);AM.g=null;AM.src=[];AM.k=null;AM.at={}}
function ambSet(k){ambStop();const a=AC(),g=a.createGain();g.gain.value=0;g.gain.setTargetAtTime(1,a.currentTime,1.2);g.connect(a.bgG);AM.g=g;AM.k=k;AM.src=[];
 for(const kind of AMB[k]||[]){
  if(kind==='wind'||kind==='windcold'){const m=a.createGain();m.gain.value=kind==='wind'?.12:.08;m.connect(g);const n=nsrc(a,m,'bandpass',kind==='wind'?450:900,.6);AM.src.push(n.s,lfo(a,.13,kind==='wind'?220:300,n.fl.frequency),lfo(a,.07,.05,m.gain))}
  else if(kind==='rumble'){const m=a.createGain();m.gain.value=.22;m.connect(g);const n=nsrc(a,m,'lowpass',110);AM.src.push(n.s)}
  else if(kind==='water'){const m=a.createGain();m.gain.value=.12;m.connect(g);const n=nsrc(a,m,'lowpass',600);AM.src.push(n.s,lfo(a,.22,.06,m.gain))}
  else if(kind==='drone'){const fl=a.createBiquadFilter(),m=a.createGain();fl.type='lowpass';fl.frequency.value=500;m.gain.value=.035;fl.connect(m);m.connect(g);[110,111.7,164.8].forEach(f=>{const o=a.createOscillator();o.frequency.value=f;o.connect(fl);o.start();AM.src.push(o)});AM.src.push(lfo(a,.05,.015,m.gain))}
 }}
function ambTick(now){const ks=AMB[AM.k]||[],pent=[784,880,1047,1175,1319];
 if(ks.includes('chime')&&now>(AM.at.chime||0)){AM.at.chime=now+2500+Math.random()*3500;const f=pent[Math.random()*5|0];SV=.7;SB='bgG';const a=AC(),t=a.currentTime;tone('sine',f,f,2,.05,t);tone('triangle',f*2,f*2,1.2,.015,t);SV=1;SB='sfxG'}
 if(ks.includes('bubbles')&&now>(AM.at.bub||0)){AM.at.bub=now+600+Math.random()*1600;const f=250+Math.random()*300,a=AC();SV=.7;SB='bgG';tone('sine',f,f+500,.12,.04,a.currentTime);SV=1;SB='sfxG'}}
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
