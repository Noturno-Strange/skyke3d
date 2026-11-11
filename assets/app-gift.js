/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Painel de presentes. Script comum, no mesmo escopo global dos outros app-*.js (usa $, send, say, tog, mode, sfx, fb, ntAdd, vlist).
 * O servidor decide tudo (lib/gifts.js): quem envia sai da sessão, e é ele que confere se o jogador já colheu a planta ou preparou a
 * receita, os limites do dia e se a caixa de quem recebe tem espaço. Aqui só se escolhe o destinatário e o item e se mostra a caixa.
 * A caixa é uma coleção para mostrar: o presente não vai para a mochila, não vira moeda e não volta para quem enviou.
 * Economia: nada roda com o painel fechado; a caixa é pedida ao entrar (para o aviso de presentes novos) e ao abrir o painel.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
// Dentro de uma função: em script comum, função declarada num bloco vira global e sobrescreveria funções de outros arquivos.
(()=>{
const{CROPS,CROP,RECIPES,RECIPE}=SKYCAT;
const GF={box:null,other:null,to:'',toName:'',tab:0,sel:'',pick:0,q:'',busy:false,rid:'',bt:0,askAt:0,left:-1,perDay:5,next:0,okAt:0,rmAt:0};
const el=s=>$(s);
const norm=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const h=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e};
const open=()=>!el('#pGift').classList.contains('hide');
const okPp=x=>typeof x==='string'&&/^[0-9a-f]{20}$/.test(x);
const rid=()=>{const a=new Uint8Array(9);crypto.getRandomValues(a);return[...a].map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,16)};
// só o que vem do catálogo é desenhado: um presente com item desconhecido (cliente antigo) é ignorado
const itemOf=g=>g&&(g.k==='c'?CROP[g.i]:g.k==='r'?RECIPE[g.i]:null)||null;
const kindOf=k=>k==='c'?'da fazenda':'da culinária';
const day=t=>new Date(t).toLocaleDateString('pt-BR');
const cut=s=>String(s==null?'':s).replace(/[\u0000-\u001f]/g,'').slice(0,16);
const say2=t=>{el('#gfRes').textContent=t||''};

// ---------- caixas (a minha e a de quem estou visitando): uma grade de presentes ----------
function grid(box,list,own){box.textContent='';
 for(const g of list){const it=itemOf(g);if(!it)continue;const b=h('button','gfc'+(own&&GF.pick===g.id?' sel':''));b.type='button';b.setAttribute('role','listitem');if(own)b.dataset.id=String(g.id);
  const what=it.n+' '+kindOf(g.k)+', de '+cut(g.n)+', em '+day(g.at);b.append(h('span','gic',it.ic),h('span','gfn',cut(g.n)));b.title=what;b.setAttribute('aria-label',what);box.append(b)}
 if(!box.children.length)box.append(h('p','gfnone',own?'Sua caixa está vazia. Quando alguém enviar um presente, ele aparece aqui.':'Esta caixa ainda está vazia.'))}
function drawBox(){const b=GF.box,n=b?b.total:0;
 el('#gfSum').textContent=!b?'Carregando…':n+(n===1?' presente':' presentes')+' de '+b.max+(b.unseen?' · '+b.unseen+(b.unseen===1?' novo':' novos'):'')+'. Ficam aqui para mostrar: não vão para a mochila.';
 grid(el('#gfBox'),b?b.list:[],true);drawPick()}
function drawPick(){const box=el('#gfDet'),g=GF.box&&GF.box.list.find(x=>x.id===GF.pick),it=itemOf(g);box.textContent='';
 if(!it){box.append(h('span','','Toque num presente para ver quem enviou e quando.'));return}
 box.append(h('b','',it.ic+' '+it.n),h('span','',' · '+kindOf(g.k)),h('br'),h('span','','De '+cut(g.n)+', em '+day(g.at)+'.'));
 const a=h('div','pfact'),rm=h('button','pfb','🗑 Tirar da caixa');rm.type='button';rm.dataset.rm=String(g.id);a.append(rm);box.append(a)}
