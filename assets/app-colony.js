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
/** Casco das peças com um leve tom da rocha do mundo (14 %), para não ser o mesmo branco em todo planeta. */
const HULLC={};
const tintHull=(base,o,k)=>{const key=base+o.rock+k;return HULLC[key]||(HULLC[key]='#'+new THREE.Color(base).lerp(new THREE.Color(o.rock),k).getHexString())};
const hullOf=o=>tintHull(HULL,o,.14),hull2Of=o=>tintHull(HULL2,o,.2);

/** Cria o grupo da peça e as formas básicas (já na escala `s`). */
function pieceKit(x,z,ry,s){const g=decorGroup(x,z,ry);g.userData.colony=1;
 return{g,
  B:(w,h,d,c,px,py,pz)=>box(w*s,h*s,d*s,c,px*s,py*s,pz*s,g),
  C:(r,h,c,px,py,pz,r2)=>cyl(r*s,h*s,c,px*s,py*s,pz*s,g,r2&&r2*s),
  S:(rx,ry2,rz,c,px,py,pz)=>ell(rx*s,ry2*s,rz*s,c,px*s,py*s,pz*s,g)}}

// ---------- peças da colônia (cada uma é um grupo pequeno, com 8 a 25 formas) ----------
// Porta de construção: o avatar em pé mede 2,5 m (AVATAR_H), do pé ao topo do cabelo. Toda porta tem pelo menos DOOR_H de altura (2,5 m
// mais folga, mesmo na menor escala em que a peça é usada, 0,9) e DOOR_W de largura, e a construção é proporcional a ela.
const AVATAR_H=2.5,DOOR_H=2.95,DOOR_W=1.25;
const COLONY_PROPS={
 /** Módulo habitacional: casco em cápsula, porta, janela acesa e faixa na cor do mundo. A porta tem a altura de um avatar em pé com
  * folga (DOOR_H) e o módulo inteiro acompanha: antes ela batia no joelho de quem chegava perto. */
 habPod(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),H=F(hullOf(o)),AC=F(o.edge),DK=F(DARK);
  for(const[px,pz]of[[-1.3,-.85],[1.3,-.85],[-1.3,.85],[1.3,.85]])C(.1,.35,DK,px,.17,pz);
  B(3.4,3.2,2.2,H,0,1.95,0);S(1.7,.65,1.1,H,0,3.55,0);S(.36,1.5,1.1,H,-1.68,1.95,0);S(.36,1.5,1.1,H,1.68,1.95,0);
  B(3.44,.18,2.24,AC,0,.55,0);B(DOOR_W+.16,DOOR_H+.1,.05,AC,-.75,.45+DOOR_H/2,1.105);B(DOOR_W,DOOR_H,.08,DK,-.75,.45+DOOR_H/2,1.12);B(1.15,.75,.08,E(o.glass),.95,2.35,1.11);
  B(1.5,.2,.7,DK,-.75,.1,1.45);B(1.5,.42,.36,DK,-.75,.21,1.28);// dois degraus até a soleira
  C(.03,.9,F(STEEL),1.2,4.5,-.2);S(.07,.07,.07,E('#ff6a5a'),1.2,4.97,-.2);B(.9,.05,.5,DK,-.55,4.18,-.1);
  // variações por posição: cada módulo é diferente do vizinho (painel no teto, anexo cilíndrico nos fundos ou segunda janela)
  const v=Math.floor(Math.abs(rn(x*1.7+z*2.3))*3);
  if(v===0){const p=B(1.5,.05,.9,DK,-.3,4.24,.1);p.rotation.z=.12}
  else if(v===1){C(.55,1.5,H,-.9,.75,-1.55).rotation.x=0;S(.55,.35,.55,H,-.9,1.5,-1.55);B(.5,.7,.08,F(DARK),-.9,.7,-2.1)}
  else{B(.9,.5,.08,E(o.glass),-.9,2.4,-1.11);B(.06,2.6,.06,AC,1.6,1.9,1.11)}},
 /** Mastro de comunicação com prato e luz de aviso. */
 commsMast(x,z,ry,s,o){const{g,B,C,S}=pieceKit(x,z,ry,s),ST=F(STEEL),H=F(hullOf(o));
  C(.55,.22,F(DARK),0,.11,0);C(.4,.3,H,0,.35,0);C(.08,5.2,ST,0,2.9,0,.05);
  for(const y of[1.2,2.3,3.4]){B(1.1-.2*y/2,.05,.05,ST,0,y,0);B(.05,.05,1.1-.2*y/2,ST,0,y+.02,0)}
  DISHM=DISHM||LM({color:'#e8ecf4',side:THREE.DoubleSide});
  const dish=mesh(new THREE.CylinderGeometry(.55*s,.08*s,.22*s,16,1,true),DISHM,.42*s,4.1*s,0,g);dish.rotation.z=-1.25;
  C(.02,.45,ST,.2,4.0,0);S(.09,.09,.09,E('#ff6a5a'),0,5.55,0);B(.5,.3,.4,H,.9,.2,.3)},
 /** Pilha de suprimentos: caixas de tamanhos e cores variados e um barril. */
 crates(x,z,ry,s,o){const{B,C}=pieceKit(x,z,ry,s);
  B(.95,.7,.75,F(hull2Of(o)),0,.35,0);B(.7,.6,.7,F(o.edge),-.9,.3,.2);B(.65,.55,.65,F(hullOf(o)),.05,1.0,.02).rotation.y=.35;B(.8,.5,.6,F(DARK),.95,.25,-.2);
  C(.28,.7,F(o.edge),-.7,.35,-.85);C(.285,.06,F(DARK),-.7,.72,-.85)},
 /** Veículo planetário de seis rodas com painel e luzes. */
 rover(x,z,ry,s,o){const{B,C}=pieceKit(x,z,ry,s),H=F(hullOf(o)),DK=F(DARK);
  B(1.9,.42,1.05,H,0,.62,0);B(.8,.42,.85,F(hull2Of(o)),.35,1.02,0);B(.58,.22,.78,E(o.glass),.62,1.04,0);B(.9,.04,.7,DK,-.55,.86,0);B(1.92,.1,1.07,F(o.edge),0,.47,0);
  for(const px of[-.7,0,.7])for(const sz of[-1,1]){const w=C(.27,.22,DK,px,.28,sz*.64);w.rotation.x=PI/2}
  C(.025,.7,F(STEEL),-.8,1.2,-.3);B(.14,.14,.14,E('#ffe9a8'),.97,.7,.3);B(.14,.14,.14,E('#ffe9a8'),.97,.7,-.3)},
 /** Plataforma de pouso: disco escuro com anel na cor do mundo, marca em H e luzes nos cantos. */
 landingPad(x,z,ry,s,o){const{B,C}=pieceKit(x,z,ry,s);
  C(2.7,.07,F(o.edge),0,.055,0);C(2.5,.1,F('#363f55'),0,.06,0);
  B(.14,.02,1.2,F(hullOf(o)),-.45,.12,0);B(.14,.02,1.2,F(hullOf(o)),.45,.12,0);B(1,.02,.14,F(hullOf(o)),0,.12,0);
  for(let i=0;i<4;i++){const a=i*PI/2+PI/4;C(.09,.18,F(DARK),Math.cos(a)*2.5,.12,Math.sin(a)*2.5);C(.05,.04,E(o.ring),Math.cos(a)*2.5,.23,Math.sin(a)*2.5)}},
 /** Drone de reconhecimento pousado em uma base: nada flutua sem apoio. */
 drone(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),DK=F(DARK);
  B(1.1,.42,1.1,F(hull2Of(o)),0,.21,0);B(1.14,.06,1.14,F(o.edge),0,.44,0);
  S(.34,.13,.34,F(hullOf(o)),0,.62,0);S(.1,.07,.1,E(o.glass),0,.58,.3);
  for(const[a,b]of[[-1,-1],[1,-1],[-1,1],[1,1]]){B(.5,.04,.05,DK,a*.28,.64,b*.28).rotation.y=a*b*.78;C(.2,.015,F('#c9d2e4'),a*.5,.7,b*.5)}},
 /** Torre de perfuração: plataforma, torre em A, tubo central e tambor, com listras de aviso. */
 drillRig(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),ST=F(STEEL),DK=F(DARK);
  B(2.3,.22,2.3,DK,0,.11,0);B(2.34,.07,2.34,F(o.edge),0,.2,0);
  for(const[a,b]of[[-1,-1],[1,-1],[-1,1],[1,1]]){const l=C(.05,3.6,ST,a*.7,1.95,b*.7);l.rotation.z=-a*.16;l.rotation.x=b*.16}
  for(const y of[1,2,3])B(1.1-.25*y/3,.05,.05,ST,0,y,.62).scale.y=.8;
  C(.12,3.9,F(hullOf(o)),0,2.1,0);B(.7,.34,.7,F(hull2Of(o)),0,3.95,0);S(.1,.1,.1,E('#ff6a5a'),0,4.25,0);
  C(.55,1.0,F(hullOf(o)),1.5,.7,-.5);C(.56,.12,F(o.edge),1.5,.9,-.5);B(.9,.7,.8,F(hull2Of(o)),-1.5,.6,-.6);B(.5,.2,.06,E(o.glass),-1.5,.8,-.2)},
 /** Reservatório de água elevado: tanque, pernas, escada e tubulação. */
 waterTank(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),H=F(hullOf(o)),ST=F(STEEL);
  for(const[a,b]of[[-1,-1],[1,-1],[-1,1],[1,1]]){const l=C(.05,1.4,ST,a*.7,.7,b*.7);l.rotation.z=-a*.07;l.rotation.x=b*.07}
  C(.95,1.5,H,0,1.7,0);S(.95,.45,.95,H,0,2.45,0);C(.96,.16,F(o.glass),0,1.7,0);C(.05,.35,ST,0,3.0,0);
  B(.12,2.4,.04,ST,1.0,1.2,0);C(.06,1.2,ST,.55,.5,.2);C(.06,.5,ST,.55,.2,.5).rotation.x=PI/2},
 /** Torre de aquecimento: dois cilindros com faixa incandescente e respiro, para os mundos frios. */
 heater(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),H=F(hullOf(o)),DK=F(DARK);
  B(1.5,.2,1.1,DK,0,.1,0);for(const sx of[-.38,.38]){C(.34,2.4,H,sx,1.4,0);C(.345,.22,E('#ffa24d'),sx,1.0,0);C(.345,.22,E('#ffa24d'),sx,2.0,0);C(.2,.3,F(hull2Of(o)),sx,2.7,0)}
  B(.12,.12,.9,F(STEEL),0,1.6,0);S(.28,.28,.28,F(hull2Of(o)),0,2.95,0);B(.5,.5,.5,F(o.edge),0,.45,.7)},
 /** Estação meteorológica: mastro curto com anemômetro, biruta e caixa de instrumentos. */
 weather(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),ST=F(STEEL);
  C(.3,.12,F(DARK),0,.06,0);C(.04,2.7,ST,0,1.4,0);B(.6,.04,.04,ST,0,2.55,0);for(const sx of[-.3,.3])S(.07,.07,.07,F(o.edge),sx,2.55,0);
  B(.5,.34,.3,F(hullOf(o)),.5,.5,.2);B(.4,.04,.3,F(DARK),.5,.7,.2);B(.4,.3,.04,E(o.glass),.5,.5,.37);B(.4,.04,.04,F(o.edge),0,1.9,0)},
 /** Gerador de energia com tanque de combustível e escapes. */
 generator(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),H=F(hull2Of(o));
  B(1.5,.9,.85,H,0,.5,0);B(1.54,.14,.89,F(o.edge),0,.9,0);B(.5,.4,.06,E(o.glass),-.35,.55,.44);
  for(const sx of[.3,.62])C(.08,.55,F(DARK),sx,1.25,-.1);C(.4,1.2,F(hullOf(o)),-.1,.4,-1.1).rotation.z=PI/2;S(.06,.06,.06,E('#7dff9a'),.62,.52,.44)},
 /** Posto de pesquisa em cúpula, com faixa de vidro iluminada, porta (da altura de um avatar, DOOR_H) e antena. */
 labHut(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),H=F(hullOf(o));
  C(1.85,.4,F(hull2Of(o)),0,.2,0);C(1.8,2.7,H,0,1.75,0);C(1.83,.35,E(o.glass),0,2.55,0);S(1.8,.95,1.8,H,0,3.1,0);
  B(DOOR_W+.16,DOOR_H,.1,F(o.edge),0,.2+DOOR_H/2-.03,1.78);B(DOOR_W,DOOR_H-.05,.14,F(DARK),0,.2+(DOOR_H-.05)/2,1.8);B(1.5,.2,.6,F(DARK),0,.1,2.1);
  C(.025,1.3,F(STEEL),.5,4.55,-.3);S(.07,.07,.07,E('#ff6a5a'),.5,5.2,-.3);B(.7,.05,.5,F(o.edge),-.6,4.02,-.4)},
 /** Poste de luz baixo, com lâmpada na cor do mundo. */
 lamp(x,z,ry,s,o){const{C,S}=pieceKit(x,z,ry,s);C(.1,.1,F(DARK),0,.05,0);C(.035,1.5,F(STEEL),0,.8,0);S(.1,.1,.1,E(o.glow||'#ffe9a8'),0,1.6,0)},
 /** Bandeira de colonização: mastro com base e pano na cor do mundo (marca onde a colônia reivindicou o terreno). */
 flagPole(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),ST=F(STEEL);
  C(.32,.18,F(DARK),0,.09,0);C(.04,3.4,ST,0,1.8,0);S(.07,.07,.07,F(o.edge),0,3.55,0);
  B(.04,.62,1.05,F(o.ring),0,3.05,.56);B(.045,.14,1.06,F(hullOf(o)),0,3.34,.56);B(.045,.14,1.06,F(DARK),0,2.76,.56)},
 /** Canteiro elevado de cultivo: caixa de casco com solo e mudas nas cores das flores do mundo. */
 planter(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),H=F(hullOf(o));
  B(2.0,.5,.95,H,0,.3,0);B(2.04,.07,.99,F(o.edge),0,.57,0);B(1.9,.08,.85,F(o.moss||'#4a3a2a'),0,.58,0);
  for(const px of[-.7,-.25,.25,.7])for(const sz of[-.2,.22]){const c=o.flora[Math.floor(Math.abs(rn(x*2.1+px*5+sz*3+z))*o.flora.length)]||o.flora[0],h=.28+Math.abs(rn(px*9+sz*4+x))*.3;
   C(.02,h,F(o.fern),px,.62+h/2,sz);S(.1,.07,.1,F(c),px,.64+h,sz)}},
 /** Aerogerador de pás paradas: torre afunilada, cabine e três pás; para mundos de vento. */
 windTurbine(x,z,ry,s,o){const{B,C,S}=pieceKit(x,z,ry,s),H=F(hullOf(o));
  C(.45,.2,F(DARK),0,.1,0);C(.1,4.6,H,0,2.5,0,.2);B(.28,.28,.7,H,0,4.85,.05);S(.15,.15,.15,F(o.edge),0,4.85,.46);
  for(let i=0;i<3;i++){const a=i*2.094+.35,bl=B(.14,1.9,.04,F(hull2Of(o)),Math.sin(a)*1.0,4.85+Math.cos(a)*1.0,.52);bl.rotation.z=-a}},
 /** Baliza de caminho: poste baixo com cabeça luminosa na cor do anel do mundo. */
 beacon(x,z,ry,s,o){const{C,S}=pieceKit(x,z,ry,s);
  C(.14,.1,F(DARK),0,.05,0);C(.04,1.1,F(STEEL),0,.6,0);C(.11,.12,F(o.edge),0,1.2,0);S(.1,.1,.1,E(o.ring),0,1.32,0)},
 /** Marco de pedras empilhadas, na rocha do mundo. */
 cairn(x,z,ry,s,o){const{S}=pieceKit(x,z,ry,s);
  S(.5,.22,.44,F(o.rock),0,.2,0);S(.38,.18,.34,F(o.rock2),.04,.5,.02);S(.26,.15,.24,F(o.rock),-.02,.74,0);S(.14,.1,.13,F(o.rock2),0,.9,0)}};

