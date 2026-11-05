/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Microfone e voz WebRTC.
 * Os arquivos assets/app-*.js são scripts comuns carregados em ordem pelo index.html e dividem o mesmo escopo global: o que um
 * declara no nível de cima, os seguintes enxergam. Código que roda ao carregar só pode usar o que já veio antes.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
// ---------- microfone / voz WebRTC ----------
const MAX_VOICE_PEERS=8,VOICE_IDLE=90000,VOICE_DENY=15000,ICE_REFRESH=2700000;
// ---------- perfil único de áudio (testável) ----------
// Um só perfil para conversa e música. Mono 48 kHz (o Opus sempre codifica em
// 48 kHz): o karaokê toca a música localmente em cada cliente, então pelo WebRTC
// só viaja o microfone do cantor. Teto de 48 kbps na voz direta, 40 kbps pelo
// relay e 32 kbps em salas cheias (5+ conexões de voz).
const VOICE_PROFILE={name:'Voz & Música',kbps:48,relayKbps:40,crowdKbps:32,stereo:false,music:true,dtx:false};
const CROWD_PEERS=5;
const MUSIC_HOLD=3,MUSIC_OPEN=.006;
const MIC_FX={echoCancellation:'Cancelamento de eco',noiseSuppression:'Redução de ruído',autoGainControl:'Ganho automático'};
const MIC_FX_KEYS=Object.keys(MIC_FX);
// O eco vem ligado: sem ele, o alto-falante devolve o karaokê e as vozes da sala
// para o microfone. Ruído e ganho ficam desligados para preservar a dinâmica da
// cantoria; o jogador pode marcar cada um em Ajustes.
const MIC_FX_DEFAULT={echoCancellation:true,noiseSuppression:false,autoGainControl:false};
function parseMicFx(raw){
 const out={...MIC_FX_DEFAULT};let v=raw;
 if(typeof raw==='string'){try{v=JSON.parse(raw)}catch(e){return out}}
 if(v&&typeof v==='object')for(const k of MIC_FX_KEYS)if(typeof v[k]==='boolean')out[k]=v[k];
 return out;
}
function micFxConstraints(fx){
 const out={channelCount:1,sampleRate:{ideal:48000}},p=parseMicFx(fx);
 for(const k of MIC_FX_KEYS)out[k]=p[k];
 return out;
}
function effectiveVoice(relay,crowd){
 const r=!!relay,c=!!crowd;
 const kbps=c?VOICE_PROFILE.crowdKbps:r?VOICE_PROFILE.relayKbps:VOICE_PROFILE.kbps;
 return {name:VOICE_PROFILE.name,kbps,stereo:false,music:true,dtx:false,relay:r,crowd:c};
}
// Gate musical: abre com som, mantém por MUSIC_HOLD segundos e só então fecha,
// para não cortar a cauda de notas e acordes.
function musicGateStep(s,rms,dt){
 if(!(rms>=0))rms=0;if(!(dt>0))dt=0;
 if(rms>MUSIC_OPEN){s.talk=true;s.hold=MUSIC_HOLD}
 else if(s.talk){s.hold=Math.max(0,s.hold-dt);if(s.hold===0)s.talk=false}
 return s.talk;
}
function relayFromStats(st){
 const sel=new Set(),pairs=[];
 st.forEach(s=>{if(s.type==='transport'&&s.selectedCandidatePairId)sel.add(s.selectedCandidatePairId)});
 st.forEach(s=>{if(s.type!=='candidate-pair')return;if(sel.size?sel.has(s.id):(s.selected||(s.nominated&&s.state==='succeeded')))pairs.push(s)});
 if(!pairs.length)return null;
 for(const s of pairs){const a=st.get(s.localCandidateId),b=st.get(s.remoteCandidateId);if((a&&a.candidateType==='relay')||(b&&b.candidateType==='relay'))return true}
 return false;
}
function gateNew(){return {talk:false,hold:0}}
// ---------- fim do núcleo do perfil de áudio ----------
let crowd=false,vadS=gateNew();
const peers=new Map(),denied=new Map();
// Voz privada (padrão do servidor): policy 'relay' faz o navegador usar só o TURN, então ninguém vê o IP de ninguém (o servidor também filtra
// a sinalização). voice:false = o servidor não tem TURN e desligou a voz.
let VOICE_OK=true,VOICE_RELAY=false;
function iceApply(c){VOICE_RELAY=c.policy==='relay';VOICE_OK=c.voice!==false;ICE={iceServers:c.iceServers,iceTransportPolicy:VOICE_RELAY?'relay':'all'};
 const m=$('#mic');if(m&&!VOICE_OK&&!stream){const why=c.reason==='turn'?'o servidor de voz não está configurado':'no momento';m.dataset.s='err';m.textContent='🚫';m.title='Voz indisponível: '+why;m.setAttribute('aria-label',m.title)}
 updateVoiceStatus()}
