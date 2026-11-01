/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Amigos, convites e chat global (o servidor está em lib/social.js). Script comum, no mesmo escopo global dos outros app-*.js.
 * Sem conta: a chave secreta (skyke_fk) e a lista de amigos (skyke_friends) ficam só neste navegador. O servidor recebe a
 * chave para calcular o id público e esquece tudo quando a pessoa sai da sala.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
{// tudo num bloco: os nomes daqui não colidem com os dos outros scripts; app-net.js chama só os ganchos window.soc*
const FK='skyke_fk',FL='skyke_friends',FM='skyke_gmute',FMAX=100;
const jget=(k,d)=>{try{const v=JSON.parse(LS(k)||'null');return Array.isArray(v)?v:d}catch(e){return d}};
// silenciados: id → nome (formato antigo: só ids)
const muteLoad=()=>new Map(jget(FM,[]).map(x=>typeof x==='string'?[x,'Jogador']:x&&[x.id,cut(x.n)]).filter(x=>x&&okId(x[0])));
const fkey=()=>{let k=LS(FK);if(!/^[A-Za-z0-9_-]{43}$/.test(k||'')){const b=crypto.getRandomValues(new Uint8Array(32));k=btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');LS(FK,k)}return k};
function okId(x){return typeof x==='string'&&/^[a-z2-7]{12}$/.test(x)}
function cut(s){return String(s||'').slice(0,LIMITS.name)}
// estado: amigos {id,n} (n = último nome visto), online, pedidos recebidos e enviados, silenciados no chat global
const SO={me:'',fr:jget(FL,[]).filter(f=>f&&okId(f.id)).slice(0,FMAX),on:new Set(),req:new Map(),sent:new Set(),mute:muteLoad(),tab:'s',gUnread:0,ready:false,n:0};
const isFr=id=>SO.fr.some(f=>f.id===id);
const saveMute=()=>LS(FM,JSON.stringify([...SO.mute].slice(-200).map(([id,n])=>({id,n}))));
const saveFr=()=>{LS(FL,JSON.stringify(SO.fr));if(SO.ready)send({t:'friends',k:fkey(),ids:SO.fr.map(f=>f.id)})};
function addFr(id,n){if(!okId(id)||id===SO.me)return;const f=SO.fr.find(x=>x.id===id);if(f)f.n=cut(n)||f.n;else if(SO.fr.length<FMAX)SO.fr.push({id,n:cut(n)||'Amigo'});SO.req.delete(id);SO.sent.delete(id);saveFr();frDraw()}
function delFr(id){SO.fr=SO.fr.filter(f=>f.id!==id);SO.on.delete(id);saveFr();frDraw()}
function reqFr(id,n){if(!okId(id)||id===SO.me||isFr(id)||SO.sent.has(id))return;SO.sent.add(id);send({t:'freq',to:id});say('','👋 Pedido de amizade enviado para '+cut(n)+'.',1);frDraw()}
function accFr(id){const n=SO.req.get(id);if(n===undefined)return;send({t:'facc',to:id});addFr(id,n);say('','🤝 Agora vocês são amigos: '+n+'.',1);ntDropKind('fr:'+id)}
function decFr(id){SO.req.delete(id);ntDropKind('fr:'+id);frDraw()}
function invFr(id){if(mode!=='play'||!SO.on.has(id))return;send({t:'finv',to:id});const f=SO.fr.find(x=>x.id===id);say('','📨 Convite enviado para '+(f?f.n:'seu amigo')+'.',1)}
function goInv(code){if(!/^[A-Z0-9]{10}$/.test(code||''))return;if(mode==='play')leave();start({t:'join',code})}
function ntDropKind(k){const it=NT.items.find(i=>i.kind===k);if(it)ntDrop(it.id)}
// ---------- painel 👥: pedidos, amigos (online primeiro) e quem está na sala ----------
const btn=(t,lab,f,cls)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.title=lab;b.setAttribute('aria-label',lab);if(cls)b.className=cls;b.onclick=f;return b};
function row(name,dot,...bs){const r=document.createElement('div'),s=document.createElement('span');r.className='fr';s.textContent=name;if(dot!==null){const d=document.createElement('i');d.className='dot'+(dot?' on':'');d.title=dot?'Online':'Offline';r.append(d)}r.append(s,...bs);return r}
function head(t){const h=document.createElement('div');h.className='frh';h.textContent=t;return h}
function frDraw(){badge();const L=$('#frl');if(!L||$('#pFr').classList.contains('hide'))return;L.textContent='';
 if(SO.req.size){L.append(head('Pedidos'));SO.req.forEach((n,id)=>L.append(row(n,null,btn('✔','Aceitar '+n,()=>accFr(id),'pri'),btn('✖','Recusar '+n,()=>decFr(id)))))}
 const fr=[...SO.fr].sort((a,b)=>(SO.on.has(b.id)-SO.on.has(a.id))||a.n.localeCompare(b.n));
 L.append(head(fr.length?'Amigos · '+SO.on.size+' online':'Amigos'));
 if(!fr.length){const e=document.createElement('div');e.className='nempty';e.textContent='Adicione alguém da sala ou do chat global.';L.append(e)}
 fr.forEach(f=>{const on=SO.on.has(f.id),bs=[];if(on&&mode==='play')bs.push(btn('📨','Convidar '+f.n+' para esta sala',()=>invFr(f.id)));
  const x=btn('✖','Remover '+f.n,()=>{if(x.dataset.ok){delFr(f.id);return}x.dataset.ok=1;x.textContent='Remover?';setTimeout(()=>{x.dataset.ok='';x.textContent='✖'},3000)});bs.push(x);L.append(row(f.n,on,...bs))});
 const near=[...actors.values()].filter(a=>!a.bot&&okId(a.fid)&&a.fid!==SO.me&&!isFr(a.fid));
 if(near.length){L.append(head('Nesta sala'));near.forEach(a=>L.append(row(a.name,null,SO.sent.has(a.fid)||SO.req.has(a.fid)?btn('⏳','Pedido pendente',()=>{}):btn('➕','Adicionar '+a.name,()=>reqFr(a.fid,a.name)))))}
 // silenciados no chat global: dá para desfazer daqui
 if(SO.mute.size){L.append(head('Silenciados no global'));SO.mute.forEach((n,id)=>L.append(row(n,null,btn('🔊','Voltar a ver '+n+' no chat global',()=>{SO.mute.delete(id);saveMute();say('','🔊 '+n+' voltou a aparecer no chat global.',1);frDraw()}))))}}
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
 if(id!==SO.me){if(!isFr(id))m.append(btn('➕ Amigo','Adicionar '+n,()=>{reqFr(id,n);m.remove()}));m.append(btn('🔇','Silenciar '+n+' no chat global',()=>{SO.mute.set(id,n);saveMute();document.querySelectorAll('#glog [data-f="'+id+'"]').forEach(x=>x.remove());say('','🔇 '+n+' foi silenciado no chat global. Para desfazer: 👥 › Silenciados.',1);m.remove()}))}
 if(m.children.length){e.currentTarget.after(m);setTimeout(()=>m.remove(),6000)}}
function gsay(m){if(!okId(m.id)||SO.mute.has(m.id)||typeof m.text!=='string')return;const d=document.createElement('div'),b=document.createElement('button'),n=cut(m.name);d.dataset.f=m.id;b.type='button';b.className='gname'+(isFr(m.id)?' frn':'');b.textContent=n+':';b.onclick=e=>nameMenu(e,m.id,n);d.append(b,' ',m.text.slice(0,200));
 const L=$('#glog');L.append(d);while(L.children.length>80)L.firstChild.remove();if(SO.tab==='g'&&!$('#chat').classList.contains('hide'))L.scrollTop=L.scrollHeight;else if(m.id!==SO.me){SO.gUnread++;gBadge()}}
// o campo de texto manda para a aba aberta
{const i=$('#msg'),k=i.onkeydown;let gl=0;i.onkeydown=e=>{if(SO.tab!=='g')return k(e);e.stopPropagation();if(e.key!=='Enter')return;const t=i.value.trim().replace(/[\u0000-\u001f]/g,'').slice(0,140),n=Date.now();if(!t)return;if(n-gl<2600){say('','⏳ No chat global, aguarde uns segundos entre mensagens.',1);return}gl=n;i.value='';send({t:'gchat',text:t})}}
// ---------- ganchos chamados por app-net.js ----------
window.socEnter=()=>{SO.ready=true;SO.on.clear();send({t:'friends',k:fkey(),ids:SO.fr.map(f=>f.id)});send({t:'gsub',on:true});$('#glog').textContent='';SO.gUnread=0;gBadge();frDraw()};
window.socLeave=()=>{SO.ready=false;SO.on.clear();SO.sent.clear();tab('s');$('#pFr').classList.add('hide');frDraw()};
window.socForget=()=>{[FK,FL,FM].forEach(k=>LS(k,null));SO.fr=[];SO.mute.clear();frDraw()};
// outra aba do mesmo navegador mudou a lista de amigos, os silenciados ou a chave (ex.: restaurou um código): acompanha
addEventListener('storage',e=>{if(e.key===FL){SO.fr=jget(FL,[]).filter(f=>f&&okId(f.id)).slice(0,FMAX);[...SO.req.keys()].filter(isFr).forEach(id=>SO.req.delete(id))}else if(e.key===FM)SO.mute=muteLoad();else if(e.key!==FK)return;
 if(SO.ready&&e.key!==FM)send({t:'friends',k:fkey(),ids:SO.fr.map(f=>f.id)});frDraw()});
window.socCount=()=>SO.fr.length;
// código de recuperação: leva a chave e os ids dos amigos (sem nomes nem mensagens); ao restaurar, junta com a lista deste aparelho
window.socCode=()=>({fk:fkey(),friends:SO.fr.map(f=>f.id)});
window.socRestore=(k,ids)=>{if(!/^[A-Za-z0-9_-]{43}$/.test(k||''))return -1;LS(FK,k);SO.me='';(ids||[]).filter(okId).forEach(id=>{if(!isFr(id)&&SO.fr.length<FMAX)SO.fr.push({id,n:'Amigo'})});saveFr();frDraw();return SO.fr.length};
window.soc=m=>{switch(m.t){
 case 'fme':if(okId(m.id))SO.me=m.id;break;
 case 'fpres':if(okId(m.id)&&isFr(m.id)){if(m.on)SO.on.add(m.id);else SO.on.delete(m.id);if(m.on&&m.name){SO.fr.find(f=>f.id===m.id).n=cut(m.name);LS(FL,JSON.stringify(SO.fr))}frDraw()}break;
 case 'freq':{if(!okId(m.id)||isFr(m.id)||SO.req.has(m.id)||SO.req.size>=20)break;const n=cut(m.name);SO.req.set(m.id,n);frDraw();ntAdd('fr:'+m.id,'👋 '+n+' quer ser seu amigo.',()=>accFr(m.id),'✔ Aceitar');break}
 case 'facc':if(okId(m.id)&&SO.sent.has(m.id)){addFr(m.id,m.name);say('','🤝 '+cut(m.name)+' aceitou seu pedido de amizade.',1)}break;
 case 'finv':if(okId(m.id)&&isFr(m.id)){const f=SO.fr.find(x=>x.id===m.id);if(m.name)f.n=cut(m.name);ntAdd('inv:'+m.id,'📨 '+f.n+' chamou você para a sala dele(a).',()=>goInv(m.code),'🚪 Entrar')}break;
 case 'ghist':if(Array.isArray(m.list)){m.list.slice(-25).forEach(gsay);SO.gUnread=0;gBadge()}break;
 case 'gchat':gsay(m);break;
 case 'gn':if(Number.isInteger(m.n)&&m.n>=0){SO.n=m.n;gBadge()}break;
 case 'pfid':{const a=actors.get(m.id);if(a&&okId(m.fid)){a.fid=m.fid;if(!$('#pFr').classList.contains('hide'))frDraw()}break}}};
frDraw();
}
