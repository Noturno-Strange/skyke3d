/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Vida do cenário: chuva passageira nos biomas em que chove, estrela cadente de vez em quando e bichos 2D de cada bioma (aves voando
 * em círculos acima das árvores e animais andando entre a vegetação, desviando das peças). Script comum, carregado depois de
 * app-colony.js; tudo fica dentro de uma função e só lifeBuild e lifeTick ficam visíveis: buildRoom (app-scene.js) chama a primeira e o
 * laço de app-ui.js chama lifeTick a cada quadro. Os animais desviam das pegadas que declutter deixa em FOOT (árvores, pedras, colônia).
 * Chuva e estrela cadente saem do relógio (janelas de tempo e um hash inteiro, igual em qualquer navegador), então quem está na mesma
 * sala vê ao mesmo tempo sem mensagem nova no servidor. Com "reduzir movimento" do sistema: sem estrela, sem pingos e sem aves (a chuva
 * fica só no céu fechado e no som) e os animais ficam parados.
 * Custo: até 9 bichos (um sprite e uma sombra cada), 700 traços de chuva (só enquanto chove) e um traço de estrela.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
(()=>{
// hash inteiro (o rn de app-base usa seno, cuja precisão pode mudar entre navegadores; aqui todos precisam sortear igual)
const ih=n=>{n|=0;n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return((n^(n>>>16))>>>0)/4294967296};
const ksOf=k=>[...k].reduce((t,c)=>(t*31+c.charCodeAt(0))|0,7);
const L={k:'',w:0,wa:0,ws:-1,rain:null,fog:null,dome:null,cl:[],sun:[],pl:[],star:null,sk:-1,sp:null,fauna:[],tint:new THREE.Color(1,1,1),grp:new THREE.Group()};
scene.add(L.grp);
const GREY=new THREE.Color(.6,.64,.68),GREYD=new THREE.Color(.24,.27,.3),MB=new THREE.Matrix4();
const isRm=()=>typeof rm!=='undefined'&&rm;

// ---------- chuva ----------
// [chance de chover em cada janela de 5 min, duração mínima e máxima em s]: chuvas frequentes na floresta úmida, de estação no cerrado,
// no pampa e no alagado, e raras e curtas na caatinga (chuva irregular)
const RAIN={amazora:[.6,80,170],atlanthia:[.5,70,150],panthara:[.35,60,120],cerron:[.18,45,90],pamphora:[.18,45,90],caatara:[.06,25,50]};
const RWIN=300,RFADE=8;
/** intensidade da chuva (0 a 1) no instante t (s) do relógio: dentro de cada janela, um sorteio diz se chove, por quanto tempo e quando
 * começa; entra e sai em RFADE segundos */
function rainAt(k,t){const R=RAIN[k];if(!R)return 0;const s=Math.floor(t/RWIN),ks=ksOf(k);if(ih(s*7919+ks)>=R[0])return 0;
 const d=R[1]+ih(s*104729+ks)*(R[2]-R[1]),st=s*RWIN+10+ih(s*1299709+ks)*(RWIN-d-20),u=Math.min(t-st,st+d-t);return u>0?Math.min(1,u/RFADE):0}
function rainMesh(){const N=700,P=new Float32Array(N*6),S=new Float32Array(N);
 for(let i=0;i<N;i++){const x=(Math.random()-.5)*36,z=(Math.random()-.5)*36,y=Math.random()*16,l=.45+Math.random()*.35;P.set([x,y,z,x+.06*l,y-l,z+.03*l],i*6);S[i]=13+Math.random()*4}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));
 const m=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:'#d4dde6',transparent:true,opacity:0,depthWrite:false}));m.frustumCulled=false;m.visible=false;scene.add(m);return{m,P,S,N}}
function rainStep(dt){const R=L.rain,P=R.P;
 for(let i=0;i<R.N;i++){const j=i*6,dy=R.S[i]*dt;P[j+1]-=dy;P[j+4]-=dy;if(P[j+4]<0){const l=P[j+1]-P[j+4],x=(Math.random()-.5)*36,z=(Math.random()-.5)*36;P.set([x,16,z,x+.06*l,16-l,z+.03*l],j)}}
 R.m.geometry.attributes.position.needsUpdate=true;R.m.position.set(me.g.position.x,0,me.g.position.z)}
