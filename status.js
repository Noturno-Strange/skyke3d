/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Painel de status /status: estatísticas, métricas, HTML.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

function createStatusModule({ config, rooms, wss, getRooms, getHumans, getOnlineHumans }) {
  const STATUS_TOKEN = process.env.STATUS_TOKEN || '';
  const STATUS_ON = STATUS_TOKEN.length >= 12;
  if (process.env.STATUS_TOKEN && !STATUS_ON) console.warn('STATUS_TOKEN muito curto (mínimo 12 caracteres): painel /status desativado.');

  const hm = x => crypto.createHmac('sha256', 'skyke3d-status').update(String(x)).digest();
  const tokOk = t => STATUS_ON && crypto.timingSafeEqual(hm(t), hm(STATUS_TOKEN));

  const T0 = Date.now();
  const hist = [];
  const peak = { rooms: 0, humans: 0 };
  let cache = null;
  let cacheAt = 0;

  const CPU_T = ['user', 'nice', 'sys', 'idle', 'irq'];

  function netCounters() {
    if (process.platform !== 'linux') return null;
    try {
      let rx = 0, tx = 0;
      for (const line of fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2)) {
        const i = line.indexOf(':');
        if (i < 0) continue;
        const name = line.slice(0, i).trim();
        if (!name || name === 'lo') continue;
        const f = line.slice(i + 1).trim().split(/\s+/).map(Number);
        if (f.length >= 9) { rx += f[0] || 0; tx += f[8] || 0; }
      }
      return { rx, tx };
    } catch (e) { return null; }
  }

  let prevCpu = os.cpus();
  let prevCpuAt = Date.now();
  let prevProc = process.cpuUsage();
  let prevNet = netCounters();

  function resourceStats() {
    const now = Date.now();
    const dt = Math.max(1, now - prevCpuAt);
    const cpus = os.cpus();
    let total = 0, idle = 0;
    for (let i = 0; i < cpus.length; i++) {
      const a = cpus[i].times;
      const b = prevCpu[i] && prevCpu[i].times;
      if (!b) continue;
      for (const k of CPU_T) {
        const d = Math.max(0, (a[k] || 0) - (b[k] || 0));
        total += d;
        if (k === 'idle') idle += d;
      }
    }
    const cpuSystem = total ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0;
    const p = process.cpuUsage();
    const dp = { user: p.user - prevProc.user, system: p.system - prevProc.system };
    const cores = cpus.length || 1;
    const cpuProcess = Math.max(0, Math.min(100, (dp.user + dp.system) / 1000 / dt * 100 / cores));
    const net = netCounters();
    const secs = dt / 1000;
    let rxRate = 0, txRate = 0;
    if (net && prevNet) { rxRate = Math.max(0, net.rx - prevNet.rx) / secs; txRate = Math.max(0, net.tx - prevNet.tx) / secs; }
    const m = process.memoryUsage();
    const mt = os.totalmem();
    const mf = os.freemem();
    const mu = mt - mf;
    const resources = {
      cpu: { system: +cpuSystem.toFixed(1), process: +cpuProcess.toFixed(1), cores },
      memory: { total: mt, used: mu, free: mf, percent: mt ? +((mu / mt) * 100).toFixed(1) : 0 },
      game: { rss: m.rss, heapTotal: m.heapTotal, heapUsed: m.heapUsed, external: m.external },
      network: net ? { available: true, rxTotal: net.rx, txTotal: net.tx, rxRate: +rxRate.toFixed(1), txRate: +txRate.toFixed(1) } : { available: false, rxTotal: 0, txTotal: 0, rxRate: 0, txRate: 0 }
    };
    prevCpu = cpus; prevCpuAt = now; prevProc = p; prevNet = net;
    return resources;
  }

  function stats() {
    let humans = 0, bots = 0, kar = 0, vid = 0;
    const styles = {};
    for (const r of rooms.values()) {
      const all = [...r.players.values()];
      const hh = all.filter(p => !p.bot).length;
      humans += hh;
      bots += all.length - hh;
      if (r.kar.length) kar++;
      if (r.vid) vid++;
      const b = styles[r.style] = styles[r.style] || { rooms: 0, humans: 0 };
      b.rooms++; b.humans += hh;
    }
    return {
      rooms: rooms.size,
      maxRooms: config.MAXROOMS,
      maxPerRoom: config.MAX,
      humans, bots, karaoke: kar, video: vid,
      styles,
      connections: wss.clients.size,
      uptime: Math.floor((Date.now() - T0) / 1000),
      peak,
      history: hist,
      resources: resourceStats()
    };
  }

  setInterval(() => {
    try {
      const s = stats();
      peak.rooms = Math.max(peak.rooms, s.rooms);
      peak.humans = Math.max(peak.humans, s.humans);
      hist.push([Math.floor(Date.now() / 1000), s.rooms, s.humans]);
      if (hist.length > 240) hist.shift();
    } catch (e) { console.error('stats:', e && e.stack || e); }
  }, 15000).unref();

  const STATUS_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="dark light"><title>Skyke3D · Status</title>
