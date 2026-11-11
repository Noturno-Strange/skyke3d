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
const EDS=[{g:0,k:'fc',n:'Rosto',v:FACES},{g:0,k:'skin',n:'Pele',c:SKIN,b:'tb'},{g:0,k:'eye',n:'Olhos',c:EYE,b:'eb'},{g:1,k:'hs',n:'Cabelo',v:HS},{g:1,k:'hair',n:'Cor do cabelo',c:HAIRC,b:'rb'},{g:1,k:'hat',n:'Chapéu',v:HATS},{g:1,k:'hc',n:'Cor do chapéu',c:PAL,b:'hb'},{g:2,k:'shirt',n:'Camisa',c:PAL,b:'sb'},{g:2,k:'bt',n:'Calça',v:BT},{g:2,k:'pc',n:'Cor da calça',c:PAL,b:'pb'},{g:2,k:'shoes',n:'Calçado',v:SHOES},{g:2,k:'sc',n:'Cor do calçado',c:PAL,b:'cb'},{g:3,k:'nc',n:'Cor do nome',c:NCOL},{g:3,k:'nf',n:'Efeito do nome',v:NFX}];
// Cores brilhantes: uma só caixa para o avatar todo; liga ou desliga juntas as chaves de brilho de cada parte (BRK)
const BRV=Object.values(BRK),glossOn=()=>BRV.some(k=>cfg[k]===1),setGloss=on=>BRV.forEach(k=>cfg[k]=on?1:0);
// Linhas do editor: cada estilo fica na mesma linha da sua cor (e pele com olhos), para caber mais sem esconder nada
const EROWS=[{g:0,n:'Rosto',k:['fc']},{g:0,n:'Pele',k:['skin']},{g:0,n:'Olhos',k:['eye']},{g:1,n:'Cabelo',k:['hs','hair']},{g:1,n:'Chapéu',k:['hat','hc']},{g:2,n:'Camisa',k:['shirt']},{g:2,n:'Calça',k:['bt','pc']},{g:2,n:'Calçado',k:['shoes','sc']},{g:3,n:'Cor',k:['nc']},{g:3,n:'Efeito',k:['nf']}];
const EG=['👤 Corpo','💇 Cabelo','👕 Roupas','✨ Nome'],EUPD=[];// rótulos curtos: as abas cabem numa linha com a mesma largura (o chapéu fica em Cabelo)
// Estilos andam com ◀ ▶; cada cor é um botão com a cor atual que abre a paleta inteira em grade logo abaixo da linha (uma por vez).
// A paleta fica aberta enquanto o jogador experimenta; fecha no mesmo botão, com Esc ou ao trocar de aba. Setas do teclado andam pela grade.
// paleta de cada lista de cores, para achar as cores brilhantes pares (GLOSS) no mesmo índice
const GP=new Map([[PAL,'PAL'],[SKIN,'SKIN'],[EYE,'EYE'],[HAIRC,'HAIRC']]);
function mkEditor(tabsEl,edEl){let gi=0,open=null;
 tabsEl.innerHTML=EG.map((t,i)=>`<button data-eg="${i}">${t}</button>`).join('');
 const stp=d=>`<span class="estp"><button data-a="${d.k}" data-d="-1" aria-label="${d.n}: anterior">◀</button><span class="evv" data-v="${d.k}"></span><button data-a="${d.k}" data-d="1" aria-label="${d.n}: próximo">▶</button></span>`;
 const cpk=d=>`<button type="button" class="cpk" data-cp="${d.k}" aria-label="${d.n}: escolher" aria-expanded="false"><span class="sw" data-v="${d.k}"></span></button>`;
 const pop=d=>`<div class="cpop hide" data-pop="${d.k}" role="group" aria-label="${d.n}">${d.c.map((h,i)=>`<button type="button" class="sw" data-ci="${i}" style="background:${h}" aria-label="${d.n}: cor ${i+1}" aria-pressed="false" tabindex="-1"></button>`).join('')}</div>`;
 edEl.innerHTML=EROWS.map(r=>{const ds=r.k.map(k=>EDS.find(d=>d.k===k));return `<div class="ed" data-g="${r.g}"><span class="edl">${r.n}</span><span class="edctl">${ds.map(d=>d.c?cpk(d):stp(d)).join('')}</span>${ds.filter(d=>d.c).map(pop).join('')}</div>`}).join('')+'<div class="ed" data-g="3"><span class="edl">Prévia</span><span class="edctl"><span class="npv" aria-live="polite"><span></span></span></span></div><label class="glo"><input type="checkbox" data-gl> ✨ Cores brilhantes</label>';
 const show=k=>{open=k;edEl.querySelectorAll('[data-pop]').forEach(p=>p.classList.toggle('hide',p.dataset.pop!==open));edEl.querySelectorAll('[data-cp]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.cp===open)))};
 const upd=()=>{fixCfg();const gl=glossOn();EDS.forEach(d=>{const x=cfg[d.k];if(d.c){const e=edEl.querySelector('.cpk [data-v="'+d.k+'"]'),bg=cfg[d.b]===1;const P=bg?GLOSS[GP.get(d.c)]:d.c;e.style.background=P[x];e.classList.toggle('sw-gl',bg);
   edEl.querySelectorAll('[data-pop="'+d.k+'"] [data-ci]').forEach(b=>{const on=+b.dataset.ci===x;b.style.background=P[+b.dataset.ci];b.setAttribute('aria-pressed',String(on));b.tabIndex=on?0:-1;b.classList.toggle('sw-gl',bg)})}else edEl.querySelector('[data-v="'+d.k+'"]').textContent=d.v[x]});
  {const pv=edEl.querySelector('.npv span');pv.textContent=cleanName($('#name').value)||'Seu nome';nameFx(pv,cfg)}
  edEl.querySelector('[data-gl]').checked=gl;edEl.querySelectorAll('.ed').forEach(r=>r.classList.toggle('hide',+r.dataset.g!==gi));tabsEl.querySelectorAll('[data-eg]').forEach(b=>b.classList.toggle('sel',+b.dataset.eg===gi))};
 const apply=()=>{dress(me.g,cfg);sendCfg();mark();saveSoon()};
 tabsEl.onclick=e=>{const i=e.target.dataset.eg;if(i!==undefined){gi=+i;show(null);upd()}};
 edEl.onclick=e=>{const cp=e.target.closest('[data-cp]');if(cp){show(open===cp.dataset.cp?null:cp.dataset.cp);return}
  const ci=e.target.closest('[data-ci]');if(ci){cfg[ci.parentNode.dataset.pop]=+ci.dataset.ci;apply();return}
  const b=e.target.closest('[data-a]');if(!b)return;const d=EDS.find(x=>x.k===b.dataset.a),n=d.v.length;cfg[d.k]=((cfg[d.k]|0)+ +b.dataset.d+n)%n;apply()};
 edEl.onchange=e=>{if(e.target.matches('[data-gl]')){setGloss(e.target.checked);apply()}};
 edEl.onkeydown=e=>{if(e.key==='Escape'&&open){const k=open;show(null);edEl.querySelector('[data-cp="'+k+'"]').focus();e.preventDefault();e.stopPropagation();return}
  const ci=e.target.closest('[data-ci]');if(!ci)return;const p=ci.parentNode,L=p.children,cols=getComputedStyle(p).gridTemplateColumns.split(' ').length||1,i=+ci.dataset.ci;
  const j={ArrowLeft:i-1,ArrowRight:i+1,ArrowUp:i-cols,ArrowDown:i+cols,Home:0,End:L.length-1}[e.key];if(j===undefined)return;e.preventDefault();e.stopPropagation();
  const t=L[Math.max(0,Math.min(L.length-1,j))];[...L].forEach(b=>b.tabIndex=b===t?0:-1);t.focus()};
 return upd}
const SK=Object.keys(ST);
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
$('#name').addEventListener('input',()=>EUPD.forEach(f=>f()));// a prévia do nome (aba ✨ Nome) acompanha a digitação
function hasSaved(){try{return !!localStorage.getItem(SAVE_KEY)}catch(e){return false}}
function refreshForget(){const b=$('#forgetS');if(b)b.classList.toggle('hide',!hasSaved())}
function loadSaved(){try{const raw=localStorage.getItem(SAVE_KEY);if(!raw||raw.length>800)return;const j=JSON.parse(raw);if(!j||typeof j!=='object'||j.v!==1)return;
 const L=j.look;if(L&&typeof L==='object')EDS.forEach(d=>{const n=(d.c||d.v).length,x=L[d.k];if(Number.isInteger(x)&&x>=0&&x<n)cfg[d.k]=x});BRV.forEach(k=>{if(L[k]===0||L[k]===1)cfg[k]=L[k]});
 // visual salvo com o antigo "Cores brilhantes" (tudo brilhante): vira as versões brilhantes de cada cor
 if(L.br===1&&!BRV.some(k=>k in L))setGloss(true);setGloss(glossOn());cfg.br=0;
 const nm=cleanName(j.name);if(nm&&nm.toLowerCase()!=='visitante')$('#name').value=nm;dress(me.g,cfg)}catch(e){}}
function saveNow(){if(noSave)return;clearTimeout(saveTm);saveTm=0;try{localStorage.setItem(SAVE_KEY,JSON.stringify({v:1,name:cleanName($('#name').value),look:{...Object.fromEntries(EDS.map(d=>[d.k,cfg[d.k]])),...Object.fromEntries(BRV.map(k=>[k,cfg[k]===1?1:0]))}}))}catch(e){}refreshForget()}
function saveSoon(){if(noSave)return;clearTimeout(saveTm);saveTm=setTimeout(saveNow,400)}
// "Esquecer meus dados" limpa só ESTE aparelho (nome e visual); volta com o código de recuperação
function forgetSaved(){noSave=true;clearTimeout(saveTm);try{localStorage.removeItem(SAVE_KEY)}catch(e){}if(window.socForget)window.socForget();refreshForget();document.querySelectorAll('.forgetSaved').forEach(b=>{b.dataset.t=b.dataset.t||b.textContent;b.textContent='Dados apagados ✓';b.disabled=true})}
// Ações sem volta pedem confirmação extra (Sim/Não) no próprio lugar do botão, sem janela nova. opts: html (aviso), yes (texto do botão), onYes, copy (oferece copiar o código antes)
function mkConfirm(b,o){
 const box=document.createElement('div');box.className='fgc hide';box.setAttribute('role','alertdialog');box.setAttribute('aria-label','Confirmar');
 box.innerHTML='<small></small>'+(o.copy?'<button type="button" class="fgcp">📋 Copiar meu código antes</button>':'')+'<div class="fgb"><button type="button" class="fgno">Não</button><button type="button" class="dng fgyes"></button></div>';
 box.querySelector('small').innerHTML=o.html;box.querySelector('.fgyes').textContent=o.yes||'Sim';
 b.after(box);
 const open=()=>{b.classList.add('hide');box.classList.remove('hide');box.querySelector('.fgno').focus()},close=()=>{box.classList.add('hide');b.classList.remove('hide');b.focus()};
 b.onclick=open;box.querySelector('.fgno').onclick=close;
 const cp=box.querySelector('.fgcp');if(cp)cp.onclick=async e=>{const t=e.target,c=await recoveryCode();let ok=false;if(c){try{await navigator.clipboard.writeText(c);ok=true}catch(x){}}t.textContent=ok?'✔ Copiado. Guarde com cuidado.':c?'Não deu para copiar. Abra o Perfil.':'O código não fica neste aparelho: use o que você guardou.'};
 box.querySelector('.fgyes').onclick=()=>{box.classList.add('hide');b.classList.remove('hide');o.onYes()};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!box.classList.contains('hide')){e.stopPropagation();close()}},true)}
