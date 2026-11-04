/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Painel do mascote. Script comum, no mesmo escopo global dos outros app-*.js (usa $, send, say, tog e mode).
 * O servidor decide tudo (seed, genes, hora, necessidades, esperas): aqui só se pede uma ação pelo nome e se mostra o resultado.
 * Economia: nada de timer por mascote. O painel pede o estado ao entrar na sala, ao abrir (se passou 1 min) e a cada 15 min
 * conectado; a animação só roda com o painel aberto e a aba visível, e o ponto de atenção do botão vem do último estado recebido.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
{
const PET={pet:null,at:0,anim:null,genes:'',cd:{},busy:false,tm:0,askAt:0,relOk:0};
const ACT=[['feed','🍎','Alimentar','Dar comida'],['play','🎾','Brincar','Brincar com ele'],['rest','😴','Descansar','Colocar para descansar'],['clean','🛁','Limpar','Dar um banho'],['pet','🤗','Carinho','Fazer carinho'],['special','⭐','Aventura','Uma atividade especial (a cada 4 horas)']];
const NEED=[['food','🍖','Fome','Quanto mais cheia a barra, mais saciado ele está'],['energy','⚡','Energia','Energia para brincar'],['joy','😊','Felicidade','Como ele está se sentindo'],['clean','🫧','Higiene','Limpeza'],['health','💚','Saúde','Saúde geral'],['fun','🎈','Diversão','Vontade de brincar']];
const COS=['Nenhum','Laço','Cachecol','Coroa estelar','Óculos redondos'];
const FLASH={feed:'eat',play:'play',rest:'sleep',clean:'happy',pet:'happy',special:'play'};
const WHY={cooldown:'Ele ainda está se recuperando.',full:'Ele já está de barriga cheia.',tired:'Está cansado demais para isso.',rested:'Ele já descansou bastante.',clean:'Já está limpinho.',rid:'Tente de novo.',action:'Essa ação não existe.',none:'Você ainda não tem um mascote.'};
const ADOPT_ERR={exists:'Você já tem um mascote.',name:'Use um nome simples, sem links.',full:'Não há vaga para novos mascotes agora.',busy:'Não foi possível agora. Tente de novo.',invalid:'Não foi possível adotar agora.'};
const el=s=>$(s);
const mins=ms=>ms>=3600000?Math.ceil(ms/3600000)+' h':Math.max(1,Math.ceil(ms/60000))+' min';
const rid=()=>{const a=new Uint8Array(9);crypto.getRandomValues(a);return[...a].map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,16)};
const msg=t=>{el('#petMsg').textContent=t||''};
const open=()=>!el('#pPet').classList.contains('hide');

function ask(force){if(mode!=='play')return;const n=Date.now();if(!force&&n-PET.askAt<60000)return;PET.askAt=n;send({t:'petget'})}
window.petBoot=()=>{ask(true);if(!PET.tm)PET.tm=setInterval(()=>{if(mode==='play')ask(true)},900000)};

function bondHearts(b){const f=Math.min(5,Math.floor(b/20)),s=el('#petBond');s.textContent='';for(let i=0;i<5;i++){const h=document.createElement('i');h.className=i<f?'on':'';h.textContent='♥';s.append(h)}s.setAttribute('aria-label','Vínculo: '+f+' de 5');s.title='Vínculo '+Math.round(b)+'/100'}

