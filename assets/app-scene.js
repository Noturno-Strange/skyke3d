/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Cenários: mundos, floresta, casa lunar, montanhas, campo distante, espelhamento, sobreposições, contornos e montagem da sala (buildRoom).
 * Os arquivos assets/app-*.js são scripts comuns carregados em ordem pelo index.html e dividem o mesmo escopo global: o que um
 * declara no nível de cima, os seguintes enxergam. Código que roda ao carregar só pode usar o que já veio antes.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
// ---------- cenários de floresta (Tauri, Esmera, Ambar e Nyx): fogueira central + 4 troncos + 3 tocos ----------
const FIRE_LOGS=[45,135,225,315],FIRE_LOG_R=3.3,FIRE_STUMPS=[90,180,270],FIRE_STUMP_R=3.2;
function fireLog(cx,cz,q,R,o){
 const x=cx+Math.sin(q)*R,z=cz+Math.cos(q)*R,L=2.5,g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=q;room.add(g);
 const bark=F('#a85a26'),dk=F('#6a3416');
 cyl(.27,L,bark,0,.27,0,g).rotation.z=PI/2;
 [-1,1].forEach(s=>{cyl(.25,.04,F('#ffd18a'),s*L/2,.27,0,g).rotation.z=PI/2;cyl(.285,.07,dk,s*(L/2-.35),.27,0,g).rotation.z=PI/2;ell(.22,.16,.26,F(o.rock),s*(L/2-.25),.12,.31,g)});
 [-.62,.62].forEach(lx=>seat(x+Math.cos(q)*lx,z-Math.sin(q)*lx,WALK.x,WALK.z,.54,.08,1.4))}
// Toco para sentar: nos vãos entre os troncos (a frente, a 0°, fica livre para a câmera).
function fireStump(cx,cz,q,R,o){
 const x=cx+Math.sin(q)*R,z=cz+Math.cos(q)*R,H=.5,g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rn(q*9)*6;room.add(g);
 cyl(.4,H,F('#8a5a30'),0,H/2,0,g,.33);
 cyl(.32,.03,F('#ffd18a'),0,H+.005,0,g);
 [[.3,.12,.14],[-.26,.2,-.2],[.05,-.34,.3]].forEach(([dx,dz,rr],i)=>ell(.13,.09,.2,F(i?o.rock2:o.rock),dx,.05,dz,g));
 seat(x,z,WALK.x,WALK.z,H,.08,1.4)}
function forestCenter(o){
 const cx=WALK.x,cz=WALK.z;
 cyl(2.1,.008,F('#1b1712'),cx,.046,cz,room);
 {const gm=mesh(new THREE.PlaneGeometry(17,17),new THREE.MeshBasicMaterial({map:glowTex(),transparent:true,depthWrite:false}),cx,.06,cz,room);gm.rotation.x=-PI/2;fireGlow.push(gm)}
 campfire(cx,cz);
 FIRE_LOGS.forEach(a=>fireLog(cx,cz,a*PI/180,FIRE_LOG_R,o));
 FIRE_STUMPS.forEach(a=>fireStump(cx,cz,a*PI/180,FIRE_STUMP_R,o))}
function forestTree(x,z,s,i,o){
 const g=new THREE.Group();g.position.set(x,0,z);g.scale.set(s,s,s);g.rotation.y=rn(i+5)*6;g.userData.ol=1;room.add(g);
 const k=o.kinds[i%o.kinds.length],c=o.tree,tr=F(o.trunk),col=j=>F(c[(i+j)%c.length]);
 if(k==='round'){cyl(.24,2.1,tr,0,1.05,0,g,.17);[[0,2.7,0,1.2,1],[.7,2.3,-.2,.85,.72],[-.1,3.4,0,.75,.62]].forEach(([dx,dy,dz,rx,ry],j)=>ell(rx,ry,rx,col(j),dx,dy,dz,g))}
 else if(k==='pine'){cyl(.22,1.2,tr,0,.6,0,g);[[1.6,1.9],[1.25,2.8],[.9,3.6]].forEach(([r,y],j)=>mesh(new THREE.ConeGeometry(r,1.8,7),M(col(j)),0,y,0,g))}
 else if(k==='crystal'){[[0,0,.2,2.1,0,0],[.42,.1,.15,1.5,.35,-.12],[-.38,-.12,.14,1.2,-.3,.25],[.05,-.4,.12,.9,.1,-.4]].forEach(([dx,dz,r,h,tx,tz],j)=>{const cg=new THREE.Group();cg.position.set(dx,0,dz);cg.rotation.set(tx,0,tz);g.add(cg);cyl(r,h,col(j),0,h/2,0,cg,r*.8);mesh(new THREE.ConeGeometry(r*.8,h*.3,6),M(E(o.glow)),0,h*1.15,0,cg)})}
 else if(k==='cactus'){const cc=col(0);cyl(.26,2.3,cc,0,1.15,0,g,.2);ell(.2,.26,.2,cc,0,2.35,0,g);[[-1,1.0,.5],[1,1.35,.6]].forEach(([sd,y,h],j)=>{cyl(.11,.55,col(j+1),sd*.4,y,0,g).rotation.z=PI/2;cyl(.11,h,col(j+1),sd*.66,y+h/2-.05,0,g)});ell(.09,.09,.09,E(o.bloom[i%o.bloom.length]),.1,2.55,0,g)}
 else if(k==='mushroom'){cyl(.2,1.5,F('#efe6d4'),0,.75,0,g,.15);ell(1.05,.55,1.05,col(0),0,1.62,0,g);ell(.7,.12,.7,F('#3a1a30'),0,1.38,0,g);[[.5,.3,2.09],[-.4,-.35,2.1],[.1,-.1,2.17],[-.35,.45,2.09]].forEach(([dx,dz,y])=>ell(.13,.07,.13,F('#fff4e0'),dx,y,dz,g))}
 else{cyl(.2,1.6,tr,0,.8,0,g,.14);[[1.0,2.1],[.78,3.1],[.5,4.1]].forEach(([r,y],j)=>mesh(new THREE.ConeGeometry(r,1.5,7),M(col(j)),0,y,0,g));ell(.1,.1,.1,E(o.glow),0,4.95,0,g)}}
function forestBush(x,z,s,i,o){
 const g=piece(x,z);g.userData.ol=1;[[0,0,0,.62,.42],[.5,.1,.15,.42,.3],[-.45,.05,-.2,.4,.3]].forEach(([dx,dy,dz,rx,ry],j)=>ell(rx*s,ry*s,rx*s,F(o.bush[(i+j)%o.bush.length]),dx*s,ry*s*.8+dy*s,dz*s,g));
 for(let q=0;q<2;q++){const a=q*3.4+i;ell(.06*s,.06*s,.06*s,E(o.bloom[(i+q)%o.bloom.length]),Math.cos(a)*.5*s,.55*s+.05*s*(q%2),Math.sin(a)*.5*s,g)}}
function forestFern(x,z,s,i,o){
 const g=piece(x,z);for(let k=0;k<4;k++){const a=k*1.5708+i,th=.55+.15*(k%2),l=mesh(new THREE.ConeGeometry(.08*s,.95*s,4),M(F(k%2?o.fern:o.bush[0])),Math.cos(a)*.16*s,.4*s,Math.sin(a)*.16*s,g);l.rotation.set(Math.sin(a)*th,0,-Math.cos(a)*th)}}
function forestShroom(x,z,s,o){
 const g=piece(x,z);[[0,0,1],[.3,.12,.62]].forEach(([dx,dz,k])=>{cyl(.05*s*k,.3*s*k,F('#e9e4d6'),dx*s,.15*s*k,dz*s,g);ell(.2*s*k,.11*s*k,.2*s*k,E(o.shroom),dx*s,.32*s*k,dz*s,g)})}