/** céu fechado: menos luz (a do sol cai mais que a difusa), névoa mais perto e acinzentada, céu e nuvens mais escuros. Usa a mesma conta de
 * buildRoom e do ajuste de brilho, então os dois continuam valendo durante a chuva */
function atmo(w){const T=THEME[L.k];if(!T)return;hemi.intensity=T.h[2]*.8*LGH*BRI*(1-.22*w);dirL.intensity=T.d[1]*.7*LGD*BRI*(1-.5*w);
 const F=L.fog;if(F&&scene.fog){scene.fog.near=F.near*(1-.4*w);scene.fog.far=F.far*(1-.35*w);scene.fog.color.copy(F.c).lerp(GREY,.35*w)}
 const D=L.dome;if(D){D.top.value.copy(D.t).lerp(GREYD,.4*w);D.hor.value.copy(D.h).lerp(GREY,.35*w)}
 for(const m of L.cl)m.color.setScalar(1-.35*w);
 for(const[m,o]of L.sun)m.opacity=o*(1-.85*w);for(const[m,o]of L.pl)m.opacity=o*(1-.55*w);// sol some atrás das nuvens; planetas ficam apagados
 for(const A of L.fauna)A.spr.material.color.copy(L.tint).multiplyScalar(1-.25*w)}

// ---------- estrela cadente ----------
// A câmera vê o céu só do horizonte até ~13° de altura (60° de campo, inclinada para baixo), e as montanhas vão até 4,2°: a estrela
// passa entre 13° e 6°, na frente de quem olha (a hora é a mesma para todos; a direção segue a câmera de cada um).
const SWIN=40,SDUR=1.3;
function starMesh(){const t=sTex(256,32,g=>{const gr=g.createLinearGradient(0,0,256,0);gr.addColorStop(0,'rgba(200,225,255,0)');gr.addColorStop(.7,'rgba(220,235,255,.5)');gr.addColorStop(1,'rgba(255,255,255,1)');
  g.fillStyle=gr;g.beginPath();g.moveTo(0,16);g.lineTo(240,11);g.lineTo(240,21);g.closePath();g.fill();const h=g.createRadialGradient(240,16,0,240,16,16);h.addColorStop(0,'rgba(255,255,255,1)');h.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=h;g.fillRect(224,0,32,32)});
 const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:t,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,side:THREE.DoubleSide,opacity:0}));
 m.visible=false;m.renderOrder=-9;m.frustumCulled=false;rig.add(m);return m}
function starTick(t){const M=L.star,s=Math.floor(t/SWIN);if(isRm()||L.w>.3||ih(s*31337+11)>=.5){M.visible=false;return}
 const t0=s*SWIN+2+ih(s*7331+5)*(SWIN-6),u=(t-t0)/SDUR;if(u<0||u>1){M.visible=false;return}
 if(L.sk!==s){L.sk=s;const sd=ih(s*911+3)<.5?-1:1;L.sp={az:-camYawA+(ih(s*577+1)-.5)*1.1,e:.19+ih(s*389+2)*.04,daz:sd*(.3+ih(s*233+4)*.15),de:-.08}}
 const S=L.sp,R=SKYR-12,pt=q=>{const az=S.az+S.daz*q,e=S.e+S.de*q,c=Math.cos(e);return new THREE.Vector3(Math.sin(az)*c*R,4.8+Math.sin(e)*R,-Math.cos(az)*c*R)},
  h=pt(u),tl=pt(Math.max(0,u-.25)),x=h.clone().sub(tl),len=x.length();if(len<.05){M.visible=false;return}
 x.normalize();const z=h.clone().add(tl).multiplyScalar(-.5).normalize(),y=new THREE.Vector3().crossVectors(z,x).normalize();x.crossVectors(y,z);
 M.position.copy(h).add(tl).multiplyScalar(.5);M.quaternion.setFromRotationMatrix(MB.makeBasis(x,y,z));M.scale.set(len,len*.08+1,1);M.material.opacity=Math.sin(Math.PI*u);M.visible=true}

