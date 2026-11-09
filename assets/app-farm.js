/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Painel da fazenda. Script comum, no mesmo escopo global dos outros app-*.js (usa $, send, say, tog, LS, mode, me, sfx, fb).
 * O servidor decide tudo (lib/farm.js): o crescimento sai dos horários que ele guarda, e só ele colhe, soma experiência e recordes.
 * Aqui só se escolhe a semente e o canteiro e se mostra o progresso. As barras andam no relógio do servidor (diferença medida
 * em cada resposta), sem perguntar nada a ele.
 * Economia: com o painel fechado, um intervalo de 5 s só confere se alguma planta ficou pronta (bolinha no botão); aberto, as
 * barras andam uma vez por segundo.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
// Dentro de uma função: em script comum, função declarada num bloco vira global e sobrescreveria funções de outros arquivos.
(()=>{
const{CROPS,CROP,INGR,FARM_W,FARM_H,FARM_LAND,FARM_PROP,FARM_HOUSE,farmOpen}=SKYCAT;
const SLOTS=FARM_W*FARM_H;
const FM={st:null,off:0,tab:0,seed:'',sel:'',q:'',dig:false,busy:false,rid:'',bt:0,tm:0,askAt:0};
const SK='skyke_farm_seed',GK='skyke_farm_g';
let COL={};try{COL=JSON.parse(LS(GK)||'{}')||{}}catch(e){COL={}}
try{const s=LS(SK);if(s&&CROP[s])FM.seed=s}catch(e){}
const el=s=>$(s);
const norm=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const h=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e};
const open=()=>!el('#pFarm').classList.contains('hide');
const now=()=>Date.now()+FM.off;
const lv=()=>FM.st?FM.st.lv:1;
const rid=()=>{const a=new Uint8Array(9);crypto.getRandomValues(a);return[...a].map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,16)};
// tempo em texto curto: 45 s, 12 min, 1 h 20 min
function dur(ms){const s=Math.max(0,Math.ceil(ms/1000));if(s<60)return s+' s';const m=Math.ceil(s/60);if(m<60)return m+' min';const hh=Math.floor(m/60),mm=m%60;return hh+' h'+(mm?' '+mm+' min':'')}
const plotOf=i=>FM.st&&FM.st.plots?FM.st.plots[i]:null;
const pct=p=>p.e<=p.a?1:Math.min(1,Math.max(0,(now()-p.a)/(p.e-p.a)));
const ready=p=>!!p&&now()>=p.e;
// estágio do desenho: semente, broto, crescendo, pronta
// canteiros abertos pelo terreno comprado; moedas em texto (1.234)
const openSet=()=>new Set(farmOpen(FM.st?FM.st.land:0));
const coin=n=>'🪙 '+Number(n||0).toLocaleString('pt-BR');
const stage=p=>ready(p)?CROP[p.c].ic:pct(p)<.34?'🟤':pct(p)<.67?'🌱':'🌿';

// ---------- canteiros ----------
const cells=[];
function buildGrid(){const g=el('#fmGrid');g.textContent='';g.style.setProperty('--fw',String(FARM_W));
 for(let r=0;r<FARM_H;r++){const row=h('div','fmrow');row.setAttribute('role','row');
  for(let c=0;c<FARM_W;c++){const i=r*FARM_W+c,b=h('button','fmc');b.type='button';b.dataset.i=String(i);b.setAttribute('role','gridcell');
   const ic=h('span','fic'),bar=h('span','fbar'),t=h('span','ftm');bar.append(h('i'));b.append(ic,bar,t);row.append(b);cells[i]={b,ic,bar:bar.firstChild,t}}
  g.append(row);rows2.push(row)}}
