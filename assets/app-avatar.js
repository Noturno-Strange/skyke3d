/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Avatar: corpo, cabelo esculpido, chapéus, rosto, roupas, atores e rótulos.
 * Os arquivos assets/app-*.js são scripts comuns carregados em ordem pelo index.html e dividem o mesmo escopo global: o que um
 * declara no nível de cima, os seguintes enxergam. Código que roda ao carregar só pode usar o que já veio antes.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
// ---------- avatar arredondado ----------
const MB=new THREE.MeshBasicMaterial({color:'#7a1f1f',side:THREE.DoubleSide});
const _D=new THREE.Object3D(),_cc=new THREE.Color();let MV=null;
// bolas do corpo fundidas em uma malha: as pequenas (braços, pernas, mãos) usam esfera de menos facetas
function mergeBalls(a){if(!MV){MV=LM({vertexColors:true});MV.userData.av=1;MV.onBeforeCompile=EMI}const m=new THREE.Mesh(ballsGeo(a,q=>Math.max(q[0],q[1],q[2])<=.13?SGS:SG),MV);m.userData.mb=1;m.userData.olGeo=ballsGeo(a,q=>Math.max(q[0],q[1],q[2])<=.13?SGL:SGS);return m}
function ballsGeo(a,pick){const gs=a.map(pick);let nv=0,ni=0;gs.forEach(g=>{nv+=g.attributes.position.count;ni+=g.index.count});
 const pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),col=new Float32Array(nv*3),idx=new Uint16Array(ni);let vo=0,io=0;
 a.forEach(([rx,ry,rz,c,x,y,z],k)=>{const G=gs[k],P=G.attributes.position,Nn=G.attributes.normal,ix=G.index.array,n=P.count,L=ix.length;_cc.set(String(c).replace(/^(flat|emi):/,''));
  for(let i=0;i<n;i++){const o=(vo+i)*3;pos[o]=P.getX(i)*rx+x;pos[o+1]=P.getY(i)*ry+y;pos[o+2]=P.getZ(i)*rz+z;const nx=Nn.getX(i)/rx,ny=Nn.getY(i)/ry,nz=Nn.getZ(i)/rz,l=Math.hypot(nx,ny,nz)||1;nor[o]=nx/l;nor[o+1]=ny/l;nor[o+2]=nz/l;col[o]=_cc.r;col[o+1]=_cc.g;col[o+2]=_cc.b}
  for(let i=0;i<L;i++)idx[io+i]=ix[i]+vo;vo+=n;io+=L});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setIndex(new THREE.BufferAttribute(idx,1));return g}
const freeAv=g=>g.traverse(q=>{if(q.userData.mb){q.geometry.dispose();if(q.userData.olGeo)q.userData.olGeo.dispose()}if(q.isInstancedMesh&&q.dispose)q.dispose()});
// ---------- cabelo low-poly esculpido (campo de distância + surface nets, 1 malha por cabelo) ----------
const HR=[.36,.38,.34],HEDGE=[1.0,1.05,1.3,1.4,1.75,2.0],HCACHE=new Map();
let HM=null;
const hh=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
const hl=(i,j,k)=>hh(i*12.9898+j*78.233+k*37.719);
const vn=(x,y,z)=>{const i=Math.floor(x),j=Math.floor(y),k=Math.floor(z),u=x-i,v=y-j,w=z-k,a=u*u*(3-2*u),b=v*v*(3-2*v),d=w*w*(3-2*w),m=(p,q,t)=>p+(q-p)*t,L=(p,q,r)=>hl(i+p,j+q,k+r);return m(m(m(L(0,0,0),L(1,0,0),a),m(L(0,1,0),L(1,1,0),a),b),m(m(L(0,0,1),L(1,0,1),a),m(L(0,1,1),L(1,1,1),a),b),d)};
const hsp=(th,ph,o)=>[Math.sin(th)*Math.cos(ph)*(HR[0]+o),Math.cos(th)*(HR[1]+o),Math.sin(th)*Math.sin(ph)*(HR[2]+o)];
const hang=ph=>Math.abs(Math.atan2(Math.sin(ph-Math.PI/2),Math.cos(ph-Math.PI/2)));
const hedge=(e,a)=>{const k=[0,.9,1.35,1.57,2.1,Math.PI];for(let i=1;i<6;i++)if(a<=k[i]){const t=(a-k[i-1])/(k[i]-k[i-1]);return e[i-1]+(e[i]-e[i-1])*t*t*(3-2*t)}return e[5]};
const smin=(a,b,k)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25};
const sdE=(x,y,z,cx,cy,cz,rx,ry,rz)=>{const a=(x-cx)/rx,b=(y-cy)/ry,c=(z-cz)/rz;return(Math.sqrt(a*a+b*b+c*c)-1)*Math.min(rx,ry,rz)};
const sdS=(x,y,z,b)=>Math.hypot(x-b[0],y-b[1],z-b[2])-b[3];
const sdC=(x,y,z,a,b,r1,r2)=>{const px=x-a[0],py=y-a[1],pz=z-a[2],bx=b[0]-a[0],by=b[1]-a[1],bz=b[2]-a[2],t=Math.min(1,Math.max(0,(px*bx+py*by+pz*bz)/(bx*bx+by*by+bz*bz||1)));return Math.hypot(px-bx*t,py-by*t,pz-bz*t)-(r1+(r2-r1)*t)};
const _n=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/l,v[1]/l,v[2]/l]};
// surface nets: malha de triângulos (soltos) a partir do campo f<0 = dentro; cor por face via col(x,y,z)
function hairNets(f,col,extra,sz){
 const st=sz||.05,x0=-.85,y0=-.8,z0=-.85,nx=Math.round(1.7/st)+1,ny=Math.round(1.9/st)+1,nz=nx,V=new Float32Array(nx*ny*nz),id=(i,j,k)=>i+nx*(j+ny*k);
 for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)V[id(i,j,k)]=f(x0+i*st,y0+j*st,z0+k*st);
 const cid=(i,j,k)=>i+(nx-1)*(j+(ny-1)*k),CV=new Int32Array((nx-1)*(ny-1)*(nz-1)).fill(-1),P=[],ED=[];
 for(let a=0;a<8;a++)for(let b=0;b<3;b++)if(!(a>>b&1))ED.push([a,a|1<<b]);
 const val=new Float32Array(8);
 for(let k=0;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){let m=0;
  for(let a=0;a<8;a++){const v=V[id(i+(a&1),j+(a>>1&1),k+(a>>2&1))];val[a]=v;if(v<0)m|=1<<a}
  if(m===0||m===255)continue;let sx=0,sy=0,sz=0,n=0;
  for(const[a,b]of ED){const va=val[a],vb=val[b];if((va<0)===(vb<0))continue;const t=va/(va-vb);sx+=(a&1)+((b&1)-(a&1))*t;sy+=(a>>1&1)+((b>>1&1)-(a>>1&1))*t;sz+=(a>>2&1)+((b>>2&1)-(a>>2&1))*t;n++}
  CV[cid(i,j,k)]=P.length/3;P.push(x0+(i+sx/n)*st,y0+(j+sy/n)*st,z0+(k+sz/n)*st)}
 const T=[],D=[[1,0,0],[0,1,0],[0,0,1]];
 for(let k=1;k<nz-1;k++)for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){const v0=V[id(i,j,k)];
  for(let ax=0;ax<3;ax++){const v1=V[id(i+D[ax][0],j+D[ax][1],k+D[ax][2])];if((v0<0)===(v1<0))continue;
   const u=(ax+1)%3,w=(ax+2)%3,q=[];let ok=true;
   for(const[du,dw]of[[-1,-1],[0,-1],[0,0],[-1,0]]){const c=[i,j,k];c[u]+=du;c[w]+=dw;if(c[0]>nx-2||c[1]>ny-2||c[2]>nz-2){ok=false;break}const vi=CV[cid(c[0],c[1],c[2])];if(vi<0){ok=false;break}q.push(vi*3)}
   if(!ok)continue;const s=v0<0?1:-1,g=n=>[P[q[n]],P[q[n]+1],P[q[n]+2]],a0=g(0),a1=g(1),a2=g(2),a3=g(3),d1=[a2[0]-a0[0],a2[1]-a0[1],a2[2]-a0[2]],d2=[a3[0]-a1[0],a3[1]-a1[1],a3[2]-a1[2]],nq=[d1[1]*d2[2]-d1[2]*d2[1],d1[2]*d2[0]-d1[0]*d2[2],d1[0]*d2[1]-d1[1]*d2[0]];
   if(nq[ax]*s<0)q.reverse();
   for(const tr of[[0,1,2],[0,2,3]]){const A=q[tr[0]],B=q[tr[1]],C=q[tr[2]],e1=[P[B]-P[A],P[B+1]-P[A+1],P[B+2]-P[A+2]],e2=[P[C]-P[A],P[C+1]-P[A+1],P[C+2]-P[A+2]],cx=e1[1]*e2[2]-e1[2]*e2[1],cy=e1[2]*e2[0]-e1[0]*e2[2],cz=e1[0]*e2[1]-e1[1]*e2[0];
    if(cx*cx+cy*cy+cz*cz<1e-9)continue;T.push([A,B,C])}}}
 const NN=new Float32Array(P.length);
 T.forEach(t=>{const[A,B,C]=t,ax=P[B]-P[A],ay=P[B+1]-P[A+1],az=P[B+2]-P[A+2],bx=P[C]-P[A],by=P[C+1]-P[A+1],bz=P[C+2]-P[A+2],cx=ay*bz-az*by,cy=az*bx-ax*bz,cz=ax*by-ay*bx;t.forEach(p=>{NN[p]+=cx;NN[p+1]+=cy;NN[p+2]+=cz})});
 const X=extra||[],NTR=T.length+X.length,F=new Float32Array(NTR*9),ON=new Float32Array(NTR*9),SN=new Float32Array(NTR*9),CE=new Float32Array(NTR*3),JT=new Float32Array(NTR);
 T.forEach((t,n)=>{let cx=0,cy=0,cz=0;t.forEach((p,i)=>{const l=(Math.hypot(NN[p],NN[p+1],NN[p+2])||1)/Math.min(1,Math.max(0,(sdE(P[p],P[p+1],P[p+2],0,0,0,HR[0],HR[1],HR[2])-.03)/.07));ON[n*9+i*3]=NN[p]/l;ON[n*9+i*3+1]=NN[p+1]/l;ON[n*9+i*3+2]=NN[p+2]/l;{const q=Math.hypot(NN[p],NN[p+1],NN[p+2])||1;SN[n*9+i*3]=NN[p]/q;SN[n*9+i*3+1]=NN[p+1]/q;SN[n*9+i*3+2]=NN[p+2]/q}F[n*9+i*3]=P[p];F[n*9+i*3+1]=P[p+1];F[n*9+i*3+2]=P[p+2];cx+=P[p]/3;cy+=P[p+1]/3;cz+=P[p+2]/3});
  CE[n*3]=cx;CE[n*3+1]=cy;CE[n*3+2]=cz;JT[n]=.86+.28*hh(n)});
 X.forEach((e,m)=>{const n=T.length+m;F.set(e.v,n*9);CE[n*3]=e.m[0];CE[n*3+1]=e.m[1];CE[n*3+2]=e.m[2];JT[n]=.9+.2*hh(n)});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(F,3));g.setAttribute('onrm',new THREE.BufferAttribute(ON,3));g.setAttribute('snrm',new THREE.BufferAttribute(SN,3));g.computeVertexNormals();return{g,CE,JT}}