// ---------- bichos 2D ----------
// Cada espécie vira uma faixa de 4 quadros de 128 px: dois de animação olhando para a direita e os mesmos espelhados. Traço toon do jogo:
// preenchimento chapado e contorno escuro na cor de contorno do mundo (OLC).
const E=(g,x,y,rx,ry,r,f,ol)=>{g.beginPath();g.ellipse(x,y,rx,ry,r||0,0,6.283);if(f){g.fillStyle=f;g.fill()}if(ol){g.strokeStyle=ol;g.lineWidth=3;g.stroke()}};
const P=(g,pts,f,ol)=>{g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();if(f){g.fillStyle=f;g.fill()}if(ol){g.strokeStyle=ol;g.lineWidth=3;g.lineJoin='round';g.stroke()}};
const Ln=(g,x1,y1,x2,y2,w,c,ol)=>{g.lineCap='round';if(ol){g.strokeStyle=ol;g.lineWidth=w+3;g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke()}g.strokeStyle=c;g.lineWidth=w;g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke()};
const eye=(g,x,y,r)=>{E(g,x,y,r,r,0,'#fff');E(g,x+r*.3,y,r*.55,r*.55,0,'#111')};
const dk=(c,f)=>'#'+new THREE.Color(c).multiplyScalar(f||.72).getHexString();
/** ave voando para a direita; f = 0 asas para cima, 1 para baixo */
function bird(g,f,p,ol){const cy=62,up=!f,nk=p.nk||0,hx=84+nk*.7,hy=cy-6-nk*.35;
 if(p.lg)Ln(g,44,cy+6,12,cy+12,3,p.lg,ol);
 P(g,[[42,cy-3],[42-p.tl,cy-4],[42-p.tl,cy+5],[42,cy+5]],p.t,ol);
 if(up)P(g,[[56,cy-4],[46,cy-38],[70,cy-6]],dk(p.w),ol);else P(g,[[56,cy+4],[48,cy+34],[72,cy+4]],dk(p.w),ol);
 E(g,62,cy,22,10,0,p.b,ol);if(p.ch)E(g,66,cy+4,14,5,0,p.ch);if(p.bib)E(g,76,cy-1,5,7,0,p.bib);
 if(nk){Ln(g,76,cy-3,hx-3,hy+2,7,p.nc||p.h,ol);if(p.nb)Ln(g,74,cy-2,79,cy-5,9,p.nb)}
 E(g,hx,hy,8,7.5,0,p.h,ol);if(p.fc)E(g,hx+2,hy+1,4.5,4,0,p.fc);
 const bl=p.bl,bh=p.bh||3;P(g,[[hx+6,hy-bh],[hx+6+bl,hy+1],[hx+6,hy+bh*.6+1]],p.bk,ol);if(p.bt)P(g,[[hx+6+bl*.7,hy-bh*.3],[hx+6+bl,hy+1],[hx+6+bl*.7,hy+bh*.4]],p.bt);
 eye(g,hx+2,hy-2,2.2);
 if(up){P(g,[[54,cy-2],[66,cy-44],[80,cy-4]],p.w,ol);if(p.w2)P(g,[[62,cy-28],[66,cy-44],[71,cy-28]],p.w2)}
 else{P(g,[[54,cy+3],[64,cy+40],[82,cy+3]],p.w,ol);if(p.w2)P(g,[[61,cy+26],[64,cy+40],[70,cy+26]],p.w2)}}
/** cauda de quadrúpede, saindo de (x,y) para a esquerda */
function tail(g,p,x,y,ol){const t=p.tail,c=p.tc||p.c;
 if(t==='long'){Ln(g,x+4,y,x-16,y+18,5,c,ol);Ln(g,x-16,y+18,x-20,y+30,5,p.tt||c,ol)}
 else if(t==='bushy'){E(g,x-7,y+16,7,17,.45,c,ol);if(p.tt)E(g,x-13,y+29,5,6,.45,p.tt,ol)}// cauda farta caída (lobo-guará, ponta branca)
 else if(t==='flag'){E(g,x-14,y+4,20,13,-.35,c,ol)}// tamanduá: bandeira grande
 else if(t==='ring'){Ln(g,x+4,y,x-10,y-26,5,c,ol);for(let i=1;i<4;i++){const q=i/4;Ln(g,x+4-14*q,y-26*q,x+4-14*q-1,y-26*q-2,5,p.tt||'#2a1a10')}}
 else if(t==='horse'){P(g,[[x+4,y-2],[x-10,y+10],[x-14,y+40],[x-4,y+36],[x+6,y+8]],p.tt||c,ol)}
 else if(t==='short')E(g,x,y+4,5,4,0,p.tt||c,ol)}
