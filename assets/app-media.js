/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Vídeos (assistir e karaokê) com relógio do servidor, atraso da voz do cantor, notificações e DJ.
 * Os arquivos assets/app-*.js são scripts comuns carregados em ordem pelo index.html e dividem o mesmo escopo global: o que um
 * declara no nível de cima, os seguintes enxergam. Código que roda ao carregar só pode usar o que já veio antes.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
// ---------- vídeos (assistir e karaokê) ----------
let pend=null,ytq=[];const INV={};// INV: dono → {vid,name} do vídeo em andamento de cada jogador
// Antes de carregar qualquer coisa do YouTube, o jogador fica sabendo que o player é do Google (e o que isso envia). A escolha "Continuar"
// fica salva neste navegador; "Agora não" cancela só esta vez. Os players usam o domínio youtube-nocookie (privacidade aprimorada).
let ytOkMem=false;const ytWait=[];
function ytAllowed(){if(ytOkMem)return true;try{return localStorage.getItem('skyke_yt_ok')==='1'}catch(e){return false}}
function ytConsent(cb){if(ytAllowed())return cb();ytWait.push(cb);const m=$('#pYt');if(!m.classList.contains('hide'))return;m.classList.remove('hide');$('#ytOk').focus()}
{const m=$('#pYt'),done=ok=>{m.classList.add('hide');const L=ytWait.splice(0);if(ok){ytOkMem=true;try{localStorage.setItem('skyke_yt_ok','1')}catch(e){}L.forEach(f=>f())}else say('','▶️ Vídeo não aberto. Os vídeos e o karaokê precisam do player do YouTube.',1)};
 $('#ytOk').onclick=()=>done(true);$('#ytTerms').onclick=()=>openTerms('terceiros');$('#ytNo').onclick=()=>done(false);m.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();done(false)}})}
function loadYT(cb){if(!ytAllowed())return ytConsent(()=>loadYT(cb));if(window.YT&&YT.Player)return cb();ytq.push(cb);if(!document.getElementById('ytapi')){window.onYouTubeIframeAPIReady=()=>ytq.splice(0).forEach(f=>f());const sc=document.createElement('script');sc.id='ytapi';sc.src='https://www.youtube.com/iframe_api';document.head.append(sc)}}
let kVol=100,kMute=false,vVol=100,vMute=false;
function applyVVol(){const y=VW.yt;if(!y||!y.setVolume)return;try{y.setVolume(vVol);if(vMute||vVol===0)y.mute();else y.unMute()}catch(x){}}
function applyKVol(){const y=KW.yt;if(!y||!y.setVolume)return;try{y.setVolume(kVol);if(kMute||kVol===0)y.mute();else y.unMute()}catch(x){}}
// ---------- relógio do servidor ----------
// Ping/pong de hora (tsync): de cada resposta sai a latência (rtt) e a diferença de relógio; vale a amostra com menor rtt entre as últimas,
// que é a menos distorcida pela fila da rede. srvNow() é a hora do servidor vista deste cliente (precisão de poucos ms).
const CLK={off:0,rtt:0,s:[]};
const srvNow=()=>Date.now()+CLK.off;
function clkSample(m){const now=Date.now(),rtt=now-m.c;if(!(rtt>=0&&rtt<10000)||typeof m.s!=='number')return;CLK.s.push({rtt,off:m.s-(m.c+rtt/2)});if(CLK.s.length>8)CLK.s.shift();
 const b=CLK.s.reduce((a,x)=>x.rtt<a.rtt?x:a);CLK.off=b.off;CLK.rtt=b.rtt}
