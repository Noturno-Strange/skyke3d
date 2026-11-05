# Como o jogo funciona

Detalhes de cada parte do jogo: estáticos, reconexão, voz, karaokê e vídeo, bots, rádio, notificações e o catálogo. Volte ao [README](../README.md).

## Favicon e cursor

- O favicon é uma nuvem sorridente sobre fundo roxo (SVG com PNG 64x64 de reserva) e o
  cursor é uma seta âmbar com coração, trocada por uma seta rosa com estrela em botões,
  seletores, sliders e caixas de seleção. Desabilitados mantêm `not-allowed` e campos de
  texto mantêm o cursor de texto.
- Tudo fica embutido como `data:` URI (o favicon no `index.html`, os cursores nas variáveis
  `--cur` e `--cur-ptr` de `assets/app.css`), então não há arquivos extras nem rotas novas. O CSP já libera
  `img-src 'self' data:`; se restringir esse valor, ícone e cursor deixam de aparecer.
- As barras de rolagem nativas não usam esse cursor no WebKitGTK (a janela do desktop) nem no Firefox:
  o ponteiro volta a ser o do sistema só na faixa da barra. Por isso o `assets/app-scroll.js` desenha
  trilho e thumb dentro de cada área rolável (`html.csb-on` só é ligado com ponteiro fino e, junto da
  classe `.csb-host` em cada área, esconde a barra nativa; o script reserva o mesmo espaço com
  `padding-right`). O cursor personalizado então vale na barra inteira, e arrastar o
  thumb, clicar no trilho, a roda e a escala da interface continuam funcionando. Em telas de toque a
  barra nativa é mantida.
- Para trocar o visual, edite os SVGs dessas duas variáveis e o `<link rel="icon">` no
  `<head>`. O cursor deve ter 32x32 px e o ponto ativo é `5 3` (a ponta da seta).

## Compressão e cache dos estáticos

O `index.html`, o `vendor/three-r186.min.js` e os arquivos de `assets/` são comprimidos **uma única vez, na inicialização** (brotli nível 11 e gzip nível 9). A cada requisição o servidor apenas escolhe o buffer pronto conforme o `Accept-Encoding` (`br`, depois `gzip`, depois o original), então não há custo de CPU em regime.

- Cada codificação tem seu próprio `ETag` (`"…-br"`, `"…-gzip"`) e a resposta leva `Vary: Accept-Encoding`, então navegadores e CDNs não misturam corpos diferentes.
- Como a resposta já sai com `Content-Encoding`, o Nginx não a comprime de novo.
- A compressão roda num **processo filho** que termina logo depois. O brotli em nível alto reserva muita memória nativa que o sistema não devolve ao processo que comprimiu (cerca de 10 MB a mais, para sempre); no filho ela volta toda ao sistema. Se o filho não puder ser iniciado, o servidor comprime no próprio processo e continua funcionando.
- As mensagens WebSocket não usam `permessage-deflate` (desligado de forma explícita): são pequenas e frequentes, e a compressão gastaria mais CPU e memória por conexão do que economiza.

### Cliente em arquivos separados, com hash no nome

O código do jogo fica em `assets/` (`app.css`, `intro.js` e o jogo dividido em `app-base.js`, `app-scene.js`, `app-avatar.js`, `app-sound.js`, `app-net.js`, `app-panels.js`, `app-media.js`, `app-voice.js` e `app-ui.js`) e o `index.html` só os referencia, nessa ordem. Os `app-*.js` são scripts comuns que dividem o mesmo escopo global: o que um declara no nível de cima, os seguintes enxergam; código que roda ao carregar só pode usar o que veio antes. Na inicialização o servidor calcula o SHA-256 de cada arquivo e passa a servir `/assets/app.<hash>.js` com `Cache-Control: public, max-age=31536000, immutable`; o HTML enviado ao navegador já aponta para os nomes com hash.

- O HTML continua com `no-cache` e `ETag`: ele é a única coisa revalidada a cada visita (cerca de 17 KB sem compressão). Um deploy faz o navegador baixar de novo só os arquivos cujo conteúdo mudou.
- Para editar, mexa em `assets/` normalmente e reinicie o servidor. Não há etapa de build.
- Só nomes simples (`/assets/<nome>.css|.js`) são aceitos. O nome sem hash, `..` e subpastas respondem 404.
- Uma aba aberta durante um deploy pode receber 404 num asset antigo; recarregar a página resolve.
- Os testes de regressão leem o cliente por `tests/client-source.js`, que recompõe o HTML com o CSS e o JS no lugar.

## Reconexão e ciclo das salas

- Se a conexão cair durante o jogo, o cliente mostra um modal e tenta voltar
  automaticamente, com backoff de ~1 s até ~8 s.
- A reconexão envia `{t:"resume", code, token}`. O servidor valida o token em
  tempo constante, reidrata jogador, posição, item, assento, karaokê e vídeo e
  **rotaciona o token** a cada retomada. Tokens antigos deixam de valer.
