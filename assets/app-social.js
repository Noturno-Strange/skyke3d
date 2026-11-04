/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Amigos, convites e chat global (o servidor está em lib/social.js). Script comum, no mesmo escopo global dos outros app-*.js.
 * A lista de amigos (skyke_friends) fica só neste navegador. A identidade (assets/identity.js) entra com o token de
 * sessão; o servidor calcula o id público e esquece tudo quando a pessoa sai da sala.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
{// tudo num bloco: os nomes daqui não colidem com os dos outros scripts; app-net.js chama só os ganchos window.soc*
const FK='skyke_fk',FL='skyke_friends',FM='skyke_gmute',FMAX=100,PK='skyke_pub';
const jget=(k,d)=>{try{const v=JSON.parse(LS(k)||'null');return Array.isArray(v)?v:d}catch(e){return d}};
// silenciados no global: só nesta sessão (apelido → nome); o navegador não guarda ids de outras pessoas
LS(FM,null);
function okId(x){return typeof x==='string'&&/^[a-z2-7]{12}$/.test(x)}
function cut(s){return String(s||'').slice(0,LIMITS.name)}
// estado: amigos {id,n} (n = último nome visto), online, pedidos recebidos e enviados, silenciados no chat global.
// Na sala e no global as pessoas aparecem por um apelido aleatório da conexão (h); hm liga os apelidos atuais dos amigos ao id deles
const SO={me:'',fr:jget(FL,[]).filter(f=>f&&okId(f.id)).slice(0,FMAX),on:new Set(),req:new Map(),sent:new Set(),mute:new Map(),hm:new Map(),h:'',reqH:new Set(),tab:'s',gUnread:0,ready:false,n:0,q:'',grp:{},at:0};
const isFr=id=>SO.fr.some(f=>f.id===id);
const frOf=h=>SO.hm.get(h)||'';
const saveFr=()=>{LS(FL,JSON.stringify(SO.fr));if(SO.ready)send({t:'friends',ids:SO.fr.map(f=>f.id)})};
function addFr(id,n){if(!okId(id)||id===SO.me)return;const f=SO.fr.find(x=>x.id===id);if(f)f.n=cut(n)||f.n;else if(SO.fr.length<FMAX)SO.fr.push({id,n:cut(n)||'Amigo'});SO.req.delete(id);SO.sent.delete(id);saveFr();frDraw()}
function delFr(id){SO.fr=SO.fr.filter(f=>f.id!==id);SO.on.delete(id);saveFr();frDraw()}
function reqFr(h,n){if(!okId(h)||h===SO.h||isFr(frOf(h))||SO.sent.has(h))return;SO.sent.add(h);send({t:'freq',to:h});say('','👋 Pedido de amizade enviado para '+cut(n)+'.',1);frDraw()}
function accFr(id){const n=SO.req.get(id);if(n===undefined)return;send({t:'facc',to:id});addFr(id,n);say('','🤝 Agora vocês são amigos: '+n+'.',1);ntDropKind('fr:'+id)}
function decFr(id){SO.req.delete(id);ntDropKind('fr:'+id);frDraw()}
function invFr(id){if(mode!=='play'||!SO.on.has(id))return;send({t:'finv',to:id});const f=SO.fr.find(x=>x.id===id);say('','📨 Convite enviado para '+(f?f.n:'seu amigo')+'.',1)}
function goInv(code){if(!/^[A-Z0-9]{10}$/.test(code||''))return;if(mode==='play')leave();start({t:'join',code})}
function ntDropKind(k){const it=NT.items.find(i=>i.kind===k);if(it)ntDrop(it.id)}
// ---------- painel 👥: pedidos, amigos (online primeiro) e quem está na sala ----------
const btn=(t,lab,f,cls)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.title=lab;b.setAttribute('aria-label',lab);if(cls)b.className=cls;b.onclick=f;return b};
function row(name,dot,...bs){const r=document.createElement('div'),s=document.createElement('span');r.className='fr';s.textContent=name;if(dot!==null){const d=document.createElement('i');d.className='dot'+(dot?' on':'');d.title=dot?'Online':'Offline';r.append(d)}r.append(s,...bs);return r}
function head(t){const h=document.createElement('div');h.className='frh';h.textContent=t;return h}
// grupos recolhíveis (o estado aberto/fechado fica durante a sessão) e busca por nome a partir de 7 amigos: a lista pode
// ter 100 amigos sem o painel crescer (só a lista rola, com altura máxima)
function grp(L,k,t,n,def){const d=document.createElement('details'),s=document.createElement('summary');d.className='frg';d.open=k in SO.grp?SO.grp[k]:def;d.ontoggle=()=>{SO.grp[k]=d.open};s.textContent=t+' · '+n;d.append(s);L.append(d);return d}
function frDraw(){badge();const L=$('#frl');if(!L||$('#pFr').classList.contains('hide'))return;L.textContent='';
 const qi=$('#frq'),many=SO.fr.length>6;qi.classList.toggle('hide',!many);if(!many&&SO.q){SO.q='';qi.value=''}
 const q=SO.q.toLowerCase(),hit=n=>!q||n.toLowerCase().includes(q),byName=(a,b)=>a.n.localeCompare(b.n);
 if(SO.req.size){const g=grp(L,'req','Pedidos',SO.req.size,true);SO.req.forEach((n,id)=>g.append(row(n,null,btn('✔','Aceitar '+n,()=>accFr(id),'pri'),btn('✖','Recusar '+n,()=>decFr(id)))))}
 const fr=SO.fr.filter(f=>hit(f.n)),on=fr.filter(f=>SO.on.has(f.id)).sort(byName),off=fr.filter(f=>!SO.on.has(f.id)).sort(byName);
 const item=(f,g,live)=>{const bs=[btn('🌐','Ver perfil público de '+f.n,()=>openPubOf(f.id)),btn('❤️','Curtir o perfil de '+f.n,()=>likeOf(f.id,f.n)),btn('✎','Deixar recado para '+f.n,()=>gbOpenOf(f.id,f.n)),btn('🐾','Visitar o mascote de '+f.n,e=>petOf(f.id,f.n,e.currentTarget))];if(live&&mode==='play')bs.push(btn('📨','Convidar '+f.n+' para esta sala',()=>invFr(f.id)));
  const x=btn('✖','Remover '+f.n,()=>{if(x.dataset.ok){delFr(f.id);return}x.dataset.ok=1;x.textContent='Remover?';setTimeout(()=>{x.dataset.ok='';x.textContent='✖'},3000)});bs.push(x);g.append(row(f.n,live,...bs))};
 if(!SO.fr.length){L.append(head('Amigos'));const e=document.createElement('div');e.className='nempty';e.textContent='Adicione alguém da sala ou do chat global.';L.append(e)}
 else if(!fr.length){const e=document.createElement('div');e.className='nempty';e.textContent='Nenhum amigo com esse nome.';L.append(e)}
 else{const g1=grp(L,'on','Online',on.length,true);on.forEach(f=>item(f,g1,true));if(!on.length){const e=document.createElement('div');e.className='nempty';e.textContent='Nenhum amigo online agora.';g1.append(e)}
  if(off.length){const g2=grp(L,'off','Offline',off.length,off.length<=5);if(q)g2.open=true;off.forEach(f=>item(f,g2,false))}}
 const near=[...actors.values()].filter(a=>!a.bot&&okId(a.fid)&&a.fid!==SO.h&&!isFr(frOf(a.fid))&&hit(a.name));
 if(near.length){const g=grp(L,'near','Nesta sala',near.length,near.length<=6);near.forEach(a=>g.append(row(a.name,null,...(okPp(a.pp)?[btn('🌐','Ver perfil público de '+a.name,()=>openPub(a.pp)),btn('❤️','Curtir o perfil de '+a.name,()=>likePub(a.pp,a.name)),btn('✎','Deixar recado para '+a.name,()=>gbOpen(a.pp,a.name)),btn('🐾','Visitar o mascote de '+a.name,e=>petMenu(a.pp,a.name,e.currentTarget))]:[]),SO.sent.has(a.fid)||SO.reqH.has(a.fid)?btn('⏳','Pedido pendente',()=>{}):btn('➕','Adicionar '+a.name,()=>reqFr(a.fid,a.name)))))}
 // silenciados no chat global: dá para desfazer daqui
 const mu=[...SO.mute].filter(([,n])=>hit(n));
 if(mu.length){const g=grp(L,'mute','Silenciados no global',mu.length,false);mu.forEach(([id,n])=>g.append(row(n,null,btn('🔊','Voltar a ver '+n+' no chat global',()=>{SO.mute.delete(id);say('','🔊 '+n+' voltou a aparecer no chat global.',1);frDraw()}))))}}