let ICE={iceServers:[{urls:'stun:stun.l.google.com:19302'}],iceTransportPolicy:'all'},iceAt=0,localTrack=null,vol=1,stream,ctx,an,buf,hold=0,lastTalk=false;
function peerDist2(id){const a=actors.get(id);if(!a)return Infinity;const dx=(a.tx??a.g.position.x)-me.g.position.x,dz=(a.tz??a.g.position.z)-me.g.position.z;return dx*dx+dz*dz}
function rankedPeers(){const out=[];for(const a of actors.values()){if(a.bot||a.id===me.id)continue;out.push([a.id,peerDist2(a.id)])}out.sort((x,y)=>x[1]-y[1]);return out}
function tuneSdp(sdp){
 const nl=sdp.includes('\r\n')?'\r\n':'\n',lines=sdp.split(nl),pts=new Set(),PT=['a=ptime:40','a=maxptime:60'];let added=false;
 for(const l of lines){const m=l.match(/^a=rtpmap:(\d+) opus\/48000(?:\/\d+)?$/i);if(m)pts.add(m[1])}
 const out=[];
 for(const l of lines){
  if(/^a=(?:max)?ptime:/.test(l))continue;
  const m=l.match(/^a=fmtp:(\d+)(?: (.*))?$/);
  if(!m||!pts.has(m[1])){out.push(l);continue}
  const kv={};for(const q of (m[2]||'').split(';')){const i=q.indexOf('=');if(i>0)kv[q.slice(0,i).trim()]=q.slice(i+1).trim();else if(q.trim())kv[q.trim()]=''}
  kv.usedtx='0';kv.maxaveragebitrate=String(VOICE_PROFILE.kbps*1000);kv.stereo='0';kv['sprop-stereo']='0';kv.cbr='0';
  out.push('a=fmtp:'+m[1]+' '+Object.entries(kv).map(([k,v])=>v===''?k:k+'='+v).join(';'));
  if(!added){out.push(...PT);added=true}
 }
 if(!added){const i=out.findIndex(l=>/^a=rtpmap:\d+ opus\/48000/i.test(l));if(i>=0)out.splice(i+1,0,...PT)}
 return out.join(nl)
}
// sem RED: ele repete cada quadro Opus e quase dobra a banda; o FEC embutido (useinbandfec) continua
function preferNoRed(tr){try{if(!tr||!tr.setCodecPreferences||typeof RTCRtpReceiver==='undefined'||!RTCRtpReceiver.getCapabilities)return;const c=RTCRtpReceiver.getCapabilities('audio');if(!c||!c.codecs)return;const f=c.codecs.filter(x=>!/^audio\/red$/i.test(x.mimeType));if(f.length&&f.length<c.codecs.length)tr.setCodecPreferences(f)}catch(e){}}
async function tuneSender(p){const s=p&&p.tr&&p.tr.sender;if(!s)return;const e=effectiveVoice(p.relay,crowd),key=e.kbps+':'+e.dtx;if(p.tuned===key)return;p.tuned=key;let ok=false;try{const a=s.getParameters();if(!a.encodings||!a.encodings.length)a.encodings=[{}];a.encodings[0].maxBitrate=e.kbps*1000;await s.setParameters(a);ok=true}catch(x){}try{const a=s.getParameters();if(a.encodings&&a.encodings[0]){a.encodings[0].dtx=e.dtx;await s.setParameters(a)}}catch(x){}
 if(ok)p.tuneTry=0;else{p.tuned='';p.tuneTry=(p.tuneTry||0)+1;if(p.tuneTry<=3)setTimeout(()=>{if(p.pc&&p.pc.connectionState!=='closed')tuneSender(p)},1000*p.tuneTry)}
 updateVoiceStatus()}
