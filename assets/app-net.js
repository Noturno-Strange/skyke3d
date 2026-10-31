/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Tela inicial, editor, avatar salvo, chat e rede (mensagens do servidor), posições interpoladas, silenciar e denúncia.
 * Os arquivos assets/app-*.js são scripts comuns carregados em ordem pelo index.html e dividem o mesmo escopo global: o que um
 * declara no nível de cima, os seguintes enxergam. Código que roda ao carregar só pode usar o que já veio antes.
 */
if(window.SKY_NOGL)throw new Error('Skyke3D: sem WebGL');
// ---------- UI início ----------
const EDS=[{g:0,k:'fc',n:'Rosto',v:FACES},{g:0,k:'skin',n:'Pele',c:SKIN,b:'tb'},{g:0,k:'eye',n:'Olhos',c:EYE,b:'eb'},{g:1,k:'hs',n:'Cabelo',v:HS},{g:1,k:'hair',n:'Cor do cabelo',c:HAIRC,b:'rb'},{g:1,k:'hat',n:'Chapéu',v:HATS},{g:1,k:'hc',n:'Cor do chapéu',c:PAL,b:'hb'},{g:2,k:'shirt',n:'Camisa',c:PAL,b:'sb'},{g:2,k:'bt',n:'Calça',v:BT},{g:2,k:'pc',n:'Cor da calça',c:PAL,b:'pb'},{g:2,k:'shoes',n:'Calçado',v:SHOES},{g:2,k:'sc',n:'Cor do calçado',c:PAL,b:'cb'}];
// Cores brilhantes: uma só caixa para o avatar todo; liga ou desliga juntas as chaves de brilho de cada parte (BRK)
const BRV=Object.values(BRK),glossOn=()=>BRV.some(k=>cfg[k]===1),setGloss=on=>BRV.forEach(k=>cfg[k]=on?1:0);
// Linhas do editor: cada estilo fica na mesma linha da sua cor (e pele com olhos), para caber mais sem esconder nada
const EROWS=[{g:0,n:'Rosto',k:['fc']},{g:0,n:'Pele',k:['skin']},{g:0,n:'Olhos',k:['eye']},{g:1,n:'Cabelo',k:['hs','hair']},{g:1,n:'Chapéu',k:['hat','hc']},{g:2,n:'Camisa',k:['shirt']},{g:2,n:'Calça',k:['bt','pc']},{g:2,n:'Calçado',k:['shoes','sc']}];
const EG=['👤 Corpo','💇 Cabelo','👕 Roupas'],EUPD=[];// rótulos curtos: as três abas cabem numa linha com a mesma largura (o chapéu fica em Cabelo)
// Estilos andam com ◀ ▶; cada cor é um botão com a cor atual que abre a paleta inteira em grade logo abaixo da linha (uma por vez).
// A paleta fica aberta enquanto o jogador experimenta; fecha no mesmo botão, com Esc ou ao trocar de aba. Setas do teclado andam pela grade.
function mkEditor(tabsEl,edEl){let gi=0,open=null;
 tabsEl.innerHTML=EG.map((t,i)=>`<button data-eg="${i}">${t}</button>`).join('');
 const stp=d=>`<span class="estp"><button data-a="${d.k}" data-d="-1" aria-label="${d.n}: anterior">◀</button><span class="evv" data-v="${d.k}"></span><button data-a="${d.k}" data-d="1" aria-label="${d.n}: próximo">▶</button></span>`;
 const cpk=d=>`<button type="button" class="cpk" data-cp="${d.k}" aria-label="${d.n}: escolher" aria-expanded="false"><span class="sw" data-v="${d.k}"></span></button>`;
 const pop=d=>`<div class="cpop hide" data-pop="${d.k}" role="group" aria-label="${d.n}">${d.c.map((h,i)=>`<button type="button" class="sw" data-ci="${i}" style="background:${h}" aria-label="${d.n}: cor ${i+1}" aria-pressed="false" tabindex="-1"></button>`).join('')}</div>`;
 edEl.innerHTML=EROWS.map(r=>{const ds=r.k.map(k=>EDS.find(d=>d.k===k));return `<div class="ed" data-g="${r.g}"><span class="edl">${r.n}</span><span class="edctl">${ds.map(d=>d.c?cpk(d):stp(d)).join('')}</span>${ds.filter(d=>d.c).map(pop).join('')}</div>`}).join('')+'<label class="glo"><input type="checkbox" data-gl> ✨ Cores brilhantes</label>';
 const show=k=>{open=k;edEl.querySelectorAll('[data-pop]').forEach(p=>p.classList.toggle('hide',p.dataset.pop!==open));edEl.querySelectorAll('[data-cp]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.cp===open)))};
 const upd=()=>{const gl=glossOn();EDS.forEach(d=>{const x=cfg[d.k];if(d.c){const e=edEl.querySelector('.cpk [data-v="'+d.k+'"]'),bg=cfg[d.b]===1;e.style.background=d.c[x];e.classList.toggle('sw-gl',bg);
   edEl.querySelectorAll('[data-pop="'+d.k+'"] [data-ci]').forEach(b=>{const on=+b.dataset.ci===x;b.setAttribute('aria-pressed',String(on));b.tabIndex=on?0:-1;b.classList.toggle('sw-gl',bg)})}else edEl.querySelector('[data-v="'+d.k+'"]').textContent=d.v[x]});
  edEl.querySelector('[data-gl]').checked=gl;edEl.querySelectorAll('.ed').forEach(r=>r.classList.toggle('hide',+r.dataset.g!==gi));tabsEl.querySelectorAll('[data-eg]').forEach(b=>b.classList.toggle('sel',+b.dataset.eg===gi))};
 const apply=()=>{dress(me.g,cfg);sendCfg();mark();saveSoon()};
 tabsEl.onclick=e=>{const i=e.target.dataset.eg;if(i!==undefined){gi=+i;show(null);upd()}};
 edEl.onclick=e=>{const cp=e.target.closest('[data-cp]');if(cp){show(open===cp.dataset.cp?null:cp.dataset.cp);return}
  const ci=e.target.closest('[data-ci]');if(ci){cfg[ci.parentNode.dataset.pop]=+ci.dataset.ci;apply();return}
  const b=e.target.closest('[data-a]');if(!b)return;const d=EDS.find(x=>x.k===b.dataset.a),n=d.v.length;cfg[d.k]=(cfg[d.k]+ +b.dataset.d+n)%n;apply()};
 edEl.onchange=e=>{if(e.target.matches('[data-gl]')){setGloss(e.target.checked);apply()}};
 edEl.onkeydown=e=>{if(e.key==='Escape'&&open){const k=open;show(null);edEl.querySelector('[data-cp="'+k+'"]').focus();e.preventDefault();e.stopPropagation();return}
  const ci=e.target.closest('[data-ci]');if(!ci)return;const p=ci.parentNode,L=p.children,cols=getComputedStyle(p).gridTemplateColumns.split(' ').length||1,i=+ci.dataset.ci;
  const j={ArrowLeft:i-1,ArrowRight:i+1,ArrowUp:i-cols,ArrowDown:i+cols,Home:0,End:L.length-1}[e.key];if(j===undefined)return;e.preventDefault();e.stopPropagation();
  const t=L[Math.max(0,Math.min(L.length-1,j))];[...L].forEach(b=>b.tabIndex=b===t?0:-1);t.focus()};
 return upd}
const SK=Object.keys(ST).filter(k=>!ST[k].surv);
function stLabel(k){const i=Math.max(0,SK.indexOf(k));$('#stName').textContent=ST[SK[i]].n;$('#stIdx').textContent=(i+1)+' / '+SK.length}
function stepStyle(d){const i=Math.max(0,SK.indexOf(cfg.style)),k=SK[(i+d+SK.length)%SK.length];cfg.style=k;buildRoom(k);mark()}
function mark(){stLabel(cfg.style);EUPD.forEach(f=>f())}
EUPD.push(mkEditor($('#edtabs'),$('#ed')));
$('#stPrev').onclick=()=>stepStyle(-1);$('#stNext').onclick=()=>stepStyle(1);
$('#styles').onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();stepStyle(e.key==='ArrowLeft'?-1:1)}};
$('#rndBtn').onclick=()=>{const gl=glossOn();Object.assign(cfg,randomLook());setGloss(gl);dress(me.g,cfg);mark();saveSoon()};
// ---------- avatar e nome salvos neste navegador ----------
// Só no localStorage deste aparelho: nada vai ao servidor. O que se lê de lá é dado não confiável: tamanho, formato e faixa de cada campo são validados
// (e o servidor valida de novo ao entrar). Depois de "Esquecer", nada mais é gravado até recarregar a página.
const SAVE_KEY='skyke_avatar_v1';let saveTm=0,noSave=false;
const cleanName=s=>typeof s==='string'?s.replace(/[\u0000-\u001f\u007f-\u009f<>]/g,'').replace(/\s+/g,' ').trim().slice(0,LIMITS.name):'';
$('#name').maxLength=LIMITS.name;
function hasSaved(){try{return !!localStorage.getItem(SAVE_KEY)}catch(e){return false}}
function refreshForget(){const b=$('#forgetS');if(b)b.classList.toggle('hide',!hasSaved())}
function loadSaved(){try{const raw=localStorage.getItem(SAVE_KEY);if(!raw||raw.length>800)return;const j=JSON.parse(raw);if(!j||typeof j!=='object'||j.v!==1)return;
 const L=j.look;if(L&&typeof L==='object')EDS.forEach(d=>{const n=(d.c||d.v).length,x=L[d.k];if(Number.isInteger(x)&&x>=0&&x<n)cfg[d.k]=x});BRV.forEach(k=>{if(L[k]===0||L[k]===1)cfg[k]=L[k]});
 // visual salvo com o antigo "Cores brilhantes" (tudo brilhante): vira as versões brilhantes de cada cor
 if(L.br===1&&!BRV.some(k=>k in L))setGloss(true);setGloss(glossOn());cfg.br=0;
 const nm=cleanName(j.name);if(nm&&nm.toLowerCase()!=='visitante')$('#name').value=nm;dress(me.g,cfg)}catch(e){}}