// cor por face a partir dos centroides guardados: trocar a cor do cabelo não refaz a malha
function paintHair(sh,col){const n=sh.JT.length,K=new Float32Array(n*9);for(let t=0;t<n;t++){const c=col(sh.CE[t*3],sh.CE[t*3+1],sh.CE[t*3+2]),j=sh.JT[t];for(let i=0;i<3;i++){K[t*9+i*3]=c.r*j;K[t*9+i*3+1]=c.g*j;K[t*9+i*3+2]=c.b*j}}return K}
// Cores brilhantes: com a chave de brilho da parte ligada, a cor vira a versão viva dela (mais saturada e mais clara); desligada, volta à cor normal da paleta
const BCM=new Map(),bc=(h,on)=>{if(!on)return h;let v=BCM.get(h);if(!v){v=vivid(h,1.5,1.15);BCM.set(h,v)}return v};
function hairGeo(c){
 let c1,c2,sk,shv;const setC=q=>{c1=new THREE.Color(bc(HAIRC[q.hair],q.rb===1));c2=c1.clone().lerp(new THREE.Color('#ffffff'),.12);sk=new THREE.Color(bc(SKIN[q.skin],q.tb===1));shv=sk.clone().lerp(c1,.5)};setC(c);
 const PI=Math.PI,hs=c.hs,E=HEDGE;
 const hd=(x,y,z)=>sdE(x,y,z,0,0,0,HR[0],HR[1],HR[2]);
 const shell=(Ed,off,nz,zig,ek)=>{ek=ek==null?.2:ek;return(x,y,z)=>{const qx=x/HR[0],qy=y/HR[1],qz=z/HR[2],l=Math.hypot(qx,qy,qz)||1,th=Math.acos(Math.max(-1,Math.min(1,qy/l))),ph=Math.atan2(qz,qx),a=hang(ph),e=hedge(Ed,a)+(zig&&a<.8?zig*Math.abs(Math.sin(x*24)):0)+.1*(vn(qx/l*3.4+3,qy/l*3.4,qz/l*3.4)-.5),r=Math.min(1,Math.max(0,(e-th)/.5)),ra=r*r*(3-2*r),o0=typeof off==='function'?off(x,y,z):off,o=o0*(ek+(1-ek)*ra)+.03*ra*Math.sin(ph*9+th*4);
  return Math.max(sdE(x,y,z,0,0,0,HR[0]+o,HR[1]+o,HR[2]+o)+(nz?nz*(vn(x*8,y*8,z*8)-.5):0),(th-e)*.33)}};
 const uni=(L,k)=>(x,y,z)=>{let d=1e9;for(let i=0;i<L.length;i++)d=smin(d,L[i](x,y,z),k);return d};
 const bl=(L,k)=>(x,y,z)=>{let d=1e9;for(let i=0;i<L.length;i++)d=smin(d,sdS(x,y,z,L[i]),k);return d};
 const sp=(th,ph,o,r)=>{const p=hsp(th,ph,o);return[p[0],p[1],p[2],r]};
 const fibL=(n,tmax,fn)=>{const L=[];for(let k=0;k<n;k++){const th=Math.acos(1-(1-Math.cos(tmax))*(k+.5)/n),ph=k*2.39996,b=fn(th,ph,k);if(b)L.push(b)}return L};
 const el=(cx,cy,cz,rx,ry,rz)=>(x,y,z)=>sdE(x,y,z,cx,cy,cz,rx,ry,rz);
 const chain=(pts,r0,r1)=>uni(pts.slice(1).map((p,i)=>{const t0=i/(pts.length-1),t1=(i+1)/(pts.length-1);return(x,y,z)=>sdC(x,y,z,pts[i],p,r0+(r1-r0)*t0,r0+(r1-r0)*t1)}),.03);
 const spike=(th,ph,len,r)=>{const b=hsp(th,ph,.03),n=_n([b[0]/(HR[0]*HR[0]),b[1]/(HR[1]*HR[1]),b[2]/(HR[2]*HR[2])]),d=_n([n[0]*.6,n[1]*.6+.8,n[2]*.6]);return(x,y,z)=>sdC(x,y,z,b,[b[0]+d[0]*len,b[1]+d[1]*len,b[2]+d[2]*len],r,.012)};
 const okf=(Ed,m)=>(th,ph)=>th<hedge(Ed,hang(ph))-(m||.08);
 const SD=(x,y,z)=>Math.abs(x)>.13?1:0;
 const col0=(x,y,z)=>{const d=hd(x,y,z),ph=Math.atan2(z,x),th=Math.atan2(Math.hypot(x,z),y),st=.5+.5*Math.sin(ph*6+th*3+vn(x*3,y*3,z*3)*2.5),sh=(.78+.22*Math.min(1,Math.max(0,d/.14)))*(.92+.16*st);return c1.clone().lerp(c2,.4*Math.min(1,Math.max(0,(d-.03)/.3))).multiplyScalar(sh)};
 let f,col=col0;
 const AFE=[.9,.95,1.1,1.2,1.7,2.1],LNG=[1.0,1.05,1.3,1.6,2.1,2.3];
 const pig=(q,y1)=>chain([[q*.3,.3,-.12],[q*.4,.2,-.14],[q*.46,0,-.15],[q*.5,-.2,-.16],[q*.5,y1,-.15]],.09,.035);
 const mh=(n,h,r)=>{const L=[];for(let k=0;k<n;k++){const t=k/(n-1),th=t<.5?.62*(1-t*2):(t-.5)*2*1.5;L.push(spike(Math.max(th,.02),t<.5?PI/2:3*PI/2,h+.1*Math.sin(t*PI),r))}return L};
 const sh3=(sideThin,topOff)=>shell([1.0,1.05,1.35,1.4,1.75,2.0],(x,y,z)=>.02+topOff*Math.exp(-x*x/.012),0);
 switch(hs){
 case 0:f=shell(AFE,.3,.1,0,.6);break;
 case 1:f=uni([shell(E,.04,0),bl(fibL(80,1.9,(th,ph)=>okf(E)(th,ph)?sp(th,ph,.08,.1):null),.04)],.04);break;
 case 2:f=uni([shell(E,.1,.02),el(0,.55,-.12,.2,.18,.2)],.06);break;
 case 3:f=uni([sh3(0,.09)].concat(mh(9,.14,.075)),.03);col=(x,y,z)=>col0(x,y,z).lerp(shv,SD(x,y,z)*.7);break;
 case 4:f=uni([shell(E,.1,.02),pig(-1,-.34),pig(1,-.34)],.05);break;
 case 5:f=uni([shell([.88,.94,1.2,1.3,1.8,2.1],.17,.06),bl(fibL(40,2.0,(th,ph)=>(th>.7&&hang(ph)<1.2||th>1.1&&Math.abs(hang(ph)-1.57)<.4)?null:sp(th,ph,.2,.16)),.06)],.05);break;
 case 6:f=uni([shell(E,.08,.02)].concat(fibL(40,1.4,(th,ph,k)=>(th>.6&&hang(ph)<1.25)?null:spike(th,ph,.22+.1*hh(k*3.1),.1))),.03);break;
 case 7:f=uni([shell([1.05,1.1,1.4,1.45,1.75,2.0],(x,y,z)=>y>.18?.12:.02,0),el(.03,.34,.1,.32,.16,.3)],.07);col=(x,y,z)=>col0(x,y,z).lerp(shv,y<.18&&hd(x,y,z)<.03?.7:0);break;
 case 8:f=shell(E,.12,.025,.08);break;
 case 9:f=uni([shell(E,.1,.02),chain([[0,.3,-.3],[0,.28,-.42],[0,.12,-.52],[0,-.1,-.54],[0,-.35,-.5]],.1,.035)],.05);break;
 case 10:f=uni([shell(E,.1,.02),el(-.24,.5,-.05,.15,.14,.15),el(.24,.5,-.05,.15,.14,.15)],.06);break;
 case 11:{const R=[];[1.1,1.45,1.8,2.1].forEach((th,ri)=>{const n=16-ri;for(let k=0;k<n;k++){const ph=(k+ri*.5)/n*2*PI;if(hang(ph)<1.4&&th>.9)continue;R.push(sp(th,ph,.12,.1))}});f=uni([shell(LNG,.1,.02),bl(R,.04)],.04);break}
 case 12:f=uni([shell(E,.12,.025,.1),el(0,.3,.2,.34,.1,.2)],.05);break;
 case 13:f=uni([shell(E,.1,.02),bl(fibL(12,0,()=>null).concat(Array.from({length:12},(_,k)=>sp(.62,k/12*2*PI+.2,.2,.1)),[sp(.1,0,.25,.14)]),.05)],.05);break;
 case 14:f=uni([shell(E,.1,.02),el(0,.6,0,.25,.24,.25)],.07);break;
 case 15:f=uni([shell(E,.1,.02),chain([[-.3,.3,-.12],[-.42,.15,-.2],[-.46,-.05,-.27],[-.46,-.28,-.3],[-.44,-.46,-.3]],.1,.04),chain([[.3,.3,-.12],[.42,.15,-.2],[.46,-.05,-.27],[.46,-.28,-.3],[.44,-.46,-.3]],.1,.04)],.05);break;
 case 16:{const R=[];[-1,1].forEach(q=>[[.4,.1],[.45,-.08],[.42,-.24],[.38,-.38]].forEach(([x,y])=>{R.push([q*x,y,-.26,.13]);R.push([q*(x-.07),y-.03,-.18,.1])}));f=uni([shell(LNG,.12,.03),bl(R,.05)],.05);break}
 case 17:f=uni([sh3(0,.07)].concat(mh(11,.24,.09)),.03);col=(x,y,z)=>col0(x,y,z).lerp(shv,SD(x,y,z)*.7);break;
 case 18:f=uni([shell(E,.1,.02),chain([[.22,.3,-.2],[.4,.12,-.3],[.52,-.1,-.28],[.5,-.35,-.22]],.1,.035)],.05);break;
 case 19:f=uni([shell(E,.1,.02),el(-.27,.5,-.02,.16,.16,.16),el(.27,.5,-.02,.16,.16,.16)],.06);break;
 case 20:{const R=fibL(70,1.9,(th,ph)=>okf(E)(th,ph)?sp(th,ph,.2,.1):null);f=uni([shell(E,.1,.02),bl(R,.02)],.03);col=(x,y,z)=>{let b=-1,bd=.09;R.forEach((q,i)=>{const d=Math.hypot(x-q[0],y-q[1],z-q[2]);if(d<q[3]+.04&&d<bd+9){bd=d;b=i}});return b>=0?new THREE.Color(HAIRC[(b*5+3)%12]):c1.clone()};break}
 case 21:f=uni([shell(E,.1,.02),el(0,.3,-.02,.3,.14,.28),el(0,.46,-.02,.25,.12,.23),el(0,.6,-.02,.19,.1,.17),el(0,.71,-.02,.13,.09,.12),el(0,.82,-.02,.06,.08,.06)],.05);break;
 case 22:f=uni([shell(E,.1,.02),el(-.3,.4,-.03,.14,.13,.1),el(.3,.4,-.03,.14,.13,.1)],.05);break;
 case 24:{const E24=[1.05,1.1,1.5,1.55,1.9,2.1],bk=(x,y,z)=>{const rr=(x/.42)*(x/.42)+(z/.4)*(z/.4),q0=(Math.sqrt(rr)-1)*.4+.07,q1=Math.max(y-(.53-.1*rr),.13-y)+.07,qx=Math.hypot(x/HR[0],y/HR[1],z/HR[2]),th=Math.acos(Math.max(-1,Math.min(1,y/HR[1]/(qx||1))));return Math.max(Math.hypot(Math.max(q0,0),Math.max(q1,0))+Math.min(Math.max(q0,q1),0)-.07,(th-hedge(E24,hang(Math.atan2(z/HR[2],x/HR[0]))))*.33)};f=uni([shell([1.1,1.15,1.5,1.55,1.9,2.1],.02,0),bk],.03);col=(x,y,z)=>col0(x,y,z).lerp(shv,y<.14&&hd(x,y,z)<.04?.7:0);break}
 case 25:f=shell([1.1,1.15,1.45,1.55,1.9,2.1],.014,.01,0,1);col=(x,y,z)=>col0(x,y,z).lerp(shv,.75);break;
 case 26:f=uni([shell(E,(x,y,z)=>.09-.05*Math.tanh((x-.1)/.05),.02),el(-.1,.33,.12,.27,.12,.22)],.06);break;
 case 27:f=uni([shell([1.0,1.05,1.3,1.5,1.9,2.1],.1,.02),el(0,-.02,-.24,.4,.4,.17),el(-.4,0,-.1,.09,.36,.2),el(.4,0,-.1,.09,.36,.2)],.07);break;
 case 28:{const L=[shell(E,.09,.025)];for(let k=0;k<24;k++){const ph=k/24*2*PI+.1,a=hang(ph);if(Math.abs(a-1.57)<.3)continue;const th=hedge(E,a)-.08,[bx,by,bz]=hsp(th,ph,.05),nr=_n([bx/(HR[0]*HR[0]),by/(HR[1]*HR[1]),bz/(HR[2]*HR[2])]);let d=[Math.cos(th)*Math.cos(ph)*HR[0],-Math.sin(th)*HR[1],Math.cos(th)*Math.sin(ph)*HR[2]];const q=d[0]*nr[0]+d[1]*nr[1]+d[2]*nr[2];d=_n([d[0]-nr[0]*q+nr[0]*.35,d[1]-nr[1]*q+nr[1]*.35,d[2]-nr[2]*q+nr[2]*.35]);const len=(a<.9?.07:.12)+.05*hh(k*3.7);L.push((x,y,z)=>sdC(x,y,z,[bx,by,bz],[bx+d[0]*len,by+d[1]*len,bz+d[2]*len],.05,.01))}fibL(16,1.0,(th,ph,k)=>L.push(spike(th,ph,.12+.06*hh(k*2.9),.07)));f=uni(L,.03);break}
 case 29:f=uni([shell([1.0,1.05,1.35,1.45,1.8,2.0],(x,y,z)=>y>.15?.12:.035,.015),el(.02,.3,.04,.3,.13,.26)],.06);break;
 case 30:{const L=[shell(E,.1,.02)];for(let k=0;k<9;k++){const ph=PI+.3+k/8*(PI-.6),p=hsp(1.25,ph,.04),cx=Math.cos(ph),cz=Math.sin(ph);L.push(chain([p,[p[0]+cx*.07,p[1]-.16,p[2]+cz*.07],[p[0]+cx*.1,-.2,p[2]+cz*.1],[p[0]+cx*.11,-.5,p[2]+cz*.11]],.065,.04))}f=uni(L,.05);break}
 case 31:f=uni([shell([1.05,1.1,1.4,1.45,1.75,2.0],(x,y,z)=>.02+.1*(.5+.5*Math.tanh((y-.2)/.06)),0),el(0,.5,.17,.23,.18,.3),el(0,.63,.09,.17,.12,.26)],.08);col=(x,y,z)=>col0(x,y,z).lerp(shv,y<.18&&hd(x,y,z)<.03?.7:0);break;
 case 32:f=uni([shell(E,.1,.02,.08),el(0,.36,-.04,.3,.12,.28),el(0,0,-.28,.28,.26,.12),chain([[0,.1,-.34],[0,-.06,-.42],[0,-.18,-.44],[0,-.3,-.42]],.22,.08)],.07);break;
 case 33:f=uni([shell([1.1,1.15,1.45,1.55,1.9,2.1],.04,.01),chain([[0,.38,-.12],[0,.58,-.16],[0,.7,-.08],[0,.72,.06]],.085,.055),el(0,.55,-.15,.1,.05,.1)],.04);break;
 default:f=shell(E,(x,y,z)=>.03+.035*Math.max(0,Math.cos(Math.atan2(z,x)*14)),0)}
 const WN={0:6,1:12,2:12,4:12,5:10,8:14,9:12,10:12,11:10,12:14,13:12,14:12,15:12,16:8,18:12,19:12,20:6,22:12,23:6,26:14,27:8,28:0,29:10,7:8},PE=HPAINT(hs).E,wi=[],nW=WN[hs]==null?0:WN[hs];
 for(let k=0;k<nW;k++){const ph=(k+.5*hh(k*2.3+hs))/nW*2*PI,a=hang(ph),th=hedge(PE,a)-.04-.1*hh(k*3.3+hs);if(a<.45||Math.abs(a-1.57)<.3&&th>1.15)continue;
  const b=hsp(th,ph,.07),nr=_n([b[0]/(HR[0]*HR[0]),b[1]/(HR[1]*HR[1]),b[2]/(HR[2]*HR[2])]);let d=[Math.cos(th)*Math.cos(ph)*HR[0],-Math.sin(th)*HR[1],Math.cos(th)*Math.sin(ph)*HR[2]];const q=d[0]*nr[0]+d[1]*nr[1]+d[2]*nr[2];d=_n([d[0]-nr[0]*q,d[1]-nr[1]*q,d[2]-nr[2]*q]);
  const wd=_n([d[1]*nr[2]-d[2]*nr[1],d[2]*nr[0]-d[0]*nr[2],d[0]*nr[1]-d[1]*nr[0]]),len=.1+.1*hh(k*5.1+hs),lat=(hh(k*9.9+hs)-.5)*.8,pts=[b];
  for(let i=1;i<=4;i++){const t=i/4,pr=pts[i-1],st=len/4;pts.push([pr[0]+(d[0]+nr[0]*(.3-.5*t)+wd[0]*lat*t)*st,pr[1]+(d[1]+nr[1]*(.3-.5*t)+wd[1]*lat*t)*st,pr[2]+(d[2]+nr[2]*(.3-.5*t)+wd[2]*lat*t)*st])}
  const wv=i=>.028*(1-i/4),P2=i=>[[pts[i][0]-wd[0]*wv(i),pts[i][1]-wd[1]*wv(i),pts[i][2]-wd[2]*wv(i)],[pts[i][0]+wd[0]*wv(i),pts[i][1]+wd[1]*wv(i),pts[i][2]+wd[2]*wv(i)]];
  for(let i=0;i<4;i++){const A=P2(i),B=P2(i+1),m=pts[i];wi.push({v:[...A[0],...A[1],...B[0],],m});if(i<3)wi.push({v:[...A[1],...B[1],...B[0]],m})}}
 const F=(x,y,z)=>Math.max(f(x,y,z),-hd(x,y,z)-.03);return{shape:hairNets(F,col,wi),setC,col,mkLo:()=>hairNets((x,y,z)=>F(x,y,z)-.01,col,[],.075)}}
