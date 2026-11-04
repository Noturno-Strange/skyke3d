/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Colônia de cada mundo: estruturas, equipamentos e formações de rocha que dão identidade própria a cada planeta.
 * Script comum, no mesmo escopo global dos outros app-*.js; roda dentro de spaceScene (app-scene.js) e usa as mesmas
 * ferramentas de cena (box, cyl, ell, M, F, E, decorGroup, uniqDo) e as mesmas listas de zonas ocupadas.
 *
 * Regras de composição:
 * - Cada mundo tem um conjunto próprio de "núcleos" (KITS): alguns pontos de atividade com 2 a 4 peças cada, em vez de objetos soltos.
 * - Os núcleos ficam em ângulos e distâncias irregulares, viram para o centro com pequenas variações e nunca no setor da casa.
 * - Peças técnicas ficam como grupos simples (sem mergeGroup) para o mergeStatic juntar tudo por material.
 * - Pedras em afloramentos (grupos com um bloco grande e outros pequenos) e vãos livres entre eles, no lugar do espalhamento uniforme.
 */

const HULL='#dfe3ea',HULL2='#b7c0cf',DARK='#27324a',STEEL='#8f9bb0';

/** Cria o grupo da peça e as formas básicas (já na escala `s`). */
function pieceKit(x,z,ry,s){const g=decorGroup(x,z,ry);g.userData.colony=1;
 return{g,
  B:(w,h,d,c,px,py,pz)=>box(w*s,h*s,d*s,c,px*s,py*s,pz*s,g),
  C:(r,h,c,px,py,pz,r2)=>cyl(r*s,h*s,c,px*s,py*s,pz*s,g,r2&&r2*s),
  S:(rx,ry2,rz,c,px,py,pz)=>ell(rx*s,ry2*s,rz*s,c,px*s,py*s,pz*s,g)}}

