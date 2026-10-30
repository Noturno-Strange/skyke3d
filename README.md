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
efêmera (via `harness.js`) e usam uma janela curta de `RECONNECT_MS`; eles são
pulados sozinhos quando `ws` ou `vendor/three-r128.min.js` não existem.

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

O motor 3D é o three.js r128, servido localmente em
`/vendor/three-r128.min.js` (veja `vendor/README.md`). Ele não depende do
cdnjs e é enviado com cache imutável. A atualização para o r160 ou mais novo
fica para um PR separado, pois mudanças de iluminação podem alterar o visual.

## O jogo: mundos, câmera e sons

**Mundos (16).** Cada um tem fogueira central, troncos, tocos, cenário de fundo e música ambiente próprios:
Proxima, Kepler, Gliese, Osíris, Tauri, Esmera, Ambar, Nyx, Lumen, Duna, Mira, Sakura, Nivis, Cinder, Trappist e Draugr.
Os nomes são só de exibição (`ST` em `assets/app.js` e `NAMES` em `status.html`); a id interna usada no protocolo é o nome em
minúsculas e sem acento (`proxima`, `osiris`...). O servidor ainda aceita as ids antigas (`aeris`, `brontis`, `cryon`, `pyra`,
`sylvaris`, `verdara`, `ambara`, `nyxara`, `lumeris`, `dunara`, `mycelis`, `rosara`, `nivara`, `cindara`, `marinis`, `umbris`)
na criação de sala e as converte (`STY_LEGACY` em `validate.js`), para que páginas desatualizadas continuem funcionando.

**Cenário.** Atrás da fogueira fica uma casa lunar de sacos de terra (superadobe), a estufa, satélites com painéis solares, árvores e
pedras. A vegetação e as pedras são espelhadas (giradas 180° em torno da fogueira) para os dois lados ficarem decorados igual; a
casa, a estufa e os satélites são únicos. As montanhas têm formato e cores próprios de cada bioma e existem só no arco à frente da câmera.
O céu distante (planetas, sol, estrelas) e as montanhas acompanham a câmera, então o fundo é sempre o mesmo.

**Avatar.** São 16 cores de pele, 30 cabelos, 40 cores de roupa, chapéu e calçado e 32 cores de cabelo, incluindo cores **fluorescentes** (neon,
que brilham) e **preto brilhante** (com reflexo), além de prata, dourado, platinado e outros. Cada cor tem uma grade de seleção na tela
inicial, além das setas. O servidor valida os índices em `CR` (`validate.js`); páginas antigas, com menos cores, continuam funcionando, mas
não conseguem mostrar as cores novas escolhidas por outros jogadores até serem recarregadas.

**Câmera.** Arrastar com o **botão direito do mouse** gira a câmera 360° ao redor do avatar; um clique rápido leva a câmera para a
frente do avatar e outro clique volta ao padrão. Uma etiqueta junto ao cursor mostra o que está acontecendo. WASD e o clique no chão
são relativos à câmera. Os satélites e painéis solares giram para ficar sempre a 45° da câmera.

**Janelas.** Todas as janelas (chat, vídeo, DJ, emojis, mochila, visual, ajustes e fila do karaokê) têm um **✖** que as fecha. A janela
do **karaokê** não fecha: o botão ➖ a minimiza para um botão flutuante **🎶 Karaokê** no topo da tela (que pisca quando chega a vez
de quem está na fila), e ela só se fecha sozinha quando o jogador sai da fila. Fora da fila, o ➖ apenas esconde a janela.

**Sons.** Todos são sintetizados no navegador (sem arquivos de áudio). Em ⚙ Ajustes há dois controles: **Efeitos sonoros**
(emojis, gestos, passos, pulo, sentar, avisos de convite, cliques, entrar e sair, chat) e **Som ambiente** (vento, água, grilos...
de cada mundo). **Volume dos outros** controla as vozes. Os valores ficam salvos no navegador.

**Versão.** A versão do `package.json` aparece no chat ao entrar numa sala.

**Medição.** Abrir o jogo com `?perf` mostra FPS, chamadas de desenho e triângulos por quadro e expõe `window.__dbg` para
depuração. `?q=low|med|high` escolhe a qualidade (sombras e partículas).

## Termos e filtro do chat

- **Termos.** Na tela inicial há duas caixas de marcação: "Declaro ter 18 anos ou mais" e "Li e aceito as regras de convivência"
  (o link abre as regras). Sem as duas marcadas, **Criar sala** e **Entrar** não funcionam. A escolha fica salva no navegador
  (`skyke_terms`).
