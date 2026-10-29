
const $=s=>document.querySelector(s),R=document.documentElement;
if(!window.THREE||!document.createElement('canvas').getContext('webgl')){document.body.insertAdjacentHTML('beforeend','<div id="err">Seu navegador não suporta WebGL ou não conseguiu carregar o motor 3D. Tente Chrome, Firefox, Edge ou Safari atualizados.</div>')}
else{
// cores vivas, no estilo cel-shading: aumenta a saturação (HSL) das paletas do avatar
const vivid=(h,k,lk)=>{let r=parseInt(h.slice(1,3),16)/255,g=parseInt(h.slice(3,5),16)/255,b=parseInt(h.slice(5,7),16)/255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let l=(mx+mn)/2;let H=0,S=0;if(d){S=d/(1-Math.abs(2*l-1));H=mx===r?((g-b)/d+(g<b?6:0)):mx===g?(b-r)/d+2:(r-g)/d+4;H/=6}
 S=Math.min(1,S*k);if(lk)l=Math.min(.72,Math.max(.42,l*lk));const f=n=>{const a=S*Math.min(l,1-l),kk=(n+H*12)%12,c=l-a*Math.max(-1,Math.min(kk-3,9-kk,1));return Math.round(c*255).toString(16).padStart(2,'0')};return'#'+f(0)+f(8)+f(4)};
const PAL=['#d9453b','#ef8a2c','#f4c936','#3aa860','#1f9d8e','#3d86d6','#8d5bd0','#e9579b','#f1ece1','#8a96a0','#34507a','#8a5a44','#3b3647','#9b2f3f','#f7a8c8','#7fd6dc','#a5d44c','#5a52d8','#fbf6ea','#d9a62b'].map(h=>vivid(h,1.6));
const SKIN=['#f1c9a5','#d9a273','#a8693f','#6b4128'].map(h=>vivid(h,1.3)).concat(['#f7dcc4','#8c5a3c','#4aa3e8','#f58ac6','#9b6bdc','#c9a7f0','#5cc47a','#3cc7c0','#f2d34a','#e0524a','#e8ecf4','#ff9b4a']),EYE=['#5a3418','#1e7be0','#18a85a','#8a5cf0'],HAIRC=['#2f2622','#6e4429','#d6a13c','#b8372c','#b9bfca','#8b5cd6','#3b82d6','#2fa86a','#e8742a','#f1d24a','#62cfe6','#ee6fa8'].map(h=>vivid(h,1.6));
const HS=['Afro','Cacheado','Coque','Moicano','Maria-chiquinha','Nuvem','Espetado','Topete','Curto','Rabo de cavalo','Duplo coque','Bob de bolinhas','Franjinha','Coroa','Pompom','Chiquinhas longas','Cachos longos','Moicano alto','Rabo lateral','Dois pompons','Confete','Colmeia','Orelhinhas','Trancinhas','Flat top','Raspado','Risco lateral','Longo liso','Repicado','Social curto'],HATS=['Sem chapéu','Gorro','Bucket','Cowboy'],SHOES=['Tênis','Bota','Sandália'],BT=['Calça','Bermuda'];
const FACES=['Sorriso aberto','Sorriso suave','Olhos felizes','Piscadinha','Surpreso','Língua de fora','Sorrisão','Bochechas'];
const EMO=['😀','😂','😍','😎','🥳','😭','😡','😱','🤔','👍','👏','🙌','❤️','🔥','🎉','✨','🎤','💃','🤢','😴'];
const ST={aeris:{n:'Proxima'},brontis:{n:'Kepler'},cryon:{n:'Gliese'},pyra:{n:'Osíris'},sylvaris:{n:'Tauri'},verdara:{n:'Esmera'},ambara:{n:'Ambar'},nyxara:{n:'Nyx'},
 lumeris:{n:'Lumen'},dunara:{n:'Duna'},mycelis:{n:'Mira'},rosara:{n:'Sakura'},nivara:{n:'Nivis'},cindara:{n:'Cinder'},marinis:{n:'Trappist'},umbris:{n:'Draugr'}};
const potion=(col,glow)=>({svg:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M26 6h12v4h-2v12l14 28a8 8 0 0 1-7 12H21a8 8 0 0 1-7-12l14-28V10h-2z" fill="rgba(255,255,255,.25)" stroke="#fff" stroke-width="2.5"/><path d="M19 42h26l5 10a6 6 0 0 1-5 9H21a6 6 0 0 1-5-9z" fill="'+col+'"/><circle cx="28" cy="48" r="2.5" fill="#fff" opacity=".8"/><circle cx="37" cy="54" r="2" fill="#fff" opacity=".7"/><path d="M50 8l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="'+glow+'"/></svg>',
 draw:g=>{g.fillStyle='rgba(255,255,255,.25)';g.strokeStyle='#ffffff';g.lineWidth=5;g.beginPath();g.moveTo(52,12);g.lineTo(76,12);g.lineTo(76,22);g.lineTo(72,22);g.lineTo(72,44);g.lineTo(100,100);g.quadraticCurveTo(106,118,86,120);g.lineTo(42,120);g.quadraticCurveTo(22,118,28,100);g.lineTo(56,44);g.lineTo(56,22);g.lineTo(52,22);g.closePath();g.fill();g.stroke();g.fillStyle=col;g.beginPath();g.moveTo(38,84);g.lineTo(90,84);g.lineTo(100,102);g.quadraticCurveTo(104,116,86,118);g.lineTo(42,118);g.quadraticCurveTo(24,116,28,102);g.closePath();g.fill();g.fillStyle=glow;g.beginPath();g.moveTo(100,16);g.lineTo(104,26);g.lineTo(114,30);g.lineTo(104,34);g.lineTo(100,44);g.lineTo(96,34);g.lineTo(86,30);g.lineTo(96,26);g.closePath();g.fill()}});
const ICONS={JUICE:{svg:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 14h32l-4 42H20z" fill="rgba(255,255,255,.28)" stroke="#fff" stroke-width="2.5"/><path d="M18 26h28l-2.5 28h-23z" fill="#ff9f1c"/><path d="M37 3L31 30" stroke="#e63946" stroke-width="3.5"/><circle cx="49" cy="14" r="8.5" fill="#ffb347" stroke="#ff7f00" stroke-width="2"/><path d="M49 6v16M41 14h16" stroke="#ff7f00" stroke-width="2"/></svg>',
 draw:g=>{g.fillStyle='rgba(255,255,255,.28)';g.strokeStyle='#ffffff';g.lineWidth=5;g.beginPath();g.moveTo(32,28);g.lineTo(96,28);g.lineTo(88,112);g.lineTo(40,112);g.closePath();g.fill();g.stroke();g.fillStyle='#ff9f1c';g.beginPath();g.moveTo(36,52);g.lineTo(92,52);g.lineTo(87,108);g.lineTo(41,108);g.closePath();g.fill();g.strokeStyle='#e63946';g.lineWidth=7;g.beginPath();g.moveTo(74,6);g.lineTo(62,60);g.stroke();g.fillStyle='#ffb347';g.strokeStyle='#ff7f00';g.lineWidth=4;g.beginPath();g.arc(98,28,17,0,6.283);g.fill();g.stroke();g.beginPath();g.moveTo(98,12);g.lineTo(98,44);g.moveTo(82,28);g.lineTo(114,28);g.stroke()}},
 POT_RED:potion('#e63946','#ffd166'),POT_BLUE:potion('#3a86ff','#bde0fe'),POT_GREEN:potion('#2dd36f','#d8f3dc'),POT_PURPLE:potion('#9b5de5','#f1c0e8')};
const ITEMS=[{id:'refri',n:'Refrigerante',c:'Bebidas',ic:'🥤',info:'Com gás · sem álcool',a:'Beber'},{id:'suco',n:'Suco de laranja',c:'Bebidas',ic:'JUICE',info:'Natural · sem álcool',a:'Beber'},
{id:'leite',n:'Leite de unicórnio',c:'Bebidas',ic:'🥛',info:'Mágico · brilha em arco-íris',a:'Beber',mg:1},{id:'pocao_cura',n:'Poção da Cura',c:'Bebidas',ic:'POT_RED',info:'Mágica · sabor de cereja',a:'Beber',mg:1},
{id:'elixir_lunar',n:'Elixir Lunar',c:'Bebidas',ic:'POT_BLUE',info:'Mágico · gelado como a lua',a:'Beber',mg:1},{id:'pocao_floresta',n:'Poção da Floresta',c:'Bebidas',ic:'POT_GREEN',info:'Mágica · cheiro de hortelã',a:'Beber',mg:1},
{id:'nectar_estelar',n:'Néctar Estelar',c:'Bebidas',ic:'POT_PURPLE',info:'Mágico · cintila como estrelas',a:'Beber',mg:1},{id:'cha_fada',n:'Chá de Fada',c:'Bebidas',ic:'🍵',info:'Mágico · flores e mel',a:'Beber',mg:1},
{id:'lanche',n:'Lanche',c:'Comidas',ic:'🍔',info:'Pão, carne e queijo',a:'Comer',food:1},{id:'prato',n:'Prato de comida',c:'Comidas',ic:'🍝',info:'Prato quente do dia',a:'Comer',food:1},
{id:'cupcake',n:'Cupcake Arco-Íris',c:'Comidas',ic:'🧁',info:'Mágico · cobertura colorida',a:'Comer',food:1,mg:1},{id:'pizza',n:'Pizza Encantada',c:'Comidas',ic:'🍕',info:'Mágica · queijo que nunca esfria',a:'Comer',food:1,mg:1},
{id:'maca',n:'Maçã Dourada',c:'Comidas',ic:'🍎',info:'Mágica · brilha como ouro',a:'Comer',food:1,mg:1},{id:'biscoito',n:'Biscoito Estrelado',c:'Comidas',ic:'🍪',info:'Mágico · deixa estrelinhas',a:'Comer',food:1,mg:1},
{id:'sorvete',n:'Sorvete Lunar',c:'Comidas',ic:'🍨',info:'Mágico · nunca derrete',a:'Comer',food:1,mg:1},{id:'marshmallow',n:'Espeto de Marshmallow',c:'Comidas',ic:'🍡',info:'Assado na fogueira',a:'Comer',food:1}];
const GESTS=[['arms','🙌','Levantar os braços',3],['scream','😱','Gritar',1.8],['fart','💨','Soltar pum',1.4],['dance1','💃','Dança 1: balanço',Infinity],['dance2','🕺','Dança 2: giro',Infinity],['dance3','🪩','Dança 3: disco',Infinity],
 ['dance4','🤖','Dança 4: robô',Infinity],['dance5','🥁','Dança 5: samba',Infinity],['dance6','🎧','Dança 6: funk',Infinity],['dance7','🦷','Dança 7: floss',Infinity],
 ['dance8','💦','Dança 8: irrigador',Infinity],['dance9','🤘','Dança 9: rock',Infinity],['dance10','👯','Dança 10: cancã',Infinity],['dance11','🧟','Dança 11: zumbi',Infinity],
 ['dance12','🌺','Dança 12: hula',Infinity],['dance13','🩰','Dança 13: pirueta',Infinity],['dance14','🥾','Dança 14: cossaco',Infinity],['dance15','🐔','Dança 15: frango',Infinity],
 ['dance16','🌀','Dança 16: twist',Infinity],['dance17','🌙','Dança 17: moonwalk',Infinity],['dance18','🎶','Dança 18: forró',Infinity],['dance19','🐇','Dança 19: pulinhos',Infinity]];
const SERVER_URL='';/* se o index.html ficar numa CDN, coloque aqui o endereço do servidor, ex.: 'wss://jogo.seudominio.com' */
const ri=n=>Math.floor(Math.random()*n);
function randomLook(){const hr=ri(12),P=PAL.length;return{skin:ri(SKIN.length),eye:ri(4),shirt:ri(P),hair:hr,hs:ri(30),hat:0,hc:ri(P),bt:ri(2),pc:ri(P),sc:ri(P),shoes:ri(3),fc:ri(8)}}
const cfg={name:'Visitante',style:'aeris',...randomLook()};
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
const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(60,1,.1,200),room=new THREE.Group();scene.add(room);
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
 cindara:['#2a1a18','rgba(10,4,4,.55)','rgba(150,50,30,.3)',['#3a2420','#140a08','#6a2a1a','#8a3a22']],
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
else if(k==='sat'){R_('#d9bf85',0,0,128,128);for(let i=0;i<8;i++)R_(i%2?'#e9d4a0':'#c9a86a',0,i*16+3,128,6);N(400,['#bfa062','#f0dfb0','#d2b476'])}
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
const ell=(rx,ry,rz,c,x,y,z,p,G)=>{const o=mesh(G||SG,c&&c.isMaterial?c:M(c),x,y,z,p);o.scale.set(rx,ry,rz);return o};
let fireGlow=[],waterFx=null,embF=null,seats=[],fireL=null,flames=[],orbs=[],spin=[],glowT=null,obst=null,jets=[],jetL=null,emb=null;
// Área caminhável: o grande círculo central do cenário.
const WALK={x:0,z:1.2,r:10.2};
// O ônibus espacial fica estacionado fora do círculo caminhável.
const BUS={x:2,z:-11.6};
const skyG=new THREE.Group();scene.add(skyG);
const F=c=>'flat:'+c,E=c=>'emi:'+c,PI=Math.PI;
const rn=i=>{const v=Math.sin(i*127.1+311.7)*43758.5453;return v-Math.floor(v)};
const THEME={aeris:{h:[0xffe3a6,0x6a5028,.85],d:[0xfff0c4,.6]},brontis:{h:[0xffb27a,0x5a2a14,.9],d:[0xffc58e,.7]},cryon:{h:[0xa8b8ff,0x555566,.8],d:[0xffffff,.55]},pyra:{h:[0xffb48a,0x6a2c18,.85],d:[0xffa070,.6]},
 sylvaris:{h:[0xe0f4d6,0x1f3d1c,.75],d:[0xf2fadc,.42]},verdara:{h:[0xbafff2,0x0f3d3f,.85],d:[0xd6fff6,.48]},
 ambara:{h:[0xffd29a,0x4a2810,.85],d:[0xffe2b0,.55]},nyxara:{h:[0xcdb8ff,0x1a1240,.8],d:[0xe2d6ff,.5]},
 lumeris:{h:[0xd2e6f6,0x2a3a5a,.75],d:[0xe8f2fa,.45]},dunara:{h:[0xffe4c4,0x5a3418,.7],d:[0xffead0,.5]},mycelis:{h:[0xffb8e0,0x3a1a40,.85],d:[0xffd0ee,.5]},rosara:{h:[0xffd6e6,0x4a2a3a,.9],d:[0xffe6f0,.6]},
 nivara:{h:[0xd2deee,0x445566,.7],d:[0xf0f4fc,.45]},cindara:{h:[0xff9a7a,0x2a0e0a,.75],d:[0xffa070,.45]},marinis:{h:[0xa8dcff,0x0f2a4a,.85],d:[0xd0eeff,.5]},umbris:{h:[0x9aaad0,0x14182a,.7],d:[0xc8d4f0,.4]}};
const LDIR={aeris:[6,12,8],brontis:[10,9,5],cryon:[-4,13,7],pyra:[-9,8,6],sylvaris:[3,14,6],verdara:[-6,12,9],ambara:[8,11,7],nyxara:[-5,13,8],lumeris:[4,13,7],dunara:[9,10,6],mycelis:[-7,12,8],rosara:[5,13,7],nivara:[-3,14,6],cindara:[-8,9,6],marinis:[6,12,9],umbris:[-5,13,7]};for(const k in LDIR)LDIR[k][1]*=.78;let LDO=[6,9.4,8];
// luz de preenchimento: cor complementar à luz principal de cada mundo (vem do lado oposto, sem sombra); também tinge o céu e as sombras do toon
const FILL={aeris:'#7fb0ff',brontis:'#6aa0d8',cryon:'#b49aff',pyra:'#ff6a3a',sylvaris:'#6ac8ff',verdara:'#b080ff',ambara:'#6a8aff',nyxara:'#5affd0',lumeris:'#ffc8f0',dunara:'#6aa8ff',mycelis:'#7affd8',rosara:'#a8c8ff',nivara:'#9ab8ff',cindara:'#ff5a2a',marinis:'#ffb070',umbris:'#6a7aff'},FILLI=.3;
const FOGD={aeris:[34,130],brontis:[30,120],cryon:[42,150],pyra:[30,115],sylvaris:[24,100],verdara:[26,105],ambara:[26,105],nyxara:[24,100],lumeris:[30,120],dunara:[34,125],mycelis:[22,95],rosara:[28,110],nivara:[24,95],cindara:[24,95],marinis:[24,100],umbris:[18,85]};
const SKY={aeris:{t:'#2a1e0e',h:'#d9b46a',st:60,cl:'245,220,165',pl:[['sat',-5,13,-46,36],['gray',21,9.5,-45,3.5],['gray',-24,8.5,-45,2.2]]},
 brontis:{t:'#2a1208',h:'#d9824a',st:50,cl:'235,150,100',pl:[['jup',9,13.5,-46,40],['gray',-21,10,-45,3],['gray',-15,14,-45,2]]},
 cryon:{t:'#000008',h:'#1a2350',st:380,milky:1,aurora:1,pl:[['earth',18,11.5,-46,26],['ring',-22,12.5,-48,14],['red',5,13.8,-44,5.5],['gray',-7,9.5,-46,3.5]]},
 pyra:{t:'#2a1424',h:'#e98a58',st:110,cl:'236,150,110',pl:[['ring',-19,11.5,-46,14],['gray',10,12.5,-44,3.2],['gray',15.5,9.8,-44,2.2]]},
 sylvaris:{t:'#0b2f17',h:'#7acb7e',st:90,cl:'190,245,180',sun:[-17,12.5,-46,16],pl:[['earth',17,11,-46,18],['gray',5,14,-44,3],['red',-4,9.6,-45,2.4]]},
 verdara:{t:'#032126',h:'#4cc6b6',st:200,cl:'150,236,226',aurora:1,pl:[['ring',-18,12,-46,16],['red',14,13,-44,5],['gray',3,9.8,-46,3.2],['gray',23,9.5,-44,2]]},
 ambara:{t:'#2b1304',h:'#e08a3c',st:70,cl:'255,196,130',sun:[18,12,-46,15],pl:[['sat',-16,11.5,-46,26],['gray',4,14,-44,3],['red',-6,9.6,-45,2.4]]},
 nyxara:{t:'#07031a',h:'#5b3aa8',st:340,milky:1,aurora:1,cl:'176,140,255',pl:[['ring',16,12.5,-47,16],['gray',-18,11,-45,4.5],['red',-4,14,-44,3.4],['gray',24,9.6,-44,2.2]]},
 lumeris:{t:'#0a1633',h:'#8ad0ff',st:240,cl:'190,225,255',aurora:1,pl:[['ring',-17,12,-46,17],['earth',14,11.5,-46,13],['gray',2,14.2,-44,3],['gray',23,9.6,-44,2.2]]},
 dunara:{t:'#2a1008',h:'#f0a05a',st:60,cl:'255,190,130',sun:[14,12.5,-46,17],pl:[['jup',-15,12,-46,22],['red',-3,14,-44,3.4],['gray',24,9.5,-44,2.2]]},
 mycelis:{t:'#240a2a',h:'#d55aa0',st:150,cl:'240,170,220',pl:[['ring',17,12,-46,15],['gray',-19,11,-45,4],['red',3,14,-44,4.2],['gray',-6,9.6,-45,2.4]]},
 rosara:{t:'#3a1a3a',h:'#ffb0cf',st:60,cl:'255,200,225',sun:[-16,12.5,-46,14],pl:[['earth',17,11,-46,16],['gray',4,14,-44,3],['red',-3,9.6,-45,2.4]]},
 nivara:{t:'#050d22',h:'#a8d0f0',st:300,milky:1,aurora:1,cl:'215,235,255',pl:[['gray',-18,12.5,-46,9],['earth',16,11.5,-46,20],['ring',2,14.5,-47,9]]},
 cindara:{t:'#1a0606',h:'#d8442a',st:110,cl:'230,110,80',sun:[16,11.5,-46,13],pl:[['red',-16,12.5,-46,18],['gray',4,14,-44,3],['gray',23,9.6,-44,2.2]]},
 marinis:{t:'#031a3a',h:'#3a9ad8',st:180,cl:'150,210,250',aurora:1,pl:[['earth',-17,12,-46,18],['ring',15,12.5,-47,13],['gray',3,9.8,-46,3]]},
 umbris:{t:'#05060c',h:'#3a4a6a',st:420,milky:1,cl:'120,140,180',pl:[['gray',-17,12.5,-46,16],['gray',15,11,-45,6],['ring',4,14.5,-47,9]]}};
const hx=(h,a)=>`rgba(${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)},${a})`;
function sTex(w,h,fn){const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);return new THREE.CanvasTexture(c)}
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
function buildSky(k){skyG.traverse(c=>{if(c.geometry)c.geometry.dispose();if(c.material){c.material.map&&c.material.map.dispose();c.material.dispose()}});skyG.clear();const S=SKY[k];
 scene.background=sTex(8,256,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h),cf=new THREE.Color(FILL[k]).convertLinearToSRGB(),c0=new THREE.Color(S.t).convertLinearToSRGB(),c1=new THREE.Color(S.h).convertLinearToSRGB();for(let i=0;i<=10;i++){const q=i/10,e=q*q*(3-2*q),c=c0.clone().lerp(c1,e).lerp(cf,Math.sin(q*Math.PI)*.16),f=x=>Math.round(Math.min(1,x)*255);gr.addColorStop(q*.42,`rgb(${f(c.r)},${f(c.g)},${f(c.b)})`)}gr.addColorStop(1,S.h);g.fillStyle=gr;g.fillRect(0,0,w,h)});
 const fd=FOGD[k]||[34,130];scene.fog=new THREE.Fog(new THREE.Color(S.h).convertLinearToSRGB(),fd[0],fd[1]);
 const sp=(tex,x,y,z,sx,sy,op,rot)=>{const m=new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,fog:false,opacity:op==null?1:op});if(rot)m.rotation=rot;const p=new THREE.Sprite(m);p.position.set(x,y,z);p.scale.set(sx,sy,1);skyG.add(p)};
 if(S.milky)sp(milkyTex(),-4,15,-54,90,24,.9,-.2);
 if(S.aurora)sp(auroraTex(),10,9.5,-52,70,16,.55);
 S.pl.forEach(([kd,x,y,z,sz])=>sp(planetTex(kd),x,y,z,sz,sz));
 if(S.sun)sp(planetTex('sun'),S.sun[0],S.sun[1],S.sun[2],S.sun[3],S.sun[3]);
 if(S.cl){const cl=sTex(256,128,g=>{[[70,80,40],[110,60,50],[160,70,46],[200,84,34],[130,92,44]].forEach(([x,y,r])=>{const gr=g.createRadialGradient(x,y,r*.2,x,y,r);gr.addColorStop(0,`rgba(${S.cl},.95)`);gr.addColorStop(1,`rgba(${S.cl},0)`);g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,6.283);g.fill()})});for(let i=0;i<14;i++)sp(cl,-50+i*8+((i*37)%5),6.5+((i*53)%60)/10,-44-(i%3)*2,12+(i%4)*3,5+(i%3)*1.5,.9)}
 const a=new Float32Array(S.st*3);for(let i=0;i<S.st;i++){a[i*3]=-70+Math.random()*140;a[i*3+1]=6+Math.random()*20;a[i*3+2]=-50-Math.random()*8}
 const gm=new THREE.BufferGeometry();gm.setAttribute('position',new THREE.BufferAttribute(a,3));skyG.add(new THREE.Points(gm,new THREE.PointsMaterial({color:'#ffffff',size:.35,sizeAttenuation:true,fog:false})))}
