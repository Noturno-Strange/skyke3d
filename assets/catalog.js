/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Catálogo do jogo: a única fonte dos nomes, itens, gestos, emojis, cores, estilos do avatar, mundos, limites e os números do modo Sobrevivência (SURV).
 * O navegador carrega este arquivo antes dos outros (vira o objeto global SKYCAT) e o servidor faz require dele
 * (validate.js deriva daqui o que aceita). Mudou aqui, mudou nos dois lados.
 *
 * Como mudar sem quebrar (os testes em tests/catalog.test.js conferem):
 * - Nome que aparece na tela (n, info, nomes de estilos e de mundos): pode trocar à vontade.
 * - id (itens, gestos, mundos): é o que vai pela rede. Para trocar o id de um mundo, ponha o antigo em ST_LEGACY.
 * - Listas por posição (EMO, paletas PAL/SKIN/EYE/HAIRC, HS, HATS, SHOES, BT, FACES): o número da posição é o que vai
 *   pela rede e fica salvo no navegador dos jogadores. Só acrescente no fim; trocar a ordem ou remover muda o visual
 *   de quem já tinha escolhido.
 * - Item novo com ícone desenhado: a chave em `ic` precisa existir em ICONS (assets/app-base.js); emoji serve direto.
 * - Gesto novo: precisa da animação com o mesmo id em DANCES (assets/app-ui.js).
 */