// Manchas de cor no chão (grama, musgo, terra): antes eram discos chatos de 14 lados, com borda dura e mais claros que o chão, e pareciam
// defeitos. Agora cada mancha é só um marcador (para o espelhamento e a simetria funcionarem); depois tudo vira UMA malha de manchas
// com borda esfumada que se misturam ao chão (mergePatches).
const PATCHG=new THREE.PlaneGeometry(2,2).rotateX(-PI/2);
function forestPatch(x,z,r,c){const m=new THREE.Mesh(PATCHG);m.visible=false;m.position.set(x,.03,z);m.scale.set(r,1,r*(.65+rn(x*3+z)*.5));m.rotation.y=rn(x+z*7)*6;m.userData.patch=c;m.userData.nomerge=1;room.add(m)}
// GAVG: cor média do chão do cenário atual (sRGB); as manchas usam a mesma claridade dele e só mudam o tom, senão uma mancha escura parece sombra sem dono
let PATCHT=null,PATCHM=null,GAVG=null;const _gh={},_ph={};
function mergePatches(){room.updateMatrixWorld(true);const L=room.children.filter(o=>o.userData.patch);if(!L.length)return;
 PATCHT=PATCHT||sTex(64,64,g=>{const gr=g.createRadialGradient(32,32,4,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.55,'rgba(255,255,255,.75)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64)});
 PATCHM=PATCHM||LM({map:PATCHT,vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 const P=[],N=[],U=[],C=[],I=[],v=new THREE.Vector3(),cc=new THREE.Color();
 if(GAVG)GAVG.getHSL(_gh);
 L.forEach(o=>{cc.set(o.userData.patch);if(GAVG){cc.getHSL(_ph);cc.setHSL(_ph.h,Math.max(_ph.s,_gh.s),_gh.l*.9)}const n=P.length/3;[[-1,-1,0,0],[1,-1,1,0],[1,1,1,1],[-1,1,0,1]].forEach(([a,b,u,w])=>{v.set(a,0,b).applyMatrix4(o.matrixWorld);P.push(v.x,.03,v.z);N.push(0,1,0);U.push(u,w);C.push(cc.r,cc.g,cc.b,GAVG?.45:.6)});I.push(n,n+2,n+1,n,n+3,n+2);room.remove(o)});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));g.setAttribute('color',new THREE.Float32BufferAttribute(C,4));g.setIndex(I);g.computeBoundingSphere();
 const m=new THREE.Mesh(g,PATCHM);m.userData.nomerge=1;m.userData.own=1;m.renderOrder=-2;room.add(m)}
function forestFlora(o,zones){
 const free=(x,z,r)=>!zones.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+r),
  spot=(j,r0,r1)=>{j+=o.seed||0;const a=rn(j*3.1+1)*2*PI,d=r0+(r1-r0)*Math.pow(rn(j*5.3+2),.85);return[WALK.x+Math.sin(a)*d,WALK.z+Math.cos(a)*d]};
 const K=COARSE?.6:1;let n=0;
 for(let j=0;j<300&&n<Math.round(34*K);j++){const [x,z]=spot(j,12.5,36),s=.85+rn(j+11)*.95;if(!free(x,z,1.6*s))continue;forestTree(x,z,s,n,o);zones.push({x,z,r:1.2*s});n++}
 n=0;for(let j=0;j<200&&n<Math.round(17*K);j++){const [x,z]=spot(j+300,11.6,30),s=.7+rn(j+13)*.7;if(!free(x,z,.9*s))continue;forestBush(x,z,s,n,o);zones.push({x,z,r:.7*s});n++}
 n=0;for(let j=0;j<160&&n<Math.round(14*K);j++){const [x,z]=spot(j+600,11.4,28),s=.8+rn(j+17)*.6;if(!free(x,z,.5*s))continue;forestFern(x,z,s,n,o);zones.push({x,z,r:.4*s});n++}
 n=0;for(let j=0;j<120&&n<Math.round(8*K);j++){const [x,z]=spot(j+900,11.5,25),s=.9+rn(j+19)*.7;if(!free(x,z,.5*s))continue;forestShroom(x,z,s,o);zones.push({x,z,r:.4*s});n++}
 n=0;for(let j=0;j<80&&n<10;j++){const [x,z]=spot(j+1200,11,34),r=1.6+rn(j+23)*2.6;if(!free(x,z,r*.5))continue;forestPatch(x,z,r,o.patch[n%o.patch.length]);n++}
 for(let j=0;j<24;j+=COARSE?2:1){const a=j/24*2*PI+rn(j+31)*.15,d=10.9+rn(j+37)*1.6,x=WALK.x+Math.sin(a)*d,z=WALK.z+Math.cos(a)*d;if(free(x,z,.2))tuft(x,z,o.tuft)}}
// junta as peças de um grupo em uma malha por material (no espaço do próprio grupo): o grupo continua podendo girar
function mergeGroup(g){g.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(g.matrixWorld).invert(),B=new Map(),tm=new THREE.Matrix4(),nm=new THREE.Matrix3(),v=new THREE.Vector3();
 g.traverse(o=>{if(o.isMesh&&!Array.isArray(o.material))(B.get(o.material)||B.set(o.material,[]).get(o.material)).push(o)});
 B.forEach((L,mat)=>{let n=0;const gs=L.map(o=>{const q=o.geometry.index?o.geometry.toNonIndexed():o.geometry;n+=q.attributes.position.count;return q}),pos=new Float32Array(n*3),nor=new Float32Array(n*3),uv=mat.map?new Float32Array(n*2):null;let off=0;
  L.forEach((o,i)=>{const q=gs[i],P=q.attributes.position,N=q.attributes.normal,U=q.attributes.uv;tm.multiplyMatrices(inv,o.matrixWorld);nm.getNormalMatrix(tm);
   for(let j=0;j<P.count;j++){v.fromBufferAttribute(P,j).applyMatrix4(tm);pos.set([v.x,v.y,v.z],(off+j)*3);v.fromBufferAttribute(N,j).applyMatrix3(nm).normalize();nor.set([v.x,v.y,v.z],(off+j)*3);if(uv&&U)uv.set([U.getX(j),U.getY(j)],(off+j)*2)}
   off+=P.count;o.parent.remove(o)});
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));if(uv)geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  const m=new THREE.Mesh(geo,mat);m.userData.nomerge=1;g.add(m)})}
function decorGroup(x,z,ry){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;room.add(g);return g}
// Satélite de solo: corpo dourado com antena, prato e duas asas de painéis solares, tudo virado para a câmera (+z)
let SOLM=null,DISHM=null;
function solarMat(){return SOLM||(SOLM=LM({map:(()=>{const t=sTex(128,64,g=>{g.fillStyle='#10285c';g.fillRect(0,0,128,64);for(let cx=0;cx<8;cx++)for(let cy=0;cy<4;cy++){const x=cx*16,y=cy*16,gr=g.createLinearGradient(x,y,x+16,y+16);gr.addColorStop(0,'#3a68c8');gr.addColorStop(1,'#1c3f8e');g.fillStyle=gr;g.fillRect(x+1,y+1,14,14);g.fillStyle='rgba(190,215,255,.3)';g.fillRect(x+1,y+1,14,1.5)}
 g.strokeStyle='rgba(190,215,255,.4)';g.lineWidth=.7;for(let cx=0;cx<8;cx++){g.beginPath();g.moveTo(cx*16+5.3,0);g.lineTo(cx*16+5.3,64);g.moveTo(cx*16+10.7,0);g.lineTo(cx*16+10.7,64);g.stroke()}
 const sh=g.createLinearGradient(0,0,128,64);sh.addColorStop(.28,'rgba(255,255,255,0)');sh.addColorStop(.46,'rgba(255,255,255,.26)');sh.addColorStop(.6,'rgba(255,255,255,0)');g.fillStyle=sh;g.fillRect(0,0,128,64)});t.anisotropy=4;return t})()}))}
function solarPanel(w,h,tilt,x,y,z,ry,p,s,MTL){const q=new THREE.Group();q.position.set(x*s,y*s,z*s);q.rotation.set(tilt,ry,0,'YXZ');p.add(q);
 box((w+.07)*s,(h+.07)*s,.04*s,MTL,0,0,0,q);mesh(new THREE.PlaneGeometry(w*s,h*s),solarMat(),0,0,.024*s,q);box(w*s,.025*s,.03*s,MTL,0,0,.03*s,q);return q}
function decorSolar(x,z,s,o){nomir.push({x,z,r:3.2*s+.3});
 const g=decorGroup(x,z,0),MTL=F('#d6dbe6'),DK=F('#27324a'),GL=E(o.ring);g.userData.blobBase=1;
 const B=(w,h,d,c,px,py,pz,p)=>box(w*s,h*s,d*s,c,px*s,py*s,pz*s,p),C=(r,h,c,px,py,pz,p)=>cyl(r*s,h*s,c,px*s,py*s,pz*s,p);
 C(.6,.12,DK,0,.06,0,g);C(.2,.1,MTL,0,.17,0,g);C(.07,1.6,MTL,0,.9,0,g);
 const sat=new THREE.Group();sat.position.set(0,1.7*s,0);sat.rotation.x=-.12;g.add(sat);
 ell(.13*s,.13*s,.13*s,MTL,0,0,0,sat);// núcleo pequeno onde os braços se encontram (sem a caixa dourada, que atravessava os painéis)
 C(.014,.5,MTL,0,.38,0,sat);ell(.05*s,.05*s,.05*s,GL,0,.66*s,0,sat);
 DISHM=DISHM||LM({color:'#e8ecf4',side:THREE.DoubleSide});
 const dish=mesh(new THREE.CylinderGeometry(.34*s,.07*s,.16*s,18,1,true),DISHM,0,-.36*s,.3*s,sat);dish.rotation.x=1.15;
 C(.012,.34,MTL,0,-.3,.43,sat).rotation.x=1.15;ell(.04*s,.04*s,.04*s,GL,0,-.24*s,.58*s,sat);
 [-1,1].forEach(sg=>{B(1.95,.035,.035,MTL,sg*1.22,.0,-.02,sat);for(let i=0;i<3;i++)solarPanel(.56,.82,0,sg*(.64+i*.62),0,0,0,sat,s,MTL);B(.05,.08,.05,DK,sg*2.18,0,0,sat)});
 [-1,1].forEach(sg=>{C(.04,.62,MTL,sg*1.6,.31,.9,g);solarPanel(1.0,.7,-.5,sg*1.6,.74,.88,-sg*.28,g,s,MTL)});
 mergeGroup(g);decors.push(g);
}
// peças únicas (fogueira e bancos do centro, estufas, satélites, casa): nunca saem na limpeza de sobreposições; o que encosta nelas sai
function uniqDo(fn){const n0=room.children.length;fn();for(let i=n0;i<room.children.length;i++)room.children[i].userData.uniq=1}
// Estufa em cúpula: uma por cenário, no eixo do mundo (do lado oposto da casa), com a porta virada para a fogueira. Cúpula de vidro com
// nervuras (meridianos e anéis), base de pedra, porta em arco, canteiro em anel com flores do mundo, árvore florida no centro sobre um
// pedestal, caminho de lajotas da porta ao centro e luzinhas penduradas. As cores do vidro, das flores e das folhas vêm do mundo.
function greenhouse(x,z,ry,o){nomir.push({x,z,r:4.8});
 const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;g.userData.noblob=1;room.add(g);
 const R=3.7,FL=o.flora||['#ff5ac8','#ffd54f','#ff7a3a','#a56bff','#4cd9ff','#ff4d4d'],LF=o.leaf||'#2f9e5a',LF2='#1f7a4e',FR=F('#ece6d8'),ST=F('#6b7386'),SO=F('#4b3220'),
  GL=LM({color:o.glass,transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false});
 // base: anel de pedra baixo e piso
 mesh(new THREE.CylinderGeometry(R+.15,R+.25,.32,40,1,true),M(ST),0,.16,0,g);mesh(new THREE.CylinderGeometry(R+.15,R+.15,.04,40),M(F('#8a8f9c')),0,.3,0,g);
 // cúpula de vidro (meia esfera) e nervuras
 const dome=mesh(new THREE.SphereGeometry(R,24,12,0,PI*2,0,PI/2),GL,0,.32,0,g);dome.userData.nomerge=1;
 const rib=new THREE.TorusGeometry(R+.02,.05,5,28,PI);
 for(let i=0;i<6;i++){const m=mesh(rib,M(FR),0,.32,0,g);m.rotation.y=i*PI/6}
 [[.35,R*Math.cos(.35)],[.75,R*Math.cos(.75)],[1.12,R*Math.cos(1.12)]].forEach(([el,rr])=>{const m=mesh(new THREE.TorusGeometry(rr+.02,.045,5,40),M(FR),0,.32+R*Math.sin(el),0,g);m.rotation.x=PI/2});
 ell(.32,.14,.32,FR,0,.32+R,0,g);ell(.16,.16,.16,E(o.ring||'#ffd27a'),0,.5+R,0,g);
 // porta em arco (lado +z, virado para o centro)
 [-1,1].forEach(s_=>box(.14,2.1,.14,FR,s_*.75,1.37,R-.05,g));const arch=mesh(new THREE.TorusGeometry(.75,.07,5,16,PI),M(FR),0,2.42,R-.05,g);
 box(1.6,.06,.7,ST,0,.03,R+.35,g);
 // canteiro em anel e flores
 mesh(new THREE.CylinderGeometry(2.55,2.55,.42,36,1,true),M(ST),0,.53,0,g);mesh(new THREE.CylinderGeometry(1.75,1.75,.42,30,1,true),M(ST),0,.53,0,g);
 const soil=mesh(new THREE.RingGeometry(1.75,2.55,36),M(SO),0,.72,0,g);soil.rotation.x=-PI/2;
 const SY=.72,stG=new THREE.CylinderGeometry(.025,.035,1,6),cnG=new THREE.ConeGeometry(1,1,6);let n=0;
 const plant=(px,pz)=>{const i=n++,col=FL[(i*3+Math.floor(rn(i+5)*FL.length))%FL.length],h=.35+rn(i+3)*.45,k=i%4;
  if(k===0){mesh(stG,M(F(LF)),px,SY+h/2,pz,g).scale.y=h;ell(.14,.09,.14,col,px,SY+h+.04,pz,g);ell(.05,.05,.05,'#ffe45a',px,SY+h+.1,pz,g)}
  else if(k===1){ell(.22,.17,.22,LF,px,SY+.15,pz,g);[0,1,2,3].forEach(q=>ell(.06,.06,.06,col,px+Math.cos(q*1.6+i)*.17,SY+.2+(q%2)*.1,pz+Math.sin(q*1.6+i)*.17,g))}
  else if(k===2){mesh(stG,M(F(LF)),px,SY+h/2,pz,g).scale.y=h;ell(.08,.17,.08,col,px,SY+h+.1,pz,g);ell(.1,.03,.05,LF2,px-.07,SY+h*.4,pz,g)}
  else{[-1,0,1].forEach(q=>mesh(cnG,M(F(q?col:LF)),px+q*.09,SY+h/2,pz+(q?.03:0),g).scale.set(.09,h*(q?1:.8),.09))}};
 for(let i=0;i<16;i++){const a=i/16*PI*2+.2;if(Math.abs(Math.atan2(Math.sin(a-PI/2),Math.cos(a-PI/2)))<.32)continue;plant(Math.cos(a)*2.15,Math.sin(a)*2.15)}// deixa a passagem da porta livre
 // centro: pedestal com árvore florida
 cyl(.55,.5,ST,0,.57,0,g);cyl(.47,.05,SO,0,.83,0,g);cyl(.08,1.25,F('#6b4a2a'),0,1.45,0,g);
 [[0,2.3,0,.62],[-.42,2.05,.12,.4],[.45,2.1,-.08,.38],[.06,2,-.46,.36]].forEach(([dx,dy,dz,r],q)=>ell(r,r*.85,r,q?FL[q%FL.length]:LF,dx,dy,dz,g));
 for(let q=0;q<10;q++){const a=q*.63;ell(.07,.07,.07,FL[q%FL.length],Math.cos(a)*.6,1.95+(q%3)*.22,Math.sin(a)*.6,g)}
 // caminho de lajotas da porta ao centro
 for(let i=0;i<3;i++){const st=mesh(new THREE.CylinderGeometry(.28,.28,.04,7),M(F('#9aa0ad')),(i%2?.08:-.08),.34,R-.6-i*.62,g);st.rotation.y=i}
 // luzinhas penduradas no alto
 for(let i=0;i<5;i++){const a=i/5*PI*2+.6,rr=1.6,y=.32+R*Math.sin(Math.acos(rr/R))-.35;cyl(.012,.35,FR,Math.cos(a)*rr,y+.17,Math.sin(a)*rr,g);ell(.09,.09,.09,E(FL[i%FL.length]),Math.cos(a)*rr,y-.04,Math.sin(a)*rr,g)}}

