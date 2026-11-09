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
// ---------- cenários (os 6 biomas): fogueira central + 4 troncos + 3 tocos ----------
const FIRE_LOGS=[45,135,225,315],FIRE_LOG_R=3.3,FIRE_STUMPS=[90,180,270],FIRE_STUMP_R=3.2;
function fireLog(cx,cz,q,R,o){
 const x=cx+Math.sin(q)*R,z=cz+Math.cos(q)*R,L=2.5,g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=q;room.add(g);
 const E=!!o.toon,bark=E?'bark:#a85a26':F('#a85a26'),dk=F('#6a3416'),cut=E?'ring:#ffd18a':F('#ffd18a');
 cyl(.27,L,bark,0,.27,0,g).rotation.z=PI/2;
 [-1,1].forEach(s=>{cyl(.25,.04,cut,s*L/2,.27,0,g).rotation.z=PI/2;cyl(.285,.07,dk,s*(L/2-.35),.27,0,g).rotation.z=PI/2;ell(.22,.16,.26,E?M('stone:'+o.rock):F(o.rock),s*(L/2-.25),.12,.31,g)});
 if(E)[-.45,.45].forEach((lx,j)=>ell(.07,.1,.08,M('stone:'+o.rock2),lx,.1,.18,g));
 [-.62,.62].forEach(lx=>seat(x+Math.cos(q)*lx,z-Math.sin(q)*lx,WALK.x,WALK.z,.54,.08,1.4))}
// Toco para sentar: nos vãos entre os troncos (a frente, a 0°, fica livre para a câmera).
function fireStump(cx,cz,q,R,o){
 const x=cx+Math.sin(q)*R,z=cz+Math.cos(q)*R,H=.5,E=!!o.toon,g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rn(q*9)*6;room.add(g);
 cyl(.4,H,E?'bark:#8a5a30':F('#8a5a30'),0,H/2,0,g,.33);
 cyl(.32,.03,E?'ring:#ffd18a':F('#ffd18a'),0,H+.005,0,g);
 if(E)[[.3,0],[.72,2.1],[1.4,4.2]].forEach(([a,s])=>{const r=cyl(.09,.4,E?'bark:#8a5a30':F('#8a5a30'),Math.cos(a)*.32,.06,Math.sin(a)*.32,g,.03);r.rotation.z=Math.cos(a)*.9;r.rotation.x=-Math.sin(a)*.9});
 [[.3,.12,.14],[-.26,.2,-.2],[.05,-.34,.3]].forEach(([dx,dz,rr],i)=>ell(.13,.09,.2,E?M('stone:'+(i?o.rock2:o.rock)):F(i?o.rock2:o.rock),dx,.05,dz,g));
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
 const k=o.kinds[i%o.kinds.length],c=o.tree,tr=F(o.trunk),TN=!!o.toon,col=j=>F(c[(i+j)%c.length]),leaf=j=>TN?M('leaf:'+c[(i+j)%c.length]):M(col(j)),bark=TN?'bark:'+o.trunk:tr;
 if(k==='round'){cyl(.24,2.1,bark,0,1.05,0,g,.17);
  const lb=cyl(.12,.95,bark,-.28,1.95,0,g,.075),rb=cyl(.13,1.15,bark,.3,2.05,0,g,.08);lb.rotation.z=-.58;rb.rotation.z=.48;
  ell(.76,.65,.76,leaf(0),-.92,2.92,0,g);ell(.96,.82,.96,leaf(1),.72,3.2,0,g)}
 else if(k==='pine'){cyl(.22,1.2,bark,0,.6,0,g);[[1.6,1.9],[1.25,2.8],[.9,3.6]].forEach(([r,y],j)=>mesh(new THREE.ConeGeometry(r,1.8,7),leaf(j),0,y,0,g))}
 else if(k==='twisted'){// tronco grosso e torto que se abre em galhos, com copas achatadas (cerrado e caatinga)
  [[.3,1.5,.1,.72,0,-.22,.22],[.15,1.2,.48,1.78,0,-.75,.11],[.14,1.05,-.22,1.8,.08,.62,.1]].forEach(([r,h,dx,dy,dz,tz,r2])=>{const t=cyl(r2,h,bark,dx,dy,dz,g,r);t.rotation.z=tz});
  [[.95,.36,.85,.98,2.28,0],[.78,.3,.7,-.62,2.3,.12],[.55,.26,.5,.2,2.62,-.25]].forEach(([rx,ry,rz,dx,dy,dz],j)=>ell(rx,ry,rz,leaf(j),dx,dy,dz,g));
  if(TN)[[.6,.24,.55,.5,2.4,-.35],[.5,.22,.48,-.35,2.5,.45],[.4,.2,.36,.6,2.55,.4]].forEach(([rx,ry,rz,dx,dy,dz],j)=>ell(rx,ry,rz,leaf(j+1),dx,dy,dz,g))}
 else if(k==='cactus'){const cc=col(0);cyl(.26,2.3,cc,0,1.15,0,g,.2);ell(.2,.26,.2,cc,0,2.35,0,g);[[-1,1.0,.5],[1,1.35,.6]].forEach(([sd,y,h],j)=>{cyl(.11,.55,col(j+1),sd*.4,y,0,g).rotation.z=PI/2;cyl(.11,h,col(j+1),sd*.66,y+h/2-.05,0,g)});ell(.09,.09,.09,E(o.bloom[i%o.bloom.length]),.1,2.55,0,g)}
 else if(k==='mushroom'){cyl(.2,1.5,TN?'bark:#efe6d4':F('#efe6d4'),0,.75,0,g,.15);ell(1.05,.55,1.05,leaf(0),0,1.62,0,g);ell(.7,.12,.7,F('#3a1a30'),0,1.38,0,g);[[.5,.3,2.09],[-.4,-.35,2.1],[.1,-.1,2.17],[-.35,.45,2.09]].forEach(([dx,dz,y])=>ell(.13,.07,.13,F('#fff4e0'),dx,y,dz,g))}
 else{cyl(.2,1.6,bark,0,.8,0,g,.14);[[1.0,2.1],[.78,3.1],[.5,4.1]].forEach(([r,y],j)=>mesh(new THREE.ConeGeometry(r,1.5,7),leaf(j),0,y,0,g));ell(.1,.1,.1,E(o.glow),0,4.95,0,g)}}
function forestBush(x,z,s,i,o){
 const g=piece(x,z);g.userData.ol=1;const TN=!!o.toon;[[0,0,0,.62,.42],[.5,.1,.15,.42,.3],[-.45,.05,-.2,.4,.3]].forEach(([dx,dy,dz,rx,ry],j)=>ell(rx*s,ry*s,rx*s,TN?M('leaf:'+o.bush[(i+j)%o.bush.length]):F(o.bush[(i+j)%o.bush.length]),dx*s,ry*s*.8+dy*s,dz*s,g));
 if(TN)[[.18,.26,-.34,.3,.22],[-.28,.2,.36,.27,.2],[.34,.12,.18,.22,.16]].forEach(([dx,dy,dz,rx,ry],j)=>ell(rx*s,ry*s,rx*s,M('leaf:'+o.bush[(i+j+1)%o.bush.length]),dx*s,ry*s*.8+dy*s,dz*s,g));
 for(let q=0;q<2;q++){const a=q*3.4+i;ell(.06*s,.06*s,.06*s,E(o.bloom[(i+q)%o.bloom.length]),Math.cos(a)*.5*s,.55*s+.05*s*(q%2),Math.sin(a)*.5*s,g)}}
function forestFern(x,z,s,i,o){
 const g=piece(x,z);
 if(o.toon){for(let k=0;k<6;k++){const a=k*1.0472+i,th=.5+.12*(k%2),col=F(k%2?o.fern:o.bush[0]),st=mesh(new THREE.ConeGeometry(.07*s,.55*s,4),M(col),Math.cos(a)*.12*s,.3*s,Math.sin(a)*.12*s,g);st.rotation.set(Math.sin(a)*th,0,-Math.cos(a)*th);const tp=mesh(new THREE.ConeGeometry(.035*s,.45*s,4),M(col),Math.cos(a)*.34*s,.46*s,Math.sin(a)*.34*s,g);tp.rotation.set(Math.sin(a)*(th+.25),0,-Math.cos(a)*(th+.25))}return}
 for(let k=0;k<4;k++){const a=k*1.5708+i,th=.55+.15*(k%2),l=mesh(new THREE.ConeGeometry(.08*s,.95*s,4),M(F(k%2?o.fern:o.bush[0])),Math.cos(a)*.16*s,.4*s,Math.sin(a)*.16*s,g);l.rotation.set(Math.sin(a)*th,0,-Math.cos(a)*th)}}