// ---------- núcleos de cada mundo ----------
// Cada núcleo é uma lista de peças [nome, dx, dz, giro, escala] no sistema local do núcleo (+z = frente, voltada para o centro).
const NUCLEI={
 hab:[['habPod',0,0,0,1],['crates',4.5,1.0,.4,1],['lamp',-3.1,3.1,0,1]],
 hab2:[['habPod',-2.9,0,0,1],['habPod',2.9,.6,.18,.85],['lamp',0,3.8,0,1]],
 motor:[['rover',0,0,.3,1],['crates',-3.1,-.6,0,.9],['generator',2.8,-1.1,.2,1]],
 comms:[['commsMast',0,0,0,1],['generator',2.3,1.2,.5,.9],['weather',-2.3,1.4,0,1]],
 mine:[['drillRig',0,0,0,1],['crates',3.5,1.5,.2,1],['generator',-3.3,1.7,.3,1],['rover',2.7,-3.4,1.1,.9]],
 pad:[['landingPad',0,0,0,1],['drone',3.9,.6,0,1],['crates',-4,1.2,.3,.9]],
 lab:[['labHut',0,0,0,1],['weather',3.7,1.2,0,1],['lamp',-3.1,2.7,0,1]],
 water:[['waterTank',0,0,0,1],['waterTank',2.5,.9,.5,.8],['crates',-2.7,1.7,0,.9]],
 heat:[['heater',0,0,0,1],['heater',2.7,.7,.1,.85],['habPod',-4.9,1.5,.3,.9]],
 garden:[['planter',0,0,0,1],['planter',2.6,.7,.2,.9],['lamp',-2.2,2.3,0,1]],
 wind:[['windTurbine',0,0,0,1],['beacon',2.6,1.9,0,1],['cairn',-2.6,1.5,.6,1]],
 outpost:[['flagPole',0,0,0,1],['beacon',2.6,1.3,0,1],['beacon',-2.6,1.3,0,1],['cairn',1.3,-2.1,.8,1]]
};
/** Núcleos por mundo (em ordem de prioridade) e o que muda no estilo: escala geral e se há luzes ao longo do caminho. */
const KITS={amazora:{n:['lab','hab','pad','garden'],s:.95},
 cerron:{n:['hab','comms','water','outpost','garden'],s:1},
 atlanthia:{n:['lab','pad','hab','garden','motor'],s:.95},
 caatara:{n:['water','mine','comms','hab','wind'],s:1.05},
 panthara:{n:['pad','comms','lab','hab','wind'],s:1,deck:1},
 pamphora:{n:['hab','hab2','garden','heat','wind'],s:.95}};