/** quadrúpede andando para a direita; f troca o passo; o chão fica em y = 118 */
function quad(g,f,p,ol){const by=p.by,L=p.len,H=p.bh,gy=118,sw=f?7:-7,lw=p.lw||6,lc=p.lc||p.c,top=by+H*.4,fx=64+L*.55,bx=64-L*.55;
 Ln(g,fx-4,top,fx-4-sw,gy,lw,dk(lc),ol);Ln(g,bx+4,top,bx+4+sw,gy,lw,dk(lc),ol);
 tail(g,p,64-L,by-H*.3,ol);
 if(p.shell){E(g,64,by,L,H,0,p.c,ol);g.save();g.beginPath();g.ellipse(64,by,L,H,0,0,6.283);g.clip();for(let i=-2;i<=2;i++)Ln(g,64+i*7,by-H,64+i*7,by+H,2,dk(p.c,.6));g.restore()}
 else{E(g,64,by,L,H,0,p.c,ol);if(p.bl)E(g,64,by+H*.5,L*.68,H*.35,0,p.bl)}
 if(p.pat==='spots')for(let i=0;i<9;i++){const x=64-L*.7+(i%5)*L*.34,y=by-H*.4+Math.floor(i/5)*H*.55+(i%2)*3;E(g,x,y,3.2,2.6,0,null,dk(p.c,.35))}
 if(p.pat==='band')P(g,[[64+L*.45,by-H],[64+L*.62,by-H*.75],[64-L*.15,by+H*.7],[64-L*.35,by+H*.6]],'#1a1612',ol);
 if(p.pat==='mane')Ln(g,64-L*.3,by-H*.9,64+L*.6,by-H*.95,4,'#1a1410');
 if(p.pat==='stripes')for(let i=0;i<4;i++)Ln(g,64-L*.6+i*L*.4,by-H*.3,64-L*.45+i*L*.4,by-H*.3,2,'#e8e0a0');
 if(p.pat==='plates')for(let i=0;i<7;i++)E(g,64-L*.85+i*L*.28,by-H*.85,2.6,2.2,0,dk(p.c,.6));
 Ln(g,fx+4,top,fx+4+sw,gy,lw,lc,ol);Ln(g,bx-4,top,bx-4-sw,gy,lw,lc,ol);
 const hx=64+L*.95+(p.hx||0),hy=by-H*.45-(p.nk||0),hd=p.hd;
 if(p.nk)P(g,[[64+L*.5,by-H*.7],[hx-hd*.6,hy-hd*.5],[hx+hd*.2,hy+hd*.7],[64+L*.8,by+H*.2]],p.c,ol);
 if(p.mane)Ln(g,64+L*.52,by-H*.85,hx-hd*.4,hy-hd*.8,5,p.mane);
 if(p.ear){P(g,[[hx-hd*.5,hy-hd*.4],[hx-hd*.5-p.ear*.3,hy-hd*.4-p.ear],[hx-hd*.05,hy-hd*.6]],p.ec||p.c,ol)}
 if(p.ant)for(const d of[-3,3])Ln(g,hx-2+d,hy-hd*.6,hx-4+d*1.6,hy-hd*.6-p.ant,2,'#5a4028');
 E(g,hx,hy,hd,hd*(p.hr||.8),p.ha||0,p.hc||p.c,ol);
 const sn=p.sn||0;
 if(p.snout==='tube')P(g,[[hx+hd*.6,hy-2],[hx+hd*.6+sn,hy+3],[hx+hd*.6+sn,hy+6],[hx+hd*.6,hy+4]],p.hc||p.c,ol);
 else if(p.snout==='trunk')P(g,[[hx+hd*.5,hy-hd*.3],[hx+hd+sn,hy+hd*.2],[hx+hd+sn-2,hy+hd*.7],[hx+hd*.4,hy+hd*.5]],p.hc||p.c,ol);
 else if(sn)E(g,hx+hd*.7+sn*.35,hy+hd*.2,sn*.55+2,hd*.42,0,p.sc||p.hc||p.c,ol);
 E(g,hx+hd*.7+sn*.8,hy+hd*.1,1.8,1.8,0,'#111');
 if(p.ear&&p.ec2)P(g,[[hx-hd*.35,hy-hd*.5],[hx-hd*.35+p.ear*.1,hy-hd*.5-p.ear*.7],[hx+hd*.05,hy-hd*.6]],p.ec2);
 eye(g,hx+hd*.15,hy-hd*.2,hd*.2+1)}
