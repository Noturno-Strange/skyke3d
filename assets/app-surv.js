/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Modo Sobrevivência (cliente): medidores, relógio, ações perto da fogueira e dos pontos de coleta, mochila, cozinha e resultado.
 * O servidor decide tudo (survival.js); aqui só se mostra o estado (svs/svm/sve) e se pedem ações ({t:'sv',a:...}).
 * Fora do modo nada daqui aparece nem roda (SURVC.leave desfaz tudo).
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
const SURVC=(()=>{
const S=SKYCAT.SURV,RES=S.res,REC=S.recipes,DISH={};REC.forEach(r=>DISH[r.id]=r);
let on=false,pub=null,mine={m:{},inv:{},f:0,k:0,rv:''},nodes=[],off=new Set(),marks=[],tmr=0,raf=0,sig='',nights=0,els=null;
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
 document.body.append(hud,actb,faint,inv,cook,end);
 return{hud,mt,ff,clock,pot,actb,faint,fwt,inv,il,cook,cs,cl,end}}

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
 els.clock.textContent=(pub.nt?'🌙 Noite ':'☀ Dia ')+Math.min(nights,pub.nd+1)+'/'+nights+(mine.k?' · 🤢 enjoado':'');
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

function invOpen(){invSig='';const h=els.inv.classList.contains('hide');['#pMochila','#pVis','#pSet','#pRep'].forEach(s=>$(s).classList.add('hide'));els.cook.classList.add('hide');els.inv.classList.toggle('hide',!h);if(h)invUi()}
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
function marks_clear(){marks.forEach(s=>{scene.remove(s);if(s.material)s.material.dispose()});marks=[]}
function marks_make(seed){
 marks_clear();nodes=SKYMAP.generate(seed).nodes;
 nodes.forEach(n=>{const s=new THREE.Sprite(spr(RES[n.res].ic));s.scale.set(.8,.8,.8);s.position.set(n.x,1.1,n.z);scene.add(s);marks.push(s)})}
function tick(){
 if(!on)return;raf=requestAnimationFrame(tick);
 const t=performance.now()/1000;
 for(let i=0;i<marks.length;i++){const s=marks[i];s.visible=!off.has(i);s.position.y=1.05+Math.sin(t*2+i)*.08}}

function endUi(m){
 if(!els)return;const e=els.end;e.textContent='';
 const box=el('div','sv-box');
 box.append(el('h3',null,m.ok?'🏆 Vocês sobreviveram!':'😵 A rodada acabou'));
 box.append(el('p',null,m.ok?'O grupo atravessou todas as noites.':'Todos desmaiaram ao mesmo tempo.'));
 const ln=[['Noites',Math.min(m.nights,m.target)+' / '+m.target],['Tempo',fmt(m.sec)],['Refeições',m.meals],['Desmaios',m.faints],['Semente',m.seed]];
 const t=el('div','sv-sum');ln.forEach(([k,v])=>{t.append(el('span',null,k),el('b',null,String(v)))});box.append(t);
 const row=el('div','row');
 if(hostId===me.id){const b=el('button','pri','🔁 Jogar de novo');b.type='button';b.onclick=()=>act('again');row.append(b)}else row.append(el('small',null,'Aguardando o anfitrião iniciar outra rodada.'));
 const c=el('button',null,'Fechar');c.type='button';c.onclick=()=>e.classList.add('hide');row.append(c);
 box.append(PST.resultRow());
 box.append(row);e.append(box);e.classList.remove('hide')}

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
 leave(true);if(!m.sv)return;
 on=true;nights=m.sv.nights;els=build();document.body.classList.add('surv');
 marks_make(m.sv.seed);
 if(PST.on())send({t:'pst',k:PST.secret()});
 $('#bMochila').onclick=invOpen;
 apply(m.sv.pub);tmr=setInterval(()=>{actions();cookUi()},150);raf=requestAnimationFrame(tick);
 say('','🏕 Sobrevivência: sobrevivam a '+nights+' noites. Calor, fome e sede caem sozinhos; a fogueira é o centro do acampamento.',1)}
function leave(quiet){
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
  case 'svend':endUi(m);break;
  case 'svnew':{SVSEED=m.seed;nights=m.nights;els.end.classList.add('hide');buildRoom(cfg.style==='acampamento'?cfg.style:'acampamento');marks_make(m.seed);me.g.position.set(0,0,5);dest=null;lastMv='';svFaint=false;mine.f=0;apply(m.pub);say('','🔁 Nova rodada! Semente '+m.seed+'.',1);break}
  case 'sverr':if(ERR[m.e])say('','⚠ '+ERR[m.e],1);break}}
return{prep,enter,leave,msg}})();

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
 // bloco "Minhas estatísticas" dentro de cada caixa de recuperação (tela inicial e Ajustes)
 const mk=box=>{
  const det=document.createElement('details');det.className='rec';
  det.innerHTML='<summary>📊 Minhas estatísticas</summary><small>Opcional. Cria uma página com o seu nome e os seus resultados no modo Sobrevivência. <b>Só vê quem tiver o link</b>; você pode gerar um link novo ou apagar tudo quando quiser. Nada é guardado se você não criar.</small>'
   +'<label class="glo"><input type="checkbox" data-ps="on"> Criar minha página</label>'
   +'<div class="recrow" data-ps="row"><input class="recout" readonly aria-label="Link da sua página de estatísticas" spellcheck="false"><button type="button" data-ps="copy">📋 Copiar</button></div>'
   +'<div class="recrow" data-ps="row2"><button type="button" data-ps="open">Abrir</button><button type="button" data-ps="new">🔄 Novo link</button></div><small class="recmsg" role="status" aria-live="polite"></small>';
  box.append(det);
  const cb=det.querySelector('[data-ps=on]'),out=det.querySelector('.recout'),msg=det.querySelector('.recmsg'),rows=det.querySelectorAll('[data-ps=row],[data-ps=row2]');
  const ui=()=>{const o=on();cb.checked=o;rows.forEach(r=>r.hidden=!o);if(o)out.value=link()};
  det.addEventListener('toggle',()=>{msg.textContent='';ui()});ui();
  cb.onchange=async()=>{msg.textContent='';if(cb.checked){cb.disabled=true;const ok=await enable();cb.disabled=false;if(!ok){cb.checked=false;msg.textContent='⚠ Não foi possível criar agora. Tente de novo.'}else msg.textContent='✔ Página criada. Copie o link e guarde: só quem tiver ele vê.'}else{cb.disabled=true;await erase();cb.disabled=false;msg.textContent='✔ Página apagada do servidor.'}ui()};
  det.onclick=async e=>{const b=e.target.closest('[data-ps]');if(!b||b.tagName!=='BUTTON')return;const a=b.dataset.ps;
   if(a==='copy'){msg.textContent=await copy(out.value)?'✔ Link copiado. Quem tiver o link vê a página.':'Selecione e copie o link manualmente.'}
   else if(a==='open')window.open(out.value,'_blank','noopener');
   else if(a==='new'){b.disabled=true;const ok=await renew();b.disabled=false;msg.textContent=ok?'✔ Novo link criado; o antigo deixou de funcionar.':'⚠ Não foi possível trocar agora.';ui()}}};
 document.querySelectorAll('.recBox').forEach(mk);
 // "Esquecer meus dados" também apaga a página do servidor
 document.querySelectorAll('.forgetSaved').forEach(b=>b.addEventListener('click',()=>{erase()}));
 return{on,secret,link,enable,erase,renew,resultRow}})();
