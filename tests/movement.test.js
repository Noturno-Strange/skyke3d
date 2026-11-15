'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'../assets/app-ui.js'),'utf8');
function xyz(){return {x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}}}
function actor(){const u={fig:{position:xyz(),rotation:xyz(),scale:xyz()},fy:0};for(const k of ['armL','armR','hd','mo','lgL','lgR','knL','knR','ftL','ftR'])u[k]={position:xyz(),rotation:xyz(),scale:xyz()};return {g:{userData:u,position:xyz()},spd:3.2,sit:false,drink:0,gest:null}}
test('redução de movimentos mantém passos visíveis e remove o balanço do corpo',()=>{
 const fn=src.slice(src.indexOf('function animA('),src.indexOf('const PERF='));
 const ctx=vm.createContext({rm:true,seatAt:()=>null,window:{},Math,performance});vm.runInContext(fn+'\nthis.animate=animA;',ctx);
 const a=actor();let max=0;for(let i=0;i<10;i++){ctx.animate(a,i*.05,.05);max=Math.max(max,Math.abs(a.g.userData.lgL.rotation.x))}
 assert.ok(max>.1,'passos continuam presentes');assert.equal(a.g.userData.fig.rotation.z,0,'sem balanço lateral');assert.equal(a.g.userData.fig.position.y,0,'sem pulinhos');
});
test('WASD usa posição física, setas têm mapeamento estável e existe fallback para teclados sem code',()=>{
 const expression=src.slice(src.indexOf('const gameKey='),src.indexOf('const clearGameKeys='));const ctx=vm.createContext({});vm.runInContext(expression+'this.key=gameKey;',ctx);
 assert.equal(ctx.key({code:'KeyW',key:'z'}),'w');assert.equal(ctx.key({code:'KeyA',key:'q'}),'a');assert.equal(ctx.key({code:'KeyS',key:'S'}),'s');assert.equal(ctx.key({code:'KeyD',key:'D'}),'d');
 for(const dir of ['Up','Left','Down','Right'])assert.equal(ctx.key({code:'Arrow'+dir,key:'Arrow'+dir}),'arrow'+dir.toLowerCase());
 assert.equal(ctx.key({code:'',key:'W'}),'w');
});