const rows2=[];
function drawGrid(){const op=openSet();
 // mostra o terreno aberto e mais uma linha e uma coluna fechadas (o que a próxima compra abre); o resto da grade fica escondido
 let mr=0,mc=0;for(const i of op){mr=Math.max(mr,i/FARM_W|0);mc=Math.max(mc,i%FARM_W)}const vr=Math.min(FARM_H-1,mr+1),vc=Math.min(FARM_W-1,mc+1);
 el('#fmGrid').style.setProperty('--fw',String(vc+1));rows2.forEach((r,k)=>{r.hidden=k>vr});
 for(let i=0;i<SLOTS;i++){const x=cells[i],p=plotOf(i),locked=!op.has(i);x.b.hidden=(i%FARM_W)>vc;
  x.b.className='fmc'+(locked?' lock':p?ready(p)?' ready':' grow':' empty')+(p&&p.w&&!ready(p)?' wet':'')+(FM.dig&&p?' dig':'');
  x.b.disabled=locked;
  if(locked){x.ic.textContent='🔒';x.t.textContent='';x.bar.style.width='0';x.b.setAttribute('aria-label','Canteiro '+(i+1)+' fechado: compre um terreno maior na Loja');x.b.title='Compre um terreno maior na Loja';continue}
  if(!p){x.ic.textContent='';x.t.textContent='';x.bar.style.width='0';const s=FM.seed&&CROP[FM.seed];
   x.b.setAttribute('aria-label','Canteiro '+(i+1)+' vazio'+(s?'. Tocar para plantar '+s.n:''));x.b.title=s?'Plantar '+s.n:'Escolha uma semente';continue}
  const cr=CROP[p.c],ok=ready(p),f=pct(p);
  x.ic.textContent=stage(p);x.bar.style.width=Math.round(f*100)+'%';x.t.textContent=ok?'pronta':dur(p.e-now());
  const what=cr.n+(ok?', pronta para colher':', '+Math.round(f*100)+'%, falta '+dur(p.e-now())+(p.w?', regada':''));
  x.b.setAttribute('aria-label','Canteiro '+(i+1)+': '+what+(FM.dig?'. Tocar para arrancar':ok?'. Tocar para colher':p.w?'':'. Tocar para regar'));x.b.title=what}
 const any=FM.st&&FM.st.plots.some(ready),grow=FM.st&&FM.st.plots.some((p,i)=>p&&!ready(p)&&!p.w);
 el('#fmHarvestAll').disabled=FM.busy||!any;el('#fmWaterAll').disabled=FM.busy||!grow;
 el('#fmPlantAll').disabled=FM.busy||!FM.seed||!FM.st||![...op].some(i=>!plotOf(i))}
// bolinha no botão da barra quando há colheita pronta (também com o painel fechado)
function dot(){const b=el('#bFarm');if(b)b.classList.toggle('fmready',!!(FM.st&&FM.st.plots.some(ready)))}

// ---------- semente escolhida ----------
function drawSeed(){const s=FM.seed&&CROP[FM.seed],e=el('#fmSeed');
 e.textContent=s?'Semente: '+s.ic+' '+s.n+' · '+dur(s.t*1000):'Nenhuma semente escolhida';
 if(s&&s.lv>lv())e.textContent+=' (nível '+s.lv+')'}
function pickSeed(id){const s=CROP[id];if(!s)return;if(s.lv>lv()){say2('🔒 '+s.n+' libera no nível '+s.lv+' de fazendeiro.');fb(el('#fmDet'),0);return}
 FM.seed=id;LS(SK,id);drawSeed();drawGrid();say2(s.ic+' '+s.n+' escolhida. Toque num canteiro vazio para plantar.');tab(0);fb(el('#fmSeed'),1,'pickup')}

// ---------- lista de sementes (grupos recolhíveis + busca, como na culinária) ----------
function rows(){const q=FM.q,by=new Map(),out=[];let n=0;
 for(const c of CROPS){if(q&&!norm(c.n).includes(q))continue;if(!by.has(c.c))by.set(c.c,[]);by.get(c.c).push(c);n++}
 for(const[g,list]of by){const id='s:'+g,closed=!q&&!!COL[id];out.push({h:34,k:'g',g:id,n:g,c:list.length,closed});if(!closed)for(const it of list)out.push({h:58,k:'i',it})}
 return{rows:out,n}}
function bindRow(e,r){e.textContent='';
 if(r.k==='g'){const b=h('button','mgh');b.type='button';b.dataset.g=r.g;b.setAttribute('aria-expanded',String(!r.closed));b.append(h('span','',(r.closed?'▸ ':'▾ ')+r.n),h('small','','('+r.c+')'));e.append(b);return}
 const c=r.it,lock=c.lv>lv(),n=FM.st&&FM.st.done?FM.st.done[c.id]|0:0;
 const b=h('button','ckrow'+(lock?' dim':'')+(FM.sel===c.id?' sel':'')+(FM.seed===c.id?' cur':''));b.type='button';b.dataset.id=c.id;
 const t=h('span','tx');t.append(h('span','nm',c.n),h('span','sub','⏱ '+dur(c.t*1000)+' · ✨ '+c.xp+' XP · 🧺 '+c.y[0]+(c.y[1]>c.y[0]?'–'+c.y[1]:'')));
 b.append(h('span','ic',lock?'🔒':c.ic),t,h('span','tg',lock?'nível '+c.lv:n?'✔ ×'+n:'nova'));
 b.setAttribute('aria-label',c.n+', '+dur(c.t*1000)+' para crescer, '+c.xp+' de experiência'+(lock?', libera no nível '+c.lv:n?', colhida '+n+(n===1?' vez':' vezes'):', ainda não colhida'));e.append(b)}