function updateVoiceStatus(){const el=$('#voiceQMsg');if(!el)return;const e=effectiveVoice(VOICE_RELAY,crowd);let msg='Transmissão em mono a '+e.kbps+' kbps.';if(crowd)msg+=' Em salas com muitas pessoas, a qualidade é reduzida automaticamente.';if(!VOICE_OK)msg='Voz indisponível: o servidor não tem TURN configurado. Para teste local, use VOICE_PRIVACY=direct.';else if(!voiceOn())msg='Microfone desligado. Você só ouve a sala ao ligar sua voz.';else if(peers.size)msg='Conectado a '+peers.size+(peers.size===1?' pessoa':' pessoas')+'. '+msg;el.textContent=msg}
function syncCrowd(){const c=peers.size>=CROWD_PEERS;if(c===crowd)return;crowd=c;peers.forEach(p=>{p.tuned=''});retuneAll()}
function retuneAll(){peers.forEach(p=>{syncSender(p);tuneSender(p)});updateVoiceStatus()}
function syncSender(p){if(!p||!p.tr)return;const t=me.talk&&localTrack?localTrack:null;if(p.sent===t)return;p.sent=t;p.tr.sender.replaceTrack(t).catch(()=>{})}
function syncSenders(){peers.forEach(syncSender)}
function ensureSlot(id){
 if(peers.has(id))return true;
 if(peers.size<MAX_VOICE_PEERS)return true;
 let victim=null,vd=-1;
 for(const pid of peers.keys()){const d=peerDist2(pid);if(d>vd){vd=d;victim=pid}}
 const nd=peerDist2(id);
 if(victim&&nd<vd){denied.set(victim,Date.now()+VOICE_DENY);closePeer(victim,true);return true}
 return false
}
function mkPeer(id,isAns){const pc=new RTCPeerConnection(ICE),p={pc,tr:null,sent:undefined,lastActive:Date.now(),ok:0,q:[],relay:false,tuned:''};if(!isAns){p.tr=pc.addTransceiver('audio',{direction:'sendrecv'});preferNoRed(p.tr);syncSender(p)}
 pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'){say('','⚠ Não foi possível conectar a voz com um jogador.',1);closePeer(id,true)}else if(pc.connectionState==='connected')refreshRoute(p)};
 pc.onicecandidate=e=>e.candidate&&send({t:'sig',to:id,data:{c:e.candidate}});
 pc.ontrack=e=>{let au=document.getElementById('au'+id);if(!au){au=document.createElement('audio');au.id='au'+id;au.autoplay=true;document.body.append(au)}au.srcObject=e.streams[0]||new MediaStream([e.track]);au.volume=vol;au.muted=muted(id)||!voiceOn();au.play&&au.play().catch(()=>{});try{const a_=AC(),src=a_.createMediaStreamSource(au.srcObject),an=a_.createAnalyser();an.fftSize=256;src.connect(an);const pr=peers.get(id);if(pr){pr.an=an;pr.ab=new Float32Array(256);pr.src=src}}catch(x){}};
 peers.set(id,p);syncCrowd();updateVoiceStatus();return p}