/** réptil baixo (jacaré, calango): corpo comprido rente ao chão, cauda afinando e patas abertas */
function rept(g,f,p,ol){const gy=118,by=gy-p.bh-4,sw=f?6:-6;
 for(const [x,s] of[[64+p.len*.5,-1],[64-p.len*.45,1]])Ln(g,x,by+2,x+sw*s+(s<0?6:-6),gy,4,dk(p.c),ol);
 P(g,[[64-p.len*.6,by-p.bh*.6],[64-p.len*.6-p.tl,by+p.bh*.4],[64-p.len*.6,by+p.bh*.9]],p.c,ol);
 E(g,64,by,p.len*.65,p.bh,0,p.c,ol);E(g,64,by+p.bh*.45,p.len*.5,p.bh*.35,0,p.bl);
 if(p.bump)for(let i=0;i<8;i++)E(g,64-p.len*.5+i*p.len*.14,by-p.bh*.8,2.4,2,0,dk(p.c,.6));
 if(p.str)for(let i=0;i<3;i++)Ln(g,64-p.len*.4+i*p.len*.3,by-p.bh*.4,64-p.len*.25+i*p.len*.3,by-p.bh*.4,2,p.str);
 const hx=64+p.len*.65;P(g,[[hx-6,by-p.bh*.8],[hx+p.sn,by-1],[hx+p.sn,by+p.bh*.5],[hx-6,by+p.bh*.8]],p.c,ol);
 for(const [x,s] of[[64+p.len*.45,1],[64-p.len*.5,-1]])Ln(g,x,by+3,x+sw*s+(s>0?5:-5),gy,4,p.c,ol);
 eye(g,hx+2,by-p.bh*.55,2.4)}
/** ema: ave grande que corre (corpo redondo, pescoço comprido e pernas longas) */
function ema(g,f,p,ol){const sw=f?9:-9;Ln(g,58,74,58-sw,118,5,dk(p.lg),ol);E(g,52,58,26,20,-.15,p.c,ol);E(g,40,52,12,9,-.3,dk(p.c,.85));
 Ln(g,74,52,92,18,7,p.c,ol);E(g,95,16,7,6,0,p.c,ol);P(g,[[100,14],[110,17],[100,19]],p.bk,ol);eye(g,96,14,2);Ln(g,62,74,62+sw,118,5,p.lg,ol)}