// h = altura da superfície do assento · fo = deslocamento do corpo para a frente · k = dobra do joelho (1.4 = pernas penduradas)
function seat(x,z,tx,tz,h,fo,k){seats.push({x,z,r:Math.atan2(tx-x,tz-z),h:h||.45,fo:fo||0,k:k==null?1.4:k})}
function pine(x,z,s,i){const g=new THREE.Group();g.position.set(x,0,z);g.scale.set(s,s,s);room.add(g);cyl(.22,1,'#5a3a1c',0,.5,0,g);[[1.55,1.7],[1.2,2.55],[.85,3.3]].forEach(([r,y],j)=>mesh(new THREE.ConeGeometry(r,1.7,7),M(F(['#2f6b2f','#2a5e2a','#357a35'][(i+j)%3])),0,y,0,g))}
function stump(x,z,r,h){r=r||.34;h=h||.5;cyl(r,h,F('#7a4f2a'),x,h/2,z,room);cyl(r*.88,.03,F('#d9b07a'),x,h+.01,z,room)}
function logSeat(x,z,len){const c=cyl(.32,len,F('#8a5a30'),x,.32,z,room);c.rotation.z=PI/2;[-1,1].forEach(s=>{cyl(.3,.04,F('#d9b07a'),x+s*len/2,.32,z,room).rotation.z=PI/2})}
function campfire(x,z){for(let i=0;i<10;i++){const a=i/10*2*PI;mesh(new THREE.BoxGeometry(.42,.28,.3),M(F(i%2?'#bba58a':'#a89078')),x+Math.cos(a)*1.0,.14,z+Math.sin(a)*1.0,room).rotation.y=-a}
 [0,1,2].forEach(i=>{const l=cyl(.09,.9,F('#b8662a'),x,.22,z,room);l.rotation.z=1.1;l.rotation.y=i*2.09});
 [['#ff2d00',.46,.95],['#ff8a00',.35,1.3],['#ffd23a',.23,1.62],['#fff6b8',.11,1.8]].forEach(([c,r,h])=>{flames.push(mesh(new THREE.ConeGeometry(r,h,7),M(E(c)),x,h/2+.1,z,room))});
 fireL=new THREE.PointLight(0xff7a2a,FIRE_I*LG,16,2);fireL.position.set(x,1.2,z);room.add(fireL);obst={x:x,z:z,r:1.45};
 {const N=COARSE?10:26,pa=new Float32Array(N*3),ca=new Float32Array(N*3),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pa,3));g.setAttribute('color',new THREE.BufferAttribute(ca,3));
  const pt=new THREE.Points(g,new THREE.PointsMaterial({map:sparkTex(),size:.2,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));pt.frustumCulled=false;room.add(pt);embF={g,pa,ca,N,x,z}}}
let SPK=null;const sparkTex=()=>SPK||(SPK=sTex(32,32,g=>{const gr=g.createRadialGradient(16,16,0,16,16,16);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(255,200,120,.7)');gr.addColorStop(1,'rgba(255,120,40,0)');g.fillStyle=gr;g.fillRect(0,0,32,32)}));
function emberTick(t){if(!embF)return;const{g,pa,ca,N,x,z}=embF;for(let i=0;i<N;i++){const ph=(t*.32+i*.381)%1,a=i*2.4+Math.sin(t*.7+i)*.5,d=.15+ph*.55;pa[i*3]=x+Math.cos(a)*d;pa[i*3+1]=.6+ph*3.6;pa[i*3+2]=z+Math.sin(a)*d;const f=Math.sin(ph*3.1416)*(.6+.4*Math.sin(t*9+i*3));ca[i*3]=f;ca[i*3+1]=f*.55;ca[i*3+2]=f*.18}g.attributes.position.needsUpdate=true;g.attributes.color.needsUpdate=true}
function tent(x,z,ry,col){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;room.add(g);const c=mesh(new THREE.ConeGeometry(1.5,1.6,4),M(F(col)),0,.8,0,g);c.rotation.y=PI/4;box(.6,.95,.03,'#1d1d22',0,.42,.74,g).rotation.x=-.56}
function cactus(x,z){cyl(.28,.5,F('#b5562b'),x,.25,z,room);cyl(.2,1.2,F('#2f8f3f'),x,1.1,z,room);ell(.2,.28,.2,F('#2f8f3f'),x,1.75,z,room);cyl(.1,.7,F('#2f8f3f'),x+.3,1.3,z,room).rotation.z=-.5;cyl(.1,.6,F('#2f8f3f'),x-.3,1.1,z,room).rotation.z=.5}
function tuft(x,z,c){[[0,0],[.08,.05],[-.07,.06],[.02,-.08]].forEach(([dx,dz])=>mesh(new THREE.ConeGeometry(.06,.35,4),M(F(c||'#a8b84a')),x+dx,.17,z+dz,room))}
function rock(x,z,r,col){const m=mesh(new THREE.IcosahedronGeometry(r,0),M(F(col)),x,r*.45,z,room);m.scale.set(1,.7,1);m.rotation.y=rn(x+z)*6}
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
 const g=new THREE.Group();g.position.set(x,0,z);g.scale.set(s,s,s);g.rotation.y=rn(i+5)*6;room.add(g);
 const k=o.kinds[i%o.kinds.length],c=o.tree,tr=F(o.trunk),col=j=>F(c[(i+j)%c.length]);
 if(k==='round'){cyl(.24,2.1,tr,0,1.05,0,g,.17);[[0,2.7,0,1.2,1],[.7,2.3,-.2,.85,.72],[-.1,3.4,0,.75,.62]].forEach(([dx,dy,dz,rx,ry],j)=>ell(rx,ry,rx,col(j),dx,dy,dz,g))}
 else if(k==='pine'){cyl(.22,1.2,tr,0,.6,0,g);[[1.6,1.9],[1.25,2.8],[.9,3.6]].forEach(([r,y],j)=>mesh(new THREE.ConeGeometry(r,1.8,7),M(col(j)),0,y,0,g))}
 else if(k==='crystal'){[[0,0,.2,2.1,0,0],[.42,.1,.15,1.5,.35,-.12],[-.38,-.12,.14,1.2,-.3,.25],[.05,-.4,.12,.9,.1,-.4]].forEach(([dx,dz,r,h,tx,tz],j)=>{const cg=new THREE.Group();cg.position.set(dx,0,dz);cg.rotation.set(tx,0,tz);g.add(cg);cyl(r,h,col(j),0,h/2,0,cg,r*.8);mesh(new THREE.ConeGeometry(r*.8,h*.3,6),M(E(o.glow)),0,h*1.15,0,cg)})}
 else if(k==='cactus'){const cc=col(0);cyl(.26,2.3,cc,0,1.15,0,g,.2);ell(.2,.26,.2,cc,0,2.35,0,g);[[-1,1.0,.5],[1,1.35,.6]].forEach(([sd,y,h],j)=>{cyl(.11,.55,col(j+1),sd*.4,y,0,g).rotation.z=PI/2;cyl(.11,h,col(j+1),sd*.66,y+h/2-.05,0,g)});ell(.09,.09,.09,E(o.bloom[i%o.bloom.length]),.1,2.55,0,g)}
 else if(k==='mushroom'){cyl(.2,1.5,F('#efe6d4'),0,.75,0,g,.15);ell(1.05,.55,1.05,col(0),0,1.62,0,g);ell(.7,.12,.7,F('#3a1a30'),0,1.38,0,g);[[.5,.3,2.09],[-.4,-.35,2.1],[.1,-.1,2.17],[-.35,.45,2.09]].forEach(([dx,dz,y])=>ell(.13,.07,.13,F('#fff4e0'),dx,y,dz,g))}
 else{cyl(.2,1.6,tr,0,.8,0,g,.14);[[1.0,2.1],[.78,3.1],[.5,4.1]].forEach(([r,y],j)=>mesh(new THREE.ConeGeometry(r,1.5,7),M(col(j)),0,y,0,g));ell(.1,.1,.1,E(o.glow),0,4.95,0,g)}}
function forestBush(x,z,s,i,o){
 [[0,0,0,.62,.42],[.5,.1,.15,.42,.3],[-.45,.05,-.2,.4,.3]].forEach(([dx,dy,dz,rx,ry],j)=>ell(rx*s,ry*s,rx*s,F(o.bush[(i+j)%o.bush.length]),x+dx*s,ry*s*.8+dy*s,z+dz*s,room));
 for(let q=0;q<2;q++){const a=q*3.4+i;ell(.06*s,.06*s,.06*s,E(o.bloom[(i+q)%o.bloom.length]),x+Math.cos(a)*.5*s,.55*s+.05*s*(q%2),z+Math.sin(a)*.5*s,room)}}
function forestFern(x,z,s,i,o){
 for(let k=0;k<4;k++){const a=k*1.5708+i,th=.55+.15*(k%2),l=mesh(new THREE.ConeGeometry(.08*s,.95*s,4),M(F(k%2?o.fern:o.bush[0])),x+Math.cos(a)*.16*s,.4*s,z+Math.sin(a)*.16*s,room);l.rotation.set(Math.sin(a)*th,0,-Math.cos(a)*th)}}
function forestShroom(x,z,s,o){
 [[0,0,1],[.3,.12,.62]].forEach(([dx,dz,k])=>{cyl(.05*s*k,.3*s*k,F('#e9e4d6'),x+dx*s,.15*s*k,z+dz*s,room);ell(.2*s*k,.11*s*k,.2*s*k,E(o.shroom),x+dx*s,.32*s*k,z+dz*s,room)})}
function forestPatch(x,z,r,c){const m=mesh(new THREE.CylinderGeometry(r,r,.03,14),M(F(c)),x,.02,z,room);m.scale.z=.65+rn(x*3+z)*.5;m.rotation.y=rn(x+z*7)*6}
function forestFlora(o,zones){
 const free=(x,z,r)=>!zones.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+r),
  spot=(j,r0,r1)=>{j+=o.seed||0;const a=rn(j*3.1+1)*2*PI,d=r0+(r1-r0)*Math.pow(rn(j*5.3+2),.85);return[WALK.x+Math.sin(a)*d,WALK.z+Math.cos(a)*d]};
 const K=COARSE?.6:1;let n=0;
 for(let j=0;j<300&&n<Math.round(40*K);j++){const [x,z]=spot(j,12.5,46),s=.85+rn(j+11)*.95;if(!free(x,z,1.6*s))continue;forestTree(x,z,s,n,o);zones.push({x,z,r:1.2*s});n++}
 n=0;for(let j=0;j<200&&n<Math.round(20*K);j++){const [x,z]=spot(j+300,11.6,38),s=.7+rn(j+13)*.7;if(!free(x,z,.9*s))continue;forestBush(x,z,s,n,o);zones.push({x,z,r:.7*s});n++}
 n=0;for(let j=0;j<160&&n<Math.round(16*K);j++){const [x,z]=spot(j+600,11.4,34),s=.8+rn(j+17)*.6;if(!free(x,z,.5*s))continue;forestFern(x,z,s,n,o);zones.push({x,z,r:.4*s});n++}
 n=0;for(let j=0;j<120&&n<Math.round(8*K);j++){const [x,z]=spot(j+900,11.5,30),s=.9+rn(j+19)*.7;if(!free(x,z,.5*s))continue;forestShroom(x,z,s,o);zones.push({x,z,r:.4*s});n++}
 n=0;for(let j=0;j<80&&n<10;j++){const [x,z]=spot(j+1200,11,44),r=1.6+rn(j+23)*2.6;if(!free(x,z,r*.5))continue;forestPatch(x,z,r,o.patch[n%o.patch.length]);n++}
 for(let j=0;j<24;j+=COARSE?2:1){const a=j/24*2*PI+rn(j+31)*.15,d=10.9+rn(j+37)*1.6,x=WALK.x+Math.sin(a)*d,z=WALK.z+Math.cos(a)*d;if(free(x,z,.2))tuft(x,z,o.tuft)}}
const campTable=(x,z)=>{box(2.0,.12,1.1,'tex:wood:2:1',x,.86,z,room);[[-.85,-.4],[.85,-.4],[-.85,.4],[.85,.4]].forEach(([dx,dz])=>box(.1,.8,.1,'#3a2210',x+dx,.4,z+dz,room));ell(.08,.12,.08,E('#ffcf6a'),x,1.0,z,room)};
const stumpStool=(x,z)=>stump(x,z,.28,.45);
function campScene(o){box(400,.2,400,'tex:grass:90:90',0,-.1,0,room);cyl(10.5,.05,F(o.lake?'#8aa64a':'#7f9a3c'),0,.02,1.2,room);
 {const gm=mesh(new THREE.PlaneGeometry(26,26),new THREE.MeshBasicMaterial({map:glowTex(),transparent:true,depthWrite:false}),0,.07,1.2,room);gm.rotation.x=-PI/2;fireGlow.push(gm)}
 if(o.lake){mesh(new THREE.CircleGeometry(26,40),LM({color:'#2d86d0'}),0,.03,-34,room).rotation.x=-PI/2;
  [[-30,-52,16,15],[-8,-58,20,18],[18,-55,18,16],[40,-48,14,13]].forEach(([x,z,r,h])=>{mesh(new THREE.ConeGeometry(r,h,6),M(F('#6f7f99')),x,h/2-1,z,room);mesh(new THREE.ConeGeometry(r*.35,h*.3,6),M(F('#ffffff')),x,h*.85-1,z,room)});
  box(1.8,.1,8,'tex:wood:1:4',9.5,.15,-12,room);for(let i=0;i<30;i++)pine((i%2?1:-1)*(12+rn(i)*20),-30+rn(i+9)*36,.8+rn(i+11)*.9,i);
  }
 else{[[-22,-34,20],[10,-38,24],[32,-30,18],[-40,-22,16],[44,-14,16]].forEach(([x,z,s])=>ell(s,s*.28,s*.7,F('#2a5a2a'),x,-1,z,room));
  for(let i=0;i<46;i++){let x,z;if(i%3){x=-34+rn(i)*68;z=-10-rn(i+99)*26}else{x=(rn(i+7)<.5?-1:1)*(10+rn(i+3)*18);z=-8+rn(i+5)*15}pine(x,z,.8+rn(i+11)*.9,i)}}
 campfire(0,1.2);logSeat(0,3.4,2.4);seat(-.55,3.4,0,1.2,.64,.08);seat(.55,3.4,0,1.2,.64,.08);
 [[-2.4,-.2],[2.4,-.2]].forEach(([x,z])=>{stump(x,z);seat(x,z,0,1.2,.5,.08)});

 [[-7,-5],[-7,5],[7,5]].forEach(([x,z],i)=>pine(x,z,.49,i));for(let i=0;i<30;i++)tuft(-8+rn(i)*16,-3+rn(i+50)*9)}
function decorGroup(x,z,ry){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;room.add(g);return g}
function decorSolar(x,z,s,o){
 const g=decorGroup(x,z,rn(x+z)*1.2),MTL=F('#d6dbe6'),DK=F('#27324a'),GL=E(o.ring);
 [[-.9,.15,-.15],[.05,.4,.45],[.9,-.2,-.55]].forEach(([dx,dz,ry],i)=>{
  const p=new THREE.Group();p.position.set(dx*s,1.0*s,dz*s);p.rotation.y=ry;p.rotation.z=(i-1)*.08;g.add(p);
  box(1.15*s,.04*s,.62*s,DK,0,0,0,p).rotation.x=-.38;
  box(1.2*s,.03*s,.68*s,MTL,0,-.035*s,0,p).rotation.x=-.38;
  box(.055*s,1.0*s,.055*s,MTL,0,-.5*s,0,p);
  box(.8*s,.015*s,.035*s,GL,0,.045*s,.28*s,p);
 });
 cyl(.055*s,1.55*s,MTL,1.5*s,.78*s,.65*s,g);
 const dish=mesh(new THREE.CylinderGeometry(.78*s,.16*s,.38*s,16,1,true),M(MTL),1.5*s,1.55*s,.65*s,g);dish.rotation.x=-.55;dish.rotation.z=.15;
 cyl(.018*s,.5*s,MTL,1.5*s,1.83*s,.65*s,g);
 ell(.08*s,.08*s,.08*s,GL,1.5*s,2.1*s,.65*s,g);
}
function greenhouse(x,z,ry,o){
 const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;room.add(g);
 const W=7,D=4.6,H=2.4,RH=3.6,A=Math.atan2(RH-H,D/2),SL=Math.hypot(D/2,RH-H)+.05,
  FL=o.flora||['#ff5ac8','#ffd54f','#ff7a3a','#a56bff','#4cd9ff','#ff4d4d'],LF=o.leaf||'#2f9e5a',LF2='#1f7a4e',
  GL=LM({color:o.glass,transparent:true,opacity:.26,side:THREE.DoubleSide,depthWrite:false}),
  FR=F('#e9e4d6');
 box(W+.2,.12,D+.2,F('#5b6478'),0,.06,0,g);
 // vidros
 const gl=(w,h,d,px,py,pz)=>mesh(new THREE.BoxGeometry(w,h,d),GL,px,py,pz,g);
 gl(W,H,.04,0,H/2+.12,-D/2);gl(.04,H,D,-W/2,H/2+.12,0);gl(.04,H,D,W/2,H/2+.12,0);
 gl(2.75,H,.04,-2.125,H/2+.12,D/2);gl(2.75,H,.04,2.125,H/2+.12,D/2);gl(1.5,.4,.04,0,H-.08+.12,D/2);
 const sh=new THREE.Shape();sh.moveTo(-D/2,H);sh.lineTo(D/2,H);sh.lineTo(0,RH);sh.closePath();const gg=new THREE.ShapeGeometry(sh);
 [-1,1].forEach(s=>{const m=mesh(gg,GL,s*W/2,.12,0,g);m.rotation.y=PI/2});
 [-1,1].forEach(s=>{const m=mesh(new THREE.BoxGeometry(W+.2,.05,SL),GL,0,(H+RH)/2+.12,s*D/4,g);m.rotation.x=s*A});
 // estrutura
 [-3.5,-2.1,-.75,.75,2.1,3.5].forEach(px=>{box(.1,H,.1,FR,px,H/2+.12,D/2,g);box(.1,H,.1,FR,px,H/2+.12,-D/2,g)});
 [-D/2,-.8,.8,D/2].forEach(pz=>{box(.1,H,.1,FR,-W/2,H/2+.12,pz,g);box(.1,H,.1,FR,W/2,H/2+.12,pz,g)});
 [-3.5,-1.75,0,1.75,3.5].forEach(px=>[-1,1].forEach(s=>{const m=box(.07,.07,SL,FR,px,(H+RH)/2+.12,s*D/4,g);m.rotation.x=s*A}));
 box(W+.2,.1,.1,FR,0,RH+.12,0,g);box(W+.1,.08,.08,FR,0,H+.12,D/2,g);box(W+.1,.08,.08,FR,0,H+.12,-D/2,g);
 box(.08,H-.4,.08,FR,-.75,(H-.4)/2+.12,D/2,g);box(.08,H-.4,.08,FR,.75,(H-.4)/2+.12,D/2,g);box(1.6,.08,.08,FR,0,H-.4+.12,D/2,g);
 box(W-.4,.05,.14,E('#ff7ad9'),0,RH-.12,-.6,g);box(W-.4,.05,.14,E('#7ad9ff'),0,RH-.12,.6,g);
 // canteiros
 const bed=(w,d,px,pz)=>{box(w,.45,d,F('#7a8196'),px,.345,pz,g);box(w-.1,.05,d-.1,F('#4b3220'),px,.595,pz,g)};
 bed(6.2,1.1,0,-1.6);bed(1.0,2.7,-2.65,.35);bed(1.0,2.7,2.65,.35);
 // plantas
 const SY=.62,stG=new THREE.CylinderGeometry(.025,.035,1,6),cnG=new THREE.ConeGeometry(1,1,6);let n=0;
 const plant=(px,pz)=>{const i=n++,col=FL[(i*3+Math.floor(rn(i+5)*FL.length))%FL.length],h=.35+rn(i+3)*.45,k=i%4,jx=px+(rn(i)-.5)*.18,jz=pz+(rn(i+1)-.5)*.18;
  if(k===0){mesh(stG,M(F(LF)),jx,SY+h/2,jz,g).scale.y=h;ell(.14,.09,.14,col,jx,SY+h+.04,jz,g);ell(.05,.05,.05,'#ffe45a',jx,SY+h+.1,jz,g);ell(.11,.03,.05,LF2,jx+.08,SY+h*.45,jz,g)}
  else if(k===1){ell(.22,.17,.22,LF,jx,SY+.15,jz,g);[0,1,2,3].forEach(q=>ell(.06,.06,.06,col,jx+Math.cos(q*1.6+i)*.17,SY+.2+(q%2)*.1,jz+Math.sin(q*1.6+i)*.17,g))}
  else if(k===2){mesh(stG,M(F(LF)),jx,SY+h/2,jz,g).scale.y=h;ell(.08,.17,.08,col,jx,SY+h+.1,jz,g);ell(.1,.03,.05,LF2,jx-.07,SY+h*.4,jz,g)}
  else{[-1,0,1].forEach(q=>mesh(cnG,M(F(q?col:LF)),jx+q*.09,SY+h/2,jz+(q?.03:0),g).scale.set(.09,h*(q?1:.8),.09))}};
 for(let c=0;c<8;c++){plant(-2.8+c*.8,-1.85);plant(-2.8+c*.8+.4,-1.35)}
 for(let r=0;r<5;r++)[-1,1].forEach(s=>{plant(s*2.45,-.75+r*.62);plant(s*2.85,-.45+r*.62)});
 // vaso central com árvore florida
 cyl(.6,.5,F('#7a8196'),0,.37,-.1,g);cyl(.5,.05,F('#4b3220'),0,.62,-.1,g);cyl(.07,1.3,F('#6b4a2a'),0,1.25,-.1,g);
 [[0,2.05,0,.5],[-.35,1.85,.1,.32],[.38,1.9,-.05,.3],[.05,1.8,-.4,.28]].forEach(([dx,dy,dz,r],q)=>ell(r,r*.85,r,q?FL[q%FL.length]:LF,dx,dy,-.1+dz,g));
 for(let q=0;q<9;q++){const a=q*.7;ell(.07,.07,.07,FL[q%FL.length],Math.cos(a)*.5,1.75+(q%3)*.2,-.1+Math.sin(a)*.5,g)}}

function spaceScene(o){
 const zones=[],occupied=[{x:0,z:1.2,r:10.2}];
 const clearRock=(x,z,r)=>{zones.forEach(({x:cx,z:cz,r:cr})=>{const dx=x-cx,dz=z-cz,d=Math.hypot(dx,dz),min=cr+r+.45;if(d<min){x=cx+dx/(d||1)*min;z=cz+dz/(d||1)*min}});return[x,z]};
  box(400,.2,400,o.gtex,0,-.1,0,room);descampado(CUR);
 forestCenter(o);
 // Uma estufa por cenário, sempre em uma área livre; candidatos alternativos evitam sobreposição.
 const GH=4.35,ghSpots=[[-15,1.2,0],[10,-14.5,PI],[0,-15.2,0],[0,17.2,PI],[-23,-11,.35],[23,-11,-.35]];
 for(const [x,z,ry] of ghSpots){if(occupied.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+GH+.35))continue;greenhouse(x,z,ry,o);occupied.push({x,z,r:GH});zones.push({x,z,r:GH+.8});break}
 // Conjuntos de painéis solares e antena/prato; também testam posições livres antes de construir.
 [[-13.6,9.3,1.35],[13.6,9.3,1.35],[-15.8,-7.8,.95],[15.8,-7.8,.95]].forEach(([ax,az,s])=>{const dir=ax<0?-1:1,candidates=[[ax,az],[ax+dir*1.6,az+.7],[ax+dir*.7,az-1.7],[ax-dir*.9,az+1.4],[ax+dir*2.2,az-1.0]],r=3.2*s;for(const [x,z] of candidates){if(occupied.some(q=>Math.hypot(x-q.x,z-q.z)<q.r+r+.35))continue;o.decor(x,z,s,o);occupied.push({x,z,r});zones.push({x,z,r:r+.8});break}});
 descRim(CUR,o,zones);
 zones.push({x:BUS.x,z:BUS.z,r:7.5});
 // Mantém as pedras fora do piso central.
 zones.push({x:0,z:1.2,r:12.2});
 for(let i=0;i<26;i++){const r=.4+rn(i+3)*1.2,[x,z]=clearRock((rn(i)<.5?-1:1)*(11+rn(i+1)*28),-30+rn(i+2)*35,r);rock(x,z,r,o.rock)}
 for(let i=0;i<20;i++){const r=.8+rn(i+42)*2,[x,z]=clearRock(-40+rn(i+40)*80,-15-rn(i+41)*30,r);rock(x,z,r,o.rock2)}
 forestFlora(o,zones)}