const L=vlist(el('#fmL'),{bind:bindRow});
function build(){const{rows:r,n}=rows();L.set(r);el('#fmCount').textContent=n+' de '+CROPS.length}
function drawDet(){const id=FM.sel,box=el('#fmDet');box.textContent='';
 if(!id){box.append(h('span','','Toque numa semente para ver os detalhes. Regar corta um quarto do tempo que falta e rende +1 na colheita.'));return}
 const c=CROP[id],lock=c.lv>lv(),n=FM.st&&FM.st.done?FM.st.done[id]|0:0;
 box.append(h('b','',c.ic+' '+c.n),h('span','',' · '+c.c+' · '+dur(c.t*1000)),h('br'),
  h('span','','Colheita de '+c.y[0]+(c.y[1]>c.y[0]?' a '+c.y[1]:'')+' · '+c.xp+' XP'+(n?'':' (o triplo na primeira vez)')+(c.g&&INGR[c.g]?' · dá '+INGR[c.g].ic+' '+INGR[c.g].n+' da Culinária':'')));
 const a=h('div','pfact'),b=h('button','pfb pri',lock?'🔒 Nível '+c.lv:'Usar esta semente');b.type='button';b.dataset.use=id;b.disabled=lock;a.append(b);box.append(a)}

// ---------- progresso, recordes e conquistas ----------
function drawHead(){const s=FM.st,p=s&&!s.max&&s.hi>s.lo?Math.round((s.xp-s.lo)/(s.hi-s.lo)*100):s&&s.max?100:0;
 el('#fmLv').textContent=(s?'Nível '+s.lv+(s.max?' (máx.)':''):'Nível 1')+(s&&s.rank?' · 🌾 '+s.rank:'');el('#fmLv').title=s&&s.rank?s.rank+(s.rank===1?' safra':' safras')+': experiência ×'+s.mult:'';
 const rb=el('#fmRenew');rb.hidden=!(s&&s.max);if(!rb.hidden&&Date.now()-rnAt>5000)rb.textContent='🌾 Nova safra';
 el('#fmXp').textContent=s?(s.max?s.xp+' XP':(s.xp-s.lo)+' / '+(s.hi-s.lo)+' XP'):'';el('#fmCoins').textContent=coin(s?s.coins:0);
 const bar=el('#fmBar');bar.firstChild.style.width=p+'%';bar.setAttribute('aria-valuenow',String(p));
 const dl=el('#fmRec');dl.textContent='';
 if(s){const r=s.rec,f=(k,v)=>{dl.append(h('dt','',k),h('dd','',v))};
  f('Colheitas',String(r.harvests));f('Total colhido',r.units+(r.units===1?' unidade':' unidades'));f('Plantas diferentes',r.kinds+' de '+r.total);
  f('Regadas',String(r.water));if(r.best&&CROP[r.best.c])f('Maior colheita',CROP[r.best.c].ic+' '+r.best.n+' '+CROP[r.best.c].n);
  if(r.fav&&CROP[r.fav.c])f('Favorita',CROP[r.fav.c].ic+' '+CROP[r.fav.c].n+' (×'+r.fav.n+')');f('Canteiros',s.open+' de '+SLOTS);f('Moedas ganhas',coin(r.earned));
  f('Fazenda',FARM_PROP[s.prop].ic+' '+FARM_PROP[s.prop].n+' · '+FARM_HOUSE[s.house].ic+' '+FARM_HOUSE[s.house].n)}
 const bd=el('#fmBadges');bd.textContent='';if(s)for(const b of s.badges){const c=h('span',b.on?'':'off',b.i);c.setAttribute('role','listitem');c.title=b.n+(b.on?'':' · '+b.t);c.setAttribute('aria-label',b.n+(b.on?' (conquistado)':' ('+b.t+')'));bd.append(c)}}
