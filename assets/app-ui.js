/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Ajustes, janelas arrastáveis, controles, laço principal e danças.
 * Os arquivos assets/app-*.js são scripts comuns carregados em ordem pelo index.html e dividem o mesmo escopo global: o que um
 * declara no nível de cima, os seguintes enxergam. Código que roda ao carregar só pode usar o que já veio antes.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
// ---------- ajustes ----------
{const sb=$('#sBr');if(sb){sb.value=BRI;sb.oninput=e=>{BRI=Math.min(1.6,Math.max(.6,parseFloat(e.target.value)||1));try{localStorage.setItem('skyke_br',BRI)}catch(_){}const T=THEME[CUR];if(T){hemi.intensity=T.h[2]*.8*LGH*BRI;dirL.intensity=T.d[1]*.7*LGD*BRI;fillL.intensity=FILLI*BRI}}}}
$('#sUi').oninput=e=>{R.style.setProperty('--ui',e.target.value);requestAnimationFrame(clampPanels)};$('#sTx').oninput=e=>{R.style.setProperty('--tx',e.target.value);requestAnimationFrame(clampPanels)};
$('#sHc').onchange=e=>R.dataset.hc=e.target.checked?'on':'off';
let rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
let RS=1;let lq=COARSE;function res(){const w=innerWidth,h=innerHeight;renderer.setPixelRatio((lq?1:Math.min(devicePixelRatio,2))*RS);renderer.setSize(w,h);cam.aspect=w/h;cam.fov=w/h<.9?72:60;cam.updateProjectionMatrix()}
$('#sTh').onchange=e=>{const t=e.target.value;if(t==='auto')delete R.dataset.theme;else R.dataset.theme=t};
addEventListener('resize',res);addEventListener('resize',()=>clampPanels());res();

// ---------- janelas arrastáveis / chat ----------
const UZ=()=>parseFloat(getComputedStyle(R).getPropertyValue('--ui'))||1;
function clampPanels(){const z=UZ(),iw=innerWidth,ih=innerHeight;['chat','pMochila','pVis','pVid','pDJ','pKar','pKFila','pSet','pEmo','pRep'].forEach(id=>{const p=$('#'+id);if(!p||p.classList.contains('hide'))return;let r=p.getBoundingClientRect();
 if(r.width>iw-8){p.style.width=((iw-8)/z)+'px';r=p.getBoundingClientRect()}if(r.height>ih-8){p.style.height=((ih-8)/z)+'px';r=p.getBoundingClientRect()}
 let dx=0,dy=0;if(r.left<4)dx=4-r.left;else if(r.right>iw-4)dx=iw-4-r.right;if(r.top<4)dy=4-r.top;else if(r.bottom>ih-4)dy=ih-4-r.bottom;if(!dx&&!dy)return;
 const l=getComputedStyle(p).transform!=='none'?p.offsetLeft-p.offsetWidth/2:p.offsetLeft;
 p.style.transform='none';p.style.right='auto';p.style.bottom='auto';p.style.left=(l+dx/z)+'px';p.style.top=(p.offsetTop+dy/z)+'px'})}
function placeChat(){const c=$('#chat');c.style.left='12px';c.style.right='auto';c.style.top=Math.max(60,innerHeight/UZ()-c.offsetHeight-76)+'px'}
function dragify(id){const p=$('#'+id),h=p.querySelector('.grip');if(!h)return;h.onpointerdown=e=>{if(e.target.closest('button'))return;e.preventDefault();const z=UZ();
 if(getComputedStyle(p).transform!=='none')p.style.left=(p.offsetLeft-p.offsetWidth/2)+'px';else p.style.left=p.offsetLeft+'px';
 p.style.top=p.offsetTop+'px';p.style.right='auto';p.style.bottom='auto';p.style.transform='none';
 const ox=e.clientX,oy=e.clientY,sl=parseFloat(p.style.left),st=parseFloat(p.style.top);h.setPointerCapture(e.pointerId);
 const mv=ev=>{const w=p.offsetWidth;p.style.left=Math.max(60-w,Math.min(innerWidth/z-60,sl+(ev.clientX-ox)/z))+'px';p.style.top=Math.max(0,Math.min(innerHeight/z-40,st+(ev.clientY-oy)/z))+'px'};
 const up=()=>{h.removeEventListener('pointermove',mv);h.removeEventListener('pointerup',up);h.removeEventListener('pointercancel',up)};
 h.addEventListener('pointermove',mv);h.addEventListener('pointerup',up);h.addEventListener('pointercancel',up)}}