function saveNow(){if(noSave)return;clearTimeout(saveTm);saveTm=0;try{localStorage.setItem(SAVE_KEY,JSON.stringify({v:1,name:cleanName($('#name').value),look:{...Object.fromEntries(EDS.map(d=>[d.k,cfg[d.k]])),...Object.fromEntries(BRV.map(k=>[k,cfg[k]===1?1:0]))}}))}catch(e){}refreshForget()}
function saveSoon(){if(noSave)return;clearTimeout(saveTm);saveTm=setTimeout(saveNow,400)}
// "Esquecer meus dados" limpa só ESTE aparelho (nome, visual e a chave do ranking): o lugar no ranking continua no servidor e volta com o código de recuperação
function forgetSaved(){noSave=true;clearTimeout(saveTm);try{localStorage.removeItem(SAVE_KEY)}catch(e){}if(typeof PST!=='undefined')PST.forgetLocal();refreshForget();document.querySelectorAll('.forgetSaved').forEach(b=>{b.dataset.t=b.dataset.t||b.textContent;b.textContent='Dados apagados ✓';b.disabled=true})}
// Ações sem volta pedem confirmação extra (Sim/Não) no próprio lugar do botão, sem janela nova. opts: html (aviso), yes (texto do botão), onYes, copy (oferece copiar o código antes)
function mkConfirm(b,o){
 const box=document.createElement('div');box.className='fgc hide';box.setAttribute('role','alertdialog');box.setAttribute('aria-label','Confirmar');
 box.innerHTML='<small></small>'+(o.copy?'<button type="button" class="fgcp">📋 Copiar meu código antes</button>':'')+'<div class="fgb"><button type="button" class="fgno">Não</button><button type="button" class="dng fgyes"></button></div>';
 box.querySelector('small').innerHTML=o.html;box.querySelector('.fgyes').textContent=o.yes||'Sim';
 b.after(box);
 const open=()=>{b.classList.add('hide');box.classList.remove('hide');box.querySelector('.fgno').focus()},close=()=>{box.classList.add('hide');b.classList.remove('hide');b.focus()};
 b.onclick=open;box.querySelector('.fgno').onclick=close;
 const cp=box.querySelector('.fgcp');if(cp)cp.onclick=async e=>{const t=e.target;let ok=false;try{await navigator.clipboard.writeText(recoveryCode());ok=true}catch(x){}t.textContent=ok?'✔ Copiado. Guarde com cuidado.':'Não deu para copiar. Abra o Perfil.'};
 box.querySelector('.fgyes').onclick=()=>{box.classList.add('hide');b.classList.remove('hide');o.onYes()};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!box.classList.contains('hide')){e.stopPropagation();close()}},true)}