function drawOther(){const o=GF.other,n=o?o.total:0;
 el('#gfWho').textContent=!GF.to?'':!o?'Carregando a caixa de '+(GF.toName||'…')+'…':o.none?'Este jogador não tem o perfil público ligado: a caixa dele não aparece e não dá para enviar presentes.':'Caixa de '+GF.toName+': '+n+(n===1?' presente':' presentes')+'.';
 grid(el('#gfOther'),o&&o.list?o.list:[],false);el('#gfGive').disabled=!GF.to||!o||!!o.none;el('#gfGive').textContent='🎁 Enviar um presente'+(GF.toName?' para '+GF.toName:'')}
// bolinha no botão da barra quando há presente novo (também com o painel fechado)
function dot(){const b=el('#bGift'),n=GF.box?GF.box.unseen:0;if(!b)return;b.classList.toggle('gfnew',n>0);const lab='Presentes'+(n?' · '+n+(n===1?' novo':' novos'):'');b.title=lab;b.setAttribute('aria-label',lab)}

// ---------- enviar: destinatário, limite do dia e a lista do que eu já produzi ----------
const has=(k,id)=>k==='c'?!!(window.farmHas&&farmHas(id)):!!(window.cookHas&&cookHas(id));
function rows(){const q=GF.q,out=[];let n=0,total=0;
 for(const[k,title,list]of[['c','🌱 Colheitas da fazenda',CROPS],['r','🍳 Receitas da culinária',RECIPES]]){const mine=list.filter(x=>has(k,x.id));total+=mine.length;const hit=mine.filter(x=>!q||norm(x.n).includes(q));if(!hit.length)continue;
  out.push({h:34,k:'g',n:title,c:hit.length});for(const it of hit){out.push({h:44,k:'i',kind:k,it});n++}}
 return{rows:out,n,total}}
function bindRow(e,r){e.textContent='';
 if(r.k==='g'){const d=h('div','mgh gfh');d.append(h('span','',r.n),h('small','','('+r.c+')'));e.append(d);return}
 const key=r.kind+':'+r.it.id,b=h('button','ckrow'+(GF.sel===key?' sel':''));b.type='button';b.dataset.id=key;const t=h('span','tx');t.append(h('span','nm',r.it.n));
 b.append(h('span','ic',r.it.ic),t,h('span','tg',GF.sel===key?'escolhido':''));b.setAttribute('aria-label',r.it.n+', '+kindOf(r.kind)+(GF.sel===key?', escolhido':''));b.title=r.it.n;e.append(b)}
const L=vlist(el('#gfL'),{bind:bindRow});
function build(){const{rows:r,n,total}=rows();
 L.set(r.length?r:[{h:68,k:'g',n:total?'Nenhum item com esse nome.':'Você ainda não tem o que presentear: colha uma planta na 🌱 Fazenda ou prepare uma receita na 🍳 Culinária.',c:0}]);
 el('#gfCount').textContent=n+' de '+total}
function drawTo(){const lim=GF.left===0;
 el('#gfTo').textContent=GF.to?'Para: '+(GF.toName||'jogador'):'Escolha alguém: em 👥, toque no nome e em 🎁 Presentes.';
 el('#gfLeft').textContent=GF.left<0?'':lim?'Limite de hoje atingido'+(GF.next?' · volta '+new Date(GF.next).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''):(GF.left===1?'Resta 1 presente':'Restam '+GF.left+' presentes')+' de '+GF.perDay+' hoje'}