['chat','pMochila','pVis','pVid','pDJ','pKar','pKFila','pSet','pEmo','pRep'].forEach(dragify);
// X de fechar em todas as janelas; só o karaokê não fecha (ele minimiza para um botão flutuante e fecha quando o jogador sai da fila)
['pMochila','pVis','pVid','pDJ','pKar','pKFila','pSet','pEmo','pRep'].forEach(id=>{const p=$('#'+id),g=p.querySelector('.grip');if(!g)return;const b=document.createElement('button'),kar=id==='pKar';b.className='gmin';b.textContent=kar?'➖':'✖';b.title=kar?'Minimizar (o karaokê continua)':id==='pKFila'?'Fechar fila':'Fechar janela';b.setAttribute('aria-label',b.title);
 b.onclick=e=>{e.stopPropagation();if(kar){minimizeK();return}if(id==='pVid'){closeVid(true);return}p.classList.add('hide');if(id==='pKFila'){kShowQ=false;renderK()}};g.append(b)});
let cf=1.05;$('#cPlus').onclick=()=>{cf=Math.min(1.8,cf+.15);R.style.setProperty('--cf',cf+'em')};$('#cMinus').onclick=()=>{cf=Math.max(.8,cf-.15);R.style.setProperty('--cf',cf+'em')};

// ---------- controles ----------
const keys={};
function toggleSit(){if(mode!=='play')return;if(me.sit){me.sit=false;const s=me.seat;if(s){me.g.position.x-=Math.sin(s.r)*.8;me.g.position.z-=Math.cos(s.r)*.8;clamp(me.g.position)}return}
 let best=null,bd=1.5;for(const s of seats){const d=Math.hypot(s.x-me.g.position.x,s.z-me.g.position.z);if(d<bd&&![...actors.values()].some(a=>a.sit&&Math.hypot(a.tx-s.x,a.tz-s.z)<.4)){best=s;bd=d}}
 if(!best){say('','Chegue perto de uma cadeira para sentar.',1);return}me.sit=true;me.seat=best;me.g.position.set(best.x,0,best.z);me.g.rotation.y=best.r;dest=null;me.jy=0;me.vy=0;}
function jump(){if(mode==='play'&&!me.sit&&me.jy===0)me.vy=4.3}
addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;const k=e.key.toLowerCase();
 if(k===' '){e.preventDefault();if(!e.repeat)useItem();return}
 if(e.repeat){keys[k]=1;return}if(k==='e')jump();else if(k==='f')toggleSit();keys[k]=1});
addEventListener('keyup',e=>delete keys[e.key.toLowerCase()]);addEventListener('blur',()=>{for(const k in keys)delete keys[k]});

const ray=new THREE.Raycaster(),pl=new THREE.Plane(new THREE.Vector3(0,1,0),0);let dest=null;
let dragging=false;function setDest(e){ray.setFromCamera({x:e.clientX/innerWidth*2-1,y:-(e.clientY/innerHeight)*2+1},cam);const p=new THREE.Vector3();if(ray.ray.intersectPlane(pl,p)){clamp(p);dest=p}}
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0||mode!=='play'||me.sit)return;dragging=true;setDest(e)});
// botão direito: arrastar gira a câmera em 360° ao redor do avatar; um clique rápido vai para a frente do avatar (de novo, volta ao padrão)
const angDiff=(a,b)=>{let d=a-b;while(d>PI)d-=2*PI;while(d<-PI)d+=2*PI;return d};
const camHint=$('#camHint');let orb=null,hintTm=0;
function camHintShow(txt,spin,x,y,ms){clearTimeout(hintTm);camHint.innerHTML='<span class="ci">'+(spin?'↻':'🎥')+'</span><span></span>';camHint.lastChild.textContent=txt;camHint.style.left=x+'px';camHint.style.top=y+'px';camHint.classList.toggle('spin',!!spin);camHint.classList.remove('hide','pop');void camHint.offsetWidth;camHint.classList.add('pop');if(ms)hintTm=setTimeout(()=>camHint.classList.add('hide'),ms)}
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==2||mode!=='play')return;dragging=false;orb={sx:e.clientX,sy:e.clientY,x:e.clientX,moved:false};camHintShow('Arraste para girar',0,e.clientX,e.clientY,0)});
addEventListener('pointermove',e=>{if(!orb)return;if(!orb.moved&&Math.hypot(e.clientX-orb.sx,e.clientY-orb.sy)>5){orb.moved=true;camHintShow('Girando a câmera',1,e.clientX,e.clientY,0)}if(orb.moved){camYaw-=(e.clientX-orb.x)*.008;camHint.style.left=e.clientX+'px';camHint.style.top=e.clientY+'px'}orb.x=e.clientX});
addEventListener('pointerup',e=>{if(e.button!==2||!orb)return;const o=orb;orb=null;if(o.moved){camHint.classList.add('hide');return}
 const f=me.g.rotation.y;if(Math.abs(angDiff(f,camYawS))<.35){camYaw=camYawS+angDiff(0,camYawS);camHintShow('Câmera padrão',0,e.clientX,e.clientY,1400)}else{camYaw=camYawS+angDiff(f,camYawS);camHintShow('De frente para o avatar',0,e.clientX,e.clientY,1400)}});
