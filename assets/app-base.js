/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Base: configuração, utilitários, renderizador, cena, luzes, céu, texturas e peças básicas do cenário.
 * Os arquivos assets/app-*.js são scripts comuns carregados em ordem pelo index.html e dividem o mesmo escopo global: o que um
 * declara no nível de cima, os seguintes enxergam. Código que roda ao carregar só pode usar o que já veio antes.
 */

const $=s=>document.querySelector(s),R=document.documentElement;
// instalar como aplicativo: registra o service worker (/sw.js), que não guarda nada; sem suporte (navegador antigo, http fora do localhost) segue sem ele
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
// sem WebGL (ou sem o three.js) o jogo não roda: avisa e interrompe este e os próximos pedaços (cada um confere SKY_NOGL ao carregar)
if(!window.THREE||!document.createElement('canvas').getContext('webgl')){window.SKY_NOGL=true;document.body.insertAdjacentHTML('beforeend','<div id="err">Seu navegador não suporta WebGL ou não conseguiu carregar o motor 3D. Tente Chrome, Firefox, Edge ou Safari atualizados.</div>');throw new Error('Skyke3D: sem WebGL')}
// dados do jogo (itens, gestos, emojis, cores, mundos): assets/catalog.js
const {vivid,PAL,SKIN,GLOSS,EYE,HAIRC,HS,HATS,SHOES,BT,FACES,NCOL,NFX,EMO,ST,ST_LEGACY,ITEMS,GESTS,GEST,ITEM,BRK,LIMITS}=SKYCAT;
const potion=(col,glow)=>({svg:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M26 6h12v4h-2v12l14 28a8 8 0 0 1-7 12H21a8 8 0 0 1-7-12l14-28V10h-2z" fill="rgba(255,255,255,.25)" stroke="#fff" stroke-width="2.5"/><path d="M19 42h26l5 10a6 6 0 0 1-5 9H21a6 6 0 0 1-5-9z" fill="'+col+'"/><circle cx="28" cy="48" r="2.5" fill="#fff" opacity=".8"/><circle cx="37" cy="54" r="2" fill="#fff" opacity=".7"/><path d="M50 8l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="'+glow+'"/></svg>',
 draw:g=>{g.fillStyle='rgba(255,255,255,.25)';g.strokeStyle='#ffffff';g.lineWidth=5;g.beginPath();g.moveTo(52,12);g.lineTo(76,12);g.lineTo(76,22);g.lineTo(72,22);g.lineTo(72,44);g.lineTo(100,100);g.quadraticCurveTo(106,118,86,120);g.lineTo(42,120);g.quadraticCurveTo(22,118,28,100);g.lineTo(56,44);g.lineTo(56,22);g.lineTo(52,22);g.closePath();g.fill();g.stroke();g.fillStyle=col;g.beginPath();g.moveTo(38,84);g.lineTo(90,84);g.lineTo(100,102);g.quadraticCurveTo(104,116,86,118);g.lineTo(42,118);g.quadraticCurveTo(24,116,28,102);g.closePath();g.fill();g.fillStyle=glow;g.beginPath();g.moveTo(100,16);g.lineTo(104,26);g.lineTo(114,30);g.lineTo(104,34);g.lineTo(100,44);g.lineTo(96,34);g.lineTo(86,30);g.lineTo(96,26);g.closePath();g.fill()}});