// espécies: tipo de desenho, tamanho do quadro em metros, velocidade (m/s), batida de asa (quadros/s) e as cores/proporções
const SPC={
 arara:{d:bird,s:1.3,v:6,fl:7,a:{b:'#d8282a',w:'#2a62d8',w2:'#f4c430',h:'#d8282a',fc:'#f4efe6',bk:'#efe6d6',bl:10,bh:5,tl:36,t:'#d8282a'}},
 caninde:{d:bird,s:1.3,v:6,fl:7,a:{b:'#2a7ad8',ch:'#f4c430',w:'#2a6ad0',w2:'#1a3a8a',h:'#2a8ad8',fc:'#f4efe6',bk:'#1a1a1a',bl:10,bh:5,tl:36,t:'#2a6ad0'}},
 tucano:{d:bird,s:1,v:5,fl:8,a:{b:'#1a1a1a',ch:'#f4f0e0',w:'#1e1e1e',h:'#1a1a1a',fc:'#f4f0e0',bk:'#f08a1a',bt:'#1a1a1a',bl:24,bh:8,tl:14,t:'#1a1a1a'}},
 tucanov:{d:bird,s:1,v:5,fl:8,a:{b:'#1a1a1a',ch:'#f4d84a',w:'#1e1e1e',h:'#1a1a1a',fc:'#f4d84a',bk:'#9ad040',bt:'#d84a2a',bl:22,bh:8,tl:14,t:'#1a1a1a'}},
 saira:{d:bird,s:.55,v:5,fl:10,a:{b:'#2ab878',ch:'#2a8ad8',w:'#1a1a1a',w2:'#2ab878',h:'#5ad0a0',bk:'#1a1a1a',bl:6,tl:10,t:'#1a1a1a'}},
 carcara:{d:bird,s:1.4,v:4.5,fl:4,glide:1,a:{b:'#5a3a24',ch:'#e8dcc0',w:'#4a3020',w2:'#e8dcc0',h:'#1a1410',fc:'#f0a040',bk:'#d8c890',bl:8,bh:4,tl:16,t:'#e8dcc0'}},
 asabranca:{d:bird,s:.75,v:6,fl:9,a:{b:'#8a8a92',ch:'#b0a8a8',w:'#7a7a82',w2:'#ffffff',h:'#8a8a92',bk:'#2a2a2a',bl:6,tl:16,t:'#6a6a72'}},
 tuiuiu:{d:bird,s:2.4,v:3.5,fl:3,glide:1,a:{b:'#f4f4f0',w:'#f4f4f0',w2:'#1a1a1a',h:'#1a1a1a',nk:16,nc:'#1a1a1a',nb:'#d82a2a',bk:'#1a1a1a',bl:24,bh:4,tl:8,t:'#f4f4f0',lg:'#1a1a1a'}},
 garca:{d:bird,s:1.7,v:3.8,fl:3.5,glide:1,a:{b:'#ffffff',w:'#ffffff',h:'#ffffff',nk:6,bk:'#f0c020',bl:18,bh:3,tl:8,t:'#f4f4f4',lg:'#1a1a1a'}},
 queroquero:{d:bird,s:.8,v:6,fl:8,a:{b:'#9a9a8a',ch:'#f4f4f0',bib:'#1a1a1a',w:'#5a6a5a',w2:'#ffffff',h:'#8a8a7a',bk:'#d84040',bt:'#1a1a1a',bl:7,tl:10,t:'#1a1a1a'}},
 anta:{d:quad,s:2.6,v:.6,a:{c:'#4a4040',lc:'#3a3230',len:30,bh:16,by:76,lw:8,hd:12,snout:'trunk',sn:8,ear:6,tail:'short'}},
 onca:{d:quad,s:2.3,v:.9,a:{c:'#e8a838',bl:'#f4e6c8',len:30,bh:12,by:80,lw:7,hd:11,sn:5,sc:'#f4e6c8',ear:5,tail:'long',tt:'#1a1410',pat:'spots'}},
 loboguara:{d:quad,s:2.1,v:1,a:{c:'#d8701e',lc:'#1a1410',len:24,bh:11,by:64,lw:5,hd:10,sn:9,ear:12,ec:'#d8701e',ec2:'#f4e0c0',tail:'bushy',tt:'#f4f0e8',pat:'mane'}},
 tamandua:{d:quad,s:2.7,v:.5,a:{c:'#7a7468',lc:'#2a2622',len:30,bh:14,by:78,lw:7,hd:7,snout:'tube',sn:26,ear:3,tail:'flag',tc:'#4a463e',pat:'band'}},
 cutia:{d:quad,s:.95,v:1.2,a:{c:'#b8782a',lc:'#5a3a1a',len:22,bh:13,by:90,lw:5,hd:9,sn:7,ear:5,tail:'none'}},
 quati:{d:quad,s:1.25,v:.9,a:{c:'#9a5a2a',lc:'#3a2618',len:22,bh:10,by:86,lw:5,hd:8,sn:12,sc:'#e8d8c0',ear:4,tail:'ring',tt:'#3a2618'}},
 tatu:{d:quad,s:.9,v:.5,a:{c:'#b8a07a',lc:'#8a7258',len:22,bh:14,by:98,lw:4,hd:6,sn:9,ear:4,tail:'short',shell:1}},
 capivara:{d:quad,s:1.7,v:.5,a:{c:'#8a5a32',lc:'#5a3a22',len:30,bh:16,by:84,lw:8,hd:15,hr:.62,ha:.3,hx:2,sn:5,sc:'#6a4226',ear:3,tail:'none'}},
 cavalo:{d:quad,s:3,v:1.1,a:{c:'#7a4a2a',lc:'#2a1a10',len:28,bh:13,by:62,lw:6,hd:9,ha:.6,hx:6,nk:20,sn:7,ear:5,tail:'horse',tt:'#2a1a10',mane:'#2a1a10'}},
 veado:{d:quad,s:1.9,v:1,a:{c:'#b8783a',bl:'#f0e0c8',lc:'#6a4a2a',len:22,bh:11,by:66,lw:4,hd:8,nk:12,sn:6,ear:7,tail:'short',tt:'#f4f0e8',ant:9}},
 jacare:{d:rept,s:3.1,v:.3,a:{c:'#4a5a3a',bl:'#a8a878',len:56,bh:8,tl:30,sn:26,bump:1}},
 calango:{d:rept,s:.9,v:1.5,a:{c:'#7a8a4a',bl:'#c8c890',len:44,bh:7,tl:26,sn:12,str:'#e8e0a0'}},
 ema:{d:ema,s:2.1,v:1.3,a:{c:'#8a8070',lg:'#6a5a4a',bk:'#3a3028'}}};