// ---------- peças da colônia (cada uma é um grupo pequeno, com 8 a 25 formas) ----------
const COLONY_PROPS={
 /** Módulo habitacional: casco em cápsula, porta, janela acesa e faixa na cor do mundo. */
 habPod(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),H=F(HULL),AC=F(o.edge),DK=F(DARK);
  for(const[px,pz]of[[-1.2,-.7],[1.2,-.7],[-1.2,.7],[1.2,.7]])C(.09,.35,DK,px,.17,pz);
  B(3.2,1.25,1.9,H,0,.97,0);S(1.6,.62,.95,H,0,1.6,0);S(.32,.62,.95,H,-1.58,1.2,0);S(.32,.62,.95,H,1.58,1.2,0);
  B(3.24,.16,1.94,AC,0,.62,0);B(.55,1,.08,DK,-.6,.95,.96);B(1.05,.36,.08,E(o.glass),.75,1.15,.96);
  C(.03,.9,F(STEEL),1.1,2.25,-.2);S(.07,.07,.07,E('#ff6a5a'),1.1,2.72,-.2);B(.9,.05,.5,DK,-.55,2.18,-.1)},
 /** Mastro de comunicação com prato e luz de aviso. */
 commsMast(x,z,ry,s,o){const{g,B,C,S}=pieceKit(x,z,ry,s),ST=F(STEEL),H=F(HULL);
  C(.55,.22,F(DARK),0,.11,0);C(.4,.3,H,0,.35,0);C(.08,5.2,ST,0,2.9,0,.05);
  for(const y of[1.2,2.3,3.4]){B(1.1-.2*y/2,.05,.05,ST,0,y,0);B(.05,.05,1.1-.2*y/2,ST,0,y+.02,0)}
  DISHM=DISHM||LM({color:'#e8ecf4',side:THREE.DoubleSide});
  const dish=mesh(new THREE.CylinderGeometry(.55*s,.08*s,.22*s,16,1,true),DISHM,.42*s,4.1*s,0,g);dish.rotation.z=-1.25;
  C(.02,.45,ST,.2,4.0,0);S(.09,.09,.09,E('#ff6a5a'),0,5.55,0);B(.5,.3,.4,H,.9,.2,.3)},
 /** Pilha de suprimentos: caixas de tamanhos e cores variados e um barril. */
 crates(x,z,ry,s,o){const{B,C}=pieceKit(x,z,ry,s);
  B(.95,.7,.75,F(HULL2),0,.35,0);B(.7,.6,.7,F(o.edge),-.9,.3,.2);B(.65,.55,.65,F(HULL),.05,1.0,.02).rotation.y=.35;B(.8,.5,.6,F(DARK),.95,.25,-.2);
  C(.28,.7,F(o.edge),-.7,.35,-.85);C(.285,.06,F(DARK),-.7,.72,-.85)},
 /** Veículo planetário de seis rodas com painel e luzes. */
 rover(x,z,ry,s,o){const{B,C}=pieceKit(x,z,ry,s),H=F(HULL),DK=F(DARK);
  B(1.9,.42,1.05,H,0,.62,0);B(.8,.42,.85,F(HULL2),.35,1.02,0);B(.58,.22,.78,E(o.glass),.62,1.04,0);B(.9,.04,.7,DK,-.55,.86,0);B(1.92,.1,1.07,F(o.edge),0,.47,0);
  for(const px of[-.7,0,.7])for(const sz of[-1,1]){const w=C(.27,.22,DK,px,.28,sz*.64);w.rotation.x=PI/2}
  C(.025,.7,F(STEEL),-.8,1.2,-.3);B(.14,.14,.14,E('#ffe9a8'),.97,.7,.3);B(.14,.14,.14,E('#ffe9a8'),.97,.7,-.3)},
 /** Plataforma de pouso: disco escuro com anel na cor do mundo, marca em H e luzes nos cantos. */
 landingPad(x,z,ry,s,o){const{B,C}=pieceKit(x,z,ry,s);
  C(2.7,.07,F(o.edge),0,.055,0);C(2.5,.1,F('#363f55'),0,.06,0);
  B(.14,.02,1.2,F(HULL),-.45,.12,0);B(.14,.02,1.2,F(HULL),.45,.12,0);B(1,.02,.14,F(HULL),0,.12,0);
  for(let i=0;i<4;i++){const a=i*PI/2+PI/4;C(.09,.18,F(DARK),Math.cos(a)*2.5,.12,Math.sin(a)*2.5);C(.05,.04,E(o.ring),Math.cos(a)*2.5,.23,Math.sin(a)*2.5)}},
 /** Drone de reconhecimento pousado em uma base: nada flutua sem apoio. */
 drone(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),DK=F(DARK);
  B(1.1,.42,1.1,F(HULL2),0,.21,0);B(1.14,.06,1.14,F(o.edge),0,.44,0);
  S(.34,.13,.34,F(HULL),0,.62,0);S(.1,.07,.1,E(o.glass),0,.58,.3);
  for(const[a,b]of[[-1,-1],[1,-1],[-1,1],[1,1]]){B(.5,.04,.05,DK,a*.28,.64,b*.28).rotation.y=a*b*.78;C(.2,.015,F('#c9d2e4'),a*.5,.7,b*.5)}},
 /** Torre de perfuração: plataforma, torre em A, tubo central e tambor, com listras de aviso. */
 drillRig(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),ST=F(STEEL),DK=F(DARK);
  B(2.3,.22,2.3,DK,0,.11,0);B(2.34,.07,2.34,F(o.edge),0,.2,0);
  for(const[a,b]of[[-1,-1],[1,-1],[-1,1],[1,1]]){const l=C(.05,3.6,ST,a*.7,1.95,b*.7);l.rotation.z=-a*.16;l.rotation.x=b*.16}
  for(const y of[1,2,3])B(1.1-.25*y/3,.05,.05,ST,0,y,.62).scale.y=.8;
  C(.12,3.9,F(HULL),0,2.1,0);B(.7,.34,.7,F(HULL2),0,3.95,0);S(.1,.1,.1,E('#ff6a5a'),0,4.25,0);
  C(.55,1.0,F(HULL),1.5,.7,-.5);C(.56,.12,F(o.edge),1.5,.9,-.5);B(.9,.7,.8,F(HULL2),-1.5,.6,-.6);B(.5,.2,.06,E(o.glass),-1.5,.8,-.2)},
 /** Reservatório de água elevado: tanque, pernas, escada e tubulação. */
 waterTank(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),H=F(HULL),ST=F(STEEL);
  for(const[a,b]of[[-1,-1],[1,-1],[-1,1],[1,1]]){const l=C(.05,1.4,ST,a*.7,.7,b*.7);l.rotation.z=-a*.07;l.rotation.x=b*.07}
  C(.95,1.5,H,0,1.7,0);S(.95,.45,.95,H,0,2.45,0);C(.96,.16,F(o.glass),0,1.7,0);C(.05,.35,ST,0,3.0,0);
  B(.12,2.4,.04,ST,1.0,1.2,0);C(.06,1.2,ST,.55,.5,.2);C(.06,.5,ST,.55,.2,.5).rotation.x=PI/2},
 /** Torre de aquecimento: dois cilindros com faixa incandescente e respiro, para os mundos frios. */
 heater(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),H=F(HULL),DK=F(DARK);
  B(1.5,.2,1.1,DK,0,.1,0);for(const sx of[-.38,.38]){C(.34,2.4,H,sx,1.4,0);C(.345,.22,E('#ffa24d'),sx,1.0,0);C(.345,.22,E('#ffa24d'),sx,2.0,0);C(.2,.3,F(HULL2),sx,2.7,0)}
  B(.12,.12,.9,F(STEEL),0,1.6,0);S(.28,.28,.28,F(HULL2),0,2.95,0);B(.5,.5,.5,F(o.edge),0,.45,.7)},
 /** Estação meteorológica: mastro curto com anemômetro, biruta e caixa de instrumentos. */
 weather(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),ST=F(STEEL);
  C(.3,.12,F(DARK),0,.06,0);C(.04,2.7,ST,0,1.4,0);B(.6,.04,.04,ST,0,2.55,0);for(const sx of[-.3,.3])S(.07,.07,.07,F(o.edge),sx,2.55,0);
  B(.5,.34,.3,F(HULL),.5,.5,.2);B(.4,.04,.3,F(DARK),.5,.7,.2);B(.4,.3,.04,E(o.glass),.5,.5,.37);B(.4,.04,.04,F(o.edge),0,1.9,0)},
 /** Gerador de energia com tanque de combustível e escapes. */
 generator(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),H=F(HULL2);
  B(1.5,.9,.85,H,0,.5,0);B(1.54,.14,.89,F(o.edge),0,.9,0);B(.5,.4,.06,E(o.glass),-.35,.55,.44);
  for(const sx of[.3,.62])C(.08,.55,F(DARK),sx,1.25,-.1);C(.4,1.2,F(HULL),-.1,.4,-1.1).rotation.z=PI/2;S(.06,.06,.06,E('#7dff9a'),.62,.52,.44)},
 /** Posto de pesquisa em cúpula, com faixa de vidro iluminada, porta e antena. */
 labHut(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),H=F(HULL);
  C(1.6,.5,F(HULL2),0,.25,0);C(1.55,.7,H,0,.85,0);C(1.58,.28,E(o.glass),0,.95,0);S(1.55,.85,1.55,H,0,1.25,0);
  B(.55,.9,.1,F(DARK),0,.55,1.56);C(.025,1.3,F(STEEL),.5,2.4,-.3);S(.07,.07,.07,E('#ff6a5a'),.5,3.05,-.3);B(.7,.05,.5,F(o.edge),-.6,2.05,-.4)},
 /** Poste de luz baixo, com lâmpada na cor do mundo. */
 lamp(x,z,ry,s,o){const{C,S}=pieceKit(x,z,ry,s);C(.1,.1,F(DARK),0,.05,0);C(.035,1.5,F(STEEL),0,.8,0);S(.1,.1,.1,E(o.glow||'#ffe9a8'),0,1.6,0)},
 /** Aglomerado de cristais do mundo (natural, não da colônia). */
 crystals(x,z,ry,s,o){const g=decorGroup(x,z,ry),cols=[o.glass,o.ring,o.edge,o.flora[0],o.flora[1]||o.glass];g.userData.ol=1;
  for(let i=0;i<7;i++){const a=i/7*6.28+rn(x+i)*.8,d=i?.45+rn(z+i*3)*.55:0,h=(i?.55+rn(i*5+x)*1.1:2.0)*s,r=(i?.13+rn(i*7+z)*.12:.3)*s,c=new THREE.Mesh(new THREE.ConeGeometry(r,h,5),i%3===0?M(E(cols[i%cols.length])):M(F(cols[i%cols.length])));
   c.position.set(Math.cos(a)*d*s,h/2,Math.sin(a)*d*s);c.rotation.set((rn(i+9)-.5)*.35,rn(i+3)*6,(rn(i+5)-.5)*.35);g.add(c)}}};