/** Raio de cada peça (para reservar espaço e não encostar em nada). */
const PROP_R={habPod:2.5,commsMast:1.2,crates:1.4,rover:1.5,landingPad:2.8,drone:.9,drillRig:1.9,waterTank:1.2,heater:1.0,weather:.8,generator:1.1,labHut:2.3,lamp:.3,flagPole:.8,planter:1.4,windTurbine:1.1,beacon:.3,cairn:.6};
const NUCLEUS_R=6.5;

/** Posições de núcleos: ângulos irregulares em torno da fogueira, fora do setor norte (a casa) e longe um do outro. */
function colonySpots(k,n,zones){const ks=[...k].reduce((t,c)=>t+c.charCodeAt(0),0),out=[],ok=(x,z)=>!zones.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+NUCLEUS_R*.55)&&!out.some(q=>Math.hypot(x-q.x,z-q.z)<NUCLEUS_R*2.1);
 for(let i=0;i<n;i++){let found=null;
  for(let t=0;t<90&&!found;t++){let a,d;
   if(i<2){// os dois primeiros ficam nas laterais da vista padrão (à esquerda e à direita da casa), para a colônia aparecer de cara
    const side=i?1:-1;a=PI+side*(.55+rn(ks*7+i*31+t*5.3)*.7);d=13.8+rn(ks*3+i*17+t*2.1)*8}
   else{a=rn(ks*7+i*31+t*5.3)*2*PI;d=15.5+rn(ks*3+i*17+t*2.1)*15}
   const x=WALK.x+Math.sin(a)*d,z=WALK.z+Math.cos(a)*d,north=Math.abs(Math.atan2(Math.sin(a-PI),Math.cos(a-PI)));
   if(north<.5)continue;if(ok(x,z))found=[x,z]}
  if(found)out.push({x:found[0],z:found[1]})}
 return out}