addEventListener('blur',()=>{orb=null;camHint.classList.add('hide')});
renderer.domElement.addEventListener('pointermove',e=>{if(dragging&&mode==='play'&&!me.sit)setDest(e)});
addEventListener('pointerup',()=>dragging=false);addEventListener('pointercancel',()=>dragging=false);
const clamp=p=>{
 const dx=p.x-WALK.x,dz=p.z-WALK.z,d=Math.hypot(dx,dz);
 if(d>WALK.r){const s=WALK.r/(d||1);p.x=WALK.x+dx*s;p.z=WALK.z+dz*s}
 if(obst){const ox=p.x-obst.x,oz=p.z-obst.z,od=Math.hypot(ox,oz);if(od<obst.r){if(od<.001){p.x=obst.x+obst.r}else{p.x=obst.x+ox/od*obst.r;p.z=obst.z+oz/od*obst.r}}}};

// ---------- loop ----------
$('#vbar').innerHTML='<i></i>'.repeat(10);const vbs=[...$('#vbar').children];
const clock=new THREE.Clock(),v3=new THREE.Vector3();let sendT=0,lastMv='',lastMvT=0;
function seatAt(x,z){let b=null,bd=.5;for(const s of seats){const d=Math.hypot(s.x-x,s.z-z);if(d<bd){bd=d;b=s}}return b}
// ---------- danças 4–19 ----------
// e = segundos desde o início · u = partes do avatar · f = corpo · st = em pé (false = sentado)
const DANCES=(()=>{const S=Math.sin,C=Math.cos,ab=Math.abs,mx=Math.max;
 // agacha mantendo os pés no chão: o quadril desce d e as pernas dobram na medida exata
 // mantém os pés planos: cada pé gira de volta o mesmo tanto que a canela inclina
 const flat=u=>{u.ftL.rotation.x=-(u.lgL.rotation.x+u.knL.rotation.x);u.ftR.rotation.x=-(u.lgR.rotation.x+u.knR.rotation.x)};
 const crouch=(u,f,d,st)=>{if(!st)return;f.position.y-=d;const al=Math.acos(Math.max(.2,Math.min(1,1-d/.63)));u.lgL.rotation.x=u.lgR.rotation.x=-al;u.knL.rotation.x=u.knR.rotation.x=2*al;flat(u)};
 // afasta as pernas sem tirar os pés do chão
 const spread=(u,f,p,st)=>{if(!st)return;u.lgL.rotation.z=-p;u.lgR.rotation.z=p;f.position.y-=.72*(1-C(p))};
 // chute: primeiro a coxa sobe com o joelho dobrado, depois o joelho estica (t: 0 = apoio, 1 = chute)
 const kick=t=>{const g=Math.min(1,t*2),a=-(1.06+.54*g*g*(3-2*g)),sh=t<=.5?1.06:1.06-(2*t-1)*2.66;return[a,sh-a]};
 return{
 // 4 robô: movimentos em passos secos
 dance4:(e,u,f)=>{const p=Math.floor(e*3)%4;u.armR.rotation.z=[1.57,1.57,.3,.3][p];u.armL.rotation.z=-[.3,1.57,1.57,.3][p];u.hd.rotation.y=[.6,0,-.6,0][p];f.rotation.y=[.4,0,-.4,0][p];u.lgL.rotation.x=p===1?-.5:0;u.lgR.rotation.x=p===3?-.5:0},
 // 5 samba: quadril rápido e pernas alternando
 dance5:(e,u,f)=>{const s=S(e*10);f.rotation.z=s*.13;f.rotation.y=S(e*5)*.3;f.position.y+=ab(s)*.05;u.lgL.rotation.x=-.55*mx(0,s);u.knL.rotation.x=.6*mx(0,s);u.lgR.rotation.x=-.55*mx(0,-s);u.knR.rotation.x=.6*mx(0,-s);u.armR.rotation.z=1+s*.5;u.armL.rotation.z=-(1-s*.5);u.armR.rotation.x=-.5*s;u.armL.rotation.x=.5*s;u.hd.rotation.z=-s*.12},
 // 6 funk: joelhos dobrados e quadril de lado a lado
 dance6:(e,u,f,st)=>{const s=S(e*8);crouch(u,f,.16,st);f.rotation.z=s*.14;f.rotation.y=S(e*4)*.4;u.armR.rotation.x=-.8+s*.4;u.armL.rotation.x=-.8-s*.4;u.armR.rotation.z=.3;u.armL.rotation.z=-.3;u.hd.rotation.x=S(e*8)*.08},
 // 7 floss: braços cruzando o corpo, quadril para o outro lado
 dance7:(e,u,f,st)=>{const s=S(e*7);crouch(u,f,.06,st);u.armR.rotation.z=.35-s*.45;u.armL.rotation.z=-.35-s*.45;u.armR.rotation.x=u.armL.rotation.x=.5;f.rotation.z=s*.14;u.hd.rotation.z=-s*.1;f.rotation.y=-s*.15},
 // 8 irrigador: um braço varrendo em trancos, a outra mão no queixo
 dance8:(e,u,f)=>{const k=Math.floor(e*4)%5;f.rotation.y=-.8+k*.4;u.armR.rotation.z=1.5;u.armL.rotation.x=-2.3;u.armL.rotation.z=-.3;u.hd.rotation.y=.3;f.position.y+=(e*4%1<.2?.03:0)},
 // 9 rock: cabeça balançando, punho para cima, pernas abertas
 dance9:(e,u,f,st)=>{const b=S(e*9);spread(u,f,.25,st);u.hd.rotation.x=.35+b*.45;f.rotation.x=.15+b*.12;f.position.y+=ab(b)*.03;u.armR.rotation.z=2.4;u.armL.rotation.z=-.7;u.armL.rotation.x=-.5+b*.3},
 // 10 cancã: chutes altos alternados
 dance10:(e,u,f)=>{const k=S(e*7),l=mx(0,k),r=mx(0,-k);u.lgL.rotation.x=-1.5*l;u.lgR.rotation.x=-1.5*r;u.knL.rotation.x=.25*l;u.knR.rotation.x=.25*r;u.armR.rotation.z=.9;u.armL.rotation.z=-.9;f.position.y+=ab(k)*.04;f.rotation.z=-k*.06;u.hd.rotation.z=k*.1},
 // 11 zumbi: braços esticados, cabeça caída, arrastando os pés
 dance11:(e,u,f)=>{const j=S(e*13)*.08,w=S(e*3)*.4;u.armR.rotation.x=-1.5+j;u.armL.rotation.x=-1.5-j;u.armR.rotation.z=.15;u.armL.rotation.z=-.15;u.hd.rotation.z=.3+S(e*2)*.1;u.hd.rotation.x=.25;f.rotation.x=.18+S(e*3)*.04;f.rotation.z=S(e*3)*.08;u.mo.scale.set(1,1.6,1);u.lgL.rotation.x=w;u.lgR.rotation.x=-w},
 // 12 hula: quadril em círculos e braços ondulando
 dance12:(e,u,f,st)=>{const h=e*4;crouch(u,f,.05,st);f.rotation.z=S(h)*.16;f.rotation.x=C(h)*.1;u.armR.rotation.z=1.2+S(h+1)*.45;u.armL.rotation.z=-(1.2+S(h+3)*.45);u.armR.rotation.x=u.armL.rotation.x=-.3;u.hd.rotation.z=-S(h)*.1},
 // 13 pirueta: giro rápido, braços em arco, uma perna dobrada
 dance13:(e,u,f)=>{f.rotation.y=e*8;f.position.y+=.03;u.armR.rotation.z=2.7;u.armL.rotation.z=-2.7;u.lgR.rotation.x=-1.1;u.knR.rotation.x=1.9;u.hd.rotation.x=-.1},
 // 14 cossaco: agachado, chutando uma perna de cada vez
 dance14:(e,u,f,st)=>{const s=S(e*6);crouch(u,f,.32,st);if(st){const L=kick(mx(0,s)),R=kick(mx(0,-s));u.lgL.rotation.x=L[0];u.knL.rotation.x=L[1];u.lgR.rotation.x=R[0];u.knR.rotation.x=R[1];flat(u)}u.armR.rotation.x=u.armL.rotation.x=-1.3;u.armR.rotation.z=-.2;u.armL.rotation.z=.2;f.rotation.x=.12;f.rotation.y=s*.2;f.position.y+=ab(s)*.04},
 // 15 frango: asas batendo e bicadas
 dance15:(e,u,f,st)=>{const fl=S(e*14),p=mx(0,S(e*3.5));crouch(u,f,.1,st);u.armR.rotation.z=1.15+fl*.45;u.armL.rotation.z=-(1.15+fl*.45);u.hd.rotation.x=.5*p;f.rotation.x=.15*p},
 // 16 twist: tronco girando de um lado a outro com o corpo baixo
 dance16:(e,u,f,st)=>{const t=S(e*7);crouch(u,f,.1+ab(S(e*3.5))*.06,st);f.rotation.y=t*.7;u.lgL.rotation.y=u.lgR.rotation.y=-t*.7;u.armR.rotation.z=.7;u.armL.rotation.z=-.7;u.armR.rotation.x=-t*.5;u.armL.rotation.x=t*.5},
 // 17 moonwalk: pernas deslizando e corpo inclinado para trás
 dance17:(e,u,f)=>{const s=S(e*5);f.rotation.x=-.12;f.position.z+=S(e*2.5)*.12;u.lgL.rotation.x=s*.4;u.lgR.rotation.x=-s*.4;u.knL.rotation.x=.6*mx(0,-s);u.knR.rotation.x=.6*mx(0,s);u.armR.rotation.z=.5;u.armL.rotation.z=-.5;u.armR.rotation.x=-s*.5;u.armL.rotation.x=s*.5;u.hd.rotation.x=.08+S(e*10)*.04},
 // 18 forró: passos curtos de lado, giro lento e braços como num par
 dance18:(e,u,f)=>{const s=S(e*6);f.position.x+=S(e*3)*.14;f.rotation.z=S(e*3)*.06;f.rotation.y=S(e*1.5)*.25;f.position.y+=ab(s)*.03;u.lgL.rotation.x=-.35*mx(0,s);u.lgR.rotation.x=-.35*mx(0,-s);u.armR.rotation.x=-1.2;u.armR.rotation.z=.5;u.armL.rotation.x=-.9;u.armL.rotation.z=-.1;u.hd.rotation.z=.1},
 // 19 pulinhos: saltos com pernas recolhidas e braços para cima
 dance19:(e,u,f)=>{const j=ab(S(e*5)),q=1-j;f.position.y+=j*.28;u.knL.rotation.x=u.knR.rotation.x=1.3*j;u.lgL.rotation.x=u.lgR.rotation.x=-.6*j;u.armR.rotation.z=.5+j*2.1;u.armL.rotation.z=-(.5+j*2.1);f.scale.set(1+q*.06,1-q*.08,1+q*.06)}}})();