// ---------- núcleos de cada mundo ----------
// Cada núcleo é uma lista de peças [nome, dx, dz, giro, escala] no sistema local do núcleo (+z = frente, voltada para o centro).
const NUCLEI={
 hab:[['habPod',0,0,0,1],['crates',3.3,1.0,.4,1],['lamp',-2.4,2.6,0,1]],
 hab2:[['habPod',0,0,0,1],['habPod',3.9,.9,.18,.85],['lamp',1.9,3.1,0,1]],
 motor:[['rover',0,0,.3,1],['crates',-3.1,-.6,0,.9],['generator',2.8,-1.1,.2,1]],
 comms:[['commsMast',0,0,0,1],['generator',2.3,1.2,.5,.9],['weather',-2.3,1.4,0,1]],
 mine:[['drillRig',0,0,0,1],['crates',3.5,1.5,.2,1],['generator',-3.3,1.7,.3,1],['rover',2.7,-3.4,1.1,.9]],
 pad:[['landingPad',0,0,0,1],['drone',3.9,.6,0,1],['crates',-4,1.2,.3,.9]],
 lab:[['labHut',0,0,0,1],['weather',3.2,1.2,0,1],['lamp',-2.7,2.3,0,1]],
 water:[['waterTank',0,0,0,1],['waterTank',2.5,.9,.5,.8],['crates',-2.7,1.7,0,.9]],
 heat:[['heater',0,0,0,1],['heater',2.7,.7,.1,.85],['habPod',-4.7,1.5,.3,.9]],
 crystal:[['crystals',0,0,0,1.25],['crystals',3,1.6,1,.8],['crystals',-2.4,2.4,2,.6]],
 crystalS:[['crystals',0,0,0,.9],['crystals',2.4,1.3,2,.65]]
};
/** Núcleos por mundo (em ordem de prioridade) e o que muda no estilo: escala geral e se há luzes ao longo do caminho. */
const KITS={
 proxima:{n:['hab','comms','water','motor'],s:1},kepler:{n:['mine','motor','comms','pad'],s:1.05},gliese:{n:['heat','lab','comms'],s:1},osiris:{n:['mine','comms','motor','hab'],s:1.05},
 tauri:{n:['lab','hab','pad'],s:.95},esmera:{n:['lab','pad','hab'],s:.95},ambar:{n:['water','motor','hab','comms'],s:1},nyx:{n:['crystal','lab','comms','crystalS'],s:1},
 lumen:{n:['crystal','hab','comms','crystalS'],s:1},duna:{n:['water','motor','comms','hab'],s:1.05},mira:{n:['lab','hab','pad'],s:.95},sakura:{n:['lab','hab','hab2'],s:.95},
 nivis:{n:['heat','hab','motor','lab'],s:1},cinder:{n:['mine','comms','motor','hab'],s:1.05},trappist:{n:['pad','comms','lab','hab'],s:1},draugr:{n:['crystal','comms','motor','lab'],s:1}};