document.querySelectorAll('.forgetSaved').forEach(b=>mkConfirm(b,{html:'<b>Apagar nome e visual deste aparelho?</b> Seu lugar no ranking continua. Para voltar, use o <b>código de recuperação</b> (copie antes).',yes:'Sim, apagar',copy:true,onYes:forgetSaved}));$('#name').addEventListener('change',saveSoon);
loadSaved();refreshForget();
mark();
// ---------- código de recuperação (assets/recovery.js) ----------
// O código só é montado com a caixa aberta (e refeito quando o visual ou o nome mudam); restaurar valida tudo como dado não confiável.
const REC_ERR={formato:'Código incompleto ou com erro.',conferencia:'O código não confere. Confira se copiou tudo.',versao:'Código de uma versão mais nova do jogo.',faixa:'Código não reconhecido por esta versão.'};
// O código recupera tudo: nome, visual e, se o jogador está no ranking, a página dele (o segredo vai dentro). Por isso é uma credencial: só é montado na hora,
// nunca sai do navegador (nem vai ao servidor ou a link) e fica oculto no Perfil.
function recoveryCode(){const o={name:cleanName($('#name').value),look:cfg,gloss:glossOn()};try{if(typeof PST!=='undefined'&&PST.on())o.secret=PST.secret()}catch(e){}return SKYREC.encode(o)}
function mkRec(box){box.innerHTML='<details class="rec"><summary>🔑 Recuperar conta</summary><small>Cole o código para voltar com nome, visual e ranking.</small>'
  +'<div class="recrow"><input class="recin" maxlength="300" placeholder="Cole o código" aria-label="Código de recuperação" autocomplete="off" autocapitalize="characters" spellcheck="false"><button type="button" data-rc="load">Restaurar</button></div>'
  +'<div class="recrow"><button type="button" data-rc="copy">📋 Copiar meu código</button></div><small class="recmsg" role="status" aria-live="polite"></small></details>';
 const det=box.firstChild,inp=box.querySelector('.recin'),msg=box.querySelector('.recmsg');
 det.addEventListener('toggle',()=>{msg.textContent=''});
 const load=async()=>{const r=SKYREC.decode(inp.value);if(!r.ok){msg.textContent='⚠ '+REC_ERR[r.err];return}
  SKYREC.FIELDS.forEach(k=>cfg[k]=r.look[k]);setGloss(r.gloss===1);const nm=cleanName(r.name);if(nm&&nm.toLowerCase()!=='visitante')$('#name').value=nm;
  dress(me.g,cfg);sendCfg();mark();saveNow();inp.value='';
  let t=mode==='play'&&nm?'✔ Visual restaurado. O nome vale na próxima entrada.':'✔ Nome e visual restaurados.';
  if(r.secret){const st=await PST.adopt(r.secret);t=st==='ok'?'✔ Conta e ranking recuperados.':st==='none'?t+' Sua página do ranking não foi encontrada.':t+' Sem conexão para conferir o ranking.'}
  msg.textContent=t};
 box.onclick=async e=>{const b=e.target.closest('[data-rc]');if(!b)return;if(b.dataset.rc==='load'){load();return}
  let ok=false;try{await navigator.clipboard.writeText(recoveryCode());ok=true}catch(err){}msg.textContent=ok?'✔ Código copiado. Guarde com cuidado: quem tiver copia sua conta.':'Não deu para copiar. Abra o Perfil dentro do jogo.'};
 inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();load()}}}