function animA(a,t,dt){const u=a.g.userData,f=u.fig;if(!f)return;const ss=a.sit?seatAt(a.g.position.x,a.g.position.z):null;f.position.set(0,a.sit?(ss?ss.h:.45)-.52:(u.fy||0),ss?ss.fo:0);f.rotation.set(0,0,0);u.armL.rotation.set(0,0,-.44);u.armR.rotation.set(0,0,.44);u.hd.rotation.set(0,0,0);u.mo.scale.set(1,1,1);u.lgL.rotation.set(0,0,0);u.lgR.rotation.set(0,0,0);u.knL.rotation.set(0,0,0);u.knR.rotation.set(0,0,0);u.ftL.rotation.set(0,0,0);u.ftR.rotation.set(0,0,0);u.lgL.position.y=.72;u.lgR.position.y=.72;f.scale.set(1,1,1);if(a.sit){u.lgL.rotation.x=u.lgR.rotation.x=-1.4;u.knL.rotation.x=u.knR.rotation.x=ss?ss.k:1.4}
 {const spd=a.spd||0;a.ph=(a.ph||0)+dt*spd*3.4;const sp=(a.sit||rm)?0:Math.min(1,spd/2.2),air=!a.sit&&a.g.position.y>.07;
  if(air){u.armR.rotation.z=2.3;u.armL.rotation.z=-2.3;u.lgL.rotation.z=-.35;u.lgR.rotation.z=.35;f.scale.set(.94,1.08,.94)}
  else if(sp>.05){const s1=Math.sin(a.ph),s2=Math.sin(a.ph*2);
   u.lgL.rotation.x=s1*.95*sp;u.lgR.rotation.x=-s1*.95*sp;u.lgL.position.y=.72+Math.max(0,s1)*.12*sp;u.lgR.position.y=.72+Math.max(0,-s1)*.12*sp;
   u.armL.rotation.x=s1*1.15*sp;u.armR.rotation.x=-s1*1.15*sp;u.armL.rotation.z=-.44-Math.abs(s1)*.5*sp;u.armR.rotation.z=.44+Math.abs(s1)*.5*sp;
   f.rotation.z=s1*.16*sp;f.rotation.x=.1*sp;f.position.y+=Math.abs(s1)*.1*sp;f.scale.set(1-s2*.03*sp,1+s2*.05*sp,1-s2*.03*sp);u.hd.rotation.z=Math.sin(a.ph+1)*.12*sp;u.hd.rotation.x=s2*.06*sp}}
 const gs=a.gest;if(gs){const e=(performance.now()-gs.t0)/1000;if(e>gs.dur){a.gest=null}else{const g=gs.g;
  if(a.sit&&g.startsWith('dance')){}
  else if(g==='arms'){const k=Math.min(1,e*2.5)*(e>gs.dur-.4?(gs.dur-e)/.4:1),z=.44+2.4*k+Math.sin(e*10)*.1*k;u.armR.rotation.z=z;u.armL.rotation.z=-z}
  else if(g==='scream'){u.hd.rotation.x=-.35;u.mo.scale.set(1.3,2.6,1);u.armR.rotation.z=2.5;u.armL.rotation.z=-2.5;f.rotation.z=Math.sin(e*30)*.04}
  else if(g==='fart'){f.rotation.x=.3+Math.sin(e*25)*.05}
  else if(g==='dance1'){const s=Math.sin(e*6);f.rotation.z=s*.12;f.position.y+=Math.abs(s)*.08;u.armR.rotation.z=.9+(1+s)*.9;u.armL.rotation.z=-(.9+(1-s)*.9)}
  else if(g==='dance2'){f.rotation.y=e*5;f.position.y+=Math.abs(Math.sin(e*5))*.06;u.armR.rotation.z=2.2;u.armL.rotation.z=-2.2}
  else if(g==='dance3'){f.rotation.z=Math.sin(e*4)*.2;f.rotation.y=Math.sin(e*2)*.6;f.position.y+=Math.abs(Math.sin(e*8))*.07;u.armR.rotation.z=2.6+Math.sin(e*8)*.2;u.armL.rotation.z=-.5;u.hd.rotation.z=Math.sin(e*8)*.15}
  else if(DANCES[g])DANCES[g](e,u,f,!a.sit);
  if(a.sit){u.lgL.rotation.set(-1.4,0,0);u.lgR.rotation.set(-1.4,0,0);u.knL.rotation.set(ss?ss.k:1.4,0,0);u.knR.rotation.set(ss?ss.k:1.4,0,0);u.lgL.position.y=u.lgR.position.y=.72;f.position.y+=.52*(2-Math.cos(f.rotation.z)-Math.cos(f.rotation.x))+.52*(1-f.scale.y)}
  else f.position.y+=Math.abs(Math.sin(f.rotation.z))*.2+Math.abs(Math.sin(f.rotation.x))*.18}}
 if(a.drink>0){a.drink-=dt;u.armR.rotation.x=-2.1*Math.sin(Math.min(1,(1.6-a.drink)*2)*Math.PI*.9)}}
