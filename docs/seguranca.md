# Segurança e moderação

Termos, filtro do chat, validação, denúncias, limites contra abuso e prova de trabalho. Volte ao [README](../README.md).

## Termos e filtro do chat

- **Idade e termos.** Na tela inicial a pessoa marca a caixa **Tenho 18 anos ou mais** e abre **Ler os Termos de Uso e a Política de
  Privacidade**. Nenhuma data de nascimento é pedida: fica salvo só "maior de 18 confirmado" (`skyke_adult`) no navegador, que não é
  enviado ao servidor. É autodeclaração.
- **Termos de Uso e Política de Privacidade** (documento único em `privacidade.html`, servido em `/termos` e `/privacidade`): Parte I
  (aceitação, responsável, idade, acesso, regras de convivência, conteúdo dos jogadores, moderação, garantias, software livre, lei) e
  Parte II (princípios, dados tratados com finalidade e prazo, voz, terceiros, bases legais da LGPD, direitos, segurança, menores,
  alterações, contato). No jogo ele abre numa **janela, sem nova aba**; a caixa "Li todo o documento e aceito" só libera depois de
  **rolar até o fim**, e o aceite fica salvo com a **versão** do documento (`skyke_terms`): se a versão mudar, o aceite é pedido de novo.
  Responsável e contato vêm de `PRIVACY_CONTROLLER` e `PRIVACY_EMAIL`; sem eles o documento mostra que faltam e o servidor avisa no log.
- **YouTube.** Antes de carregar o player pela primeira vez, uma janela explica que os vídeos e o karaokê vêm do YouTube (Google) e o que
  ele recebe; "Continuar" fica salvo no navegador (`skyke_yt_ok`). Os players usam o domínio `youtube-nocookie.com`.
- **Fonte.** A Manrope (licença SIL OFL, `assets/manrope-OFL.txt`) é servida pelo próprio servidor, com hash no nome; o navegador não
  fala com o Google Fonts.
- **Filtro de palavrões** (`lib/profanity.js`). O servidor troca palavrões do português do Brasil por símbolos como `!@#$%` antes de
  transmitir o chat (e antes de os bots lerem a frase). Entende maiúsculas, acentos, letras repetidas, números e símbolos no lugar de
  letras (`p0rra`, `c4ralho`) e separadores (`p.u.t.a`), e só censura palavras inteiras, então "computador" ou "pauta" passam.

## Segurança

- Trate `STATUS_TOKEN` como uma senha e não o versione.
- Em produção, sirva o jogo por HTTPS e mantenha o token em um gerenciador de
  segredos.
- O endpoint `/status.json` tem limite de tentativas para dificultar ataques de
  força bruta.
- Todo payload WebSocket passa por uma allowlist estrita em `lib/validate.js`:
  apenas campos conhecidos, tipos exatos, números finitos, inteiros dentro de
  faixas, booleanos e textos com limite. IDs do YouTube (`video`, `kjoin`,
  `ksong`) precisam ter exatamente 11 caracteres válidos e nunca são ecoados
  como vieram.
- Além dos limites por IP (`PERIP`, `PERIP_RATE`, `GLOBAL_RATE`, tentativas de
  sala, handshake e painel), cada conexão tem limites por ação (chat, movimento,
  emoji, item, gesto, vídeo, karaokê, WebRTC etc.). Spam persistente recebe
  close `1008`.
