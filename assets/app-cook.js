/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Menu de culinária. Script comum, no mesmo escopo global dos outros app-*.js (usa $, send, say, tog, LS, mode, me, WALK, sfx).
 * O servidor decide tudo (lib/cook.js): a receita sai da combinação (método + ingredientes), e só ele soma experiência e
 * desbloqueios. Aqui só se escolhe o método e os ingredientes e se mostra o resultado.
 * Listas que crescem (despensa, receitas, preparo) usam rolagem virtual, busca fixa no topo e grupos recolhíveis (regras.md 12.1).
 * Economia: nada roda com o painel fechado; com ele aberto, um intervalo de 0,5 s só confere a distância até a fogueira.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
// Dentro de uma função (e não de um bloco): em script comum, função declarada num bloco vira global e sobrescreveria start() e ask() de outros arquivos.
(()=>{
const{ING,INGR,RECIPES,RECIPE,COOK_METHODS,COOK_SLOTS}=SKYCAT;
const CK={st:null,slots:[],tab:0,prep:{},sel:{1:'',2:''},busy:false,work:'',q:'',tm:0,askAt:0,bt:0,rid:''};
const REACH=5.5; // um pouco menos que o servidor (6,5 m): a posição chega com atraso de rede
const GK='skyke_cook_g';
let COL={};try{COL=JSON.parse(LS(GK)||'{}')||{}}catch(e){COL={}}
const el=s=>$(s);
const norm=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const h=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e};
const open=()=>!el('#pCook').classList.contains('hide');
const STEP={l:['💧','Lavar','lavado'],d:['🔪','Descascar','descascado']};
const have=id=>CK.prep[id]||'';
const ready=id=>[...INGR[id].p].every(c=>have(id).includes(c));
const missing=id=>[...INGR[id].p].filter(c=>!have(id).includes(c));
const dist=()=>typeof me!=='undefined'&&me&&me.g?Math.hypot(me.g.position.x-WALK.x,me.g.position.z-WALK.z):99;
const near=()=>dist()<=REACH;
const rid=()=>{const a=new Uint8Array(9);crypto.getRandomValues(a);return[...a].map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,16)};
const done=id=>(CK.st&&CK.st.done&&CK.st.done[id])|0;
window.cookHas=id=>done(id)>0;

// ---------- linhas das listas (grupos recolhíveis + busca) ----------
// Alturas no texto padrão (a lista virtual multiplica pelo ajuste Texto): receitas têm duas linhas (nome e ingredientes), o resto uma.
function rowsOf(items,key,name,match,prefix,ih){
 const q=CK.q,by=new Map(),rows=[];let n=0;
 for(const it of items){if(q&&!match(it))continue;const g=key(it);if(!by.has(g))by.set(g,[]);by.get(g).push(it);n++}
 for(const[g,list]of by){const id=prefix+g,closed=!q&&!!COL[id];rows.push({h:34,k:'g',g:id,n:name(g),c:list.length,closed});if(!closed)for(const it of list)rows.push({h:ih,k:'i',it})}
 return{rows,n}}
function bindG(e,r){e.textContent='';const b=h('button','mgh');b.type='button';b.dataset.g=r.g;b.setAttribute('aria-expanded',String(!r.closed));b.append(h('span','',(r.closed?'▸ ':'▾ ')+r.n),h('small','','('+r.c+')'));e.append(b)}
function rowBtn(e,cls,id,ic,nm,tg,aria,sub){e.textContent='';const b=h('button','ckrow'+cls);b.type='button';b.dataset.id=id;const t=h('span','tx');t.append(h('span','nm',nm));if(sub)t.append(h('span','sub',sub));
 b.append(h('span','ic',ic),t,h('span','tg',tg));b.setAttribute('aria-label',aria);b.title=nm;e.append(b)}
const prepTxt=id=>missing(id).map(c=>STEP[c][1].toLowerCase()).join(' e ');
function bind0(e,r){if(r.k==='g')return bindG(e,r);const i=r.it,ok=ready(i.id),on=CK.slots.includes(i.id);
 rowBtn(e,ok?'':' dim',i.id,i.ic,i.n,on?'no espaço':ok?(i.p?'✔ pronto':''):'preparar',i.n+', '+(on?'já está num espaço':ok?'pronto para usar':'precisa de preparo: '+prepTxt(i.id)))}
function bind1(e,r){if(r.k==='g')return bindG(e,r);const c=r.it,n=done(c.id);
 rowBtn(e,CK.sel[1]===c.id?' sel':'',c.id,c.ic,c.n,n?'✔ ×'+n:c.g.length+' ingr.',c.n+', '+COOK_METHODS[c.m].n+', '+c.g.length+' ingredientes: '+c.g.map(g=>INGR[g].n).join(', ')+(n?', já feita '+n+(n===1?' vez':' vezes'):', ainda não feita'),c.g.map(g=>INGR[g].ic).join(' '))}
