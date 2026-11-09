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

### Voz pelo WebSocket (padrão)

- Com `VOICE_TRANSPORT=ws` (padrão do servidor), o microfone é codificado no navegador em quadros de 20 ms e vai pelo
  mesmo WebSocket do jogo, em binário (`[2][codec][seq][dados]`). O servidor (`lib/voicews.js`) repassa cada quadro
  (`[2][u32 id][codec][seq][dados]`), na memória, sem decodificar nem gravar, só para quem:
  está ouvindo (microfone ligado, mensagem `vlisten`) e não silenciou quem fala (`vmute`); todos os fluxos são encaminhados, sem depender de distância ou limitar falantes. Quadro de quem não está falando (`speak`) é descartado.
- Codec: Opus mono 48 kHz a 32 kbps pelo WebCodecs (`AudioEncoder`/`AudioDecoder`) quando todos na sala têm; cada
  navegador informa com `vcap`, e o servidor avisa a sala com `vcodec`. Se alguém não tem (Firefox no Android ou
  Safari antes do 26, por exemplo), a sala inteira passa para IMA-ADPCM 4 bits a 16 kHz (~64 kbps), codificado e
  decodificado em JavaScript (`adpcmEncode`/`adpcmDecode` em `assets/app-voice.js`), e volta ao Opus quando essa
  pessoa sai. Assim todo mundo ouve todo mundo, sem WASM nem biblioteca externa.
- Volume: o ganho automático do navegador fica desligado por padrão (preserva a dinâmica do canto), e o microfone cru
  costuma sair baixo. Por isso a voz enviada passa por um nivelador (`agcApply` em `assets/app-voice.js`): leva cada
  voz para ~-18 dBFS, sobe devagar (~1 s, de 0,5× até 10×), desce rápido, segura o ganho no silêncio e termina num
  limitador suave, para nunca estourar. Quem ouve recebe todas as vozes num volume parecido.
- Qualidade: o Opus usa complexidade 10, sem FEC (TCP retransmite bytes perdidos e FEC não remove o bloqueio em ordem); bitrate inicial de 32 kbps e 48 kbps no karaokê, com recuo para 24 kbps se a fila de envio local crescer e recuperação após 2 s estáveis. Ao descer a taxa
  (48 → 16 kHz no modo compatível, ou de 48 para 44,1 kHz), um passa-baixa de 6ª ordem corta os agudos que voltariam
  como chiado (aliasing).
- Captura: um `AudioWorklet` (`assets/mic-worklet.js`, na linha de áudio, fora da linha principal que desenha o 3D) junta o
  microfone em blocos de 1024 amostras e os entrega ao jogo, que mantém a detecção de fala em abas escondidas e passa o
  áudio para o codificador. Em navegador sem `AudioWorklet`, um `ScriptProcessor` faz o mesmo. O arquivo do worklet é
  referenciado no `index.html` (`<link rel="prefetch" id="micWk">`) para ganhar o mesmo hash e cache dos outros assets; a reamostragem para 48 kHz (Opus) ou 16 kHz (ADPCM) é linear.
- Reprodução: cada voz que chega tem o próprio relógio no `AudioContext` do jogo, com uma folga adaptativa contra as
  variações da rede (`jitStep`): começa em 80 ms, cresce 40 ms a cada falta de áudio no meio da fala (até 300 ms), volta
  2 ms por segundo com a rede estável e é refeita se a fila passar de 600 ms. Quando a reprodução recomeça, a entrada é
  suavizada em 2 ms, para não estalar. Cada voz tem um ganho (volume das vozes nos Ajustes) e um analisador para o 🎤
  sobre a cabeça, e todas passam por um limitador antes da saída, para várias pessoas falando juntas não distorcerem. Quem fica 90 s sem falar libera esses nós.
- Eco: o Chrome só tira do microfone o áudio que ele mesmo toca por uma conexão WebRTC. Por isso, no Chrome e derivados,
  a saída das vozes passa por uma conexão WebRTC **local** (duas `RTCPeerConnection` na mesma página, sem rede nem
  servidor) até um `<audio id="vwsOut">`; se ela falhar, as vozes voltam a sair direto pelo `AudioContext`. Firefox e
  Safari já cancelam todo o áudio da página.
- Aperte para falar (opcional, em Ajustes → Voz e microfone, salvo no navegador): em vez de transmitir sempre que há som,
  só transmite enquanto a tecla V (ou o botão 🗣️ da barra de toque, no celular) estiver apertada, e por 0,2 s depois de
  soltar. O microfone continua ligado para ouvir a sala. Apertar com o microfone desligado dá o retorno de erro e explica o
  que fazer. Vale para a voz pelo WebSocket e para a malha WebRTC.
- Quem está ouvindo (microfone ligado) aparece para todos com 👂 no nome, e quem fala com 🎤: assim quem fala sabe quem
  escuta. O servidor avisa a sala com `vl` quando alguém liga ou desliga o microfone (e manda `vl` de cada um ao entrar).