const FAUNA={amazora:{a:[['arara',3],['tucano',2]],c:[['anta',2],['onca',1]]},
 cerron:{a:[['caninde',3],['carcara',1]],c:[['loboguara',1],['ema',2],['tamandua',1]]},
 atlanthia:{a:[['tucanov',2],['saira',3]],c:[['cutia',2],['quati',2]]},
 caatara:{a:[['asabranca',3],['carcara',1]],c:[['tatu',1],['calango',2]]},
 panthara:{a:[['tuiuiu',2],['garca',3]],c:[['capivara',3],['jacare',2]]},
 pamphora:{a:[['queroquero',4]],c:[['cavalo',2],['veado',1]]}};
const ART={};
/** faixa de 4 quadros da espécie (desenhada uma vez por mundo, com o contorno do mundo) */
function art(n){if(ART[n])return ART[n];const S=SPC[n],ol='#'+OLC.getHexString();
 return ART[n]=sTex(512,128,g=>{for(let c=0;c<4;c++){g.save();if(c<2)g.translate(c*128,0);else{g.translate(c*128+128,0);g.scale(-1,1)}S.d(g,c%2,S.a,ol);g.restore()}})}
let BLOB=null;const blobTex=()=>BLOB||(BLOB=sTex(64,64,g=>{const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(0,0,0,.55)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,64,64)}));
const free=(x,z,r)=>{const d=Math.hypot(x-WALK.x,z-WALK.z);if(d<13.5||d>33)return false;for(const o of FOOT)if(Math.hypot(x-o.x,z-o.z)<o.r+r)return false;return true};
/** próximo destino de um animal: 3 a 9 m adiante, com o caminho todo livre (amostra a cada metro) */
function aim(A){const r=A.sp.s*.3;for(let i=0;i<10;i++){const a=Math.random()*6.283,d=3+Math.random()*6,x=A.x+Math.sin(a)*d,z=A.z+Math.cos(a)*d;let ok=true;
  for(let q=1;q<=Math.ceil(d)&&ok;q++){const u=q/Math.ceil(d);ok=free(A.x+(x-A.x)*u,A.z+(z-A.z)*u,r)}if(ok){A.tx=x;A.tz=z;return}}A.tx=A.x;A.tz=A.z;A.idle=3}
function clearFauna(){for(const A of L.fauna){A.spr.material.map.dispose();A.spr.material.dispose();L.grp.remove(A.spr);if(A.sh){A.sh.material.dispose();A.sh.geometry.dispose();L.grp.remove(A.sh)}}L.fauna=[];for(const n in ART){ART[n].dispose();delete ART[n]}}
function spawn(n,kind){const S=SPC[n],tex=art(n).clone();tex.needsUpdate=true;tex.repeat.set(.25,1);
 const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,alphaTest:.05}));spr.scale.set(S.s,S.s,1);L.grp.add(spr);const A={sp:S,spr,c:-1,ft:Math.random()*4,sh:null};
 if(kind==='a'){const a=Math.random()*6.283,d=4+Math.random()*12;A.cx=WALK.x+Math.sin(a)*d;A.cz=WALK.z+Math.cos(a)*d;A.r=12+Math.random()*14;A.h=7.5+Math.random()*5;A.ang=Math.random()*6.283;A.om=(Math.random()<.5?-1:1)*S.v/A.r;A.ph=Math.random()*6}
 else{spr.center.set(.5,10/128);for(let i=0;i<40;i++){const a=Math.random()*6.283,d=14+Math.random()*18;A.x=WALK.x+Math.sin(a)*d;A.z=WALK.z+Math.cos(a)*d;if(free(A.x,A.z,S.s*.3))break}
  A.idle=Math.random()*4;aim(A);const sh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:blobTex(),transparent:true,depthWrite:false,opacity:.8}));sh.rotation.x=-Math.PI/2;sh.scale.set(S.s*.55,S.s*.22,1);sh.renderOrder=-1;L.grp.add(sh);A.sh=sh}
 A.kind=kind;L.fauna.push(A)}