$('#frq').oninput=e=>{SO.q=e.target.value.trim().slice(0,16);frDraw()};$('#frq').onkeydown=e=>e.stopPropagation();
// no botão: pedidos esperando (cor de destaque) ou, sem pedidos, amigos online (verde)
function badge(){const b=$('#bFr'),n=SO.req.size,on=SO.on.size;if(b){b.textContent='👥';if(n||on){const s=document.createElement('sup');s.textContent=n||on;if(!n)s.className='on';b.append(s)}const lab='Amigos'+(n?' · '+n+' pedido(s)':'')+(on?' · '+on+' online':'');b.title=lab;b.setAttribute('aria-label',lab)}}
$('#bNotif').addEventListener('click',()=>{$('#pFr').classList.add('hide');$('#bFr').setAttribute('aria-expanded','false')});
$('#bFr').onclick=()=>{const p=$('#pFr'),open=p.classList.contains('hide');p.classList.toggle('hide',!open);$('#bFr').setAttribute('aria-expanded',String(open));if(open){$('#pNotif').classList.add('hide');frDraw()}};
// ---------- chat: abas Sala e Global (mesma caixa, mesmo campo de texto) ----------
function tab(t){SO.tab=t;$('#log').classList.toggle('hide',t!=='s');$('#glog').classList.toggle('hide',t!=='g');$('#ctS').setAttribute('aria-selected',String(t==='s'));$('#ctG').setAttribute('aria-selected',String(t==='g'));
 const i=$('#msg');i.maxLength=t==='g'?140:200;i.placeholder=t==='g'?'Mensagem para todos os jogadores':'Escreva e tecle Enter';if(t==='g'){SO.gUnread=0;gBadge();const g=$('#glog');g.scrollTop=g.scrollHeight}}
