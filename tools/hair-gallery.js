// Pré-visualização dos cabelos: gera tools/hair-gallery.html e, com --shot, tira um screenshot via Chrome headless.
// Uso: node tools/hair-gallery.js [--shot saida.png] [--ry 0.6] [--hair 1] [--h2 3] [--skin 0] [--styles 0,1,2]
const fs=require('fs'),path=require('path'),cp=require('child_process');
const A=process.argv.slice(2),opt=k=>{const i=A.indexOf('--'+k);return i<0?null:A[i+1]};
// o jogo está dividido em assets/app-*.js (na ordem do index.html): junta tudo num texto só
const src=[...fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').matchAll(/\/assets\/(app-[\w-]+\.js)/g)].map(m=>fs.readFileSync(path.join(__dirname,'../assets',m[1]),'utf8')).join('\n');
const lines=src.split('\n');
const take=re=>lines.find(l=>l.startsWith(re));
const a=src.indexOf('// ---------- cabelo low-poly'),b=src.indexOf('function ears');
const hs=src.match(/const HS=\[([^\]]*)\]/)[1];
const decl=(()=>{const i=src.indexOf('const vivid='),j=src.indexOf('\n',src.indexOf('const SKIN=',i));return src.slice(i,j)})();
const styles=(opt('styles')||[...Array(24).keys()].join(',')).split(',').map(Number);
const html=`<!doctype html><meta charset=utf-8><style>body{margin:0;background:#3a9a3a;font:600 15px sans-serif}#c{display:block}.l{position:absolute;color:#fff;background:#1d2b2bcc;padding:4px 14px;border-radius:14px;transform:translateX(-50%)}</style>
<canvas id=c></canvas><script src="../vendor/three-r128.min.js"></script><script>
${decl}
const HS=[${hs}];
{const SH=THREE.Color.prototype.setHex;THREE.Color.prototype.setHex=function(h){SH.call(this,h);return this.convertSRGBToLinear()};const CT=THREE.CanvasTexture;THREE.CanvasTexture=function(...a){const t=new CT(...a);t.encoding=THREE.sRGBEncoding;return t};THREE.CanvasTexture.prototype=CT.prototype}
let TG=null;const tg=()=>{if(!TG){TG=new THREE.DataTexture(new Uint8Array([200,234,255]),3,1,THREE.LuminanceFormat);TG.minFilter=TG.magFilter=THREE.NearestFilter;TG.needsUpdate=true}return TG};
const EMI=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\\ntotalEmissiveRadiance+=diffuseColor.rgb*.3;')};
const LM=o=>new THREE.MeshToonMaterial(Object.assign({gradientMap:tg()},o));
${src.slice(a,b)}
const HTS=${opt('hats')?JSON.stringify(opt('hats').split(',').map(Number)):'null'},FCS=${opt('fcs')?JSON.stringify(opt('fcs').split(',').map(Number)):'null'},styles=${JSON.stringify(styles)},cfg={hair:${opt('hair')||1},h2:${opt('h2')||opt('hair')||1},skin:${opt('skin')||0},eye:${opt('eye')||1},fc:${opt('fc')||0}},ry=${opt('ry')||0};
const COLS=6,W=300,H=300,rows=Math.ceil(styles.length/COLS),cv=document.getElementById('c');cv.width=COLS*W;cv.height=rows*H;
const r=new THREE.WebGLRenderer({canvas:cv,antialias:true,preserveDrawingBuffer:true});r.outputEncoding=THREE.sRGBEncoding;r.setScissorTest(true);r.setClearColor(new THREE.Color(0x3a9a3a).convertLinearToSRGB());
const sc=new THREE.Scene();sc.add(new THREE.HemisphereLight(0xffffff,0x557755,.6));const dl=new THREE.DirectionalLight(0xffffff,.5);dl.position.set(2,4,3);sc.add(dl);
const cam=new THREE.PerspectiveCamera(30,1,.1,20);cam.position.set(0,.15,3.4);cam.lookAt(0,.05,0);
const SG=new THREE.SphereGeometry(1,24,16),ell=(rx,ry,rz,col,x,y,z,p)=>{const m=new THREE.Mesh(SG,new THREE.MeshPhongMaterial({color:col}));m.scale.set(rx,ry,rz);m.position.set(x,y,z);p.add(m)};
const M=c=>new THREE.MeshPhongMaterial({color:c});
const T0=performance.now();styles.forEach((s,i)=>{const cf=${opt('allskins')?'Object.assign({},cfg,{skin:i%SKIN.length})':'cfg'};const hd=new THREE.Group();const tH=performance.now(),hmat=headMat(Object.assign({hs:s},cf,FCS?{fc:FCS[i%FCS.length]}:{},HTS?{hat:HTS[i%HTS.length],hc:${opt('hc')||5}}:{}));window.TH=(window.TH||0)+performance.now()-tH;const tG=performance.now();const hm=new THREE.Mesh(SGH,hmat);hm.scale.set(.36,.38,.34);hd.add(hm);[-1,1].forEach(k=>ell(.07,.1,.045,SKIN[cf.skin],k*.36,0,0,hd));
 (HTS&&HTS[i%HTS.length]?hatNew:hairNew)(hd,Object.assign({hs:s},cf,FCS?{fc:FCS[i%FCS.length]}:{},HTS?{hat:HTS[i%HTS.length],hc:${opt('hc')||5}}:{}));window.TW=(window.TW||0)+performance.now()-tG;hd.rotation.y=ry;sc.add(hd);const x=(i%COLS)*W,y=(rows-1-Math.floor(i/COLS))*H;r.setViewport(x,y,W,H);r.setScissor(x,y,W,H);r.render(sc,cam);sc.remove(hd);
 const t=document.createElement('div');t.className='l';t.textContent=(s+1)+'. '+HS[s];t.style.left=(x+W/2)+'px';t.style.top=(Math.floor(i/COLS)*H+H-30)+'px';document.body.appendChild(t)});
document.title='head '+(window.TH/styles.length).toFixed(1)+' hair '+(window.TW/styles.length).toFixed(1)+' total '+((performance.now()-T0)/styles.length).toFixed(1);
</script>`;
const out=path.join(__dirname,'hair-gallery.html');fs.writeFileSync(out,html);
const shot=opt('shot');
if(shot){const n=styles.length,h=Math.ceil(n/6)*300;cp.execFileSync('google-chrome',['--headless=new','--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--hide-scrollbars','--allow-file-access-from-files','--window-size=1800,'+h,'--virtual-time-budget=4000','--screenshot='+path.resolve(shot),'file://'+out],{stdio:'inherit'})}