document.querySelectorAll('.forgetSaved').forEach(b=>mkConfirm(b,{html:'<b>Apagar nome e visual deste aparelho?</b> Para voltar, use o <b>código de recuperação</b> (tenha-o guardado antes).',yes:'Sim, apagar',copy:true,onYes:forgetSaved}));$('#name').addEventListener('change',saveSoon);
loadSaved();refreshForget();
mark();
// ---------- código de recuperação (assets/recovery.js + assets/identity.js) ----------
// O código v2 leva o id opaco e a chave de recuperação (nunca a principal), além de nome, visual e amigos.
// Restaurar valida tudo como dado não confiável; a chave principal nova é criada ao entrar na sala.
const REC_ERR={cancelado:'Restauração cancelada: nada mudou neste aparelho.',formato:'Código incompleto ou com erro.',conferencia:'O código não confere. Confira se copiou tudo.',versao:'Código de uma versão mais nova do jogo.',faixa:'Código não reconhecido por esta versão.'};
const fmtWhen=ms=>{try{return new Date(ms).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(e){return ''}};
function identityMsg(e){const c=e&&e.code||'';
 if(c==='recover-pending')return 'Recuperação em andamento. Por segurança, a troca da chave só vale '+(e.until?'a partir de '+fmtWhen(e.until):'depois do prazo de carência')+'. Volte depois dessa hora e entre de novo.';
 if(c==='recover-other')return 'Já existe outro pedido de recuperação desta conta'+(e.until?' (vale a partir de '+fmtWhen(e.until)+')':'')+'. Se não foi você, entre pelo aparelho que ainda tem a conta e cancele em Segurança.';
 if(c==='keypass-limit')return 'Você já usou as 3 renovações da chave de recuperação (Keypass). Para renovar de novo, fale com o administrador do servidor.';
 if(c==='keypass-wait')return 'A chave de recuperação só pode ser renovada uma vez por mês'+(e.until?': a próxima a partir de '+fmtWhen(e.until):'')+'.';
 if(c==='limit')return 'Muitas contas novas deste local hoje. Tente de novo amanhã.';
 if(c==='pow')return 'O servidor está recebendo muitos registros agora. Tente de novo em instantes.';
 if(c==='exists')return 'Este aparelho já tem uma identidade registrada. Use o código de recuperação ou 🗝️ Entrar com passkey para entrar.';
 if(c==='registered')return 'Sua identidade foi registrada. Atualize a página e entre de novo.';
 if(c==='session')return 'Sua sessão de identidade expirou. Entre de novo.';
 if(c==='full')return 'O servidor atingiu o limite de identidades. Tente mais tarde ou avise quem cuida do servidor.';
 if(c==='rate'||c==='busy')return 'Muitas tentativas. Aguarde um instante e tente de novo.';
 if(c==='bad-signature')return 'A chave de recuperação não confere com esta identidade.';
 return (e&&e.message)||'Não foi possível preparar sua identidade.'}
// O código só é montado na hora, nunca sai do navegador (nem vai ao servidor ou a link) e fica oculto no Perfil.
function profileNow(){return{name:cleanName($('#name').value),look:cfg,gloss:glossOn(),friends:window.socFriendIds?window.socFriendIds():[]}}
// A chave de recuperação NÃO fica guardada no navegador: o código só dá para montar logo depois de criar a conta ou de gerar uma chave nova
// (a chave fica na memória por uns minutos) e, em contas de versões antigas, enquanto o aparelho ainda a guarda. Com identidade e sem a chave
// devolve '' (o código está com o jogador); sem identidade ainda, o código antigo (nome, visual e chave do aparelho).
async function recoveryCode(){
 const profile=profileNow();
 try{await SKYID.load();const c=await SKYID.backupCode(profile);if(c)return c}catch(e){}
 if(SKYID.status())return '';
 return SKYREC.encode({...profile,fk:SKYID.deviceKey()});
}
function mkRec(box){box.innerHTML='<details class="rec"><summary>🔑 Recuperar conta</summary><small>Cole o código para voltar com a identidade, o nome e o visual.</small>'
   +'<div class="recrow"><input class="recin" maxlength="2400" placeholder="Cole o código" aria-label="Código de recuperação" autocomplete="off" autocapitalize="characters" spellcheck="false"><button type="button" data-rc="load">Restaurar</button></div>'
   +'<div class="recrow"><button type="button" data-rc="copy">📋 Copiar meu código</button></div>'
   +'<div class="recrow pkrow" hidden><button type="button" data-rc="pk">🗝️ Entrar com passkey</button></div><small class="recmsg" role="status" aria-live="polite"></small></details>';
  const det=box.firstChild,inp=box.querySelector('.recin'),msg=box.querySelector('.recmsg');
  det.addEventListener('toggle',()=>{msg.textContent=''});
  const load=async()=>{msg.textContent='';let r;
   try{r=await SKYID.restoreCode(inp.value)}catch(e){msg.textContent='⚠ '+(e&&e.message||'Código inválido.');return}
   if(!r.ok){msg.textContent='⚠ '+(REC_ERR[r.err]||'Código não reconhecido.');return}
   SKYREC.FIELDS.forEach(k=>{const v=r.look&&r.look[k];if(Number.isInteger(v))cfg[k]=v});setGloss(r.gloss===1);
   const nm=cleanName(r.name);if(nm&&nm.toLowerCase()!=='visitante')$('#name').value=nm;
   dress(me.g,cfg);sendCfg();mark();saveNow();inp.value='';
   const nf=r.friends&&window.socImport?window.socImport(r.friends):-1;
   const t=r.v===2?'✔ Conta restaurada. O código que você colou vale uma vez: guarde o código NOVO que apareceu. Ao entrar, este aparelho pede a troca da chave; por segurança ela só vale depois de um prazo (normalmente 24 h) e o jogo avisa a hora.':'✔ Nome e visual restaurados. Ao entrar, uma identidade nova será criada.';
   msg.textContent=t+(nf>=0?' Amigos: '+nf+'.':'')};
  const pkRow=box.querySelector('.pkrow'),pkBtn=pkRow.querySelector('button');pkRow.hidden=!(window.SKYID&&SKYID.passkeySupported());
  box.onclick=async e=>{const b=e.target.closest('[data-rc]');if(!b)return;if(b.dataset.rc==='load'){load();return}
   if(b.dataset.rc==='pk'){pkStep(pkBtn,msg);return}
   const c=await recoveryCode();let ok=false;if(c){try{await navigator.clipboard.writeText(c);ok=true}catch(err){}}
   msg.textContent=ok?'✔ Código copiado. Guarde com cuidado: quem tiver copia sua identidade.':c?'Não deu para copiar. Abra o Perfil dentro do jogo.':'O código não fica neste aparelho: use o que você guardou, ou gere outro em 🔐 Segurança (pede o código atual).'};
  inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();load()}}}