function clkBurst(){CLK.s=[];for(let i=0;i<5;i++)setTimeout(()=>send({t:'tsync',c:Date.now()}),i*300)}
setInterval(()=>{if(ws&&ws.readyState===1&&session)send({t:'tsync',c:Date.now()})},15000);
// ---------- atraso da voz do cantor (karaokê) ----------
// Mede no WebRTC quanto a voz de quem canta demora até sair no alto-falante: metade do ida-e-volta + o buffer de jitter + ~40 ms de
// captura/codificação/reprodução. O vídeo de quem ouve fica esse tanto atrás do vídeo do cantor.
const KLAG={id:null,v:0,t:0};
function kLag(){const h=kq[0];return h&&KLAG.id===h.id?KLAG.v:0}
async function kLagMeasure(){const h=kq[0];if(!h||h.id===me.id||!isK(me.id)){KLAG.id=null;return}const p=peers.get(h.id);if(!p||!p.pc){KLAG.id=null;return}
 try{const st=await p.pc.getStats();let jb=0,rtt=0,sel=new Set();st.forEach(s=>{if(s.type==='transport'&&s.selectedCandidatePairId)sel.add(s.selectedCandidatePairId)});
  st.forEach(s=>{if(s.type==='inbound-rtp'&&s.kind==='audio'&&s.jitterBufferEmittedCount>0)jb=s.jitterBufferDelay/s.jitterBufferEmittedCount;
   if(s.type==='candidate-pair'&&(sel.has(s.id)||(!sel.size&&s.nominated&&s.state==='succeeded'))&&typeof s.currentRoundTripTime==='number')rtt=s.currentRoundTripTime});
  const v=Math.min(1.5,rtt/2+jb+.04);KLAG.v=KLAG.id===h.id?KLAG.v+(v-KLAG.v)*.3:v;KLAG.id=h.id}catch(x){}}
setInterval(()=>{if(KW.id&&!KW.ctl)kLagMeasure()},2000);
function VP(boxId,ytId_,type){const o={yt:null,ctl:false,id:null,owner:null,iv:null,sv:null,ref:null,rate:1,drift:0,turn:-1};
 o.open=(id,ctl)=>{o.close();o.id=id;o.ctl=ctl;$('#'+boxId).innerHTML='<div id="'+ytId_+'"></div>';
  loadYT(()=>{if(o.id!==id)return;o.yt=new YT.Player(ytId_,{host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',videoId:id,playerVars:{autoplay:1,rel:0,playsinline:1,controls:(ctl||type==='v')?1:0,disablekb:1},events:{onReady:e=>{e.target.playVideo();if(type==='k')applyKVol();else applyVVol()},
   onStateChange:e=>{if(!o.ctl||!o.yt)return;const st=e.data;if(st===1||st===2)send({t:type+'sync',time:o.yt.getCurrentTime(),playing:st===1,ts:srvNow()});
    if(type==='k'){if(st===1){try{send({t:'kdur',d:o.yt.getDuration()})}catch(x){}}if(st===0)send({t:'kend'})}
    else if(st===0){send({t:'vend'});endedState(180000)}}}});
   if(ctl)o.iv=setInterval(()=>{try{send({t:type+'sync',time:o.yt.getCurrentTime(),playing:o.yt.getPlayerState()===1,ts:srvNow()})}catch(x){}},1000);else o.sv=setInterval(o.tick,250)})};
 o.close=()=>{clearInterval(o.iv);clearInterval(o.sv);o.ref=null;o.rate=1;if(o.yt){try{o.yt.destroy()}catch(x){}o.yt=null}$('#'+boxId).innerHTML='';o.id=null;o.ctl=false;o.owner=null};
 // Espectador: guarda a referência do dono (posição + hora do servidor em que foi lida) e corrige a cada 250 ms. A posição-alvo anda
 // junto com o relógio do servidor, então a demora da mensagem não atrasa ninguém. Diferença grande: salta (seekTo); pequena: acelera
 // ou freia um pouco (1,25× / 0,75×) até alcançar, sem pulos audíveis. Pausa e posição do dono valem para todos. No karaokê o vídeo
 // fica atrás do cantor o mesmo tanto que a voz dele demora a chegar (kLag), para música e voz baterem.
 o.apply=m=>{if(o.ctl)return;o.ref={time:m.time,playing:m.playing,at:typeof m.at==='number'?m.at:srvNow()};o.tick()};
 o.setRate=r=>{if(o.rate===r||!o.yt||!o.yt.setPlaybackRate)return;try{const av=o.yt.getAvailablePlaybackRates?o.yt.getAvailablePlaybackRates():[1];if(r!==1&&av.indexOf(r)<0)return;o.yt.setPlaybackRate(r);o.rate=r}catch(x){}};
 o.tick=()=>{const y=o.yt,r=o.ref;if(!y||o.ctl||!r||!y.getCurrentTime||!y.getPlayerState)return;try{
  const st=y.getPlayerState(),lag=type==='k'?kLag():0,target=r.playing?r.time+Math.max(0,srvNow()-r.at)/1000-lag:r.time,cur=y.getCurrentTime(),d=target-cur;o.drift=d;
  if(!r.playing){if(st===1||st===3)y.pauseVideo();if(Math.abs(d)>.25)y.seekTo(Math.max(0,target),true);o.setRate(1);return}
  if(target<0){if(st===1)y.pauseVideo();if(cur>.2)y.seekTo(0,true);return}// início do karaokê: espera a voz do cantor chegar
  if(st===3)return;
  if(st!==1){if(Math.abs(d)>.25)y.seekTo(target,true);y.playVideo();return}
  if(Math.abs(d)>1.2){y.seekTo(target+.15,true);o.setRate(1);return}
  if(d>.12)o.setRate(1.25);else if(d<-.12)o.setRate(.75);else if(Math.abs(d)<.04)o.setRate(1)}catch(x){}};
 return o}
