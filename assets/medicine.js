/* Remédios fictícios do jogo, compartilhados pelo cliente e pelo servidor. */
(function(/** @type {any} */ root){
'use strict';
const ILLNESSES={poeira:{n:'Poeira lunar',ic:'🤧'},frio:{n:'Frio estelar',ic:'🥶'},fadiga:{n:'Fadiga cósmica',ic:'😴'}};
const MED_ROUTES={drink:{n:'Tônicos',action:'Oferecer tônico',effect:'Goles, bolhas e espiral de luz'},balm:{n:'Bálsamos',action:'Aplicar bálsamo',effect:'Massagem e folhas luminosas'},injection:{n:'Injeções',action:'Aplicar injeção',effect:'Seringa, “Ai!” e hélice de cura'},mist:{n:'Brumas',action:'Borrifar bruma',effect:'Borrifador e nuvem cintilante'},tablet:{n:'Cápsulas',action:'Oferecer cápsula',effect:'Cápsula, deglutição e estrelas'},ritual:{n:'Alquimia',action:'Canalizar elixir',effect:'Frasco, sinos e círculos alquímicos'}};
// Os três primeiros ids permanecem iguais para preservar os estoques das versões anteriores.
// Nomes inspirados em farmácia, botânica brasileira e fantasia; sem dosagens ou receitas médicas reais.
const MEDICINES=[
 {id:'tonico_solar',n:'Paracetamol de Aurora',ic:'🌅',g:['tomate','salsa'],kind:'drink',color:0xffc66d,accent:0xff7878,note:60,info:'Um tônico de fantasia: bolhas douradas sobem como um novo amanhecer.'},
 {id:'balsamo_luar',n:'Unguento de Copaíba Lunar',ic:'🌙',g:['camomila','hortela'],kind:'balm',color:0x91ffbc,accent:0xd2f9ff,note:62,info:'Botânica imaginária: folhas de luz acompanham uma massagem suave.'},
 {id:'soro_estelar',n:'Soro Fisiológico de Éter',ic:'💉',g:['cenoura','salsa','camomila'],kind:'injection',color:0x73d9ff,accent:0xc4a8ff,note:64,info:'Uma picadinha espacial: “Ai!”, hélices azuis e energia renovada.'},
 {id:'dipirona_venus',n:'Dipirona de Vênus',ic:'🧪',g:['morango','hortela','limao'],kind:'drink',color:0xff8ac6,accent:0xffdf83,note:65,info:'Goles de brilho rosado com bolhas que dançam em órbita.'},
 {id:'garrafada_acai',n:'Garrafada de Açaí Astral',ic:'🫐',g:['acai','gengibre','acucar'],kind:'drink',color:0xc595ff,accent:0xff88c2,note:67,info:'Uma garrafada de faz de conta, com redemoinhos violetas e som de gotas.'},
 {id:'cataplasma_jatoba',n:'Cataplasma de Jatobá Cósmico',ic:'🌿',g:['gengibre','salsa','trevo'],kind:'balm',color:0xb2ec74,accent:0xffc77b,note:69,info:'Folhas luminosas giram ao redor do amigo durante o cuidado.'},
 {id:'pomada_calendula',n:'Pomada Calêndula-7',ic:'🌼',g:['girassol','camomila','abobora'],kind:'balm',color:0xffd56b,accent:0xffa265,note:71,info:'Uma pomada de laboratório fantástico com pétalas douradas.'},
 {id:'penicilina_quantica',n:'Penicilina Quântica',ic:'🔬',g:['cogumelo','alho','brocolis'],kind:'injection',color:0x74ffc7,accent:0x75bdff,note:72,info:'Uma seringa de fantasia desenha uma dupla hélice verde. Tem “Ai!” também.'},
 {id:'vacina_nebulosa',n:'Vacina de Nebulosa',ic:'🌌',g:['uva','limao','rosa'],kind:'injection',color:0xc59aff,accent:0xff91cf,note:74,info:'Uma picadinha colorida abre uma pequena nebulosa de partículas.'},
 {id:'aerossol_glacial',n:'Aerossol de Hortelã Glacial',ic:'❄️',g:['hortela','pepino','limao'],kind:'mist',color:0x8cefff,accent:0xdbffff,note:60,info:'Uma borrifada refrescante de fantasia, com nuvens claras e sopro delicado.'},
 {id:'salbutamol_nimbus',n:'Salbutamol-Nimbus',ic:'☁️',g:['manjericao','pera','cha_verde'],kind:'mist',color:0xa3cfff,accent:0xdabaff,note:64,info:'O borrifador espalha uma nuvem azul com pequenos brilhos.'},
 {id:'bruma_eucalipto',n:'Bruma de Eucalipto Azul',ic:'🍃',g:['erva_mate','hortela','lotus'],kind:'mist',color:0x81ffd9,accent:0x74baff,note:67,info:'Uma brisa botânica imaginária envolve o amigo em verde e azul.'},
 {id:'vitamina_supernova',n:'Vitamina C de Supernova',ic:'🍊',g:['laranja','limao','cenoura'],kind:'tablet',color:0xffbc65,accent:0xffef9d,note:62,info:'Uma cápsula de faz de conta vira uma constelação alaranjada.'},
 {id:'capsula_guarana',n:'Cápsula de Guaraná e Fótons',ic:'💊',g:['cafe','acai','acucar'],kind:'tablet',color:0xff9b79,accent:0xf3d8ff,note:65,info:'Uma cápsula astral acompanhada de estrelas, estalos suaves e um aceno.'},
 {id:'acetil_lunar',n:'Comprimido Acetil-Lunar',ic:'🌗',g:['arroz','camomila','banana'],kind:'tablet',color:0xb4b4ff,accent:0xf1edff,note:69,info:'Uma pequena lua de fantasia se dissolve em faíscas prateadas.'},
 {id:'pedra_filosofal',n:'Pedra Filosofal Líquida',ic:'⚗️',g:['girassol','gengibre','manga'],kind:'ritual',color:0xffd36d,accent:0xff9879,note:60,info:'Um frasco alquímico acende círculos dourados ao som de sinos.'},
 {id:'panaceia_azoth',n:'Panaceia de Azoth',ic:'🔮',g:['lotus','hibisco','trevo'],kind:'ritual',color:0xbd91ff,accent:0x8fffe4,note:65,info:'Anéis violetas se cruzam numa transmutação inteiramente imaginária.'},
 {id:'elixir_albedo',n:'Elixir Albedo-Rubedo',ic:'✨',g:['rosa','morango','cha_verde'],kind:'ritual',color:0xff8fad,accent:0xf1f6ff,note:67,info:'Do branco ao rubro: círculos de luz celebram a cura do amigo.'}
];
const MEDICINE=Object.fromEntries(MEDICINES.map(m=>[m.id,m]));
const data={ILLNESSES,MED_ROUTES,MEDICINES,MEDICINE};
if(typeof module==='object'&&module.exports)module.exports=data;else root.SKYMED=data;
})(typeof globalThis!=='undefined'?globalThis:this);