function drawShare(){const pp=window.pubPp?pubPp():'';el('#fmOpen').disabled=el('#fmCopy').disabled=!pp;
 el('#fmPub').textContent=pp?'Quem tiver o link vê sua fazenda e seus recordes.':'Ligue o perfil público (👤 Perfil) para ver e compartilhar sua fazenda.'}
const say2=(t,node)=>{const r=el('#fmRes');r.textContent='';if(node)r.append(node);else r.textContent=t||''};
function setState(st){if(!st||!Array.isArray(st.plots))return;FM.st=st;FM.off=Number.isFinite(st.now)?st.now-Date.now():0;drawHead();drawSeed();drawGrid();dot();if(open()&&FM.tab===1){build();drawDet()}if(open()&&FM.tab===2)drawShop()}

// ---------- loja: terreno, propriedade e casa (o servidor confere nível e moedas) ----------
const SHOP=[['land','🧱 Terreno',FARM_LAND,t=>t.p+' canteiros'],['prop','🏡 Propriedade',FARM_PROP,t=>t.b?'+'+Math.round(t.b*100)+'% na colheita':'colheita normal'],['house','🏠 Casa',FARM_HOUSE,t=>t.b?'+'+Math.round(t.b*100)+'% de experiência':'experiência normal']];
function drawShop(){const box=el('#fmShop'),s=FM.st;box.textContent='';
 box.append(h('p','fmhave','Você tem '+coin(s?s.coins:0)+'. Cada colheita vende pelo preço da planta.'));
 for(const[k,title,list,what]of SHOP){const cur=s?s[k]:0,t=list[cur],nx=list[cur+1],card=h('div','fmcard');
  card.append(h('b','',title),h('span','',(t.ic?t.ic+' ':'')+t.n+' · '+what(t)));
  if(!nx){card.append(h('small','','No máximo. 🏆'))}
  else{const lk=nx.lv>lv(),poor=!s||s.coins<nx.$,b=h('button','pfb pri',(lk?'🔒 Nível '+nx.lv:'Comprar '+coin(nx.$)));b.type='button';b.dataset.buy=k;b.disabled=lk||poor||FM.busy;
   card.append(h('small','','Próximo: '+(nx.ic?nx.ic+' ':'')+nx.n+' · '+what(nx)+(lk?' · libera no nível '+nx.lv:poor?' · faltam '+coin(nx.$-(s?s.coins:0)):'')),b)}
  box.append(card)}}
el('#fmShop').onclick=e=>{const b=e.target.closest('[data-buy]');if(b&&!b.disabled)act('buy',-1,'',b.dataset.buy)};

// ---------- abas ----------
function tab(t){FM.tab=t;for(let i=0;i<3;i++){const b=el('#fmt'+i),on=i===t;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;el('#fmP'+i).hidden=!on}
 if(t===1){build();drawDet()}else if(t===2)drawShop();else drawGrid()}
el('#pFarm .cktabs').onclick=e=>{const b=e.target.closest('[data-t]');if(b)tab(+b.dataset.t)};
el('#pFarm .cktabs').onkeydown=e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();const t=(FM.tab+(e.key==='ArrowRight'?1:2))%3;tab(t);el('#fmt'+t).focus()};
el('#fmq').oninput=()=>{FM.q=norm(el('#fmq').value.trim());build()};
el('#fmL').onclick=e=>{const g=e.target.closest('[data-g]');if(g){const k=g.dataset.g;if(COL[k])delete COL[k];else COL[k]=1;LS(GK,JSON.stringify(COL));build();return}
 const b=e.target.closest('[data-id]');if(!b)return;FM.sel=b.dataset.id;drawDet();L.refresh()};
el('#fmDet').onclick=e=>{const b=e.target.closest('[data-use]');if(b)pickSeed(b.dataset.use)};
el('#fmPick').onclick=()=>tab(1);