- **Filtro de palavrões** (`profanity.js`). O servidor troca palavrões do português do Brasil por símbolos como `!@#$%` antes de
  transmitir o chat (e antes de os bots lerem a frase). Entende maiúsculas, acentos, letras repetidas, números e símbolos no lugar de
  letras (`p0rra`, `c4ralho`) e separadores (`p.u.t.a`), e só censura palavras inteiras, então "computador" ou "pauta" passam.

## Favicon e cursor

- O favicon é uma nuvem sorridente sobre fundo roxo (SVG com PNG 64x64 de reserva) e o
  cursor é uma seta âmbar com coração, trocada por uma seta rosa com estrela em botões,
  seletores, sliders e caixas de seleção. Desabilitados mantêm `not-allowed` e campos de
  texto mantêm o cursor de texto.
- Tudo fica embutido como `data:` URI (o favicon no `index.html`, os cursores nas variáveis
  `--cur` e `--cur-ptr` de `assets/app.css`), então não há arquivos extras nem rotas novas. O CSP já libera
  `img-src 'self' data:`; se restringir esse valor, ícone e cursor deixam de aparecer.
- Para trocar o visual, edite os SVGs dessas duas variáveis e o `<link rel="icon">` no
  `<head>`. O cursor deve ter 32x32 px e o ponto ativo é `5 3` (a ponta da seta).

## Painel de status (`/status`)

O painel é opcional. Ele só é habilitado quando a variável de ambiente
`STATUS_TOKEN` é definida com **pelo menos 12 caracteres**. Sem ela, `/status`
responde `404`.

### 1. Gerar um token

Use o próprio Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ou, se preferir, o OpenSSL:

```bash
openssl rand -hex 32
```

O resultado é um token aleatório de 64 caracteres. Guarde-o em um lugar seguro e
não o envie para o repositório.

### 2. Iniciar o servidor com o token

```bash
export STATUS_TOKEN="cole-aqui-o-token-gerado"
npm start
```

Também pode ser feito em uma única linha:

```bash
STATUS_TOKEN="cole-aqui-o-token-gerado" npm start
```

> O servidor não carrega arquivos `.env` automaticamente. Em produção,
> configure `STATUS_TOKEN` no gerenciador de segredos ou nas variáveis de
> ambiente do serviço de hospedagem.

### 3. Acessar o painel

Abra:

```text
http://localhost:3000/status
```

Informe o token no campo exibido. Ele fica armazenado apenas na sessão do
navegador.

Também é possível abrir o painel passando o token pelo fragmento da URL:

```text
http://localhost:3000/status#token=SEU_TOKEN
```

O fragmento não é enviado ao servidor, mas evite compartilhar esse link.

### Consultar os dados pela API

O painel usa o endpoint protegido `/status.json`:

```bash
curl -H "Authorization: Bearer $STATUS_TOKEN" \
  http://localhost:3000/status.json
```

O acesso sem token ou com token inválido retorna `401`.

### Recordes

A seção **Recordes** do painel mostra, com a data e a hora em que ocorreram: o **máximo de jogadores online**, o máximo de **salas abertas**,
o pico de **memória do jogo** (RSS), o pico de **memória do sistema** (%) e o pico de **rede recebida** e **enviada** (bytes por segundo).
Os valores são amostrados a cada 5 s e ficam em `data/records.json` (mude com `RECORDS_FILE=/caminho/records.json`; `RECORDS_FILE=0`
mantém só em memória). Também saem em `/status.json` (campo `records`). O arquivo não guarda IPs.

### Métricas do servidor

Além das estatísticas das salas, o painel exibe:

- **CPU do sistema**: uso total da CPU e, abaixo, o uso do processo do jogo.
- **Memória do sistema**: porcentagem usada e memória total.
- **Rede do sistema**: taxas de recebimento/envio e totais da máquina.
- **Memória do jogo**: memória RSS do processo Node.js e uso do heap JavaScript.

As métricas de CPU, memória e rede são do sistema operacional. A memória do
jogo é específica do processo que executa o servidor. Em sistemas sem
`/proc/net/dev` (fora do Linux), a rede aparece como indisponível.

Os mesmos dados ficam disponíveis em `/status.json`, dentro do objeto
`resources`.

### Desempenho do jogo

O painel mostra, sobre os últimos 60 s (as taxas, sobre os últimos 10 s):