- O jogador que cai fica retido por `RECONNECT_MS` (30 s por padrão), inclusive
  se for o último da sala, e é removido da fila do karaokê imediatamente.
- Depois da janela, a sala é destruída quando não há mais humanos. Sair pelo
  botão **Sair** (ou fechar com código `4000`/`1008`/`1009`) remove na hora.
- Clientes lentos que acumulam mais de 1 MiB de mensagens pendentes são
  encerrados com `terminate()` (fechamento `1006`). Como não é uma saída
  voluntária, a sessão continua retida e o jogador pode reconectar.
- Se a sala ou a sessão expirar, o modal avisa e oferece apenas **Sair da sala**.
  Os botões **Tentar agora** e **Sair da sala** também ficam disponíveis durante
  as tentativas normais; voltar a ficar online ou reabrir a aba antecipa a
  tentativa.
- Reiniciar o servidor apaga todas as salas e tokens: nesse caso a reconexão
  falha de forma definitiva e é preciso entrar de novo com o código.

## Voz

- O áudio usa um perfil único, Opus 48 kHz mono, pensado para conversa e para
  cantar. O karaokê toca a música localmente em cada cliente (YouTube), então pelo
  WebRTC viaja só o microfone do cantor; por isso mono é suficiente e gasta metade
  da banda de um perfil estéreo. No modo padrão a voz passa pelo servidor TURN
  (veja [Voz privada e TURN](producao.md#voz-privada-e-turn)).
- O teto é 48 kbps na voz direta (`VOICE_PRIVACY=direct`). Pela rota do relay
  (padrão) cai para 40 kbps e, com 5 ou mais conexões de voz, para 32 kbps mono.
  O DTX fica desligado para não cortar caudas musicais; o FEC embutido
  (`useinbandfec`) continua ativo e o RED de áudio é removido da negociação.
- O microfone só transmite enquanto há som e por 3 segundos depois do último som
  (`musicGateStep` em `assets/app-voice.js`). Isso preserva a cauda de notas e
  evita enviar silêncio indefinidamente.
- A detecção roda a cada quadro e, com a aba escondida (o navegador pausa os quadros), pelo processamento de áudio
  (`micTick` em `assets/app-ui.js`, chamado também por um `ScriptProcessor` silencioso em `assets/app-voice.js`). Assim a voz
  continua saindo e o 🎤 sobre a cabeça continua aparecendo para os outros quando o jogo está numa aba de fundo.
- O jogador só ouve os outros enquanto o próprio microfone estiver ligado. Ao
  desligar o 🎤, todos os áudios dos peers são silenciados; ao religar, só voltam
  os que não foram silenciados manualmente. O silêncio manual continua valendo.
- O microfone tem um único botão 🎤 no HUD superior, ao lado do nível da voz: um
  clique liga ou desliga a captura. A borda verde fina indica microfone ativo (vermelha
  em caso de erro) e 🚫 indica permissão negada, voz indisponível ou desligada.
- Em Ajustes, as três caixas de filtro do microfone (cancelamento de eco, redução
  de ruído e ganho automático) funcionam e ficam salvas no navegador. O padrão é
  cancelamento de eco ligado, redução de ruído desligada e ganho automático
  desligado: o eco evita vazar o karaokê e as vozes da sala pelo alto-falante, e
  os outros dois preservam a dinâmica da cantoria. A troca é aplicada na hora; se
  o dispositivo não aceitar, o microfone é reiniciado.
- O cancelamento de eco do navegador só remove o áudio que o próprio navegador
  toca. Som de outros aplicativos (Discord, Spotify, sons do sistema) pode vazar
  pelo microfone mesmo com o eco ligado; para isso, use fone de ouvido.
- Economia de banda: o SDP pede pacotes de 40 ms (`ptime=40`, `maxptime=60`), o que
  reduz pela metade os pacotes por segundo e, com eles, o cabeçalho RTP/UDP/IP;
  o RED de áudio é removido da negociação com `setCodecPreferences`, porque ele
  repete cada quadro Opus e quase dobra o consumo.
- Se `setParameters` falhar ao aplicar o teto de bitrate, o ajuste é tentado de
  novo até 3 vezes, em vez de ficar sem limite pela conexão toda.
- No modo `direct` o navegador tenta a conexão direta primeiro e só usa o TURN
  (se houver) quando ela falha. No modo `relay` (padrão) só o TURN é usado. Quando
  a rota selecionada passa por relay, o envio é limitado a 40 kbps.
- Cada jogador mantém no máximo 8 conexões de voz simultâneas, priorizando os
  jogadores mais próximos.
- O SDP anuncia Opus mono 48 kHz com teto de 48 kbps (`maxaveragebitrate=48000`,
  `stereo=0`, `sprop-stereo=0`, `usedtx=0`, `cbr=0`) e o teto real de cada conexão
  é aplicado em `setParameters` (40 kbps no relay, 32 kbps em salas cheias).
- O cliente novo não envia mais a mensagem de qualidade `vq`; o servidor ainda
  aceita os valores antigos da allowlist para não derrubar jogadores com o cliente
  desatualizado. A antiga preferência salva em `skyke3d.voiceQ` é ignorada.
- Com `TURN_SECRET`, as credenciais são temporárias (`<expiração>:<label>` +
  HMAC-SHA1) e expiram em `TURN_TTL`. Credenciais estáticas só são usadas em
  desenvolvimento ou com `TURN_ALLOW_STATIC=1`.
- A sinalização WebRTC (ofertas, respostas e candidatos ICE) tem um teto
  próprio por conexão e é descartada em excesso sem contar como violação. Isso
  evita derrubar jogadores que negociam várias conexões de voz ao mesmo tempo.

## Perfil público

Opcional e desligado por padrão (Perfil › 🌐 Meu perfil público). Código em `lib/pubprofile.js`.

- **Link:** `/profile#<código>`. O código são 20 hex de `SHA-256("skyke3d-profile:" + id de identidade)`: estável (o mesmo jogador tem sempre o mesmo link, sem o servidor guardar a ligação) e de mão única (não revela o id de amigo). O cliente calcula o link dos amigos com o mesmo hash.
- **A foto:** o rosto é desenhado no navegador de quem visita, com o mesmo código do avatar do jogo (`app-base.js` + `app-avatar.js`, mais `portrait-stubs.js` e `portrait.js`), então sai igual à foto da aba Perfil. A página recebe só os índices da aparência (`cfg`, inteiros dentro da faixa do catálogo); **ninguém envia imagem** e a página não mostra cabelo, cor de pele ou roupa em texto.
- **O que a página mostra:** foto, nome, se está online, frase, curtidas, Sobre mim, Gosta de, Mundo favorito, emblemas (quando existirem) e recados. Não tem botão de jogar.
- **O que o jogador edita:** *Sobre mim* (300 caracteres), *Eu gosto de* (80), *Minha frase* (60) e *Mundo favorito* (um dos mundos do catálogo). Os textos passam por `cleanFields`: sem marcação nem controles, filtro de palavrões e **sem links** (qualquer endereço, domínio ou convite faz o servidor recusar a gravação inteira).
- **Persistência:** `data/profiles.json` (`PROFILES_FILE`; `0` deixa só na memória), modo 0600, gravação atômica com atraso de 5 s. Guarda por código público: nome, aparência, os três textos, o mundo e a última vez visto. **Desligar apaga na hora**; perfil parado há 180 dias é apagado; no máximo 10 000 perfis (sai o mais parado, nunca quem está online). Arquivo inválido vai para `.bak` e o servidor começa limpo. Custo: poucos KB por perfil, tudo em memória, uma gravação a cada alteração (agrupadas).
- **Temporário (só memória):** curtidas e livro de visitas. Somem 24 h depois que o dono sai, quando ele desliga o perfil ou quando o servidor reinicia.
- **HTTP:** `GET /profile` (página, `noindex`, script e estilo inline por hash na CSP) e `GET /profile.json?id=` (`no-store`, 60 consultas/min por IP, 404 igual para id inválido, desligado ou apagado).
- **Quem vê quem:** quem tem o perfil ligado manda o código aos da sala (`pp` no resumo de jogadores e `ppid`); a lista 👥 mostra 🌐, ❤️ e ✎ em "Nesta sala" e, para amigos, calcula o código localmente. Em outro aparelho, o painel preenche os campos com o que o servidor guardou.
- **Curtidas:** só dentro do jogo, com sessão autenticada, uma por pessoa (o servidor guarda só o código público de quem curtiu) e sem curtir a si mesmo.
- **Livro de visitas:** recados de até 120 caracteres (✎), só de quem tem sessão autenticada, sem link, com filtro de palavrões; no máximo 3 por autor em cada perfil e 20 por perfil (o mais antigo sai). O dono vê e apaga os seus em Perfil › 📖. A página mostra nome e texto, nunca o código de quem escreveu.
- **Emblemas** (`lib/badges.js`): *concedidos* só pelo administrador (painel `/status` › Emblemas, `POST /status/badge {pid, badge, on}` com o token) e guardados em `data/badges.json` por código público; *automáticos* calculados na hora (Perfil completo; Querido pela galera com 10 curtidas). O jogador não escolhe emblema (o campo, se enviado, é ignorado). Não há assinatura digital porque a página lê tudo direto do servidor: assinatura só serviria a dados portáteis. Emblemas novos entram no catálogo `GRANTED` do módulo.

## Cenários dos mundos

Cada mundo é montado por `buildRoom(k)` (`assets/app-scene.js`); a identidade de cada planeta vem de três partes:

- **Colônia** (`assets/app-colony.js`): cada mundo tem um conjunto próprio de *núcleos* (`KITS`), grupos de 2 a 4 peças ligadas por uso (habitação, comunicação, mineração, laboratório, pouso, água, aquecimento, cristais). As peças são módulo habitacional, mastro de comunicação, caixas de suprimentos, veículo planetário, plataforma de pouso, drone em base, torre de perfuração, reservatório, torre de aquecimento, estação meteorológica, gerador, posto de pesquisa, poste de luz e cristais. Os dois primeiros núcleos ficam nas laterais da vista padrão; os demais em ângulos irregulares, nunca no setor da casa e nunca dentro do círculo caminhável. Cada peça reserva seu espaço (`zones`) para nada encostar em nada.
- **Relevo** (`MREL`, `MWALL`, `mountPlan` e `mountains` em `app-scene.js`): as montanhas são **morros em forma de hemisfério, com a parte curva para cima** (exceção pedida às regras de formato: antes eram tetraedros). Cada morro é a metade de cima de uma esfera de raio igual à altura (`mountGeo`, `SphereGeometry` facetada), com o centro 1,5 m abaixo do chão, então nenhum flutua. Formam **uma muralha contínua em anel de 360°**, concêntrica à área de jogo, em duas camadas (perto e ao fundo), cada uma **numa circunferência exata** (raio único) e **sem nenhum atravessar outro**: cada morro fica no menor ângulo em que encosta no vizinho (corda = soma dos raios no chão + 15 cm de folga, `hillSep`), o raio da camada se ajusta para o anel fechar em 360° (ou a folga que sobra é repartida) e a camada de trás só começa depois que nenhum morro dela toca a da frente. Os morros vêm em **grupos (cordilheiras)** com um principal e ombros que descem (68 a 100 % do principal); `REL.g` define quantos morros por grupo em cada mundo. **O tamanho é padronizado e igual em todos os mundos** (`MWALL`): principais de 8,2 a 9,1 m na camada próxima e de 9,2 a 10,1 m ao fundo (medidos do pé até o topo), nenhum abaixo de 5,5 m. O teto vem dos planetas do céu: o centro do mais baixo fica a 5,8° de elevação, então a linha dos morros, vista da pior posição da câmera (19,4 m do centro, a 4,8 m de altura), fica em até 4,2° e nunca cobre um planeta. **Visual de desenho animado:** o degradê do tema do mundo (`MPAL`, uma paleta própria por mundo: base escura e saturada, meio da rocha, topo claro puxado para a luz do céu) sai em **4 degraus de altura** (`MBANDS`), cada face com uma cor só, com a luz em **3 faixas** como no resto do cenário e neve ou brilho no cume nos mundos que têm; em volta de cada morro vai um **contorno escuro** (a cúpula inflada, vista só por dentro, na cor escura da rocha misturada ao contorno do mundo, ~2,5 px de espessura em qualquer distância; a névoa o suaviza de longe). `mountPlan` é pura e determinística e tem testes.
- **Natureza**: pedras em *afloramentos* (um bloco grande, em formato de bloco, laje ou pedra alta, e alguns pequenos, com vãos livres entre os grupos) e plantas em *bosquetes* (`forestFlora`), em vez de espalhadas por igual. O espelhamento da metade norte (`mirrorDecor`) foi removido.

Peças fixas (casa lunar, estufa, quatro conjuntos de painéis solares, fogueira e bancos) continuam únicas e nunca saem na limpeza de sobreposições (`declutter`). As peças da colônia também são marcadas como únicas; o que encosta nelas é que sai.

As peças ganham um leve tom da rocha do mundo (`hullOf`, 14 %), o módulo habitacional varia por posição (painel no teto, anexo ou segunda janela) e em Trappist, mundo de água, cada núcleo fica sobre uma plataforma de aço (`deck`).

Custo: sem `mergeGroup` nas peças novas, o `mergeStatic` junta tudo por material; medido em Chromium com renderização por software, a média de chamadas de desenho ficou em 287 (antes 286) e a de triângulos caiu de 72 mil para 62 mil.

## Mascote virtual

Código em `lib/pet-genes.js` (genes), `lib/pet-care.js` (cuidados e progressão), `lib/pets.js` (persistência e social), `assets/pet-art.js` (desenho) e `assets/app-pet.js` (painel). Botão 🐾 na barra (grupo "Eu e meu mascote").

- **Dono:** o mascote pertence ao código público do perfil (`SHA-256("skyke3d-profile:"+id)`), nunca ao que o cliente diz. Todas as mensagens (`petget`, `petadopt`, `petact`, `petdress`, `petrel`) exigem sessão autenticada (`scope: primary`).
- **Autoridade do servidor:** a seed sai de `crypto.randomBytes(8)`; os genes saem de `genesFromSeed(seed, tentativa)`. O cliente só envia o **nome** na adoção e o **nome da ação** + um `rid` (identificador do pedido) depois. Seed, genes, hora e valores nunca vêm do cliente, e a seed nunca vai para o cliente.
- **Genes e raridade:** 14 genes de índices pequenos (corpo, cabeça, olhos, orelhas, cauda, pés, padrão, paleta, tom, bochechas, especial, personalidade, acessório inicial). A característica especial define a raridade: Comum 78 %, Incomum 14 %, Rara 6,5 %, Extremamente rara 1,5 %. Regras de compatibilidade corrigem combinações incoerentes de forma determinística. `genomeKey` impede dois mascotes idênticos (se a tentativa colide, sorteia de novo com a mesma seed, até 60 vezes).
- **Tempo:** as necessidades são calculadas sob demanda pela diferença de horário (`settle`), sem timer por mascote. Cada uma tem piso (saúde nunca abaixo de 30) e ausências acima de 96 h não pesam mais, então o mascote **não morre**. Idade e estágio vêm da data de criação (Filhote < 3 dias, Jovem < 10, Crescido < 30, Veterano).
- **Cuidados:** alimentar, brincar, descansar, limpar, carinho e aventura, cada um com espera (10 min a 4 h) e condição (por exemplo, não alimenta quem já está cheio). O vínculo só sobe com cuidado e ganha no máximo 12 por dia. Pedidos repetidos (mesmo `rid`) devolvem o mesmo resultado e não contam duas vezes.
- **Acessórios:** liberados por conquistas (laço, cachecol, coroa estelar, óculos). Trocar não mexe nos genes.
- **Persistência:** `data/pets.json` (`PETS_FILE`), 0600, gravação atômica agrupada; ler não grava. Ao carregar, cada registro é validado (genes na faixa, valores limitados, genoma duplicado ignorado). Máximo de 20 000 mascotes. Soltar apaga o registro e trava nova adoção por 30 dias (para não sortear de novo até sair um raro).
- **Perfil público:** só aparece se o dono ligou o perfil público. O resumo (`pet` em `/profile.json`) traz nome, genes, idade, estágio, personalidade, raridade, vínculo, conquistas e estatísticas; **não** traz necessidades, seed nem histórico.
- **Visitas:** quem tem sessão autenticada pode cumprimentar, fazer carinho ou deixar um presente (🐾 nas listas). São contadores temporários em memória, com espera de 6 h por pessoa e tipo e teto diário por mascote; não alteram nada do mascote.
- **Desenho:** Canvas 2D a partir dos genes, com peças vetoriais paramétricas (nada de imagens). O animador só desenha com o painel aberto e a aba visível, a 14 quadros por segundo em cena calma e 28 em animação. A página de perfil usa o mesmo código.

## Culinária

Código em `assets/catalog.js` (ingredientes, receitas e os alimentos que elas dão), `lib/cook.js` (regras e persistência), `assets/app-cook.js` (menu), `assets/vlist.js` (lista com rolagem virtual) e a mochila em `assets/app-panels.js`. Botão 🍳 na barra (grupo "Expressão").

- **Fogueira:** todo cenário tem a fogueira no centro. Para cozinhar o jogador precisa estar a até 5,5 m dela (o servidor confere com folga, 6,5 m, pela posição que já valida nos movimentos). Sem isso o menu continua útil para ver receitas e preparar ingredientes.
- **Menu (três abas):** *Cozinhar* (6 espaços de combinação, botões Cozinhar e Assar e a despensa), *Receitas* (livro com todas as receitas, ingredientes e quantas vezes cada uma foi feita; "Usar nos espaços" preenche a combinação) e *Preparo* (lavar e descascar). Ingredientes são infinitos; cada um pede lavar (💧), descascar (🔪), os dois ou nada, e só entra num espaço depois de pronto. O preparo é só do cliente (nada a validar, não gasta ingrediente).
- **Receitas:** 46 receitas (23 de panela, 23 de brasa) com 2 a 6 ingredientes diferentes, em qualquer ordem. A receita sai de **método + conjunto de ingredientes** (`recipeKey` no catálogo); cada conjunto vale uma receita só. Combinação que não é receita responde `nada` e não grava nada. O cliente só manda `cookdo` com o método, os ingredientes e um `rid`; o servidor acha a receita.
- **Desbloqueio:** cada receita dá um alimento novo (categoria **Receitas** da mochila, marcado `rc` no catálogo). Ele fica com cadeado na mochila até o jogador preparar a receita pela primeira vez, e depois fica liberado para sempre. O servidor também recusa pegar um alimento de receita que o jogador não desbloqueou (mensagem `item`), mesmo que o cliente peça. Quem não tem identidade autenticada não cozinha nem guarda progresso.
- **Progressão:** experiência (10 por ingrediente na primeira vez que a receita é feita, 3 nas repetições, com um bônus de 2 % por ponto de atributo), níveis de 1 a 20 e três atributos que sobem com o uso: **Fogo** (receitas feitas), **Paladar** (receitas diferentes) e **Despensa** (ingredientes diferentes usados), cada um com o ponto igual à raiz quadrada do contador (até 10). Emblemas de cozinheiro: Aprendiz de Cozinha (1 receita), Cozinheiro de Fogueira (5 diferentes), Mestre da Panela (10 cozidas), Mestre do Braseiro (10 assadas), Chef (20 diferentes) e Mestre-cuca (todas). Os emblemas também aparecem no perfil público (só o emblema; receitas e experiência não vão para lá).
- **Persistência:** `data/cook.json` (`COOK_FILE`), 0600, gravação atômica agrupada; só uma receita que deu certo grava. Ao carregar, cada registro é validado (receitas e ingredientes que existem, contagens limitadas). Atributos e emblemas não são guardados: saem dos contadores.
- **Limites:** `cookget` 20/min; `cookdo` com intervalo mínimo de 1,2 s e 20/min por conexão.
- **Mudar sem quebrar:** ingrediente ou receita novos entram no fim das listas em `assets/catalog.js` (os testes em `tests/cook.test.js` conferem ingredientes existentes, combinação única por receita, nomes curtos e que todo ingrediente é usado). Não mude o id de uma receita: ele é o id do alimento e a chave do progresso salvo.
- **Listas que crescem (regras.md 12.1):** `vlist` mantém só as linhas visíveis no DOM, com cabeçalhos de grupo recolhíveis (estado salvo no navegador), busca fixa no topo, contagem "N de M" e teclas ↑ ↓ Home End. A mochila usa a mesma lista (Bebidas, Comidas, Receitas).

## Música lofi

Código em `assets/lofi.js` (as composições e o leitor da notação) e `assets/app-sound.js` (o motor que toca). Tudo é sintetizado em Web Audio, sem arquivo de áudio.

- **Uma faixa por lugar:** a tela inicial tem a faixa `menu` ("Órbita") e cada um dos 16 mundos tem a sua, com o mesmo id do mundo (por exemplo `nyx` = "Noite em Nyx"). Ao entrar na sala toca a do mundo; ao sair, a da tela inicial; ao trocar de mundo, a música troca junto, com a anterior sumindo devagar.
- **Composição original:** cada faixa tem 4 compassos de acordes estendidos (maj9, m9, 13, 7b9…), uma melodia escrita à mão, andamento (58 a 82 BPM), swing, ritmo, timbre da melodia (piano elétrico, sino, pluck, kalimba, flauta, marimba ou koto) e textura (chiado de vinil, oscilação de fita e passa-baixa abafado). A melodia toca duas vezes (a segunda mais enxuta) e depois só o ritmo e o piano descansam, num ciclo de 3 voltas. Há pequenas variações de tempo e de volume a cada nota para soar humano.
- **Notação:** acordes como `Ebmaj9 Cm9 Fm9 Bb13`; melodia com 16 posições por compasso (`G5 . . Bb5 - - .`, em que `.` é pausa e `-` prolonga a nota). O formato completo está no cabeçalho de `assets/lofi.js`; `tests/lofi.test.js` confere a notação, que toda faixa é distinta e que não sobra mundo sem música.
- **Volume:** canal próprio **Música lofi** nos Ajustes (padrão 60 %), com o nome da faixa anunciado embaixo. O botão da tela inicial liga e desliga a música em todo lugar. Cada faixa tem um ganho `mus_<id>` na tabela `TRIM`, calibrado para ficar em -24 dBFS (`CHROME=/usr/bin/chromium node tools/audio-audit.js`); recalibre depois de mexer numa faixa.
- **Respeita a mídia:** a música para sozinha enquanto há vídeo, karaokê ou rádio tocando, ou com a aba escondida, e volta depois.
- **Mudar sem quebrar:** mundo novo precisa de uma faixa em `TRACKS` (o teste avisa). Dá para trocar acordes, melodia, ritmo e timbre à vontade; mantenha 16 posições por compasso e a melodia no registro de 62 a 92 (notas MIDI).

## Karaokê e vídeo

- **Vários vídeos ao mesmo tempo.** Cada jogador pode iniciar o seu vídeo, mesmo enquanto outro está assistindo ao de alguém
  (até 4 vídeos por sala, `MAX_VIDS` em `server.js`). Quem aceitou o vídeo de outro jogador só assiste: **trocar o vídeo é do controlador**. Se quem controla um vídeo aceita o convite de outro, o vídeo dele é encerrado (`vjoin`) e ele passa a só assistir ao novo. Para colocar o próprio vídeo, basta fechar a janela (✖) e usar o campo de iniciar.
  Os convites têm o dono (`by`); `vjoin` e `vleave` (com o `by`) escolhem qual vídeo se acompanha, e o servidor só envia a
  sincronia (`vsync`) a quem assiste àquele vídeo. Sair da sala encerra o vídeo do dono.
- **Espera depois do fim.** Quando o vídeo termina, a janela de quem o iniciou e a de quem assiste continuam abertas, com uma contagem
  regressiva de **3 minutos** (`VIDEO_IDLE_MS`, em ms, padrão 180000) para colocar um novo vídeo. Se o dono colocar outro (até o mesmo), quem
  assiste o acompanha. Sem um novo vídeo, o servidor encerra a sessão (`vstop` com `why:"idle"`): a janela fecha sozinha e o convite some
  do balão e do sino 🔔. Quem tentar assistir a um vídeo que já terminou recebe só o aviso de término.
- O vídeo de um jogador pode ser encerrado por ele **ou pelo anfitrião** (`vstop` com o `by` do vídeo). O cliente só envia `vstop`
  ao fechar o player de quem iniciou o vídeo.
- Convites de karaokê disparados ao entrar em uma fila vazia têm cooldown de
  15 segundos por sala, para evitar spam quando alguém entra e sai da fila.
- Só o cantor atual pode passar a própria vez (`kpass`); nem o anfitrião passa a vez dos outros.
- O botão da fila (📋) fica no canto superior esquerdo, ao lado do microfone, e só
  aparece enquanto o jogador está na fila. A lista mostra posição, nome e a música;
  a sua própria linha é destacada com uma borda, sem textos como "Cantando" ou "Você".
- Na barra inferior, 😀 abre o painel de emojis e 🎭 abre o de gestos (mesmo painel,
  abas separadas por botão). Mochila, Emojis e Gestos têm tamanho fixo (5 colunas × 4 linhas) e barra de rolagem vertical
  para o resto da lista. Além dos emojis comuns há 10 do tema (🪐 🚀 🌙 🌟 ☄️ 👽 🛸 🌌 🔭 🪄); a mochila tem 24 itens, entre eles
  Poção Solar, Poção Nebulosa, Poção Cometa, Bolo Planeta e Bala Estelar (ícones desenhados no jogo), Rosquinha, Queijo Lunar e
  Pirulito; e há 8 gestos do tema: Foguete, Feitiço, Alien, Luneta, Estrela e as danças Órbita, Gravidade zero e Meteoro.
  Emojis e gestos novos só entram no fim das listas, porque o servidor recebe o índice do emoji. O HUD não tem mais os botões de código da sala e de pessoas.
- A fila comporta todos os jogadores da sala (`MAX_PER_ROOM`, 16 por padrão). Cada música dura a duração do vídeo + 21 s de margem (`KEXTRA` em `server.js`), com teto de 13 minutos.
- O cliente consulta a duração no YouTube antes de entrar na fila ou definir a música:
  vídeos com mais de **13:00** são recusados com aviso. Se a duração não puder ser
  verificada, a música é aceita e a vez termina automaticamente aos 13:00.
- O servidor limita a duração declarada e o relógio da vez a
  **780 segundos (13 minutos)**, contados do início da apresentação. Ao atingir
  o limite, a sala avisa e passa para o próximo cantor.
- O vídeo do karaokê tem botão de volume/mudo e controle deslizante no cliente.
- O player de vídeo e o vídeo do karaokê têm botão de tela cheia na barra de
  controles, ao lado dos botões de tamanho e do volume, com suporte a navegadores
  WebKit. Em tela cheia apenas o vídeo aparece; saia com `Esc` ou com o gesto do
  navegador.
- Quem iniciou o vídeo da sala pode trocá-lo pelo campo **Trocar vídeo** na
  janela Vídeos. Quem já está assistindo ao vídeo dele acompanha o novo
  automaticamente, e convites ainda pendentes dele passam a apontar para o novo.

### Posições dos jogadores

O servidor manda as posições **5 vezes por segundo em binário** (12 bytes por jogador que se mexeu: id, x, z, giro, altura e sentado) e o cliente desenha cada avatar ~230 ms no passado, interpolando entre dois pacotes, então o movimento continua liso. No teste de carga (salas de 16, 30% andando), o envio por jogador caiu de ~1,6 KB/s para ~0,4–0,6 KB/s.

### Sincronia de vídeo e karaokê

- **Relógio do servidor:** ao entrar e a cada 15 s o cliente troca a hora com o servidor (`tsync`). A amostra com menor ida-e-volta entre as últimas 8 dá a diferença de relógio, e o cliente passa a enxergar a hora do servidor com precisão de poucos milissegundos.
- **Vídeo:** quem controla o vídeo manda, a cada 1 s e a cada play, pausa ou salto, a posição e a hora (do servidor) em que ela foi lida. Quem assiste calcula a posição certa para *agora*, então a demora da mensagem não atrasa ninguém, e corrige a cada 250 ms: diferença acima de 1,2 s salta (`seekTo`); entre 0,12 s e 1,2 s acelera ou freia um pouco (1,25× ou 0,75×) até alcançar, sem pulos; a pausa e o ponto da pausa do dono valem para todos. Quem entra depois recebe a posição e a hora, e não uma posição recalculada.
- **Karaokê:** o mesmo mecanismo, e o vídeo de quem ouve fica atrás do vídeo do cantor exatamente o tempo que a voz dele demora a chegar (metade do ida-e-volta + buffer de jitter do WebRTC + ~40 ms de captura e reprodução, medidos a cada 2 s). Assim a música local e a voz do cantor saem juntas. Sem conexão de voz com o cantor, o vídeo segue a posição dele sem esse ajuste. Quem entra na fila no meio da música recebe a última sincronia.

## Bots

Cada sala aceita de 0 a **20 bots** (a sala continua limitada a `MAX_PER_ROOM` pessoas no total, 16 por padrão;
quando entram humanos, os bots que não cabem saem) e o servidor inteiro, `MAXBOTS`.

Os bots **não usam IA nem rede** (`lib/bots.js`) e **nunca puxam assunto**: só falam quando
uma pessoa digita no chat, e então **um** bot responde com uma frase engraçada sorteada
(que pode citar o nome de quem falou). Chamar um bot pelo nome o faz responder.

Para poupar recursos e evitar bagunça, a sala tem **um único orçamento de fala**, não
importa se há 2 ou 20 bots:
- no máximo 3 respostas na fila e 5 falas de bots a cada 30 s;
- intervalo mínimo de ~2,6 s entre duas falas, saindo uma de cada vez;
- o falante é escolhido em **rodízio**, e cada bot descansa `max(15 s, 2,2 s × nº de bots)`
  antes de falar de novo (com 20 bots, cada um fala no máximo a cada 44 s);
- sem ninguém online a fila é descartada e os bots ficam calados.

## DJ (rádio da sala)

O botão 🎧 da barra inferior abre o painel **Rádio**. Qualquer pessoa da sala pode
colocar uma rádio (uma por vez); quem colocou ou o anfitrião encerra para todos.

- Só aceita links `https` de streaming direto em **MP3 ou AAC** (Icecast2/Shoutcast).
  Ogg, playlists `.m3u`/`.pls` e links `http` não funcionam.
- **O áudio passa pelo servidor do jogo** (`lib/radio.js`): o servidor abre **uma**
  conexão com a rádio por sala e reparte o áudio entre os ouvintes, então a rádio só
  vê o IP do servidor, nunca o de quem ouve. Os ouvintes nem recebem o link, só o
  domínio, e cada um só começa a ouvir depois de clicar em **Ouvir**.
- Anti-SSRF: `streamUrl` (`lib/validate.js`) aceita só `https`, sem usuário/senha, sem IP
  literal e sem nomes locais; o DNS é resolvido no servidor e a conexão é feita no
  IP validado, recusando endereço privado, loopback, CGNAT, link-local e equivalentes
  em IPv6 (`isPublicAddress` em `lib/netutil.js`); até 3 redirecionamentos, validados a
  cada salto; só resposta 200 com `audio/*` MP3/AAC.
- Limites: `DJ_MAX_HUBS` (padrão 10) rádios ao mesmo tempo no servidor, 96 KB/s por
  rádio, 512 KB de buffer por ouvinte, 15 s sem dados derruba a conexão, e a conexão
  fecha 20 s depois que o último ouvinte sai. `/radio` exige o código da sala e uma
  chave própria do jogador (`rk`, diferente do token de sessão) e tem limite por IP.
- Consome a banda do servidor: cada ouvinte recebe o áudio inteiro do servidor.

## Notificações

O sino 🔔 no topo da tela guarda convites de **karaokê**, **vídeo** e **DJ** que ninguém
aceitou nem recusou em 20 segundos. O balão some, o sino mostra a contagem e cada item
tem o botão de ação (Entrar, Assistir, Ouvir) e ✖ para dispensar. Os itens saem sozinhos
quando o convite deixa de valer (vídeo ou rádio encerrados, fila do karaokê vazia).

## Mudar nomes, itens e cores sem quebrar

Itens da mochila, gestos, emojis, paletas de cor, estilos do avatar (cabelos, chapéus, calçados, rostos), mundos e o limite
do nome ficam num lugar só: [`assets/catalog.js`](../assets/catalog.js). O navegador carrega esse arquivo antes do jogo, e o
servidor (`lib/validate.js`) aceita exatamente o que está nele. Não há outra lista para manter em sincronia.

| Quero... | Onde mexer | Cuidado |
|---|---|---|
| Trocar o nome que aparece na tela (item, gesto, mundo, estilo) | `n`/`info` no catálogo | Nada: é só texto. Até 16 letras para caber nas janelas. |
| Adicionar um item | `ITEMS` no catálogo | `ic` é um emoji ou uma chave de `ICONS` (`assets/app-base.js`); `food:1` para comida. |
| Adicionar um gesto | `GESTS` no catálogo e a animação com o mesmo `id` em `DANCES` (`assets/app-ui.js`) | O comportamento vem dos campos, nunca do id: `dur` em segundos (`Infinity` repete, não roda sentado e usa o som de dança), `sfx` para som próprio (com limite contra spam), `puff:1` para a nuvem, `emo` para o emoji sobre a cabeça. Renomear o id não muda nada. |
| Adicionar um emoji, cor, cabelo, chapéu... | **no fim** da lista no catálogo | A posição vai pela rede e fica salva no navegador: trocar a ordem ou remover muda o visual de quem já escolheu. |
| Renomear o id de um mundo | `ST` no catálogo, as tabelas do mundo (`THEME`, `SKY`, `MPROF`, `MPAL`) e o id antigo em `ST_LEGACY` | Links e clientes antigos continuam caindo no mundo certo. |

`npm test` confere tudo isso (`tests/catalog.test.js`): ordem das listas por posição (comparada com
`tests/catalog-order.json`), ids repetidos, ícone e animação de cada item e gesto, cenário de cada mundo, nomes curtos e se o
servidor aceita tudo o que o catálogo oferece. Cada falha diz o que corrigir.