function bind2(e,r){if(r.k==='g')return bindG(e,r);const i=r.it;
 rowBtn(e,(CK.sel[2]===i.id?' sel':'')+(ready(i.id)?'':' dim'),i.id,i.ic,i.n,[...i.p].map(c=>STEP[c][0]+(have(i.id).includes(c)?'✔':'')).join(' '),i.n+', '+(ready(i.id)?'preparado':'falta '+prepTxt(i.id)))}
const L=[vlist(el('#ckL0'),{bind:bind0}),vlist(el('#ckL1'),{bind:bind1}),vlist(el('#ckL2'),{bind:bind2})];
const SRC=[
 ()=>rowsOf(ING,i=>i.c,g=>g,i=>norm(i.n).includes(CK.q),'d:',44),
 ()=>rowsOf(RECIPES,r=>r.m,g=>COOK_METHODS[g].n,r=>norm(r.n).includes(CK.q)||r.g.some(g=>norm(INGR[g].n).includes(CK.q)),'r:',58),
 ()=>rowsOf(ING.filter(i=>i.p),i=>i.c,g=>g,i=>norm(i.n).includes(CK.q),'p:',44)];
const TOTAL=[ING.length,RECIPES.length,ING.filter(i=>i.p).length];
function build(t){const{rows,n}=SRC[t]();L[t].set(rows);if(t===CK.tab)el('#ckCount').textContent=n+' de '+TOTAL[t]}
const redraw=()=>{if(open())build(CK.tab)};

// ---------- espaços de combinação ----------
function drawSlots(){const box=el('#ckSlots');box.textContent='';
 for(let i=0;i<COOK_SLOTS;i++){const id=CK.slots[i],b=h('button','cks'+(id?'':' empty'),id?INGR[id].ic:String(i+1));b.type='button';b.dataset.i=i;
  b.setAttribute('aria-label',id?'Espaço '+(i+1)+': '+INGR[id].n+'. Tocar para remover':'Espaço '+(i+1)+' vazio');b.title=id?INGR[id].n:'Espaço vazio';box.append(b)}
 gate()}
function gate(){const n=CK.slots.length,ok=n>=2&&near()&&!CK.busy;el('#ckGoCook').disabled=el('#ckGoRoast').disabled=!ok;el('#ckClear').disabled=!n}
function fire(){const d=dist(),f=el('#ckFire');f.textContent=d<=REACH?'🔥 Fogueira ao alcance':'Chegue perto da fogueira para cozinhar (a '+Math.ceil(d-REACH)+' m)';gate()}
const say2=(t,html)=>{const r=el('#ckRes');r.textContent='';if(html)r.append(html);else r.textContent=t||''};
function addSlot(id){
 if(CK.slots.includes(id)){say2('Esse ingrediente já está num espaço.');fb(el('#ckSlots'),0);return}
 if(CK.slots.length>=COOK_SLOTS){say2('Os '+COOK_SLOTS+' espaços já estão cheios.');fb(el('#ckSlots'),0);return}
 if(!ready(id)){CK.sel[2]=id;tab(2);say2('Falta '+prepTxt(id)+' '+INGR[id].n.toLowerCase()+'. Prepare aqui e volte.');fb(el('#ckPrep'),0);return}
 CK.slots.push(id);say2('');drawSlots();redraw();fb(el('#ckSlots').children[CK.slots.length-1],1,'pickup')}

// ---------- livro de receitas e preparo (detalhes) ----------
function drawDet(){const id=CK.sel[1],box=el('#ckDet');box.textContent='';
 if(!id){box.append(h('span','','Toque numa receita para ver os ingredientes.'));return}
 const r=RECIPE[id],n=done(id);
 box.append(h('b','',r.ic+' '+r.n),h('span','',' · '+COOK_METHODS[r.m].n+(n?' · feita '+n+(n===1?' vez':' vezes'):' · ainda não feita')),h('br'));
 for(const g of r.g){const i=INGR[g],c=h('span','ckchip'+(ready(g)?' ok':''),i.ic+' '+i.n+(ready(g)?'':' ('+prepTxt(g)+')'));box.append(c)}
 const a=h('div','pfact'),b=h('button','pfb pri','Usar nos espaços');b.type='button';b.dataset.use=id;a.append(b);box.append(a)}