- **Tick do jogo**: duração média e máxima do tick de 100 ms e quantos passaram de 50 ms desde o início. Perto de 100 ms o servidor não dá conta.
- **Atraso do loop (p99)**: quanto o loop de eventos do Node atrasa, medido com `perf_hooks`. É o melhor indicador de lag percebido pelos jogadores.
- **Mensagens por segundo**: recebidas (↓) e enviadas (↑), com os bytes enviados por segundo.
- **Maior buffer de envio**: o maior `bufferedAmount` entre as conexões e quantas foram derrubadas por passar do limite (clientes lentos).

Logo depois de iniciar, o atraso do loop pode aparecer alto por alguns instantes por causa da compressão feita no boot. Os dados estão em `/status.json`, no objeto `perf`.

### Moderação por IP

O menu **Moderação por IP** do painel (`/status`) lista os jogadores conectados agrupados por **ID do IP** (com nome, rótulo curto da sala e mundo) e permite:

- **Banir** o IP de um grupo, por 10 min, 1 h, 6 h, 24 h, 7 dias ou 30 dias. O painel pede confirmação, o servidor encerra na hora as conexões desse IP e recusa novas entradas. Em IPv6 o banimento vale para o bloco `/64`.
- **Desbanir** qualquer banimento ativo, pelo ID.

**Privacidade: o painel nunca vê o endereço IP.** Cada IP aparece só como um ID de 12 caracteres, o prefixo de um hash SHA-256 **com um segredo aleatório do servidor** (guardado em `data/bans.json`, com permissão 0600). Sem esse segredo não dá para descobrir o IP a partir do ID, nem testando todos os endereços IPv4 possíveis. Quem pede o banimento envia só o ID e o servidor resolve o IP por dentro:

- Nenhuma resposta da API (`/status.json`, `/status/players.json`, `/status/ban`, `/status/unban`) contém o IP. Isso inclui `abuse.topConns`, que agora traz o ID no lugar do IP.
- Não há campo para digitar IP. O servidor também não guarda IP nenhum só para exibir: o arquivo de banimentos continua com apenas hashes.
- Quem tem acesso ao arquivo `data/bans.json` (o dono do servidor) tem o segredo e consegue verificar se um IP conhecido corresponde a um ID. Proteja esse arquivo como protege o `STATUS_TOKEN`.
- O segredo existe mesmo com `BAN=0` (nesse caso só vale enquanto o processo roda).
- Se você apagar `data/bans.json`, os IDs mudam e os banimentos antigos deixam de valer.

Regras e cuidados:

- Exige o mesmo `STATUS_TOKEN` e as mesmas proteções do painel (limite de tentativas, `Authorization: Bearer`, sem CORS). As ações aceitam só `application/json` de até 2 KB e têm limite de 30 por minuto.
- Não é possível banir o seu próprio IP nem o de um proxy confiável (`TRUST_PROXY`).
- Só dá para banir um IP que esteja conectado no momento (o servidor precisa dele para resolver o ID). Se o jogador já saiu, o painel pede para atualizar a lista; as reincidências são tratadas pelo banimento progressivo automático.
- Com `BAN=0` as ações ficam indisponíveis (o painel avisa).
- O código de entrada da sala não aparece, só um rótulo de 4 caracteres.
- Banimentos manuais não escalam o nível do banimento progressivo automático.

API (todas com `Authorization: Bearer $STATUS_TOKEN`):

```bash
curl -H "Authorization: Bearer $STATUS_TOKEN" http://localhost:3000/status/players.json
curl -X POST -H "Authorization: Bearer $STATUS_TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"<id da lista de jogadores>","minutes":60}' http://localhost:3000/status/ban
curl -X POST -H "Authorization: Bearer $STATUS_TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"<id da lista de banimentos>"}' http://localhost:3000/status/unban
```

## Compressão e cache dos estáticos

O `index.html`, o `vendor/three-r128.min.js` e os arquivos de `assets/` são comprimidos **uma única vez, na inicialização** (brotli nível 11 e gzip nível 9). A cada requisição o servidor apenas escolhe o buffer pronto conforme o `Accept-Encoding` (`br`, depois `gzip`, depois o original), então não há custo de CPU em regime.

