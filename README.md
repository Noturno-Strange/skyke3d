# Skyke3D

Jogo 3D multiplayer com salas, bots, karaokê e vídeo, servido por Node.js e WebSocket.

## Requisitos

- Node.js 18 ou superior
- npm

## Executar localmente

```bash
npm install
npm start
```

Depois abra:

```text
http://localhost:3000
```

Para usar outra porta:

```bash
PORT=8080 npm start
```

Sem `PUBLIC_URL`, o servidor sobe em **modo desenvolvimento**: aceita
handshakes de loopback, faixas privadas (`10/8`, `172.16/12`, `192.168/16`),
CGNAT (`100.64/10`), IPv6 ULA (`fc00::/7`) e nomes `*.ts.net`. O `Host` e o
`Origin` continuam obrigatórios e precisam combinar entre si.

A voz é privada por padrão e precisa de um servidor TURN (veja
[Voz privada e TURN](docs/producao.md#voz-privada-e-turn)). Para testar a voz localmente sem TURN:

```bash
VOICE_PRIVACY=direct npm start
```

## Testes

```bash
npm test
```

A suíte usa apenas `node:test` e o `ws` já instalado — não há dependências
novas. Ela cobre validação estrita, handshake, criação/entrada em salas,
limites por ação, ticket de admissão com prova de trabalho, banimento
progressivo, reconexão com rotação de token, expiração da sala, IP real
com `X-Forwarded-For`/`CF-Connecting-IP`, agrupamento IPv6 por `/64`, TURN,
CSP com hashes, ETag/cache do HTML e dos arquivos estáticos e os controles de
vídeo/karaokê, a compressão e os assets com hash, a moderação por IP e as
métricas do painel. Os testes de integração iniciam o servidor em uma porta
efêmera (via `tests/harness.js`) e usam uma janela curta de `RECONNECT_MS`; eles são
pulados sozinhos quando `ws` ou `vendor/three-r186.min.js` não existem.

### Checagem de tipos

```bash
npm run check
```

O TypeScript (só para desenvolvimento, em `devDependencies`) confere os tipos do
servidor e dos módulos compartilhados com o navegador (`assets/catalog.js` e
`assets/recovery.js`), sem gerar arquivos: o código continua em JavaScript, com
anotações JSDoc onde o TypeScript precisa de ajuda (o formato da sala e do jogador
fica em `lib/room.js`). A lista fica em `tsconfig.json`. O modo `strict` está
ligado por partes (`strictNullChecks`, `noUnusedLocals`...); falta `noImplicitAny`.
Os scripts do jogo (`assets/app-*.js`) dividem variáveis globais entre si e entram
na checagem quando forem convertidos em módulos ES.

### Lint e formatação

```bash
npm run lint           # ESLint no servidor, nos testes e nas ferramentas
npm run format         # Prettier em server.js, lib/ e tools/
npm run format:check   # o mesmo, só conferindo (o CI roda este)
```

O cliente (`assets/`, `*.html`) e os testes ficam fora do Prettier: muitos testes
de regressão comparam trechos exatos do código do jogo. Para conferir o código do
servidor como texto, use `serverSource()` e `hasCode()` de `tests/server-source.js`,
que juntam `server.js` e `lib/` e ignoram a formatação.

## Documentação

- [Produção e operação](docs/producao.md): domínio e HTTPS, Nginx, Caddy, Cloudflare
  Tunnel, voz privada e TURN, Tailscale, variáveis de ambiente e supervisão.
- [Painel de status](docs/painel.md): token, métricas, recordes, desempenho, teste de
  carga, capacidade e moderação por IP.
- [Segurança e moderação](docs/seguranca.md): termos, filtro do chat, validação,
  denúncias, silenciar, limites contra abuso e prova de trabalho.
- [Como o jogo funciona](docs/funcionamento.md): estáticos com hash, reconexão, voz,
  karaokê e vídeo, bots, DJ, notificações e como mudar nomes, itens e cores.

## Instalar como aplicativo

O Skyke3D pode ser instalado como aplicativo (PWA) no Windows, no Linux, no Mac,
no Android e no Chromebook: no Chrome ou no Edge aparece **Instalar** na barra de
endereço (no celular, **Adicionar à tela inicial**). Ele abre em janela própria,
com ícone, e continua sendo o mesmo jogo do site, sempre atualizado.

- `pwa/manifest.webmanifest`: nome, cores e ícones (`pwa/icon-192.png`,
  `pwa/icon-512.png` e `pwa/icon-maskable-512.png`, gerados a partir do favicon).
- `pwa/sw.js`: service worker que **não guarda nada** (sem cache e sem dados do
  jogador). Ele só atende a abertura da página e, sem internet, mostra um aviso
  "Sem conexão" no lugar da página de erro. O jogo precisa da rede para jogar.
- O servidor entrega esses arquivos em `/manifest.webmanifest`, `/sw.js` e
  `/icon-*.png`. A instalação exige HTTPS (ou `localhost`).

### Exemplo de aplicativo para Linux (Tauri)

O Skyke3D é jogado pelo navegador; não há aplicativo oficial para baixar. A pasta
`desktop/` é só um **exemplo** para quem quiser montar o próprio aplicativo (por
exemplo, para o seu servidor) ou estudar e melhorar o código. Ela não é compilada
nem publicada a cada versão.

É uma janela Tauri que abre o site do jogo:

- A página **não recebe nenhuma permissão** do Tauri (sem acesso a arquivos ou ao
  sistema). Ela só navega no próprio site; links para outros endereços (GitHub,
  Discord...) abrem no navegador do computador.
- Voz: o microfone e o WebRTC do WebKitGTK são ligados e o pedido de microfone
  só é aceito quando vem do site configurado.
- O endereço vem de `SKYKE_URL` na hora de compilar (sem ela, abre
  `http://localhost:3000/`). A versão vem do `package.json`.

Para compilar um `.rpm` (precisa de Rust e, no openSUSE, de `webkitgtk3-devel
gtk3-devel dbus-1-devel libsoup-devel libappindicator3-devel`):

```bash
cd desktop
SKYKE_URL=https://seu-servidor/ npx @tauri-apps/cli@2.12.3 build --bundles rpm
```

O pacote fica em `desktop/src-tauri/target/release/bundle/rpm/`. Pacotes montados no
Ubuntu para outras distribuições (como o AppImage) podem levar bibliotecas de TLS que
não acham os certificados do sistema; compilar na própria distribuição evita isso.

## Página inicial

Ao abrir o jogo, uma página inicial aparece antes da janela de entrada, com:

- **Jogar**: fecha a página inicial e abre a janela do jogo (nome, cenário e sala).
- **Discord**: abre o servidor da comunidade em uma nova aba.
- **GitHub**: abre o repositório do projeto em uma nova aba.
- **Cinematic**: animação em canvas gerada por código (sem vídeos ou imagens
  externos), que apresenta os dezesseis mundos, a voz, o karaokê e os vídeos.
  Ela pausa quando a aba fica oculta e respeita `prefers-reduced-motion`
  (nesse caso mostra um quadro estático).

O código está em `assets/intro.js` e o HTML em `index.html`.

O motor 3D é o three.js r186 (0.186.1), servido localmente em
`/vendor/three-r186.min.js`, sem depender de CDN e com cache imutável. O three.js
atual só vem como módulo ES; o arquivo é um pacote único gerado com esbuild que
expõe `window.THREE` (a licença MIT fica no fim do arquivo). Para gerar de novo:

```
npm pack three@0.186.1 && tar -xzf three-0.186.1.tgz
echo "import * as T from './package/build/three.module.js';window.THREE=Object.assign({},T);" > entry.js
npx esbuild@0.25.0 entry.js --bundle --minify --format=iife --legal-comments=eof --target=es2020 --outfile=vendor/three-r186.min.js
```

Para manter o visual afinado no r128, `assets/app-base.js` desliga a gestão de cor
automática (`THREE.ColorManagement.enabled=false`), multiplica as intensidades das
luzes por π (o three.js atual não tem mais as luzes "legadas") e devolve à luz da
fogueira a queda antiga, `(1 - d/alcance)^queda`.

## Amigos e chat global

- **Chat global:** o chat tem duas abas no próprio título, **💬 Sala** e **🌎 Global**, com contador de mensagens não lidas. O mesmo campo de texto
  manda para a aba aberta. Clicar no nome de quem falou no global mostra **➕ Amigo** e **🔇 Silenciar** (silenciar vale só para você).
- **Amigos:** o botão **👥** na barra de cima abre um painel compacto com os pedidos recebidos (✔/✖), os amigos (online primeiro, com
  **📨** para convidar para a sua sala) e quem está na sala e ainda não é amigo (**➕**). Pedidos e convites também chegam no sino 🔔.
- **Contadores:** a aba Global mostra quantas pessoas estão online em todas as salas (atualiza a cada 10 s, só quando muda) e o botão
  👥 mostra quantos amigos estão online (em verde) ou, quando há, quantos pedidos esperam resposta.
- **Código de recuperação com amigos:** o código do Perfil leva também a chave e os ids dos amigos (até 40; sem nomes nem mensagens).
  Restaurar em outro aparelho traz a mesma identidade para os amigos e junta a lista; os nomes voltam quando cada amigo aparece online.
- **Sem conta e sem dados guardados:** a lista de amigos e uma chave aleatória ficam só no navegador (`skyke_fk`, `skyke_friends`). O
  servidor (`lib/social.js`) usa a chave para calcular um id público de 12 caracteres e esquece tudo quando a pessoa sai da sala.
- **Contra abuso:** presença e convites só entre amigos **dos dois lados**; pedido de amizade só para quem está na mesma sala ou falou no
  global nos últimos 10 minutos, um por par a cada 10 minutos, e recusar não avisa ninguém. No chat global: 20 s na sala antes de falar,
  até 140 caracteres, links viram 🔗, filtro de palavrões, a mesma frase não repete em 1 minuto, limite por pessoa e teto de mensagens
  para o servidor inteiro. Tudo passa pela validação estrita (`lib/validate.js`) e pelos limites por tipo de mensagem.

## O jogo: mundos, câmera e sons

**Mundos (16).** Cada um tem fogueira central, troncos, tocos, cenário de fundo e música ambiente próprios:
Proxima, Kepler, Gliese, Osíris, Tauri, Esmera, Ambar, Nyx, Lumen, Duna, Mira, Sakura, Nivis, Cinder, Trappist e Draugr.
Os nomes são só de exibição (`ST` em `assets/app-base.js` e `NAMES` em `status.html`); a id interna usada no protocolo é o nome em
minúsculas e sem acento (`proxima`, `osiris`...). O servidor ainda aceita as ids antigas (`aeris`, `brontis`, `cryon`, `pyra`,
`sylvaris`, `verdara`, `ambara`, `nyxara`, `lumeris`, `dunara`, `mycelis`, `rosara`, `nivara`, `cindara`, `marinis`, `umbris`)
na criação de sala e as converte (`STY_LEGACY` em `lib/validate.js`), para que páginas desatualizadas continuem funcionando.

**Cenário.** Atrás da fogueira (ao norte) fica uma casa lunar de sacos de terra (superadobe) e, do lado oposto (ao sul), uma **estufa em cúpula**: vidro com nervuras, base de pedra, porta em arco voltada para a fogueira, canteiro em anel com as flores do mundo, árvore florida num pedestal, caminho de lajotas e luzinhas penduradas; as cores do vidro, das flores e das folhas mudam com o mundo. Há também quatro satélites com painéis solares em posições simétricas, árvores, arbustos, rochas e manchas de cor no chão (com borda esfumada e a mesma claridade do chão, para não parecerem sombras). Cada objeto tem uma sombra de contato macia; a estufa não tem (já tem base própria) e nos satélites ela fica só sob a base e os pés dos postes. O cenário é espelhado (cópia girada 180°) e passa por uma limpeza que tira objetos sobrepostos ou dentro das encostas das montanhas; casa, estufa, satélites e o centro são peças únicas e nunca saem. As montanhas têm o mesmo formato alpino em todos os mundos, com cores e neve de cada bioma, num anel de 360°.

**Avatar.** A caixa **✨ Cores brilhantes** (no editor da tela inicial e na janela Visual da barra) liga ou desliga o brilho de **pele, olhos, cabelo, chapéu, camisa, calça e calçado** de uma vez. Ligada, cada cor troca pela sua **cor par brilhante** (`GLOSS` em `assets/catalog.js`, mesmo índice: mesmo tom, mais saturada; preto vira preto lustroso, branco vira pérola, cinza vira prata; na pele a mudança é leve) com pequenos pontos de luz sobre a cor (mais fracos no cabelo; nos olhos, íris com anel e reflexo duplo). Desligada, volta à cor normal com o visual de desenho (toon) liso, sem reflexo. As cores do avatar são lidas como sRGB (no three r128 as cores em texto `'#rrggbb'` ficavam claras e lavadas), então a cor escolhida na paleta é a que aparece no jogo. A paleta do editor mostra as cores do estado atual. Na rede continuam as chaves `tb`, `eb`, `rb`, `hb`, `sb`, `pb` e `cb` (0 ou 1), sempre com o mesmo valor. Um visual salvo com brilho em só algumas peças, ou com a antiga opção `br`, abre com a caixa ligada. As abas do editor são Corpo, Cabelo (com o chapéu) e Roupas, do mesmo tamanho numa linha. São 16 cores de pele, 16 cores de olhos, 34 cabelos, 40 cores de roupa, chapéu e calçado e 32 cores de cabelo. Entre elas há **cores brilhantes**
(rubi, safira, esmeralda, ametista...) e **preto brilhante**: cores escuras e profundas ganham um reflexo de luz no shader, como uma peça
laqueada. O editor é compacto: cada linha tem um rótulo curto (Rosto, Pele, Olhos, Cabelo, Chapéu, Camisa, Calça, Calçado), setas ◀ ▶
para o estilo e, ao lado, um botão com a cor atual que abre a paleta inteira em grade logo abaixo da linha (uma por vez; fecha no mesmo
botão, com Esc ou ao trocar de aba; as setas do teclado andam pela grade). O avatar e o nome ficam salvos só
neste navegador (`localStorage`, nada vai ao servidor) e voltam na próxima visita; o botão **Esquecer meus dados** (tela inicial e Ajustes)
apaga tudo e para de gravar até a página ser recarregada. Em **🔑 Código de recuperação** (tela inicial e Ajustes) o jogador copia um código com o nome e o
visual para colar em outro aparelho (`assets/recovery.js`): é montado no navegador, sem servidor, em Base32 Crockford com 5 bytes de
SHA-256 de conferência (erro de digitação ou código alterado é recusado), e cada índice ainda é validado contra o catálogo ao restaurar. O servidor valida os índices em `CR` (`lib/validate.js`); páginas antigas, com menos
cores, continuam funcionando, mas não conseguem mostrar as cores novas escolhidas por outros jogadores até serem recarregadas.

**Perfil.** O botão **👤** da barra de baixo abre o Perfil: nome, foto do rosto do avatar (um desenho pequeno só da cabeça) e **código de recuperação**. O código fica o tempo todo como `************` e só aparece ao clicar no **olho 👁** (volta a ficar oculto em 30 s, ao fechar a janela ou ao trocar de aba); o botão de copiar funciona sem mostrar. Ele é montado na hora no navegador e nunca vai ao servidor nem a link. Em **🔒 Meus dados**: **Exportar** baixa um arquivo de texto simples (`skyke3d-meus-dados.txt`, uma linha por item) com nome e visual, com o nome de cada estilo e o número e o código de cada cor (sem o código de recuperação) e **Esquecer neste aparelho** limpa o navegador, com confirmação Sim/Não e o aviso de que só o código de recuperação traz a conta de volta.

**Tela inicial.** Duas linhas compactas coladas no fim do painel (sempre à vista): **✨ Criar sala**, e **código + Entrar + 🤖 bots**.

**Nomes.** Ao entrar numa sala, o nome passa por um filtro (`badName` em `lib/profanity.js`): palavrão, nazismo e outros discursos de ódio (inclusive `1488` e disfarces com números, espaços e letras repetidas) e nomes que fingem ser da equipe ("Admin", "Skyke3D"). Palavras inteiras, então "Nazim" e "Fagner" passam. **Nome único:** ninguém entra com o nome de outra pessoa que está em alguma sala (sem diferenciar acento, maiúsculas, espaços e letras parecidas); o jogo sugere um nome livre, como `Ana2`, num clique.

**Câmera.** Arrastar com o **botão direito do mouse** gira a câmera 360° ao redor do avatar; um clique rápido leva a câmera para a
frente do avatar e outro clique volta ao padrão. Uma etiqueta junto ao cursor mostra o que está acontecendo. WASD e o clique no chão
são relativos à câmera. Os satélites e painéis solares giram para ficar sempre a 45° da câmera.

**Janelas.** Todas as janelas (Chat, Vídeos, Rádio, Emojis, Mochila, Visual, Ajustes, Jogadores e fila do karaokê) têm um **✖** que as fecha. A janela
do **karaokê** não fecha: o botão ➖ a minimiza para um botão flutuante **🎶 Karaokê** no topo da tela (que pisca quando chega a vez
de quem está na fila), e ela só se fecha sozinha quando o jogador sai da fila. Fora da fila, o ➖ apenas esconde a janela.

**Sons.** Todos são sintetizados no navegador (sem arquivos de áudio). Em ⚙ Ajustes há dois controles: **Efeitos sonoros**
(emojis, gestos, passos, pulo, sentar, avisos de convite, cliques, entrar e sair, chat) e **Som ambiente** (vento, água, zumbido grave...
de cada mundo). **Vozes** controla o volume dos outros jogadores. Os passos são um baque grave e abafado, com timbre próprio para areia,
neve, grama, água, pedra e metal e uma pequena variação de tom a cada passo. Os valores ficam salvos no navegador.

**Versão.** A versão do `package.json` aparece no chat ao entrar numa sala.

**Medição.** Abrir o jogo com `?perf` mostra FPS, chamadas de desenho e triângulos por quadro e expõe `window.__dbg` para
depuração. `?q=low|med|high` escolhe a qualidade (sombras e partículas).

## Releases

Cada push para a branch `main` cria automaticamente um GitHub Release com a
tag semver `vX.Y.Z`, usando a versão declarada em `package.json` e as notas
geradas pelo GitHub. Antes do release, o workflow roda `npm ci`, `npm test` e
`npm audit --omit=dev`; as actions são fixadas por SHA e as permissões são
mínimas (`contents: read` no teste e `contents: write` apenas no job de
release). O fluxo está em `.github/workflows/release.yml`.

Para publicar uma alteração, atualize `version` em `package.json` e
`package-lock.json`, faça o commit e envie para `main`:

```bash
git push origin main
```

O workflow cria a tag e o release correspondentes. Se a versão já tiver sido
publicada, o job de release não altera nada. Também é possível executar o
fluxo manualmente pela aba **Actions** do repositório.

## Licença

Copyright (C) 2026 Noturno-Strange.

Este projeto é distribuído sob a **GNU General Public License, versão 3**
(`GPL-3.0-only`). Você pode usar, estudar, modificar e redistribuir o código
sob os termos dessa licença. O texto completo está em [LICENSE](LICENSE).

Este programa é distribuído na esperança de ser útil, mas **sem qualquer
garantia**, nem mesmo a garantia implícita de comercialização ou adequação a
um propósito específico. Consulte a licença para os termos completos.

## Estrutura do projeto

```text
index.html       página do cliente (referencia assets/)
assets/          app.css, intro.js, fonte Manrope, imagens do tutorial, catalog.js (itens, gestos, emojis,
                 cores, mundos e limites, lido pelo navegador e pelo servidor) e o jogo em
                 app-base/scene/avatar/sound/net/panels/media/social/voice/ui.js (servidos com hash no nome)
status.html      painel /status (métricas, capacidade, denúncias e moderação)
privacidade.html Termos de Uso e Política de Privacidade (/termos e /privacidade)
server.js        servidor HTTP/WebSocket, painel de status e tratamento das mensagens por tipo
lib/             módulos do servidor:
  room.js          formato da sala, do jogador e das sessões de vídeo e karaokê (JSDoc)
  karaoke.js       fila do karaokê, tempo de cada vez, convite e sincronia
  video.js         vídeos da sala (um por jogador), convites e sincronia
  social.js        amigos, convites para a sala e chat global (só na memória, sem contas)
  validate.js      validação estrita dos payloads WebSocket
  assets.js        reescrita das referências /assets/ com hash do conteúdo
  capacity.js      limites de salas e jogadores por sala, tetos e estimativa de carga
  bots.js          bots da sala (frases sorteadas, sem IA nem rede)
  radio.js         rádio da sala: uma conexão por sala, repassada aos ouvintes (anti-SSRF)
  profanity.js     filtro de palavrões do chat (pt-BR): troca por !@#$%
  netutil.js       IP real, XFF e chave de limite IPv6 /64
  persist.js       leitura tolerante e escrita atômica de JSON (bans, denúncias, recordes)
  banmgr.js        banimento por IP: chave com sal, strikes progressivos e persistência
  reports.js       armazém das denúncias (teto, validade, gravação adiada)
  records.js       recordes desde sempre (picos de jogadores, memória e rede) com persistência
  report-hook.js   corpo do aviso de denúncia para o Discord (sem menções, texto escapado)
  limits.js        janela deslizante, banimento progressivo e manual
  admission.js     ticket HMAC e prova de trabalho
  compress.js      compressão brotli/gzip dos estáticos e negociação de Accept-Encoding
tests/           todos os testes (*.test.js) e os apoios:
  harness.js       sobe o servidor numa porta livre, HTTP e WebSocket
  client-source.js recompõe o index.html com assets/ no lugar
  server-source.js junta server.js e lib/ para os testes que examinam o código
docs/            produção, painel, segurança e funcionamento (ver "Documentação" acima)
pwa/             manifesto, ícones e service worker para instalar como aplicativo
desktop/         exemplo de aplicativo Tauri para Linux (abre o site do jogo; não é publicado)
vendor/          three.js r186 local, num arquivo só (ver "O motor 3D" acima)
tools/           teste de carga, auditoria de contraste e galeria de cabelos
package.json     scripts, engines e dependências
eslint.config.js, .prettierrc.json, tsconfig.json   lint, formatação e checagem de tipos
package-lock.json
LICENSE          licença GNU GPL v3
```