// chão: a textura repetida (128 px a cada 4,5 m) some com a distância e dá lugar à cor média + uma variação suave em larga escala (sem listras/moiré nem repetição visível)
function groundMat(base){const m=base.clone(),t=m.map;t.anisotropy=8;
 const g=t.image.getContext('2d'),d=g.getImageData(0,0,t.image.width,t.image.height).data;let r=0,gg=0,b=0;const n=d.length/4;for(let i=0;i<d.length;i+=4){r+=d[i];gg+=d[i+1];b+=d[i+2]}
 const avg=new THREE.Color().setRGB(r/n/255,gg/n/255,b/n/255).convertSRGBToLinear();GAVG=avg.clone().convertLinearToSRGB();
 m.onBeforeCompile=sh=>{sh.uniforms.gAvg={value:avg};sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;uniform vec3 gAvg;').replace('#include <map_fragment>','#include <map_fragment>\nfloat gf=smoothstep(8.,34.,distance(vWP,cameraPosition));float gv=1.+.09*(sin(vWP.x*.07+1.3)*sin(vWP.z*.06)+.6*sin(vWP.x*.021-vWP.z*.026+.7));diffuseColor.rgb=mix(diffuseColor.rgb,gAvg,gf*.92)*gv;')};
 m.customProgramCacheKey=()=>'ground';return m}
// sombras de contato: mancha escura e macia sob cada objeto (uma só malha para o cenário todo) e sob cada avatar; ancora tudo no chão mesmo sem sombras reais.
// userData.noblob: sem mancha (a peça já tem base própria); userData.blobBase: a mancha cobre só as partes que tocam o chão (painéis abertos no alto não sombreiam o vão)
let BLOBT=null,BLOBM=null,BLOBA=null,BLOBG=null;
const blobTex=()=>BLOBT||(BLOBT=sTex(64,64,g=>{const gr=g.createRadialGradient(32,32,2,32,32,32);gr.addColorStop(0,'rgba(0,0,0,.9)');gr.addColorStop(.55,'rgba(0,0,0,.45)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,64,64)}));
const blobMat=va=>{const o={map:blobTex(),transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,color:'#000000'};if(va){o.vertexColors=true;return BLOBM||(BLOBM=new THREE.MeshBasicMaterial(o))}o.opacity=.5;return BLOBA||(BLOBA=new THREE.MeshBasicMaterial(o))};
function avBlob(){const m=new THREE.Mesh(BLOBG||(BLOBG=new THREE.PlaneGeometry(1.15,1.15).rotateX(-PI/2)),blobMat(false));m.position.y=.035;m.raycast=()=>{};m.userData.nomerge=1;return m}
// pés de uma peça: vértices rente ao chão (y<.3) agrupados em células vizinhas de .8 m; cada grupo vira uma caixa de 1 m de altura (base, pé de cada poste)
function groundFeet(o,L){const v=new THREE.Vector3(),cells=new Map(),S=.8;
 o.traverse(q=>{if(!q.isMesh||q.material.transparent)return;const p=q.geometry.attributes.position;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(q.matrixWorld);if(v.y>=.3)continue;const k=Math.floor(v.x/S)+','+Math.floor(v.z/S);(cells.get(k)||cells.set(k,new THREE.Box3()).get(k)).expandByPoint(v)}});
 const seen=new Set();for(const k of cells.keys()){if(seen.has(k))continue;const bx=new THREE.Box3(),st=[k];seen.add(k);
  while(st.length){const c=st.pop();bx.union(cells.get(c));const[x,z]=c.split(',').map(Number);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const n=(x+dx)+','+(z+dz);if(cells.has(n)&&!seen.has(n)){seen.add(n);st.push(n)}}}
  bx.max.y=bx.min.y+1;L.push(bx)}}
function contactShadows(){room.updateMatrixWorld(true);const b=new THREE.Box3(),c=new THREE.Vector3(),s=new THREE.Vector3(),P=[],U=[],C=[],I=[];
 for(const o of room.children){if(o.isLight||o.isPoints||o.isSprite||o.userData.own||o.userData.noblob||(o.isMesh&&o.material.transparent))continue;const L=[];
  if(o.userData.blobBase)groundFeet(o,L);else{b.setFromObject(o);if(!b.isEmpty())L.push(b)}
  for(const bx of L){bx.getSize(s);if(s.x>40||s.z>40||s.y<.25||bx.min.y>1.2)continue;bx.getCenter(c);
  const rx=Math.max(.22,s.x*.58),rz=Math.max(.22,s.z*.58),a=Math.min(.5,.18+s.y*.07)*Math.min(1,4/Math.max(s.x,s.z,4)+.25),n=P.length/3;
  [[-1,-1,0,0],[1,-1,1,0],[1,1,1,1],[-1,1,0,1]].forEach(([qx,qz,u,v])=>{P.push(c.x+qx*rx,.052,c.z+qz*rz);U.push(u,v);C.push(0,0,0,a)});I.push(n,n+2,n+1,n,n+3,n+2)}}
 if(!I.length)return;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));g.setAttribute('color',new THREE.Float32BufferAttribute(C,4));g.setIndex(I);g.computeBoundingSphere();
 const m=new THREE.Mesh(g,blobMat(true));m.userData.nomerge=1;m.userData.own=1;m.frustumCulled=false;room.add(m)}
// campo distante: depois da floresta (36 m) o chão ficava liso até as montanhas; rochas, árvores, arbustos, manchas de cor e tufos preenchem o resto até ~55 m (só o lado norte: o espelhamento copia para o sul)
function farField(o,zones){const free=(x,z,r)=>!zones.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+r),K=COARSE?.6:1,
  spot=(j,r0,r1)=>{j+=(o.seed||0)+5000;const a=PI/2+rn(j*3.1+1)*PI,d=r0+(r1-r0)*Math.pow(rn(j*5.3+2),.8);return[WALK.x+Math.sin(a)*d,WALK.z+Math.cos(a)*d]},put=(N,tries,r0,r1,off,fn)=>{let n=0;for(let j=0;j<tries&&n<Math.round(N*K);j++){const[x,z]=spot(j+off,r0,r1),sz=fn(x,z,j,n);if(sz&&free(x,z,sz[0])){sz[1]();zones.push({x,z,r:sz[0]});n++}}};
 put(6,120,26,52,100,(x,z,j)=>{const r=4+rn(j+7)*5;return[r*.5,()=>forestPatch(x,z,r,o.patch[j%o.patch.length])]});
 put(10,300,36,54,200,(x,z,j)=>{const r=.5+rn(j+9)*1.1;return[r,()=>rock(x,z,r,o.rock)]});
 put(4,120,40,55,300,(x,z,j)=>{const r=2+rn(j+11)*2.2;return[r,()=>rock(x,z,r,o.rock2)]});
 put(8,160,38,52,400,(x,z,j,n)=>{const q=1.3+rn(j+13)*1.1;return[1.4*q,()=>{const col=M(F(o.tree[n%o.tree.length])),g=piece(x,z);g.userData.ol=1;mesh(new THREE.CylinderGeometry(.12*q,.16*q,1.3*q,5),M(F(o.trunk)),0,.65*q,0,g);mesh(new THREE.ConeGeometry(.95*q,2*q,6,1),col,0,2.1*q,0,g);mesh(new THREE.ConeGeometry(.7*q,1.5*q,6,1),col,0,3*q,0,g)}]});// tronco e copas no mesmo grupo// árvores distantes: silhueta de poucas faces
 put(5,120,37,50,500,(x,z,j,n)=>{const q=1+rn(j+15)*.8;return[.9*q,()=>{ell(.8*q,.55*q,.8*q,F(o.bush[n%o.bush.length]),x,.4*q,z,room).userData.ol=1}]});
 put(10,200,36,50,600,(x,z)=>[.3,()=>tuft(x,z,o.tuft)])}