- Cada codificação tem seu próprio `ETag` (`"…-br"`, `"…-gzip"`) e a resposta leva `Vary: Accept-Encoding`, então navegadores e CDNs não misturam corpos diferentes.
- Como a resposta já sai com `Content-Encoding`, o Nginx não a comprime de novo.
- A compressão roda num **processo filho** que termina logo depois. O brotli em nível alto reserva muita memória nativa que o sistema não devolve ao processo que comprimiu (cerca de 10 MB a mais, para sempre); no filho ela volta toda ao sistema. Se o filho não puder ser iniciado, o servidor comprime no próprio processo e continua funcionando.
- As mensagens WebSocket não usam `permessage-deflate` (desligado de forma explícita): são pequenas e frequentes, e a compressão gastaria mais CPU e memória por conexão do que economiza.

### Cliente em arquivos separados, com hash no nome

O código do jogo fica em `assets/` (`app.css`, `app.js` e `intro.js`) e o `index.html` só os referencia (`/assets/app.js`). Na inicialização o servidor calcula o SHA-256 de cada arquivo e passa a servir `/assets/app.<hash>.js` com `Cache-Control: public, max-age=31536000, immutable`; o HTML enviado ao navegador já aponta para os nomes com hash.

- O HTML continua com `no-cache` e `ETag`: ele é a única coisa revalidada a cada visita (cerca de 17 KB sem compressão). Um deploy faz o navegador baixar de novo só os arquivos cujo conteúdo mudou.
- Para editar, mexa em `assets/` normalmente e reinicie o servidor. Não há etapa de build.
- Só nomes simples (`/assets/<nome>.css|.js`) são aceitos. O nome sem hash, `..` e subpastas respondem 404.
- Uma aba aberta durante um deploy pode receber 404 num asset antigo; recarregar a página resolve.
- Os testes de regressão leem o cliente por `client-source.js`, que recompõe o HTML com o CSS e o JS no lugar.

## Modo produção (domínio + HTTPS)

Definir `PUBLIC_URL` com uma origem **HTTPS** ativa o modo produção:

```bash
PUBLIC_URL=https://jogo.exemplo.com \
BIND_HOST=127.0.0.1 \
PORT=3000 \
STATUS_TOKEN="cole-aqui-o-token" \
npm start
```

Regras do modo produção:

- `PUBLIC_URL` precisa ser uma origem (`https://host[:porta]`), sem caminho,
  query ou fragmento. Valores `http://`, `localhost`, IPs da VPS e `*.ts.net`
  são rejeitados no boot com código de saída 1.
- O Node deve escutar apenas em `127.0.0.1` (`BIND_HOST`). A porta `3000` não
  deve ficar exposta na internet; somente o proxy deve acessá-la.
- O handshake WebSocket exige `Host` e `Origin` presentes, válidos e
  compatíveis. `Origin` ausente, `null`, de outro domínio ou `http://` em
  produção recebe **403**. Requisições sem `Host` também recebem **403**.
- `ORIGINS` e `ALLOWED_HOSTS` funcionam como aliases explícitos, separados por
  vírgula. Em produção, `ORIGINS` só aceita origens `https://`.
- `TRUST_PROXY` lista IPs/CIDRs de proxies confiáveis. Só quando o socket vem
  de um proxy dessa lista o servidor lê `X-Forwarded-For`. O cabeçalho é
  percorrido **da direita para a esquerda**, ignorando os proxies confiáveis; o
  primeiro IP não confiável é o cliente. Se a ponta direita for inválida, o
  servidor usa o IP do socket, nunca um valor mais à esquerda. O proxy deve
  **sobrescrever** o `X-Forwarded-For`; não anexe valores controlados pelo
  cliente.
- `TRUST_CF_CONNECTING_IP=1` faz o servidor preferir `CF-Connecting-IP` ao
  `X-Forwarded-For`. Use apenas quando o tráfego chega pela Cloudflare/
  cloudflared e a borda sanitiza o cabeçalho. Sem essa opção, o valor é
  ignorado.
- Limites por IP usam IPv4 completo ou o bloco **IPv6 /64**, porque um cliente
  IPv6 normalmente controla o /64 inteiro. Em redes com NAT/CGNAT ou muitos
  dispositivos atrás do mesmo IP, aumente `PERIP` conforme necessário.
- `PERIP` (conexões WebSocket simultâneas) e `HTTP_RATE` (requisições HTTP por
  minuto) são configuráveis. `HTTP_RATE=0` desativa o limite HTTP; mantenha um
  valor baixo em produção. Requisições acima do limite recebem **429** com
  `Retry-After`.
- `index.html`, `assets/` e o three.js são carregados uma vez na memória. O HTML
  usa `ETag`/`304` e `Cache-Control: no-cache`; o three.js e os `assets/` com hash
  usam cache imutável. A compressão (brotli/gzip) é feita pelo próprio servidor.