const VW=VP('vbox','ytp','v'),KW=VP('kbox','kyt','k');
let swapWait=null,swapTm=0;
function clearSwapWait(){if(swapTm)clearTimeout(swapTm);swapTm=0;swapWait=null;const b=$('#vswap');if(b)b.disabled=false}
const fsElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
function exitFullscreenIf(el){if(fsElement()!==el)return;const f=document.exitFullscreen||document.webkitExitFullscreen;if(!f)return;try{const r=f.call(document);if(r&&r.catch)r.catch(()=>{})}catch(e){}}
function syncFullscreenBtns(){const cur=fsElement();[['vfs','vstage'],['kfs','kstage']].forEach(([b,s])=>{const btn=$('#'+b),st=$('#'+s);if(!btn||!st)return;const on=cur===st;btn.textContent=on?'🗗':'⛶';btn.title=on?'Sair da tela cheia':'Tela cheia';btn.setAttribute('aria-label',btn.title);btn.setAttribute('aria-pressed',String(on))})}
function toggleFullscreen(stage){if(fsElement()===stage){exitFullscreenIf(stage);return}const req=stage.requestFullscreen||stage.webkitRequestFullscreen;if(!req){say('','⚠ Tela cheia não está disponível neste navegador.',1);return}try{const r=req.call(stage);if(r&&r.catch)r.catch(()=>say('','⚠ Não foi possível entrar em tela cheia.',1))}catch(e){say('','⚠ Não foi possível entrar em tela cheia.',1)}}
['fullscreenchange','webkitfullscreenchange'].forEach(ev=>document.addEventListener(ev,syncFullscreenBtns));
$('#vfs').onclick=e=>{e.stopPropagation();toggleFullscreen($('#vstage'))};
$('#kfs').onclick=e=>{e.stopPropagation();toggleFullscreen($('#kstage'))};
syncFullscreenBtns();
// vídeo terminou: a janela espera até 3 min por um novo vídeo; sem ele ela fecha sozinha (o servidor também avisa com vstop)
let endTm=0,endAt=0;
function clearEnded(){clearInterval(endTm);endTm=0;VW.ended=false;$('#vendMsg').textContent=''}
function endedState(left){if(!VW.id)return;VW.ended=true;try{VW.yt&&VW.yt.stopVideo&&VW.yt.stopVideo()}catch(e){}endAt=Date.now()+(left||180000);clearInterval(endTm);if(VW.ctl)$('#vchange').classList.remove('hide');
 const tick=()=>{const s=Math.max(0,Math.ceil((endAt-Date.now())/1000)),t=Math.floor(s/60)+':'+String(s%60).padStart(2,'0'),who=(INV[VW.owner]||{}).name||'quem iniciou';$('#vendMsg').textContent=VW.ctl?'⏳ O vídeo terminou. Coloque um novo vídeo em '+t+' ou esta janela fecha sozinha.':'⏳ O vídeo terminou. Aguardando um novo vídeo de '+who+'; esta janela fecha em '+t+'.';
  if(!s){closeVid(false);say('','A janela de vídeo foi fechada: ninguém colocou um novo vídeo.',1)}};tick();endTm=setInterval(tick,1000)}
