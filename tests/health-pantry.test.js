'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createFarm}=require('../lib/farm');
const {createCook}=require('../lib/cook');
const {createHealth,ACTIVE_MS}=require('../lib/health');
const {createPlayerData}=require('../lib/player-data');
const {MEDICINES}=require('../assets/medicine');
const C=require('../assets/catalog');
const P='a'.repeat(20),Q='b'.repeat(20);
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'skyke-integrated-'));
function setup(file=''){
 let at=1000000;const farm=createFarm({file,now:()=>at,rng:()=>0});
 const crop=(id)=>{assert.equal(farm.plant(P,0,id).ok,true);at+=C.CROP[id].t*1000+1;return farm.harvest(P,0)};
 return {farm,crop,advance:ms=>at+=ms};
}
test('colher abastece a despensa; cozinhar retira quantidades e não aceita ingredientes grátis',()=>{
 const {farm,crop}=setup();const cook=createCook({consume:(pid,ids)=>farm.consume(pid,ids)});
 assert.equal(cook.cook(P,C.RECIPE.milho_brasa.m,C.RECIPE.milho_brasa.g).reason,'despensa');
 crop('tomate');crop('salsa');
 const valid=C.RECIPE.milho_brasa;
 assert.ok(valid);
 const before=farm.view(P).pantry;
 assert.equal(farm.consume(P,['tomate','tomate','tomate']),false,'sem baixa parcial');
 assert.deepEqual(farm.view(P).pantry,before);
 const stock={};for(const id of valid.g)stock[id]=2;
 const dir=temp(),file=path.join(dir,'farm.json');fs.writeFileSync(file,JSON.stringify({v:2,p:{[P]:{x:1,m:0,stock}}}));
 const f=createFarm({file});const c=createCook({consume:(pid,ids)=>f.consume(pid,ids)});
 assert.equal(c.cook(P,valid.m,valid.g).ok,true);
 for(const id of valid.g)assert.equal(f.view(P).pantry[id],1);
 assert.equal(c.cook(P,valid.m,valid.g).ok,true);
 assert.equal(c.cook(P,valid.m,valid.g).reason,'despensa');
 assert.equal(c.view(P).total,2);
});
test('armazém exige moedas da colheita, não vende planta cultivável e persiste a despensa',()=>{
 const file=path.join(temp(),'farm.json'),{farm,crop}=setup(file);
 assert.equal(farm.supply(P,'sal').ok,false);crop('tomate');
 const cash=farm.view(P).coins;
 assert.equal(farm.supply(P,'sal').ok,true);
 assert.equal(farm.view(P).coins,cash-C.SUPPLY_PRICE);
 assert.equal(farm.supply(P,'tomate').ok,false);
 farm.flush();const loaded=createFarm({file});assert.deepEqual(loaded.view(P).pantry,farm.view(P).pantry);
 assert.equal(loaded.view(P).possessions,1);
 assert.equal(fs.statSync(file).mode&0o777,0o600);
});
test('cansaço exige cura de outro jogador; autocura não consome remédio e descanso não cura',()=>{
 let at=1000000;const file=path.join(temp(),'health.json');let supplies=0;
 const h=createHealth({file,now:()=>at,rng:()=>0,consume:()=>{supplies++;return true}});
 assert.equal(h.craft(P,'tonico_solar').ok,true);
 for(let elapsed=0;elapsed<ACTIVE_MS;elapsed+=10000){at+=10000;h.tick(Q,10000);h.tick(P,10000)}
 assert.equal(h.publicOf(Q).tired,true);
 const before=h.view(P);assert.equal(before.tired,true);
 assert.equal(h.heal(P,P,'tonico_solar').reason,'autocura');
 assert.deepEqual(h.view(P),before,'não altera doença, estoque, experiência ou imunidade');
 assert.equal(h.heal(P,Q,'tonico_solar').ok,true);assert.equal(h.view(P).helped,1);
 assert.equal(h.heal(P,Q,'tonico_solar').reason,'saudavel');assert.equal(h.view(P).helped,1);
 assert.equal(h.publicOf(Q).tired,false);assert.equal(supplies,1);
 h.flush();const restored=createHealth({file,now:()=>at});assert.equal(restored.view(P).helped,1);assert.equal(restored.view(P).meds.tonico_solar,undefined);
 at+=ACTIVE_MS;
 for(let elapsed=0;elapsed<ACTIVE_MS;elapsed+=10000){at+=10000;h.tick(Q,10000)}
 assert.equal(h.publicOf(Q).tired,true);at+=10*86400000;h.tick(Q,0);assert.equal(h.publicOf(Q).tired,true,'o tempo não cura');
 h.flush();assert.equal(createHealth({file,now:()=>at}).publicOf(Q).tired,true,'reiniciar não cura');
 const legacy=path.join(temp(),'old-health.json');fs.writeFileSync(legacy,JSON.stringify({v:1,p:{[Q]:{ill:'poeira',until:at-1}}}));
 assert.equal(createHealth({file:legacy,now:()=>at}).publicOf(Q).tired,true,'o prazo antigo não causa cura automática');
});
test('remédios usam colheita real; falta ou receita inválida não alteram a despensa',()=>{
 const {farm,crop}=setup();const h=createHealth({consume:(pid,ids)=>farm.consume(pid,ids)});
 assert.equal(h.craft(P,'tonico_solar').reason,'despensa');crop('tomate');
 const before=farm.view(P).pantry;assert.equal(h.craft(P,'tonico_solar').reason,'despensa');assert.deepEqual(farm.view(P).pantry,before);
 crop('salsa');assert.equal(h.craft(P,'tonico_solar').ok,true);assert.equal(h.view(P).meds.tonico_solar,1);
 assert.equal(h.craft(P,'__proto__').reason,'receita');
 for(const med of MEDICINES)assert.ok(med.g.every(g=>C.FARM_SOURCES[g].length),'ingredientes de remédio são cultiváveis');
});
test('dados privados persistem na identidade e devolvem cópias, incluindo lista vazia após remover amigos',()=>{
 const file=path.join(temp(),'players.json'),id='a'.repeat(12),friend='b'.repeat(12),d=createPlayerData({file});
 assert.equal(d.update(id,{name:'Ana',cfg:{skin:2},friends:[friend,friend,'invalid']}),true);d.flush();
 const restored=createPlayerData({file});assert.deepEqual(restored.get(id).friends,[friend]);assert.equal(restored.get(id).cfg.skin,2);
 const copy=restored.get(id);copy.friends.push('c'.repeat(12));assert.deepEqual(restored.get(id).friends,[friend]);
 restored.update(id,{friends:[]});restored.flush();assert.deepEqual(createPlayerData({file}).get(id).friends,[]);
 assert.equal(fs.statSync(file).mode&0o777,0o600);
});
