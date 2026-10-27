
/* Página inicial: cinematic procedural (sem arquivos externos) + botões Jogar/Discord/GitHub */
(function(){
const root=document.getElementById('intro'),cv=document.getElementById('iCv'),cap=document.getElementById('iCap'),btn=document.getElementById('iPlay'),ctx=cv.getContext('2d');
const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches,L=24;
const CAPS=[[.8,4.6,'Dezesseis mundos. Um só universo.'],[5.8,9.6,'Converse por voz com quem estiver por perto.'],[10.6,14.4,'Cante no karaokê com os amigos.'],[15.4,19.2,'Assista a vídeos juntos na sala.'],[20.2,23.2,'Crie sua sala e chame a galera.']];
const PL=[['#ffe3a0','#7a5a22'],['#ffa166','#6b2e14'],['#c8e8ff','#3a5f9a'],['#ff7556','#5a1410'],['#86e8ac','#1e5a3a'],['#b4e866','#3a5a1a'],
 ['#ffb347','#6a3410'],['#b98cff','#2a1a5a'],['#9fe0ff','#2a4a8a'],['#f0b878','#7a4a1e'],['#ff7ac8','#5a1a4a'],['#ffc0d8','#8a3a5a'],['#f0f8ff','#5a7a9a'],['#ff6a3a','#3a0e08'],['#5ac8f0','#0e3a6a'],['#aab8d8','#1c2238']];
const rnd=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),win=(t,a,b,f)=>clamp(Math.min((t-a)/f,(b-t)/f),0,1);
const stars=Array.from({length:matchMedia('(pointer:coarse)').matches?150:260},()=>({x:rnd(-1,1),y:rnd(-1,1),z:rnd(.03,1)}));
let W=0,H=0,dpr=1,raf=0,t0=0,last=0,ci=-2;
function size(){dpr=Math.min(devicePixelRatio||1,1.5);W=innerWidth;H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}
function glow(x,y,r,c){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,c);g.addColorStop(1,'#0000');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)}
function draw(t,dt,still){
 ctx.fillStyle='#0d0a14';ctx.fillRect(0,0,W,H);
 const m=Math.max(W,H);
 glow(W*(.3+.05*Math.sin(t*.2)),H*.35,m*.6,'#5b2a8a40');glow(W*(.72+.05*Math.cos(t*.17)),H*.65,m*.55,'#1f5a9a38');
 const sp=still?0:.06+.55*Math.exp(-t/2.2)+.12*win(t,L-3,L+1,2);
 const cx=W/2,cy=H/2,f=m*.55;
 ctx.lineCap='round';
 for(const s of stars){
  const pz=s.z+sp*.035;s.z-=sp*dt;
  if(s.z<=.02){s.x=rnd(-1,1);s.y=rnd(-1,1);s.z=1;continue}
  const x=cx+s.x/s.z*f*.5,y=cy+s.y/s.z*f*.5;
  if(x<-20||x>W+20||y<-20||y>H+20){s.x=rnd(-1,1);s.y=rnd(-1,1);s.z=1;continue}
  const a=clamp(1.15-s.z,.15,1);ctx.strokeStyle='rgba(255,244,225,'+a.toFixed(2)+')';ctx.lineWidth=clamp(1.8-s.z*1.4,.6,1.8);
  const x2=cx+s.x/pz*f*.5,y2=cy+s.y/pz*f*.5;ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x,y);ctx.stroke();
 }
 const pa=.12+.88*win(t,2.5,L-1.5,3);
 const u=Math.min(W,H);
 PL.forEach((c,i)=>{
  const k=((t*.028+i/PL.length)%1+1)%1,x=W*1.15-k*W*1.3,y=H*(.5+.24*Math.sin(i*1.9+t*.25)),r=u*(.05+.028*(i%3)),al=pa*clamp(Math.min(k,1-k)*8,0,1);
  if(al<=.01)return;
  ctx.globalAlpha=al;glow(x,y,r*2.4,c[0]+'44');
  const g=ctx.createRadialGradient(x-r*.4,y-r*.4,r*.1,x,y,r);g.addColorStop(0,c[0]);g.addColorStop(1,c[1]);
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();
  if(i%2){ctx.strokeStyle=c[0]+'99';ctx.lineWidth=Math.max(2,r*.1);ctx.beginPath();ctx.ellipse(x,y,r*1.7,r*.38,-.35,0,7);ctx.stroke()}
  ctx.globalAlpha=1;
 });
 const fd=still?1:Math.min(1,t/1.2,(L-t)/1.2);if(fd<1){ctx.fillStyle='rgba(13,10,20,'+(1-fd)+')';ctx.fillRect(0,0,W,H)}
}
function caption(t){
 let i=-1;for(let k=0;k<CAPS.length;k++)if(t>=CAPS[k][0]&&t<CAPS[k][1]){i=k;break}
 if(i===ci)return;ci=i;
 if(i<0){cap.classList.remove('on');return}
 cap.textContent=CAPS[i][2];cap.classList.add('on');
}
function frame(now){
 if(!t0){t0=now;last=now}
 const dt=Math.min(.05,(now-last)/1000);last=now;
 const t=((now-t0)/1000)%L;draw(t,dt,false);caption(t);raf=requestAnimationFrame(frame)
}
function start(){if(raf||reduce)return;t0=0;raf=requestAnimationFrame(frame)}
function stop(){if(raf){cancelAnimationFrame(raf);raf=0}}
function play(){
 if(root.classList.contains('out'))return;
 root.classList.add('out');root.inert=true;stop();
 setTimeout(()=>{root.style.display='none'},500);
 const n=document.getElementById('name');if(n&&!matchMedia('(pointer:coarse)').matches)n.focus({preventScroll:true});
}
size();addEventListener('resize',()=>{size();if(reduce)draw(8,0,true)});
document.addEventListener('visibilitychange',()=>{if(root.classList.contains('out'))return;document.hidden?stop():start()});
btn.addEventListener('click',play);
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target===document.body&&!root.classList.contains('out'))play()});
if(reduce){draw(8,0,true);cap.textContent='Dezesseis mundos. Um só universo.';cap.classList.add('on')}else start();
btn.focus({preventScroll:true});
})();