const BUILD={aeris:()=>spaceScene({forest:1,gtex:'tex:sat:90:90',pad:'#3b3326',ring:'#ffd27a',edge:'#f5d58a',flora:['#ff5ac8','#a56bff','#ffd54f','#fff1c0','#ff9ad0'],glass:'#ffe9b0',rock:'#b99a5c',rock2:'#a8884a',decor:decorSolar,
  tree:['#a8a23a','#c4b84a','#8a8a2e','#d9c85a'],trunk:'#5a3a1c',bush:['#8a8a2e','#a8a23a','#c9a24a'],bloom:['#ffd54f','#ff9ad0','#fff1c0'],fern:'#a8b83a',shroom:'#ffb13a',moss:'#8a8a3a',patch:['#a08a4a','#8a7440','#b89a56'],tuft:'#c4b84a',kinds:['round','pine','round','spire'],glow:'#ffe9a8',seed:1300}),
 brontis:()=>spaceScene({forest:1,gtex:'tex:jup:90:90',pad:'#3a2a24',ring:'#ff7a3a',edge:'#ff9a4a',flora:['#ff4d4d','#ffb13a','#fff0d0','#ff5ac8','#ff7a3a'],glass:'#ffb890',rock:'#8a4528',rock2:'#d9a878',decor:decorSolar,
  tree:['#c4622a','#d9803a','#a84a22','#e8a050'],trunk:'#4a2a1a',bush:['#a84a22','#c4622a','#d9803a'],bloom:['#ffb13a','#ff4d4d','#fff0d0'],fern:'#d9803a',shroom:'#ff7a3a',moss:'#a84a22',patch:['#8a4a2a','#a86038','#6e3a22'],tuft:'#d9803a',kinds:['round','spire','pine','round'],glow:'#ffb890',seed:2700}),
 cryon:()=>spaceScene({forest:1,gtex:'tex:moon:90:90',pad:'#2a3342',ring:'#00e5ff',edge:'#7fe9ff',flora:['#4cd9ff','#a56bff','#ff5ac8','#7dff9a','#ffffff'],glass:'#9fd0ff',rock:'#7d7f8b',rock2:'#6c6e7a',decor:decorSolar,
  tree:['#bfe6ff','#9ccaf0','#e8f6ff','#7aaed8'],trunk:'#4a5a6a',bush:['#7aaed8','#9ccaf0','#a8c8e8'],bloom:['#e8f6ff','#4cd9ff','#ffffff'],fern:'#9ccaf0',shroom:'#7affff',moss:'#7a9ab8',patch:['#8aa0b8','#9ab0c8','#6a8098'],tuft:'#bfe6ff',kinds:['crystal','pine','crystal','spire'],glow:'#bff0ff',seed:3100}),
 pyra:()=>spaceScene({forest:1,gtex:'tex:rust:90:90',pad:'#3d2620',ring:'#ff8a3a',edge:'#ffa24a',flora:['#ffd54f','#ff4d9a','#ff8a3a','#c06bff','#4cd9ff'],glass:'#ffcf9f',rock:'#8f3a20',rock2:'#7a3018',decor:decorSolar,
  tree:['#4a2c24','#5a3426','#6a3a2a','#3a2420'],trunk:'#2a1a14',bush:['#5a3426','#6a3a2a','#8a4a2a'],bloom:['#ff8a3a','#ffd54f','#ff4d4d'],fern:'#8a4a2a',shroom:'#ff8a3a',moss:'#5a3426',patch:['#4a2c24','#5e3a2c','#3a2018'],tuft:'#8a4a2a',kinds:['spire','round','pine','spire'],glow:'#ff9a4a',seed:4700}),
 sylvaris:()=>spaceScene({forest:1,gtex:'tex:moss:90:90',pad:'#1b2620',ring:'#7dff9a',edge:'#c4ec7a',flora:['#ff7ac8','#ffd54f','#ff9a4a','#b98cff','#fff1c0'],glass:'#c8ffd0',rock:'#7d7a66',rock2:'#5f6b52',decor:decorSolar,
  tree:['#2f8f3a','#3fae4a','#277a35','#58b84f'],trunk:'#5a3a1c',bush:['#2a7a34','#3a9a44','#6aa83a'],bloom:['#ffd54f','#ff7ac8','#fff1c0'],fern:'#3fb04a',shroom:'#ffb13a',moss:'#4a8a3a',patch:['#3c7a35','#5a9a42','#2c5e2e'],tuft:'#7ac84a',kinds:['round','pine','round'],glow:'#b8ff9a'}),
 verdara:()=>spaceScene({forest:1,gtex:'tex:tealmoss:90:90',pad:'#15262a',ring:'#4cffe0',edge:'#5cf0d6',flora:['#4cd9ff','#c06bff','#ff7ad9','#7dffb0','#ffffff'],glass:'#a8fff0',rock:'#5d7f88',rock2:'#47666e',decor:decorSolar,
  tree:['#1f9a8a','#2fbfa8','#176f78','#3ad0c0'],trunk:'#3f4a52',bush:['#1a8a80','#2aaa96','#3a70a8'],bloom:['#4cffe0','#c06bff','#7ad9ff'],fern:'#2fc9a8',shroom:'#c06bff',moss:'#2f8a78',patch:['#1f6a62','#2f8a78','#17525a'],tuft:'#5ae0c0',kinds:['pine','spire','round','spire'],glow:'#7dfff0',seed:5000}),
 ambara:()=>spaceScene({forest:1,gtex:'tex:ambermoss:90:90',pad:'#2a1c10',ring:'#ffb13a',edge:'#e0a24a',flora:['#ffd54f','#ff7a3a','#ff4d4d','#fff1c0','#ffb13a'],glass:'#ffe0b0',rock:'#8a6a44',rock2:'#6f5236',decor:decorSolar,
  tree:['#d9741f','#e8962e','#b5461f','#f0b13a'],trunk:'#4a2e18',bush:['#a8481f','#c9701f','#8a6a1f'],bloom:['#ffd54f','#ff7a3a','#fff1c0'],fern:'#c9801f',shroom:'#ff5a3a',moss:'#8a6a2a',patch:['#6a4a22','#8a5a28','#4f3418'],tuft:'#d9a03a',kinds:['round','pine','round','round'],glow:'#ffd27a',seed:9000}),
 nyxara:()=>spaceScene({forest:1,gtex:'tex:violetmoss:90:90',pad:'#1a1430',ring:'#b98cff',edge:'#c9a8ff',flora:['#b98cff','#ff7ad9','#4cd9ff','#7dffb0','#ffffff'],glass:'#d8c8ff',rock:'#5a5078',rock2:'#463e62',decor:decorSolar,
  tree:['#5a3fb0','#7a52d9','#3f2f8a','#9a6aff'],trunk:'#2c2a3e',bush:['#4a2f9a','#6a44c8','#2f5aa8'],bloom:['#ff7ad9','#4cd9ff','#d8b0ff'],fern:'#7a5ae0',shroom:'#4cffe0',moss:'#4a3a8a',patch:['#2f2660','#44358a','#221c4a'],tuft:'#9a7ae0',kinds:['spire','pine','spire','round'],glow:'#c9a8ff',seed:7000}),
 lumeris:()=>spaceScene({forest:1,gtex:'tex:crystal:90:90',pad:'#1c2440',ring:'#8ad0ff',edge:'#a8e0ff',flora:['#7ad0ff','#ff9ad9','#b8a0ff','#7dffd0','#ffffff'],glass:'#cfeaff',rock:'#6a78a0',rock2:'#505c84',decor:decorSolar,
  tree:['#7ad0ff','#a8a0ff','#ff9ad9','#8af0e0'],trunk:'#4a5070',bush:['#4a6ab0','#6a8ad8','#8a70c8'],bloom:['#bff0ff','#ffb8e8','#ffffff'],fern:'#6aa8e0',shroom:'#7affff',moss:'#4a6ab0',patch:['#3a4a88','#4a5c94','#2a3868'],tuft:'#8ac8ff',kinds:['crystal','crystal','spire','round'],glow:'#bff0ff',seed:1100}),
 dunara:()=>spaceScene({forest:1,gtex:'tex:dune:90:90',pad:'#3a2a1c',ring:'#ffb13a',edge:'#e0b060',flora:['#ff5a8a','#ffd54f','#ff8a4a','#fff1c0','#ffffff'],glass:'#ffe8c0',rock:'#b8884e',rock2:'#9a6c3a',decor:decorSolar,
  tree:['#3f8a4a','#5aa85a','#2f7a58','#7ac06a'],trunk:'#6a4a2a',bush:['#a8683a','#c98a4a','#8a8a3a'],bloom:['#ff5a8a','#ffd54f','#ff8a4a'],fern:'#7a9a3a',shroom:'#ff7a3a',moss:'#8a7a3a',patch:['#a8743e','#c98e52','#8a5a30'],tuft:'#c9a85a',kinds:['cactus','cactus','cactus','round'],glow:'#ffd27a',seed:2300}),
 mycelis:()=>spaceScene({forest:1,gtex:'tex:myco:90:90',pad:'#2a1228',ring:'#ff7ac8',edge:'#e060a8',flora:['#ff7ac8','#7affe0','#ffd54f','#b98cff','#ffffff'],glass:'#ffd0f0',rock:'#7a5a6e',rock2:'#5e4256',decor:decorSolar,
  tree:['#d83a5a','#ff7a3a','#b84aa8','#ffb13a'],trunk:'#5a3a4a',bush:['#8a3a7a','#a84a8a','#5a3a8a'],bloom:['#ff9ad9','#ffd54f','#7affe0'],fern:'#c04a8a',shroom:'#7affe0',moss:'#7a3a6a',patch:['#4a2640','#5e3254','#341a30'],tuft:'#d06aa0',kinds:['mushroom','mushroom','mushroom','round'],glow:'#ff9ad9',seed:3700}),
 rosara:()=>spaceScene({forest:1,gtex:'tex:blossom:90:90',pad:'#2a2028',ring:'#ff9ac4',edge:'#ffc0d8',flora:['#ff9ec4','#ffffff','#ffd54f','#b98cff','#ff7ab0'],glass:'#ffe0ec',rock:'#9a8a8a',rock2:'#7a6a70',decor:decorSolar,
  tree:['#ff9ec4','#ffb7d5','#f080a8','#ffd0e2'],trunk:'#4a2e28',bush:['#d9709a','#f090b4','#7aa860'],bloom:['#ffffff','#ffd0e2','#ffd54f'],fern:'#6aa060',shroom:'#ff9ec4',moss:'#6a8a4a',patch:['#6a8a5a','#7a9a66','#58784a'],tuft:'#a8c878',kinds:['round','round','round','pine'],glow:'#ffd0e2',seed:4100}),
 nivara:()=>spaceScene({forest:1,gtex:'tex:snow:90:90',pad:'#1c2430',ring:'#bfe6ff',edge:'#e0f0ff',flora:['#bfe6ff','#ffffff','#a8c8ff','#ffd0e8','#7dffd0'],glass:'#e0f2ff',rock:'#8a96a8',rock2:'#6c788c',decor:decorSolar,
  tree:['#e8f4ff','#cfe6f5','#9ac0d8','#2f6a5a'],trunk:'#4a3a30',bush:['#9ab8cc','#c8dcea','#4a7a6a'],bloom:['#ffffff','#bfe6ff','#ffd0d0'],fern:'#7aa8a0',shroom:'#ff7a5a',moss:'#8aa8b8',patch:['#c8d8e6','#b0c4d6','#e6eef6'],tuft:'#e0ecf6',kinds:['pine','pine','pine','spire'],glow:'#bfe6ff',seed:6100}),
 cindara:()=>spaceScene({forest:1,gtex:'tex:cindara:90:90',pad:'#1c1210',ring:'#ff6a2a',edge:'#ff8a3a',flora:['#ff7a3a','#ffb13a','#ff4a2a','#ffd54f','#ffffff'],glass:'#ffc09a',rock:'#4a3a38',rock2:'#33282a',decor:decorSolar,
  tree:['#2a1a18','#3a2420','#4a2a20','#1a1010'],trunk:'#1e1210',bush:['#3a1a14','#5a2a1a','#6a3a1a'],bloom:['#ff7a3a','#ffb13a','#ff4a2a'],fern:'#6a2a1a',shroom:'#ff6a2a',moss:'#4a2a20',patch:['#2a1a18','#3a2420','#1a1010'],tuft:'#6a3a2a',kinds:['spire','pine','spire','spire'],glow:'#ff7a3a',seed:8300}),
 marinis:()=>spaceScene({forest:1,gtex:'tex:deepsea:90:90',pad:'#0e2438',ring:'#4ac8f0',edge:'#6ad8ff',flora:['#7affe0','#ff9ad9','#fff0a8','#b8a0ff','#ffffff'],glass:'#bfeaff',rock:'#3a6a88',rock2:'#2c566e',decor:decorSolar,
  tree:['#2fa8d8','#4cc8e8','#2a7ab8','#6ae0e0'],trunk:'#1c4a66',bush:['#1a8aa8','#2aa8c0','#4a6ad8'],bloom:['#7affe0','#ff9ad9','#fff0a8'],fern:'#2ac0b0',shroom:'#ff8ad9',moss:'#1f7a98',patch:['#0f3a56','#1a5a78','#0a2c44'],tuft:'#4ad0d8',kinds:['spire','round','crystal','spire'],glow:'#7affe0',seed:9700}),
 umbris:()=>spaceScene({forest:1,gtex:'tex:shadow:90:90',pad:'#10121c',ring:'#8ab0ff',edge:'#a8c4ff',flora:['#cfe6ff','#9ab8ff','#ffffff','#b8a0ff','#7dffd0'],glass:'#d0dcf0',rock:'#4a5470',rock2:'#363e56',decor:decorSolar,
  tree:['#8a9ab8','#aab8d0','#6a7898','#c8d4e8'],trunk:'#14161e',bush:['#3a4260','#4a5478','#2a3250'],bloom:['#cfe6ff','#9ab8ff','#ffffff'],fern:'#5a6a90',shroom:'#9ab8ff',moss:'#3a4468',patch:['#1c2234','#242c44','#161a2a'],tuft:'#7a8ab0',kinds:['spire','pine','spire','round'],glow:'#cfe6ff',seed:11300})};
// ---------- Ônibus espacial: fuselagem de revolução, asas/deriva extrudadas de curvas Bézier, turbinas com fogo ----------
const BUS_FLAME=['#ff4a12','#ff9a1f','#fff2b8'];
function jetTick(t){
 for(const j of jets){
  if(j.sp){const s=j.s0*(.92+.1*Math.sin(t*20+j.ph));j.m.scale.set(s,s,1)}
  else j.m.scale.set(1+Math.sin(t*26+j.ph*3)*.1+Math.sin(t*43+j.ph)*.06,1+Math.sin(t*31+j.ph)*.07,1+Math.cos(t*29+j.ph)*.07)}
 if(jetL)jetL.intensity=1.5+Math.sin(t*17)*.25+Math.sin(t*41)*.15;
 if(emb){const{pa,N,pg,src,off}=emb;for(let i=0;i<N;i++){const ph=(t*.85+i*.618)%1,s=src[i%src.length],o=off[i];pa[i*3]=s[0]-ph*s[3];pa[i*3+1]=s[1]+o[0]*ph*1.1+ph*ph*.35;pa[i*3+2]=s[2]+o[1]*ph*1.1}pg.attributes.position.needsUpdate=true}}
function spaceBus(){const g=new THREE.Group();room.add(g);
 const hullM=M('#eef2f7');if(PBR){hullM.roughness=.35;hullM.metalness=.1}
 const dkM=M('#1b2233'),glassM=M(E('#7fe8ff')),accM=M('#27c4f4'),darkGlassM=M(E('#3aa6d8'));
 const nzM=M('#39414f');nzM.side=THREE.DoubleSide;
 const nacM=M('#ecf0f6');nacM.side=THREE.DoubleSide;
 // --- fuselagem: perfil suave (nariz em ogiva arredondada, cauda em cúpula) revolucionado em torno do eixo ---
 const R=1,y0=-4.7,y1=5.65,yb=-4,yn=1.2,prof=[];
 for(let i=0;i<=64;i++){const y=y0+(y1-y0)*i/64;let r=R;
  if(y<yb){const t=(yb-y)/(yb-y0);r=R*Math.sqrt(Math.max(0,1-t*t))}
  else if(y>yn){const t=(y-yn)/(y1-yn);r=R*Math.pow(Math.max(0,1-Math.pow(t,2.2)),.6)}
  prof.push(new THREE.Vector2(Math.max(0,r),y))}
 const lathe=(pts,sc,seg,pa,pl)=>{const geo=new THREE.LatheGeometry(pts.map(p=>new THREE.Vector2(p.x*sc,p.y)),seg,pa,pl);geo.rotateZ(-PI/2);geo.scale(1,.9,1);return geo};
 mesh(lathe(prof,1,44),hullM,0,0,0,g);
 mesh(lathe(prof,1.012,32,PI/2-.95,1.9),dkM,0,0,0,g);
 [[-3.05,-2.75],[1.55,1.75]].forEach(([a,b])=>mesh(lathe([new THREE.Vector2(R,a),new THREE.Vector2(R,b)],1.01,44),accM,0,0,0,g));
 ell(.3,.26,.26,dkM,5.4,0,0,g);
 // --- cabine e janelas arredondadas ---
 const cp=ell(1.0,.42,.55,glassM,3.3,.6,0,g);cp.rotation.z=-.22;
 const fr=ell(1.12,.46,.6,dkM,3.18,.55,0,g);fr.rotation.z=-.22;
 [-1.9,-1.2,-.5,.2,.9].forEach(x=>[-1,1].forEach(s=>{const w=ell(.3,.17,.08,darkGlassM,x,.38,s*.9,g);w.rotation.x=-s*.47}));
 // --- asas delta curvas, com winglets ---
 const ex=(sh,d,bv)=>new THREE.ExtrudeGeometry(sh,{depth:d,bevelEnabled:true,bevelThickness:bv,bevelSize:bv,bevelSegments:2,curveSegments:14,steps:1});
 [-1,1].forEach(s=>{
  const w=new THREE.Shape();w.moveTo(1.5,0);w.quadraticCurveTo(-.2,1.1*s,-2.9,2.5*s);w.quadraticCurveTo(-3.3,2.65*s,-3.55,2.35*s);w.quadraticCurveTo(-4.1,1.3*s,-4.2,.2*s);w.lineTo(-4.2,0);
  const wg=ex(w,.12,.05);wg.rotateX(PI/2);wg.translate(0,-.38,0);mesh(wg,hullM,0,0,0,g);
  const wl=new THREE.Shape();wl.moveTo(-2.7,0);wl.quadraticCurveTo(-3.2,.5,-3.6,1.15);wl.quadraticCurveTo(-3.75,1.2,-3.85,1.15);wl.quadraticCurveTo(-3.9,.5,-3.7,0);
  const wlg=ex(wl,.06,.03);wlg.translate(0,0,-.03);const wo=mesh(wlg,accM,0,-.4,s*2.4,g);wo.rotation.x=s*.22});
 // --- deriva vertical curva + faixa ---
 const tf=new THREE.Shape();tf.moveTo(-1.3,.5);tf.quadraticCurveTo(-2.5,1.4,-3.6,3.05);tf.quadraticCurveTo(-3.95,3.35,-4.25,3.1);tf.quadraticCurveTo(-4.55,1.9,-4.4,.5);
 const tg=ex(tf,.14,.04);tg.translate(0,0,-.07);mesh(tg,hullM,0,0,0,g);
 const ts=new THREE.Shape();ts.moveTo(-2.95,.8);ts.quadraticCurveTo(-3.65,1.5,-4.1,2.45);ts.lineTo(-4.3,2.3);ts.quadraticCurveTo(-3.8,1.4,-3.2,.55);
 const tsg=ex(ts,.17,.01);tsg.translate(0,0,-.085);mesh(tsg,accM,0,0,0,g);
 // --- trem de pouso ---
 [[3.2,0,.14],[-1.6,.55,.2],[-1.6,-.55,.2]].forEach(([x,z,r])=>{cyl(.05,.8,'#b8c0cf',x,-1.15,z,g);const w=cyl(.22,r,'#20242e',x,-1.5,z,g);w.rotation.x=PI/2});
 // --- medidas antes de acoplar as chamas ---
 g.updateMatrixWorld(true);
 const bb=new THREE.Box3().setFromObject(g);
 // --- turbinas laterais (nacele curva, entrada com anel e cone) + motor central ---
 const np=[[.28,-1.35],[.3,-1.2],[.36,-.95],[.4,-.5],[.42,0],[.42,.6],[.4,1],[.37,1.3],[.34,1.38]].map(([r,y])=>new THREE.Vector2(r,y));
 const nacG=new THREE.LatheGeometry(np,28);nacG.rotateZ(-PI/2);
 const bell=new THREE.LatheGeometry([[.13,0],[.15,.1],[.22,.32],[.31,.55],[.37,.72]].map(([r,y])=>new THREE.Vector2(r,y)),24);bell.rotateZ(PI/2);
 const NC=-2.7,NY=-.08,NZ=1.55,src=[],jl=[];
 const flameGeo=(Rr,L)=>{const pts=[];for(let i=0;i<=14;i++){const t=i/14;pts.push(new THREE.Vector2(Math.max(0,Rr*Math.pow(1-t,.85)*(1+.3*Math.sin(PI*Math.min(1,t*1.1)))),L*t))}const geo=new THREE.LatheGeometry(pts,14);geo.rotateZ(PI/2);return geo};
 const jet=(x,y,z,Rr,L,ph)=>{const p=new THREE.Group();p.position.set(x,y,z);g.add(p);
  [[0,1,1,.5],[1,.7,.76,.68],[2,.4,.5,.92]].forEach(([ci,rs,ls,op],i)=>{
   const m=new THREE.Mesh(flameGeo(Rr*rs,L*ls),new THREE.MeshBasicMaterial({color:BUS_FLAME[ci],transparent:true,opacity:op,blending:THREE.AdditiveBlending,depthWrite:false}));m.userData.own=1;m.renderOrder=2;p.add(m);jets.push({m,ph:ph+i*.9})});
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.9}));sp.userData.own=1;sp.position.set(-.3,0,0);sp.scale.set(Rr*7,Rr*7,1);p.add(sp);jets.push({m:sp,sp:1,s0:Rr*7,ph});
  src.push([x-.15,y,z,L*.85])};
 [-1,1].forEach((s,i)=>{const z=s*NZ;
  mesh(nacG,nacM,NC,NY,z,g);
  const lip=mesh(new THREE.TorusGeometry(.41,.045,10,28),accM,NC+1.38,NY,z,g);lip.rotation.y=PI/2;
  const fan=cyl(.34,.04,'#10141c',NC+1.05,NY,z,g);fan.rotation.z=PI/2;
  const cone=mesh(new THREE.ConeGeometry(.12,.34,14),hullM,NC+1.2,NY,z,g);cone.rotation.z=-PI/2;
  const ring=cyl(.27,.03,E('#ff7a2a'),NC-1.3,NY,z,g);ring.rotation.z=PI/2;
  jet(NC-1.38,NY,z,.3,3.3,i*1.7)});
 mesh(bell,nzM,-4.4,0,0,g);
 const rg=cyl(.15,.03,E('#ff7a2a'),-4.45,0,0,g);rg.rotation.z=PI/2;
 jet(-5.12,0,0,.34,2.4,3.3);
 // --- brasas e luz do escapamento ---
 const N=42,pa=new Float32Array(N*3),pg=new THREE.BufferGeometry(),off=[];for(let i=0;i<N;i++)off.push([(rn(i+7)-.5)*.9,(rn(i+19)-.5)*.9]);
 pg.setAttribute('position',new THREE.BufferAttribute(pa,3));
 const pts=new THREE.Points(pg,new THREE.PointsMaterial({color:'#ffb347',size:.16,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));pts.frustumCulled=false;pts.userData.own=1;g.add(pts);
 emb={pa,N,pg,src,off};
 if(!COARSE){jetL=new THREE.PointLight(0xff8a3a,1.5*LG,10);jetL.position.set(-5.6,0,0);g.add(jetL)}
 // --- escala uniforme e posicionamento fora do círculo caminhável ---
 const S=.8;g.scale.set(S,S,S);g.position.set(BUS.x-(bb.min.x+bb.max.x)*S/2,-bb.min.y*S+.16,BUS.z-(bb.min.z+bb.max.z)*S/2)}
const NOMERGE=/[?&]nomerge(=|&|$)/.test(location.search),_mv=new THREE.Vector3(),_nm=new THREE.Matrix3();
// Funde meshes estáticos opacos que dividem o mesmo material, por célula de 24 unidades (mantém o frustum culling).
// objetos sólidos de porte médio (troncos, tocos, árvores, tendas, pedras grandes) projetam sombra; chão, pisos e brilhos não
const _cb=new THREE.Box3(),_cs=new THREE.Vector3();
function markCasters(){room.updateMatrixWorld(true);room.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||o.material.transparent||Array.isArray(o.material)||o.material.isMeshBasicMaterial||o.userData.own||flames.includes(o)||spin.includes(o)||o.geometry.type==='PlaneGeometry')return;_cb.setFromObject(o);if(_cb.isEmpty())return;_cb.getSize(_cs);if(_cs.y>=.25&&_cs.y<=9&&Math.max(_cs.x,_cs.z)<=6&&_cb.min.y<.6)o.castShadow=true})}
function mergeStatic(){room.updateMatrixWorld(true);const dyn=new Set([...flames,...spin,...orbs.map(o=>o.m),...jets.map(j=>j.m)]),B=new Map(),keep=new Set([SG,...Object.values(GC)]);
 room.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||dyn.has(o)||!o.visible||Array.isArray(o.material)||o.material.transparent||!o.geometry.attributes.position||!o.geometry.attributes.normal)return;const e=o.matrixWorld.elements,k=o.material.uuid+'|'+(o.castShadow?1:0)+'|'+Math.floor(e[12]/24)+','+Math.floor(e[14]/24);(B.get(k)||B.set(k,[]).get(k)).push(o)});
 B.forEach(L=>{if(L.length<2)return;const mat=L[0].material,hasUv=!!mat.map;let n=0;const gs=L.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry;n+=g.attributes.position.count;return g});
  const pos=new Float32Array(n*3),nor=new Float32Array(n*3),uv=hasUv?new Float32Array(n*2):null;let off=0;
  L.forEach((o,i)=>{const g=gs[i],P=g.attributes.position,N=g.attributes.normal,U=g.attributes.uv,m=o.matrixWorld;_nm.getNormalMatrix(m);
   for(let j=0;j<P.count;j++){_mv.fromBufferAttribute(P,j).applyMatrix4(m);pos[(off+j)*3]=_mv.x;pos[(off+j)*3+1]=_mv.y;pos[(off+j)*3+2]=_mv.z;_mv.fromBufferAttribute(N,j).applyMatrix3(_nm).normalize();nor[(off+j)*3]=_mv.x;nor[(off+j)*3+1]=_mv.y;nor[(off+j)*3+2]=_mv.z;if(uv&&U){uv[(off+j)*2]=U.getX(j);uv[(off+j)*2+1]=U.getY(j)}}off+=P.count});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));if(uv)g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  L.forEach(o=>{o.parent.remove(o);if(!keep.has(o.geometry))o.geometry.dispose()});const mm=new THREE.Mesh(g,mat);mm.castShadow=L[0].castShadow;room.add(mm)})}