function forestFlowers(x,z,s,i,o){
 const g=piece(x,z);for(let k=0;k<(o.toon?7:5);k++){const a=k*1.26+i*.7,d=(.08+.1*(k%3))*s,h=(.34+.14*((k+i)%3))*s,px=Math.cos(a)*d,pz=Math.sin(a)*d;
  cyl(.014*s,h,F(o.fern),px,h/2,pz,g);ell(.07*s,.045*s,.07*s,F(o.bloom[(i+k)%o.bloom.length]),px,h+.02*s,pz,g);
  if(o.toon&&k%2===0)ell(.05*s,.02*s,.028*s,F(o.fern),px+Math.cos(a+.9)*.05*s,h*.45,pz+Math.sin(a+.9)*.05*s,g)}}
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
// Densidade da vegetação por bioma: as florestas úmidas têm mais plantas; o cerrado, o pampa e a caatinga ficam mais abertos. Em BUILD, `ts`
// aumenta ou diminui as árvores (árvores gigantes na Amazônia) e `dens` muda a quantidade de cada tipo de planta (poucas árvores e muitas
// flores no pampa, samambaias na mata atlântica, quase nada de cogumelo na caatinga).
const LUSH={amazora:1.8,cerron:1.15,atlanthia:1.7,caatara:.95,panthara:1.3,pamphora:1.35};
function forestFlora(o,zones){
 // Plantas em bosquetes (grupos com vãos livres) em vez de espalhadas por igual; poucas árvores soltas. Cada mundo tem seus bosquetes em lugares próprios.
 const free=(x,z,r)=>!zones.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+r),ks=[...CUR].reduce((t,c)=>t+c.charCodeAt(0),0),G=[];
 for(let c=0;c<18&&G.length<(LUSH[CUR]>1.4?7:6);c++){const a=rn(ks*3+c*19+7)*2*PI,d=15+rn(ks+c*11)*17,x=WALK.x+Math.sin(a)*d,z=WALK.z+Math.cos(a)*d,north=Math.abs(Math.atan2(Math.sin(a-PI),Math.cos(a-PI)));
  if(north<.3)continue;if(G.some(q=>Math.hypot(x-q.x,z-q.z)<11))continue;G.push({x,z,R:4+rn(c*5+ks)*4})}
 const spot=(j,r0,r1,loose)=>{j+=o.seed||0;if(G.length&&rn(j*7.7+3)>(loose||.2)){const g=G[Math.floor(rn(j*2.3+5)*G.length)],a=rn(j*3.1+1)*2*PI,d=g.R*Math.sqrt(rn(j*5.3+2));return[g.x+Math.sin(a)*d,g.z+Math.cos(a)*d]}
  const a=rn(j*3.1+1)*2*PI,d=r0+(r1-r0)*Math.pow(rn(j*5.3+2),.85);return[WALK.x+Math.sin(a)*d,WALK.z+Math.cos(a)*d]},
 okR=(x,z)=>Math.hypot(x-WALK.x,z-WALK.z)>11.4;
 const L=LUSH[CUR]||1.2,D=o.dens||{},Q=(t,k)=>Math.round(t*L*(k in D?D[k]:1)),TS=o.ts||1;let n=0;
 for(let j=0;j<700&&n<Q(28,'tree');j++){const [x,z]=spot(j,13,36),s=(.8+rn(j+11)*1.0)*TS;if(!okR(x,z)||!free(x,z,1.6*s))continue;forestTree(x,z,s,n,o);zones.push({x,z,r:1.2*s});n++}
 n=0;for(let j=0;j<450&&n<Q(10,'bush');j++){const [x,z]=spot(j+300,12,30,.35),s=.7+rn(j+13)*.7;if(!okR(x,z)||!free(x,z,.9*s))continue;forestBush(x,z,s,n,o);zones.push({x,z,r:.7*s});n++}
 n=0;for(let j=0;j<350&&n<Q(9,'fern');j++){const [x,z]=spot(j+600,11.6,28,.4),s=.8+rn(j+17)*.6;if(!okR(x,z)||!free(x,z,.5*s))continue;forestFern(x,z,s,n,o);zones.push({x,z,r:.4*s});n++}
 n=0;for(let j=0;j<250&&n<Q(5,'shroom');j++){const [x,z]=spot(j+900,11.5,25,.4),s=.9+rn(j+19)*.7;if(!okR(x,z)||!free(x,z,.5*s))continue;forestShroom(x,z,s,o);zones.push({x,z,r:.4*s});n++}
 n=0;for(let j=0;j<260&&n<Q(8,'flower');j++){const [x,z]=spot(j+1500,11.8,30,.3),s=.9+rn(j+29)*.6;if(!okR(x,z)||!free(x,z,.5*s))continue;forestFlowers(x,z,s,n,o);zones.push({x,z,r:.4*s});n++}
 n=0;for(let j=0;j<300&&n<Q(16,'tuft');j++){const [x,z]=spot(j+1800,11.6,32,.25);if(!okR(x,z)||!free(x,z,.3))continue;tuft(x,z,o.tuft);zones.push({x,z,r:.2});n++}
 n=0;for(let j=0;j<80&&n<8;j++){const [x,z]=spot(j+1200,11,34,.3),r=1.6+rn(j+23)*2.6;if(!okR(x,z)||!free(x,z,r*.5))continue;forestPatch(x,z,r,o.patch[n%o.patch.length]);n++}
 for(let j=0;j<24;j++){const a=j/24*2*PI+rn(j+31)*.15,d=10.9+rn(j+37)*1.6,x=WALK.x+Math.sin(a)*d,z=WALK.z+Math.cos(a)*d;if(free(x,z,.2))tuft(x,z,o.tuft)}}
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
// Satélite de solo: antena, prato e duas asas de painéis solares, parado e virado para a fogueira (+z local)
let SOLM=null,DISHM=null;
function solarMat(){return SOLM||(SOLM=LM({map:(()=>{const t=sTex(128,64,g=>{g.fillStyle='#10285c';g.fillRect(0,0,128,64);for(let cx=0;cx<8;cx++)for(let cy=0;cy<4;cy++){const x=cx*16,y=cy*16,gr=g.createLinearGradient(x,y,x+16,y+16);gr.addColorStop(0,'#3a68c8');gr.addColorStop(1,'#1c3f8e');g.fillStyle=gr;g.fillRect(x+1,y+1,14,14);g.fillStyle='rgba(190,215,255,.3)';g.fillRect(x+1,y+1,14,1.5)}
 g.strokeStyle='rgba(190,215,255,.4)';g.lineWidth=.7;for(let cx=0;cx<8;cx++){g.beginPath();g.moveTo(cx*16+5.3,0);g.lineTo(cx*16+5.3,64);g.moveTo(cx*16+10.7,0);g.lineTo(cx*16+10.7,64);g.stroke()}
 const sh=g.createLinearGradient(0,0,128,64);sh.addColorStop(.28,'rgba(255,255,255,0)');sh.addColorStop(.46,'rgba(255,255,255,.26)');sh.addColorStop(.6,'rgba(255,255,255,0)');g.fillStyle=sh;g.fillRect(0,0,128,64)});t.anisotropy=4;return t})()}))}
function solarPanel(w,h,tilt,x,y,z,ry,p,s,MTL){const q=new THREE.Group();q.position.set(x*s,y*s,z*s);q.rotation.set(tilt,ry,0,'YXZ');p.add(q);
 box((w+.07)*s,(h+.07)*s,.04*s,MTL,0,0,0,q);mesh(new THREE.PlaneGeometry(w*s,h*s),solarMat(),0,0,.024*s,q);box(w*s,.025*s,.03*s,MTL,0,0,.03*s,q);return q}
function decorSolar(x,z,s,o){
 const g=decorGroup(x,z,Math.atan2(WALK.x-x,WALK.z-z)),MTL=F('#d6dbe6'),DK=F('#27324a'),GL=E(o.ring);g.userData.blobBase=1;
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
 mergeGroup(g);
}
// Par de aerogeradores (a mesma peça da colônia, pás paradas), virados para a fogueira: um grande e outro menor, mais para fora e atrás
// (o par da direita não é espelho do da esquerda).
function windPair(x,z,o){const ry=Math.atan2(WALK.x-x,WALK.z-z),c=Math.cos(ry),sn=Math.sin(ry),out=x<0?-1:1;
 [[0,0,1.35,0],out<0?[-2.7,-1.6,1.0,-.22]:[2.3,-2.4,.88,.3]].forEach(([dx,dz,sc,dr])=>{const n0=room.children.length;
  COLONY_PROPS.windTurbine(x+dx*c+dz*sn,z-dx*sn+dz*c,ry+dr,sc,o);for(let i=n0;i<room.children.length;i++)room.children[i].userData.blobBase=1})}
