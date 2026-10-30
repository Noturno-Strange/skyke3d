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
// sem WebGL (ou sem o three.js) o jogo não roda: avisa e interrompe este e os próximos pedaços (cada um confere SKY_NOGL ao carregar)
if(!window.THREE||!document.createElement('canvas').getContext('webgl')){window.SKY_NOGL=true;document.body.insertAdjacentHTML('beforeend','<div id="err">Seu navegador não suporta WebGL ou não conseguiu carregar o motor 3D. Tente Chrome, Firefox, Edge ou Safari atualizados.</div>');throw new Error('Skyke3D: sem WebGL')}
// dados do jogo (itens, gestos, emojis, cores, mundos): assets/catalog.js
const {vivid,PAL,SKIN,EYE,HAIRC,HS,HATS,SHOES,BT,FACES,EMO,ST,ST_LEGACY,ITEMS,GESTS,GEST,ITEM,BRK,LIMITS}=SKYCAT;
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
function randomLook(){const hr=ri(HAIRC.length),P=PAL.length,gl=ri(3)?0:1,b=()=>gl;return{skin:ri(SKIN.length),eye:ri(EYE.length),shirt:ri(P),hair:hr,hs:ri(HS.length),hat:0,hc:ri(P),bt:ri(BT.length),pc:ri(P),sc:ri(P),shoes:ri(SHOES.length),fc:ri(FACES.length),eb:b(),sb:b(),pb:b(),cb:b(),hb:b()}}
const cfg={name:'Visitante',style:'proxima',br:0,...randomLook()};
let mode='menu';{const h=(location.hash.match(/sala=([A-Za-z0-9]+)/)||[])[1];if(h)$('#code').value=h.toUpperCase().slice(0,10)}
function ytId(v){try{const u=new URL(String(v).trim());if(u.protocol!=='https:')return null;let id=null;if(/(^|\.)youtube\.com$/.test(u.hostname))id=u.searchParams.get('v')||(u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)||[])[1];else if(u.hostname==='youtu.be')id=u.pathname.slice(1);return /^[\w-]{11}$/.test(id||'')?id:null}catch(e){return null}}

// ---------- 3D ----------
const COARSE=matchMedia('(pointer:coarse)').matches;document.documentElement.dataset.q=(location.search.match(/[?&]q=(low|med|high)/)||[])[1]||(matchMedia('(pointer:coarse)').matches?'low':'med');
const QL=(location.search.match(/[?&]q=(low|med|high)/)||[])[1]||(COARSE?'low':'med'),SHD={low:0,med:1024,high:2048}[QL],PBR=/[?&]pbr(=|&|$)/.test(location.search);
// correção de gama: cores hex são lidas como sRGB e convertidas para linear; texturas de canvas são sRGB; saída codificada em sRGB
const LG=.7,LGH=.64,LGD=.9,FIRE_I=2.3;
{const SH=THREE.Color.prototype.setHex;THREE.Color.prototype.setHex=function(h){SH.call(this,h);return this.convertSRGBToLinear()};
 const CT=THREE.CanvasTexture;THREE.CanvasTexture=function(...a){const t=new CT(...a);t.encoding=THREE.sRGBEncoding;return t};THREE.CanvasTexture.prototype=CT.prototype}