const HOL=new Map();
const holOfHex=(h,w)=>{w=w||.034;const kk='k'+w;let om=HOL.get(kk);if(!om){om=new THREE.ShaderMaterial({uniforms:{w:{value:w},col:{value:new THREE.Color('#0a0705')}},vertexShader:'attribute vec3 onrm;uniform float w;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position+onrm*w,1.);}',fragmentShader:'uniform vec3 col;void main(){gl_FragColor=linearToOutputTexel(vec4(col,1.));}',side:THREE.BackSide});HOL.set(kk,om)}return om},holOf=c=>holOfHex(HAIRC[c.hair]);
const HSH=new Map();
// malha grossa (por estilo): serve de contorno e de nível de detalhe para avatares distantes
function loGeo(sh,key,c){const lo=sh.lo||(sh.lo=sh.mkLo());let g=HCACHE.get(key);if(!g){sh.setC(c);const A=lo.g.attributes;g=new THREE.BufferGeometry();g.setAttribute('position',A.position);g.setAttribute('normal',A.normal);g.setAttribute('onrm',A.onrm);g.setAttribute('color',new THREE.BufferAttribute(paintHair(lo,sh.col),3));HCACHE.set(key,g)}return g}
const HMC=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <dithering_fragment>','vec3 hn=normalize(normal);float rim=smoothstep(.5,.95,1.-clamp(dot(hn,normalize(vViewPosition)),0.,1.));float lm=dot(gl_FragColor.rgb,vec3(.3,.59,.11)),dk=1.-smoothstep(.0,.45,lm);gl_FragColor.rgb+=(rim*(.03+.07*dk)+step(.72,dot(hn,normalize(vec3(-.35,.75,.55))))*(.03+.08*dk))*(vec3(.85)+gl_FragColor.rgb*.6);\n#include <dithering_fragment>')};
function hairMat(){if(!HM){tg();HM=new THREE.MeshToonMaterial({vertexColors:true,gradientMap:TG,side:THREE.DoubleSide});HM.flatShading=true;HM.userData.av=1;HM.onBeforeCompile=sh=>{EMI(sh);HMC(sh)}}}
function hairNew(hd,c){const k=c.hs+'|'+c.hair+'|'+c.skin+'|'+(c.rb===1?1:0)+(c.tb===1?1:0);let g=HCACHE.get(k);if(!g){if(HCACHE.size>60){HCACHE.forEach(v=>v.dispose());HCACHE.clear()}
  let sh=HSH.get(c.hs);if(!sh){sh=hairGeo(c);HSH.set(c.hs,sh)}
  sh.setC(c);const K=paintHair(sh.shape,sh.col),A=sh.shape.g.attributes;g=new THREE.BufferGeometry();g.setAttribute('position',A.position);g.setAttribute('normal',A.normal);g.setAttribute('onrm',A.onrm);g.setAttribute('color',new THREE.BufferAttribute(K,3));HCACHE.set(k,g)}
 hairMat();const sh=HSH.get(c.hs),cc={hair:c.hair,skin:c.skin,hc:c.hc,rb:c.rb,tb:c.tb,hb:c.hb},m=new THREE.Mesh(g,HM);m.userData.lodG=()=>loGeo(sh,k+'|lo',cc);hd.add(m);
 const o=new THREE.Mesh((sh.lo||(sh.lo=sh.mkLo())).g,holOf(c));o.userData.ol=1;hd.add(o)}