const ICONS={JUICE:{svg:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 14h32l-4 42H20z" fill="rgba(255,255,255,.28)" stroke="#fff" stroke-width="2.5"/><path d="M18 26h28l-2.5 28h-23z" fill="#ff9f1c"/><path d="M37 3L31 30" stroke="#e63946" stroke-width="3.5"/><circle cx="49" cy="14" r="8.5" fill="#ffb347" stroke="#ff7f00" stroke-width="2"/><path d="M49 6v16M41 14h16" stroke="#ff7f00" stroke-width="2"/></svg>',
 draw:g=>{g.fillStyle='rgba(255,255,255,.28)';g.strokeStyle='#ffffff';g.lineWidth=5;g.beginPath();g.moveTo(32,28);g.lineTo(96,28);g.lineTo(88,112);g.lineTo(40,112);g.closePath();g.fill();g.stroke();g.fillStyle='#ff9f1c';g.beginPath();g.moveTo(36,52);g.lineTo(92,52);g.lineTo(87,108);g.lineTo(41,108);g.closePath();g.fill();g.strokeStyle='#e63946';g.lineWidth=7;g.beginPath();g.moveTo(74,6);g.lineTo(62,60);g.stroke();g.fillStyle='#ffb347';g.strokeStyle='#ff7f00';g.lineWidth=4;g.beginPath();g.arc(98,28,17,0,6.283);g.fill();g.stroke();g.beginPath();g.moveTo(98,12);g.lineTo(98,44);g.moveTo(82,28);g.lineTo(114,28);g.stroke()}},
 POT_RED:potion('#e63946','#ffd166'),POT_BLUE:potion('#3a86ff','#bde0fe'),POT_GREEN:potion('#2dd36f','#d8f3dc'),POT_PURPLE:potion('#9b5de5','#f1c0e8'),
 POT_GOLD:potion('#ffb703','#fff3b0'),POT_PINK:potion('#ff5fa2','#c8b6ff'),POT_CYAN:potion('#22d3ee','#e0fbfc'),
 // bolo em forma de planeta: cobertura, confeitos e um anel de açúcar
 CAKE_PLANET:{svg:'<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="19" fill="#9b5de5" stroke="#fff" stroke-width="2.5"/><path d="M14.6 27a18 18 0 0 1 34.8 0q-2.9 5-5.8 0t-5.8 0-5.8 0-5.8 0-5.8 0-5.8 0z" fill="#ffd6f0"/><circle cx="24" cy="21" r="1.9" fill="#ffd166"/><circle cx="33" cy="17.5" r="1.9" fill="#3ad7ff"/><circle cx="41" cy="22" r="1.9" fill="#ff5f8f"/><ellipse cx="32" cy="37" rx="30" ry="7.5" fill="none" stroke="#ffd166" stroke-width="4" transform="rotate(-14 32 37)"/></svg>',
  draw:g=>{g.lineWidth=5;g.strokeStyle='#ffffff';g.fillStyle='#9b5de5';g.beginPath();g.arc(64,64,38,0,6.283);g.fill();g.stroke();g.save();g.beginPath();g.arc(64,64,36,0,6.283);g.clip();g.fillStyle='#ffd6f0';g.beginPath();g.moveTo(20,20);g.lineTo(108,20);g.lineTo(108,54);for(let x=108;x>20;x-=11.6)g.quadraticCurveTo(x-5.8,64,x-11.6,54);g.closePath();g.fill();g.restore();
   [[48,42,'#ffd166'],[66,35,'#3ad7ff'],[82,44,'#ff5f8f']].forEach(([x,y,c])=>{g.fillStyle=c;g.beginPath();g.arc(x,y,4,0,6.283);g.fill()});g.save();g.translate(64,74);g.rotate(-.245);g.strokeStyle='#ffd166';g.lineWidth=8;g.beginPath();g.ellipse(0,0,60,15,0,0,6.283);g.stroke();g.restore()}},
 // bala em forma de estrela, com carinha e faíscas
 STAR_CANDY:{svg:'<svg viewBox="0 0 64 64" aria-hidden="true"><polygon points="32.0,7.0 38.8,23.7 56.7,25.0 42.9,36.6 47.3,54.0 32.0,44.5 16.7,54.0 21.1,36.6 7.3,25.0 25.2,23.7" fill="#ffd23f" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><circle cx="27" cy="33" r="2.3" fill="#3b2a14"/><circle cx="37" cy="33" r="2.3" fill="#3b2a14"/><path d="M28.5 38.5q3.5 3 7 0" fill="none" stroke="#3b2a14" stroke-width="2" stroke-linecap="round"/><path d="M53 7l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#bde0fe"/><circle cx="9" cy="14" r="2.2" fill="#ff8fc7"/></svg>',
  draw:g=>{const P=[];for(let i=0;i<10;i++){const R=i%2?23:52,a=i*Math.PI/5;P.push([64+R*Math.sin(a),66-R*Math.cos(a)])}g.fillStyle='#ffd23f';g.strokeStyle='#ffffff';g.lineWidth=5;g.lineJoin='round';g.beginPath();P.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fill();g.stroke();
   g.fillStyle='#3b2a14';[54,74].forEach(x=>{g.beginPath();g.arc(x,66,4.6,0,6.283);g.fill()});g.strokeStyle='#3b2a14';g.lineWidth=4;g.lineCap='round';g.beginPath();g.moveTo(57,77);g.quadraticCurveTo(64,83,71,77);g.stroke();g.fillStyle='#bde0fe';g.beginPath();g.moveTo(106,14);g.lineTo(109,22);g.lineTo(117,25);g.lineTo(109,28);g.lineTo(106,36);g.lineTo(103,28);g.lineTo(95,25);g.lineTo(103,22);g.closePath();g.fill();g.fillStyle='#ff8fc7';g.beginPath();g.arc(18,28,4.4,0,6.283);g.fill()}}};
const SERVER_URL='';/* se o index.html ficar numa CDN, coloque aqui o endereço do servidor, ex.: 'wss://jogo.seudominio.com' */
const ri=n=>Math.floor(Math.random()*n);
function randomLook(){const hr=ri(HAIRC.length),P=PAL.length,gl=ri(3)?0:1,b=()=>gl;return{skin:ri(SKIN.length),eye:ri(EYE.length),shirt:ri(P),hair:hr,hs:ri(HS.length),hat:0,hc:ri(P),bt:ri(BT.length),pc:ri(P),sc:ri(P),shoes:ri(SHOES.length),fc:ri(FACES.length),tb:b(),eb:b(),rb:b(),sb:b(),pb:b(),cb:b(),hb:b()}}
const cfg={name:'Visitante',style:'amazora',br:0,nc:0,nf:0,...randomLook()};// nc/nf: nome personalizado (randomLook não mexe neles)
let mode='menu';{const h=(location.hash.match(/sala=([A-Za-z0-9]+)/)||[])[1];if(h)$('#code').value=h.toUpperCase().slice(0,10)}
function ytId(v){try{const u=new URL(String(v).trim());if(u.protocol!=='https:')return null;let id=null;if(/(^|\.)youtube\.com$/.test(u.hostname))id=u.searchParams.get('v')||(u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)||[])[1];else if(u.hostname==='youtu.be')id=u.pathname.slice(1);return /^[\w-]{11}$/.test(id||'')?id:null}catch(e){return null}}

