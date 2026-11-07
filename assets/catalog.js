/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Catálogo do jogo: a única fonte dos nomes, itens, gestos, emojis, cores, estilos do avatar, mundos, mundos e limites.
 * O navegador carrega este arquivo antes dos outros (vira o objeto global SKYCAT) e o servidor faz require dele
 * (validate.js deriva daqui o que aceita). Mudou aqui, mudou nos dois lados.
 *
 * Como mudar sem quebrar (os testes em tests/catalog.test.js conferem):
 * - Nome que aparece na tela (n, info, nomes de estilos e de mundos): pode trocar à vontade.
 * - id (itens, gestos, mundos): é o que vai pela rede. Para trocar o id de um mundo, ponha o antigo em ST_LEGACY.
 * - Listas por posição (EMO, paletas PAL/SKIN/EYE/HAIRC, HS, HATS, SHOES, BT, FACES, NCOL, NFX): o número da posição é o que vai
 *   pela rede e fica salvo no navegador dos jogadores. Só acrescente no fim; trocar a ordem ou remover muda o visual
 *   de quem já tinha escolhido.
 * - Item novo com ícone desenhado: a chave em `ic` precisa existir em ICONS (assets/app-base.js); emoji serve direto.
 * - Gesto novo: precisa da animação com o mesmo id em DANCES (assets/app-ui.js).
 */