// peças únicas (fogueira e bancos do centro, horta, satélites, aerogeradores, casa): nunca saem na limpeza de sobreposições; o que encosta nelas sai
function uniqDo(fn){const n0=room.children.length;fn();for(let i=n0;i<room.children.length;i++)room.children[i].userData.uniq=1}
// Horta ao ar livre: uma por cenário (no lugar da antiga estufa, aproveitando o que havia dentro dela: as plantas do canteiro, a árvore
// do pedestal, o caminho de lajotas e as luzinhas). Base de terra batida (também cobre a água do alagado), dois canteiros elevados de
// tábua com hortaliças e algumas flores do mundo, lajotas entre eles, uma árvore frutífera ao fundo e quatro postes baixos com luzinhas.
// Fica ao lado da casa de sacos de terra (na mesma metade do cenário, nunca do lado oposto), com a frente virada para a fogueira.
const GARDEN={x:7,z:-11.8,r:3.9};
function garden(x,z,ry,o){
 const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;g.userData.noblob=1;room.add(g);
 const FL=o.flora||['#ff5ac8','#ffd54f','#ff7a3a','#a56bff','#4cd9ff','#ff4d4d'],LF=o.leaf||'#2f9e5a',LF2='#1f7a4e',ST=o.toon?'stone:#6b7386':F('#6b7386'),SO=F('#4b3220'),WD=o.toon?'bark:#8a5a32':F('#8a5a32'),WD2=o.toon?'bark:#6b4424':F('#6b4424'),
  VG=['#e8402a','#ff8a1e','#ffd23f','#8a3fb0'];// tomate, cenoura, pimentão, berinjela
 // base de terra batida
 box(5.4,.06,5,F('#7a6248'),0,.03,0,g);
 // dois canteiros elevados: moldura de tábuas e terra
 const BZ=.35,SY=.4;
 for(const bx of[-1.05,1.05]){box(1.5,.36,.1,WD,bx,.18,BZ+1.35,g);box(1.5,.36,.1,WD,bx,.18,BZ-1.35,g);box(.1,.36,2.8,WD,bx-.7,.18,BZ,g);box(.1,.36,2.8,WD,bx+.7,.18,BZ,g);box(1.3,.06,2.6,SO,bx,SY-.03,BZ,g)}
 // hortaliças (e uma flor do mundo a cada cinco): as mesmas formas de planta do canteiro da estufa
 const stG=new THREE.CylinderGeometry(.025,.035,1,6),cnG=new THREE.ConeGeometry(1,1,6);let n=0;
 const plant=(px,pz)=>{const i=n++,col=i%5===4?FL[(i*3+Math.floor(rn(i+5)*FL.length))%FL.length]:VG[(i+Math.floor(rn(i+7)*VG.length))%VG.length],h=.3+rn(i+3)*.35,k=i%4;
  if(k===0){mesh(stG,M(F(LF)),px,SY+h/2,pz,g).scale.y=h;ell(.14,.09,.14,col,px,SY+h+.04,pz,g);ell(.05,.05,.05,'#ffe45a',px,SY+h+.1,pz,g)}
  else if(k===1){ell(.22,.17,.22,LF,px,SY+.15,pz,g);[0,1,2,3].forEach(q=>ell(.06,.06,.06,col,px+Math.cos(q*1.6+i)*.17,SY+.2+(q%2)*.1,pz+Math.sin(q*1.6+i)*.17,g))}
  else if(k===2){mesh(stG,M(F(LF)),px,SY+h/2,pz,g).scale.y=h;ell(.08,.17,.08,col,px,SY+h+.1,pz,g);ell(.1,.03,.05,LF2,px-.07,SY+h*.4,pz,g)}
  else{[-1,0,1].forEach(q=>mesh(cnG,M(F(q?col:LF)),px+q*.09,SY+h/2,pz+(q?.03:0),g).scale.set(.09,h*(q?1:.8),.09))}};
 for(const bx of[-1.05,1.05])for(let r=0;r<4;r++)for(const cx of[-.3,.3])plant(bx+cx+(rn(n+9)-.5)*.08,BZ-1+r*.66);
 // caminho de lajotas entre os canteiros, da frente até a árvore
 for(let i=0;i<4;i++){const st=mesh(new THREE.CylinderGeometry(.24,.24,.04,7),M(o.toon?'stone:#9aa0ad':F('#9aa0ad')),(i%2?.06:-.06),.08,2.1-i*.95,g);st.rotation.y=i}
 // árvore frutífera ao fundo, no pedestal de pedra (a mesma da estufa, com frutas em vez de flores)
 const TZ=-1.8;cyl(.45,.3,ST,0,.15,TZ,g);cyl(.38,.04,SO,0,.31,TZ,g);cyl(.08,1.25,o.toon?'bark:#6b4a2a':F('#6b4a2a'),0,.93,TZ,g);
 [[0,1.78,0,.62],[-.42,1.53,.12,.4],[.45,1.58,-.08,.38],[.06,1.48,-.46,.36]].forEach(([dx,dy,dz,r],q)=>ell(r,r*.85,r,o.toon?M('leaf:'+(q?LF2:LF)):F(q?LF2:LF),dx,dy,TZ+dz,g));
 for(let q=0;q<10;q++){const a=q*.63;ell(.07,.07,.07,VG[q%VG.length],Math.cos(a)*.6,1.43+(q%3)*.22,TZ+Math.sin(a)*.6,g)}
 // luzinhas: quatro postes baixos de madeira, cada um com uma lâmpada na cor das flores do mundo
 [[-2.5,2.3],[2.5,2.3],[-2.5,-2.3],[2.5,-2.3]].forEach(([px,pz],i)=>{cyl(.04,1.5,WD2,px,.75,pz,g);ell(.09,.09,.09,E(FL[i%FL.length]),px,1.56,pz,g)})}

// chão: a textura repetida (256 px a cada 4,5 m) some com a distância e dá lugar à cor média + uma variação suave em larga escala (sem listras/moiré nem repetição visível)
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
function farField(o,zones){const free=(x,z,r)=>!zones.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+r),K=1,
  spot=(j,r0,r1)=>{j+=(o.seed||0)+5000;const a=PI/2+rn(j*3.1+1)*PI,d=r0+(r1-r0)*Math.pow(rn(j*5.3+2),.8);return[WALK.x+Math.sin(a)*d,WALK.z+Math.cos(a)*d]},put=(N,tries,r0,r1,off,fn)=>{let n=0;for(let j=0;j<tries&&n<Math.round(N*K);j++){const[x,z]=spot(j+off,r0,r1),sz=fn(x,z,j,n);if(sz&&free(x,z,sz[0])){sz[1]();zones.push({x,z,r:sz[0]});n++}}};
 put(6,120,26,52,100,(x,z,j)=>{const r=4+rn(j+7)*5;return[r*.5,()=>forestPatch(x,z,r,o.patch[j%o.patch.length])]});
 const farTree=(x,z,q,n)=>{const kd=o.kinds[n%o.kinds.length],col=o.toon?M('leaf:'+o.tree[n%o.tree.length]):M(F(o.tree[n%o.tree.length])),bark=o.toon?M('bark:'+o.trunk):M(F(o.trunk)),g=piece(x,z);g.userData.ol=1;
  if(kd==='cactus'){mesh(new THREE.CylinderGeometry(.17*q,.2*q,2.2*q,6),col,0,1.1*q,0,g);mesh(new THREE.CylinderGeometry(.1*q,.1*q,.8*q,5),col,.34*q,1.2*q,0,g)}
  else if(kd==='mushroom'){mesh(new THREE.CylinderGeometry(.13*q,.17*q,1.3*q,6),o.toon?M('bark:#efe6d4'):M(F('#efe6d4')),0,.65*q,0,g);ell(.95*q,.5*q,.95*q,col,0,1.4*q,0,g)}
  else if(kd==='round'){mesh(new THREE.CylinderGeometry(.12*q,.16*q,1.3*q,5),bark,0,.65*q,0,g);
   const lb=mesh(new THREE.CylinderGeometry(.075*q,.11*q,.8*q,5),bark,-.27*q,1.55*q,0,g),rb=mesh(new THREE.CylinderGeometry(.08*q,.12*q,.95*q,5),bark,.27*q,1.65*q,0,g);lb.rotation.z=-.58;rb.rotation.z=.48;
   ell(.65*q,.54*q,.65*q,col,-.58*q,2.2*q,0,g);ell(.84*q,.7*q,.84*q,col,.58*q,2.42*q,0,g)}
  else{mesh(new THREE.CylinderGeometry(.12*q,.16*q,1.3*q,5),bark,0,.65*q,0,g);mesh(new THREE.ConeGeometry(.95*q,2*q,6,1),col,0,2.1*q,0,g);mesh(new THREE.ConeGeometry(.7*q,1.5*q,6,1),col,0,3*q,0,g)}};// tronco e copas no mesmo grupo
 put(8,160,38,52,400,(x,z,j,n)=>{const q=1.3+rn(j+13)*1.1;return[1.4*q,()=>farTree(x,z,q,n)]});// árvores distantes: silhueta de poucas faces
 // Bosques de fundo: grupos de árvores entre a área de jogo e as montanhas, em volta de todo o cenário (a câmera gira), com clareiras entre eles.
 // Cada bosque tem um centro com árvores maiores e bordas com árvores menores e mais esparsas; mundos áridos ganham menos bosques.
 {const L=LUSH[CUR]||1.2,nG=Math.round(2.4*L),cs=[];
  for(let c=0;c<40&&cs.length<nG;c++){const a=rn((o.seed||0)+c*29+77)*2*PI,d=33+rn((o.seed||0)+c*13+5)*14,x=WALK.x+Math.sin(a)*d,z=WALK.z+Math.cos(a)*d;
   if(cs.some(q=>Math.hypot(x-q.x,z-q.z)<17)||!free(x,z,4))continue;cs.push({x,z,R:3.6+rn(c*7+(o.seed||0))*2.6})}
  cs.forEach((g,c)=>{const k=Math.round((5+rn(c*3+(o.seed||0))*3)*Math.min(1.25,.75+L*.3));let m=0;
   for(let j=0;j<40&&m<k;j++){const a=rn(c*31+j*7+(o.seed||0))*2*PI,rr=g.R*Math.sqrt(rn(c*17+j*11+(o.seed||0)+9)),x=g.x+Math.sin(a)*rr,z=g.z+Math.cos(a)*rr,q=(1.7-.9*rr/g.R)*(.85+rn(j+c*5)*.4);
    if(!free(x,z,1.2*q))continue;farTree(x,z,q,c+m);zones.push({x,z,r:1.1*q});m++}})}
 // Sopé das montanhas: faixa de vegetação encostada na base da muralha, em todo o contorno, para o chão não acabar vazio junto aos picos.
 // Mesma ideia dos bosques de fundo (grupos com clareiras, árvores maiores no miolo e menores nas bordas), mas com arbustos baixos e
 // moitas misturados e as árvores mais altas ficando atrás, o que dá camadas de profundidade. O que cair na base de um pico é removido depois (declutter).
 {const L=LUSH[CUR]||1.2,sd=o.seed||0,nG=Math.round(5*L),cs=[];
  for(let c=0;c<70&&cs.length<nG;c++){const a=rn(sd+c*37+211)*2*PI,d=47+rn(sd+c*19+41)*10,x=WALK.x+Math.sin(a)*d,z=WALK.z+Math.cos(a)*d;
   if(cs.some(q=>Math.hypot(x-q.x,z-q.z)<16)||!free(x,z,4))continue;cs.push({x,z,R:4+rn(c*5+sd)*3.4,d})}
  cs.forEach((g,c)=>{const kt=Math.round((5+rn(c*7+sd+3)*4)*Math.min(1.2,.7+L*.3)),kb=2+Math.floor(rn(c*3+sd)*3);let m=0,b=0;
   for(let j=0;j<60&&(m<kt||b<kb);j++){const a=rn(c*29+j*7+sd)*2*PI,rr=g.R*Math.sqrt(rn(c*13+j*11+sd+9)),x=g.x+Math.sin(a)*rr,z=g.z+Math.cos(a)*rr,dd=Math.hypot(x-WALK.x,z-WALK.z);
    if(m<kt&&j%3!==2){const q=(1.45-.7*rr/g.R)*(.8+rn(j+c*5)*.45)*(.9+.25*(dd-47)/10);if(free(x,z,1.2*q)){farTree(x,z,q,c+m);zones.push({x,z,r:1.1*q});m++}}
    else if(b<kb){const q=.9+rn(j*3+c)*.7;if(free(x,z,.9*q)){ell(.8*q,.55*q,.8*q,F(o.bush[(c+b)%o.bush.length]),x,.4*q,z,room).userData.ol=1;zones.push({x,z,r:.8*q});b++}}}
   for(let j=0;j<7;j++){const a=rn(c*41+j*5+sd)*2*PI,rr=g.R*1.15*Math.sqrt(rn(c*23+j*3+sd)),x=g.x+Math.sin(a)*rr,z=g.z+Math.cos(a)*rr;if(free(x,z,.3)){tuft(x,z,o.tuft);zones.push({x,z,r:.25})}}})}
 put(5,120,37,50,500,(x,z,j,n)=>{const q=1+rn(j+15)*.8;return[.9*q,()=>{ell(.8*q,.55*q,.8*q,F(o.bush[n%o.bush.length]),x,.4*q,z,room).userData.ol=1}]});
 put(10,200,36,50,600,(x,z)=>[.3,()=>tuft(x,z,o.tuft)])}