- O CSP é montado no boot com hashes SHA-384 dos scripts inline reais (hoje só o
  do painel `/status`; o jogo carrega de `/assets/`, coberto por `'self'`). Não há `'unsafe-inline'` em `script-src`
  nem `'unsafe-eval'`; `script-src-attr` é `'none'`. Em produção, `connect-src`
  fica restrito a `'self'` e aos hosts `wss://` permitidos.
- Com `TURN_URL` definido, `TURN_SECRET` é **obrigatório** em produção. Sem
  ele, o processo encerra com código 1. `TURN_ALLOW_STATIC=1` é uma escape
  explícito para aceitar `TURN_USER`/`TURN_PASS` estáticos; em desenvolvimento
  credenciais estáticas apenas geram aviso.
- As sessões, tokens e salas ficam apenas em memória. Reiniciar o processo
  encerra todas as salas; não há banco de dados. Use um supervisor (systemd,
  pm2 ou equivalente) com reinício automático.
- O Node não envia HSTS. Adicione
  `Strict-Transport-Security: max-age=31536000; includeSubDomains` no proxy
  HTTPS, mas só inclua subdomínios se todos também forem servidos por HTTPS.

### Exemplo de proxy com Nginx

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    http2 on;
    server_name jogo.exemplo.com;

    ssl_certificate     /etc/letsencrypt/live/jogo.exemplo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jogo.exemplo.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $remote_addr;
        proxy_set_header CF-Connecting-IP  "";
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;
        proxy_read_timeout 3600s;
    }
}
```

Use `TRUST_PROXY=127.0.0.1,::1` nesse cenário. Preservar o `Host` original é
obrigatório; sobrescrever `X-Forwarded-For` com o IP real evita que o cliente
falsifique o próprio endereço. O servidor lê o XFF da direita para a esquerda,
então os proxies intermediários confiáveis precisam estar em `TRUST_PROXY`.

Atrás da Cloudflare, o caminho recomendado é configurar o módulo `real_ip` do
Nginx (com os ranges da Cloudflare) para que o IP encaminhado seja o do
visitante. Se o tráfego chegar por cloudflared local e você quiser confiar no
cabeçalho da Cloudflare, defina `TRUST_CF_CONNECTING_IP=1`. Não habilite essa
opção se qualquer cliente puder alcançar o Node diretamente e forjar
`CF-Connecting-IP`.

O Caddy também funciona e cuida de `Upgrade`/`Connection` automaticamente:

```caddyfile
jogo.exemplo.com {
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"
    reverse_proxy 127.0.0.1:3000 {
        header_up Host {host}
    }
}
```

Em qualquer proxy, encerre o TLS nele. O cliente usa `wss://` automaticamente
quando a página é servida por HTTPS.

## TURN (voz atrás de NAT)

O jogo usa STUN público por padrão. Para melhorar a conexão de voz em redes
restritivas, configure um servidor TURN (por exemplo, coturn):

```bash
TURN_URL=turn:turn.exemplo.com:3478,turns:turn.exemplo.com:5349 \
TURN_SECRET="segredo-compartilhado-com-o-coturn" \
TURN_TTL=3600 \
TURN_LABEL=skyke3d \
npm start
```

No coturn, use o modo de segredo compartilhado (REST API):

```ini
use-auth-secret
static-auth-secret=segredo-compartilhado-com-o-coturn
realm=turn.exemplo.com
```

O servidor gera, a cada entrada/sala, um usuário no formato
`<expiração>:<TURN_LABEL>` e uma credencial HMAC-SHA1 válida por `TURN_TTL`
segundos (60 a 86400). Isso evita credenciais permanentes. `TURN_LABEL` é
sanitizado e tem `skyke3d` como padrão.

Em **produção**, `TURN_SECRET` é obrigatório quando `TURN_URL` está definido.
Sem ele, o processo encerra com código 1. A única exceção é o escape explícito
`TURN_ALLOW_STATIC=1`, que aceita `TURN_USER`/`TURN_PASS` fixos e gera aviso.
Em desenvolvimento, credenciais estáticas também são aceitas com aviso. Se
`TURN_SECRET` estiver definido, `TURN_USER`/`TURN_PASS` são ignorados.

## Tailscale e desenvolvimento

Com `PUBLIC_URL` vazio, o servidor aceita acesso pela rede local e pelo
Tailscale sem configuração extra:

```bash
BIND_HOST=0.0.0.0 PORT=3000 npm start
```