document.querySelectorAll('.recBox').forEach(mkRec);

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
  if(!window.crypto||!crypto.subtle||!window.TextEncoder)throw new Error('Este navegador não consegue verificar o acesso. Abra o jogo pelo endereço seguro do site.');
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
 const nm_=$('#name').value.trim().slice(0,LIMITS.name);
 if(!nm_||nm_.toLowerCase()==='visitante'){$('#nerr').textContent='⚠ Escolha um nome para entrar.';$('#serr').textContent='Escolha um nome para entrar.';$('#name').focus();$('#name').setAttribute('aria-invalid','true');return}
{const ag=adultCheck();if(ag!=='ok'||!termsOk()){$('#terr').textContent=ag==='minor'?'⛔ O Skyke3D é só para maiores de 18 anos.':ag==='blocked'?'⛔ O Skyke3D é só para maiores de 18 anos. Tente de novo amanhã.':ag==='bad'?'⚠ Essa data não existe. Confira o dia, o mês e o ano.':ag==='empty'?'⚠ Para jogar, informe a sua data de nascimento e aceite os Termos de Uso e a Política de Privacidade.':'⚠ Para jogar, leia e aceite os Termos de Uso e a Política de Privacidade.';$('#serr').textContent='Confira os termos para jogar.';$('#terms').classList.add('bad');if(ag!=='ok')$('#dobD').focus();else openTerms();return}}
 $('#terms').classList.remove('bad');$('#terr').textContent='';
 $('#name').removeAttribute('aria-invalid');$('#nerr').textContent='';cfg.name=nm_;me.name=cfg.name;saveNow();$('#serr').textContent='';
 if(ws||connecting)return;
 connecting=true;
 let ticket='';
 try{ticket=await getTicket()}catch(e){connecting=false;if(!ws)$('#serr').textContent=e&&e.message||'Não foi possível conectar.';return}
 connecting=false;
 if(ws)return;
 let w;try{w=new WebSocket(wsUrl(ticket))}catch(e){$('#serr').textContent='Não foi possível conectar. Tente novamente em instantes.';return}
 ws=w;w.onopen=()=>{if(ws===w)send({...first,name:cfg.name,cfg:{...cfg}})};
 w.binaryType='arraybuffer';w.onmessage=onMsg;
 w.onerror=()=>{if(mode==='menu'&&ws===w)$('#serr').textContent='O jogo está indisponível no momento. Tente novamente em instantes.'};
 w.onclose=e=>{if(ws!==w)return;ws=null;
  if(mode==='play'&&(e.code===1008||e.code===1009)){say('',e.code===1008?'Conexão encerrada por segurança.':'Mensagem muito longa: a conexão foi encerrada.',1);leave();return}
  if(mode==='play'&&session&&!recon)beginReconnect();
  else if(mode==='menu'&&!$('#serr').textContent)$('#serr').textContent='A conexão foi encerrada. Tente novamente.'}}
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
 w.binaryType='arraybuffer';w.onmessage=onMsg;w.onerror=()=>{};
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
// termos: as duas caixas precisam estar marcadas; a escolha fica salva neste navegador
// idade: data de nascimento em vez de uma caixinha. A conta é feita aqui no navegador e a data não é guardada nem enviada: só fica salvo
// "maior de 18 confirmado" (skyke_adult). Quem informa uma data de menor fica 24 h sem poder tentar de novo neste navegador.
const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}};
const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
{const opt=(sel,v,t)=>{const o=document.createElement('option');o.value=v;o.textContent=t;sel.append(o)},Y=new Date().getFullYear();
 opt($('#dobD'),'','Dia');for(let d=1;d<=31;d++)opt($('#dobD'),d,d);opt($('#dobM'),'','Mês');MESES.forEach((m,i)=>opt($('#dobM'),i+1,m));opt($('#dobY'),'','Ano');for(let y=Y;y>=Y-110;y--)opt($('#dobY'),y,y)}
function adultView(){const ok=LS('skyke_adult')==='1';$('#dobOk').classList.toggle('hide',!ok);$('.dobs').classList.toggle('hide',ok)}
function adultCheck(){if(LS('skyke_adult')==='1')return 'ok';const b=+LS('skyke_age_block')||0;if(Date.now()-b<86400000)return 'blocked';
 const d=+$('#dobD').value,m=+$('#dobM').value,y=+$('#dobY').value;if(!d||!m||!y)return 'empty';const dt=new Date(y,m-1,d);if(dt.getFullYear()!==y||dt.getMonth()!==m-1||dt.getDate()!==d)return 'bad';
 const now=new Date();let age=now.getFullYear()-y;if(now.getMonth()<m-1||(now.getMonth()===m-1&&now.getDate()<d))age--;
 if(age<18){LS('skyke_age_block',String(Date.now()));return 'minor'}LS('skyke_adult','1');adultView();return 'ok'}
$('#dobRedo').onclick=()=>{LS('skyke_adult',null);['#dobD','#dobM','#dobY'].forEach(s=>$(s).value='');adultView();$('#dobD').focus()};
adultView();
// Termos de Uso e Política de Privacidade: um documento só (o mesmo de /termos), aberto numa janela do jogo, sem nova aba. A confirmação
// só libera depois de rolar o texto até o fim. O aceite fica salvo com a versão do documento: se a versão mudar, o aceite é pedido de novo.
const TERMS_VER='2026-10-30';
const termsOk=()=>LS('skyke_terms')===TERMS_VER;
function termsView(){$('#tState').textContent=termsOk()?'✔ Aceitos (versão de 30/10/2026). Toque para ler de novo.':'Ainda não aceitos: leia até o fim e confirme.';$('#tState').classList.toggle('ok',termsOk())}
let termsLoaded=false;
function termsLoad(){if(termsLoaded)return Promise.resolve();return fetch('/termos',{cache:'no-cache'}).then(r=>{if(!r.ok)throw 0;return r.text()}).then(t=>{
 const doc=new DOMParser().parseFromString(t,'text/html').getElementById('doc');if(!doc)throw 0;
 doc.querySelectorAll('[id]').forEach(e=>e.id='td-'+e.id);// ids próprios dentro da janela, sem colidir com os do jogo
 const body=$('#termsBody');body.textContent='';body.append(document.importNode(doc,true));termsLoaded=true}).catch(()=>{$('#termsBody').textContent='Não foi possível carregar o documento. Verifique a conexão e tente de novo.'})}
function termsEnd(){const b=$('#termsBody');return termsLoaded&&b.scrollTop+b.clientHeight>=b.scrollHeight-12}
function termsSync(){const end=termsOk()||termsEnd();$('#tRules').disabled=!end;if(termsOk())$('#tRules').checked=true;$('#rulesOk').disabled=!$('#tRules').checked;
 $('#termsHint').textContent=end?'✔ Você chegou ao fim do documento.':'Role até o fim do texto para liberar a confirmação.'}