document.querySelectorAll('.recBox').forEach(mkRec);

// ---------- entrar com passkey (assets/identity.js; o servidor confere em lib/webauthn.js) ----------
// Na tela inicial ainda não há conexão: abre uma só para a identidade (sem entrar em sala) e fecha no fim. O primeiro toque prepara
// o desafio; o segundo abre a passkey (alguns navegadores só abrem a passkey direto do toque, sem esperar a rede).
let pkWs=null;
function pkConn(){if(pkWs&&pkWs.readyState===1)return Promise.resolve(pkWs);
 return getTicket().then(ticket=>new Promise((res,rej)=>{let w;try{w=new WebSocket(wsUrl(ticket))}catch(e){rej(new Error('Não foi possível conectar.'));return}
  pkWs=w;w.onopen=()=>{SKYID.bind(m=>{if(w.readyState===1)w.send(JSON.stringify(m))});res(w)};
  w.onmessage=ev=>{if(typeof ev.data!=='string')return;let m;try{m=JSON.parse(ev.data)}catch(x){return}SKYID.onMessage(m)};
  w.onerror=()=>rej(new Error('O jogo está indisponível no momento. Tente novamente em instantes.'));w.onclose=()=>{if(pkWs===w)pkWs=null}}))}
function pkClose(){const w=pkWs;pkWs=null;if(w)try{w.close()}catch(e){}}
async function pkStep(btn,msg){if(btn.disabled)return;
 // sem a conexão em que o desafio foi pedido (caiu entre os toques), prepara de novo: o servidor só aceita o desafio na mesma conexão
 if(btn.dataset.ready!=='1'||!pkWs||pkWs.readyState!==1){btn.disabled=true;msg.textContent='Preparando…';
  try{await pkConn();await SKYID.preparePasskey('login');btn.dataset.ready='1';btn.textContent='👆 Toque para usar a passkey';msg.textContent='Toque de novo e escolha a passkey desta conta (digital, rosto, PIN ou celular).'}
  catch(e){pkClose();msg.textContent='⚠ '+identityMsg(e)}
  btn.disabled=false;return}
 btn.disabled=true;btn.dataset.ready='';msg.textContent='Esperando a passkey…';
 try{const r=await SKYID.passkeyLogin();pkClose();btn.textContent='🗝️ Entrar com passkey';
  msg.textContent='✔ Você entrou com a passkey: este aparelho agora é o principal da conta e os outros saíram.'+(r.cancelled?' Um pedido de recuperação que estava em andamento foi cancelado.':'')+' O nome que é seu continua reservado; o visual e os amigos vêm só pelo código de recuperação. Agora escolha a sala.'}
 catch(e){btn.textContent='🗝️ Entrar com passkey';msg.textContent='⚠ '+identityMsg(e);if(e&&e.code!=='cancelled')pkClose()}
 btn.disabled=false}