async function refreshRoute(p){if(!p||!p.pc)return;try{const st=await p.pc.getStats(),relay=relayFromStats(st);if(relay===null||p.relay===relay)return;p.relay=relay;p.tuned='';tuneSender(p);updateVoiceStatus()}catch(e){}}
async function callPeer(id){if(peers.has(id)||(denied.get(id)||0)>Date.now()||!ensureSlot(id))return;try{const p=mkPeer(id),off=await p.pc.createOffer(),sdp=tuneSdp(off.sdp);await p.pc.setLocalDescription({type:'offer',sdp});tuneSender(p);send({t:'sig',to:id,data:{d:{type:'offer',sdp}}})}catch(e){closePeer(id,false)}}
function onRemoteSpeak(id){if(mode!=='play'||id===me.id)return;const p=peers.get(id);if(p){p.lastActive=Date.now();return}if((denied.get(id)||0)>Date.now())return;if(me.id<id)callPeer(id)}
function onLocalSpeak(){if(mode!=='play'||!me.talk)return;const r=rankedPeers();for(let i=0;i<r.length&&i<MAX_VOICE_PEERS;i++){const id=r[i][0],p=peers.get(id);if(p){p.lastActive=Date.now();continue}if(me.id<id)callPeer(id)}}
const sq=new Map();
function onSig(m){const prev=sq.get(m.from)||Promise.resolve();sq.set(m.from,prev.then(()=>doSig(m)).catch(()=>{}))}
async function flush(p){for(const c of p.q||[])await p.pc.addIceCandidate(c).catch(()=>{});p.q=[]}
async function doSig(m){let p=peers.get(m.from);const d=m.data;
if(d.x){if(d.x==='close')closePeer(m.from,false);else if(d.x==='busy'){denied.set(m.from,Date.now()+VOICE_DENY);closePeer(m.from,false)}return}
if(d.d){if(d.d.type==='offer'){if(!p){if((denied.get(m.from)||0)>Date.now()||!ensureSlot(m.from)){send({t:'sig',to:m.from,data:{x:'busy'}});return}p=mkPeer(m.from,true)}await p.pc.setRemoteDescription(d.d);{const t=p.pc.getTransceivers().find(x=>x.receiver&&x.receiver.track&&x.receiver.track.kind==='audio');if(t){t.direction='sendrecv';p.tr=t;preferNoRed(t);syncSender(p)}}p.ok=1;await flush(p);const ans=await p.pc.createAnswer(),sdp=tuneSdp(ans.sdp);await p.pc.setLocalDescription({type:'answer',sdp});tuneSender(p);send({t:'sig',to:m.from,data:{d:{type:'answer',sdp}}})}else if(p){await p.pc.setRemoteDescription(d.d);p.ok=1;await flush(p);tuneSender(p)}}
else if(d.c&&p){if(p.ok)await p.pc.addIceCandidate(d.c).catch(()=>{});else(p.q=p.q||[]).push(d.c)}}
function closePeer(id,notify=true){const p=peers.get(id);if(!p)return;peers.delete(id);syncCrowd();if(notify)send({t:'sig',to:id,data:{x:'close'}});try{p.pc.onicecandidate=p.pc.ontrack=p.pc.onconnectionstatechange=null;p.pc.close()}catch(e){}try{p.src&&p.src.disconnect();p.an&&p.an.disconnect()}catch(e){}const au=document.getElementById('au'+id);if(au){au.srcObject=null;au.remove()}updateVoiceStatus()}
addEventListener('click',()=>document.querySelectorAll('audio').forEach(a=>a.paused&&a.srcObject&&a.play().catch(()=>{})));
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('button');if(b&&!b.disabled&&!b.closest('#emoGrid'))sfx('click',.7)},true);
[['sSfx','sfxG'],['sSfxBg','bgG']].forEach(([id,bus])=>{const s=$('#'+id);s.value=VOLS[bus][1];s.oninput=e=>{const v=Math.min(1,Math.max(0,+e.target.value||0));VOLS[bus][1]=v;if(ac)ac[bus].gain.setTargetAtTime(v,ac.currentTime,.05);try{localStorage.setItem(VOLS[bus][0],v)}catch(_){}};s.onchange=()=>{if(bus==='sfxG')sfx('e_pop');else if(ac&&AM.g){SV=1;SB='bgG';burst(AC().currentTime,1.4,450,.5,.6,{at:.25,f1:300});SB='sfxG'}}});
$('#sVol').oninput=e=>{vol=+e.target.value;document.querySelectorAll('audio').forEach(a=>a.volume=vol)};
const micTxt=t=>{const m=$('#mic'),s=/ATIVO/.test(t)?'on':/🚫/.test(t)?'err':'off',act=s==='on'?'clique para desativar':'clique para ativar',note=s==='on'?'':' · você não está ouvindo a sala',lb=t+note+' · '+act;m.textContent=s==='err'?'🚫':'🎤';m.title=lb;m.setAttribute('aria-label',lb);m.dataset.s=s;m.setAttribute('aria-pressed',String(s==='on'));};
const FX_KEY='skyke_mic_fx';
let micFxPrefs=parseMicFx((()=>{try{return localStorage.getItem(FX_KEY)}catch(e){return null}})());
function micConstraints(){return {audio:micFxConstraints(micFxPrefs)}}
const MIC_FX_INPUT={echoCancellation:'sAec',noiseSuppression:'sNs',autoGainControl:'sAgc'};
function micFxSupported(){
 const out={};for(const k of MIC_FX_KEYS)out[k]=true;
 try{const s=navigator.mediaDevices?.getSupportedConstraints?.();if(s)for(const k of MIC_FX_KEYS)if(s[k]===false)out[k]=false}catch(e){}
 if(localTrack?.getCapabilities)try{const c=localTrack.getCapabilities()||{};for(const k of MIC_FX_KEYS){const v=c[k];if(v===false||(Array.isArray(v)&&v.length&&!v.includes(true)&&!v.includes('remote-only')))out[k]=false}}catch(e){}
 return out;
}
function micFxCanSet(k,on,sup){
 if(!(sup||micFxSupported())[k])return false;
 if(!localTrack?.getCapabilities)return true;
 try{const v=localTrack.getCapabilities()[k];if(v===false)return false;if(Array.isArray(v)&&v.length)return v.includes(on)||v.includes('remote-only')}catch(e){}
 return true;
}
function updateMicFxUI(){
 const sup=micFxSupported(),act=localTrack?.getSettings?localTrack.getSettings():null,missing=[],ignored=[];
 for(const k of MIC_FX_KEYS){
  const el=$('#'+MIC_FX_INPUT[k]);if(!el)continue;
  const can=micFxCanSet(k,micFxPrefs[k],sup);
  el.checked=micFxPrefs[k];el.disabled=!can;
  const lab=el.closest('label');
  if(lab){lab.classList.toggle('dis',el.disabled);if(el.disabled)lab.title=!sup[k]?'Não suportado neste dispositivo':'Este estado não é suportado neste dispositivo';else lab.removeAttribute('title')}
  if(!sup[k])missing.push(k);
  else if(act&&typeof act[k]==='boolean'&&act[k]!==micFxPrefs[k])ignored.push(k);
 }
 const msg=$('#micFxMsg');if(!msg)return;
 if(missing.length)msg.textContent='Este dispositivo não oferece: '+missing.map(k=>MIC_FX[k]).join(', ')+'.';
 else if(ignored.length)msg.textContent='O dispositivo não aplicou: '+ignored.map(k=>MIC_FX[k]).join(', ')+'.';
 else msg.textContent='Sem fone, deixe o cancelamento de eco ligado: ele evita vazar o karaokê e as vozes da sala. Áudio de outros aplicativos (Discord, música) só é contido com fone de ouvido.';
}
let micFxQueue=Promise.resolve();
async function applyMicFx(){
 if(!localTrack||!stream){updateMicFxUI();return}
 const act=localTrack.getSettings?localTrack.getSettings():{},want={};let need=false;
 for(const k of MIC_FX_KEYS){if(!micFxCanSet(k,micFxPrefs[k]))continue;if(act[k]===micFxPrefs[k])continue;want[k]=micFxPrefs[k];need=true}
 if(!need){updateMicFxUI();return}
 try{await localTrack.applyConstraints(want);const st=localTrack.getSettings?localTrack.getSettings():{};if(MIC_FX_KEYS.some(k=>typeof st[k]==='boolean'&&st[k]!==micFxPrefs[k]))await restartMic()}
 catch(e){await restartMic()}
 updateMicFxUI();
}
function queueMicFx(){micFxQueue=micFxQueue.then(applyMicFx).catch(()=>{updateMicFxUI()});return micFxQueue}
MIC_FX_KEYS.forEach(k=>{const el=$('#'+MIC_FX_INPUT[k]);if(!el)return;el.onchange=()=>{micFxPrefs[k]=el.checked;try{localStorage.setItem(FX_KEY,JSON.stringify(micFxPrefs))}catch(e){}updateMicFxUI();queueMicFx()}});
// Escuta condicionada: os outros só são ouvidos enquanto o microfone local estiver ligado.
function voiceOn(){return !!(stream&&localTrack)}
function applyListen(){document.querySelectorAll('audio[id^="au"]').forEach(au=>{const id=au.id.slice(2);au.muted=muted(id)||!voiceOn()})}
function releaseMic(){const s=stream,c=ctx;stream=ctx=an=buf=null;localTrack=null;vadS=gateNew();if(s)try{s.getTracks().forEach(t=>t.stop())}catch(e){}if(c)try{c.close()}catch(e){}applyListen()}
async function startMic(){if(stream)return;if(!navigator.mediaDevices?.getUserMedia){micTxt('🚫 Microfone indisponível neste navegador');return}
 try{const s=await navigator.mediaDevices.getUserMedia(micConstraints());stream=s;const a=new(window.AudioContext||window.webkitAudioContext)();ctx=a;an=a.createAnalyser();an.fftSize=512;buf=new Float32Array(512);const src=a.createMediaStreamSource(s);src.connect(an);
 {const sp=a.createScriptProcessor(2048,1,1),dt=2048/a.sampleRate;src.connect(sp);sp.connect(a.destination);sp.onaudioprocess=()=>{if(document.hidden&&ctx===a)micTick(dt)}}// aba escondida: o áudio continua sendo processado (sai silêncio)
 localTrack=s.getAudioTracks()[0]||null;if(!localTrack)throw new Error('sem faixa de áudio');
 localTrack.contentHint='music';syncSenders();retuneAll();applyListen();updateMicFxUI();micTxt('🎤 Microfone: ATIVO');updateVoiceStatus()}
 catch(e){releaseMic();me.talk=false;if(lastTalk){lastTalk=false;send({t:'speak',v:false})}syncSenders();micTxt('🚫 Microfone sem permissão ou indisponível');updateVoiceStatus();updateMicFxUI()}}
function stopMic(){releaseMic();me.talk=false;syncSenders();if(lastTalk){lastTalk=false;send({t:'speak',v:false})}micTxt('🎤 Microfone: desativado');updateVoiceStatus();updateMicFxUI()}
async function restartMic(){if(!stream)return;releaseMic();me.talk=false;syncSenders();if(lastTalk){lastTalk=false;send({t:'speak',v:false})}await startMic()}
$('#mic').onclick=()=>{if(stream){stopMic();return}if(!VOICE_OK){say('','🔇 A voz não está disponível no momento.',1);return}startMic()};
updateMicFxUI();
updateVoiceStatus();
setInterval(()=>{if(mode!=='play')return;const t=Date.now();for(const [id,p] of peers){if(!me.talk&&!(actors.get(id)&&actors.get(id).talk)&&t-(p.lastActive||0)>VOICE_IDLE)closePeer(id,true);else if(p.pc.connectionState==='connected')refreshRoute(p)}for(const [id,until] of denied)if(until<=t)denied.delete(id);if(t-iceAt>ICE_REFRESH){iceAt=t;send({t:'ice'})}},15000);