function gBadge(){const b=$('#ctG');b.textContent='🌎 Global';if(SO.n){const c=document.createElement('small');c.className='gn';c.textContent=SO.n;b.append(c)}if(SO.gUnread){const s=document.createElement('sup');s.textContent=SO.gUnread>99?'99+':SO.gUnread;b.append(s)}const lab='Chat global'+(SO.n?' · '+SO.n+' online em todas as salas':'');b.title=lab;b.setAttribute('aria-label',lab)}
$('#ctS').onclick=()=>tab('s');$('#ctG').onclick=()=>tab('g');
// menu do nome no chat global: adicionar como amigo ou silenciar (só para você)
function nameMenu(e,id,n){document.querySelectorAll('.gmenu').forEach(x=>x.remove());const m=document.createElement('span');m.className='gmenu';
 if(id!==SO.h){if(!isFr(frOf(id)))m.append(btn('➕ Amigo','Adicionar '+n,()=>{reqFr(id,n);m.remove()}));m.append(btn('🔇','Silenciar '+n+' no chat global',()=>{SO.mute.set(id,n);document.querySelectorAll('#glog [data-f="'+id+'"]').forEach(x=>x.remove());say('','🔇 '+n+' foi silenciado no chat global. Para desfazer: 👥 › Silenciados.',1);m.remove()}))}
 if(m.children.length){e.currentTarget.after(m);setTimeout(()=>m.remove(),6000)}}
function gsay(m){if(!okId(m.id)||SO.mute.has(m.id)||typeof m.text!=='string')return;const d=document.createElement('div'),b=document.createElement('button'),n=cut(m.name);d.dataset.f=m.id;b.type='button';b.className='gname'+(isFr(frOf(m.id))?' frn':'');b.textContent=n+':';b.onclick=e=>nameMenu(e,m.id,n);d.append(b,' ',m.text.slice(0,200));
 const L=$('#glog');L.append(d);while(L.children.length>80)L.firstChild.remove();if(SO.tab==='g'&&!$('#chat').classList.contains('hide'))L.scrollTop=L.scrollHeight;else if(m.id!==SO.h){SO.gUnread++;gBadge()}}