// Descampado: clareira de terra irregular, com textura própria e borda natural (pedras e tufos) por bioma.
let CUR='aeris';
const DESC={aeris:['#b89a62','#9a7e4c','#d6bb80','#8a6f3e','pebble'],brontis:['#b8643a','#8a4a2a','#d98a58','#7a3a20','clay'],cryon:['#8d93a3','#6c7285','#d4dcee','#5b6072','frost'],pyra:['#6a3a2a','#4a2619','#8f5238','#2c1612','ash'],sylvaris:['#6a5a3a','#4f6a34','#8a7548','#3f4f2a','leaf'],verdara:['#2f4f4a','#1f6a62','#4a7a72','#17383a','glow'],ambara:['#6a4220','#4a2c14','#b8803c','#3a2210','autumn'],nyxara:['#2a2048','#1a1233','#4a3a7a','#120b26','spore'],
 lumeris:['#6a78a0','#4a5680','#b8d4ff','#38426a','shard'],dunara:['#d8a468','#b07e44','#f0cc94','#8e6030','pebble'],mycelis:['#5a2c4a','#3a1a30','#a85a82','#26101f','pinkglow'],rosara:['#9a7a64','#7a5c48','#e8b4c6','#5e4436','petal'],
 nivara:['#aab6c4','#8793a4','#dfe8f2','#7a8698','frost'],cindara:['#3a2420','#241410','#6a3424','#120806','ash'],marinis:['#1f5a78','#123a54','#5ac0d8','#0c2a40','bluegl'],umbris:['#303850','#1e2438','#6a7aa0','#12162a','ghost']};
const DUST={spore:'#d9a8ff',pinkglow:'#ff9ad9',bluegl:'#7ac8ff',ghost:'#cfe6ff'},LEAFC={leaf:['#8a9a3a','#c9a03a','#a0522d','#5a7a2a'],autumn:['#e07a28','#c9a03a','#b5412a','#8a5a2a'],petal:['#ffb7d5','#ff8ab8','#fff0f5','#d96a9a']};
const RIMT={aeris:'#d8b66f',brontis:'#e0a070',cryon:'#cfe8ff',pyra:'#3a1e18',sylvaris:'#7ac84a',verdara:'#5ae0c0',ambara:'#d98a3a',nyxara:'#b98cff',lumeris:'#9fd8ff',dunara:'#d9a85a',mycelis:'#e05a7a',rosara:'#ff9ec4',nivara:'#e8f4ff',cindara:'#6a2a1a',marinis:'#3aa8c8',umbris:'#8a9ab8'};
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
 for(let i=0;i<30;i++){const a=(i+rn(i+300)*.8)/30*6.2832,q=DR*drr(a)*(1+(rn(i+330)-.5)*.08),x=Math.cos(a)*q,z=WALK.z+Math.sin(a)*q;if(ok(x,z))rock(x,z,.16+rn(i+360)*.26,i%3?o.rock:o.rock2)}
 for(let i=0;i<54;i++){const a=rn(i+400)*6.2832,q=DR*drr(a)*(.99+rn(i+430)*.1),x=Math.cos(a)*q,z=WALK.z+Math.sin(a)*q;if(ok(x,z))tuft(x,z,RIMT[k])}}
let PT=null,dotT=null;
const PFX={aeris:['#ffe9a8',.13,.12,.4],brontis:['#ffc58e',.11,.04,.6],cryon:['#e6f0ff',.11,-.2,.3],pyra:['#ff9a4a',.13,.55,.8,'dot',1],sylvaris:['#d8ff7a',.2,.03,1,'leaf'],verdara:['#8affea',.14,.1,.7,'dot',1],ambara:['#ffb35a',.22,-.1,1,'leaf'],nyxara:['#d9a8ff',.16,.12,.8,'dot',1],lumeris:['#cfeaff',.12,.14,.5,'dot',1],dunara:['#ffd39a',.12,.06,.8],mycelis:['#ff9ad9',.17,.1,.7,'dot',1],rosara:['#ffc2dc',.22,-.1,1,'petal'],nivara:['#ffffff',.2,-.22,.4,'flake'],cindara:['#a89a94',.15,-.12,.7,'flake2'],marinis:['#9fe4ff',.2,.18,.6,'ring'],umbris:['#cfe6ff',.13,.08,.9,'dot',1]};
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
// Cordilheiras distantes em duas camadas: dão profundidade ao horizonte (a névoa as esmaece)
function mountains(k){const S=SKY[k],h=new THREE.Color(S.h),t=new THREE.Color(S.t);
 [[104,126,22,.5,9,19,12,22],[138,170,20,.3,15,31,18,34]].forEach(([r0,r1,n,mix,h0,h1,w0,w1],L)=>{const col=h.clone().lerp(t,mix+.25).multiplyScalar(L?.9:.72).getHexString();
  for(let i=0;i<n;i++){const a=(i+rn(i*7+L*50)*.7)/n*2*PI,d=r0+(r1-r0)*rn(i*3+L*20+1),H=h0+(h1-h0)*rn(i*5+L*30+2),W=w0+(w1-w0)*rn(i*11+L*40+3),m=mesh(new THREE.ConeGeometry(W,H,5+(i%2)),M('flat:#'+col),Math.sin(a)*d,H/2-1.5,Math.cos(a)*d-20,room);m.rotation.y=rn(i+9)*6;m.scale.x=1.2+rn(i+4)*.6}})}
function buildRoom(k){disposeTree(room);GC={};room.clear();seats=[];obst=null;fireL=null;flames=[];orbs=[];spin=[];jets=[];jetL=null;emb=null;embF=null;fireGlow=[];waterFx=null;const T=THEME[k];toonTint(k);buildSky(k);toonTint(k);
 hemi.color.setHex(T.h[0]);hemi.groundColor.setHex(T.h[1]);hemi.intensity=T.h[2]*.8*LGH*BRI;dirL.color.setHex(T.d[0]);dirL.intensity=T.d[1]*.7*LGD*BRI;LDO=LDIR[k]||LDO;dirL.position.set(LDO[0],LDO[1],LDO[2]);fillL.color.set(FILL[k]);fillL.intensity=FILLI*BRI;fillL.position.set(-LDO[0],LDO[1]*.7,-LDO[2]);
 CUR=k;BUILD[k]();if(k==='marinis')buildWater();mountains(k);spaceBus();partBuild(k);if(SHD)markCasters();if(!NOMERGE)mergeStatic();if(SHD)room.traverse(q=>{if(q.isMesh)q.receiveShadow=true})}

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
function hairGeo(c){
 let c1,c2,sk,shv;const setC=q=>{c1=new THREE.Color(HAIRC[q.hair]);c2=c1.clone().lerp(new THREE.Color('#ffffff'),.12);sk=new THREE.Color(SKIN[q.skin]);shv=sk.clone().lerp(c1,.5)};setC(c);
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
function hairNew(hd,c){const k=c.hs+'|'+c.hair+'|'+c.skin;let g=HCACHE.get(k);if(!g){if(HCACHE.size>60){HCACHE.forEach(v=>v.dispose());HCACHE.clear()}
  let sh=HSH.get(c.hs);if(!sh){sh=hairGeo(c);HSH.set(c.hs,sh)}
  sh.setC(c);const K=paintHair(sh.shape,sh.col),A=sh.shape.g.attributes;g=new THREE.BufferGeometry();g.setAttribute('position',A.position);g.setAttribute('normal',A.normal);g.setAttribute('onrm',A.onrm);g.setAttribute('color',new THREE.BufferAttribute(K,3));HCACHE.set(k,g)}
 hairMat();const sh=HSH.get(c.hs),cc={hair:c.hair,skin:c.skin,hc:c.hc},m=new THREE.Mesh(g,HM);m.userData.lodG=()=>loGeo(sh,k+'|lo',cc);hd.add(m);
 const o=new THREE.Mesh((sh.lo||(sh.lo=sh.mkLo())).g,holOf(c));o.userData.ol=1;hd.add(o)}
// chapéus justos (gorro, bucket, cowboy): mesmo motor de escultura do cabelo, moldados na cabeça; por baixo só há o couro cabeludo pintado
const HTSH=new Map();let HTM=null;
function hatGeo(h){
 let c1,c2;const setC=q=>{c1=new THREE.Color(PAL[q.hc|0]);c2=new THREE.Color(PAL[((q.hc|0)+5)%PAL.length])};setC({hc:0});
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
function hatNew(hd,c){const k='H'+c.hat+'|'+c.hc;let g=HCACHE.get(k);if(!g){if(HCACHE.size>60){HCACHE.forEach(v=>v.dispose());HCACHE.clear()}
  let sh=HTSH.get(c.hat);if(!sh){sh=hatGeo(c.hat);sh.shape.JT.fill(1);sh.shape.g.setAttribute('normal',sh.shape.g.attributes.snrm);HTSH.set(c.hat,sh)}
  sh.setC(c);const K=paintHair(sh.shape,sh.col),A=sh.shape.g.attributes;g=new THREE.BufferGeometry();g.setAttribute('position',A.position);g.setAttribute('normal',A.normal);g.setAttribute('onrm',A.onrm);g.setAttribute('color',new THREE.BufferAttribute(K,3));HCACHE.set(k,g)}
 if(!HTM){tg();HTM=new THREE.MeshToonMaterial({vertexColors:true,gradientMap:TG});HTM.userData.av=1;HTM.onBeforeCompile=EMI}
 const sh=HTSH.get(c.hat),cc={hc:c.hc},m=new THREE.Mesh(g,HTM);m.userData.lodG=()=>loGeo(sh,k+'|lo',cc);hd.add(m);
 const o=new THREE.Mesh((sh.lo||(sh.lo=sh.mkLo())).g,holOfHex(PAL[c.hc|0],.011));o.userData.ol=1;hd.add(o)}
// couro cabeludo pintado: textura da cabeça com a cor do cabelo sob a linha de cabelo (degradê) e tom raspado
const SGH=new THREE.SphereGeometry(1,28,20),HTX=new Map(),sstep=(a,b,t)=>{const u=Math.min(1,Math.max(0,(t-a)/(b-a)));return u*u*(3-2*u)};
const HPAINT=hs=>hs===0?{E:[.9,.95,1.1,1.2,1.7,2.1]}:hs===5?{E:[.88,.94,1.2,1.3,1.8,2.1]}:(hs===11||hs===16)?{E:[1.0,1.05,1.3,1.6,2.1,2.3]}:hs===24?{E:[1.1,1.15,1.5,1.55,1.9,2.1],sv:(x,y)=>y<.14}:hs===25?{E:[1.1,1.15,1.45,1.55,1.9,2.1],sv:()=>true}:hs===27?{E:[1.0,1.05,1.3,1.5,1.9,2.1]}:(hs===3||hs===17)?{E:[1.15,1.2,1.5,1.55,1.9,2.1],sv:x=>Math.abs(x)>.13}:hs===7?{E:[1.2,1.25,1.5,1.55,1.9,2.1],sv:(x,y)=>y<.18}:{E:HEDGE};
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
 mv=mv|0;const hat=c.hat|0,fc=c.fc|0,key=[hat?'h'+hat:c.hs,c.hair,c.skin,fc,c.eye|0,mv].join();let m=HTX.get(key);if(m)return m;
 if(HTX.size>40){HTX.forEach(v=>{v.map.dispose();v.dispose()});HTX.clear()}
 const cv=document.createElement('canvas');cv.width=FW;cv.height=FH;
 const g=cv.getContext('2d'),im=g.createImageData(FW,FH),d=im.data,P=hat?{E:[1.0,1.05,1.35,1.5,1.9,2.1]}:HPAINT(c.hs),H=hpx(),
  rgb=h=>{const q=new THREE.Color(h);return[q.r,q.g,q.b]},sk=rgb(SKIN[c.skin]),c1=rgb(HAIRC[c.hair|0]),dk=c1.map(v=>v*.8),shv=sk.map((v,i)=>v+(c1[i]-v)*.5),
  ec=rgb(EYE[c.eye|0]),red=rgb('#d62839'),ink=rgb('#0a0705'),wh=[1,1,1],tg2=rgb('#ff4f86'),bl=rgb('#ff5f8f'),ms=[[1,1],[1,1.6],[1.3,2.6]][mv],
  cov=q=>q>.0045?0:q<-.0045?1:.5-q/.009,el=(x,y,cx,cy,rx,ry)=>(Math.hypot((x-cx)/rx,(y-cy)/ry)-1)*Math.min(rx,ry),
  arc=(x,y,cx,cy,r,t,up)=>{const dx=x-cx,dy=(y-cy)*(up?1:-1);return dy>=0?Math.abs(Math.hypot(dx,dy)-r)-t/2:Math.hypot(Math.abs(dx)-r,dy)-t/2};
 const Wt=P?hw(hat?'hat'+hat:c.hs,P,H):null;const enc=v=>v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055;let r=0,gg=0,b=0;const put=(col,q)=>{const k=cov(q);if(k>0){r+=(col[0]-r)*k;gg+=(col[1]-gg)*k;b+=(col[2]-b)*k}};
 for(let i=0;i<FW*FH;i++){const x=H.X[i],y=H.Y[i],z=H.Z[i],th=H.TH[i];r=sk[0];gg=sk[1];b=sk[2];
  if(Wt){const w=Wt.w[i];if(w>0){const col=Wt.sv[i]?shv:dk,n=.95+.1*H.NH[i];r+=(col[0]*n-r)*w;gg+=(col[1]*n-gg)*w;b+=(col[2]*n-b)*w}}
  if(z>0&&y<.22&&y>-.32){
   if(fc===7)for(const sd of[-1,1])put(bl,el(x,y,sd*.22,-.03,.07,.045));
   for(const sd of[-1,1]){const ex=sd*.13;
    if(fc===2||(fc===3&&sd===1))put(ink,arc(x,y,ex,.04,.065,.028,true));
    else{const bb=fc===4?1.15:1,q=el(x,y,ex,.06,.095*bb,.11*bb);put(ink,q-.011);put(wh,q);put(ec,el(x,y,ex,.06,fc===4?.04:.055,fc===4?.05:.065));put(wh,el(x,y,ex+.02,.09,.02,.02))}}
   const mx=x/ms[0],my=(y+.1)/ms[1];
   if(fc===1)put(red,arc(mx,my,0,.05,.1,.024,false));
   else if(fc===4)put(red,el(mx,my,0,-.05,.055,.055));
   else{put(red,Math.max(Math.hypot(mx,my)-.12,my));if(fc===6)put(wh,Math.max(el(mx,my,0,-.005,.11,.0495),my+.005));if(fc===5)put(tg2,Math.max(el(mx,my,.03,-.09,.045,.06),Math.hypot(mx,my)-.115))}}
  const o=i*4;d[o]=enc(r)*255;d[o+1]=enc(gg)*255;d[o+2]=enc(b)*255;d[o+3]=255}
 g.putImageData(im,0,0);const t=new THREE.CanvasTexture(cv);t.anisotropy=4;m=LM({map:t});m.userData.av=1;m.onBeforeCompile=EMI;HTX.set(key,m);return m}
function ears(hd,sk){[-1,1].forEach(s=>{ell(.07,.1,.045,sk,s*.36,0,0,hd,SGS).userData.big=1})}
// estilo ilustrado do avatar: toon em todas as peças e contorno (casco invertido, no espaço da câmera) nas peças grandes
const EMI=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*.42;')};
const TOONM=new WeakMap(),OLB=new THREE.ShaderMaterial({uniforms:{w:{value:.026},col:{value:new THREE.Color('#0a0705')}},vertexShader:'uniform float w;void main(){vec3 n=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);p.xyz+=n*w;gl_Position=projectionMatrix*p;}',fragmentShader:'uniform vec3 col;void main(){gl_FragColor=linearToOutputTexel(vec4(col,1.));}',side:THREE.BackSide});
const toonOf=m=>{if(m.isMeshBasicMaterial||m.isShaderMaterial||m.userData.av)return m;let t=TOONM.get(m);if(!t){t=m.isMeshToonMaterial?m.clone():new THREE.MeshToonMaterial({color:m.color,map:m.map||null,vertexColors:m.vertexColors,gradientMap:tg(),side:m.side});t.gradientMap=tg();if(m.flatShading)t.flatShading=true;t.userData.av=1;t.onBeforeCompile=EMI;TOONM.set(m,t)}return t};
function avatarStyle(g){const L=[],ols=[],lod=[];g.traverse(q=>{if(q.isMesh&&q.material){L.push(q);if(q.userData.ol)ols.push(q)}});
 L.forEach(q=>{const m=q.material;if(m.isShaderMaterial||q.userData.ol)return;const big=q.userData.mb||q.userData.head||q.userData.big||((q.geometry===SG||q.geometry===SGS)&&Math.max(q.scale.x,q.scale.y,q.scale.z)>=.12);q.material=toonOf(m);if(q.userData.mb)lod.push({m:q,hi:q.geometry,lo:q.userData.olGeo});else if(q.userData.head)lod.push({m:q,hi:q.geometry,lo:SGS});else if(q.userData.lodG)lod.push({m:q,hi:q.geometry,mk:q.userData.lodG});
  if(big&&!m.isMeshBasicMaterial){const o=new THREE.Mesh(q.userData.olGeo||(q.userData.head?SGS:q.geometry),OLB);o.position.copy(q.position);o.quaternion.copy(q.quaternion);o.scale.copy(q.scale);o.userData.ol=1;q.parent.add(o);ols.push(o)}});
 g.userData.ols=ols;g.userData.lod=lod;g.userData.far=false}
function dress(g,c){freeAv(g);g.clear();const bag=new Map();const fig=new THREE.Group();g.add(fig);const sk=SKIN[c.skin],bt=c.bt===1?1:0,sh=PAL[c.shirt],pc=PAL[c.pc],sc=PAL[c.sc];
 const ball=(r,col,x,y,z,p)=>{if(!bag.has(p))bag.set(p,[]);bag.get(p).push([r,r,r,col,x,y,z])};
 ball(.36,sh,0,1.05,0,fig);ball(.075,sk,0,1.47,0,fig);ball(.26,pc,0,.78,0,fig);
 const lg=[-1,1].map(s=>{const q=new THREE.Group();q.position.set(s*.19,.72,0);fig.add(q);return q});
 const kn=[-1,1].map((s,i)=>{const q=new THREE.Group();q.position.set(0,-.38,0);lg[i].add(q);return q});
 const LR=[.105,.098,.085,.075,.098],LY=[0,-.19,-.38,-.57,-.77],FT=[];
 [0,1].forEach(i=>LR.forEach((r,j)=>{const col=j<(bt===0?4:2)?pc:sk,p=j<3?lg[i]:kn[i],ly=j<3?LY[j]:LY[j]+.38;
  if(j===4){const ft=new THREE.Group();ft.position.set(0,ly,0);p.add(ft);FT[i]=ft;if(c.shoes===0)ell(.125,.09,.17,sc,0,-.01,.05,ft,SGS);else if(c.shoes===1)ell(.115,.115,.14,sc,0,0,.02,ft,SGS);else{ball(r,sk,0,0,0,ft);ell(.12,.03,.17,sc,0,-.08,.04,ft,SGS)}}
  else if(j===3&&c.shoes===1)ball(.09,sc,0,ly,0,p);else if(j>0)ball(r,col,0,ly,0,p)}));
 const AR=[.1,.105,.09,.075,.098],AY=[0,-.19,-.37,-.52,-.68];
 const mkArm=s=>{const a=new THREE.Group();a.position.set(s*.357,1.34,0);a.rotation.z=s*.44;AR.forEach((r,j)=>ball(r,j<2?sh:sk,0,AY[j],0,a));fig.add(a);return a};
 const armL=mkArm(-1),armR=mkArm(1),hold=new THREE.Group();hold.position.set(0,-.78,.12);armR.add(hold);
 const hd=new THREE.Group();hd.position.set(0,1.78,0);hd.scale.set(.75,.75,.75);fig.add(hd);
 const c0={...c},hm=new THREE.Mesh(SGH,headMat(c0));hm.scale.set(.36,.38,.34);hm.userData.head=1;hd.add(hm);ears(hd,sk);
 let mv0=0;const mo={scale:{set:(x,y)=>{const v=y>2?2:y>1.3?1:0;if(v!==mv0){mv0=v;hm.material=toonOf(headMat(c0,v))}}}};
 if(c.hat)hatNew(hd,c);else hairNew(hd,c);
 bag.forEach((a,p)=>p.add(mergeBalls(a)));
 Object.assign(g.userData,{fy:.235+([.012,.026,.022][c.shoes]||.012),fig,armL,armR,hold,hd,mo,lgL:lg[0],lgR:lg[1],knL:kn[0],knR:kn[1],ftL:FT[0],ftR:FT[1]});if(g.userData.item)setHeld(g,g.userData.item);g.traverse(q=>{if(q.isMesh)q.castShadow=true});avatarStyle(g)}
const SPT={};function spr(ic){if(!SPT[ic]){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.font='96px "Segoe UI Emoji","Noto Color Emoji","Apple Color Emoji",sans-serif';g.textAlign='center';g.textBaseline='middle';if(ICONS[ic])ICONS[ic].draw(g);else g.fillText(ic,64,72);SPT[ic]=new THREE.CanvasTexture(c)}return new THREE.SpriteMaterial({map:SPT[ic],transparent:true,depthWrite:false})}
function setHeld(g,it){const hd=g.userData.hold;if(!hd)return;hd.clear();g.userData.item=it;if(!it)return;const s=new THREE.Sprite(spr(it.ic));s.scale.set(.6,.6,.6);s.position.y=.12;s.renderOrder=5;hd.add(s)}
const mk=c=>{const g=new THREE.Group();g.userData={};dress(g,c);scene.add(g);return g};
const me={g:mk(cfg),name:cfg.name,talk:false,drink:0,id:null,jy:0,vy:0,sit:false,seat:null,gest:null};me.g.position.set(0,0,1.5);
const actors=new Map(),MAX=25;let kq=[],kEnd=0,kTurn=-1,ws=null,hostId=null,roomCode=null,session=null,recon=null,RECON_MS=30000;
function mkLabel(a){a.el=document.createElement('div');a.el.className='lbl';a.nm=document.createElement('span');a.vm=document.createElement('span');a.vm.className='vm';a.vm.innerHTML='<i></i><i></i><i></i><i></i><i></i><i></i>';a.sq=[...a.vm.children];a.em=document.createElement('span');a.em.className='emo';a.ad=document.createElement('span');a.ad.className='adm';a.ad.title='Administrador da sala';a.el.append(a.ad,a.nm,a.vm,a.em);$('#labels').append(a.el)}
mkLabel(me);
function showEmo(a,ic){if(!a||!a.em||!ic)return;const e=a.em;clearTimeout(a.emoT);e.textContent=ic;e.classList.remove('show');void e.offsetWidth;e.classList.add('show');a.emoT=setTimeout(()=>{e.classList.remove('show');e.textContent=''},2000)}
function lab(a){const on=!!a.talk,isH=a.id!=null&&a.id===hostId,sing=!!(kq[0]&&kq[0].id===a.id),n=on?Math.max(1,Math.round((a.lv||0)*6)):0,key=''+isH+sing+on+a.name+!!a.bot+n;if(a._lk===key)return;a._lk=key;a.ad.style.display=isH?'inline-block':'none';a.nm.textContent=(sing?'🎶 Cantando · ':'')+(on?'🎤 ':'')+a.name+(a.bot?' 🤖':'');a.el.classList.toggle('talk',on);a.sq.forEach((q,i)=>q.classList.toggle('on',i<n))}
function addActor(p){if(actors.has(p.id))return;const g=mk(p.cfg);g.position.set(p.x,p.y||0,p.z);g.rotation.y=p.ry||0;const a={id:p.id,cfg:p.cfg,g,name:p.name,talk:!!p.talk,bot:p.bot,tx:p.x,tz:p.z,tr:p.ry||0,ty:p.y||0,sit:!!p.s,drink:0,gest:null};mkLabel(a);actors.set(p.id,a);if(p.item)setHeld(g,ITEMS.find(i=>i.id===p.item))}
function delActor(id){const a=actors.get(id);if(!a)return;freeAv(a.g);clearTimeout(a.emoT);scene.remove(a.g);a.el.remove();actors.delete(id);closePeer(id,false)}
buildRoom(cfg.style);

// ---------- sons (sintetizados) ----------
let ac=null;const AC=()=>{if(!ac)ac=new(window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume();return ac};
function tone(type,f0,f1,t0,d,v){const a=AC(),o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(f0,t0);o.frequency.exponentialRampToValueAtTime(f1,t0+d);g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(v,t0+.03);g.gain.exponentialRampToValueAtTime(.001,t0+d);o.connect(g);g.connect(a.destination);o.start(t0);o.stop(t0+d+.02)}
function burst(t0,d,f,v,q){const a=AC(),b=a.createBuffer(1,Math.max(1,a.sampleRate*d|0),a.sampleRate),x=b.getChannelData(0);for(let i=0;i<x.length;i++)x[i]=Math.random()*2-1;const s=a.createBufferSource(),fl=a.createBiquadFilter(),g=a.createGain();s.buffer=b;fl.type='bandpass';fl.frequency.value=f;fl.Q.value=q||1;g.gain.setValueAtTime(v,t0);g.gain.exponentialRampToValueAtTime(.001,t0+d);s.connect(fl);fl.connect(g);g.connect(a.destination);s.start(t0)}
function sfx(k){try{const a=AC(),t=a.currentTime;
 if(k==='eat')for(let i=0;i<4;i++)burst(t+i*.28,.12,1500+Math.random()*1500,.9,2);
 else if(k==='drink')for(let i=0;i<3;i++){tone('sine',320,140,t+i*.38,.2,.3);tone('sine',500,900,t+i*.38+.2,.1,.12)}
 else if(k==='notif'){tone('sine',784,784,t,.16,.14);tone('sine',1175,1175,t+.13,.34,.13);tone('triangle',2349,2349,t+.13,.2,.025)}
 else if(k==='scream'){tone('sawtooth',500,1100,t,.7,.18);tone('sawtooth',1100,650,t+.7,.8,.18);tone('square',510,1110,t,.7,.06);burst(t,1.4,2500,.15,.7)}
 else if(k==='fart'){const o=a.createOscillator(),g=a.createGain(),l=a.createOscillator(),lg=a.createGain();o.type='sawtooth';o.frequency.setValueAtTime(95,t);o.frequency.exponentialRampToValueAtTime(48,t+.75);g.gain.value=.15;l.frequency.value=32;lg.gain.value=.14;l.connect(lg);lg.connect(g.gain);o.connect(g);g.connect(a.destination);o.start(t);l.start(t);o.stop(t+.8);l.stop(t+.8);burst(t,.7,250,.2,.5)}}catch(e){}}

// ---------- música da tela inicial (sintetizada) ----------
const MUS={on:true,mg:null,step:0,next:0,iv:null},NF=n=>440*Math.pow(2,(n-69)/12);
const CHD=[[48,52,55],[45,48,52],[41,45,48],[43,47,50]],BS={0:-12,3:0,6:-12,8:0,11:-12,14:0};
const MEL=[[72,0,76,79,0,76,74,0,72,0,76,0,79,81,79,0],[69,0,72,76,0,72,71,0,69,0,72,0,76,74,72,0],[65,0,69,72,0,69,67,0,65,0,69,72,74,72,69,0],[67,0,71,74,0,71,72,0,74,0,71,0,67,69,71,0]];
function mo(type,f,t,d,v,f2){const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.01);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(MUS.mg);o.start(t);o.stop(t+d+.02)}
function mn(t,d,type,f,v){const n=Math.max(1,ac.sampleRate*d|0),b=ac.createBuffer(1,n,ac.sampleRate),x=b.getChannelData(0);for(let i=0;i<n;i++)x[i]=Math.random()*2-1;const s=ac.createBufferSource(),fl=ac.createBiquadFilter(),g=ac.createGain();s.buffer=b;fl.type=type;fl.frequency.value=f;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);s.connect(fl);fl.connect(g);g.connect(MUS.mg);s.start(t)}
function musTick(){const spb=60/126/4;while(MUS.next<ac.currentTime+.3){const s=MUS.step%64,bar=s>>4,st=s&15,t=MUS.next,ch=CHD[bar];
 if(st%4===0)mo('sine',150,t,.16,.9,45);if(st===4||st===12){mn(t,.14,'bandpass',1800,.5);mo('triangle',220,t,.08,.2,120)}if(st%2===0)mn(t,.05,'highpass',7000,st%4===2?.22:.12);
 if(st in BS)mo('triangle',NF(ch[0]+BS[st]),t,spb*2.2,.5);
 if(st%4===2)ch.forEach(n=>mo('triangle',NF(n+12),t,spb*2,.07));
 const m=MEL[bar][st];if(m)mo('square',NF(m),t,spb*2.4,.06);
 MUS.next+=spb;MUS.step++}}