// chapéus justos (gorro, bucket, cowboy): mesmo motor de escultura do cabelo, moldados na cabeça; por baixo só há o couro cabeludo pintado
const HTSH=new Map();let HTM=null;
function hatGeo(h){
 let c1,c2;const setC=q=>{c1=new THREE.Color(bc(PAL[q.hc|0],q.hb===1));c2=new THREE.Color(bc(PAL[((q.hc|0)+5)%PAL.length],q.hb===1))};setC({hc:0});
 const hdd=(x,y,z)=>sdE(x,y,z,0,0,0,HR[0],HR[1],HR[2]),ang=(x,y,z)=>{const qx=x/HR[0],qy=y/HR[1],qz=z/HR[2],l=Math.hypot(qx,qy,qz)||1;return[Math.acos(Math.max(-1,Math.min(1,qy/l))),Math.atan2(qz,qx)]};
 const dome=(Ed,o,rib)=>(x,y,z)=>{const[th,ph]=ang(x,y,z),e=hedge(Ed,hang(ph)),oo=o+(rib?rib(th,ph,e):0);return Math.max(sdE(x,y,z,0,0,0,HR[0]+oo,HR[1]+oo,HR[2]+oo),(th-e)*.33)};
 const E2=[1.0,1.05,1.4,1.75,2.0,2.05];
 let f,col;
 if(h===1){const d=dome(E2,.06,(th,ph,e)=>th>e-.16?.025+.008*Math.sin(ph*30):0),pp=(x,y,z)=>sdS(x,y,z,[0,.5,0,.09]);
  f=(x,y,z)=>smin(d(x,y,z),pp(x,y,z),.03);
  col=(x,y,z)=>{const[th,ph]=ang(x,y,z),e=hedge(E2,hang(ph));return th>e-.16||y>.46?c2.clone().multiplyScalar(.9+.1*Math.sin(ph*30)):c1.clone()}}
 else{ // 2 = bucket (copa cônica + aba caída), 3 = cowboy (copa alta + aba larga virada nas laterais)
  const cow=h===3,yb=(x,z)=>.23-.12*Math.max(0,-z/.4+Math.abs(x)/.4*.3),R0=cow?.36:.43,TP=cow?.1:.07,YT=cow?.6:.47,
   crown=(x,y,z)=>{const b=yb(x,z),k=Math.max(0,y-b)*(cow?.25:.6),rx=R0-k,rz=R0*.95-k,rr=Math.hypot(x/rx,z/rz),q0=(rr-1)*.4+.06,q1=Math.max(y-(YT-(cow?.05:0)*rr*rr),b-y)+.06;return Math.hypot(Math.max(q0,0),Math.max(q1,0))+Math.min(Math.max(q0,q1),0)-.06},
   brim=(x,y,z)=>{const r=Math.hypot(x,z),yy=cow?y-.2*(x/.78)*(x/.78)+.06*Math.max(0,z/.66):y+.4*Math.max(0,r-.45);return sdE(x,yy,z,0,.27,0,cow?.78:.66,cow?.05:.045,cow?.66:.62)};
  f=(x,y,z)=>smin(crown(x,y,z),brim(x,y,z),.03);
  col=(x,y,z)=>{const b=yb(x,z),r=Math.hypot(x,z);return(y-b<.085&&y>b-.02&&r<.5?c2:c1).clone()}}
 const F=(x,y,z)=>Math.max(f(x,y,z),-hdd(x,y,z)-.03);return{shape:hairNets(F,col,[],.042),setC,col,mkLo:()=>hairNets((x,y,z)=>F(x,y,z)-.012,col,[],.06)}}
