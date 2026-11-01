# Segurança e moderação

Termos, filtro do chat, validação, denúncias, limites contra abuso e prova de trabalho. Volte ao [README](../README.md).

## Termos e filtro do chat

- **Idade e termos.** Na tela inicial a pessoa informa a **data de nascimento** (dia, mês e ano) e abre **Ler os Termos de Uso e a Política
  de Privacidade**. A idade é calculada só no navegador e a **data não é guardada nem enviada**: fica salvo apenas "maior de 18 confirmado"
  (`skyke_adult`). Datas impossíveis (31/02) são recusadas, e quem informa uma data de menor de 18 fica 24 h sem poder tentar de novo
  naquele navegador. Ainda é autodeclaração.
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
  `wss://`/`https://` explicitamente permitidos.
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
- Adicione HSTS no proxy HTTPS; o Node não envia esse cabeçalho para não
  quebrar o modo desenvolvimento em HTTP.

### Denúncias

O botão 🚩 da barra abre a janela de denúncia: escolhe-se um jogador humano da sala, o motivo (assédio, ódio, conteúdo sexual, spam, golpe ou dados pessoais, trapaça, outro) e um texto opcional de até 300 caracteres. A denúncia guarda o que é preciso para decidir uma punição:

- nome, ID do jogador e o **ID público do IP** (hash curto com segredo) de quem denuncia e de quem é denunciado;
- motivo e texto (as mensagens do chat **não são guardadas**: nem na sala, nem no global, nem nas denúncias);
- **quem falou na voz e quando** nos últimos 10 minutos (início e duração de cada fala, pelo indicador de fala do próprio jogador; o áudio nunca é gravado), marcando o denunciado;
- o IP **nunca** é guardado. Para banir, fica só a chave de banimento (hash com segredo), que não sai do servidor.

No painel `/status` → Moderação → **Denúncias** dá para ler, **banir o denunciado** (vale mesmo que ele já tenha saído) ou **arquivar**. Ficam até 500 denúncias por 30 dias em `data/reports.json` (`REPORTS_FILE`, `0` = só em memória). Com `DISCORD_REPORT_WEBHOOK` (URL de webhook do Discord), cada denúncia nova também gera um aviso no canal, sem menções e com o texto escapado, no máximo 20 por minuto.

Limites: uma denúncia a cada 15 s por conexão e 6 por hora por IP; repetir a mesma denúncia em 10 min não duplica; não dá para denunciar a si mesmo nem bots.

### Silenciar só para mim

Na mesma janela 🚩 dá para **silenciar** alguém: some o chat, os emojis, os gestos, os convites (vídeo e karaokê) e a voz dessa pessoa só para quem silenciou, e ela não fica sabendo. O jogo usa uma chave por jogador que é a mesma para o mesmo IP **dentro da mesma sala** (continua valendo se ele reconectar ou voltar com outro nome) e diferente em outra sala; a chave não revela o IP. A lista fica só na aba do navegador (`sessionStorage`).

### Brechas fechadas no teste ofensivo

- **Conexões lentas (slowloris):** cada IP pode ter no máximo `RAW_PERIP` (padrão 40) conexões TCP abertas, e a primeira requisição precisa chegar inteira em 10 s. Proxies confiáveis (`TRUST_PROXY`) ficam fora do limite.
- **Enxurrada de ofertas de voz:** por par de jogadores, no máximo 4 ofertas/respostas e 120 mensagens de sinalização a cada 5 s (antes, 120 ofertas por segundo podiam travar o navegador de quem recebia).
- **Nomes que imitam a equipe ou outro jogador:** "Moderação", "Staff", "Equipe", "Bot", variações com números (`m0d3r4d0r`) e letras cirílicas/gregas parecidas viram "Visitante". **Nome único:** ninguém entra com um nome que já é de outra pessoa em qualquer sala, comparando sem acento, maiúsculas, espaços e letras parecidas (`Аna` com A cirílico, `ÂNA` e `a n a` contam como `Ana`). O servidor recusa e sugere um nome livre (`Ana2`), que o jogo oferece num clique: se o nome já está online com o mesmo código de recuperação (outra janela ou navegador), a mensagem avisa isso; nos demais casos, avisa que o nome é de outra pessoa. A posse é da chave do aparelho (a mesma do código de recuperação, nunca o IP): o dono continua dono mesmo offline e depois de reiniciar o servidor, e só quem tem o mesmo código de recuperação retoma o nome. O registro fica em `data/names.json` (`NAMES_FILE`; `0` desliga) como nome normalizado + hash com salt da chave, sem guardar a chave em texto. Para conter acúmulo, cada chave guarda no máximo `NAMES_PER_KEY` nomes (padrão 20; os mais antigos são liberados) e o registro inteiro tem o teto `NAMES_MAX` (padrão 100 mil).
- **Filtro de palavrões:** agora pega letras de largura cheia (`ｐｕｔａ`), letras cirílicas/gregas parecidas, até três separadores entre as letras, troca u/v e l/1, cadeias de números (`Pu74`) e abreviações com espaço ou ponto (`v s f`, `f.d.p`, `crlh`).

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
  a mesma resposta, esteja a pessoa online, longe ou inexistente.
- **Anti-spam:** pedido só para quem está na sala ou falou no global há 10 min (1 por par a cada 10 min); global com 20 s mínimos na
  sala, 140 caracteres, links trocados por 🔗, filtro de palavrões, sem repetir em 1 min, limite por pessoa e teto do servidor.
- **Nenhuma mensagem guardada:** nem do chat da sala, nem do global (sem histórico), nem nas denúncias.
- **Código de recuperação** com a chave e os ids dos amigos (sem nomes nem mensagens): montado no navegador, mascarado no Perfil e
  nunca enviado ao servidor.