- O karaokê estima o atraso da voz do cantor como o ida-e-volta até o servidor mais a folga de reprodução (`kLag`).
- Se a fila de envio do navegador passar de 2 KB, o quadro é descartado em vez de acumular atraso.

### Malha WebRTC (`VOICE_TRANSPORT=webrtc`)

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
  (`micTick` em `assets/app-ui.js`, chamado também pelos blocos do `AudioWorklet` do microfone em `assets/app-voice.js`). Assim a voz
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
- Economia de banda: o SDP pede pacotes de 20 ms (`ptime=20`, `maxptime=60`), o que
  reduz pela metade os pacotes por segundo e, com eles, o cabeçalho RTP/UDP/IP;
  o RED de áudio é removido da negociação com `setCodecPreferences`, porque ele
  repete cada quadro Opus e quase dobra o consumo.
- Se `setParameters` falhar ao aplicar o teto de bitrate, o ajuste é tentado de
  novo até 3 vezes, em vez de ficar sem limite pela conexão toda.
- No modo `direct` o navegador tenta a conexão direta primeiro e só usa o TURN
  (se houver) quando ela falha. No modo `relay` (padrão) só o TURN é usado. Quando
  a rota selecionada passa por relay, o envio é limitado a 40 kbps.
- Cada jogador mantém até 39 conexões de voz simultâneas em uma sala com 40 pessoas; não há seleção por distância. A malha WebRTC pode gerar alto consumo de CPU, banda e sinalização nesse tamanho; o transporte recomendado permanece WSS.
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
- **Quem vê quem:** quem tem o perfil ligado manda o código aos da sala (`pp` no resumo de jogadores e `ppid`); na lista 👥, tocar no nome de alguém de "Nesta sala" ou de um amigo abre embaixo da lista as ações com texto (🌐 Perfil, ❤️ Curtir, ✎ Recado, 🐾 Mascote); para amigos, o código é calculado localmente. Em outro aparelho, o painel preenche os campos com o que o servidor guardou.
- **Curtidas:** só dentro do jogo, com sessão autenticada, uma por pessoa (o servidor guarda só o código público de quem curtiu) e sem curtir a si mesmo.
- **Livro de visitas:** recados de até 120 caracteres (✎), só de quem tem sessão autenticada, sem link, com filtro de palavrões; no máximo 3 por autor em cada perfil e 20 por perfil (o mais antigo sai). O dono vê e apaga os seus em Perfil › 📖. A página mostra nome e texto, nunca o código de quem escreveu.
- **Emblemas** (`lib/badges.js`): *concedidos* só pelo administrador (painel `/status` › Emblemas, `POST /status/badge {pid, badge, on}` com o token) e guardados em `data/badges.json` por código público; *automáticos* calculados na hora (Perfil completo; Querido pela galera com 10 curtidas). O jogador não escolhe emblema (o campo, se enviado, é ignorado). Não há assinatura digital porque a página lê tudo direto do servidor: assinatura só serviria a dados portáteis. Emblemas novos entram no catálogo `GRANTED` do módulo.

## Cenários dos mundos

São 6 mundos, cada um um planeta inspirado num bioma brasileiro (lista em `ST`, `assets/catalog.js`): **Amazora** (Amazônia), **Cerron** (Cerrado), **Atlanthia** (Mata Atlântica), **Caatara** (Caatinga), **Panthara** (Pantanal) e **Pamphora** (Pampa). Eles substituíram os 16 planetas anteriores reaproveitando o que já existia: cada bioma partiu de um mundo antigo (Amazora de Tauri, Cerron de Proxima, Atlanthia de Esmera, Caatara de Duna, Panthara de Trappist e Pamphora de Sakura), herdando colônia, céu, luz, música e montanhas, com cores e vegetação refeitas para o bioma. As ids antigas (as 16 anteriores e as mais antigas ainda) são convertidas para o bioma mais parecido em `ST_LEGACY` (no servidor, no cliente e no mundo favorito do perfil público).

Cada mundo é montado por `buildRoom(k)` (`assets/app-scene.js`); a identidade de cada planeta vem de quatro partes:

- **Vegetação** (`BUILD` e `forestFlora`): paleta, tipos de árvore (`kinds`: redonda, pinheiro, agulha, torta, cacto e cogumelo gigante), tamanho das árvores (`ts`: gigantes na Amazônia, menores na Caatinga) e densidade por tipo de planta (`dens`, multiplicando `LUSH`): poucas árvores e muitas flores no Pampa, samambaias na Mata Atlântica, arbustos e capim no Cerrado, quase nenhum cogumelo na Caatinga. A árvore torta (`twisted`, tronco grosso que se abre em galhos com copas achatadas) foi criada para o Cerrado e a Caatinga; a de cristal saiu porque nenhum bioma a usa. O Pantanal tem água rasa sobre o chão inteiro (`buildWater`, cores em `WATER`).

