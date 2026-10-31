/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Modo Sobrevivência (cliente): medidores, relógio, ações perto da fogueira e dos pontos de coleta, mochila, cozinha e resultado.
 * O servidor decide tudo (survival.js); aqui só se mostra o estado (svs/svm/sve) e se pedem ações ({t:'sv',a:...}).
 * Fora do modo nada daqui aparece nem roda (SURVC.leave desfaz tudo). Atenção: sair da SALA é a função global leave() do app-net.js (window.leave);
 * a função interna deste arquivo se chama teardown justamente para não escondê-la.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
const SURVC=(()=>{
const S=SKYCAT.SURV,RES=S.res,REC=S.recipes,DISH={};REC.forEach(r=>DISH[r.id]=r);
let newAch=[],on=false,pub=null,mine={m:{},inv:{},f:0,k:0,rv:''},nodes=[],off=new Set(),marks=[],tmr=0,raf=0,sig='',els=null;
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const fmt=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
const near=(a,b,r)=>Math.hypot(a.x-b.x,a.z-b.z)<=r;
const pos=()=>({x:me.g.position.x,z:me.g.position.z});
const nameOf=id=>id===me.id?me.name:(actors.get(id)||{}).name||'Alguém';
const act=(a,o)=>send({t:'sv',a,...o});
// item da mochila: recurso do mapa ou prato cozinhado (id da receita)
const itemOf=k=>RES[k]||(DISH[k]?{ic:DISH[k].ic,n:DISH[k].n,kind:'dish'}:null);

const xBtn=f=>{const b=el('button','sv-x','✖');b.type='button';b.setAttribute('aria-label','Fechar');b.onclick=f;return b};
function build(){
 const hud=el('div','sv-hud'),row=el('div','sv-row');
 const mt={};for(const [k,c] of Object.entries(S.meters)){const b=el('div','sv-m');b.title=c.n;const i=el('span','sv-i',c.ic),bar=el('span','sv-bar'),f=el('span','sv-fill');bar.append(f);const v=el('span','sv-v','');b.append(i,bar,v);row.append(b);mt[k]={b,f,v}}
 const fire=el('div','sv-m sv-fire'),fi=el('span','sv-i','🔥'),fb=el('span','sv-bar'),ff=el('span','sv-fill');fb.append(ff);fire.title='Fogueira';fire.append(fi,fb);row.append(fire);
 const clock=el('div','sv-clock'),pot=el('div','sv-pot');
 hud.append(row,clock,pot);
 const actb=el('div','sv-act');
 const faint=el('div','sv-faint hide');const fwt=el('small',null,'');faint.append(el('b',null,'😵 Você desmaiou'),el('span',null,'Fique parado: um colega pode chegar perto e te reanimar.'),fwt);
 const inv=el('div','p side sv-inv hide');inv.id='pSvInv';const ig=el('div','grip','⠿ 🎒 Mochila');ig.append(xBtn(()=>inv.classList.add('hide')));const il=el('div','sv-list');inv.append(ig,il);
 const cook=el('div','p side sv-inv hide');cook.id='pSvCook';const cg=el('div','grip','⠿ 🍲 Cozinha');cg.append(xBtn(()=>cook.classList.add('hide')));const cs=el('div','sv-cstat'),cl=el('div','sv-list');cook.append(cg,cs,cl);
 const end=el('div','sv-end hide');
 const chk=el('div','sv-chk hide');chk.setAttribute('role','status');chk.setAttribute('aria-live','polite');
 document.body.append(hud,actb,faint,inv,cook,end,chk);
 return{hud,mt,ff,clock,pot,actb,faint,fwt,inv,il,cook,cs,cl,end,chk}}

function metersUi(){
 if(!els)return;
 for(const [k,c] of Object.entries(S.meters)){const v=mine.m[k]==null?c.max:mine.m[k],p=Math.max(0,Math.min(100,v/c.max*100));
  const u=els.mt[k];u.f.style.width=p+'%';u.v.textContent=Math.round(v);u.b.classList.toggle('low',p<25)}
 if(pub)els.ff.style.width=Math.max(0,Math.min(100,pub.fire/S.fire.max*100))+'%';
 els.faint.classList.toggle('hide',!mine.f||!!(pub&&pub.ov));
 if(mine.f)els.fwt.textContent='Se ninguém vier, você acorda sozinho em '+(mine.fw||0)+' s (fraco e enjoado).';
 els.hud.classList.toggle('sick',!!mine.k)}
function clockUi(){
 if(!pub||!els)return;
 els.clock.textContent=(pub.nt?'🌙 Noite ':'☀ Dia ')+(pub.nd+1)+' · ⏱ '+fmt(pub.tm||0)+' · Nível '+(pub.lv||1)+(mine.k?' · 🤢 enjoado':'');
 els.hud.classList.toggle('night',!!pub.nt);
 const p=pub.pot,r=p&&DISH[p.rid];
 els.pot.textContent=p?(p.ok?'🍲 '+r.n+' pronto! Pegue perto da fogueira':'🍲 '+r.n+' · '+Math.min(100,Math.round(p.el/r.time*100))+'%'):''}

// ---- ações do momento: dependem de onde o jogador está; o servidor confere tudo de novo ----
function actions(){
 if(!on||!els||!pub)return;
 const p=pos(),L=[],F=S.fire,dF=Math.hypot(p.x-F.x,p.z-F.z),inv=mine.inv;
 if(!mine.f&&!pub.ov){
  let best=-1,bd=1e9;nodes.forEach((n,i)=>{if(off.has(i))return;const d=Math.hypot(p.x-n.x,p.z-n.z);if(d<=S.coleta.radius+.3&&d<bd){bd=d;best=i}});
  if(best>=0){const r=RES[nodes[best].res];L.push({k:'c'+best,t:r.ic+(r.src?' Pegar '+r.n+' da '+r.src:' Coletar '+r.n),f:()=>act('collect',{i:best})})}
  if(dF<=S.cook.radius+.3){
   if(pub.fire<=0){const need=Object.entries(S.fire.relight),ok=need.every(([k,n])=>(inv[k]||0)>=n);
    L.push({k:'rl'+ok,t:'🔥 Reacender'+(ok?'':' ('+need.map(([k,n])=>n+' '+RES[k].ic).join(' ')+')'),dis:!ok,f:()=>act('relight')})}
   else for(const [k,r] of Object.entries(RES))if(r.kind==='fuel'&&(inv[k]||0)>0)L.push({k:'f'+k+inv[k],t:r.ic+' Pôr '+r.n+' ('+inv[k]+')',f:()=>act('fuel',{res:k})});
   L.push({k:'ck',t:'🍲 Cozinhar',f:()=>cookOpen()});
   if(pub.pot&&pub.pot.ok)L.push({k:'tk',t:'🍽 Pegar prato (vai p/ mochila)',f:()=>act('take')})}
  for(const [id,f] of pub.pl)if(f&&id!==me.id){const a=actors.get(id);if(a&&near(p,{x:a.g.position.x,z:a.g.position.z},S.revive.radius+.3))L.push({k:'rv'+id,t:'🤝 Reanimar '+nameOf(id)+' (segure)',hold:id})}}
 const s=L.map(x=>x.k).join('|');
 if(s!==sig){sig=s;els.actb.textContent='';
  for(const x of L){const b=el('button','pri',x.t);b.type='button';if(x.dis)b.disabled=true;
   if(x.hold){const up=()=>act('revstop');b.onpointerdown=e=>{e.preventDefault();act('rev',{to:x.hold})};b.onpointerup=up;b.onpointerleave=up;b.onpointercancel=up}
   else b.onclick=x.f;els.actb.append(b)}}
 els.actb.classList.toggle('hide',!L.length)}

function invOpen(){invSig='';const h=els.inv.classList.contains('hide');['#pMochila','#pVis','#pSet','#pRep','#pPerf'].forEach(s=>$(s).classList.add('hide'));els.cook.classList.add('hide');els.inv.classList.toggle('hide',!h);if(h)invUi()}
function cookOpen(){invSig='';els.inv.classList.add('hide');els.cook.classList.remove('hide');cookSig='';cookUi()}
// Mochila e cozinha só se redesenham quando o conteúdo muda (antes recriavam os botões a cada 150 ms: piscavam e o clique se perdia).
// A mochila é uma grade compacta com rolagem: cabe muita coisa sem crescer na tela.
let invSig='',invSel='',cookSig='',giveTo='';
const others=()=>[...actors.values()].filter(a=>a.id&&!a.bot).map(a=>[a.id,a.name]).sort((x,y)=>x[1].localeCompare(y[1]));
function invUi(){
 if(!els||els.inv.classList.contains('hide'))return;
 const keys=[...Object.keys(RES),...REC.map(r=>r.id)],have=keys.filter(k=>(mine.inv[k]||0)>0);
 if(!have.includes(invSel))invSel=have.length?have[0]:'';
 const ot=others();if(!ot.some(o=>o[0]===giveTo))giveTo=ot.length?ot[0][0]:'';
 const sg=JSON.stringify([have.map(k=>[k,mine.inv[k]]),invSel,ot,giveTo]);
 if(sg===invSig)return;invSig=sg;
 els.il.textContent='';
 if(!have.length){els.il.append(el('small',null,'Vazia. Colete recursos pelo mapa.'));return}
 const grid=el('div','sv-grid');
 for(const k of have){const r=itemOf(k),t=el('button','sv-tile'+(k===invSel?' sel':''));t.type='button';t.title=r.n;t.append(el('span','sv-ic',r.ic),el('b','sv-q','×'+mine.inv[k]));t.onclick=()=>{invSel=k;invUi()};grid.append(t)}
 els.il.append(grid);
 const r=itemOf(invSel),row=el('div','sv-sel');row.append(el('span',null,r.ic+' '+r.n+' ×'+mine.inv[invSel]));
 if(r.kind==='food'||r.kind==='drink'||r.kind==='dish'){const b=el('button','pri',r.kind==='drink'?'Beber':'Comer');b.type='button';b.onclick=()=>act('eat',{res:invSel});row.append(b)}
 else row.append(el('small',null,'Use perto da fogueira'));
 els.il.append(row);
 // compartilhar com alguém da sala (só doação)
 if(ot.length){const sh=el('div','sv-share');sh.append(el('small',null,'🎁 Compartilhar com'));
  const sel=el('select');sel.setAttribute('aria-label','Jogador que vai receber');for(const [id,nm] of ot){const o=el('option',null,nm);o.value=id;if(id===giveTo)o.selected=true;sel.append(o)}sel.onchange=()=>{giveTo=sel.value;invSig=''};
  const b1=el('button',null,'Dar 1'),bn=el('button',null,'Dar tudo');b1.type=bn.type='button';
  b1.onclick=()=>act('give',{to:sel.value,res:invSel,n:1});bn.onclick=()=>act('give',{to:sel.value,res:invSel,n:mine.inv[invSel]});
  sh.append(sel,b1,bn);els.il.append(sh)}}
function cookUi(){
 if(!els||els.cook.classList.contains('hide'))return;
 const p=pos(),F=S.fire,nearF=Math.hypot(p.x-F.x,p.z-F.z)<=S.cook.radius+.3,pot=pub&&pub.pot,lit=!!(pub&&pub.fire>0);
 els.cs.textContent=!lit?'🔥 A fogueira está apagada.':!nearF?'Chegue perto da fogueira para cozinhar.':pot?(pot.ok?'Pronto! Use “Pegar prato”: ele vai para a sua mochila.':'Cozinhando…'):'A panela está livre.';
 const sg=JSON.stringify([REC.map(r=>r.ins.every(i=>(mine.inv[i]||0)>=r.ins.filter(x=>x===i).length)),nearF,lit,!!pot]);
 if(sg===cookSig)return;cookSig=sg;
 els.cl.textContent='';
 for(const r of REC){const need={};r.ins.forEach(i=>need[i]=(need[i]||0)+1);
  const have=Object.entries(need).every(([k,n])=>(mine.inv[k]||0)>=n);
  const row=el('div','sv-rec');
  const nm=el('div','sv-rn');nm.append(el('span','sv-ic',r.ic),el('span',null,r.n));
  const sm=el('small',null,Object.entries(need).map(([k,n])=>RES[k].ic+'×'+n+(((mine.inv[k]||0)>=n)?'':' ✗')).join(' ')+' · '+['fome','sede','calor'].filter(k=>r[k]).map(k=>S.meters[k].ic+'+'+r[k]).join(' ')+((r.give||1)>1?' · '+r.give+' porções':''));
  const info=el('div','sv-ri');info.append(nm,sm);
  const b=el('button',have&&nearF&&lit&&!pot?'pri':null,'Cozinhar');b.type='button';b.disabled=!(have&&nearF&&lit&&!pot);b.onclick=()=>act('cook',{rid:r.id});
  row.append(info,b);els.cl.append(row)}}

// ---- marcadores dos pontos de coleta: ícone flutuando; some enquanto o recurso não voltou ----
// um material por ícone (51 pontos usam só 6): menos memória e menos trocas de estado a cada quadro
let sharedMat={};
function marks_clear(){marks.forEach(s=>scene.remove(s));Object.values(sharedMat).forEach(m=>m.dispose());sharedMat={};marks=[]}
function marks_make(seed){
 marks_clear();nodes=SKYMAP.generate(seed).nodes;
 nodes.forEach(n=>{const ic=RES[n.res].ic,s=new THREE.Sprite(sharedMat[ic]||(sharedMat[ic]=spr(ic)));s.scale.set(.8,.8,.8);s.position.set(n.x,1.1,n.z);scene.add(s);marks.push(s)})}
// flutuar não precisa de 60 quadros por segundo: atualiza a cada 50 ms
let lastBob=0;
function tick(){
 if(!on)return;raf=requestAnimationFrame(tick);
 const now=performance.now();if(now-lastBob<50)return;lastBob=now;
 const t=now/1000;
 for(let i=0;i<marks.length;i++){const s=marks[i];s.visible=!off.has(i);s.position.y=1.05+Math.sin(t*2+i)*.08}}

// conquistas ganhas nesta rodada (chegam logo depois do resultado): aparecem no resultado e no chat
function achUi(box){
 if(!newAch.length)return;box.querySelector('.sv-ach')&&box.querySelector('.sv-ach').remove();
 const d=el('div','sv-ach');d.append(el('b',null,'🏆 Novas conquistas'));
 newAch.forEach(a=>d.append(el('div',null,a.ic+' '+a.n+' · colecionável '+a.c+' '+a.cn)));
 const row=box.querySelector('.row');row?box.insertBefore(d,row):box.append(d)}
// verificação de presença humana (só depois de 10 min de rodada, a cada ~15 min): chip pequeno que não pausa o jogo e só tem botões de resposta
let chkT=0;const chkHide=()=>{clearInterval(chkT);chkT=0;if(els)els.chk.classList.add('hide')};
function chkShow(m){
 if(!els||!Array.isArray(m.opts))return;chkHide();const c=els.chk;c.textContent='';
 c.append(el('b',null,'🧮 Verificação rápida'),el('span','sv-cq',m.q));
 const row=el('div','sv-co');m.opts.forEach(o=>{const b=el('button',null,String(o));b.type='button';b.onclick=()=>act('chk',{id:m.id,v:String(o)});row.append(b)});c.append(row);
 const t=el('small','sv-ct','');c.append(t);c.classList.remove('hide');let left=Math.max(5,m.sec|0);
 const txt=()=>{t.textContent='Confirma que há uma pessoa jogando · '+left+' s'};txt();
 chkT=setInterval(()=>{if(--left<=0){chkHide();return}txt()},1000)}
let backT=0;const stopBack=()=>{clearInterval(backT);backT=0};
function endUi(m){
 stopBack();
 if(!els)return;const e=els.end;e.textContent='';
 const box=el('div','sv-box');
 box.append(el('h3',null,'😵 A rodada acabou'));
 box.append(el('p',null,'Todos desmaiaram ao mesmo tempo. Vocês sobreviveram '+fmt(m.sec)+'.'));
 if(m.rec)box.append(el('p','sv-rec','🏅 Novo recorde de tempo de todas as rodadas!'));
 const ln=[['⏱ Tempo sobrevivido',fmt(m.sec)],['Noites',m.nights],['Nível alcançado',m.level],['Refeições',m.meals],['Desmaios',m.faints],['Semente',m.seed]];
 const t=el('div','sv-sum');ln.forEach(([k,v])=>{t.append(el('span',null,k),el('b',null,String(v)))});box.append(t);
 if(!m.counted)box.append(el('small',null,'Não conta nas estatísticas: é preciso pelo menos '+S.run.minPlayers+' jogadores e '+Math.round(S.run.minSec/60)+' minutos.'));
 box.append(PST.resultRow());achUi(box);
 // ninguém restou de pé: depois de alguns segundos o jogo sai da sala sozinho e volta ao início (o jogador pode ficar para ler tudo)
 const auto=el('small','sv-auto','');box.append(auto);
 const stay=el('button',null,'Ficar aqui');stay.type='button';stay.hidden=true;
 if(m.auto>0){let left=m.auto;auto.textContent='Voltando ao início em '+left+' s…';stay.hidden=false;
  backT=setInterval(()=>{left--;if(left<=0){stopBack();window.leave();return}auto.textContent='Voltando ao início em '+left+' s…'},1000);
  stay.onclick=()=>{stopBack();auto.textContent='';stay.hidden=true}}
 const row=el('div','row');
 const again=el('button','pri','🔁 Jogar de novo');again.type='button';again.onclick=()=>{stopBack();window.leave();start({t:'create',surv:true})};// sai de verdade da sala (função do jogo, não a daqui) e abre uma sala nova
 const out=el('button',null,'🚪 Sair');out.type='button';out.onclick=()=>{stopBack();window.leave()};
 const c=el('button',null,'Fechar');c.type='button';c.onclick=()=>e.classList.add('hide');
 row.append(again,out,stay,c);box.append(row);e.append(box);e.classList.remove('hide')}

const EV={
 night:(e)=>say('','🌙 A noite '+e.n+' começou. Mantenha a fogueira acesa e fique perto dela.',1),
 day:(e)=>say('','☀ Amanheceu. Hora de coletar lenha, água e comida.',1),
 fireout:()=>{say('','🔥 A fogueira apagou! Reacenda com gravetos.',1);sfx('leave',.9)},
 firelow:()=>say('','⚠ A fogueira está fraca. Ponha lenha.',1),
 faint:(e)=>{const a=e.id===me.id?me:actors.get(e.id);say('','😵 '+nameOf(e.id)+' desmaiou ('+((S.meters[e.meter]||{}).n||'')+'). Reanime chegando perto.',1);if(a)showEmo(a,'😵')},
 wake:(e)=>{say('','🥱 '+nameOf(e.id)+' acordou sozinho, fraco e enjoado.',1);const a=e.id===me.id?me:actors.get(e.id);if(a)showEmo(a,'🥱')},
 gave:(e)=>{const it=itemOf(e.res)||{ic:'',n:e.res};say('','🎁 '+nameOf(e.from)+' deu '+e.n+'× '+it.ic+' '+it.n+' para '+nameOf(e.to)+'.',1);if(e.to===me.id)sfx('confirm',.8)},
 revive:(e)=>{say('','💖 '+nameOf(e.id)+' foi reanimado por '+nameOf(e.by)+'.',1);const a=e.id===me.id?me:actors.get(e.id);if(a)showEmo(a,'💖');sfx('confirm',.8)},
 ready:(e)=>{say('','🍲 '+((DISH[e.rid]||{}).n||'Prato')+' ficou pronto!',1);sfx('confirm',.8)},
 burnt:(e)=>say('','🔥 O prato queimou e '+(e.by?nameOf(e.by)+' ficou enjoado.':'ninguém o pegou a tempo.'),1)};
const ERR={longe:'Chegue mais perto.',vazio:'Ainda não voltou.',sem_item:'Faltam itens.',apagada:'A fogueira está apagada.',acesa:'A fogueira já está acesa.',ocupada:'A panela está ocupada.',nada:'Ainda não está pronto.',desmaiado:'Você está desmaiado.',fim:'A rodada acabou.',alvo:'Esse jogador não precisa de ajuda.',nao_pode:'Só o anfitrião pode.',quantidade:'Quantidade inválida.',item:'Esse item não pode ser usado assim.'};

function apply(m){
 pub=m;svFireSet(m.fire);off=new Set(m.nx||[]);const f=(m.pl.find(x=>x[0]===me.id)||[])[1];if(f!=null){mine.f=f;svFaint=!!f}
 clockUi();metersUi();actions();invUi();cookUi()}
// fogueira de verdade: a chama, a luz e as brasas seguem o combustível (apaga de vez em 0)
const svFireSet=f=>{svFire=f<=0?0:Math.min(1,.3+.7*f/(S.fire.max*.5))};
function prep(m){
 SVSEED=m.sv?m.sv.seed:0;WALK.r=m.sv?S.walk.r:10.2}
function enter(m){
 teardown(true);if(!m.sv)return;
 on=true;els=build();document.body.classList.add('surv');
 marks_make(m.sv.seed);
 if(PST.on())send({t:'pst',k:PST.secret()});
 $('#bMochila').onclick=invOpen;
 apply(m.sv.pub);tmr=setInterval(()=>{actions();cookUi()},150);raf=requestAnimationFrame(tick);
 say('','🏕 Sobrevivência: sem tempo marcado. Sobrevivam o máximo que puderem: calor, fome e sede caem sozinhos e a dificuldade sobe com o tempo. A fogueira é o centro do acampamento.',1)}
function teardown(quiet){
 stopBack();chkHide();
 if(!on&&!els){if(!quiet){WALK.r=10.2;SVSEED=0;svFaint=false}return}
 on=false;clearInterval(tmr);cancelAnimationFrame(raf);marks_clear();nodes=[];off=new Set();pub=null;sig='';svFaint=false;
 if(els){Object.values(els).forEach(x=>{if(x&&x.remove)x.remove()});els=null}
 document.body.classList.remove('surv');$('#bMochila').onclick=()=>tog('pMochila');
 mine={m:{},inv:{},f:0,k:0,rv:''};invSig='';cookSig='';invSel='';svFire=1;if(!quiet){WALK.r=10.2;SVSEED=0}}
function msg(m){
 if(!on)return;
 switch(m.t){
  case 'svs':if(m&&Array.isArray(m.pl))apply(m);break;
  case 'svm':mine={m:m.m||{},inv:m.inv||{},f:m.f?1:0,fw:m.fw||0,k:m.k?1:0,rv:m.rv||''};svFaint=!!mine.f;metersUi();clockUi();actions();invUi();cookUi();break;
  case 'sve':if(Array.isArray(m.e))m.e.forEach(e=>{if(EV[e.t])EV[e.t](e)});break;
  case 'svc':chkShow(m);break;
  case 'svcr':if(m.ok){chkHide();say('','✔ Verificado, obrigado!',1)}else if(m.done){chkHide();say('','⚠ Verificação não concluída: esta rodada não entra no seu perfil nem no ranking.',1)}else say('',m.why==='rapido'?'Calma: leia com atenção e responda de novo.':'Resposta errada. Tente de novo.',1);break;
  case 'svend':newAch=[];endUi(m);break;
  case 'sva':{const got=S.ach.filter(a=>Array.isArray(m.a)&&m.a.includes(a.id));newAch=newAch.concat(got);got.forEach(a=>say('','🏆 Conquista: '+a.n+'! Colecionável novo: '+a.c+' '+a.cn,1));if(m.pb)say('','🏅 Novo recorde pessoal de tempo sobrevivido!',1);if(m.unv)say('','⚠ Esta rodada não entrou no seu perfil: a verificação não foi concluída.',1);if(got.length||m.pb)sfx('confirm');const bx=els&&els.end&&els.end.querySelector('.sv-box');if(bx)achUi(bx);break}
  case 'svnew':{stopBack();newAch=[];SVSEED=m.seed;els.end.classList.add('hide');buildRoom(cfg.style==='acampamento'?cfg.style:'acampamento');marks_make(m.seed);me.g.position.set(0,0,5);dest=null;lastMv='';svFaint=false;mine.f=0;apply(m.pub);say('','🔁 Nova rodada! Semente '+m.seed+'.',1);break}
  case 'sverr':if(ERR[m.e])say('','⚠ '+ERR[m.e],1);break}}
return{prep,enter,leave:teardown,msg}})();

