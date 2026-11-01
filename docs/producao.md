# Produção e operação

Como colocar o Skyke3D no ar com domínio e HTTPS, proxy, TURN para a voz, variáveis de ambiente e supervisão. Volte ao [README](../README.md).

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

    # Slowloris: o cabeçalho tem 10 s para chegar (o padrão do Nginx é 60 s).
    client_header_timeout 10s;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $http_host;
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
obrigatório: use `$http_host`, não `$host`, que perde a porta e, fora da 443, faz o
`Host` deixar de combinar com o `Origin` (o WebSocket é recusado com 403); sobrescrever `X-Forwarded-For` com o IP real evita que o cliente
falsifique o próprio endereço. O servidor lê o XFF da direita para a esquerda,
então os proxies intermediários confiáveis precisam estar em `TRUST_PROXY`.

Atrás da Cloudflare, o caminho recomendado é configurar o módulo `real_ip` do
Nginx (com os ranges da Cloudflare) para que o IP encaminhado seja o do
visitante. Se o tráfego chegar por cloudflared local e você quiser confiar no
cabeçalho da Cloudflare, defina `TRUST_CF_CONNECTING_IP=1`. Não habilite essa
opção se qualquer cliente puder alcançar o Node diretamente e forjar
`CF-Connecting-IP`.

O Caddy também funciona e cuida de `Upgrade`/`Connection` automaticamente. Ele já repassa o `Host`
original; não use `header_up Host {host}`, porque `{host}` vem sem a porta e, fora da 443, o `Host` deixa de
combinar com o `Origin`:

```caddyfile
jogo.exemplo.com {
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Forwarded-For {client_ip}
        header_up -CF-Connecting-IP
    }
}
```

### Caddy com limites por IP (recomendado)

O arquivo [`deploy/Caddyfile`](../deploy/Caddyfile) é a configuração completa para produção. Ele descarta floods
no proxy, antes de chegarem ao Node:

- **429 por IP** em quatro zonas: todas as requisições (240/min), `/ticket` (40/min), handshakes WebSocket
  (30/min) e `/status*` (60/min). Os valores ficam acima dos do Node (`HTTP_RATE`, `TICKET_RATE`,
  `PERIP_RATE`), então quem joga normalmente continua regulado pelo Node, que conta, avisa e bane. O Caddy só
  corta o excesso bruto.
- **Slowloris**: o cabeçalho tem 10 s para chegar (`read_header`) e o limite é de 16 KB. Não há `read_body`
  nem `write`, porque eles derrubariam o WebSocket e o `/radio`.
- **Cloudflare**: os ranges dela vão em `trusted_proxies`, e só eles podem informar o IP do visitante por
  `CF-Connecting-IP`. O Caddy repassa esse IP ao Node **sobrescrevendo** o `X-Forwarded-For`. Sem Cloudflare a
  lista não tem efeito. Confira os ranges em <https://www.cloudflare.com/ips/> de vez em quando.

O `rate_limit` não vem no Caddy padrão. Gere o binário com o plugin:

```bash
xcaddy build --with github.com/mholt/caddy-ratelimit
caddy validate --config deploy/Caddyfile
```

Ou baixe o binário em <https://caddyserver.com/download> marcando `mholt/caddy-ratelimit`. No Node use
`TRUST_PROXY=127.0.0.1,::1` e `TICKET_MODE=enforce`.

O Caddy não limita conexões simultâneas por IP (não há equivalente ao `limit_conn` do Nginx). Esse limite
continua no Node, com `PERIP`.

### Cloudflare Tunnel (cloudflared) + Caddy (recomendado contra DDoS)

Com um **túnel nomeado** a VPS não abre nenhuma porta HTTP: o `cloudflared` conecta de dentro para fora e o
caminho fica visitante → Cloudflare → `cloudflared` → Caddy → Node. O IP da VPS não aparece no DNS, e quem o
descobrir não tem porta web para atacar. O túnel nomeado é grátis e não tem os limites do Quick Tunnel
(`cloudflared tunnel --url ...`, endereço `trycloudflare.com`, 200 requisições simultâneas, só para teste).

