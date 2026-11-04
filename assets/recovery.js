/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Código de recuperação: o nome, o visual do avatar e os amigos num texto que o jogador guarda e cola em outro aparelho.
 * Tudo é feito aqui no navegador: nada vai ao servidor e nada fica guardado fora deste aparelho.
 * Formato (versão 1), em bytes:
 *   [cabeçalho: versão (4 bits) · cores brilhantes (1 bit) · amigos (1 bit) · 2 bits zerados]
 *   [12 campos do visual × 7 bits, na ordem de F, + 4 bits zerados = 11 bytes]
 *   [só com o bit de amigos: chave de amigo (32 bytes) · quantidade (1 byte, até MAXF) · ids de 12 letras × 5 bits]
 *   [nome em UTF-8, de 0 a 64 bytes]
 *   [conferência: 5 primeiros bytes do SHA-256 de TAG + tudo o que veio antes]
 * O resultado vai em Base32 Crockford (sem I, L, O e U; maiúscula ou minúscula tanto faz; O vira 0 e I/L viram 1),
 * em grupos de 5 separados por hífen. A conferência de 40 bits recusa erro de digitação, código cortado e código
 * alterado à mão (a chance de um código errado passar é de 1 em 1 trilhão). Com amigos, o código é segredo: leva a chave
 * que identifica a pessoa para os amigos (nunca nomes nem mensagens). O que sai de decode é validado como dado não confiável.
 * Os 7 bits por campo cabem até 128 opções por lista: as listas do catálogo só crescem no fim, então códigos
 * antigos continuam valendo. Mudar a ordem de F ou o tamanho dos campos exige uma versão nova.
 */