function spaceScene(o){
 const zones=[],occupied=[{x:0,z:1.2,r:10.2}];
  {const gs=Math.round(90*GROUND*2/400);/* o disco do chão vai até atrás das montanhas (raio = GROUND), com o mesmo tamanho de ladrilho */mesh(new THREE.CylinderGeometry(GROUND,GROUND,.2,72),groundMat(M(o.gtex.replace(/:90:90$/,':'+gs+':'+gs))),0,-.1,0,room)}descampado(CUR);
 uniqDo(()=>forestCenter(o));
 // Horta ao lado da casa (mesma metade do cenário, nunca do lado oposto), virada para a fogueira; reserva o espaço antes das outras peças.
 {const{x,z,r}=GARDEN;uniqDo(()=>garden(x,z,Math.atan2(WALK.x-x,WALK.z-z),o));occupied.push({x,z,r});zones.push({x,z,r:r+.8})}
 // Dois satélites com painéis solares do lado da casa (atrás da fogueira) e, do lado oposto, dois pares de aerogeradores;
 // cada um testa posições livres antes de construir.
 [[-13.6,10.2,1.2,1],[13.6,10.2,1.2,1],[-13.6,-7.8,1.2,0],[13.6,-7.8,1.2,0]].forEach(([ax,az,s,wind])=>{const dir=ax<0?-1:1,candidates=[[ax,az],[ax+dir*1.6,az+.7],[ax+dir*.7,az-1.7],[ax-dir*.9,az+1.4],[ax+dir*2.2,az-1.0]],r=3.2*s;for(const [x,z] of candidates){if(occupied.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+r+.35))continue;uniqDo(()=>wind?windPair(x,z,o):decorSolar(x,z,s,o));occupied.push({x,z,r});zones.push({x,z,r:r+.8});break}});
 descRim(CUR,o,zones);
 zones.push({x:BUS.x,z:BUS.z,r:5.6});
 // Mantém as pedras fora do piso central.
 zones.push({x:0,z:1.2,r:12.2});
 colony(o,zones);// estruturas e equipamentos do mundo (app-colony.js)
 outcrops(o,zones);// afloramentos de rocha em grupos, com vãos livres
 forestFlora(o,zones);farField(o,zones)}
const BUILD={amazora:()=>spaceScene({gtex:'tex:moss:90:90',ring:'#7dff9a',edge:'#c4ec7a',flora:['#ff7ac8','#ffd54f','#ff9a4a','#b98cff','#fff1c0'],glass:'#c8ffd0',rock:'#7d7a66',rock2:'#5f6b52',
  tree:['#1f7a2e','#2f9a3a','#17602a','#3fae4a'],trunk:'#5a3a1c',bush:['#1f6a2a','#2f8a34','#4a9a2e'],bloom:['#ff5a6a','#ffd54f','#ff9ad0'],fern:'#2fa040',shroom:'#ffb13a',moss:'#2f6a2a',patch:['#24502a','#3a6a2e','#1c4222'],tuft:'#7ac84a',kinds:['round','round','spire','round','mushroom'],glow:'#b8ff9a',ts:1.3,seed:1500,toon:1}),
 cerron:()=>spaceScene({gtex:'tex:sat:90:90',ring:'#ffd27a',edge:'#f5d58a',flora:['#ff5ac8','#a56bff','#ffd54f','#fff1c0','#ff9ad0'],glass:'#ffe9b0',rock:'#b99a5c',rock2:'#a8884a',
  tree:['#6a8a2e','#8aa83a','#5a7a26','#9aa83e'],trunk:'#4a2e16',bush:['#7a8a2e','#9a9a3a','#b0a040'],bloom:['#ffd54f','#ff9a4a','#fff1c0'],fern:'#9aa83a',shroom:'#ffb13a',moss:'#8a8a3a',patch:['#a08a4a','#8a7440','#b89a56'],tuft:'#d9c85a',kinds:['twisted','twisted','round','twisted'],glow:'#ffe9a8',seed:1700,ts:1.05,dens:{bush:1.4,fern:.5,shroom:.2,tuft:1.6}}),
 atlanthia:()=>spaceScene({gtex:'tex:atlmoss:90:90',ring:'#4cffe0',edge:'#5cf0d6',flora:['#4cd9ff','#c06bff','#ff7ad9','#7dffb0','#ffffff'],glass:'#a8fff0',rock:'#5d7f88',rock2:'#47666e',
  tree:['#1f8a5a','#2fa86a','#17704a','#3ac07a'],trunk:'#3f4a52',bush:['#1a7a4a','#2a9a5a','#3a8a3a'],bloom:['#ff4d6a','#ffb13a','#ff7ad9'],fern:'#2fc07a',shroom:'#c06bff',moss:'#2f8a5a',patch:['#1f5a42','#2f7a52','#174a36'],tuft:'#5ad08a',kinds:['round','pine','spire','round'],glow:'#7dfff0',seed:5200,ts:1.15,dens:{fern:2.2,flower:1.4}}),
 caatara:()=>spaceScene({gtex:'tex:caatsoil:90:90',ring:'#ffb13a',edge:'#e0b060',flora:['#ff5a8a','#ffd54f','#ff8a4a','#fff1c0','#ffffff'],glass:'#ffe8c0',rock:'#b8884e',rock2:'#9a6c3a',
  tree:['#6a8a5a','#7a9a6a','#5a7a4a','#8aa070'],trunk:'#5a4a3a',bush:['#8a7a5a','#a08a60','#6a7a4a'],bloom:['#ffd54f','#ff5a8a','#ffffff'],fern:'#8a9a5a',shroom:'#ff7a3a',moss:'#8a7a3a',patch:['#a8743e','#c98e52','#8a5a30'],tuft:'#b8a070',kinds:['cactus','twisted','cactus','twisted','cactus'],glow:'#ffd27a',seed:2500,ts:.9,dens:{fern:.3,shroom:0,flower:.5}}),
 panthara:()=>spaceScene({gtex:'tex:marsh:90:90',ring:'#4ac8f0',edge:'#6ad8ff',flora:['#7affe0','#ff9ad9','#fff0a8','#b8a0ff','#ffffff'],glass:'#bfeaff',rock:'#3a6a88',rock2:'#2c566e',
  tree:['#2f8f4a','#3fae5a','#277a3a','#58b86a'],trunk:'#4a3a24',bush:['#2a7a3a','#3a9a4a','#6aa83a'],bloom:['#ffffff','#ff9ad9','#ffd54f'],fern:'#3ab05a',shroom:'#ffb13a',moss:'#2f7a3a',patch:['#2c5a34','#3a6a3a','#22482a'],tuft:'#7ac84a',kinds:['round','round','spire'],glow:'#7affe0',seed:9900,dens:{fern:1.6,flower:1.2}}),
 pamphora:()=>spaceScene({gtex:'tex:meadow:90:90',ring:'#ff9ac4',edge:'#ffc0d8',flora:['#ff9ec4','#ffffff','#ffd54f','#b98cff','#ff7ab0'],glass:'#ffe0ec',rock:'#9a8a8a',rock2:'#7a6a70',
  tree:['#3f8a3a','#5aa84a','#2f7a32','#7ac05a'],trunk:'#4a3a28',bush:['#4a8a3a','#6aa84a','#8ab858'],bloom:['#ffd54f','#ffffff','#b98cff','#ff7ab0'],fern:'#6aa860',shroom:'#ff9ec4',moss:'#6a8a4a',patch:['#5a8a4a','#6a9a56','#4a783e'],tuft:'#9ac868',kinds:['round','round','pine'],glow:'#ffd0e2',seed:4300,dens:{tree:.35,bush:.7,flower:2.6,tuft:1.8}})};
