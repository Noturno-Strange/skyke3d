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
 * de ar); passos mudam com o chão do mundo; o ambiente é suave, sem tons puros agudos e sem ruído grave em ondas (soava como mar). Tudo passa por uma cadeia única:
 * limitador suave e uma reverb curta compartilhada, para os sons parecerem do mesmo lugar. O volume de cada som é calibrado
 * pela tabela TRIM; `node tools/audio-audit.js` mede todos e aponta quem saiu do alvo.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
// ---------- sons (sintetizados) ----------
let SV=1,SB='sfxG';const VOLS={sfxG:['skyke_sfx',.8],bgG:['skyke_amb',.7],musG:['skyke_mus',.6]};// três canais: efeitos sonoros (tudo que reage a ações e avisos), som ambiente (fundo de cada mundo) e música lofi
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
 const s=ac.createGain();s.gain.value=.22;ac.sfxG.connect(s);s.connect(rv);const ms=ac.createGain();ms.gain.value=.16;ac.musG.connect(ms);ms.connect(rv)}// só os efeitos e a música vão para a reverb; o ambiente fica seco
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
const TRIM={rain:0.53,erro:2.14,pickup:2.16,wash:4.95,peel:5.75,cook_done:2.07,eat:1.66,drink:0.96,notif:1.87,scream:1.14,fart:0.9,join:2.11,leave:1.64,chat:3.03,click:4.68,confirm:2.25,page:3.09,sit:1.27,stand:3.3,jump:4.19,land:1.44,step_sand:1.68,step_grass:2.13,step_water:2.08,step_rock:1.78,e_laugh:2.56,e_love:1.57,e_party:2.28,e_clap:4.26,e_fire:2.71,e_sparkle:5.07,e_sad:2.16,e_angry:1.95,e_wow:2.25,e_sleep:2.97,e_pop:4.42,g_whoosh:2.85,g_dance:1.42,n_video:2.49,n_dj:1.3,n_karaoke:2.56,amb_amazora:2.15,amb_cerron:2.35,amb_atlanthia:1.97,amb_caatara:2.13,amb_panthara:2.03,amb_pamphora:2.41,mus_menu:1.26,mus_tutorial:1.23,mus_amazora:1.33,mus_cerron:1.3,mus_atlanthia:1.21,mus_caatara:1.35,mus_panthara:1.29,mus_pamphora:1.1};
for(const k of Object.keys(SKYLOFI.TRACKS))TRIM['mus_'+k]=TRIM['mus_'+k]||1;// ganho de cada faixa de música (calibrado por tools/audio-audit.js)
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

// ---------- música lofi (sintetizada; composições em assets/lofi.js): uma faixa para a tela inicial e uma para cada mundo ----------
const MUS={on:true,mg:null,lp:null,P:null,k:'',step:0,next:0,iv:null},NF=n=>440*Math.pow(2,(n-69)/12);
// oscilador com ataque, queda exponencial e desafinação (cents); sai no ganho da música
function mo(type,f,t,d,v,f2,at,dc){const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);if(dc)o.detune.value=dc;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+(at||.01));g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(MUS.mg);o.start(t);o.stop(t+d+.02)}
function mn(t,d,type,f,v,q){const s=ac.createBufferSource(),fl=ac.createBiquadFilter(),g=ac.createGain();s.buffer=noiseBuf();fl.type=type;fl.frequency.value=f;if(q)fl.Q.value=q;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);s.connect(fl);fl.connect(g);g.connect(MUS.mg);s.start(t,Math.random()*2.5,d+.02)}
// melodia: cada timbre é uma pequena receita (parciais, queda e vibrato); d = duração da nota em segundos
function mlead(T,m,t,d,v,dc){const f=NF(m),R=Math.random;
 if(T==='rhodes'){mo('sine',f,t,d*1.6+.5,v,0,.012,dc);mo('sine',f*2,t,.5,v*.3,0,.01,dc);mo('sine',f*7,t,.07,v*.08,0,.004,dc);mo('sine',f,t,d*1.2+.4,v*.5,0,.014,dc+7)}
 else if(T==='bell'){mo('sine',f,t,d*1.5+.9,v,0,.006,dc);mo('sine',f*2.76,t,.6,v*.22,0,.004,dc);mo('sine',f*5.4,t,.25,v*.08,0,.003,dc)}
 else if(T==='pluck'){mo('triangle',f,t,d*.9+.25,v,0,.005,dc);mo('sine',f*2,t,.18,v*.4,0,.004,dc)}
 else if(T==='kalimba'){mo('sine',f,t,.9,v,0,.004,dc);mo('sine',f*4.1,t,.1,v*.3,0,.002,dc);mn(t,.02,'bandpass',f*3,v*.2,2)}
 else if(T==='marimba'){mo('sine',f,t,.32,v*1.1,0,.003,dc);mo('sine',f*4,t,.1,v*.35,0,.002,dc);mn(t,.015,'bandpass',f*2,v*.15,3)}
 else if(T==='koto'){mo('triangle',f*1.012,t,.55+d*.2,v,f,.003,dc);mo('sine',f*3,t,.12,v*.3,0,.002,dc);mn(t,.012,'highpass',4000,v*.12)}
 else{const o=ac.createOscillator(),l=ac.createOscillator(),lg=ac.createGain(),g=ac.createGain();o.type='sine';o.frequency.value=f;if(dc)o.detune.value=dc;l.frequency.value=4.6+R()*.8;lg.gain.value=f*.006;l.connect(lg);lg.connect(o.frequency);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v*.8,t+.07);g.gain.setValueAtTime(v*.8,t+Math.max(.08,d-.1));g.gain.exponentialRampToValueAtTime(.001,t+d+.25);o.connect(g);g.connect(MUS.mg);o.start(t);l.start(t);o.stop(t+d+.3);l.stop(t+d+.3);mn(t,d,'bandpass',2600,v*.07,1.2)}}// flauta