// Recuperação concluída (código ou passkey de outro aparelho): a chave antiga, o código usado e as sessões já morreram; as passkeys
// cadastradas continuam. Se o aparelho perdido tinha alguma, o jogador pode revogar todas aqui (e cadastrar de novo depois).
async function afterRecovery(){let n=0;try{n=(await SKYID.listPasskeys()).list.length}catch(e){return}
 say('','✔ Recuperação concluída: a chave do aparelho antigo e o código usado não valem mais, e as sessões antigas foram encerradas.',1);
 if(!n)return;let yes=false;
 try{yes=confirm('Recuperação concluída.\n\nSua conta tem '+n+' passkey'+(n>1?'s':'')+' cadastrada'+(n>1?'s':'')+'. Se alguma estava no aparelho perdido, revogue agora.\n\nOK = revogar todas (você cadastra de novo em Segurança) · Cancelar = manter')}catch(e){}
 if(yes)SKYID.removeAllPasskeys().then(()=>say('','✔ Passkeys antigas revogadas. Cadastre uma nova em 🔐 Segurança.',1)).catch(e=>say('','⚠ '+identityMsg(e),1))}
// ---------- chat / rede ----------
function setB(id,ic,t,n){const e=$(id);if(!e)return;e.innerHTML=ic+(n?'<sup>'+n+'</sup>':'');const label=n?t+' · '+n+(/chat/i.test(t)?' nova(s)':'') : t;e.title=label;e.setAttribute('aria-label',label)}
// Pedido de recuperação em carência: quem entra com a chave principal precisa saber para cancelar a tempo (o pedido pode ter vindo de um código vazado).
function recoverAlert(until){const t=fmtWhen(until);
 say('','⚠ Alguém pediu para trocar a chave da sua conta (vale a partir de '+t+'). Se não foi você, abra 🔐 Segurança e cancele o pedido.',1);
 let yes=false;try{yes=confirm('Alguém pediu para recuperar esta conta com o código de recuperação. O pedido passa a valer em '+t+'.\n\nSe NÃO foi você, cancele agora.\n\nOK = cancelar o pedido · Cancelar = deixar como está')}catch(e){}
 if(yes)SKYID.cancelRecovery().then(()=>say('','✔ Pedido de recuperação cancelado. Se o seu código de recuperação vazou, gere uma nova chave em Segurança.',1)).catch(e=>say('','⚠ '+identityMsg(e),1))}
// ---------- pedir e mostrar o código de recuperação (a chave nunca fica guardada no aparelho; ver assets/identity.js) ----------
// O identity.js decide QUANDO precisa do código; aqui fica só a tela. `tentar(código)` devolve {ok,value} ou {ok:false,msg}: a janela só fecha
// com um código que confere (ou ao cancelar) e apaga o campo ao fechar.
const CODE_WHY={recover:'Para restaurar esta conta neste aparelho, cole o código de recuperação que você guardou.','rotate-primary':'Para trocar a chave deste aparelho, cole o código de recuperação que você guardou.','rotate-recovery':'Para gerar uma nova chave de recuperação, cole o código atual que você guardou.',confirm:'Cole o código que você guardou. Se conferir, a cópia da chave de recuperação que este aparelho ainda tem é removida daqui.',refresh:'Cole o código que você guardou para receber uma versão atualizada, com seus amigos e visual de agora.',backup:'Cole o código que você guardou para incluí-lo no backup protegido por senha.'};
function askRecoveryCode(why,tentar){return new Promise(res=>{
 const m=$('#pCode'),inp=$('#codeIn'),err=$('#codeErr'),go=$('#codeGo'),no=$('#codeNo'),prev=document.activeElement;let busy=false;
 $('#codeWhy').textContent=CODE_WHY[why]||'Cole o código de recuperação que você guardou.';inp.value='';err.textContent='';m.classList.remove('hide');inp.focus();
 const fim=v=>{if(busy&&v===null)return;m.classList.add('hide');inp.value='';go.onclick=no.onclick=inp.onkeydown=m.onkeydown=null;try{if(prev&&prev.focus)prev.focus()}catch(e){}res(v)};
 go.onclick=async()=>{if(busy)return;const c=inp.value.trim();if(!c){err.textContent='⚠ Cole o código.';return}busy=true;go.disabled=true;err.textContent='Conferindo…';let r;try{r=await tentar(c)}catch(e){r={ok:false,msg:(e&&e.message)||'Código inválido.'}}busy=false;go.disabled=false;if(r.ok)fim(r.value);else{err.textContent='⚠ '+(r.msg||'Código inválido.');inp.select()}};
 no.onclick=()=>fim(null);inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go.onclick()}};m.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();fim(null)}}})}
// O código novo aparece ANTES de a troca valer: o jogador precisa copiar ou mostrar (e guardar) para poder continuar.
// Na recuperação (why 'recover') o código colado vale uma vez: o novo aparece antes do pedido e passa a valer junto com a troca da chave.
const CODE_NEW_P={recover:'O código que você colou <b>vale uma vez só</b>. Este é o seu código <b>novo</b>: guarde-o <b>fora deste aparelho</b> (um gerenciador de senhas ou um papel). Ele passa a valer quando a recuperação terminar (normalmente em 24 h); até lá, o antigo continua valendo.'};
function showNewRecoveryCode(code,why){return new Promise(res=>{
 const m=$('#pCodeNew'),v=$('#codeNewV'),eye=$('#codeNewEye'),cp=$('#codeNewCp'),msg=$('#codeNewMsg'),go=$('#codeNewGo'),no=$('#codeNewNo'),prev=document.activeElement;let shown=false,seen=false;
 const para=$('#codeNewP');if(para){if(!para.dataset.std)para.dataset.std=para.innerHTML;para.innerHTML=CODE_NEW_P[why]||para.dataset.std}
 if(!go.dataset.std)go.dataset.std=go.textContent;go.textContent=why==='recover'?'Guardei, continuar':go.dataset.std;
 const paint=()=>{v.type=shown?'text':'password';eye.setAttribute('aria-pressed',String(shown));eye.textContent=shown?'🙈':'👁';eye.title=eye.ariaLabel=shown?'Ocultar o código':'Mostrar o código'};
 v.value=code;msg.textContent='';paint();m.classList.remove('hide');cp.focus();
 const fim=ok=>{m.classList.add('hide');v.value='';v.type='password';eye.onclick=cp.onclick=go.onclick=no.onclick=m.onkeydown=null;try{if(prev&&prev.focus)prev.focus()}catch(e){}res(ok)};
 eye.onclick=()=>{shown=!shown;if(shown)seen=true;paint()};
 cp.onclick=async()=>{try{await navigator.clipboard.writeText(code);seen=true;msg.textContent='✔ Código copiado. Cole num gerenciador de senhas ou anote em papel.'}catch(e){msg.textContent='Não deu para copiar. Toque no olho e anote o código.'}};
 go.onclick=()=>{if(!seen){msg.textContent='Copie ou mostre o código antes de trocar: sem ele você não recupera a conta.';return}fim(true)};
 no.onclick=()=>fim(false);m.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();fim(false)}}})}