function spaceScene(o){
 const zones=[],occupied=[{x:0,z:1.2,r:10.2}];
 const clearRock=(x,z,r)=>{zones.forEach(({x:cx,z:cz,r:cr})=>{const dx=x-cx,dz=z-cz,d=Math.hypot(dx,dz),min=cr+r+.45;if(d<min){x=cx+dx/(d||1)*min;z=cz+dz/(d||1)*min}});return[x,z]};
  {const gs=Math.round(90*GROUND*2/400);/* o disco do chão vai até atrás das montanhas (raio = GROUND), com o mesmo tamanho de ladrilho */mesh(new THREE.CylinderGeometry(GROUND,GROUND,.2,72),groundMat(M(o.gtex.replace(/:90:90$/,':'+gs+':'+gs))),0,-.1,0,room)}descampado(CUR);
 uniqDo(()=>forestCenter(o));
 // Uma estufa por cenário, sempre em uma área livre; candidatos alternativos evitam sobreposição.
 // Uma estufa em cúpula por cenário, no eixo do mundo, do lado oposto da casa (a casa fica ao norte, a estufa ao sul), porta para a fogueira.
 {const GH=4.8,x=2*WALK.x-BUS.x,z=2*WALK.z-BUS.z;uniqDo(()=>greenhouse(x,z,PI,o));occupied.push({x,z,r:GH});zones.push({x,z,r:GH+.8})}
 // Conjuntos de painéis solares e antena/prato; também testam posições livres antes de construir.
 // quatro conjuntos em posições simétricas em torno do centro (cada um tem o seu par girado 180°)
 [[-13.6,10.2,1.2],[13.6,10.2,1.2],[-13.6,-7.8,1.2],[13.6,-7.8,1.2]].forEach(([ax,az,s])=>{const dir=ax<0?-1:1,candidates=[[ax,az],[ax+dir*1.6,az+.7],[ax+dir*.7,az-1.7],[ax-dir*.9,az+1.4],[ax+dir*2.2,az-1.0]],r=3.2*s;for(const [x,z] of candidates){if(occupied.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+r+.35))continue;uniqDo(()=>o.decor(x,z,s,o));occupied.push({x,z,r});zones.push({x,z,r:r+.8});break}});
 descRim(CUR,o,zones);
 zones.push({x:BUS.x,z:BUS.z,r:5.6});
 // Mantém as pedras fora do piso central.
 zones.push({x:0,z:1.2,r:12.2});
 if(!o.nofl)for(let i=0;i<12;i++){const r=.4+rn(i+3)*1.2,[x,z]=clearRock((rn(i)<.5?-1:1)*(11+rn(i+1)*21),-24+rn(i+2)*28,r);rock(x,z,r,o.rock);zones.push({x,z,r:r+.3})}
 if(!o.nofl)for(let i=0;i<8;i++){const r=.8+rn(i+42)*2,[x,z]=clearRock(-32+rn(i+40)*64,-12-rn(i+41)*24,r);rock(x,z,r,o.rock2);zones.push({x,z,r:r+.3})}
 if(!o.nofl)forestFlora(o,zones);farField(o,zones)}
const BUILD={proxima:()=>spaceScene({forest:1,gtex:'tex:sat:90:90',pad:'#3b3326',ring:'#ffd27a',edge:'#f5d58a',flora:['#ff5ac8','#a56bff','#ffd54f','#fff1c0','#ff9ad0'],glass:'#ffe9b0',rock:'#b99a5c',rock2:'#a8884a',decor:decorSolar,
  tree:['#a8a23a','#c4b84a','#8a8a2e','#d9c85a'],trunk:'#5a3a1c',bush:['#8a8a2e','#a8a23a','#c9a24a'],bloom:['#ffd54f','#ff9ad0','#fff1c0'],fern:'#a8b83a',shroom:'#ffb13a',moss:'#8a8a3a',patch:['#a08a4a','#8a7440','#b89a56'],tuft:'#c4b84a',kinds:['round','pine','round','spire'],glow:'#ffe9a8',seed:1300}),
 kepler:()=>spaceScene({forest:1,gtex:'tex:jup:90:90',pad:'#3a2a24',ring:'#ff7a3a',edge:'#ff9a4a',flora:['#ff4d4d','#ffb13a','#fff0d0','#ff5ac8','#ff7a3a'],glass:'#ffb890',rock:'#8a4528',rock2:'#d9a878',decor:decorSolar,
  tree:['#c4622a','#d9803a','#a84a22','#e8a050'],trunk:'#4a2a1a',bush:['#a84a22','#c4622a','#d9803a'],bloom:['#ffb13a','#ff4d4d','#fff0d0'],fern:'#d9803a',shroom:'#ff7a3a',moss:'#a84a22',patch:['#8a4a2a','#a86038','#6e3a22'],tuft:'#d9803a',kinds:['round','spire','pine','round'],glow:'#ffb890',seed:2700}),
 gliese:()=>spaceScene({forest:1,gtex:'tex:moon:90:90',pad:'#2a3342',ring:'#00e5ff',edge:'#7fe9ff',flora:['#4cd9ff','#a56bff','#ff5ac8','#7dff9a','#ffffff'],glass:'#9fd0ff',rock:'#7d7f8b',rock2:'#6c6e7a',decor:decorSolar,
  tree:['#bfe6ff','#9ccaf0','#e8f6ff','#7aaed8'],trunk:'#4a5a6a',bush:['#7aaed8','#9ccaf0','#a8c8e8'],bloom:['#e8f6ff','#4cd9ff','#ffffff'],fern:'#9ccaf0',shroom:'#7affff',moss:'#7a9ab8',patch:['#8aa0b8','#9ab0c8','#6a8098'],tuft:'#bfe6ff',kinds:['crystal','pine','crystal','spire'],glow:'#bff0ff',seed:3100}),
 osiris:()=>spaceScene({forest:1,gtex:'tex:rust:90:90',pad:'#3d2620',ring:'#ff8a3a',edge:'#ffa24a',flora:['#ffd54f','#ff4d9a','#ff8a3a','#c06bff','#4cd9ff'],glass:'#ffcf9f',rock:'#8f3a20',rock2:'#7a3018',decor:decorSolar,
  tree:['#4a2c24','#5a3426','#6a3a2a','#3a2420'],trunk:'#2a1a14',bush:['#5a3426','#6a3a2a','#8a4a2a'],bloom:['#ff8a3a','#ffd54f','#ff4d4d'],fern:'#8a4a2a',shroom:'#ff8a3a',moss:'#5a3426',patch:['#4a2c24','#5e3a2c','#3a2018'],tuft:'#8a4a2a',kinds:['spire','round','pine','spire'],glow:'#ff9a4a',seed:4700}),
 tauri:()=>spaceScene({forest:1,gtex:'tex:moss:90:90',pad:'#1b2620',ring:'#7dff9a',edge:'#c4ec7a',flora:['#ff7ac8','#ffd54f','#ff9a4a','#b98cff','#fff1c0'],glass:'#c8ffd0',rock:'#7d7a66',rock2:'#5f6b52',decor:decorSolar,
  tree:['#2f8f3a','#3fae4a','#277a35','#58b84f'],trunk:'#5a3a1c',bush:['#2a7a34','#3a9a44','#6aa83a'],bloom:['#ffd54f','#ff7ac8','#fff1c0'],fern:'#3fb04a',shroom:'#ffb13a',moss:'#4a8a3a',patch:['#3c7a35','#5a9a42','#2c5e2e'],tuft:'#7ac84a',kinds:['round','pine','round'],glow:'#b8ff9a'}),
 esmera:()=>spaceScene({forest:1,gtex:'tex:tealmoss:90:90',pad:'#15262a',ring:'#4cffe0',edge:'#5cf0d6',flora:['#4cd9ff','#c06bff','#ff7ad9','#7dffb0','#ffffff'],glass:'#a8fff0',rock:'#5d7f88',rock2:'#47666e',decor:decorSolar,
  tree:['#1f9a8a','#2fbfa8','#176f78','#3ad0c0'],trunk:'#3f4a52',bush:['#1a8a80','#2aaa96','#3a70a8'],bloom:['#4cffe0','#c06bff','#7ad9ff'],fern:'#2fc9a8',shroom:'#c06bff',moss:'#2f8a78',patch:['#1f6a62','#2f8a78','#17525a'],tuft:'#5ae0c0',kinds:['pine','spire','round','spire'],glow:'#7dfff0',seed:5000}),
 ambar:()=>spaceScene({forest:1,gtex:'tex:ambermoss:90:90',pad:'#2a1c10',ring:'#ffb13a',edge:'#e0a24a',flora:['#ffd54f','#ff7a3a','#ff4d4d','#fff1c0','#ffb13a'],glass:'#ffe0b0',rock:'#8a6a44',rock2:'#6f5236',decor:decorSolar,
  tree:['#d9741f','#e8962e','#b5461f','#f0b13a'],trunk:'#4a2e18',bush:['#a8481f','#c9701f','#8a6a1f'],bloom:['#ffd54f','#ff7a3a','#fff1c0'],fern:'#c9801f',shroom:'#ff5a3a',moss:'#8a6a2a',patch:['#6a4a22','#8a5a28','#4f3418'],tuft:'#d9a03a',kinds:['round','pine','round','round'],glow:'#ffd27a',seed:9000}),
 nyx:()=>spaceScene({forest:1,gtex:'tex:violetmoss:90:90',pad:'#1a1430',ring:'#b98cff',edge:'#c9a8ff',flora:['#b98cff','#ff7ad9','#4cd9ff','#7dffb0','#ffffff'],glass:'#d8c8ff',rock:'#5a5078',rock2:'#463e62',decor:decorSolar,
  tree:['#5a3fb0','#7a52d9','#3f2f8a','#9a6aff'],trunk:'#2c2a3e',bush:['#4a2f9a','#6a44c8','#2f5aa8'],bloom:['#ff7ad9','#4cd9ff','#d8b0ff'],fern:'#7a5ae0',shroom:'#4cffe0',moss:'#4a3a8a',patch:['#2f2660','#44358a','#221c4a'],tuft:'#9a7ae0',kinds:['spire','pine','spire','round'],glow:'#c9a8ff',seed:7000}),
 lumen:()=>spaceScene({forest:1,gtex:'tex:crystal:90:90',pad:'#1c2440',ring:'#8ad0ff',edge:'#a8e0ff',flora:['#7ad0ff','#ff9ad9','#b8a0ff','#7dffd0','#ffffff'],glass:'#cfeaff',rock:'#6a78a0',rock2:'#505c84',decor:decorSolar,
  tree:['#7ad0ff','#a8a0ff','#ff9ad9','#8af0e0'],trunk:'#4a5070',bush:['#4a6ab0','#6a8ad8','#8a70c8'],bloom:['#bff0ff','#ffb8e8','#ffffff'],fern:'#6aa8e0',shroom:'#7affff',moss:'#4a6ab0',patch:['#3a4a88','#4a5c94','#2a3868'],tuft:'#8ac8ff',kinds:['crystal','crystal','spire','round'],glow:'#bff0ff',seed:1100}),
 duna:()=>spaceScene({forest:1,gtex:'tex:dune:90:90',pad:'#3a2a1c',ring:'#ffb13a',edge:'#e0b060',flora:['#ff5a8a','#ffd54f','#ff8a4a','#fff1c0','#ffffff'],glass:'#ffe8c0',rock:'#b8884e',rock2:'#9a6c3a',decor:decorSolar,
  tree:['#3f8a4a','#5aa85a','#2f7a58','#7ac06a'],trunk:'#6a4a2a',bush:['#a8683a','#c98a4a','#8a8a3a'],bloom:['#ff5a8a','#ffd54f','#ff8a4a'],fern:'#7a9a3a',shroom:'#ff7a3a',moss:'#8a7a3a',patch:['#a8743e','#c98e52','#8a5a30'],tuft:'#c9a85a',kinds:['cactus','cactus','cactus','round'],glow:'#ffd27a',seed:2300}),
 mira:()=>spaceScene({forest:1,gtex:'tex:myco:90:90',pad:'#2a1228',ring:'#ff7ac8',edge:'#e060a8',flora:['#ff7ac8','#7affe0','#ffd54f','#b98cff','#ffffff'],glass:'#ffd0f0',rock:'#7a5a6e',rock2:'#5e4256',decor:decorSolar,
  tree:['#d83a5a','#ff7a3a','#b84aa8','#ffb13a'],trunk:'#5a3a4a',bush:['#8a3a7a','#a84a8a','#5a3a8a'],bloom:['#ff9ad9','#ffd54f','#7affe0'],fern:'#c04a8a',shroom:'#7affe0',moss:'#7a3a6a',patch:['#4a2640','#5e3254','#341a30'],tuft:'#d06aa0',kinds:['mushroom','mushroom','mushroom','round'],glow:'#ff9ad9',seed:3700}),
 sakura:()=>spaceScene({forest:1,gtex:'tex:blossom:90:90',pad:'#2a2028',ring:'#ff9ac4',edge:'#ffc0d8',flora:['#ff9ec4','#ffffff','#ffd54f','#b98cff','#ff7ab0'],glass:'#ffe0ec',rock:'#9a8a8a',rock2:'#7a6a70',decor:decorSolar,
  tree:['#ff9ec4','#ffb7d5','#f080a8','#ffd0e2'],trunk:'#4a2e28',bush:['#d9709a','#f090b4','#7aa860'],bloom:['#ffffff','#ffd0e2','#ffd54f'],fern:'#6aa060',shroom:'#ff9ec4',moss:'#6a8a4a',patch:['#6a8a5a','#7a9a66','#58784a'],tuft:'#a8c878',kinds:['round','round','round','pine'],glow:'#ffd0e2',seed:4100}),
 nivis:()=>spaceScene({forest:1,gtex:'tex:snow:90:90',pad:'#1c2430',ring:'#bfe6ff',edge:'#e0f0ff',flora:['#bfe6ff','#ffffff','#a8c8ff','#ffd0e8','#7dffd0'],glass:'#e0f2ff',rock:'#8a96a8',rock2:'#6c788c',decor:decorSolar,
  tree:['#e8f4ff','#cfe6f5','#9ac0d8','#2f6a5a'],trunk:'#4a3a30',bush:['#9ab8cc','#c8dcea','#4a7a6a'],bloom:['#ffffff','#bfe6ff','#ffd0d0'],fern:'#7aa8a0',shroom:'#ff7a5a',moss:'#8aa8b8',patch:['#c8d8e6','#b0c4d6','#e6eef6'],tuft:'#e0ecf6',kinds:['pine','pine','pine','spire'],glow:'#bfe6ff',seed:6100}),
 cinder:()=>spaceScene({forest:1,gtex:'tex:cinder:90:90',pad:'#1c1210',ring:'#ff6a2a',edge:'#ff8a3a',flora:['#ff7a3a','#ffb13a','#ff4a2a','#ffd54f','#ffffff'],glass:'#ffc09a',rock:'#4a3a38',rock2:'#33282a',decor:decorSolar,
  tree:['#2a1a18','#3a2420','#4a2a20','#1a1010'],trunk:'#1e1210',bush:['#3a1a14','#5a2a1a','#6a3a1a'],bloom:['#ff7a3a','#ffb13a','#ff4a2a'],fern:'#6a2a1a',shroom:'#ff6a2a',moss:'#4a2a20',patch:['#2a1a18','#3a2420','#1a1010'],tuft:'#6a3a2a',kinds:['spire','pine','spire','spire'],glow:'#ff7a3a',seed:8300}),
 trappist:()=>spaceScene({forest:1,gtex:'tex:deepsea:90:90',pad:'#0e2438',ring:'#4ac8f0',edge:'#6ad8ff',flora:['#7affe0','#ff9ad9','#fff0a8','#b8a0ff','#ffffff'],glass:'#bfeaff',rock:'#3a6a88',rock2:'#2c566e',decor:decorSolar,
  tree:['#2fa8d8','#4cc8e8','#2a7ab8','#6ae0e0'],trunk:'#1c4a66',bush:['#1a8aa8','#2aa8c0','#4a6ad8'],bloom:['#7affe0','#ff9ad9','#fff0a8'],fern:'#2ac0b0',shroom:'#ff8ad9',moss:'#1f7a98',patch:['#0f3a56','#1a5a78','#0a2c44'],tuft:'#4ad0d8',kinds:['spire','round','crystal','spire'],glow:'#7affe0',seed:9700}),
 draugr:()=>spaceScene({forest:1,gtex:'tex:shadow:90:90',pad:'#10121c',ring:'#8ab0ff',edge:'#a8c4ff',flora:['#cfe6ff','#9ab8ff','#ffffff','#b8a0ff','#7dffd0'],glass:'#d0dcf0',rock:'#4a5470',rock2:'#363e56',decor:decorSolar,
  tree:['#8a9ab8','#aab8d0','#6a7898','#c8d4e8'],trunk:'#14161e',bush:['#3a4260','#4a5478','#2a3250'],bloom:['#cfe6ff','#9ab8ff','#ffffff'],fern:'#5a6a90',shroom:'#9ab8ff',moss:'#3a4468',patch:['#1c2234','#242c44','#161a2a'],tuft:'#7a8ab0',kinds:['spire','pine','spire','round'],glow:'#cfe6ff',seed:11300})};