function openVid(id,ctl,owner){clearEnded();if(!ctl)clearSwapWait();if(VW.id&&!VW.ctl&&VW.owner&&VW.owner!==owner)send({t:'vleave',by:VW.owner});VW.open(id,ctl);VW.owner=ctl?me.id:owner;$('#pVid').classList.remove('hide');$('#vstart').classList.add('hide');$('#vwatch').classList.remove('hide');$('#vchange').classList.toggle('hide',!ctl);$('#vchangeMsg').textContent='';$('#vendMsg').textContent='';$('#vurl2').value=''}
function closeVid(notify){clearEnded();if(notify&&VW.id){if(VW.ctl)send({t:'vstop'});else if(VW.owner){const ow=VW.owner,c=INV[ow];send({t:'vleave',by:ow});if(c)ntAdd('video:'+ow,'🎬 '+c.name+' está com um vídeo em andamento. Quer voltar?',()=>{pend=null;openVid(c.vid,false,ow);send({t:'vjoin',by:ow})})}}clearSwapWait();exitFullscreenIf($('#vstage'));VW.close();$('#vwatch').classList.add('hide');$('#vchange').classList.add('hide');$('#vchangeMsg').textContent='';$('#vstart').classList.remove('hide');$('#pVid').classList.add('hide')}
// ---------- notificações: convite sem resposta em 20 s sai do balão e vai para o sino 🔔 ----------
const NT={items:[],tm:{},acc:{},seq:0,MS:20000,TTL:20*60000};
function ntRender(){const L=$('#nlist'),n=NT.items.length;L.textContent='';
 if(!n){const e=document.createElement('div');e.className='nempty';e.textContent='Nenhuma notificação.';L.append(e)}
 NT.items.forEach(it=>{const r=document.createElement('div'),t=document.createElement('span'),ts=document.createElement('span'),a=document.createElement('button'),x=document.createElement('button');r.className='ni';
  t.textContent=it.text;ts.className='ts';ts.textContent='há '+Math.max(1,Math.round((Date.now()-it.at)/60000))+' min';
  a.className='pri';a.type=x.type='button';a.textContent=it.kind==='dj'?'🎧 Ouvir':it.kind==='karaoke'?'🎤 Entrar':'▶ Assistir';x.textContent='✖';x.title='Dispensar';x.setAttribute('aria-label','Dispensar');
  a.onclick=()=>{const f=it.acc;ntDrop(it.id);$('#pNotif').classList.add('hide');$('#bNotif').setAttribute('aria-expanded','false');try{f()}catch(e){}};x.onclick=()=>ntDrop(it.id);
  r.append(t,ts,a,x);L.append(r)});
 const b=$('#bNotif');b.firstChild.textContent='🔔';let sup=b.querySelector('sup');if(n){if(!sup){sup=document.createElement('sup');b.append(sup)}sup.textContent=n}else if(sup)sup.remove();
 const lab=n?'Notificações · '+n:'Notificações';b.title=lab;b.setAttribute('aria-label',lab)}