const renderer=new THREE.WebGLRenderer({antialias:!COARSE,powerPreference:'high-performance'});renderer.outputEncoding=THREE.sRGBEncoding;renderer.shadowMap.enabled=!!SHD;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.prepend(renderer.domElement);
const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(60,1,.1,600),room=new THREE.Group();scene.add(room);
let BRI=1;try{BRI=Math.min(1.6,Math.max(.6,parseFloat(localStorage.getItem('skyke_br'))||1))}catch(e){}
const hemi=new THREE.HemisphereLight(0xffffff,0x444444,.65);scene.add(hemi);const dirL=new THREE.DirectionalLight(0xffffff,.4);dirL.position.set(6,12,8);scene.add(dirL);scene.add(dirL.target);const fillL=new THREE.DirectionalLight(0x8899ff,0);scene.add(fillL);
dirL.castShadow=!!SHD;if(SHD){dirL.shadow.mapSize.set(SHD,SHD);const sc_=dirL.shadow.camera;sc_.left=sc_.bottom=-14;sc_.right=sc_.top=14;sc_.near=1;sc_.far=40;dirL.shadow.bias=-.0006;dirL.shadow.normalBias=.03}
const mats={},TXC={};const FR=new THREE.Frustum(),PM=new THREE.Matrix4(),SPH=new THREE.Sphere(void 0,1.7);let FC=0;
// Chão dos cenários de floresta: [base, sombra, luz, ruído]
const GT={crystal:['#3a4a78','rgba(20,28,60,.5)','rgba(150,200,255,.34)',['#4a5c94','#252f58','#8ab4e8','#6a7cc0']],
 dune:['#b9824a','rgba(110,60,24,.45)','rgba(240,200,140,.38)',['#c99458','#8a5a2c','#e8c088','#a87238']],
 myco:['#4a2640','rgba(30,10,30,.5)','rgba(220,110,160,.3)',['#5e3254','#341a30','#a8587c','#7a3e62']],
 blossom:['#6a8a5a','rgba(40,70,40,.45)','rgba(255,190,215,.38)',['#7a9a66','#4a6a3e','#f0b4cc','#8aaa72']],
 snow:['#dbe6f0','rgba(150,170,195,.45)','rgba(255,255,255,.55)',['#f4f8fc','#b8c8d8','#ffffff','#a8bccf']],
 cinder:['#2a1a18','rgba(10,4,4,.55)','rgba(150,50,30,.3)',['#3a2420','#140a08','#6a2a1a','#8a3a22']],
 deepsea:['#124a6a','rgba(4,24,50,.5)','rgba(70,180,210,.34)',['#1c6a8a','#0a3048','#3ab0c8','#2a8aa8']],
 shadow:['#242a3a','rgba(8,10,20,.55)','rgba(120,140,190,.28)',['#303850','#12162a','#58688e','#434d6e']]};