<style>
:root{--bg:#17121f;--fg:#f5ede0;--card:#2a2236;--bd:#4b3d63;--ac:#ffb23e;--ok:#3ddc84;--mut:#b9aecb}
@media (prefers-color-scheme:light){:root{--bg:#f4efe6;--fg:#241a12;--card:#fff;--bd:#d8cbb8;--ac:#b86a00;--ok:#16874a;--mut:#6b5e50}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
main{max-width:780px;margin:0 auto;padding:16px}h1{font-size:1.5rem;margin:6px 0 2px}.sub{color:var(--mut);font-size:.9rem;margin:0 0 14px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.card{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:14px}
.k{color:var(--mut);font-size:.85rem}.v{font-size:clamp(1.8rem,7vw,2.6rem);font-weight:800;line-height:1.1}.v small{font-size:.9rem;color:var(--mut);font-weight:600}.v.sm{font-size:clamp(1.2rem,4.8vw,1.7rem);line-height:1.2}
h2{font-size:1.05rem;margin:20px 0 8px}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--bd);border-radius:14px;overflow:hidden}th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--bd)}th{color:var(--mut);font-weight:600;font-size:.85rem}tr:last-child td{border-bottom:0}
svg{width:100%;height:auto;background:var(--card);border:1px solid var(--bd);border-radius:14px}.lg{display:flex;gap:16px;font-size:.85rem;color:var(--mut);margin-top:6px}.lg b{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}
input,button{font:inherit;min-height:46px;border-radius:12px;border:1px solid var(--bd);padding:8px 14px;background:var(--card);color:var(--fg)}button{background:var(--ac);color:#111;font-weight:700;border:0;cursor:pointer;touch-action:manipulation}
#login{display:none;gap:8px;flex-wrap:wrap;margin:12px 0}#login input{flex:1;min-width:200px}#err{color:#ff7a7a;min-height:1.2em}.st{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
</style></head><body><main>
<div class="st"><div><h1>✨ Skyke3D · Status</h1><p class="sub" id="upd">Carregando…</p></div><button id="rf" type="button">Atualizar</button></div>
<form id="login" autocomplete="off"><input id="tok" type="password" placeholder="Token do painel" aria-label="Token do painel" autocomplete="off"><button type="submit">Entrar</button></form><div id="err" role="alert"></div>
<div id="dash" style="display:none">
<div class="grid"><div class="card"><div class="k">Salas abertas</div><div class="v" id="rooms">–</div></div><div class="card"><div class="k">Jogadores</div><div class="v" id="humans">–</div></div><div class="card"><div class="k">Bots</div><div class="v" id="bots">–</div></div><div class="card"><div class="k">Conexões</div><div class="v" id="conn">–</div></div><div class="card"><div class="k">Salas com karaokê</div><div class="v" id="kar">–</div></div><div class="card"><div class="k">Salas com vídeo</div><div class="v" id="vid">–</div></div></div>
<h2>Recursos do servidor</h2><div class="grid"><div class="card"><div class="k">CPU do sistema</div><div class="v sm" id="cpu">–</div><div class="k" id="cpud">–</div></div><div class="card"><div class="k">Memória do sistema</div><div class="v sm" id="mem">–</div><div class="k" id="memd">–</div></div><div class="card"><div class="k">Rede</div><div class="v sm" id="net">–</div><div class="k" id="netd">–</div></div><div class="card"><div class="k">Memória do jogo</div><div class="v sm" id="gmem">–</div><div class="k" id="gheap">–</div></div></div>
<h2>Por cenário</h2><table><thead><tr><th>Cenário</th><th>Salas</th><th>Jogadores</th></tr></thead><tbody id="by"></tbody></table>
<h2>Últimos minutos</h2><svg id="ch" viewBox="0 0 320 110" role="img" aria-label="Gráfico de salas e jogadores"></svg><div class="lg"><span><b style="background:var(--ac)"></b>Salas</span><span><b style="background:var(--ok)"></b>Jogadores</span></div>
<p class="sub" id="ft"></p></div></main>
<script>
var KEY='skyke3d_status_token',tok='',NAMES={aeris:'Aeris',brontis:'Brontis',cryon:'Cryon',pyra:'Pyra',sylvaris:'Sylvaris',verdara:'Verdara'};
function $(i){return document.getElementById(i)}
try{var m=location.hash.match(/token=([^&]+)/);if(m){tok=decodeURIComponent(m[1]);sessionStorage.setItem(KEY,tok);history.replaceState(null,'',location.pathname)}else tok=sessionStorage.getItem(KEY)||''}catch(e){}
function T(id,x){$(id).textContent=x}function fmtB(n){if(typeof n!=="number"||!isFinite(n)||n<0)return "–";var u=["B","KB","MB","GB","TB"],i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return (i?n.toFixed(1).replace(".",","):Math.round(n))+" "+u[i]}function fmtPct(n){return typeof n==="number"&&isFinite(n)?n.toFixed(1).replace(".",",")+"%":"–"}function fmtRate(n){return fmtB(n)+"/s"}function resDraw(d){var r=d.resources||{},c=r.cpu||{},m=r.memory||{},n=r.network||{},g=r.game||{};T("cpu",fmtPct(c.system));T("cpud","Jogo "+fmtPct(c.process)+" · "+(c.cores||"?")+" núcleos");T("mem",fmtPct(m.percent));T("memd",fmtB(m.used)+" / "+fmtB(m.total));if(n.available){T("net","↓ "+fmtRate(n.rxRate));T("netd","↑ "+fmtRate(n.txRate)+" · total "+fmtB(n.rxTotal)+" ↓ / "+fmtB(n.txTotal)+" ↑")}else{T("net","–");T("netd","indisponível")}T("gmem",fmtB(g.rss));T("gheap","heap "+fmtB(g.heapUsed)+" / "+fmtB(g.heapTotal))}
function fmtUp(s){var d=Math.floor(s/86400),h=Math.floor(s%86400/3600),mi=Math.floor(s%3600/60);return (d?d+'d ':'')+h+'h '+mi+'min'}
function chart(h){var svg=$('ch');while(svg.firstChild)svg.removeChild(svg.firstChild);if(h.length<2)return;var W=320,H=110,p=8,mx=Math.max(1,Math.max.apply(null,h.map(function(a){return Math.max(a[1],a[2])}))); [[1,'#ffb23e'],[2,'#3ddc84']].forEach(function(c){var pl=document.createElementNS('http://www.w3.org/2000/svg','polyline'),pts=h.map(function(a,i){return (p+i*(W-2*p)/(h.length-1)).toFixed(1)+','+(H-p-a[c[0]]*(H-2*p)/mx).toFixed(1)}).join(' ');pl.setAttribute('points',pts);pl.setAttribute('fill','none');pl.setAttribute('stroke',c[1]);pl.setAttribute('stroke-width','2.5');pl.setAttribute('stroke-linejoin','round');svg.appendChild(pl)}); var t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('x','8');t.setAttribute('y','12');t.setAttribute('font-size','10');t.setAttribute('fill','#999');t.textContent='máx. '+mx;svg.appendChild(t)}
function draw(d){$('login').style.display='none';$('dash').style.display='block';T('err','');T('rooms',d.rooms+' / '+d.maxRooms);T('humans',d.humans);T('bots',d.bots);T('conn',d.connections);T('kar',d.karaoke);T('vid',d.video); var b=$('by');while(b.firstChild)b.removeChild(b.firstChild);Object.keys(NAMES).forEach(function(k){var s=d.styles[k]||{rooms:0,humans:0},tr=document.createElement('tr');[NAMES[k],s.rooms,s.humans].forEach(function(x){var td=document.createElement('td');td.textContent=x;tr.appendChild(td)});b.appendChild(tr)}); chart(d.history||[]);resDraw(d);T('ft','No ar há '+fmtUp(d.uptime)+' · pico: '+d.peak.rooms+' salas, '+d.peak.humans+' jogadores · máx. '+d.maxPerRoom+' pessoas por sala');T('upd','Atualizado às '+new Date().toLocaleTimeString())}
function needLogin(msg){$('dash').style.display='none';$('login').style.display='flex';T('err',msg||'');T('upd','Acesso restrito')}
function load(){if(!tok){needLogin();return} fetch('/status.json',{headers:{Authorization:'Bearer '+tok},cache:'no-store'}).then(function(r){if(r.status===401){tok='';try{sessionStorage.removeItem(KEY)}catch(e){}needLogin('Token inválido.');return null}if(r.status===429){needLogin('Muitas tentativas. Aguarde alguns minutos.');return null}if(!r.ok){T('err','Erro '+r.status);return null}return r.json()}).then(function(d){if(d)draw(d)}).catch(function(){T('err','Sem conexão com o servidor.')})}
$('login').addEventListener('submit',function(e){e.preventDefault();tok=$('tok').value.trim();$('tok').value='';try{sessionStorage.setItem(KEY,tok)}catch(x){}load()}); $('rf').addEventListener('click',load);setInterval(function(){if(!document.hidden&&tok)load()},5000);load();
</script></body></html>`;

  return { STATUS_ON, STATUS_HTML, hm, tokOk, stats, cache, cacheAt };
}

module.exports = { createStatusModule };