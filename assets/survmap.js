/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Gerador do mapa do modo Sobrevivência: a mesma semente dá o mesmo mapa no servidor (que decide a coleta) e no navegador
 * (que desenha). Só distribui o que já existe no cenário (árvore, arbusto, samambaia, cogumelo, tronco, toco, pedra) e os
 * pontos de coleta de SURV; o layout fixo (disco, fogueira, montanhas) fica com o cenário. Sem relógio nem Math.random.
 */
(function(root){'use strict';
const SURV=(typeof module==='object'&&module.exports?require('./catalog.js'):root.SKYCAT).SURV;
const mulberry32=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
// distâncias mínimas (m): entre pontos de coleta (para ficar claro qual se pega), da fogueira e das bordas do lago
const SEP=2.4,FIRE_CLEAR=2.5,LAKE_R=3,LAKE_GAP=1.4,EDGE=1;
// enfeites por zona: [tipo, quantidade]; só tipos que o cenário já sabe desenhar
const DECOR={perto:[['stump',2],['log',2],['rock',3],['bush',3],['fern',4]],meio:[['tree',22],['bush',12],['fern',12],['shroom',6],['rock',6],['log',4]],longe:[['tree',26],['rock',10],['bush',8],['fern',6],['stump',3]]};

function generate(seed,S){
 S=S||SURV;const rnd=mulberry32((seed>>>0)||1),W=S.walk,F=S.fire,Z=S.zones;
 const pt=(a,b)=>{const ang=rnd()*Math.PI*2,r=Math.sqrt(a*a+rnd()*(b*b-a*a));return[F.x+Math.sin(ang)*r,F.z+Math.cos(ang)*r]};
 const dF=(x,z)=>Math.hypot(x-F.x,z-F.z),dW=(x,z)=>Math.hypot(x-W.x,z-W.z);
 // lago na zona longe; os pontos de água ficam na margem
 const lr=Z.longe[0]+1.5,la=rnd()*Math.PI*2,lake={x:F.x+Math.sin(la)*lr,z:F.z+Math.cos(la)*lr,r:LAKE_R};
 const inLake=(x,z,gap)=>Math.hypot(x-lake.x,z-lake.z)<lake.r+gap;
 const placed=[],nodes=[],free=(x,z,sep)=>placed.every(p=>Math.hypot(p[0]-x,p[1]-z)>=sep);
 const ok=(x,z,sep)=>dF(x,z)>=FIRE_CLEAR&&dW(x,z)<=W.r-EDGE&&!inLake(x,z,LAKE_GAP)&&free(x,z,sep);
 for(const [id,r] of Object.entries(S.res)){
  for(const [zn,n] of Object.entries(r.spots)){
   const [a,b]=Z[zn];
   for(let i=0;i<n;i++){
    if(id==='agua'){for(let t=0;t<60;t++){const g=rnd()*Math.PI*2,rr=lake.r+.9,x=lake.x+Math.sin(g)*rr,z=lake.z+Math.cos(g)*rr;
      if(dW(x,z)<=W.r-.5&&free(x,z,SEP*.8)){placed.push([x,z]);nodes.push({res:id,zone:zn,x,z});break}}continue}
    for(let t=0;t<80;t++){const [x,z]=pt(Math.max(a,FIRE_CLEAR),b);if(!ok(x,z,SEP))continue;placed.push([x,z]);nodes.push({res:id,zone:zn,x,z});break}
   }
  }
 }
 const decor=[];
 for(const [zn,list] of Object.entries(DECOR)){const [a,b]=Z[zn];
  for(const [type,n] of list)for(let i=0;i<n;i++){
   for(let t=0;t<30;t++){const [x,z]=pt(Math.max(a,FIRE_CLEAR+.5),b);
    if(dF(x,z)<FIRE_CLEAR+.5||dW(x,z)>W.r-.3||inLake(x,z,.6)||!placed.every(p=>Math.hypot(p[0]-x,p[1]-z)>=1.3))continue;
    decor.push({type,x,z,s:.8+rnd()*.5,rot:rnd()*Math.PI*2});break}}}
 return{seed:(seed>>>0)||1,lake,nodes,decor};
}

// Confere um mapa contra as regras (usado nos testes com milhares de sementes). Devolve a lista de problemas.
function check(map,S){
 S=S||SURV;const bad=[],W=S.walk,F=S.fire;
 const want={};for(const [id,r] of Object.entries(S.res))for(const [z,n] of Object.entries(r.spots))want[id+'@'+z]=n;
 const got={};for(const n of map.nodes)got[n.res+'@'+n.zone]=(got[n.res+'@'+n.zone]||0)+1;
 for(const k of Object.keys(want))if(got[k]!==want[k])bad.push('faltam pontos '+k+': '+(got[k]||0)+'/'+want[k]);
 for(const n of map.nodes){
  if(Math.hypot(n.x-W.x,n.z-W.z)>W.r)bad.push('fora da área '+n.res);
  if(Math.hypot(n.x-F.x,n.z-F.z)<FIRE_CLEAR&&n.res!=='lenha')bad.push('em cima da fogueira '+n.res);
  const [a,b]=S.zones[n.zone],d=Math.hypot(n.x-F.x,n.z-F.z);
  if(n.res!=='agua'&&(d<a-1e-6||d>b+1e-6))bad.push('zona errada '+n.res+' '+n.zone);
 }
 for(let i=0;i<map.nodes.length;i++)for(let j=i+1;j<map.nodes.length;j++)if(Math.hypot(map.nodes[i].x-map.nodes[j].x,map.nodes[i].z-map.nodes[j].z)<1.9)bad.push('pontos colados');
 const lk=map.lake;if(Math.hypot(lk.x-W.x,lk.z-W.z)+lk.r>W.r)bad.push('lago fora da área');
 return bad;
}

const API={generate,check,mulberry32,DECOR,LAKE_R};
if(typeof module==='object'&&module.exports)module.exports=API;else root.SKYMAP=API;
})(typeof globalThis!=='undefined'?globalThis:this);