Abra `http://100.x.y.z:3000` ou `http://nome-da-maquina.tailnet.ts.net:3000`.
O `Host` e o `Origin` do navegador serão iguais, então o handshake é aceito
pelas faixas privadas/CGNAT/`*.ts.net`.

- Não defina `PUBLIC_URL` no desenvolvimento: isso ativa o modo produção e
  bloqueia endereços locais/Tailscale.
- Microfone e área de transferência exigem contexto seguro. Use `localhost`,
  `tailscale serve` (HTTPS) ou um certificado válido para voz em outros
  dispositivos.
- Para expor na internet, prefira o proxy HTTPS do modo produção em vez de
  abrir a porta do Node.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP do servidor (`0` escolhe uma porta livre). Valores fora de 0–65535 ou não numéricos encerram com código 1. |
| `BIND_HOST` | `0.0.0.0` | Interface de escuta. Em produção use `127.0.0.1`. |
| `STATUS_TOKEN` | vazio | Ativa o painel `/status`; mínimo de 12 caracteres. |
| `PUBLIC_URL` | vazio | Origem HTTPS pública do jogo. Ativa o modo produção e os links compartilhados. |
| `ORIGINS` | vazio | Origens WebSocket adicionais (`https://host[:porta]`), separadas por vírgula. |
| `ALLOWED_HOSTS` | vazio | Hosts adicionais aceitos no handshake (`host[:porta]`), separados por vírgula. |
| `TRUST_PROXY` | `127.0.0.1,::1` | IPs/CIDRs de proxies confiáveis. O XFF é lido da direita para a esquerda. |
| `TRUST_CF_CONNECTING_IP` | desligado | `1` prefere `CF-Connecting-IP` ao XFF. Use só quando a Cloudflare/cloudflared sanitiza o cabeçalho. |
| `PERIP` | `6` | Conexões WebSocket simultâneas por IP (IPv6 agrupado por `/64`), entre 1 e 1000. |
| `PERIP_RATE` | `30` | Conexões **novas** (`create`/`join`) por IP a cada 10 minutos. `resume` não conta. |
| `PERIP_ROOM` | `2` | Pessoas do mesmo IP numa mesma sala. |
| `GLOBAL_RATE` | `180` | Handshakes WebSocket por minuto no servidor inteiro. `0` desativa. |
| `MAXBOTS` | `200` | Bots simultâneos no servidor inteiro. `0` desativa os bots. |
| `BAN` | ligado | `0` desliga o banimento progressivo. |
| `BAN_FILE` | `data/bans.json` | Arquivo de banimentos persistentes. `0` mantém só em memória. |
| `RECORDS_FILE` | `data/records.json` | Arquivo dos recordes do painel `/status` (jogadores, memória e rede). `0` mantém só em memória. |
| `TICKET_MODE` | `warn` | `off`, `warn` (aceita sem ticket e só mede) ou `enforce`. |
| `TICKET_RATE` | `20` | Tickets de admissão por minuto por IP. `0` desativa. |
| `POW_MAX` | `16` | Teto de dificuldade da prova de trabalho, entre 0 e 24. |
| `HTTP_RATE` | `120` | Requisições HTTP por minuto por IP. `0` desativa o limite. |
| `RECONNECT_MS` | `30000` | Janela de retenção da sessão após queda, entre 100 e 300000 ms. |
| `TURN_URL` | vazio | URL(s) do servidor TURN (`turn:`/`turns:`), separadas por vírgula. |
| `TURN_SECRET` | vazio | Segredo compartilhado com o TURN. Obrigatório em produção quando há `TURN_URL`. |
| `TURN_TTL` | `3600` | Validade das credenciais TURN temporárias, entre 60 e 86400 segundos. |
| `TURN_LABEL` | `skyke3d` | Rótulo do usuário TURN temporário, sanitizado. |
| `TURN_USER` | vazio | Usuário TURN estático (apenas desenvolvimento ou com `TURN_ALLOW_STATIC=1`). |
| `TURN_PASS` | vazio | Senha TURN estática (apenas desenvolvimento ou com `TURN_ALLOW_STATIC=1`). |
| `TURN_ALLOW_STATIC` | desligado | `1` permite credenciais TURN estáticas em produção, com aviso explícito. |

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

- O áudio P2P usa Opus. O modo normal (voz) transmite só enquanto o microfone
  detecta fala (VAD); em silêncio, o cliente não envia pacotes de áudio. Os modos
  de música e estéreo desativam o VAD e o DTX para não cortar caudas musicais.