// ---------- 3D ----------
const COARSE=matchMedia('(pointer:coarse)').matches;
const SHD=1024,PBR=/[?&]pbr(=|&|$)/.test(location.search);
// correção de gama: cores hex numéricas (0xrrggbb) são lidas como sRGB e convertidas para linear; texturas de canvas são sRGB; saída codificada em sRGB.
// A gestão de cor automática do three.js fica desligada: os mundos foram afinados com as cores em texto do cenário lidas sem conversão.
// Luzes: o three.js atual não multiplica mais a intensidade por π (luzes "legadas"), então as constantes já levam o π para manter a mesma luz.
let LINS=0;const LG=.7*Math.PI,LGH=.64*Math.PI,LGD=.9*Math.PI,FIRE_I=2.3,FIRE_R=16;
// FIREK: força da luz e do brilho da fogueira no mundo atual. Em chão claro (cerrado, caatinga) a mesma luz estourava num disco laranja
// saturado em volta da fogueira; buildRoom ajusta pela claridade da cor média do chão (GAVG): 1 nos chãos escuros, até 0,55 nos claros.
let FIREK=1;
THREE.ColorManagement.enabled=false;
// luz pontual (a fogueira) com a queda antiga do three r128, (1 - d/alcance)^queda: o three atual usa 1/d², que deixava os troncos sem o brilho laranja
{const K=THREE.ShaderChunk,A='float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );\n\tif ( cutoffDistance > 0.0 ) {\n\t\tdistanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );\n\t}\n\treturn distanceFalloff;';
 if(K.lights_pars_begin.includes(A))K.lights_pars_begin=K.lights_pars_begin.replace(A,'if ( cutoffDistance > 0.0 && decayExponent > 0.0 ) return pow( saturate( - lightDistance / cutoffDistance + 1.0 ), decayExponent );\n\treturn 1.0;');else console.warn('three.js: queda da luz pontual não ajustada')}
{let STY=0;const SH=THREE.Color.prototype.setHex;THREE.Color.prototype.setHex=function(h,cs){SH.call(this,h,cs);return STY>0?this:this.convertSRGBToLinear()};
 // cores em texto: '#rrggbb' (que agora passa por setHex) fica como está, menos no avatar (LINS>0, enquanto ele é montado), onde vira linear e mostra a cor certa;
 // nomes de cor ('white'...) viram lineares, como no three r128
 const SS=THREE.Color.prototype.setStyle;THREE.Color.prototype.setStyle=function(s,cs){STY++;try{SS.call(this,s,cs)}finally{STY--}return typeof s==='string'&&(LINS>0&&s[0]==='#'||/^[a-z]+$/i.test(s))?this.convertSRGBToLinear():this};
 const CT=THREE.CanvasTexture;THREE.CanvasTexture=function(...a){const t=new CT(...a);t.colorSpace=THREE.SRGBColorSpace;return t};THREE.CanvasTexture.prototype=CT.prototype}
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;document.body.prepend(renderer.domElement);
const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(60,1,.1,600),room=new THREE.Group();scene.add(room);
let BRI=1;try{BRI=Math.min(1.6,Math.max(.6,parseFloat(localStorage.getItem('skyke_br'))||1))}catch(e){}
const hemi=new THREE.HemisphereLight(0xffffff,0x444444,.65*Math.PI);scene.add(hemi);const dirL=new THREE.DirectionalLight(0xffffff,.4*Math.PI);dirL.position.set(6,12,8);scene.add(dirL);scene.add(dirL.target);const fillL=new THREE.DirectionalLight(0x8899ff,0);scene.add(fillL);
dirL.castShadow=true;{dirL.shadow.mapSize.set(SHD,SHD);const sc_=dirL.shadow.camera;sc_.left=sc_.bottom=-14;sc_.right=sc_.top=14;sc_.near=1;sc_.far=40;dirL.shadow.bias=-.0006;dirL.shadow.normalBias=.03}
const mats={},TXC={};const FR=new THREE.Frustum(),PM=new THREE.Matrix4(),SPH=new THREE.Sphere(void 0,1.7);let FC=0;
// Chão dos cenários de floresta: [base, sombra, luz, ruído]
const GT={marsh:['#3e5a36','rgba(18,38,22,.5)','rgba(120,170,90,.34)',['#4a6a3e','#2a4228','#6a8a4a','#56743c']],
 atlmoss:['#235a3e','rgba(10,40,26,.5)','rgba(90,170,110,.36)',['#2f7a4e','#17402a','#4fae6c','#2f8a5a']],
 caatsoil:['#a88a68','rgba(80,56,36,.45)','rgba(220,200,170,.36)',['#b89a74','#7a5e44','#d0bc98','#8a6e52']],
 meadow:['#5e8a44','rgba(30,60,26,.42)','rgba(170,210,110,.36)',['#6a9a4a','#4a7a36','#8ab858','#e8d860']]};
