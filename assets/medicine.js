/* Remédios fictícios do jogo, compartilhados pelo cliente e pelo servidor. */
(function(/** @type {any} */ root){
'use strict';
const ILLNESSES={poeira:{n:'Poeira lunar',ic:'🤧'},frio:{n:'Frio estelar',ic:'🥶'},fadiga:{n:'Fadiga cósmica',ic:'😴'}};
const MEDICINES=[
 {id:'tonico_solar',n:'Tônico solar',ic:'🧪',g:['tomate','salsa'],kind:'drink',info:'Cura qualquer mal-estar do jogo.'},
 {id:'balsamo_luar',n:'Bálsamo de luar',ic:'🌙',g:['camomila','hortela'],kind:'balm',info:'Cuidado suave com brilho de luar.'},
 {id:'soro_estelar',n:'Soro estelar',ic:'💉',g:['cenoura','salsa','camomila'],kind:'injection',info:'Uma picadinha, um “Ai!” e energia renovada.'}
];
const MEDICINE=Object.fromEntries(MEDICINES.map(m=>[m.id,m]));
const data={ILLNESSES,MEDICINES,MEDICINE};
if(typeof module==='object'&&module.exports)module.exports=data;else root.SKYMED=data;
})(typeof globalThis!=='undefined'?globalThis:this);