// ---------- Casa lunar de sacos de terra (superadobe): domo ogival de anéis de sacos, porta em arco e clarabóia ----------
function lunarHouse(k){const R=3.3,H=5.7,L=17,b=R*.05,rAt=y=>R*Math.pow(Math.max(0,1-Math.pow(Math.min(1,y/H),1.7)),.5),pts=[new THREE.Vector2(R,0)];
 for(let i=0;i<L;i++){const y0=H*i/L,dy=H/L;[[.18,.5],[.5,1],[.8,.6]].forEach(([f,q])=>{const y=y0+dy*f;pts.push(new THREE.Vector2(rAt(y)+b*q,y))});const y1=H*(i+1)/L;pts.push(new THREE.Vector2(Math.max(.05,rAt(y1)-b*.35),y1))}
 pts.push(new THREE.Vector2(.001,H));
 const sand=new THREE.Color('#cfc4ae'),wall=new THREE.Color(MPAL[k]||MPAL.amazora).lerp(sand,.6),wallC='#'+wall.getHexString(),g=new THREE.Group();g.position.set(BUS.x,0,BUS.z);room.add(g);
 g.add(new THREE.Mesh(new THREE.LatheGeometry(pts,30),M(TOONF?'stone:'+wallC:wallC)));
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
 OLM=OLM||new THREE.MeshBasicMaterial({color:'#120c08',side:THREE.BackSide});OLM.color.copy(OLC);
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
let CUR='amazora';
const DESC={amazora:['#6a5a3a','#4f6a34','#8a7548','#3f4f2a','leaf'],
 cerron:['#b89a62','#9a7e4c','#d6bb80','#8a6f3e','pebble'],
 atlanthia:['#5a6a46','#45553a','#7a8a5a','#33402a','leaf'],
 caatara:['#b89a7a','#94785a','#d4c0a0','#6e5640','pebble'],
 panthara:['#4a5a3a','#36442a','#7a8a5a','#24301c','leaf'],
 pamphora:['#8a7a54','#6e5e40','#b8a878','#54462e','leaf']};
// folhas caídas na clareira (tipo 'leaf' em DESC); o outro tipo é 'pebble' (pedrisco)
const LEAFC={leaf:['#8a9a3a','#c9a03a','#a0522d','#5a7a2a']};
const RIMT={amazora:'#7ac84a',cerron:'#d8b66f',atlanthia:'#6ac88a',caatara:'#b8a070',panthara:'#7ac87a',pamphora:'#9ac868'};
const DR=11.2,DPL=27,drr=a=>1+.035*Math.sin(3*a+1.3)+.025*Math.sin(5*a+.4)+.015*Math.sin(9*a+2.1);
// clareira: desenhada em coordenadas de 512 px e gravada em 1024 (2,6 cm por texel em vez de 5 cm); sem cache: o desenho é determinístico e o disposeTree já libera a textura a cada troca de mundo
function descTex(k){const[b,e,s1,s2,kind]=DESC[k],S=512,C=S/2,R=DR*S/DPL;let sd=k.length*17;const r=()=>rn(sd++);
 const t=sTex(S*2,S*2,g=>{g.scale(2,2);const path=sc=>{g.beginPath();for(let i=0;i<=96;i++){const a=i/96*6.2832,q=R*drr(a)*sc;g[i?'lineTo':'moveTo'](C+Math.cos(a)*q,C+Math.sin(a)*q)}g.closePath()};
  for(let i=0;i<6;i++){path(1.075-i*.013);g.fillStyle=hx(e,.13);g.fill()}
  path(1);const gr=g.createRadialGradient(C,C,R*.2,C,C,R);gr.addColorStop(0,b);gr.addColorStop(.7,b);gr.addColorStop(1,e);g.fillStyle=gr;g.fill();
  g.save();path(.985);g.clip();
  const P=()=>[C+(r()-.5)*2*R,C+(r()-.5)*2*R];
  for(let i=0;i<1100;i++){const[x,y]=P(),w=1+r()*2.2,h=1+r()*2.2;g.fillStyle=hx(i%2?s1:s2,.28+r()*.2);g.beginPath();g.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,6.2832);g.fill()}
  if(kind==='pebble')for(let i=0;i<70;i++){const[x,y]=P(),q=1.5+r()*3;g.fillStyle=hx(s2,.55);g.beginPath();g.ellipse(x,y,q,q*.7,r()*3,0,6.28);g.fill();g.fillStyle=hx(s1,.5);g.beginPath();g.ellipse(x-.6,y-.6,q*.5,q*.35,0,0,6.28);g.fill()}
  else if(LEAFC[kind]){const cl=LEAFC[kind];for(let i=0;i<190;i++){const[x,y]=P();g.fillStyle=hx(cl[i%4],.55);g.beginPath();g.ellipse(x,y,3+r()*2.5,1.4+r(),r()*3,0,6.28);g.fill()}}
  if(k==='amazora'){// pinceladas largas e manchas de terra: profundidade pintada, sem mudar o formato da clareira
   for(let i=0;i<150;i++){const[x,y]=P(),l=4+r()*15,a=r()*6.283;g.strokeStyle=hx(i%2?s1:s2,.14+r()*.14);g.lineWidth=1+r()*2.2;g.lineCap='round';g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+Math.cos(a)*l*.5,y+Math.sin(a)*l*.5,x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke()}
   for(let i=0;i<24;i++){const[x,y]=P(),q=4+r()*13;g.fillStyle=hx(e,.08+r()*.07);g.beginPath();g.ellipse(x,y,q,q*.65,r()*3,0,6.28);g.fill()}
   g.strokeStyle=hx(s2,.2);g.lineWidth=2.4;path(.965);g.stroke()}
  g.restore()});t.anisotropy=8;return t}
function descampado(k){const m=mesh(new THREE.PlaneGeometry(DPL,DPL),LM({map:descTex(k),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),0,.045,1.2,room);m.rotation.x=-PI/2;m.userData.own=1;m.renderOrder=-1}
function descRim(k,o,zones){const ok=(x,z)=>!zones.some(q=>Math.hypot(x-q.x,z-q.z)<q.r);
 for(let i=0;i<16;i++){const a=(i+rn(i+300)*.8)/16*6.2832,q=DR*drr(a)*(1+(rn(i+330)-.5)*.08),x=Math.cos(a)*q,z=WALK.z+Math.sin(a)*q;if(ok(x,z))rock(x,z,.16+rn(i+360)*.26,i%3?o.rock:o.rock2)}
 for(let i=0;i<54;i++){const a=rn(i+400)*6.2832,q=DR*drr(a)*(.99+rn(i+430)*.1),x=Math.cos(a)*q,z=WALK.z+Math.sin(a)*q;if(ok(x,z))tuft(x,z,RIMT[k])}}
// Partículas do ar, por bioma: até duas camadas, cada uma [cor, tamanho, subida (m/s; negativo = cai), balanço, forma, aditiva, quantidade].
// Ficam num cilindro de 13 m em volta da fogueira, entre 0,3 e 4,8 m de altura, e voltam ao topo (ou ao chão) quando saem dele.
let PT=[];
const PFX={amazora:[['#d8ff7a',.2,-.16,1,'leaf',0,40],['#e8ffb0',.08,.04,.5,'dot',1,60]],// folhas caindo e esporos úmidos
 cerron:[['#fff4d0',.22,.05,1.2,'seed',0,30],['#ffe08a',.08,.03,.4,'dot',1,50]],// sementes de paina e pólen dourado
 atlanthia:[['#d8ffe0',.14,.08,.7,'dot',1,60],['#4a9aff',.3,.02,1.4,'butterfly',0,12]],// gotículas de neblina e borboletas-azuis (morpho)
 caatara:[['#e8d0a8',.1,.02,1.6,'dot',0,70],['#b08a5a',.18,-.12,1.2,'leaf',0,18]],// poeira seca e folhas secas
 panthara:[['#ffe14a',.26,.03,1.5,'butterfly',0,24],['#f4ffd0',.07,.05,.6,'dot',1,40]],// borboletas-amarelas (as revoadas do Pantanal) e insetos
 pamphora:[['#ffffff',.22,.05,1.3,'seed',0,30],['#ffd54f',.16,-.06,1,'petal',0,24]]};// sementes de dente-de-leão e pétalas de flores do campo
const PTX={};
function ptex(kind){if(PTX[kind])return PTX[kind];
 return PTX[kind]=sTex(64,64,g=>{g.fillStyle=g.strokeStyle='#fff';g.lineCap='round';
  if(kind==='leaf'){g.save();g.translate(32,32);g.rotate(.6);g.beginPath();g.moveTo(-26,0);g.quadraticCurveTo(0,-20,26,0);g.quadraticCurveTo(0,20,-26,0);g.fill();g.restore()}
  else if(kind==='petal'){g.save();g.translate(32,32);g.rotate(-.7);g.beginPath();g.ellipse(0,0,24,12,0,0,6.283);g.fill();g.restore()}
  else if(kind==='seed'){g.lineWidth=2.4;g.globalAlpha=.85;for(let i=0;i<12;i++){const a=i/12*6.283;g.beginPath();g.moveTo(32,32);g.lineTo(32+Math.cos(a)*24,32+Math.sin(a)*24);g.stroke()}g.globalAlpha=1;g.beginPath();g.arc(32,32,5,0,6.283);g.fill()}// paina / dente-de-leão: penacho em raios
  else if(kind==='butterfly'){for(const sd of[-1,1]){g.beginPath();g.ellipse(32+sd*13,24,13,15,sd*.5,0,6.283);g.fill();g.beginPath();g.ellipse(32+sd*10,44,9,10,-sd*.4,0,6.283);g.fill()}g.fillRect(30,18,4,32)}
  else{const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64)}})}