function cv(k){if(TXC[k])return TXC[k];const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
const R_=(col,x,y,w,h)=>{g.fillStyle=col;g.fillRect(x,y,w,h)},N=(n,cols)=>{for(let i=0;i<n;i++)R_(cols[i%cols.length],Math.random()*128,Math.random()*128,1+Math.random()*2,1+Math.random()*2)};
if(k==='planks'){for(let i=0;i<4;i++){R_(i%2?'#6e4524':'#85562f',0,i*32,128,32);R_('#3a2210',0,i*32,128,2);R_('#3a2210',(i*53+20)%128,i*32,2,32)}N(300,['#5a3a1c','#9a6a3d'])}
else if(k==='wood'){R_('#6b3f1d',0,0,128,128);for(let i=0;i<14;i++)R_(i%3?'#5a3216':'#7d4c25',0,i*9+Math.random()*4,128,1+Math.random()*2);N(120,['#3a2210'])}
else if(k==='brick'){R_('#c9b9a6',0,0,128,128);for(let r=0;r<8;r++)for(let b=0;b<5;b++)R_(r%2?'#8a4b38':'#9a5640',b*32+(r%2?16:0)-16,r*16+1,30,14);N(150,['#6b3a2a'])}
else if(k==='tile'){for(let i=0;i<4;i++)for(let j=0;j<4;j++)R_((i+j)%2?'#22232e':'#2e3042',i*32,j*32,32,32)}
else if(k==='grid'){R_('#2b2d42',0,0,128,128);for(let i=0;i<4;i++){R_('#3d4066',i*32,0,2,128);R_('#3d4066',0,i*32,128,2)}}
else if(k==='sand'){R_('#d9bd84',0,0,128,128);N(500,['#c4a56b','#ecd6a0'])}
else if(k==='leaf'){R_('#2f8f6a',0,0,128,128);g.strokeStyle='#3fae82';g.lineWidth=6;g.beginPath();for(let i=0;i<8;i++){g.moveTo(i*24-20,0);g.lineTo(i*24+30,128)}g.stroke();N(200,['#1f6b4e'])}
else if(k==='metal'){R_('#3b3d52',0,0,128,128);for(let i=0;i<20;i++)R_('#4a4d66',0,i*7,128,1);N(100,['#555a78'])}
else if(k==='grass'){R_('#46752d',0,0,128,128);N(700,['#3a6324','#5a8a38','#6b9a3f'])}
else if(k==='moon'){R_('#8d8f98',0,0,128,128);N(600,['#7a7c86','#a0a2ab','#6c6e77'])}
else if(k==='rust'){R_('#a8482a',0,0,128,128);N(600,['#8f3a20','#c1593a','#7a3018'])}
else if(k==='sat'){R_('#d9bf85',0,0,128,128);for(let i=0;i<8;i++)R_(i%2?'#e4cd96':'#d0b073',0,i*16+3,128,6);N(400,['#bfa062','#f0dfb0','#d2b476'])}
else if(k==='jup'){R_('#c9824a',0,0,128,128);[['#e8c9a0',4,10],['#a8562c',22,12],['#f0dcc0',44,8],['#9a4a26',60,14],['#e3b98a',82,10],['#b8683a',100,12]].forEach(([c,y,h])=>R_(c,0,y,128,h));N(350,['#d99a62','#a04c28','#f0d2a8'])}
else if(k==='scifi'){R_('#1b2230',0,0,128,128);g.strokeStyle='#00e5ff';g.lineWidth=2;g.strokeRect(4,4,120,120);R_('#2b3550',8,8,112,6);R_('#00e5ff',20,64,88,2);R_('#ff2bd6',20,80,40,2);N(80,['#2b3550','#3a4668'])}
else if(k==='mexfloor'){for(let i=0;i<4;i++)for(let j=0;j<4;j++){R_((i+j)%2?'#b5562b':'#c4633a',i*32,j*32,32,32);R_('#7a3a1c',i*32,j*32,32,2);R_('#7a3a1c',i*32,j*32,2,32)}[[48,48],[16,80]].forEach(([x,y])=>{R_('#1f6fb5',x-6,y-6,12,12);R_('#f4f1ea',x-3,y-3,6,6)});N(200,['#8c4020','#d0794a'])}
else if(k==='mexwall'){R_('#d9732b',0,0,128,128);N(240,['#c9631f','#e68a3d']);R_('#1f9d8f',0,88,128,40);R_('#ffd23f',0,84,128,4);for(let x=0;x<128;x+=16){g.fillStyle='#f4f1ea';g.beginPath();g.moveTo(x,108);g.lineTo(x+8,96);g.lineTo(x+16,108);g.lineTo(x+8,120);g.closePath();g.fill()}}
else if(k==='tala'){R_('#f4f1ea',0,0,128,128);for(let i=0;i<4;i++)for(let j=0;j<4;j++){const x=i*32+16,y=j*32+16;g.fillStyle='#1b4f9c';g.beginPath();g.arc(x,y,10,0,6.283);g.fill();g.fillStyle='#f4f1ea';g.beginPath();g.arc(x,y,5,0,6.283);g.fill();R_('#1b4f9c',i*32,j*32,3,3)}}
else if(k==='cyberfloor'){R_('#05080f',0,0,128,128);for(let i=0;i<4;i++){R_('#00e5ff',i*32,0,2,128);R_('#00e5ff',0,i*32,128,2)}R_('#ff2bd6',32,64,32,2);R_('#ff2bd6',96,32,2,32);N(120,['#0a1a2a','#102a40'])}
else if(k==='cyberwall'){R_('#070a18',0,0,128,128);g.strokeStyle='#00e5ff';g.lineWidth=2;g.beginPath();g.moveTo(0,32);g.lineTo(40,32);g.lineTo(56,48);g.lineTo(128,48);g.moveTo(0,96);g.lineTo(70,96);g.lineTo(86,80);g.lineTo(128,80);g.stroke();g.strokeStyle='#ff2bd6';g.beginPath();g.moveTo(20,0);g.lineTo(20,24);g.moveTo(100,128);g.lineTo(100,104);g.stroke();[[40,32],[56,48],[70,96],[86,80]].forEach(([x,y])=>R_('#00e5ff',x-3,y-3,6,6));R_('#ff2bd6',17,22,6,6);R_('#ff2bd6',97,100,6,6)}
else if(k==='cybertop'){R_('#0a0f1c',0,0,128,128);g.strokeStyle='#00e5ff';g.lineWidth=3;g.strokeRect(6,6,116,116);R_('#00e5ff',20,20,8,8);R_('#ff2bd6',100,100,8,8);for(let i=0;i<5;i++)R_('#13243a',20,40+i*16,88,2)}
else if(k==='punkfloor'){for(let i=0;i<4;i++)for(let j=0;j<4;j++)R_((i+j)%2?'#101010':'#7a1010',i*32,j*32,32,32);N(260,['#333','#2a0a0a','#555'])}
else if(k==='graf'){R_('#26262c',0,0,128,128);for(let r=0;r<8;r++){R_('#17171b',0,r*16,128,2);for(let b=0;b<4;b++)R_('#17171b',(b*32+(r%2?16:0))%128,r*16,2,16)}['#ff2a2a','#7dff3a','#ffe600','#ff66cc','#33ccff'].forEach((cc,i)=>{g.strokeStyle=cc;g.lineWidth=3;g.beginPath();const y0=14+i*22;g.moveTo(4,y0);g.bezierCurveTo(30,y0-18,60,y0+20,90,y0-6);g.bezierCurveTo(100,y0-12,112,y0+8,124,y0);g.stroke()});R_('#ffe600',96,98,16,16);R_('#111',100,102,8,8);N(160,['#111','#3a3a42'])}
else if(k==='moss'){R_('#2f5d2d',0,0,128,128);for(let i=0;i<26;i++){g.fillStyle=i%2?'rgba(24,60,28,.5)':'rgba(96,150,70,.4)';g.beginPath();g.arc(Math.random()*128,Math.random()*128,5+Math.random()*12,0,6.283);g.fill()}N(700,['#3d7a38','#244a26','#6a9f48','#4a8a3c'])}
else if(k==='tealmoss'){R_('#1d5852',0,0,128,128);for(let i=0;i<26;i++){g.fillStyle=i%2?'rgba(10,50,52,.5)':'rgba(70,170,150,.38)';g.beginPath();g.arc(Math.random()*128,Math.random()*128,5+Math.random()*12,0,6.283);g.fill()}N(700,['#2a7d70','#174843','#4fb59c','#2f9a86'])}
else if(GT[k]){const[b,dk,lt,nc]=GT[k];R_(b,0,0,128,128);for(let i=0;i<26;i++){g.fillStyle=i%2?dk:lt;g.beginPath();g.arc(Math.random()*128,Math.random()*128,5+Math.random()*12,0,6.283);g.fill()}N(700,nc)}
else if(k==='ambermoss'){R_('#5a3d1e',0,0,128,128);for(let i=0;i<26;i++){g.fillStyle=i%2?'rgba(40,22,8,.5)':'rgba(200,140,60,.34)';g.beginPath();g.arc(Math.random()*128,Math.random()*128,5+Math.random()*12,0,6.283);g.fill()}N(700,['#7a5428','#3f2a14','#a87a3a','#8a6230'])}
else if(k==='violetmoss'){R_('#2a2050',0,0,128,128);for(let i=0;i<26;i++){g.fillStyle=i%2?'rgba(14,8,40,.5)':'rgba(130,100,220,.34)';g.beginPath();g.arc(Math.random()*128,Math.random()*128,5+Math.random()*12,0,6.283);g.fill()}N(700,['#3a2e70','#1c1438','#6a52b0','#4a3a8a'])}
else{R_('#c9a35a',0,0,128,128);for(let i=0;i<8;i++){R_('#b08a3e',i*16,0,2,128);R_('#d8b66f',i*16+3,0,3,128)}for(let i=0;i<3;i++)R_('#8a6a2a',0,i*43+10,128,3)}
return TXC[k]=c}
let TG=null;const tg=()=>{if(!TG){TG=new THREE.DataTexture(new Uint8Array([200,234,255]),3,1,THREE.LuminanceFormat);TG.minFilter=TG.magFilter=THREE.NearestFilter;TG.needsUpdate=true}return TG};
let TGS=null;const tgs=()=>{if(!TGS){TGS=new THREE.DataTexture(new Uint8Array(15).fill(255),5,1,THREE.RGBFormat);TGS.unpackAlignment=1;TGS.minFilter=TGS.magFilter=THREE.NearestFilter;TGS.needsUpdate=true}return TGS};
// 5 faixas de sombra; as duas mais escuras levam a cor de preenchimento do mundo (sombra azulada no quente, quente no frio)
function toonTint(k){const t=tgs(),c=new THREE.Color(FILL[k]),B=[132,168,205,236,255],M=[.3,.16,.06,0,0],d=t.image.data;B.forEach((v,i)=>{[c.r,c.g,c.b].forEach((q,j)=>{d[i*3+j]=Math.round(v*(1-M[i]+M[i]*(.35+.65*q)))})});t.needsUpdate=true}
const LM=o=>{if(PBR)return new THREE.MeshStandardMaterial(o);const{flatShading:fs,...q}=o,m=new THREE.MeshToonMaterial(Object.assign({gradientMap:tgs()},q));if(fs)m.flatShading=true;return m};
const M=c=>{if(mats[c])return mats[c];if(c.startsWith('flat:'))return mats[c]=LM({color:c.slice(5),flatShading:true});if(c.startsWith('emi:'))return mats[c]=new THREE.MeshBasicMaterial({color:c.slice(4)});if(c.startsWith('tex:')){const[,k,rx,ry]=c.split(':');const t=new THREE.CanvasTexture(cv(k));t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(+rx||1,+ry||1);return mats[c]=LM({map:t})}return mats[c]=LM({color:c})};
const mesh=(g,m,x,y,z,p)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);p.add(o);return o};
let GC={};const gk=(n,...a)=>{const k=n+a.join();return GC[k]||(GC[k]=new THREE[n+'Geometry'](...a))};
const disposeTree=o=>o.traverse(c=>{if(c.geometry)c.geometry.dispose();if(c.isPoints||c.userData.own)c.material.dispose();if(c.isInstancedMesh&&c.dispose)c.dispose()});
const box=(w,h,d,c,x,y,z,p)=>mesh(gk('Box',w,h,d),M(c),x,y,z,p);
const cyl=(r,h,c,x,y,z,p,r2)=>mesh(gk('Cylinder',r2||r,r,h,14),M(c),x,y,z,p);
const SG=new THREE.SphereGeometry(1,16,12),SGS=new THREE.SphereGeometry(1,12,8),SGL=new THREE.SphereGeometry(1,8,6);
// esferas do cenário (e não as do avatar) usam malhas mais leves: pequenas 80 triângulos, médias 176; só as muito grandes ficam com 352
// nomir: zonas (x,z,r) dos objetos únicos, que não são espelhados
let LOWG=false,decors=[],nomir=[];const lowSph=r=>r<.25?SGL:r<2.2?SGS:SG;
const ell=(rx,ry,rz,c,x,y,z,p,G)=>{const o=mesh(G||(LOWG?lowSph(Math.max(rx,ry,rz)):SG),c&&c.isMaterial?c:M(c),x,y,z,p);o.scale.set(rx,ry,rz);return o};
let fireGlow=[],waterFx=null,embF=null,seats=[],fireL=null,flames=[],glowT=null,obst=null;
// Área caminhável: o grande círculo central do cenário.
const WALK={x:0,z:1.2,r:10.2};
// A casa lunar fica alinhada ao centro da fogueira (x=0), atrás dela e fora da clareira de terra (raio máx. ~12 m).
const BUS={x:0,z:-15.3},GROUND=150,SCN=.72;// chão em disco de 150 m de diâmetro (raio 75): montanhas e campo distante acompanham GROUND; névoa encurtada por SCN
const skyG=new THREE.Group(),planG=new THREE.Group(),bdG=new THREE.Group(),rig=new THREE.Group();// rig: céu, decoração do céu e montanhas ficam parados no centro do mundo (0,0), concêntricos com o chão circular, e espelhados (cópia girada 180°, como a decoração do chão); não seguem nem giram com a câmera
[skyG,planG,bdG].forEach(g=>{rig.add(g)});scene.add(rig);let camYaw=0,camYawS=0,camYawA=0;
const F=c=>'flat:'+c,E=c=>'emi:'+c,PI=Math.PI;
const rn=i=>{const v=Math.sin(i*127.1+311.7)*43758.5453;return v-Math.floor(v)};
const THEME={proxima:{h:[0xffe3a6,0x6a5028,.85],d:[0xfff0c4,.6]},kepler:{h:[0xffb27a,0x5a2a14,.9],d:[0xffc58e,.7]},gliese:{h:[0xa8b8ff,0x555566,.8],d:[0xffffff,.55]},osiris:{h:[0xffb48a,0x6a2c18,.85],d:[0xffa070,.6]},
 tauri:{h:[0xe0f4d6,0x1f3d1c,.75],d:[0xf2fadc,.42]},esmera:{h:[0xbafff2,0x0f3d3f,.85],d:[0xd6fff6,.48]},
 ambar:{h:[0xffd29a,0x4a2810,.85],d:[0xffe2b0,.55]},nyx:{h:[0xcdb8ff,0x1a1240,.8],d:[0xe2d6ff,.5]},
 lumen:{h:[0xd2e6f6,0x2a3a5a,.75],d:[0xe8f2fa,.45]},duna:{h:[0xffe4c4,0x5a3418,.7],d:[0xffead0,.5]},mira:{h:[0xffb8e0,0x3a1a40,.85],d:[0xffd0ee,.5]},sakura:{h:[0xffd6e6,0x4a2a3a,.9],d:[0xffe6f0,.6]},
 nivis:{h:[0xd2deee,0x445566,.7],d:[0xf0f4fc,.45]},cinder:{h:[0xff9a7a,0x2a0e0a,.75],d:[0xffa070,.45]},trappist:{h:[0xa8dcff,0x0f2a4a,.85],d:[0xd0eeff,.5]},draugr:{h:[0x9aaad0,0x14182a,.7],d:[0xc8d4f0,.4]}};