// ---- página pessoal de estatísticas (opcional): o segredo fica só neste navegador; o servidor guarda só o código derivado dele ----
const PST=(()=>{
 const K='skyke_pst',ON='skyke_pst_on',get=k=>{try{return localStorage.getItem(k)}catch(e){return null}},put=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}};
 const b64=u8=>btoa(String.fromCharCode(...u8)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const fresh=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
 const secret=()=>{let s=get(K);if(!/^[A-Za-z0-9_-]{43}$/.test(s||'')){s=fresh();put(K,s)}return s};
 const on=()=>get(ON)==='1',link=()=>location.origin+'/jogador/'+SKYREC.viewCode(secret()).match(/.{4}/g).join('-');
 const post=(path,body)=>fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.ok).catch(()=>false);
 const nm=()=>(typeof cleanName==='function'?cleanName($('#name').value):'');
 const copy=async t=>{try{await navigator.clipboard.writeText(t);return true}catch(e){return false}};
 const enable=async()=>{const ok=await post('/jogador/criar',{k:secret(),name:nm()});if(ok){put(ON,'1');if(mode==='play'&&document.body.classList.contains('surv'))send({t:'pst',k:secret()})}return ok};
 const erase=async()=>{if(!get(K))return;await post('/jogador/apagar',{k:get(K)});put(K,null);put(ON,null)};
 const renew=async()=>{const old=secret(),n=fresh();const ok=await post('/jogador/trocar',{k:old,n});if(ok){put(K,n);if(mode==='play'&&document.body.classList.contains('surv'))send({t:'pst',k:n})}return ok};
 const resultRow=()=>{const d=document.createElement('div');d.className='sv-pst';
  if(on()){const a=document.createElement('a');a.href=link();a.target='_blank';a.rel='noopener noreferrer';a.textContent='📊 Ver minhas estatísticas';d.append(a)}
  else{const b=document.createElement('button');b.type='button';b.textContent='📊 Criar minha página de estatísticas';b.onclick=async()=>{b.disabled=true;if(await enable()){d.textContent='';const a=document.createElement('a');a.href=link();a.target='_blank';a.rel='noopener noreferrer';a.textContent='📊 Ver minhas estatísticas';d.append(a)}else{b.disabled=false;b.textContent='Não foi possível criar agora'}};d.append(b)}
  return d};
 return{on,secret,link,enable,erase,renew,resultRow,copy}})();

