/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os'),net=require('net'),dns=require('dns'),{WebSocketServer}=require('ws');
const zlib=require('zlib');
const V=require('./validate'),CAP=require('./capacity');
const {rateKey,firstClientIp,normIp}=require('./netutil');
const {createRadio,REASONS:RADIO_WHY}=require('./radio');
const {createLimiter}=require('./limits');
const {issue:ticketIssue,verify:ticketVerify,createUsed}=require('./admission');
const compress=require('./compress'),assets=require('./assets');
const {readJsonFile,writeJsonAtomic}=require('./persist'),{hookBody}=require('./report-hook'),{createRecords}=require('./records'),{createBanManager}=require('./banmgr'),{createReports}=require('./reports'),{createSurvStats}=require('./survstats'),{createPlayerStats,CODE_RE:PCODE_RE}=require('./playerstats'),SKYREC=require('./assets/recovery.js'),SV=require('./survival'),SKYMAP=require('./assets/survmap.js'),SURVIVAL_CFG=require('./assets/catalog.js').SURV;
const botChat=require('./bots'),{censor}=require('./profanity');
const VER=(()=>{try{return String(require('./package.json').version).slice(0,20)}catch(e){return''}})();
const radio=createRadio({maxHubs:+(process.env.DJ_MAX_HUBS||10)});
const {monitorEventLoopDelay}=require('perf_hooks');
const {FOOD,CODE_ALPHABET,cleanCfg,clampPos,normalizeMessage}=V;
function envInt(name,def,min,max){
 const raw=process.env[name];
 if(raw===undefined||raw==='')return def;
 if(!/^\d+$/.test(raw)){console.error(name+' inválido: use um inteiro entre '+min+' e '+max+'.');process.exit(1)}
 const n=+raw;
 if(n<min||n>max){console.error(name+' inválido: use um inteiro entre '+min+' e '+max+'.');process.exit(1)}
 return n;
}
const SURV_SPEED=(()=>{const n=+process.env.SURVIVAL_SPEED;return Number.isFinite(n)?Math.max(1,Math.min(60,n)):1})();// só para testes: acelera o relógio das rodadas
const SURVIVAL_ON=!/^(0|false|no|off)$/i.test(String(process.env.SURVIVAL===undefined?'1':process.env.SURVIVAL));
const PORT=envInt('PORT',3000,0,65535),KDEF=780000,KEXTRA=21000,KMAX=780000,PERIP=envInt('PERIP',6,1,1000),HTTP_RATE=envInt('HTTP_RATE',120,0,1000000);
const PERIP_RATE=envInt('PERIP_RATE',30,1,1000000),PERIP_ROOM=envInt('PERIP_ROOM',2,1,1000),GLOBAL_RATE=envInt('GLOBAL_RATE',180,0,1000000),MAXBOTS=envInt('MAXBOTS',200,0,100000);
// Limites de capacidade (ajustáveis pelo painel /status e guardados em CAPACITY_FILE): salas, jogadores por sala e, a partir deles, conexões.
// Ordem: padrão → variáveis de ambiente MAXROOMS e MAX_PER_ROOM → arquivo salvo pelo painel. Os tetos de projeto estão em capacity.js.
const CAP_FILE=(()=>{const f=process.env.CAPACITY_FILE===undefined?path.join(__dirname,'data','capacity.json'):String(process.env.CAPACITY_FILE);return f==='0'?'':f})();
let MAXROOMS=envInt('MAXROOMS',CAP.DEFAULTS.rooms,CAP.ABS.minRooms,CAP.ABS.maxRooms),MAX=envInt('MAX_PER_ROOM',CAP.DEFAULTS.perRoom,CAP.ABS.minPerRoom,CAP.ABS.maxPerRoom);
{const v=CAP.validate(MAXROOMS,MAX);if(!v.ok){console.error('MAXROOMS × MAX_PER_ROOM: '+v.erro);process.exit(1)}
 const f=CAP.loadFile(CAP_FILE);if(f){MAXROOMS=f.rooms;MAX=f.perRoom}}
const maxConn=()=>CAP.connLimit(MAXROOMS,MAX);
const TICKET_MODE=(()=>{const m=String(process.env.TICKET_MODE||'warn').toLowerCase();return m==='off'||m==='enforce'?m:'warn'})();
const TICKET_RATE=envInt('TICKET_RATE',20,0,1000000),POW_MAX=envInt('POW_MAX',16,0,24),TICKET_TTL=60000;
const BAN_ON=!/^(0|false|no|off)$/i.test(String(process.env.BAN===undefined?'1':process.env.BAN));
const RECORDS_FILE=(()=>{const f=process.env.RECORDS_FILE===undefined?path.join(__dirname,'data','records.json'):String(process.env.RECORDS_FILE);return f==='0'?'':f})();
const SURVSTATS_FILE=(()=>{const f=process.env.SURVSTATS_FILE===undefined?path.join(__dirname,'data','survival.json'):String(process.env.SURVSTATS_FILE);return f==='0'?'':f})();
const PLAYERSTATS_FILE=(()=>{const f=process.env.PLAYERSTATS_FILE===undefined?path.join(__dirname,'data','players.json'):String(process.env.PLAYERSTATS_FILE);return f==='0'?'':f})();
const REPORTS_FILE=(()=>{const f=process.env.REPORTS_FILE===undefined?path.join(__dirname,'data','reports.json'):String(process.env.REPORTS_FILE);return f==='0'?'':f})();
// webhook do Discord para avisar de denúncias novas (opcional; só endereços de webhook do Discord são aceitos)
const REPORT_WEBHOOK=(()=>{const u=String(process.env.DISCORD_REPORT_WEBHOOK||'').trim();if(!u)return '';if(/^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,30}\/[\w-]{20,100}$/.test(u))return u;console.warn('DISCORD_REPORT_WEBHOOK ignorado: use a URL de um webhook do Discord.');return ''})();
const BAN_FILE=(()=>{const f=process.env.BAN_FILE===undefined?path.join(__dirname,'data','bans.json'):String(process.env.BAN_FILE);return f==='0'?'':f})();
const BAN_LEVELS=[120000,1800000,21600000],BAN_RESET=86400000,BAN_MAX=20000;
const BIND_HOST=process.env.BIND_HOST||'0.0.0.0';
const RECONNECT_MS=Math.max(100,Math.min(300000,Number(process.env.RECONNECT_MS)||30000));
const TURN_URLS=String(process.env.TURN_URL||'').split(',').map(x=>x.trim()).filter(Boolean).filter(u=>{
 if(/^turns?:[^\s]+$/i.test(u))return true;
 console.warn('TURN_URL ignorado (use turn: ou turns:): '+u);return false;
});
const TURN_USER=process.env.TURN_USER||'',TURN_PASS=process.env.TURN_PASS||'',TURN_SECRET=process.env.TURN_SECRET||'';
const TURN_HAS_STATIC=!!(TURN_USER&&TURN_PASS);
const TURN_TTL=envInt('TURN_TTL',3600,60,86400);
const TURN_LABEL=(process.env.TURN_LABEL||'skyke3d').replace(/[^A-Za-z0-9_.-]/g,'-').slice(0,64)||'skyke3d';
const TURN_ALLOW_STATIC=/^(1|true|yes|on)$/i.test(String(process.env.TURN_ALLOW_STATIC||''));
if(process.env.RELAY_ONLY)console.warn('RELAY_ONLY foi removido: o TURN agora é usado apenas como fallback (iceTransportPolicy=all).');
// ---------- privacidade da voz ----------
// VOICE_PRIVACY=relay (padrão): a voz só passa pelo servidor TURN e ninguém vê o IP de ninguém. O navegador recebe iceTransportPolicy 'relay'
// e, como um cliente modificado poderia ignorar isso, o próprio servidor filtra a sinalização: só candidatos do tipo relay chegam ao outro
// jogador, sem o endereço de origem (raddr), e as linhas de endereço do SDP são zeradas. Sem TURN configurado, a voz fica desligada.
// VOICE_PRIVACY=direct volta à voz direta entre os navegadores (cada um vê o IP do outro); só para desenvolvimento ou rede confiável.
const VOICE_PRIVACY=String(process.env.VOICE_PRIVACY||'relay').toLowerCase()==='direct'?'direct':'relay';
const TURN_OK=()=>TURN_URLS.length>0&&!!(TURN_SECRET||TURN_HAS_STATIC);
const VOICE_ON=()=>VOICE_PRIVACY==='direct'||TURN_OK();
const noRaddr=s=>s.replace(/ raddr \S+ rport \d+/g,' raddr 0.0.0.0 rport 0');
const relayCand=c=>c===''||/ typ relay(?: |$)/.test(c);
function relaySdp(sdp){return sdp.split(/\r?\n/).filter(l=>!(l.startsWith('a=candidate:')&&!relayCand(l.slice(2)))).map(l=>
 l.startsWith('a=candidate:')?noRaddr(l):l.startsWith('c=IN IP4 ')?'c=IN IP4 0.0.0.0':l.startsWith('c=IN IP6 ')?'c=IN IP6 ::':/^a=rtcp:\d+ IN IP[46] /.test(l)?l.replace(/ IN IP[46] .*$/,' IN IP4 0.0.0.0'):l).join('\r\n')}
// devolve a sinalização só com o que pode passar, ou null para descartar (candidato com IP real)
function voiceSig(data){if(VOICE_PRIVACY!=='relay')return data;
 if(data.d)return{d:{type:data.d.type,sdp:relaySdp(data.d.sdp)}};
 if(data.c){if(!relayCand(data.c.candidate))return null;return{c:{...data.c,candidate:noRaddr(data.c.candidate)}}}
 return data}
function iceCfg(){
 const ice=VOICE_PRIVACY==='relay'?[]:[{urls:'stun:stun.l.google.com:19302'}];
 if(TURN_URLS.length&&(TURN_SECRET||TURN_HAS_STATIC)){
  let u=TURN_USER,c=TURN_PASS;
  if(TURN_SECRET){
   u=String(Math.floor(Date.now()/1000)+TURN_TTL)+':'+TURN_LABEL;
   c=crypto.createHmac('sha1',TURN_SECRET).update(u).digest('base64');
  }
  ice.push({urls:TURN_URLS,username:u,credential:c});
 }
 return VOICE_PRIVACY==='relay'?{iceServers:ice,policy:'relay',voice:VOICE_ON()}:{iceServers:ice,voice:true};
}