function draw(){
 const p=PET.pet;if(!p)return;
 el('#petNm').textContent=p.name;
 el('#petSub').textContent=p.stageName+' · '+p.age+(p.age===1?' dia':' dias')+' · '+p.pers;
 el('#petMood').textContent=p.mood.text;
 el('#petRar').textContent=p.rarity+(p.special!=='Nenhuma'?' · '+p.special:'');
 el('#petRar').className='rar r'+['Comum','Incomum','Rara','Extremamente rara'].indexOf(p.rarity);
 bondHearts(p.a.bond);
 const nd=el('#petNeeds');nd.textContent='';
 NEED.forEach(([k,ic,n,tip])=>{const v=p.a[k],d=document.createElement('div');d.className='nd'+(v<25?' low':'');d.setAttribute('role','listitem');d.title=n+': '+v+'%. '+tip;
  const i=document.createElement('span');i.className='pni';i.textContent=ic;i.setAttribute('aria-hidden','true');
  const bar=document.createElement('i'),fill=document.createElement('b');fill.style.width=v+'%';bar.append(fill);bar.setAttribute('role','progressbar');bar.setAttribute('aria-label',n);bar.setAttribute('aria-valuenow',v);bar.setAttribute('aria-valuemin',0);bar.setAttribute('aria-valuemax',100);
  d.append(i,bar);nd.append(d)});
 const ac=el('#petActs');ac.textContent='';
 ACT.forEach(([a,ic,n,tip])=>{const b=document.createElement('button');b.type='button';b.dataset.a=a;b.title=tip;b.setAttribute('aria-label',tip);b.className='pfb';
  const t=document.createElement('span');t.textContent=ic+' '+n;const w=document.createElement('small');w.className='cdw';b.append(t,w);b.onclick=()=>doAct(a);ac.append(b)});
 const cs=el('#petCos');cs.textContent='';p.cosOk.forEach(i=>{const o=document.createElement('option');o.value=i;o.textContent=COS[i];cs.append(o)});cs.value=p.cos;
 const st=el('#petStats'),S=p.stats;const pl=(n,u,m)=>n+' '+(n===1?u:m);st.textContent=[pl(S.total,'cuidado','cuidados'),pl(S.feed,'refeição','refeições'),pl(S.play,'brincadeira','brincadeiras'),pl(S.clean,'banho','banhos'),pl(S.rest,'descanso','descansos')].join(' · ');
 const al=el('#petAch');al.textContent='';p.ach.sort((a,b)=>a.t-b.t).forEach(a=>{const li=document.createElement('li');li.textContent='🏅 '+a.n;al.append(li)});
 const hl=el('#petHist');hl.textContent='';const NM={adotado:'Adotado',feed:'Alimentado',play:'Brincou',rest:'Descansou',clean:'Banho',pet:'Carinho',special:'Aventura'};
 p.hist.slice().reverse().forEach(([k,t])=>{const li=document.createElement('li');li.textContent=(NM[k]||k)+' · '+new Date(t).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});hl.append(li)});
 // esperas: o servidor manda quanto falta; aqui só se conta
 const n=Date.now();PET.cd={};for(const k in p.cd)PET.cd[k]=n+p.cd[k];
 ticker();
}
function ticker(){clearTimeout(PET.ticks);const n=Date.now();let any=false;
 el('#petActs').querySelectorAll('button').forEach(b=>{const left=(PET.cd[b.dataset.a]||0)-n,w=b.querySelector('.cdw');const on=left>0;b.disabled=on||PET.busy;w.textContent=on?mins(left):'';if(on)any=true});
 if(any&&open())PET.ticks=setTimeout(ticker,any?1000:0)}

function look(){const p=PET.pet;if(!p)return;const key=JSON.stringify(p.genes);
 if(!PET.anim||PET.genes!==key){if(PET.anim)PET.anim.stop();PET.genes=key;PET.anim=PetArt.createAnimator(el('#petCv'),p.genes,{stage:p.stage,cos:p.cos,state:p.mood.state})}
 else{PET.anim.setLook({stage:p.stage,cos:p.cos});PET.anim.setState(p.mood.state)}
 sync()}
function sync(){if(!PET.anim)return;if(open()&&!document.hidden)PET.anim.start();else{PET.anim.stop()}}

function view(){const none=!PET.pet;el('#petNone').hidden=!none;el('#petHave').hidden=none;
 const b=el('#bPet');b.classList.toggle('att',!!(PET.pet&&PET.pet.attention));
 b.title=PET.pet?'Mascote · '+PET.pet.name+(PET.pet.attention?' (precisa de atenção)':''):'Mascote';b.setAttribute('aria-label',b.title);
 if(PET.pet){draw();look()}else if(PET.anim){PET.anim.stop()}}

function doAct(a){if(PET.busy||mode!=='play')return;PET.busy=true;msg('');ticker();send({t:'petact',a,rid:rid()});setTimeout(()=>{PET.busy=false;ticker()},2500)}