function cv(k){if(TXC[k])return TXC[k];const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.scale(2,2);// desenho em coordenadas de 128 px, gravado em 256 (o dobro de nitidez de perto)
const R_=(col,x,y,w,h)=>{g.fillStyle=col;g.fillRect(x,y,w,h)},N=(n,cols)=>{for(let i=0;i<n;i++){const w=1+Math.random()*2,h=1+Math.random()*2;g.fillStyle=cols[i%cols.length];g.beginPath();g.ellipse(Math.random()*128+w/2,Math.random()*128+h/2,w/2,h/2,0,0,6.2832);g.fill()}};// grãos arredondados: em 256 px os quadrados ficariam duros demais
if(k==='sat'){R_('#d9bf85',0,0,128,128);for(let i=0;i<8;i++)R_(i%2?'#e4cd96':'#d0b073',0,i*16+3,128,6);N(400,['#bfa062','#f0dfb0','#d2b476'])}
else if(k==='moss'){R_('#2f5d2d',0,0,128,128);
 const r=texRnd(2711),wrap=(x,y,fn)=>{for(const ox of[-128,0,128])for(const oy of[-128,0,128])fn(x+ox,y+oy)};
 for(let i=0;i<24;i++){g.fillStyle=i%2?'rgba(24,60,28,.42)':'rgba(96,150,70,.34)';g.beginPath();g.arc(r()*128,r()*128,6+r()*13,0,6.283);g.fill()}
 // lâminas de grama pintadas à mão: direção, espessura e tom variados, desenhadas também nas bordas para o ladrilho não emendar
 const MC=['#3d7a38','#244a26','#6a9f48','#4a8a3c'];
 for(let i=0;i<1100;i++){const x=r()*128,y=r()*128,l=1.4+r()*4,a=-1.15+(r()-.5)*1.4,w=.55+r()*.9,col=MC[i%4],al=.3+r()*.45;
  wrap(x,y,(px,py)=>{g.strokeStyle=col;g.globalAlpha=al;g.lineWidth=w;g.lineCap='round';g.beginPath();g.moveTo(px,py);g.quadraticCurveTo(px+Math.cos(a)*l*.55,py+Math.sin(a)*l*.55,px+Math.cos(a)*l,py+Math.sin(a)*l);g.stroke()})}
 g.globalAlpha=1;
 // tufos claros e raras florzinhas, para quebrar a repetição sem virar estampa
 for(let i=0;i<80;i++){const x=r()*128,y=r()*128,q=.7+r()*1.1,c=i%11?'rgba(126,178,92,.24)':'rgba(236,226,110,.5)';
  wrap(x,y,(px,py)=>{g.fillStyle=c;g.beginPath();g.arc(px,py,q,0,6.283);g.fill()})}
}
else if(GT[k]){const[b,dk,lt,nc]=GT[k];R_(b,0,0,128,128);for(let i=0;i<26;i++){g.fillStyle=i%2?dk:lt;g.beginPath();g.arc(Math.random()*128,Math.random()*128,5+Math.random()*12,0,6.283);g.fill()}N(700,nc)}
else{R_('#c9a35a',0,0,128,128);for(let i=0;i<8;i++){R_('#b08a3e',i*16,0,2,128);R_('#d8b66f',i*16+3,0,3,128)}for(let i=0;i<3;i++)R_('#8a6a2a',0,i*43+10,128,3)}
return TXC[k]=c}
// Toon: 3 faixas duras, como no desenho animado (sombra, meio-tom e luz), em duas texturas 3×1: TG para os avatares (contraste mais suave,
// para o rosto não ficar sujo) e TGS para o cenário. O Three só lê o canal vermelho do gradientMap; o trecho abaixo faz ler o RGB, para a
// sombra e o meio-tom levarem a cor de preenchimento do mundo (sombra azulada no mundo quente, quente no frio). Se o Three mudar esse trecho, o
// replace não acha o texto e o toon continua cinza, sem quebrar (tests/assets.test.js avisa).
{const sc=THREE.ShaderChunk;if(sc.gradientmap_pars_fragment)sc.gradientmap_pars_fragment=sc.gradientmap_pars_fragment.replace('vec3( texture2D( gradientMap, coord ).r )','texture2D( gradientMap, coord ).rgb')}
const TONB=[[[176,226,255],[.3,.12,0]],[[128,200,255],[.5,.2,0]]];// [valores das faixas, quanto cada uma leva da cor do mundo]: avatares, cenário
const toonTex=n=>{const d=new Uint8Array(12).fill(255);TONB[n][0].forEach((v,i)=>d.fill(v,i*4,i*4+3));const t=new THREE.DataTexture(d,3,1,THREE.RGBAFormat);t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return t};// nasce cinza; toonTint põe a cor do mundo
let TG=null;const tg=()=>TG||(TG=toonTex(0));
let TGS=null;const tgs=()=>TGS||(TGS=toonTex(1));
// Contorno: tom escuro da paleta de cada mundo (o matiz do chão), em vez de quase preto; um único objeto, lido por avatares e por peças do cenário
const OLC=new THREE.Color('#120c08');
function outlineTint(k){const T=THEME[k];if(!T)return;const h={};OLC.setHex(T.h[1]);OLC.getHSL(h,THREE.SRGBColorSpace);OLC.setHSL(h.h,Math.min(.55,Math.max(.25,h.s)),.08,THREE.SRGBColorSpace)}
function toonTint(k){const c=new THREE.Color(FILL[k]);[tg(),tgs()].forEach((t,n)=>{const[B,M]=TONB[n],d=t.image.data;B.forEach((v,i)=>{[c.r,c.g,c.b].forEach((q,j)=>{d[i*4+j]=Math.round(v*(1-M[i]+M[i]*(.35+.65*q)))})});t.needsUpdate=true});outlineTint(k)}
const LM=o=>{if(PBR)return new THREE.MeshStandardMaterial(o);const{flatShading:fs,...q}=o,m=new THREE.MeshToonMaterial(Object.assign({gradientMap:tgs()},q));if(fs)m.flatShading=true;return m};
const M=c=>{if(mats[c])return mats[c];if(c.startsWith('flat:'))return mats[c]=LM({color:c.slice(5),flatShading:true});if(c.startsWith('emi:'))return mats[c]=new THREE.MeshBasicMaterial({color:c.slice(4)});if(c.startsWith('bark:'))return mats[c]=LM({color:c.slice(5),map:barkTex()});if(c.startsWith('leaf:'))return mats[c]=LM({color:c.slice(5),map:leafTex()});if(c.startsWith('ring:'))return mats[c]=LM({color:c.slice(5),map:ringTex()});if(c.startsWith('stone:'))return mats[c]=LM({color:c.slice(5),map:stoneTex()});if(c.startsWith('tex:')){const[,k,rx,ry]=c.split(':');const t=new THREE.CanvasTexture(cv(k));t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(+rx||1,+ry||1);return mats[c]=LM({map:t})}return mats[c]=LM({color:c})};
const mesh=(g,m,x,y,z,p)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);p.add(o);return o};
// texturas do chão de cada mundo ficam em mats['tex:…']; ao trocar de mundo saem da GPU em vez de acumular
const dropWorldTex=()=>{for(const k of Object.keys(mats))if(k.startsWith('tex:')){const m=mats[k];if(m.map)m.map.dispose();m.dispose();delete mats[k]}};
let GC={};const gk=(n,...a)=>{const k=n+a.join();return GC[k]||(GC[k]=new THREE[n+'Geometry'](...a))};
const disposeTree=o=>o.traverse(c=>{if(c.geometry)c.geometry.dispose();if(c.isPoints||c.userData.own){if(c.material.map)c.material.map.dispose();c.material.dispose()}if(c.isInstancedMesh&&c.dispose)c.dispose()});
const box=(w,h,d,c,x,y,z,p)=>mesh(gk('Box',w,h,d),M(c),x,y,z,p);
const cyl=(r,h,c,x,y,z,p,r2)=>mesh(gk('Cylinder',r2||r,r,h,14),M(c),x,y,z,p);
const SG=new THREE.SphereGeometry(1,16,12),SGS=new THREE.SphereGeometry(1,12,8),SGL=new THREE.SphereGeometry(1,8,6);
// esferas do cenário (e não as do avatar) usam malhas mais leves: pequenas 80 triângulos, médias 176; só as muito grandes ficam com 352
// FOOT: pegadas (x,z,r) das peças do cenário que ficaram depois de declutter; os animais (app-life.js) desviam delas
let LOWG=false,FOOT=[],TOONF=0;const lowSph=r=>r<.25?SGL:r<2.2?SGS:SG;
const ell=(rx,ry,rz,c,x,y,z,p,G)=>{const o=mesh(G||(LOWG?lowSph(Math.max(rx,ry,rz)):SG),c&&c.isMaterial?c:M(c),x,y,z,p);o.scale.set(rx,ry,rz);return o};
let fireGlow=[],waterFx=null,embF=null,seats=[],fireL=null,flames=[],glowT=null,obst=null;
// Área caminhável: o grande círculo central do cenário.
const WALK={x:0,z:1.2,r:10.2};
// A casa lunar fica alinhada ao centro da fogueira (x=0), atrás dela e fora da clareira de terra (raio máx. ~12 m).
const BUS={x:0,z:-15.3},GROUND=150;// chão em disco de 150 m de diâmetro (raio 75): montanhas e campo distante acompanham GROUND
const skyG=new THREE.Group(),planG=new THREE.Group(),bdG=new THREE.Group(),rig=new THREE.Group();// rig: céu, decoração do céu e montanhas ficam parados no centro do mundo (0,0), concêntricos com o chão circular, e espelhados (cópia girada 180°, como a decoração do chão); não seguem nem giram com a câmera
[skyG,planG,bdG].forEach(g=>{rig.add(g)});scene.add(rig);let camYaw=0,camYawS=0,camYawA=0;
const F=c=>'flat:'+c,E=c=>'emi:'+c,PI=Math.PI;
const rn=i=>{const v=Math.sin(i*127.1+311.7)*43758.5453;return v-Math.floor(v)};
const THEME={amazora:{h:[0xe0f4d6,0x1f3d1c,.75],d:[0xf2fadc,.42]},
 cerron:{h:[0xffe3a6,0x6a5028,.85],d:[0xfff0c4,.6]},
 atlanthia:{h:[0xd6f2e0,0x1e3d2a,.8],d:[0xeafaf0,.45]},
 caatara:{h:[0xfff0d8,0x5a4430,.75],d:[0xfff2dc,.55]},
 panthara:{h:[0xd8f0e0,0x1e3a2a,.85],d:[0xfff4e0,.55]},
 pamphora:{h:[0xf0f6e8,0x2a3a22,.9],d:[0xfffbe8,.6]}};
