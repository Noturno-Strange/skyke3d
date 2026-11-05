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
 qb.classList.toggle('hide',!inQ);qb.innerHTML=(kShowQ?'🙈':'📋')+(kq.length?'<sup>'+kq.length+'</sup>':'');qb.title=(kShowQ?'Ocultar fila do karaokê':'Ver fila do karaokê')+(kq.length?' ('+kq.length+')':'');qb.setAttribute('aria-label',qb.title);qb.setAttribute('aria-expanded',String(kShowQ));
 $('#pKFila').classList.toggle('hide',!kShowQ);
 $('#kcount').textContent=kq.length?'📋 Na fila: '+kq.length+' / '+MAX:'';
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
if(window.ResizeObserver)new ResizeObserver(()=>{if(typeof clampPanels==='function')clampPanels()}).observe($('#kbox'));// clampPanels vem de app-ui.js, que pode ainda não ter carregado
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
// Lista virtual (assets/vlist.js): só as linhas visíveis existem; grupos recolhíveis (Bebidas, Comidas, Receitas), busca fixa no topo e
// alimentos de receita bloqueados (cadeado) até o jogador preparar a receita na Culinária.
const BP=(()=>{
 const host=document.createElement('div');host.className='mc';$('#items').append(host);
 let col={};try{col=JSON.parse(LS('skyke_bp_g')||'{}')||{}}catch(e){}
 let q='';const norm=t=>String(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const locked=x=>!!x.rc&&!(window.cookHas&&window.cookHas(x.id));
 const cols=()=>Math.max(1,Math.floor(((host.clientWidth||300)-6)/60));
 function bind(e,r){e.textContent='';e.className='vl-r'+(r.k==='r'?' mrow':'');
  if(r.k==='g'){const b=document.createElement('button');b.type='button';b.className='mgh';b.dataset.g=r.g;b.setAttribute('aria-expanded',String(!r.closed));
   const a=document.createElement('span');a.textContent=(r.closed?'▸ ':'▾ ')+r.n;const c=document.createElement('small');c.textContent=r.note;b.append(a,c);e.append(b);return}
  const cur=typeof me!=='undefined'&&me.g&&me.g.userData.item;
  for(const x of r.items){const lk=locked(x),b=document.createElement('button');b.type='button';b.className='slot'+(lk?' lock':'')+(cur&&cur.id===x.id?' held':'');b.dataset.u=x.id;
   b.dataset.i=x.n+'|'+(lk?'Bloqueado: prepare esta receita na Culinária 🍳':x.info);b.setAttribute('aria-label',x.n+(lk?' (bloqueado: prepare a receita na Culinária)':''));
   b.innerHTML=ICONS[x.ic]?ICONS[x.ic].svg:x.ic;e.append(b)}}
 const L=vlist(host,{bind});
 function build(){const n=cols(),by=new Map(),rows=[];let shown=0;
  for(const x of ITEMS){if(q&&!norm(x.n).includes(q))continue;if(!by.has(x.c))by.set(x.c,[]);by.get(x.c).push(x);shown++}
  for(const[g,list]of by){const key='m:'+g,closed=!q&&!!col[key],note=g==='Receitas'?'('+list.filter(x=>!locked(x)).length+'/'+list.length+' feitas)':'('+list.length+')';
   rows.push({h:28,k:'g',g:key,n:g,note,closed});
   if(!closed)for(let i=0;i<list.length;i+=n)rows.push({h:60,k:'r',items:list.slice(i,i+n)})}
  L.set(rows);$('#mcCount').textContent=shown+' de '+ITEMS.length+' itens'}
 host.addEventListener('click',e=>{const g=e.target.closest('[data-g]');if(!g)return;const k=g.dataset.g;if(col[k])delete col[k];else col[k]=1;LS('skyke_bp_g',JSON.stringify(col));build()});
 $('#mcq').oninput=()=>{q=norm($('#mcq').value.trim());build()};
 if(typeof ResizeObserver==='function')new ResizeObserver(()=>{if(host.clientWidth)build()}).observe(host);
 build();
 return{build,refresh:()=>L.refresh()}})();
window.bpRefresh=()=>BP.build();
// A linha de informação fica sempre reservada: passar o mouse não muda o tamanho da janela.
function showItemInfo(b){const el=$('#iinfo');if(!b){el.textContent='';el.classList.add('off');return}el.textContent=b.dataset.i.replace('|',' — ');el.classList.remove('off')}
$('#pMochila').addEventListener('mouseover',e=>{const b=e.target.closest('[data-i]');if(b)showItemInfo(b)});$('#pMochila').addEventListener('mouseleave',()=>showItemInfo(null));$('#pMochila').addEventListener('focusin',e=>{const b=e.target.closest('[data-i]');if(b)showItemInfo(b)});$('#pMochila').addEventListener('focusout',()=>showItemInfo(null));
function useItem(){const it=me.g.userData.item;if(mode!=='play'||!it||!it.id||me.drink>0)return;send({t:'item',item:it.id,use:1})}
$('#items').onclick=e=>{const b=e.target.closest('[data-u]');if(!b)return;const id=b.dataset.u;if(!id)return;
 if(b.classList.contains('lock')){showItemInfo(b);return}// alimento de receita ainda bloqueado: só mostra o aviso
 const cur=me.g.userData.item;if(cur&&cur.id===id)useItem();else send({t:'item',item:id})};
$('#drop').onclick=()=>send({t:'item',item:null});
$('#tvis').innerHTML='<div class="edtabs" id="vtabs" style="margin-top:6px"></div><div id="ved"></div>';EUPD.push(mkEditor($('#vtabs'),$('#ved')));mark();
$('#gestGrid').innerHTML=GESTS.map(g=>`<button class="slot" data-g="${g.id}" title="${g.n}" aria-label="${g.n}">${g.ic}</button>`).join('')+'<button class="slot" data-g="stop" title="Parar" aria-label="Parar">⏹</button>';
let gLast=0,gSnd=[];const SNDG=new Set(GESTS.filter(g=>g.sfx).map(g=>g.id));
$('#gestGrid').onclick=e=>{const b=e.target.closest('[data-g]');if(!b||mode!=='play')return;const g=b.dataset.g,now=Date.now();
 if(g!=='stop'){if(now-gLast<1500){say('','⏳ Aguarde um instante entre gestos.',1);return}if(SNDG.has(g)){gSnd=gSnd.filter(x=>now-x<60000);if(now-(gSnd[gSnd.length-1]||0)<5000||gSnd.length>=6){say('','⏳ Gestos com som têm limite para evitar spam. Tente de novo em instantes.',1);return}gSnd.push(now)}gLast=now}
 if(GEST[g]&&GEST[g].loop&&me.sit)toggleSit();
 startGest(me,g);send({t:'gest',g})};
$('#emoGrid').innerHTML=EMO.map((e,i)=>`<button class="slot" data-e="${i}" aria-label="Emoji ${e}">${e}</button>`).join('');
$('#emoGrid').onclick=e=>{const b=e.target.closest('[data-e]');if(b&&mode==='play'){const i=+b.dataset.e;if(!(i>=0&&i<EMO.length))return;send({t:'emo',i});showEmo(me,EMO[i])}};
function emoTab(t){['eEmo','eGes'].forEach(i=>{const a=$('#'+i),on=i===t;a.classList.toggle('tabhidden',!on);a.toggleAttribute('inert',!on);a.setAttribute('aria-hidden',String(!on))});$('#emoTitle').textContent=t==='eGes'?'⠿ 🎭 Gestos':'⠿ 😀 Emojis'}
function emoToggle(t){const p=$('#pEmo'),cur=$('#eGes').classList.contains('tabhidden')?'eEmo':'eGes';if(!p.classList.contains('hide')&&cur===t)p.classList.add('hide');else{emoTab(t);p.classList.remove('hide')}}
$('#bEmo').onclick=()=>emoToggle('eEmo');$('#bGes').onclick=()=>emoToggle('eGes');
refreshItemBtns();
// ---------- Perfil (botão 👤 da barra): nome, foto, identidade, código de recuperação e segurança ----------
// O código fica mascarado (************) até o jogador clicar no olho e volta a ficar oculto quando a janela fecha.
const PERFIL=(()=>{
 const MASK='************',P=$('#pPerf'),rec=$('#pfRec'),msg=$('#pfMsg'),sec=$('#pfSecMsg');let showRec=false,codeCache='',codeAt=0;
 const note=t=>{msg.textContent=t};
 const secNote=t=>{sec.textContent=t};
 const copy=async t=>{try{await navigator.clipboard.writeText(t);return true}catch(e){return false}};
 const clearCode=()=>{codeCache='';codeAt=0};
 // o código dá a identidade a quem o tiver: nunca sai do navegador (não vai ao servidor nem a link), fica oculto,
 // volta a ocultar sozinho depois de 30 s ou quando a aba some, e não é guardado em lugar nenhum (é montado na hora)
 let hideT=0;const arm=()=>{clearTimeout(hideT);hideT=showRec?setTimeout(()=>{showRec=false;clearCode();note('Código oculto de novo.');paint()},30000):0};
 const recText=async()=>{const now=Date.now();if(codeCache&&now-codeAt<30000)return codeCache;const c=await recoveryCode();if(c){codeCache=c;codeAt=now}return c};
 const status=()=>window.SKYID?SKYID.status():null;
 const applyProfile=r=>{if(r.look)SKYREC.FIELDS.forEach(k=>{const v=r.look[k];if(Number.isInteger(v))cfg[k]=v});
  if(r.gloss===0||r.gloss===1)setGloss(r.gloss===1);const nm=cleanName(r.name);if(nm&&nm.toLowerCase()!=='visitante')$('#name').value=nm;
  dress(me.g,cfg);sendCfg();mark();saveNow()};
 // foto do rosto: um segundo desenhista pequeno, só com a cabeça do avatar (a câmera olha de frente para ela)
 function foto(){
  const cv=$('#pfFace'),W=cv.width,x=cv.getContext('2d');x.clearRect(0,0,W,W);
  let r=null,g=null;
  try{
   r=new THREE.WebGLRenderer({canvas:document.createElement('canvas'),alpha:true,antialias:true,preserveDrawingBuffer:true});r.setSize(W,W,false);r.outputColorSpace=THREE.SRGBColorSpace;r.setClearColor(0x000000,0);
   const sc=new THREE.Scene();g=new THREE.Group();g.userData={};dress(g,{...cfg});sc.add(g);
   sc.add(new THREE.HemisphereLight(0xffffff,0x9a8a7a,1.25*Math.PI));const d=new THREE.DirectionalLight(0xffffff,.9*Math.PI);d.position.set(1.5,3,4);sc.add(d);
   g.updateMatrixWorld(true);const p=new THREE.Vector3();g.userData.hd.getWorldPosition(p);
   const cam=new THREE.PerspectiveCamera(28,1,.1,20);cam.position.set(p.x,p.y+.03,p.z+1.5);cam.lookAt(p.x,p.y,p.z);
   r.render(sc,cam);x.drawImage(r.domElement,0,0,W,W);
  }catch(e){x.font=(W*.7)+'px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('🙂',W/2,W/2)}
  finally{if(g)freeAv(g);if(r){r.dispose();if(r.forceContextLoss)r.forceContextLoss()}}}
 function paint(){
  const st=status();
  $('#pfName').textContent=cleanName($('#name').value)||me.name||'Visitante';
  $('#pfId').textContent=!st?'Sem identidade neste aparelho. Entre na sala para criar.':!st.hasPrimary?(st.pendingPrimary&&st.pendingUntil?'Recuperação em carência: a troca da chave vale a partir de '+fmtWhen(st.pendingUntil)+'. Depois disso, entre na sala para concluir.':'Recuperação pendente: entre na sala para concluir.'):st.alert?'⚠ Há um pedido de recuperação desta conta que vale a partir de '+fmtWhen(st.alert)+'. Se não foi você, cancele abaixo.':st.pendingRecovery?'Concluindo a troca da chave de recuperação…':'Sua conta fica guardada neste aparelho. O código de recuperação serve para entrar em outro.';
  // a chave de recuperação não fica no aparelho: o código só aparece logo depois de criar a conta ou de gerar uma chave nova (e em contas antigas)
  const has=!!(st&&st.codeReady),can=has||!!codeCache;
  rec.value=showRec&&codeCache?codeCache:showRec&&has?'Gerando o código…':can?MASK:(st?'Guardado por você':MASK);
  $('#pfRecEye').disabled=$('#pfRecCp').disabled=!can;
  $('#pfRecNote').textContent=!st?'':st.recoveryChecked?'✔ Código conferido. Ele não fica neste aparelho: guarde-o em lugar seguro.':st.recoveryOnDevice?'⚠ Este aparelho ainda guarda a chave de recuperação. Guarde o código e toque em Conferir meu código para removê-la daqui.':has?'Guarde o código agora: ele só aparece nesta sessão e não fica guardado neste aparelho.':'O código não fica neste aparelho. Use o que você guardou; para ter outro, gere uma nova chave (pede o código atual).';
  $('#pfRecOk').disabled=$('#pfRecNew').disabled=!st;
  for(const id of ['pfRotRec','pfRotMain'])if($(id))$(id).disabled=!st||!st.hasPrimary;
  if($('#pfCancelRec'))$('#pfCancelRec').classList.toggle('hide',!(st&&st.alert));
  if($('#pfBackup'))$('#pfBackup').disabled=!st;
  $('#pfRecEye').setAttribute('aria-pressed',String(showRec));$('#pfRecEye').textContent=showRec?'🙈':'👁';$('#pfRecEye').title=$('#pfRecEye').ariaLabel=showRec?'Ocultar código':'Mostrar código'}
 const hideAll=()=>{showRec=false;clearCode();arm();note('');secNote('');paint()};
 new MutationObserver(()=>{if(P.classList.contains('hide'))hideAll();else{paint();foto()}}).observe(P,{attributes:true,attributeFilter:['class']});
 const S=$('#pSeg');new MutationObserver(()=>{if(S.classList.contains('hide'))hideAll();else paint()}).observe(S,{attributes:true,attributeFilter:['class']});
 $('#bPerf').onclick=()=>tog('pPerf');$('#bSeg').onclick=()=>tog('pSeg');
 $('#pfRecEye').onclick=async()=>{if(showRec){showRec=false;clearCode();arm();paint();return}showRec=true;arm();paint();const c=await recText();if(showRec){if(!c)note('Não foi possível gerar o código agora.');paint()}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&showRec){showRec=false;clearCode();arm();paint()}});
 // copiar funciona mesmo com o texto oculto (o jogador não precisa expor o código na tela)
 $('#pfRecCp').onclick=async()=>{const c=await recText();note(c&&await copy(c)?'✔ Código copiado. Guarde com cuidado.':'Não deu para copiar. Mostre o código e copie.')};
 // operações de segurança: cada uma pede confirmação e usa a chave que estiver neste aparelho
 const run=async(fn,ok)=>{secNote('Trabalhando…');try{await fn();secNote(ok)}catch(e){secNote('⚠ '+((e&&e.message)||'Não foi possível concluir.'))}};
 mkConfirm($('#pfRotRec'),{html:'<b>Gerar uma nova chave de recuperação?</b> Você cola o código atual, vê o código novo e só depois a troca vale: o anterior deixa de funcionar quando você confirma.',yes:'Sim, gerar',onYes:()=>run(async()=>{await SKYID.rotateRecovery(profileNow());clearCode();showRec=true;arm();await recText();paint()},'✔ Nova chave ativa. O código anterior não vale mais: guarde o novo.')});
 mkConfirm($('#pfRotMain'),{html:'<b>Trocar a chave deste aparelho?</b> A chave antiga deixa de valer e os outros aparelhos saem do jogo. Você vai precisar colar o código de recuperação.',yes:'Sim, trocar',onYes:()=>run(async()=>{await SKYID.rotatePrimary();clearCode();paint()},'✔ Chave trocada. Os outros aparelhos foram desconectados.')});
 // conferir o código: o jogador cola o que guardou; se confere, a cópia da chave que o aparelho ainda tinha (conta antiga) é removida
 $('#pfRecOk').onclick=async()=>{secNote('');try{const ok=await askRecoveryCode('confirm',async c=>{try{return{ok:true,value:await SKYID.confirmRecovery(c)}}catch(e){return{ok:false,msg:identityMsg(e)}}});if(ok){clearCode();showRec=false;arm();secNote('✔ Código conferido. A chave de recuperação não fica mais neste aparelho.');paint()}}catch(e){secNote('⚠ '+identityMsg(e))}};
 // atualizar o código: o jogador cola o que guardou e recebe um igual com os amigos e o visual de agora (nada é guardado)
 $('#pfRecNew').onclick=async()=>{secNote('');try{const c=await askRecoveryCode('refresh',async code=>{try{return{ok:true,value:await SKYID.refreshCode(code,profileNow())}}catch(e){return{ok:false,msg:identityMsg(e)}}});if(c){codeCache=c;codeAt=Date.now();showRec=true;arm();secNote('✔ Código atualizado. Copie e guarde: o anterior continua valendo, mas não tem os amigos de agora.');paint()}}catch(e){secNote('⚠ '+identityMsg(e))}};
 mkConfirm($('#pfCancelRec'),{html:'<b>Cancelar o pedido de recuperação?</b> Use se NÃO foi você que pediu.',yes:'Sim, cancelar',onYes:()=>run(async()=>{await SKYID.cancelRecovery();paint()},'✔ Pedido cancelado. Se o seu código de recuperação vazou, gere uma nova chave de recuperação.')});
 mkConfirm($('#pfRevoke'),{html:'<b>Sair dos outros aparelhos?</b> Outras abas e aparelhos com a sua conta serão desconectados. Você continua aqui.',yes:'Sim, encerrar',onYes:()=>run(async()=>{await SKYID.revokeSessions()},'✔ Os outros aparelhos foram desconectados.')});
 // Meus dados: Exportar baixa um arquivo; Esquecer limpa só este aparelho (pede Sim/Não). O código de recuperação nunca entra no arquivo.
 $('#pfData').onclick=()=>{const box=$('#pfDataBox'),abre=box.hidden;box.hidden=!abre;$('#pfData').setAttribute('aria-expanded',String(abre))};
 // exporta em texto simples (.txt), uma linha por item, fácil de abrir em qualquer aparelho; cores com o número na paleta e o código da cor que aparece no jogo
 $('#pfExp').onclick=()=>{const gl=glossOn(),nm=cleanName($('#name').value)||'(sem nome)',
   val=d=>{const x=cfg[d.k]|0;if(!d.c)return d.v[x];const on=cfg[d.b]===1;return 'cor '+(x+1)+' ('+(on?GLOSS[GP.get(d.c)]:d.c)[x]+')'},
   L=['Skyke3D - meus dados','Exportado em: '+new Date().toLocaleString('pt-BR'),'','Nome: '+nm,'','Visual',...EDS.map(d=>d.n+': '+val(d)),'Cores brilhantes: '+(gl?'sim':'não'),'Amigos neste aparelho: '+(window.socCount?window.socCount():0),'','Por segurança, o código de recuperação não é exportado.'];
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+L.join('\r\n')+'\r\n'],{type:'text/plain;charset=utf-8'}));a.download='skyke3d-meus-dados.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);note('✔ Arquivo baixado.')};
 // backup cifrado: leva a chave de recuperação e o perfil, protegidos por uma senha escolhida na hora (nunca guardada)
 const askPass=async(confirmar)=>{let p='';try{p=window.prompt(confirmar?'Escolha uma senha para o backup (mínimo 10 caracteres; uma frase é melhor):':'Digite a senha do backup:')||''}catch(e){return ''}
  if(confirmar){if(p.length<10){note('A senha precisa ter pelo menos 10 caracteres.');return ''}let q='';try{q=window.prompt('Repita a senha do backup:')||''}catch(e){return ''}if(p!==q){note('As senhas não coincidem.');return ''}}
  return p};
 $('#pfBackup').onclick=async()=>{const st=status();if(!st){note('Entre na sala com sua identidade para gerar o backup.');return}
  const profile=profileNow();let code=null;
  try{code=st.codeReady?await SKYID.backupCode(profile):await askRecoveryCode('backup',async c=>{try{return{ok:true,value:await SKYID.refreshCode(c,profile)}}catch(e){return{ok:false,msg:identityMsg(e)}}})}catch(e){note('⚠ '+identityMsg(e));return}
  if(!code)return;
  const pass=await askPass(true);if(!pass)return;note('Preparando o backup…');
  try{const text=await SKYID.encryptBackup({v:2,app:'skyke3d',code,name:profile.name,look:cfg,gloss:glossOn(),friends:profile.friends,exported:new Date().toISOString()},pass);
   const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));a.download='skyke3d-backup.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
   note('✔ Cópia protegida baixada. Guarde a senha: sem ela o arquivo não abre.')}catch(e){note('⚠ '+((e&&e.message)||'Não foi possível gerar o backup.'))}};
 $('#pfRestore').onclick=()=>$('#pfBkFile').click();
 $('#pfBkFile').onchange=async()=>{const f=$('#pfBkFile').files&&$('#pfBkFile').files[0];$('#pfBkFile').value='';if(!f)return;
  const pass=await askPass(false);if(!pass)return;note('Abrindo o backup…');
  try{const text=await f.text(),obj=await SKYID.decryptBackup(text,pass);
   if(!obj||typeof obj.code!=='string')throw new Error('Backup sem uma identidade válida.');
   const r=await SKYID.restoreCode(obj.code);if(!r.ok)throw new Error('O código dentro do backup não confere.');
   applyProfile(r);if(r.friends&&window.socImport)window.socImport(r.friends);clearCode();paint();
   note('✔ Backup restaurado. Saia e entre de novo em até 10 minutos para concluir a recuperação (depois disso o jogo pede o código). Por segurança a troca da chave só vale depois de um prazo, normalmente 24 h.')}catch(e){note('⚠ '+((e&&e.message)||'Não foi possível abrir o backup.'))}};
 mkConfirm($('#pfForget'),{html:'<b>Esquecer neste aparelho?</b> Apaga nome, visual e as chaves daqui. Para voltar, use o <b>código de recuperação</b> (tenha-o guardado antes).',yes:'Sim, esquecer',copy:true,onYes:()=>{forgetSaved();if(window.SKYID)SKYID.forget();note('✔ Dados deste aparelho apagados.');paint()}});
 $('#name').addEventListener('input',()=>{if(!P.classList.contains('hide'))paint()});
 return{paint,foto}})();