// ---------- ações (uma por vez: o servidor responde antes da próxima) ----------
// o servidor aceita uma ação a cada 150 ms: aqui elas saem com pelo menos 200 ms entre uma e outra
let lastAt=0;
function act(k,i,c,buy){if(FM.busy||mode!=='play')return;FM.busy=true;FM.rid=rid();drawGrid();clearTimeout(FM.bt);
 FM.bt=setTimeout(()=>{if(FM.busy){FM.busy=false;say2('Sem resposta do servidor. Tente de novo.');drawGrid()}},5000);
 const m=buy?{t:'farmdo',k,b:buy,rid:FM.rid}:c?{t:'farmdo',k,i,c,rid:FM.rid}:{t:'farmdo',k,i,rid:FM.rid},w=Math.max(0,lastAt+200-Date.now());
 setTimeout(()=>{lastAt=Date.now();send(m)},w)}
el('#fmGrid').onclick=e=>{const b=e.target.closest('[data-i]');if(!b||b.disabled)return;const i=+b.dataset.i,p=plotOf(i);
 if(FM.dig){if(p)act('dig',i);else say2('Esse canteiro já está vazio.');return}
 if(!p){if(!FM.seed){say2('Escolha uma semente primeiro.');tab(1);return}if(CROP[FM.seed].lv>lv()){say2('🔒 Essa semente libera no nível '+CROP[FM.seed].lv+'.');return}act('plant',i,FM.seed);return}
 if(ready(p)){act('harvest',i);return}
 if(!p.w){act('water',i);return}
 say2(CROP[p.c].ic+' '+CROP[p.c].n+' já foi regada. Falta '+dur(p.e-now())+'.')};
el('#fmPlantAll').onclick=()=>{if(FM.seed)act('plant',-1,FM.seed)};
el('#fmWaterAll').onclick=()=>act('water',-1);
el('#fmHarvestAll').onclick=()=>act('harvest',-1);
el('#fmDig').onclick=()=>{FM.dig=!FM.dig;el('#fmDig').setAttribute('aria-pressed',String(FM.dig));el('#fmDig').classList.toggle('on',FM.dig);
 say2(FM.dig?'⛏ Modo arrancar: toque num canteiro para tirar a planta (sem colheita). Toque de novo em ⛏ para sair.':'');drawGrid()};
const WHY={pid:'Entre com sua identidade para plantar.',canteiro:'Canteiro inválido.',semente:'Semente inválida.',nivel:'Ainda não tem o nível para isso.',fechado:'Esse canteiro ainda está fechado.',
 ocupado:'Esse canteiro já tem planta.',cheio:'Não há canteiro vazio.',vazio:'Não há planta aí.',pronta:'Já está pronta: colha!',regada:'Já foi regada.',crescendo:'Ainda está crescendo.',full:'Não há vaga para novas fazendas agora.',calma:'Calma! Um canteiro de cada vez.',
 moedas:'Moedas insuficientes. Colha mais um pouco!',maximo:'Já está no máximo.',loja:'Item inválido.',
 novos:'Muitas fazendas novas saíram desta rede hoje. Tente amanhã.'};
// descanso do antifraude: ações rápidas e regulares demais (ritmo de robô) param o ganho por alguns minutos
const why=m=>m.reason==='descanso'?'⏸ Descanso de '+Math.ceil((m.wait||60)/60)+' min: muitas ações seguidas, no mesmo ritmo. Seu progresso está guardado.':WHY[m.reason]||'Não foi possível agora.';
function result(m){if(m.rid!==FM.rid)return;FM.busy=false;clearTimeout(FM.bt);
 if(!m.ok){say2(why(m));drawGrid();if(FM.tab===2)drawShop();fb(el('#fmGrid'),0);return}
 setState(m.state);
 if(m.k==='plant'){const s=CROP[FM.seed];say2((m.n>1?m.n+' canteiros plantados':'Plantado')+(s?': '+s.ic+' '+s.n+', pronta em '+dur(s.t*1000)+'.':'.'));sfx('pickup',.8);return}
 if(m.k==='water'){say2('💧 '+(m.n>1?m.n+' plantas regadas':'Regada')+': cresce mais rápido e rende +1.');sfx('wash',.8);return}
 if(m.k==='dig'){say2('⛏ Planta arrancada.');sfx('peel',.8);return}
 if(m.k==='renew'){say2('🌾 Safra '+m.rank+'! Você voltou ao nível 1 e ganha +10% de experiência e +5% nas moedas a cada safra. Terreno, casa, moedas e recordes continuam seus.'+(m.badges&&m.badges.length?' '+m.badges.map(b=>b.i+' '+b.n).join(' · '):''));sfx('confirm',1);setTimeout(()=>sfx('join',1),600);
  if(window.lifeShow&&typeof me!=='undefined'&&me&&me.g)lifeShow('🌾',me.g.position.x,2.6,me.g.position.z,{dur:3,s:1.3});return}
 if(m.k==='buy'){say2('🎉 Comprado: '+m.name+'!');sfx('confirm',1);setTimeout(()=>sfx('join',.9),500);fb(el('#fmShop'),1);return}
 // colheita: o que veio, a experiência e o que subiu
 const box=h('div'),sum=new Map();for(const g of m.got)sum.set(g.c,(sum.get(g.c)||0)+g.n);
 box.append(h('b','','🧺 '+[...sum].map(([c,n])=>CROP[c].ic+' '+n+' '+CROP[c].n).join(', ')),h('span','',' · +'+m.xp+' XP · +'+coin(m.coins)));
 const ex=[];if(m.got.some(g=>g.first))ex.push('✨ planta nova no seu caderno');if(m.lvUp)ex.push('⬆ Nível '+m.lv);if(m.cut)ex.push('⚖ ganho −'+m.cut+'% (muito ganho hoje ou ritmo de robô)');
 if(m.badges)for(const b of m.badges)ex.push(b.i+' '+b.n);if(ex.length)box.append(h('br'),h('span','',ex.join(' · ')));
 say2('',box);sfx('confirm',.9);if(m.lvUp||(m.badges&&m.badges.length))setTimeout(()=>sfx('join',.9),600);
 if(window.lifeShow&&typeof me!=='undefined'&&me&&me.g)lifeShow(CROP[m.got[0].c].ic,me.g.position.x,2.4,me.g.position.z,{dur:2.5,s:1})}

