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
limites por ação, reconexão com rotação de token e expiração da sala. Os testes
de integração iniciam o servidor em uma porta efêmera e usam uma janela curta de
`RECONNECT_MS`.

## Página inicial

Ao abrir o jogo, uma página inicial aparece antes da janela de entrada, com:

- **Jogar**: fecha a página inicial e abre a janela do jogo (nome, cenário e sala).
- **Discord**: abre o servidor da comunidade em uma nova aba.
- **Cinematic**: animação em canvas gerada por código (sem vídeos ou imagens
  externos), que apresenta os seis mundos, a voz, o karaokê e os vídeos.
  Ela pausa quando a aba fica oculta e respeita `prefers-reduced-motion`
  (nesse caso mostra um quadro estático).

O código está no próprio `index.html` (bloco `#intro`).

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
  de um proxy dessa lista o servidor lê `X-Forwarded-For`/`CF-Connecting-IP`
  para os limites por IP. O proxy deve **sobrescrever** esses cabeçalhos.
- As sessões, tokens e salas ficam apenas em memória. Reiniciar o processo
  encerra todas as salas; não há banco de dados.

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
falsifique o próprio endereço. Behind Cloudflare, configure antes o módulo
`real_ip` do Nginx (ou um túnel local) para que o IP encaminhado seja o do
visitante, e não o da borda da Cloudflare.

O Caddy também funciona e cuida de `Upgrade`/`Connection` automaticamente:

```caddyfile
jogo.exemplo.com {
    reverse_proxy 127.0.0.1:3000 {
        header_up Host {host}
    }
}
```

Em qualquer proxy, encerre o TLS nele. O cliente usa `wss://` automaticamente
quando a página é servida por HTTPS.

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
| `PORT` | `3000` | Porta HTTP do servidor (`0` escolhe uma porta livre). |
| `BIND_HOST` | `0.0.0.0` | Interface de escuta. Em produção use `127.0.0.1`. |
| `STATUS_TOKEN` | vazio | Ativa o painel `/status`; mínimo de 12 caracteres. |
| `PUBLIC_URL` | vazio | Origem HTTPS pública do jogo. Ativa o modo produção e os links compartilhados. |
| `ORIGINS` | vazio | Origens WebSocket adicionais (`https://host[:porta]`), separadas por vírgula. |
| `ALLOWED_HOSTS` | vazio | Hosts adicionais aceitos no handshake (`host[:porta]`), separados por vírgula. |
| `TRUST_PROXY` | `127.0.0.1,::1` | IPs/CIDRs de proxies confiáveis para `X-Forwarded-For`/`CF-Connecting-IP`. |
| `RECONNECT_MS` | `30000` | Janela de retenção da sessão após queda, entre 100 e 300000 ms. |
| `TURN_URL` | vazio | URL do servidor TURN para WebRTC (usado como fallback). |
| `TURN_USER` | vazio | Usuário do TURN. |
| `TURN_PASS` | vazio | Senha do TURN. |
| `TURN_SECRET` | vazio | Segredo TURN para credenciais temporárias. |

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
- Além dos limites por IP (`PERIP`, tentativas de sala, handshake e painel),
  cada conexão tem limites por ação (chat, movimento, emoji, item, gesto,
  vídeo, karaokê, WebRTC etc.). Spam persistente recebe close `1008`.
- O handshake exige `Host` e `Origin` únicos, válidos e compatíveis; o proxy
  precisa preservar o `Host`.
- Tokens de sessão têm 32 bytes aleatórios (base64url, 43 caracteres), são
  comparados em tempo constante, rotacionados a cada reconexão e mantidos
  somente em memória.
- Mensagens muito grandes são cortadas pelo limite de 32 KiB do WebSocket
  (close `1009`) e há um teto de 150 mensagens por segundo por conexão.

## Releases

Cada push para a branch `main` cria automaticamente um GitHub Release com a
tag no formato `vAAAA.MM.DD-<sha-curto>`, usando as notas geradas pelo GitHub.
O fluxo está em `.github/workflows/release.yml`.

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
test/            testes com node:test (validadores e integração)
package.json     scripts e dependências
package-lock.json
LICENSE          licença GNU GPL v3
```