const LDIR={proxima:[6,12,8],kepler:[10,9,5],gliese:[-4,13,7],osiris:[-9,8,6],tauri:[3,14,6],esmera:[-6,12,9],ambar:[8,11,7],nyx:[-5,13,8],lumen:[4,13,7],duna:[9,10,6],mira:[-7,12,8],sakura:[5,13,7],nivis:[-3,14,6],cinder:[-8,9,6],trappist:[6,12,9],draugr:[-5,13,7]};for(const k in LDIR)LDIR[k][1]*=.78;let LDO=[6,9.4,8];
// luz de preenchimento: cor complementar à luz principal de cada mundo (vem do lado oposto, sem sombra); também tinge o céu e as sombras do toon
// ids antigas dos mundos (renomeados): se o servidor ainda mandar uma delas, o cliente a converte
const FILL={proxima:'#7fb0ff',kepler:'#6aa0d8',gliese:'#b49aff',osiris:'#ff6a3a',tauri:'#6ac8ff',esmera:'#b080ff',ambar:'#6a8aff',nyx:'#5affd0',lumen:'#ffc8f0',duna:'#6aa8ff',mira:'#7affd8',sakura:'#a8c8ff',nivis:'#9ab8ff',cinder:'#ff5a2a',trappist:'#ffb070',draugr:'#6a7aff'},FILLI=.3;
const FOGD={proxima:[34,130],kepler:[30,120],gliese:[42,150],osiris:[30,115],tauri:[24,100],esmera:[26,105],ambar:[26,105],nyx:[24,100],lumen:[30,120],duna:[34,125],mira:[22,95],sakura:[28,110],nivis:[24,95],cinder:[24,95],trappist:[24,100],draugr:[18,85]};
const SKY={proxima:{t:'#2a1e0e',h:'#d9b46a',st:60,cl:'245,220,165',pl:[['sat',-5,13,-46,36],['gray',21,9.5,-45,3.5],['gray',-24,8.5,-45,2.2]]},
 kepler:{t:'#2a1208',h:'#d9824a',st:50,cl:'235,150,100',pl:[['jup',9,13.5,-46,40],['gray',-21,10,-45,3],['gray',-15,14,-45,2]]},
 gliese:{t:'#000008',h:'#1a2350',st:380,milky:1,aurora:1,pl:[['earth',18,11.5,-46,26],['ring',-22,12.5,-48,14],['red',5,13.8,-44,5.5],['gray',-7,9.5,-46,3.5]]},
 osiris:{t:'#2a1424',h:'#e98a58',st:110,cl:'236,150,110',pl:[['ring',-19,11.5,-46,14],['gray',10,12.5,-44,3.2],['gray',15.5,9.8,-44,2.2]]},
 tauri:{t:'#0b2f17',h:'#7acb7e',st:90,cl:'190,245,180',sun:[-17,12.5,-46,16],pl:[['earth',17,11,-46,18],['gray',5,14,-44,3],['red',-4,9.6,-45,2.4]]},
 esmera:{t:'#032126',h:'#4cc6b6',st:200,cl:'150,236,226',aurora:1,pl:[['ring',-18,12,-46,16],['red',14,13,-44,5],['gray',3,9.8,-46,3.2],['gray',23,9.5,-44,2]]},
 ambar:{t:'#2b1304',h:'#e08a3c',st:70,cl:'255,196,130',sun:[18,12,-46,15],pl:[['sat',-16,11.5,-46,26],['gray',4,14,-44,3],['red',-6,9.6,-45,2.4]]},
 nyx:{t:'#07031a',h:'#5b3aa8',st:340,milky:1,aurora:1,cl:'176,140,255',pl:[['ring',16,12.5,-47,16],['gray',-18,11,-45,4.5],['red',-4,14,-44,3.4],['gray',24,9.6,-44,2.2]]},
 lumen:{t:'#0a1633',h:'#8ad0ff',st:240,cl:'190,225,255',aurora:1,pl:[['ring',-17,12,-46,17],['earth',14,11.5,-46,13],['gray',2,14.2,-44,3],['gray',23,9.6,-44,2.2]]},
 duna:{t:'#2a1008',h:'#f0a05a',st:60,cl:'255,190,130',sun:[14,12.5,-46,17],pl:[['jup',-15,12,-46,22],['red',-3,14,-44,3.4],['gray',24,9.5,-44,2.2]]},
 mira:{t:'#240a2a',h:'#d55aa0',st:150,cl:'240,170,220',pl:[['ring',17,12,-46,15],['gray',-19,11,-45,4],['red',3,14,-44,4.2],['gray',-6,9.6,-45,2.4]]},
 sakura:{t:'#3a1a3a',h:'#ffb0cf',st:60,cl:'255,200,225',sun:[-16,12.5,-46,14],pl:[['earth',17,11,-46,16],['gray',4,14,-44,3],['red',-3,9.6,-45,2.4]]},
 nivis:{t:'#050d22',h:'#a8d0f0',st:300,milky:1,aurora:1,cl:'215,235,255',pl:[['gray',-18,12.5,-46,9],['earth',16,11.5,-46,20],['ring',2,14.5,-47,9]]},
 cinder:{t:'#1a0606',h:'#d8442a',st:110,cl:'230,110,80',sun:[16,11.5,-46,13],pl:[['red',-16,12.5,-46,18],['gray',4,14,-44,3],['gray',23,9.6,-44,2.2]]},
 trappist:{t:'#031a3a',h:'#3a9ad8',st:180,cl:'150,210,250',aurora:1,pl:[['earth',-17,12,-46,18],['ring',15,12.5,-47,13],['gray',3,9.8,-46,3]]},
 draugr:{t:'#05060c',h:'#3a4a6a',st:420,milky:1,cl:'120,140,180',pl:[['gray',-17,12.5,-46,16],['gray',15,11,-45,6],['ring',4,14.5,-47,9]]}};
