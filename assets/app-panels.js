/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Karaokê, mochila, visual e gestos.
 * Os arquivos assets/app-*.js são scripts comuns carregados em ordem pelo index.html e dividem o mesmo escopo global: o que um
 * declara no nível de cima, os seguintes enxergam. Código que roda ao carregar só pode usar o que já veio antes.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
// ---------- karaokê (canal de voz principal, vídeo obrigatório) ----------
const isK=id=>kq.some(k=>k.id===id);
// karaokê minimizado: botão flutuante no topo da tela; a janela só fecha quando o jogador sai da fila
let kMin=false;
function setKMin(v){kMin=v;$('#kFloat').classList.toggle('hide',!(v&&isK(me.id)))}
function minimizeK(){$('#pKar').classList.add('hide');exitFullscreenIf($('#kstage'));setKMin(isK(me.id));if(kShowQ)placeKFila()}
const KMAX=780;
let kShowQ=false,kProbe=false,kProbeSeq=0;
function fmtDur(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
function probeDur(id,cb){
 let done=false,yt=null,box=null,iv=null,to=null;
 const finish=(d,err)=>{if(done)return;done=true;if(iv)clearInterval(iv);if(to)clearTimeout(to);try{if(yt&&yt.destroy)yt.destroy()}catch(e){}if(box&&box.parentNode)box.remove();cb(Number.isFinite(d)&&d>0?d:null,err||null)};
 box=document.createElement('div');box.className='ydur';box.setAttribute('aria-hidden','true');box.style.cssText='position:fixed;left:-9999px;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none';const holder=document.createElement('div');box.append(holder);document.body.append(box);
 to=setTimeout(()=>finish(null,'timeout'),8500);
 loadYT(()=>{if(done)return;try{yt=new YT.Player(holder,{host:'https://www.youtube-nocookie.com',width:'2',height:'2',videoId:id,playerVars:{autoplay:0,controls:0,disablekb:1,playsinline:1,rel:0},events:{onReady:e=>{try{e.target.mute();const d=e.target.getDuration();if(Number.isFinite(d)&&d>0)finish(d)}catch(x){}},onError:()=>finish(null,'error')}})}catch(e){finish(null,'error')}});
 iv=setInterval(()=>{if(done)return;try{const d=yt&&yt.getDuration&&yt.getDuration();if(Number.isFinite(d)&&d>0)finish(d)}catch(e){}},250);
}
function checkKDur(id,after){
 if(kProbe)return;
 kProbe=true;const seq=++kProbeSeq;$('#kjoin').disabled=true;$('#kset').disabled=true;$('#ksong').disabled=true;
 $('#kmsg').textContent='⏳ Verificando a duração…';
 probeDur(id,(d)=>{
  if(seq!==kProbeSeq)return;
  kProbe=false;$('#ksong').disabled=false;$('#kjoin').disabled=false;$('#kset').disabled=false;
  if(mode!=='play')return;
  if(d&&d>KMAX){renderK();$('#kmsg').textContent='⚠ Vídeo com '+fmtDur(d)+' — o limite do karaokê é 13:00.';return}
  after(d,!d?'⚠ Duração não verificada; a vez será encerrada aos 13 min.':'');
 });
}
function renderK(){const cur=kq[0],mine=kq.find(k=>k.id===me.id);
 const kc=$('#kcur');kc.className='kcur'+(cur&&cur.vid?' on':'');kc.textContent=!cur?'🎤 Ninguém na fila. Cole o link de uma música e seja o primeiro!':cur.vid?'🎶 Cantando agora: '+cur.name:'⏳ '+cur.name+' está escolhendo a música…';
 const inQ=isK(me.id),qb=$('#kshowq');if(!inQ)kShowQ=false;
 qb.classList.toggle('hide',!inQ);qb.innerHTML=(kShowQ?'🙈':'👥')+(kq.length?'<sup>'+kq.length+'</sup>':'');qb.title=(kShowQ?'Ocultar fila do karaokê':'Ver fila do karaokê')+(kq.length?' ('+kq.length+')':'');qb.setAttribute('aria-label',qb.title);qb.setAttribute('aria-expanded',String(kShowQ));
 $('#pKFila').classList.toggle('hide',!kShowQ);
 $('#kcount').textContent=kq.length?'👥 Na fila: '+kq.length+' / '+MAX:'';
 const L=$('#klist');L.innerHTML='';
 if(!kq.length){const e=document.createElement('div');e.className='kempty';e.textContent='A fila está vazia.';L.append(e)}
 kq.forEach((k,i)=>{const isMe=k.id===me.id,sing=i===0&&!!k.vid,ac=isMe?me:actors.get(k.id);
  const r=document.createElement('div');r.className='prow krow '+(sing?'cur':'wait')+(isMe?' mine':'');
  const pos=document.createElement('span');pos.className='kpos';pos.textContent=sing?'🎤':String(i+1);r.append(pos);
  const dot=document.createElement('span');dot.className='pdot';dot.style.background=PAL[((isMe?cfg:ac&&ac.cfg)||{}).shirt||0];r.append(dot);
  const inf=document.createElement('div');inf.className='kinfo';
  const n=document.createElement('span');n.className='pname';n.textContent=k.name;n.title=k.name;inf.append(n);
  const sub=document.createElement('span');sub.className='ksub';sub.textContent=k.vid?'🎵 youtu.be/'+k.vid:'⚠ precisa escolher a próxima música';inf.append(sub);r.append(inf);
  const tag=(t,c)=>{const e=document.createElement('span');e.className='tag'+(c?' '+c:'');e.textContent=t;r.append(e)};
  if(!k.vid)tag('Escolhendo','warn');else if(i===1)tag('Próximo');
  if(k.id!=null&&k.id===hostId){const d=document.createElement('span');d.className='adm';d.title='Anfitrião';r.append(d)}
  L.append(r)});
 $('#kjoin').textContent=mine?'Sair da fila':'Entrar na fila';$('#kjoin').disabled=kProbe;$('#kset').classList.toggle('hide',!mine);$('#kset').disabled=kProbe||!!(mine&&cur&&cur.id===me.id&&cur.vid);
 $('#kpass').disabled=!(cur&&cur.id===me.id);
 if(mine&&!mine.vid)$('#kmsg').textContent='⚠ Cole o link de uma NOVA música e clique em "Definir música" para cantar.'}
function syncK(turn){const h=kq[0];if(isK(me.id)&&h&&h.vid){if(KW.turn!==turn||KW.id!==h.vid){KW.turn=turn;KW.open(h.vid,h.id===me.id)}$('#kwatch').classList.remove('hide');$('#pKar').classList.add('kvid')}else{exitFullscreenIf($('#kstage'));KW.close();$('#kwatch').classList.add('hide');$('#pKar').classList.remove('kvid')}}
setInterval(()=>{const L=Math.max(0,kEnd-Date.now()),m=Math.floor(L/60000),sec=String(Math.floor(L/1000)%60).padStart(2,'0');$('#ktime').textContent=kq.length?'⏱ Tempo restante da música: '+m+':'+sec:''},500);
$('#bKar').onclick=()=>{if(!$('#pKar').classList.contains('hide')&&isK(me.id)){minimizeK();return}tog('pKar');renderK();if(kShowQ)placeKFila();};
$('#kFloat').onclick=()=>{$('#kFloat').classList.remove('ring');tog('pKar');renderK();if(kShowQ)placeKFila()};
$('#kjoin').onclick=()=>{if(isK(me.id)){send({t:'kleave'});return}const id=ytId($('#ksong').value);if(!id){$('#kmsg').textContent='⚠ Cole um link válido do YouTube da música para entrar na fila.';return}checkKDur(id,(_d,warn)=>{if(isK(me.id))return;$('#ksong').value='';$('#kmsg').textContent=warn;send({t:'kjoin',vid:id})})};
$('#kset').onclick=()=>{const id=ytId($('#ksong').value);if(!id){$('#kmsg').textContent='⚠ Cole um link válido do YouTube.';return}checkKDur(id,(_d,warn)=>{$('#ksong').value='';$('#kmsg').textContent=warn||'✅ Música definida para a sua próxima vez.';send({t:'ksong',vid:id})})};
$('#kpass').onclick=()=>send({t:'kpass'});
function placeNear(f,anchors){const z=UZ(),as=anchors.filter(a=>a&&!a.classList.contains('hide'));if(!as.length||f.classList.contains('hide'))return;const rs=as.map(a=>a.getBoundingClientRect()),L=Math.min(...rs.map(x=>x.left)),Rt=Math.max(...rs.map(x=>x.right)),T=Math.min(...rs.map(x=>x.top)),B=Math.max(...rs.map(x=>x.bottom)),pr=(f.offsetParent||document.body).getBoundingClientRect(),fb=f.getBoundingClientRect(),fw=fb.width,fh=fb.height;let x=L-fw-8,y=T;if(x<4){x=Rt+8;if(x+fw>innerWidth-4){if(B+8+fh<=innerHeight-4){x=Math.max(4,Math.min(L,innerWidth-4-fw));y=B+8}else x=Math.max(4,innerWidth-4-fw)}}f.style.transform='none';f.style.right='auto';f.style.bottom='auto';f.style.left=((x-pr.left)/z)+'px';f.style.top=((y-pr.top)/z)+'px';clampPanels()}
function placeKFila(){placeNear($('#pKFila'),[$('#pKar').classList.contains('hide')?$('#kshowq'):$('#pKar')])}
$('#kshowq').onclick=()=>{kShowQ=!kShowQ;renderK();if(kShowQ)placeKFila();};
if(window.ResizeObserver)new ResizeObserver(()=>clampPanels()).observe($('#kbox'));
function updKVol(){const off=kMute||kVol===0,b=$('#kvol');b.textContent=off?'🔇':kVol<50?'🔉':'🔊';b.setAttribute('aria-pressed',String(off));b.setAttribute('aria-label',off?'Ativar som do vídeo do karaokê':'Silenciar vídeo do karaokê');$('#kvr').value=off?0:kVol}
$('#kvol').onclick=()=>{if(kMute||kVol===0){kMute=false;if(kVol===0)kVol=50}else kMute=true;applyKVol();updKVol()};
function updVVol(){const off=vMute||vVol===0,b=$('#vvol');b.textContent=off?'🔇':vVol<50?'🔉':'🔊';b.setAttribute('aria-pressed',String(off));b.setAttribute('aria-label',off?'Ativar som do vídeo':'Silenciar vídeo');$('#vvr').value=off?0:vVol}
$('#vvol').onclick=()=>{if(vMute||vVol===0){vMute=false;if(vVol===0)vVol=50}else vMute=true;applyVVol();updVVol()};
$('#vvr').oninput=e=>{vVol=+e.target.value;vMute=vVol===0;applyVVol();updVVol()};
$('#kvr').oninput=e=>{kVol=+e.target.value;kMute=kVol===0;applyKVol();updKVol()};
$('#kdec').onclick=()=>{ntDisarm('karaoke');$('#kinvb').classList.add('hide')};
function kAccept(){$('#kinvb').classList.add('hide');$('#pKar').classList.remove('hide');setKMin(false);['#pMochila','#pVis','#pSet'].forEach(s=>$(s).classList.add('hide'));$('#kmsg').textContent='Cole o link da sua música e clique em "Entrar na fila".';$('#ksong').focus()}
$('#kacc').onclick=()=>{ntDisarm('karaoke');kAccept()};

// ---------- mochila (itens) · visual · gestos ----------
$('#items').innerHTML='<div class="mc">'+ITEMS.map(x=>`<button class="slot" data-u="${x.id}" data-i="${x.n}|${x.info}" aria-label="${x.n}">${ICONS[x.ic]?ICONS[x.ic].svg:x.ic}</button>`).join('')+'</div>';
function showItemInfo(b){const el=$('#iinfo');if(!b){el.textContent='';el.hidden=true;return}el.textContent=b.dataset.i.replace('|',' — ');el.hidden=false}
$('#pMochila').addEventListener('mouseover',e=>{const b=e.target.closest('[data-i]');if(b)showItemInfo(b)});$('#pMochila').addEventListener('mouseleave',()=>showItemInfo(null));$('#pMochila').addEventListener('focusin',e=>{const b=e.target.closest('[data-i]');if(b)showItemInfo(b)});$('#pMochila').addEventListener('focusout',()=>showItemInfo(null));
function useItem(){const it=me.g.userData.item;if(mode!=='play'||!it||!it.id||me.drink>0)return;send({t:'item',item:it.id,use:1})}
$('#items').onclick=e=>{const b=e.target.closest('[data-u]');if(!b)return;const id=b.dataset.u;if(!id)return;const cur=me.g.userData.item;if(cur&&cur.id===id)useItem();else send({t:'item',item:id})};
$('#drop').onclick=()=>send({t:'item',item:null});
$('#tvis').innerHTML='<div class="edtabs" id="vtabs" style="margin-top:6px"></div><label class="chk brchk"><input type="checkbox" class="brChk" id="brChk2"><span>✨ <b>Cores brilhantes</b></span></label><div id="ved"></div>';brBind();EUPD.push(mkEditor($('#vtabs'),$('#ved')));mark();
$('#gestGrid').innerHTML=GESTS.map(g=>`<button class="slot" data-g="${g[0]}" title="${g[2]}" aria-label="${g[2]}">${g[1]}</button>`).join('')+'<button class="slot" data-g="stop" title="Parar gesto" aria-label="Parar gesto">⏹</button>';
let gLast=0,gSnd=[];const SNDG=new Set(['scream','fart']);
$('#gestGrid').onclick=e=>{const b=e.target.closest('[data-g]');if(!b||mode!=='play')return;const g=b.dataset.g,now=Date.now();
 if(g!=='stop'){if(now-gLast<1500){say('','⏳ Aguarde um instante entre gestos.',1);return}if(SNDG.has(g)){gSnd=gSnd.filter(x=>now-x<60000);if(now-(gSnd[gSnd.length-1]||0)<5000||gSnd.length>=6){say('','⏳ Gestos com som têm limite para evitar spam. Tente de novo em instantes.',1);return}gSnd.push(now)}gLast=now}
 if(g.startsWith('dance')&&me.sit)toggleSit();
 startGest(me,g);send({t:'gest',g})};
$('#emoGrid').innerHTML=EMO.map((e,i)=>`<button class="slot" data-e="${i}" aria-label="Emoji ${e}">${e}</button>`).join('');
$('#emoGrid').onclick=e=>{const b=e.target.closest('[data-e]');if(b&&mode==='play'){const i=+b.dataset.e;if(!(i>=0&&i<EMO.length))return;send({t:'emo',i});showEmo(me,EMO[i])}};
function emoTab(t){['eEmo','eGes'].forEach(i=>{const a=$('#'+i),on=i===t;a.classList.toggle('tabhidden',!on);a.toggleAttribute('inert',!on);a.setAttribute('aria-hidden',String(!on))});$('#emoTitle').textContent=t==='eGes'?'⠿ 🎭 Gestos':'⠿ 😀 Emojis'}
function emoToggle(t){const p=$('#pEmo'),cur=$('#eGes').classList.contains('tabhidden')?'eEmo':'eGes';if(!p.classList.contains('hide')&&cur===t)p.classList.add('hide');else{emoTab(t);p.classList.remove('hide')}}
$('#bEmo').onclick=()=>emoToggle('eEmo');$('#bGes').onclick=()=>emoToggle('eGes');
refreshItemBtns();
