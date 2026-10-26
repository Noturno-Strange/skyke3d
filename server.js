/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os'),net=require('net'),{WebSocketServer}=require('ws');
const V=require('./validate');
const {rateKey,firstClientIp}=require('./netutil');
const {FOOD,CODE_ALPHABET,cleanCfg,clampPos,normalizeMessage}=V;
function envInt(name,def,min,max){
 const raw=process.env[name];
 if(raw===undefined||raw==='')return def;
 if(!/^\d+$/.test(raw)){console.error(name+' inválido: use um inteiro entre '+min+' e '+max+'.');process.exit(1)}
 const n=+raw;
 if(n<min||n>max){console.error(name+' inválido: use um inteiro entre '+min+' e '+max+'.');process.exit(1)}
 return n;
}
const MAX=25,MAXROOMS=75,PORT=envInt('PORT',3000,0,65535),KDEF=600000,KEXTRA=21000,MAXCONN=400,PERIP=envInt('PERIP',6,1,1000),HTTP_RATE=envInt('HTTP_RATE',120,0,1000000);
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
function iceCfg(){
 const ice=[{urls:'stun:stun.l.google.com:19302'}];
 if(TURN_URLS.length&&(TURN_SECRET||TURN_HAS_STATIC)){
  let u=TURN_USER,c=TURN_PASS;
  if(TURN_SECRET){
   u=String(Math.floor(Date.now()/1000)+TURN_TTL)+':'+TURN_LABEL;
   c=crypto.createHmac('sha1',TURN_SECRET).update(u).digest('base64');
  }
  ice.push({urls:TURN_URLS,username:u,credential:c});
 }
 return {iceServers:ice};
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

function ifNoneMatch(q,etag){
 return String(q.headers['if-none-match']||'').split(',').some(x=>x.trim()===etag);
}
function sendCached(q,s,buf,etag,type,cache){
 const h={...HDR,'Content-Type':type,'Cache-Control':cache,'ETag':etag,'Content-Length':buf.length};
 if(ifNoneMatch(q,etag)){delete h['Content-Length'];s.writeHead(304,h);return s.end()}
 s.writeHead(200,h);s.end(q.method==='HEAD'?undefined:buf);
}
function plain(q,s,status,text,extra){
 s.writeHead(status,{...HDR,'Content-Type':'text/plain; charset=utf-8',...extra});
 s.end(q.method==='HEAD'?undefined:text);
}
function onRequest(q,s){
 try{
  const ip=rateKey(ipOf(q));
  if(HTTP_RATE>0&&over(ip,'http',HTTP_RATE,60000))return plain(q,s,429,'429',{'Retry-After':'60'});
  if(q.method!=='GET'&&q.method!=='HEAD')return plain(q,s,405,'405',{Allow:'GET, HEAD'});
  const u=String(q.url||'').split('?')[0];
  if(u==='/status'||u==='/status.json'){
   if(!STATUS_ON)return plain(q,s,404,'404');
   if(u==='/status'){s.writeHead(200,{...HDR,'Cache-Control':'no-store','X-Robots-Tag':'noindex'});return s.end(q.method==='HEAD'?undefined:STATUS_HTML)}
   const J={...HDR,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'};
   if(blocked(ip,'sf',6,600000)){s.writeHead(429,J);return s.end('{"erro":"muitas tentativas"}')}
   const a=String(q.headers.authorization||''),t=a.startsWith('Bearer ')?a.slice(7):'';
   if(!tokOk(t)){over(ip,'sf',999,600000);s.writeHead(401,J);return s.end('{"erro":"não autorizado"}')}
   if(!cache||Date.now()-cacheAt>2000){cache=JSON.stringify(stats());cacheAt=Date.now()}s.writeHead(200,J);return s.end(q.method==='HEAD'?undefined:cache);
  }
  if(u==='/'||u==='/index.html')return sendCached(q,s,INDEX_BUF,INDEX_ETAG,'text/html; charset=utf-8','no-cache');
  if(u==='/vendor/three-r128.min.js')return sendCached(q,s,THREE_BUF,THREE_ETAG,'application/javascript; charset=utf-8','public, max-age=31536000, immutable');
  return plain(q,s,404,'404');
 }catch(e){
  logError('http',e);
  if(!s.headersSent)try{s.writeHead(500,{...HDR,'Content-Type':'text/plain; charset=utf-8'})}catch(x){}
  try{s.end('erro')}catch(x){}
 }
}
const server=http.createServer(onRequest);
const hits=new Map(),conns=new Map();
// ---------- painel /status (somente números, protegido por token) ----------
const STATUS_TOKEN=process.env.STATUS_TOKEN||'',STATUS_ON=STATUS_TOKEN.length>=12;
if(process.env.STATUS_TOKEN&&!STATUS_ON)console.warn('STATUS_TOKEN muito curto (mínimo 12 caracteres): painel /status desativado.');
const hm=x=>crypto.createHmac('sha256','skyke3d-status').update(String(x)).digest(),tokOk=t=>STATUS_ON&&crypto.timingSafeEqual(hm(t),hm(STATUS_TOKEN));
const T0=Date.now(),hist=[],peak={rooms:0,humans:0};let cache=null,cacheAt=0;
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

function stats(){let humans=0,bots=0,kar=0,vid=0;const styles={};for(const r of rooms.values()){const all=[...r.players.values()],hh=all.filter(p=>!p.bot).length;humans+=hh;bots+=all.length-hh;if(r.kar.length)kar++;if(r.vid)vid++;const b=styles[r.style]=styles[r.style]||{rooms:0,humans:0};b.rooms++;b.humans+=hh}
 return{rooms:rooms.size,maxRooms:MAXROOMS,maxPerRoom:MAX,humans,bots,karaoke:kar,video:vid,styles,connections:wss.clients.size,uptime:Math.floor((Date.now()-T0)/1000),peak,history:hist,resources:resourceStats()}}
setInterval(()=>{try{const s=stats();peak.rooms=Math.max(peak.rooms,s.rooms);peak.humans=Math.max(peak.humans,s.humans);hist.push([Math.floor(Date.now()/1000),s.rooms,s.humans]);if(hist.length>240)hist.shift()}catch(e){logError('stats',e)}},15000).unref();
const STATUS_HTML='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="dark light"><title>Skyke3D · Status</title>\n<style>\n:root{--bg:#17121f;--fg:#f5ede0;--card:#2a2236;--bd:#4b3d63;--ac:#ffb23e;--ok:#3ddc84;--mut:#b9aecb}\n@media (prefers-color-scheme:light){:root{--bg:#f4efe6;--fg:#241a12;--card:#fff;--bd:#d8cbb8;--ac:#b86a00;--ok:#16874a;--mut:#6b5e50}}\n*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}\nmain{max-width:780px;margin:0 auto;padding:16px}h1{font-size:1.5rem;margin:6px 0 2px}.sub{color:var(--mut);font-size:.9rem;margin:0 0 14px}\n.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.card{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:14px}\n.k{color:var(--mut);font-size:.85rem}.v{font-size:clamp(1.8rem,7vw,2.6rem);font-weight:800;line-height:1.1}.v small{font-size:.9rem;color:var(--mut);font-weight:600}.v.sm{font-size:clamp(1.2rem,4.8vw,1.7rem);line-height:1.2}\nh2{font-size:1.05rem;margin:20px 0 8px}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--bd);border-radius:14px;overflow:hidden}th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--bd)}th{color:var(--mut);font-weight:600;font-size:.85rem}tr:last-child td{border-bottom:0}\nsvg{width:100%;height:auto;background:var(--card);border:1px solid var(--bd);border-radius:14px}.lg{display:flex;gap:16px;font-size:.85rem;color:var(--mut);margin-top:6px}.lg b{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}\ninput,button{font:inherit;min-height:46px;border-radius:12px;border:1px solid var(--bd);padding:8px 14px;background:var(--card);color:var(--fg)}button{background:var(--ac);color:#111;font-weight:700;border:0;cursor:pointer;touch-action:manipulation}\n#login{display:none;gap:8px;flex-wrap:wrap;margin:12px 0}#login input{flex:1;min-width:200px}#err{color:#ff7a7a;min-height:1.2em}.st{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}\n</style></head><body><main>\n<div class="st"><div><h1>✨ Skyke3D · Status</h1><p class="sub" id="upd">Carregando…</p></div><button id="rf" type="button">Atualizar</button></div>\n<form id="login" autocomplete="off"><input id="tok" type="password" placeholder="Token do painel" aria-label="Token do painel" autocomplete="off"><button type="submit">Entrar</button></form><div id="err" role="alert"></div>\n<div id="dash" style="display:none">\n<div class="grid"><div class="card"><div class="k">Salas abertas</div><div class="v" id="rooms">–</div></div><div class="card"><div class="k">Jogadores</div><div class="v" id="humans">–</div></div><div class="card"><div class="k">Bots</div><div class="v" id="bots">–</div></div><div class="card"><div class="k">Conexões</div><div class="v" id="conn">–</div></div><div class="card"><div class="k">Salas com karaokê</div><div class="v" id="kar">–</div></div><div class="card"><div class="k">Salas com vídeo</div><div class="v" id="vid">–</div></div></div><h2>Recursos do servidor</h2><div class="grid"><div class="card"><div class="k">CPU do sistema</div><div class="v sm" id="cpu">–</div><div class="k" id="cpud">–</div></div><div class="card"><div class="k">Memória do sistema</div><div class="v sm" id="mem">–</div><div class="k" id="memd">–</div></div><div class="card"><div class="k">Rede</div><div class="v sm" id="net">–</div><div class="k" id="netd">–</div></div><div class="card"><div class="k">Memória do jogo</div><div class="v sm" id="gmem">–</div><div class="k" id="gheap">–</div></div></div>\n<h2>Por cenário</h2><table><thead><tr><th>Cenário</th><th>Salas</th><th>Jogadores</th></tr></thead><tbody id="by"></tbody></table>\n<h2>Últimos minutos</h2><svg id="ch" viewBox="0 0 320 110" role="img" aria-label="Gráfico de salas e jogadores"></svg><div class="lg"><span><b style="background:var(--ac)"></b>Salas</span><span><b style="background:var(--ok)"></b>Jogadores</span></div>\n<p class="sub" id="ft"></p></div></main>\n<script>\nvar KEY=\'skyke3d_status_token\',tok=\'\',NAMES={aeris:\'Aeris\',brontis:\'Brontis\',cryon:\'Cryon\',pyra:\'Pyra\',sylvaris:\'Sylvaris\',verdara:\'Verdara\'};\nfunction $(i){return document.getElementById(i)}\ntry{var m=location.hash.match(/token=([^&]+)/);if(m){tok=decodeURIComponent(m[1]);sessionStorage.setItem(KEY,tok);history.replaceState(null,\'\',location.pathname)}else tok=sessionStorage.getItem(KEY)||\'\'}catch(e){}\nfunction T(id,x){$(id).textContent=x}function fmtB(n){if(typeof n!=="number"||!isFinite(n)||n<0)return "–";var u=["B","KB","MB","GB","TB"],i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return (i?n.toFixed(1).replace(".",","):Math.round(n))+" "+u[i]}function fmtPct(n){return typeof n==="number"&&isFinite(n)?n.toFixed(1).replace(".",",")+"%":"–"}function fmtRate(n){return fmtB(n)+"/s"}function resDraw(d){var r=d.resources||{},c=r.cpu||{},m=r.memory||{},n=r.network||{},g=r.game||{};T("cpu",fmtPct(c.system));T("cpud","Jogo "+fmtPct(c.process)+" · "+(c.cores||"?")+" núcleos");T("mem",fmtPct(m.percent));T("memd",fmtB(m.used)+" / "+fmtB(m.total));if(n.available){T("net","↓ "+fmtRate(n.rxRate));T("netd","↑ "+fmtRate(n.txRate)+" · total "+fmtB(n.rxTotal)+" ↓ / "+fmtB(n.txTotal)+" ↑")}else{T("net","–");T("netd","indisponível")}T("gmem",fmtB(g.rss));T("gheap","heap "+fmtB(g.heapUsed)+" / "+fmtB(g.heapTotal))}\nfunction fmtUp(s){var d=Math.floor(s/86400),h=Math.floor(s%86400/3600),mi=Math.floor(s%3600/60);return (d?d+\'d \':\'\')+h+\'h \'+mi+\'min\'}\nfunction chart(h){var svg=$(\'ch\');while(svg.firstChild)svg.removeChild(svg.firstChild);if(h.length<2)return;var W=320,H=110,p=8,mx=Math.max(1,Math.max.apply(null,h.map(function(a){return Math.max(a[1],a[2])})));\n [[1,\'#ffb23e\'],[2,\'#3ddc84\']].forEach(function(c){var pl=document.createElementNS(\'http://www.w3.org/2000/svg\',\'polyline\'),pts=h.map(function(a,i){return (p+i*(W-2*p)/(h.length-1)).toFixed(1)+\',\'+(H-p-a[c[0]]*(H-2*p)/mx).toFixed(1)}).join(\' \');pl.setAttribute(\'points\',pts);pl.setAttribute(\'fill\',\'none\');pl.setAttribute(\'stroke\',c[1]);pl.setAttribute(\'stroke-width\',\'2.5\');pl.setAttribute(\'stroke-linejoin\',\'round\');svg.appendChild(pl)});\n var t=document.createElementNS(\'http://www.w3.org/2000/svg\',\'text\');t.setAttribute(\'x\',\'8\');t.setAttribute(\'y\',\'12\');t.setAttribute(\'font-size\',\'10\');t.setAttribute(\'fill\',\'#999\');t.textContent=\'máx. \'+mx;svg.appendChild(t)}\nfunction draw(d){$(\'login\').style.display=\'none\';$(\'dash\').style.display=\'block\';T(\'err\',\'\');T(\'rooms\',d.rooms+\' / \'+d.maxRooms);T(\'humans\',d.humans);T(\'bots\',d.bots);T(\'conn\',d.connections);T(\'kar\',d.karaoke);T(\'vid\',d.video);\n var b=$(\'by\');while(b.firstChild)b.removeChild(b.firstChild);Object.keys(NAMES).forEach(function(k){var s=d.styles[k]||{rooms:0,humans:0},tr=document.createElement(\'tr\');[NAMES[k],s.rooms,s.humans].forEach(function(x){var td=document.createElement(\'td\');td.textContent=x;tr.appendChild(td)});b.appendChild(tr)});\n chart(d.history||[]);resDraw(d);T(\'ft\',\'No ar há \'+fmtUp(d.uptime)+\' · pico: \'+d.peak.rooms+\' salas, \'+d.peak.humans+\' jogadores · máx. \'+d.maxPerRoom+\' pessoas por sala\');T(\'upd\',\'Atualizado às \'+new Date().toLocaleTimeString())}\nfunction needLogin(msg){$(\'dash\').style.display=\'none\';$(\'login\').style.display=\'flex\';T(\'err\',msg||\'\');T(\'upd\',\'Acesso restrito\')}\nfunction load(){if(!tok){needLogin();return}\n fetch(\'/status.json\',{headers:{Authorization:\'Bearer \'+tok},cache:\'no-store\'}).then(function(r){if(r.status===401){tok=\'\';try{sessionStorage.removeItem(KEY)}catch(e){}needLogin(\'Token inválido.\');return null}if(r.status===429){needLogin(\'Muitas tentativas. Aguarde alguns minutos.\');return null}if(!r.ok){T(\'err\',\'Erro \'+r.status);return null}return r.json()}).then(function(d){if(d)draw(d)}).catch(function(){T(\'err\',\'Sem conexão com o servidor.\')})}\n$(\'login\').addEventListener(\'submit\',function(e){e.preventDefault();tok=$(\'tok\').value.trim();$(\'tok\').value=\'\';try{sessionStorage.setItem(KEY,tok)}catch(x){}load()});\n$(\'rf\').addEventListener(\'click\',load);setInterval(function(){if(!document.hidden&&tok)load()},5000);load();\n</script></body></html>';

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
const INDEX_BUF=readStatic('index.html');
const THREE_BUF=readStatic(path.join('vendor','three-r128.min.js'));
const etagOf=buf=>'"'+crypto.createHash('sha256').update(buf).digest('base64url').slice(0,27)+'"';
const INDEX_ETAG=etagOf(INDEX_BUF),THREE_ETAG=etagOf(THREE_BUF);
function inlineScriptHashes(html){
 const out=new Set(),re=/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;let m;
 while((m=re.exec(html)))if(!/\bsrc\s*=/i.test(m[1]))out.add("'sha384-"+crypto.createHash('sha384').update(m[2],'utf8').digest('base64')+"'");
 return [...out];
}
const SCRIPT_HASHES=[...new Set([...inlineScriptHashes(INDEX_BUF.toString('utf8')),...inlineScriptHashes(STATUS_HTML)])];
const CONNECT_SRC=PROD?["'self'",...[...ALLOWED_HOSTS].map(h=>'wss://'+h)].join(' '):"'self' ws: wss:";
const CSP=[
 "default-src 'self'",
 "script-src 'self' "+SCRIPT_HASHES.join(' ')+" https://www.youtube.com https://s.ytimg.com",
 "script-src-attr 'none'",
 "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
 "font-src 'self' https://fonts.gstatic.com",
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

const blocked=(ip,key,max,ms)=>(hits.get(key+'|'+ip)||[]).filter(t=>Date.now()-t<ms).length>=max;
function over(ip,key,max,ms){const k=key+'|'+ip,now=Date.now(),a=(hits.get(k)||[]).filter(t=>now-t<ms);a.push(now);hits.set(k,a);return a.length>max}
setInterval(()=>{const now=Date.now();for(const[k,a]of hits)if(!a.length||now-a[a.length-1]>120000)hits.delete(k)},60000).unref();
const wss=new WebSocketServer({server,maxPayload:32768,verifyClient:(info,cb)=>{
 try{
  const req=info.req,ip=rateKey(ipOf(req));
  if(over(ip,'hs',120,60000))return cb(false,429,'limite');
  const host=parseHost(oneHeader(req,'host'));
  const origin=parseOrigin(oneHeader(req,'origin'));
  if(!hostAllowed(host)||!originAllowed(origin,host)){
   if(over(ip,'hsbad',30,60000))return cb(false,429,'limite');
   return cb(false,403,'origem negada');
  }
  if((conns.get(ip)||0)>=PERIP||wss.clients.size>=MAXCONN)return cb(false,429,'limite');
  cb(true);
 }catch(e){logError('handshake',e);try{cb(false,500,'erro')}catch(x){}}
}});
setInterval(()=>{try{for(const w of wss.clients){if(!w.alive){w.terminate();continue}w.alive=false;try{w.ping()}catch(e){}}}catch(e){logError('ping',e)}},30000).unref();
const rooms=new Map();let nid=1;
const BN=['Marina','Caio','Duda','Bruno','Lia','Theo','Nina','Davi','Bia'],BL=['Opa, bem-vindo!','Esse lugar tá incrível ✨','Já provou o suco?','Alguém quer cantar no karaokê?','Que poção boa!'];
const RATE={
 chat:[700,5,5000],item:[150,15,5000],gest:[1500,8,10000],emo:[400,12,5000],cfg:[200,15,5000],
 video:[8000,2,30000],kjoin:[1000,4,10000],ksong:[1000,4,10000],bots:[1000,3,5000],
 move:[25,40,1000],sig:[0,300,10000],speak:[100,10,1000],ice:[60000,1,60000],
 vjoin:[500,4,5000],vstop:[500,4,5000],kleave:[500,4,5000],kpass:[1000,3,5000],
 kdur:[1000,2,10000],kend:[1000,2,10000],ksync:[200,10,5000],vsync:[200,10,5000],
 create:[1000,3,60000],join:[1000,5,60000],resume:[1000,5,60000],leave:[0,1,1000]
};
// Ações de interface: ao estourar o limite, descarta sem punir (nunca derruba a conexão).
// cfg/item guardam só o ÚLTIMO estado e o aplicam quando o limite liberar.
const SOFT=new Set(['cfg','item','emo','gest','speak','vjoin','vstop','kleave','kpass','ksync','vsync','bots']),TRAIL=new Set(['cfg','item']);
const MSG_PER_SEC=150,SIG_PER_SEC=120,KINVITE_MS=15000,MAX_BUFFERED=1<<20;
const rnd=n=>Math.floor(Math.random()*n),rr=(a,b)=>a+Math.random()*(b-a);
const code=()=>[...crypto.randomBytes(10)].map(x=>CODE_ALPHABET[x%CODE_ALPHABET.length]).join('');
const send=(w,m)=>{
 if(!w||w.readyState!==1)return;
 if(w.bufferedAmount>MAX_BUFFERED){try{w.terminate()}catch(e){}return}
 try{w.send(JSON.stringify(m))}catch(e){try{w.terminate()}catch(x){}}
};
const bc=(r,m,ex)=>{for(const p of r.players.values())if(!p.bot&&p.ready&&p.online&&p.ws&&p.ws!==ex)send(p.ws,m)};
const pub=p=>({id:p.id,name:p.name,cfg:p.cfg,x:p.x,z:p.z,ry:p.ry,y:p.y||0,s:p.s||0,bot:!!p.bot,item:p.item,talk:!!p.talk});
const humans=r=>[...r.players.values()].filter(p=>!p.bot);
const onlineHumans=r=>[...r.players.values()].filter(p=>!p.bot&&p.online&&p.ws);
const newToken=()=>crypto.randomBytes(32).toString('base64url');
function tokenEq(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 try{return crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b))}catch(e){return false}
}
const kq=r=>r.kar.map(k=>({id:k.id,name:(r.players.get(k.id)||{}).name||'?',vid:k.vid})),kmem=(r,id)=>r.kar.some(k=>k.id===id);
function kstart(r){const h=r.kar[0];r.karEnd=Date.now()+(h&&h.vid?KDEF:120000);r.karAt=Date.now();r.kdur=false;r.karTurn++}
function kbc(r){const h=r.kar[0]&&r.kar[0].id;if(h!==r.karHead){r.karHead=h;if(h)kstart(r)}bc(r,{t:'kar',q:kq(r),left:Math.max(0,r.karEnd-Date.now()),turn:r.karTurn})}
function krot(r){if(!r.kar.length)return;const f=r.kar.shift();f.vid=null;r.kar.push(f);if(r.kar.some(k=>k.vid)){let n=r.kar.length;while(!r.kar[0].vid&&n-->0)r.kar.push(r.kar.shift())}r.karHead=r.kar[0].id;kstart(r);kbc(r)}
function kinvite(r,from){const now=Date.now();if(now-(r.inviteAt||0)<KINVITE_MS)return;r.inviteAt=now;for(const p of r.players.values())if(!p.bot&&p.ready&&p.online&&p.ws&&p.id!==from.id&&!kmem(r,p.id))send(p.ws,{t:'kinv',name:from.name})}
function newBot(r){const used=new Set([...r.players.values()].map(p=>p.name)),id='b'+nid++;
 const b={id,bot:1,name:BN.find(n=>!used.has(n))||'Bot'+nid,cfg:cleanCfg({skin:rnd(4),eye:rnd(4),shirt:rnd(20),hair:rnd(12),h2:rnd(12),hc:rnd(20),hs:rnd(24),fc:rnd(8),hat:rnd(3)?0:1+rnd(5),bt:rnd(2),pc:rnd(20),sc:rnd(20),shoes:rnd(3)}),x:rr(-6,6),z:rr(-2,4),ry:0,y:0,s:0,item:null,next:0};
 b.tx=b.x;b.tz=b.z;r.players.set(id,b);return b}
function fit(r){const target=Math.max(0,Math.min(r.want,MAX-humans(r).length)),bots=[...r.players.values()].filter(p=>p.bot);
 while(bots.length>target){const b=bots.pop();r.players.delete(b.id);bc(r,{t:'pl',id:b.id})}
 while(bots.length<target){const b=newBot(r);bots.push(b);bc(r,{t:'pj',p:pub(b)})}}

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
 r.players.clear();r.kar=[];r.vid=null;r.vs=null;rooms.delete(r.code);
}
function stopVideo(r,by){
 if(r.vid&&r.vid.by===by){r.vid=null;r.vs=null;bc(r,{t:'vstop'})}
}
function dropKaraoke(r,id){
 if(kmem(r,id)){r.kar=r.kar.filter(k=>k.id!==id);kbc(r)}
}
function dropPlayer(r,p){
 if(!r.players.has(p.id))return;
 if(p.retire){clearTimeout(p.retire);p.retire=null}
 p.online=false;p.ready=false;p.ws=null;
 stopVideo(r,p.id);
 dropKaraoke(r,p.id);
 if(p.talk){p.talk=false;bc(r,{t:'speak',id:p.id,v:false})}
 r.players.delete(p.id);
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
 if(p.talk){p.talk=false;bc(r,{t:'speak',id:p.id,v:false})}
 if(r.host===p.id)hostTransfer(r);
}
setInterval(()=>{try{const now=Date.now();for(const r of rooms.values()){const s=[],full=now>=(r.fullAt||0);
 if(r.kar.length&&now>=r.karEnd){bc(r,{t:'chat',name:'🎶 Karaokê',text:'Fim da música! Próximo cantor.'});krot(r)}
 for(const p of r.players.values()){
  if(p.bot){if(now>p.next){p.next=now+3000+Math.random()*5000;const [tx,tz]=clampPos(rr(-6,6),rr(-2.5,4.5));p.tx=tx;p.tz=tz;if(Math.random()<.3)bc(r,{t:'chat',name:p.name,text:BL[rnd(BL.length)]})}
   const dx=p.tx-p.x,dz=p.tz-p.z,d=Math.hypot(dx,dz);if(d>.2){p.x+=dx/d*.14;p.z+=dz/d*.14;p.ry=Math.atan2(dx,dz)}}
  const e=[p.id,+p.x.toFixed(2),+p.z.toFixed(2),+p.ry.toFixed(2),+(p.y||0).toFixed(2),p.s?1:0],k=e.join();if(full||k!==p.lst){p.lst=k;s.push(e)}}
 if(s.length)bc(r,{t:'st',s});if(full)r.fullAt=now+5000}}catch(e){logError('tick',e)}},100).unref();