function musTick(){const P=MUS.P;if(!P||!ac||!MUS.mg)return;const spb=60/P.bpm/4,R=Math.random;
 while(MUS.next<ac.currentTime+.3){const s=MUS.step,bar=(s>>4)%P.nb,st=s&15,pass=Math.floor(s/(16*P.nb))%3,ch=P.chords[bar];
  const t=MUS.next+(st&1?spb*P.sw:0)+R()*.008,wob=P.wob*Math.sin(MUS.next*2.1),vel=()=>.85+R()*.3;
  if(st===0){const pv=.03*P.pad;ch.notes.forEach(n=>{mo('triangle',NF(n-12),t,spb*16,pv,0,1.2,-5);mo('triangle',NF(n-12),t,spb*16,pv,0,1.4,6)})}// colchão de acordes: dois triângulos desafinados, subida lenta
  if(P.comp[st]==='x')ch.notes.forEach((n,i)=>{const tt=t+i*.011+R()*.006,v=.05*vel();mo('sine',NF(n),tt,spb*5,v,0,.012,wob);mo('sine',NF(n)*2,tt,spb*1.4,v*.28,0,.01,wob);mo('sine',NF(n)*7,tt,.06,v*.06,0,.004,wob)});// piano elétrico
  const b=P.bass[st];if(b!=='.'){const n=ch.bass+(b==='f'?7:b==='o'?12:0);mo('sine',NF(n),t,spb*3.2,.46*vel(),0,.012,wob);mo('triangle',NF(n),t,spb*2,.14*vel(),0,.012,wob)}
  const kd=P.k[st];if(kd!=='.')mo('sine',140,t,.2,(kd==='x'?.72:.38)*vel(),42,.004);
  const sn=P.s[st];if(sn!=='.'){mn(t,.14,'bandpass',1900,(sn==='x'?.42:.2)*vel(),.9);mo('triangle',190,t,.09,(sn==='x'?.16:.08)*vel(),130,.004)}
  const hh=P.h[st];if(hh!=='.')mn(t,.045,'highpass',7200,(hh==='x'?.2:.09)*vel());
  const ev=pass<2?P.mel[bar][st]:null;if(ev&&!(pass===1&&(s*7+st)%3===0)){const v=.1*vel(),d=Math.min(ev.len,12)*spb;mlead(P.lead,ev.m,t+R()*.012,d,v,wob)}// segunda volta mais enxuta; a terceira só tem o ritmo e o piano
  MUS.next+=spb;MUS.step++}}
// grafo da música: ganho (com subida suave) -> passa-baixa de cada faixa (abafa o som, como fita) -> canal Música -> saída (a reverb sai do canal)
function musGraph(k){const a=AC();k=k||MUS.k||'menu';MUS.k=k;MUS.P=SKYLOFI.build(k)||SKYLOFI.build('menu');const P=MUS.P;
 MUS.mg=a.createGain();MUS.mg.gain.value=0;MUS.mg.gain.setTargetAtTime(.22*(TRIM['mus_'+k]||1),a.currentTime,.9);
 const lp=MUS.lp=a.createBiquadFilter();lp.type='lowpass';lp.frequency.value=P.warm;lp.Q.value=.6;MUS.mg.connect(lp);lp.connect(a.musG);
 MUS.next=a.currentTime+.1;MUS.step=0;const nm=$('#musNow');if(nm)nm.textContent='♪ '+P.n}