const PERF=/[?&]perf(=|&|$)/.test(location.search);let _pe=null,_pa=0,_pn=0;
if(PERF)window.__dbg={scene,renderer,room,cam,me,actors,rig,send,VW,KW,CLK,KLAG,srvNow};// só com ?perf: permite medir o que pesa no quadro
function perfTick(dt){if(!_pe){_pe=document.createElement('pre');_pe.style.cssText='position:fixed;left:6px;top:6px;margin:0;padding:6px 8px;background:#000a;color:#9f9;font:11px/1.35 monospace;z-index:99;pointer-events:none;border-radius:6px';document.body.append(_pe)}
 _pa+=dt;_pn++;if(_pa<.5)return;const i=renderer.info,fps=_pn/_pa,mem=performance.memory?(performance.memory.usedJSHeapSize/1048576).toFixed(0)+'MB':'n/d';
 _pe.textContent='fps '+fps.toFixed(0)+'  frame '+(1000/fps).toFixed(1)+'ms\ncalls '+i.render.calls+'  tris '+i.render.triangles+'\ngeom '+i.memory.geometries+'  tex '+i.memory.textures+'\nprogs '+(i.programs?i.programs.length:0)+'  heap '+mem+'\nactors '+(actors.size+1)+'  scale '+RS.toFixed(1)+'  dpr '+renderer.getPixelRatio().toFixed(2);_pa=0;_pn=0}