- **Colônia** (`assets/app-colony.js`): cada mundo tem um conjunto próprio de *núcleos* (`KITS`), grupos de 2 a 4 peças ligadas por uso (habitação, comunicação, mineração, laboratório, pouso, água, aquecimento, posto avançado). As peças são módulo habitacional, mastro de comunicação, caixas de suprimentos, veículo planetário, plataforma de pouso, drone em base, torre de perfuração, reservatório, torre de aquecimento, estação meteorológica, gerador, posto de pesquisa, poste de luz, mastro com bandeira, farol e marco de pedras. Todos os núcleos estão em uso: mineração na Caatinga, posto avançado no Cerrado, aquecimento e segunda moradia no Pampa, garagem de veículos na Mata Atlântica. Os dois primeiros núcleos ficam nas laterais da vista padrão; os demais em ângulos irregulares, nunca no setor da casa e nunca dentro do círculo caminhável. Cada peça reserva seu espaço (`zones`) para nada encostar em nada.
- **Relevo** (`MREL`, `MWALL`, `mountPlan` e `mountains` em `app-scene.js`): as montanhas formam **uma muralha contínua em anel de 360°**, concêntrica à área de jogo, em duas camadas (perto e ao fundo), cada uma **numa circunferência exata** (raio único; as montanhas giram com o anel, com a base voltada para o centro), **sem nenhuma atravessar outra** (cada pico fica no menor ângulo em que o tetraedro encosta no vizinho, medido pelo teorema do eixo separador em `tetSep`; a camada de trás só começa depois que nenhum pico dela toca a da frente) e **sem flutuar** (todos os pés ficam 1,5 m abaixo do chão). **Toda montanha é um tetraedro** (`tetraV`: 4 vértices, ponta para cima; `tetraTris`: as 4 faces planas), então cada uma custa só 12 vértices. A muralha é organizada em **grupos (cordilheiras)**: cada grupo tem um pico principal e ombros que descem (68 a 100 % do principal), com as bases encostadas; a largura de todos recebe um fator único para o anel fechar exatamente em 360° e a folga que sobra é repartida igualmente. **O tamanho é padronizado e igual em todos os mundos** (`MWALL`): principais de 8,2 a 9,1 m na camada próxima e de 9,2 a 10,1 m ao fundo (do pé, 1,5 m abaixo do chão, até a ponta), nenhum pico abaixo de 5,5 m. O teto vem dos planetas do céu: o centro do mais baixo fica a 5,8° de elevação, então a linha das montanhas, vista da pior posição da câmera (19,4 m do centro, a 4,8 m de altura), fica em até 4,2° e nunca cobre um planeta. O que muda por mundo é só a mistura de proporções da base (needle 0,85×, alpine 1×, broad 1,2×, dune 1,35×), o tamanho dos grupos (`REL.g`) e a cor. **Cor e toon:** sem degradê, todas usam a **cor do solo do cenário** (a cor média do chão, `GAVG`, que é também a que o chão assume ao longe), uma cor por montanha. Todo pico fica com uma **aresta voltada para o centro**, então da colônia sempre se veem duas faces; cada face recebe uma de **3 faixas fixas de luz** (`MSHADE`: luz, meio-tom e sombra puxada para a cor de preenchimento do mundo), calculadas com a luz do mundo (`LDO`). Quando essa luz bate quase de frente num pico, ela é inclinada de lado (`MSIDE`) para o pico nunca ficar chapado. A **fileira de trás** fica mais clara e puxada para a cor da névoa (`MFAR`, perspectiva atmosférica), e uma **linha escura marca a aresta do meio** de cada pico. Em volta de cada tetraedro vai um **contorno fino e escuro** (o mesmo sólido ampliado com espessura igual em todas as faces, `tetraGrow`, visto só por dentro, quase preto e tingido pelo solo do mundo, ~1,5 px em qualquer distância; `OLH`). `mountPlan` é pura e determinística e tem testes.
- **Natureza**: pedras em *afloramentos* (um bloco grande, em formato de bloco, laje ou pedra alta, e alguns pequenos, com vãos livres entre os grupos) e plantas em *bosquetes* (`forestFlora`), em vez de espalhadas por igual. O espelhamento da metade norte (`mirrorDecor`) foi removido.

Peças fixas (casa lunar, horta, dois satélites com painéis solares do lado da casa, dois pares de aerogeradores do lado oposto, fogueira e bancos) continuam únicas e nunca saem na limpeza de sobreposições (`declutter`). As peças da colônia também são marcadas como únicas; o que encosta nelas é que sai.