/** Raio de cada peça (para reservar espaço e não encostar em nada). */
const PROP_R={habPod:2.1,commsMast:1.2,crates:1.4,rover:1.5,landingPad:2.8,drone:.9,drillRig:1.9,waterTank:1.2,heater:1.0,weather:.8,generator:1.1,labHut:1.8,lamp:.3,crystals:1.1};
const NUCLEUS_R=6.5;

/** Posições de núcleos: ângulos irregulares em torno da fogueira, fora do setor norte (a casa) e longe um do outro. */
function colonySpots(k,n,zones){const ks=[...k].reduce((t,c)=>t+c.charCodeAt(0),0),out=[],ok=(x,z)=>!zones.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+NUCLEUS_R*.55)&&!out.some(q=>Math.hypot(x-q.x,z-q.z)<NUCLEUS_R*2.1);
 for(let i=0;i<n;i++){let found=null;
  for(let t=0;t<90&&!found;t++){let a,d;
   if(i<2){// os dois primeiros ficam nas laterais da vista padrão (à esquerda e à direita da casa), para a colônia aparecer de cara
    const side=i?1:-1;a=PI+side*(.55+rn(ks*7+i*31+t*5.3)*.7);d=14.5+rn(ks*3+i*17+t*2.1)*9}
   else{a=rn(ks*7+i*31+t*5.3)*2*PI;d=15.5+rn(ks*3+i*17+t*2.1)*15}
   const x=WALK.x+Math.sin(a)*d,z=WALK.z+Math.cos(a)*d,north=Math.abs(Math.atan2(Math.sin(a-PI),Math.cos(a-PI)));
   if(north<.5)continue;if(ok(x,z))found=[x,z]}
  if(found)out.push({x:found[0],z:found[1]})}
 return out}