function partBuild(k){PT=[];(PFX[k]||[]).forEach(([col,size,vy,sw,kind,add,N],L)=>{const base=new Float32Array(N*3);
  for(let i=0;i<N;i++){const j=i+L*500,a=rn(j*3+1)*6.283,r=Math.sqrt(rn(j*3+2))*13;base[i*3]=Math.cos(a)*r;base[i*3+1]=rn(j*3+3)*4.5+.3;base[i*3+2]=1.2+Math.sin(a)*r}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(base.slice(),3));
  const p=new THREE.Points(g,new THREE.PointsMaterial({map:ptex(kind),color:col,size,sizeAttenuation:true,transparent:true,opacity:.85,depthWrite:false,blending:add?THREE.AdditiveBlending:THREE.NormalBlending}));p.frustumCulled=false;room.add(p);PT.push({g,base,N,vy,sw,t:0})})}
function partTick(dt){if(rm)return;for(const P of PT){P.t+=dt;const{g,base,N,vy,sw,t}=P,a=g.attributes.position.array;for(let i=0;i<N;i++){const y=base[i*3+1]-.3+vy*t;a[i*3]=base[i*3]+Math.sin(t*.6+i)*.3*sw;a[i*3+1]=((y%4.5)+4.5)%4.5+.3;a[i*3+2]=base[i*3+2]+Math.cos(t*.5+i*1.3)*.3*sw}g.attributes.position.needsUpdate=true}}
// Água rasa em volta da clareira (o alagado; a clareira da fogueira fica seca, como uma ilha): duas camadas de reflexos que correm em
// sentidos diferentes; WATER dá as cores de cada bioma alagado. waterRing: anel de 11,6 a 95 m de raio, com os vértices de dentro pretos
// (na mistura aditiva, preto não soma nada), então a água aparece aos poucos entre 11,6 e 14,2 m em vez de começar numa linha dura.
function waterRing(){const g=new THREE.RingGeometry(1,2,72,2),P=g.attributes.position,U=g.attributes.uv,C=[];
 for(let i=0;i<P.count;i++){const x=P.getX(i),y=P.getY(i),r=Math.hypot(x,y),R=r<1.25?11.6:r<1.75?14.2:95;P.setXY(i,x/r*R,y/r*R);U.setXY(i,(x/r*R/95+1)/2,(y/r*R/95+1)/2);const c=r<1.25?0:1;C.push(c,c,c)}
 g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));return g}
const WATER={panthara:['#7adcb0','#c8f4d8']};
function buildWater(k){const[c0,c1]=WATER[k];const T=sTex(128,128,g=>{g.lineCap='round';for(let i=0;i<46;i++){const x=rn(i*7+1)*128,y=rn(i*7+2)*128,r=6+rn(i*7+3)*16,s=rn(i*7+4)*6.28;for(const ox of[-128,0,128])for(const oy of[-128,0,128]){g.beginPath();g.arc(x+ox,y+oy,r,s,s+1.6+rn(i*7+5)*1.4);g.strokeStyle=`rgba(255,255,255,${(.35+rn(i*7+6)*.45).toFixed(2)})`;g.lineWidth=1.4+rn(i*7+7)*1.6;g.stroke()}}});T.wrapS=T.wrapT=THREE.RepeatWrapping;
 waterFx=[0,1].map(L=>{const m=T.clone();m.needsUpdate=true;m.repeat.set(L?34:46,L?34:46);const o=mesh(waterRing(),new THREE.MeshBasicMaterial({map:m,color:L?c1:c0,vertexColors:true,transparent:true,opacity:L?.16:.24,blending:THREE.AdditiveBlending,depthWrite:false}),0,.034+L*.006,1.2,room);o.rotation.x=-PI/2;o.rotation.z=L*.9;return o.material})}
// Cordilheiras distantes em duas camadas: dão profundidade ao horizonte (a névoa as esmaece).
// Relevo de cada mundo: mistura de formas (peso), quantos picos por camada (anel de 360°, sem cópia espelhada), altura e largura relativas.
// Formas (todas tetraedros, só muda a largura da base): alpine, needle (agulha), broad (larga) e dune (bem larga e baixa).
const MREL={amazora:{m:[['alpine',7],['dune',3]],g:[3,5]},
 cerron:{m:[['broad',5],['dune',4],['alpine',1]],g:[3,5]},
 atlanthia:{m:[['alpine',5],['needle',3],['dune',2]],g:[3,5]},
 caatara:{m:[['alpine',4],['broad',4],['needle',2]],g:[2,4]},
 panthara:{m:[['dune',7],['broad',2],['alpine',1]],g:[4,6]},
 pamphora:{m:[['dune',8],['broad',2]],g:[4,6]}};
/** Padrão de tamanho da muralha, IGUAL em todos os mundos (só a mistura de formas e o tamanho dos grupos mudam por mundo).
 * Alturas (do pé, que fica 1,5 m abaixo do chão, até a ponta) calculadas para a linha do horizonte ficar abaixo de 4,2° visto da pior posição da câmera
 * (19,4 m do centro, a 4,8 m de altura): os planetas do céu começam a ~5,8° (centro) e não ficam atrás das montanhas. Piso: nenhum pico abaixo de 68 % do principal. */
const MWALL={near:{d:63,H:[8.2,9.1]},far:{d:81,H:[9.2,10.1]},floor:.68,slope:1.35,fill:1.3,layerGap:1,sw:{alpine:1,needle:.85,broad:1.2,dune:1.35}};
// Todas as montanhas são TETRAEDROS: pirâmide de base triangular com ponta para cima (`tetraV`: 4 vértices; `tetraTris`: as 4 faces planas). A variedade
// vem das proporções (a forma só muda a largura da base: needle 0,85×, alpine 1×, broad 1,2× e dune 1,35×; a altura segue o padrão MWALL),
// do alargamento da base em x (`sx`) e de um pequeno deslocamento lateral da ponta (tetraedro irregular; as faces continuam planas e triangulares).
const mixPick=(L,r)=>{let t=0;for(const[,w]of L)t+=w;r*=t;for(const[s,w]of L){r-=w;if(r<0)return s}return L[0][0]};
// paleta de rocha de cada mundo: [base escura, meio, topo claro, faixa de vegetação (ou null)]. Hoje só tinge a parede da casa lunar (as montanhas usam a cor do chão).
const MPAL={amazora:'#4e9c48',cerron:'#b07a3c',atlanthia:'#2e9c92',caatara:'#d69a50',panthara:'#2e88b2',pamphora:'#d8809e'};
// MFOOT: pegada de cada montanha no chão; nada do cenário pode ficar dentro dela (pedra ou árvore "enterrada" na encosta)
let MFOOT=[];
function inMountain(x,z,r){for(const m of MFOOT){const dx=x-m.x,dz=z-m.z,c=Math.cos(m.rot),s_=Math.sin(m.rot),lx=dx*c-dz*s_,lz=dx*s_+dz*c;// volta ao eixo da montanha (inversa de rotation.y)
  if(Math.hypot(lx/(m.a*m.k+r),lz/(m.b*m.k+r))<1)return true}return false}
const MGAP=.15,MFOOTY=1.5;// folga mínima entre montanhas (m) e quanto o pé fica abaixo do chão (m)
/** Vértices (mundo) do tetraedro VISÍVEL de um pico, isto é, da parte acima do chão (y=0): o corte de um tetraedro por um plano paralelo à base
 * é outro tetraedro (mesma ponta). Usa os mesmos campos que `mountains` aplica à malha: base triangular de raio W (escala sx em x),
 * ponta deslocada (k1·W, k2·W), giro `rot` e posição polar (a, d). */
function tetraV(p){const W=p.W,c=Math.cos(p.rot),s=Math.sin(p.rot),px=Math.sin(p.a)*p.d,pz=Math.cos(p.a)*p.d,Ax=p.k1*W,Az=p.k2*W,
 B=[[0,W],[.8660254*W,-.5*W],[-.8660254*W,-.5*W]],w=(x,z,y)=>[px+x*p.sx*c+z*s,y,pz-x*p.sx*s+z*c];
 return[...B.map(([x,z])=>w(x,z,-MFOOTY)),w(Ax,Az,p.H-MFOOTY)]}