function joinPayload(room,me,resume){
 return {t:'joined',url:PUBLIC_URL,ice:iceCfg(),id:me.id,code:room.code,style:room.style,host:room.host,want:room.want,
  players:[...room.players.values()].map(pub),kar:kq(room),kl:Math.max(0,room.karEnd-Date.now()),turn:room.karTurn,
  token:me.token,self:pub(me),reconnect:RECONNECT_MS,...(resume?{resume:1}:{})};
}
function addHuman(room,ws,ip,name,cfg){
 const p={id:'p'+nid++,ip,name,cfg,room,x:0,z:5,ry:0,y:0,s:0,item:null,talk:false,ws,ready:false,online:true,retire:null,token:newToken()};
 room.players.set(p.id,p);
 if(!room.host){room.host=p.id;bc(room,{t:'host',id:p.id})}
 fit(room);
 send(ws,joinPayload(room,p,false));
 if(room.vid)send(ws,{t:'vinv',vid:room.vid.vid,name:room.vid.name});
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
 if(room.vid)send(ws,{t:'vinv',vid:room.vid.vid,name:room.vid.name});
 if(room.kar.length)send(ws,{t:'kinv',name:(room.players.get(room.kar[0].id)||{}).name||'Alguém'});
 p.ready=true;
 return p;
}