function openTerms(anchor){const m=$('#pRules');m.classList.remove('hide');$('#termsBody').scrollTop=0;termsSync();
 termsLoad().then(()=>{termsSync();if(anchor){const e=document.getElementById('td-'+anchor);if(e)e.scrollIntoView({block:'start'})}$('#termsBody').focus()})}
function closeTerms(){$('#pRules').classList.add('hide');$('#tRulesBtn').focus()}
$('#termsBody').addEventListener('scroll',termsSync,{passive:true});
$('#tRules').onchange=termsSync;
$('#rulesOk').onclick=()=>{if(!$('#tRules').checked)return;LS('skyke_terms',TERMS_VER);termsView();$('#terms').classList.remove('bad');$('#terr').textContent='';closeTerms()};
$('#termsLater').onclick=$('#termsX').onclick=closeTerms;
$('#pRules').addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeTerms()}});
$('#tRulesBtn').onclick=e=>{e.preventDefault();openTerms()};
$('#tState').onclick=()=>openTerms();
termsView();
{['#dobD','#dobM','#dobY'].forEach(s=>$(s).onchange=()=>{$('#terms').classList.remove('bad');$('#terr').textContent=''})}
$('#go').onclick=()=>start({t:'create',style:cfg.style,bots:Math.max(0,Math.min(20,parseInt($('#bn').value)||0))});
$('#goSv').onclick=()=>start({t:'create',surv:true});
$('#join').onclick=()=>{const c=$('#code').value.replace(/[^A-Za-z0-9]/g,'').toUpperCase();if(!c){$('#serr').textContent='Digite o código da sala.';return}start({t:'join',code:c})};
function refreshItemBtns(){const cur=me.g.userData.item;document.querySelectorAll('[data-u]').forEach(b=>b.classList.toggle('held',!!cur&&cur.id===b.dataset.u))}
const FX=[];function puff(a){const p=new THREE.Sprite(spr('💨')),r=a.g.rotation.y;p.scale.set(.6,.6,.6);p.position.set(a.g.position.x-Math.sin(r)*.55,a.g.position.y+.6,a.g.position.z-Math.cos(r)*.55);scene.add(p);FX.push({p,t0:performance.now()})}
function startGest(a,g){if(g==='stop'){a.gest=null;return}const d=GEST[g];if(!d)return;a.gest={g,t0:performance.now(),dur:d.dur};
 if(d.emo)showEmo(a,d.emo);if(d.puff)puff(a);
 if(d.sfx)sfx(d.sfx);else{const v=dvol(a);if(v>.03)sfx(d.loop?'g_dance':'g_whoosh',v)}}
// ---------- posições (pacote binário, 5×/s) com interpolação ----------
// Cada avatar guarda as últimas posições recebidas com a hora de chegada e é desenhado ~230 ms no passado, entre dois pacotes: o movimento sai
// liso mesmo com só 5 pacotes por segundo. Depois de uma pausa longa, a posição antiga é repetida logo antes da nova (sem "escorregar").
const INTERP=230;
function snapPush(a,t,x,z,r,y){const S=a.sn||(a.sn=[]),L=S[S.length-1];if(L&&t-L.t>350)S.push({t:t-200,x:L.x,z:L.z,r:L.r,y:L.y});S.push({t,x,z,r,y});if(S.length>6)S.splice(0,S.length-6);a.tx=x;a.tz=z;a.tr=r;a.ty=y}
function snapPos(a){const S=a.sn;if(!S||!S.length)return null;const rt=performance.now()-INTERP;if(rt<=S[0].t)return S[0];
 for(let i=S.length-1;i>0;i--){const A=S[i-1],B=S[i];if(rt>=A.t){if(rt>=B.t)return B;const f=(rt-A.t)/Math.max(1,B.t-A.t);let dr=B.r-A.r;dr=Math.atan2(Math.sin(dr),Math.cos(dr));return{x:A.x+(B.x-A.x)*f,z:A.z+(B.z-A.z)*f,y:A.y+(B.y-A.y)*f,r:A.r+dr*f}}}
 return S[S.length-1]}
function stUnpack(buf){const d=new DataView(buf);if(!buf.byteLength||d.getUint8(0)!==1)return;const now=performance.now();
 for(let o=1;o+12<=buf.byteLength;o+=12){const u=d.getUint32(o,true),a=actors.get((u&0x80000000?'b':'p')+(u&0x7fffffff));if(!a)continue;
  snapPush(a,now,d.getInt16(o+4,true)/100,d.getInt16(o+6,true)/100,d.getInt16(o+8,true)/10000,d.getUint8(o+10)/100);a.sit=d.getUint8(o+11)===1}}
function onMsg(ev){if(typeof ev.data!=='string'){if(ev.data instanceof ArrayBuffer)stUnpack(ev.data);return}let m;try{m=JSON.parse(ev.data)}catch(e){return}
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
 clkBurst();
 if(Number.isFinite(m.reconnect))RECON_MS=Math.max(100,Math.min(300000,m.reconnect));
 if(recon)reconDone();
 enter(m,!!m.resume);break}