// ---------- nova safra (no nível 999: volta ao nível 1 com +1 safra) ----------
// dois toques: o primeiro pede confirmação (5 s), o segundo envia
let rnAt=0;
el('#fmRenew').onclick=()=>{const b=el('#fmRenew');if(Date.now()-rnAt>5000){rnAt=Date.now();b.textContent='Tocar de novo: volta ao nível 1 com +1 🌾';return}rnAt=0;act('renew')};

// ---------- link público ----------
const farmUrl=pp=>location.origin+'/fazenda#'+pp;
el('#fmOpen').onclick=()=>{const pp=window.pubPp?pubPp():'';if(pp)window.open('/fazenda#'+pp,'_blank','noopener,noreferrer')};
el('#fmCopy').onclick=()=>{const pp=window.pubPp?pubPp():'';if(!pp)return;const u=farmUrl(pp);
 if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(u).then(()=>say2('📋 Link da fazenda copiado. Mande para seus amigos!'),()=>say2(u));else say2(u)};

// ---------- servidor ----------
function ask(force){if(mode!=='play')return;const n=Date.now();if(!force&&n-FM.askAt<60000)return;FM.askAt=n;send({t:'farmget'})}
window.farmBoot=()=>ask(true);
window.farmMsg=m=>{
 if(m.t==='farm'){setState(m);return}
 if(m.t==='farmr'){result(m);return}
 // outro jogador colheu: o fruto aparece sobre a cabeça dele
 if(m.t==='farmfx'&&m.sf){const a=actors.get(m.id);if(a&&mode==='play')say('','🌾 '+a.name+' começou a '+m.sf+'ª safra!',1);return}
 if(m.t==='farmfx'){const c=CROP[m.c],a=actors.get(m.id);if(!c||!a||!a.g||mode!=='play')return;if(window.lifeShow)lifeShow(c.ic,a.g.position.x,2.4,a.g.position.z,{dur:2.5,s:1})}};
function start(){ask(false);drawHead();drawSeed();drawShare();tab(FM.tab);clearInterval(FM.tm);FM.tm=setInterval(()=>{if(open()&&!document.hidden){if(FM.tab===0){drawGrid();drawShare()}dot()}},1000)}
function stop(){clearInterval(FM.tm);FM.tm=0}
new MutationObserver(()=>{if(open())start();else stop()}).observe(el('#pFarm'),{attributes:true,attributeFilter:['class']});
setInterval(()=>{if(!open()&&!document.hidden)dot()},5000);
$('#bFarm').onclick=()=>tog('pFarm');
const PK='skyke_farm_prog',pg=el('#fmProg');pg.open=LS(PK)==='1';pg.addEventListener('toggle',()=>LS(PK,pg.open?'1':null));
buildGrid();drawHead();drawSeed();drawGrid();
})();