As peças ganham um leve tom da rocha do mundo (`hullOf`, 14 %), o módulo habitacional varia por posição (painel no teto, anexo ou segunda janela) e em Panthara, o alagado, cada núcleo fica sobre uma plataforma de aço (`deck`).

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
- **Receitas:** 62 receitas (31 de panela, 31 de brasa; as 16 mais novas são da cozinha dos biomas, como feijoada, galinhada, creme de açaí e peixe pantaneiro) e 50 ingredientes, com 2 a 6 ingredientes diferentes, em qualquer ordem. A receita sai de **método + conjunto de ingredientes** (`recipeKey` no catálogo); cada conjunto vale uma receita só. Combinação que não é receita responde `nada` e não grava nada. O cliente só manda `cookdo` com o método, os ingredientes e um `rid`; o servidor acha a receita.
- **Desbloqueio:** cada receita dá um alimento novo (categoria **Receitas** da mochila, marcado `rc` no catálogo). Ele fica com cadeado na mochila até o jogador preparar a receita pela primeira vez, e depois fica liberado para sempre. O servidor também recusa pegar um alimento de receita que o jogador não desbloqueou (mensagem `item`), mesmo que o cliente peça. Quem não tem identidade autenticada não cozinha nem guarda progresso.
- **Estrela (renascimento):** no nível 999 aparece o botão ⭐ **Ganhar estrela** (dois toques). O cozinheiro volta ao nível 1 e ganha +1 estrela (+10% de experiência para sempre); receitas, alimentos desbloqueados, atributos e emblemas ficam. Sem limite de estrelas. Emblemas: Primeira Estrela, Cinco Estrelas e Constelação (10).
- **Progressão:** experiência (10 por ingrediente na primeira vez que a receita é feita, 3 nas repetições, com um bônus de 2 % por ponto de atributo, +1 % por nível e +10 % por estrela), níveis de 1 a 999 (até o 20 como antes, depois 1000 por nível) e três atributos que sobem com o uso: **Fogo** (receitas feitas), **Paladar** (receitas diferentes) e **Despensa** (ingredientes diferentes usados), cada um com o ponto igual à raiz quadrada do contador (até 10). Emblemas de cozinheiro: Aprendiz de Cozinha (1 receita), Cozinheiro de Fogueira (5 diferentes), Mestre da Panela (10 cozidas), Mestre do Braseiro (10 assadas), Chef (20 diferentes), Mestre-cuca (as 46 receitas clássicas) e Sabores do Brasil (as 16 receitas dos biomas, marcadas `b:1` no catálogo). O Mestre-cuca conta só as clássicas porque os emblemas são recalculados pelos contadores: se contasse "todas", cada receita nova tiraria o emblema de quem já tinha. Os emblemas ficam presos à identidade (não ao aparelho) e aparecem no perfil público quando ele está publicado (só o emblema; receitas e experiência não vão para lá); dentro do jogo aparecem no topo da janela de Culinária.
- **Persistência:** `data/cook.json` (`COOK_FILE`), 0600, gravação atômica agrupada; só uma receita que deu certo grava. Ao carregar, cada registro é validado (receitas e ingredientes que existem, contagens limitadas). Atributos e emblemas não são guardados: saem dos contadores.
- **Limites:** `cookget` 20/min; `cookdo` com intervalo mínimo de 1,2 s e 20/min por conexão.
- **Mudar sem quebrar:** ingrediente ou receita novos entram no fim das listas em `assets/catalog.js` (os testes em `tests/cook.test.js` conferem ingredientes existentes, combinação única por receita, nomes curtos e que todo ingrediente é usado). Não mude o id de uma receita: ele é o id do alimento e a chave do progresso salvo.
- **Listas que crescem (regras.md 12.1):** `vlist` mantém só as linhas visíveis no DOM, com cabeçalhos de grupo recolhíveis (estado salvo no navegador), busca fixa no topo, contagem "N de M" e teclas ↑ ↓ Home End. A mochila usa a mesma lista (Bebidas, Comidas, Receitas).
- **Tamanho do texto e da interface (regras.md 12.3):** as alturas das linhas de `vlist` acompanham o ajuste Texto (`--tx`; o ajuste dispara o evento `skyke:tx` e todas as listas se refazem), senão as linhas se sobrepõem com texto maior. O painel tem largura em `em` e altura dentro da área da interface; nível, XP e barra ficam numa linha que abre e fecha (atributos e emblemas dentro, escolha salva em `skyke_cook_prog`), e a lista da aba aberta fica com todo o espaço que sobra (no mínimo ~5 linhas). Cada receita ocupa duas linhas: nome e, embaixo, os ícones dos ingredientes. Quando a janela fica larga (texto grande no computador), Receitas e Preparo mostram a lista e os detalhes lado a lado.

## Fazenda

Código em `assets/catalog.js` (plantas: `CROPS`, grade `FARM_W` × `FARM_H` e `farmPlots`), `lib/farm.js` (regras e persistência), `assets/app-farm.js` (painel) e `fazenda.html` (página pública). Botão 🌱 na barra (grupo "Expressão", ao lado da Culinária).