function ntAdd(kind,text,acc){NT.items=NT.items.filter(i=>i.kind!==kind);NT.items.push({id:++NT.seq,kind,text,acc,at:Date.now()});ntRender();const b=$('#bNotif');b.classList.remove('ring');void b.offsetWidth;b.classList.add('ring')}
// notificações guardadas no sino somem sozinhas 20 minutos depois de entrarem
function ntPrune(){const now=Date.now(),n=NT.items.length;NT.items=NT.items.filter(i=>now-i.at<NT.TTL);if(NT.items.length!==n)ntRender()}
setInterval(ntPrune,15000);
function ntDrop(id){NT.items=NT.items.filter(i=>i.id!==id);ntRender()}
function ntDisarm(kind){clearTimeout(NT.tm[kind]);delete NT.tm[kind];NT.items=NT.items.filter(i=>i.kind!==kind);ntRender()}
function ntGone(kind){ntDisarm(kind);const b={dj:'#djinv',karaoke:'#kinvb',video:'#vinv'}[kind];if(b)$(b).classList.add('hide')}
// balão já exibido: se ninguém responder em 20 s, esconde o balão e guarda o convite no sino
function ntArm(kind,bSel,text,acc){ntDisarm(kind);sfx({video:'n_video',dj:'n_dj',karaoke:'n_karaoke'}[kind]||'notif');NT.tm[kind]=setTimeout(()=>{delete NT.tm[kind];$(bSel).classList.add('hide');ntAdd(kind,text,acc)},NT.MS)}
function ntOffer(kind,data,text,bSel,tSel,acc){$(tSel).textContent=text;$(bSel).classList.remove('hide');ntArm(kind,bSel,text,acc);NT.acc[kind]=acc}
function ntReset(){for(const k in INV)delete INV[k];for(const k of Object.keys(NT.tm))clearTimeout(NT.tm[k]);NT.tm={};NT.items=[];NT.acc={};ntRender();['#djinv','#kinvb','#vinv'].forEach(s=>$(s).classList.add('hide'));$('#pNotif').classList.add('hide')}
$('#bNotif').onclick=()=>{const p=$('#pNotif'),open=p.classList.contains('hide');p.classList.toggle('hide',!open);$('#bNotif').setAttribute('aria-expanded',String(open));if(open){ntPrune();ntRender()}};
$('#nclear').onclick=()=>{NT.items=[];ntRender()};
$('#djacc').onclick=()=>{const f=NT.acc.dj;ntDisarm('dj');$('#djinv').classList.add('hide');if(f)f()};
$('#djdec').onclick=()=>{ntDisarm('dj');$('#djinv').classList.add('hide')};
// ---------- DJ: rádio da sala. O áudio passa pelo servidor (proxy): a rádio não vê o IP do ouvinte ----------
const DJ={host:'',by:null,name:'',au:null,on:false,tries:0,tm:0,rk:null};
const djOk=u=>{try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password}catch(e){return false}};
function djMsg(t){$('#djmsg').textContent=t||''}
function djRender(){const has=!!DJ.host,mine=has&&DJ.by===me.id;$('#djnow').classList.toggle('hide',!has);
 if(has){$('#djwho').textContent='🎧 '+DJ.name+' · '+DJ.host;$('#djlisten').textContent=DJ.on?'⏸ Parar de ouvir':'▶ Ouvir';$('#djstop').classList.toggle('hide',!(mine||hostId===me.id))}
 $('#djset').classList.toggle('hide',has&&!mine);$('#djgo').textContent=mine?'🔁 Trocar rádio':'▶ Tocar para todos';
 $('#bDJ').classList.toggle('on',has)}