const hx=(h,a)=>`rgba(${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)},${a})`;
function sTex(w,h,fn){const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);return new THREE.CanvasTexture(c)}
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
const milkyTex=()=>sTex(512,128,(g,w,h)=>{for(let i=0;i<14;i++){const x=40+i*34,y=64+Math.sin(i*.7)*18,gr=g.createRadialGradient(x,y,2,x,y,46);gr.addColorStop(0,'rgba(190,170,255,.45)');gr.addColorStop(1,'rgba(190,170,255,0)');g.fillStyle=gr;g.fillRect(0,0,w,h)}for(let i=0;i<500;i++){g.fillStyle='rgba(255,255,255,'+(Math.random()*.8)+')';const x=Math.random()*w;g.fillRect(x,64+Math.sin(x*.015)*18+(Math.random()-.5)*50,1.4,1.4)}});
const auroraTex=()=>sTex(512,128,(g,w,h)=>{for(let i=0;i<40;i++){const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'rgba(80,255,170,0)');gr.addColorStop(.5,'rgba(80,255,170,.35)');gr.addColorStop(1,'rgba(60,160,255,0)');g.fillStyle=gr;g.fillRect(i*13,10+Math.sin(i*.5)*14,10,h-20)}});
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
 if(S.milky)sp(milkyTex(),-4,15,-54,90,24,.9,-.2);
 if(S.aurora)sp(auroraTex(),10,9.5,-52,70,16,.55);
 // planetas distantes: mais longe (3,2x), menores na tela (0,72x, mesma elevação), com bruma na cor do horizonte e sem paralaxe (acompanham a câmera);
 // as montanhas da frente cobrem a base deles
 {const KP=3.2,hz=new THREE.Color(S.h).convertLinearToSRGB();S.pl.forEach(([kd,x,y,z,sz])=>{const mk=kn=>new THREE.SpriteMaterial({map:planetTex(kn),transparent:true,depthWrite:false,fog:false,opacity:.82,color:new THREE.Color(1,1,1).lerp(hz,.3)}),p=new THREE.Sprite(mk(kd)),s0=sz*KP*.72,[X,Y,Z,K]=dm(x*KP,4.8+(y-4.8)*KP,z*KP),s=s0*K;p.position.set(X,Y,Z);p.scale.set(s,s,1);planG.add(p);const q=new THREE.Sprite(mk(PTWIN[kd]));q.position.set(-X,Y,-Z);q.scale.set(s,s,1);planG.add(q)})}
 if(S.sun)sp(planetTex('sun'),S.sun[0],S.sun[1],S.sun[2],S.sun[3],S.sun[3],1,0,1);
 if(S.cl){const cl=sTex(256,128,g=>{[[70,80,40],[110,60,50],[160,70,46],[200,84,34],[130,92,44]].forEach(([x,y,r])=>{const gr=g.createRadialGradient(x,y,r*.2,x,y,r);gr.addColorStop(0,`rgba(${S.cl},.95)`);gr.addColorStop(1,`rgba(${S.cl},0)`);g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,6.283);g.fill()})});for(let i=0;i<14;i++){const az=(i+.5)/14*PI,r=44+(i%3)*2;sp(cl,Math.sin(az)*r,6.5+((i*53)%60)/10,-Math.cos(az)*r,12+(i%4)*3,5+(i%3)*1.5,.9)}}
 const a=new Float32Array(S.st*6),sE0=Math.sin(.07),sE1=Math.sin(1.2);for(let i=0;i<S.st;i++){const az=Math.random()*PI,sE=sE0+Math.random()*(sE1-sE0),cE=Math.sqrt(1-sE*sE),x=Math.sin(az)*cE*(SKYR+8),y=sE*(SKYR+8),z=-Math.cos(az)*cE*(SKYR+8);a.set([x,y,z,-x,y,-z],i*6)}// estrelas na esfera, de 4° a 70° de altura, metade sorteada e metade espelhada
 const gm=new THREE.BufferGeometry();gm.setAttribute('position',new THREE.BufferAttribute(a,3));skyG.add(new THREE.Points(gm,new THREE.PointsMaterial({color:'#ffffff',size:1.5,sizeAttenuation:true,fog:false})))}