function hatNew(hd,c){const k='H'+c.hat+'|'+c.hc+'|'+(c.hb===1?1:0);let g=HCACHE.get(k);if(!g){if(HCACHE.size>60){HCACHE.forEach(v=>v.dispose());HCACHE.clear()}
  let sh=HTSH.get(c.hat);if(!sh){sh=hatGeo(c.hat);sh.shape.JT.fill(1);sh.shape.g.setAttribute('normal',sh.shape.g.attributes.snrm);HTSH.set(c.hat,sh)}
  sh.setC(c);const K=paintHair(sh.shape,sh.col),A=sh.shape.g.attributes;g=new THREE.BufferGeometry();g.setAttribute('position',A.position);g.setAttribute('normal',A.normal);g.setAttribute('onrm',A.onrm);g.setAttribute('color',new THREE.BufferAttribute(K,3));HCACHE.set(k,g)}
 if(!HTM){tg();HTM=new THREE.MeshToonMaterial({vertexColors:true,gradientMap:TG});HTM.userData.av=1;HTM.onBeforeCompile=EMI}
 const sh=HTSH.get(c.hat),cc={hc:c.hc},m=new THREE.Mesh(g,HTM);m.userData.lodG=()=>loGeo(sh,k+'|lo',cc);hd.add(m);
 const o=new THREE.Mesh((sh.lo||(sh.lo=sh.mkLo())).g,holOfHex(PAL[c.hc|0],.011));o.userData.ol=1;hd.add(o)}