function tetraOf(p){const V=tetraV(p),f=MFOOTY/p.H,A=V[3];return[...V.slice(0,3).map(b=>[b[0]+(A[0]-b[0])*f,0,b[2]+(A[2]-b[2])*f]),A]}
/** Separação (m) entre dois tetraedros: maior afastamento sobre os eixos das faces e das arestas (teorema do eixo separador).
 * Valor negativo = as duas montanhas se atravessam (e o módulo é o quanto). */
function tetSep(A,B){const sub=(u,v)=>[u[0]-v[0],u[1]-v[1],u[2]-v[2]],cr=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],
 E=T=>[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]].map(([i,j])=>sub(T[j],T[i])),F=T=>[[0,1,2],[0,1,3],[0,2,3],[1,2,3]].map(([i,j,k])=>cr(sub(T[j],T[i]),sub(T[k],T[i]))),
 ea=E(A),eb=E(B),ax=[...F(A),...F(B)];for(const u of ea)for(const v of eb)ax.push(cr(u,v));
 let best=-1e9;for(const n of ax){const l=Math.hypot(n[0],n[1],n[2]);if(l<1e-9)continue;let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;
  for(const q of A){const t=(q[0]*n[0]+q[1]*n[1]+q[2]*n[2])/l;if(t<a0)a0=t;if(t>a1)a1=t}
  for(const q of B){const t=(q[0]*n[0]+q[1]*n[1]+q[2]*n[2])/l;if(t<b0)b0=t;if(t>b1)b1=t}
  const sp=Math.max(b0-a1,a0-b1);if(sp>best)best=sp}
 return best}
/** Posiciona uma camada: os picos P (em sequência) ficam na circunferência de raio d, cada um no menor ângulo em que não atravessa os três anteriores
 * (folga MGAP); largura multiplicada por s. Devolve a lista posicionada e T, o ângulo total que o anel precisa (o último também não pode atravessar o primeiro). */
function ringPlace(P,s,d,a0){const out=[],tets=[],mk=(q,a)=>({...q,W:q.W*s,a,d,rot:a+q.fl+q.jt}),R=q=>q.W*s*Math.max(q.sx,1)*1.06;
 const adv=(q,from)=>{const free=a=>{const t=tetraOf(mk(q,a));for(let j=Math.max(0,tets.length-3);j<tets.length;j++)if(tetSep(tets[j],t)<MGAP)return false;return true},
  last=out[out.length-1],hi0=from+(R(last)+R(q))/d*1.05+.02;let lo=from,hi=hi0;while(!free(hi))hi+=.01;
  for(let i=0;i<13;i++){const m=(lo+hi)/2;if(free(m))hi=m;else lo=m}return hi};
 out.push(mk(P[0],a0));tets.push(tetraOf(out[0]));
 for(let i=1;i<P.length;i++){const a=adv(P[i],out[i-1].a);out.push(mk(P[i],a));tets.push(tetraOf(out[i]))}
 const aEnd=adv(P[0],out[out.length-1].a);return{out,T:aEnd-a0}}
/** Plano das montanhas (puro e determinístico, testável): MURALHA em duas camadas. Cada camada é uma circunferência exata (raio fixo, concêntrica à área de
 * jogo, os 360° fechados) e as camadas não se tocam. Os picos vêm em GRUPOS (cordilheiras): um principal e ombros que descem (68 a 100 % do principal).
 * Cada pico fica no menor ângulo em que o seu tetraedro encosta no vizinho sem atravessá-lo (ringPlace); a largura de todos é ajustada por um fator
 * único para o anel fechar em 360° certos, e a folga que sobra é repartida igualmente. A camada de trás sai do raio em que nenhum pico dela encosta
 * na camada da frente. Todos os pés ficam MFOOTY abaixo do chão (nenhum flutua) e giram com a circunferência (base voltada para o centro). */
function mountPlan(k){const REL=MREL[k]||MREL.amazora,ks=[...k].reduce((t,c)=>t+c.charCodeAt(0),0);
 const group=(L,g,Ly)=>{const m=REL.g[0]+Math.floor(rn(g*7+L*53+ks)*(REL.g[1]-REL.g[0]+1)),Hm=Ly.H[0]+(Ly.H[1]-Ly.H[0])*rn(g*11+L*31+ks+2),mid=(m-1)/2,main=Math.round(mid+(rn(g*3+L*5+ks+7)-.5)*Math.min(1,m-1)),r=[];
  for(let j=0;j<m;j++){const u=m>1?Math.abs(j-main)/Math.max(main,m-1-main,1):0,f=j===main?1:1-(1-MWALL.floor)*Math.pow(u,1.2)*(.55+rn(g*17+j*5+L*3+ks+4)*.45),
   shape=mixPick(REL.m,rn(g*13+j*9+L*19+ks+6)),H=Hm*f,W=H*MWALL.slope*MWALL.sw[shape]*(.92+rn(g*19+j*11+L*7+ks+8)*.16),q=g*29+j*7+L*13+ks;
   r.push({L,g,main:j===main,shape,H,W,sx:1+rn(q+4)*.35,k1:(rn(q*19+6)-.5)*.56,k2:(rn(q*23+8)-.5)*.5,fl:PI,jt:(rn(q+13)-.5)*.2})}
  return r};
 const layer=(L,Ly,d)=>{const target=2*PI*d,a0=rn(L*17+ks)*2*PI,P=[];let g=0,est=0;const add=()=>group(L,g++,Ly).forEach(p=>{P.push(p);est+=p.W*p.sx*MWALL.fill});
  while(est<target)add();let r=ringPlace(P,1,d,a0);while(r.T<2*PI){add();r=ringPlace(P,1,d,a0)}
  let s=1;for(let i=0;i<8&&(r.T>2*PI||2*PI-r.T>.02);i++){s*=(2*PI-.004)/r.T;r=ringPlace(P,s,d,a0)}
  for(let i=0;r.T>2*PI&&i<40;i++){s*=.995;r=ringPlace(P,s,d,a0)}
  const n=r.out.length,slack=Math.max(0,2*PI-r.T)/n;
  return r.out.map((p,i)=>{const a=((p.a+i*slack)%(2*PI)+2*PI)%(2*PI);return{...p,a,rot:a+p.fl+p.jt,s}})};
 const near=layer(0,MWALL.near,MWALL.near.d),nt=near.map(tetraOf);let far,dF=MWALL.far.d;
 for(let it=0;it<8;it++){far=layer(1,MWALL.far,dF);let sep=1e9;far.forEach(p=>{const t=tetraOf(p);nt.forEach(q=>{if(Math.hypot(t[3][0]-q[3][0],t[3][2]-q[3][2])<70)sep=Math.min(sep,tetSep(q,t))})});
  if(sep>=MGAP&&sep<MWALL.layerGap+1)break;dF+=MWALL.layerGap-sep}
 return[...near,...far]}

const OLH=.0022;// espessura do contorno por metro de distância (~1,5 px, fino)
const MPC={};// plano de cada mundo (calculado uma vez por mundo: o posicionamento exato dos tetraedros custa alguns milissegundos)
const TFACE=[[0,2,1],[0,1,3],[1,2,3],[2,0,3]];// as 4 faces do tetraedro (índices dos vértices)
/** Faces do tetraedro V (4 vértices) como triângulos com normal para fora: devolve posições e normais (12 vértices, faces planas). */
function tetraTris(V){const sub=(u,v)=>[u[0]-v[0],u[1]-v[1],u[2]-v[2]],cr=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],
 G=[0,1,2].map(i=>(V[0][i]+V[1][i]+V[2][i]+V[3][i])/4),P=[],N=[];
 for(const f of TFACE){const[a,b,c]=f.map(i=>V[i]);let n=cr(sub(b,a),sub(c,a));const l=Math.hypot(...n)||1;n=n.map(x=>x/l);
  const out=n[0]*(a[0]-G[0])+n[1]*(a[1]-G[1])+n[2]*(a[2]-G[2])>0,tri=out?[a,b,c]:[a,c,b];if(!out)n=n.map(x=>-x);
  for(const q of tri){P.push(q[0],q[1],q[2]);N.push(n[0],n[1],n[2])}}
 return{P,N}}
/** Tetraedro V "engordado" t metros em todas as faces (contorno de espessura igual): é o mesmo tetraedro ampliado a partir do incentro,
 * na razão (r+t)/r, onde r é o raio da esfera inscrita. */
function tetraGrow(V,t){const sub=(u,v)=>[u[0]-v[0],u[1]-v[1],u[2]-v[2]],cr=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],
 area=(a,b,c)=>Math.hypot(...cr(sub(b,a),sub(c,a)))/2,Ar=[0,1,2,3].map(i=>{const[a,b,c]=[0,1,2,3].filter(j=>j!==i).map(j=>V[j]);return area(a,b,c)}),S=Ar[0]+Ar[1]+Ar[2]+Ar[3],
 I=[0,1,2].map(k=>(Ar[0]*V[0][k]+Ar[1]*V[1][k]+Ar[2]*V[2][k]+Ar[3]*V[3][k])/S),
 vol=Math.abs(cr(sub(V[1],V[0]),sub(V[2],V[0]))[0]*(V[3][0]-V[0][0])+cr(sub(V[1],V[0]),sub(V[2],V[0]))[1]*(V[3][1]-V[0][1])+cr(sub(V[1],V[0]),sub(V[2],V[0]))[2]*(V[3][2]-V[0][2]))/6,r=3*vol/S,k=(r+t)/r;
 return V.map(v=>[I[0]+(v[0]-I[0])*k,I[1]+(v[1]-I[1])*k,I[2]+(v[2]-I[2])*k])}