case 'pj':addActor(m.p);if(mode==='play'){if(!m.p.bot)sfx('join',.8);say('',m.p.name+' entrou na sala.',1);if(m.p.talk)onRemoteSpeak(m.p.id);else if(me.talk)onLocalSpeak()}break;
case 'pl':{const a=actors.get(m.id);if(a&&mode==='play'){if(!a.bot)sfx('leave',.8);say('',a.name+' saiu da sala.',1)}delActor(m.id);break}
case 'host':hostId=m.id;updHost();break;
case 'svs':case 'svm':case 'sve':case 'svend':case 'svnew':case 'sverr':case 'sva':case 'svc':case 'svcr':case 'pstno':SURVC.msg(m);break;
case 'st':{const now=performance.now();for(const[id,x,z,r,y,s]of m.s){const a=actors.get(id);if(a){snapPush(a,now,x,z,r,y);a.sit=!!s}}break}// formato antigo (JSON), se algum servidor ainda mandar
case 'chat':if(m.id&&muted(m.id))break;say(m.name,m.text);if(mode==='play'&&m.name!==me.name&&!(document.activeElement===$('#msg')&&!$('#chat').classList.contains('hide')))sfx('chat',.8);break;
case 'cfg':{const a=actors.get(m.id);if(a){a.cfg=m.cfg;dress(a.g,m.cfg)}break}
case 'gest':{if(muted(m.id))break;const a=actors.get(m.id);if(a&&(m.g==='stop'||!a.gest||performance.now()-a.gest.t0>1000))startGest(a,m.g);break}
case 'item':{const a=m.id===me.id?me:actors.get(m.id);if(!a)break;const it=ITEMS.find(i=>i.id===m.item)||null;if(!m.use){setHeld(a.g,it)}else if(it){if(!a.g.userData.item)setHeld(a.g,it);a.drink=1.6;{const v=dvol(a);if(v>.03)sfx(it.food?'eat':'drink',v)}if(it.mg)showEmo(a,'✨');if(it.food)setTimeout(()=>{setHeld(a.g,null);if(a===me)refreshItemBtns()},1500)}if(a===me)refreshItemBtns();break}
case 'speak':{const a=actors.get(m.id);if(a)a.talk=m.v&&!muted(m.id);if(a&&m.v&&mode==='play')onRemoteSpeak(m.id);break}
case 'bots':$('#sBn').value=m.want;break;
case 'vinv':{if(muted(m.by))break;
 if(!/^[\w-]{11}$/.test(m.vid)||typeof m.by!=='string')break;
 const nm=String(m.name||'Alguém').slice(0,LIMITS.name);INV[m.by]={vid:m.vid,name:nm};
 if(m.by===me.id){if(m.swap&&VW.ctl&&swapWait===m.vid){clearSwapWait();openVid(m.vid,true,me.id);$('#vurl2').value='';$('#vchangeMsg').textContent='✅ Vídeo trocado para todos.'}break}
 if(VW.id===m.vid&&VW.owner===m.by&&!m.swap)break;
 if(m.swap&&VW.id&&!VW.ctl&&VW.owner===m.by){pend=null;$('#vinv').classList.add('hide');openVid(m.vid,false,m.by);send({t:'vjoin',by:m.by});say('','🔄 '+nm+' trocou o vídeo. Acompanhando o novo vídeo.',1);break}
 if(m.swap&&!(pend&&pend.by===m.by))break;
 const txt=m.swap?'🎬 '+nm+' trocou o vídeo. Quer assistir?':'🎬 '+nm+' quer assistir um vídeo com você!';
 pend=m;$('#vinvt').textContent=txt;$('#vthumb').src='https://img.youtube.com/vi/'+m.vid+'/mqdefault.jpg';$('#vinv').classList.remove('hide');
 ntArm('video:'+m.by,'#vinv',txt,()=>{pend=null;openVid(m.vid,false,m.by);send({t:'vjoin',by:m.by})});
 if(!m.swap)say('','🎬 '+nm+' convidou para assistir um vídeo. Aceite no balão da tela.',1);break}
case 'dj':{if(typeof m.host!=='string'||!/^[\w.-]+(:\d+)?$/.test(m.host))break;const mine=m.by===me.id;DJ.host=m.host.slice(0,120);DJ.by=m.by;DJ.name=String(m.name||'Alguém').slice(0,16);djStopAudio();djRender();
 if(mine){$('#djurl').value='';djListen();djMsg('')}else{say('','🎧 '+DJ.name+' colocou uma rádio ('+DJ.host+').',1);ntOffer('dj',{},'🎧 '+DJ.name+' colocou uma rádio ('+DJ.host+'). Quer ouvir?','#djinv','#djinvt',()=>{$('#pDJ').classList.remove('hide');djRender();djListen()})}break}