if(window.SKYID)SKYID.setUi({askCode:askRecoveryCode,confirmNew:showNewRecoveryCode,profile:profileNow});
// Aviso único por sessão: conta nova precisa guardar o código AGORA; conta antiga ainda tem a chave de recuperação neste aparelho.
let recNoticed=false;
function recoveryNotice(){if(recNoticed||!window.SKYID)return;const st=SKYID.status();if(!st||!st.hasPrimary||st.recoveryChecked||!st.codeReady)return;recNoticed=true;
 say('',st.recoveryOnDevice?'🔐 Atualização de segurança: este aparelho ainda guarda a chave de recuperação da sua conta. Guarde o código e confira em 🔐 Segurança para removê-la daqui.':'🔑 Guarde seu código de recuperação em 🔐 Segurança. Ele só aparece nesta sessão e não fica guardado neste aparelho.',1)}
let unread=0;
function chatToggle(show){const c=$('#chat'),want=show===undefined?c.classList.contains('hide'):show;c.classList.toggle('hide',!want);if(want){unread=0;setB('#bChat','💬','Chat');clampPanels();$('#log').scrollTop=$('#log').scrollHeight}}
function linkify(d,t){const re=/https?:\/\/[^\s<>"']+/gi;let last=0,m;while((m=re.exec(t))){if(m.index>last)d.append(document.createTextNode(t.slice(last,m.index)));let u=null;try{u=new URL(m[0]);if(u.protocol!=='http:'&&u.protocol!=='https:')u=null}catch(e){}
 if(u){const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer nofollow';a.textContent=m[0].length>60?m[0].slice(0,57)+'…':m[0];a.className=/(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname)?'lk yt':'lk';a.onclick=ev=>{if(!confirm('Abrir link externo?\n'+u.href))ev.preventDefault()};d.append(a)}else d.append(document.createTextNode(m[0]));last=m.index+m[0].length}
 if(last<t.length)d.append(document.createTextNode(t.slice(last)))}
// id: quem escreveu (mensagens da sala); com ele o nome sai com a cor e o efeito que a pessoa escolheu (nameFx, app-avatar.js)
function say(n,t,sys,id){const d=document.createElement('div');if(sys){d.textContent=t;d.style.opacity=.75}else{const b=document.createElement('b'),s=document.createElement('span'),a=id==null?null:id===me.id?me:actors.get(id);s.textContent=n;if(a)nameFx(s,a===me?cfg:a.cfg);b.append(s,': ');d.append(b);linkify(d,t)}const L=$('#log');L.append(d);L.scrollTop=L.scrollHeight;if(mode==='play'&&$('#chat').classList.contains('hide')){unread++;setB('#bChat','💬','Chat',unread)}while(L.children.length>80)L.firstChild.remove()}
function send(m){if(ws&&ws.readyState===1)ws.send(JSON.stringify(m))}
// Visual sempre válido antes de ir para o servidor: cada campo do editor é um inteiro dentro da lista (0 se faltar ou sair da faixa).
// O servidor recusa a mensagem inteira se um campo vier errado; antes, um campo vazio (null) impedia de criar ou entrar numa sala.
function fixCfg(){EDS.forEach(d=>{const n=(d.c||d.v).length,x=cfg[d.k];if(!Number.isInteger(x)||x<0||x>=n)cfg[d.k]=0});return cfg}
let cfgTm=0;function sendCfg(){if(cfgTm)return;cfgTm=setTimeout(()=>{cfgTm=0;send({t:'cfg',cfg:{...fixCfg()}})},250)}
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
{const ag=adultCheck();if(ag!=='ok'||!termsOk()){$('#terr').textContent=ag!=='ok'?'⚠ Para jogar, confirme que tem 18 anos ou mais e aceite os Termos de Uso e a Política de Privacidade.':'⚠ Para jogar, leia e aceite os Termos de Uso e a Política de Privacidade.';$('#serr').textContent='Confira os termos para jogar.';$('#terms').classList.add('bad');if(ag!=='ok')$('#tAdult').focus();else openTerms();return}}
 $('#terms').classList.remove('bad');$('#terr').textContent='';
 $('#name').removeAttribute('aria-invalid');$('#nerr').textContent='';cfg.name=nm_;me.name=cfg.name;saveNow();$('#serr').textContent='';
 if(ws||connecting)return;
 connecting=true;
 let ticket='';
 try{ticket=await getTicket()}catch(e){connecting=false;if(!ws)$('#serr').textContent=e&&e.message||'Não foi possível conectar.';return}
 connecting=false;
 if(ws)return;
 let w;try{w=new WebSocket(wsUrl(ticket))}catch(e){$('#serr').textContent='Não foi possível conectar. Tente novamente em instantes.';return}
 ws=w;w.onopen=async()=>{if(ws!==w)return;
  pkClose();SKYID.bind(send);
  let id;
  try{id=await SKYID.ensure()}
  catch(e){if(ws!==w)return;ws.onclose=null;try{w.close()}catch(x){};ws=null;$('#serr').textContent=identityMsg(e);return}
  if(ws!==w)return;
  if(id.pending)setTimeout(()=>recoverAlert(id.pending),1500);
  if(id.recovered)setTimeout(afterRecovery,1500);
  if(id.recovery==='applied')setTimeout(()=>say('','✔ A troca da chave de recuperação foi confirmada: vale o código novo.',1),1500);
  else if(id.recovery==='dropped')setTimeout(()=>say('','⚠ A troca da chave de recuperação não foi aplicada: continue usando o código anterior.',1),1500);
  send({...first,name:cfg.name,cfg:{...fixCfg()},token:id.token,...(id.k?{k:id.k}:{})})};
 w.binaryType='arraybuffer';w.onmessage=onMsg;
 w.onerror=()=>{if(mode==='menu'&&ws===w)$('#serr').textContent='O jogo está indisponível no momento. Tente novamente em instantes.'};
 w.onclose=e=>{if(ws!==w)return;ws=null;
  if(e.code===4001){if(mode==='play'){say('','Você foi desconectado por segurança. Entre de novo.',1);leave()}else $('#serr').textContent='Sua sessão de identidade foi encerrada. Entre novamente.';return}
  if(mode==='play'&&(e.code===1008||e.code===1009)){say('',e.code===1008?'Conexão encerrada por segurança.':'Mensagem muito longa: a conexão foi encerrada.',1);leave();return}
  if(mode==='play'&&session&&!recon)beginReconnect();
  else if(mode==='menu'&&!$('#serr').textContent)$('#serr').textContent='A conexão foi encerrada. Tente novamente.'}}
function setReconTry(t){$('#reconTry').textContent=t||''}
function showRecon(fatal,msg){
 $('#recon').classList.remove('hide');
 $('#reconTitle').textContent=fatal?'Não foi possível reconectar':'Reconectando…';
 $('#reconMsg').textContent=msg||(fatal?'Você foi desconectado.':'Sua conexão caiu. Estamos tentando voltar para a sala.');
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
 if(!session)return reconFatal('Sua vaga na sala não existe mais. Entre de novo com o código da sala.');
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
 w.onopen=()=>{if(recon&&!recon.fatal&&session&&ws===w){SKYID.bind(send);send({t:'resume',code:session.code,token:session.token})}};
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
 showRecon(true,(msg||'Você foi desconectado.')+(roomCode?' Código da sala: '+fmtCode(roomCode)+'.':''));
}
function reconDone(){
 if(recon){if(recon.timer)clearTimeout(recon.timer);recon=null}
 hideRecon();
}
// termos: as duas caixas precisam estar marcadas; a escolha fica salva neste navegador
// idade: uma caixa "Tenho 18 anos ou mais" (autodeclaração). Só fica salvo "maior de 18 confirmado" (skyke_adult) neste navegador.
const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}};
const adultCheck=()=>{if(!$('#tAdult').checked)return 'empty';LS('skyke_adult','1');return 'ok'};
$('#tAdult').checked=LS('skyke_adult')==='1';LS('skyke_age_block',null);// o bloqueio de 24 h da data de nascimento não existe mais
$('#tAdult').onchange=()=>{LS('skyke_adult',$('#tAdult').checked?'1':null);$('#terms').classList.remove('bad');$('#terr').textContent=''};
// Termos de Uso e Política de Privacidade: um documento só (o mesmo de /termos), aberto numa janela do jogo, sem nova aba. A confirmação
// só libera depois de rolar o texto até o fim. O aceite fica salvo com a versão do documento: se a versão mudar, o aceite é pedido de novo.
const TERMS_VER='2026-11-07.1';
const termsOk=()=>LS('skyke_terms')===TERMS_VER;
function termsView(){$('#tState').textContent=termsOk()?'✔ Aceitos (versão de '+TERMS_VER.slice(8,10)+'/'+TERMS_VER.slice(5,7)+'/'+TERMS_VER.slice(0,4)+'). Toque para ler de novo.':'Ainda não aceitos: leia até o fim e confirme.';$('#tState').classList.toggle('ok',termsOk())}
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
$('#go').onclick=()=>start({t:'create',style:cfg.style,bots:Math.max(0,Math.min(20,parseInt($('#bn').value)||0))});
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
function onMsg(ev){if(typeof ev.data!=='string'){if(ev.data instanceof ArrayBuffer&&ev.data.byteLength){if(new Uint8Array(ev.data,0,1)[0]===2)vwsRx(ev.data);else stUnpack(ev.data)}return}let m;try{m=JSON.parse(ev.data)}catch(e){return}
 if(window.SKYID&&SKYID.onMessage(m))return;
switch(m.t){
case 'err':{const msg=typeof m.msg==='string'?m.msg.slice(0,300):'Erro inesperado.';
 if(m.scope==='resume'){
  if(recon){if(m.retry)setReconTry(msg);else reconFatal(msg)}
  else if(mode==='play'){say('',msg,1);leave()}else $('#serr').textContent=msg;
  break}
 if(recon){reconFatal(msg);break}
 if(mode==='play'){say('',msg,1);break}
 // nome já usado por outra pessoa online: avisa no campo do nome e oferece a sugestão do servidor num clique
 // (o aviso vai para perto do botão de entrar, que fica sempre à vista; o campo do nome fica marcado)
 if(m.field==='name'){const e=$('#serr'),sg=typeof m.sug==='string'?cleanName(m.sug):'';e.textContent='⚠ '+msg+' ';$('#nerr').textContent='⚠ Nome em uso.';$('#name').setAttribute('aria-invalid','true');
  if(sg){const b=document.createElement('button');b.type='button';b.className='lnk';b.textContent='Usar "'+sg+'"';b.onclick=()=>{$('#name').value=sg;e.textContent='';$('#nerr').textContent='';$('#name').removeAttribute('aria-invalid');saveSoon()};e.append(b)}
  if(ws){ws.onclose=null;try{ws.close()}catch(e){};ws=null}break}
 $('#serr').textContent=msg;if(ws){ws.onclose=null;try{ws.close()}catch(e){};ws=null}break}
case 'joined':{
 if(typeof m.code==='string'&&m.code.length===10&&typeof m.token==='string'&&m.token.length===43)session={code:m.code,token:m.token};else session=null;
 DJ.rk=typeof m.rk==='string'&&m.rk.length===43?m.rk:null;
 clkBurst();
 if(Number.isFinite(m.reconnect))RECON_MS=Math.max(100,Math.min(300000,m.reconnect));
 if(recon)reconDone();
 enter(m,!!m.resume);if(window.socEnter)window.socEnter();if(!m.resume)setTimeout(recoveryNotice,2500);break}
case 'pj':addActor(m.p);if(muted(m.p.id))vwsMute(m.p.id,true);if(mode==='play'){if(!m.p.bot)sfx('join',.8);say('',m.p.name+' entrou na sala.',1);if(m.p.talk)onRemoteSpeak(m.p.id);else if(me.talk)onLocalSpeak()}break;
case 'pl':{const a=actors.get(m.id);if(a&&mode==='play'){if(!a.bot)sfx('leave',.8);say('',a.name+' saiu da sala.',1)}delActor(m.id);break}
case 'host':hostId=m.id;updHost();break;
case 'st':{const now=performance.now();for(const[id,x,z,r,y,s]of m.s){const a=actors.get(id);if(a){snapPush(a,now,x,z,r,y);a.sit=!!s}}break}// formato antigo (JSON), se algum servidor ainda mandar
case 'fme':case 'fpres':case 'freq':case 'facc':case 'finv':case 'gchat':case 'gsys':case 'gn':case 'pfid':case 'ppid':case 'pubp':case 'plike':case 'gbook':case 'gblist':if(window.soc)window.soc(m);break;
case 'pet':case 'petres':case 'petsocial':if(window.petMsg)window.petMsg(m);break;
case 'cook':case 'cookr':case 'cookfx':if(window.cookMsg)window.cookMsg(m);break;
case 'farm':case 'farmr':case 'farmfx':if(window.farmMsg)window.farmMsg(m);break;
case 'gifts':case 'giftbox':case 'giftr':case 'giftin':if(window.giftMsg)window.giftMsg(m);break;
case 'chat':if(m.id&&muted(m.id))break;say(m.name,m.text,0,m.id);if(mode==='play'&&m.name!==me.name&&!(document.activeElement===$('#msg')&&!$('#chat').classList.contains('hide')))sfx('chat',.8);break;
case 'cfg':{const a=actors.get(m.id);if(a){a.cfg=m.cfg;dress(a.g,m.cfg)}break}
case 'gest':{if(muted(m.id))break;const a=actors.get(m.id);if(a&&(m.g==='stop'||!a.gest||performance.now()-a.gest.t0>1000))startGest(a,m.g);break}
case 'item':{const a=m.id===me.id?me:actors.get(m.id);if(!a)break;const it=ITEMS.find(i=>i.id===m.item)||null;if(!m.use){setHeld(a.g,it);if(it&&mode==='play'){const v=dvol(a);if(v>.03)sfx('pickup',v*.9)}}else if(it){if(!a.g.userData.item)setHeld(a.g,it);a.drink=1.6;{const v=dvol(a);if(v>.03)sfx(it.food?'eat':'drink',v)}if(it.mg)showEmo(a,'✨');if(it.food)setTimeout(()=>{setHeld(a.g,null);if(a===me)refreshItemBtns()},1500)}if(a===me)refreshItemBtns();break}
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
case 'rep':fb($('#repMsg'),!!m.ok);$('#repMsg').textContent=m.ok?(m.dup?'Você já denunciou essa pessoa há pouco. A denúncia anterior vale.':'✅ Denúncia enviada. Obrigado por ajudar a manter o jogo seguro.'):'⚠ '+String(m.err||'Não foi possível enviar.').slice(0,160);if(m.ok){$('#repNote').value=''}break;
case 'vsync':if(m.by===VW.owner&&!VW.ended)VW.apply(m);break;
case 'vend':if(m.by===VW.owner&&VW.id&&!VW.ctl)endedState(m.left);break;
case 'vbusy':closeVid(false);say('','Já há vídeos demais em andamento nesta sala. Tente de novo daqui a pouco.',1);break;
case 'vstop':{if(VW.id&&VW.owner===m.by&&(!VW.ctl||m.by===me.id)){closeVid(false);say('',m.why==='idle'?'O vídeo terminou e ninguém colocou outro: a janela foi fechada.':'O vídeo foi encerrado.',1)}if(pend&&pend.by===m.by){$('#vinv').classList.add('hide');pend=null}ntGone('video:'+m.by);delete INV[m.by];break}
case 'kar':{if(!m.q||!m.q.length||m.q.some(k=>k.id===me.id)){ntGone('karaoke');$('#kinvb').classList.add('hide')}const wk=isK(me.id),prev=kq[0]&&kq[0].id,pm=(kq.find(k=>k.id===me.id)||{}).vid;kq=m.q;kEnd=Date.now()+(m.left||0);renderK();syncK(m.turn);if(kq[0]&&kq[0].vid&&kq[0].id===me.id&&!stream)startMic();if(wk&&!isK(me.id)){say('','🎶 Você saiu da fila do karaokê.',1);$('#pKar').classList.add('hide');exitFullscreenIf($('#kstage'));setKMin(false)}const nv=(kq.find(k=>k.id===me.id)||{}).vid;if(pm&&nv===null){$('#ksong').value='';$('#pKar').classList.remove('hide');setKMin(false);say('','🎤 Sua vez acabou! Cole o link de uma nova música em Karaokê para cantar de novo.',1)}if(kMin&&kq[0]&&kq[0].id===me.id&&m.turn!==kTurn){const f=$('#kFloat');f.classList.remove('ring');void f.offsetWidth;f.classList.add('ring')}if(kq[0]&&kq[0].vid&&(kq[0].id!==prev||m.turn!==kTurn))say('','🎶 Vez de '+kq[0].name+' cantar!'+(kq[0].id===me.id&&!stream?' Ative o microfone para cantar!':''),1);kTurn=m.turn;break}
case 'ksync':KW.apply(m);break;
case 'kinv':if(isK(me.id)||muted(m.by))break;$('#kinvt').textContent='🎤 '+m.name+' abriu o karaokê! Quer participar?';$('#kinvb').classList.remove('hide');ntArm('karaoke','#kinvb','🎤 '+m.name+' abriu o karaokê. Quer participar?',kAccept);say('','🎤 '+m.name+' abriu o karaokê. Aceite no balão da tela.',1);break;
case 'emo':{if(muted(m.id))break;const a=m.id===me.id?me:actors.get(m.id);if(a&&Number.isInteger(m.i)&&m.i>=0&&m.i<EMO.length)showEmo(a,EMO[m.i]);break}
case 'sys':say('',m.text,1);break;
case 'sig':onSig(m);break;case 'vcodec':vwsCodec(m.opus);break;case 'vl':{const a=m.id===me.id?me:actors.get(m.id);if(a){a.vl=!!m.v;a._lk='';if(a!==me){syncSenders();onPeerListen(m.id,a.vl)}}break}case 'ice':if(m.ice&&Array.isArray(m.ice.iceServers)){iceApply(m.ice);iceAt=Date.now()}break}}
function enter(m,resume){
 const players=Array.isArray(m.players)?m.players:[];
 const self=(m.self&&m.self.id===m.id)?m.self:players.find(p=>p.id===m.id)||null;
 if(!resume)stopMusic();
 if(matchMedia('(pointer:coarse)').matches)$('#touchbar').classList.remove('hide');
 roomCode=typeof m.code==='string'?m.code:roomCode;lastMv='';muteLoad();
 PUBURL=(typeof m.url==='string'&&/^https?:\/\/[^\s]+$/.test(m.url))?m.url:'';
 if(m.ice&&Array.isArray(m.ice.iceServers))iceApply(m.ice);iceAt=Date.now();
 me.id=m.id;
 if(self&&typeof self.name==='string'){me.name=self.name.slice(0,LIMITS.name);cfg.name=me.name}
 hostId=m.host||null;if(!THEME[m.style])m.style=ST_LEGACY[m.style]||'amazora';cfg.style=m.style;
 [...actors.keys()].forEach(delActor);[...peers.keys()].forEach(id=>closePeer(id,false));vinReset();
 buildRoom(m.style);
 me.sit=!!(self&&self.s);me.seat=null;me.gest=null;me.drink=0;me.talk=false;me.vl=false;
 me.jy=self&&Number.isFinite(self.y)?self.y:0;me.vy=0;dest=null;camYaw=camYawS=0;
 me.g.position.set(self&&Number.isFinite(self.x)?self.x:0,0,self&&Number.isFinite(self.z)?self.z:5);
 me.g.rotation.y=self&&Number.isFinite(self.ry)?self.ry:0;
 setHeld(me.g,self&&self.item?ITEMS.find(i=>i.id===self.item)||null:null);
 players.forEach(p=>{if(p.id!==m.id)addActor(p)});
 mode='play';players.forEach(p=>{if(p.id!==m.id&&p.talk)onRemoteSpeak(p.id)});vinReset();vwsJoined(m.vopus);
 $('#start').classList.add('hide');['#hud','#chat','#bar'].forEach(s=>$(s).classList.remove('hide'));placeChat();clampPanels();
 $('#bInvite').title='Copiar convite · Sala '+fmtCode(roomCode);$('#bInvite').setAttribute('aria-label','Copiar convite da sala '+fmtCode(roomCode));$('#sBn').value=Number.isInteger(m.want)?m.want:0;
 kq=Array.isArray(m.kar)?m.kar:[];kEnd=Date.now()+(Number.isFinite(m.kl)?m.kl:0);kTurn=Number.isInteger(m.turn)?m.turn:-1;
 if(resume){kProbeSeq++;kProbe=false;$('#ksong').disabled=false;$('#kjoin').disabled=false;$('#kset').disabled=false}
 renderK();if(resume){exitFullscreenIf($('#kstage'));KW.close();$('#kwatch').classList.add('hide');$('#pKar').classList.remove('kvid');closeVid(false);$('#vinv').classList.add('hide');pend=null}syncK(kTurn);
 refreshItemBtns();updHost();
 say('',resume?'✅ Conexão restabelecida.':'Você entrou na sala '+fmtCode(roomCode)+'. Teclas: WASD mover · E pular · F sentar · Espaço usar item.',1);if(!resume)sfx('confirm');if(!resume&&/^[\w.+-]{1,20}$/.test(m.ver||''))say('','Skyke3D v'+m.ver,1)}