// couro cabeludo pintado: textura da cabeça com a cor do cabelo sob a linha de cabelo (degradê) e tom raspado
const SGH=new THREE.SphereGeometry(1,28,20),HTX=new Map(),sstep=(a,b,t)=>{const u=Math.min(1,Math.max(0,(t-a)/(b-a)));return u*u*(3-2*u)};
const HPAINT=hs=>hs===0?{E:[.9,.95,1.1,1.2,1.7,2.1]}:hs===5?{E:[.88,.94,1.2,1.3,1.8,2.1]}:(hs===11||hs===16)?{E:[1.0,1.05,1.3,1.6,2.1,2.3]}:hs===24?{E:[1.1,1.15,1.5,1.55,1.9,2.1],sv:(x,y)=>y<.14}:hs===25?{E:[1.1,1.15,1.45,1.55,1.9,2.1],sv:()=>true}:hs===27?{E:[1.0,1.05,1.3,1.5,1.9,2.1]}:(hs===3||hs===17)?{E:[1.15,1.2,1.5,1.55,1.9,2.1],sv:x=>Math.abs(x)>.13}:(hs===7||hs===31)?{E:[1.2,1.25,1.5,1.55,1.9,2.1],sv:(x,y)=>y<.18}:{E:HEDGE};
const FW=512,FH=256;let HPX=null;const HW=new Map();
// dados por pixel da textura da cabeça (independentes do visual): calculados uma vez
function hpx(){if(HPX)return HPX;const N=FW*FH,X=new Float32Array(N),Y=new Float32Array(N),Z=new Float32Array(N),TH=new Float32Array(N),AN=new Float32Array(N),NZ=new Float32Array(N),NH=new Float32Array(N);
 for(let py=0;py<FH;py++){const th=Math.PI*(py+.5)/FH,sn=Math.sin(th),cs=Math.cos(th);for(let px=0;px<FW;px++){const ph=2*Math.PI*(px+.5)/FW,i=py*FW+px,cp=Math.cos(ph),sp=Math.sin(ph);
  X[i]=-cp*sn*HR[0];Y[i]=cs*HR[1];Z[i]=sp*sn*HR[2];TH[i]=th;AN[i]=hang(ph);NZ[i]=.1*(vn(-cp*sn*3.4+3,cs*3.4,sp*sn*3.4)-.5);NH[i]=hh(i*.7)}}
 return HPX={X,Y,Z,TH,AN,NZ,NH}}
// peso do couro cabeludo pintado (e flag de raspado) por estilo: independe da cor, então fica em cache
function hw(key,P,H){let o=HW.get(key);if(o)return o;if(HW.size>12)HW.clear();const N=FW*FH,w=new Float32Array(N),sv=new Uint8Array(N);
 for(let i=0;i<N;i++){const th=H.TH[i];if(th>=2.5)continue;const e=hedge(P.E,H.AN[i])+H.NZ[i];if(th<e){const q=1-sstep(e-.14,e,th);if(q>0){w[i]=q;sv[i]=P.sv&&P.sv(H.X[i],H.Y[i],H.Z[i])?1:0}}}
 HW.set(key,o={w,sv});return o}
// textura da cabeça: pele + couro cabeludo pintado + rosto (olhos, boca, língua, bochechas). mv = abertura da boca (0 normal, 1 alta, 2 grito)
function headMat(c,mv){
 mv=mv|0;const hat=c.hat|0,fc=c.fc|0,eb=c.eb===1,key=[hat?'h'+hat:c.hs,c.hair,c.skin,fc,c.eye|0,eb?1:0,c.rb===1?1:0,c.tb===1?1:0,mv].join();let m=HTX.get(key);if(m)return m;
 if(HTX.size>40){HTX.forEach(v=>{v.map.dispose();v.dispose()});HTX.clear()}
 const cv=document.createElement('canvas');cv.width=FW;cv.height=FH;
 const g=cv.getContext('2d'),im=g.createImageData(FW,FH),d=im.data,P=hat?{E:[1.0,1.05,1.35,1.5,1.9,2.1]}:HPAINT(c.hs),H=hpx(),
  rgb=h=>{const q=new THREE.Color(h);return[q.r,q.g,q.b]},sk=rgb(bc(SKIN[c.skin],c.tb===1)),c1=rgb(bc(HAIRC[c.hair|0],c.rb===1)),dk=c1.map(v=>v*.8),shv=sk.map((v,i)=>v+(c1[i]-v)*.5),
  ec0=rgb(EYE[c.eye|0]),ec=eb?rgb(vivid(EYE[c.eye|0],2)):ec0,er=ec0.map(v=>v*.45),red=rgb('#d62839'),ink=rgb('#0a0705'),wh=[1,1,1],tg2=rgb('#ff4f86'),bl=rgb('#ff5f8f'),ms=[[1,1],[1,1.6],[1.3,2.6]][mv],
  cov=q=>q>.0045?0:q<-.0045?1:.5-q/.009,el=(x,y,cx,cy,rx,ry)=>(Math.hypot((x-cx)/rx,(y-cy)/ry)-1)*Math.min(rx,ry),
  tear=rgb('#6ec6ff'),sg=(x,y,ax,ay,bx,by,t)=>{const dx=bx-ax,dy=by-ay,u=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-ax-dx*u,y-ay-dy*u)-t/2},
  arc=(x,y,cx,cy,r,t,up)=>{const dx=x-cx,dy=(y-cy)*(up?1:-1);return dy>=0?Math.abs(Math.hypot(dx,dy)-r)-t/2:Math.hypot(Math.abs(dx)-r,dy)-t/2};
 const Wt=P?hw(hat?'hat'+hat:c.hs,P,H):null;const enc=v=>v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055;let r=0,gg=0,b=0;const put=(col,q)=>{const k=cov(q);if(k>0){r+=(col[0]-r)*k;gg+=(col[1]-gg)*k;b+=(col[2]-b)*k}};
 for(let i=0;i<FW*FH;i++){const x=H.X[i],y=H.Y[i],z=H.Z[i],th=H.TH[i];r=sk[0];gg=sk[1];b=sk[2];
  if(Wt){const w=Wt.w[i];if(w>0){const col=Wt.sv[i]?shv:dk,n=.95+.1*H.NH[i];r+=(col[0]*n-r)*w;gg+=(col[1]*n-gg)*w;b+=(col[2]*n-b)*w}}
  if(z>0&&y<.22&&y>-.32){
   if(fc===7)for(const sd of[-1,1])put(bl,el(x,y,sd*.22,-.03,.07,.045));
   for(const sd of[-1,1]){const ex=sd*.13;
    if(fc===2||(fc===3&&sd===1))put(ink,arc(x,y,ex,.04,.065,.028,true));
    else if(fc===11)put(ink,arc(x,y,ex,.075,.065,.028,false));
    else{const bb=fc===4?1.15:1,cl=fc===9?[ex+sd*.11,.14,ex-sd*.08,.07]:fc===10?[ex+sd*.11,.07,ex-sd*.08,.16]:null,
      cut=q=>{if(!cl)return q;const dx=cl[2]-cl[0],dy=cl[3]-cl[1],L=Math.hypot(dx,dy);return Math.max(q,Math.sign(dx)*((x-cl[0])*-dy+(y-cl[1])*dx)/L)},
      q=cut(el(x,y,ex,.06,.095*bb,.11*bb));put(ink,q-.011);put(wh,q);const ix=fc===4?.04:.055,iy=fc===4?.05:.065;if(eb)put(er,cut(el(x,y,ex,.06,ix,iy)));put(ec,cut(el(x,y,ex,.06,eb?ix*.8:ix,eb?iy*.8:iy)));put(wh,cut(el(x,y,ex+.02,.09,eb?.028:.02,eb?.028:.02)));
      // olho brilhante: anel escuro da mesma cor, íris clara e um segundo reflexo embaixo
      if(eb)put(wh,cut(el(x,y,ex-.022,.035,.011,.011)));
      if(cl){put(ink,sg(x,y,cl[0],cl[1],cl[2],cl[3],.03));if(fc===9)put(ink,sg(x,y,ex+sd*.1,.2,ex-sd*.08,.15,.024));else put(ink,sg(x,y,ex+sd*.1,.15,ex-sd*.09,.2,.024))}
      if(fc===10&&sd===1)put(tear,el(x,y,.2,-.07,.022,.04))}}
   const mx=x/ms[0],my=(y+.1)/ms[1];
   if(fc===1)put(red,arc(mx,my,0,.05,.1,.024,false));
   else if(fc===8)put(red,sg(mx,my,-.06,0,.06,0,.026));
   else if(fc===9)put(red,sg(mx,my,-.07,.01,.07,.01,.026));
   else if(fc===10)put(red,arc(mx,my,0,-.04,.07,.026,true));
   else if(fc===11)put(red,Math.max(el(mx,my,0,-.02,.05,.04),my+.0));
   else if(fc===4)put(red,el(mx,my,0,-.05,.055,.055));
   else{put(red,Math.max(Math.hypot(mx,my)-.12,my));if(fc===6)put(wh,Math.max(el(mx,my,0,-.005,.11,.0495),my+.005));if(fc===5)put(tg2,Math.max(el(mx,my,.03,-.09,.045,.06),Math.hypot(mx,my)-.115))}}
  const o=i*4;d[o]=enc(r)*255;d[o+1]=enc(gg)*255;d[o+2]=enc(b)*255;d[o+3]=255}
 g.putImageData(im,0,0);const t=new THREE.CanvasTexture(cv);t.anisotropy=4;m=LM({map:t});m.userData.av=1;m.onBeforeCompile=EMI;HTX.set(key,m);return m}