(function(/** @type {any} */ root){'use strict';
const C=typeof module==='object'&&module.exports?require('./catalog.js'):root.SKYCAT;
const F=['fc','skin','eye','hs','hair','hat','hc','shirt','bt','pc','shoes','sc'],FB=7,VER=1,HEAD=12,CK=5,NAMEB=64,KEYB=32,MAXF=40,FID='abcdefghijklmnopqrstuvwxyz234567';
const MAXB=HEAD+KEYB+1+Math.ceil(MAXF*60/8)+NAMEB+CK;
const TAG=[...'skyke3d/rec/v1'].map(c=>c.charCodeAt(0));
const A='0123456789ABCDEFGHJKMNPQRSTVWXYZ',AI={};[...A].forEach((c,i)=>AI[c]=i);Object.assign(AI,{O:0,I:1,L:1});
// SHA-256 (FIPS 180-4) síncrono e sem dependências: as constantes saem das raízes dos primeiros primos
const [K,H0]=(()=>{const k=[],h=[];for(let c=2,n=0;n<64;c++){let p=1;for(let d=2;d*d<=c;d++)if(c%d===0){p=0;break}if(!p)continue;if(n<8)h[n]=Math.pow(c,1/2)*4294967296|0;k[n++]=Math.pow(c,1/3)*4294967296|0}return[k,h]})();
function sha256(m){const l=m.length,n=(l+72)&~63,b=new Uint8Array(n),dv=new DataView(b.buffer);b.set(m);b[l]=0x80;dv.setUint32(n-8,Math.floor(l/536870912));dv.setUint32(n-4,l*8>>>0);
 const H=H0.slice(),w=new Int32Array(64),r=(x,s)=>x>>>s|x<<(32-s);
 for(let o=0;o<n;o+=64){for(let i=0;i<16;i++)w[i]=dv.getInt32(o+i*4);for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(r(x,7)^r(x,18)^x>>>3)+(r(y,17)^r(y,19)^y>>>10)+w[i-7]+w[i-16]|0}
  let [a,bb,c,d,e,f,g,h]=H;for(let i=0;i<64;i++){const t1=h+(r(e,6)^r(e,11)^r(e,25))+(e&f^~e&g)+K[i]+w[i]|0,t2=(r(a,2)^r(a,13)^r(a,22))+(a&bb^a&c^bb&c)|0;h=g;g=f;f=e;e=d+t1|0;d=c;c=bb;bb=a;a=t1+t2|0}
  [a,bb,c,d,e,f,g,h].forEach((v,i)=>H[i]=H[i]+v|0)}
 const out=new Uint8Array(32),od=new DataView(out.buffer);H.forEach((v,i)=>od.setInt32(i*4,v));return out}
const check=p=>sha256(Uint8Array.from([...TAG,...p])).slice(0,CK);
function b32(u8){let s='',acc=0,bits=0;for(const x of u8){acc=acc<<8|x;bits+=8;while(bits>=5){bits-=5;s+=A[acc>>bits&31]}acc&=(1<<bits)-1}if(bits)s+=A[acc<<(5-bits)&31];return s}
function unb32(s){const out=[];let acc=0,bits=0;for(const ch of s){const v=AI[ch];if(v===undefined)return null;acc=acc<<5|v;bits+=5;if(bits>=8){bits-=8;out.push(acc>>bits&255)}acc&=(1<<bits)-1}return acc||bits>=5?null:Uint8Array.from(out)}
// chave de amigo: base64url (43 letras) ↔ 32 bytes
const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function keyBytes(k){if(typeof k!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(k))return null;const out=[];let acc=0,bits=0;for(const ch of k){acc=acc<<6|B64.indexOf(ch);bits+=6;if(bits>=8){bits-=8;out.push(acc>>bits&255)}acc&=(1<<bits)-1}return out}
function keyText(b){let s='',acc=0,bits=0;for(const x of b){acc=acc<<8|x;bits+=8;while(bits>=6){bits-=6;s+=B64[acc>>bits&63]}acc&=(1<<bits)-1}return s+B64[acc<<(6-bits)&63]}
// ids de amigo (12 letras de 5 bits) ↔ bytes, um atrás do outro
function packIds(ids){const out=[];let acc=0,bits=0;ids.forEach(id=>{for(const ch of id){acc=acc<<5|FID.indexOf(ch);bits+=5;if(bits>=8){bits-=8;out.push(acc>>bits&255)}acc&=(1<<bits)-1}});if(bits)out.push(acc<<(8-bits)&255);return out}
function unpackIds(b,n){const ids=[];let acc=0,bits=0,j=0,id='';while(ids.length<n){while(bits<5){acc=acc<<8|b[j++];bits+=8}bits-=5;id+=FID[acc>>bits&31];acc&=(1<<bits)-1;if(id.length===12){ids.push(id);id=''}}return ids}
// {name, look:{fc,skin,...}, gloss, fk?, friends?} → 'XXXXX-XXXXX-...'
function encode(o){const p=new Uint8Array(HEAD),kb=keyBytes(o.fk);p[0]=VER<<4|(o.gloss?8:0)|(kb?4:0);let acc=0,bits=0,j=1;
 F.forEach(k=>{const v=o.look[k];acc=acc<<FB|(Number.isInteger(v)&&v>=0&&v<128?v:0);bits+=FB;while(bits>=8){bits-=8;p[j++]=acc>>bits&255}acc&=(1<<bits)-1});p[j]=acc<<(8-bits)&255;
 let nm=new TextEncoder().encode(typeof o.name==='string'?o.name:'');if(nm.length>NAMEB)nm=nm.slice(0,0);
 const ids=kb&&Array.isArray(o.friends)?[...new Set(o.friends)].filter(x=>typeof x==='string'&&/^[a-z2-7]{12}$/.test(x)).slice(0,MAXF):[];
 const soc=kb?[...kb,ids.length,...packIds(ids)]:[];
 const body=Uint8Array.from([...p,...soc,...nm]);return (b32(Uint8Array.from([...body,...check(body)])).match(/.{1,5}/g)||[]).join('-')}
// texto colado → {ok:true, name, look, gloss, fk, friends} ou {ok:false, err}; espaços, hífens e minúsculas não importam
function decode(s){if(typeof s!=='string'||s.length>Math.ceil(MAXB*8/5)*1.3)return{ok:false,err:'formato'};const t=s.toUpperCase().replace(/[\s-]+/g,'');
 const u=t.length>=Math.ceil((HEAD+CK)*8/5)?unb32(t):null;if(!u||u.length<HEAD+CK||u.length>MAXB)return{ok:false,err:'formato'};
 const body=u.slice(0,-CK),ck=check(body);if(!ck.every((x,i)=>x===u[u.length-CK+i]))return{ok:false,err:'conferencia'};
 if(body[0]>>4!==VER)return{ok:false,err:'versao'};if(body[0]&3||body[HEAD-1]&15)return{ok:false,err:'formato'};
 const look={};let acc=0,bits=0,j=1;for(const k of F){while(bits<FB){acc=acc<<8|body[j++];bits+=8}bits-=FB;const v=acc>>bits&127;acc&=(1<<bits)-1;if(v>=C.CR[k])return{ok:false,err:'faixa'};look[k]=v}
 let off=HEAD,fk='',friends=[];
 if(body[0]&4){const n=body[HEAD+KEYB],nb=Math.ceil(n*60/8);if(n===undefined||n>MAXF||body.length<HEAD+KEYB+1+nb)return{ok:false,err:'formato'};fk=keyText(body.slice(HEAD,HEAD+KEYB));friends=unpackIds(body.slice(HEAD+KEYB+1,HEAD+KEYB+1+nb),n);off=HEAD+KEYB+1+nb}
 if(body.length-off>NAMEB)return{ok:false,err:'formato'};
 let name;try{name=new TextDecoder('utf-8',{fatal:true}).decode(body.slice(off))}catch(e){return{ok:false,err:'formato'}}
 return{ok:true,name,look,gloss:(body[0]&8)?1:0,fk,friends}}
// ---------- versão 2: identidade com chave de recuperação P-256 ----------
// O código v2 leva o id opaco da identidade e a chave privada de recuperação em PKCS#8 DER
// (comprimento variável, até 255 bytes), além do nome/visual/amigos. A chave primária nunca
// entra aqui: ela fica só no IndexedDB, não exportável.
// Layout: [cabeçalho 1 B][visual 11 B][id 8 B][tamanho da recuperação 1 B][PKCS#8 até 255 B]
//         [fk legado 32 B opcional][amigos: quantidade 1 B + ids de 12 letras × 5 bits][nome UTF-8][conferência 5 B]
const VER2=2,TAG2=[...'skyke3d/rec/v2'].map(c=>c.charCodeAt(0)),IDB=8;
const MAXB2=HEAD+IDB+1+256+KEYB+1+Math.ceil(MAXF*60/8)+NAMEB+CK;
const check2=p=>sha256(Uint8Array.from([...TAG2,...p])).slice(0,CK);
function b64uBytes(s){if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s))return null;const out=[];let acc=0,bits=0;for(const ch of s){acc=acc<<6|B64.indexOf(ch);bits+=6;if(bits>=8){bits-=8;out.push(acc>>bits&255)}acc&=(1<<bits)-1}return Uint8Array.from(out)}
function b64uText(b){let s='',acc=0,bits=0;for(const x of b){acc=acc<<8|x;bits+=8;while(bits>=6){bits-=6;s+=B64[acc>>bits&63]}acc&=(1<<bits)-1}if(bits)s+=B64[acc<<(6-bits)&63];return s}
function encodeV2(o){
  if(typeof o.id!=='string'||!/^[a-z2-7]{12}$/.test(o.id))return null;
  const rb=b64uBytes(o.rec);if(!rb||!rb.length||rb.length>255)return null;
  const lb=keyBytes(o.fk);
  const p=new Uint8Array(HEAD);p[0]=VER2<<4|(o.gloss?8:0)|(Array.isArray(o.friends)&&o.friends.length?4:0)|(lb?2:0);
  let acc=0,bits=0,j=1;
  F.forEach(k=>{const v=o.look&&o.look[k];acc=acc<<FB|(Number.isInteger(v)&&v>=0&&v<128?v:0);bits+=FB;while(bits>=8){bits-=8;p[j++]=acc>>bits&255}acc&=(1<<bits)-1});p[j]=acc<<(8-bits)&255;
  const idb=packIds([o.id]);
  const ids=Array.isArray(o.friends)?[...new Set(o.friends)].filter(x=>typeof x==='string'&&/^[a-z2-7]{12}$/.test(x)).slice(0,MAXF):[];
  let nm=new TextEncoder().encode(typeof o.name==='string'?o.name:'');if(nm.length>NAMEB)nm=nm.slice(0,NAMEB);
  const body=Uint8Array.from([...p,...idb,rb.length,...rb,...(lb||[]),...(Array.isArray(o.friends)&&o.friends.length?[ids.length,...packIds(ids)]:[]),...nm]);
  return (b32(Uint8Array.from([...body,...check2(body)])).match(/.{1,5}/g)||[]).join('-');
}
function decodeV2(s){
  if(typeof s!=='string'||s.length>Math.ceil(MAXB2*8/5)*1.3)return{ok:false,err:'formato'};
  const t=s.toUpperCase().replace(/[\s-]+/g,'');
  const u=t.length>=Math.ceil((HEAD+IDB+2+CK)*8/5)?unb32(t):null;
  if(!u||u.length<HEAD+IDB+2+CK||u.length>MAXB2)return{ok:false,err:'formato'};
  const body=u.slice(0,-CK),ck=check2(body);if(!ck.every((x,i)=>x===u[u.length-CK+i]))return{ok:false,err:'conferencia'};
  if(body[0]>>4!==VER2)return{ok:false,err:'versao'};
  if(body[0]&1||body[HEAD-1]&15)return{ok:false,err:'formato'};
  const look={};let acc=0,bits=0,j=1;
  for(const k of F){while(bits<FB){acc=acc<<8|body[j++];bits+=8}bits-=FB;const v=acc>>bits&127;acc&=(1<<bits)-1;if(v>=C.CR[k])return{ok:false,err:'faixa'};look[k]=v}
  const id=unpackIds(body.slice(HEAD,HEAD+IDB),1)[0];
  if(!/^[a-z2-7]{12}$/.test(id||''))return{ok:false,err:'formato'};
  let off=HEAD+IDB;
  const rl=body[off++];
  if(!rl||off+rl>body.length)return{ok:false,err:'formato'};
  const rec=b64uText(body.slice(off,off+rl));off+=rl;
  let fk='';
  if(body[0]&2){if(off+KEYB>body.length)return{ok:false,err:'formato'};fk=keyText(body.slice(off,off+KEYB));off+=KEYB}
  let friends=[];
  if(body[0]&4){const n=body[off],nb=Math.ceil(n*60/8);if(n===undefined||n>MAXF||body.length<off+1+nb)return{ok:false,err:'formato'};friends=unpackIds(body.slice(off+1,off+1+nb),n);off+=1+nb}
  if(body.length-off>NAMEB)return{ok:false,err:'formato'};
  let name;try{name=new TextDecoder('utf-8',{fatal:true}).decode(body.slice(off))}catch(e){return{ok:false,err:'formato'}}
  return{ok:true,v:2,id,rec,fk,name,look,gloss:(body[0]&8)?1:0,friends};
}
/** aceita o código v2 (identidade) e, para não quebrar quem já tem, o v1 antigo */
function decodeAny(s){const a=decodeV2(s),b=decode(s);if(a.ok)return a;if(b.ok)return{...b,v:1};return a.err!=='versao'?a:b}
const REC={encode,decode,encodeV2,decodeV2,decodeAny,sha256,FIELDS:F,MAXF};
if(typeof module==='object'&&module.exports)module.exports=REC;else root.SKYREC=REC;
})(typeof globalThis!=='undefined'?globalThis:this);