/** Plataforma de aço sobre a água (Panthara, o alagado): um deque redondo com borda iluminada, para nada ficar boiando na água. */
function deck(x,z,R,o){const g=decorGroup(x,z,0);g.userData.colony=1;
 cyl(R,.28,F(DARK),0,-.02,0,g);cyl(R+.12,.08,F(o.edge),0,.12,0,g);cyl(R-.05,.06,F(STEEL),0,.14,0,g);
 for(let i=0;i<10;i++){const a=i/10*6.283;cyl(.07,.16,F(DARK),Math.cos(a)*(R+.05),.2,Math.sin(a)*(R+.05),g);ell(.06,.06,.06,E(o.ring),Math.cos(a)*(R+.05),.32,Math.sin(a)*(R+.05),g)}}

/** Monta os núcleos do mundo (chamado por spaceScene depois das peças fixas e antes de pedras e plantas). */
function colony(o,zones){const k=CUR,kit0=KITS[k]||KITS.amazora,kit={...kit0,s:kit0.s*1.12},spots=colonySpots(k,kit.n.length,zones);
 spots.forEach((sp,i)=>{const nuc=NUCLEI[kit.n[i]],ry0=Math.atan2(WALK.x-sp.x,WALK.z-sp.z)+(rn(i*9+k.length)-.5)*.6,c=Math.cos(ry0),s_=Math.sin(ry0);
  if(kit.deck)uniqDo(()=>deck(sp.x+1.2*c+1.0*s_,sp.z-1.2*s_+1.0*c,NUCLEUS_R*.62,o));// plataforma sob o núcleo (mundo de água)
  nuc.forEach(([name,dx,dz,rot,sc],j)=>{const x=sp.x+dx*c+dz*s_,z=sp.z-dx*s_+dz*c,r=(PROP_R[name]||1)*sc*kit.s;
   if(zones.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+r*.6))return;
   uniqDo(()=>COLONY_PROPS[name](x,z,ry0+rot+(rn(i*13+j)-.5)*.2,sc*kit.s,o));zones.push({x,z,r:r+.5})})})}

/** Pedra em formato variado (bloco, laje ou pedra alta), sempre apoiada no chão. */
function rockV(x,z,r,col,v){const m=mesh(new THREE.IcosahedronGeometry(r,0),M(TOONF?'stone:'+col:F(col)),x,0,z,room),k=[[1,.7,1],[1.35,.45,1.1],[.8,1.05,.85]][v%3],j=(rn(x*3+z)-.5)*.3;
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