- **Antifraude da fazenda e da culinária** (`lib/guard.js`): o servidor já decide receita, crescimento, colheita e preços, então o cliente não inventa experiência nem moedas; o que sobra é repetir o que vale. Cada jogador (código público) é observado só na memória:
  - **Ritmo de robô:** 16 ações seguidas em menos de 4 s cada, com variação dos intervalos abaixo de 10 % (gente toca irregular), soma 3 pontos de suspeita; mais de 90 ações por minuto (rajada) soma 2. Os pontos caem 1 a cada 5 min.
  - **Resposta proporcional:** a partir de 5 pontos o ganho (experiência e moedas) cai pela metade; a partir de 10, as ações param por 10 min ("descanso", com o tempo que falta). Nada do que o jogador já tem é tirado.
  - **Cansaço do dia:** acima do teto de 24 h corridas (6000 de experiência na fazenda, 3000 na culinária) o ganho cai para metade, e acima do dobro para um quinto. O resultado avisa quanto foi cortado.
  - **Identidades em série:** cada origem (IP, ou bloco /48 no IPv6) abre no máximo 3 fazendas e 3 cozinhas novas por dia.
  - **Sem mercado:** não há troca de moedas nem de itens entre jogadores, então contas extras não conseguem passar ganho para a principal.
  - O painel `/status` mostra os sinalizados (código encurtado, pontos, motivo e descanso) e os contadores de detecção, sem nome nem IP.
- Os tetos do servidor inteiro têm fatia por IP, para um abusador não gastar o que é de todos: cada IP usa no
  máximo `GLOBAL_RATE/10` (mínimo 4) das admissões de WebSocket por minuto (o excesso dele é recusado sem contar no
  global), e no máximo 5 das 30 falas do chat global a cada 10 s, somando todas as conexões dele.
- Atrás de proxy, o IP real vem do `X-Forwarded-For` lido da direita para a
  esquerda, ignorando os hops confiáveis listados em `TRUST_PROXY`.
  `CF-Connecting-IP` é opt-in. Limites IPv6 usam `/64` para que um bloco
  inteiro não contorne `PERIP`/`HTTP_RATE`.
- Nomes passam por remoção de caracteres invisíveis (incluindo
  `Default_Ignorable_Code_Point`, U+2800 e separadores de linha) e não podem
  usar nomes reservados como "Karaokê", "Sistema", "Admin" ou "Skyke3D".
- O CSP não usa `'unsafe-inline'` em `script-src`; o jogo carrega de `/assets/`
  (`'self'`) e o script do painel entra como hash SHA-384 calculado no boot. O
  three.js é local. Em produção, `connect-src` só permite `'self'` e os hosts
  `wss://`/`https://` explicitamente permitidos. O YouTube entra em `script-src`
  só pelos caminhos da API do player (`/iframe_api` e `/s/player/`), não pelo
  host inteiro (em `www.youtube.com` há endpoints JSONP, brecha clássica de CSP).
  Toda resposta leva `Cross-Origin-Opener-Policy` e `Cross-Origin-Resource-Policy`
  `same-origin`.
- Blocos `<style>` só valem com hash SHA-384 calculado no boot (`style-src-elem`); `'unsafe-inline'` ficou restrito a atributos
  `style=""` (`style-src-attr`), que não executam código.
- `index.html`, `assets/` e o three.js ficam em memória, com `ETag` e `304`; o HTML não é
  relido do disco a cada requisição. O limite HTTP por IP reduz amplificação.
- Os timers do tick, das estatísticas e o handler HTTP têm `try/catch` com log
  limitado; erros de mensagem também são registrados. Clientes lentos são
  encerrados quando o buffer passa de 1 MiB.
- O TURN em produção exige `TURN_SECRET` e credenciais temporárias; veja a
  seção TURN para o modo de segredo compartilhado.
- O handshake exige `Host` e `Origin` únicos, válidos e compatíveis; o proxy
  precisa preservar o `Host`.
- Tokens de sessão têm 32 bytes aleatórios (base64url, 43 caracteres), são
  comparados em tempo constante, rotacionados a cada reconexão e mantidos
  somente em memória.
- Mensagens muito grandes são cortadas pelo limite de 32 KiB do WebSocket
  (close `1009`). Há um teto de 150 mensagens por segundo por conexão, além de
  um teto separado para sinalização WebRTC (300 por 10 s, com rajada de
  120/s). Excesso de sinalização é descartado, não vira violação.
- Em produção (`PUBLIC_URL` https) o Node envia `Strict-Transport-Security`
  (1 ano, `includeSubDomains`); em desenvolvimento (http) não envia, para não
  quebrar o acesso local. O proxy pode repetir o mesmo valor.