function leave(){
 if(window.socLeave)window.socLeave();
 if(recon){if(recon.timer)clearTimeout(recon.timer);recon=null}
 hideRecon();session=null;if(roomCode)$('#code').value=fmtCode(roomCode);
 mode='menu';if(window.petReset)window.petReset();$('#touchbar').classList.add('hide');unread=0;setB('#bChat','💬','Chat');startMusic();FX.splice(0).forEach(x=>scene.remove(x.p));kq=[];setKMin(false);kShowQ=false;kProbe=false;kProbeSeq++;$('#ksong').disabled=false;$('#kshowq').classList.add('hide');$('#bInvite').title='Copiar convite da sala';exitFullscreenIf($('#kstage'));KW.close();$('#kwatch').classList.add('hide');$('#pKar').classList.remove('kvid');closeVid(false);pend=null;['#vinv','#kinvb'].forEach(s=>$(s).classList.add('hide'));stopMic();
 if(ws){try{send({t:'leave'})}catch(e){}ws.onclose=null;try{ws.close(4000,'leave')}catch(e){}ws=null}
 [...actors.keys()].forEach(delActor);[...peers.keys()].forEach(id=>closePeer(id,false));vinReset();setHeld(me.g,null);clearTimeout(me.emoT);me.em.classList.remove('show');me.em.textContent='';me.id=null;me.sit=false;me.seat=null;me.gest=null;
 ['#gbBox','#hud','#chat','#bar','#pMochila','#pCook','#pVis','#pVid','#pDJ','#pSet','#pKar','#pKFila','#pEmo','#pPerf','#pSeg','#pPet'].forEach(s=>$(s).classList.add('hide'));djReset();ntReset();$('#start').classList.remove('hide');$('#log').innerHTML='';buildRoom(cfg.style);mark()}