function drawSend(){const box=el('#gfSend'),i=GF.sel.indexOf(':'),k=GF.sel.slice(0,i),it=itemOf({k,i:GF.sel.slice(i+1)});box.textContent='';
 if(!it){box.append(h('span','','Escolha um item. O presente fica na caixa de quem recebe, para todos verem; você não perde nada e ele não vai para a mochila de ninguém.'));return}
 box.append(h('b','',it.ic+' '+it.n),h('span','',' · '+kindOf(k)+(GF.to?' · para '+(GF.toName||'jogador'):'')));
 const a=h('div','pfact'),b=h('button','pfb pri',Date.now()-GF.okAt<5000?'Tocar de novo para confirmar':'🎁 Enviar presente');b.type='button';b.dataset.go='1';b.disabled=GF.busy||!GF.to||GF.left===0;a.append(b);box.append(a);
 if(!GF.to)box.append(h('small','','Falta escolher para quem.'));else if(GF.left===0)box.append(h('small','','Você já enviou os '+GF.perDay+' presentes de hoje.'))}

// ---------- abas ----------
function tab(t){if(t===2&&!GF.to)t=0;GF.tab=t;el('#gft2').hidden=!GF.to;
 for(let i=0;i<3;i++){const b=el('#gft'+i),on=i===t;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;el('#gfP'+i).hidden=!on}
 if(t===0){drawBox();if(GF.box&&GF.box.unseen)ask(true,true)}else if(t===1){drawTo();build();drawSend()}else drawOther()}
el('#pGift .cktabs').onclick=e=>{const b=e.target.closest('[data-t]');if(b&&!b.hidden)tab(+b.dataset.t)};
el('#pGift .cktabs').onkeydown=e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();const n=GF.to?3:2,t=(GF.tab+(e.key==='ArrowRight'?1:n-1))%n;tab(t);el('#gft'+t).focus()};
el('#gfq').oninput=()=>{GF.q=norm(el('#gfq').value.trim());build()};el('#gfq').onkeydown=e=>e.stopPropagation();
el('#gfL').onclick=e=>{const b=e.target.closest('[data-id]');if(!b)return;GF.sel=b.dataset.id;GF.okAt=0;L.refresh();drawSend()};
el('#gfBox').onclick=e=>{const b=e.target.closest('[data-id]');if(!b)return;GF.pick=+b.dataset.id;GF.rmAt=0;drawBox()};
// tirar um presente da própria caixa: dois toques (some para sempre; não devolve nada a quem enviou)
el('#gfDet').onclick=e=>{const b=e.target.closest('[data-rm]');if(!b)return;if(Date.now()-GF.rmAt>5000){GF.rmAt=Date.now();b.textContent='Tocar de novo: some para sempre';return}GF.rmAt=0;GF.pick=0;send({t:'giftdel',id:+b.dataset.rm})};
el('#gfGive').onclick=()=>{if(GF.to)tab(1)};

// ---------- enviar (dois toques: o primeiro pede confirmação por 5 s) ----------
const WHY={pid:'Entre com sua identidade para enviar presentes.',self:'Não dá para presentear você mesmo.',item:'Item inválido.',nao_tem:'Você ainda não colheu ou preparou esse item.',
 dia:'Você já enviou os presentes de hoje. Tente de novo amanhã.',par:'Você já enviou um presente para essa pessoa hoje. Amanhã pode de novo.',cheia:'A caixa dessa pessoa está cheia.',
 full:'Não há espaço para novas caixas de presentes agora.',sem_perfil:'Essa pessoa não tem o perfil público ligado, então não recebe presentes.',calma:'Calma! Um presente de cada vez.'};
el('#gfSend').onclick=e=>{const b=e.target.closest('[data-go]');if(!b||b.disabled||GF.busy||mode!=='play')return;
 if(Date.now()-GF.okAt>5000){GF.okAt=Date.now();drawSend();return}
 const i=GF.sel.indexOf(':');GF.okAt=0;GF.busy=true;GF.rid=rid();drawSend();say2('Enviando…');clearTimeout(GF.bt);
 GF.bt=setTimeout(()=>{if(GF.busy){GF.busy=false;say2('Sem resposta do servidor. Tente de novo.');drawSend()}},5000);
 send({t:'giftsend',to:GF.to,k:GF.sel.slice(0,i),i:GF.sel.slice(i+1),rid:GF.rid})};