// tutorial em quadrinhos aberto (na tela de abertura): tem faixa própria, que entra e sai em fade como as outras
function tutOn(){const t=document.getElementById('tut');return!!t&&!t.classList.contains('hide')}
// o que deve tocar agora: a faixa da tela inicial no menu, a do mundo na sala; nada se a música está desligada, a aba está escondida ou há vídeo, rádio ou karaokê
function musWant(){if(!MUS.on||document.hidden)return'';if(mode==='menu')return tutOn()?'tutorial':'menu';if(mode!=='play')return'';
 if((typeof VW!=='undefined'&&VW.id)||(typeof KW!=='undefined'&&KW.id)||(typeof DJ!=='undefined'&&DJ.on))return'';return CUR||'amazora'}
function musSync(){const w=musWant();if(w===(MUS.iv?MUS.k:''))return;if(!w){stopMusic();return}if(MUS.iv)stopMusic();try{musGraph(w);MUS.iv=setInterval(musTick,60)}catch(e){}}
function startMusic(){musSync()}
function stopMusic(){if(MUS.iv){clearInterval(MUS.iv);MUS.iv=null}const g=MUS.mg;MUS.mg=null;const lp=MUS.lp;MUS.lp=null;if(g&&ac){try{g.gain.setTargetAtTime(0,ac.currentTime,.25)}catch(e){}setTimeout(()=>{try{g.disconnect()}catch(e){}try{lp.disconnect()}catch(e){}},1800)}const nm=$('#musNow');if(nm)nm.textContent=''}
$('#bMus').onclick=()=>{MUS.on=!MUS.on;$('#bMus').textContent=MUS.on?'🔊 Música: ligada':'🔇 Música: desligada';$('#bMus').setAttribute('aria-pressed',MUS.on);musSync()};
['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>{startMusic();if(ac&&ac.state==='suspended')ac.resume()},{passive:true}));
document.addEventListener('visibilitychange',musSync);
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
  case 'page':B(.24,2200,.12,.9,0,{f1:5600,at:.07});B(.07,900,.06,1,.19,{ty:'lowpass'});break;// folhear: papel deslizando (ruído que sobe) e a página assentando
  case 'confirm':[523,659,784,1047].forEach((f,i)=>P(f,.26,.1,i*.08));break;
  case 'erro':X(330,262,.12,.1,900,0);X(262,196,.18,.1,900,0,.12);break;// ação recusada: duas notas curtas descendo, graves e suaves
  case 'pickup':T('sine',330,660,.08,.08);P(784,.14,.06,.06);break;// item na mão: sobe rápido e um ping curto
  case 'wash':for(let i=0;i<4;i++){const d=i*.12+R()*.03;B(.1,700+R()*300,.12,1.4,d,{ty:'lowpass'});T('sine',300+R()*120,600+R()*200,.06,.04,d)}break;// lavar: água e bolhas
  case 'peel':for(let i=0;i<3;i++)B(.07,2600+R()*600,.16,1.3,i*.14,{f1:1600});break;// descascar: raspadas curtas
  case 'cook_done':B(.22,2400,.12,.6,0,{f1:800});[523,659,784,1047].forEach((f,i)=>P(f,.32,.09,.06+i*.09));T('triangle',1568,1568,.22,.03,.46);break;// prato pronto: chiado da panela e arpejo que sobe com um brilho no fim
  // corpo no traje espacial: baque grave + sopro de ar
  case 'sit':T('sine',130,70,.2,.22);B(.14,420,.22,.7);B(.12,3500,.04,.8,.04,{ty:'highpass'});break;
  case 'stand':T('sine',180,300,.12,.1);B(.1,1200,.1,1);B(.14,3200,.04,.8,0,{ty:'highpass'});break;
  case 'jump':B(.18,500,.2,.7,0,{f1:1800});T('sine',240,520,.12,.08);break;// propulsor curto
  case 'land':T('sine',110,50,.16,.22);B(.1,300,.2,.7,0,{ty:'lowpass'});B(.06,2200,.05,1);break;
  // passos: cada chão tem timbre próprio; r varia o tom de cada passo para não soar repetido
  case 'step_sand':{const r=.9+Math.random()*.2;T('sine',95*r,55*r,.1,.1);B(.12,1100*r,.17,.5,0,{f1:380*r});break}// areia: chiado que desce
  case 'step_grass':{const r=.9+Math.random()*.2;T('sine',100*r,60*r,.08,.09);B(.1,1900*r,.1,.8,0,{f1:900*r});break}// grama: farfalhar
  case 'step_water':{const r=.9+Math.random()*.2;T('sine',90*r,55*r,.08,.07);B(.13,380*r,.12,.6);T('sine',260*r,520*r,.07,.05,.02);T('sine',330*r,700*r,.05,.03,.07);break}// água: chape e bolha
  case 'step_rock':{const r=.9+Math.random()*.2;T('sine',120*r,65*r,.07,.12);B(.04,1500*r,.16,1.4);B(.03,2800*r,.07,1.5,.012);break}// pedra: estalo seco
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
const STEPK={amazora:'grass',cerron:'sand',atlanthia:'grass',caatara:'rock',panthara:'water',pamphora:'grass'};
// ambiente de cada mundo, pelo bioma: só bichos de vez em quando, com silêncio entre eles. Cada mundo tem um conjunto próprio, com aves
// típicas do bioma (arara na Amazônia, seriema no Cerrado, sabiá na Mata Atlântica, rolinha e bem-te-vi na Caatinga, bem-te-vi no
// Pantanal, quero-quero no Pampa); a chuva (rainSnd) entra por cima quando chove. Nenhum ruído contínuo (água, vento, folhagem, poeira e
// insetos soavam como mar ou chiado de rádio) e nenhum tom puro agudo contínuo (seno ou sino soavam como apito).
// O que deixa os bichos realistas: cada chamado vem de um ponto sorteado (amSpot: longe = mais baixo, abafado e com eco da mata, e de um
// lado no estéreo), os assobios têm subida e descida lisas, deslizes e vibrato (amTone) e as vozes de bicho passam por formantes, as
// "vogais" da garganta (amVox), em vez de uma onda crua
const AMB={amazora:['croak','frogs','tap','birds','arara'],cerron:['tap','hoot','birds','seriema'],atlanthia:['frogs','hoot','tap','birds','sabia'],caatara:['goat','birds','rolinha','bemtevi'],panthara:['croak','bubbles','frogs','birds','bemtevi'],pamphora:['moo','hoot','birds','queroquero']};
const AM={k:null,g:null,rv:null,at:{},frog:[],bird:[]};
// ruído da chuva: 8 s gerados uma vez, e cada faixa começa num ponto sorteado (com o ruído curto de 3 s, as faixas repetiam juntas)
let LBUF=null;const longBuf=()=>{if(!LBUF){const a=AC(),n=a.sampleRate*8|0,b=a.createBuffer(1,n,a.sampleRate),x=b.getChannelData(0);for(let i=0;i<n;i++)x[i]=Math.random()*2-1;LBUF=b}return LBUF};
function nsrc(a,dest,type,f,q){const s=a.createBufferSource(),fl=a.createBiquadFilter();s.buffer=longBuf();s.loop=true;fl.type=type;fl.frequency.value=f;if(q)fl.Q.value=q;s.connect(fl);fl.connect(dest);s.start(0,Math.random()*7.9);return{s,fl}}
function lfo(a,hz,depth,target,type){const o=a.createOscillator(),g=a.createGain();o.type=type||'sine';o.frequency.value=hz;g.gain.value=depth;o.connect(g);g.connect(target);o.start();return o}
// pingos perto: 6 s de ruído esparso (cliques curtos de força variada, a maioria fraca), gerado uma vez e tocado em laço
let DBUF=null;const dropBuf=()=>{if(!DBUF){const a=AC(),n=a.sampleRate*6|0,b=a.createBuffer(1,n,a.sampleRate),x=b.getChannelData(0),R=Math.random;
 for(let k=0;k<300;k++){const i=R()*(n-600)|0,L=(a.sampleRate*(.002+R()*.006))|0,v=.2+.8*R()*R()*R();for(let j=0;j<L;j++)x[i+j]+=(R()*2-1)*v*Math.exp(-4*j/L)}DBUF=b}return DBUF};
// chuva (app-life.js), pelo retrato de uma gravação de chuva de verdade: quase nada abaixo de 150 Hz, energia espalhada de 500 Hz a
// 10 kHz (corpo nas folhas e no chão, chiado das gotas), um crepitar de pingos perto e rajadas lentas, que sobem e descem em dezenas de
// segundos. O volume segue a intensidade (0 a 1). Os nós só existem enquanto chove
const RS={g:null,src:[],tm:0};
function rainSnd(w){if(w<=0&&!RS.g)return;const a=AC();
 if(!RS.g){const g=a.createGain(),hp=a.createBiquadFilter();g.gain.value=0;g.connect(a.bgG);hp.type='highpass';hp.frequency.value=160;hp.connect(g);RS.g=g;RS.src=[];
  for(const[ty,f,q,v,hz,dp]of[['bandpass',900,.5,.09,.023,.03],['bandpass',2600,.6,.05,.031,.025],['highpass',6000,0,.035,.017,.018]]){const m=a.createGain();m.gain.value=v;m.connect(hp);
   RS.src.push(nsrc(a,m,ty,f,q).s,lfo(a,hz,dp,m.gain))}// rajadas: cada faixa ondula num ritmo diferente, e a soma nunca se repete igual
  const d=a.createBufferSource(),df=a.createBiquadFilter(),dm=a.createGain();d.buffer=dropBuf();d.loop=true;df.type='highpass';df.frequency.value=1800;dm.gain.value=.3;
  d.connect(df);df.connect(dm);dm.connect(hp);d.start();RS.src.push(d)}
 RS.g.gain.setTargetAtTime(w*(TRIM.rain||1),a.currentTime,.8);clearTimeout(RS.tm);
 if(w<=0)RS.tm=setTimeout(()=>{const g=RS.g,src=RS.src;RS.g=null;RS.src=[];src.forEach(s=>{try{s.stop()}catch(e){}});try{g.disconnect()}catch(e){}},5000)}
function ambStop(){if(!AM.g||!ac)return;const g=AM.g;g.gain.setTargetAtTime(0,ac.currentTime,.4);setTimeout(()=>{try{g.disconnect()}catch(e){}},2200);AM.g=null;AM.rv=null;AM.k=null;AM.at={}}
// os bichos passam pelo ganho do mundo (volume calibrado em TRIM e saída suave ao trocar de mundo); o eco da mata (reverb própria) também,
// para o controle de volume do ambiente valer para ele
function ambSet(k){ambStop();const a=AC(),g=a.createGain();g.gain.value=0;g.gain.setTargetAtTime(TRIM['amb_'+k]||1,a.currentTime,1.2);g.connect(a.bgG);AM.g=g;AM.k=k;
 const cv=a.createConvolver();cv.buffer=a.amIR||(a.amIR=irBuf(a));cv.connect(g);AM.rv=cv;
 AM.frog=[0,0,0].map(()=>900+Math.random()*350);// três pererecas, cada uma na sua altura
 // três pássaros, cada um com seu canto (pelo retrato de uma gravação): altura entre 2,2 e 4,4 kHz, sílaba de 15 a 65 ms em deslize
 // (sobe e desce), descendente, em degrau (nota alta e outra abaixo) ou trinado; 2 a 6 sílabas por frase com 60 a 200 ms entre elas
 AM.bird=[0,0,0].map(()=>{const R=Math.random;return{f:2200+R()*2200,ty:R()*4|0,d:.015+R()*.05,gap:.06+R()*.14,n:2+(R()*4|0)}})}
// dispara um evento pontual: o primeiro cai em algum ponto do intervalo (nunca de cara), os seguintes entre lo e hi ms
function amDue(k,now,lo,hi){if(AM.at[k]===undefined)AM.at[k]=now+Math.random()*hi*.5;if(now<AM.at[k])return false;AM.at[k]=now+lo+Math.random()*(hi-lo);return true}
// lugar do chamado: d = distância (0 perto, 1 longe). Longe fica mais baixo, o ar come os agudos (passa-baixa de 13 kHz a 3,5 kHz) e
// sobra mais eco da mata; o lado vai no estéreo. Os sons do chamado saem por aqui (SB='amX')
function amSpot(a,d){const g=a.createGain(),lp=a.createBiquadFilter(),s=a.createGain();g.gain.value=1-.5*d;lp.type='lowpass';lp.frequency.value=13000-9500*d;lp.Q.value=.5;g.connect(lp);
 if(a.createStereoPanner){const p=a.createStereoPanner();p.pan.value=(Math.random()*2-1)*.75;lp.connect(p);p.connect(AM.g)}else lp.connect(AM.g);
 s.gain.value=.1+.35*d;lp.connect(s);s.connect(AM.rv);a.amX=g;SB='amX'}
// envelope liso: sobe em seno² até k (fração da duração) e desce em cosseno², como um assobio ou uma voz (sem estalo nem corte seco)
function amEnv(g,t,d,v,k){const c=new Float32Array(32);for(let i=0;i<32;i++){const x=i/31;c[i]=v*SV*(x<k?Math.pow(Math.sin(x/k*Math.PI/2),2):Math.pow(Math.cos((x-k)/(1-k)*Math.PI/2),2))}g.gain.value=0;g.gain.setValueCurveAtTime(c,t,d)}
// assobio de ave: altura de f0 a f1 (passando por mid, se houver), vibrato opcional e harmônico h2 (uma oitava acima) para timbres mais ásperos
function amTone(f0,f1,t,d,v,o){o=o||{};const a=AC();
 for(const[m,lv]of o.h2?[[1,1],[2,o.h2]]:[[1,1]]){const os=a.createOscillator(),g=a.createGain();os.type=o.ty||'sine';os.frequency.setValueAtTime(f0*m,t);
  if(o.mid){os.frequency.exponentialRampToValueAtTime(o.mid*m,t+d*.4);os.frequency.exponentialRampToValueAtTime(f1*m,t+d)}else if(f1!==f0)os.frequency.exponentialRampToValueAtTime(f1*m,t+d);
  if(o.vib){const l=a.createOscillator(),lg=a.createGain();l.frequency.value=o.vib;lg.gain.value=f0*m*(o.vd||.02);l.connect(lg);lg.connect(os.frequency);l.start(t);l.stop(t+d+.02)}
  amEnv(g,t,d,v*lv,o.k||.25);os.connect(g);g.connect(a[SB]);os.start(t);os.stop(t+d+.02)}}
// voz de bicho: onda rica (dente de serra) com a altura seguindo fs, filtrada pelos formantes fm = [[freq, Q, ganho, freq no meio]] (a
// boca abrindo e fechando), tremido am (Hz, profundidade ad) e sopro br (ruído em volta de br Hz, volume bv)
function amVox(fs,t,d,v,fm,o){o=o||{};const a=AC(),os=a.createOscillator(),sum=a.createGain(),g=a.createGain();os.type='sawtooth';os.frequency.setValueAtTime(fs[0],t);
 for(let i=1;i<fs.length;i++)os.frequency.exponentialRampToValueAtTime(fs[i],t+d*i/(fs.length-1));
 for(const[f,q,lv,f2]of fm){const b=a.createBiquadFilter(),bg=a.createGain();b.type='bandpass';b.frequency.setValueAtTime(f,t);if(f2){b.frequency.linearRampToValueAtTime(f2,t+d*.45);b.frequency.linearRampToValueAtTime(f,t+d)}b.Q.value=q;bg.gain.value=lv;os.connect(b);b.connect(bg);bg.connect(sum)}
 if(o.am){const l=a.createOscillator(),lg=a.createGain(),m=a.createGain();m.gain.value=1-o.ad;l.frequency.value=o.am;lg.gain.value=o.ad;l.connect(lg);lg.connect(m.gain);sum.connect(m);m.connect(g);l.start(t);l.stop(t+d+.02)}else sum.connect(g);
 amEnv(g,t,d,v,o.k||.2);g.connect(a[SB]);os.start(t);os.stop(t+d+.02);
 if(o.br)burst(t,d,o.br,v*o.bv,1.5,{at:d*.3})}
// intervalo de cada bicho (ms): os comuns voltam em segundos, as aves do bioma bem mais espaçadas, para o ambiente seguir calmo
const AMB_EVERY={bubbles:[600,2200],croak:[2000,7000],frogs:[1200,4500],hoot:[9000,20000],tap:[7000,18000],goat:[8000,20000],birds:[2500,9000],moo:[12000,26000],
 arara:[16000,34000],seriema:[25000,50000],sabia:[12000,26000],rolinha:[20000,40000],bemtevi:[14000,30000],queroquero:[15000,32000]};
// o chamado de cada bicho, começando em t; R = Math.random. As alturas e os ritmos vêm de gravações reais de cada espécie
const AMB_CALL={
 // bolhas subindo na água: cada bolha é um tom que sobe rápido e some (o som de uma bolha de verdade), em grupinhos de tamanhos diferentes
 bubbles:(t,R)=>{for(let i=1+(R()*3|0),s=t;i--;s+=.04+R()*.12){const f=300+R()*800;tone('sine',f,f*1.7,s,.04+R()*.06,.05)}},
 // rã do brejo: grave (95 a 150 Hz) e áspero, em pulsos rápidos ("rrum"), 2 ou 3 vezes
 croak:(t,R)=>{const f=95+R()*55;for(let i=2+(R()*2|0);i--;)amVox([f*1.06,f*.9],t+i*(.38+R()*.1),.26,.11,[[350,4,1],[900,5,.5],[1700,6,.2]],{am:26+R()*14,ad:.85})},
 // perereca: cada nota é um trem de 4 a 7 pulsos de ruído estreito (o "crec" de verdade), em série
 frogs:(t,R)=>{const f=AM.frog[R()*AM.frog.length|0];for(let i=2+(R()*4|0);i--;){const s=t+i*(.1+R()*.03),np=4+(R()*4|0),pi=.008+R()*.004;for(let p=0;p<np;p++)burst(s+p*pi,.007,f*(1+R()*.03),.6*(1-p/np*.4),8)}},
 // coruja: duas notas graves com subida suave e um sopro por baixo (a coruja de verdade é mais ar do que apito)
 hoot:(t,R)=>{const f=310+R()*40;amTone(f,f*.9,t,.5,.033,{k:.3,h2:.08});burst(t,.5,f,.012,2,{at:.15});amTone(f*.88,f*.78,t+.62,.66,.029,{k:.3,h2:.08});burst(t+.62,.66,f*.88,.01,2,{at:.18})},
 // pica-pau: 12 a 20 batidas que aceleram e enfraquecem; cada batida é um estalo seco e a ressonância da madeira (dois modos)
 tap:(t,R)=>{const fw=650+R()*350,n=12+(R()*9|0);let s=t;for(let i=0;i<n;i++){const v=1-.5*i/n;burst(s,.006,3000,.25*v,.7,{ty:'highpass'});burst(s,.05,fw,.8*v,12);burst(s,.035,fw*2.3,.28*v,10);s+=.058-.012*i/n}},
 // cabra ao longe: "mééé" com a voz tremida (6 a 9 Hz) pelas vogais e um pouco de sopro, às vezes duas vezes
 goat:(t,R)=>{const f=300+R()*80,g=(s,k)=>amVox([f*k,f*k*1.04,f*k*.9],s,.6+R()*.25,.055,[[650,4,1],[1800,6,.55],[2700,7,.25]],{am:6+R()*3,ad:.5,br:1500,bv:.08});g(t,1);if(R()<.6)g(t+.95,1.05)},
 // pássaros: uma frase do canto de um dos três do mundo
 birds:(t,R)=>{const b=AM.bird[R()*AM.bird.length|0];let s=t;
  for(let i=b.n+(R()*3|0);i--;){const f=b.f*(1+(R()-.5)*.06),d=b.d*(.8+R()*.4);
   if(b.ty===0)amTone(f*.92,f*.96,s,d,.07,{mid:f*1.08});else if(b.ty===1)amTone(f*1.12,f*.85,s,d,.07,{k:.15});
   else if(b.ty===2){amTone(f,f,s,d*.5,.07);amTone(f*.68,f*.62,s+d*.5,d*.6,.07)}
   else{const n=6+(R()*6|0);for(let j=0;j<n;j++)amTone(f*(1.04-.08*j/n),f*(.98-.08*j/n),s+j*.034,.022,.06,{k:.2});s+=n*.034}
   s+=d+b.gap*(.7+R()*.6)}},
 // gado ao longe: mugido grave e comprido, com a boca abrindo e fechando ("mmmuuu") pelos formantes
 moo:(t,R)=>{const f=100+R()*25;amVox([f*.92,f*1.08,f*1.02,f*.9],t,1.4+R()*.5,.06,[[260,3,1,700],[800,5,.4,1150],[2300,6,.1]],{k:.25})},
 // arara: grito rouco e alto (700 a 900 Hz, com aspereza e sopro), 2 a 4 vezes, às vezes outra respondendo de outro ponto
 arara:(t,R)=>{const one=(s,f)=>{for(let i=2+(R()*3|0);i--;)amVox([f*.85,f*1.1,f*.8],s+i*(.45+R()*.3),.3+R()*.12,.06,[[1300,3,1],[2400,4,.6],[3600,5,.3]],{am:65+R()*20,ad:.4,br:2000,bv:.2})};
  one(t,700+R()*200);if(R()<.4){amSpot(AC(),.4+R()*.6);one(t+1.4+R(),650+R()*250)}},
 // seriema: série de 8 a 14 latidos agudos e roucos que descem de altura e aceleram ("cáu-cáu-cáu…"), ouvida de longe
 seriema:(t,R)=>{const n=8+(R()*7|0),f=900+R()*150;let s=t;for(let i=0;i<n;i++){const fi=f*(1-.35*i/n);amVox([fi*1.1,fi*.92],s,.09,.055,[[fi*1.6,4,1],[fi*3,5,.45]],{k:.15});s+=.15-.05*i/n}},
 // sabiá: frase flauteada de 4 a 8 notas de alturas variadas (1,6 a 3 kHz), com deslizes e um vibrato leve
 sabia:(t,R)=>{let s=t;for(let i=4+(R()*5|0);i--;){const f=1600+R()*1400,d=.08+R()*.14,up=R()<.5;amTone(f,f*(up?1.12:.88),s,d,.06,{vib:6+R()*3,vd:.012,h2:.1,k:.3});s+=d+.05+R()*.12}},
 // rolinha ("fogo-apagou"): três arrulhos graves e macios (500 a 600 Hz), a frase repetida 2 ou 3 vezes
 rolinha:(t,R)=>{const f=500+R()*100;for(let r=2+(R()*2|0),s=t;r--;s+=1.5+R()*.4){amTone(f,f*.97,s,.2,.06,{k:.35,h2:.12});amTone(f*.93,f*.9,s+.3,.17,.055,{k:.35,h2:.12});amTone(f*1.02,f*.86,s+.58,.42,.06,{k:.3,mid:f*1.05,h2:.12})}},
 // bem-te-vi: "bem-te-VI", duas sílabas curtas e a última longa que sobe e cai, com o timbre meio áspero (harmônico forte)
 bemtevi:(t,R)=>{const f=1900+R()*300;for(let r=1+(R()<.4?1:0),s=t;r--;s+=1.3+R()*.4){amTone(f*.95,f*1.05,s,.11,.07,{h2:.3});amTone(f*1.25,f*1.2,s+.16,.06,.065,{h2:.3});amTone(f*1.3,f*.82,s+.3,.28,.075,{mid:f*1.45,h2:.35,k:.3})}},
 // quero-quero: pares de gritos agudos e metálicos ("qué-ro"), 3 a 6 pares
 queroquero:(t,R)=>{const f=2300+R()*400;for(let i=3+(R()*4|0),s=t;i--;s+=.3+R()*.08){amTone(f,f*.92,s,.09,.05,{ty:'triangle',h2:.4,k:.15});burst(s,.03,f*1.5,.05,2);amTone(f*.84,f*.8,s+.12,.07,.045,{ty:'triangle',h2:.4,k:.15})}}};
// volume de cada bicho, medido sozinho na mesma distância: deixa todos perto dos pássaros (rãs, pererecas e bolhas, que voltam mais vezes,
// um pouco abaixo); o volume de cada mundo é calibrado depois em TRIM (amb_*)
const AMB_LV={bubbles:1.3,croak:1.9,frogs:1.9,hoot:.85,tap:1,goat:1,birds:1,moo:1,arara:1,seriema:1,sabia:.78,rolinha:.66,bemtevi:.5,queroquero:1};
function ambTick(now){const ks=AMB[AM.k]||[],a=AC(),t=a.currentTime,R=Math.random;
 // cada bicho no seu ritmo; o chamado sai de um ponto sorteado (amSpot), mais longe do que perto
 for(const k of ks){const e=AMB_EVERY[k];if(e&&amDue(k,now,e[0],e[1])){SV=AMB_LV[k]||1;amSpot(a,.25+.75*R());AMB_CALL[k](t,R)}}
 SV=1;SB='sfxG'}
// por quadro: passos, pulo/aterrissagem, sentar/levantar e ambiente
function sfxTick(dt){const now=performance.now();
 musSync();
 if(mode!=='play'||document.hidden){if(AM.g)ambStop();return}
 if(CUR&&AM.k!==CUR&&ac)ambSet(CUR);
 if(AM.g)ambTick(now);
 if(!ac)return;
 for(let n=-1,it=actors.values();n<actors.size;n++){const a=n<0?me:it.next().value;if(!a||!a.g)continue;const p=a.g.position,air=p.y>.12;
  if(a._sit!==undefined&&a._sit!==!!a.sit){const v=dvol(a);if(v>.03)sfx(a.sit?'sit':'stand',v)}a._sit=!!a.sit;
  if(a._air!==undefined&&a._air!==air){const v=dvol(a);if(v>.03)sfx(air?'jump':'land',v)}a._air=air;
  if(a._sx!==undefined){const d=Math.hypot(p.x-a._sx,p.z-a._sz);if(d<1.5&&!a.sit&&!air){a._st=(a._st||0)+d;if(a._st>.8){a._st=0;const v=dvol(a);if(v>.04)sfx('step_'+(STEPK[CUR]||'sand'),v*.8)}}}
  a._sx=p.x;a._sz=p.z}}

// Retorno de interface (regras.md 13.1): som da ação e, no elemento, um pulso de brilho (deu certo) ou uma tremida curta (erro). Com
// "reduzir movimento" a tremida vira um contorno de alerta (app.css). O som sai um instante depois do clique do botão, para ler como
// "clique → resultado". k troca o som; sem elemento, fica só o som (quando o visual já é outro, como a linha no chat).
function fb(el,ok,k){setTimeout(()=>sfx(k||(ok?'confirm':'erro'),ok?.8:.9),60);if(!el||!el.classList)return;const c=ok?'fbok':'fberr';el.classList.remove('fbok','fberr');void el.offsetWidth;el.classList.add(c);setTimeout(()=>el.classList.remove(c),700)}