const LDIR={amazora:[3,14,6],cerron:[6,12,8],atlanthia:[-6,12,9],caatara:[9,10,6],panthara:[6,12,9],pamphora:[5,13,7]};for(const k in LDIR)LDIR[k][1]*=.78;let LDO=[6,9.4,8];
// luz de preenchimento: cor complementar à luz principal de cada mundo (vem do lado oposto, sem sombra); também tinge o céu e as sombras do toon
// ids antigas dos mundos (renomeados): se o servidor ainda mandar uma delas, o cliente a converte
const FILL={amazora:'#6ac8ff',cerron:'#7fb0ff',atlanthia:'#7aa8d8',caatara:'#6aa8ff',panthara:'#ffb070',pamphora:'#a8c8ff'},FILLI=.3*Math.PI;
const FOGD={amazora:[20,92],cerron:[36,135],atlanthia:[22,96],caatara:[34,125],panthara:[24,100],pamphora:[40,145]};
const SKY={amazora:{t:'#0b2f17',h:'#7acb7e',st:90,cl:'190,245,180',sun:[-17,12.5,-46,16],pl:[['earth',17,11,-46,18],['gray',5,14,-44,3],['red',-4,9.6,-45,2.4]]},
 cerron:{t:'#2a1e0e',h:'#d9b46a',st:60,cl:'245,220,165',pl:[['sat',-5,13,-46,36],['gray',21,9.5,-45,3.5],['gray',-24,8.5,-45,2.2]]},
 atlanthia:{t:'#0a2a1e',h:'#8ac8a0',st:200,cl:'200,235,215',pl:[['ring',-18,12,-46,16],['red',14,13,-44,5],['gray',3,9.8,-46,3.2],['gray',23,9.5,-44,2]]},
 caatara:{t:'#3a2410',h:'#e8c890',st:60,cl:'255,225,180',sun:[14,12.5,-46,17],pl:[['jup',-15,12,-46,22],['red',-3,14,-44,3.4],['gray',24,9.5,-44,2.2]]},
 panthara:{t:'#0a2a4a',h:'#7ac0e8',st:180,cl:'230,245,255',pl:[['earth',-17,12,-46,18],['ring',15,12.5,-47,13],['gray',3,9.8,-46,3]]},
 pamphora:{t:'#1a3a6a',h:'#a8d4f0',st:60,cl:'255,255,255',sun:[-16,12.5,-46,14],pl:[['earth',17,11,-46,16],['gray',4,14,-44,3],['red',-3,9.6,-45,2.4]]}};