case 'djstop':{if(DJ.host)say('','🎧 A rádio foi encerrada.',1);ntGone('dj');djReset();break}
case 'djbusy':djMsg('Já existe uma rádio tocando nesta sala.');break
case 'djerr':djMsg(String(m.msg||'Endereço inválido.'));break
case 'tsync':clkSample(m);break;
case 'rep':$('#repMsg').textContent=m.ok?(m.dup?'Você já denunciou essa pessoa há pouco. A denúncia anterior vale.':'✅ Denúncia enviada. Obrigado por ajudar a manter o jogo seguro.'):'⚠ '+String(m.err||'Não foi possível enviar.').slice(0,160);if(m.ok){$('#repNote').value=''}break;
case 'vsync':if(m.by===VW.owner&&!VW.ended)VW.apply(m);break;
case 'vend':if(m.by===VW.owner&&VW.id&&!VW.ctl)endedState(m.left);break;
case 'vbusy':closeVid(false);say('','Já há vídeos demais em andamento nesta sala. Tente de novo daqui a pouco.',1);break;
case 'vstop':{if(VW.id&&VW.owner===m.by&&(!VW.ctl||m.by===me.id)){closeVid(false);say('',m.why==='idle'?'O vídeo terminou e ninguém colocou outro: a janela foi fechada.':'O vídeo foi encerrado.',1)}if(pend&&pend.by===m.by){$('#vinv').classList.add('hide');pend=null}ntGone('video:'+m.by);delete INV[m.by];break}
case 'kar':{if(!m.q||!m.q.length||m.q.some(k=>k.id===me.id)){ntGone('karaoke');$('#kinvb').classList.add('hide')}const wk=isK(me.id),prev=kq[0]&&kq[0].id,pm=(kq.find(k=>k.id===me.id)||{}).vid;kq=m.q;kEnd=Date.now()+(m.left||0);renderK();syncK(m.turn);if(kq[0]&&kq[0].vid&&kq[0].id===me.id&&!stream)startMic();if(wk&&!isK(me.id)){say('','🎶 Você saiu da fila do karaokê.',1);$('#pKar').classList.add('hide');exitFullscreenIf($('#kstage'));setKMin(false)}const nv=(kq.find(k=>k.id===me.id)||{}).vid;if(pm&&nv===null){$('#ksong').value='';$('#pKar').classList.remove('hide');setKMin(false);say('','🎤 Sua vez acabou! Cole o link de uma nova música em Karaokê para cantar de novo.',1)}if(kMin&&kq[0]&&kq[0].id===me.id&&m.turn!==kTurn){const f=$('#kFloat');f.classList.remove('ring');void f.offsetWidth;f.classList.add('ring')}if(kq[0]&&kq[0].vid&&(kq[0].id!==prev||m.turn!==kTurn))say('','🎶 Vez de '+kq[0].name+' cantar!'+(kq[0].id===me.id&&!stream?' Ative o microfone para cantar!':''),1);kTurn=m.turn;break}
case 'ksync':KW.apply(m);break;
case 'kinv':if(isK(me.id)||muted(m.by))break;$('#kinvt').textContent='🎤 '+m.name+' abriu o karaokê! Quer participar?';$('#kinvb').classList.remove('hide');ntArm('karaoke','#kinvb','🎤 '+m.name+' abriu o karaokê. Quer participar?',kAccept);say('','🎤 '+m.name+' abriu o karaokê. Aceite no balão da tela.',1);break;
case 'emo':{if(muted(m.id))break;const a=m.id===me.id?me:actors.get(m.id);if(a&&Number.isInteger(m.i)&&m.i>=0&&m.i<EMO.length)showEmo(a,EMO[m.i]);break}
case 'sys':say('',m.text,1);break;
case 'sig':onSig(m);break;case 'ice':if(m.ice&&Array.isArray(m.ice.iceServers)){iceApply(m.ice);iceAt=Date.now()}break}}
function enter(m,resume){
 const players=Array.isArray(m.players)?m.players:[];
 const self=(m.self&&m.self.id===m.id)?m.self:players.find(p=>p.id===m.id)||null;
 if(!resume)stopMusic();
 if(matchMedia('(pointer:coarse)').matches)$('#touchbar').classList.remove('hide');
 roomCode=typeof m.code==='string'?m.code:roomCode;lastMv='';muteLoad();
 PUBURL=(typeof m.url==='string'&&/^https?:\/\/[^\s]+$/.test(m.url))?m.url:'';
 if(m.ice&&Array.isArray(m.ice.iceServers))iceApply(m.ice);iceAt=Date.now();
 me.id=m.id;joinN++;if(/^[\w.+-]{1,20}$/.test(m.ver||''))BUG.ver=m.ver;
 if(self&&typeof self.name==='string'){me.name=self.name.slice(0,LIMITS.name);cfg.name=me.name}
 hostId=m.host||null;if(!THEME[m.style])m.style=ST_LEGACY[m.style]||'proxima';if(!m.sv)cfg.style=m.style;SURVC.prep(m);
 [...actors.keys()].forEach(delActor);[...peers.keys()].forEach(id=>closePeer(id,false));remoteVQ.clear();
 buildRoom(m.style);
 me.sit=!!(self&&self.s);me.seat=null;me.gest=null;me.drink=0;me.talk=false;
 me.jy=self&&Number.isFinite(self.y)?self.y:0;me.vy=0;dest=null;camYaw=camYawS=0;
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
 refreshItemBtns();updHost();SURVC.enter(m);
 say('',resume?'✅ Conexão restabelecida.':'Você entrou na sala '+fmtCode(roomCode)+'. Teclas: WASD mover · E pular · F sentar · Espaço usar item.',1);if(!resume)sfx('confirm');if(!resume&&/^[\w.+-]{1,20}$/.test(m.ver||''))say('','Skyke3D v'+m.ver,1)}
let joinN=0;// conta as entradas em sala (o vigia de sair não reclama se a pessoa já entrou em outra)
function leave(){
 // vigia: depois de pedir para sair, o jogo tem que estar no menu em 2 s; se não estiver, algo travou (como o antigo "Jogar de novo") e vira um relato
 const j0=joinN;setTimeout(()=>{if(mode!=='menu'&&!recon&&joinN===j0)reportBug('leave','sair da sala não voltou ao menu (mode='+mode+')')},2000);
 SURVC.leave();
 if(recon){if(recon.timer)clearTimeout(recon.timer);recon=null}
 hideRecon();session=null;if(roomCode)$('#code').value=fmtCode(roomCode);
 mode='menu';$('#touchbar').classList.add('hide');unread=0;setB('#bChat','💬','Chat');startMusic();FX.splice(0).forEach(x=>scene.remove(x.p));kq=[];setKMin(false);kShowQ=false;kProbe=false;kProbeSeq++;$('#ksong').disabled=false;$('#kshowq').classList.add('hide');$('#bInvite').title='Copiar convite da sala';exitFullscreenIf($('#kstage'));KW.close();$('#kwatch').classList.add('hide');$('#pKar').classList.remove('kvid');closeVid(false);pend=null;['#vinv','#kinvb'].forEach(s=>$(s).classList.add('hide'));stopMic();
 if(ws){try{send({t:'leave'})}catch(e){}ws.onclose=null;try{ws.close(4000,'leave')}catch(e){}ws=null}
 [...actors.keys()].forEach(delActor);[...peers.keys()].forEach(id=>closePeer(id,false));remoteVQ.clear();setHeld(me.g,null);clearTimeout(me.emoT);me.em.classList.remove('show');me.em.textContent='';me.id=null;me.sit=false;me.seat=null;me.gest=null;
 ['#hud','#chat','#bar','#pMochila','#pVis','#pVid','#pDJ','#pSet','#pKar','#pKFila','#pEmo','#pPerf'].forEach(s=>$(s).classList.add('hide'));djReset();ntReset();$('#start').classList.remove('hide');$('#log').innerHTML='';buildRoom(cfg.style);mark()}