function parseOrigin(raw){
 if(typeof raw!=='string')return null;
 const s=raw.trim();
 if(!s||s!==raw||s==='null'||s.endsWith('/'))return null;
 let u;try{u=new URL(s)}catch(e){return null}
 if(u.protocol!=='http:'&&u.protocol!=='https:')return null;
 if(u.pathname!=='/'||u.search||u.hash||u.username||u.password)return null;
 return {origin:u.origin,scheme:u.protocol.slice(0,-1),host:u.hostname.toLowerCase(),port:u.port?+u.port:null};
}
function parseHost(raw){
 if(typeof raw!=='string')return null;
 const s=raw.trim();
 if(!s||s!==raw||/[\s/\\@?#]/.test(s))return null;
 let u;try{u=new URL('http://'+s)}catch(e){return null}
 if(u.pathname!=='/'||u.search||u.hash||u.username||u.password)return null;
 const host=u.hostname.toLowerCase();
 if(!host)return null;
 let port=u.port?+u.port:null;
 if(port===80||port===443)port=null;
 return {host,port};
}
const hostKey=(host,port)=>port?host+':'+port:host;
function publicHost(host){
 let h=String(host||'').toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
 if(!h||net.isIP(h))return false;
 return h!=='localhost'&&!h.endsWith('.localhost')&&!h.endsWith('.local')&&!h.endsWith('.ts.net');
}

const PUBLIC_URL=(()=>{
 const raw=(process.env.PUBLIC_URL||'').trim().replace(/\/+$/,'');
 if(!raw)return '';
 const o=parseOrigin(raw);
 if(!o||o.scheme!=='https'||!publicHost(o.host)){
  console.error('PUBLIC_URL inválida: use um domínio público em https, ex.: https://jogo.exemplo.com');
  process.exit(1);
 }
 return o.origin;
})();
const PROD=!!PUBLIC_URL;
if(VOICE_PRIVACY==='relay'&&!TURN_OK())console.warn('Voz desligada: VOICE_PRIVACY=relay exige um servidor TURN (TURN_URL + TURN_SECRET). Para voz direta, sem esconder o IP, use VOICE_PRIVACY=direct.');
if(TURN_URLS.length){
 if(PROD&&!TURN_SECRET&&!TURN_ALLOW_STATIC){
  console.error('TURN_SECRET é obrigatório em produção quando TURN_URL está definido. Use TURN_ALLOW_STATIC=1 apenas para aceitar credenciais estáticas conscientemente.');
  process.exit(1);
 }
 if(!TURN_SECRET&&TURN_HAS_STATIC)console.warn((PROD?'TURN com credenciais estáticas permitido por TURN_ALLOW_STATIC=1.':'TURN usando credenciais estáticas (desenvolvimento).')+' Prefira TURN_SECRET.');
 if(!TURN_SECRET&&!TURN_HAS_STATIC)console.warn('TURN_URL definido sem TURN_SECRET nem TURN_USER/TURN_PASS: o TURN será ignorado.');
 if(TURN_SECRET&&TURN_HAS_STATIC)console.warn('TURN_USER/TURN_PASS ignorados porque TURN_SECRET está definido.');
}else if(TURN_SECRET){
 console.warn('TURN_SECRET definido sem TURN_URL: nenhum servidor TURN será anunciado.');
}

const ORIGINS=(()=>{
 const out=new Set();
 for(const raw of String(process.env.ORIGINS||'').split(',')){
  const s=raw.trim();if(!s)continue;
  const o=parseOrigin(s);
  if(!o){console.warn('ORIGINS ignorado (origem inválida): '+s);continue}
  if(PROD&&o.scheme!=='https'){console.warn('ORIGINS ignorado (produção exige https): '+s);continue}
  out.add(o.origin);
 }
 return out;
})();

const ALLOWED_HOSTS=(()=>{
 const out=new Set();
 if(PUBLIC_URL){const u=new URL(PUBLIC_URL);out.add(hostKey(u.hostname.toLowerCase(),u.port?+u.port:null))}
 for(const o of ORIGINS){const u=new URL(o);out.add(hostKey(u.hostname.toLowerCase(),u.port?+u.port:null))}
 for(const raw of String(process.env.ALLOWED_HOSTS||'').split(',')){
  const s=raw.trim();if(!s)continue;
  const h=parseHost(s);
  if(!h){console.warn('ALLOWED_HOSTS ignorado (host inválido): '+s);continue}
  out.add(hostKey(h.host,h.port));
 }
 return out;
})();

const TRUST_PROXY=(()=>{
 const raw=process.env.TRUST_PROXY===undefined?'127.0.0.1,::1':process.env.TRUST_PROXY;
 const list=new net.BlockList();
 for(const rawEntry of raw.split(',')){
  const s=rawEntry.trim();if(!s)continue;
  try{
   if(s.includes('/')){
    const [addr,bits]=s.split('/');
    const type=net.isIP(addr);
    if(!type||!Number.isInteger(+bits))throw new Error('cidr');
    list.addSubnet(addr,+bits,type===6?'ipv6':'ipv4');
   }else{
    const type=net.isIP(s);
    if(!type)throw new Error('ip');
    list.addAddress(s,type===6?'ipv6':'ipv4');
   }
  }catch(e){console.warn('TRUST_PROXY ignorado: '+s)}
 }
 return list;
})();
const TRUST_CF_CONNECTING_IP=/^(1|true|yes|on)$/i.test(String(process.env.TRUST_CF_CONNECTING_IP||''));
const trustedIp=ip=>{const type=net.isIP(ip);return !!type&&TRUST_PROXY.check(ip,type===6?'ipv6':'ipv4')};
function ipOf(q){
 return firstClientIp({
  remote:q.socket.remoteAddress||'?',
  xff:oneHeader(q,'x-forwarded-for'),
  cf:oneHeader(q,'cf-connecting-ip'),
  cfEnabled:TRUST_CF_CONNECTING_IP,
  trusted:trustedIp
 });
}
function devHostAllowed(host){
 let h=String(host||'').toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
 if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.ts.net'))return true;
 if(h.startsWith('::ffff:')&&net.isIP(h.slice(7))===4)h=h.slice(7);
 const v=net.isIP(h);
 if(v===4){
  const p=h.split('.').map(Number);
  return p[0]===127||p[0]===10||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127)||(p[0]===169&&p[1]===254);
 }
 if(v===6)return h==='::1'||h.startsWith('fc')||h.startsWith('fd')||h.startsWith('fe80:');
 return false;
}
function hostAllowed(h){
 if(!h)return false;
 if(ALLOWED_HOSTS.has(hostKey(h.host,h.port)))return true;
 return !PROD&&devHostAllowed(h.host);
}
function originAllowed(o,h){
 if(!o||!h)return false;
 if(PROD&&o.scheme!=='https')return false;
 if(ORIGINS.has(o.origin))return true;
 const np=p=>p===80||p===443?null:p;
 return o.host===h.host&&np(o.port)===np(h.port);
}
function oneHeader(req,name){
 let val=null,count=0;
 for(let i=0;i<req.rawHeaders.length;i+=2){
  if(String(req.rawHeaders[i]).toLowerCase()===name){count++;val=req.rawHeaders[i+1]}
 }
 return count===1?val:null;
}
function queryParam(url,name){
 const s=String(url||''),i=s.indexOf('?');
 if(i<0)return null;
 for(const part of s.slice(i+1).split('&')){
  const j=part.indexOf('=');
  if(j>0&&part.slice(0,j)===name){try{return decodeURIComponent(part.slice(j+1))}catch(e){return null}}
 }
 return null;
}
// Dificuldade da prova de trabalho: zero em regime normal, sobe sob pressão.
function ticketBits(ip){
 if(TICKET_MODE!=='enforce'||POW_MAX<=0)return 0;
 if(countHits(ip,'tk',60000)>=6||countHits(ip,'cr',60000)+countHits(ip,'jn',60000)>=6)return Math.min(POW_MAX,14);
 if(GLOBAL_RATE>0&&countHits('@','adm',60000)>=Math.max(1,Math.floor(GLOBAL_RATE*.6)))return Math.min(POW_MAX,12);
 return 0;
}

function ifNoneMatch(q,etag){
 return String(q.headers['if-none-match']||'').split(',').some(x=>x.trim()===etag);
}
function sendCached(q,s,asset,type,cache){
 const {enc,buf}=compress.pick(asset.v,q.headers['accept-encoding']),etag=compress.etagFor(asset.etag,enc);
 const h={...HDR,'Content-Type':type,'Cache-Control':cache,'ETag':etag,'Vary':'Accept-Encoding','Content-Length':buf.length};
 if(enc)h['Content-Encoding']=enc;
 if(ifNoneMatch(q,etag)){delete h['Content-Length'];delete h['Content-Encoding'];s.writeHead(304,h);return s.end()}
 s.writeHead(200,h);s.end(q.method==='HEAD'?undefined:buf);
}
function plain(q,s,status,text,extra){
 s.writeHead(status,{...HDR,'Content-Type':'text/plain; charset=utf-8',...extra});
 s.end(q.method==='HEAD'?undefined:text);
}
function onRequest(q,s){
 try{
  const ip=rateKey(ipOf(q));
  const ban=banCheck(ip);
  if(ban){abuse.r429++;return plain(q,s,429,'429',{'Retry-After':String(Math.max(1,Math.ceil(ban/1000)))})}
  if(HTTP_RATE>0&&over(ip,'http',HTTP_RATE,60000)){abuse.r429++;return plain(q,s,429,'429',{'Retry-After':'60'})}
  const u=String(q.url||'').split('?')[0];
  if(u==='/status/ban'||u==='/status/unban'||u==='/status/capacity'||u==='/status/report'){
   if(q.method!=='POST')return plain(q,s,405,'405',{Allow:'POST'});
   return statusAction(q,s,ip,u);
  }
  if(u==='/jogador/criar'||u==='/jogador/trocar'||u==='/jogador/apagar'){
   if(q.method!=='POST')return plain(q,s,405,'405',{Allow:'POST'});
   if(!SURVIVAL_ON)return plain(q,s,404,'404');
   if(over(ip,'pjw',12,60000)){abuse.r429++;return plain(q,s,429,'429',{'Retry-After':'60'})}
   const J={...HDR,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},K=/^[A-Za-z0-9_-]{43}$/;
   return readJson(q,512,(e,b)=>{
    if(e||!b||typeof b!=='object'||typeof b.k!=='string'||!K.test(b.k)){s.writeHead(400,J);return s.end('{"erro":"pedido inválido"}')}
    const vc=SKYREC.viewCode(b.k);let ok=true;
    if(u==='/jogador/criar'){ok=PSTATS.register(vc,censor(typeof b.name==='string'?b.name:''))}
    else if(u==='/jogador/apagar')PSTATS.remove(vc);
    else{if(typeof b.n!=='string'||!K.test(b.n)){s.writeHead(400,J);return s.end('{"erro":"pedido inválido"}')}PSTATS.move(vc,SKYREC.viewCode(b.n))}
    s.writeHead(ok?200:409,J);s.end(ok?'{"ok":1}':'{"erro":"limite de páginas"}')})
  }
  if(q.method!=='GET'&&q.method!=='HEAD')return plain(q,s,405,'405',{Allow:'GET, HEAD'});
  {const pj=/^\/jogador\/([0-9A-Za-z-]{16,24})(\.json)?$/.exec(u);
   if(pj){
    if(!SURVIVAL_ON)return plain(q,s,404,'404');
    const NS={...HDR,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
    if(!pj[2]){s.writeHead(200,NS);return s.end(q.method==='HEAD'?undefined:PLAYER_HTML)}
    if(over(ip,'pj',40,60000)){abuse.r429++;return plain(q,s,429,'429',{'Retry-After':'60'})}
    const d=PSTATS.get(pj[1].replace(/-/g,'').toUpperCase());
    s.writeHead(d?200:404,{...NS,'Content-Type':'application/json; charset=utf-8'});return s.end(q.method==='HEAD'?undefined:d?JSON.stringify(d):'{"erro":"não encontrada"}');
   }}
  if(u==='/ticket'){
   if(TICKET_MODE==='off')return plain(q,s,404,'404');
   if(TICKET_RATE>0&&over(ip,'tk',TICKET_RATE,60000)){abuse.r429++;return plain(q,s,429,'429',{'Retry-After':'60'})}
   const t=ticketIssue({secret:TICKET_SECRET,ipKey:ip,bits:ticketBits(ip),ttlMs:TICKET_TTL});
   s.writeHead(200,{...HDR,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
   return s.end(q.method==='HEAD'?undefined:JSON.stringify(t));
  }
  if(u==='/status'||u==='/status.json'||u==='/status/players.json'||u==='/status/reports.json'){
   if(!STATUS_ON)return plain(q,s,404,'404');
   if(u==='/status'){s.writeHead(200,{...HDR,'Cache-Control':'no-store','X-Robots-Tag':'noindex'});return s.end(q.method==='HEAD'?undefined:STATUS_HTML)}
   const J=statusHeaders();
   if(!statusAuth(q,s,ip,J))return;
   if(u==='/status/reports.json'){s.writeHead(200,J);return s.end(q.method==='HEAD'?undefined:JSON.stringify({reports:reports.map(repPublic),webhook:!!REPORT_WEBHOOK,persisted:!!REPORTS_FILE}))}
   if(u==='/status/players.json'){
    if(q.method==='HEAD'){s.writeHead(200,J);return s.end()}
    const body=JSON.stringify(modPlayers(ip));
    // com muitos jogadores (até ~1800) a lista passa de 200 KB: vai comprimida para o painel poder atualizar a cada poucos segundos
    if(body.length>2048&&/\bgzip\b/.test(String(q.headers['accept-encoding']||'')))return zlib.gzip(body,(e,z)=>{if(e){s.writeHead(200,J);return s.end(body)}s.writeHead(200,{...J,'Content-Encoding':'gzip','Vary':'Accept-Encoding'});s.end(z)});
    s.writeHead(200,J);return s.end(body)}
   if(!cache||Date.now()-cacheAt>2000){cache=JSON.stringify(stats());cacheAt=Date.now()}s.writeHead(200,J);return s.end(q.method==='HEAD'?undefined:cache);
  }
  if(u==='/radio'){
   if(q.method!=='GET')return plain(q,s,405,'405',{Allow:'GET'});
   if(over(ip,'radio',30,60000)){abuse.r429++;return plain(q,s,429,'429',{'Retry-After':'30'})}
   let sp;try{sp=new URL(q.url,'http://x').searchParams}catch(e){return plain(q,s,400,'400')}
   const code=V.normCode(sp.get('c')),rk=V.normToken(sp.get('k')),room=code&&rooms.get(code);
   let who=null;if(room&&rk)for(const p of room.players.values())if(!p.bot&&p.rk&&tokenEq(p.rk,rk)){who=p;break}
   if(!who||!room.dj)return plain(q,s,404,'404');
   if(who.radioRes){try{who.radioRes.destroy()}catch(e){}}
   who.radioRes=s;s.on('close',()=>{if(who.radioRes===s)who.radioRes=null});
   const st=radio.attach(room.code,room.dj.url,s,{'Referrer-Policy':'no-referrer'});
   if(st!=='ok')return plain(q,s,503,'503',{'Retry-After':'30'});
   return;
  }
  if(u==='/'||u==='/index.html')return sendCached(q,s,INDEX,'text/html; charset=utf-8','no-cache');
  if(u==='/estatisticas'){if(!SURVIVAL_ON)return plain(q,s,404,'404');s.writeHead(200,{...HDR,'Cache-Control':'public, max-age=300'});return s.end(q.method==='HEAD'?undefined:STATS_HTML)}
  if(u==='/estatisticas.json'){
   if(!SURVIVAL_ON)return plain(q,s,404,'404');
   s.writeHead(200,{...HDR,'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=5'});return s.end(q.method==='HEAD'?undefined:SURVSTATS.view(svLive()));
  }
  if(u==='/privacidade'||u==='/termos'){s.writeHead(200,{...HDR,'Cache-Control':'no-cache'});return s.end(q.method==='HEAD'?undefined:PRIVACY_HTML)}
  if(u==='/vendor/three-r128.min.js')return sendCached(q,s,THREE,'application/javascript; charset=utf-8','public, max-age=31536000, immutable');
  const A=ASSETS.get(u);
  if(A)return sendCached(q,s,A,A.type,'public, max-age=31536000, immutable');
  return plain(q,s,404,'404');
 }catch(e){
  logError('http',e);
  if(!s.headersSent)try{s.writeHead(500,{...HDR,'Content-Type':'text/plain; charset=utf-8'})}catch(x){}
  try{s.end('erro')}catch(x){}
 }
}
const server=http.createServer({connectionsCheckingInterval:2000},onRequest);// confere o prazo do cabeçalho a cada 2 s (padrão: 30 s)
server.maxConnections=maxConn()+50;
// Slowloris: um IP abrindo dezenas de conexões e mandando o cabeçalho aos pouquinhos ocupava vagas de todo mundo. O cabeçalho tem 10 s para
// chegar e cada IP (fora proxies confiáveis, que somam muitos usuários) pode ter no máximo RAW_PERIP conexões TCP abertas ao mesmo tempo.
server.headersTimeout=10000;server.requestTimeout=30000;
const RAW_PERIP=envInt('RAW_PERIP',40,4,100000),rawConns=new Map();
server.on('connection',sock=>{const a=normIp(sock.remoteAddress||'');if(a==='?'||trustedIp(a))return;const k=rateKey(a),n=(rawConns.get(k)||0)+1;
 if(n>RAW_PERIP){abuse.r429++;sock.destroy();return}rawConns.set(k,n);
 const dl=setTimeout(()=>{if(!sock.hdrOk)sock.destroy()},10000);// a primeira requisição precisa chegar inteira em 10 s
 sock.once('close',()=>{clearTimeout(dl);const v=(rawConns.get(k)||1)-1;if(v>0)rawConns.set(k,v);else rawConns.delete(k)})});
server.on('request',q=>{q.socket.hdrOk=true});server.on('upgrade',q=>{q.socket.hdrOk=true});
const limiter=createLimiter({maxKeys:50000}),conns=new Map();
const blocked=(ip,key,max,ms)=>limiter.blocked(key+'|'+ip,max,ms);
const over=(ip,key,max,ms)=>limiter.over(key+'|'+ip,max,ms);
const hitCount=(ip,key,max,ms)=>limiter.hit(key+'|'+ip,max,ms);
const countHits=(ip,key,ms)=>limiter.count(key+'|'+ip,ms);
// Ticket de admissão: chave efêmera e cache de provas já usadas.
const TICKET_SECRET=crypto.randomBytes(32),TICKET_USED=createUsed({max:50000});
const abuse={r429:0,r403:0,rBan:0,ticket:0,pow:0};
const BM=createBanManager({on:BAN_ON,file:BAN_FILE,levels:BAN_LEVELS,resetMs:BAN_RESET,max:BAN_MAX,onError:logError,warn:m=>console.warn(m),
 onStrike:(why,ms)=>{abuse.rBan++;console.warn('banido por '+why+' ('+Math.round(ms/1000)+'s)')}});
const bans=BM.bans,banKey=BM.key,hostId=BM.hostId,banCheck=BM.check,banStrike=BM.strike,saveBans=BM.save;
// ---------- painel /status (métricas e moderação por IP, protegido por token) ----------
const STATUS_TOKEN=process.env.STATUS_TOKEN||'',STATUS_ON=STATUS_TOKEN.length>=12;
if(process.env.STATUS_TOKEN&&!STATUS_ON)console.warn('STATUS_TOKEN muito curto (mínimo 12 caracteres): painel /status desativado.');
const hm=x=>crypto.createHmac('sha256','skyke3d-status').update(String(x)).digest(),tokOk=t=>STATUS_ON&&crypto.timingSafeEqual(hm(t),hm(STATUS_TOKEN));

// ---------- moderação por IP (painel /status) ----------
const BAN_MAX_MIN=43200; // teto de 30 dias para banimentos manuais
const statusHeaders=()=>({...HDR,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'});
function statusAuth(q,s,ip,J){
 if(blocked(ip,'sf',6,600000)){s.writeHead(429,J);s.end('{"erro":"muitas tentativas"}');return false}
 const a=String(q.headers.authorization||''),t=a.startsWith('Bearer ')?a.slice(7):'';
 if(!tokOk(t)){over(ip,'sf',999,600000);s.writeHead(401,J);s.end('{"erro":"não autorizado"}');return false}
 return true;
}
// Rótulo curto da sala: dá para ver quem está junto sem expor o código de entrada.
const roomTag=code=>crypto.createHash('sha256').update(code).digest('hex').slice(0,4);
function modPlayers(self){
 const groups=new Map();
 for(const r of rooms.values()){
  const tag=roomTag(r.code);
  for(const p of r.players.values()){
   if(p.bot||!p.ip)continue;
   let g=groups.get(p.ip);
   if(!g){g={id:hostId(p.ip),conns:conns.get(p.ip)||0,players:[],banMs:BAN_ON?banCheck(p.ip):0,self:p.ip===self};groups.set(p.ip,g)}
   g.players.push({id:p.id,name:p.name,room:tag,style:r.style,online:!!(p.online&&p.ws)});
  }
 }
 const hosts=[...groups.values()].sort((a,b)=>b.players.length-a.players.length||a.id.localeCompare(b.id));
 const now=Date.now();
 const bansOut=BAN_ON?bans.list(now).map(e=>({id:e.key.slice(0,12),left:e.until-now})):[];
 return{now,ban:{on:BAN_ON,maxMinutes:BAN_MAX_MIN},hosts,bans:bansOut};
}
// Descobre o IP (chave de limite) a partir do ID mostrado no painel. O endereço nunca sai do servidor.
function hostByIdPrefix(id){
 const found=new Set();
 for(const r of rooms.values())for(const p of r.players.values())if(!p.bot&&p.ip&&banKey(p.ip).startsWith(id))found.add(p.ip);
 return found;
}
// Encerra na hora as conexões do IP banido (o close 1008 remove o jogador da sala).
function kickIp(key){
 let n=0;
 for(const w of [...wss.clients]){
  if(w.ipKey!==key)continue;
  n++;
  try{send(w,{t:'sys',text:'Você foi removido pelo administrador.'});w.close(1008,'banido')}catch(e){}
 }
 for(const r of [...rooms.values()])for(const p of [...r.players.values()])if(!p.bot&&p.ip===key&&!p.online)dropPlayer(r,p);
 return n;
}
const ID_RE=/^[A-Za-z0-9_-]{6,43}$/;
function modBan(body,self){
 if(!BAN_ON)return[409,{erro:'Banimento desativado no servidor (BAN=0).'}];
 const mins=body.minutes;
 if(!Number.isInteger(mins)||mins<1||mins>BAN_MAX_MIN)return[400,{erro:'Duração inválida (de 1 a '+BAN_MAX_MIN+' minutos).'}];
 if(typeof body.id!=='string'||!ID_RE.test(body.id))return[400,{erro:'ID inválido.'}];
 const found=hostByIdPrefix(body.id);
 if(found.size>1)return[409,{erro:'Identificador ambíguo.'}];
 if(!found.size)return[404,{erro:'Esse IP não está mais conectado. Atualize a lista.'}];
 const ip=[...found][0];
 if(ip===self)return[409,{erro:'Você não pode banir o seu próprio IP.'}];
 if(trustedIp(ip))return[409,{erro:'Este IP é de um proxy confiável (TRUST_PROXY) e não pode ser banido.'}];
 bans.block(banKey(ip),mins*60000);saveBans();
 const removidos=kickIp(ip);
 console.warn('banido pelo painel ('+mins+' min, '+removidos+' conexões encerradas)');
 return[200,{ok:1,id:hostId(ip),minutes:mins,removidos}];
}
function modUnban(body){
 if(!BAN_ON)return[409,{erro:'Banimento desativado no servidor (BAN=0).'}];
 if(typeof body.id!=='string'||!ID_RE.test(body.id))return[400,{erro:'ID inválido.'}];
 const m=bans.list(Date.now()).map(e=>e.key).filter(k=>k.startsWith(body.id));
 if(m.length>1)return[409,{erro:'Identificador ambíguo.'}];
 if(!m.length||!bans.unban(m[0]))return[404,{erro:'Banimento não encontrado.'}];
 saveBans();
 return[200,{ok:1}];
}
// Capacidade: o painel lê o estado e a estimativa em /status.json (campo capacity) e altera pelo POST /status/capacity {rooms, perRoom}.
// Reduzir o limite não derruba ninguém: salas e jogadores que já estão dentro continuam; só entradas novas são recusadas.
function capacityView(R,P,h,b){
 let over=0;for(const r of rooms.values())if(humans_(r)>P)over++;
 const pf=perfStats();
 return{rooms:R,perRoom:P,conns:CAP.connLimit(R,P),ceilings:CAP.ABS,defaults:CAP.DEFAULTS,persisted:!!CAP_FILE,
  open:{rooms:rooms.size,humans:h,connections:wss.clients.size,roomsOverLimit:Math.max(0,rooms.size-R),roomsOverSize:over},
  estimate:CAP.estimate(R,P,{avgTickMs:pf.tick.avg,population:h+b})};
}
function capacityInfo(h,b){
 if(h===undefined){h=0;b=0;for(const r of rooms.values())for(const p of r.players.values())p.bot?b++:h++}
 return capacityView(MAXROOMS,MAX,h,b);
}
const humans_=r=>{let n=0;for(const p of r.players.values())if(!p.bot)n++;return n};
function modCapacity(body){
 const v=CAP.validate(body.rooms,body.perRoom);
 if(!v.ok)return[400,{erro:v.erro}];
 if(body.dry===true){let h=0,b=0;for(const r of rooms.values())for(const p of r.players.values())p.bot?b++:h++;return[200,{ok:1,dry:1,capacity:capacityView(v.rooms,v.perRoom,h,b)}]}
 const before=MAXROOMS+'×'+MAX;
 MAXROOMS=v.rooms;MAX=v.perRoom;server.maxConnections=maxConn()+50;
 const saved=CAP.saveFile(CAP_FILE,MAXROOMS,MAX);
 console.warn('capacidade alterada pelo painel: '+before+' → '+MAXROOMS+' salas × '+MAX+' jogadores ('+maxConn()+' conexões)'+(saved?'':' [não foi possível gravar o arquivo]'));
 cache=null;
 return[200,{ok:1,saved,capacity:capacityInfo()}];
}
// ---------- denúncias ----------
// Cada denúncia guarda o necessário para decidir uma punição sem expor ninguém: nomes, o ID público do IP (hash curto com segredo), o motivo,
// a observação e as últimas mensagens do chat da sala (só em memória enquanto a sala existe). O IP nunca é guardado; para banir pelo painel
// fica só a chave de banimento (hash com segredo), que nunca sai do servidor. Ficam no máximo 500, por até 30 dias.
const REP=createReports({file:REPORTS_FILE,reasons:V.REPORT_REASONS,onError:logError,warn:m=>console.warn(m)}),reports=REP.list,repSave=REP.save,repWrite=REP.write;
let hookN=0,hookAt=0;
const repPublic=r=>({id:r.id,at:r.at,room:r.room,style:r.style,reason:r.reason,reasonText:V.REPORT_REASONS[r.reason],note:r.note,by:r.by,target:r.target,chat:r.chat,voice:Array.isArray(r.voice)?r.voice:[],status:r.status,doneAt:r.doneAt||0});
function reportNew(room,me,m){
 const tg=room.players.get(m.id);
 if(!tg||tg.bot||!tg.ip)return{err:'Esse jogador não está nesta sala.'};
 if(tg.id===me.id)return{err:'Você não pode denunciar a si mesmo.'};
 if(over(me.ip,'rp',6,3600000))return{err:'Você já enviou muitas denúncias. Tente de novo mais tarde.'};
 const now=Date.now(),tk=banKey(tg.ip),rk=banKey(me.ip);
 REP.expire();
 if(REP.recent(rk,tk,600000))return{ok:1,dup:1};
 const r={id:crypto.randomBytes(6).toString('hex'),at:now,room:roomTag(room.code),style:room.style,reason:m.reason,note:m.note||'',
  by:{name:me.name,host:hostId(me.ip),pid:me.id},target:{name:tg.name,host:hostId(tg.ip),pid:tg.id},
  chat:(room.log||[]).slice(-20).map(x=>({at:x.at,name:x.name,text:x.text,who:x.id===tg.id?'alvo':x.id===me.id?'autor':''})),
  voice:voiceRecent(room,now).map(x=>({from:x.from,to:x.to,name:x.name,live:x.live||0,who:x.id===tg.id?'alvo':x.id===me.id?'autor':''})),status:'open',tk,rk};
 REP.add(r);notifyHook(r);
 console.warn('denúncia '+r.id+' ('+m.reason+') na sala '+r.room);
 return{ok:1};
}
// Discord: no máximo 20 avisos por minuto (o corpo da mensagem sai de report-hook.js).
function notifyHook(r){
 if(!REPORT_WEBHOOK)return;const now=Date.now();if(now-hookAt>60000){hookAt=now;hookN=0}if(++hookN>20)return;
 const body=hookBody(r,V.REPORT_REASONS);
 const ac=new AbortController(),to=setTimeout(()=>ac.abort(),5000);if(to.unref)to.unref();
 fetch(REPORT_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ac.signal,redirect:'error'})
  .then(res=>{clearTimeout(to);if(!res.ok)console.warn('denúncia: webhook respondeu '+res.status)}).catch(()=>{clearTimeout(to);console.warn('denúncia: webhook indisponível')});
}
// Painel: banir o denunciado pela chave guardada (vale mesmo se ele já saiu) ou arquivar a denúncia.
function modReport(body,self){
 if(typeof body.id!=='string'||!/^[0-9a-f]{12}$/.test(body.id))return[400,{erro:'Denúncia inválida.'}];
 const r=REP.find(body.id);if(!r)return[404,{erro:'Denúncia não encontrada.'}];
 if(body.action==='dismiss'){r.status='dismissed';r.doneAt=Date.now();repSave();return[200,{ok:1}]}
 if(body.action!=='ban')return[400,{erro:'Ação inválida.'}];
 if(!BAN_ON)return[409,{erro:'Banimento desativado no servidor (BAN=0).'}];
 const mins=body.minutes;if(!Number.isInteger(mins)||mins<1||mins>BAN_MAX_MIN)return[400,{erro:'Duração inválida (de 1 a '+BAN_MAX_MIN+' minutos).'}];
 if(r.tk===banKey(self))return[409,{erro:'Você não pode banir o seu próprio IP.'}];
 for(const w of wss.clients)if(w.ipKey&&banKey(w.ipKey)===r.tk&&trustedIp(w.ipKey))return[409,{erro:'Este IP é de um proxy confiável (TRUST_PROXY) e não pode ser banido.'}];
 bans.block(r.tk,mins*60000);saveBans();
 const ks=new Set();for(const w of wss.clients)if(w.ipKey&&banKey(w.ipKey)===r.tk)ks.add(w.ipKey);let removidos=0;for(const k of ks)removidos+=kickIp(k);
 r.status='banned';r.doneAt=Date.now();repSave();
 for(const x of reports)if(x.tk===r.tk&&x.status==='open'){x.status='banned';x.doneAt=r.doneAt}
 console.warn('banido pelo painel por denúncia ('+mins+' min, '+removidos+' conexões encerradas)');
 return[200,{ok:1,minutes:mins,removidos}];
}
function readJson(q,max,cb){
 const len=+q.headers['content-length'];
 if(Number.isFinite(len)&&len>max)return cb(new Error('grande'));
 let n=0,done=false;const chunks=[];
 q.on('data',c=>{if(done)return;n+=c.length;if(n>max){done=true;return cb(new Error('grande'))}chunks.push(c)});
 q.on('end',()=>{if(done)return;done=true;let v;try{v=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch(e){return cb(new Error('json'))}cb(null,v)});
 q.on('error',()=>{if(!done){done=true;cb(new Error('json'))}});
}
function statusAction(q,s,ip,u){
 if(!STATUS_ON)return plain(q,s,404,'404');
 const J=statusHeaders();
 if(!statusAuth(q,s,ip,J))return;
 if(over(ip,'sa',30,60000)){abuse.r429++;s.writeHead(429,J);return s.end('{"erro":"muitas ações, aguarde um minuto"}')}
 if(!/^application\/json\b/i.test(String(q.headers['content-type']||''))){s.writeHead(415,J);return s.end('{"erro":"use application/json"}')}
 readJson(q,2048,(err,body)=>{
  if(err){
   const big=err.message==='grande';
   s.writeHead(big?413:400,big?{...J,Connection:'close'}:J);
   return s.end(JSON.stringify({erro:big?'corpo grande demais':'JSON inválido'}),()=>{if(big)q.destroy()});
  }
  if(!body||typeof body!=='object'||Array.isArray(body)){s.writeHead(400,J);return s.end('{"erro":"JSON inválido"}')}
  const [code,out]=u==='/status/ban'?modBan(body,ip):u==='/status/capacity'?modCapacity(body):u==='/status/report'?modReport(body,ip):modUnban(body);
  s.writeHead(code,J);s.end(JSON.stringify(out));
 });
}
const T0=Date.now(),hist=[],peak={rooms:0,humans:0};let cache=null,cacheAt=0;
// Recordes desde sempre (persistem em RECORDS_FILE): máximo de jogadores online e picos de memória e de rede.
const RECORD_KEYS=['humans','rooms','rss','heap','sysMem','rx','tx'];
const REC=createRecords({file:RECORDS_FILE,keys:RECORD_KEYS,onError:logError,warn:m=>console.warn(m)}),records=REC.records,recUp=REC.up,recWrite=REC.write;
function recHumans(){let h=0,n=0;for(const r of rooms.values()){n++;for(const p of r.players.values())if(!p.bot&&p.online&&p.ws)h++}recUp('humans',h);recUp('rooms',n)}
let recNet=null,recNetAt=Date.now();
function recSample(){
 recHumans();const m=process.memoryUsage(),mt=os.totalmem();recUp('rss',m.rss);recUp('heap',m.heapUsed);if(mt)recUp('sysMem',(mt-os.freemem())/mt*100);
 const net=netCounters(),now=Date.now(),secs=Math.max(1,now-recNetAt)/1000;
 if(net&&recNet){recUp('rx',Math.max(0,net.rx-recNet.rx)/secs);recUp('tx',Math.max(0,net.tx-recNet.tx)/secs)}
 recNet=net;recNetAt=now;
 if(REC.dirty&&now-REC.savedAt>30000)recWrite();
}
const CPU_T=['user','nice','sys','idle','irq'];
function netCounters(){if(process.platform!=='linux')return null;try{let rx=0,tx=0;for(const line of fs.readFileSync('/proc/net/dev','utf8').split('\n').slice(2)){const i=line.indexOf(':');if(i<0)continue;const name=line.slice(0,i).trim();if(!name||name==='lo')continue;const f=line.slice(i+1).trim().split(/\s+/).map(Number);if(f.length>=9){rx+=f[0]||0;tx+=f[8]||0}}return{rx,tx}}catch(e){return null}}
let prevCpu=os.cpus(),prevCpuAt=Date.now(),prevProc=process.cpuUsage(),prevNet=netCounters();
function resourceStats(){
 const now=Date.now(),dt=Math.max(1,now-prevCpuAt),cpus=os.cpus();let total=0,idle=0;
 for(let i=0;i<cpus.length;i++){const a=cpus[i].times,b=prevCpu[i]&&prevCpu[i].times;if(!b)continue;for(const k of CPU_T){const d=Math.max(0,(a[k]||0)-(b[k]||0));total+=d;if(k==='idle')idle+=d}}
 const cpuSystem=total?Math.max(0,Math.min(100,(1-idle/total)*100)):0;
 const p=process.cpuUsage(),dp={user:p.user-prevProc.user,system:p.system-prevProc.system},cores=cpus.length||1;
 const cpuProcess=Math.max(0,Math.min(100,(dp.user+dp.system)/1000/dt*100/cores));
 const net=netCounters(),secs=dt/1000;let rxRate=0,txRate=0;
 if(net&&prevNet){rxRate=Math.max(0,net.rx-prevNet.rx)/secs;txRate=Math.max(0,net.tx-prevNet.tx)/secs}
 const m=process.memoryUsage(),mt=os.totalmem(),mf=os.freemem(),mu=mt-mf;
 const resources={cpu:{system:+cpuSystem.toFixed(1),process:+cpuProcess.toFixed(1),cores},memory:{total:mt,used:mu,free:mf,percent:mt?+((mu/mt)*100).toFixed(1):0},game:{rss:m.rss,heapTotal:m.heapTotal,heapUsed:m.heapUsed,external:m.external},network:net?{available:true,rxTotal:net.rx,txTotal:net.tx,rxRate:+rxRate.toFixed(1),txRate:+txRate.toFixed(1)}:{available:false,rxTotal:0,txTotal:0,rxRate:0,txRate:0}};
 prevCpu=cpus;prevCpuAt=now;prevProc=p;prevNet=net;return resources;
}

function stats(){let humans=0,bots=0,kar=0,vid=0;const styles={};for(const r of rooms.values()){const all=[...r.players.values()],hh=all.filter(p=>!p.bot).length;humans+=hh;bots+=all.length-hh;if(r.kar.length)kar++;vid+=r.vids.size;const b=styles[r.style]=styles[r.style]||{rooms:0,humans:0};b.rooms++;b.humans+=hh}
 return{rooms:rooms.size,maxRooms:MAXROOMS,maxPerRoom:MAX,capacity:capacityInfo(humans,bots),voice:{privacy:VOICE_PRIVACY,on:VOICE_ON(),turn:TURN_OK()},humans,bots,karaoke:kar,video:vid,styles,connections:wss.clients.size,uptime:Math.floor((Date.now()-T0)/1000),peak,records,history:hist,
  abuse:{bans:bans.size(),rejections:{http429:abuse.r429,origem:abuse.r403,ban:abuse.rBan},ticket:{falhas:abuse.ticket,pow:abuse.pow,mode:TICKET_MODE,maxBits:POW_MAX,rate:TICKET_RATE},topConns:[...conns].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([ip,n])=>[hostId(ip),n]),limits:{perip:PERIP,peripRate:PERIP_RATE,peripRoom:PERIP_ROOM,globalRate:GLOBAL_RATE,http:HTTP_RATE,maxBots:MAXBOTS,ban:!!BAN_ON}},
  resources:resourceStats(),perf:perfStats()}}
setInterval(()=>{try{const s=stats();peak.rooms=Math.max(peak.rooms,s.rooms);peak.humans=Math.max(peak.humans,s.humans);hist.push([Math.floor(Date.now()/1000),s.rooms,s.humans]);if(hist.length>240)hist.shift()}catch(e){logError('stats',e)}},15000).unref();
setTimeout(()=>{try{recSample()}catch(e){logError('recordes',e)}},0);// primeira amostra logo depois da subida
setInterval(()=>{try{recSample()}catch(e){logError('recordes',e)}},5000).unref();
const STATUS_HTML=readStatic('status.html').toString('utf8'),STATS_HTML=readStatic('estatisticas.html').toString('utf8'),PLAYER_HTML=readStatic('jogador.html').toString('utf8');
// Privacidade e termos: o texto descreve o que o jogo faz de fato; responsável e contato vêm do ambiente (PRIVACY_CONTROLLER, PRIVACY_EMAIL).
const htmlEsc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const PRIV_WHO=String(process.env.PRIVACY_CONTROLLER||'').trim().slice(0,200),PRIV_MAIL=String(process.env.PRIVACY_EMAIL||'').trim().slice(0,200);
if(!PRIV_WHO||!PRIV_MAIL)console.warn('Página /privacidade sem responsável ou contato: defina PRIVACY_CONTROLLER e PRIVACY_EMAIL.');
const PRIVACY_HTML=Buffer.from(readStatic('privacidade.html').toString('utf8')
 .replace(/\{\{RESPONSAVEL\}\}/g,PRIV_WHO?htmlEsc(PRIV_WHO):'[responsável ainda não informado]')
 .replace(/\{\{EMAIL\}\}/g,PRIV_MAIL?htmlEsc(PRIV_MAIL):'[contato ainda não informado]'),'utf8');

const errAt=Object.create(null);
function logError(where,e){
 const now=Date.now();
 if(now-(errAt[where]||0)<5000)return;
 errAt[where]=now;
 console.error(where+':',e&&e.stack||e);
}
function readStatic(rel){
 try{return fs.readFileSync(path.join(__dirname,rel))}
 catch(e){console.error('arquivo estático ausente ou ilegível: '+rel);process.exit(1)}
}
// O HTML referencia /assets/<nome>; aqui os nomes ganham o hash do conteúdo e viram imutáveis.
const CLIENT=assets.build(readStatic('index.html'),name=>readStatic(path.join('assets',name)));
const INDEX_BUF=CLIENT.html;
const THREE_BUF=readStatic(path.join('vendor','three-r128.min.js'));
const etagOf=buf=>'"'+crypto.createHash('sha256').update(buf).digest('base64url').slice(0,27)+'"';
// Comprimido uma vez no boot (brotli e gzip), num processo filho para não deixar memória do compressor
// retida aqui; cada requisição só escolhe um buffer pronto.
const CFILES=[...CLIENT.files];
const CVARS=compress.buildMany([INDEX_BUF,THREE_BUF,...CFILES.map(([,f])=>f.buf)]);
const INDEX={v:CVARS[0],etag:etagOf(INDEX_BUF)},THREE={v:CVARS[1],etag:etagOf(THREE_BUF)};
const ASSETS=new Map(CFILES.map(([url,f],i)=>[url,{v:CVARS[2+i],etag:etagOf(f.buf),type:f.type}]));
function inlineScriptHashes(html){
 const out=new Set(),re=/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;let m;
 while((m=re.exec(html)))if(!/\bsrc\s*=/i.test(m[1]))out.add("'sha384-"+crypto.createHash('sha384').update(m[2],'utf8').digest('base64')+"'");
 return [...out];
}
const SCRIPT_HASHES=[...new Set([...inlineScriptHashes(INDEX_BUF.toString('utf8')),...inlineScriptHashes(STATUS_HTML),...inlineScriptHashes(STATS_HTML),...inlineScriptHashes(PLAYER_HTML)])];
const CONNECT_SRC=PROD?["'self'",...[...ALLOWED_HOSTS].flatMap(h=>['wss://'+h,'https://'+h])].join(' '):"'self' ws: wss:";
const CSP=[
 "default-src 'self'",
 "script-src 'self' "+SCRIPT_HASHES.join(' ')+" https://www.youtube.com https://s.ytimg.com",
 "script-src-attr 'none'",
 "style-src 'self' 'unsafe-inline'",
 "font-src 'self'",
 "img-src 'self' data: blob: https://i.ytimg.com https://img.youtube.com",
 "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
 "connect-src "+CONNECT_SRC,
 "media-src 'self' blob: data:",
 "object-src 'none'",
 "base-uri 'none'",
 "frame-ancestors 'none'",
 "form-action 'self'"
].join('; ');
const HDR={'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'microphone=(self), camera=(), geolocation=()','Content-Security-Policy':CSP};

setInterval(()=>{limiter.prune(Date.now());bans.prune(Date.now())},60000).unref();
const wss=new WebSocketServer({server,maxPayload:32768,perMessageDeflate:false,verifyClient:(info,cb)=>{
 try{
  const req=info.req;
  if(String(req.url||'').length>2048)return cb(false,414,'url');
  const ip=rateKey(ipOf(req));
  const host=parseHost(oneHeader(req,'host'));
  const origin=parseOrigin(oneHeader(req,'origin'));
  if(!hostAllowed(host)||!originAllowed(origin,host)){
   abuse.r403++;
   const bad=hitCount(ip,'hsbad',30,60000);
   if(bad.count===20)banStrike(ip,'origem');
   if(bad.over){abuse.r429++;return cb(false,429,'limite')}
   return cb(false,403,'origem negada');
  }
  if(banCheck(ip)){abuse.rBan++;return cb(false,429,'banido')}
  if(over(ip,'hs',120,60000)){abuse.r429++;return cb(false,429,'limite')}
  if(TICKET_MODE!=='off'){
   const v=ticketVerify({secret:TICKET_SECRET,param:queryParam(req.url,'ticket'),ipKey:ip,used:TICKET_USED});
   if(!v.ok){
    abuse.ticket++;if(v.reason==='pow')abuse.pow++;
    if(TICKET_MODE==='enforce'){
     if(hitCount(ip,'tkf',10,60000).count===11)banStrike(ip,'ticket');
     return cb(false,403,'ticket');
    }
   }
  }
  if((conns.get(ip)||0)>=PERIP||wss.clients.size>=maxConn()){abuse.r429++;return cb(false,429,'limite')}
  if(GLOBAL_RATE>0&&over('@','adm',GLOBAL_RATE,60000)){abuse.r429++;return cb(false,429,'limite')}
  cb(true);
 }catch(e){logError('handshake',e);try{cb(false,500,'erro')}catch(x){}}
}});
setInterval(()=>{try{for(const w of wss.clients){if(!w.alive){w.terminate();continue}w.alive=false;try{w.ping()}catch(e){}}}catch(e){logError('ping',e)}},30000).unref();
const rooms=new Map();let nid=1;
const BN=['Marina','Caio','Duda','Bruno','Lia','Theo','Nina','Davi','Bia','Rafa','Luna','Gabi','Enzo','Maya','Tiago','Alice','Leo','Clara','Pedro','Sofia'];
const RATE={
 chat:[700,5,5000],item:[150,15,5000],gest:[1500,8,10000],emo:[400,12,5000],cfg:[200,15,5000],
 video:[0,4,30000],kjoin:[1000,4,10000],ksong:[1000,4,10000],bots:[1000,3,5000],
 move:[25,40,1000],sig:[0,300,10000],speak:[100,10,1000],ice:[60000,1,60000],
 vjoin:[500,4,5000],vleave:[500,4,5000],vstop:[500,4,5000],vend:[500,4,5000],dj:[2000,4,30000],djstop:[500,4,5000],kleave:[500,4,5000],kpass:[1000,3,5000],
 kdur:[1000,2,10000],kend:[1000,2,10000],ksync:[200,10,5000],vsync:[200,10,5000],tsync:[100,10,5000],report:[15000,3,600000],
 sv:[50,16,1000],pst:[1000,3,60000],create:[1000,3,60000],join:[1000,5,60000],resume:[1000,5,60000],leave:[0,1,1000]
};
// Ações de interface: ao estourar o limite, descarta sem punir (nunca derruba a conexão).
// cfg/item guardam só o ÚLTIMO estado e o aplicam quando o limite liberar.
const SOFT=new Set(['cfg','item','emo','gest','speak','vjoin','vleave','vstop','vend','djstop','kleave','kpass','ksync','vsync','tsync','bots','sv','pst']),TRAIL=new Set(['cfg','item']);
// hora (no relógio do servidor) em que o dono leu a posição do vídeo: vale a do cliente se for plausível (até 3 s no passado), senão agora
const syncAt=ts=>{const now=Date.now();return typeof ts==='number'&&ts<=now+250&&ts>=now-3000?Math.min(ts,now):now};
const MSG_PER_SEC=150,SIG_PER_SEC=120,KINVITE_MS=15000,MAX_BUFFERED=1<<20;
const rnd=n=>Math.floor(Math.random()*n),rr=(a,b)=>a+Math.random()*(b-a);
const code=()=>[...crypto.randomBytes(10)].map(x=>CODE_ALPHABET[x%CODE_ALPHABET.length]).join('');
// ---------- métricas de desempenho (aparecem em /status.json -> perf) ----------
const perf={inT:0,outT:0,bytesT:0,bp:0,slow:0,tlast:0};
const eld=monitorEventLoopDelay({resolution:10});eld.enable();
const ring=[];let prevT={in:0,out:0,bytes:0},tacc={n:0,sum:0,max:0};
function tickDone(t0){
 const ms=Number(process.hrtime.bigint()-t0)/1e6;
 perf.tlast=ms;tacc.n++;tacc.sum+=ms;if(ms>tacc.max)tacc.max=ms;if(ms>50)perf.slow++;
}
const nsMs=x=>Number.isFinite(x)&&x<1e15?x/1e6:0;
setInterval(()=>{try{
 let bmax=0;for(const w of wss.clients)if(w.bufferedAmount>bmax)bmax=w.bufferedAmount;
 ring.push({in:perf.inT-prevT.in,out:perf.outT-prevT.out,bytes:perf.bytesT-prevT.bytes,tn:tacc.n,tsum:tacc.sum,tmax:tacc.max,p50:nsMs(eld.percentile(50)),p99:nsMs(eld.percentile(99)),lmax:nsMs(eld.max),bmax});
 eld.reset();prevT={in:perf.inT,out:perf.outT,bytes:perf.bytesT};tacc={n:0,sum:0,max:0};
 if(ring.length>60)ring.shift();
}catch(e){logError('perf',e)}},1000).unref();
function perfStats(){
 const sum=(a,k)=>a.reduce((t,x)=>t+x[k],0),mx=(a,k)=>a.reduce((t,x)=>Math.max(t,x[k]),0),last=ring.slice(-10),n=Math.max(1,last.length),tn=sum(ring,'tn'),f=x=>+x.toFixed(2);
 return{
  tick:{avg:tn?f(sum(ring,'tsum')/tn):0,max:f(mx(ring,'tmax')),last:f(perf.tlast),slow:perf.slow,budget:100},
  loop:{p50:f(mx(ring,'p50')),p99:f(mx(ring,'p99')),max:f(mx(ring,'lmax'))},
  msgs:{inPerSec:+(sum(last,'in')/n).toFixed(1),outPerSec:+(sum(last,'out')/n).toFixed(1),bytesOutPerSec:Math.round(sum(last,'bytes')/n),inTotal:perf.inT,outTotal:perf.outT},
  buffer:{max:mx(ring,'bmax'),terminated:perf.bp}
 };
}
const sendRaw=(w,str,len)=>{
 if(!w||w.readyState!==1)return;
 if(w.bufferedAmount>MAX_BUFFERED){perf.bp++;try{w.terminate()}catch(e){}return}
 try{w.send(str);perf.outT++;perf.bytesT+=len===undefined?Buffer.byteLength(str):len}catch(e){try{w.terminate()}catch(x){}}
};
const send=(w,m)=>{
 if(!w||w.readyState!==1)return;
 let str;try{str=JSON.stringify(m)}catch(e){logError('send',e);return}
 sendRaw(w,str);
};
// Broadcast: serializa uma vez e reaproveita a mesma string para todos os destinatários.
const bc=(r,m,ex)=>{
 let str=null,len=0;
 for(const p of r.players.values()){
  if(p.bot||!p.ready||!p.online||!p.ws||p.ws===ex)continue;
  if(str===null){try{str=JSON.stringify(m)}catch(e){logError('bc',e);return}len=Buffer.byteLength(str)}
  sendRaw(p.ws,str,len);
 }
};
// mk: chave para silenciar, a mesma para o mesmo IP dentro da mesma sala (sobrevive a reconexões) e diferente em outra sala; não revela o IP
const MUTE_SALT=crypto.randomBytes(16),muteKey=(r,ip)=>crypto.createHmac('sha256',MUTE_SALT).update(r.code+'|'+ip).digest('base64url').slice(0,12);
// Registro de voz para a moderação: só QUEM falou e QUANDO (início e fim de cada fala, como o próprio cliente informa pelo indicador de fala),
// nunca o áudio. Fica na memória da sala, as últimas 60 falas dos últimos 10 minutos, e vai junto com a denúncia.
function talkLog(r,p,on){const now=Date.now();if(on){p.talkAt=now;return}if(!p.talkAt)return;const L=r.vlog||(r.vlog=[]);L.push({id:p.id,name:p.name,from:p.talkAt,to:now});p.talkAt=0;
 while(L.length>60||(L.length&&now-L[0].to>600000))L.shift()}
function voiceRecent(r,now){const L=(r.vlog||[]).filter(x=>now-x.to<=600000).slice();for(const p of r.players.values())if(p.talk&&p.talkAt)L.push({id:p.id,name:p.name,from:p.talkAt,to:now,live:1});return L.slice(-40)}
const pub=p=>({id:p.id,name:p.name,cfg:p.cfg,x:p.x,z:p.z,ry:p.ry,y:p.y||0,s:p.s||0,bot:!!p.bot,item:p.item,talk:!!p.talk,mk:p.mk||''});
const humans=r=>[...r.players.values()].filter(p=>!p.bot);
const onlineHumans=r=>[...r.players.values()].filter(p=>!p.bot&&p.online&&p.ws);
const newToken=()=>crypto.randomBytes(32).toString('base64url');
function tokenEq(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 try{return crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b))}catch(e){return false}
}
const kq=r=>r.kar.map(k=>({id:k.id,name:(r.players.get(k.id)||{}).name||'?',vid:k.vid})),kmem=(r,id)=>r.kar.some(k=>k.id===id),kcap=r=>(r.karAt||Date.now())+KMAX;
function kstart(r){r.ks=null;const h=r.kar[0];r.karEnd=Date.now()+(h&&h.vid?KDEF:120000);r.karAt=Date.now();r.kdur=false;r.kcap=!!(h&&h.vid);r.karTurn++}
function kbc(r){const h=r.kar[0]&&r.kar[0].id;if(h!==r.karHead){r.karHead=h;if(h)kstart(r)}bc(r,{t:'kar',q:kq(r),left:Math.max(0,r.karEnd-Date.now()),turn:r.karTurn})}
function krot(r){if(!r.kar.length)return;const f=r.kar.shift();f.vid=null;r.kar.push(f);if(r.kar.some(k=>k.vid)){let n=r.kar.length;while(!r.kar[0].vid&&n-->0)r.kar.push(r.kar.shift())}r.karHead=r.kar[0].id;kstart(r);kbc(r)}
function kinvite(r,from){const now=Date.now();if(now-(r.inviteAt||0)<KINVITE_MS)return;r.inviteAt=now;for(const p of r.players.values())if(!p.bot&&p.ready&&p.online&&p.ws&&p.id!==from.id&&!kmem(r,p.id))send(p.ws,{t:'kinv',name:from.name,by:from.id})}
function newBot(r){const used=new Set([...r.players.values()].map(p=>p.name)),id='b'+nid++;
 const b={id,bot:1,name:BN.find(n=>!used.has(n))||'Bot'+nid,cfg:cleanCfg({skin:rnd(V.CR.skin),eye:rnd(V.CR.eye),shirt:rnd(V.CR.shirt),hair:rnd(V.CR.hair),hc:rnd(V.CR.hc),hs:rnd(V.CR.hs),fc:rnd(V.CR.fc),hat:rnd(3)?0:1+rnd(V.CR.hat-1),bt:rnd(V.CR.bt),pc:rnd(V.CR.pc),sc:rnd(V.CR.sc),shoes:rnd(V.CR.shoes),eb:rnd(3)?0:1,sb:rnd(3)?0:1,pb:rnd(3)?0:1,cb:rnd(3)?0:1,hb:rnd(3)?0:1}),x:rr(-6,6),z:rr(-2,4),ry:0,y:0,s:0,item:null,next:0};
 b.tx=b.x;b.tz=b.z;r.players.set(id,b);return b}
function fit(r){const h=humans(r).length,bots=[...r.players.values()].filter(p=>p.bot);
 const target=MAXBOTS?Math.max(0,Math.min(r.want,MAX-h,MAXBOTS-totalBots()+bots.length)):0;
 while(bots.length>target){const b=bots.pop();r.players.delete(b.id);bc(r,{t:'pl',id:b.id})}
 while(bots.length<target){const b=newBot(r);bots.push(b);bc(r,{t:'pj',p:pub(b)})}}
function totalBots(){let n=0;for(const r of rooms.values())for(const p of r.players.values())if(p.bot)n++;return n}
const keyHumans=(r,key)=>[...r.players.values()].filter(p=>!p.bot&&p.ip===key).length;
function uniqName(r,name){
 const used=new Set([...r.players.values()].map(p=>V.nameKey(p.name)));
 let n=String(name);
 for(let i=2;used.has(V.nameKey(n))&&i<100;i++){const s=' '+i;n=n.slice(0,Math.max(1,V.MAX_NAME-s.length))+s}
 return n;
}

function hostTransfer(r){
 const cur=r.host&&r.players.get(r.host);
 if(cur&&!cur.bot&&cur.online&&cur.ws)return;
 const h=onlineHumans(r)[0];
 if(h){
  if(r.host!==h.id){r.host=h.id;bc(r,{t:'host',id:h.id})}
 }else if(r.host){
  r.host=null;
  bc(r,{t:'host',id:null});
 }
}
function destroyRoom(r){
 for(const p of r.players.values())if(p.retire){clearTimeout(p.retire);p.retire=null}
 r.players.clear();r.kar=[];r.vids.forEach(v=>clearTimeout(v.endT));r.vids.clear();r.dj=null;radio.stop(r.code);rooms.delete(r.code);
}
// quem iniciou o vídeo manda vsync a cada 2 s; sem sinal por 15 s a sessão está abandonada e não bloqueia a sala
// Cada jogador pode ter o seu próprio vídeo: r.vids = Map(dono → {vid,by,name,vs:{time,playing,at},viewers:Set(ids)}).
const MAX_VIDS=4,VIDEO_IDLE_MS=envInt('VIDEO_IDLE_MS',180000,500,3600000);// depois que o vídeo termina, o dono tem 3 min para colocar outro
function dropVid(r,by,why,except){const v=r.vids.get(by);if(!v)return false;clearTimeout(v.endT);r.vids.delete(by);bc(r,why?{t:'vstop',by,why}:{t:'vstop',by},except);return true}
function stopVideo(r,by){
 for(const v of r.vids.values())v.viewers.delete(by);
 dropVid(r,by);
 if(r.dj&&r.dj.by===by)djClear(r);
}
// DJ: o áudio passa pelo servidor (proxy em radio.js): o servidor da rádio só vê o IP deste servidor.
function djClear(r){if(r.dj){r.dj=null;radio.stop(r.code);bc(r,{t:'djstop'})}}
function dropKaraoke(r,id){
 if(kmem(r,id)){r.kar=r.kar.filter(k=>k.id!==id);kbc(r)}
}
function dropPlayer(r,p){
 if(!r.players.has(p.id))return;
 if(p.retire){clearTimeout(p.retire);p.retire=null}
 p.online=false;p.ready=false;p.ws=null;
 stopVideo(r,p.id);
 dropKaraoke(r,p.id);
 if(p.talk){p.talk=false;talkLog(r,p,false);bc(r,{t:'speak',id:p.id,v:false})}
 r.players.delete(p.id);
 if(r.sv)SV.removePlayer(r.sv.st,p.id);
 if(r.host===p.id){r.host=null;hostTransfer(r)}
 bc(r,{t:'pl',id:p.id});
 fit(r);
 if(!humans(r).length)destroyRoom(r);
}
function markOffline(r,p){
 p.online=false;p.ready=false;p.ws=null;
 if(p.retire)clearTimeout(p.retire);
 p.retire=setTimeout(()=>{p.retire=null;dropPlayer(r,p)},RECONNECT_MS);
 if(p.retire.unref)p.retire.unref();
 stopVideo(r,p.id);
 dropKaraoke(r,p.id);
 if(p.talk){p.talk=false;talkLog(r,p,false);bc(r,{t:'speak',id:p.id,v:false})}
 if(r.host===p.id)hostTransfer(r);
}
// Estado das salas em binário, 5 vezes por segundo (o cliente interpola entre os pacotes): por jogador que mudou, 12 bytes em vez de ~38 de JSON.
// [u8 tipo=1] e, por jogador: u32 id (bit alto = bot), i16 x·100, i16 z·100, i16 giro·10000, u8 altura·100, u8 sentado.
const ST_HZ_DIV=2;let tickN=0;
const i16=v=>Math.max(-32768,Math.min(32767,Math.round(v)));
function stPack(s){const b=Buffer.allocUnsafe(1+s.length*12);b[0]=1;let o=1;
 for(const e of s){const id=e[0],n=Number(id.slice(1))&0x7fffffff;b.writeUInt32LE(((id[0]==='b'?0x80000000:0)|n)>>>0,o);b.writeInt16LE(i16(e[1]*100),o+4);b.writeInt16LE(i16(e[2]*100),o+6);
  b.writeInt16LE(i16(Math.atan2(Math.sin(e[3]),Math.cos(e[3]))*10000),o+8);b[o+10]=Math.max(0,Math.min(255,Math.round((e[4]||0)*100)));b[o+11]=e[5]?1:0;o+=12}
 return b}
const bcBin=(r,buf)=>{for(const p of r.players.values())if(!p.bot&&p.ready&&p.online&&p.ws)sendRaw(p.ws,buf,buf.length)};
setInterval(()=>{const t0=process.hrtime.bigint();try{const now=Date.now(),sendSt=(++tickN%ST_HZ_DIV)===0;for(const r of rooms.values()){const s=[],full=sendSt&&now>=(r.fullAt||0);
 if(r.kar.length&&now>=r.karEnd){bc(r,{t:'chat',name:'🎶 Karaokê',text:r.kcap?'⏱ Limite de 13 min do karaokê atingido! Próximo cantor.':'Fim da música! Próximo cantor.'});krot(r)}
 if(now>=(r.botAt||0)){r.botAt=now+250;const bl=[...r.players.values()].filter(p=>p.bot);if(bl.length||r.bc){const sp=botChat.tick(r.bc||(r.bc=botChat.state()),now,bl,onlineHumans(r).length>0);if(sp)bc(r,{t:'chat',name:sp.bot.name,text:sp.text})}}
 for(const p of r.players.values()){
  if(p.bot){if(now>p.next){p.next=now+3000+Math.random()*5000;const [tx,tz]=clampPos(rr(-6,6),rr(-2.5,4.5));p.tx=tx;p.tz=tz;}
   const dx=p.tx-p.x,dz=p.tz-p.z,d=Math.hypot(dx,dz);if(d>.2){p.x+=dx/d*.14;p.z+=dz/d*.14;p.ry=Math.atan2(dx,dz)}}
  if(!sendSt)continue;const e=[p.id,p.x,p.z,p.ry,p.y||0,p.s?1:0],k=p.x.toFixed(2)+','+p.z.toFixed(2)+','+(+p.ry).toFixed(2)+','+(p.y||0).toFixed(2)+','+e[5];if(full||k!==p.lst){p.lst=k;s.push(e)}}
 if(s.length)bcBin(r,stPack(s));if(full)r.fullAt=now+5000}}catch(e){logError('tick',e)}tickDone(t0)},100).unref();
// ---------- modo Sobrevivência: o servidor roda survival.js e o mapa (survmap.js) de cada sala; o cliente só pede ações ----------
const DAY_MS=86400000;
const SV_BLOCK=/^(video|dj|djstop|v(join|leave|stop|end|sync)|k(join|song|leave|pass|dur|end|sync|set))$/,SV_TICK_MS=250,r1=v=>Math.round(v*10)/10;
function svStart(r){
 const seed=crypto.randomInt(1,2147483647),map=SKYMAP.generate(seed);
 r.sv={seed,map,st:SV.create({seed,nodes:map.nodes}),at:Date.now(),n:0,done:false,dirty:true};
 for(const p of r.players.values())if(!p.bot)svJoin(r,p);
}
function svJoin(r,p){const st=r.sv.st;SV.addPlayer(st,p.id);SV.setPos(st,p.id,p.x,p.z);p.svk=''}
const svInfo=r=>({seed:r.sv.seed,nights:r.sv.st.nights,pub:svPublic(r)});
function svPublic(r){
 const st=r.sv.st,pot=st.pot;
 return{t:'svs',tm:r1(st.t),fire:r1(st.fire),nt:SV.isNight(st)?1:0,nd:SV.nightsDone(st),pot:pot?{rid:pot.rid,ok:pot.ready?1:0,el:r1(pot.el)}:null,
  pl:[...st.P.values()].map(p=>[p.id,p.faint?1:0,p.sick>0?1:0]),nx:st.nodes.reduce((a,n,i)=>{if(st.t<n.at)a.push(i);return a},[]),ov:st.over?1:0};
}
function svPrivate(r,p){const q=r.sv.st.P.get(p.id);if(!q)return null;const m={};for(const k of Object.keys(q.m))m[k]=r1(q.m[k]);return{t:'svm',m,inv:q.inv,f:q.faint?1:0,fw:q.faint?Math.max(0,Math.ceil(r.sv.st.S.revive.auto-q.fw)):0,k:q.sick>0?1:0,rv:q.rev||''}}
function svPush(r,p){
 if(!p.ws||!p.online)return;
 const pr=svPrivate(r,p);if(!pr)return;
 const k=JSON.stringify(pr);if(k!==p.svk){p.svk=k;send(p.ws,pr)}
}
function svAct(r,me,m){
 const st=r.sv.st;
 switch(m.a){
  case 'collect':return SV.collect(st,me.id,m.i);
  case 'eat':return SV.eat(st,me.id,m.res);
  case 'fuel':return SV.addFuel(st,me.id,m.res);
  case 'relight':return SV.relight(st,me.id);
  case 'cook':return SV.cookStart(st,me.id,m.rid);
  case 'take':return SV.cookTake(st,me.id);
  case 'give':return SV.giveItem(st,me.id,m.to,m.res,m.n);
  case 'rev':return SV.reviveStart(st,me.id,m.to);
  case 'revstop':return SV.reviveStop(st,me.id);
  case 'again':if(r.host===me.id&&st.over){svStart(r);bc(r,{t:'svnew',...svInfo(r)});return{ok:1}}return{err:'nao_pode'};
 }
 return{err:'acao'};
}
function svEnd(r){
 if(r.sv.done)return;r.sv.done=true;
 const full=SV.summary(r.sv.st),per=full.per;delete full.per;
 const sum={...full,seed:r.sv.seed,world:r.style};
 bc(r,{t:'svend',...sum});
 try{onRunEnd(r,sum,per)}catch(e){logError('sobrevivencia',e)}
}
const SURVSTATS=createSurvStats({file:SURVSTATS_FILE,S:SURVIVAL_CFG,worlds:['acampamento'],minPlayers:SURVIVAL_CFG.run.minPlayers,minSec:SURVIVAL_CFG.run.minSec,onError:logError,warn:m=>console.warn(m)});
function svLive(){let rooms_=0,players=0;for(const r of rooms.values())if(r.sv){rooms_++;players+=onlineHumans(r).length}return{rooms:rooms_,players}}
const PSTATS=createPlayerStats({file:PLAYERSTATS_FILE,onError:logError,warn:m=>console.warn(m)});
setInterval(()=>{try{PSTATS.prune()}catch(e){logError('páginas pessoais',e)}},DAY_MS).unref();
function onRunEnd(r,sum,per){
 if(!SURVSTATS.record(sum))return;
 for(const p of r.players.values()){const x=per&&per[p.id];if(p.bot||!p.pk||!x)continue;
  PSTATS.record(p.pk,censor(p.name),{ok:sum.ok,nights:sum.nights,target:sum.target,sec:sum.sec,players:sum.players,world:sum.world,meals:x.m,faints:x.f,revives:x.r})}
}
setInterval(()=>{try{const now=Date.now();for(const r of rooms.values()){const s=r.sv;if(!s)continue;
 const ev=SV.tick(s.st,(now-s.at)/1000*SURV_SPEED);s.at=now;
 if(ev.length)bc(r,{t:'sve',e:ev});
 if(s.st.over)svEnd(r);
 if(s.dirty||++s.n%2===0){s.dirty=false;bc(r,svPublic(r));for(const p of r.players.values())if(!p.bot)svPush(r,p)}}}catch(e){logError('sobrevivencia',e)}},SV_TICK_MS).unref();
function joinPayload(room,me,resume){
 return {t:'joined',ver:VER,url:PUBLIC_URL,ice:iceCfg(),id:me.id,code:room.code,style:room.style,host:room.host,want:room.want,
  players:[...room.players.values()].map(pub),kar:kq(room),kl:Math.max(0,room.karEnd-Date.now()),turn:room.karTurn,
  token:me.token,rk:me.rk,self:pub(me),reconnect:RECONNECT_MS,...(resume?{resume:1}:{}),...(room.sv?{sv:svInfo(room)}:{})};
}
function addHuman(room,ws,ip,name,cfg){setImmediate(recHumans);
 const p={id:'p'+nid++,ip,mk:muteKey(room,ip),name:uniqName(room,name),cfg,room,x:0,z:5,ry:0,y:0,s:0,item:null,talk:false,ws,ready:false,online:true,retire:null,token:newToken(),rk:newToken()};
 room.players.set(p.id,p);
 if(room.sv)svJoin(room,p);
 if(!room.host){room.host=p.id;bc(room,{t:'host',id:p.id})}
 fit(room);
 send(ws,joinPayload(room,p,false));
 if(room.sv)svPush(room,p);
 for(const v of room.vids.values())if(!v.ended)send(ws,{t:'vinv',vid:v.vid,name:v.name,by:v.by});
 if(room.dj)send(ws,{t:'dj',url:'',host:new URL(room.dj.url).host,name:room.dj.name,by:room.dj.by});
 if(room.kar.length)send(ws,{t:'kinv',name:(room.players.get(room.kar[0].id)||{}).name||'Alguém'});
 bc(room,{t:'pj',p:pub(p)});
 p.ready=true;
 return p;
}
function resumeSession(room,ws,ip,m){
 let p=null;
 for(const q of room.players.values())if(!q.bot&&q.token&&tokenEq(q.token,m.token)){p=q;break}
 if(!p){
  send(ws,{t:'err',scope:'resume',msg:'Sessão expirada ou inválida. Entre novamente com o código da sala.'});
  try{ws.close(1000,'resume')}catch(e){}
  return null;
 }
 if(p.online||p.ws){
  send(ws,{t:'err',scope:'resume',retry:1,msg:'Sua sessão ainda está ativa. Tentando novamente…'});
  try{ws.close(1000,'busy')}catch(e){}
  return null;
 }
 if(p.retire){clearTimeout(p.retire);p.retire=null}
 p.ws=ws;p.online=true;p.ready=false;p.ip=ip;p.token=newToken();
 if(!room.host){room.host=p.id;bc(room,{t:'host',id:p.id})}
 send(ws,joinPayload(room,p,true));
 if(room.sv)svPush(room,p);
 for(const v of room.vids.values())if(!v.ended)send(ws,{t:'vinv',vid:v.vid,name:v.name,by:v.by});
 if(room.dj)send(ws,{t:'dj',url:'',host:new URL(room.dj.url).host,name:room.dj.name,by:room.dj.by});
 if(room.kar.length)send(ws,{t:'kinv',name:(room.players.get(room.kar[0].id)||{}).name||'Alguém'});
 p.ready=true;
 return p;
}

function admitNew(ip,ws){
 const a=hitCount(ip,'admr',PERIP_RATE,600000);
 if(!a.over)return true;
 if(a.count>PERIP_RATE*2&&hitCount(ip,'admx',6,60000).count===7)banStrike(ip,'admissao');
 abuse.r429++;
 send(ws,{t:'err',msg:'Muitas entradas deste local. Aguarde alguns minutos.'});
 return false;
}

wss.on('connection',(ws,req)=>{const ip=rateKey(ipOf(req));conns.set(ip,(conns.get(ip)||0)+1);ws.ipKey=ip;ws.alive=true;ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});
 let me=null,room=null,n=0,sigN=0,winSec=0,lt={},lastTxt='',lastAt=0,lastWarn=0,rl={},badHits=[],defer={},punished=false;
 const jt=setTimeout(()=>{if(!me)ws.close()},15000);
 const rate=t=>{
  const c=RATE[t];if(!c)return true;
  const [min,max,win]=c,now=Date.now(),s=rl[t]||(rl[t]={last:0,hits:[]});
  if(min&&now-s.last<min)return false;
  s.hits=s.hits.filter(x=>now-x<win);
  if(s.hits.length>=max)return false;
  s.last=now;s.hits.push(now);return true;
 };
 const waitFor=t=>{
  const c=RATE[t],s=rl[t];if(!c||!s)return 0;
  const [min,max,win]=c,now=Date.now();let w=min?s.last+min-now:0;
  const h=s.hits.filter(x=>now-x<win);
  if(h.length>=max)w=Math.max(w,h[h.length-max]+win-now);
  return Math.max(0,w);
 };
 const trail=m=>{
  const d=defer[m.t]||(defer[m.t]={m:null,tm:null});
  d.m=m;if(d.tm)return;
  d.tm=setTimeout(()=>{
   d.tm=null;const x=d.m;d.m=null;
   if(x&&me&&room&&ws.readyState===1)ws.emit('message',JSON.stringify(x));
  },waitFor(m.t)+30);
 };
 const violation=()=>{
  const now=Date.now();badHits=badHits.filter(t=>now-t<10000);badHits.push(now);
  if(badHits.length>=8){if(!punished){punished=true;banStrike(ip,'violacao')}try{send(ws,{t:'sys',text:'Você foi desconectado por enviar ações demais em pouco tempo.'})}catch(e){};try{ws.close(1008,'rate limit')}catch(e){};return true}
  return false;
 };
 const closePolicy=(text,why)=>{if(why&&!punished){punished=true;banStrike(ip,why)}try{send(ws,{t:'sys',text})}catch(e){};try{ws.close(1008,'policy')}catch(e){}};
 ws.on('message',raw=>{try{
  perf.inT++;
  const sec=Date.now()/1000|0;if(sec!==winSec){winSec=sec;n=0;sigN=0}
  let msg;try{msg=JSON.parse(raw)}catch(e){if(++n>MSG_PER_SEC)closePolicy('Muitas mensagens. A conexão foi encerrada.','flood');else violation();return}
  const isSig=!!msg&&msg.t==='sig';
  if(isSig){if(++sigN>SIG_PER_SEC)return}
  else if(++n>MSG_PER_SEC){closePolicy('Muitas mensagens. A conexão foi encerrada.','flood');return}
  const m=normalizeMessage(msg);
  if(!m){
   violation();
   if(!me&&msg&&msg.t==='join')send(ws,{t:'err',msg:'Não foi possível entrar: confira o código da sala e os dados do avatar.'});
   else if(!me&&msg&&msg.t==='resume'){
    send(ws,{t:'err',scope:'resume',msg:'Sessão expirada ou inválida. Entre novamente com o código da sala.'});
    try{ws.close(1000,'resume')}catch(e){}
   }
   return;
  }
  if(!me&&(m.t==='create'||m.t==='join')&&!m.named)return send(ws,{t:'err',msg:'Escolha um nome para entrar.'});
  if(!rate(m.t)){
   if(m.t==='sig')return;
   if(TRAIL.has(m.t)&&!(m.t==='item'&&m.use)){trail(m);return}
   if(m.t==='report'){send(ws,{t:'rep',err:'Aguarde alguns segundos antes de enviar outra denúncia.'});return}
   if(SOFT.has(m.t))return;
   if(m.t==='chat'&&Date.now()-lastWarn>5000){lastWarn=Date.now();send(ws,{t:'sys',text:'⏳ Calma! Aguarde um instante entre mensagens.'})}
   violation();return;
  }
  if(!me){
   if(banCheck(ip))return send(ws,{t:'err',msg:'Muitas tentativas. Aguarde alguns minutos.'});
   if(m.t==='create'){
    if(over(ip,'cr',5,60000))return send(ws,{t:'err',msg:'Muitas salas criadas. Aguarde um minuto.'});
    if(!admitNew(ip,ws))return;
    if(rooms.size>=MAXROOMS)return send(ws,{t:'err',msg:'Servidor cheio (limite de '+MAXROOMS+' salas).'});
    if(m.surv&&!SURVIVAL_ON)return send(ws,{t:'err',msg:'O modo Sobrevivência está desativado neste servidor.'});
    let c;do c=code();while(rooms.has(c));
    room={code:c,style:m.style,host:null,kar:[],karEnd:0,karHead:null,karTurn:0,karAt:0,kdur:false,kcap:false,vids:new Map(),players:new Map(),want:m.bots,inviteAt:0};
    if(m.surv)svStart(room);
    rooms.set(c,room);
    me=addHuman(room,ws,ip,m.name,m.cfg);
    clearTimeout(jt);return;
   }
   if(m.t==='join'){
    if(over(ip,'jn',15,60000))return send(ws,{t:'err',msg:'Muitas tentativas. Aguarde um minuto.'});
    if(blocked(ip,'jf',8,600000))return send(ws,{t:'err',msg:'Muitas tentativas incorretas. Aguarde 10 minutos.'});
    room=rooms.get(m.code);
    if(!room){const a=hitCount(ip,'jf',999,600000);if(a.count===12)banStrike(ip,'codigos');return send(ws,{t:'err',msg:'Sala não encontrada. Confira o código.'})}
    if(!admitNew(ip,ws))return;
    if(humans(room).length>=MAX)return send(ws,{t:'err',msg:'Sala lotada (limite de '+MAX+' pessoas).'});
    if(keyHumans(room,ip)>=PERIP_ROOM)return send(ws,{t:'err',msg:'Limite de acessos do mesmo local nesta sala.'});
    me=addHuman(room,ws,ip,m.name,m.cfg);
    clearTimeout(jt);return;
   }
   if(m.t==='resume'){
    if(over(ip,'rs',60,60000)){send(ws,{t:'err',scope:'resume',msg:'Muitas tentativas de reconexão. Aguarde um minuto.'});try{ws.close(1000,'resume')}catch(e){};return}
    room=rooms.get(m.code);
    if(!room){send(ws,{t:'err',scope:'resume',msg:'Sessão expirada ou inválida. Entre novamente com o código da sala.'});try{ws.close(1000,'resume')}catch(e){};return}
    const p=resumeSession(room,ws,ip,m);
    if(p){me=p;clearTimeout(jt)}
    return;
   }
   return;
  }
  if(room.sv&&SV_BLOCK.test(m.t))return;
  switch(m.t){
   case 'leave':{const p=me,r=room;me=null;room=null;dropPlayer(r,p);try{ws.close(4000,'leave')}catch(e){};break}
   case 'move':{
    if(room.sv){const q=room.sv.st.P.get(me.id);if(q&&!q.faint){SV.setPos(room.sv.st,me.id,m.x,m.z);me.x=q.x;me.z=q.z}}
    else{const [cx,cz]=clampPos(m.x,m.z);me.x=cx;me.z=cz}
    me.ry=m.ry;me.y=m.y;me.s=m.s;break}
   case 'pst':{if(!room.sv||me.bot)break;const vc=SKYREC.viewCode(m.k);if(PSTATS.register(vc,censor(me.name))){me.pk=vc;send(ws,{t:'pstok'})}else send(ws,{t:'sverr',e:'limite'});break}
   case 'sv':{if(!room.sv)break;const r=svAct(room,me,m);if(r&&r.err)send(ws,{t:'sverr',e:r.err});else{room.sv.dirty=true;if(r&&r.gave)bc(room,{t:'sve',e:[{t:'gave',...r.gave}]})}break}
   case 'cfg':me.cfg=m.cfg;bc(room,{t:'cfg',id:me.id,cfg:me.cfg},ws);break;
   case 'chat':{const now=Date.now();if(m.text===lastTxt&&now-lastAt<5000)break;lastTxt=m.text;lastAt=now;const txt=censor(m.text);bc(room,{t:'chat',id:me.id,name:me.name,text:txt});const lg=room.log||(room.log=[]);lg.push({at:now,id:me.id,name:me.name,text:txt});if(lg.length>30)lg.shift();botChat.hear(room.bc||(room.bc=botChat.state()),txt,[...room.players.values()].filter(p=>p.bot),now,me.name);break}
   case 'item':{
    if(m.use){if(!m.item||me.item!==m.item)break;bc(room,{t:'item',id:me.id,item:me.item,use:1});if(FOOD.has(me.item))me.item=null;break}
    me.item=m.item;bc(room,{t:'item',id:me.id,item:me.item,use:0});break}
   case 'gest':{if(V.SOUND_G.has(m.g)){const now=Date.now();lt.sl=(lt.sl||[]).filter(x=>now-x<60000);if(now-(lt.snd||0)<5000||lt.sl.length>=6){send(ws,{t:'sys',text:'⏳ Gestos com som têm limite para evitar spam.'});break}lt.snd=now;lt.sl.push(now)}bc(room,{t:'gest',id:me.id,g:m.g},ws);break}
   case 'emo':bc(room,{t:'emo',id:me.id,i:m.i},ws);break;
   case 'speak':{const v=m.v;if(v===!!me.talk)break;me.talk=v;talkLog(room,me,v);bc(room,{t:'speak',id:me.id,v},ws);break}
   case 'ice':send(ws,{t:'ice',ice:iceCfg()});break;
   case 'bots':{
    if(room.host!==me.id||room.sv)break;
    room.want=m.n;
    const wantBot=Math.min(room.want,MAX-humans(room).length);
    fit(room);
    if([...room.players.values()].filter(p=>p.bot).length<wantBot)send(ws,{t:'sys',text:'Não há mais bots disponíveis no momento.'});
    bc(room,{t:'bots',want:room.want});break}
   // sinalização de voz: por par (quem manda → quem recebe), no máximo 4 ofertas/respostas e 120 mensagens a cada 5 s. Uma conexão de voz usa
   // 1 oferta + ~10–30 candidatos; um troll mandando 120 ofertas por segundo para alguém travava o navegador dessa pessoa.
   case 'sig':{if(!VOICE_ON())break;const to=room.players.get(m.to);if(!to||to.bot||to===me||!to.online||!to.ws)break;
    const now=Date.now(),sw=me.sigW||(me.sigW=new Map());let w=sw.get(to.id);if(!w||now-w.t>5000){w={t:now,d:0,n:0};sw.set(to.id,w);if(sw.size>64)sw.delete(sw.keys().next().value)}
    if(++w.n>120||(m.data.d&&++w.d>4))break;
    const sd=m.data.x?m.data:voiceSig(m.data);if(!sd)break;send(to.ws,{t:'sig',from:me.id,data:sd});break}
   case 'video':{
    const cur=room.vids.get(me.id),swap=!!cur;
    if(swap&&cur.vid===m.vid&&!cur.ended)break;
    if(swap)clearTimeout(cur.endT);
    if(!swap&&room.vids.size>=MAX_VIDS){send(ws,{t:'vbusy'});break}
    for(const v of room.vids.values())v.viewers.delete(me.id);
    const sess={vid:m.vid,by:me.id,name:me.name,vs:{time:0,playing:true,at:Date.now()},viewers:swap?cur.viewers:new Set()};
    room.vids.set(me.id,sess);
    const msg={t:'vinv',vid:m.vid,name:me.name,by:me.id,...(swap?{swap:1}:{})};
    if(swap)bc(room,msg);else bc(room,msg,ws);break}
   case 'dj':{
    if(room.dj&&room.dj.by!==me.id){send(ws,{t:'djbusy'});break}
    const url=m.url,who=me,rm=room;
    radio.probe(url).then(r=>{
     if(rooms.get(rm.code)!==rm||!rm.players.has(who.id))return;
     if(rm.dj&&rm.dj.by!==who.id){if(who.ws)send(who.ws,{t:'djbusy'});return}
     if(!r.ok){if(who.ws)send(who.ws,{t:'djerr',msg:RADIO_WHY[r.reason]||RADIO_WHY.connect});return}
     if(rm.dj)radio.stop(rm.code);
     rm.dj={url,by:who.id,name:who.name};bc(rm,{t:'dj',url:'',host:new URL(url).host,name:who.name,by:who.id})
    }).catch(e=>logError('dj',e));break}
   case 'djstop':if(room.dj&&(room.dj.by===me.id||room.host===me.id))djClear(room);break;
   case 'tsync':send(ws,{t:'tsync',c:m.c,s:Date.now()});break;
   case 'report':send(ws,{t:'rep',...reportNew(room,me,m)});break;
   case 'vsync':{const v=room.vids.get(me.id);if(!v||v.ended)break;const at=syncAt(m.ts);v.vs={time:m.time,playing:m.playing,at};
    for(const id of v.viewers){const p=room.players.get(id);if(p&&p.ws)send(p.ws,{t:'vsync',by:me.id,time:m.time,playing:m.playing,at})}break}
   case 'vend':{const v=room.vids.get(me.id);if(!v||v.ended)break;v.ended=Date.now();clearTimeout(v.endT);const rm=room,by=me.id;
    v.endT=setTimeout(()=>{if(rm.vids.get(by)===v)dropVid(rm,by,'idle')},VIDEO_IDLE_MS);if(v.endT.unref)v.endT.unref();
    for(const id of v.viewers){const p=room.players.get(id);if(p&&p.ws)send(p.ws,{t:'vend',by,left:VIDEO_IDLE_MS})}break}
   case 'vstop':{const by=m.by||me.id,v=room.vids.get(by);if(v&&(by===me.id||room.host===me.id))dropVid(room,by,undefined,ws);break}
   case 'vjoin':{const v=room.vids.get(m.by);if(!v||m.by===me.id)break;
    dropVid(room,me.id,undefined,ws);// quem aceita o vídeo de outro jogador deixa de controlar o próprio: ele passa a só assistir
    for(const o of room.vids.values())o.viewers.delete(me.id);v.viewers.add(me.id);
    if(v.ended){send(ws,{t:'vend',by:v.by,left:Math.max(0,VIDEO_IDLE_MS-(Date.now()-v.ended))});break}
    send(ws,{t:'vsync',by:v.by,time:v.vs.time,playing:v.vs.playing,at:v.vs.at});break}
   case 'vleave':{const v=room.vids.get(m.by);if(v)v.viewers.delete(me.id);break}
   case 'kjoin':{if(kmem(room,me.id)||room.kar.length>=MAX)break;const was=!room.kar.length;room.kar.push({id:me.id,vid:m.vid});kbc(room);if(was)kinvite(room,me);else if(room.ks)send(ws,room.ks);break}
   case 'ksong':{const k=room.kar.find(x=>x.id===me.id);if(!k)break;const hd=room.kar[0]===k;if(hd&&k.vid)break;k.vid=m.vid;if(hd)kstart(room);kbc(room);break}
   case 'kleave':dropKaraoke(room,me.id);break;
   case 'kpass':if(room.kar.length&&room.kar[0].id===me.id)krot(room);break;
   case 'kdur':if(room.kar[0]&&room.kar[0].id===me.id&&!room.kdur){room.kdur=true;const cap=kcap(room),end=Date.now()+m.d*1000+KEXTRA;room.karEnd=Math.min(end,cap);room.kcap=end>=cap;kbc(room)}break;
   case 'kend':if(room.kar[0]&&room.kar[0].id===me.id&&Date.now()-room.karAt>10000)krot(room);break;
   case 'ksync':if(room.kar[0]&&room.kar[0].id===me.id){const o={t:'ksync',time:m.time,playing:m.playing,at:syncAt(m.ts)};room.ks=o;for(const p of room.players.values())if(!p.bot&&p.ready&&p.online&&p.ws&&p!==me&&kmem(room,p.id))send(p.ws,o)}break;
  }
 }catch(e){logError('mensagem',e)}});
 ws.on('close',code=>{try{clearTimeout(jt);for(const k in defer)clearTimeout(defer[k].tm);const c=(conns.get(ip)||1)-1;if(c>0)conns.set(ip,c);else conns.delete(ip);if(!me)return;
  const p=me;me=null;
  if(code===4000||code===1008||code===1009)dropPlayer(room,p);else markOffline(room,p)}catch(e){logError('close',e)}})});

process.on('uncaughtException',e=>{console.error('erro fatal:',e&&e.stack||e);process.exit(1)});
process.on('unhandledRejection',e=>logError('promise',e));
server.on('error',e=>{console.error('erro no servidor:',e&&e.message||e);process.exit(1)});
server.keepAliveTimeout=10000;
server.maxHeadersCount=100;
let stopping=false;
function shutdown(sig){
 if(stopping)return;stopping=true;
 console.log('Encerrando ('+sig+')…');
 BM.flush();
 recWrite();
 repWrite();SURVSTATS.write();PSTATS.write();
 const done=()=>{try{process.exit(0)}catch(e){}};
 const force=setTimeout(()=>{try{server.closeAllConnections()}catch(e){}done()},3000);
 force.unref();
 for(const w of wss.clients)try{w.close(1001,'servidor encerrando')}catch(e){}
 wss.close(()=>server.close(done));
}
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
server.listen(PORT,BIND_HOST,()=>{
 const addr=server.address(),port=addr&&typeof addr==='object'?addr.port:PORT;
 console.log('Skyke3D '+(PROD?'em produção: '+PUBLIC_URL:'em desenvolvimento')+' — escutando em '+BIND_HOST+':'+port);
 if(!PROD)console.log('Aberto para loopback, rede privada, CGNAT e *.ts.net. Defina PUBLIC_URL=https://seu-dominio para produção.');
 if(STATUS_ON)console.log('Painel de status ativo em /status (acesso por token).');
 if(TICKET_MODE!=='off')console.log('Ticket de admissão: '+TICKET_MODE+(TICKET_MODE==='enforce'&&POW_MAX?' (PoW até '+POW_MAX+' bits)':' (sem PoW)')+'.');
 if(BAN_ON)console.log('Banimento progressivo ativo ('+(BAN_FILE||'somente memória')+').');
 if(GLOBAL_RATE===0)console.warn('Limite global de admissões desativado (GLOBAL_RATE=0).');
 if(TURN_URLS.length&&(TURN_SECRET||TURN_HAS_STATIC))console.log('TURN configurado ('+(TURN_SECRET?'credenciais temporárias':'credenciais estáticas')+').');
 if(HTTP_RATE===0)console.warn('Limite HTTP por IP desativado (HTTP_RATE=0).');
});