function startMusic(){if(!MUS.on||MUS.iv||mode!=='menu')return;try{const a=AC();MUS.mg=a.createGain();MUS.mg.gain.value=0;MUS.mg.gain.setTargetAtTime(.32,a.currentTime,.6);MUS.mg.connect(a.destination);MUS.next=a.currentTime+.1;MUS.step=0;MUS.iv=setInterval(musTick,60)}catch(e){}}
function stopMusic(){if(MUS.iv){clearInterval(MUS.iv);MUS.iv=null}if(MUS.mg&&ac){try{MUS.mg.gain.setTargetAtTime(0,ac.currentTime,.2)}catch(e){}}}
$('#bMus').onclick=()=>{MUS.on=!MUS.on;$('#bMus').textContent=MUS.on?'🔊 Música: ligada':'🔇 Música: desligada';$('#bMus').setAttribute('aria-pressed',MUS.on);if(MUS.on)startMusic();else stopMusic()};
['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>{startMusic();if(ac&&ac.state==='suspended')ac.resume()},{passive:true}));
startMusic();

// ---------- UI início ----------
const EDS=[{g:0,k:'fc',n:'Rosto',v:FACES},{g:0,k:'skin',n:'Pele',c:SKIN},{g:0,k:'eye',n:'Olhos',c:EYE},{g:1,k:'hs',n:'Cabelo',v:HS},{g:1,k:'hair',n:'Cor do cabelo',c:HAIRC},{g:1,k:'hat',n:'Chapéu',v:HATS},{g:1,k:'hc',n:'Cor do chapéu',c:PAL},{g:2,k:'shirt',n:'Camisa',c:PAL},{g:2,k:'bt',n:'Parte de baixo',v:BT},{g:2,k:'pc',n:'Cor calça/bermuda',c:PAL},{g:2,k:'shoes',n:'Calçado',v:SHOES},{g:2,k:'sc',n:'Cor do calçado',c:PAL}];
const EG=['👤 Corpo','💇 Cabelo e chapéu','👕 Roupas'],EUPD=[];
function mkEditor(tabsEl,edEl){let gi=0;
 tabsEl.innerHTML=EG.map((t,i)=>`<button data-eg="${i}">${t}</button>`).join('');
 edEl.innerHTML=EDS.map(d=>`<div class="ed" data-g="${d.g}"><span class="edl">${d.n}</span><span class="edctl"><button data-a="${d.k}" data-d="-1" aria-label="${d.n}: anterior">◀</button><span class="evv" data-v="${d.k}"></span><button data-a="${d.k}" data-d="1" aria-label="${d.n}: próximo">▶</button></span></div>`).join('');
 const upd=()=>{EDS.forEach(d=>{const e=edEl.querySelector('[data-v="'+d.k+'"]'),x=cfg[d.k];if(d.c)e.innerHTML=`<span class="sw" style="display:inline-block;vertical-align:middle;background:${d.c[x]}"></span>`;else e.textContent=d.v[x]});edEl.querySelectorAll('.ed').forEach(r=>r.classList.toggle('hide',+r.dataset.g!==gi));tabsEl.querySelectorAll('[data-eg]').forEach(b=>b.classList.toggle('sel',+b.dataset.eg===gi))};
 tabsEl.onclick=e=>{const i=e.target.dataset.eg;if(i!==undefined){gi=+i;upd()}};
 edEl.onclick=e=>{const b=e.target.closest('[data-a]');if(!b)return;const d=EDS.find(x=>x.k===b.dataset.a),n=(d.c||d.v).length;cfg[d.k]=(cfg[d.k]+ +b.dataset.d+n)%n;dress(me.g,cfg);sendCfg();mark()};
 return upd}
const SK=Object.keys(ST);
function stLabel(k){const i=Math.max(0,SK.indexOf(k));$('#stName').textContent=ST[SK[i]].n;$('#stIdx').textContent=(i+1)+' / '+SK.length}
function stepStyle(d){const i=Math.max(0,SK.indexOf(cfg.style)),k=SK[(i+d+SK.length)%SK.length];cfg.style=k;buildRoom(k);mark()}
function mark(){stLabel(cfg.style);EUPD.forEach(f=>f())}
EUPD.push(mkEditor($('#edtabs'),$('#ed')));
$('#stPrev').onclick=()=>stepStyle(-1);$('#stNext').onclick=()=>stepStyle(1);
$('#styles').onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();stepStyle(e.key==='ArrowLeft'?-1:1)}};
$('#rndBtn').onclick=()=>{Object.assign(cfg,randomLook());dress(me.g,cfg);mark()};
mark();

// ---------- chat / rede ----------
function setB(id,ic,t,n){const e=$(id);if(!e)return;e.innerHTML=ic+(n?'<sup>'+n+'</sup>':'');const label=n?t+' · '+n+(/chat/i.test(t)?' nova(s)':'') : t;e.title=label;e.setAttribute('aria-label',label)}
let unread=0;
function chatToggle(show){const c=$('#chat'),want=show===undefined?c.classList.contains('hide'):show;c.classList.toggle('hide',!want);if(want){unread=0;setB('#bChat','💬','Chat');clampPanels();$('#log').scrollTop=$('#log').scrollHeight}}
function linkify(d,t){const re=/https?:\/\/[^\s<>"']+/gi;let last=0,m;while((m=re.exec(t))){if(m.index>last)d.append(document.createTextNode(t.slice(last,m.index)));let u=null;try{u=new URL(m[0]);if(u.protocol!=='http:'&&u.protocol!=='https:')u=null}catch(e){}
 if(u){const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer nofollow';a.textContent=m[0].length>60?m[0].slice(0,57)+'…':m[0];a.className=/(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname)?'lk yt':'lk';a.onclick=ev=>{if(!confirm('Abrir link externo?\n'+u.href))ev.preventDefault()};d.append(a)}else d.append(document.createTextNode(m[0]));last=m.index+m[0].length}
 if(last<t.length)d.append(document.createTextNode(t.slice(last)))}
function say(n,t,sys){const d=document.createElement('div');if(sys){d.textContent=t;d.style.opacity=.75}else{const b=document.createElement('b');b.textContent=n+': ';d.append(b);linkify(d,t)}const L=$('#log');L.append(d);L.scrollTop=L.scrollHeight;if(mode==='play'&&$('#chat').classList.contains('hide')){unread++;setB('#bChat','💬','Chat',unread)}while(L.children.length>80)L.firstChild.remove()}
function send(m){if(ws&&ws.readyState===1)ws.send(JSON.stringify(m))}
let cfgTm=0;function sendCfg(){if(cfgTm)return;cfgTm=setTimeout(()=>{cfgTm=0;send({t:'cfg',cfg:{...cfg}})},250)}
let last=0;
$('#msg').onkeydown=e=>{e.stopPropagation();if(e.key!=='Enter')return;const t=e.target.value.trim().replace(/[\u0000-\u001f]/g,'').slice(0,200);const n=Date.now();if(!t)return;if(n-last<800){say('','Calma! Aguarde um instante entre mensagens.',1);return}last=n;e.target.value='';send({t:'chat',text:t})};
const fmtCode=c=>c&&c.length===10?c.slice(0,5)+'-'+c.slice(5):c;
function updHost(){const h=hostId===me.id;$('#sBn').disabled=!h;$('#host').textContent=h?'Você é o anfitrião.':'Só o anfitrião muda os bots.'}
function wsUrl(ticket){const base=SERVER_URL||((location.protocol==='https:'?'wss://':'ws://')+location.host);if(!ticket)return base;try{const u=new URL(base);u.searchParams.set('ticket',ticket);return u.toString()}catch(e){return base+(base.includes('?')?'&':'?')+'ticket='+encodeURIComponent(ticket)}}
function ticketUrl(){try{const u=new URL(wsUrl());u.protocol=u.protocol==='wss:'?'https:':'http:';u.pathname='/ticket';u.search='';return u.toString()}catch(e){return '/ticket'}}
function hashBits(u8,bits){let have=0;for(const b of u8){if(b===0){have+=8;if(have>=bits)return true;continue}return (have+Math.clz32(b)-24)>=bits}return have>=bits}
async function getTicket(){
 let r;
 try{r=await fetch(ticketUrl(),{cache:'no-store',credentials:'same-origin'})}
 catch(e){throw new Error('Servidor indisponível.')}
 if(!r.ok){if(r.status===404)return '';throw new Error(r.status===429?'Muitas tentativas. Aguarde um instante.':'Servidor indisponível.')}
 let t;try{t=await r.json()}catch(e){throw new Error('Resposta inválida do servidor.')}
 if(!t||t.v!==1||typeof t.c!=='string'||typeof t.e!=='number'||typeof t.d!=='number'||typeof t.k!=='string')throw new Error('Resposta inválida do servidor.');
 let n=0;
 if(t.d>0){
  if(!window.crypto||!crypto.subtle||!window.TextEncoder)throw new Error('Este navegador não consegue verificar o acesso. Use uma conexão segura (https).');
  const enc=new TextEncoder(),base=t.c+':',want=t.d;
  for(;;){
   const h=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(base+n)));
   if(hashBits(h,want))break;
   n++;
   if((n&127)===0)await new Promise(r=>setTimeout(r,0));
  }
 }
 return t.c+'.'+t.e+'.'+t.d+'.'+t.k+'.'+n;
}
let connecting=false;
async function start(first){
 const nm_=$('#name').value.trim().slice(0,16);
 if(!nm_||nm_.toLowerCase()==='visitante'){$('#nerr').textContent='⚠ Escolha um nome para entrar.';$('#serr').textContent='Escolha um nome para entrar.';$('#name').focus();$('#name').setAttribute('aria-invalid','true');return}
 $('#name').removeAttribute('aria-invalid');$('#nerr').textContent='';cfg.name=nm_;me.name=cfg.name;$('#serr').textContent='';
 if(ws||connecting)return;
 connecting=true;
 let ticket='';
 try{ticket=await getTicket()}catch(e){connecting=false;if(!ws)$('#serr').textContent=e&&e.message||'Não foi possível conectar.';return}
 connecting=false;
 if(ws)return;
 let w;try{w=new WebSocket(wsUrl(ticket))}catch(e){$('#serr').textContent='Não foi possível conectar. Abra o jogo pelo servidor (node server.js).';return}
 ws=w;w.onopen=()=>{if(ws===w)send({...first,name:cfg.name,cfg:{...cfg}})};
 w.onmessage=onMsg;
 w.onerror=()=>{if(mode==='menu'&&ws===w)$('#serr').textContent='Servidor indisponível. Rode "node server.js" e abra http://localhost:3000'};
 w.onclose=e=>{if(ws!==w)return;ws=null;
  if(mode==='play'&&(e.code===1008||e.code===1009)){say('',e.code===1008?'Conexão encerrada por segurança.':'Mensagem grande demais: a conexão foi encerrada.',1);leave();return}
  if(mode==='play'&&session&&!recon)beginReconnect();
  else if(mode==='menu'&&!$('#serr').textContent)$('#serr').textContent='Conexão encerrada pelo servidor. Tente novamente.'}}
function setReconTry(t){$('#reconTry').textContent=t||''}
function showRecon(fatal,msg){
 $('#recon').classList.remove('hide');
 $('#reconTitle').textContent=fatal?'Não foi possível reconectar':'Reconectando…';
 $('#reconMsg').textContent=msg||(fatal?'Sua sessão foi encerrada.':'Sua conexão caiu. Estamos tentando voltar para a sala.');
 $('#reconSpin').classList.toggle('stop',!!fatal);
 $('#reconNow').classList.toggle('hide',!!fatal);
 if(fatal)setReconTry('Você pode sair e entrar novamente com o código da sala.');
 else try{$('#reconCard').focus({preventScroll:true})}catch(e){}
}
function hideRecon(){$('#recon').classList.add('hide');setReconTry('')}
function beginReconnect(){
 if(recon||!session||mode!=='play')return;
 recon={n:0,timer:null,deadline:Date.now()+Math.min(300000,Math.max(5000,RECON_MS+1500)),fatal:false};
 showRecon(false);reconAttempt();
}
function scheduleRecon(){
 if(!recon||recon.fatal)return;
 const left=recon.deadline-Date.now();
 if(left<=0)return reconFatal('Não foi possível reconectar dentro do tempo de espera. Entre novamente com o código da sala.');
 const base=Math.min(8000,1000*Math.pow(1.7,Math.max(0,recon.n-1))),wait=Math.max(250,Math.min(Math.round(base*(.9+Math.random()*.2)),left));
 recon.timer=setTimeout(()=>{if(recon){recon.timer=null;reconAttempt()}},wait);
 setReconTry('Nova tentativa em '+Math.ceil(wait/1000)+'s…');
}
let reconBusy=false;
async function reconAttempt(){
 if(!recon||recon.fatal)return;
 if(recon.timer){clearTimeout(recon.timer);recon.timer=null}
 if(ws&&ws.readyState<3)return;
 if(!session)return reconFatal('Sua sessão não está mais disponível neste servidor. Entre novamente com o código da sala.');
 if(reconBusy)return;
 reconBusy=true;
 recon.n++;
 setReconTry('Tentativa '+recon.n+' de reconexão…');
 let ticket='';
 try{ticket=await getTicket()}catch(e){
  reconBusy=false;
  if(!recon||recon.fatal)return;
  setReconTry('Servidor indisponível. Tentando de novo…');
  return scheduleRecon();
 }
 reconBusy=false;
 if(!recon||recon.fatal||!session||(ws&&ws.readyState<3))return;
 let w;try{w=new WebSocket(wsUrl(ticket))}catch(e){setReconTry('Falha ao abrir a conexão. Tentando de novo…');return scheduleRecon()}
 ws=w;setReconTry('Tentativa '+recon.n+' de reconexão…');
 w.onopen=()=>{if(recon&&!recon.fatal&&session&&ws===w)send({t:'resume',code:session.code,token:session.token})};
 w.onmessage=onMsg;w.onerror=()=>{};
 w.onclose=e=>{if(ws!==w)return;ws=null;if(recon&&!recon.fatal){
  if(e.code===1008||e.code===1009)reconFatal('A conexão foi encerrada por segurança. Entre novamente com o código da sala.');
  else scheduleRecon();
 }};
}
function reconNow(){
 if(!recon||recon.fatal)return;
 if(ws&&ws.readyState<3)return;
 recon.deadline=Date.now()+Math.min(300000,Math.max(5000,RECON_MS+1500));
 if(recon.timer){clearTimeout(recon.timer);recon.timer=null}
 reconAttempt();
}
function reconFatal(msg){
 if(!recon)return;
 recon.fatal=true;
 if(recon.timer){clearTimeout(recon.timer);recon.timer=null}
 const w=ws;ws=null;session=null;
 if(w){w.onclose=null;try{w.close(4000,'leave')}catch(e){}}
 showRecon(true,(msg||'Sua sessão foi encerrada.')+(roomCode?' Código da sala: '+fmtCode(roomCode)+'.':''));
}
function reconDone(){
 if(recon){if(recon.timer)clearTimeout(recon.timer);recon=null}
 hideRecon();
}
$('#go').onclick=()=>start({t:'create',style:cfg.style,bots:Math.max(0,Math.min(20,parseInt($('#bn').value)||0))});
$('#join').onclick=()=>{const c=$('#code').value.replace(/[^A-Za-z0-9]/g,'').toUpperCase();if(!c){$('#serr').textContent='Digite o código da sala.';return}start({t:'join',code:c})};
function refreshItemBtns(){const cur=me.g.userData.item;document.querySelectorAll('[data-u]').forEach(b=>b.classList.toggle('held',!!cur&&cur.id===b.dataset.u))}
const FX=[];function puff(a){const p=new THREE.Sprite(spr('💨')),r=a.g.rotation.y;p.scale.set(.6,.6,.6);p.position.set(a.g.position.x-Math.sin(r)*.55,a.g.position.y+.6,a.g.position.z-Math.cos(r)*.55);scene.add(p);FX.push({p,t0:performance.now()})}
function startGest(a,g){if(g==='stop'){a.gest=null;return}const d=GESTS.find(x=>x[0]===g);if(!d)return;a.gest={g,t0:performance.now(),dur:d[3]};
 if(g==='scream')sfx('scream');if(g==='fart'){sfx('fart');puff(a)}}