// o campo de texto manda para a aba aberta
// avisos do global aparecem na própria aba (antes iam para a aba Sala, escondida, e a primeira mensagem parecia sumir)
function gsys(t){const d=document.createElement('div');d.className='gsys';d.textContent=t;const L=$('#glog');L.append(d);L.scrollTop=L.scrollHeight}
// nos primeiros 20 s na sala o servidor recusa o global (anti-spam): o texto fica no campo e o aviso diz quanto falta
{const i=$('#msg'),k=i.onkeydown;let gl=0;i.onkeydown=e=>{if(SO.tab!=='g')return k(e);e.stopPropagation();if(e.key!=='Enter')return;const t=i.value.trim().replace(/[\u0000-\u001f]/g,'').slice(0,140),n=Date.now();if(!t)return;
 const wait=Math.ceil((SO.at+20500-n)/1000);if(wait>0){gsys('⏳ Você poderá falar no chat global em '+wait+' s (proteção contra spam). Sua mensagem continua no campo.');return}
 if(n-gl<2600){gsys('⏳ No chat global, aguarde uns segundos entre mensagens.');return}gl=n;i.value='';send({t:'gchat',text:t})}}
// ---------- ganchos chamados por app-net.js ----------
window.socEnter=()=>{SO.ready=true;SO.at=Date.now();SO.on.clear();send({t:'friends',ids:SO.fr.map(f=>f.id)});send({t:'gsub',on:true});$('#glog').textContent='';SO.gUnread=0;gBadge();frDraw()};
window.socLeave=()=>{SO.ready=false;SO.on.clear();SO.sent.clear();SO.reqH.clear();SO.hm.clear();SO.mute.clear();tab('s');$('#pFr').classList.add('hide');frDraw()};
window.socForget=()=>{[FK,FL].forEach(k=>LS(k,null));SO.fr=[];SO.mute.clear();SO.hm.clear();frDraw()};
// outra aba do mesmo navegador mudou a lista de amigos, os silenciados ou a chave (ex.: restaurou um código): acompanha
addEventListener('storage',e=>{if(e.key===FL){SO.fr=jget(FL,[]).filter(f=>f&&okId(f.id)).slice(0,FMAX);[...SO.req.keys()].filter(isFr).forEach(id=>SO.req.delete(id))}else if(e.key!==FK)return;
 if(SO.ready)send({t:'friends',ids:SO.fr.map(f=>f.id)});frDraw()});
window.socCount=()=>SO.fr.length;
// código de recuperação: leva os ids dos amigos (sem nomes nem mensagens); ao restaurar, junta com a lista deste aparelho
window.socFriendIds=()=>SO.fr.map(f=>f.id);
window.socImport=ids=>{let n=0;(ids||[]).filter(okId).forEach(id=>{if(!isFr(id)&&SO.fr.length<FMAX){SO.fr.push({id,n:'Amigo'});n++}});saveFr();frDraw();return SO.fr.length};
// ---------- perfil público opcional (/profile#id): o link vem do id de identidade por SHA-256, sem revelá-lo ----------
const PUB={on:false,bio:'',like:'',mood:'',world:'',pp:''};
const PF=['bio','like','mood','world'],PMAX={bio:300,like:80,mood:60,world:20};
const pfClean=(k,v)=>String(v==null?'':v).replace(/[<>&"'`]/g,'').slice(0,PMAX[k]);
try{const o=JSON.parse(LS(PK)||'{}');PUB.on=o.on===true;PF.forEach(k=>{PUB[k]=pfClean(k,o[k])})}catch(e){}
const okPp=x=>typeof x==='string'&&/^[0-9a-f]{20}$/.test(x);
async function ppOf(id){try{const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('skyke3d-profile:'+id));return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,20)}catch(e){return''}}
const ppUrl=pp=>location.origin+'/profile#'+pp;
const LK=new Map();
function likePub(pp,n){if(!okPp(pp))return;LK.set(pp,cut(n)||'este jogador');send({t:'plike',to:pp})}
async function likeOf(id,n){const pp=await ppOf(id);if(pp)likePub(pp,n)}
const GB={pp:'',n:''};
function gbOpen(pp,n){if(!okPp(pp))return;GB.pp=pp;GB.n=cut(n)||'este jogador';$('#gbTo').textContent=GB.n;$('#gbTxt').value='';$('#gbMsg').textContent='Recados são temporários: somem quando o perfil some.';$('#gbBox').classList.remove('hide');$('#gbTxt').focus()}
async function gbOpenOf(id,n){const pp=await ppOf(id);if(pp)gbOpen(pp,n)}
function gbDraw(list){const L=$('#gbOwnL');if(!L)return;L.textContent='';const a=Array.isArray(list)?list.slice(0,20):[];$('#gbOwn').hidden=!PUB.on;
 if(!a.length){const li=document.createElement('li');li.className='gbe';li.textContent='Nenhum recado ainda.';L.append(li);return}
 a.forEach(m=>{if(!Number.isInteger(m.id))return;const li=document.createElement('li'),b=document.createElement('b'),t=document.createElement('span');b.textContent=cut(m.name);t.textContent=String(m.text||'').slice(0,120);li.append(b,' ',t,btn('✖','Apagar recado de '+cut(m.name),()=>send({t:'gbdel',id:m.id})));L.append(li)})}