(function(root){'use strict';
// cores vivas, no estilo cel-shading: aumenta a saturação (HSL) das paletas do avatar
const vivid=(h,k,lk)=>{let r=parseInt(h.slice(1,3),16)/255,g=parseInt(h.slice(3,5),16)/255,b=parseInt(h.slice(5,7),16)/255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let l=(mx+mn)/2;let H=0,S=0;if(d){S=d/(1-Math.abs(2*l-1));H=mx===r?((g-b)/d+(g<b?6:0)):mx===g?(b-r)/d+2:(r-g)/d+4;H/=6}
 S=Math.min(1,S*k);if(lk)l=Math.min(.72,Math.max(.42,l*lk));const f=n=>{const a=S*Math.min(l,1-l),kk=(n+H*12)%12,c=l-a*Math.max(-1,Math.min(kk-3,9-kk,1));return Math.round(c*255).toString(16).padStart(2,'0')};return'#'+f(0)+f(8)+f(4)};
const PAL=['#d9453b','#ef8a2c','#f4c936','#3aa860','#1f9d8e','#3d86d6','#8d5bd0','#e9579b','#f1ece1','#8a96a0','#34507a','#8a5a44','#3b3647','#9b2f3f','#f7a8c8','#7fd6dc','#a5d44c','#5a52d8','#fbf6ea','#d9a62b'].map(h=>vivid(h,1.6)).concat(['#6e0a1c','#0a2470','#06683a','#3f1670','#065e66','#703806','#6e0a52','#701a06','#6b5206','#3a5a06','#0a0a10','#2b2e38','#ffffff','#cfd5e0','#ffc933','#14205a','#0f5a32','#6a1030','#ff7a6a','#8ff5c8']);// 20 originais + 10 cores brilhantes (rubi, safira, esmeralda...) + 10 novas (preto brilhante, grafite, branco, prata, dourado...)
const SKIN=['#f1c9a5','#d9a273','#a8693f','#6b4128'].map(h=>vivid(h,1.3)).concat(['#f7dcc4','#8c5a3c','#4aa3e8','#f58ac6','#9b6bdc','#c9a7f0','#5cc47a','#3cc7c0','#f2d34a','#e0524a','#e8ecf4','#ff9b4a']),EYE=['#5a3418','#1e7be0','#18a85a','#8a5cf0','#c98a1e','#7d8a96','#2a1e22','#8a6a2a','#7fd0f0','#16b8b0','#d6283a','#f06aa8','#f2c230','#f07a1e','#c79cf2','#8fd62a'],HAIRC=['#2f2622','#6e4429','#d6a13c','#b8372c','#b9bfca','#8b5cd6','#3b82d6','#2fa86a','#e8742a','#f1d24a','#62cfe6','#ee6fa8'].map(h=>vivid(h,1.6)).concat(['#6e0a1c','#0a2470','#06683a','#3f1670','#065e66','#703806','#6e0a52','#701a06','#6b5206','#3a5a06','#0a0a10','#0f1530','#f4f4f8','#c7ccd6','#e8a39a','#5a0a14','#0fbfa8','#7a2cff','#9ff0d0','#4a2a1c']);// 12 originais + 10 cores brilhantes (rubi, safira, esmeralda...) + 10 novos (preto brilhante, preto azulado, platinado, prata...)
const HS=['Afro','Cacheado','Coque','Moicano','Maria-chiquinha','Nuvem','Espetado','Topete','Curto','Rabo de cavalo','Duplo coque','Bob de bolinhas','Franjinha','Coroa','Pompom','Chiquinhas longas','Cachos longos','Moicano alto','Rabo lateral','Dois pompons','Confete','Colmeia','Orelhinhas','Trancinhas','Flat top','Raspado','Risco lateral','Longo liso','Repicado','Social curto','Tranças longas','Pompadour','Mullet','Coque samurai'],HATS=['Sem chapéu','Gorro','Bucket','Cowboy'],SHOES=['Tênis','Bota','Sandália'],BT=['Comprida','Curta'];
const FACES=['Sorriso aberto','Sorriso suave','Olhos felizes','Piscadinha','Surpreso','Língua de fora','Sorrisão','Bochechas','Sério','Bravo','Triste','Dorminhoco'];
// os 10 últimos são do tema do jogo (planetas, viagem espacial e magia); a ordem é o índice enviado ao servidor, então só acrescente no fim
const EMO=['😀','😂','😍','😎','🥳','😭','😡','😱','🤔','👍','👏','🙌','❤️','🔥','🎉','✨','🎤','💃','🤢','😴','🪐','🚀','🌙','🌟','☄️','👽','🛸','🌌','🔭','🪄'];
// mundos: id → nome na tela
const ST={proxima:{n:'Proxima'},kepler:{n:'Kepler'},gliese:{n:'Gliese'},osiris:{n:'Osíris'},tauri:{n:'Tauri'},esmera:{n:'Esmera'},ambar:{n:'Ambar'},nyx:{n:'Nyx'},
 lumen:{n:'Lumen'},duna:{n:'Duna'},mira:{n:'Mira'},sakura:{n:'Sakura'},nivis:{n:'Nivis'},cinder:{n:'Cinder'},trappist:{n:'Trappist'},draugr:{n:'Draugr'},acampamento:{n:'Acampamento',surv:1}};
// ids antigos dos mundos (renomeados): clientes e links antigos ainda podem mandá-los
const ST_LEGACY={aeris:'proxima',brontis:'kepler',cryon:'gliese',pyra:'osiris',sylvaris:'tauri',verdara:'esmera',ambara:'ambar',nyxara:'nyx',lumeris:'lumen',dunara:'duna',mycelis:'mira',rosara:'sakura',nivara:'nivis',cindara:'cinder',marinis:'trappist',umbris:'draugr'};
// mochila: food=1 some da mão depois de comer; mg=1 solta ✨ ao usar; ic é um emoji ou uma chave de ICONS
const ITEMS=[{id:'refri',n:'Refri',c:'Bebidas',ic:'🥤',info:'Com gás',a:'Beber'},{id:'suco',n:'Suco',c:'Bebidas',ic:'JUICE',info:'Laranja natural',a:'Beber'},
{id:'leite',n:'Leite Unicórnio',c:'Bebidas',ic:'🥛',info:'Brilho arco-íris',a:'Beber',mg:1},{id:'pocao_cura',n:'Poção da Cura',c:'Bebidas',ic:'POT_RED',info:'Sabor cereja',a:'Beber',mg:1},
{id:'elixir_lunar',n:'Elixir Lunar',c:'Bebidas',ic:'POT_BLUE',info:'Gelado',a:'Beber',mg:1},{id:'pocao_floresta',n:'Poção Verde',c:'Bebidas',ic:'POT_GREEN',info:'Hortelã',a:'Beber',mg:1},
{id:'nectar_estelar',n:'Néctar Estelar',c:'Bebidas',ic:'POT_PURPLE',info:'Cintilante',a:'Beber',mg:1},{id:'cha_fada',n:'Chá de Fada',c:'Bebidas',ic:'🍵',info:'Flores e mel',a:'Beber',mg:1},
{id:'pocao_solar',n:'Poção Solar',c:'Bebidas',ic:'POT_GOLD',info:'Quente como o sol',a:'Beber',mg:1},{id:'pocao_nebulosa',n:'Poção Nebulosa',c:'Bebidas',ic:'POT_PINK',info:'Rosa e roxa',a:'Beber',mg:1},
{id:'pocao_cometa',n:'Poção Cometa',c:'Bebidas',ic:'POT_CYAN',info:'Gelada e veloz',a:'Beber',mg:1},
{id:'lanche',n:'Lanche',c:'Comidas',ic:'🍔',info:'Carne e queijo',a:'Comer',food:1},{id:'prato',n:'Macarrão',c:'Comidas',ic:'🍝',info:'Quentinho',a:'Comer',food:1},
{id:'cupcake',n:'Cupcake',c:'Comidas',ic:'🧁',info:'Arco-íris',a:'Comer',food:1,mg:1},{id:'pizza',n:'Pizza',c:'Comidas',ic:'🍕',info:'Nunca esfria',a:'Comer',food:1,mg:1},
{id:'maca',n:'Maçã Dourada',c:'Comidas',ic:'🍎',info:'Brilha',a:'Comer',food:1,mg:1},{id:'biscoito',n:'Biscoito',c:'Comidas',ic:'🍪',info:'Estrelinhas',a:'Comer',food:1,mg:1},
{id:'sorvete',n:'Sorvete',c:'Comidas',ic:'🍨',info:'Não derrete',a:'Comer',food:1,mg:1},{id:'marshmallow',n:'Marshmallow',c:'Comidas',ic:'🍡',info:'Na fogueira',a:'Comer',food:1},
{id:'bolo_planeta',n:'Bolo Planeta',c:'Comidas',ic:'CAKE_PLANET',info:'Anel de açúcar',a:'Comer',food:1,mg:1},{id:'bala_estelar',n:'Bala Estelar',c:'Comidas',ic:'STAR_CANDY',info:'Faísca na boca',a:'Comer',food:1,mg:1},
{id:'rosquinha',n:'Rosquinha',c:'Comidas',ic:'🍩',info:'Anel de Saturno',a:'Comer',food:1},{id:'queijo_lunar',n:'Queijo Lunar',c:'Comidas',ic:'🧀',info:'Direto da Lua',a:'Comer',food:1,mg:1},
{id:'pirulito',n:'Pirulito',c:'Comidas',ic:'🍭',info:'Espiral galáctica',a:'Comer',food:1}];
// gestos: dur em segundos (Infinity repete até parar e vira loop=1); sfx = som próprio ao começar (gesto com som tem limite contra
// spam no cliente e no servidor); puff=1 solta uma nuvem atrás; emo = emoji que aparece sobre a cabeça ao começar.
// O comportamento sai destes campos, nunca do id: renomear um id (ex.: dance20 → orbita) não muda como o gesto funciona.
const GESTS=[{id:'arms',ic:'🙌',n:'Braços',dur:3},{id:'scream',ic:'😱',n:'Gritar',dur:1.8,sfx:'scream'},{id:'fart',ic:'💨',n:'Pum',dur:1.4,sfx:'fart',puff:1},{id:'dance1',ic:'💃',n:'Balanço',dur:Infinity},{id:'dance2',ic:'🕺',n:'Giro',dur:Infinity},{id:'dance3',ic:'🪩',n:'Disco',dur:Infinity},
 {id:'dance4',ic:'🤖',n:'Robô',dur:Infinity},{id:'dance5',ic:'🥁',n:'Samba',dur:Infinity},{id:'dance6',ic:'🎧',n:'Funk',dur:Infinity},{id:'dance7',ic:'🦷',n:'Floss',dur:Infinity},
 {id:'dance8',ic:'💦',n:'Irrigador',dur:Infinity},{id:'dance9',ic:'🤘',n:'Rock',dur:Infinity},{id:'dance10',ic:'👯',n:'Cancã',dur:Infinity},{id:'dance11',ic:'🧟',n:'Zumbi',dur:Infinity},
 {id:'dance12',ic:'🌺',n:'Hula',dur:Infinity},{id:'dance13',ic:'🩰',n:'Pirueta',dur:Infinity},{id:'dance14',ic:'🥾',n:'Cossaco',dur:Infinity},{id:'dance15',ic:'🐔',n:'Frango',dur:Infinity},
 {id:'dance16',ic:'🌀',n:'Twist',dur:Infinity},{id:'dance17',ic:'🌙',n:'Moonwalk',dur:Infinity},{id:'dance18',ic:'🎶',n:'Forró',dur:Infinity},{id:'dance19',ic:'🐇',n:'Pulinhos',dur:Infinity},
 // gestos do tema: viagem espacial e magia (os 'dance' repetem até parar; os outros têm duração)
 {id:'rocket',ic:'🚀',n:'Foguete',dur:2.4,emo:'🚀'},{id:'spell',ic:'🪄',n:'Feitiço',dur:2.6,emo:'✨'},{id:'alien',ic:'🖖',n:'Alien',dur:2.2},{id:'scope',ic:'🔭',n:'Luneta',dur:3},{id:'star',ic:'⭐',n:'Estrela',dur:1.6},
 {id:'dance20',ic:'🪐',n:'Órbita',dur:Infinity},{id:'dance21',ic:'🛸',n:'Gravidade zero',dur:Infinity},{id:'dance22',ic:'☄️',n:'Meteoro',dur:Infinity}];
// cada cor (pele, olhos, cabelo, chapéu, roupa) tem par normal/brilhante: a chave de brilho de cada parte (0 ou 1)
const BRK={skin:'tb',eye:'eb',hair:'rb',hc:'hb',shirt:'sb',pc:'pb',sc:'cb'};
// loop=1: repete até parar, usa o som de dança e não roda sentado (quem está sentado se levanta)
GESTS.forEach(g=>{g.loop=g.dur===Infinity?1:0});
// limites de texto e de bots compartilhados pelo cliente e pelo servidor
const LIMITS={name:16,bots:20};
// faixa de cada campo do visual (o servidor recusa índice fora dela): sai do tamanho das listas acima
const CR={skin:SKIN.length,eye:EYE.length,shirt:PAL.length,hair:HAIRC.length,hc:PAL.length,hs:HS.length,hat:HATS.length,bt:BT.length,pc:PAL.length,sc:PAL.length,shoes:SHOES.length,fc:FACES.length,
 br:2,tb:2,eb:2,rb:2,sb:2,pb:2,cb:2,hb:2};
// busca por id: GEST.rocket, ITEM.pizza
const GEST=Object.fromEntries(GESTS.map(g=>[g.id,g])),ITEM=Object.fromEntries(ITEMS.map(i=>[i.id,i]));
// Modo Sobrevivência (cooperativo, sem PvP): só números e listas, para balancear sem mexer em código. Tempos em segundos.
// Nada aqui vai pela rede: o servidor lê estes valores e o cliente só mostra o resultado. Os ids de recursos e pratos são
// próprios do modo (não são itens da Mochila normal). Os testes em tests/survival-catalog.test.js conferem a consistência.
const SURV={
 // área andável circular (o jogo normal continua em 10,2 m); precisa parar antes das montanhas
 walk:{x:0,z:1.2,r:28},
 // zonas por distância à fogueira: perto é seguro, longe tem mais recursos e mais frio
 zones:{perto:[0,10],meio:[10,20],longe:[20,28]},
 // um dia = DAY de luz + NIGHT de noite; a rodada dura `nights` ciclos completos
 time:{day:150,night:90},
 // ref: o desgaste foi calibrado para grupos de até `ref` jogadores; acima disso os recursos voltam mais rápido (ref/jogadores) para a comida e a água darem para todos
 run:{nights:[3,5],def:4,minPlayers:2,minSec:180,ref:3},
 // medidores: drain = perda por segundo de dia; a noite multiplica (nightX); calor perto da fogueira sobe em vez de cair
 meters:{
  calor:{ic:'🔥',n:'Calor',max:100,start:100,drain:.25,nightX:4,nearFire:1.2},
  fome:{ic:'🍖',n:'Fome',max:100,start:100,drain:.35,nightX:1.2},
  sede:{ic:'💧',n:'Sede',max:100,start:100,drain:.5,nightX:1.2}},
 // fogueira: gasta combustível (mais à noite); aquece quem está a até `heat` metros
 fire:{x:0,z:1.2,max:100,start:60,burn:.6,nightX:2,heat:6,relight:{graveto:3},relightFuel:20},
 // desmaio ao zerar um medidor; colega perto segura a ação por `hold` segundos e o jogador volta com `back` em cada medidor
 revive:{radius:2.2,hold:3,back:30},
 sick:{dur:20,drainX:1.5},
 // recursos de coleta: spots = quantos pontos por zona (sorteados pela semente); give = quanto cada coleta rende
 res:{
  lenha:{ic:'🪵',n:'Lenha',kind:'fuel',fuel:25,give:1,respawn:150,spots:{perto:3,meio:8,longe:3}},
  graveto:{ic:'🌿',n:'Gravetos',kind:'fuel',fuel:8,give:2,respawn:60,spots:{meio:8,longe:2}},
  fruta:{ic:'🍎',n:'Fruta',kind:'food',fome:10,give:1,respawn:120,spots:{meio:6,longe:2}},
  raiz:{ic:'🥔',n:'Raiz',kind:'food',fome:8,give:1,respawn:120,spots:{meio:6,longe:2}},
  cogumelo:{ic:'🍄',n:'Cogumelo',kind:'food',fome:6,sick:.5,give:1,respawn:150,spots:{meio:3,longe:3}},
  agua:{ic:'💧',n:'Água',kind:'drink',sede:35,give:1,respawn:90,spots:{longe:4}}},
 coleta:{radius:1.8},
 // culinária: cozinha na fogueira (a até `radius` metros); passar de `burn` segundos depois de pronto queima (enjoo)
 cook:{radius:3,burn:20,groupX:1.2,groupRadius:5},
 recipes:[
  {id:'fruta_assada',ic:'🍎',n:'Fruta assada',onde:'fogueira',ins:['fruta'],time:6,fome:22},
  {id:'raiz_assada',ic:'🥔',n:'Raiz assada',onde:'fogueira',ins:['raiz'],time:8,fome:30},
  {id:'cogumelo_assado',ic:'🍄',n:'Cogumelo assado',onde:'fogueira',ins:['cogumelo'],time:6,fome:20},
  {id:'cha_fruta',ic:'🍵',n:'Chá de fruta',onde:'fogueira',ins:['fruta','agua'],time:8,sede:30,calor:25},
  {id:'sopa',ic:'🍲',n:'Sopa rústica',onde:'fogueira',ins:['raiz','cogumelo','agua'],time:12,fome:45,sede:15}]};
const CAT={vivid,PAL,SKIN,EYE,HAIRC,HS,HATS,SHOES,BT,FACES,EMO,ST,ST_LEGACY,ITEMS,GESTS,GEST,ITEM,BRK,LIMITS,CR,SURV};
if(typeof module==='object'&&module.exports)module.exports=CAT;else root.SKYCAT=CAT;
})(typeof globalThis!=='undefined'?globalThis:this);