// h = altura da superfície do assento · fo = deslocamento do corpo para a frente · k = dobra do joelho (1.4 = pernas penduradas)
function seat(x,z,tx,tz,h,fo,k){seats.push({x,z,r:Math.atan2(tx-x,tz-z),h:h||.45,fo:fo||0,k:k==null?1.4:k})}
function campfire(x,z){for(let i=0;i<10;i++){const a=i/10*2*PI;mesh(new THREE.BoxGeometry(.42,.28,.3),M(F(i%2?'#bba58a':'#a89078')),x+Math.cos(a)*1.0,.14,z+Math.sin(a)*1.0,room).rotation.y=-a}
 [0,1,2].forEach(i=>{const l=cyl(.09,.9,F('#b8662a'),x,.22,z,room);l.rotation.z=1.1;l.rotation.y=i*2.09});
 [['#ff2d00',.46,.95],['#ff8a00',.35,1.3],['#ffd23a',.23,1.62],['#fff6b8',.11,1.8]].forEach(([c,r,h])=>{flames.push(mesh(new THREE.ConeGeometry(r,h,7),M(E(c)),x,h/2+.1,z,room))});
 fireL=new THREE.PointLight(0xff7a2a,FIRE_I*LG,16,2);fireL.position.set(x,1.2,z);room.add(fireL);obst={x:x,z:z,r:1.45};
 {const N=COARSE?10:26,pa=new Float32Array(N*3),ca=new Float32Array(N*3),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pa,3));g.setAttribute('color',new THREE.BufferAttribute(ca,3));
  const pt=new THREE.Points(g,new THREE.PointsMaterial({map:sparkTex(),size:.2,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));pt.frustumCulled=false;room.add(pt);embF={g,pa,ca,N,x,z}}}