let _ae=1/60,_al=0,_ah=0;
function adaptRes(dt){if(mode!=='play'||document.hidden)return;if(SHD)dirL.castShadow=RS>=.8;_ae+=(dt-_ae)*.05;
 if(_ae>1/42){_al+=dt;_ah=0;if(_al>2&&RS>.6){RS=Math.max(.6,RS-.1);_al=0;res()}}
 else if(_ae<1/57){_ah+=dt;_al=0;if(_ah>6&&RS<1){RS=Math.min(1,RS+.1);_ah=0;res()}}else{_al=0;_ah=0}}
const _mvK=new THREE.Vector3(),_dK=new THREE.Vector3();let olN=0;const olLod=()=>{[me,...actors.values()].forEach(a=>{const u=a.g&&a.g.userData,o=u&&u.ols;if(!o)return;const d=cam.position.distanceTo(a.g.position),v=d<16;if(o.vis!==v){o.vis=v;o.forEach(m=>{m.visible=v})}
  const far=d>(u.far?8.5:9.5);if(u.lod&&u.far!==far){u.far=far;u.lod.forEach(e=>{e.m.geometry=far?(e.lo||(e.lo=e.mk())):e.hi})}})};
// satélites e painéis solares: a frente fica sempre a 45° da linha de visão da câmera, virada para o eixo da tela
// (conjuntos à esquerda giram um lado, à direita o outro), e acompanham o giro da câmera
function decorTick(dt){const cx=cam.position.x,cz=cam.position.z,c=Math.cos(camYawA),s=Math.sin(camYawA),k=Math.min(1,dt*6);
 for(const g of decors){const th=Math.atan2(cx-g.position.x,cz-g.position.z),lat=(g.position.x-cx)*c-(g.position.z-cz)*s,tg=th+(lat>=0?1:-1)*PI/4;
  if(g.userData.init)g.rotation.y+=angDiff(tg,g.rotation.y)*k;else{g.rotation.y=tg;g.userData.init=1}}}