Arquivos: [`deploy/Caddyfile.tunnel`](../deploy/Caddyfile.tunnel) e [`deploy/cloudflared.yml`](../deploy/cloudflared.yml).

```bash
cloudflared tunnel login
cloudflared tunnel create skyke3d                         # mostra o <UUID>
cloudflared tunnel route dns skyke3d jogo.exemplo.com
sudo cp deploy/cloudflared.yml /etc/cloudflared/config.yml   # troque <UUID> e o domínio
sudo cp ~/.cloudflared/<UUID>.json /etc/cloudflared/
cloudflared tunnel ingress validate
sudo cloudflared service install
```

No Node (`/etc/skyke3d.env`): `PUBLIC_URL=https://jogo.exemplo.com`, `BIND_HOST=127.0.0.1`,
`TRUST_PROXY=127.0.0.1,::1` e `TICKET_MODE=enforce`. Não use `TRUST_CF_CONNECTING_IP`: quem lê o
`CF-Connecting-IP` é o Caddy, que repassa o IP ao Node no `X-Forwarded-For`.

Diferenças em relação ao `deploy/Caddyfile`:

- O Caddy escuta só em `127.0.0.1:8080`, em HTTP. O TLS fica na Cloudflare.
- O proxy confiável é `127.0.0.1`/`::1` (o `cloudflared` local), não os ranges da Cloudflare. **Não use o
  `deploy/Caddyfile` atrás do túnel:** o Caddy ignoraria o `CF-Connecting-IP` e todos os jogadores
  dividiriam um único limite de IP.

Firewall da VPS: recuse toda entrada, exceto o SSH e as portas do TURN. As portas 80, 443, 3000 e 8080 não
precisam ficar abertas. Se o IP da VPS já foi público antes (DNS antigo, e-mails), troque-o.

O túnel não resolve tudo:

- **TURN:** o túnel não leva UDP para visitantes públicos, então o coturn continua com IP próprio. Prefira
  outra máquina ou outro IP e use as cotas do coturn ([Configurar o coturn](#configurar-o-coturn)).
- **Disponibilidade:** se o `cloudflared` parar, o site para. O serviço instalado reinicia sozinho; para
  redundância, rode uma segunda réplica do mesmo túnel (`cloudflared tunnel run skyke3d` em outra máquina ou
  outro processo).
- **Rádio:** o plano grátis da Cloudflare restringe servir muito áudio ou vídeo. O `/radio` é pequeno
  (96 KB/s por rádio, `DJ_MAX_HUBS` rádios), mas acompanhe se o jogo crescer.

Em qualquer proxy, encerre o TLS nele. O cliente usa `wss://` automaticamente
quando a página é servida por HTTPS.

## Voz privada e TURN

**É preciso ter um servidor TURN (por exemplo, coturn) para a voz funcionar em produção.** O modo padrão,
`VOICE_PRIVACY=relay`, faz todo o áudio passar pelo TURN para que nenhum jogador veja o IP de outro. Sem TURN
configurado a voz fica **desligada**: o botão 🎤 mostra 🚫 e o servidor avisa no log. Ela não volta escondida para a
conexão direta. O resto do jogo (chat, vídeo, karaokê, rádio) funciona normalmente sem TURN.

| Modo | Precisa de TURN | Quem vê o IP de quem | Uso |
| --- | --- | --- | --- |
| `relay` (padrão) | sim | ninguém (só o servidor TURN) | produção |
| `direct` | não (usa STUN público do Google) | cada participante vê o IP dos outros | desenvolvimento ou rede confiável |

Como o modo `relay` protege o IP, mesmo contra um cliente modificado:

- o navegador recebe só o TURN (sem STUN) e `iceTransportPolicy: 'relay'`;
- o servidor do jogo filtra a sinalização: repassa só candidatos `typ relay`, troca o `raddr` (endereço de origem)
  por `0.0.0.0`, tira do SDP os candidatos `host`, `srflx` e `prflx` (inclusive `.local`) e zera as linhas `c=` e
  `a=rtcp`;
- o painel `/status` mostra o modo da voz no rodapé.

Ao ligar o microfone pela primeira vez, o jogador vê que a voz é transmitida em tempo real para todos na sala, não é
gravada e não deve conter dados pessoais.

**Custo.** Todo o áudio entra e sai do servidor TURN. Pela rota do relay o envio é limitado a **24 kbps** nos modos de
voz e **32 kbps** nos de música (mono), e o silêncio quase não gasta (VAD + DTX). Uma pessoa numa roda de voz ativa
gasta em média ~50–100 kbps de saída (~20–45 MB por hora).

### Configurar o coturn

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

O servidor gera, a cada entrada/sala, um usuário no formato `<expiração>:<TURN_LABEL>` e uma credencial HMAC-SHA1
válida por `TURN_TTL` segundos (60 a 86400). Isso evita credenciais permanentes. `TURN_LABEL` é sanitizado e tem
`skyke3d` como padrão.

Em **produção**, `TURN_SECRET` é obrigatório quando `TURN_URL` está definido. Sem ele, o processo encerra com código 1.
A única exceção é o escape explícito `TURN_ALLOW_STATIC=1`, que aceita `TURN_USER`/`TURN_PASS` fixos e gera aviso. Em
desenvolvimento, credenciais estáticas também são aceitas com aviso. Se `TURN_SECRET` estiver definido,
`TURN_USER`/`TURN_PASS` são ignorados.

Para testar a voz localmente sem TURN: `VOICE_PRIVACY=direct npm start`.

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
| `PRIVACY_CONTROLLER` | vazio | Nome do responsável pelos dados (pessoa ou empresa) mostrado em `/privacidade`. Sem ele, a página avisa que falta. |
| `PRIVACY_EMAIL` | vazio | E-mail de contato para privacidade, direitos e denúncias, mostrado em `/privacidade`. |
| `VOICE_PRIVACY` | `relay` | `relay`: a voz só passa pelo TURN e o servidor filtra a sinalização (ninguém vê o IP de ninguém); sem `TURN_URL`/`TURN_SECRET` a voz fica desligada. `direct`: voz direta entre navegadores (IPs visíveis), só para desenvolvimento. |
| `MAXROOMS` | `60` | Limite inicial de salas (1 a 150). O valor salvo pelo painel em `CAPACITY_FILE` prevalece. |
| `MAX_PER_ROOM` | `16` | Limite inicial de jogadores por sala (2 a 40); salas × jogadores por sala ≤ 3000. |
| `CAPACITY_FILE` | `data/capacity.json` | Limites de capacidade definidos pelo painel. `0` mantém só em memória. |
| `REPORTS_FILE` | `data/reports.json` | Denúncias (até 500, por 30 dias, sem IP). `0` mantém só em memória. |
| `DISCORD_REPORT_WEBHOOK` | vazio | URL de webhook do Discord para avisar de cada denúncia nova. Outras URLs são ignoradas. |
| `RAW_PERIP` | `40` | Conexões TCP abertas ao mesmo tempo por IP (contra slowloris); proxies confiáveis ficam de fora. |

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

Em produção ligue o ticket de admissão. O padrão `warn` só mede e não bloqueia ninguém:

```ini
# /etc/skyke3d.env
TICKET_MODE=enforce
# Dificuldade máxima da prova de trabalho sob pressão (padrão 16; 18 a 20 durante um ataque).
POW_MAX=16
TRUST_PROXY=127.0.0.1,::1
```

Antes de trocar, confira no painel `/status` (seção de ticket) que as falhas em `warn` estão perto de zero.
Depois de trocar, o log de inicialização mostra `Ticket de admissão: enforce (PoW até 16 bits).`

Com pm2:

```bash
pm2 start server.js --name skyke3d
pm2 save
pm2 startup
```

O servidor trata `SIGTERM`/`SIGINT` fechando os clientes com código `1001` e
parando de aceitar conexões; há um limite de 3 segundos para o encerramento
gracioso antes da saída forçada.