$('#bExit').onclick=leave;
$('#reconNow').onclick=()=>reconNow();
$('#reconOut').onclick=()=>leave();
addEventListener('online',()=>{if(recon)reconNow()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&recon)reconNow()});
$('#tJump').onclick=()=>jump();$('#tSit').onclick=()=>toggleSit();$('#tUse').onclick=()=>useItem();
$('#bChat').onclick=()=>chatToggle();$('#cMin').onclick=()=>chatToggle(false);
$('#msg').addEventListener('focus',()=>{if(COARSE){const c=$('#chat');c.dataset.t=c.style.top;c.style.top='56px'}});$('#msg').addEventListener('blur',()=>{if(COARSE){const c=$('#chat');if(c.dataset.t)c.style.top=c.dataset.t}});
function tog(id){['#pMochila','#pVis','#pSet','#pKar','#pRep','#pPerf'].forEach(s=>s!=='#'+id&&$(s).classList.add('hide'));['pSvInv','pSvCook'].forEach(i=>{const e=document.getElementById(i);if(e)e.classList.add('hide')});// modo Sobrevivência: mochila e cozinha também fecham ao abrir outro menu
 const el=$('#'+id);el.classList.toggle('hide');if(id==='pKar'){setKMin(false);if(el.classList.contains('hide'))exitFullscreenIf($('#kstage'))}}
$('#bMochila').onclick=()=>tog('pMochila');$('#bVis').onclick=()=>tog('pVis');$('#bSet').onclick=()=>tog('pSet');
// denúncia: só jogadores humanos desta sala; o servidor confere de novo, limita a frequência e guarda junto o chat recente da sala
// ---------- silenciar só para mim ----------
// Guarda a chave do jogador (mk: a mesma para o mesmo IP nesta sala, mesmo se reconectar; não revela o IP) só nesta aba. Silenciado: some o
// chat, os emojis, os gestos, os convites e a voz dele; ele não fica sabendo.
const MUTE=new Set();
function muteLoad(){MUTE.clear();try{const a=JSON.parse(sessionStorage.getItem('skyke_mute_'+roomCode)||'[]');if(Array.isArray(a))a.slice(0,200).forEach(k=>typeof k==='string'&&k.length<=16&&MUTE.add(k))}catch(e){}}
function muteSave(){try{sessionStorage.setItem('skyke_mute_'+roomCode,JSON.stringify([...MUTE].slice(-200)))}catch(e){}}
function muted(id){const a=id!=null&&actors.get(id);return !!(a&&a.mk&&MUTE.has(a.mk))}
function muteSet(id,on){const a=actors.get(id);if(!a||!a.mk||a.bot)return;if(on)MUTE.add(a.mk);else MUTE.delete(a.mk);muteSave();
 const au=document.getElementById('au'+id);if(au)au.muted=on;if(on)a.talk=false;a._lk='';
 say('',on?'🔇 '+a.name+' foi silenciado só para você (chat, voz, emojis e convites).':'🔊 '+a.name+' voltou a ser ouvido.',1)}
function repFill(sel){const w=$('#repWho'),cur=sel||w.value;w.textContent='';const L=[...actors.values()].filter(a=>!a.bot&&a.id!==me.id).sort((a,b)=>a.name.localeCompare(b.name));
 if(!L.length){const o=document.createElement('option');o.value='';o.textContent='Nenhum outro jogador na sala';w.append(o)}
 L.forEach(a=>{const o=document.createElement('option');o.value=a.id;o.textContent=a.name+(muted(a.id)?' (silenciado)':'');w.append(o)});if(cur&&L.some(a=>a.id===cur))w.value=cur;$('#repSend').disabled=$('#repMute').disabled=!L.length;repMuteLbl()}
function repMuteLbl(){const id=$('#repWho').value;$('#repMute').textContent=id&&muted(id)?'🔊 Voltar a ouvir':'🔇 Silenciar só para mim'}
$('#repWho').onchange=repMuteLbl;
$('#repMute').onclick=()=>{const id=$('#repWho').value;if(!id)return;muteSet(id,!muted(id));repFill(id)};
$('#bRep').onclick=()=>{repFill();$('#repMsg').textContent='';tog('pRep')};
$('#repSend').onclick=()=>{const id=$('#repWho').value;if(!id)return;$('#repSend').disabled=true;$('#repMsg').textContent='Enviando…';send({t:'report',id,reason:$('#repWhy').value,note:$('#repNote').value.slice(0,300)});setTimeout(()=>{$('#repSend').disabled=false},4000)};
let PUBURL='';
$('#bInvite').onclick=async()=>{const l=(PUBURL?PUBURL+'/':location.origin+location.pathname)+'#sala='+roomCode;try{await navigator.clipboard.writeText(l);say('','🔗 Link da sala copiado: '+l,1)}catch(e){say('','Copie o link da sala: '+l,1)}
 if(!PUBURL&&/^(localhost|127\.|\[?::1|192\.168\.|10\.)/.test(location.hostname))say('','⚠ Este endereço funciona só neste computador: para convidar amigos, use o endereço público do jogo.',1)};
$('#sBn').onchange=e=>send({t:'bots',n:Math.max(0,Math.min(20,parseInt(e.target.value)||0))});
document.querySelectorAll('[data-rs]').forEach(b=>b.onclick=()=>{const bx=$(b.dataset.rs==='v'?'#vbox':'#kbox'),w=Math.max(200,Math.min(innerWidth*.88,bx.offsetWidth*(1+b.dataset.d*.2)));bx.style.width=w+'px';bx.style.height=(w*9/16)+'px'});