// ---- Perfil (botão 👤 da barra): nome, foto do rosto, código de recuperação e link das estatísticas. Código e link ficam mascarados (************)
// até o jogador clicar no olho, e voltam a ficar ocultos quando a janela fecha.
const PERFIL=(()=>{
 const MASK='************',P=$('#pPerf'),rec=$('#pfRec'),lnk=$('#pfLink'),msg=$('#pfMsg');let showRec=false,showLnk=false;
 const note=t=>{msg.textContent=t};
 // o código de recuperação dá o nome e o visual de quem o tiver: nunca sai do navegador (não vai ao servidor nem a link), fica oculto, volta a ocultar sozinho
 // depois de 30 s ou quando a aba some, e não é guardado em lugar nenhum (é montado na hora)
 let hideT=0;const arm=()=>{clearTimeout(hideT);hideT=showRec?setTimeout(()=>{showRec=false;note('Código ocultado de novo por segurança.');paint()},30000):0};
 const recText=()=>SKYREC.encode({name:cleanName($('#name').value),look:cfg,gloss:glossOn()});
 // foto do rosto: um segundo desenhista pequeno, só com a cabeça do avatar (a câmera olha de frente para ela)
 function foto(){
  const cv=$('#pfFace'),W=cv.width,x=cv.getContext('2d');x.clearRect(0,0,W,W);
  let r=null,g=null;
  try{
   r=new THREE.WebGLRenderer({canvas:document.createElement('canvas'),alpha:true,antialias:true,preserveDrawingBuffer:true});r.setSize(W,W,false);r.setClearColor(0x000000,0);
   const sc=new THREE.Scene();g=new THREE.Group();g.userData={};dress(g,{...cfg});sc.add(g);
   sc.add(new THREE.HemisphereLight(0xffffff,0x9a8a7a,1.25));const d=new THREE.DirectionalLight(0xffffff,.9);d.position.set(1.5,3,4);sc.add(d);
   g.updateMatrixWorld(true);const p=new THREE.Vector3();g.userData.hd.getWorldPosition(p);
   const cam=new THREE.PerspectiveCamera(28,1,.1,20);cam.position.set(p.x,p.y+.03,p.z+1.5);cam.lookAt(p.x,p.y,p.z);
   r.render(sc,cam);x.drawImage(r.domElement,0,0,W,W);
  }catch(e){x.font=(W*.7)+'px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('🙂',W/2,W/2)}
  finally{if(g)freeAv(g);if(r){r.dispose();if(r.forceContextLoss)r.forceContextLoss()}}}
 function paint(){
  $('#pfName').textContent=cleanName($('#name').value)||me.name||'Visitante';
  rec.value=showRec?recText():MASK;lnk.value=!PST.on()?'Nenhuma página criada':showLnk?PST.link():MASK;
  $('#pfRecEye').setAttribute('aria-pressed',String(showRec));$('#pfRecEye').textContent=showRec?'🙈':'👁';$('#pfRecEye').title=$('#pfRecEye').ariaLabel=showRec?'Ocultar o código':'Mostrar o código';
  $('#pfLinkEye').setAttribute('aria-pressed',String(showLnk));$('#pfLinkEye').textContent=showLnk?'🙈':'👁';$('#pfLinkEye').title=$('#pfLinkEye').ariaLabel=showLnk?'Ocultar o link':'Mostrar o link';
  const on=PST.on();['pfLinkEye','pfLinkCp','pfOpen','pfNew','pfDel'].forEach(i=>$('#'+i).hidden=!on);$('#pfMake').hidden=on}
 const hideAll=()=>{showRec=showLnk=false;arm();note('');paint()};
 new MutationObserver(()=>{if(P.classList.contains('hide'))hideAll();else{paint();foto()}}).observe(P,{attributes:true,attributeFilter:['class']});
 $('#bPerf').onclick=()=>tog('pPerf');
 $('#pfRecEye').onclick=()=>{showRec=!showRec;arm();paint()};
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&showRec){showRec=false;arm();paint()}});
 $('#pfLinkEye').onclick=()=>{showLnk=!showLnk;paint()};
 // copiar funciona mesmo com o texto oculto (o jogador não precisa expor o código na tela)
 $('#pfRecCp').onclick=async()=>note(await PST.copy(recText())?'✔ Código copiado. Guarde em um lugar seguro.':'Não foi possível copiar: mostre o código e copie à mão.');
 $('#pfLinkCp').onclick=async()=>note(await PST.copy(PST.link())?'✔ Link copiado. A página é pública: qualquer um pode abrir.':'Não foi possível copiar: mostre o link e copie à mão.');
 $('#pfMake').onclick=async e=>{e.target.disabled=true;const ok=await PST.enable();e.target.disabled=false;note(ok?'✔ Página criada. Ela é pública e aparece no ranking depois da primeira rodada. O link fica oculto: use o olho.':'⚠ Não foi possível criar agora. Tente de novo.');paint()};
 $('#pfOpen').onclick=()=>window.open(PST.link(),'_blank','noopener');
 $('#pfNew').onclick=async e=>{e.target.disabled=true;const ok=await PST.renew();e.target.disabled=false;note(ok?'✔ Novo link criado; o antigo deixou de funcionar.':'⚠ Não foi possível trocar agora.');paint()};
 $('#pfDel').onclick=async e=>{e.target.disabled=true;await PST.erase();e.target.disabled=false;showLnk=false;note('✔ Página apagada do servidor.');paint()};
 $('#name').addEventListener('input',()=>{if(!P.classList.contains('hide'))paint()});
 return{paint,foto}})();