- **Canteiros:** grade de 8 × 8. O **terreno comprado** abre os canteiros (`FARM_LAND`: de 6 a 64), sempre num retângulo que cresce a partir do canto (`FARM_ORDER`); o painel mostra o terreno aberto e mais uma linha e uma coluna fechadas, o que a próxima compra abre. No painel, tocar num canteiro vazio planta a semente escolhida, numa planta crescendo rega, numa pronta colhe; ⛏ liga o modo arrancar (tira a planta sem colheita). Plantar, Regar e Colher fazem o mesmo em todos os canteiros de uma vez (canteiro `-1`).
- **Plantas:** 58 (hortaliças, frutas, grãos, temperos, flores e especiais), de 2 min a 4 h para crescer, liberadas por nível (1 a 20). Cada uma tem experiência por colheita e uma faixa de quantidade colhida; 36 delas dão um ingrediente da Culinária (campo `g`), mostrado nos detalhes da semente.
- **Crescimento:** o servidor guarda só quando foi plantada (`a`) e quando fica pronta (`e`); não há timer por jogador. Regar (uma vez por plantio) corta 25 % do tempo que falta e soma +1 na colheita. O painel e a página pública desenham as barras de progresso no relógio do servidor (a diferença vai em `now` em cada resposta), uma vez por segundo e só com o painel aberto e a aba visível. Com o painel fechado, um intervalo de 5 s acende uma bolinha no botão 🌱 quando há colheita pronta.
- **Moedas e loja (aba 🏡 Loja):** cada unidade colhida vende pelo preço da planta (`$` no catálogo, um terço da experiência dela, no mínimo 1). Com as moedas o jogador compra, em níveis e com nível de fazendeiro mínimo: **terreno** maior (12 tamanhos, do Canteirinho com 6 canteiros à Terra a perder de vista com 64), **propriedade** maior (Sítio, Chácara, Fazenda, Grande Fazenda, Fazenda Modelo: +10 % a +40 % na colheita) e **casa** maior (Barraca, Casinha, Casa, Casarão, Mansão: +5 % a +20 % de experiência). O servidor confere nível e saldo; o cliente só diz o item. Não há troca de moedas entre jogadores. A página `/fazenda` desenha a casa (maior a cada nível) e a placa da propriedade no terreiro e mostra o terreno comprado; o saldo não é público, só o total de moedas ganhas nos recordes.
- **Progressão:** experiência por colheita (o triplo na primeira vez de cada planta), níveis de 1 a 999 (`lib/levels.js`, a mesma curva da culinária: até o 20 como antes, depois 1000 por nível; a experiência ganha cresce 1% por nível); o nível libera sementes e itens da loja.
- **Safra (renascimento):** no nível 999 aparece o botão 🌾 **Nova safra** (dois toques para confirmar). O fazendeiro volta ao nível 1 e ganha +1 safra, que dá +10% de experiência e +5% nas moedas para sempre; terreno, propriedade, casa, moedas, canteiros, recordes e emblemas ficam (as sementes voltam a liberar pelo nível). Não há limite de safras, então o sistema fica praticamente infinito. A sala recebe o aviso (`farmfx` com o número), o painel mostra 🌾 ao lado do nível, e o perfil e a página `/fazenda` mostram as safras. Emblemas: Primeira Safra, Cinco Safras e Lenda do Campo (10). Recordes pessoais: colheitas, total colhido, plantas diferentes, regadas, plantios, maior colheita e planta favorita. Conquistas: Primeira Semente, Horta Variada (10 plantas), Jardineiro (5 flores), Pomar Cheio (10 frutas), Regador (50 regas), Cesto Cheio (100 colheitas), Celeiro Lotado (1000 unidades), Sortudo (trevo da sorte), Fazendeiro de Verdade (nível 10) e Mestre da Fazenda (todas as plantas). Não são guardadas: saem dos contadores.
- **Página pública `/fazenda#código`:** mapa 2D em canvas (cerca, canteiros, plantas e barra de progresso em cada um), lista acessível das plantas crescendo com barras, recordes e conquistas ganhas; atualiza a cada minuto. Como o perfil, só existe para quem ligou o perfil público: `/farm.json` responde 404 sem ele e nunca leva o id de identidade nem o caderno completo de colheitas. No jogo, "Ver minha fazenda" e "Copiar link" ficam ativos só com o perfil público ligado. O perfil público ganha a seção 🌾 Fazenda (nível, barra de experiência, recordes e link para o mapa) e as conquistas entram na lista de emblemas.
- **Persistência:** `data/farm.json` (`FARM_FILE`, formato `v: 2`), 0600, gravação atômica agrupada; consulta não grava. Ao carregar, cada registro é validado (plantas que existem, canteiros dentro da grade, horários, moedas, níveis da loja e contagens limitados). O arquivo da primeira versão (`v: 1`, grade 6 × 6, canteiros pelo nível) é convertido: o jogador ganha o terreno que cabe pelo menos os canteiros que tinha, e as plantas vão para canteiros abertos. Máximo de 20 000 fazendas.
- **Antifraude:** ver [Segurança](seguranca.md#antifraude-da-fazenda-e-da-culinária).
- **Limites:** `farmget` 20/min; `farmdo` com intervalo mínimo de 150 ms e 120/min por conexão. Ação acima do limite responde `calma` (sem punir: tocar rápido em vários canteiros não é abuso), e o cliente espaça as ações em 200 ms. `/farm.json` 60/min por IP.
- **Mudar sem quebrar:** planta nova entra no fim de `CROPS`. Não mude o id de uma planta: ele é a chave dos canteiros e das colheitas salvas.

## Amigos (👥)

Código em `assets/app-social.js` (lista e ações) e `lib/social.js` (servidor). A janela é flutuante e arrastável pela alça do título, com X para fechar e mantida dentro da tela como as outras (`dragify`, `clampPanels` em `app-ui.js`).

- **Lista:** rolagem virtual (`vlist` com `fit`: encolhe até o conteúdo, sem sobrar espaço vazio), busca fixa no topo e grupos recolhíveis: Pedidos de amizade, Online, Offline (aberto quando ninguém está online ou quando são até 8), Nesta sala e Silenciados no global. O contador fica no título da janela, à direita, antes do X: uma etiqueta com o total de amigos e outra, com ponto verde, com quantos estão online (durante a busca, "N de M"); no estreito ele desce para a linha de baixo. A busca ocupa a largura toda.
- **Linhas enxutas:** cada linha tem um avatar com a inicial (cor estável tirada do nome, escura o bastante para a letra branca passar de 4,5:1) e o ponto de status por cima, o nome, a situação em texto curto (online, offline, nesta sala…) e no máximo uma ação rápida (📨 convidar quem está online, ➕ adicionar quem está na sala, ✔ aceitar pedido, 🔊 mostrar de novo).
- **Ações da pessoa:** tocar no nome abre, embaixo da lista, uma caixa com as ações escritas por extenso (Convidar, Perfil, Curtir, Recado, Mascote, Remover com confirmação, Aceitar ou Recusar). Os botões quebram a linha quando a interface ou o texto estão maiores; tocar de novo no nome ou no ✖ fecha a caixa.

## Vida do cenário

Código em `assets/app-life.js` (carregado depois de `app-colony.js`; `buildRoom` chama `lifeBuild(k)` no fim e o laço chama `lifeTick(dt)`).

- **Chuva passageira:** cada bioma tem uma chance de chover em cada janela de 5 minutos e uma faixa de duração (`RAIN`): chove em ~25 % do tempo em Amazora, ~19 % em Atlanthia, ~10 % em Panthara, ~4 % em Cerron e Pamphora e ~1 % em Caatara, em pancadas de 25 s a 3 min. O sorteio sai do relógio com um hash inteiro (`Math.imul`, igual em qualquer navegador), então todos da sala veem a mesma chuva sem mensagem no servidor. A chuva entra e sai em 8 s: 700 traços caindo em volta do jogador, luz difusa 22 % e luz do sol 50 % mais fracas (mesma conta do ajuste de brilho), névoa mais perto e acinzentada, céu e nuvens mais escuros, sol escondido e planetas apagados, e um som próprio no canal do ambiente (`rainSnd`, calibrado em `TRIM.rain`; `tools/audio-audit.js` mede a chuva junto com os ambientes).
- **Estrela cadente:** em ~metade das janelas de 40 s passa uma estrela (1,3 s), entre 13° e 6° de altura (a faixa do céu que a câmera vê, acima das montanhas e dos planetas mais baixos), na frente de quem olha. Não aparece com chuva forte.
- **Bichos 2D:** cada bioma tem aves voando em círculos acima das árvores e animais de chão andando entre a vegetação (`FAUNA`, 6 a 9 por bioma): araras, tucano, anta e onça em Amazora; arara-canindé, carcará, lobo-guará, ema e tamanduá-bandeira em Cerron; tucano-de-bico-verde, saíra-sete-cores, cutia e quati em Atlanthia; asa-branca, carcará, tatu-bola e calango em Caatara; tuiuiú, garça, capivara e jacaré em Panthara; quero-quero, cavalo crioulo e veado-campeiro em Pamphora. Cada espécie é desenhada por código numa faixa de 4 quadros (dois de animação, olhando para cada lado), com contorno na cor de contorno do mundo, e tingida pela luz do céu do bioma (sprites não recebem luz). Os animais andam entre 13,5 e 33 m da fogueira, desviam das pegadas que `declutter` deixa em `FOOT` e têm sombra no chão.
- **Partículas do ar (`PFX` em `app-scene.js`):** duas camadas por bioma: folhas e esporos (Amazora), sementes de paina e pólen (Cerron), gotículas de neblina e borboletas-azuis (Atlanthia), poeira e folhas secas (Caatara), borboletas-amarelas e insetos (Panthara), sementes de dente-de-leão e pétalas (Pamphora).
- **Som ambiente (`AMB` em `app-sound.js`):** só bichos de vez em quando, com silêncio entre eles (sem ruído contínuo de água, vento ou insetos, que soavam como mar ou chiado). Cada mundo tem aves do seu bioma além dos pássaros comuns: araras em Amazora, seriema em Cerron, sabiá em Atlanthia, rolinha e bem-te-vi em Caatara, bem-te-vi em Panthara e quero-quero em Pamphora; e ainda rãs, pererecas, coruja, pica-pau, cabra, gado e bolhas onde cabem. Para soar real, cada chamado sai de um ponto sorteado (`amSpot`: longe é mais baixo, mais abafado porque o ar come os agudos e com mais eco da mata, e vem de um lado no estéreo), os assobios têm envelope liso, deslizes e vibrato (`amTone`), as vozes de bicho passam por formantes, as "vogais" da garganta (`amVox`), a perereca é um trem de pulsos e o pica-pau tem estalo e ressonância da madeira, acelerando. O volume de cada bicho (`AMB_LV`) e de cada mundo (`TRIM`, `amb_*`) é calibrado por `tools/audio-audit.js`. A chuva é à parte (`rainSnd`) e não mudou.
- **Reduzir movimento** (preferência do sistema): sem estrela, sem pingos (a chuva fica no céu e no som), sem aves e com os animais parados; as partículas já ficavam paradas.
- **Custo:** até 9 sprites com sombra, 700 segmentos de linha só enquanto chove e um plano para a estrela.

## Música lofi

Código em `assets/lofi.js` (as composições e o leitor da notação) e `assets/app-sound.js` (o motor que toca). Tudo é sintetizado em Web Audio, sem arquivo de áudio.

- **Uma faixa por lugar:** a tela inicial tem a faixa `menu` ("Órbita"), o tutorial em quadrinhos aberto tem a `tutorial` ("Página Virada", em Fá maior, com koto dedilhado; entra e sai em fade quando o tutorial abre e fecha) e cada um dos 6 mundos tem a sua, com o mesmo id do mundo (por exemplo `amazora` = "Chuva em Amazora"). As faixas vieram dos mundos-base de cada bioma, com título novo; Atlanthia ganhou marimba, Pamphora trocou o koto por `pluck` (mais perto de um violão) e Panthara ficou mais lenta (62 BPM). Ao entrar na sala toca a do mundo; ao sair, a da tela inicial; ao trocar de mundo, a música troca junto, com a anterior sumindo devagar.
- **Composição original:** cada faixa tem 4 compassos de acordes estendidos (maj9, m9, 13, 7b9…), uma melodia escrita à mão, andamento (58 a 82 BPM), swing, ritmo, timbre da melodia (piano elétrico, sino, pluck, kalimba, flauta, marimba ou koto) e textura (chiado de vinil, oscilação de fita e passa-baixa abafado). A melodia toca duas vezes (a segunda mais enxuta) e depois só o ritmo e o piano descansam, num ciclo de 3 voltas. Há pequenas variações de tempo e de volume a cada nota para soar humano.
- **Notação:** acordes como `Ebmaj9 Cm9 Fm9 Bb13`; melodia com 16 posições por compasso (`G5 . . Bb5 - - .`, em que `.` é pausa e `-` prolonga a nota). O formato completo está no cabeçalho de `assets/lofi.js`; `tests/lofi.test.js` confere a notação, que toda faixa é distinta e que não sobra mundo sem música.
- **Volume:** canal próprio **Música lofi** nos Ajustes (padrão 60 %), com o nome da faixa anunciado embaixo. O botão da tela inicial liga e desliga a música em todo lugar. Cada faixa tem um ganho `mus_<id>` na tabela `TRIM`, calibrado para ficar em -24 dBFS (`CHROME=/usr/bin/chromium node tools/audio-audit.js`); recalibre depois de mexer numa faixa.
- **Tutorial em quadrinhos** (`#tut` no `index.html`, lógica em `assets/intro.js`): um quadrinho grande por vez, com ◀ Anterior / Próximo ▶, bolinhas para pular, setas, Home/End e arrastar para o lado no toque. A troca vira a folha presa pela lombada (para a frente a atual vai embora; para trás a anterior volta por cima), dentro do quadro, com o som `page` (papel); com redução de movimento, só esmaece. As imagens carregam quando o tutorial abre e são refeitas por `node tools/tutorial-shots.js`; os números do texto (mundos, rostos, cabelos, cores) são conferidos contra o catálogo em `tests/tutorial.test.js`.
- **Respeita a mídia:** a música para sozinha enquanto há vídeo, karaokê ou rádio tocando, ou com a aba escondida, e volta depois.
- **Mudar sem quebrar:** mundo novo precisa de uma faixa em `TRACKS` (o teste avisa). Dá para trocar acordes, melodia, ritmo e timbre à vontade; mantenha 16 posições por compasso e a melodia no registro de 62 a 92 (notas MIDI).

## Karaokê e vídeo

- **Tamanho do vídeo.** Nas janelas de Vídeos e Karaokê, a alça de redimensionar fica no canto inferior direito da janela (`.vgrip`, em `app-net.js`): arrastar muda o vídeo (sempre 16:9, entre 200 px e 88 % da largura / 60 % da altura da área da interface) e a janela acompanha, com a alça sempre no canto. Funciona com mouse, toque e setas do teclado; os botões ➖/➕ usam o mesmo limite (`vSize`). Antes era o canto nativo do CSS na caixa do vídeo, que ficava no meio da janela e não aceitava toque.
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

## Retorno das ações (som e imagem)

Toda ação concluída responde com som e imagem ao mesmo tempo, passageiros e proporcionais à ação.

- **Prato pronto:** a comida aparece flutuando sobre a fogueira, acima das cabeças, gira devagar no próprio eixo com partículas luminosas e um brilho, toca o som `cook_done` e some encolhendo e esmaecendo em ~4 s; só então vai para a mão. Quem está na sala vê o mesmo (o servidor manda `cookfx` só com o id de quem cozinhou e a receita) e ouve com o volume da distância. Nível novo ou emblema ganham um acorde a mais. O efeito é `lifeShow` (`app-life.js`), reaproveitável por outras ações; com "reduzir movimento" ele só aparece e esmaece.
- **Interface:** `fb(elemento, ok, som)` (`app-sound.js`) toca o som da ação (um instante depois do clique) e faz um pulso de brilho no elemento quando deu certo ou uma tremida curta no erro (`.fbok`/`.fberr`; com "reduzir movimento", contorno em vez de movimento). Vale para: ingrediente no espaço (som de pegar), espaços cheios, ingrediente repetido ou sem preparo, longe da fogueira, combinação que não dá em nada, lavar e descascar (sons próprios), pedido de amizade enviado e aceito, convite enviado, recado enviado ou recusado, curtida (❤️ sobre a cabeça) e denúncia.
- **Item na mão:** aparece crescendo na mão com um som curto, também para os outros jogadores.
- **Sino:** pedido e convite de amigo tocam o aviso quando entram no sino (os convites de mídia já tocam ao chegar).
- **Sons novos:** `erro`, `pickup`, `wash`, `peel` e `cook_done`, na escala de Dó, calibrados por `tools/audio-audit.js` (os quatro primeiros como interface, -27 dBFS; o prato pronto como ação, -23 dBFS).

## Avatar: rostos e nome personalizado

- **Rostos** (`FACES` no catálogo, pintados pixel a pixel na textura da cabeça em `headMat`, `assets/app-avatar.js`): 13 rostos. "Bochechas" tem o rosa abaixo do olho e fora do sorriso (antes a mancha subia por cima da borda de baixo do olho). "Óculos" tem armação redonda escura, ponte, hastes, lente levemente azulada só entre o olho e a armação (sobre a íris a mistura acinzentava o olho) com um reflexo, e sorriso suave mais baixo que a armação.
- **Nome personalizado** (aba **✨ Nome** do editor, com prévia): uma cor de `NCOL` (12 cores, mais a do tema) e um efeito de `NFX`: Brilho, Neon, Degradê, Aurora (degradê que corre), Arco-íris, Cintilar (brilho que pulsa), Relevo e Cometa (reflexo que atravessa o nome). São os campos `nc` e `nf` do visual, validados pelo servidor como os outros e salvos no navegador (o código de recuperação não os leva). O efeito vale no rótulo sobre a cabeça e no nome do chat da sala, só no nome (ícones fora), e é feito só com CSS (`.nfx`, `.nf1`… em `app.css`). No tema claro a cor vai misturada a 50 % de preto (`--nk`); a tela inicial, sempre escura, fixa o valor do escuro. No alto contraste todos os efeitos desligam; com "reduzir movimento", nada anima. `tools/contrast-audit.js` mede as 12 cores nos efeitos de cor sólida.

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
| Renomear o id de um mundo | `ST` no catálogo, as tabelas do mundo (`THEME`, `SKY`, `BUILD`, `MPAL` e as demais tabelas por id) e o id antigo em `ST_LEGACY` | Links e clientes antigos continuam caindo no mundo certo. |
| Adicionar uma cor de nome | **no fim** de `NCOL` no catálogo | Contraste de pelo menos 4,5:1 no painel escuro como está e no claro com 50 % de preto (`tests/namefx.test.js` confere). |
| Criar uma lista nova no catálogo | o catálogo e o `const {…}=SKYCAT` no começo de `assets/app-base.js` | O catálogo não cria variáveis globais: sem isso, o primeiro script que usar a lista para com ReferenceError e o jogo não carrega (`tests/catalog.test.js` confere). |

`npm test` confere tudo isso (`tests/catalog.test.js`): ordem das listas por posição (comparada com
`tests/catalog-order.json`), ids repetidos, ícone e animação de cada item e gesto, cenário de cada mundo, nomes curtos e se o
servidor aceita tudo o que o catálogo oferece. Cada falha diz o que corrigir.