- `TICKET_MODE` padrão: `enforce` em produção (o WebSocket só abre com ticket) e
  `warn` em desenvolvimento. O `Host` das respostas HTTP não é validado (só o do
  WebSocket): nenhuma resposta HTTP reflete o `Host`, os endereços do jogo vêm de
  `PUBLIC_URL`, e as rotas sensíveis (`/status`) exigem token, então um `Host`
  forjado não ganha nada; validar derrubaria health checks de proxies que usam
  outro `Host`.

### Denúncias

O botão 🚩 da barra abre a janela de denúncia: escolhe-se um jogador humano da sala, o motivo (assédio, ódio, conteúdo sexual, spam, golpe ou dados pessoais, trapaça, outro) e um texto opcional de até 300 caracteres. A denúncia guarda o que é preciso para decidir uma punição:

- nome, ID do jogador e o **ID público do IP** (hash curto com segredo) de quem denuncia e de quem é denunciado;
- motivo e texto (as mensagens do chat **não são guardadas**: nem na sala, nem no global, nem nas denúncias);
- **quem falou na voz e quando** nos últimos 10 minutos (início e duração de cada fala, pelo indicador de fala do próprio jogador; o áudio nunca é gravado), marcando o denunciado;
- o IP **nunca** é guardado. Para banir, fica só a chave de banimento (hash com segredo), que não sai do servidor.

No painel `/status` → Moderação → **Denúncias** dá para ler, **banir o denunciado** (vale mesmo que ele já tenha saído) ou **arquivar**. Ficam até 500 denúncias por 30 dias em `data/reports.json` (`REPORTS_FILE`, `0` = só em memória). Com `DISCORD_REPORT_WEBHOOK` (URL de webhook do Discord), cada denúncia nova também gera um aviso no canal, sem menções e com o texto escapado, no máximo 20 por minuto.

Limites: uma denúncia a cada 15 s por conexão e 6 por hora por IP; repetir a mesma denúncia em 10 min não duplica; não dá para denunciar a si mesmo nem bots.

### Silenciar só para mim

Na mesma janela 🚩 dá para **silenciar** alguém: some o chat, os emojis, os gestos, os convites (vídeo e karaokê) e a voz dessa pessoa só para quem silenciou, e ela não fica sabendo. O jogo usa uma chave por jogador que é a mesma para o mesmo IP **dentro da mesma sala** (continua valendo se ele reconectar ou voltar com outro nome) e diferente em outra sala; a chave não revela o IP. A lista fica na aba do navegador (`sessionStorage`).
Com a voz pelo WebSocket (padrão), o navegador também avisa o servidor quem foi silenciado (`vmute`, só o id da sala), e o servidor deixa de mandar o áudio dessa pessoa para quem silenciou: a voz nem chega ao aparelho.

### Voz pelo WebSocket: o que o servidor vê

Na voz padrão (`VOICE_TRANSPORT=ws`, `lib/voicews.js`), o áudio sai do navegador já codificado (Opus ou ADPCM) e passa pelo servidor do jogo, que o repassa na hora para todos os participantes da sala que estão ouvindo e não silenciaram quem fala. Isso troca a garantia antiga da malha WebRTC ("o servidor nunca recebe o áudio") por estas, que são as que valem agora:

- o servidor **recebe** o áudio, mas não o decodifica, grava nem guarda: cada quadro vive só o tempo de ser repassado;
- o registro de voz das denúncias continua sendo só **quem falou e quando**;
- quem encerra o TLS (o proxy, ou a Cloudflare no túnel) também vê o áudio cifrado só até ele: não há cifra de ponta a ponta. Quem controlar o servidor ou o proxy pode, em tese, escutar;
- ninguém vê o IP de ninguém, sem depender de TURN nem da política `relay`;
- só passa quadro de quem está falando (`speak`), de até 600 bytes, até 50 por segundo e até 12 KB/s por pessoa; o excesso é descartado sem derrubar a conexão, e a voz nunca gasta o limite de mensagens do jogo. O teto de bytes limita a amplificação: uma voz real usa ~4 KB/s (Opus) ou ~8,5 KB/s (ADPCM), e o servidor repassa cada quadro a até 39 ouvintes;
- a voz tem um limite próprio de enxurrada: mais de 150 mensagens binárias por segundo numa conexão derrubam a conexão e contam no banimento progressivo, como a enxurrada de mensagens JSON. O cliente nunca manda mais de 50 por segundo (uma rajada depois de a aba travar é descartada no próprio navegador), então um jogador legítimo não chega perto desse limite;
- no navegador de quem ouve, 5 erros seguidos do decodificador Opus vindos da mesma pessoa (quadros inválidos de um cliente modificado) fazem a voz dela ser ignorada por 10 s, em vez de recriar o decodificador a cada quadro.

Para a garantia antiga, use `VOICE_TRANSPORT=webrtc` (com TURN).

### Brechas fechadas no teste ofensivo

- **Conexões lentas (slowloris):** cada IP pode ter no máximo `RAW_PERIP` (padrão 40) conexões TCP abertas, e a primeira requisição precisa chegar inteira em 10 s. Proxies confiáveis (`TRUST_PROXY`) ficam fora do limite.
- **Enxurrada de ofertas de voz:** por par de jogadores, no máximo 4 ofertas/respostas e 120 mensagens de sinalização a cada 5 s (antes, 120 ofertas por segundo podiam travar o navegador de quem recebia).
- **Nomes que imitam a equipe ou outro jogador:** "Moderação", "Staff", "Equipe", "Bot", variações com números (`m0d3r4d0r`), letras cirílicas/gregas parecidas e letras que se confundem entre si (`ADMlN`, `adm|n`, `admın`, `ᴀdmin`) viram "Visitante": o nome é comparado pelo "esqueleto" (tudo que parece uma letra vira a letra; i, l, 1 e `|` valem o mesmo). É uma tabela, não uma garantia: letras muito raras de Unicode ainda
  podem escapar, e novas parecidas entram em `LOOKALIKES` (`lib/validate.js`). **Nome único:** ninguém entra com um nome que já é de outra pessoa em qualquer sala, comparando sem acento, maiúsculas, espaços e letras parecidas (`Аna` com A cirílico, `ÂNA` e `a n a` contam como `Ana`). O servidor recusa e sugere um nome livre (`Ana2`), que o jogo oferece num clique: se o nome já está online com o mesmo código de recuperação (outra janela ou navegador), a mensagem avisa isso; nos demais casos, avisa que o nome é de outra pessoa. A posse é da chave do aparelho (a mesma do código de recuperação, nunca o IP): o dono continua dono mesmo offline e depois de reiniciar o servidor, e só quem tem o mesmo código de recuperação retoma o nome. O registro fica em `data/names.json` (`NAMES_FILE`; `0` desliga) como nome normalizado + hash com salt da chave, sem guardar a chave em texto. Para conter acúmulo, cada chave guarda no máximo `NAMES_PER_KEY` nomes (padrão 20; os mais antigos são liberados) e o registro inteiro tem o teto `NAMES_MAX` (padrão 100 mil).
- **Filtro de palavrões:** agora pega letras de largura cheia (`ｐｕｔａ`), letras cirílicas/gregas parecidas, até três separadores entre as letras, troca u/v e l/1, cadeias de números (`Pu74`) e abreviações com espaço ou ponto (`v s f`, `f.d.p`, `crlh`).

### Conta e recuperação (auditoria de 2026-11-05)

- **Carência da recuperação imposta pelo servidor.** Quem tem só a chave de recuperação pode pedir a troca da chave principal, mas ela só
  passa a valer depois de `IDENTITY_GRACE_HOURS` (padrão 24 h). O cliente pode pedir mais tempo, nunca menos (antes o navegador mandava
  `grace: 0` e a troca saía na hora, sem janela para o dono cancelar). Durante a carência, quem entra com a chave principal recebe o aviso na
  própria sessão (com a hora em que o pedido passa a valer) e cancela em 🔐 Segurança. Quem restaura a conta em outro aparelho espera a
  carência: o jogo guarda a chave nova e conclui sozinho na próxima entrada depois do prazo.
