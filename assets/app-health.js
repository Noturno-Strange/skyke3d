/* Medicina lúdica: despensa compartilhada, cuidados entre amigos, animações e efeitos locais limitados. */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
(()=>{
const {MEDICINES,MEDICINE,ILLNESSES}=SKYMED;
const H={st:null,stock:{},busy:false,rid:'',timer:0,ask:0};
const panel=$('#pHealth'),patient=$('#mdPatient'),fx=[];
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const open=()=>!panel.classList.contains('hide');
const note=t=>{$('#mdResult').textContent=t};
const qty=id=>H.stock[id]||0;
const actor=id=>id===me.id?me:actors.get(id);
const status=s=>s&&s.tired?(ILLNESSES[s.ill]?.ic||'😴')+' '+(ILLNESSES[s.ill]?.n||'Cansaço'):'💚 Bem-disposto';
function draw(){
 if(!open())return;
 const s=H.st;$('#mdStatus').textContent=status(s)+(s&&s.tired?' · Descanso: '+Math.max(1,Math.ceil((s.until-Date.now())/60000))+' min':'');
 $('#mdStatus').classList.toggle('tired',!!(s&&s.tired));
 const prev=patient.value;patient.textContent='';const self=make('option','','Você');self.value=me.id||'';patient.append(self);
 for(const a of actors.values())if(!a.bot&&window.socIsFriend&&socIsFriend(a.fid)){const o=make('option','',a.name+' · '+status(a.health));o.value=a.id;patient.append(o)}
 if([...patient.options].some(o=>o.value===prev))patient.value=prev;
 const a=actor(patient.value),near=a&&Math.hypot(a.g.position.x-me.g.position.x,a.g.position.z-me.g.position.z)<=2.7;
 $('#mdPatientStatus').textContent=a?status(a.health)+(a!==me&&!near?' · Aproxime-se para cuidar (até 3 m)':''):'';
 const list=$('#mdRecipes');list.textContent='';
 for(const r of MEDICINES){const card=make('article','mdcard'),head=make('div','mdcardhead'),title=make('b','',r.ic+' '+r.n),count=make('span','mdcount','×'+(s?.meds?.[r.id]||0));head.append(title,count);card.append(head,make('small','',r.info));
  const ingredients=make('div','mdingredients');for(const g of r.g){const i=SKYCAT.INGR[g],p=make('span',qty(g)?'available':'missing',i.ic+' '+i.n+' '+qty(g)+'/1');p.title=qty(g)?'Na sua despensa':'Plante e colha na Fazenda';ingredients.append(p)}card.append(ingredients);
  const actions=make('div','pfact'),craft=make('button','pfb','Preparar'),use=make('button','pfb pri',a===me?'Usar em mim':'Cuidar do amigo');craft.type=use.type='button';use.dataset.med=r.id;use.classList.add('md-use');craft.disabled=H.busy||r.g.some(g=>!qty(g));use.disabled=H.busy||!a||!a.health?.tired||!near||!(s?.meds?.[r.id]>0);
  craft.onclick=()=>act('medcraft',r.id);use.onclick=()=>act('medheal',r.id,patient.value);actions.append(craft,use);card.append(actions);list.append(card)
 }
 $('#mdProgress').textContent='Medicina · Nível '+(s?.lv||1)+' · '+(s?.helped||0)+' cuidados com amigos';
}
function act(t,i,to){if(H.busy||mode!=='play')return;H.busy=true;H.rid='med'+crypto.getRandomValues(new Uint32Array(2)).join('').slice(0,18);note(t==='medcraft'?'Preparando…':'Cuidando…');draw();send({t,i,to,rid:H.rid});clearTimeout(H.timer);H.timer=setTimeout(()=>{H.busy=false;note('Sem resposta. Confira a conexão antes de tentar novamente.');draw()},6000)}
const reasons={despensa:'Faltam ingredientes: plante e colha na Fazenda primeiro.',remedio:'Prepare esse remédio antes de usar.',saudavel:'Essa pessoa já está bem. Seu remédio foi preservado.',longe:'Chegue mais perto do amigo (até 3 m).',amigo:'Vocês precisam ser amigos para receber cuidados.',alvo:'Esse amigo precisa estar na mesma sala.',cheio:'Você já tem 99 unidades desse remédio.',receita:'Receita desconhecida.',full:'Não há espaço para novos registros agora.',descanso:'Descanse um pouco antes de preparar mais.'};
window.healthPantry=stock=>{H.stock={...(stock||{})};draw()};
window.healthBoot=()=>{H.st=null;H.stock={};H.busy=false;send({t:'healthget'})};
window.healthFriend=fid=>{const a=[...actors.values()].find(a=>window.socFriendId&&socFriendId(a.fid)===fid);panel.classList.remove('hide');draw();if(a){patient.value=a.id;draw()}else note('Convide seu amigo para a mesma sala e aproxime-se para cuidar dele.')};
patient.onchange=draw;
$('#bHealth').onclick=()=>tog('pHealth');
let refreshTimer=0;
function refreshStatus(){if(!open())return;const a=actor(patient.value),near=a&&Math.hypot(a.g.position.x-me.g.position.x,a.g.position.z-me.g.position.z)<=2.7;
 $('#mdStatus').textContent=status(H.st)+(H.st?.tired?' · Descanso: '+Math.max(1,Math.ceil((H.st.until-Date.now())/60000))+' min':'');
 $('#mdPatientStatus').textContent=a?status(a.health)+(a!==me&&!near?' · Aproxime-se para cuidar (até 3 m)':''):'';
 for(const b of panel.querySelectorAll('.md-use'))b.disabled=H.busy||!a||!a.health?.tired||!near||!(H.st?.meds?.[b.dataset.med]>0);
}
new MutationObserver(()=>{clearInterval(refreshTimer);if(open()){if(mode==='play'){H.ask=Date.now();send({t:'healthget'});send({t:'farmget'})}draw();refreshTimer=setInterval(refreshStatus,1000)}}).observe(panel,{attributes:true,attributeFilter:['class']});
window.healthMsg=m=>{
 if(m.t==='health'){H.st=m;me.health=m;draw();return}
 if(m.t==='healthstate'){const a=actor(m.id);if(a){a.health={ill:m.ill,tired:m.tired,until:m.until};a._lk=''}draw();return}
 if(m.t==='medr'){if(m.rid!==H.rid)return;H.busy=false;clearTimeout(H.timer);if(m.state){H.st=m.state;me.health=m.state}
  note(m.ok?(m.k==='craft'?'✔ '+MEDICINE[m.i].n+' pronto. Escolha quem vai receber o cuidado.':'💚 Cuidado concluído!'):reasons[m.reason]||'Aguarde um instante e tente novamente.');
  if(m.ok&&m.k==='craft'){sfx('cook_done',.7);lifeShow(MEDICINE[m.i].ic,me.g.position.x,2.5,me.g.position.z,{dur:2,s:.8})}else if(!m.ok)fb($('#mdResult'),0);draw();return}
 if(m.t==='medfx'){const a=actor(m.to),healer=actor(m.id),r=MEDICINE[m.i];if(!a||!r||mode!=='play')return;
  a.health={ill:'',tired:false,until:0};a._lk='';const injection=r.kind==='injection';a.medPose={at:performance.now(),kind:injection?'ouch':'relief'};if(healer&&healer!==a)healer.medPose={at:performance.now(),kind:'care'};
  aura(a,injection);lifeShow(injection?'Ai!':'💚',a.g.position.x,2.6,a.g.position.z,{dur:injection?1.2:2.4,s:injection?.65:1});
  const vol=dvol(a);if(vol>.03&&!muted(m.to)&&!muted(m.id))sfx(injection?'med_ouch':'med_heal',vol);if(injection)setTimeout(()=>{if(mode==='play'&&vol>.03&&!muted(m.to)&&!muted(m.id))sfx('med_heal',vol*.8)},450);
  if(a===me)say('','💚 '+(healer&&healer!==me?healer.name+' cuidou de você.':'Você se cuidou.')+' Energia renovada!',1);draw()
 }
};
function aura(a,injection){
 const points=rm?6:28,pos=new Float32Array(points*3),seeds=[];
 for(let i=0;i<points;i++){const angle=i/points*Math.PI*2;seeds.push({angle,y:Math.random()*1.6});pos[i*3]=Math.cos(angle)*.45;pos[i*3+1]=seeds[i].y;pos[i*3+2]=Math.sin(angle)*.45}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(pos,3));const material=new THREE.PointsMaterial({color:0x73ffd1,size:rm?.06:.1,transparent:true,opacity:.9,depthWrite:false}),p=new THREE.Points(geometry,material);p.position.copy(a.g.position);scene.add(p);
 const e={p,geometry,material,seeds,time:0,syringe:null};
 if(injection){const syringe=new THREE.Group(),white=new THREE.MeshBasicMaterial({color:0xe5f7ff}),blue=new THREE.MeshBasicMaterial({color:0x6dcfff}),silver=new THREE.MeshBasicMaterial({color:0xc4d3e1});
  for(const [radius,height,y,mat]of [[.065,.3,0,white],[.09,.035,.17,blue],[.025,.12,.24,blue],[.009,.2,-.25,silver]]){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,8),mat);mesh.position.y=y;syringe.add(mesh)}
  syringe.position.set(a.g.position.x+.42,a.g.position.y+1.2,a.g.position.z+.2);syringe.rotation.z=-Math.PI/3;scene.add(syringe);e.syringe=syringe}
 fx.push(e);if(fx.length>8)dispose(fx.shift());
}
function dispose(e){scene.remove(e.p);e.geometry.dispose();e.material.dispose();if(e.syringe){scene.remove(e.syringe);const materials=new Set();e.syringe.traverse(m=>{if(m.geometry)m.geometry.dispose();if(m.material)materials.add(m.material)});materials.forEach(m=>m.dispose())}}
window.healthTick=dt=>{for(let i=fx.length-1;i>=0;i--){const e=fx[i];e.time+=dt;if(e.time>2.4||mode!=='play'){dispose(e);fx.splice(i,1);continue}const attr=e.geometry.attributes.position;for(let j=0;j<e.seeds.length;j++){const s=e.seeds[j],radius=.45+(rm?0:e.time*.18);attr.setXYZ(j,Math.cos(s.angle)*radius,s.y+(rm?0:e.time*.5),Math.sin(s.angle)*radius)}attr.needsUpdate=true;e.material.opacity=.9*(1-e.time/2.4);if(e.syringe){e.syringe.visible=e.time<.8;e.syringe.position.x+=dt*.12}}};
window.healthPose=(a,t)=>{const u=a.g.userData,f=u.fig;if(!f)return;
 if(a.health?.tired&&!a.gest){u.hd.rotation.x+=.16;u.armL.rotation.x+=.08;u.armR.rotation.x+=.08}
 const p=a.medPose;if(!p)return;const age=(performance.now()-p.at)/1000;if(age>1.2){a.medPose=null;return}const k=Math.sin(Math.PI*Math.min(1,age/1.2));
 if(p.kind==='ouch'){u.mo.scale.y=1+k*1.8;u.hd.rotation.x-=k*.25;if(!rm){f.rotation.z+=Math.sin(age*24)*.08*k;u.armL.rotation.z-=k*.5;u.armR.rotation.z+=k*.5}}
 else if(p.kind==='care')u.armR.rotation.x-=k*1.4;
 else{u.hd.rotation.x-=k*.15;u.armR.rotation.z+=k*.2}
};
})();