// Mundo do modo Sobrevivência: cenário-base do Tauri (fogueira, casa, estufa, montanhas), sem a floresta sorteada. Árvores, pedras e plantas
// vêm do gerador (assets/survmap.js) com a semente da sala, iguais para todos; só usa peças que o cenário já desenha.
const CAMP_O={forest:1,gtex:'tex:moss:90:90',pad:'#1b2620',ring:'#7dff9a',edge:'#c4ec7a',flora:['#ff7ac8','#ffd54f','#ff9a4a','#b98cff','#fff1c0'],glass:'#c8ffd0',rock:'#7d7a66',rock2:'#5f6b52',decor:decorSolar,
  tree:['#2f8f3a','#3fae4a','#277a35','#58b84f'],trunk:'#5a3a1c',bush:['#2a7a34','#3a9a44','#6aa83a'],bloom:['#ffd54f','#ff7ac8','#fff1c0'],fern:'#3fb04a',shroom:'#ffb13a',moss:'#4a8a3a',patch:['#3c7a35','#5a9a42','#2c5e2e'],tuft:'#7ac84a',kinds:['round','pine','round'],glow:'#b8ff9a'};
let SVSEED=0;
function survDecor(o){
 const map=SKYMAP.generate(SVSEED||1);let n=0;
 const log=(x,z,s,rot)=>{const g=piece(x,z);g.rotation.y=rot;cyl(.22*s,1.9*s,F('#8a5a30'),0,.22*s,0,g).rotation.z=PI/2;cyl(.2*s,.05,F('#ffd18a'),.95*s,.22*s,0,g).rotation.z=PI/2};
 const stump=(x,z,s)=>{const g=piece(x,z);cyl(.34*s,.42*s,F('#8a5a30'),0,.21*s,0,g,.28*s);cyl(.27*s,.03,F('#ffd18a'),0,.43*s,0,g)};
 for(const d of map.decor){n++;
  if(d.type==='tree')forestTree(d.x,d.z,d.s*1.1,n,o);
  else if(d.type==='bush')forestBush(d.x,d.z,d.s,n,o);
  else if(d.type==='fern')forestFern(d.x,d.z,d.s,n,o);
  else if(d.type==='shroom')forestShroom(d.x,d.z,d.s,o);
  else if(d.type==='rock')rock(d.x,d.z,.45+d.s*.55,n%2?o.rock:o.rock2);
  else if(d.type==='log')log(d.x,d.z,d.s,d.rot);
  else if(d.type==='stump')stump(d.x,d.z,d.s)}
 // lago: disco de água na zona longe (só visual; a coleta de água é nos pontos da margem)
 {const w=mesh(new THREE.CylinderGeometry(map.lake.r,map.lake.r,.06,32),new THREE.MeshBasicMaterial({color:0x3aa8d8,transparent:true,opacity:.82}),map.lake.x,.04,map.lake.z,room);w.userData.nomerge=1;w.userData.own=1}}
BUILD.acampamento=()=>{spaceScene({...CAMP_O,nofl:1});survDecor(CAMP_O)};
// ---------- Casa lunar de sacos de terra (superadobe): domo ogival de anéis de sacos, porta em arco e clarabóia ----------
function lunarHouse(k){nomir.push({x:BUS.x,z:BUS.z,r:4.2});const R=3.3,H=5.7,L=17,b=R*.05,rAt=y=>R*Math.pow(Math.max(0,1-Math.pow(Math.min(1,y/H),1.7)),.5),pts=[new THREE.Vector2(R,0)];
 for(let i=0;i<L;i++){const y0=H*i/L,dy=H/L;[[.18,.5],[.5,1],[.8,.6]].forEach(([f,q])=>{const y=y0+dy*f;pts.push(new THREE.Vector2(rAt(y)+b*q,y))});const y1=H*(i+1)/L;pts.push(new THREE.Vector2(Math.max(.05,rAt(y1)-b*.35),y1))}
 pts.push(new THREE.Vector2(.001,H));
 const sand=new THREE.Color('#cfc4ae'),wall=new THREE.Color((MPAL[k]||MPAL.proxima)[1]).lerp(sand,.6),g=new THREE.Group();g.position.set(BUS.x,0,BUS.z);room.add(g);
 g.add(new THREE.Mesh(new THREE.LatheGeometry(pts,30),LM({color:'#'+wall.getHexString()})));
 const arch=(w,h,d,mat)=>{const s=new THREE.Shape();s.moveTo(-w/2,0);s.lineTo(-w/2,h-w/2);s.absarc(0,h-w/2,w/2,PI,0,true);s.lineTo(w/2,0);s.closePath();return new THREE.Mesh(new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false}),mat)},
  fr=arch(2.5,2.9,.2,M('#'+wall.clone().lerp(sand,.5).getHexString())),dr=arch(2.0,2.6,.3,M('#0e0c0a')),z0=rAt(1.3)-.1;fr.position.set(0,0,z0);dr.position.set(0,0,z0+.06);g.add(fr,dr);
 const rim=new THREE.Mesh(new THREE.CylinderGeometry(.62,.72,.3,20),M('#'+wall.clone().lerp(sand,.5).getHexString())),gl=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.08,20),M(E('#bfeaff')));rim.position.y=H+.02;gl.position.y=H+.2;g.add(rim,gl)}