- Qualidade por jogador, em Ajustes: `Eco` (24 kbps mono), `Padrão` (32 kbps
  mono), `Alta` (48 kbps mono), `Música` (48 kbps mono) e `Estéreo` (96 kbps).
  O teto de bitrate de cada conexão é o menor entre o emissor e o receptor.
- `Estéreo` pede 2 canais e `Música` pede 1 canal; os modos de voz também usam
  1 canal.
- O microfone tem um único botão 🎤 no HUD superior, ao lado do nível da voz: um
  clique liga ou desliga a captura. A borda verde indica microfone ativo, o
  brilho indica que você está falando e 🚫 indica permissão negada ou indisponível.
- Em Ajustes, três caixas controlam o microfone: cancelamento de eco, redução
  de ruído e ganho automático. O ganho automático começa ligado e as outras duas, desligadas; a escolha fica salva em
  `skyke3d.micFx`.
- `Música` e `Estéreo` desligam automaticamente os três filtros, com as caixas
  desmarcadas e indisponíveis, para preservar o áudio. As preferências salvas
  continuam valendo quando o jogador volta a um modo de voz.
- As mudanças de filtro são aplicadas ao vivo com `applyConstraints`; se o
  navegador recusar ou não honrar o pedido, a captura é reiniciada. O painel
  desabilita opções que o navegador não suporta e avisa quando o dispositivo
  não honrou o estado pedido.
- O botão 🎤 mostra apenas uma borda verde fina quando o microfone está ligado
  (borda vermelha em caso de erro); não há brilho extra ao falar.
- Economia de banda: o SDP pede pacotes de 40 ms (`ptime=40`, `maxptime=60`), o que
  reduz pela metade os pacotes por segundo e, com eles, o cabeçalho RTP/UDP/IP;
  o RED de áudio é removido da negociação com `setCodecPreferences`, porque ele
  repete cada quadro Opus e quase dobra o consumo (o FEC embutido `useinbandfec`
  continua ativo). Com 5 ou mais conexões de voz abertas, os modos de voz
  (Eco/Padrão/Alta) passam a enviar no máximo 24 kbps por conexão; Música e
  Estéreo não são afetados.
- O VAD usa um piso de ruído adaptativo com histerese (abre em ~3x o piso e no
  mínimo 0,012 RMS, fecha em ~1,8x o piso). Isso evita transmitir ruído de fundo e
  cortar vozes baixas agora que os filtros do microfone começam desligados.
- Se `setParameters` falhar ao aplicar o teto de bitrate, o ajuste é tentado de
  novo até 3 vezes, em vez de ficar sem limite pela conexão toda.
- O estéreo só é usado quando o microfone entrega uma fonte realmente estéreo.
  Se o dispositivo for mono, o cliente cai automaticamente para `Música` mono e
  avisa o jogador.
- O TURN é usado apenas como fallback: o navegador tenta a conexão direta
  primeiro e só recorre ao relay quando ela falha. O antigo modo
  `RELAY_ONLY=1` foi removido. Quando a rota selecionada passa por relay, o
  envio é limitado a 24 kbps em voz ou 32 kbps em música.
- Cada jogador mantém no máximo 8 conexões de voz simultâneas, priorizando os
  jogadores mais próximos.
- O SDP anuncia Opus permissivo (`maxaveragebitrate=96000`, `stereo=1`,
  `sprop-stereo=1`, `usedtx=0`, `cbr=0`) e o teto real de cada conexão é
  aplicado em `setParameters`, junto com o DTX dos modos de voz.
- A preferência de qualidade fica no `localStorage` e é trocada pelos peers
  pela mensagem de sinalização `sig` com `{x:'vq',q:<modo>}`; o servidor valida
  o modo numa allowlist.
- Com `TURN_SECRET`, as credenciais são temporárias (`<expiração>:<label>` +
  HMAC-SHA1) e expiram em `TURN_TTL`. Credenciais estáticas só são usadas em
  desenvolvimento ou com `TURN_ALLOW_STATIC=1`.
- A sinalização WebRTC (ofertas, respostas e candidatos ICE) tem um teto
  próprio por conexão e é descartada em excesso sem contar como violação. Isso
  evita derrubar jogadores que negociam várias conexões de voz ao mesmo tempo.

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
- O botão da fila (👥) fica no canto superior esquerdo, ao lado do microfone, e só
  aparece enquanto o jogador está na fila. A lista mostra posição, nome e a música;
  a sua própria linha é destacada com uma borda, sem textos como "Cantando" ou "Você".