- **Registro de identidade custa.** Prova de trabalho (cresce com o ritmo de registros), teto diário de contas novas por origem e reciclagem
  de identidades que nunca autenticaram. O painel mostra quantas existem e quantas nunca foram usadas. Limite honesto: um atacante com muitas
  origens e CPU ainda consegue criar contas. A prova de trabalho é só um obstáculo (para quem tem código nativo custa cerca de 5 vezes
  menos que no navegador do jogador); o que limita de verdade é o teto diário por origem e a reciclagem em 24 h, e o painel mostra o
  crescimento para dar tempo de agir.
- **O desafio de login não revela quem existe**: a resposta de um id inexistente tem o mesmo formato e o mesmo custo de uma verificação
  real que a de um id existente.
- **Backup cifrado v2**: PBKDF2-SHA-256 com 600 mil voltas, cabeçalho autenticado e senha de 10+ caracteres; os backups v1 continuam abrindo.
- **Chave de recuperação fora do aparelho (SK-04).** O servidor já exigia as duas assinaturas (principal e recuperação) para trocar qualquer
  chave, mas as duas moravam no mesmo IndexedDB: um script da página, ou a cópia do perfil do navegador, levava as duas. Agora a chave de
  recuperação nasce na memória, vira o código (que o jogador guarda fora do aparelho) e é descartada: o IndexedDB guarda só a chave
  *pública* dela. Trocar a chave deste aparelho, gerar uma nova chave de recuperação e restaurar em outro aparelho pedem o código, colado na
  hora (a chave só existe na memória durante a operação). Logo depois de criar a conta, ou de gerar uma chave nova, ela fica na memória por
  até 10 minutos para o jogador copiar o código; depois some. Gerar uma chave nova mostra o código novo ANTES de a troca valer (e só deixa
  continuar depois de o jogador copiar ou mostrar o código); se a resposta do servidor se perder, a próxima entrada compara a geração que
  ele informa e avisa qual código vale. Quem nunca guardou o código continua jogando e a conta fica protegida por padrão (ninguém consegue
  trocar as chaves), mas não dá para restaurar em outro aparelho. **Contas criadas por versões antigas** ainda têm a chave no aparelho até
  o jogador colar o código em 🔐 Segurança → "Conferir meu código": essa conferência é a prova de que o código foi guardado, e só então a
  cópia do aparelho é apagada (até lá o risco antigo continua para essas contas). "Atualizar o código" monta outro igual, com os amigos e o
  visual de agora, a partir do código que o jogador cola. Limites honestos: o código pode vazar de onde o jogador o guardou (a carência de
  24 h com aviso e cancelamento cobre esse caso); um script malicioso na página ainda consegue usar a chave principal enquanto ela está
  aberta e capturar o código se o jogador o colar naquele momento (a defesa é a CSP); e perder o código significa não poder restaurar em
  outro aparelho nem trocar as chaves.

### Passkeys, código de uso único e registro de eventos (2026-11-07)

Continua sem conta tradicional: não há e-mail, senha nem cadastro, e nada usa "impressão digital" do navegador para
reconhecer alguém. A identidade são só chaves; as passkeys entram como alternativa ao código de recuperação, que continua igual.