function quota(m){if(Number.isInteger(m.left))GF.left=m.left;if(Number.isInteger(m.perDay))GF.perDay=m.perDay;GF.next=Number.isFinite(m.next)?m.next:0}
function result(m){if(m.rid!==GF.rid)return;GF.busy=false;clearTimeout(GF.bt);quota(m);drawTo();
 if(!m.ok){say2('⚠ '+(WHY[m.reason]||'Não foi possível enviar agora.'));drawSend();fb(el('#gfSend'),0);return}
 const it=itemOf(m.gift);say2('🎁 Presente enviado'+(it?': '+it.ic+' '+it.n:'')+(GF.toName?' para '+GF.toName:'')+'!');GF.sel='';L.refresh();drawSend();sfx('confirm',.9);fb(el('#gfSend'),1);
 if(window.lifeShow&&typeof me!=='undefined'&&me&&me.g)lifeShow('🎁',me.g.position.x,2.4,me.g.position.z,{dur:2.5,s:1});
 if(GF.to)send({t:'giftsee',to:GF.to})}

// ---------- servidor ----------
function ask(force,seen){if(mode!=='play')return;const n=Date.now();if(!force&&n-GF.askAt<60000)return;GF.askAt=n;send(seen?{t:'giftget',seen:true}:{t:'giftget'})}
// abrir a caixa de alguém (botão 🎁 Presentes em 👥, ou o link do perfil público): mostra a caixa e deixa enviar
window.giftTo=(pp,name)=>{if(!okPp(pp))return;GF.to=pp;GF.toName=cut(name);GF.other=null;GF.sel='';if(!open())tog('pGift');tab(2);if(mode==='play')send({t:'giftsee',to:pp})};
// link do perfil público (/#presente=código): guarda o destinatário e abre o painel assim que o jogador entra numa sala
let pend=(location.hash.match(/presente=([0-9a-f]{20})/)||[])[1]||'';
window.giftBoot=()=>{ask(true);if(pend){const p=pend;pend='';giftTo(p,'')}};
window.giftMsg=m=>{
 if(m.t==='gifts'){if(!Array.isArray(m.list))return;GF.box={total:m.total|0,max:m.max|0,unseen:m.unseen|0,list:m.list.slice(0,300)};quota(m);dot();if(open()){if(GF.tab===0)drawBox();else if(GF.tab===1){drawTo();drawSend()}}return}
 if(m.t==='giftbox'){if(m.to!==GF.to)return;GF.other=m.none?{none:1}:{total:m.total|0,list:Array.isArray(m.list)?m.list.slice(0,100):[]};if(typeof m.name==='string'&&m.name)GF.toName=cut(m.name);if(open()){if(GF.tab===2)drawOther();else if(GF.tab===1){drawTo();drawSend()}}return}
 if(m.t==='giftr'){result(m);return}
 // chegou um presente: aviso no sino, no chat e a bolinha no botão; a caixa é pedida de novo (o presente já está guardado no servidor)
 if(m.t==='giftin'){const it=itemOf(m),n=cut(m.n);if(!it)return;if(GF.box)GF.box.unseen=m.unseen|0;dot();
  const txt='🎁 '+n+' enviou '+it.ic+' '+it.n+' para você.';say('',txt,1);sfx('notif',.9);ntAdd('gift',txt,()=>{if(!open())tog('pGift');tab(0)},'📦 Ver');ask(true,open()&&GF.tab===0)}};
function start(){ask(false);tab(GF.tab)}
new MutationObserver(()=>{if(open())start()}).observe(el('#pGift'),{attributes:true,attributeFilter:['class']});
$('#bGift').onclick=()=>tog('pGift');
drawBox();
})();