const hx=(h,a)=>`rgba(${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)},${a})`;
function sTex(w,h,fn){const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);return new THREE.CanvasTexture(c)}
// ---------- texturas pintadas do acabamento toon ----------
// Uma textura pequena por família (casca, folha, anel de corte, pedra), quase neutra e tingida pela cor do material. Assim as
// centenas de cores do cenário continuam reaproveitando o mesmo desenho, com custo fixo de VRAM e sem dependência externa.
const texRnd=seed=>{let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}};
const wrapTex=(w,h,fn)=>{const t=sTex(w,h,fn);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t};
let BARKT=null,LEAFT=null,RINGT=null,STONET=null;
const barkTex=()=>BARKT||(BARKT=(()=>{const r=texRnd(9173);return wrapTex(128,256,g=>{
 g.fillStyle='#efe9df';g.fillRect(0,0,128,256);
 for(let i=0;i<70;i++){const x=r()*128,w=.6+r()*2.6,ph=r()*6.283,amp=1+r()*3,dark=r()>.45,al=(dark ? .07+r()*.15 : .08+r()*.14).toFixed(2),c=dark?'52,32,18':'255,246,232';
  for(const ox of[-128,0,128]){g.beginPath();for(let y=-8;y<=264;y+=8){const xx=x+ox+Math.sin(y*.05+ph)*amp;g[y<0?'moveTo':'lineTo'](xx,y)}g.strokeStyle=`rgba(${c},${al})`;g.lineWidth=w;g.lineCap='round';g.stroke()}}
 for(let i=0;i<6;i++){const x=r()*128,y=20+r()*216;g.strokeStyle='rgba(40,24,12,.22)';g.lineWidth=1.4;g.beginPath();g.ellipse(x,y,3+r()*4,5+r()*7,0,0,6.283);g.stroke();g.strokeStyle='rgba(255,250,240,.2)';g.lineWidth=1;g.beginPath();g.ellipse(x-1,y-1,2+r()*3,4+r()*5,0,0,6.283);g.stroke()}
})})());
const leafTex=()=>LEAFT||(LEAFT=(()=>{const r=texRnd(4421);return wrapTex(128,128,g=>{
 g.fillStyle='#f5f8ee';g.fillRect(0,0,128,128);
 const wrap=(x,y,fn)=>{for(const ox of[-128,0,128])for(const oy of[-128,0,128])fn(x+ox,y+oy)};
 for(let i=0;i<110;i++){const x=r()*128,y=r()*128,rx=2+r()*9,ry=rx*(.5+r()*.5),rot=r()*3,c=i%3?'rgba(74,110,44,.11)':'rgba(255,255,240,.22)';
  wrap(x,y,(px,py)=>{g.fillStyle=c;g.beginPath();g.ellipse(px,py,rx,ry,rot,0,6.283);g.fill()})}
 for(let i=0;i<46;i++){const x=r()*128,y=r()*128,dx=(r()-.5)*8;
  wrap(x,y,(px,py)=>{g.strokeStyle='rgba(52,86,36,.1)';g.lineWidth=.7;g.beginPath();g.moveTo(px,py);g.quadraticCurveTo(px+dx,py+5,px+dx*.6,py+11);g.stroke()})}
})})());
const ringTex=()=>RINGT||(RINGT=(()=>{const r=texRnd(773);const t=sTex(128,128,g=>{
 g.fillStyle='#f6ead2';g.fillRect(0,0,128,128);g.translate(64,64);
 for(let i=1;i<9;i++){g.strokeStyle=`rgba(96,58,24,${(.1+r()*.12).toFixed(2)})`;g.lineWidth=1+r()*1.4;g.beginPath();g.arc(0,0,6+i*6.6,0,6.283);g.stroke()}
 for(let i=0;i<14;i++){const a=r()*6.283;g.strokeStyle='rgba(74,44,18,.16)';g.lineWidth=.8;g.beginPath();g.moveTo(Math.cos(a)*8,Math.sin(a)*8);g.lineTo(Math.cos(a)*(44+r()*14),Math.sin(a)*(44+r()*14));g.stroke()}
});t.anisotropy=4;return t})());
const stoneTex=()=>STONET||(STONET=(()=>{const r=texRnd(3319);return wrapTex(128,128,g=>{
 g.fillStyle='#e9e6df';g.fillRect(0,0,128,128);
 const wrap=(x,y,fn)=>{for(const ox of[-128,0,128])for(const oy of[-128,0,128])fn(x+ox,y+oy)};
 for(let i=0;i<120;i++){const x=r()*128,y=r()*128,rx=1.5+r()*7,ry=1.5+r()*5,rot=r()*3,c=i%2?'rgba(70,70,66,.1)':'rgba(255,255,250,.18)';
  wrap(x,y,(px,py)=>{g.fillStyle=c;g.beginPath();g.ellipse(px,py,rx,ry,rot,0,6.283);g.fill()})}
 for(let i=0;i<18;i++){const x=r()*128,y=r()*128,l=6+r()*22,a=r()*3;
  wrap(x,y,(px,py)=>{g.strokeStyle='rgba(54,52,48,.12)';g.lineWidth=.8;g.beginPath();g.moveTo(px,py);g.lineTo(px+Math.cos(a)*l,py+Math.sin(a)*l);g.stroke()})}
})})());
// o planeta espelhado do outro lado do céu é de outro tipo (saturno↔júpiter, terra↔anelado, vermelho↔cinza): o par não repete
const PTWIN={sat:'jup',jup:'sat',earth:'ring',ring:'earth',red:'gray',gray:'red'};
function planetTex(kind){return sTex(256,256,g=>{const r=128,glow=(col,a)=>{const gr=g.createRadialGradient(r,r,60,r,r,r);gr.addColorStop(0,hx(col,a));gr.addColorStop(1,hx(col,0));g.fillStyle=gr;g.fillRect(0,0,256,256)};
 const disc=(rad,c1,c2)=>{const gr=g.createRadialGradient(r-rad*.35,r-rad*.35,rad*.1,r,r,rad);gr.addColorStop(0,c1);gr.addColorStop(1,c2);g.fillStyle=gr;g.beginPath();g.arc(r,r,rad,0,6.283);g.fill()};
 const cr=(c)=>{g.fillStyle=c;[[100,110,12],[150,96,9],[138,150,14],[104,158,7]].forEach(([x,y,q])=>{g.beginPath();g.arc(x,y,q,0,6.283);g.fill()})};
 if(kind==='sat'){glow('#ffd27a',.4);g.strokeStyle='#f3dca0';g.lineWidth=14;g.beginPath();g.ellipse(r,r,120,32,-.3,0,6.283);g.stroke();g.strokeStyle='#c9a86a';g.lineWidth=5;g.beginPath();g.ellipse(r,r,104,26,-.3,0,6.283);g.stroke();disc(62,'#f7e2ae','#a8843c');g.strokeStyle='rgba(150,110,50,.35)';g.lineWidth=7;[-26,-8,12,30].forEach(dy=>{g.beginPath();g.moveTo(r-58,r+dy);g.lineTo(r+58,r+dy);g.stroke()});g.strokeStyle='#f3dca0';g.lineWidth=14;g.beginPath();g.ellipse(r,r,120,32,-.3,0,3.14);g.stroke()}
 else if(kind==='jup'){glow('#ffb070',.4);disc(74,'#f2d6a8','#a85a2c');g.save();g.beginPath();g.arc(r,r,74,0,6.283);g.clip();[['#c9733a',-48,12],['#f4e0bc',-30,10],['#a8502a',-12,14],['#ecd0a2',8,9],['#b8622e',24,13],['#f0d8b0',44,10]].forEach(([c,dy,h])=>{g.fillStyle=c;g.globalAlpha=.8;g.fillRect(r-80,r+dy,160,h)});g.globalAlpha=1;g.fillStyle='#c0392b';g.beginPath();g.ellipse(r+22,r+30,17,10,0,0,6.283);g.fill();g.strokeStyle='rgba(255,230,200,.5)';g.lineWidth=3;g.stroke();g.restore()}
 else if(kind==='ring'){glow('#b98cff',.35);g.strokeStyle='#e7c8ff';g.lineWidth=12;g.beginPath();g.ellipse(r,r,118,30,-.35,0,6.283);g.stroke();disc(66,'#b57cf0','#5a2a9a');g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=6;[-20,0,22].forEach(dy=>{g.beginPath();g.moveTo(r-60,r+dy);g.lineTo(r+60,r+dy);g.stroke()});g.strokeStyle='#e7c8ff';g.lineWidth=12;g.beginPath();g.ellipse(r,r,118,30,-.35,0,3.14);g.stroke()}
 else if(kind==='red'){glow('#ff6a6a',.4);disc(62,'#ff8a7a','#a82a2a');cr('rgba(80,10,10,.3)')}
 else if(kind==='gray'){glow('#cfd6ff',.25);disc(60,'#e3e6f0','#7d8294');cr('rgba(40,40,60,.25)')}
 else if(kind==='sun'){glow('#ffd27a',.75);disc(52,'#fff3c0','#ffb13a')}
 else{glow('#6fb6ff',.55);disc(72,'#3fa0ff','#0b3a8a');g.fillStyle='#3fae5a';[[100,100,26],[150,130,22],[120,160,18]].forEach(([x,y,q])=>{g.beginPath();g.arc(x,y,q,0,6.283);g.fill()});g.strokeStyle='rgba(255,255,255,.7)';g.lineWidth=6;[[80,90],[130,120],[110,170]].forEach(([x,y])=>{g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+30,y-14,x+60,y);g.stroke()})}})}