/** Monta os núcleos do mundo (chamado por spaceScene depois das peças fixas e antes de pedras e plantas). */
function colony(o,zones){const k=CUR,kit=KITS[k]||KITS.proxima,spots=colonySpots(k,kit.n.length,zones);
 spots.forEach((sp,i)=>{const nuc=NUCLEI[kit.n[i]],ry0=Math.atan2(WALK.x-sp.x,WALK.z-sp.z)+(rn(i*9+k.length)-.5)*.6,c=Math.cos(ry0),s_=Math.sin(ry0);
  nuc.forEach(([name,dx,dz,rot,sc],j)=>{const x=sp.x+dx*c+dz*s_,z=sp.z-dx*s_+dz*c,r=(PROP_R[name]||1)*sc*kit.s;
   if(zones.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+r*.6))return;
   uniqDo(()=>COLONY_PROPS[name](x,z,ry0+rot+(rn(i*13+j)-.5)*.2,sc*kit.s,o));zones.push({x,z,r:r+.5})})})}

/** Pedra em formato variado (bloco, laje ou pedra alta), sempre apoiada no chão. */
function rockV(x,z,r,col,v){const m=mesh(new THREE.IcosahedronGeometry(r,0),M(F(col)),x,0,z,room),k=[[1,.7,1],[1.35,.45,1.1],[.8,1.05,.85]][v%3],j=(rn(x*3+z)-.5)*.3;
 m.scale.set(k[0]*(1+j),k[1],k[2]*(1-j));m.position.y=r*k[1]*.42;m.rotation.set((rn(x+1)-.5)*.3,rn(x+z)*6,(rn(z+2)-.5)*.3);m.userData.ol=1}

/** Afloramentos: poucos grupos (um bloco grande e vários pequenos) com vãos livres entre eles; uns bem perto, outros no fundo. */
function outcrops(o,zones){const k=CUR,ks=[...k].reduce((t,c)=>t+c.charCodeAt(0),0),free=(x,z,r)=>!zones.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+r),mine=[];
 const nC=5+(ks%3);
 for(let c=0;c<nC+3;c++){const far=c>=nC;let cx,cz,ok=false;
  for(let t=0;t<60&&!ok;t++){const a=rn(ks*5+c*23+t*4.7)*2*PI,d=far?36+rn(ks+c*3+t)*16:13.5+rn(ks*2+c*7+t*1.3)*17;cx=WALK.x+Math.sin(a)*d;cz=WALK.z+Math.cos(a)*d;
   const north=Math.abs(Math.atan2(Math.sin(a-PI),Math.cos(a-PI)));if(!far&&north<.35)continue;if(free(cx,cz,2.2)&&!mine.some(q=>Math.hypot(cx-q.x,cz-q.z)<(far?9:7)))ok=true}
  if(!ok)continue;mine.push({x:cx,z:cz});
  const big=(far?1.3:.8)+rn(c*5+ks)*(far?1.8:1),n=far?1:2+Math.floor(rn(c*3+ks)*4);
  rockV(cx,cz,big,c%2?o.rock:o.rock2,c);zones.push({x:cx,z:cz,r:big*.95});
  for(let j=0;j<n;j++){const a=rn(c*11+j*7+ks)*6.28,d=big*1.1+.4+rn(j*3+c)*1.6,r=.22+rn(j*13+c+ks)*.5,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;
   if(!free(x,z,r*.8))continue;rockV(x,z,r,j%3?o.rock:o.rock2,j+c);zones.push({x,z,r:r*.8})}}}