function loop(){requestAnimationFrame(loop);if(++olN%20===0)olLod();const dt=Math.min(clock.getDelta(),.1),t=clock.elapsedTime;
if(mode==='play'){const mv=_mvK.set((keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),0,(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0));
 if(camYawA){const c=Math.cos(camYawA),s=Math.sin(camYawA),x=mv.x*c+mv.z*s,z=-mv.x*s+mv.z*c;mv.x=x;mv.z=z}
 if(me.sit&&mv.lengthSq())toggleSit();
 me.moving=false;
 if(!me.sit){let d=mv;if(d.lengthSq())dest=null;else if(dest){d=_dK.subVectors(dest,me.g.position);d.y=0;if(d.length()<.15){dest=null;d.set(0,0,0)}}
  if(d.lengthSq()){const px=me.g.position.x,pz=me.g.position.z;d.normalize();me.g.position.addScaledVector(d,3.2*dt);clamp(me.g.position);me.g.rotation.y=Math.atan2(d.x,d.z);const mvd=Math.hypot(me.g.position.x-px,me.g.position.z-pz);me.moving=mvd>dt*.8;if(dest&&mvd<dt*.2)dest=null;if(me.gest){me.gest=null;send({t:'gest',g:'stop'})}}}
 me.jy+=me.vy*dt;me.vy-=12*dt;if(me.jy<=0){me.jy=0;me.vy=0}
 me.g.position.y=me.jy+(me.moving&&!rm&&me.jy===0?Math.abs(Math.sin(t*10))*.05:0);
 if(t-sendT>.1){sendT=t;const mm_=[me.g.position.x,me.g.position.z,me.g.rotation.y,me.jy].map(n=>n.toFixed(2)).join()+(me.sit?1:0);if(mm_!==lastMv||t-lastMvT>2){lastMv=mm_;lastMvT=t;send({t:'move',x:me.g.position.x,z:me.g.position.z,ry:me.g.rotation.y,y:me.jy,s:me.sit?1:0})}}
 camYawS+=angDiff(camYaw,camYawS)*Math.min(1,dt*10);{const sy=Math.sin(camYawS),cy=Math.cos(camYawS),w=Math.min(1,1-cy),px=me.g.position.x*(.8+.2*w),pz=me.g.position.z;cam.position.lerp(v3.set(px+sy*9.2,4.8,pz+cy*9.2),.08);cam.lookAt(px-sy*3,1.2,pz-cy*3)}}
else{const a=rm?0:t*.15,port=innerWidth/innerHeight<.9||innerWidth<700;if(port){cam.position.set(Math.sin(a)*1.2,2.3,12.9);cam.lookAt(0,-1.1,4.9);me.g.position.set(0,0,4.9)}else{cam.position.set(Math.sin(a)*1.5,2.4,10.9);cam.lookAt(-.4,1.2,4.9);me.g.position.set(2.2,0,4.9)}me.moving=false;me.g.rotation.y=rm?0:t*.6}
cam.getWorldDirection(v3);camYawA=Math.atan2(-v3.x,-v3.z);decorTick(dt);sfxTick(dt);if(!an)me.lv=0;if(an){an.getFloatTimeDomainData(buf);let q=0;for(const x of buf)q+=x*x;const rms=Math.sqrt(q/buf.length);me.lv=Math.min(1,rms*8);const musicMode=VOICE_MODES[voiceQ].music;if(musicMode){hold=.5;vadS.talk=false}else vadStep(vadS,rms,dt);me.talk=musicMode?!!localTrack:vadS.talk;if(me.talk!==lastTalk){lastTalk=me.talk;send({t:'speak',v:me.talk});syncSenders();if(me.talk)onLocalSpeak();else peers.forEach(p=>p.lastActive=Date.now())}}
const nb=me.talk?Math.max(1,Math.round(me.lv*10)):0;vbs.forEach((q,i)=>q.classList.toggle('on',i<nb));me.spd=(me.spd||0)+((me.moving&&me.jy===0?3.2:0)-(me.spd||0))*Math.min(1,dt*12);animA(me,t,dt);
const k=Math.min(1,dt*10),z=UZ();if(SHD){const q_=28/SHD,sx=Math.round(me.g.position.x/q_)*q_,sz=Math.round(me.g.position.z/q_)*q_;dirL.target.position.set(sx,0,sz);dirL.position.set(sx+LDO[0],LDO[1],sz+LDO[2])}FC++;if(FC&1)partTick(dt*2);PM.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);FR.setFromProjectionMatrix(PM);
actors.forEach(a=>{const ox_=a.g.position.x,oz_=a.g.position.z;const pr=peers.get(a.id);let tg=a._tg||0;if(pr&&pr.an&&(FC&1)){pr.an.getFloatTimeDomainData(pr.ab);let s_=0;for(const x of pr.ab)s_+=x*x;tg=Math.min(1,Math.sqrt(s_/pr.ab.length)*8);a._tg=tg;if(tg>.02)pr.lastActive=Date.now()}a.lv=(a.lv||0)+(tg-(a.lv||0))*.5;{const sp=snapPos(a),kk=sp?Math.min(1,dt*25):k,X=sp?sp.x:a.tx,Z=sp?sp.z:a.tz,Y=sp?sp.y:a.ty,Rr=sp?sp.r:a.tr;a.g.position.x+=(X-a.g.position.x)*kk;a.g.position.z+=(Z-a.g.position.z)*kk;a.g.position.y+=(Y-a.g.position.y)*kk;let d_=Rr-a.g.rotation.y;d_=Math.atan2(Math.sin(d_),Math.cos(d_));a.g.rotation.y+=d_*Math.min(1,dt*(sp?20:14))}a.spd=(a.spd||0)+((Math.hypot(a.g.position.x-ox_,a.g.position.z-oz_)/Math.max(dt,.001))-(a.spd||0))*.25;SPH.center.set(a.g.position.x,a.g.position.y+1,a.g.position.z);const dx_=a.g.position.x-cam.position.x,dz_=a.g.position.z-cam.position.z,far=dx_*dx_+dz_*dz_>900;a._ad=(a._ad||0)+dt;if(FR.intersectsSphere(SPH)&&!(far&&(FC&1))){animA(a,t,a._ad);a._ad=0}});
[me,...actors.values()].forEach(a=>{v3.copy(a.g.position);v3.y+=2.6;v3.project(cam);const dsp=(v3.z<1&&(mode==='play'||a===me))?'':'none';if(a._dsp!==dsp){a._dsp=dsp;a.el.style.display=dsp}if(dsp===''){const lx=Math.round((v3.x+1)/2*innerWidth/z*2)/2,ly=Math.round((1-v3.y)/2*innerHeight/z*2)/2;if(a._lx!==lx){a._lx=lx;a.el.style.left=lx+'px'}if(a._ly!==ly){a._ly=ly;a.el.style.top=ly+'px'}}lab(a)});
if(fireL){fireL.intensity=(FIRE_I+Math.sin(t*9)*.3+Math.sin(t*23)*.14)*LG;flames.forEach((f,i)=>{f.scale.y=1+Math.sin(t*10+i*2)*.2;f.rotation.y=t*1.5+i});{const q=fireL.intensity/(FIRE_I*LG);fireGlow.forEach(m=>{m.material.opacity=Math.min(1,Math.max(.55,.4+.6*q));m.scale.setScalar(.94+.06*q)})}}
if(waterFx){waterFx[0].map.offset.set(t*.011,t*.007);waterFx[1].map.offset.set(-t*.008,t*.012)}
emberTick(t);
for(let i=FX.length-1;i>=0;i--){const x=FX[i],e=(performance.now()-x.t0)/1000;if(e>2){scene.remove(x.p);x.p.material.dispose();FX.splice(i,1)}else{x.p.position.y+=dt*.35;x.p.material.opacity=1-e/2;const z_=.6+e*.3;x.p.scale.set(z_,z_,z_)}}
renderer.render(scene,cam);adaptRes(dt);if(PERF)perfTick(dt)}
loop();