if($('#gbBox')){
 $('#gbTxt').onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#gbSend').click()}if(e.key==='Escape')$('#gbCancel').click()};
 $('#gbCancel').onclick=()=>$('#gbBox').classList.add('hide');
 $('#gbSend').onclick=()=>{const t=$('#gbTxt').value.replace(/\s+/g,' ').trim();if(!t){$('#gbMsg').textContent='Escreva um recado.';return}if(mode!=='play'){$('#gbMsg').textContent='Entre numa sala para enviar.';return}send({t:'gbook',to:GB.pp,text:t})}}
async function petOf(id,n,anchor){const pp=await ppOf(id);if(pp&&window.petMenu)petMenu(pp,n,anchor)}
function openPub(pp){if(okPp(pp))window.open('/profile#'+pp,'_blank','noopener,noreferrer')}
async function openPubOf(id){const pp=await ppOf(id);if(pp)openPub(pp);else say('','O navegador não permite abrir o perfil neste endereço (use https).',1)}
function pubSave(){LS(PK,JSON.stringify({on:PUB.on,bio:PUB.bio,like:PUB.like,mood:PUB.mood,world:PUB.world}))}
function pubSend(){if(mode==='play'&&SO.ready)send({t:'pubp',on:PUB.on,bio:PUB.bio,like:PUB.like,mood:PUB.mood,world:PUB.world})}
const PIDS={bio:'#pubBio',like:'#pubLike',mood:'#pubMood',world:'#pubWorld'};
function pubDraw(msg){const on=$('#pubOn');if(!on)return;on.checked=PUB.on;$('#pubFields').hidden=!PUB.on;
 PF.forEach(k=>{const e=$(PIDS[k]);if(document.activeElement!==e)e.value=PUB[k];const n=$('#pub'+k[0].toUpperCase()+k.slice(1)+'N');if(n)n.textContent=PUB[k].length+'/'+PMAX[k]});
 const ok=PUB.on&&okPp(PUB.pp);$('#pubOpen').disabled=!ok;$('#pubCopy').disabled=!ok;
 $('#pubMsg').textContent=msg||(!PUB.on?'Seu perfil está escondido. Ninguém consegue abri-lo.':ok?'Seu perfil está visível para quem tiver o link. Você pode apagá-lo quando quiser, desligando a caixa acima.':'Seu perfil será publicado quando você entrar numa sala.')}
if($('#pubOn')){
 const w=$('#pubWorld');Object.entries(SKYCAT.ST).forEach(([id,o])=>{const op=document.createElement('option');op.value=id;op.textContent=o.n;w.append(op)});
 $('#pubOn').onchange=e=>{PUB.on=e.target.checked;if(!PUB.on)PUB.pp='';pubSave();pubSend();pubDraw();if(!PUB.on)gbDraw([])};
 let pTm=0;const edit=k=>e=>{PUB[k]=pfClean(k,e.target.value);pubSave();pubDraw('Salvando…');clearTimeout(pTm);pTm=setTimeout(()=>{if(PUB.on)pubSend()},700)};
 PF.forEach(k=>{const e=$(PIDS[k]);if(k==='world')e.onchange=edit(k);else{e.oninput=edit(k);e.onkeydown=ev=>ev.stopPropagation()}});
 $('#pubOpen').onclick=()=>openPub(PUB.pp);
 $('#pubCopy').onclick=async()=>{try{await navigator.clipboard.writeText(ppUrl(PUB.pp));$('#pubMsg').textContent='Link copiado.'}catch(e){$('#pubMsg').textContent='Não consegui copiar. Abra o perfil e copie o endereço do navegador.'}};
 pubDraw()}
