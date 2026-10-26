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
limites por ação, reconexão com rotação de token, expiração da sala, IP real
com `X-Forwarded-For`/`CF-Connecting-IP`, agrupamento IPv6 por `/64`, TURN,
CSP com hashes, ETag/cache do HTML e dos arquivos estáticos e os controles de
vídeo/karaokê. Os testes de integração iniciam o servidor em uma porta efêmera
e usam uma janela curta de `RECONNECT_MS`.

## Página inicial

Ao abrir o jogo, uma página inicial aparece antes da janela de entrada, com:

- **Jogar**: fecha a página inicial e abre a janela do jogo (nome, cenário e sala).
- **Discord**: abre o servidor da comunidade em uma nova aba.
- **Cinematic**: animação em canvas gerada por código (sem vídeos ou imagens
  externos), que apresenta os seis mundos, a voz, o karaokê e os vídeos.
  Ela pausa quando a aba fica oculta e respeita `prefers-reduced-motion`
  (nesse caso mostra um quadro estático).

O código está no próprio `index.html` (bloco `#intro`).

O motor 3D é o three.js r128, servido localmente em
`/vendor/three-r128.min.js` (veja `vendor/README.md`). Ele não depende do
cdnjs e é enviado com cache imutável. A atualização para o r160 ou mais novo
fica para um PR separado, pois mudanças de iluminação podem alterar o visual.

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
- `index.html` e o three.js são carregados uma vez na memória. O HTML usa
  `ETag`/`304` e `Cache-Control: no-cache`; o arquivo versionado do three.js
  usa cache imutável. A compressão deve ser feita pelo proxy.
- O CSP é montado no boot com hashes SHA-384 dos scripts inline reais do
  `index.html` e do painel `/status`. Não há `'unsafe-inline'` em `script-src`
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

- O áudio só é transmitido enquanto o microfone detecta fala (VAD). Em silêncio,
  o cliente não envia pacotes de áudio.
- O codec é Opus em mono, com teto de ~24 kbps e DTX ativado.
- Cada jogador mantém no máximo 8 conexões de voz simultâneas, priorizando os
  jogadores mais próximos.
- O TURN é usado apenas como fallback: o navegador tenta a conexão direta
  primeiro e só recorre ao relay quando ela falha. O antigo modo
  `RELAY_ONLY=1` foi removido.
- Com `TURN_SECRET`, as credenciais são temporárias (`<expiração>:<label>` +
  HMAC-SHA1) e expiram em `TURN_TTL`. Credenciais estáticas só são usadas em
  desenvolvimento ou com `TURN_ALLOW_STATIC=1`.
- A sinalização WebRTC (ofertas, respostas e candidatos ICE) tem um teto
  próprio por conexão e é descartada em excesso sem contar como violação. Isso
  evita derrubar jogadores que negociam várias conexões de voz ao mesmo tempo.

## Karaokê e vídeo

- O vídeo da sala pode ser encerrado por quem o iniciou **ou pelo anfitrião**.
  O cliente do anfitrião também envia `vstop` ao fechar o player.
- Convites de karaokê disparados ao entrar em uma fila vazia têm cooldown de
  15 segundos por sala, para evitar spam quando alguém entra e sai da fila.
- Só o cantor atual pode passar a própria vez (`kpass`); nem o anfitrião passa a vez dos outros.
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
  janela Música/Vídeo. Quem já está assistindo acompanha o novo vídeo
  automaticamente, e convites ainda pendentes passam a apontar para ele.

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
- Além dos limites por IP (`PERIP`, `HTTP_RATE`, tentativas de sala, handshake
  e painel), cada conexão tem limites por ação (chat, movimento, emoji, item,
  gesto, vídeo, karaokê, WebRTC etc.). Spam persistente recebe close `1008`.
- Atrás de proxy, o IP real vem do `X-Forwarded-For` lido da direita para a
  esquerda, ignorando os hops confiáveis listados em `TRUST_PROXY`.
  `CF-Connecting-IP` é opt-in. Limites IPv6 usam `/64` para que um bloco
  inteiro não contorne `PERIP`/`HTTP_RATE`.
- Nomes passam por remoção de caracteres invisíveis (incluindo
  `Default_Ignorable_Code_Point`, U+2800 e separadores de linha) e não podem
  usar nomes reservados como "Karaokê", "Sistema", "Admin" ou "Skyke3D".
- O CSP não usa `'unsafe-inline'` em `script-src`; os dois blocos inline do
  jogo e o script do painel entram como hashes SHA-384 calculados no boot. O
  three.js é local. Em produção, `connect-src` só permite `'self'` e os hosts
  `wss://` explicitamente permitidos.
- `index.html` e o three.js ficam em memória, com `ETag` e `304`; o HTML não é
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
tag no formato `vAAAA.MM.DD-<sha-curto>`, usando as notas geradas pelo GitHub.
Antes do release, o workflow roda `npm ci`, `npm test` e
`npm audit --omit=dev`; as actions são fixadas por SHA e as permissões são
mínimas (`contents: read` no teste e `contents: write` apenas no job de
release). O fluxo está em `.github/workflows/release.yml`.

Para publicar uma alteração, basta enviar o commit para `main`:

```bash
git push origin main
```

Também é possível executar o fluxo manualmente pela aba **Actions** do
repositório. Não é necessário criar tags manualmente.

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
index.html       cliente do jogo
server.js        servidor HTTP/WebSocket e painel de status
validate.js      validação estrita dos payloads WebSocket
netutil.js       IP real, XFF e chave de limite IPv6 /64
vendor/          three.js r128 local (ver vendor/README.md)
test/            testes com node:test (unitários e integração)
package.json     scripts, engines e dependências
package-lock.json
LICENSE          licença GNU GPL v3
```