const NOMERGE=/[?&]nomerge(=|&|$)/.test(location.search),_mv=new THREE.Vector3(),_nm=new THREE.Matrix3();
// Funde meshes estáticos opacos que dividem o mesmo material, por célula de 24 unidades (mantém o frustum culling).
// objetos sólidos de porte médio (troncos, tocos, árvores, tendas, pedras grandes) projetam sombra; chão, pisos e brilhos não
const _cb=new THREE.Box3(),_cs=new THREE.Vector3();
// Contorno fino nas rochas, árvores e arbustos, no mesmo estilo dos avatares: atrás de cada peça marcada (userData.ol) vai uma cópia um pouco
// maior, escura e só com o lado de dentro visível (casco invertido). A cópia cresce em volta do centro da própria peça, então a borda tem
// ~OLW em qualquer formato (rocha facetada, copa, cone) sem rachar, e a névoa a apaga de longe. Depois mergeStatic junta os cascos por região.
const OLW=.045;let OLM=null;
function addOutlines(){room.updateMatrixWorld(true);const L=[],ws=new THREE.Vector3();
 room.traverse(o=>{if(!o.isMesh||o.userData.olc||!o.geometry||Array.isArray(o.material)||o.material.transparent||o.material.isMeshBasicMaterial)return;
  let f=o,ok=false;while(f&&f!==room){if(f.userData.ol){ok=true;break}f=f.parent}if(ok)L.push(o)});
 OLM=OLM||new THREE.MeshBasicMaterial({color:'#120c08',side:THREE.BackSide});
 for(const o of L){const g=o.geometry;if(!g.boundingSphere)g.computeBoundingSphere();const bs=g.boundingSphere;o.getWorldScale(ws);const sw=Math.max(ws.x,ws.y,ws.z),r=bs.radius*sw;if(r<.12)continue;
  const k=1+OLW/r,q=new THREE.Mesh(g,OLM);q.userData.olc=1;q.position.copy(o.position).add(bs.center.clone().multiply(o.scale).applyQuaternion(o.quaternion).multiplyScalar(1-k));
  q.quaternion.copy(o.quaternion);q.scale.copy(o.scale).multiplyScalar(k);o.parent.add(q)}}
function markCasters(){room.updateMatrixWorld(true);room.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||o.material.transparent||Array.isArray(o.material)||o.material.isMeshBasicMaterial||o.userData.own||flames.includes(o)||o.geometry.type==='PlaneGeometry')return;_cb.setFromObject(o);if(_cb.isEmpty())return;_cb.getSize(_cs);if(_cs.y>=.25&&_cs.y<=9&&Math.max(_cs.x,_cs.z)<=6&&_cb.min.y<.6)o.castShadow=true})}
function mergeStatic(){room.updateMatrixWorld(true);const dyn=new Set(flames),B=new Map(),keep=new Set([SG,SGS,SGL,...Object.values(GC)]);
 room.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||o.userData.nomerge||dyn.has(o)||!o.visible||Array.isArray(o.material)||o.material.transparent||!o.geometry.attributes.position||!o.geometry.attributes.normal)return;const e=o.matrixWorld.elements,far=Math.hypot(e[12],e[14])>38,cs=far?100:24,k=o.material.uuid+'|'+(o.castShadow?1:0)+'|'+(far?'F':'')+Math.floor(e[12]/cs)+','+Math.floor(e[14]/cs);(B.get(k)||B.set(k,[]).get(k)).push(o)});
 B.forEach(L=>{if(L.length<2)return;const mat=L[0].material,hasUv=!!mat.map;let n=0;const gs=L.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry;n+=g.attributes.position.count;return g});
  const pos=new Float32Array(n*3),nor=new Float32Array(n*3),uv=hasUv?new Float32Array(n*2):null;let off=0;
  L.forEach((o,i)=>{const g=gs[i],P=g.attributes.position,N=g.attributes.normal,U=g.attributes.uv,m=o.matrixWorld;_nm.getNormalMatrix(m);
   for(let j=0;j<P.count;j++){_mv.fromBufferAttribute(P,j).applyMatrix4(m);pos[(off+j)*3]=_mv.x;pos[(off+j)*3+1]=_mv.y;pos[(off+j)*3+2]=_mv.z;_mv.fromBufferAttribute(N,j).applyMatrix3(_nm).normalize();nor[(off+j)*3]=_mv.x;nor[(off+j)*3+1]=_mv.y;nor[(off+j)*3+2]=_mv.z;if(uv&&U){uv[(off+j)*2]=U.getX(j);uv[(off+j)*2+1]=U.getY(j)}}off+=P.count});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));if(uv)g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  L.forEach(o=>{o.parent.remove(o);if(!keep.has(o.geometry))o.geometry.dispose()});const mm=new THREE.Mesh(g,mat);mm.castShadow=L[0].castShadow;room.add(mm)})}
// Descampado: clareira de terra irregular, com textura própria e borda natural (pedras e tufos) por bioma.
let CUR='proxima';
const DESC={proxima:['#b89a62','#9a7e4c','#d6bb80','#8a6f3e','pebble'],kepler:['#b8643a','#8a4a2a','#d98a58','#7a3a20','clay'],gliese:['#8d93a3','#6c7285','#d4dcee','#5b6072','frost'],osiris:['#6a3a2a','#4a2619','#8f5238','#2c1612','ash'],tauri:['#6a5a3a','#4f6a34','#8a7548','#3f4f2a','leaf'],acampamento:['#6a5a3a','#4f6a34','#8a7548','#3f4f2a','leaf'],esmera:['#2f4f4a','#1f6a62','#4a7a72','#17383a','glow'],ambar:['#6a4220','#4a2c14','#b8803c','#3a2210','autumn'],nyx:['#2a2048','#1a1233','#4a3a7a','#120b26','spore'],
 lumen:['#6a78a0','#4a5680','#b8d4ff','#38426a','shard'],duna:['#d8a468','#b07e44','#f0cc94','#8e6030','pebble'],mira:['#5a2c4a','#3a1a30','#a85a82','#26101f','pinkglow'],sakura:['#9a7a64','#7a5c48','#e8b4c6','#5e4436','petal'],
 nivis:['#aab6c4','#8793a4','#dfe8f2','#7a8698','frost'],cinder:['#3a2420','#241410','#6a3424','#120806','ash'],trappist:['#1f5a78','#123a54','#5ac0d8','#0c2a40','bluegl'],draugr:['#303850','#1e2438','#6a7aa0','#12162a','ghost']};
const DUST={spore:'#d9a8ff',pinkglow:'#ff9ad9',bluegl:'#7ac8ff',ghost:'#cfe6ff'},LEAFC={leaf:['#8a9a3a','#c9a03a','#a0522d','#5a7a2a'],autumn:['#e07a28','#c9a03a','#b5412a','#8a5a2a'],petal:['#ffb7d5','#ff8ab8','#fff0f5','#d96a9a']};
const RIMT={proxima:'#d8b66f',kepler:'#e0a070',gliese:'#cfe8ff',osiris:'#3a1e18',tauri:'#7ac84a',acampamento:'#7ac84a',esmera:'#5ae0c0',ambar:'#d98a3a',nyx:'#b98cff',lumen:'#9fd8ff',duna:'#d9a85a',mira:'#e05a7a',sakura:'#ff9ec4',nivis:'#e8f4ff',cinder:'#6a2a1a',trappist:'#3aa8c8',draugr:'#8a9ab8'};
const DR=11.2,DPL=27,drr=a=>1+.035*Math.sin(3*a+1.3)+.025*Math.sin(5*a+.4)+.015*Math.sin(9*a+2.1),DCT={};
function descTex(k){if(DCT[k])return DCT[k];const[b,e,s1,s2,kind]=DESC[k],S=512,C=S/2,R=DR*S/DPL;let sd=k.length*17;const r=()=>rn(sd++);
 const t=sTex(S,S,g=>{const path=sc=>{g.beginPath();for(let i=0;i<=96;i++){const a=i/96*6.2832,q=R*drr(a)*sc;g[i?'lineTo':'moveTo'](C+Math.cos(a)*q,C+Math.sin(a)*q)}g.closePath()};
  for(let i=0;i<6;i++){path(1.075-i*.013);g.fillStyle=hx(e,.13);g.fill()}
  path(1);const gr=g.createRadialGradient(C,C,R*.2,C,C,R);gr.addColorStop(0,b);gr.addColorStop(.7,b);gr.addColorStop(1,e);g.fillStyle=gr;g.fill();
  g.save();path(.985);g.clip();
  const P=()=>[C+(r()-.5)*2*R,C+(r()-.5)*2*R];
  for(let i=0;i<1100;i++){const[x,y]=P();g.fillStyle=hx(i%2?s1:s2,.28+r()*.2);g.fillRect(x,y,1+r()*2.2,1+r()*2.2)}
  const walk=(col,al,w,n)=>{for(let i=0;i<n;i++){let[x,y]=P(),a=r()*6.28;g.beginPath();g.moveTo(x,y);for(let j=0;j<7;j++){a+=(r()-.5)*1.2;x+=Math.cos(a)*14;y+=Math.sin(a)*14;g.lineTo(x,y)}g.strokeStyle=hx(col,al);g.lineWidth=w;g.stroke()}};
  if(kind==='pebble')for(let i=0;i<70;i++){const[x,y]=P(),q=1.5+r()*3;g.fillStyle=hx(s2,.55);g.beginPath();g.ellipse(x,y,q,q*.7,r()*3,0,6.28);g.fill();g.fillStyle=hx(s1,.5);g.beginPath();g.ellipse(x-.6,y-.6,q*.5,q*.35,0,0,6.28);g.fill()}
  else if(kind==='clay')walk(s2,.5,1.3,16);
  else if(kind==='frost'){for(let i=0;i<8;i++){const[x,y]=P(),q=9+r()*16;g.strokeStyle=hx(s2,.4);g.lineWidth=2;g.beginPath();g.arc(x,y,q,0,6.28);g.stroke();g.fillStyle=hx(s1,.14);g.fill()}for(let i=0;i<70;i++){const[x,y]=P();g.fillStyle='rgba(255,255,255,.75)';g.fillRect(x,y,1.5,1.5)}}
  else if(kind==='shard'){for(let i=0;i<70;i++){const[x,y]=P(),q=3+r()*7,a=r()*6.28;g.fillStyle=hx(i%3?s1:'#ffffff',.38+r()*.25);g.beginPath();g.moveTo(x+Math.cos(a)*q,y+Math.sin(a)*q);g.lineTo(x+Math.cos(a+2.4)*q*.55,y+Math.sin(a+2.4)*q*.55);g.lineTo(x+Math.cos(a+4)*q*.55,y+Math.sin(a+4)*q*.55);g.closePath();g.fill()}}
  else if(kind==='ash'){walk('#1a0c08',.6,3,12);walk('#ff7a3a',.55,1.1,12)}
  else if(LEAFC[kind]){const cl=LEAFC[kind];for(let i=0;i<190;i++){const[x,y]=P();g.fillStyle=hx(cl[i%4],.55);g.beginPath();g.ellipse(x,y,3+r()*2.5,1.4+r(),r()*3,0,6.28);g.fill()}}
  else{const gc=DUST[kind]||'#7dfff0';for(let i=0;i<10;i++){const[x,y]=P(),gg=g.createRadialGradient(x,y,0,x,y,24);gg.addColorStop(0,hx(gc,.22));gg.addColorStop(1,hx(gc,0));g.fillStyle=gg;g.fillRect(x-24,y-24,48,48)}for(let i=0;i<120;i++){const[x,y]=P();g.fillStyle=hx(gc,.65);g.beginPath();g.arc(x,y,1+r(),0,6.28);g.fill()}}
  g.restore()});t.anisotropy=4;return DCT[k]=t}