function onMsg(ev){let m;try{m=JSON.parse(ev.data)}catch(e){return}
switch(m.t){
case 'err':{const msg=typeof m.msg==='string'?m.msg.slice(0,300):'Erro inesperado.';
 if(m.scope==='resume'){
  if(recon){if(m.retry)setReconTry(msg);else reconFatal(msg)}
  else if(mode==='play'){say('',msg,1);leave()}else $('#serr').textContent=msg;
  break}
 if(recon){reconFatal(msg);break}
 if(mode==='play'){say('',msg,1);break}
 $('#serr').textContent=msg;if(ws){ws.onclose=null;try{ws.close()}catch(e){};ws=null}break}
case 'joined':{
 if(typeof m.code==='string'&&m.code.length===10&&typeof m.token==='string'&&m.token.length===43)session={code:m.code,token:m.token};else session=null;
 DJ.rk=typeof m.rk==='string'&&m.rk.length===43?m.rk:null;
 if(Number.isFinite(m.reconnect))RECON_MS=Math.max(100,Math.min(300000,m.reconnect));
 if(recon)reconDone();
 enter(m,!!m.resume);break}
case 'pj':addActor(m.p);if(mode==='play'){say('',m.p.name+' entrou na sala.',1);if(m.p.talk)onRemoteSpeak(m.p.id);else if(me.talk)onLocalSpeak()}break;
case 'pl':{const a=actors.get(m.id);if(a&&mode==='play')say('',a.name+' saiu da sala.',1);delActor(m.id);break}
case 'host':hostId=m.id;updHost();break;
case 'st':for(const[id,x,z,r,y,s]of m.s){const a=actors.get(id);if(a){a.tx=x;a.tz=z;a.tr=r;a.ty=y;a.sit=!!s}}break;
case 'chat':say(m.name,m.text);break;
case 'cfg':{const a=actors.get(m.id);if(a){a.cfg=m.cfg;dress(a.g,m.cfg)}break}
case 'gest':{const a=actors.get(m.id);if(a&&(m.g==='stop'||!a.gest||performance.now()-a.gest.t0>1000))startGest(a,m.g);break}
case 'item':{const a=m.id===me.id?me:actors.get(m.id);if(!a)break;const it=ITEMS.find(i=>i.id===m.item)||null;if(!m.use){setHeld(a.g,it)}else if(it){if(!a.g.userData.item)setHeld(a.g,it);a.drink=1.6;sfx(it.food?'eat':'drink');if(it.mg)showEmo(a,'✨');if(it.food)setTimeout(()=>{setHeld(a.g,null);if(a===me)refreshItemBtns()},1500)}if(a===me)refreshItemBtns();break}
case 'speak':{const a=actors.get(m.id);if(a)a.talk=m.v;if(a&&m.v&&mode==='play')onRemoteSpeak(m.id);break}
case 'bots':$('#sBn').value=m.want;break;
case 'vinv':{
 if(!/^[\w-]{11}$/.test(m.vid))break;
 curInv={vid:m.vid,name:String(m.name||'Alguém').slice(0,16)};
 if(VW.id===m.vid)break;
 if(m.swap&&VW.ctl){
  if(swapWait===m.vid){clearSwapWait();openVid(m.vid,true);$('#vurl2').value='';$('#vchangeMsg').textContent='✅ Vídeo trocado para todos.'}
  break}
 if(m.swap&&VW.id&&!VW.ctl){pend=null;$('#vinv').classList.add('hide');openVid(m.vid,false);send({t:'vjoin'});say('','🔄 '+m.name+' trocou o vídeo. Acompanhando o novo vídeo.',1);break}
 if(m.swap&&pend){pend=m;$('#vinvt').textContent='🎬 '+m.name+' trocou o vídeo. Quer assistir?';$('#vthumb').src='https://img.youtube.com/vi/'+m.vid+'/mqdefault.jpg';$('#vinv').classList.remove('hide');ntArm('video','#vinv','🎬 '+m.name+' trocou o vídeo. Quer assistir?',()=>{pend=null;openVid(m.vid,false);send({t:'vjoin'})});break}
 if(m.swap)break;
 pend=m;$('#vinvt').textContent='🎬 '+m.name+' quer assistir um vídeo com você!';$('#vthumb').src='https://img.youtube.com/vi/'+m.vid+'/mqdefault.jpg';$('#vinv').classList.remove('hide');ntArm('video','#vinv','🎬 '+m.name+' quer assistir um vídeo com você!',()=>{pend=null;openVid(m.vid,false);send({t:'vjoin'})});say('','🎬 '+m.name+' convidou para assistir um vídeo. Aceite no balão da tela.',1);break}
case 'dj':{if(typeof m.host!=='string'||!/^[\w.-]+(:\d+)?$/.test(m.host))break;const mine=m.by===me.id,was=DJ.host;DJ.host=m.host.slice(0,120);DJ.by=m.by;DJ.name=String(m.name||'Alguém').slice(0,16);djStopAudio();djRender();
 if(mine){$('#djurl').value='';djListen();djMsg('')}else{say('','🎧 '+DJ.name+' colocou uma rádio ('+DJ.host+').',1);ntOffer('dj',{},'🎧 '+DJ.name+' colocou uma rádio ('+DJ.host+'). Quer ouvir?','#djinv','#djinvt',()=>{$('#pDJ').classList.remove('hide');djRender();djListen()})}break}
case 'djstop':{if(DJ.host)say('','🎧 A rádio foi encerrada.',1);ntGone('dj');djReset();break}
case 'djbusy':djMsg('Já existe uma rádio tocando nesta sala.');break
case 'djerr':djMsg(String(m.msg||'Endereço inválido.'));break
case 'vsync':VW.apply(m);break;
case 'vbusy':closeVid(false);say('','Já existe um vídeo em andamento nesta sala.',1);break;
case 'vstop':{if(VW.id&&!VW.ctl){closeVid(false);say('','O vídeo foi encerrado.',1)}$('#vinv').classList.add('hide');ntGone('video');pend=null;curInv=null;break}
case 'kar':{if(!m.q||!m.q.length||m.q.some(k=>k.id===me.id)){ntGone('karaoke');$('#kinvb').classList.add('hide')}const wk=isK(me.id),prev=kq[0]&&kq[0].id,pm=(kq.find(k=>k.id===me.id)||{}).vid;kq=m.q;kEnd=Date.now()+(m.left||0);renderK();syncK(m.turn);if(kq[0]&&kq[0].vid&&kq[0].id===me.id&&!stream)startMic();if(wk&&!isK(me.id))say('','🎶 Você saiu da fila do karaokê.',1);const nv=(kq.find(k=>k.id===me.id)||{}).vid;if(pm&&nv===null){$('#ksong').value='';$('#pKar').classList.remove('hide');say('','🎤 Sua vez acabou! Cole o link de uma nova música em Karaokê para cantar de novo.',1)}if(kq[0]&&kq[0].vid&&(kq[0].id!==prev||m.turn!==kTurn))say('','🎶 Vez de '+kq[0].name+' cantar!'+(kq[0].id===me.id&&!stream?' Ative o microfone para cantar!':''),1);kTurn=m.turn;break}
case 'ksync':KW.apply(m);break;
case 'kinv':if(isK(me.id))break;$('#kinvt').textContent='🎤 '+m.name+' abriu o karaokê! Quer participar?';$('#kinvb').classList.remove('hide');ntArm('karaoke','#kinvb','🎤 '+m.name+' abriu o karaokê. Quer participar?',kAccept);say('','🎤 '+m.name+' abriu o karaokê. Aceite no balão da tela.',1);break;
case 'emo':{const a=m.id===me.id?me:actors.get(m.id);if(a&&Number.isInteger(m.i)&&m.i>=0&&m.i<EMO.length)showEmo(a,EMO[m.i]);break}
case 'sys':say('',m.text,1);break;
case 'sig':onSig(m);break;case 'ice':if(m.ice&&Array.isArray(m.ice.iceServers)){ICE={iceServers:m.ice.iceServers,iceTransportPolicy:'all'};iceAt=Date.now()}break}}
function enter(m,resume){
 const players=Array.isArray(m.players)?m.players:[];
 const self=(m.self&&m.self.id===m.id)?m.self:players.find(p=>p.id===m.id)||null;
 if(!resume)stopMusic();
 if(matchMedia('(pointer:coarse)').matches)$('#touchbar').classList.remove('hide');
 roomCode=typeof m.code==='string'?m.code:roomCode;lastMv='';
 PUBURL=(typeof m.url==='string'&&/^https?:\/\/[^\s]+$/.test(m.url))?m.url:'';
 if(m.ice&&Array.isArray(m.ice.iceServers))ICE={iceServers:m.ice.iceServers,iceTransportPolicy:'all'};iceAt=Date.now();
 me.id=m.id;
 if(self&&typeof self.name==='string'){me.name=self.name.slice(0,16);cfg.name=me.name}
 hostId=m.host||null;cfg.style=m.style;
 [...actors.keys()].forEach(delActor);[...peers.keys()].forEach(id=>closePeer(id,false));remoteVQ.clear();
 buildRoom(m.style);
 me.sit=!!(self&&self.s);me.seat=null;me.gest=null;me.drink=0;me.talk=false;
 me.jy=self&&Number.isFinite(self.y)?self.y:0;me.vy=0;dest=null;
 me.g.position.set(self&&Number.isFinite(self.x)?self.x:0,0,self&&Number.isFinite(self.z)?self.z:5);
 me.g.rotation.y=self&&Number.isFinite(self.ry)?self.ry:0;
 setHeld(me.g,self&&self.item?ITEMS.find(i=>i.id===self.item)||null:null);
 players.forEach(p=>{if(p.id!==m.id)addActor(p)});
 mode='play';players.forEach(p=>{if(p.id!==m.id&&p.talk)onRemoteSpeak(p.id)});
 $('#start').classList.add('hide');['#hud','#chat','#bar'].forEach(s=>$(s).classList.remove('hide'));placeChat();clampPanels();
 $('#bInvite').title='Copiar convite · Sala '+fmtCode(roomCode);$('#bInvite').setAttribute('aria-label','Copiar convite da sala '+fmtCode(roomCode));$('#sBn').value=Number.isInteger(m.want)?m.want:0;
 kq=Array.isArray(m.kar)?m.kar:[];kEnd=Date.now()+(Number.isFinite(m.kl)?m.kl:0);kTurn=Number.isInteger(m.turn)?m.turn:-1;
 if(resume){kProbeSeq++;kProbe=false;$('#ksong').disabled=false;$('#kjoin').disabled=false;$('#kset').disabled=false}
 renderK();if(resume){exitFullscreenIf($('#kstage'));KW.close();$('#kwatch').classList.add('hide');$('#pKar').classList.remove('kvid');closeVid(false);$('#vinv').classList.add('hide');pend=null}syncK(kTurn);
 refreshItemBtns();updHost();
 say('',resume?'✅ Conexão restabelecida.':'Você entrou na sala '+fmtCode(roomCode)+'. Teclas: WASD mover · E pular · F sentar · Espaço usar item.',1)}
function leave(){
 if(recon){if(recon.timer)clearTimeout(recon.timer);recon=null}
 hideRecon();session=null;if(roomCode)$('#code').value=fmtCode(roomCode);
 mode='menu';$('#touchbar').classList.add('hide');unread=0;setB('#bChat','💬','Chat');startMusic();FX.splice(0).forEach(x=>scene.remove(x.p));kq=[];kShowQ=false;kProbe=false;kProbeSeq++;$('#ksong').disabled=false;$('#kshowq').classList.add('hide');$('#bInvite').title='Copiar convite da sala';exitFullscreenIf($('#kstage'));KW.close();$('#kwatch').classList.add('hide');$('#pKar').classList.remove('kvid');closeVid(false);pend=null;['#vinv','#kinvb'].forEach(s=>$(s).classList.add('hide'));stopMic();
 if(ws){try{send({t:'leave'})}catch(e){}ws.onclose=null;try{ws.close(4000,'leave')}catch(e){}ws=null}
 [...actors.keys()].forEach(delActor);[...peers.keys()].forEach(id=>closePeer(id,false));remoteVQ.clear();setHeld(me.g,null);clearTimeout(me.emoT);me.em.classList.remove('show');me.em.textContent='';me.id=null;me.sit=false;me.seat=null;me.gest=null;
 ['#hud','#chat','#bar','#pMochila','#pVis','#pVid','#pDJ','#pSet','#pKar','#pKFila','#pEmo'].forEach(s=>$(s).classList.add('hide'));djReset();ntReset();$('#start').classList.remove('hide');$('#log').innerHTML='';buildRoom(cfg.style);mark()}
$('#bExit').onclick=leave;
$('#reconNow').onclick=()=>reconNow();
$('#reconOut').onclick=()=>leave();
addEventListener('online',()=>{if(recon)reconNow()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&recon)reconNow()});
$('#tJump').onclick=()=>jump();$('#tSit').onclick=()=>toggleSit();$('#tUse').onclick=()=>useItem();
$('#bChat').onclick=()=>chatToggle();$('#cMin').onclick=()=>chatToggle(false);
$('#msg').addEventListener('focus',()=>{if(COARSE){const c=$('#chat');c.dataset.t=c.style.top;c.style.top='56px'}});$('#msg').addEventListener('blur',()=>{if(COARSE){const c=$('#chat');if(c.dataset.t)c.style.top=c.dataset.t}});
function tog(id){['#pMochila','#pVis','#pSet','#pKar'].forEach(s=>s!=='#'+id&&$(s).classList.add('hide'));const el=$('#'+id);el.classList.toggle('hide');if(id==='pKar'&&el.classList.contains('hide'))exitFullscreenIf($('#kstage'))}
$('#bMochila').onclick=()=>tog('pMochila');$('#bVis').onclick=()=>tog('pVis');$('#bSet').onclick=()=>tog('pSet');
let PUBURL='';
$('#bInvite').onclick=async()=>{const l=(PUBURL?PUBURL+'/':location.origin+location.pathname)+'#sala='+roomCode;try{await navigator.clipboard.writeText(l);say('','🔗 Link da sala copiado: '+l,1)}catch(e){say('','Copie o link da sala: '+l,1)}
 if(!PUBURL&&/^(localhost|127\.|\[?::1|192\.168\.|10\.)/.test(location.hostname))say('','⚠ Você abriu o jogo por um endereço local: seus amigos não conseguem usar este link. Abra o jogo pelo endereço público (Tailscale, Cloudflare…) ou inicie o servidor com PUBLIC_URL.',1)};
$('#sBn').onchange=e=>send({t:'bots',n:Math.max(0,Math.min(20,parseInt(e.target.value)||0))});
document.querySelectorAll('[data-rs]').forEach(b=>b.onclick=()=>{const bx=$(b.dataset.rs==='v'?'#vbox':'#kbox'),w=Math.max(200,Math.min(innerWidth*.88,bx.offsetWidth*(1+b.dataset.d*.2)));bx.style.width=w+'px';bx.style.height=(w*9/16)+'px'});

// ---------- karaokê (canal de voz principal, vídeo obrigatório) ----------
const isK=id=>kq.some(k=>k.id===id);
const KMAX=780;
let kShowQ=false,kProbe=false,kProbeSeq=0;
function fmtDur(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
function probeDur(id,cb){
 let done=false,yt=null,box=null,iv=null,to=null;
 const finish=(d,err)=>{if(done)return;done=true;if(iv)clearInterval(iv);if(to)clearTimeout(to);try{if(yt&&yt.destroy)yt.destroy()}catch(e){}if(box&&box.parentNode)box.remove();cb(Number.isFinite(d)&&d>0?d:null,err||null)};
 box=document.createElement('div');box.className='ydur';box.setAttribute('aria-hidden','true');box.style.cssText='position:fixed;left:-9999px;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none';const holder=document.createElement('div');box.append(holder);document.body.append(box);
 to=setTimeout(()=>finish(null,'timeout'),8500);
 loadYT(()=>{if(done)return;try{yt=new YT.Player(holder,{width:'2',height:'2',videoId:id,playerVars:{autoplay:0,controls:0,disablekb:1,playsinline:1,rel:0},events:{onReady:e=>{try{e.target.mute();const d=e.target.getDuration();if(Number.isFinite(d)&&d>0)finish(d)}catch(x){}},onError:()=>finish(null,'error')}})}catch(e){finish(null,'error')}});
 iv=setInterval(()=>{if(done)return;try{const d=yt&&yt.getDuration&&yt.getDuration();if(Number.isFinite(d)&&d>0)finish(d)}catch(e){}},250);
}
function checkKDur(id,after){
 if(kProbe)return;
 kProbe=true;const seq=++kProbeSeq;$('#kjoin').disabled=true;$('#kset').disabled=true;$('#ksong').disabled=true;
 $('#kmsg').textContent='⏳ Verificando a duração…';
 probeDur(id,(d)=>{
  if(seq!==kProbeSeq)return;
  kProbe=false;$('#ksong').disabled=false;$('#kjoin').disabled=false;$('#kset').disabled=false;
  if(mode!=='play')return;
  if(d&&d>KMAX){renderK();$('#kmsg').textContent='⚠ Vídeo com '+fmtDur(d)+' — o limite do karaokê é 13:00.';return}
  after(d,!d?'⚠ Duração não verificada; a vez será encerrada aos 13 min.':'');
 });
}
function renderK(){const cur=kq[0],mine=kq.find(k=>k.id===me.id);
 const kc=$('#kcur');kc.className='kcur'+(cur&&cur.vid?' on':'');kc.textContent=!cur?'🎤 Ninguém na fila. Cole o link de uma música e seja o primeiro!':cur.vid?'🎶 Cantando agora: '+cur.name:'⏳ '+cur.name+' está escolhendo a música…';
 const inQ=isK(me.id),qb=$('#kshowq');if(!inQ)kShowQ=false;
 qb.classList.toggle('hide',!inQ);qb.innerHTML=(kShowQ?'🙈':'👥')+(kq.length?'<sup>'+kq.length+'</sup>':'');qb.title=(kShowQ?'Ocultar fila do karaokê':'Ver fila do karaokê')+(kq.length?' ('+kq.length+')':'');qb.setAttribute('aria-label',qb.title);qb.setAttribute('aria-expanded',String(kShowQ));
 $('#pKFila').classList.toggle('hide',!kShowQ);
 $('#kcount').textContent=kq.length?'👥 Na fila: '+kq.length+' / '+MAX:'';
 const L=$('#klist');L.innerHTML='';
 if(!kq.length){const e=document.createElement('div');e.className='kempty';e.textContent='A fila está vazia.';L.append(e)}
 kq.forEach((k,i)=>{const isMe=k.id===me.id,sing=i===0&&!!k.vid,ac=isMe?me:actors.get(k.id);
  const r=document.createElement('div');r.className='prow krow '+(sing?'cur':'wait')+(isMe?' mine':'');
  const pos=document.createElement('span');pos.className='kpos';pos.textContent=sing?'🎤':String(i+1);r.append(pos);
  const dot=document.createElement('span');dot.className='pdot';dot.style.background=PAL[((isMe?cfg:ac&&ac.cfg)||{}).shirt||0];r.append(dot);
  const inf=document.createElement('div');inf.className='kinfo';
  const n=document.createElement('span');n.className='pname';n.textContent=k.name;n.title=k.name;inf.append(n);
  const sub=document.createElement('span');sub.className='ksub';sub.textContent=k.vid?'🎵 youtu.be/'+k.vid:'⚠ precisa escolher a próxima música';inf.append(sub);r.append(inf);
  const tag=(t,c)=>{const e=document.createElement('span');e.className='tag'+(c?' '+c:'');e.textContent=t;r.append(e)};
  if(!k.vid)tag('Escolhendo','warn');else if(i===1)tag('Próximo');
  if(k.id!=null&&k.id===hostId){const d=document.createElement('span');d.className='adm';d.title='Anfitrião';r.append(d)}
  L.append(r)});
 $('#kjoin').textContent=mine?'Sair da fila':'Entrar na fila';$('#kjoin').disabled=kProbe;$('#kset').classList.toggle('hide',!mine);$('#kset').disabled=kProbe||!!(mine&&cur&&cur.id===me.id&&cur.vid);
 $('#kpass').disabled=!(cur&&cur.id===me.id);
 if(mine&&!mine.vid)$('#kmsg').textContent='⚠ Cole o link de uma NOVA música e clique em "Definir música" para cantar.'}
function syncK(turn){const h=kq[0];if(isK(me.id)&&h&&h.vid){if(KW.turn!==turn||KW.id!==h.vid){KW.turn=turn;KW.open(h.vid,h.id===me.id)}$('#kwatch').classList.remove('hide');$('#pKar').classList.add('kvid')}else{exitFullscreenIf($('#kstage'));KW.close();$('#kwatch').classList.add('hide');$('#pKar').classList.remove('kvid')}}
setInterval(()=>{const L=Math.max(0,kEnd-Date.now()),m=Math.floor(L/60000),sec=String(Math.floor(L/1000)%60).padStart(2,'0');$('#ktime').textContent=kq.length?'⏱ Tempo restante da música: '+m+':'+sec:''},500);
$('#bKar').onclick=()=>{tog('pKar');renderK();if(kShowQ)placeKFila();};
$('#kjoin').onclick=()=>{if(isK(me.id)){send({t:'kleave'});return}const id=ytId($('#ksong').value);if(!id){$('#kmsg').textContent='⚠ Cole um link válido do YouTube da música para entrar na fila.';return}checkKDur(id,(_d,warn)=>{if(isK(me.id))return;$('#ksong').value='';$('#kmsg').textContent=warn;send({t:'kjoin',vid:id})})};
$('#kset').onclick=()=>{const id=ytId($('#ksong').value);if(!id){$('#kmsg').textContent='⚠ Cole um link válido do YouTube.';return}checkKDur(id,(_d,warn)=>{$('#ksong').value='';$('#kmsg').textContent=warn||'✅ Música definida para a sua próxima vez.';send({t:'ksong',vid:id})})};
$('#kpass').onclick=()=>send({t:'kpass'});
function placeNear(f,anchors){const z=UZ(),as=anchors.filter(a=>a&&!a.classList.contains('hide'));if(!as.length||f.classList.contains('hide'))return;const rs=as.map(a=>a.getBoundingClientRect()),L=Math.min(...rs.map(x=>x.left)),Rt=Math.max(...rs.map(x=>x.right)),T=Math.min(...rs.map(x=>x.top)),B=Math.max(...rs.map(x=>x.bottom)),pr=(f.offsetParent||document.body).getBoundingClientRect(),fb=f.getBoundingClientRect(),fw=fb.width,fh=fb.height;let x=L-fw-8,y=T;if(x<4){x=Rt+8;if(x+fw>innerWidth-4){if(B+8+fh<=innerHeight-4){x=Math.max(4,Math.min(L,innerWidth-4-fw));y=B+8}else x=Math.max(4,innerWidth-4-fw)}}f.style.transform='none';f.style.right='auto';f.style.bottom='auto';f.style.left=((x-pr.left)/z)+'px';f.style.top=((y-pr.top)/z)+'px';clampPanels()}
function placeKFila(){placeNear($('#pKFila'),[$('#pKar').classList.contains('hide')?$('#kshowq'):$('#pKar')])}
$('#kshowq').onclick=()=>{kShowQ=!kShowQ;renderK();if(kShowQ)placeKFila();};
if(window.ResizeObserver)new ResizeObserver(()=>clampPanels()).observe($('#kbox'));
function updKVol(){const off=kMute||kVol===0,b=$('#kvol');b.textContent=off?'🔇':kVol<50?'🔉':'🔊';b.setAttribute('aria-pressed',String(off));b.setAttribute('aria-label',off?'Ativar som do vídeo do karaokê':'Silenciar vídeo do karaokê');$('#kvr').value=off?0:kVol}
$('#kvol').onclick=()=>{if(kMute||kVol===0){kMute=false;if(kVol===0)kVol=50}else kMute=true;applyKVol();updKVol()};
function updVVol(){const off=vMute||vVol===0,b=$('#vvol');b.textContent=off?'🔇':vVol<50?'🔉':'🔊';b.setAttribute('aria-pressed',String(off));b.setAttribute('aria-label',off?'Ativar som do vídeo':'Silenciar vídeo');$('#vvr').value=off?0:vVol}
$('#vvol').onclick=()=>{if(vMute||vVol===0){vMute=false;if(vVol===0)vVol=50}else vMute=true;applyVVol();updVVol()};
$('#vvr').oninput=e=>{vVol=+e.target.value;vMute=vVol===0;applyVVol();updVVol()};
$('#kvr').oninput=e=>{kVol=+e.target.value;kMute=kVol===0;applyKVol();updKVol()};
$('#kdec').onclick=()=>{ntDisarm('karaoke');$('#kinvb').classList.add('hide')};
function kAccept(){$('#kinvb').classList.add('hide');$('#pKar').classList.remove('hide');['#pMochila','#pVis','#pSet'].forEach(s=>$(s).classList.add('hide'));$('#kmsg').textContent='Cole o link da sua música e clique em "Entrar na fila".';$('#ksong').focus()}
$('#kacc').onclick=()=>{ntDisarm('karaoke');kAccept()};

// ---------- mochila (itens) · visual · gestos ----------
$('#items').innerHTML='<div class="mc">'+ITEMS.map(x=>`<button class="slot" data-u="${x.id}" data-i="${x.n}|${x.info}" aria-label="${x.n}">${ICONS[x.ic]?ICONS[x.ic].svg:x.ic}</button>`).join('')+'</div>';
function showItemInfo(b){const el=$('#iinfo');if(!b){el.textContent='';el.hidden=true;return}el.textContent=b.dataset.i.replace('|',' — ');el.hidden=false}
$('#pMochila').addEventListener('mouseover',e=>{const b=e.target.closest('[data-i]');if(b)showItemInfo(b)});$('#pMochila').addEventListener('mouseleave',()=>showItemInfo(null));$('#pMochila').addEventListener('focusin',e=>{const b=e.target.closest('[data-i]');if(b)showItemInfo(b)});$('#pMochila').addEventListener('focusout',()=>showItemInfo(null));
function useItem(){const it=me.g.userData.item;if(mode!=='play'||!it||!it.id||me.drink>0)return;send({t:'item',item:it.id,use:1})}
$('#items').onclick=e=>{const b=e.target.closest('[data-u]');if(!b)return;const id=b.dataset.u;if(!id)return;const cur=me.g.userData.item;if(cur&&cur.id===id)useItem();else send({t:'item',item:id})};
$('#drop').onclick=()=>send({t:'item',item:null});
$('#tvis').innerHTML='<div class="row" id="vtabs" style="margin-top:6px"></div><div id="ved"></div>';EUPD.push(mkEditor($('#vtabs'),$('#ved')));mark();
$('#gestGrid').innerHTML=GESTS.map(g=>`<button class="slot" data-g="${g[0]}" title="${g[2]}" aria-label="${g[2]}">${g[1]}</button>`).join('')+'<button class="slot" data-g="stop" title="Parar gesto" aria-label="Parar gesto">⏹</button>';
let gLast=0,gSnd=[];const SNDG=new Set(['scream','fart']);
$('#gestGrid').onclick=e=>{const b=e.target.closest('[data-g]');if(!b||mode!=='play')return;const g=b.dataset.g,now=Date.now();
 if(g!=='stop'){if(now-gLast<1500){say('','⏳ Aguarde um instante entre gestos.',1);return}if(SNDG.has(g)){gSnd=gSnd.filter(x=>now-x<60000);if(now-(gSnd[gSnd.length-1]||0)<5000||gSnd.length>=6){say('','⏳ Gestos com som têm limite para evitar spam. Tente de novo em instantes.',1);return}gSnd.push(now)}gLast=now}
 if(g.startsWith('dance')&&me.sit)toggleSit();
 startGest(me,g);send({t:'gest',g})};
$('#emoGrid').innerHTML=EMO.map((e,i)=>`<button class="slot" data-e="${i}" aria-label="Emoji ${e}">${e}</button>`).join('');
$('#emoGrid').onclick=e=>{const b=e.target.closest('[data-e]');if(b&&mode==='play'){const i=+b.dataset.e;if(!(i>=0&&i<EMO.length))return;send({t:'emo',i});showEmo(me,EMO[i])}};
function emoTab(t){['eEmo','eGes'].forEach(i=>{const a=$('#'+i),on=i===t;a.classList.toggle('tabhidden',!on);a.toggleAttribute('inert',!on);a.setAttribute('aria-hidden',String(!on))});$('#emoTitle').textContent=t==='eGes'?'⠿ 🎭 Gestos':'⠿ 😀 Emojis'}
function emoToggle(t){const p=$('#pEmo'),cur=$('#eGes').classList.contains('tabhidden')?'eEmo':'eGes';if(!p.classList.contains('hide')&&cur===t)p.classList.add('hide');else{emoTab(t);p.classList.remove('hide')}}
$('#bEmo').onclick=()=>emoToggle('eEmo');$('#bGes').onclick=()=>emoToggle('eGes');
refreshItemBtns();

// ---------- vídeos (assistir e karaokê) ----------
let pend=null,curInv=null,ytq=[];
function loadYT(cb){if(window.YT&&YT.Player)return cb();ytq.push(cb);if(!document.getElementById('ytapi')){window.onYouTubeIframeAPIReady=()=>ytq.splice(0).forEach(f=>f());const sc=document.createElement('script');sc.id='ytapi';sc.src='https://www.youtube.com/iframe_api';document.head.append(sc)}}
let kVol=100,kMute=false,vVol=100,vMute=false;
function applyVVol(){const y=VW.yt;if(!y||!y.setVolume)return;try{y.setVolume(vVol);if(vMute||vVol===0)y.mute();else y.unMute()}catch(x){}}
function applyKVol(){const y=KW.yt;if(!y||!y.setVolume)return;try{y.setVolume(kVol);if(kMute||kVol===0)y.mute();else y.unMute()}catch(x){}}
function VP(boxId,ytId_,type){const o={yt:null,ctl:false,id:null,iv:null,turn:-1};
 o.open=(id,ctl)=>{o.close();o.id=id;o.ctl=ctl;$('#'+boxId).innerHTML='<div id="'+ytId_+'"></div>';
  loadYT(()=>{if(o.id!==id)return;o.yt=new YT.Player(ytId_,{width:'100%',height:'100%',videoId:id,playerVars:{autoplay:1,rel:0,playsinline:1,controls:(ctl||type==='v')?1:0,disablekb:1},events:{onReady:e=>{e.target.playVideo();if(type==='k')applyKVol();else applyVVol()},
   onStateChange:e=>{if(!o.ctl||!o.yt)return;const st=e.data;if(st===1||st===2)send({t:type+'sync',time:o.yt.getCurrentTime(),playing:st===1});
    if(type==='k'){if(st===1){try{send({t:'kdur',d:o.yt.getDuration()})}catch(x){}}if(st===0)send({t:'kend'})}
    else if(st===0){send({t:'vend'});closeVid(false);say('','O vídeo terminou.',1)}}}});
   if(ctl)o.iv=setInterval(()=>{try{send({t:type+'sync',time:o.yt.getCurrentTime(),playing:o.yt.getPlayerState()===1})}catch(x){}},2000)})};
 o.close=()=>{clearInterval(o.iv);if(o.yt){try{o.yt.destroy()}catch(x){}o.yt=null}$('#'+boxId).innerHTML='';o.id=null;o.ctl=false};
 o.apply=m=>{if(!o.yt||o.ctl||!o.yt.getCurrentTime)return;try{const d=Math.abs(o.yt.getCurrentTime()-m.time),st=o.yt.getPlayerState();if(m.playing){if(d>1.5)o.yt.seekTo(m.time,true);if(st!==1&&st!==3)o.yt.playVideo()}else{if(st===1)o.yt.pauseVideo();if(d>.5)o.yt.seekTo(m.time,true)}}catch(x){}};
 return o}
const VW=VP('vbox','ytp','v'),KW=VP('kbox','kyt','k');
let swapWait=null,swapTm=0;
function clearSwapWait(){if(swapTm)clearTimeout(swapTm);swapTm=0;swapWait=null;const b=$('#vswap');if(b)b.disabled=false}
const fsElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
function exitFullscreenIf(el){if(fsElement()!==el)return;const f=document.exitFullscreen||document.webkitExitFullscreen;if(!f)return;try{const r=f.call(document);if(r&&r.catch)r.catch(()=>{})}catch(e){}}
function syncFullscreenBtns(){const cur=fsElement();[['vfs','vstage'],['kfs','kstage']].forEach(([b,s])=>{const btn=$('#'+b),st=$('#'+s);if(!btn||!st)return;const on=cur===st;btn.textContent=on?'🗗':'⛶';btn.title=on?'Sair da tela cheia':'Tela cheia';btn.setAttribute('aria-label',btn.title);btn.setAttribute('aria-pressed',String(on))})}
function toggleFullscreen(stage){if(fsElement()===stage){exitFullscreenIf(stage);return}const req=stage.requestFullscreen||stage.webkitRequestFullscreen;if(!req){say('','⚠ Tela cheia não está disponível neste navegador.',1);return}try{const r=req.call(stage);if(r&&r.catch)r.catch(()=>say('','⚠ Não foi possível entrar em tela cheia.',1))}catch(e){say('','⚠ Não foi possível entrar em tela cheia.',1)}}
['fullscreenchange','webkitfullscreenchange'].forEach(ev=>document.addEventListener(ev,syncFullscreenBtns));
$('#vfs').onclick=e=>{e.stopPropagation();toggleFullscreen($('#vstage'))};
$('#kfs').onclick=e=>{e.stopPropagation();toggleFullscreen($('#kstage'))};
syncFullscreenBtns();
function openVid(id,ctl){VW.open(id,ctl);$('#pVid').classList.remove('hide');$('#vstart').classList.add('hide');$('#vwatch').classList.remove('hide');$('#vchange').classList.toggle('hide',!ctl);$('#vchangeMsg').textContent='';if(!ctl)$('#vurl2').value=''}
// só quem controla o vídeo o encerra; espectador (inclusive o host) apenas sai e pode voltar pelo sino
function closeVid(notify){if(notify&&VW.id){if(VW.ctl)send({t:'vstop'});else if(curInv&&curInv.vid===VW.id){const c=curInv;ntAdd('video','🎬 '+c.name+' está com um vídeo em andamento. Quer voltar?',()=>{pend=null;openVid(c.vid,false);send({t:'vjoin'})})}}clearSwapWait();exitFullscreenIf($('#vstage'));VW.close();$('#vwatch').classList.add('hide');$('#vchange').classList.add('hide');$('#vchangeMsg').textContent='';$('#vstart').classList.remove('hide');$('#pVid').classList.add('hide')}
// ---------- notificações: convite sem resposta em 20 s sai do balão e vai para o sino 🔔 ----------
const NT={items:[],tm:{},acc:{},seq:0,MS:20000,TTL:20*60000};
function ntRender(){const L=$('#nlist'),n=NT.items.length;L.textContent='';
 if(!n){const e=document.createElement('div');e.className='nempty';e.textContent='Nenhuma notificação.';L.append(e)}
 NT.items.forEach(it=>{const r=document.createElement('div'),t=document.createElement('span'),ts=document.createElement('span'),a=document.createElement('button'),x=document.createElement('button');r.className='ni';
  t.textContent=it.text;ts.className='ts';ts.textContent='há '+Math.max(1,Math.round((Date.now()-it.at)/60000))+' min';
  a.className='pri';a.type=x.type='button';a.textContent=it.kind==='dj'?'🎧 Ouvir':it.kind==='karaoke'?'🎤 Entrar':'▶ Assistir';x.textContent='✖';x.title='Dispensar';x.setAttribute('aria-label','Dispensar');
  a.onclick=()=>{const f=it.acc;ntDrop(it.id);$('#pNotif').classList.add('hide');$('#bNotif').setAttribute('aria-expanded','false');try{f()}catch(e){}};x.onclick=()=>ntDrop(it.id);
  r.append(t,ts,a,x);L.append(r)});
 const b=$('#bNotif');b.firstChild.textContent='🔔';let sup=b.querySelector('sup');if(n){if(!sup){sup=document.createElement('sup');b.append(sup)}sup.textContent=n}else if(sup)sup.remove();
 const lab=n?'Notificações · '+n:'Notificações';b.title=lab;b.setAttribute('aria-label',lab)}
function ntAdd(kind,text,acc){NT.items=NT.items.filter(i=>i.kind!==kind);NT.items.push({id:++NT.seq,kind,text,acc,at:Date.now()});ntRender();const b=$('#bNotif');b.classList.remove('ring');void b.offsetWidth;b.classList.add('ring')}
// notificações guardadas no sino somem sozinhas 20 minutos depois de entrarem
function ntPrune(){const now=Date.now(),n=NT.items.length;NT.items=NT.items.filter(i=>now-i.at<NT.TTL);if(NT.items.length!==n)ntRender()}
setInterval(ntPrune,15000);
function ntDrop(id){NT.items=NT.items.filter(i=>i.id!==id);ntRender()}
function ntDisarm(kind){clearTimeout(NT.tm[kind]);delete NT.tm[kind];NT.items=NT.items.filter(i=>i.kind!==kind);ntRender()}
function ntGone(kind){ntDisarm(kind);const b={dj:'#djinv',karaoke:'#kinvb',video:'#vinv'}[kind];if(b)$(b).classList.add('hide')}
// balão já exibido: se ninguém responder em 20 s, esconde o balão e guarda o convite no sino
function ntArm(kind,bSel,text,acc){ntDisarm(kind);sfx('notif');NT.tm[kind]=setTimeout(()=>{delete NT.tm[kind];$(bSel).classList.add('hide');ntAdd(kind,text,acc)},NT.MS)}
function ntOffer(kind,data,text,bSel,tSel,acc){$(tSel).textContent=text;$(bSel).classList.remove('hide');ntArm(kind,bSel,text,acc);NT.acc[kind]=acc}
function ntReset(){curInv=null;for(const k of Object.keys(NT.tm))clearTimeout(NT.tm[k]);NT.tm={};NT.items=[];NT.acc={};ntRender();['#djinv','#kinvb','#vinv'].forEach(s=>$(s).classList.add('hide'));$('#pNotif').classList.add('hide')}
$('#bNotif').onclick=()=>{const p=$('#pNotif'),open=p.classList.contains('hide');p.classList.toggle('hide',!open);$('#bNotif').setAttribute('aria-expanded',String(open));if(open){ntPrune();ntRender()}};
$('#nclear').onclick=()=>{NT.items=[];ntRender()};
$('#djacc').onclick=()=>{const f=NT.acc.dj;ntDisarm('dj');$('#djinv').classList.add('hide');if(f)f()};
$('#djdec').onclick=()=>{ntDisarm('dj');$('#djinv').classList.add('hide')};
// ---------- DJ: rádio da sala. O áudio passa pelo servidor (proxy): a rádio não vê o IP do ouvinte ----------
const DJ={host:'',by:null,name:'',au:null,on:false,tries:0,tm:0,rk:null};
const djOk=u=>{try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password}catch(e){return false}};
function djMsg(t){$('#djmsg').textContent=t||''}
function djRender(){const has=!!DJ.host,mine=has&&DJ.by===me.id;$('#djnow').classList.toggle('hide',!has);
 if(has){$('#djwho').textContent='🎧 '+DJ.name+' · '+DJ.host;$('#djlisten').textContent=DJ.on?'⏸ Parar de ouvir':'▶ Ouvir';$('#djstop').classList.toggle('hide',!(mine||hostId===me.id))}
 $('#djset').classList.toggle('hide',has&&!mine);$('#djgo').textContent=mine?'🔁 Trocar rádio':'▶ Tocar para todos';
 $('#bDJ').classList.toggle('on',has)}
function djStopAudio(){clearTimeout(DJ.tm);if(DJ.au){try{DJ.au.pause();DJ.au.removeAttribute('src');DJ.au.load()}catch(e){}DJ.au=null}DJ.on=false}
function djListen(retry){if(!DJ.host||!session||!DJ.rk)return;if(!retry)DJ.tries=0;djStopAudio();const a=new Audio();a.referrerPolicy='no-referrer';a.preload='none';a.volume=($('#djvol').value||80)/100;
 const again=()=>{if(DJ.au!==a)return;djStopAudio();if(DJ.host&&DJ.tries<3){DJ.tries++;DJ.on=true;djRender();djMsg('Reconectando…');DJ.tm=setTimeout(()=>{if(DJ.host&&DJ.on)djListen(true)},2000)}else{djRender();djMsg('A rádio caiu ou não pôde ser tocada. Clique em Ouvir para tentar de novo.')}};
 a.onerror=again;a.onended=again;a.onplaying=()=>{if(DJ.au===a){DJ.tries=0;djMsg('')}};
 a.src='/radio?c='+encodeURIComponent(session.code)+'&k='+encodeURIComponent(DJ.rk);DJ.au=a;DJ.on=true;djRender();djMsg('Conectando…');
 const p=a.play();if(p&&p.catch)p.catch(e=>{if(DJ.au!==a)return;if(e&&e.name==='NotAllowedError'){djStopAudio();djRender();djMsg('Clique em Ouvir para começar.')}})}
function djReset(){djStopAudio();DJ.host='';DJ.by=null;DJ.name='';djMsg('');djRender()}
$('#bDJ').onclick=()=>{$('#pDJ').classList.toggle('hide');djRender()};
$('#djgo').onclick=()=>{const u=$('#djurl').value.trim();if(!u){djMsg('Cole o link do streaming.');return}if(!djOk(u)){djMsg('⚠ Use um link https (sem usuário e senha).');return}djMsg('Validando…');send({t:'dj',url:u})};
$('#djurl').onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();$('#djgo').click()}};
$('#djlisten').onclick=()=>{if(DJ.on){djStopAudio();djRender();djMsg('')}else djListen()};
$('#djstop').onclick=()=>send({t:'djstop'});
$('#name').addEventListener('input',()=>{$('#nerr').textContent='';$('#name').removeAttribute('aria-invalid')});
$('#djvol').oninput=e=>{if(DJ.au)DJ.au.volume=e.target.value/100};
$('#bVid').onclick=()=>{if($('#pVid').classList.contains('hide'))$('#pVid').classList.remove('hide');else closeVid(true)};
$('#vgo').onclick=()=>{const id=ytId($('#vurl').value);if(!id){$('#vmsg').textContent='Link inválido. Use um link https do YouTube.';return}send({t:'video',vid:id});openVid(id,true)};
$('#vswap').onclick=()=>{if(!VW.ctl||swapWait)return;const id=ytId($('#vurl2').value);if(!id){$('#vchangeMsg').textContent='⚠ Link inválido. Use um link https do YouTube.';return}if(id===VW.id){$('#vchangeMsg').textContent='Este já é o vídeo atual.';return}swapWait=id;$('#vswap').disabled=true;$('#vchangeMsg').textContent='⏳ Trocando o vídeo…';send({t:'video',vid:id});swapTm=setTimeout(()=>{if(swapWait!==id)return;clearSwapWait();$('#vchangeMsg').textContent='⚠ Não foi possível trocar agora. Aguarde alguns segundos e tente de novo.'},5000)};
$('#vurl2').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#vswap').click()}};
$('#vclose').onclick=()=>closeVid(true);
$('#vdec').onclick=()=>{ntDisarm('video');pend=null;$('#vinv').classList.add('hide')};
$('#vacc').onclick=()=>{ntDisarm('video');if(!pend)return;const m=pend;pend=null;$('#vinv').classList.add('hide');openVid(m.vid,false);send({t:'vjoin'})};

