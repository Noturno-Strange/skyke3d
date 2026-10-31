// Mede o balanceamento do modo Sobrevivência: joga rodadas inteiras com bots que cuidam da fogueira, coletam e comem, sem rede nem relógio.
// Uso: node tools/survsim.js            → usa os números atuais de SURV (assets/catalog.js)
//      node tools/survsim.js '[{"cd":.25,"cn":4,"fd":.35,"sd":.45,"fb":.6,"fn":2,"wr":90,"lr":150}]'   → testa combinações (cd/cn calor, fd fome, sd sede, fb/fn fogueira, wr água, lr lenha)
// Bots são mais eficientes que pessoas: use para achar o ponto em que até o jogo perfeito começa a perder, e deixe folga para os humanos.
const SV=require('../survival.js'),M=require('../assets/survmap.js'),{SURV:S}=require('../assets/catalog.js');
function play(seed,n,skill){
 const map=M.generate(seed),st=SV.create({seed,nodes:map.nodes});const ids=[];
 for(let i=0;i<n;i++){const id='p'+i;ids.push(id);SV.addPlayer(st,id);SV.setPos(st,id,0,5)}
 const CAP=+process.env.CAP||7200,dt=.5,walk=3.2;let t=0;const goal={};
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 while(!st.over&&t<CAP){
  t+=dt;
  for(const id of ids){const p=st.P.get(id);if(p.faint)continue;
   const F={x:S.fire.x,z:S.fire.z};
   // prioridade: acender/alimentar fogueira, comer/beber se baixo, coletar o mais útil, voltar
   let want=null;
   const low=Object.entries(p.m).sort((a,b)=>a[1]-b[1])[0];
   const eatable=['fruta','raiz','cogumelo','agua'].find(k=>p.inv[k]>0&&((k==='agua'&&p.m.sede<60)||(k!=='agua'&&p.m.fome<60)));
   if(eatable&&Math.random()<skill){SV.eat(st,id,eatable)}
   if(dist(p,F)<=S.cook.radius){
    if(st.fire<=0)SV.relight(st,id);
    else if(st.fire<55&&p.inv.lenha>0)SV.addFuel(st,id,'lenha');
    else if(st.fire<85&&p.inv.graveto>0)SV.addFuel(st,id,'graveto');
    if(st.pot&&st.pot.ready)SV.cookTake(st,id);
    if(p.inv.raiz_assada>0&&p.m.fome<65)SV.eat(st,id,'raiz_assada');
    else if(!st.pot&&p.inv.raiz>0&&p.m.fome<70)SV.cookStart(st,id,'raiz_assada');
   }
   // alvo: se nada na mochila de combustivel e fogueira baixa -> lenha; se sede baixa -> agua; fome -> comida; senão lenha
   const need=()=>{if(st.fire<60&&!(p.inv.lenha>0||p.inv.graveto>0))return['lenha','graveto'];if(p.m.sede<65&&!p.inv.agua)return['agua'];if(p.m.fome<65&&!(p.inv.fruta||p.inv.raiz||p.inv.cogumelo))return['raiz','fruta','cogumelo'];return null};
   const nd=need();let tgt=null;
   if(nd){let bd=1e9;st.nodes.forEach((nn,i)=>{if(st.t<nn.at||!nd.includes(nn.res))return;const d=dist(p,nn);if(d<bd){bd=d;tgt={i,x:nn.x,z:nn.z}}})}
   if(!tgt)tgt={x:F.x+1,z:F.z+1};
   const d=dist(p,tgt);if(d>1.4){const k=Math.min(walk*dt,d)/d;SV.setPos(st,id,p.x+(tgt.x-p.x)*k,p.z+(tgt.z-p.z)*k)}
   else if(tgt.i!=null)SV.collect(st,id,tgt.i);
  }
  SV.tick(st,dt);
 }
 return SV.summary(st);
}
const cfgs=JSON.parse(process.argv[2]||'[]');if(!cfgs.length)cfgs.push({rf:S.ramp.from,rt:S.ramp.to,tau:S.ramp.tau,cd:S.meters.calor.drain,cn:S.meters.calor.nightX,fd:S.meters.fome.drain,sd:S.meters.sede.drain,fb:S.fire.burn,fn:S.fire.nightX,wr:S.res.agua.respawn,lr:S.res.lenha.respawn});
function apply(c){if(c.rf!=null)S.ramp.from=c.rf;if(c.rt!=null)S.ramp.to=c.rt;if(c.tau!=null)S.ramp.tau=c.tau;S.meters.calor.drain=c.cd;S.meters.calor.nightX=c.cn;S.meters.fome.drain=c.fd;S.meters.sede.drain=c.sd;S.fire.burn=c.fb;S.fire.nightX=c.fn;S.res.agua.respawn=c.wr;S.res.lenha.respawn=c.lr}
for(const c of cfgs){apply(c);console.log(JSON.stringify(c));
for(const [n,skill] of [[1,1],[3,1],[5,1],[8,1],[3,.4]]){
 const T=[],causes={};const R=+process.env.RUNS||24;let faint=0;
 for(let i=0;i<R;i++){const s=play(100+i,n,skill);T.push(s.sec);faint+=s.faints;for(const[k,v] of Object.entries(s.causes))causes[k]=(causes[k]||0)+v}
 T.sort((a,b)=>a-b);const med=T[T.length>>1],p10=T[Math.floor(T.length*.1)],p90=T[Math.floor(T.length*.9)];
 console.log(`  jog=${n} hab=${skill}: tempo sobrevivido mediana ${(med/60).toFixed(1)} min (10%: ${(p10/60).toFixed(1)}, 90%: ${(p90/60).toFixed(1)}), desmaios/rodada ${(faint/R).toFixed(1)}`,JSON.stringify(causes))}}