- Na barra inferior, 😀 abre o painel de emojis e 🎭 abre o de gestos (mesmo painel,
  abas separadas por botão). O HUD não tem mais os botões de código da sala e de pessoas.
- A fila comporta até 25 pessoas (o limite da sala). Cada música dura a duração do vídeo + 21 s de margem (`KEXTRA` em `server.js`), com teto de 13 minutos.
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
  janela Música/Vídeo. Quem já está assistindo ao vídeo dele acompanha o novo
  automaticamente, e convites ainda pendentes dele passam a apontar para o novo.

## Bots

Cada sala aceita de 0 a **20 bots** (a sala continua limitada a 25 pessoas no total;
quando entram humanos, os bots que não cabem saem) e o servidor inteiro, `MAXBOTS`.

Os bots **não usam IA nem rede** (`bots.js`) e **nunca puxam assunto**: só falam quando
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

O botão 🎧 da barra inferior abre o painel **DJ**. Qualquer pessoa da sala pode
colocar uma rádio (uma por vez); quem colocou ou o anfitrião encerra para todos.

- Só aceita links `https` de streaming direto em **MP3 ou AAC** (Icecast2/Shoutcast).
  Ogg, playlists `.m3u`/`.pls` e links `http` não funcionam.
- **O áudio passa pelo servidor do jogo** (`radio.js`): o servidor abre **uma**
  conexão com a rádio por sala e reparte o áudio entre os ouvintes, então a rádio só
  vê o IP do servidor, nunca o de quem ouve. Os ouvintes nem recebem o link, só o
  domínio, e cada um só começa a ouvir depois de clicar em **Ouvir**.
- Anti-SSRF: `streamUrl` (`validate.js`) aceita só `https`, sem usuário/senha, sem IP
  literal e sem nomes locais; o DNS é resolvido no servidor e a conexão é feita no
  IP validado, recusando endereço privado, loopback, CGNAT, link-local e equivalentes
  em IPv6 (`isPublicAddress` em `netutil.js`); até 3 redirecionamentos, validados a
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

## Segurança

- Trate `STATUS_TOKEN` como uma senha e não o versione.
- Em produção, sirva o jogo por HTTPS e mantenha o token em um gerenciador de
  segredos.
- O endpoint `/status.json` tem limite de tentativas para dificultar ataques de
  força bruta.
- Todo payload WebSocket passa por uma allowlist estrita em `validate.js`:
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

## Operação e supervisão

O processo encerra com código 1 em erro fatal ou configuração inválida. Use um
supervisor para reiniciar e manter o jogo no ar. Como as salas são em memória,
um reinício derruba todas as sessões.

Exemplo de unidade systemd:

```ini
[Unit]
Description=Skyke3D
After=network.target

[Service]
Type=simple
User=skyke3d
WorkingDirectory=/opt/skyke3d
EnvironmentFile=/etc/skyke3d.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

Coloque `PUBLIC_URL`, `STATUS_TOKEN`, `TURN_SECRET` e os demais valores em
`/etc/skyke3d.env` com permissão restrita. Acompanhe os logs com
`journalctl -u skyke3d -f`.

Com pm2:

```bash
pm2 start server.js --name skyke3d
pm2 save
pm2 startup
```

O servidor trata `SIGTERM`/`SIGINT` fechando os clientes com código `1001` e
parando de aceitar conexões; há um limite de 3 segundos para o encerramento
gracioso antes da saída forçada.

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
assets/          app.css, app.js e intro.js (servidos com hash no nome)
assets.js        reescrita das referências /assets/ com hash do conteúdo
status.html      painel /status (métricas e moderação por IP)
server.js        servidor HTTP/WebSocket e painel de status
validate.js      validação estrita dos payloads WebSocket
profanity.js     filtro de palavrões do chat (pt-BR): troca por !@#$%
netutil.js       IP real, XFF e chave de limite IPv6 /64
limits.js        janela deslizante, banimento progressivo e manual
admission.js     ticket HMAC e prova de trabalho
compress.js      compressão brotli/gzip dos estáticos e negociação de Accept-Encoding
client-source.js apoio dos testes: recompõe o index.html com assets/ no lugar
harness.js       apoio dos testes de integração (sobe o servidor, HTTP e WebSocket)
vendor/          three.js r128 local (ver vendor/README.md)
tests/           testes novos (limites, admissão e handshake)
*.test.js        testes do cliente, do servidor e de voz
package.json     scripts, engines e dependências
package-lock.json
LICENSE          licença GNU GPL v3
```