wss.on('connection',(ws,req)=>{const ip=rateKey(ipOf(req));conns.set(ip,(conns.get(ip)||0)+1);ws.alive=true;ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});
 let me=null,room=null,n=0,sigN=0,lt={},lastTxt='',lastAt=0,lastWarn=0,rl={},badHits=[],defer={};
 const iv=setInterval(()=>{n=0;sigN=0},1000),jt=setTimeout(()=>{if(!me)ws.close()},15000);
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
  if(badHits.length>=8){try{send(ws,{t:'sys',text:'Você foi desconectado por excesso de requisições.'})}catch(e){};try{ws.close(1008,'rate limit')}catch(e){};return true}
  return false;
 };
 const closePolicy=text=>{try{send(ws,{t:'sys',text})}catch(e){};try{ws.close(1008,'policy')}catch(e){}};
 ws.on('message',raw=>{try{
  let msg;try{msg=JSON.parse(raw)}catch(e){if(++n>MSG_PER_SEC)closePolicy('Muitas mensagens. A conexão foi encerrada.');else violation();return}
  const isSig=!!msg&&msg.t==='sig';
  if(isSig){if(++sigN>SIG_PER_SEC)return}
  else if(++n>MSG_PER_SEC){closePolicy('Muitas mensagens. A conexão foi encerrada.');return}
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
  if(!rate(m.t)){
   if(m.t==='sig')return;
   if(TRAIL.has(m.t)&&!(m.t==='item'&&m.use)){trail(m);return}
   if(SOFT.has(m.t))return;
   if(m.t==='chat'&&Date.now()-lastWarn>5000){lastWarn=Date.now();send(ws,{t:'sys',text:'⏳ Calma! Aguarde um instante entre mensagens.'})}
   violation();return;
  }
  if(!me){
   if(m.t==='create'){
    if(over(ip,'cr',5,60000))return send(ws,{t:'err',msg:'Muitas salas criadas. Aguarde um minuto.'});
    if(rooms.size>=MAXROOMS)return send(ws,{t:'err',msg:'Servidor cheio (limite de '+MAXROOMS+' salas).'});
    let c;do c=code();while(rooms.has(c));
    room={code:c,style:m.style,host:null,kar:[],karEnd:0,karHead:null,karTurn:0,karAt:0,kdur:false,vid:null,vs:null,players:new Map(),want:m.bots,inviteAt:0};
    rooms.set(c,room);
    me=addHuman(room,ws,ip,m.name,m.cfg);
    clearTimeout(jt);return;
   }
   if(m.t==='join'){
    if(over(ip,'jn',15,60000))return send(ws,{t:'err',msg:'Muitas tentativas. Aguarde um minuto.'});
    if(blocked(ip,'jf',8,600000))return send(ws,{t:'err',msg:'Muitas tentativas incorretas. Aguarde 10 minutos.'});
    room=rooms.get(m.code);
    if(!room){over(ip,'jf',999,600000);return send(ws,{t:'err',msg:'Sala não encontrada. Confira o código.'})}
    if(humans(room).length>=MAX)return send(ws,{t:'err',msg:'Sala lotada (limite de '+MAX+' pessoas).'});
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
  switch(m.t){
   case 'leave':{const p=me,r=room;me=null;room=null;dropPlayer(r,p);try{ws.close(4000,'leave')}catch(e){};break}
   case 'move':me.x=m.x;me.z=m.z;me.ry=m.ry;me.y=m.y;me.s=m.s;break;
   case 'cfg':me.cfg=m.cfg;bc(room,{t:'cfg',id:me.id,cfg:me.cfg},ws);break;
   case 'chat':{const now=Date.now();if(m.text===lastTxt&&now-lastAt<5000)break;lastTxt=m.text;lastAt=now;bc(room,{t:'chat',name:me.name,text:m.text});break}
   case 'item':{
    if(m.use){if(!m.item||me.item!==m.item)break;bc(room,{t:'item',id:me.id,item:me.item,use:1});if(FOOD.has(me.item))me.item=null;break}
    me.item=m.item;bc(room,{t:'item',id:me.id,item:me.item,use:0});break}
   case 'gest':{if(m.g==='scream'||m.g==='fart'){const now=Date.now();lt.sl=(lt.sl||[]).filter(x=>now-x<60000);if(now-(lt.snd||0)<5000||lt.sl.length>=6){send(ws,{t:'sys',text:'⏳ Gestos com som têm limite para evitar spam.'});break}lt.snd=now;lt.sl.push(now)}bc(room,{t:'gest',id:me.id,g:m.g},ws);break}
   case 'emo':bc(room,{t:'emo',id:me.id,i:m.i},ws);break;
   case 'speak':{const v=m.v;if(v===!!me.talk)break;me.talk=v;bc(room,{t:'speak',id:me.id,v},ws);break}
   case 'ice':send(ws,{t:'ice',ice:iceCfg()});break;
   case 'bots':if(room.host!==me.id)break;room.want=m.n;fit(room);bc(room,{t:'bots',want:room.want});break;
   case 'sig':{const to=room.players.get(m.to);if(!to||to.bot||to===me||!to.online||!to.ws)break;send(to.ws,{t:'sig',from:me.id,data:m.data});break}
   case 'video':if(room.vid&&room.vid.by!==me.id){send(ws,{t:'vbusy'});break}room.vid={vid:m.vid,by:me.id,name:me.name};room.vs={time:0,playing:true,at:Date.now()};bc(room,{t:'vinv',vid:room.vid.vid,name:me.name},ws);break;
   case 'vsync':if(room.vid&&room.vid.by===me.id){room.vs={time:m.time,playing:m.playing,at:Date.now()};bc(room,{t:'vsync',time:m.time,playing:m.playing},ws)}break;
   case 'vstop':if(room.vid&&(room.vid.by===me.id||room.host===me.id)){room.vid=null;room.vs=null;bc(room,{t:'vstop'},ws)}break;
   case 'vjoin':if(room.vid&&room.vs){const e=room.vs.playing?(Date.now()-room.vs.at)/1000:0;send(ws,{t:'vsync',time:Math.max(0,Math.min(V.MAX_VIDEO_TIME,room.vs.time+e)),playing:room.vs.playing})}break;
   case 'kjoin':{if(kmem(room,me.id)||room.kar.length>=MAX)break;const was=!room.kar.length;room.kar.push({id:me.id,vid:m.vid});kbc(room);if(was)kinvite(room,me);break}
   case 'ksong':{const k=room.kar.find(x=>x.id===me.id);if(!k)break;const hd=room.kar[0]===k;if(hd&&k.vid)break;k.vid=m.vid;if(hd)kstart(room);kbc(room);break}
   case 'kleave':dropKaraoke(room,me.id);break;
   case 'kpass':if(room.kar.length&&room.kar[0].id===me.id)krot(room);break;
   case 'kdur':if(room.kar[0]&&room.kar[0].id===me.id&&!room.kdur){room.kdur=true;room.karEnd=Date.now()+m.d*1000+KEXTRA;kbc(room)}break;
   case 'kend':if(room.kar[0]&&room.kar[0].id===me.id&&Date.now()-room.karAt>10000)krot(room);break;
   case 'ksync':if(room.kar[0]&&room.kar[0].id===me.id){const o={t:'ksync',time:m.time,playing:m.playing};for(const p of room.players.values())if(!p.bot&&p.ready&&p.online&&p.ws&&p!==me&&kmem(room,p.id))send(p.ws,o)}break;
  }
 }catch(e){logError('mensagem',e)}});
 ws.on('close',code=>{try{clearInterval(iv);clearTimeout(jt);for(const k in defer)clearTimeout(defer[k].tm);const c=(conns.get(ip)||1)-1;if(c>0)conns.set(ip,c);else conns.delete(ip);if(!me)return;
  const p=me;me=null;
  if(code===4000||code===1008||code===1009)dropPlayer(room,p);else markOffline(room,p)}catch(e){logError('close',e)}})});

process.on('uncaughtException',e=>{console.error('erro fatal:',e&&e.stack||e);process.exit(1)});
process.on('unhandledRejection',e=>logError('promise',e));
server.on('error',e=>{console.error('erro no servidor:',e&&e.message||e);process.exit(1)});
server.headersTimeout=20000;
server.requestTimeout=30000;
server.keepAliveTimeout=10000;
server.maxHeadersCount=100;
let stopping=false;
function shutdown(sig){
 if(stopping)return;stopping=true;
 console.log('Encerrando ('+sig+')…');
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
 if(TURN_URLS.length&&(TURN_SECRET||TURN_HAS_STATIC))console.log('TURN configurado ('+(TURN_SECRET?'credenciais temporárias':'credenciais estáticas')+').');
 if(HTTP_RATE===0)console.warn('Limite HTTP por IP desativado (HTTP_RATE=0).');
});