const cell=(A,c)=>{if(A.c!==c){A.c=c;A.spr.material.map.offset.x=c*.25}};
function faunaTick(dt){const e=cam.matrixWorld.elements,rx=e[0],rz=e[2],still=isRm();
 for(const A of L.fauna){const S=A.sp;
  if(A.kind==='a'){A.spr.visible=!still;if(still)continue;A.ang+=A.om*dt;const x=A.cx+Math.cos(A.ang)*A.r,z=A.cz+Math.sin(A.ang)*A.r,vx=-Math.sin(A.ang)*A.om,vz=Math.cos(A.ang)*A.om;
   A.ft+=dt*S.fl;const glide=S.glide&&Math.sin(A.ft*.25+A.ph)>.3;cell(A,(vx*rx+vz*rz>0?0:2)+(glide?0:Math.floor(A.ft)%2));A.spr.position.set(x,A.h+Math.sin(A.ang*2+A.ph)*.6,z);continue}
  if(!still){if(A.idle>0)A.idle-=dt;else{const dx=A.tx-A.x,dz=A.tz-A.z,d=Math.hypot(dx,dz);
   if(d<.15){A.idle=2+Math.random()*5;aim(A)}else{const st=Math.min(d,S.v*dt);A.x+=dx/d*st;A.z+=dz/d*st;A.ft+=dt*S.v*2.4;A.face=dx*rx+dz*rz>0?0:2}}}
  cell(A,(A.face||0)+(A.idle>0||still?0:Math.floor(A.ft)%2));A.spr.position.set(A.x,0,A.z);A.sh.position.set(A.x,.06,A.z)}}

// ---------- ganchos ----------
/** chamado no fim de buildRoom: guarda a névoa, o céu e as nuvens do mundo (base da chuva) e cria os bichos do bioma */
window.lifeBuild=k=>{L.k=k;clearFauna();
 L.fog=scene.fog?{near:scene.fog.near,far:scene.fog.far,c:scene.fog.color.clone()}:null;
 const d=skyG.children.find(c=>c.material&&c.material.uniforms&&c.material.uniforms.top);L.dome=d?{top:d.material.uniforms.top,hor:d.material.uniforms.hor,t:d.material.uniforms.top.value.clone(),h:d.material.uniforms.hor.value.clone()}:null;
 L.cl=[...new Set(skyG.children.filter(c=>c.isSprite&&!c.userData.sun).map(c=>c.material))];
 L.sun=skyG.children.filter(c=>c.userData.sun).map(c=>[c.material,c.material.opacity]);L.pl=planG.children.filter(c=>c.isSprite).map(c=>[c.material,c.material.opacity]);
 // os sprites não recebem luz: a cor da luz do céu do mundo, bem clareada, faz os bichos combinarem com o resto do cenário
 const T=THEME[k];L.tint.set(T?T.h[0]:0xffffff).lerp(new THREE.Color(1,1,1),.55).multiplyScalar(.95);
 const F=FAUNA[k];if(F){for(const[n,q]of F.a)for(let i=0;i<q;i++)spawn(n,'a');for(const[n,q]of F.c)for(let i=0;i<q;i++)spawn(n,'c')}
 if(!L.rain)L.rain=rainMesh();if(!L.star)L.star=starMesh();L.wa=1;atmo(L.w)};
/** a cada quadro (laço de app-ui.js) */
window.lifeTick=dt=>{if(!L.k)return;const t=Date.now()/1000,tg=rainAt(L.k,t);L.w+=Math.max(-dt/4,Math.min(dt/4,tg-L.w));
 if(L.w>.001||L.wa){atmo(L.w);L.wa=L.w>.001?1:0}
 const R=L.rain,show=L.w>.01&&!isRm();R.m.visible=show;if(show){R.m.material.opacity=.42*L.w;rainStep(dt)}
 if(Math.abs(L.w-L.ws)>.02||(L.w===0&&L.ws>0)){L.ws=L.w;if(typeof rainSnd==='function')rainSnd(L.w)}
 starTick(t);faunaTick(dt)};
})();