- **Passkeys (WebAuthn) como alternativa ao código.** Em 🔐 Segurança o jogador cadastra quantas quiser, até 10 (celular,
  computador, chave física); se perder uma, entra com outra. Na tela inicial, "🗝️ Entrar com passkey" funciona num aparelho
  sem nada guardado: o navegador gera uma chave principal nova (não exportável) e o servidor troca a antiga **na hora**, sem a
  carência do código, porque a passkey fica presa ao autenticador e pede a digital, o rosto ou o PIN dele (exigimos
  `userVerification: required` e conferimos os sinais UP e UV). Entrar assim derruba as sessões abertas, desconecta o
  aparelho antigo e cancela um pedido de recuperação em carência (quem tem a passkey é o dono). O servidor confere tudo em
  `lib/webauthn.js`, sem dependências: desafio de 32 bytes de uso único e preso à conexão (vence em 2 min), origem e hash do
  rpId (o domínio do jogo; por IP ou http fora de `localhost` não funciona), tipo da operação, `crossOrigin`, assinatura
  (ES256, EdDSA ou RS256 de 2048+ bits) e o contador de assinaturas: se uma chave física "volta" o contador, a entrada é
  recusada como possível clone. Sem atestado (`attestation: none`): o fabricante não importa, só que é a mesma passkey. O
  registro guarda só chave pública, id, contador, apelido e datas.
- **Código de recuperação de uso único.** O servidor nunca recebeu o código e continua sem receber: ele guarda só a chave
  pública de recuperação, o que é mais forte do que guardar um hash do código (não existe nada no servidor que, vazado, deixe
  testar códigos). Agora o código também vale **uma vez**: restaurar com ele gera, ainda na tela inicial, a chave de
  recuperação nova e mostra o código novo ANTES do pedido; o pedido leva a chave pública nova, assinada junto. Quando a
  carência vence, a troca aplica as duas de uma vez: a chave do aparelho antigo e o código usado deixam de valer. Até lá o
  código antigo continua valendo (o dono pode cancelar). O servidor recusa pedidos sem a chave nova e pedidos que repetem a
  chave atual.
- **Tudo renovado depois da recuperação.** Recuperação aplicada (código ou passkey) muda a geração e a época: todos os tokens
  antigos morrem, as conexões da chave antiga caem (inclusive quando a carência vence sozinha, no meio de outra operação) e o
  aparelho novo recebe uma sessão nova. Em seguida o jogo oferece **revogar as passkeys** cadastradas, que podiam estar no
  aparelho perdido. Os tokens de sessão ficam na memória do servidor só como SHA-256.
- **Tentativas automatizadas.** Cada mensagem de passkey tem limite por conexão e por IP (desafios 30/min, entradas 10/min),
  falhas contam junto com as das outras provas de identidade (a 21ª em 10 min conta para o banimento progressivo do IP) e, por conta, 10
  falhas de passkey em 10 min bloqueiam a entrada por passkey dela até a janela passar (o código continua valendo). Toda
  falha de entrada responde igual (`pk-fail`): não dá para descobrir se uma passkey existe nem de quem é. A exceção é o
  bloqueio (`pk-locked`), que só aparece depois de 10 falhas com o id de uma passkey cadastrada (um valor aleatório de 16+
  bytes que só o autenticador do dono conhece).
- **Registro de eventos de segurança** (`lib/seclog.js`, `SECURITY_LOG`): criação de conta, falhas de prova, troca de chaves,
  pedido, aplicação e cancelamento de recuperação, revogação de sessões, e cadastro, uso, falha, suspeita de clone e
  revogação de passkeys. Nunca entra segredo (chave, código, token, desafio, assinatura) nem IP: a conta, a origem e a passkey
  entram como HMAC com um segredo do servidor, e o código da origem muda a cada dia. O painel mostra os últimos eventos.

Limites honestos: uma passkey sincronizada (iCloud, Google) é tão segura quanto a conta da nuvem que a sincroniza; quem tem
uma passkey cadastrada troca a chave principal na hora, sem carência, então revogue em Segurança a que não reconhecer. Entrar
com passkey traz a conta (nome reservado, fazenda, culinária, emblemas, perfil), mas o visual e a lista de amigos ficam só no
navegador e no código de recuperação.

### Abuso, multi-conta e prova de trabalho

O jogo não tem contas: cada participante é uma conexão anônima identificada
pelo IP (IPv4 completo ou IPv6 `/64`). As defesas contra scripts que abrem
centenas de conexões são:

- **Simultâneo + acumulado.** `PERIP` limita conexões ao mesmo tempo;
  `PERIP_RATE` limita conexões novas por 10 minutos (reconexões `resume` não
  contam); `GLOBAL_RATE` limita o total de handshakes por minuto.
- **Fair-play por sala.** `PERIP_ROOM` impede que um mesmo IP ocupe várias
  cadeiras da mesma sala; nomes repetidos recebem sufixo (`Nome 2`).
- **Banimento progressivo.** Violações repetidas, origem/host inválidos,
  códigos de sala errados em série, excesso de admissões e flood de mensagens
  geram banimentos de 2 min, 30 min e 6 h. Sem novo strike por 24 h o histórico
  zera. Os banimentos são gravados em `BAN_FILE` (padrão `data/bans.json`, modo
  `0600`) como hashes com salt, com escrita atômica e debounce. `BAN=0` desliga;
  `BAN_FILE=0` mantém só em memória.
- **Ticket de admissão com prova de trabalho.** Com `TICKET_MODE=enforce`, cada
  WebSocket precisa de `?ticket=...` emitido por `GET /ticket`. O ticket é
  assinado com HMAC, expira em 60 s, só vale para o mesmo IP e não pode ser
  reutilizado. Sob pressão o servidor exige até `POW_MAX` bits de zero em
  `SHA-256(challenge:nonce)`: um hash para verificar, 2^d hashes para o
  cliente. Em regime normal a dificuldade é 0. Use `warn` primeiro (aceita sem
  ticket e mede) e só depois `enforce`.
- **Ajuste para CGNAT.** Vários dispositivos atrás do mesmo IP compartilham
  `PERIP`, `PERIP_RATE` e `PERIP_ROOM`. Se a rede for grande, aumente os três
  juntos; os banimentos só disparam com sinais fortes para não punir NAT.
- **Limites por processo.** `limiter`, `conns` e `bans` vivem na memória do
  processo. Com cluster/PM2 os limites são multiplicados por instância; use
  uma instância só, sticky por IP ou um armazenamento compartilhado.
- O painel `/status.json` (com token) expõe `abuse` com contadores de rejeição,
  bans ativos e as chaves com mais conexões.

## Amigos e chat global

- **Sem contas e quase nada em disco** (`lib/social.js`): a chave de amigo e a lista ficam no navegador; o servidor só mantém, na
  memória e enquanto a pessoa está numa sala, o id de amigo (hash da chave) e a lista de ids que ela segue. A exceção é a reserva
  de nome: `data/names.json` guarda o nome normalizado e um hash com salt da mesma chave, para o dono continuar dono offline e entre
  reinícios — sem IP e sem a chave em texto.
- **Sem rastreio entre sessões:** o id de amigo é estável, por isso não é mostrado a estranhos. Na lista da sala (`pfid`) e no chat
  global (`gchat`) vai um apelido aleatório da conexão, novo a cada entrada. O pedido de amizade usa esse apelido; o id só é revelado
  a quem a pessoa pede (`freq`) ou aceita (`facc`) amizade.
- **Sem oráculo de presença:** presença e convites só entre amigos dos dois lados, e um pedido que não pode ser entregue recebe sempre
  a mesma resposta, esteja a pessoa online, longe ou inexistente. Quem lista o id de alguém sem ser amigo mútuo não recebe nada, nem
  "offline" (a auditoria de 2026-11-05 achou que recebia `on:0` só quando a pessoa estava online; corrigido e testado).
- **Anti-spam:** pedido só para quem está na sala ou falou no global há 10 min (1 por par a cada 10 min); global com 20 s mínimos na
  sala, 140 caracteres, links trocados por 🔗, filtro de palavrões, sem repetir em 1 min, limite por pessoa e teto do servidor.
- **Nenhuma mensagem guardada:** nem do chat da sala, nem do global (sem histórico), nem nas denúncias.
- **Código de recuperação** com a chave e os ids dos amigos (sem nomes nem mensagens): montado no navegador enquanto a chave está na
  memória (conta nova ou chave nova), mascarado no Perfil e nunca enviado ao servidor.