(function(/** @type {any} */ root){'use strict';
// cores vivas, no estilo cel-shading: aumenta a saturação (HSL) das paletas do avatar
const vivid=(h,k,lk)=>{let r=parseInt(h.slice(1,3),16)/255,g=parseInt(h.slice(3,5),16)/255,b=parseInt(h.slice(5,7),16)/255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let l=(mx+mn)/2;let H=0,S=0;if(d){S=d/(1-Math.abs(2*l-1));H=mx===r?((g-b)/d+(g<b?6:0)):mx===g?(b-r)/d+2:(r-g)/d+4;H/=6}
 S=Math.min(1,S*k);if(lk)l=Math.min(.72,Math.max(.42,l*lk));const f=n=>{const a=S*Math.min(l,1-l),kk=(n+H*12)%12,c=l-a*Math.max(-1,Math.min(kk-3,9-kk,1));return Math.round(c*255).toString(16).padStart(2,'0')};return'#'+f(0)+f(8)+f(4)};
const PAL=['#d9453b','#ef8a2c','#f4c936','#3aa860','#1f9d8e','#3d86d6','#8d5bd0','#e9579b','#f1ece1','#8a96a0','#34507a','#8a5a44','#3b3647','#9b2f3f','#f7a8c8','#7fd6dc','#a5d44c','#5a52d8','#fbf6ea','#d9a62b'].map(h=>vivid(h,1.6)).concat(['#6e0a1c','#0a2470','#06683a','#3f1670','#065e66','#703806','#6e0a52','#701a06','#6b5206','#3a5a06','#0a0a10','#2b2e38','#ffffff','#cfd5e0','#ffc933','#14205a','#0f5a32','#6a1030','#ff7a6a','#8ff5c8']);// 20 originais + 10 cores brilhantes (rubi, safira, esmeralda...) + 10 novas (preto brilhante, grafite, branco, prata, dourado...)
const SKIN=['#f1c9a5','#d9a273','#a8693f','#6b4128'].map(h=>vivid(h,1.3)).concat(['#f7dcc4','#8c5a3c','#4aa3e8','#f58ac6','#9b6bdc','#c9a7f0','#5cc47a','#3cc7c0','#f2d34a','#e0524a','#e8ecf4','#ff9b4a']),EYE=['#5a3418','#1e7be0','#18a85a','#8a5cf0','#c98a1e','#7d8a96','#2a1e22','#8a6a2a','#7fd0f0','#16b8b0','#d6283a','#f06aa8','#f2c230','#f07a1e','#c79cf2','#8fd62a'],HAIRC=['#2f2622','#6e4429','#d6a13c','#b8372c','#b9bfca','#8b5cd6','#3b82d6','#2fa86a','#e8742a','#f1d24a','#62cfe6','#ee6fa8'].map(h=>vivid(h,1.6)).concat(['#6e0a1c','#0a2470','#06683a','#3f1670','#065e66','#703806','#6e0a52','#701a06','#6b5206','#3a5a06','#0a0a10','#0f1530','#f4f4f8','#c7ccd6','#e8a39a','#5a0a14','#0fbfa8','#7a2cff','#9ff0d0','#4a2a1c']);// 12 originais + 10 cores brilhantes (rubi, safira, esmeralda...) + 10 novos (preto brilhante, preto azulado, platinado, prata...)
// Cores brilhantes: cada cor de cada paleta tem uma par, no mesmo índice, que o avatar usa (com o material de látex) quando o brilho da parte está ligado.
// A par mantém o tom e fica mais saturada; claras demais escurecem um pouco, escuras clareiam, e sempre fica visivelmente diferente da original.
// Quase sem cor: preto vira preto lustroso, branco vira pérola, cinza vira prata. Na pele a mudança é mais leve, para continuar parecendo pele.
const glossy=(h,skin)=>{let r=parseInt(h.slice(1,3),16)/255,g=parseInt(h.slice(3,5),16)/255,b=parseInt(h.slice(5,7),16)/255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,l=(mx+mn)/2;let H=0,S=0,L,min=.16;
 if(d){S=d/(1-Math.abs(2*l-1));H=(mx===r?((g-b)/d+(g<b?6:0)):mx===g?(b-r)/d+2:(r-g)/d+4)/6}
 const hex=L=>{const f=n=>{const a=S*Math.min(L,1-L),kk=(n+H*12)%12,c=L-a*Math.max(-1,Math.min(kk-3,9-kk,1));return Math.round(Math.max(0,Math.min(1,c))*255).toString(16).padStart(2,'0')};return'#'+f(0)+f(8)+f(4)};
 const far=o=>Math.hypot(...[1,3,5].map(i=>(parseInt(o.slice(i,i+2),16)-parseInt(h.slice(i,i+2),16))/255))>=min;
 if(skin){S=Math.min(1,S*1.15+.08);L=l-.03;min=.1}
 else if(S<.32){if(S<.08)H=.62;min=.1;if(l<.2){S=Math.min(.6,S+.3);L=l+.07}else if(l>.88){S=.55;L=.93}else{S=Math.min(.3,S*.8+.06);L=Math.min(.86,l+.12)}}
 else if(l>.85){S=Math.min(1,S*1.3+.2);L=.84}
 else{S=Math.min(1,S*1.3+.15);L=l>.62?.56:l<.3?l+.08:l-.03}
 let o=hex(L);for(let i=0;i<8&&!far(o);i++){L+=l<.3?.04:-.04;o=hex(L)}return o};
const GLOSS={PAL:PAL.map(h=>glossy(h)),SKIN:SKIN.map(h=>glossy(h,1)),EYE:EYE.map(h=>glossy(h)),HAIRC:HAIRC.map(h=>glossy(h))};
const HS=['Afro','Cacheado','Coque','Moicano','Maria-chiquinha','Nuvem','Espetado','Topete','Curto','Rabo de cavalo','Duplo coque','Bob de bolinhas','Franjinha','Coroa','Pompom','Chiquinhas longas','Cachos longos','Moicano alto','Rabo lateral','Dois pompons','Confete','Colmeia','Orelhinhas','Trancinhas','Flat top','Raspado','Risco lateral','Longo liso','Repicado','Social curto','Tranças longas','Pompadour','Mullet','Coque samurai'],HATS=['Sem chapéu','Gorro','Bucket','Cowboy'],SHOES=['Tênis','Bota','Sandália'],BT=['Comprida','Curta'];
const FACES=['Sorriso aberto','Sorriso suave','Olhos felizes','Piscadinha','Surpreso','Língua de fora','Sorrisão','Bochechas','Sério','Bravo','Triste','Dorminhoco','Óculos'];
// nome personalizado (aba ✨ Nome do editor): cor da paleta e efeito. A cor 0 é a do tema (o nome como sempre foi). Cada cor tem contraste
// de pelo menos 5:1 nos dois temas: no escuro aparece como está; no claro, 50 % misturada ao preto (app.css, --nk). Ordem por posição.
const NCOL=['#f5ede0','#ff6b7a','#ff9a4a','#ffd04a','#a8e85a','#4ade8a','#3ad8c8','#5ac8ff','#7aa0ff','#b48cff','#ff8ad0','#f070f0','#d0d8e4'];
const NFX=['Nenhum','Brilho','Neon','Degradê','Aurora','Arco-íris','Cintilar','Relevo','Cometa'];
// os 10 últimos são do tema do jogo (planetas, viagem espacial e magia); a ordem é o índice enviado ao servidor, então só acrescente no fim
const EMO=['😀','😂','😍','😎','🥳','😭','😡','😱','🤔','👍','👏','🙌','❤️','🔥','🎉','✨','🎤','💃','🤢','😴','🪐','🚀','🌙','🌟','☄️','👽','🛸','🌌','🔭','🪄'];
// mundos: id → nome na tela. Seis planetas, cada um inspirado num bioma brasileiro (Amazônia, Cerrado, Mata Atlântica, Caatinga,
// Pantanal e Pampa). A ordem é a da seleção de cenário; a id é o nome em minúsculas e sem acento.
const ST={amazora:{n:'Amazora'},cerron:{n:'Cerron'},atlanthia:{n:'Atlanthia'},caatara:{n:'Caatara'},panthara:{n:'Panthara'},pamphora:{n:'Pamphora'}};
// ids antigas dos mundos (os 16 planetas anteriores e os nomes mais antigos deles): clientes, links, salas e perfis antigos ainda podem
// mandá-las; cada uma vira o bioma mais parecido com o mundo de antes
const ST_LEGACY={proxima:'cerron',kepler:'caatara',gliese:'pamphora',osiris:'caatara',tauri:'amazora',esmera:'atlanthia',ambar:'cerron',nyx:'atlanthia',
 lumen:'atlanthia',duna:'caatara',mira:'amazora',sakura:'pamphora',nivis:'pamphora',cinder:'caatara',trappist:'panthara',draugr:'atlanthia',
 aeris:'cerron',brontis:'caatara',cryon:'pamphora',pyra:'caatara',sylvaris:'amazora',verdara:'atlanthia',ambara:'cerron',nyxara:'atlanthia',
 lumeris:'atlanthia',dunara:'caatara',mycelis:'amazora',rosara:'pamphora',nivara:'pamphora',cindara:'caatara',marinis:'panthara',umbris:'atlanthia'};
// mochila: food=1 some da mão depois de comer; mg=1 solta ✨ ao usar; ic é um emoji ou uma chave de ICONS
/** @type {{id:string,n:string,c:string,ic:string,info:string,a:string,food?:number,mg?:number,rc?:number}[]} */
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
// ---------- culinária ----------
// Ingredientes (infinitos, não ocupam a mochila): p = preparo exigido antes de ir ao fogo, 'l' = lavar e 'd' = descascar.
// Para acrescentar: ingrediente novo vai no fim da lista do seu grupo; receita nova precisa de uma combinação (conjunto + método) ainda não usada.
const ING=[
 {id:'tomate',n:'Tomate',c:'Hortaliças',ic:'🍅',p:'l'},{id:'cenoura',n:'Cenoura',c:'Hortaliças',ic:'🥕',p:'ld'},{id:'batata',n:'Batata',c:'Hortaliças',ic:'🥔',p:'ld'},
 {id:'cebola',n:'Cebola',c:'Hortaliças',ic:'🧅',p:'d'},{id:'alho',n:'Alho',c:'Hortaliças',ic:'🧄',p:'d'},{id:'milho',n:'Milho',c:'Hortaliças',ic:'🌽',p:'d'},
 {id:'abobora',n:'Abóbora',c:'Hortaliças',ic:'🎃',p:'ld'},{id:'cogumelo',n:'Cogumelo',c:'Hortaliças',ic:'🍄',p:'l'},{id:'brocolis',n:'Brócolis',c:'Hortaliças',ic:'🥦',p:'l'},
 {id:'berinjela',n:'Berinjela',c:'Hortaliças',ic:'🍆',p:'l'},{id:'batata_doce',n:'Batata-doce',c:'Hortaliças',ic:'🍠',p:'ld'},
 {id:'banana',n:'Banana',c:'Frutas',ic:'🍌',p:'d'},{id:'morango',n:'Morango',c:'Frutas',ic:'🍓',p:'l'},{id:'abacaxi',n:'Abacaxi',c:'Frutas',ic:'🍍',p:'ld'},
 {id:'uva',n:'Uva',c:'Frutas',ic:'🍇',p:'l'},{id:'limao',n:'Limão',c:'Frutas',ic:'🍋',p:'l'},{id:'coco',n:'Coco',c:'Frutas',ic:'🥥',p:'d'},
 {id:'pera',n:'Pera',c:'Frutas',ic:'🍐',p:'l'},{id:'maca_verde',n:'Maçã verde',c:'Frutas',ic:'🍏',p:'l'},
 {id:'ovo',n:'Ovo',c:'Proteínas',ic:'🥚',p:''},{id:'frango',n:'Frango',c:'Proteínas',ic:'🍗',p:''},{id:'carne',n:'Carne',c:'Proteínas',ic:'🥩',p:''},
 {id:'peixe',n:'Peixe',c:'Proteínas',ic:'🐟',p:'l'},{id:'camarao',n:'Camarão',c:'Proteínas',ic:'🦐',p:'d'},{id:'bacon',n:'Bacon',c:'Proteínas',ic:'🥓',p:''},
 {id:'linguica',n:'Linguiça',c:'Proteínas',ic:'🌭',p:''},
 {id:'arroz',n:'Arroz',c:'Grãos e massas',ic:'🍚',p:'l'},{id:'farinha',n:'Farinha',c:'Grãos e massas',ic:'🌾',p:''},{id:'massa',n:'Macarrão cru',c:'Grãos e massas',ic:'🍝',p:''},
 {id:'pao',n:'Pão',c:'Grãos e massas',ic:'🍞',p:''},{id:'amendoim',n:'Amendoim',c:'Grãos e massas',ic:'🥜',p:''},
 {id:'leite',n:'Leite',c:'Laticínios',ic:'🥛',p:''},{id:'queijo',n:'Queijo',c:'Laticínios',ic:'🧀',p:''},{id:'manteiga',n:'Manteiga',c:'Laticínios',ic:'🧈',p:''},
 {id:'mel',n:'Mel',c:'Doces',ic:'🍯',p:''},{id:'chocolate',n:'Chocolate',c:'Doces',ic:'🍫',p:''},{id:'acucar',n:'Açúcar',c:'Doces',ic:'🍬',p:''},
 {id:'sal',n:'Sal',c:'Temperos',ic:'🧂',p:''},{id:'pimenta',n:'Pimenta',c:'Temperos',ic:'🌶️',p:'l'},{id:'manjericao',n:'Manjericão',c:'Temperos',ic:'🌿',p:'l'},
 {id:'salsa',n:'Salsa',c:'Temperos',ic:'🌱',p:'l'},{id:'hortela',n:'Hortelã',c:'Temperos',ic:'🍃',p:'l'},{id:'canela',n:'Canela',c:'Temperos',ic:'🍂',p:''},
 // dos biomas (acrescentados depois: entram no fim)
 {id:'feijao',n:'Feijão',c:'Grãos e massas',ic:'🫘',p:'l'},{id:'couve',n:'Couve',c:'Hortaliças',ic:'🥬',p:'l'},{id:'pimentao',n:'Pimentão',c:'Hortaliças',ic:'🫑',p:'l'},
 {id:'abacate',n:'Abacate',c:'Frutas',ic:'🥑',p:'d'},{id:'manga',n:'Manga',c:'Frutas',ic:'🥭',p:'ld'},{id:'acai',n:'Açaí',c:'Frutas',ic:'🫐',p:'l'},
 {id:'castanha',n:'Castanha-do-pará',c:'Grãos e massas',ic:'🌰',p:'d'}];
// métodos: as duas formas de usar a fogueira
const COOK_METHODS={cozinhar:{n:'Cozinhar',info:'Na panela, sobre as brasas'},assar:{n:'Assar',info:'No espeto e nas brasas'}};
// receitas: g = de 2 a 6 ingredientes diferentes (a ordem não importa); o alimento que sai tem o mesmo id da receita e fica
// bloqueado na mochila (rc=1) até o jogador preparar a receita pela primeira vez. b=1: receita dos biomas (as clássicas não têm b)
const RECIPES=[
 {id:'sopa_legumes',n:'Sopa de Legumes',m:'cozinhar',g:['cenoura','batata','cebola','sal'],ic:'🍲',info:'Quentinha e simples'},
 {id:'caldo_frango',n:'Caldo de Frango',m:'cozinhar',g:['frango','cenoura','cebola','salsa','sal'],ic:'🍜',info:'Para dias frios'},
 {id:'arroz_alho',n:'Arroz Soltinho',m:'cozinhar',g:['arroz','alho','sal'],ic:'🍚',info:'Grão por grão'},
 {id:'arroz_carreteiro',n:'Carreteiro',m:'cozinhar',g:['arroz','carne','cebola','alho','pimenta','salsa'],ic:'🥘',info:'Panela cheia'},
 {id:'risoto_cogumelo',n:'Risoto Cogumelo',m:'cozinhar',g:['arroz','cogumelo','cebola','queijo','manteiga'],ic:'🍛',info:'Cremoso e quentinho'},
 {id:'macarrao_alho',n:'Macarrão ao Alho',m:'cozinhar',g:['massa','alho','manteiga','salsa'],ic:'🍝',info:'Alho dourado'},
 {id:'macarrao_sugo',n:'Macarrão ao Sugo',m:'cozinhar',g:['massa','tomate','cebola','manjericao'],ic:'🍝',info:'Molho fresco'},
 {id:'ovos_mexidos',n:'Ovos Mexidos',m:'cozinhar',g:['ovo','manteiga','sal'],ic:'🍳',info:'Macios'},
 {id:'omelete_queijo',n:'Omelete Queijo',m:'cozinhar',g:['ovo','queijo','cebola','salsa'],ic:'🍳',info:'Dobradinha'},
 {id:'pure_batata',n:'Purê de Batata',m:'cozinhar',g:['batata','leite','manteiga','sal'],ic:'🥔',info:'Sem um grumo'},
 {id:'mingau_milho',n:'Mingau de Milho',m:'cozinhar',g:['milho','leite','acucar'],ic:'🌽',info:'Doce e morninho'},
 {id:'arroz_doce',n:'Arroz-doce',m:'cozinhar',g:['arroz','leite','acucar','canela'],ic:'🍮',info:'Com canela por cima'},
 {id:'brigadeiro',n:'Brigadeiro',m:'cozinhar',g:['chocolate','leite','manteiga','acucar'],ic:'🍫',info:'De colher'},
 {id:'geleia_morango',n:'Geleia Morango',m:'cozinhar',g:['morango','acucar','limao'],ic:'🍓',info:'Brilhante'},
 {id:'compota_pera',n:'Compota de Pera',m:'cozinhar',g:['pera','acucar','canela','limao'],ic:'🍐',info:'Calda perfumada'},
 {id:'moqueca',n:'Moqueca Espacial',m:'cozinhar',g:['peixe','tomate','cebola','coco','pimenta','salsa'],ic:'🍲',info:'Com leite de coco'},
 {id:'camarao_alho',n:'Camarão ao Alho',m:'cozinhar',g:['camarao','alho','manteiga','limao'],ic:'🦐',info:'Rapidinho'},
 {id:'strogonoff',n:'Strogonoff',m:'cozinhar',g:['frango','cogumelo','cebola','tomate','queijo'],ic:'🍛',info:'Cozinha da colônia'},
 {id:'chocolate_quente',n:'Chocolate Quente',m:'cozinhar',g:['chocolate','leite','canela'],ic:'☕',info:'Aquece a alma'},
 {id:'cha_hortela',n:'Chá de Hortelã',m:'cozinhar',g:['hortela','mel','limao'],ic:'🍵',info:'Fresquinho'},
 {id:'ratatouille',n:'Ratatouille',m:'cozinhar',g:['berinjela','tomate','abobora','cebola','alho','manjericao'],ic:'🥘',info:'Tudo da horta'},
 {id:'curry_legumes',n:'Curry de Legumes',m:'cozinhar',g:['batata_doce','cenoura','brocolis','coco','pimenta'],ic:'🍛',info:'Picante e doce'},
 {id:'canja',n:'Canja de Galinha',m:'cozinhar',g:['frango','arroz','cenoura','salsa'],ic:'🥣',info:'Remédio de colônia'},
 {id:'batata_assada',n:'Batata Assada',m:'assar',g:['batata','manteiga','sal'],ic:'🥔',info:'Direto nas brasas'},
 {id:'milho_brasa',n:'Milho na Brasa',m:'assar',g:['milho','manteiga','sal'],ic:'🌽',info:'Chamuscado'},
 {id:'espetinho_carne',n:'Espetinho',m:'assar',g:['carne','cebola','pimenta','sal'],ic:'🍢',info:'No palito'},
 {id:'linguica_brasa',n:'Linguiça Brasa',m:'assar',g:['linguica','pao','pimenta'],ic:'🌭',info:'Com pão'},
 {id:'frango_assado',n:'Frango Assado',m:'assar',g:['frango','alho','limao','sal','salsa'],ic:'🍗',info:'Dourado'},
 {id:'peixe_brasa',n:'Peixe na Brasa',m:'assar',g:['peixe','limao','sal','manjericao'],ic:'🐟',info:'Pescado do dia'},
 {id:'pao_alho',n:'Pão de Alho',m:'assar',g:['pao','alho','manteiga','queijo','salsa'],ic:'🥖',info:'Crocante'},
 {id:'pao_queijo',n:'Pão de Queijo',m:'assar',g:['farinha','queijo','ovo','leite','manteiga'],ic:'🧀',info:'Quentinho'},
 {id:'banana_assada',n:'Banana Assada',m:'assar',g:['banana','canela','acucar'],ic:'🍌',info:'Caramelizada'},
 {id:'abacaxi_brasa',n:'Abacaxi Brasa',m:'assar',g:['abacaxi','canela','mel'],ic:'🍍',info:'Doce e defumado'},
 {id:'maca_assada',n:'Maçã Assada',m:'assar',g:['maca_verde','canela','mel','amendoim'],ic:'🍏',info:'Recheada'},
 {id:'cogumelo_recheado',n:'Cogumelo Assado',m:'assar',g:['cogumelo','queijo','alho','manjericao'],ic:'🍄',info:'Gratinado'},
 {id:'abobora_assada',n:'Abóbora Assada',m:'assar',g:['abobora','mel','canela','sal'],ic:'🎃',info:'Macia por dentro'},
 {id:'batata_doce_assada',n:'Batata-doce',m:'assar',g:['batata_doce','manteiga','canela'],ic:'🍠',info:'Açucarada'},
 {id:'sanduiche_bacon',n:'Sanduíche Bacon',m:'assar',g:['pao','bacon','ovo','queijo'],ic:'🥓',info:'Na chapa'},
 {id:'pizza_fogueira',n:'Pizza Fogueira',m:'assar',g:['farinha','tomate','queijo','manjericao','cebola','linguica'],ic:'🍕',info:'Borda queimadinha'},
 {id:'biscoito_mel',n:'Biscoito de Mel',m:'assar',g:['farinha','mel','manteiga','ovo','canela'],ic:'🍪',info:'Crocante'},
 {id:'bolo_chocolate',n:'Bolo Chocolate',m:'assar',g:['farinha','chocolate','ovo','leite','acucar','manteiga'],ic:'🎂',info:'Fofinho'},
 {id:'espeto_frutas',n:'Espeto de Frutas',m:'assar',g:['morango','uva','banana','abacaxi','mel'],ic:'🍡',info:'Doce no palito'},
 {id:'tomate_recheado',n:'Tomate Recheado',m:'assar',g:['tomate','arroz','queijo','manjericao'],ic:'🍅',info:'Com queijo derretido'},
 {id:'berinjela_grelhada',n:'Berinjela Assada',m:'assar',g:['berinjela','alho','salsa','sal'],ic:'🍆',info:'Defumada'},
 {id:'camarao_brasa',n:'Camarão na Brasa',m:'assar',g:['camarao','limao','pimenta','manteiga'],ic:'🍤',info:'Espetado'},
 {id:'bolo_cenoura',n:'Bolo de Cenoura',m:'assar',g:['cenoura','farinha','ovo','acucar','manteiga'],ic:'🍰',info:'Sem cobertura'},
 // receitas dos biomas (acrescentadas no fim: o id é o do alimento e a chave do progresso salvo)
 {id:'feijoada',n:'Feijoada',m:'cozinhar',g:['feijao','linguica','bacon','carne','cebola','alho'],ic:'🍲',b:1,info:'Domingo na colônia'},
 {id:'feijao_tropeiro',n:'Feijão Tropeiro',m:'cozinhar',g:['feijao','bacon','ovo','farinha','couve'],ic:'🥘',b:1,info:'Do Cerrado'},
 {id:'caldo_feijao',n:'Caldo de Feijão',m:'cozinhar',g:['feijao','alho','cebola','sal'],ic:'🥣',b:1,info:'Grosso e quentinho'},
 {id:'creme_acai',n:'Creme de Açaí',m:'cozinhar',g:['acai','banana','mel'],ic:'🍧',b:1,info:'Da Amazônia'},
 {id:'doce_manga',n:'Doce de Manga',m:'cozinhar',g:['manga','acucar','limao'],ic:'🥭',b:1,info:'Calda dourada'},
 {id:'couve_refogada',n:'Couve Refogada',m:'cozinhar',g:['couve','alho','sal'],ic:'🥬',b:1,info:'Verdinha'},
 {id:'galinhada',n:'Galinhada',m:'cozinhar',g:['frango','arroz','milho','pimentao','salsa'],ic:'🍛',b:1,info:'Prato do Cerrado'},
 {id:'pacoca',n:'Paçoca',m:'cozinhar',g:['amendoim','acucar','farinha'],ic:'🥜',b:1,info:'Doce de festa'},
 {id:'peixe_pantaneiro',n:'Peixe Pantaneiro',m:'assar',g:['peixe','limao','pimentao','cebola','sal'],ic:'🐟',b:1,info:'Do Pantanal'},
 {id:'costela_fogo',n:'Costela no Fogo',m:'assar',g:['carne','sal'],ic:'🍖',b:1,info:'Do Pampa, sem pressa'},
 {id:'pimentao_assado',n:'Pimentão Assado',m:'assar',g:['pimentao','carne','arroz','queijo'],ic:'🫑',b:1,info:'Recheado'},
 {id:'banana_castanha',n:'Banana Castanha',m:'assar',g:['banana','castanha','mel'],ic:'🍌',b:1,info:'Da Mata Atlântica'},
 {id:'abacate_grelhado',n:'Abacate Grelhado',m:'assar',g:['abacate','sal','limao'],ic:'🥑',b:1,info:'Diferente e bom'},
 {id:'manga_brasa',n:'Manga na Brasa',m:'assar',g:['manga','mel','pimenta'],ic:'🥭',b:1,info:'Doce e picante'},
 {id:'pao_castanha',n:'Pão de Castanha',m:'assar',g:['farinha','castanha','mel','ovo','manteiga'],ic:'🍞',b:1,info:'Da Amazônia'},
 {id:'espeto_horta',n:'Espeto da Horta',m:'assar',g:['pimentao','tomate','cebola','cogumelo'],ic:'🍢',b:1,info:'Colorido'}];
// cada receita vira um alimento da mochila (categoria Receitas), comido como os outros
for(const r of RECIPES)ITEMS.push({id:r.id,n:r.n,c:'Receitas',ic:r.ic,info:r.info,a:'Comer',food:1,mg:1,rc:1});
// a combinação é o método mais os ingredientes em ordem alfabética: serve de chave tanto no cliente quanto no servidor
const recipeKey=(m,g)=>m+':'+[...g].sort().join(',');
const RECIPE=Object.fromEntries(RECIPES.map(r=>[r.id,r])),RECIPE_KEY=Object.fromEntries(RECIPES.map(r=>[recipeKey(r.m,r.g),r])),INGR=Object.fromEntries(ING.map(i=>[i.id,i]));
const COOK_SLOTS=6;
// ---------- fazenda ----------
// Plantas da fazenda (lib/farm.js): t = segundos para crescer, lv = nível de fazendeiro que libera a semente, xp = experiência
// por colheita, y = [mínimo, máximo] colhido; g = ingrediente da Culinária que a planta dá (quando dá). Para acrescentar: entra no fim.
const CROPS=[
 {id:'tomate',n:'Tomate',c:'Hortaliças',ic:'🍅',t:120,lv:1,xp:8,y:[2,4]},{id:'cenoura',n:'Cenoura',c:'Hortaliças',ic:'🥕',t:180,lv:1,xp:10,y:[2,4]},
 {id:'salsa',n:'Salsa',c:'Temperos',ic:'🌱',t:240,lv:1,xp:12,y:[2,5]},{id:'morango',n:'Morango',c:'Frutas',ic:'🍓',t:180,lv:1,xp:10,y:[3,6]},
 {id:'margarida',n:'Margarida',c:'Flores',ic:'🌼',t:600,lv:1,xp:22,y:[1,3]},
 {id:'batata',n:'Batata',c:'Hortaliças',ic:'🥔',t:300,lv:2,xp:14,y:[3,6]},{id:'cebola',n:'Cebola',c:'Hortaliças',ic:'🧅',t:240,lv:2,xp:12,y:[2,4]},
 {id:'couve',n:'Couve',c:'Hortaliças',ic:'🥬',t:300,lv:2,xp:14,y:[2,4]},{id:'pepino',n:'Pepino',c:'Hortaliças',ic:'🥒',t:240,lv:2,xp:12,y:[2,4]},
 {id:'manjericao',n:'Manjericão',c:'Temperos',ic:'🌿',t:300,lv:2,xp:14,y:[2,5]},{id:'hortela',n:'Hortelã',c:'Temperos',ic:'🍃',t:300,lv:2,xp:14,y:[2,5]},
 {id:'tulipa',n:'Tulipa',c:'Flores',ic:'🌷',t:900,lv:2,xp:30,y:[1,3]},
 {id:'alho',n:'Alho',c:'Hortaliças',ic:'🧄',t:420,lv:3,xp:18,y:[2,5]},{id:'milho',n:'Milho',c:'Hortaliças',ic:'🌽',t:600,lv:3,xp:22,y:[2,4]},
 {id:'trigo',n:'Trigo',c:'Grãos',ic:'🌾',t:600,lv:3,xp:20,y:[3,6],g:'farinha'},{id:'girassol',n:'Girassol',c:'Flores',ic:'🌻',t:1200,lv:3,xp:40,y:[1,3]},
 {id:'brocolis',n:'Brócolis',c:'Hortaliças',ic:'🥦',t:720,lv:4,xp:26,y:[1,3]},{id:'pimentao',n:'Pimentão',c:'Hortaliças',ic:'🫑',t:600,lv:4,xp:22,y:[2,4]},
 {id:'arroz',n:'Arroz',c:'Grãos',ic:'🍚',t:900,lv:4,xp:28,y:[3,6]},{id:'feijao',n:'Feijão',c:'Grãos',ic:'🫘',t:720,lv:4,xp:26,y:[3,6]},
 {id:'cogumelo',n:'Cogumelo',c:'Hortaliças',ic:'🍄',t:900,lv:5,xp:30,y:[3,6]},{id:'berinjela',n:'Berinjela',c:'Hortaliças',ic:'🍆',t:900,lv:5,xp:30,y:[2,3]},
 {id:'pimenta',n:'Pimenta',c:'Temperos',ic:'🌶️',t:900,lv:5,xp:30,y:[3,6]},{id:'limao',n:'Limão',c:'Frutas',ic:'🍋',t:1500,lv:5,xp:45,y:[3,5]},
 {id:'amendoim',n:'Amendoim',c:'Grãos',ic:'🥜',t:1200,lv:5,xp:38,y:[3,6]},
 {id:'abobora',n:'Abóbora',c:'Hortaliças',ic:'🎃',t:1800,lv:6,xp:55,y:[1,2]},{id:'batata_doce',n:'Batata-doce',c:'Hortaliças',ic:'🍠',t:1200,lv:6,xp:40,y:[2,5]},
 {id:'uva',n:'Uva',c:'Frutas',ic:'🍇',t:1800,lv:6,xp:55,y:[3,6]},{id:'cana',n:'Cana-de-açúcar',c:'Grãos',ic:'🎋',t:1800,lv:6,xp:50,y:[2,4],g:'acucar'},
 {id:'rosa',n:'Rosa',c:'Flores',ic:'🌹',t:1800,lv:6,xp:55,y:[1,3]},{id:'alface',n:'Alface',c:'Hortaliças',ic:'🥗',t:360,lv:6,xp:16,y:[2,4]},
 {id:'melancia',n:'Melancia',c:'Frutas',ic:'🍉',t:2400,lv:7,xp:70,y:[1,2]},{id:'maca',n:'Maçã',c:'Frutas',ic:'🍎',t:2700,lv:7,xp:75,y:[2,4]},
 {id:'laranja',n:'Laranja',c:'Frutas',ic:'🍊',t:2400,lv:7,xp:70,y:[3,5]},{id:'cereja',n:'Cereja',c:'Frutas',ic:'🍒',t:2100,lv:7,xp:65,y:[4,8]},
 {id:'gengibre',n:'Gengibre',c:'Temperos',ic:'🫚',t:1500,lv:7,xp:48,y:[1,3]},
 {id:'banana',n:'Banana',c:'Frutas',ic:'🍌',t:3600,lv:8,xp:90,y:[4,8]},{id:'pera',n:'Pera',c:'Frutas',ic:'🍐',t:2700,lv:8,xp:75,y:[2,4]},
 {id:'maca_verde',n:'Maçã verde',c:'Frutas',ic:'🍏',t:2700,lv:8,xp:75,y:[2,4]},{id:'melao',n:'Melão',c:'Frutas',ic:'🍈',t:2400,lv:8,xp:70,y:[1,2]},
 {id:'hibisco',n:'Hibisco',c:'Flores',ic:'🌺',t:2400,lv:8,xp:70,y:[1,3]},
 {id:'abacaxi',n:'Abacaxi',c:'Frutas',ic:'🍍',t:3600,lv:9,xp:95,y:[1,2]},{id:'pessego',n:'Pêssego',c:'Frutas',ic:'🍑',t:3000,lv:9,xp:85,y:[2,4]},
 {id:'kiwi',n:'Kiwi',c:'Frutas',ic:'🥝',t:3000,lv:9,xp:85,y:[3,5]},{id:'jacinto',n:'Jacinto',c:'Flores',ic:'🪻',t:2700,lv:9,xp:80,y:[1,3]},
 {id:'manga',n:'Manga',c:'Frutas',ic:'🥭',t:4800,lv:10,xp:120,y:[2,4]},{id:'acai',n:'Açaí',c:'Frutas',ic:'🫐',t:3600,lv:10,xp:100,y:[4,8]},
 {id:'cerejeira',n:'Flor de cerejeira',c:'Flores',ic:'🌸',t:3600,lv:10,xp:100,y:[1,3]},
 {id:'coco',n:'Coco',c:'Frutas',ic:'🥥',t:5400,lv:11,xp:130,y:[2,4]},{id:'abacate',n:'Abacate',c:'Frutas',ic:'🥑',t:5400,lv:11,xp:130,y:[1,3]},
 {id:'cafe',n:'Café',c:'Grãos',ic:'☕',t:4200,lv:12,xp:115,y:[3,5]},{id:'canela',n:'Canela',c:'Temperos',ic:'🍂',t:4800,lv:12,xp:120,y:[1,3]},
 {id:'cacau',n:'Cacau',c:'Grãos',ic:'🍫',t:6000,lv:13,xp:150,y:[2,4],g:'chocolate'},
 {id:'castanha',n:'Castanha-do-pará',c:'Grãos',ic:'🌰',t:7200,lv:14,xp:170,y:[2,4]},
 {id:'lotus',n:'Lótus',c:'Flores',ic:'🪷',t:7200,lv:15,xp:180,y:[1,2]},
 {id:'cacto',n:'Cacto',c:'Especiais',ic:'🌵',t:10800,lv:16,xp:260,y:[1,2]},
 {id:'trevo',n:'Trevo da sorte',c:'Especiais',ic:'🍀',t:14400,lv:18,xp:320,y:[1,1]},
 {id:'arvore',n:'Árvore frondosa',c:'Especiais',ic:'🌳',t:14400,lv:20,xp:400,y:[1,1]}];
// ingrediente da Culinária que cada planta dá: o mesmo id quando existe, ou o `g` dela
for(const c of CROPS){const g=c.g||c.id;c.g=Object.prototype.hasOwnProperty.call(INGR,g)?g:''}
const CROP=Object.fromEntries(CROPS.map(c=>[c.id,c]));
// preço de venda de cada unidade colhida (moedas): sai da experiência da planta, então planta mais demorada vale mais
for(const c of CROPS)c.$=Math.max(1,Math.round(c.xp/3));
// canteiros: grade de FARM_W × FARM_H. O terreno comprado abre os canteiros na ordem FARM_ORDER: o retângulo cresce a partir do canto
// (coluna nova, depois linha nova), então todo tamanho de terreno é um retângulo 2×3, 3×3, 3×4, 4×4…
const FARM_W=8,FARM_H=8;
const FARM_ORDER=(()=>{const o=[];for(let k=0;k<FARM_W;k++){for(let r=0;r<k;r++)o.push(r*FARM_W+k);for(let c=0;c<=k;c++)o.push(k*FARM_W+c)}return o})();
// evolução da fazenda, comprada com moedas (lv = nível de fazendeiro mínimo). Terreno: canteiros abertos. Propriedade: colheita maior
// (+b na quantidade). Casa: mais experiência (+b). O primeiro de cada lista é o que todo mundo já tem
const FARM_LAND=[{n:'Canteirinho',p:6,$:0,lv:1},{n:'Horta',p:9,$:150,lv:2},{n:'Horta grande',p:12,$:400,lv:3},{n:'Roça',p:16,$:1000,lv:4},{n:'Roça grande',p:20,$:2200,lv:6},
 {n:'Lavoura',p:25,$:4500,lv:8},{n:'Lavoura grande',p:30,$:8000,lv:10},{n:'Campo',p:36,$:14000,lv:12},{n:'Campo grande',p:42,$:22000,lv:14},{n:'Plantação',p:49,$:35000,lv:16},
 {n:'Plantação grande',p:56,$:55000,lv:18},{n:'Terra a perder de vista',p:64,$:80000,lv:20}];
const FARM_PROP=[{n:'Sítio',ic:'🏡',$:0,lv:1,b:0},{n:'Chácara',ic:'🌳',$:2500,lv:5,b:.1},{n:'Fazenda',ic:'🌾',$:12000,lv:10,b:.2},{n:'Grande Fazenda',ic:'🚜',$:40000,lv:15,b:.3},{n:'Fazenda Modelo',ic:'🏆',$:100000,lv:20,b:.4}];
const FARM_HOUSE=[{n:'Barraca',ic:'⛺',$:0,lv:1,b:0},{n:'Casinha',ic:'🛖',$:800,lv:3,b:.05},{n:'Casa',ic:'🏠',$:5000,lv:7,b:.1},{n:'Casarão',ic:'🏘️',$:20000,lv:12,b:.15},{n:'Mansão',ic:'🏰',$:60000,lv:17,b:.2}];
// canteiros abertos com o terreno t (índices da grade)
const farmOpen=t=>FARM_ORDER.slice(0,FARM_LAND[Math.max(0,Math.min(FARM_LAND.length-1,t|0))].p);
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
const CR={skin:SKIN.length,eye:EYE.length,shirt:PAL.length,hair:HAIRC.length,hc:PAL.length,hs:HS.length,hat:HATS.length,bt:BT.length,pc:PAL.length,sc:PAL.length,shoes:SHOES.length,fc:FACES.length,nc:NCOL.length,nf:NFX.length,
 br:2,tb:2,eb:2,rb:2,sb:2,pb:2,cb:2,hb:2};
// busca por id: GEST.rocket, ITEM.pizza
const GEST=Object.fromEntries(GESTS.map(g=>[g.id,g])),ITEM=Object.fromEntries(ITEMS.map(i=>[i.id,i]));
const CAT={vivid,PAL,SKIN,GLOSS,EYE,HAIRC,HS,HATS,SHOES,BT,FACES,NCOL,NFX,EMO,ST,ST_LEGACY,ITEMS,GESTS,GEST,ITEM,BRK,LIMITS,CR,ING,INGR,COOK_METHODS,RECIPES,RECIPE,RECIPE_KEY,recipeKey,COOK_SLOTS,CROPS,CROP,FARM_W,FARM_H,FARM_ORDER,FARM_LAND,FARM_PROP,FARM_HOUSE,farmOpen};
if(typeof module==='object'&&module.exports)module.exports=CAT;else root.SKYCAT=CAT;
})(typeof globalThis!=='undefined'?globalThis:this);
