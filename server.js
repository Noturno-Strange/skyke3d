/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os'),{WebSocketServer}=require('ws');
const MAX=25,MAXROOMS=75,PORT=process.env.PORT===undefined?3000:+process.env.PORT,AL='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',KDEF=600000,MAXCONN=400,PERIP=6;
const TURN_URL=process.env.TURN_URL||'',TURN_USER=process.env.TURN_USER||'',TURN_PASS=process.env.TURN_PASS||'',TURN_SECRET=process.env.TURN_SECRET||'';
if(process.env.RELAY_ONLY)console.warn('RELAY_ONLY foi removido: o TURN agora é usado apenas como fallback (iceTransportPolicy=all).');
function iceCfg(){const ice=[{urls:'stun:stun.l.google.com:19302'}];if(TURN_URL){let u=TURN_USER,c=TURN_PASS;if(TURN_SECRET){u=String(Math.floor(Date.now()/1000)+3600)+':barnonn';c=crypto.createHmac('sha1',TURN_SECRET).update(u).digest('base64')}ice.push({urls:TURN_URL.split(',').map(x=>x.trim()).filter(Boolean),username:u,credential:c})}return{iceServers:ice}}
const PUBLIC_URL=/^https?:\/\/[^\s]+$/.test(process.env.PUBLIC_URL||'')?process.env.PUBLIC_URL.replace(/\/+$/,''):'';
const ORIGINS=(process.env.ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
const HDR={'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'microphone=(self), camera=(), geolocation=()',
 'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://www.youtube.com https://s.ytimg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://i.ytimg.com https://img.youtube.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self' ws: wss:; media-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"};
const ipOf=q=>{const a=q.socket.remoteAddress||'?';if(/^(::1|127\.|::ffff:127\.)/.test(a)){const h=q.headers['cf-connecting-ip']||String(q.headers['x-forwarded-for']||'').split(',')[0];if(h&&h.trim())return h.trim().slice(0,64)}return a};
const server=http.createServer((q,s)=>{if(q.method!=='GET'&&q.method!=='HEAD'){s.writeHead(405,{Allow:'GET, HEAD'});return s.end()}
 const u=String(q.url||'').split('?')[0];
 if(u==='/status'||u==='/status.json'){if(!STATUS_ON){s.writeHead(404);return s.end('404')}
  if(u==='/status'){s.writeHead(200,{...HDR,'Cache-Control':'no-store','X-Robots-Tag':'noindex'});return s.end(q.method==='HEAD'?undefined:STATUS_HTML)}
  const ip=ipOf(q),J={...HDR,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'};
  if(blocked(ip,'sf',6,600000)){s.writeHead(429,J);return s.end('{"erro":"muitas tentativas"}')}
  const a=String(q.headers.authorization||''),t=a.startsWith('Bearer ')?a.slice(7):'';
  if(!tokOk(t)){over(ip,'sf',999,600000);s.writeHead(401,J);return s.end('{"erro":"não autorizado"}')}
  if(!cache||Date.now()-cacheAt>2000){cache=JSON.stringify(stats());cacheAt=Date.now()}s.writeHead(200,J);return s.end(q.method==='HEAD'?undefined:cache)}
 if(u!=='/'&&u!=='/index.html'){s.writeHead(404);return s.end('404')}
 fs.readFile(path.join(__dirname,'index.html'),(e,d)=>{if(e){s.writeHead(500);return s.end('erro')}s.writeHead(200,HDR);s.end(q.method==='HEAD'?undefined:d)})});
const hits=new Map(),conns=new Map();
// ---------- painel /status (somente números, protegido por token) ----------
const STATUS_TOKEN=process.env.STATUS_TOKEN||'',STATUS_ON=STATUS_TOKEN.length>=12;
if(process.env.STATUS_TOKEN&&!STATUS_ON)console.warn('STATUS_TOKEN muito curto (mínimo 12 caracteres): painel /status desativado.');
const hm=x=>crypto.createHmac('sha256','barnonn-status').update(String(x)).digest(),tokOk=t=>STATUS_ON&&crypto.timingSafeEqual(hm(t),hm(STATUS_TOKEN));
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
setInterval(()=>{const s=stats();peak.rooms=Math.max(peak.rooms,s.rooms);peak.humans=Math.max(peak.humans,s.humans);hist.push([Math.floor(Date.now()/1000),s.rooms,s.humans]);if(hist.length>240)hist.shift()},15000).unref();
const STATUS_HTML='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="dark light"><title>Skyke3D · Status</title>\n<style>\n:root{--bg:#17121f;--fg:#f5ede0;--card:#2a2236;--bd:#4b3d63;--ac:#ffb23e;--ok:#3ddc84;--mut:#b9aecb}\n@media (prefers-color-scheme:light){:root{--bg:#f4efe6;--fg:#241a12;--card:#fff;--bd:#d8cbb8;--ac:#b86a00;--ok:#16874a;--mut:#6b5e50}}\n*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}\nmain{max-width:780px;margin:0 auto;padding:16px}h1{font-size:1.5rem;margin:6px 0 2px}.sub{color:var(--mut);font-size:.9rem;margin:0 0 14px}\n.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.card{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:14px}\n.k{color:var(--mut);font-size:.85rem}.v{font-size:clamp(1.8rem,7vw,2.6rem);font-weight:800;line-height:1.1}.v small{font-size:.9rem;color:var(--mut);font-weight:600}.v.sm{font-size:clamp(1.2rem,4.8vw,1.7rem);line-height:1.2}\nh2{font-size:1.05rem;margin:20px 0 8px}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--bd);border-radius:14px;overflow:hidden}th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--bd)}th{color:var(--mut);font-weight:600;font-size:.85rem}tr:last-child td{border-bottom:0}\nsvg{width:100%;height:auto;background:var(--card);border:1px solid var(--bd);border-radius:14px}.lg{display:flex;gap:16px;font-size:.85rem;color:var(--mut);margin-top:6px}.lg b{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}\ninput,button{font:inherit;min-height:46px;border-radius:12px;border:1px solid var(--bd);padding:8px 14px;background:var(--card);color:var(--fg)}button{background:var(--ac);color:#111;font-weight:700;border:0;cursor:pointer;touch-action:manipulation}\n#login{display:none;gap:8px;flex-wrap:wrap;margin:12px 0}#login input{flex:1;min-width:200px}#err{color:#ff7a7a;min-height:1.2em}.st{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}\n</style></head><body><main>\n<div class="st"><div><h1>✨ Skyke3D · Status</h1><p class="sub" id="upd">Carregando…</p></div><button id="rf" type="button">Atualizar</button></div>\n<form id="login" autocomplete="off"><input id="tok" type="password" placeholder="Token do painel" aria-label="Token do painel" autocomplete="off"><button type="submit">Entrar</button></form><div id="err" role="alert"></div>\n<div id="dash" style="display:none">\n<div class="grid"><div class="card"><div class="k">Salas abertas</div><div class="v" id="rooms">–</div></div><div class="card"><div class="k">Jogadores</div><div class="v" id="humans">–</div></div><div class="card"><div class="k">Bots</div><div class="v" id="bots">–</div></div><div class="card"><div class="k">Conexões</div><div class="v" id="conn">–</div></div><div class="card"><div class="k">Salas com karaokê</div><div class="v" id="kar">–</div></div><div class="card"><div class="k">Salas com vídeo</div><div class="v" id="vid">–</div></div></div><h2>Recursos do servidor</h2><div class="grid"><div class="card"><div class="k">CPU do sistema</div><div class="v sm" id="cpu">–</div><div class="k" id="cpud">–</div></div><div class="card"><div class="k">Memória do sistema</div><div class="v sm" id="mem">–</div><div class="k" id="memd">–</div></div><div class="card"><div class="k">Rede</div><div class="v sm" id="net">–</div><div class="k" id="netd">–</div></div><div class="card"><div class="k">Memória do jogo</div><div class="v sm" id="gmem">–</div><div class="k" id="gheap">–</div></div></div>\n<h2>Por cenário</h2><table><thead><tr><th>Cenário</th><th>Salas</th><th>Jogadores</th></tr></thead><tbody id="by"></tbody></table>\n<h2>Últimos minutos</h2><svg id="ch" viewBox="0 0 320 110" role="img" aria-label="Gráfico de salas e jogadores"></svg><div class="lg"><span><b style="background:var(--ac)"></b>Salas</span><span><b style="background:var(--ok)"></b>Jogadores</span></div>\n<p class="sub" id="ft"></p></div></main>\n<script>\nvar KEY=\'bn_status_token\',tok=\'\',NAMES={aeris:\'Aeris\',brontis:\'Brontis\',cryon:\'Cryon\',pyra:\'Pyra\',sylvaris:\'Sylvaris\',verdara:\'Verdara\'};\nfunction $(i){return document.getElementById(i)}\ntry{var m=location.hash.match(/token=([^&]+)/);if(m){tok=decodeURIComponent(m[1]);sessionStorage.setItem(KEY,tok);history.replaceState(null,\'\',location.pathname)}else tok=sessionStorage.getItem(KEY)||\'\'}catch(e){}\nfunction T(id,x){$(id).textContent=x}function fmtB(n){if(typeof n!=="number"||!isFinite(n)||n<0)return "–";var u=["B","KB","MB","GB","TB"],i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return (i?n.toFixed(1).replace(".",","):Math.round(n))+" "+u[i]}function fmtPct(n){return typeof n==="number"&&isFinite(n)?n.toFixed(1).replace(".",",")+"%":"–"}function fmtRate(n){return fmtB(n)+"/s"}function resDraw(d){var r=d.resources||{},c=r.cpu||{},m=r.memory||{},n=r.network||{},g=r.game||{};T("cpu",fmtPct(c.system));T("cpud","Jogo "+fmtPct(c.process)+" · "+(c.cores||"?")+" núcleos");T("mem",fmtPct(m.percent));T("memd",fmtB(m.used)+" / "+fmtB(m.total));if(n.available){T("net","↓ "+fmtRate(n.rxRate));T("netd","↑ "+fmtRate(n.txRate)+" · total "+fmtB(n.rxTotal)+" ↓ / "+fmtB(n.txTotal)+" ↑")}else{T("net","–");T("netd","indisponível")}T("gmem",fmtB(g.rss));T("gheap","heap "+fmtB(g.heapUsed)+" / "+fmtB(g.heapTotal))}\nfunction fmtUp(s){var d=Math.floor(s/86400),h=Math.floor(s%86400/3600),mi=Math.floor(s%3600/60);return (d?d+\'d \':\'\')+h+\'h \'+mi+\'min\'}\nfunction chart(h){var svg=$(\'ch\');while(svg.firstChild)svg.removeChild(svg.firstChild);if(h.length<2)return;var W=320,H=110,p=8,mx=Math.max(1,Math.max.apply(null,h.map(function(a){return Math.max(a[1],a[2])})));\n [[1,\'#ffb23e\'],[2,\'#3ddc84\']].forEach(function(c){var pl=document.createElementNS(\'http://www.w3.org/2000/svg\',\'polyline\'),pts=h.map(function(a,i){return (p+i*(W-2*p)/(h.length-1)).toFixed(1)+\',\'+(H-p-a[c[0]]*(H-2*p)/mx).toFixed(1)}).join(\' \');pl.setAttribute(\'points\',pts);pl.setAttribute(\'fill\',\'none\');pl.setAttribute(\'stroke\',c[1]);pl.setAttribute(\'stroke-width\',\'2.5\');pl.setAttribute(\'stroke-linejoin\',\'round\');svg.appendChild(pl)});\n var t=document.createElementNS(\'http://www.w3.org/2000/svg\',\'text\');t.setAttribute(\'x\',\'8\');t.setAttribute(\'y\',\'12\');t.setAttribute(\'font-size\',\'10\');t.setAttribute(\'fill\',\'#999\');t.textContent=\'máx. \'+mx;svg.appendChild(t)}\nfunction draw(d){$(\'login\').style.display=\'none\';$(\'dash\').style.display=\'block\';T(\'err\',\'\');T(\'rooms\',d.rooms+\' / \'+d.maxRooms);T(\'humans\',d.humans);T(\'bots\',d.bots);T(\'conn\',d.connections);T(\'kar\',d.karaoke);T(\'vid\',d.video);\n var b=$(\'by\');while(b.firstChild)b.removeChild(b.firstChild);Object.keys(NAMES).forEach(function(k){var s=d.styles[k]||{rooms:0,humans:0},tr=document.createElement(\'tr\');[NAMES[k],s.rooms,s.humans].forEach(function(x){var td=document.createElement(\'td\');td.textContent=x;tr.appendChild(td)});b.appendChild(tr)});\n chart(d.history||[]);resDraw(d);T(\'ft\',\'No ar há \'+fmtUp(d.uptime)+\' · pico: \'+d.peak.rooms+\' salas, \'+d.peak.humans+\' jogadores · máx. \'+d.maxPerRoom+\' pessoas por sala\');T(\'upd\',\'Atualizado às \'+new Date().toLocaleTimeString())}\nfunction needLogin(msg){$(\'dash\').style.display=\'none\';$(\'login\').style.display=\'flex\';T(\'err\',msg||\'\');T(\'upd\',\'Acesso restrito\')}\nfunction load(){if(!tok){needLogin();return}\n fetch(\'/status.json\',{headers:{Authorization:\'Bearer \'+tok},cache:\'no-store\'}).then(function(r){if(r.status===401){tok=\'\';try{sessionStorage.removeItem(KEY)}catch(e){}needLogin(\'Token inválido.\');return null}if(r.status===429){needLogin(\'Muitas tentativas. Aguarde alguns minutos.\');return null}if(!r.ok){T(\'err\',\'Erro \'+r.status);return null}return r.json()}).then(function(d){if(d)draw(d)}).catch(function(){T(\'err\',\'Sem conexão com o servidor.\')})}\n$(\'login\').addEventListener(\'submit\',function(e){e.preventDefault();tok=$(\'tok\').value.trim();$(\'tok\').value=\'\';try{sessionStorage.setItem(KEY,tok)}catch(x){}load()});\n$(\'rf\').addEventListener(\'click\',load);setInterval(function(){if(!document.hidden&&tok)load()},5000);load();\n</script></body></html>';

const blocked=(ip,key,max,ms)=>(hits.get(key+'|'+ip)||[]).filter(t=>Date.now()-t<ms).length>=max;
function over(ip,key,max,ms){const k=key+'|'+ip,now=Date.now(),a=(hits.get(k)||[]).filter(t=>now-t<ms);a.push(now);hits.set(k,a);return a.length>max}
setInterval(()=>{const now=Date.now();for(const[k,a]of hits)if(!a.length||now-a[a.length-1]>120000)hits.delete(k)},60000).unref();
const wss=new WebSocketServer({server,maxPayload:32768,verifyClient:(info,cb)=>{const o=info.origin||info.req.headers.origin;let ok=true;
 if(o){try{ok=new URL(o).host===info.req.headers.host||ORIGINS.includes(o)}catch(e){ok=false}}
 if(!ok)return cb(false,403,'origem negada');if((conns.get(ipOf(info.req))||0)>=PERIP||wss.clients.size>=MAXCONN)return cb(false,429,'limite');cb(true)}});
setInterval(()=>{for(const w of wss.clients){if(!w.alive){w.terminate();continue}w.alive=false;try{w.ping()}catch(e){}}},30000).unref();
const rooms=new Map();let nid=1;
const BN=['Marina','Caio','Duda','Bruno','Lia','Theo','Nina','Davi','Bia'],BL=['Opa, bem-vindo!','Esse lugar tá incrível ✨','Já provou o suco?','Alguém quer cantar no karaokê?','Que poção boa!'];
const CR={skin:4,eye:4,shirt:20,hair:12,h2:12,hc:20,hs:24,hat:6,bt:2,pc:20,sc:20,shoes:3,fc:8};
const ITEMS=new Set(['refri','suco','leite','pocao_cura','elixir_lunar','pocao_floresta','nectar_estelar','cha_fada','lanche','prato','cupcake','pizza','maca','biscoito','sorvete','marshmallow']),FOOD=new Set(['lanche','prato','cupcake','pizza','maca','biscoito','sorvete','marshmallow']),STY=['aeris','brontis','cryon','pyra','sylvaris','verdara'];
const G=new Set(['arms','scream','fart','dance1','dance2','dance3','stop']);
const CD={chat:700,gest:1500,emo:1000,item:250,cfg:1000,video:8000,kjoin:1000,ksong:1000,bots:1000,vjoin:500,speak:150,ice:60000};
const strip=s=>String(s==null?'':s).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'');
const clean=c=>Object.fromEntries(Object.entries(CR).map(([k,n])=>[k,Math.max(0,Math.min(n-1,parseInt(c&&typeof c==='object'?c[k]:0)||0))]));
const nm=s=>strip(s).replace(/[<>&"'`]/g,'').trim().slice(0,16)||'Visitante';
const WALK_X=0,WALK_Z=1.2,WALK_R=10.2;
const clampPos=(x,z)=>{x=+x||0;z=+z||0;const dx=x-WALK_X,dz=z-WALK_Z,d=Math.hypot(dx,dz);if(d>WALK_R){const s=WALK_R/(d||1);return[WALK_X+dx*s,WALK_Z+dz*s]}return[x,z]};
const rnd=n=>Math.floor(Math.random()*n),rr=(a,b)=>a+Math.random()*(b-a);
const code=()=>[...crypto.randomBytes(10)].map(x=>AL[x%AL.length]).join('');
const send=(w,m)=>{if(w.readyState===1)w.send(JSON.stringify(m))};
const bc=(r,m,ex)=>{for(const p of r.players.values())if(!p.bot&&p.ready&&p.ws!==ex)send(p.ws,m)};
const pub=p=>({id:p.id,name:p.name,cfg:p.cfg,x:p.x,z:p.z,ry:p.ry,y:p.y||0,s:p.s||0,bot:!!p.bot,item:p.item,talk:!!p.talk});
const humans=r=>[...r.players.values()].filter(p=>!p.bot);
const YT=/^[\w-]{11}$/;
const kq=r=>r.kar.map(k=>({id:k.id,name:(r.players.get(k.id)||{}).name||'?',vid:k.vid})),kmem=(r,id)=>r.kar.some(k=>k.id===id);
function kstart(r){const h=r.kar[0];r.karEnd=Date.now()+(h&&h.vid?KDEF:120000);r.karAt=Date.now();r.kdur=false;r.karTurn++}
function kbc(r){const h=r.kar[0]&&r.kar[0].id;if(h!==r.karHead){r.karHead=h;if(h)kstart(r)}bc(r,{t:'kar',q:kq(r),left:Math.max(0,r.karEnd-Date.now()),turn:r.karTurn})}
function krot(r){if(!r.kar.length)return;const f=r.kar.shift();f.vid=null;r.kar.push(f);if(r.kar.some(k=>k.vid)){let n=r.kar.length;while(!r.kar[0].vid&&n-->0)r.kar.push(r.kar.shift())}r.karHead=r.kar[0].id;kstart(r);kbc(r)}
function kinvite(r,from){for(const p of r.players.values())if(!p.bot&&p.ready&&p.id!==from.id&&!kmem(r,p.id))send(p.ws,{t:'kinv',name:from.name})}
function newBot(r){const used=new Set([...r.players.values()].map(p=>p.name)),id='b'+nid++;
 const b={id,bot:1,name:BN.find(n=>!used.has(n))||'Bot'+nid,cfg:clean({skin:rnd(4),eye:rnd(4),shirt:rnd(20),hair:rnd(12),h2:rnd(12),hc:rnd(20),hs:rnd(24),fc:rnd(8),hat:rnd(3)?0:1+rnd(5),bt:rnd(2),pc:rnd(20),sc:rnd(20),shoes:rnd(3)}),x:rr(-6,6),z:rr(-2,4),ry:0,y:0,s:0,item:null,next:0};
 b.tx=b.x;b.tz=b.z;r.players.set(id,b);return b}
function fit(r){const target=Math.max(0,Math.min(r.want,MAX-humans(r).length)),bots=[...r.players.values()].filter(p=>p.bot);
 while(bots.length>target){const b=bots.pop();r.players.delete(b.id);bc(r,{t:'pl',id:b.id})}
 while(bots.length<target){const b=newBot(r);bots.push(b);bc(r,{t:'pj',p:pub(b)})}}
setInterval(()=>{const now=Date.now();for(const r of rooms.values()){const s=[];
 if(r.kar.length&&now>=r.karEnd){bc(r,{t:'chat',name:'🎶 Karaokê',text:'Fim da música! Próximo cantor.'});krot(r)}
 for(const p of r.players.values()){
  if(p.bot){if(now>p.next){p.next=now+3000+Math.random()*5000;const [tx,tz]=clampPos(rr(-6,6),rr(-2.5,4.5));p.tx=tx;p.tz=tz;if(Math.random()<.3)bc(r,{t:'chat',name:p.name,text:BL[rnd(BL.length)]})}
   const dx=p.tx-p.x,dz=p.tz-p.z,d=Math.hypot(dx,dz);if(d>.2){p.x+=dx/d*.14;p.z+=dz/d*.14;p.ry=Math.atan2(dx,dz)}}
  s.push([p.id,+p.x.toFixed(2),+p.z.toFixed(2),+p.ry.toFixed(2),+(p.y||0).toFixed(2),p.s?1:0])}const sk=JSON.stringify(s);if(sk!==r.lastSt){r.lastSt=sk;bc(r,{t:'st',s})}}},100).unref();
wss.on('connection',(ws,req)=>{const ip=ipOf(req);conns.set(ip,(conns.get(ip)||0)+1);ws.alive=true;ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});
 let me=null,room=null,n=0,lt={},lastTxt='',lastAt=0;const iv=setInterval(()=>n=0,1000),jt=setTimeout(()=>{if(!me)ws.close()},15000);
 ws.on('message',raw=>{try{if(++n>150)return ws.close();let m;try{m=JSON.parse(raw)}catch(e){return}if(!m||typeof m.t!=='string')return;
  if(CD[m.t]){const now=Date.now();if(now-(lt[m.t]||0)<CD[m.t])return;lt[m.t]=now}
  if(!me){
   if(m.t==='create'){if(over(ip,'cr',5,60000))return send(ws,{t:'err',msg:'Muitas salas criadas. Aguarde um minuto.'});if(rooms.size>=MAXROOMS)return send(ws,{t:'err',msg:'Servidor cheio (limite de '+MAXROOMS+' salas).'});
    let c;do c=code();while(rooms.has(c));
    room={code:c,style:STY.includes(m.style)?m.style:'aeris',host:null,kar:[],karEnd:0,karHead:null,karTurn:0,karAt:0,kdur:false,vid:null,vs:null,players:new Map(),want:Math.max(0,Math.min(9,parseInt(m.bots)||0))};rooms.set(c,room)}
   else if(m.t==='join'){if(over(ip,'jn',15,60000))return send(ws,{t:'err',msg:'Muitas tentativas. Aguarde um minuto.'});
    if(blocked(ip,'jf',8,600000))return send(ws,{t:'err',msg:'Muitas tentativas incorretas. Aguarde 10 minutos.'});
    room=rooms.get(strip(m.code).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10));if(!room){over(ip,'jf',999,600000);return send(ws,{t:'err',msg:'Sala não encontrada. Confira o código.'})}
    if(humans(room).length>=MAX)return send(ws,{t:'err',msg:'Sala lotada (limite de '+MAX+' pessoas).'})}
   else return;
   me={id:'p'+nid++,ip,name:nm(m.name),cfg:clean(m.cfg),x:0,z:5,ry:0,y:0,s:0,item:null,talk:false,ws,ready:false};
   room.players.set(me.id,me);if(!room.host)room.host=me.id;fit(room);
   send(ws,{t:'joined',url:PUBLIC_URL,ice:iceCfg(),id:me.id,code:room.code,style:room.style,host:room.host,want:room.want,players:[...room.players.values()].map(pub),kar:kq(room),kl:Math.max(0,room.karEnd-Date.now()),turn:room.karTurn});
   if(room.vid)send(ws,{t:'vinv',vid:room.vid.vid,name:room.vid.name});if(room.kar.length)send(ws,{t:'kinv',name:(room.players.get(room.kar[0].id)||{}).name||'Alguém'});
   bc(room,{t:'pj',p:pub(me)});me.ready=true;return}
  switch(m.t){
   case 'move':{const [x,z]=clampPos(m.x,m.z);me.x=x;me.z=z;me.ry=Math.max(-10,Math.min(10,+m.ry||0));me.y=Math.max(0,Math.min(1.6,+m.y||0));me.s=m.s?1:0;break}
   case 'cfg':me.cfg=clean(m.cfg);bc(room,{t:'cfg',id:me.id,cfg:me.cfg},ws);break;
   case 'chat':{let text=strip(m.text).replace(/(.)\1{9,}/g,'$1$1$1').trim().slice(0,200);if((text.match(/https?:\/\//gi)||[]).length>3)break;const now=Date.now();
    if(!text||(text===lastTxt&&now-lastAt<5000))break;lastTxt=text;lastAt=now;bc(room,{t:'chat',name:me.name,text});break}
   case 'item':{if(m.item!==null&&!ITEMS.has(m.item))break;
    if(m.use){if(!m.item||me.item!==m.item)break;bc(room,{t:'item',id:me.id,item:me.item,use:1});if(FOOD.has(me.item))me.item=null;break}
    me.item=m.item||null;bc(room,{t:'item',id:me.id,item:me.item,use:0});break}
   case 'gest':{if(!G.has(m.g))break;if(m.g==='scream'||m.g==='fart'){const now=Date.now();lt.sl=(lt.sl||[]).filter(x=>now-x<60000);if(now-(lt.snd||0)<5000||lt.sl.length>=6){send(ws,{t:'sys',text:'⏳ Gestos com som têm limite para evitar spam.'});break}lt.snd=now;lt.sl.push(now)}bc(room,{t:'gest',id:me.id,g:m.g},ws);break}
   case 'emo':{const i=parseInt(m.i);if(!(i>=0&&i<20))break;bc(room,{t:'emo',id:me.id,i});break}
   case 'speak':{const v=!!m.v;if(v===!!me.talk)break;me.talk=v;bc(room,{t:'speak',id:me.id,v},ws);break}
   case 'ice':send(ws,{t:'ice',ice:iceCfg()});break
   case 'bots':if(room.host!==me.id)break;room.want=Math.max(0,Math.min(9,parseInt(m.n)||0));fit(room);bc(room,{t:'bots',want:room.want});break;
   case 'sig':{const to=room.players.get(String(m.to));const d=m.data;if(!to||to.bot||to===me||!d||typeof d!=='object')break;let out=null;
    if(d.d&&typeof d.d==='object'&&(d.d.type==='offer'||d.d.type==='answer')&&typeof d.d.sdp==='string'&&d.d.sdp.length<=12000)out={d:{type:d.d.type,sdp:d.d.sdp}};
    else if(d.c&&typeof d.c==='object'&&typeof d.c.candidate==='string'&&d.c.candidate.length<=600)out={c:{candidate:d.c.candidate,sdpMid:typeof d.c.sdpMid==='string'?d.c.sdpMid.slice(0,32):null,sdpMLineIndex:Number.isInteger(d.c.sdpMLineIndex)&&d.c.sdpMLineIndex>=0&&d.c.sdpMLineIndex<10?d.c.sdpMLineIndex:0}};
    else if(d.x==='busy'||d.x==='close')out={x:d.x};
    if(out)send(to.ws,{t:'sig',from:me.id,data:out});break}
   case 'video':if(YT.test(String(m.vid))){if(room.vid&&room.vid.by!==me.id){send(ws,{t:'vbusy'});break}room.vid={vid:m.vid,by:me.id,name:me.name};room.vs={time:0,playing:true,at:Date.now()};bc(room,{t:'vinv',vid:m.vid,name:me.name},ws)}break;
   case 'vsync':if(room.vid&&room.vid.by===me.id){room.vs={time:Math.max(0,+m.time||0),playing:!!m.playing,at:Date.now()};bc(room,{t:'vsync',time:room.vs.time,playing:room.vs.playing},ws)}break;
   case 'vstop':if(room.vid&&room.vid.by===me.id){room.vid=null;room.vs=null;bc(room,{t:'vstop'},ws)}break;
   case 'vjoin':if(room.vid&&room.vs){const e=room.vs.playing?(Date.now()-room.vs.at)/1000:0;send(ws,{t:'vsync',time:room.vs.time+e,playing:room.vs.playing})}break;
   case 'kjoin':{const vid=String(m.vid||'');if(!YT.test(vid)||kmem(room,me.id)||room.kar.length>=10)break;const was=!room.kar.length;room.kar.push({id:me.id,vid});kbc(room);if(was)kinvite(room,me);break}
   case 'ksong':{const vid=String(m.vid||''),k=room.kar.find(x=>x.id===me.id);if(!k||!YT.test(vid))break;const hd=room.kar[0]===k;if(hd&&k.vid)break;k.vid=vid;if(hd)kstart(room);kbc(room);break}
   case 'kleave':if(kmem(room,me.id)){room.kar=room.kar.filter(k=>k.id!==me.id);kbc(room)}break;
   case 'kpass':if(room.kar.length&&(room.kar[0].id===me.id||room.host===me.id))krot(room);break;
   case 'kdur':if(room.kar[0]&&room.kar[0].id===me.id&&!room.kdur){const d=+m.d;if(d>=10&&d<=1800){room.kdur=true;room.karEnd=Date.now()+d*1000+6000;kbc(room)}}break;
   case 'kend':if(room.kar[0]&&room.kar[0].id===me.id&&Date.now()-room.karAt>10000)krot(room);break;
   case 'ksync':if(room.kar[0]&&room.kar[0].id===me.id){const o={t:'ksync',time:Math.max(0,+m.time||0),playing:!!m.playing};for(const p of room.players.values())if(!p.bot&&p.ready&&p!==me&&kmem(room,p.id))send(p.ws,o)}break}
 }catch(e){}});
 ws.on('close',()=>{clearInterval(iv);clearTimeout(jt);const c=(conns.get(ip)||1)-1;if(c>0)conns.set(ip,c);else conns.delete(ip);if(!me)return;room.players.delete(me.id);
  if(room.vid&&room.vid.by===me.id){room.vid=null;room.vs=null;bc(room,{t:'vstop'})}
  if(!humans(room).length){rooms.delete(room.code);return}
  if(room.host===me.id){room.host=humans(room)[0].id;bc(room,{t:'host',id:room.host})}
  if(kmem(room,me.id)){room.kar=room.kar.filter(k=>k.id!==me.id);kbc(room)}
  bc(room,{t:'pl',id:me.id});fit(room)})});
process.on('uncaughtException',e=>console.error('erro:',e&&e.message));
server.listen(PORT,'0.0.0.0',()=>{console.log('Skyke3D em http://localhost:'+server.address().port);if(STATUS_ON)console.log('Painel de status ativo em /status (acesso por token).')});