// ---------- microfone / voz WebRTC ----------
const MAX_VOICE_PEERS=8,VOICE_IDLE=90000,VOICE_DENY=15000,ICE_REFRESH=2700000,VQ_KEY='skyke3d.voiceQ',FX_KEY='skyke3d.micFx';
// ---------- núcleo dos modos de voz (testável) ----------
const VOICE_MODES={
 eco:{name:'Eco',kbps:24,stereo:false,music:false,dtx:true},
 padrao:{name:'Padrão',kbps:32,stereo:false,music:false,dtx:true},
 alta:{name:'Alta',kbps:48,stereo:false,music:false,dtx:true},
 musica:{name:'Música',kbps:48,stereo:false,music:true,dtx:false},
 estereo:{name:'Estéreo',kbps:96,stereo:true,music:true,dtx:false}
};
const VQ_ORDER=['eco','padrao','alta','musica','estereo'];
const CROWD_PEERS=5,CROWD_KBPS=24;
const VAD={min:.012,floorMin:.0005,floorMax:.02,openX:3,closeX:1.8,hold:.5};
const MIC_FX={echoCancellation:'Cancelamento de eco',noiseSuppression:'Redução de ruído',autoGainControl:'Ganho automático'};
const MIC_FX_KEYS=Object.keys(MIC_FX);
const MIC_FX_DEFAULT={echoCancellation:false,noiseSuppression:false,autoGainControl:true};
function parseMicFx(raw){
 const out={...MIC_FX_DEFAULT};let v=raw;
 if(typeof raw==='string'){try{v=JSON.parse(raw)}catch(e){return out}}
 if(v&&typeof v==='object')for(const k of MIC_FX_KEYS)if(typeof v[k]==='boolean')out[k]=v[k];
 return out;
}
function micFxForMode(q,prefs){
 const music=!!(VOICE_MODES[q]&&VOICE_MODES[q].music),p=prefs||MIC_FX_DEFAULT,out={};
 for(const k of MIC_FX_KEYS)out[k]=music?false:p[k]===true;
 return out;
}
function micFxMismatch(q,prefs,settings){
 const want=micFxForMode(q,prefs),out=[];
 if(!settings)return out;
 for(const k of MIC_FX_KEYS)if(typeof settings[k]==='boolean'&&settings[k]!==want[k])out.push(k);
 return out;
}
function effectiveVoice(local,remote,relay,crowd){
 const l=VOICE_MODES[local]?local:'padrao',r=VOICE_MODES[remote]?remote:'padrao';
 const mode=VQ_ORDER[Math.min(VQ_ORDER.indexOf(l),VQ_ORDER.indexOf(r))],base=VOICE_MODES[mode];
 if(relay)return {mode,name:base.name,kbps:base.music?32:24,stereo:false,music:base.music,dtx:!base.music,relay:true,crowd:false};
 const kbps=crowd&&!base.music?Math.min(base.kbps,CROWD_KBPS):base.kbps;
 return {mode,name:base.name,kbps,stereo:base.stereo,music:base.music,dtx:base.dtx,relay:false,crowd:kbps<base.kbps};
}
function relayFromStats(st){
 const sel=new Set(),pairs=[];
 st.forEach(s=>{if(s.type==='transport'&&s.selectedCandidatePairId)sel.add(s.selectedCandidatePairId)});
 st.forEach(s=>{if(s.type!=='candidate-pair')return;if(sel.size?sel.has(s.id):(s.selected||(s.nominated&&s.state==='succeeded')))pairs.push(s)});
 if(!pairs.length)return null;
 for(const s of pairs){const a=st.get(s.localCandidateId),b=st.get(s.remoteCandidateId);if((a&&a.candidateType==='relay')||(b&&b.candidateType==='relay'))return true}
 return false;
}
// VAD adaptativo: piso de ruído (desce rápido, sobe devagar) + histerese. Com os filtros
// desligados por padrão o nível do microfone varia muito, então um limiar fixo não serve.
function vadNew(){return {floor:.004,talk:false,hold:0}}
function vadStep(s,rms,dt){
 if(!(rms>=0))rms=0;if(!(dt>0))dt=0;
 if(rms<s.floor)s.floor+=(rms-s.floor)*Math.min(1,dt*4);else s.floor*=1+dt*.05;
 s.floor=Math.min(VAD.floorMax,Math.max(VAD.floorMin,s.floor));
 const th=s.talk?Math.max(VAD.min*.65,s.floor*VAD.closeX):Math.max(VAD.min,s.floor*VAD.openX);
 if(rms>th){s.talk=true;s.hold=VAD.hold}
 else if(s.talk){s.hold=Math.max(0,s.hold-dt);if(s.hold===0)s.talk=false}
 return s.talk;
}
// ---------- fim do núcleo dos modos de voz ----------
function storedVoiceQ(){try{const v=localStorage.getItem(VQ_KEY);return VOICE_MODES[v]?v:'padrao'}catch(e){return 'padrao'}}
function storedMicFx(){try{return parseMicFx(localStorage.getItem(FX_KEY))}catch(e){return {...MIC_FX_DEFAULT}}}
let voiceQ=storedVoiceQ(),micFxPrefs=storedMicFx(),crowd=false,vadS=vadNew();
const peers=new Map(),denied=new Map(),remoteVQ=new Map();
let ICE={iceServers:[{urls:'stun:stun.l.google.com:19302'}],iceTransportPolicy:'all'},iceAt=0,localTrack=null,vol=1,stream,ctx,an,buf,hold=0,lastTalk=false;
function peerDist2(id){const a=actors.get(id);if(!a)return Infinity;const dx=(a.tx??a.g.position.x)-me.g.position.x,dz=(a.tz??a.g.position.z)-me.g.position.z;return dx*dx+dz*dz}
function rankedPeers(){const out=[];for(const a of actors.values()){if(a.bot||a.id===me.id)continue;out.push([a.id,peerDist2(a.id)])}out.sort((x,y)=>x[1]-y[1]);return out}
function tuneSdp(sdp){
 const nl=sdp.includes('\r\n')?'\r\n':'\n',lines=sdp.split(nl),pts=new Set(),PT=['a=ptime:40','a=maxptime:60'];let added=false;
 for(const l of lines){const m=l.match(/^a=rtpmap:(\d+) opus\/48000(?:\/\d+)?$/i);if(m)pts.add(m[1])}
 const out=[];
 for(const l of lines){
  if(/^a=(?:max)?ptime:/.test(l))continue;
  const m=l.match(/^a=fmtp:(\d+)(?: (.*))?$/);
  if(!m||!pts.has(m[1])){out.push(l);continue}
  const kv={};for(const q of (m[2]||'').split(';')){const i=q.indexOf('=');if(i>0)kv[q.slice(0,i).trim()]=q.slice(i+1).trim();else if(q.trim())kv[q.trim()]=''}
  kv.usedtx='0';kv.maxaveragebitrate='96000';kv.stereo='1';kv['sprop-stereo']='1';kv.cbr='0';
  out.push('a=fmtp:'+m[1]+' '+Object.entries(kv).map(([k,v])=>v===''?k:k+'='+v).join(';'));
  if(!added){out.push(...PT);added=true}
 }
 if(!added){const i=out.findIndex(l=>/^a=rtpmap:\d+ opus\/48000/i.test(l));if(i>=0)out.splice(i+1,0,...PT)}
 return out.join(nl)
}
// sem RED: ele repete cada quadro Opus e quase dobra a banda; o FEC embutido (useinbandfec) continua
function preferNoRed(tr){try{if(!tr||!tr.setCodecPreferences||typeof RTCRtpReceiver==='undefined'||!RTCRtpReceiver.getCapabilities)return;const c=RTCRtpReceiver.getCapabilities('audio');if(!c||!c.codecs)return;const f=c.codecs.filter(x=>!/^audio\/red$/i.test(x.mimeType));if(f.length&&f.length<c.codecs.length)tr.setCodecPreferences(f)}catch(e){}}
async function tuneSender(p){const s=p&&p.tr&&p.tr.sender;if(!s)return;const e=effectiveVoice(voiceQ,p.vq,p.relay,crowd),key=e.kbps+':'+e.dtx;if(p.tuned===key)return;p.tuned=key;let ok=false;try{const a=s.getParameters();if(!a.encodings||!a.encodings.length)a.encodings=[{}];a.encodings[0].maxBitrate=e.kbps*1000;await s.setParameters(a);ok=true}catch(x){}try{const a=s.getParameters();if(a.encodings&&a.encodings[0]){a.encodings[0].dtx=e.dtx;await s.setParameters(a)}}catch(x){}
 if(ok)p.tuneTry=0;else{p.tuned='';p.tuneTry=(p.tuneTry||0)+1;if(p.tuneTry<=3)setTimeout(()=>{if(p.pc&&p.pc.connectionState!=='closed')tuneSender(p)},1000*p.tuneTry)}
 updateVoiceStatus()}