function useRecipe(id){const r=RECIPE[id];CK.slots=r.g.filter(ready);tab(0);drawSlots();
 const m=r.g.filter(g=>!ready(g));
 say2(m.length?'Faltam preparar: '+m.map(g=>INGR[g].n).join(', ')+'. Vá em Preparo.':r.n+': tudo pronto. Toque em '+COOK_METHODS[r.m].n+'.')}
function drawPrep(){const id=CK.sel[2],box=el('#ckPrep');box.textContent='';
 if(!id){box.append(h('span','','Toque num ingrediente para lavar ou descascar. Quem não aparece aqui já vem pronto.'));return}
 const i=INGR[id];box.append(h('b','',i.ic+' '+i.n),h('span','',CK.work===id?' · preparando…':ready(id)?' · pronto':' · falta '+prepTxt(id)));
 const a=h('div','pfact');
 for(const c of i.p){const b=h('button','pfb',STEP[c][0]+' '+STEP[c][1]);b.type='button';b.dataset.step=c;b.disabled=have(id).includes(c)||!!CK.work;
  b.setAttribute('aria-label',STEP[c][1]+' '+i.n+(have(id).includes(c)?' (já '+STEP[c][2]+')':''));a.append(b)}
 box.append(a)}
function doStep(c){const id=CK.sel[2];if(!id||CK.work||have(id).includes(c))return;CK.work=id;drawPrep();sfx(c==='l'?'wash':'peel',.9);
 setTimeout(()=>{CK.prep[id]=have(id)+c;CK.work='';drawPrep();redraw();drawSlots();const ok=ready(id);fb(el('#ckPrep'),1,ok?'confirm':'click')},650)}

// ---------- progresso ----------
function drawHead(){const s=CK.st,pct=s&&!s.max&&s.hi>s.lo?Math.round((s.xp-s.lo)/(s.hi-s.lo)*100):s&&s.max?100:0;
 el('#ckLv').textContent=s?'Nível '+s.lv+(s.max?' (máx.)':''):'Nível 1';
 el('#ckXp').textContent=s?(s.max?s.xp+' XP':(s.xp-s.lo)+' / '+(s.hi-s.lo)+' XP'):'';
 const bar=el('#ckBar');bar.firstChild.style.width=pct+'%';bar.setAttribute('aria-valuenow',String(pct));
 const at=el('#ckAttrs');at.textContent='';if(s)for(const a of s.attrs){const c=h('span','',a.n+' '+a.r);c.title=a.t+' ('+a.v+')';at.append(c)}
 const bd=el('#ckBadges');bd.textContent='';if(s)for(const b of s.badges){const c=h('span',b.on?'':'off',b.i);c.setAttribute('role','listitem');c.title=b.n+(b.on?'':' · '+b.t);c.setAttribute('aria-label',b.n+(b.on?' (conquistado)':' ('+b.t+')'));bd.append(c)}}

// ---------- abas ----------
function tab(t){CK.tab=t;for(let i=0;i<3;i++){const b=el('#ckt'+i),on=i===t;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;el('#ckP'+i).hidden=!on}
 el('#ckq').placeholder=t===1?'Buscar receita ou ingrediente':'Buscar ingrediente';
 if(t===1)drawDet();if(t===2)drawPrep();build(t);if(t===0)fire()}
el('.cktabs').onclick=e=>{const b=e.target.closest('[data-t]');if(b)tab(+b.dataset.t)};
el('.cktabs').onkeydown=e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();const t=(CK.tab+(e.key==='ArrowRight'?1:2))%3;tab(t);el('#ckt'+t).focus()};
el('#ckq').oninput=()=>{CK.q=norm(el('#ckq').value.trim());build(CK.tab)};

// ---------- cliques (delegação: as linhas são reaproveitadas pela lista virtual) ----------
function listClick(t){return e=>{
 const g=e.target.closest('[data-g]');if(g){const k=g.dataset.g;if(COL[k])delete COL[k];else COL[k]=1;LS(GK,JSON.stringify(COL));build(t);return}
 const b=e.target.closest('[data-id]');if(!b)return;const id=b.dataset.id;
 if(t===0)addSlot(id);else if(t===1){CK.sel[1]=id;drawDet();redraw()}else{CK.sel[2]=id;drawPrep();redraw()}}}
['#ckL0','#ckL1','#ckL2'].forEach((s,t)=>{el(s).onclick=listClick(t)});
el('#ckSlots').onclick=e=>{const b=e.target.closest('[data-i]');if(!b)return;const i=+b.dataset.i;if(i<CK.slots.length){CK.slots.splice(i,1);drawSlots();redraw()}};
el('#ckClear').onclick=()=>{CK.slots=[];say2('');drawSlots();redraw()};
el('#ckDet').onclick=e=>{const b=e.target.closest('[data-use]');if(b)useRecipe(b.dataset.use)};
el('#ckPrep').onclick=e=>{const b=e.target.closest('[data-step]');if(b)doStep(b.dataset.step)};