window.soc=m=>{switch(m.t){
 case 'fme':if(okId(m.id))SO.me=m.id;if(okId(m.h))SO.h=m.h;if(PUB.on)pubSend();if(window.petBoot)window.petBoot();break;
 case 'plike':{const n=LK.get(m.to)||'este jogador';LK.delete(m.to);say('',m.ok?(m.dup?'❤️ Você já curtiu o perfil de '+n+'.':'❤️ Você curtiu o perfil de '+n+'.'):m.reason==='self'?'Você não pode curtir o próprio perfil.':'O perfil de '+n+' não está ativo agora.',1);break}
 case 'pubp':{if(m.err){PUB.pp='';pubDraw(m.err==='link'?'Seu perfil não foi publicado: não use links nos textos.':'Não foi possível publicar agora. Tente de novo mais tarde.');break}
  PUB.pp=m.on&&okPp(m.pp)?m.pp:'';
  if(m.on&&m.f&&!PF.some(k=>PUB[k])){PF.forEach(k=>{PUB[k]=pfClean(k,m.f[k])});pubSave()}
  pubDraw();if(PUB.pp)send({t:'gblist'});else gbDraw([]);break}
 case 'gblist':gbDraw(m.list);break;
 case 'gbook':{const R={link:'Recados não podem ter links.',limit:'Você já deixou 3 recados neste perfil.',self:'Este é o seu perfil.',empty:'Escreva um recado.',notfound:'O perfil não está ativo agora.',invalid:'Não foi possível enviar.'};if(m.ok){$('#gbBox').classList.add('hide');say('','📖 Recado enviado para '+GB.n+'.',1)}else $('#gbMsg').textContent=R[m.reason]||R.invalid;break}
 case 'ppid':{const a=actors.get(m.id);if(a){a.pp=okPp(m.pp)?m.pp:'';if(!$('#pFr').classList.contains('hide'))frDraw()}break}
 case 'fpres':if(okId(m.id)&&isFr(m.id)){for(const [h,f] of SO.hm)if(f===m.id)SO.hm.delete(h);if(m.on&&Array.isArray(m.hs))m.hs.slice(0,8).filter(okId).forEach(h=>SO.hm.set(h,m.id));if(m.on)SO.on.add(m.id);else SO.on.delete(m.id);if(m.on&&m.name){SO.fr.find(f=>f.id===m.id).n=cut(m.name);LS(FL,JSON.stringify(SO.fr))}frDraw()}break;
 case 'freq':{if(!okId(m.id)||isFr(m.id)||SO.req.has(m.id)||SO.req.size>=20)break;const n=cut(m.name);SO.req.set(m.id,n);if(okId(m.h))SO.reqH.add(m.h);frDraw();ntAdd('fr:'+m.id,'👋 '+n+' quer ser seu amigo.',()=>accFr(m.id),'✔ Aceitar');break}
 // o servidor só manda facc quando houve pedido seu de verdade (lib/social.js)
 case 'facc':if(okId(m.id)&&!isFr(m.id)){addFr(m.id,m.name);SO.sent.clear();say('','🤝 '+cut(m.name)+' aceitou seu pedido de amizade.',1)}break;
 case 'finv':if(okId(m.id)&&isFr(m.id)){const f=SO.fr.find(x=>x.id===m.id);if(m.name)f.n=cut(m.name);ntAdd('inv:'+m.id,'📨 '+f.n+' chamou você para a sala dele(a).',()=>goInv(m.code),'🚪 Entrar')}break;
 case 'gchat':gsay(m);break;
 case 'gsys':if(typeof m.text==='string')gsys(m.text.slice(0,200));break;
 case 'gn':if(Number.isInteger(m.n)&&m.n>=0){SO.n=m.n;gBadge()}break;
 case 'pfid':{const a=actors.get(m.id);if(a&&okId(m.fid)){a.fid=m.fid;if(!$('#pFr').classList.contains('hide'))frDraw()}break}}};
frDraw();
}