function updateVoiceStatus(){const el=$('#voiceQMsg');if(!el)return;const q=VOICE_MODES[voiceQ];let msg='Seu envio: '+q.kbps+' kbps '+(q.stereo?'estéreo':'mono')+(q.music?' · modo música (sem VAD)':'')+'.';if(peers.size){const eff=[...peers.values()].map(p=>effectiveVoice(voiceQ,p.vq,p.relay,crowd)),low=eff.reduce((a,b)=>b.kbps<a.kbps?b:a),relays=eff.filter(e=>e.relay).length;msg='Para '+peers.size+(peers.size===1?' conexão':' conexões')+': a partir de '+low.kbps+' kbps'+(relays?' · '+relays+' via relay':'')+(crowd&&eff.some(e=>e.crowd)?' · voz limitada a '+CROWD_KBPS+' kbps com '+peers.size+' conexões':'')+'.'}el.textContent=msg}
function announceVQ(){peers.forEach((p,id)=>send({t:'sig',to:id,data:{x:'vq',q:voiceQ}}))}
function syncCrowd(){const c=peers.size>=CROWD_PEERS;if(c===crowd)return;crowd=c;peers.forEach(p=>{p.tuned=''});retuneAll()}
function retuneAll(){peers.forEach(p=>{syncSender(p);tuneSender(p)});updateVoiceStatus()}
function setVoiceQ(q,fromMic){if(!VOICE_MODES[q])return;const prev=VOICE_MODES[voiceQ];voiceQ=q;try{localStorage.setItem(VQ_KEY,q)}catch(e){}const sel=$('#sVoiceQ');if(sel&&sel.value!==q)sel.value=q;announceVQ();const next=VOICE_MODES[q];if(!fromMic&&stream&&(prev.music!==next.music||prev.stereo!==next.stereo))restartMic();else retuneAll();updateVoiceStatus();updateMicFxUI()}
$('#sVoiceQ').value=voiceQ;$('#sVoiceQ').onchange=e=>setVoiceQ(e.target.value);updateVoiceStatus();
function syncSender(p){if(!p||!p.tr)return;const t=(me.talk||VOICE_MODES[voiceQ].music)&&localTrack?localTrack:null;if(p.sent===t)return;p.sent=t;p.tr.sender.replaceTrack(t).catch(()=>{})}
function syncSenders(){peers.forEach(syncSender)}
function ensureSlot(id){
 if(peers.has(id))return true;
 if(peers.size<MAX_VOICE_PEERS)return true;
 let victim=null,vd=-1;
 for(const pid of peers.keys()){const d=peerDist2(pid);if(d>vd){vd=d;victim=pid}}
 const nd=peerDist2(id);
 if(victim&&nd<vd){denied.set(victim,Date.now()+VOICE_DENY);closePeer(victim,true);return true}
 return false
}
function mkPeer(id,isAns){const pc=new RTCPeerConnection(ICE),p={pc,tr:null,sent:undefined,lastActive:Date.now(),ok:0,q:[],vq:remoteVQ.get(id)||'padrao',relay:false,tuned:''};if(!isAns){p.tr=pc.addTransceiver('audio',{direction:'sendrecv'});preferNoRed(p.tr);syncSender(p)}
 pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'){say('','⚠ Falha na conexão de voz com um jogador (rede restrita?).',1);closePeer(id,true)}else if(pc.connectionState==='connected')refreshRoute(p)};
 pc.onicecandidate=e=>e.candidate&&send({t:'sig',to:id,data:{c:e.candidate}});
 pc.ontrack=e=>{let au=document.getElementById('au'+id);if(!au){au=document.createElement('audio');au.id='au'+id;au.autoplay=true;document.body.append(au)}au.srcObject=e.streams[0]||new MediaStream([e.track]);au.volume=vol;au.muted=false;au.play&&au.play().catch(()=>{});try{const a_=AC(),src=a_.createMediaStreamSource(au.srcObject),an=a_.createAnalyser();an.fftSize=256;src.connect(an);const pr=peers.get(id);if(pr){pr.an=an;pr.ab=new Float32Array(256);pr.src=src}}catch(x){}};
 peers.set(id,p);send({t:'sig',to:id,data:{x:'vq',q:voiceQ}});syncCrowd();updateVoiceStatus();return p}
async function refreshRoute(p){if(!p||!p.pc)return;try{const st=await p.pc.getStats(),relay=relayFromStats(st);if(relay===null||p.relay===relay)return;p.relay=relay;p.tuned='';tuneSender(p);updateVoiceStatus()}catch(e){}}
async function callPeer(id){if(peers.has(id)||(denied.get(id)||0)>Date.now()||!ensureSlot(id))return;try{const p=mkPeer(id),off=await p.pc.createOffer(),sdp=tuneSdp(off.sdp);await p.pc.setLocalDescription({type:'offer',sdp});tuneSender(p);send({t:'sig',to:id,data:{d:{type:'offer',sdp}}})}catch(e){closePeer(id,false)}}
function onRemoteSpeak(id){if(mode!=='play'||id===me.id)return;const p=peers.get(id);if(p){p.lastActive=Date.now();return}if((denied.get(id)||0)>Date.now())return;if(me.id<id)callPeer(id)}
function onLocalSpeak(){if(mode!=='play'||!me.talk)return;const r=rankedPeers();for(let i=0;i<r.length&&i<MAX_VOICE_PEERS;i++){const id=r[i][0],p=peers.get(id);if(p){p.lastActive=Date.now();continue}if(me.id<id)callPeer(id)}}
const sq=new Map();
function onSig(m){const prev=sq.get(m.from)||Promise.resolve();sq.set(m.from,prev.then(()=>doSig(m)).catch(()=>{}))}
async function flush(p){for(const c of p.q||[])await p.pc.addIceCandidate(c).catch(()=>{});p.q=[]}
async function doSig(m){let p=peers.get(m.from);const d=m.data;
if(d.x==='vq'){if(VOICE_MODES[d.q]){if(p){p.vq=d.q;p.tuned='';tuneSender(p);updateVoiceStatus()}else remoteVQ.set(m.from,d.q)}return}
if(d.x){if(d.x==='close')closePeer(m.from,false);else if(d.x==='busy'){denied.set(m.from,Date.now()+VOICE_DENY);closePeer(m.from,false)}return}
if(d.d){if(d.d.type==='offer'){if(!p){if((denied.get(m.from)||0)>Date.now()||!ensureSlot(m.from)){send({t:'sig',to:m.from,data:{x:'busy'}});return}p=mkPeer(m.from,true)}await p.pc.setRemoteDescription(d.d);{const t=p.pc.getTransceivers().find(x=>x.receiver&&x.receiver.track&&x.receiver.track.kind==='audio');if(t){t.direction='sendrecv';p.tr=t;preferNoRed(t);syncSender(p)}}p.ok=1;await flush(p);const ans=await p.pc.createAnswer(),sdp=tuneSdp(ans.sdp);await p.pc.setLocalDescription({type:'answer',sdp});tuneSender(p);send({t:'sig',to:m.from,data:{d:{type:'answer',sdp}}})}else if(p){await p.pc.setRemoteDescription(d.d);p.ok=1;await flush(p);tuneSender(p)}}
else if(d.c&&p){if(p.ok)await p.pc.addIceCandidate(d.c).catch(()=>{});else(p.q=p.q||[]).push(d.c)}}
function closePeer(id,notify=true){const p=peers.get(id);if(!p)return;peers.delete(id);syncCrowd();if(notify)send({t:'sig',to:id,data:{x:'close'}});try{p.pc.onicecandidate=p.pc.ontrack=p.pc.onconnectionstatechange=null;p.pc.close()}catch(e){}try{p.src&&p.src.disconnect();p.an&&p.an.disconnect()}catch(e){}const au=document.getElementById('au'+id);au&&au.remove();updateVoiceStatus()}
addEventListener('click',()=>document.querySelectorAll('audio').forEach(a=>a.paused&&a.srcObject&&a.play().catch(()=>{})));
$('#sVol').oninput=e=>{vol=+e.target.value;document.querySelectorAll('audio').forEach(a=>a.volume=vol)};
const micTxt=t=>{const m=$('#mic'),s=/ATIVO/.test(t)?'on':/🚫/.test(t)?'err':'off',act=s==='on'?'clique para desativar':'clique para ativar',lb=t+' · '+act;m.textContent=s==='err'?'🚫':'🎤';m.title=lb;m.setAttribute('aria-label',lb);m.dataset.s=s;m.setAttribute('aria-pressed',String(s==='on'));};
function micConstraints(){const m=VOICE_MODES[voiceQ],fx=micFxForMode(voiceQ,micFxPrefs);return {audio:{channelCount:m.stereo?2:1,...fx}}}
const MIC_FX_INPUT={echoCancellation:'sAec',noiseSuppression:'sNs',autoGainControl:'sAgc'};
function micFxSupported(){
 const out={};for(const k of MIC_FX_KEYS)out[k]=true;
 try{const s=navigator.mediaDevices?.getSupportedConstraints?.();if(s)for(const k of MIC_FX_KEYS)if(s[k]===false)out[k]=false}catch(e){}
 if(localTrack?.getCapabilities)try{const c=localTrack.getCapabilities()||{};for(const k of MIC_FX_KEYS){const v=c[k];if(v===false||(Array.isArray(v)&&v.length&&!v.includes(true)&&!v.includes('remote-only')))out[k]=false}}catch(e){}
 return out;
}
function micFxCanSet(k,on){
 if(!micFxSupported()[k])return false;
 if(!localTrack?.getCapabilities)return true;
 try{const v=localTrack.getCapabilities()[k];if(v===false)return false;if(Array.isArray(v)&&v.length)return v.includes(on)||v.includes('remote-only')}catch(e){}
 return true;
}
function updateMicFxUI(){
 const music=VOICE_MODES[voiceQ].music,sup=micFxSupported(),want=micFxForMode(voiceQ,micFxPrefs),act=localTrack&&localTrack.getSettings?localTrack.getSettings():null,missing=[];
 for(const k of MIC_FX_KEYS){const el=$('#'+MIC_FX_INPUT[k]);if(!el)continue;const can=music||micFxCanSet(k,want[k]);el.checked=want[k];el.disabled=music||!can;const lab=el.closest('label');if(lab){lab.classList.toggle('dis',el.disabled);if(el.disabled)lab.title=music?'Desativado no modo Música/Estéreo':(!sup[k]?'Não suportado neste dispositivo':'Este estado não é suportado neste dispositivo');else lab.removeAttribute('title')}if(!sup[k]||(!music&&!can))missing.push(k)}
 const msg=$('#micFxMsg');if(!msg)return;
 const bad=micFxMismatch(voiceQ,micFxPrefs,act),unknown=act&&!music?MIC_FX_KEYS.filter(k=>sup[k]&&typeof act[k]!=='boolean'):[];
 if(missing.length)msg.textContent='Não suportado: '+missing.map(k=>MIC_FX[k]).join(', ')+'.';
 else if(bad.length)msg.textContent='O dispositivo não honrou: '+bad.map(k=>MIC_FX[k]).join(', ')+'.';
 else if(unknown.length)msg.textContent='Sem confirmação do dispositivo: '+unknown.map(k=>MIC_FX[k]).join(', ')+'.';
 else msg.textContent='';
}
function micFxApplyConstraints(){
 const want=micFxForMode(voiceQ,micFxPrefs),act=localTrack&&localTrack.getSettings?localTrack.getSettings():null,out={};
 for(const k of MIC_FX_KEYS)if(micFxCanSet(k,want[k])&&(!act||typeof act[k]!=='boolean'||act[k]!==want[k]))out[k]=want[k];
 return out;
}
async function applyMicFx(){
 const track=localTrack;
 if(!track||!stream||VOICE_MODES[voiceQ].music){updateMicFxUI();return}
 const c=micFxApplyConstraints();
 if(!Object.keys(c).length){updateMicFxUI();return}
 try{
  await track.applyConstraints(c);
  const st=track.getSettings?track.getSettings():null;
  if(micFxMismatch(voiceQ,micFxPrefs,st).length)await restartMic();
 }catch(e){await restartMic()}
 updateMicFxUI();
}
let micFxQueue=Promise.resolve();
function queueMicFx(){micFxQueue=micFxQueue.then(applyMicFx).catch(()=>{updateMicFxUI()});return micFxQueue}
MIC_FX_KEYS.forEach(k=>{const el=$('#'+MIC_FX_INPUT[k]);if(!el)return;el.onchange=()=>{if(VOICE_MODES[voiceQ].music){updateMicFxUI();return}micFxPrefs[k]=el.checked;try{localStorage.setItem(FX_KEY,JSON.stringify(micFxPrefs))}catch(e){}updateMicFxUI();queueMicFx()}});
function releaseMic(){const s=stream,c=ctx;stream=ctx=an=buf=null;localTrack=null;vadS=vadNew();if(s)try{s.getTracks().forEach(t=>t.stop())}catch(e){}if(c)try{c.close()}catch(e){}}
async function startMic(){if(stream)return;if(!navigator.mediaDevices?.getUserMedia){micTxt('🚫 Microfone: indisponível (use HTTPS ou localhost)');return}
 try{const mode=VOICE_MODES[voiceQ],s=await navigator.mediaDevices.getUserMedia(micConstraints());stream=s;const a=new(window.AudioContext||window.webkitAudioContext)();ctx=a;an=a.createAnalyser();an.fftSize=512;buf=new Float32Array(512);const src=a.createMediaStreamSource(s);src.connect(an);localTrack=s.getAudioTracks()[0]||null;if(!localTrack)throw new Error('sem faixa de áudio');
 const st=localTrack.getSettings?localTrack.getSettings():{},cap=localTrack.getCapabilities?localTrack.getCapabilities():null,ch=st.channelCount||src.channelCount||1,mono=ch<2||!!(cap&&cap.channelCount&&cap.channelCount.max<2);let fell=false;
 if(mode.stereo&&mono){setVoiceQ('musica',true);fell=true}
 localTrack.contentHint=VOICE_MODES[voiceQ].music?'music':'speech';syncSenders();retuneAll();updateMicFxUI();micTxt('🎤 Microfone: ATIVO'+(fell?' (fonte mono)':''));if(fell)say('','⚠ Seu microfone é mono; usei Música (mono) no lugar de Estéreo.',1);updateVoiceStatus()}
 catch(e){releaseMic();me.talk=false;if(lastTalk){lastTalk=false;send({t:'speak',v:false})}syncSenders();micTxt('🚫 Microfone: permissão negada ou indisponível');updateVoiceStatus();updateMicFxUI()}}
function stopMic(){releaseMic();me.talk=false;syncSenders();if(lastTalk){lastTalk=false;send({t:'speak',v:false})}micTxt('🎤 Microfone: desativado');updateVoiceStatus();updateMicFxUI()}
async function restartMic(){if(!stream)return;releaseMic();me.talk=false;syncSenders();if(lastTalk){lastTalk=false;send({t:'speak',v:false})}await startMic()}
$('#mic').onclick=()=>stream?stopMic():startMic();
updateMicFxUI();
setInterval(()=>{if(mode!=='play')return;const t=Date.now();for(const [id,p] of peers){if(!me.talk&&!(actors.get(id)&&actors.get(id).talk)&&t-(p.lastActive||0)>VOICE_IDLE)closePeer(id,true);else if(p.pc.connectionState==='connected')refreshRoute(p)}for(const [id,until] of denied)if(until<=t)denied.delete(id);if(t-iceAt>ICE_REFRESH){iceAt=t;send({t:'ice'})}},15000);

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
function clampPanels(){const z=UZ(),iw=innerWidth,ih=innerHeight;['chat','pMochila','pVis','pVid','pDJ','pKar','pKFila','pSet','pEmo'].forEach(id=>{const p=$('#'+id);if(!p||p.classList.contains('hide'))return;let r=p.getBoundingClientRect();
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
['chat','pMochila','pVis','pVid','pDJ','pKar','pKFila','pSet','pEmo'].forEach(dragify);
['pMochila','pVis','pVid','pDJ','pKar','pKFila','pSet','pEmo'].forEach(id=>{const p=$('#'+id),g=p.querySelector('.grip');if(!g)return;const b=document.createElement('button');b.className='gmin';b.textContent='➖';b.title=id==='pKFila'?'Ocultar fila':'Ocultar janela';b.setAttribute('aria-label',b.title);
 b.onclick=e=>{e.stopPropagation();if(id==='pVid'){closeVid(true);return}p.classList.add('hide');if(id==='pKar'){exitFullscreenIf($('#kstage'));if(kShowQ)placeKFila();}else if(id==='pKFila'){kShowQ=false;renderK()}};g.append(b)});
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
renderer.domElement.addEventListener('pointerdown',e=>{if(mode!=='play'||me.sit)return;dragging=true;setDest(e)});
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
const PERF=/[?&]perf(=|&|$)/.test(location.search);let _pe=null,_pa=0,_pn=0,_pw=0;
function perfTick(dt){if(!_pe){_pe=document.createElement('pre');_pe.style.cssText='position:fixed;left:6px;top:6px;margin:0;padding:6px 8px;background:#000a;color:#9f9;font:11px/1.35 monospace;z-index:99;pointer-events:none;border-radius:6px';document.body.append(_pe)}
 _pa+=dt;_pn++;if(_pa<.5)return;const i=renderer.info,fps=_pn/_pa,mem=performance.memory?(performance.memory.usedJSHeapSize/1048576).toFixed(0)+'MB':'n/d';
 _pe.textContent='fps '+fps.toFixed(0)+'  frame '+(1000/fps).toFixed(1)+'ms\ncalls '+i.render.calls+'  tris '+i.render.triangles+'\ngeom '+i.memory.geometries+'  tex '+i.memory.textures+'\nprogs '+(i.programs?i.programs.length:0)+'  heap '+mem+'\nactors '+(actors.size+1)+'  scale '+RS.toFixed(1)+'  dpr '+renderer.getPixelRatio().toFixed(2);_pa=0;_pn=0}
let _ae=1/60,_al=0,_ah=0;
function adaptRes(dt){if(mode!=='play'||document.hidden)return;if(SHD)dirL.castShadow=RS>=.8;_ae+=(dt-_ae)*.05;
 if(_ae>1/42){_al+=dt;_ah=0;if(_al>2&&RS>.6){RS=Math.max(.6,RS-.1);_al=0;res()}}
 else if(_ae<1/57){_ah+=dt;_al=0;if(_ah>6&&RS<1){RS=Math.min(1,RS+.1);_ah=0;res()}}else{_al=0;_ah=0}}
let olN=0;const olLod=()=>{[me,...actors.values()].forEach(a=>{const u=a.g&&a.g.userData,o=u&&u.ols;if(!o)return;const d=cam.position.distanceTo(a.g.position),v=d<16;if(o.vis!==v){o.vis=v;o.forEach(m=>{m.visible=v})}
  const far=d>(u.far?8.5:9.5);if(u.lod&&u.far!==far){u.far=far;u.lod.forEach(e=>{e.m.geometry=far?(e.lo||(e.lo=e.mk())):e.hi})}})};
function loop(){requestAnimationFrame(loop);if(++olN%20===0)olLod();const dt=Math.min(clock.getDelta(),.1),t=clock.elapsedTime;
if(mode==='play'){const mv=new THREE.Vector3((keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),0,(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0));
 if(me.sit&&mv.lengthSq())toggleSit();
 me.moving=false;
 if(!me.sit){let d=mv;if(d.lengthSq())dest=null;else if(dest){d=new THREE.Vector3().subVectors(dest,me.g.position);d.y=0;if(d.length()<.15){dest=null;d.set(0,0,0)}}
  if(d.lengthSq()){const px=me.g.position.x,pz=me.g.position.z;d.normalize();me.g.position.addScaledVector(d,3.2*dt);clamp(me.g.position);me.g.rotation.y=Math.atan2(d.x,d.z);const mvd=Math.hypot(me.g.position.x-px,me.g.position.z-pz);me.moving=mvd>dt*.8;if(dest&&mvd<dt*.2)dest=null;if(me.gest){me.gest=null;send({t:'gest',g:'stop'})}}}
 me.jy+=me.vy*dt;me.vy-=12*dt;if(me.jy<=0){me.jy=0;me.vy=0}
 me.g.position.y=me.jy+(me.moving&&!rm&&me.jy===0?Math.abs(Math.sin(t*10))*.05:0);
 if(t-sendT>.1){sendT=t;const mm_=[me.g.position.x,me.g.position.z,me.g.rotation.y,me.jy].map(n=>n.toFixed(2)).join()+(me.sit?1:0);if(mm_!==lastMv||t-lastMvT>2){lastMv=mm_;lastMvT=t;send({t:'move',x:me.g.position.x,z:me.g.position.z,ry:me.g.rotation.y,y:me.jy,s:me.sit?1:0})}}
 cam.position.lerp(v3.set(me.g.position.x*.8,4.8,me.g.position.z+9.2),.08);cam.lookAt(me.g.position.x*.8,1.2,me.g.position.z-3)}
else{const a=rm?0:t*.15,port=innerWidth/innerHeight<.9||innerWidth<700;if(port){cam.position.set(Math.sin(a)*1.2,2.3,12.9);cam.lookAt(0,-1.1,4.9);me.g.position.set(0,0,4.9)}else{cam.position.set(Math.sin(a)*1.5,2.4,10.9);cam.lookAt(-.4,1.2,4.9);me.g.position.set(2.2,0,4.9)}me.moving=false;me.g.rotation.y=rm?0:t*.6}
if(!an)me.lv=0;if(an){an.getFloatTimeDomainData(buf);let q=0;for(const x of buf)q+=x*x;const rms=Math.sqrt(q/buf.length);me.lv=Math.min(1,rms*8);const musicMode=VOICE_MODES[voiceQ].music;if(musicMode){hold=.5;vadS.talk=false}else vadStep(vadS,rms,dt);me.talk=musicMode?!!localTrack:vadS.talk;if(me.talk!==lastTalk){lastTalk=me.talk;send({t:'speak',v:me.talk});syncSenders();if(me.talk)onLocalSpeak();else peers.forEach(p=>p.lastActive=Date.now())}}
const nb=me.talk?Math.max(1,Math.round(me.lv*10)):0;vbs.forEach((q,i)=>q.classList.toggle('on',i<nb));me.spd=(me.spd||0)+((me.moving&&me.jy===0?3.2:0)-(me.spd||0))*Math.min(1,dt*12);animA(me,t,dt);
const k=Math.min(1,dt*10),z=UZ();if(SHD){const q_=28/SHD,sx=Math.round(me.g.position.x/q_)*q_,sz=Math.round(me.g.position.z/q_)*q_;dirL.target.position.set(sx,0,sz);dirL.position.set(sx+LDO[0],LDO[1],sz+LDO[2])}FC++;if(FC&1)partTick(dt*2);PM.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);FR.setFromProjectionMatrix(PM);
actors.forEach(a=>{const ox_=a.g.position.x,oz_=a.g.position.z;const pr=peers.get(a.id);let tg=a._tg||0;if(pr&&pr.an&&(FC&1)){pr.an.getFloatTimeDomainData(pr.ab);let s_=0;for(const x of pr.ab)s_+=x*x;tg=Math.min(1,Math.sqrt(s_/pr.ab.length)*8);a._tg=tg;if(tg>.02)pr.lastActive=Date.now()}a.lv=(a.lv||0)+(tg-(a.lv||0))*.5;a.g.position.x+=(a.tx-a.g.position.x)*k;a.g.position.z+=(a.tz-a.g.position.z)*k;a.g.position.y+=(a.ty-a.g.position.y)*k;{let d_=a.tr-a.g.rotation.y;d_=Math.atan2(Math.sin(d_),Math.cos(d_));a.g.rotation.y+=d_*Math.min(1,dt*14)}a.spd=(a.spd||0)+((Math.hypot(a.g.position.x-ox_,a.g.position.z-oz_)/Math.max(dt,.001))-(a.spd||0))*.25;SPH.center.set(a.g.position.x,a.g.position.y+1,a.g.position.z);const dx_=a.g.position.x-cam.position.x,dz_=a.g.position.z-cam.position.z,far=dx_*dx_+dz_*dz_>900;a._ad=(a._ad||0)+dt;if(FR.intersectsSphere(SPH)&&!(far&&(FC&1))){animA(a,t,a._ad);a._ad=0}});
[me,...actors.values()].forEach(a=>{v3.copy(a.g.position);v3.y+=2.6;v3.project(cam);const dsp=(v3.z<1&&(mode==='play'||a===me))?'':'none';if(a._dsp!==dsp){a._dsp=dsp;a.el.style.display=dsp}if(dsp===''){const lx=Math.round((v3.x+1)/2*innerWidth/z*2)/2,ly=Math.round((1-v3.y)/2*innerHeight/z*2)/2;if(a._lx!==lx){a._lx=lx;a.el.style.left=lx+'px'}if(a._ly!==ly){a._ly=ly;a.el.style.top=ly+'px'}}lab(a)});
if(fireL){fireL.intensity=(FIRE_I+Math.sin(t*9)*.3+Math.sin(t*23)*.14)*LG;flames.forEach((f,i)=>{f.scale.y=1+Math.sin(t*10+i*2)*.2;f.rotation.y=t*1.5+i});{const q=fireL.intensity/(FIRE_I*LG);fireGlow.forEach(m=>{m.material.opacity=Math.min(1,Math.max(.55,.4+.6*q));m.scale.setScalar(.94+.06*q)})}}
if(waterFx){waterFx[0].map.offset.set(t*.011,t*.007);waterFx[1].map.offset.set(-t*.008,t*.012)}
if(jets.length)jetTick(t);emberTick(t);
orbs.forEach(o=>{o.a+=dt*o.sp;o.m.position.set(o.cx+Math.cos(o.a)*o.r,o.cy,o.cz+Math.sin(o.a)*o.r)});spin.forEach(m=>{m.rotation.y+=dt*.8});
for(let i=FX.length-1;i>=0;i--){const x=FX[i],e=(performance.now()-x.t0)/1000;if(e>2){scene.remove(x.p);x.p.material.dispose();FX.splice(i,1)}else{x.p.position.y+=dt*.35;x.p.material.opacity=1-e/2;const z_=.6+e*.3;x.p.scale.set(z_,z_,z_)}}
renderer.render(scene,cam);adaptRes(dt);if(PERF)perfTick(dt)}
loop();
}