function djStopAudio(){clearTimeout(DJ.tm);if(DJ.au){try{DJ.au.pause();DJ.au.removeAttribute('src');DJ.au.load()}catch(e){}DJ.au=null}DJ.on=false}
function djListen(retry){if(!DJ.host||!session||!DJ.rk)return;if(!retry)DJ.tries=0;djStopAudio();const a=new Audio();a.referrerPolicy='no-referrer';a.preload='none';a.volume=($('#djvol').value||80)/100;
 const again=()=>{if(DJ.au!==a)return;djStopAudio();if(DJ.host&&DJ.tries<3){DJ.tries++;DJ.on=true;djRender();djMsg('Reconectando…');DJ.tm=setTimeout(()=>{if(DJ.host&&DJ.on)djListen(true)},2000)}else{djRender();djMsg('A rádio caiu ou não pôde ser tocada. Clique em Ouvir para tentar de novo.')}};
 a.onerror=again;a.onended=again;a.onplaying=()=>{if(DJ.au===a){DJ.tries=0;djMsg('')}};
 a.src='/radio?c='+encodeURIComponent(session.code)+'&k='+encodeURIComponent(DJ.rk);DJ.au=a;DJ.on=true;djRender();djMsg('Conectando…');
 const p=a.play();if(p&&p.catch)p.catch(e=>{if(DJ.au!==a)return;if(e&&e.name==='NotAllowedError'){djStopAudio();djRender();djMsg('Clique em Ouvir para começar.')}})}
function djReset(){djStopAudio();DJ.host='';DJ.by=null;DJ.name='';djMsg('');djRender()}
$('#bDJ').onclick=()=>{$('#pDJ').classList.toggle('hide');djRender()};
$('#djgo').onclick=()=>{const u=$('#djurl').value.trim();if(!u){djMsg('Cole o link do streaming.');return}if(!djOk(u)){djMsg('⚠ Use um link https (sem usuário e senha).');return}djMsg('Validando…');send({t:'dj',url:u})};
$('#djurl').onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();$('#djgo').click()}};
$('#djlisten').onclick=()=>{if(DJ.on){djStopAudio();djRender();djMsg('')}else djListen()};
$('#djstop').onclick=()=>send({t:'djstop'});
$('#name').addEventListener('input',()=>{$('#nerr').textContent='';$('#name').removeAttribute('aria-invalid')});
$('#djvol').oninput=e=>{if(DJ.au)DJ.au.volume=e.target.value/100};
$('#bVid').onclick=()=>{if($('#pVid').classList.contains('hide'))$('#pVid').classList.remove('hide');else closeVid(true)};
$('#vgo').onclick=()=>{const id=ytId($('#vurl').value);if(!id){$('#vmsg').textContent='Link inválido. Use um link https do YouTube.';return}send({t:'video',vid:id});openVid(id,true,me.id)};
$('#vswap').onclick=()=>{if(!VW.ctl||swapWait)return;const id=ytId($('#vurl2').value);if(!id){$('#vchangeMsg').textContent='⚠ Link inválido. Use um link https do YouTube.';return}if(id===VW.id&&!VW.ended){$('#vchangeMsg').textContent='Este já é o vídeo atual.';return}swapWait=id;$('#vswap').disabled=true;$('#vchangeMsg').textContent='⏳ Trocando o vídeo…';send({t:'video',vid:id});swapTm=setTimeout(()=>{if(swapWait!==id)return;clearSwapWait();$('#vchangeMsg').textContent='⚠ Não foi possível trocar agora. Aguarde alguns segundos e tente de novo.'},5000)};
$('#vurl2').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#vswap').click()}};
$('#vdec').onclick=()=>{if(pend)ntDisarm('video:'+pend.by);pend=null;$('#vinv').classList.add('hide')};
$('#vacc').onclick=()=>{if(!pend)return;const m=pend;ntDisarm('video:'+m.by);pend=null;$('#vinv').classList.add('hide');openVid(m.vid,false,m.by);send({t:'vjoin',by:m.by})};