window.petMsg=m=>{
 if(m.t==='pet'){PET.at=Date.now();PET.busy=false;el('#petErr').textContent='';
  if(m.err){const w=m.err==='locked'?'Você soltou um mascote há pouco. Poderá adotar outro em '+Math.ceil(m.wait/86400000)+' dia(s).':(ADOPT_ERR[m.err]||ADOPT_ERR.invalid);el('#petAdoptMsg').textContent=w;return}
  PET.pet=m.pet;if(m.released){el('#petRelMsg').textContent='';say('','🐾 Você soltou seu mascote. Poderá adotar outro daqui a 30 dias.',1)}
  if(m.fresh)say('','🐾 '+PET.pet.name+' chegou! Cuide bem dele.',1);
  view();return}
 if(m.t==='petres'){PET.busy=false;
  if(m.pet){PET.pet=m.pet;}
  if(m.ok){const fl=FLASH[m.action];if(PET.anim&&fl&&!m.dup)PET.anim.flash(fl,m.action==='rest'?3000:2200);
   msg(m.fresh&&m.fresh.length?'🏅 Nova conquista!':(m.gain>0?'Ele gostou! O vínculo cresceu.':'Ele gostou!'));
   if(m.fresh&&m.fresh.length&&PET.pet){const names=PET.pet.ach.filter(a=>m.fresh.includes(a.id)).map(a=>a.n);if(names.length)msg('🏅 '+names.join(' · '))}}
  else if(m.reason){msg(m.reason==='cooldown'&&m.wait?'Espere '+mins(m.wait)+'.':(WHY[m.reason]||'Não foi possível agora.'))}
  if(PET.pet)view();return}
 if(m.t==='petsocial'){const n=VIS.get(m.to)||'esse jogador';VIS.delete(m.to);
  const T={wave:'👋 Você cumprimentou o mascote de ',hug:'🤗 Você fez carinho no mascote de ',gift:'🎁 Você deixou um presentinho para o mascote de '};
  if(m.ok)say('',(T[m.k]||T.wave)+n+'.',1);
  else say('',m.reason==='cooldown'?'Você já fez isso há pouco. Tente de novo mais tarde.':m.reason==='none'?'Esse jogador não tem mascote público.':m.reason==='busy'?'Esse mascote já recebeu muitas visitas hoje.':'Não foi possível agora.',1);return}
};

const VIS=new Map();
// visita simbólica: um pequeno menu com três gestos (não mexe em nada do mascote do outro)
window.petMenu=(pp,n,anchor)=>{document.querySelectorAll('.gmenu').forEach(x=>x.remove());const m=document.createElement('span');m.className='gmenu';
 [['wave','👋','Cumprimentar'],['hug','🤗','Fazer carinho'],['gift','🎁','Deixar um presente']].forEach(([k,ic,t])=>{const b=document.createElement('button');b.type='button';b.textContent=ic;b.title=t+' o mascote de '+n;b.setAttribute('aria-label',b.title);b.onclick=()=>{VIS.set(pp,String(n).slice(0,16));send({t:'petsocial',to:pp,k});m.remove()};m.append(b)});
 anchor.after(m);setTimeout(()=>m.remove(),6000)};

// ---------- ligações da interface ----------
if(el('#bPet')){
 el('#bPet').onclick=()=>{tog('pPet');if(open()){ask(false);look();ticker()}else sync()};
 new MutationObserver(()=>{if(open()){ask(false);sync();ticker()}else sync()}).observe(el('#pPet'),{attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',sync);
 el('#petName').oninput=e=>{e.target.value=e.target.value.replace(/[<>&"'`]/g,'').slice(0,16);el('#petNameN').textContent=e.target.value.length+'/16'};
 el('#petName').onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')el('#petAdopt').click()};
 el('#petAdopt').onclick=()=>{const n=el('#petName').value.trim();if(!n){el('#petAdoptMsg').textContent='Escolha um nome para o mascote.';return}if(mode!=='play'){el('#petAdoptMsg').textContent='Entre numa sala para adotar.';return}el('#petAdoptMsg').textContent='Procurando seu mascote…';send({t:'petadopt',name:n})};
 el('#petCos').onchange=e=>send({t:'petdress',c:parseInt(e.target.value,10)||0});
 el('#petRel').onclick=()=>{const b=el('#petRel'),n=Date.now();if(n-PET.relOk<4000){PET.relOk=0;send({t:'petrel',sure:true});return}PET.relOk=n;b.textContent='Tem certeza? Toque de novo para soltar';el('#petRelMsg').textContent='Ele vai embora para sempre e você só poderá adotar outro daqui a 30 dias.';setTimeout(()=>{b.textContent='Soltar mascote'},4000)};
 // sair da sala: o painel some e a animação para
 window.petReset=()=>{PET.pet=null;if(PET.anim)PET.anim.stop();el('#bPet').classList.remove('att')};
}
}
