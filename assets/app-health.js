/* Medicina lúdica: despensa compartilhada, cuidados entre amigos, animações e efeitos locais limitados. */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
(()=>{
const {MEDICINES,MEDICINE,ILLNESSES,MED_ROUTES}=SKYMED;
const H={st:null,stock:{},busy:false,rid:'',timer:0,ask:0,expanded:new Set(['tonico_solar'])};
const panel=$('#pHealth'),patient=$('#mdPatient'),fx=[];
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const open=()=>!panel.classList.contains('hide');
const note=t=>{$('#mdResult').textContent=t};
const qty=id=>H.stock[id]||0;
const actor=id=>id===me.id?me:actors.get(id);
const status=s=>s&&s.tired?(ILLNESSES[s.ill]?.ic||'😴')+' '+(ILLNESSES[s.ill]?.n||'Cansaço'):'💚 Bem-disposto';
const searchText=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function draw(){
 if(!open())return;
 const s=H.st;$('#mdStatus').textContent=status(s)+(s&&s.tired?' · Peça um remédio a um amigo':'');
 $('#mdStatus').classList.toggle('tired',!!(s&&s.tired));
 const prev=patient.value;patient.textContent='';const placeholder=make('option','','Escolha um amigo nesta sala');placeholder.value='';placeholder.disabled=true;patient.append(placeholder);
 for(const a of actors.values())if(a.id!==me.id&&!a.bot&&window.socIsFriend&&socIsFriend(a.fid)){const o=make('option','',a.name+' · '+status(a.health));o.value=a.id;patient.append(o)}
 patient.value=[...patient.options].some(o=>o.value===prev)?prev:'';if(patient.options.length===1)placeholder.textContent='Convide um amigo para esta sala';
 const a=actor(patient.value),near=a&&a!==me&&Math.hypot(a.g.position.x-me.g.position.x,a.g.position.z-me.g.position.z)<=2.7;
 $('#mdPatientStatus').textContent=a?status(a.health)+(a!==me&&!near?' · Aproxime-se para cuidar (até 3 m)':''):'';
 const list=$('#mdRecipes');list.textContent='';
 const q=searchText($('#mdSearch').value.trim()),kind=$('#mdKind').value;
 const recipes=MEDICINES.filter(r=>(!kind||r.kind===kind)&&(!q||searchText(r.n+' '+r.g.map(g=>SKYCAT.INGR[g].n).join(' ')).includes(q)));
 $('#mdCount').textContent=recipes.length+' de '+MEDICINES.length+' receitas · Abra uma para preparar';
 for(const r of recipes){const card=make('details','mdcard'),head=make('summary','mdcardhead'),title=make('b','',r.ic+' '+r.n),count=make('span','mdcount','×'+(s?.meds?.[r.id]||0));card.open=H.expanded.has(r.id);card.addEventListener('toggle',()=>{if(card.open)H.expanded.add(r.id);else H.expanded.delete(r.id)});head.append(title,count);card.append(head,make('small','mdroute',MED_ROUTES[r.kind].n+' · '+MED_ROUTES[r.kind].effect),make('small','',r.info));
  const ingredients=make('div','mdingredients');for(const g of r.g){const i=SKYCAT.INGR[g],p=make('span',qty(g)?'available':'missing',i.ic+' '+i.n+' '+qty(g)+'/1');p.title=qty(g)?'Na sua despensa':'Plante e colha na Fazenda';ingredients.append(p)}card.append(ingredients);
  const actions=make('div','pfact'),craft=make('button','pfb','Preparar'),use=make('button','pfb pri',MED_ROUTES[r.kind].action);craft.type=use.type='button';use.dataset.med=r.id;use.classList.add('md-use');craft.disabled=H.busy||(s?.meds?.[r.id]||0)>=99||r.g.some(g=>!qty(g));use.disabled=H.busy||!a||!a.health?.tired||!near||!(s?.meds?.[r.id]>0);craft.setAttribute('aria-label','Preparar '+r.n);use.setAttribute('aria-label',MED_ROUTES[r.kind].action+' · '+r.n);
  craft.onclick=()=>act('medcraft',r.id);use.onclick=()=>act('medheal',r.id,patient.value);actions.append(craft,use);card.append(actions);list.append(card)
 }
 if(!recipes.length)list.append(make('p','mdempty','Nenhuma receita encontrada. Tente outro nome ou ingrediente.'));
 $('#mdProgress').textContent='Medicina · Nível '+(s?.lv||1)+' · '+(s?.helped||0)+' cuidados com amigos';
}
function act(t,i,to){if(H.busy||mode!=='play')return;if(t==='medheal'&&(!to||to===me.id)){note(reasons.autocura);return}H.busy=true;H.rid='med'+crypto.getRandomValues(new Uint32Array(2)).join('').slice(0,18);note(t==='medcraft'?'Preparando…':'Cuidando…');draw();send({t,i,to,rid:H.rid});clearTimeout(H.timer);H.timer=setTimeout(()=>{H.busy=false;note('Sem resposta. Confira a conexão antes de tentar novamente.');draw()},6000)}
const reasons={autocura:'Você só pode receber cura de outro jogador. Peça ajuda a um amigo.',despensa:'Faltam ingredientes: plante e colha na Fazenda primeiro.',remedio:'Prepare esse remédio antes de usar.',saudavel:'Essa pessoa já está bem. Seu remédio foi preservado.',longe:'Chegue mais perto do amigo (até 3 m).',amigo:'Vocês precisam ser amigos para receber cuidados.',alvo:'Esse amigo precisa estar na mesma sala.',cheio:'Você já tem 99 unidades desse remédio.',receita:'Receita desconhecida.',full:'Não há espaço para novos registros agora.',descanso:'Descanse um pouco antes de preparar mais.'};
window.healthPantry=stock=>{H.stock={...(stock||{})};draw()};
window.healthBoot=()=>{clearTimeout(H.timer);H.st=null;H.stock={};H.busy=false;H.rid='';note('');send({t:'healthget'})};
window.healthFriend=fid=>{const a=[...actors.values()].find(a=>window.socFriendId&&socFriendId(a.fid)===fid);panel.classList.remove('hide');draw();if(a){patient.value=a.id;draw()}else note('Convide seu amigo para a mesma sala e aproxime-se para cuidar dele.')};
patient.onchange=draw;
$('#mdSearch').oninput=draw;$('#mdKind').onchange=draw;
for(const [id,r]of Object.entries(MED_ROUTES)){const o=make('option','',r.n);o.value=id;$('#mdKind').append(o)}
$('#bHealth').onclick=()=>tog('pHealth');
let refreshTimer=0;
function refreshStatus(){if(!open())return;const a=actor(patient.value),near=a&&a!==me&&Math.hypot(a.g.position.x-me.g.position.x,a.g.position.z-me.g.position.z)<=2.7;
 $('#mdStatus').textContent=status(H.st)+(H.st?.tired?' · Peça um remédio a um amigo':'');
 $('#mdPatientStatus').textContent=a?status(a.health)+(a!==me&&!near?' · Aproxime-se para cuidar (até 3 m)':''):'';
 for(const b of panel.querySelectorAll('.md-use'))b.disabled=H.busy||!a||!a.health?.tired||!near||!(H.st?.meds?.[b.dataset.med]>0);
}
new MutationObserver(()=>{clearInterval(refreshTimer);if(open()){if(mode==='play'){H.ask=Date.now();send({t:'healthget'});send({t:'farmget'})}draw();refreshTimer=setInterval(refreshStatus,1000)}}).observe(panel,{attributes:true,attributeFilter:['class']});
window.healthMsg=m=>{
 if(m.t==='health'){H.st=m;me.health=m;draw();return}
 if(m.t==='healthstate'){const a=actor(m.id);if(a){a.health={ill:m.ill,tired:m.tired};a._lk=''}draw();return}
 if(m.t==='medr'){if(m.rid!==H.rid)return;H.busy=false;clearTimeout(H.timer);if(m.state){H.st=m.state;me.health=m.state}
  note(m.ok?(m.k==='craft'?'✔ '+MEDICINE[m.i].n+' pronto. Escolha quem vai receber o cuidado.':'💚 Cuidado concluído!'):reasons[m.reason]||'Aguarde um instante e tente novamente.');
  if(m.ok&&m.k==='craft'){const r=MEDICINE[m.i];medSound(r.id,'craft',.8);me.medPose={at:performance.now(),kind:'prepare',route:r.kind};aura(me,r,true);lifeShow(r.ic,me.g.position.x,2.5,me.g.position.z,{dur:2,s:.8})}else if(!m.ok)fb($('#mdResult'),0);draw();return}
 if(m.t==='medfx'){const a=actor(m.to),healer=actor(m.id),r=MEDICINE[m.i];if(!a||!r||mode!=='play')return;
  a.health={ill:'',tired:false};a._lk='';const injection=r.kind==='injection';a.medPose={at:performance.now(),kind:injection?'ouch':r.kind,route:r.kind};if(healer&&healer!==a)healer.medPose={at:performance.now(),kind:'care',route:r.kind};
  aura(a,r);lifeShow(injection?'Ai!':r.ic,a.g.position.x,2.6,a.g.position.z,{dur:injection?1.2:2.4,s:injection?.65:1});
  const vol=dvol(a);if(vol>.03&&!muted(m.to)&&!muted(m.id))medSound(r.id,'heal',vol);
  if(a===me&&healer&&healer!==me)say('','💚 '+healer.name+' cuidou de você. Energia renovada!',1);draw()
 }
};
// Uma geometria de pontos e poucos objetos simples por efeito, inclusive em placas antigas.
function prop(r){
 const group=new THREE.Group(),body=new THREE.MeshBasicMaterial({color:0xe5f7ff}),tint=new THREE.MeshBasicMaterial({color:r.color}),accent=new THREE.MeshBasicMaterial({color:r.accent});
 const part=(geometry,material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);group.add(m);return m};
 const cylinder=(radius,height,material,y=0)=>part(new THREE.CylinderGeometry(radius,radius,height,8),material,0,y);
 if(r.kind==='injection'){cylinder(.065,.3,body);cylinder(.09,.035,tint,.17);cylinder(.025,.12,accent,.24);cylinder(.009,.2,accent,-.25);group.rotation.z=-Math.PI/3}
 else if(r.kind==='balm'){cylinder(.13,.14,tint);cylinder(.14,.035,accent,.09)}
 else if(r.kind==='tablet'){const capsule=part(new THREE.SphereGeometry(.1,8,6),tint);capsule.scale.y=1.8;cylinder(.1,.05,body)}
 else{cylinder(.1,.24,tint);cylinder(.045,.1,body,.16);if(r.kind==='mist'){part(new THREE.BoxGeometry(.16,.05,.07),accent,.045,.23);part(new THREE.BoxGeometry(.035,.1,.035),accent,.06,.16)}else if(r.kind==='ritual'){const ring=part(new THREE.TorusGeometry(.19,.018,4,16),accent);ring.rotation.x=Math.PI/2}else cylinder(.05,.025,accent,.23)}
 return group;
}
function aura(a,r,craft=false){
 const count=rm?6:30,pos=new Float32Array(count*3),seeds=Array.from({length:count},(_,i)=>({angle:i/count*Math.PI*2,y:(i%10)/10*1.6}));
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(pos,3));
 const material=new THREE.PointsMaterial({color:r.color,size:rm?.065:r.kind==='mist'?.16:.1,transparent:true,opacity:.9,depthWrite:false}),p=new THREE.Points(geometry,material),object=prop(r);scene.add(p,object);
 const e={a,r,p,geometry,material,seeds,time:0,object,craft,duration:craft?1.6:2.8};
 fx.push(e);if(fx.length>8)dispose(fx.shift());
}
function dispose(e){scene.remove(e.p,e.object);e.geometry.dispose();e.material.dispose();const materials=new Set();e.object.traverse(m=>{if(m.geometry)m.geometry.dispose();if(m.material)materials.add(m.material)});materials.forEach(m=>m.dispose())}
window.healthTick=dt=>{for(let i=fx.length-1;i>=0;i--){const e=fx[i];e.time+=dt;if(e.time>e.duration||mode!=='play'){dispose(e);fx.splice(i,1);continue}
 const attr=e.geometry.attributes.position,t=rm?0:e.time,kind=e.craft?'ritual':e.r.kind;
 e.p.position.copy(e.a.g.position);e.object.position.copy(e.a.g.position);e.object.position.x+=.43;e.object.position.y+=1.3;e.object.position.z+=.15;
 e.object.visible=e.time<(e.craft?1.4:1.1);if(!rm){if(kind==='injection')e.object.position.x+=Math.min(.1,t*.2);else if(kind==='drink')e.object.rotation.z=-Math.sin(Math.min(1,t)*Math.PI)*.7;else if(kind==='balm')e.object.position.x+=Math.sin(t*9)*.06;else if(kind==='ritual')e.object.rotation.y=t*2}
 for(let j=0;j<e.seeds.length;j++){const s=e.seeds[j];let angle=s.angle,radius=.5,y=s.y+t*.4;
  if(kind==='drink'){angle+=t*2;radius=.3+t*.15;y=(s.y+t*.8)%2.2}
  else if(kind==='balm'){angle-=t;radius=.55+Math.sin(t*3+s.angle)*.12;y=s.y+t*.25}
  else if(kind==='injection'){angle+=t*3+s.y*3;radius=.38+t*.1;y=s.y+t*.35}
  else if(kind==='mist'){radius=.25+t*.45;y=.9+Math.sin(s.angle)*.5+t*.15}
  else if(kind==='tablet'){radius=.2+t*.7;y=1.3+Math.sin(s.angle*2)*(.2+t*.3)}
  else if(kind==='ritual'){angle+=t*(j%2?1:-1);radius=.45+(j%3)*.2+t*.08;y=.12+(j%3)*.55}
  attr.setXYZ(j,Math.cos(angle)*radius,y,Math.sin(angle)*radius)
 }
 attr.needsUpdate=true;e.material.opacity=.9*(1-e.time/e.duration)
}};
window.healthPose=(a,t)=>{const u=a.g.userData,f=u.fig;if(!f)return;
 if(a.health?.tired&&!a.gest){u.hd.rotation.x+=.16;u.armL.rotation.x+=.08;u.armR.rotation.x+=.08}
 const p=a.medPose;if(!p)return;const age=(performance.now()-p.at)/1000;if(age>1.5){a.medPose=null;return}const k=Math.sin(Math.PI*Math.min(1,age/1.5)),motion=rm?0:1;
 if(p.kind==='ouch'){u.mo.scale.y=1+k*1.8;u.hd.rotation.x-=k*.25;if(!rm){f.rotation.z+=Math.sin(age*24)*.08*k;u.armL.rotation.z-=k*.5;u.armR.rotation.z+=k*.5}}
 else if(p.kind==='prepare'){u.armL.rotation.x-=k*.8;u.armR.rotation.x-=k*.9;u.armR.rotation.z+=Math.sin(age*10)*.12*k*motion}
 else if(p.kind==='care'){u.armR.rotation.x-=k*1.4;if(p.route==='balm')u.armR.rotation.z+=Math.sin(age*9)*.15*k*motion;if(p.route==='ritual')u.armL.rotation.x-=k*1.3}
 else if(p.kind==='drink'||p.kind==='tablet'){u.armR.rotation.x-=k*1.7;u.hd.rotation.x-=k*.22;u.mo.scale.y=1+k*.45}
 else if(p.kind==='mist'){u.hd.rotation.x-=k*.14;u.armL.rotation.z-=k*.18;u.armR.rotation.z+=k*.18}
 else if(p.kind==='ritual'){u.armL.rotation.z-=k*.45;u.armR.rotation.z+=k*.45;u.hd.rotation.x-=k*.2}
 else{u.hd.rotation.x-=k*.15;f.rotation.z+=Math.sin(age*5)*.025*k*motion}
};
})();