function ears(hd,sk,gl){[-1,1].forEach(s=>{const e=ell(.07,.1,.045,sk,s*.36,0,0,hd,SGS);e.userData.big=1;if(gl)e.userData.gl=1})}
// estilo ilustrado do avatar: toon em todas as peças e contorno (casco invertido, no espaço da câmera) nas peças grandes
// reflexo brilhante: cores escuras e profundas (preto, rubi, safira...) ganham um realce de luz (gl); nada de acentos dentro do GLSL
const EMI=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
totalEmissiveRadiance+=diffuseColor.rgb*.42;
{float mx=max(max(diffuseColor.r,diffuseColor.g),diffuseColor.b);
 float gl=1.-smoothstep(.40,.62,mx);
 vec3 Vd=normalize(vViewPosition);
 float sp=pow(max(dot(reflect(-normalize(vec3(.35,.75,.6)),normal),Vd),0.),22.)+.25*pow(max(dot(reflect(-normalize(vec3(-.6,.3,.5)),normal),Vd),0.),12.);
 totalEmissiveRadiance+=vec3(.85,.92,1.)*sp*gl*.9;}`)};
// Cores brilhantes (opção do jogador): versão de cada material com reflexo em todas as cores (não só nas escuras), cor mais viva e um
// brilho de borda. Cada material ganha uma cópia "brilhante" guardada em cache; a escolha vale para o avatar inteiro.
const EMIG=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
totalEmissiveRadiance+=diffuseColor.rgb*.42;
{vec3 Vd=normalize(vViewPosition);
 float sp=pow(max(dot(reflect(-normalize(vec3(.35,.75,.6)),normal),Vd),0.),22.)+.25*pow(max(dot(reflect(-normalize(vec3(-.6,.3,.5)),normal),Vd),0.),12.);
 float lu=dot(diffuseColor.rgb,vec3(.3,.59,.11));vec3 vv=clamp(mix(vec3(lu),diffuseColor.rgb,1.4),0.,1.);
 totalEmissiveRadiance+=(vv-diffuseColor.rgb)*.5+vec3(.9,.95,1.)*sp*1.1+vv*pow(1.-clamp(dot(normal,Vd),0.,1.),3.)*.3;}`)};
const GLOSSM=new WeakMap();
function glossyOf(m){if(!m||m.isShaderMaterial||m.isMeshBasicMaterial)return m;let g=GLOSSM.get(m);if(!g){g=m.clone();g.userData={...m.userData,gloss:1};
 const hair=m===HM;g.onBeforeCompile=hair?sh=>{EMIG(sh);HMC(sh)}:EMIG;g.customProgramCacheKey=()=>'gloss'+(hair?'h':'');GLOSSM.set(m,g)}return g}
const TOONM=new WeakMap(),OLB=new THREE.ShaderMaterial({uniforms:{w:{value:.026},col:{value:new THREE.Color('#0a0705')}},vertexShader:'uniform float w;void main(){vec3 n=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);p.xyz+=n*w;gl_Position=projectionMatrix*p;}',fragmentShader:'uniform vec3 col;void main(){gl_FragColor=linearToOutputTexel(vec4(col,1.));}',side:THREE.BackSide});
const toonOf=m=>{if(m.isMeshBasicMaterial||m.isShaderMaterial||m.userData.av)return m;let t=TOONM.get(m);if(!t){t=m.isMeshToonMaterial?m.clone():new THREE.MeshToonMaterial({color:m.color,map:m.map||null,vertexColors:m.vertexColors,gradientMap:tg(),side:m.side});t.gradientMap=tg();if(m.flatShading)t.flatShading=true;t.userData.av=1;t.onBeforeCompile=EMI;TOONM.set(m,t)}return t};
function avatarStyle(g){const L=[],ols=[],lod=[];g.traverse(q=>{if(q.isMesh&&q.material){L.push(q);if(q.userData.ol)ols.push(q)}});
 L.forEach(q=>{const m=q.material;if(m.isShaderMaterial||q.userData.ol)return;const big=q.userData.mb||q.userData.head||q.userData.big||((q.geometry===SG||q.geometry===SGS)&&Math.max(q.scale.x,q.scale.y,q.scale.z)>=.12);q.material=g.userData.gloss||q.userData.gl?glossyOf(toonOf(m)):toonOf(m);if(q.userData.mb)lod.push({m:q,hi:q.geometry,lo:q.userData.olGeo});else if(q.userData.head)lod.push({m:q,hi:q.geometry,lo:SGS});else if(q.userData.lodG)lod.push({m:q,hi:q.geometry,mk:q.userData.lodG});
  if(big&&!m.isMeshBasicMaterial){const o=new THREE.Mesh(q.userData.olGeo||(q.userData.head?SGS:q.geometry),OLB);o.position.copy(q.position);o.quaternion.copy(q.quaternion);o.scale.copy(q.scale);o.userData.ol=1;q.parent.add(o);ols.push(o)}});
 g.userData.ols=ols;g.userData.lod=lod;g.userData.far=false}