/** Cada montanha é um tetraedro com a COR DO SOLO do cenário (a cor média do chão, GAVG): uma cor só por montanha, sem degradê. Toda montanha fica com
 * uma ARESTA voltada para o centro (fl=PI), então quem está na colônia vê sempre duas faces: uma na luz e outra na sombra. O volume vem de 3 faixas de
 * luz fixas por face (MSHADE: luz, meio-tom, sombra puxada para a cor de preenchimento do mundo), calculadas com a luz do mundo (LDO); se a luz bate
 * quase de frente num pico, ela é inclinada de lado para ele não ficar chapado. A fileira de trás fica mais clara e puxada para a névoa (perspectiva
 * atmosférica). Contorno fino e escuro em volta de cada tetraedro (o sólido ampliado, visto só por dentro) e uma linha na aresta do meio. Tudo sai em
 * poucas malhas (montanhas, contorno, arestas). */
const MSHADE=[1.08,.84,.6],MSIDE=.6,MFAR=.3;// faixas de luz das faces; inclinação lateral mínima da luz; quanto a fileira de trás puxa para a névoa
function mountains(k){MFOOT=[];bdG.traverse(c=>{if(c.geometry)c.geometry.dispose()});bdG.clear();const gc=(GAVG||new THREE.Color(MPAL[k])).clone().convertSRGBToLinear().multiplyScalar(1.12),// levemente mais claro: de longe o chão aparece mais iluminado que a média da textura
  fc=new THREE.Color(FILL[k]).convertSRGBToLinear(),fogc=scene.fog?scene.fog.color:gc,band=[0,1,2].map(i=>{const c=new THREE.Color(MSHADE[i],MSHADE[i],MSHADE[i]);if(i===2)c.lerp(fc.clone().multiplyScalar(MSHADE[2]),.3);return c}),
  ld=Math.hypot(LDO[0],LDO[1],LDO[2])||1,lx=LDO[0]/ld,ly=LDO[1]/ld,lz=LDO[2]/ld,lh=Math.hypot(lx,lz),
  P=[],Nn=[],C=[],OP=[],RP=[],pc=new THREE.Color();
 // muralha de tetraedros (ver mountPlan)
 (MPC[k]||(MPC[k]=mountPlan(k))).forEach(pk=>{const V=tetraV(pk),T=tetraTris(V),O=tetraTris(tetraGrow(V,OLH*pk.d)),S=Math.sin(pk.a),Cs=Math.cos(pk.a);
   MFOOT.push({x:S*pk.d,z:Cs*pk.d,rot:pk.rot,a:pk.W*pk.sx,b:pk.W,k:Math.max(0,1-MFOOTY/pk.H)});// pegada da montanha no nível do chão (elipse)
   // luz deste pico: a do mundo, com componente lateral (ao longo do anel) de pelo menos MSIDE, para as duas faces visíveis nunca saírem iguais
   const lu=-(lx*S+lz*Cs),lt0=lx*Cs-lz*S,lt=(lt0<0?-1:1)*Math.max(Math.abs(lt0),MSIDE*lh),Lx=-lu*S+lt*Cs,Lz=-lu*Cs-lt*S,Ll=Math.hypot(Lx,ly,Lz),
    base=pc.copy(gc);if(pk.L)base.lerp(fogc,MFAR).multiplyScalar(1.06);
   for(let i=0;i<T.P.length;i+=3){const nx=T.N[i],ny=T.N[i+1],nz=T.N[i+2],dl=(nx*Lx+ny*ly+nz*Lz)/Ll,b=band[dl>.45?0:dl>.05?1:2];
    P.push(T.P[i],T.P[i+1],T.P[i+2]);Nn.push(nx,ny,nz);C.push(base.r*b.r,base.g*b.g,base.b*b.b);OP.push(O.P[i],O.P[i+1],O.P[i+2])}
   // aresta do meio (da ponta ao vértice voltado para o centro), um pouco à frente da malha para não sumir dentro dela
   const R=tetraOf(pk),e=.06*pk.d/MWALL.near.d;RP.push(R[3][0]+S*-e,R[3][1],R[3][2]+Cs*-e,R[0][0]+S*-e,R[0][1],R[0][2]+Cs*-e)});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(Nn,3));g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));
 const m=new THREE.Mesh(g,mats.mtn||(mats.mtn=LM({vertexColors:true,flatShading:true})));m.userData.nomerge=1;bdG.add(m);
 // contorno de desenho animado: o tetraedro ampliado, só com o lado de dentro visível, quase preto e tingido pelo solo do mundo
 const og=new THREE.BufferGeometry();og.setAttribute('position',new THREE.Float32BufferAttribute(OP,3));
 const om=mats.mtnOL||(mats.mtnOL=new THREE.MeshBasicMaterial({side:THREE.BackSide}));om.color.copy(gc).multiplyScalar(.12).lerp(OLC,.25).multiplyScalar(.6);
 const ol=new THREE.Mesh(og,om);ol.userData.nomerge=1;bdG.add(ol);
 // linha da aresta do meio, na mesma cor do contorno
 const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(RP,3));
 const rl=new THREE.LineSegments(rg,mats.mtnRL||(mats.mtnRL=new THREE.LineBasicMaterial()));rl.material.color.copy(om.color);rl.userData.nomerge=1;bdG.add(rl)}
// Tira sobreposições (pedra atravessando árvore, arbusto dentro de pedra...): compara a pegada de cada objeto com a dos maiores e remove o
// menor. Casa, horta, satélites e o centro (fogueira, bancos) nunca saem: o outro objeto sai. As pegadas que sobram ficam em FOOT.
function declutter(){room.updateMatrixWorld(true);const b=new THREE.Box3(),c=new THREE.Vector3(),s=new THREE.Vector3(),L=[];
 for(const o of room.children){if(o.isLight||o.isPoints||o.isSprite||o.userData.own||(o.isMesh&&o.material&&o.material.transparent))continue;b.setFromObject(o);if(b.isEmpty())continue;b.getSize(s);
  const w=Math.max(s.x,s.z);if(s.y<.3||w<.5||w>40)continue;b.getCenter(c);
  L.push({o,x:c.x,z:c.z,r:w*.42+.06,v:s.x*s.y*s.z,keep:!!o.userData.uniq})}
 const gone=new Set(),kill=o=>gone.add(o);
 for(const A of L)if(!A.keep&&inMountain(A.x,A.z,A.r*.5))kill(A.o);
 L.sort((a,b)=>b.v-a.v);
 for(let i=0;i<L.length;i++){const A=L[i];if(gone.has(A.o))continue;
  for(let j=i+1;j<L.length;j++){const B=L[j];if(gone.has(B.o)||Math.hypot(A.x-B.x,A.z-B.z)>=A.r+B.r)continue;
   if(B.keep){if(!A.keep){kill(A.o);break}}else kill(B.o)}}
 gone.forEach(o=>room.remove(o));FOOT=L.filter(A=>!gone.has(A.o)).map(A=>({x:A.x,z:A.z,r:A.r}));return gone.size}
function buildRoom(k){disposeTree(room);dropWorldTex();GC={};room.clear();FOOT=[];seats=[];obst=null;fireL=null;flames=[];embF=null;fireGlow=[];if(waterFx)waterFx.forEach(m=>m.map&&m.map.dispose());waterFx=null;const T=THEME[k];toonTint(k);buildSky(k);toonTint(k);
 hemi.color.setHex(T.h[0]);hemi.groundColor.setHex(T.h[1]);hemi.intensity=T.h[2]*.8*LGH*BRI;dirL.color.setHex(T.d[0]);dirL.intensity=T.d[1]*.7*LGD*BRI;LDO=LDIR[k]||LDO;dirL.position.set(LDO[0],LDO[1],LDO[2]);fillL.color.set(FILL[k]);fillL.intensity=FILLI*BRI;fillL.position.set(-LDO[0],LDO[1]*.7,-LDO[2]);
 // protótipo Amazora: chave um pouco mais quente e preenchimento frio mais presente, sem mexer na identidade das outras luzes
 if(k==='amazora'){dirL.intensity*=1.05;hemi.intensity*=.97;fillL.intensity*=1.1}
 CUR=k;TOONF=k==='amazora'?1:0;LOWG=true;try{BUILD[k]();{const h={};if(GAVG)GAVG.getHSL(h);FIREK=GAVG?Math.max(.55,Math.min(1,1.25-h.l)):1;if(fireL)fireL.intensity=FIRE_I*LG*FIREK}if(WATER[k])buildWater(k);mountains(k);uniqDo(()=>lunarHouse(k))}finally{LOWG=false}partBuild(k);declutter();mergePatches();contactShadows();if(SHD)markCasters();addOutlines();if(!NOMERGE)mergeStatic();if(SHD)room.traverse(q=>{if(q.isMesh&&!q.userData.nomerge)q.receiveShadow=true});lifeBuild(k)}