const glowTex=()=>glowT||(glowT=sTex(256,256,g=>{const gr=g.createRadialGradient(128,128,2,128,128,128);for(let i=0;i<=12;i++){const t=i/12,k=Math.pow(1-t,2.4);gr.addColorStop(t,`rgba(255,${Math.round(205-95*t)},${Math.round(110-60*t)},${(.42*k).toFixed(3)})`)}g.fillStyle=gr;g.fillRect(0,0,256,256)}));
// domo do céu: tudo (degradê, estrelas, nuvens, planetas, sol) fica numa esfera de raio SKYR em volta do centro do mundo; dm leva um ponto para a esfera mantendo a direção (k = fator de escala)
const SKYR=230,dm=(x,y,z)=>{const k=SKYR/(Math.hypot(x,y,z)||1);return[x*k,y*k,z*k,k]};
function buildSky(k){[skyG,planG].forEach(G=>{G.traverse(c=>{if(c.geometry)c.geometry.dispose();if(c.material){c.material.map&&c.material.map.dispose();c.material.dispose()}});G.clear()});const S=SKY[k];

 if(scene.background&&scene.background.dispose)scene.background.dispose();scene.background=null;// libera a textura do céu anterior (vazava uma por troca de mundo); o céu agora é um domo
 {const top=new THREE.Color(S.t).convertLinearToSRGB(),hor=new THREE.Color(S.h).convertLinearToSRGB();// cores já em sRGB: o shader grava direto, sem passar pela conversão de saída
  const dome=new THREE.Mesh(new THREE.SphereGeometry(SKYR+20,32,16),new THREE.ShaderMaterial({uniforms:{top:{value:top},hor:{value:hor}},vertexShader:'varying float vH;void main(){vH=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform vec3 top;uniform vec3 hor;varying float vH;void main(){vec3 c=mix(hor,top,smoothstep(0.,.5,vH));float n=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);gl_FragColor=vec4(c+(n-.5)/255.,1.);}',side:THREE.BackSide,depthTest:false,depthWrite:false,fog:false}));
  dome.renderOrder=-10;dome.frustumCulled=false;skyG.add(dome)}
 // névoa: começa em 30–45 m e só fecha bem depois das montanhas (58–90 m), para elas aparecerem em todos os mundos; mundos mais
 // enevoados (FOGD menor) continuam um pouco mais densos
 const fd0=FOGD[k]||[34,130],fd=[Math.max(30,fd0[0]*1.2),150+(fd0[1]-85)*.6];scene.fog=new THREE.Fog(new THREE.Color(S.h).convertLinearToSRGB(),fd[0],fd[1]);
 const sp=(tex,x0,y0,z0,sx,sy,op,rot,one)=>{const[x,y,z,k]=dm(x0,y0,z0),m=new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,fog:false,opacity:op==null?1:op});if(rot)m.rotation=rot;const p=new THREE.Sprite(m);p.position.set(x,y,z);p.scale.set(sx*k,sy*k,1);skyG.add(p);if(!one){const q=new THREE.Sprite(m);q.position.set(-x,y,-z);q.scale.set(sx*k,sy*k,1);skyG.add(q)}};
 // planetas distantes: mais longe (3,2x), menores na tela (0,72x, mesma elevação), com bruma na cor do horizonte e sem paralaxe (acompanham a câmera);
 // as montanhas da frente cobrem a base deles
 {const KP=3.2,hz=new THREE.Color(S.h).convertLinearToSRGB();S.pl.forEach(([kd,x,y,z,sz])=>{const mk=kn=>new THREE.SpriteMaterial({map:planetTex(kn),transparent:true,depthWrite:false,fog:false,opacity:.82,color:new THREE.Color(1,1,1).lerp(hz,.3)}),p=new THREE.Sprite(mk(kd)),s0=sz*KP*.72,[X,Y,Z,K]=dm(x*KP,4.8+(y-4.8)*KP,z*KP),s=s0*K;p.position.set(X,Y,Z);p.scale.set(s,s,1);planG.add(p);const q=new THREE.Sprite(mk(PTWIN[kd]));q.position.set(-X,Y,-Z);q.scale.set(s,s,1);planG.add(q)})}
 if(S.sun){sp(planetTex('sun'),S.sun[0],S.sun[1],S.sun[2],S.sun[3],S.sun[3],1,0,1);skyG.children[skyG.children.length-1].userData.sun=1}// marcado: a chuva (app-life.js) esconde o sol atrás das nuvens
 if(S.cl){const cl=sTex(256,128,g=>{[[70,80,40],[110,60,50],[160,70,46],[200,84,34],[130,92,44]].forEach(([x,y,r])=>{const gr=g.createRadialGradient(x,y,r*.2,x,y,r);gr.addColorStop(0,`rgba(${S.cl},.95)`);gr.addColorStop(1,`rgba(${S.cl},0)`);g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,6.283);g.fill()})});for(let i=0;i<14;i++){const az=(i+.5)/14*PI,r=44+(i%3)*2;sp(cl,Math.sin(az)*r,6.5+((i*53)%60)/10,-Math.cos(az)*r,12+(i%4)*3,5+(i%3)*1.5,.9)}}
 const a=new Float32Array(S.st*6),sE0=Math.sin(.07),sE1=Math.sin(1.2);for(let i=0;i<S.st;i++){const az=Math.random()*PI,sE=sE0+Math.random()*(sE1-sE0),cE=Math.sqrt(1-sE*sE),x=Math.sin(az)*cE*(SKYR+8),y=sE*(SKYR+8),z=-Math.cos(az)*cE*(SKYR+8);a.set([x,y,z,-x,y,-z],i*6)}// estrelas na esfera, de 4° a 70° de altura, metade sorteada e metade espelhada
 const gm=new THREE.BufferGeometry();gm.setAttribute('position',new THREE.BufferAttribute(a,3));skyG.add(new THREE.Points(gm,new THREE.PointsMaterial({color:'#ffffff',size:1.5,sizeAttenuation:true,fog:false})))}