$('#bExit').onclick=leave;
$('#reconNow').onclick=()=>reconNow();
$('#reconOut').onclick=()=>leave();
addEventListener('online',()=>{if(recon)reconNow()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&recon)reconNow()});
$('#tJump').onclick=()=>jump();$('#tSit').onclick=()=>toggleSit();$('#tUse').onclick=()=>useItem();
$('#bChat').onclick=()=>chatToggle();$('#cMin').onclick=()=>chatToggle(false);
$('#msg').addEventListener('focus',()=>{if(COARSE){const c=$('#chat');c.dataset.t=c.style.top;c.style.top='56px'}});$('#msg').addEventListener('blur',()=>{if(COARSE){const c=$('#chat');if(c.dataset.t)c.style.top=c.dataset.t}});
function tog(id){['#pMochila','#pCook','#pFarm','#pGift','#pVis','#pSet','#pKar','#pRep','#pPerf','#pSeg','#pPet'].forEach(s=>s!=='#'+id&&$(s).classList.add('hide'));
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
function muteSet(id,on){const a=actors.get(id);if(!a||!a.mk||a.bot)return;if(on)MUTE.add(a.mk);else MUTE.delete(a.mk);muteSave();vwsMute(id,on);
 const au=document.getElementById('au'+id);if(au)au.muted=on||!voiceOn();if(on)a.talk=false;a._lk='';
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
// Fixa a janela pela esquerda e pelo topo (as centralizadas por transform e as presas pela direita), antes de arrastar ou redimensionar:
// senão ela cresceria para o outro lado ou pularia. Usada aqui e em dragify (app-ui.js).
function pinPanel(p){p.style.left=(getComputedStyle(p).transform!=='none'?p.offsetLeft-p.offsetWidth/2:p.offsetLeft)+'px';p.style.top=p.offsetTop+'px';p.style.right='auto';p.style.bottom='auto';p.style.transform='none'}
// Tamanho do vídeo (Vídeos e Karaokê), sempre 16:9: entre 200 px e 88 % da largura / 60 % da altura da área da interface (UZ: ajuste Interface).
function vSize(bx,w){const z=typeof UZ==='function'?UZ():1;w=Math.max(200,Math.min(innerWidth*.88/z,innerHeight*.6/z*16/9,w));bx.style.width=w+'px';bx.style.height=(w*9/16)+'px';if(typeof clampPanels==='function')requestAnimationFrame(clampPanels)}
document.querySelectorAll('[data-rs]').forEach(b=>b.onclick=()=>{const bx=$(b.dataset.rs==='v'?'#vbox':'#kbox');vSize(bx,bx.offsetWidth*(1+b.dataset.d*.2))});
// Alça de redimensionar no canto inferior direito da JANELA (antes era o canto nativo da caixa do vídeo, que ficava no meio da janela e
// não aceitava toque): arrastar muda o tamanho do vídeo, a janela acompanha e a alça continua no canto. Mouse, toque e teclado (setas).
[['pVid','#vbox'],['pKar','#kbox']].forEach(([id,bs])=>{const p=$('#'+id),bx=$(bs),g=document.createElement('button');g.type='button';g.className='vgrip';g.title='Redimensionar o vídeo (arraste ou use as setas)';g.setAttribute('aria-label',g.title);p.append(g);
 g.onpointerdown=e=>{e.preventDefault();pinPanel(p);const z=UZ(),x0=e.clientX,y0=e.clientY,w0=bx.offsetWidth;g.setPointerCapture(e.pointerId);
  const mv=ev=>vSize(bx,w0+((ev.clientX-x0)+(ev.clientY-y0)*16/9)/2/z),up=()=>{g.removeEventListener('pointermove',mv);g.removeEventListener('pointerup',up);g.removeEventListener('pointercancel',up)};
  g.addEventListener('pointermove',mv);g.addEventListener('pointerup',up);g.addEventListener('pointercancel',up)};
 g.onkeydown=e=>{const d={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];if(!d)return;e.preventDefault();e.stopPropagation();pinPanel(p);vSize(bx,bx.offsetWidth+d*24)}});