let SPK=null;const sparkTex=()=>SPK||(SPK=sTex(32,32,g=>{const gr=g.createRadialGradient(16,16,0,16,16,16);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(255,200,120,.7)');gr.addColorStop(1,'rgba(255,120,40,0)');g.fillStyle=gr;g.fillRect(0,0,32,32)}));
function emberTick(t){if(!embF)return;const{g,pa,ca,N,x,z}=embF;for(let i=0;i<N;i++){const ph=(t*.32+i*.381)%1,a=i*2.4+Math.sin(t*.7+i)*.5,d=.15+ph*.55;pa[i*3]=x+Math.cos(a)*d;pa[i*3+1]=.6+ph*3.6;pa[i*3+2]=z+Math.sin(a)*d;const f=Math.sin(ph*3.1416)*(.6+.4*Math.sin(t*9+i*3));ca[i*3]=f;ca[i*3+1]=f*.55;ca[i*3+2]=f*.18}g.attributes.position.needsUpdate=true;g.attributes.color.needsUpdate=true}
// peça formada por várias malhas fica num grupo só: espelhamento, sobreposição e contorno tratam o conjunto (antes podiam sumir partes)
const piece=(x,z)=>{const g=new THREE.Group();g.position.set(x,0,z);room.add(g);return g};
function tuft(x,z,c){const g=piece(x,z);[[0,0],[.08,.05],[-.07,.06],[.02,-.08]].forEach(([dx,dz])=>mesh(new THREE.ConeGeometry(.06,.35,4),M(F(c||'#a8b84a')),dx,.17,dz,g))}
function rock(x,z,r,col){const m=mesh(new THREE.IcosahedronGeometry(r,0),M(F(col)),x,r*.45,z,room);m.userData.ol=1;m.scale.set(1,.7,1);m.rotation.y=rn(x+z)*6}