// h = altura da superfície do assento · fo = deslocamento do corpo para a frente · k = dobra do joelho (1.4 = pernas penduradas)
function seat(x,z,tx,tz,h,fo,k){seats.push({x,z,r:Math.atan2(tx-x,tz-z),h:h||.45,fo:fo||0,k:k==null?1.4:k})}
function campfire(x,z){for(let i=0;i<10;i++){const a=i/10*2*PI;mesh(new THREE.BoxGeometry(.42,.28,.3),M(TOONF?'stone:'+(i%2?'#bba58a':'#a89078'):F(i%2?'#bba58a':'#a89078')),x+Math.cos(a)*1.0,.14,z+Math.sin(a)*1.0,room).rotation.y=-a}
 [0,1,2].forEach(i=>{const l=cyl(.09,.9,TOONF?'bark:#b8662a':F('#b8662a'),x,.22,z,room);l.rotation.z=1.1;l.rotation.y=i*2.09});
 [['#ff2d00',.46,.95],['#ff8a00',.35,1.3],['#ffd23a',.23,1.62],['#fff6b8',.11,1.8]].forEach(([c,r,h])=>{flames.push(mesh(new THREE.ConeGeometry(r,h,7),M(E(c)),x,h/2+.1,z,room))});
 if(TOONF)[['#ff5a00',.19,1.05,-.17,.05],['#ffb020',.14,.82,.2,-.09]].forEach(([c,r,h,dx,dz])=>{const f=mesh(new THREE.ConeGeometry(r,h,6),M(E(c)),x+dx,h/2+.12,z+dz,room);f.rotation.z=dx*1.4;flames.push(f)});
 fireL=new THREE.PointLight(0xff7a2a,FIRE_I*LG,FIRE_R,2);fireL.position.set(x,1.2,z);room.add(fireL);obst={x:x,z:z,r:1.45};
 {const N=26,pa=new Float32Array(N*3),ca=new Float32Array(N*3),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pa,3));g.setAttribute('color',new THREE.BufferAttribute(ca,3));
  const pt=new THREE.Points(g,new THREE.PointsMaterial({map:sparkTex(),size:.2,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));pt.frustumCulled=false;room.add(pt);embF={g,pa,ca,N,x,z}}}
let SPK=null;const sparkTex=()=>SPK||(SPK=sTex(32,32,g=>{const gr=g.createRadialGradient(16,16,0,16,16,16);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(255,200,120,.7)');gr.addColorStop(1,'rgba(255,120,40,0)');g.fillStyle=gr;g.fillRect(0,0,32,32)}));
// brasas: cada uma sobe no próprio ritmo (0,22–0,42 ciclo/s), até uma altura própria (2,6–4,8 m acima da base das chamas), derivando com a brisa e apagando no topo; função do tempo absoluto, igual em qualquer taxa de quadros
function emberTick(t){if(!embF)return;const{g,pa,ca,N,x,z}=embF;for(let i=0;i<N;i++){const ph=(t*(.22+(i*7%5)*.05)+i*.381)%1,a=i*2.4+Math.sin(t*.7+i)*.5,d=.15+ph*.55,H=2.6+(i*5%7)/6*2.2;pa[i*3]=x+Math.cos(a)*d+Math.sin(t*.5+i*1.7)*.35*ph;pa[i*3+1]=.6+ph*(.7+.3*ph)*H;pa[i*3+2]=z+Math.sin(a)*d;const f=Math.sin(ph*3.1416)*(1-ph*.35)*(.6+.4*Math.sin(t*9+i*3));ca[i*3]=f;ca[i*3+1]=f*.55;ca[i*3+2]=f*.18}g.attributes.position.needsUpdate=true;g.attributes.color.needsUpdate=true}
// peça formada por várias malhas fica num grupo só: espelhamento, sobreposição e contorno tratam o conjunto (antes podiam sumir partes)
const piece=(x,z)=>{const g=new THREE.Group();g.position.set(x,0,z);room.add(g);return g};
function tuft(x,z,c){const g=piece(x,z);if(TOONF){for(let i=0;i<7;i++){const a=i/7*6.283,dx=Math.cos(a)*.07,dz=Math.sin(a)*.07,m=mesh(new THREE.ConeGeometry(.042,.34+((i*5)%3)*.04,4),M(F(c||'#a8b84a')),dx,.17,dz,g);m.rotation.set(Math.sin(a)*.24,0,-Math.cos(a)*.24)}return}[[0,0],[.08,.05],[-.07,.06],[.02,-.08]].forEach(([dx,dz])=>mesh(new THREE.ConeGeometry(.06,.35,4),M(F(c||'#a8b84a')),dx,.17,dz,g))}
function rock(x,z,r,col){const m=mesh(new THREE.IcosahedronGeometry(r,0),M(TOONF?'stone:'+col:F(col)),x,r*.45,z,room);m.userData.ol=1;m.scale.set(1,.7,1);m.rotation.y=rn(x+z)*6}