// ---------- cozinhar ----------
function go(m){if(CK.busy||CK.slots.length<2)return;if(!near()){fire();fb(el('#ckFire'),0);return}
 CK.busy=true;CK.rid=rid();say2('Cozinhando…');gate();clearTimeout(CK.bt);CK.bt=setTimeout(()=>{if(CK.busy){CK.busy=false;say2('Sem resposta do servidor. Tente de novo.');gate()}},5000);
 send({t:'cookdo',m,g:[...CK.slots],rid:CK.rid})}
el('#ckGoCook').onclick=()=>go('cozinhar');el('#ckGoRoast').onclick=()=>go('assar');
const WHY={nada:'Essa combinação não deu em nada. Veja o Livro de receitas.',longe:'Chegue mais perto da fogueira.',ingredientes:'Combinação inválida.',metodo:'Método inválido.',full:'Não há vaga para novos cozinheiros agora.',pid:'Entre com sua identidade para cozinhar.'};
function result(m){if(m.rid!==CK.rid)return;CK.busy=false;clearTimeout(CK.bt);
 if(!m.ok){say2(WHY[m.reason]||'Não foi possível cozinhar agora.');gate();fb(el('#ckSlots'),0);return}
 const r=RECIPE[m.recipe],box=h('div');
 box.append(h('b','',r.ic+' '+r.n+' pronto!'),h('span','',' +'+m.xp+' XP'+(m.first?' · novo na mochila!':'')));
 const extra=[];if(m.lvUp)extra.push('⬆ Nível '+m.lv);if(m.up&&m.up.length)extra.push('+1 '+m.up.join(', +1 '));
 if(m.badges)for(const b of m.badges)extra.push(b.i+' '+b.n);
 if(extra.length){box.append(h('br'),h('span','',extra.join(' · ')))}
 say2('',box);CK.st=m.state;CK.slots=[];drawHead();drawSlots();redraw();if(window.bpRefresh)bpRefresh();
 // retorno da regras.md 13.1: o prato aparece flutuando sobre a fogueira, girando com partículas, com som próprio; conquista (nível ou
 // emblema) ganha um acorde a mais. Quando o prato some (~4 s), ele vai para a mão: já dá para comer ou largar
 dish(r);sfx('cook_done',1);if(m.lvUp||(m.badges&&m.badges.length))setTimeout(()=>sfx('join',.9),700);
 setTimeout(()=>{if(mode==='play')send({t:'item',item:m.recipe})},DISH_S*1000-200)}
// prato pronto sobre a fogueira (o mesmo para quem cozinhou e para quem está em volta)
const DISH_S=4;
function dish(r){if(window.lifeShow)lifeShow(r.ic,WALK.x,2.6,WALK.z,{dur:DISH_S,s:1.25})}// acima das cabeças de quem está sentado em volta

// ---------- servidor ----------
function ask(force){if(mode!=='play')return;const n=Date.now();if(!force&&n-CK.askAt<60000)return;CK.askAt=n;send({t:'cookget'})}
window.cookBoot=()=>ask(true);
window.cookMsg=m=>{
 if(m.t==='cook'){CK.st=m;drawHead();if(window.bpRefresh)bpRefresh();redraw();return}
 if(m.t==='cookr')result(m);
 // outro jogador terminou uma receita: o prato aparece sobre a fogueira e o som vem com o volume da distância
 if(m.t==='cookfx'){const r=RECIPE[m.r],a=actors.get(m.id);if(!r||!a||mode!=='play')return;dish(r);const v=dvol(a);if(v>.03)sfx('cook_done',v)}};
// o painel só trabalha aberto: distância da fogueira a cada 0,5 s
function start(){ask(false);drawHead();drawSlots();tab(CK.tab);clearInterval(CK.tm);CK.tm=setInterval(()=>{if(open()&&!document.hidden&&CK.tab===0)fire()},500)}
function stop(){clearInterval(CK.tm);CK.tm=0}
new MutationObserver(()=>{if(open())start();else stop()}).observe(el('#pCook'),{attributes:true,attributeFilter:['class']});
$('#bCook').onclick=()=>tog('pCook');
// atributos e emblemas ficam numa linha que abre e fecha (a lista ganha altura); o jogador escolhe e a escolha fica salva
const PK='skyke_cook_prog',pg=el('#ckProg');pg.open=LS(PK)==='1';pg.addEventListener('toggle',()=>LS(PK,pg.open?'1':null));
drawHead();drawSlots();
})();
