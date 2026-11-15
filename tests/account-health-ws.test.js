'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const H=require('./harness');
const {payload}=require('../lib/identity');
const {fidOf}=require('../lib/ids');
const {pidOf}=require('../lib/pubprofile');
const {createFarm}=require('../lib/farm');
const send=(c,m)=>c.ws.send(JSON.stringify(m));
const key=()=>{const kp=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});return {pk:kp.publicKey.export({format:'der',type:'spki'}).toString('base64url'),priv:kp.privateKey}};
const sign=(kp,data)=>crypto.sign('sha256',Buffer.from(data),{key:kp.priv,dsaEncoding:'ieee-p1363'}).toString('base64url');
async function next(c,pred){assert.ok(await H.until(()=>c.msgs.some(pred),5000),String(pred));const i=c.msgs.findIndex(pred);return c.msgs.splice(i,1)[0]}
async function auth(c,id,kp,action='join'){
 send(c,{t:'auth',id,action});const challenge=await next(c,m=>m.t==='challenge');send(c,{t:'proof',id,action,nonce:challenge.nonce,sig:sign(kp,payload.auth(id,challenge.nonce,action))});return next(c,m=>m.t==='session');
}
async function enter(srv,ch,name,code){
 const c=await H.connect(srv.port),main=key(),rec=key(),k=ch.repeat(43),id=fidOf(k);
 send(c,{t:'idreg',k,pk:main.pk,rpk:rec.pk});await next(c,m=>m.t==='idok');const session=await auth(c,id,main);
 send(c,code?{t:'join',code,name,token:session.token}:{t:'create',style:'amazora',bots:0,name,token:session.token});const room=await next(c,m=>m.t==='joined');
 return {c,id,main,rec,room,session};
}
test('convite confirmado permite trocar de sala com sessão em cache, sem perder conta nem expor dados à recuperação', {skip:H.missing()},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'skyke-invite-'));
 const srv=await H.startServer({IDENTITY_FILE:path.join(dir,'identity.json'),PLAYER_DATA_FILE:path.join(dir,'players.json')});t.after(()=>srv.stop());
 const a=await enter(srv,'U','Ana'),b=await enter(srv,'V','Bia');t.after(()=>{a.c.ws.close();b.c.ws.close()});
 send(a.c,{t:'friends',ids:[b.id]});send(b.c,{t:'friends',ids:[a.id],names:['Ana']});
 await next(a.c,m=>m.t==='fme');await next(b.c,m=>m.t==='fme');
 send(b.c,{t:'cfg',cfg:{skin:4,hs:3}});
 send(a.c,{t:'accountget',token:b.session.token});assert.equal((await next(a.c,m=>m.t==='account')).err,'session','não troca a identidade de um personagem já na sala');
 send(a.c,{t:'finv',to:b.id});assert.equal((await next(a.c,m=>m.t==='finvr')).ok,true);
 const invite=await next(b.c,m=>m.t==='finv');assert.equal(invite.code,a.room.code);
 const c=await H.connect(srv.port);t.after(()=>c.ws.close());
 send(c,{t:'accountget',token:'Z'.repeat(43)});assert.equal((await next(c,m=>m.t==='account')).err,'session');
 const recovery=await auth(c,b.id,b.rec,'recover');
 await H.wait(220);send(c,{t:'accountget',token:recovery.token});assert.equal((await next(c,m=>m.t==='account')).err,'session');
 await H.wait(220);send(c,{t:'accountget'});assert.equal((await next(c,m=>m.t==='account')).err,'session');
 await H.wait(220);send(c,{t:'accountget',token:b.session.token});const saved=await next(c,m=>m.t==='account');
 assert.equal(saved.data.cfg.skin,4);assert.deepEqual(saved.data.friends,[a.id]);assert.equal(saved.data.friendNames[a.id],'Ana');
 send(b.c,{t:'leave'});b.c.ws.close(4000,'leave');await H.wait(150);
 send(c,{t:'join',code:invite.code,name:'Bia',token:b.session.token,cfg:saved.data.cfg});
 const joined=await next(c,m=>m.t==='joined');assert.equal(joined.code,a.room.code);assert.equal(joined.players.find(p=>p.id===joined.id).cfg.skin,4);
});
test('troca de aparelho por recuperação preserva aparência, amigos e textos sem snapshot no código', {skip:H.missing()},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'skyke-account-'));
 const env={PLAYER_DATA_FILE:path.join(dir,'players.json'),PROFILES_FILE:path.join(dir,'profiles.json'),IDENTITY_FILE:path.join(dir,'identities.json'),IDENTITY_GRACE_MS:'0'};
 let srv=await H.startServer(env);t.after(()=>srv.stop());
 const stranger=await H.connect(srv.port);t.after(()=>stranger.ws.close());send(stranger,{t:'accountget'});assert.equal((await next(stranger,m=>m.t==='account')).err,'session');
 const a=await enter(srv,'K','Luna');t.after(()=>a.c.ws.close());
 const auto=await H.request(srv.port,'/profile.json?id='+pidOf(a.id));assert.equal(auto.status,200,'perfil ativo sem comando pubp');
 send(a.c,{t:'cfg',cfg:{skin:3,hs:4,nf:2}});send(a.c,{t:'friends',ids:['b'.repeat(12)]});await next(a.c,m=>m.t==='fme');
 send(a.c,{t:'pubp',on:true,bio:'Eu gosto das estrelas',like:'Plantar',mood:'Oi!',world:'cerron'});await next(a.c,m=>m.t==='pubp'&&m.f.bio==='Eu gosto das estrelas');
 const b=await H.connect(srv.port);t.after(()=>b.ws.close());const s=await auth(b,a.id,a.rec,'recover'),main=key(),rec=key();
 send(b,{t:'idrec',token:s.token,gen:s.gen,pk:main.pk,rpk:rec.pk,sigRec:sign(a.rec,payload.recover(a.id,s.gen,main.pk,rec.pk))});assert.equal((await next(b,m=>m.t==='idok'&&m.op==='recover')).pending,undefined);
 await auth(b,a.id,main);send(b,{t:'accountget'});const loaded=await next(b,m=>m.t==='account');
 assert.equal(loaded.data.cfg.skin,3);assert.equal(loaded.data.cfg.hs,4);assert.deepEqual(loaded.data.friends,['b'.repeat(12)]);assert.equal(loaded.profile.bio,'Eu gosto das estrelas');
 b.ws.close();await srv.stop();srv=await H.startServer(env);const c=await H.connect(srv.port);t.after(()=>c.ws.close());await auth(c,a.id,main);send(c,{t:'accountget'});const persisted=await next(c,m=>m.t==='account');assert.deepEqual(persisted.data,loaded.data);assert.deepEqual(persisted.profile,loaded.profile);
});
test('cura exige amizade mútua e proximidade; consome remédio, atualiza perfil e não repete efeito', {skip:H.missing()},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'skyke-medicine-')),farmFile=path.join(dir,'farm.json'),healthFile=path.join(dir,'health.json');
 const idA=fidOf('M'.repeat(43)),idB=fidOf('N'.repeat(43)),pidA=pidOf(idA),pidB=pidOf(idB);
 fs.writeFileSync(farmFile,JSON.stringify({v:2,p:{[pidA]:{x:1,stock:{cenoura:3,salsa:3,camomila:3}},[pidB]:{x:1,stock:{cenoura:3,salsa:3,camomila:3}}}}));
 fs.writeFileSync(healthFile,JSON.stringify({v:1,p:{[pidB]:{ill:'poeira',until:Date.now()+600000}}}));
 const srv=await H.startServer({FARM_FILE:farmFile,HEALTH_FILE:healthFile});t.after(()=>srv.stop());
 const a=await enter(srv,'M','Medico'),b=await enter(srv,'N','Amiga',a.room.code);t.after(()=>{a.c.ws.close();b.c.ws.close()});
 send(b.c,{t:'medcraft',i:'soro_estelar',rid:'medcraft002'});const own=await next(b.c,m=>m.t==='medr');assert.equal(own.ok,true);assert.equal(own.state.tired,true);
 send(b.c,{t:'medheal',i:'soro_estelar',to:b.room.id,rid:'medself0001'});assert.equal((await next(b.c,m=>m.t==='medr')).reason,'autocura');
 const otherTab=await H.connect(srv.port,'203.0.113.99');t.after(()=>otherTab.ws.close());const session=await auth(otherTab,b.id,b.main);
 send(otherTab,{t:'join',code:a.room.code,name:'Outra aba',token:session.token});await next(otherTab,m=>m.t==='joined');
 send(otherTab,{t:'medheal',i:'soro_estelar',to:b.room.id,rid:'medself0002'});assert.equal((await next(otherTab,m=>m.t==='medr')).reason,'autocura','outra aba da mesma conta não é outro jogador');
 send(b.c,{t:'healthget'});const stillSick=await next(b.c,m=>m.t==='health');assert.equal(stillSick.tired,true);assert.equal(stillSick.meds.soro_estelar,1);assert.equal(stillSick.helped,0);
 assert.equal(b.c.msgs.some(m=>m.t==='medfx'),false,'autocura não gera efeito visual');
 send(a.c,{t:'medcraft',i:'soro_estelar',rid:'medcraft001'});assert.equal((await next(a.c,m=>m.t==='medr')).ok,true);
 send(a.c,{t:'medheal',i:'soro_estelar',to:b.room.id,rid:'medheal0001'});assert.equal((await next(a.c,m=>m.t==='medr')).reason,'amigo');
 send(a.c,{t:'friends',ids:[b.id]});send(b.c,{t:'friends',ids:[a.id]});await next(a.c,m=>m.t==='fme');await next(b.c,m=>m.t==='fme');
 send(a.c,{t:'move',x:-9,z:1.2,ry:0,y:0,s:0});send(b.c,{t:'move',x:9,z:1.2,ry:0,y:0,s:0});await H.wait(1250);
 send(a.c,{t:'medheal',i:'soro_estelar',to:b.room.id,rid:'medheal0002'});assert.equal((await next(a.c,m=>m.t==='medr')).reason,'longe');
 send(a.c,{t:'move',x:8,z:1.2,ry:0,y:0,s:0});await H.wait(1250);
 send(a.c,{t:'medheal',i:'soro_estelar',to:b.room.id,rid:'medheal0003'});const r=await next(a.c,m=>m.t==='medr');assert.equal(r.ok,true);assert.equal(r.state.meds.soro_estelar,undefined);
 assert.equal((await next(b.c,m=>m.t==='health')).tired,false);const effect=await next(b.c,m=>m.t==='medfx');assert.equal(effect.to,b.room.id);
 const profile=await H.request(srv.port,'/profile.json?id='+pidB);assert.equal(profile.json.health.tired,false);assert.ok(!JSON.stringify(profile.json).includes('meds'));
 await H.wait(1250);send(a.c,{t:'medheal',i:'soro_estelar',to:b.room.id,rid:'medheal0004'});assert.equal((await next(a.c,m=>m.t==='medr')).reason,'saudavel');
 // A despensa compartilhada foi debitada no preparo, inclusive depois de gravar/reler.
 await srv.stop();const farm=createFarm({file:farmFile});assert.equal(farm.view(pidA).pantry.salsa,2);
});