function dress(g,c){freeAv(g);g.clear();g.userData.gloss=c.br===1;const bag=new Map();const fig=new THREE.Group();g.add(fig);const bt=c.bt===1?1:0,sk=bc(SKIN[c.skin],c.tb===1),sh=bc(PAL[c.shirt],c.sb===1),pc=bc(PAL[c.pc],c.pb===1),sc=bc(PAL[c.sc],c.cb===1);
 // gl=1: bola de uma parte com cor brilhante (camisa, calça, calçado); fica numa malha à parte, que recebe o material de brilho
 const ball=(r,col,x,y,z,p,gl)=>{if(!bag.has(p))bag.set(p,[[],[]]);bag.get(p)[gl?1:0].push([r,r,r,col,x,y,z])},sB=c.sb===1,pB=c.pb===1,cB=c.cb===1,tB=c.tb===1,glE=o=>{if(cB)o.userData.gl=1;return o};
 ball(.36,sh,0,1.05,0,fig,sB);ball(.075,sk,0,1.47,0,fig,tB);ball(.26,pc,0,.78,0,fig,pB);
 const lg=[-1,1].map(s=>{const q=new THREE.Group();q.position.set(s*.19,.72,0);fig.add(q);return q});
 const kn=[-1,1].map((s,i)=>{const q=new THREE.Group();q.position.set(0,-.38,0);lg[i].add(q);return q});
 const LR=[.105,.098,.085,.075,.098],LY=[0,-.19,-.38,-.57,-.77],FT=[];
 [0,1].forEach(i=>LR.forEach((r,j)=>{const isP=j<(bt===0?4:2),col=isP?pc:sk,p=j<3?lg[i]:kn[i],ly=j<3?LY[j]:LY[j]+.38;
  if(j===4){const ft=new THREE.Group();ft.position.set(0,ly,0);p.add(ft);FT[i]=ft;if(c.shoes===0)glE(ell(.125,.09,.17,sc,0,-.01,.05,ft,SGS));else if(c.shoes===1)glE(ell(.115,.115,.14,sc,0,0,.02,ft,SGS));else{ball(r,sk,0,0,0,ft,tB);glE(ell(.12,.03,.17,sc,0,-.08,.04,ft,SGS))}}
  else if(j===3&&c.shoes===1)ball(.09,sc,0,ly,0,p,cB);else if(j>0)ball(r,col,0,ly,0,p,isP?pB:tB)}));
 const AR=[.1,.105,.09,.075,.098],AY=[0,-.19,-.37,-.52,-.68];
 const mkArm=s=>{const a=new THREE.Group();a.position.set(s*.357,1.34,0);a.rotation.z=s*.44;AR.forEach((r,j)=>ball(r,j<2?sh:sk,0,AY[j],0,a,j<2?sB:tB));fig.add(a);return a};
 const armL=mkArm(-1),armR=mkArm(1),hold=new THREE.Group();hold.position.set(0,-.78,.12);armR.add(hold);
 const hd=new THREE.Group();hd.position.set(0,1.78,0);hd.scale.set(.75,.75,.75);fig.add(hd);
 const c0={...c},hm=new THREE.Mesh(SGH,headMat(c0));hm.scale.set(.36,.38,.34);hm.userData.head=1;if(tB)hm.userData.gl=1;hd.add(hm);ears(hd,sk,tB);
 let mv0=0;const mo={scale:{set:(x,y)=>{const v=y>2?2:y>1.3?1:0;if(v!==mv0){mv0=v;hm.material=tB?glossyOf(toonOf(headMat(c0,v))):toonOf(headMat(c0,v))}}}};
 const nh=hd.children.length;if(c.hat){hatNew(hd,c);if(c.hb===1)hd.children.slice(nh).forEach(o=>o.traverse(q=>{if(q.isMesh)q.userData.gl=1}))}else{hairNew(hd,c);if(c.rb===1)hd.children.slice(nh).forEach(o=>{if(o.isMesh&&!o.userData.ol)o.userData.gl=1})}
 bag.forEach(([a,b],p)=>{if(a.length)p.add(mergeBalls(a));if(b.length){const m=mergeBalls(b);m.userData.gl=1;p.add(m)}});
 Object.assign(g.userData,{fy:.235+([.012,.026,.022][c.shoes]||.012),fig,armL,armR,hold,hd,mo,lgL:lg[0],lgR:lg[1],knL:kn[0],knR:kn[1],ftL:FT[0],ftR:FT[1]});if(g.userData.item)setHeld(g,g.userData.item);g.traverse(q=>{if(q.isMesh)q.castShadow=true});avatarStyle(g);g.add(avBlob())}
const SPT={};function spr(ic){if(!SPT[ic]){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.font='96px "Segoe UI Emoji","Noto Color Emoji","Apple Color Emoji",sans-serif';g.textAlign='center';g.textBaseline='middle';if(ICONS[ic])ICONS[ic].draw(g);else g.fillText(ic,64,72);SPT[ic]=new THREE.CanvasTexture(c)}return new THREE.SpriteMaterial({map:SPT[ic],transparent:true,depthWrite:false})}
function setHeld(g,it){const hd=g.userData.hold;if(!hd)return;hd.clear();g.userData.item=it;if(!it)return;const s=new THREE.Sprite(spr(it.ic));s.scale.set(.6,.6,.6);s.position.y=.12;s.renderOrder=5;hd.add(s)}
const mk=c=>{const g=new THREE.Group();g.userData={};dress(g,c);scene.add(g);return g};
const me={g:mk(cfg),name:cfg.name,talk:false,drink:0,id:null,jy:0,vy:0,sit:false,seat:null,gest:null};me.g.position.set(0,0,1.5);
const actors=new Map(),MAX=25;let kq=[],kEnd=0,kTurn=-1,ws=null,hostId=null,roomCode=null,session=null,recon=null,RECON_MS=30000;
function mkLabel(a){a.el=document.createElement('div');a.el.className='lbl';a.nm=document.createElement('span');a.vm=document.createElement('span');a.vm.className='vm';a.vm.innerHTML='<i></i><i></i><i></i><i></i><i></i><i></i>';a.sq=[...a.vm.children];a.em=document.createElement('span');a.em.className='emo';a.ad=document.createElement('span');a.ad.className='adm';a.ad.title='Administrador da sala';a.el.append(a.ad,a.nm,a.vm,a.em);$('#labels').append(a.el)}
mkLabel(me);
function showEmo(a,ic){if(!a||!a.em||!ic)return;if(mode==='play'){const v=dvol(a);if(v>.03)sfx(emoKind(ic),v)}const e=a.em;clearTimeout(a.emoT);e.textContent=ic;e.classList.remove('show');void e.offsetWidth;e.classList.add('show');a.emoT=setTimeout(()=>{e.classList.remove('show');e.textContent=''},4000)}
function lab(a){const on=!!a.talk,isH=a.id!=null&&a.id===hostId,sing=!!(kq[0]&&kq[0].id===a.id),n=on?Math.max(1,Math.round((a.lv||0)*6)):0,mu=muted(a.id),key=''+isH+sing+on+a.name+!!a.bot+n+mu;if(a._lk===key)return;a._lk=key;a.ad.style.display=isH?'inline-block':'none';a.nm.textContent=(mu?'🔇 ':'')+(sing?'🎶 Cantando · ':'')+(on&&!mu?'🎤 ':'')+a.name+(a.bot?' 🤖':'');a.el.classList.toggle('talk',on);a.sq.forEach((q,i)=>q.classList.toggle('on',i<n))}
function addActor(p){if(actors.has(p.id))return;const g=mk(p.cfg);g.position.set(p.x,p.y||0,p.z);g.rotation.y=p.ry||0;const a={id:p.id,mk:typeof p.mk==='string'?p.mk.slice(0,16):'',cfg:p.cfg,g,name:p.name,talk:!!p.talk,bot:p.bot,tx:p.x,tz:p.z,tr:p.ry||0,ty:p.y||0,sit:!!p.s,drink:0,gest:null};mkLabel(a);actors.set(p.id,a);if(p.item)setHeld(g,ITEMS.find(i=>i.id===p.item))}
function delActor(id){const a=actors.get(id);if(!a)return;freeAv(a.g);clearTimeout(a.emoT);scene.remove(a.g);a.el.remove();actors.delete(id);closePeer(id,false)}
buildRoom(cfg.style);