function descampado(k){const m=mesh(new THREE.PlaneGeometry(DPL,DPL),LM({map:descTex(k),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),0,.045,1.2,room);m.rotation.x=-PI/2;m.userData.own=1;m.renderOrder=-1}
function descRim(k,o,zones){const ok=(x,z)=>!zones.some(q=>Math.hypot(x-q.x,z-q.z)<q.r);
 for(let i=0;i<16;i++){const a=(i+rn(i+300)*.8)/16*6.2832,q=DR*drr(a)*(1+(rn(i+330)-.5)*.08),x=Math.cos(a)*q,z=WALK.z+Math.sin(a)*q;if(ok(x,z))rock(x,z,.16+rn(i+360)*.26,i%3?o.rock:o.rock2)}
 for(let i=0;i<54;i++){const a=rn(i+400)*6.2832,q=DR*drr(a)*(.99+rn(i+430)*.1),x=Math.cos(a)*q,z=WALK.z+Math.sin(a)*q;if(ok(x,z))tuft(x,z,RIMT[k])}}
let PT=null,dotT=null;
const PFX={proxima:['#ffe9a8',.13,.12,.4],kepler:['#ffc58e',.11,.04,.6],gliese:['#e6f0ff',.11,-.2,.3],osiris:['#ff9a4a',.13,.55,.8,'dot',1],tauri:['#d8ff7a',.2,.03,1,'leaf'],acampamento:['#d8ff7a',.2,.03,1,'leaf'],esmera:['#8affea',.14,.1,.7,'dot',1],ambar:['#ffb35a',.22,-.1,1,'leaf'],nyx:['#d9a8ff',.16,.12,.8,'dot',1],lumen:['#cfeaff',.12,.14,.5,'dot',1],duna:['#ffd39a',.12,.06,.8],mira:['#ff9ad9',.17,.1,.7,'dot',1],sakura:['#ffc2dc',.22,-.1,1,'petal'],nivis:['#ffffff',.2,-.22,.4,'flake'],cinder:['#a89a94',.15,-.12,.7,'flake2'],trappist:['#9fe4ff',.2,.18,.6,'ring'],draugr:['#cfe6ff',.13,.08,.9,'dot',1]};
const PTX={};
function ptex(kind){if(PTX[kind])return PTX[kind];const L=(g,x1,y1,x2,y2)=>{g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke()};
 return PTX[kind]=sTex(64,64,g=>{g.fillStyle=g.strokeStyle='#fff';g.lineCap='round';
  if(kind==='ring'){g.lineWidth=4;g.beginPath();g.arc(32,32,22,0,6.283);g.stroke();g.globalAlpha=.25;g.fill();g.globalAlpha=.9;g.beginPath();g.arc(24,24,5,0,6.283);g.fill()}
  else if(kind==='flake'){g.lineWidth=4;for(let i=0;i<3;i++){g.save();g.translate(32,32);g.rotate(i*1.047);L(g,-26,0,26,0);L(g,-16,0,-22,-7);L(g,-16,0,-22,7);L(g,16,0,22,-7);L(g,16,0,22,7);g.restore()}}
  else if(kind==='flake2'){const gr=g.createRadialGradient(32,32,0,32,32,18);gr.addColorStop(0,'rgba(255,255,255,.95)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.save();g.translate(32,32);g.rotate(.6);g.scale(1,.55);g.translate(-32,-32);g.fillRect(0,0,64,64);g.restore()}
  else if(kind==='petal'){g.save();g.translate(32,32);g.rotate(-.7);g.beginPath();g.ellipse(0,0,24,12,0,0,6.283);g.fill();g.restore()}
  else if(kind==='leaf'){g.save();g.translate(32,32);g.rotate(.6);g.beginPath();g.moveTo(-26,0);g.quadraticCurveTo(0,-20,26,0);g.quadraticCurveTo(0,20,-26,0);g.fill();g.restore()}
  else{const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64)}})}
function partBuild(k){PT=null;const f=PFX[k],N={low:36,med:90,high:150}[QL];if(!f)return;
 dotT=dotT||sTex(32,32,g=>{const gr=g.createRadialGradient(16,16,0,16,16,16);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,32,32)});
 const pos=new Float32Array(N*3),base=new Float32Array(N*3);for(let i=0;i<N;i++){const a=rn(i*3+1)*6.283,r=Math.sqrt(rn(i*3+2))*13;base[i*3]=Math.cos(a)*r;base[i*3+1]=rn(i*3+3)*4.5+.3;base[i*3+2]=1.2+Math.sin(a)*r}
 pos.set(base);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
 const p=new THREE.Points(g,new THREE.PointsMaterial({map:ptex(f[4]||'dot'),color:f[0],size:f[1],sizeAttenuation:true,transparent:true,opacity:.85,depthWrite:false,blending:f[5]?THREE.AdditiveBlending:THREE.NormalBlending}));p.frustumCulled=false;room.add(p);PT={g,base,N,vy:f[2],sw:f[3],t:0}}
function partTick(dt){if(!PT||rm)return;PT.t+=dt;const{g,base,N,vy,sw,t}=PT,a=g.attributes.position.array;for(let i=0;i<N;i++){const y=base[i*3+1]-.3+vy*t;a[i*3]=base[i*3]+Math.sin(t*.6+i)*.3*sw;a[i*3+1]=((y%4.5)+4.5)%4.5+.3;a[i*3+2]=base[i*3+2]+Math.cos(t*.5+i*1.3)*.3*sw}g.attributes.position.needsUpdate=true}
// Trappist (oceano): duas camadas de cáusticas que correm em sentidos diferentes e dão brilho de água ao chão
function buildWater(){const T=sTex(128,128,g=>{g.lineCap='round';for(let i=0;i<46;i++){const x=rn(i*7+1)*128,y=rn(i*7+2)*128,r=6+rn(i*7+3)*16,s=rn(i*7+4)*6.28;for(const ox of[-128,0,128])for(const oy of[-128,0,128]){g.beginPath();g.arc(x+ox,y+oy,r,s,s+1.6+rn(i*7+5)*1.4);g.strokeStyle=`rgba(255,255,255,${(.35+rn(i*7+6)*.45).toFixed(2)})`;g.lineWidth=1.4+rn(i*7+7)*1.6;g.stroke()}}});T.wrapS=T.wrapT=THREE.RepeatWrapping;
 waterFx=[0,1].map(L=>{const m=T.clone();m.needsUpdate=true;m.repeat.set(L?34:46,L?34:46);const o=mesh(new THREE.PlaneGeometry(190,190),new THREE.MeshBasicMaterial({map:m,color:L?'#a8ecff':'#6fd8ff',transparent:true,opacity:L?.16:.24,blending:THREE.AdditiveBlending,depthWrite:false}),0,.034+L*.006,1.2,room);o.rotation.x=-PI/2;o.rotation.z=L*.9;return o.material})}
// Cordilheiras distantes em duas camadas: dão profundidade ao horizonte (a névoa as esmaece).
// Cada mundo tem o formato e as cores do seu bioma. Todas as peças entram num único objeto (um só desenho
// por quadro), com a cor nos vértices. perfil: [forma, cor do cume (neve/brilho), altura relativa em que o cume começa]
// mesmo formato de montanha (alpina) em todos os mundos; muda só a cor do topo (neve, brilho) e a paleta da rocha (MPAL)
const MPROF={proxima:['alpine',null,0],kepler:['alpine',null,0],gliese:['alpine','#f2f8ff',.62],osiris:['alpine','#ff6a2a',.8,1],tauri:['alpine',null,0],acampamento:['alpine',null,0],esmera:['alpine',null,0],ambar:['alpine',null,0],nyx:['alpine','#d8b8ff',.72],
 lumen:['alpine','#e6f6ff',.62],duna:['alpine',null,0],mira:['alpine',null,0],sakura:['alpine','#fff2f8',.66],nivis:['alpine','#ffffff',.55],cinder:['alpine','#ff7a3a',.78,1],trappist:['alpine',null,0],draugr:['alpine','#aac0ff',.74]};
const MARC=PI;// arco de 180° ao norte; a cópia espelhada (girada 180°) fecha o anel, e o fundo não gira com a câmera
function mountGeo(shape,W,H,i){switch(shape){
 case 'needle':return new THREE.ConeGeometry(W*.55,H*1.15,4+(i%2),3);
 case 'dune':return new THREE.ConeGeometry(W*1.6,H*.5,8,2);
 case 'crystal':return new THREE.ConeGeometry(W*.6,H*1.15,4,3);
 default:return new THREE.ConeGeometry(W,H,5+(i%2),3)}}
// paleta de rocha de cada mundo: [base escura, meio, claro, faixa de vegetação na base (ou null)]
const MPAL={proxima:['#6b4a2a','#a67c45','#e3c98f',null],kepler:['#6a2e1c','#b4552e','#e8a070',null],gliese:['#2a3350','#566590','#a8b8e0',null],osiris:['#2a1410','#5a2a1e','#8a4a30',null],tauri:['#2a4a2a','#4a7a3c','#8ab05a','#2f6b2f'],acampamento:['#2a4a2a','#4a7a3c','#8ab05a','#2f6b2f'],esmera:['#1a4a48','#2f8a80','#7adcc8','#1f7a60'],
 ambar:['#5a2a14','#b86a2a','#e8b060','#a8501e'],nyx:['#2a1a50','#5a3a98','#a888e0',null],lumen:['#2a3c78','#5a78c8','#b8d8ff',null],duna:['#8a5a2a','#c8985a','#f0d090',null],mira:['#5a2048','#a84a82','#e898c8','#7a2a5a'],sakura:['#6a4a52','#b88a90','#f0c8d0','#c86a8a'],
 nivis:['#4a5a78','#8a9cb8','#d8e4f0',null],cinder:['#1c1412','#4a3028','#7a4a38',null],trappist:['#1a4058','#3a7a98','#8ad0e0',null],draugr:['#1a2030','#3a4868','#8098c0',null]};
// MFOOT: pegada de cada montanha no chão; nada do cenário pode ficar dentro dela (pedra ou árvore "enterrada" na encosta)
let MFOOT=[];
function inMountain(x,z,r){for(const m of MFOOT){const dx=x-m.x,dz=z-m.z,c=Math.cos(m.rot),s_=Math.sin(m.rot),lx=dx*c-dz*s_,lz=dx*s_+dz*c;// volta ao eixo da montanha (inversa de rotation.y)
  if(Math.hypot(lx/(m.a*m.k+r),lz/(m.b*m.k+r))<1)return true}return false}
function mountains(k){MFOOT=[];bdG.traverse(c=>{if(c.geometry)c.geometry.dispose()});bdG.clear();const S=SKY[k],h=new THREE.Color(S.h),[shape,capHex,capAt,glowCap]=MPROF[k]||MPROF.proxima,pal=(MPAL[k]||MPAL.proxima).map(x=>x&&new THREE.Color(x)),[dk,md,lt,veg]=pal,shT=new THREE.Color(FILL[k]).multiplyScalar(.35),
  LD=new THREE.Vector3(LDO[0],LDO[1],LDO[2]).normalize(),P=[],Nn=[],C=[],o=new THREE.Object3D(),cc=new THREE.Color(),pv=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()],nv=new THREE.Vector3(),e1=new THREE.Vector3(),e2=new THREE.Vector3(),an=new THREE.Vector3();
 [[GROUND*.39,GROUND*.45,10,.5,6,12,10,18],[GROUND*.48,GROUND*.6,9,.3,10,19,14,27]].forEach(([r0,r1,n,mix,h0,h1,w0,w1],L)=>{const cap=capHex?new THREE.Color(capHex).lerp(h,L?.3:.1):null,atm=L?.28:.08;
  for(let i2=0;i2<n*2;i2++){const mi=i2>=n?1:0,i=i2-mi*n,a=PI+((i+rn(i*7+L*50)*.7)/n-.5)*MARC+mi*PI,d=r0+(r1-r0)*rn(i*3+L*20+1),H=h0+(h1-h0)*rn(i*5+L*30+2),W=w0+(w1-w0)*rn(i*11+L*40+3),g=mountGeo(shape,W,H,i).toNonIndexed();g.computeBoundingBox();const y0=g.boundingBox.min.y,hh=g.boundingBox.max.y-y0;
   o.position.set(Math.sin(a)*d,hh/2-1.5,Math.cos(a)*d);o.rotation.y=rn(i+9)*6+mi*PI;o.scale.set(1.2+rn(i+4)*.6,1,1);o.updateMatrix();
   MFOOT.push({x:o.position.x,z:o.position.z,rot:o.rotation.y,a:W*o.scale.x,b:W,k:Math.max(0,1-1.5/hh)});// pegada da montanha no nível do chão (elipse)
   const p=g.attributes.position.array,q=g.attributes.normal.array;
   for(let v=0;v<p.length;v+=9){
    for(let t=0;t<3;t++)pv[t].set(p[v+t*3],p[v+t*3+1],p[v+t*3+2]).applyMatrix4(o.matrix);
    e1.subVectors(pv[1],pv[0]);e2.subVectors(pv[2],pv[0]);nv.crossVectors(e1,e2).normalize();an.set(q[v]+q[v+3]+q[v+6],q[v+1]+q[v+4]+q[v+7],q[v+2]+q[v+5]+q[v+8]).transformDirection(o.matrix);if(nv.dot(an)<0)nv.negate();
    const lit=Math.max(0,nv.dot(LD));
    for(let t=0;t<3;t++){const x=pv[t].x,y=pv[t].y,z=pv[t].z,r=(p[v+t*3+1]-y0)/hh,rr=Math.min(1,Math.max(0,r));
     cc.copy(dk).lerp(md,sstep(0,.5,rr)).lerp(lt,sstep(.5,1,rr));
     cc.multiplyScalar(1+.07*Math.sin(y*2.3+rn(Math.floor(y*.7)+z*.1)*6)).multiplyScalar(.93+.14*rn(x*1.7+y*2.9+z*.8));// estratos e grão
     if(veg){const f=1-sstep(.18,.34,rr+(rn(x*.9+z*.6)-.5)*.12);if(f>0)cc.lerp(veg,f*.85)}// faixa de vegetação na base
     const glow=glowCap&&cap&&rr>capAt;let f=0;if(cap){f=sstep(capAt-.06,capAt+.06,rr+(rn(x*1.3+y*.4+z)-.5)*.14);if(f>0)cc.lerp(cap,f)}
     if(!glow){cc.multiplyScalar(.5+.62*lit);cc.lerp(shT,(1-lit)*.35*(1-f*.6))}// luz da direção do mundo; sombra com a cor de preenchimento
     cc.multiplyScalar((.72+.28*sstep(0,.22,rr))*.84);// base mais escura (oclusão); o conjunto fica um pouco mais denso para não estourar no claro
     cc.lerp(h,atm);// bruma do horizonte, mais forte na camada distante
     P.push(x,y,z);Nn.push(nv.x,nv.y,nv.z);C.push(cc.r,cc.g,cc.b)}}
   g.dispose()}});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(Nn,3));g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));
 const m=new THREE.Mesh(g,mats.mtn||(mats.mtn=LM({vertexColors:true,flatShading:true})));m.userData.nomerge=1;bdG.add(m)}
// Decoração espelhada: o que está a mais de 12,2 m do centro e ao norte da fogueira é copiado e girado 180° em torno dela; o que estava ao sul é
// descartado e substituído pela cópia. Os dois lados ficam decorados igual (árvores, plantas, pedras) sem aumentar a quantidade total.
// Casa, estufa (com tudo que há dentro dela), satélites e painéis solares são únicos: não são copiados nem descartados.
const MIRROR_R=12.2,Q180=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),PI);
function mirrorDecor(){room.updateMatrixWorld(true);const b=new THREE.Box3(),c=new THREE.Vector3(),s=new THREE.Vector3(),inZone=(x,z)=>nomir.some(q=>Math.hypot(x-q.x,z-q.z)<q.r);
 for(const o of [...room.children]){if(o.isLight||o.isPoints||o.isSprite)continue;b.setFromObject(o);if(b.isEmpty())continue;b.getCenter(c);b.getSize(s);
  if(s.x>60||s.z>60||Math.hypot(c.x-WALK.x,c.z-WALK.z)<=MIRROR_R||inZone(c.x,c.z))continue;
  // norte (e, na faixa do meio, o oeste) é a fonte; sul (e o leste da faixa) é descartado e vira a cópia girada 180°: o cenário fica simétrico por inteiro
  const dz=c.z-WALK.z,dx=c.x-WALK.x;if(dz>1||(dz>=-1&&dx>1)){room.remove(o);continue}
  if(dz<-1||dx<-1){const mx=2*WALK.x-c.x,mz=2*WALK.z-c.z;if(inZone(mx,mz))continue;
   const m=o.clone();m.position.set(2*WALK.x-o.position.x,o.position.y,2*WALK.z-o.position.z);m.quaternion.premultiply(Q180);room.add(m);TWIN.set(o,m);TWIN.set(m,o)}}}
// Tira sobreposições (pedra atravessando árvore, arbusto dentro de pedra...): compara a pegada de cada objeto com a dos maiores e remove o menor
// junto com o seu gêmeo espelhado, para a simetria continuar. Casa, estufa, satélites e o centro (fogueira, bancos) nunca saem: o outro objeto sai.
const TWIN=new WeakMap();
function declutter(){room.updateMatrixWorld(true);const b=new THREE.Box3(),c=new THREE.Vector3(),s=new THREE.Vector3(),L=[],inZone=(x,z)=>nomir.some(q=>Math.hypot(x-q.x,z-q.z)<q.r);
 for(const o of room.children){if(o.isLight||o.isPoints||o.isSprite||o.userData.own||(o.isMesh&&o.material&&o.material.transparent))continue;b.setFromObject(o);if(b.isEmpty())continue;b.getSize(s);
  const w=Math.max(s.x,s.z);if(s.y<.3||w<.5||w>40)continue;b.getCenter(c);
  L.push({o,x:c.x,z:c.z,r:w*.42+.06,v:s.x*s.y*s.z,keep:!!o.userData.uniq})}
 const gone=new Set(),kill=o=>{gone.add(o);const t=TWIN.get(o);if(t)gone.add(t)};
 for(const A of L)if(!A.keep&&inMountain(A.x,A.z,A.r*.5))kill(A.o);
 L.sort((a,b)=>b.v-a.v);
 for(let i=0;i<L.length;i++){const A=L[i];if(gone.has(A.o))continue;
  for(let j=i+1;j<L.length;j++){const B=L[j];if(gone.has(B.o)||Math.hypot(A.x-B.x,A.z-B.z)>=A.r+B.r)continue;
   if(B.keep){if(!A.keep){kill(A.o);break}}else kill(B.o)}}
 gone.forEach(o=>room.remove(o));return gone.size}
function buildRoom(k){disposeTree(room);GC={};room.clear();nomir=[];seats=[];obst=null;fireL=null;flames=[];embF=null;fireGlow=[];if(waterFx)waterFx.forEach(m=>m.map&&m.map.dispose());waterFx=null;decors=[];const T=THEME[k];toonTint(k);buildSky(k);toonTint(k);
 hemi.color.setHex(T.h[0]);hemi.groundColor.setHex(T.h[1]);hemi.intensity=T.h[2]*.8*LGH*BRI;dirL.color.setHex(T.d[0]);dirL.intensity=T.d[1]*.7*LGD*BRI;LDO=LDIR[k]||LDO;dirL.position.set(LDO[0],LDO[1],LDO[2]);fillL.color.set(FILL[k]);fillL.intensity=FILLI*BRI;fillL.position.set(-LDO[0],LDO[1]*.7,-LDO[2]);
 CUR=k;LOWG=true;try{BUILD[k]();if(k==='trappist')buildWater();mountains(k);uniqDo(()=>lunarHouse(k))}finally{LOWG=false}partBuild(k);if(k!=='acampamento')mirrorDecor();declutter();mergePatches();contactShadows();if(SHD)markCasters();addOutlines();if(!NOMERGE)mergeStatic();if(SHD)room.traverse(q=>{if(q.isMesh&&!q.userData.nomerge)q.receiveShadow=true})}
