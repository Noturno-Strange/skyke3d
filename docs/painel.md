# Painel de status

O painel `/status`: métricas, recordes, capacidade, teste de carga e moderação. Volte ao [README](../README.md).

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
- **Voz (quadros por segundo)**: na voz pelo WebSocket, quadros de áudio recebidos (↓) e repassados (↑) por segundo nos últimos 10 s, a banda gasta só com voz, quantas pessoas estão falando e ouvindo (microfone ligado) agora e os quadros descartados no último minuto (fila de envio de alguém cheia ou acima do limite por segundo). Descartes frequentes indicam jogadores com conexão congestionada. O rodapé mostra o modo da voz (WebSocket ou malha WebRTC com TURN).

Logo depois de iniciar, o atraso do loop pode aparecer alto por alguns instantes por causa da compressão feita no boot. Os dados estão em `/status.json`, no objeto `perf`.

### Teste de carga

`node tools/loadtest.js` mede o que o hardware aguenta. Ele sobe um servidor de teste (com limites por IP e admissão relaxados, sem gravar nada em `data/`), enche salas com jogadores simulados que andam e conversam (o cliente real manda 10 posições por segundo só enquanto anda) e, em cada degrau, mede o que o painel mede: **tick**, **atraso do loop (p99)**, **CPU do processo**, **memória** e **banda enviada**. No fim imprime uma tabela e sugere o limite de salas e de jogadores por sala.

```bash
node tools/loadtest.js --steps 160,320,640,960,1280 --per-room 32 --hold 20 --pin 0
```

- `--steps` jogadores simultâneos em cada degrau (no máximo 3000), `--per-room` jogadores por sala (2 a 40), `--hold` segundos medindo por degrau, `--move` fração andando ao mesmo tempo (padrão 0,3), `--chat` uma mensagem a cada N s por jogador (padrão 30, 0 desliga), `--out arquivo.json` grava o resultado.
- `--pin N` fixa o servidor no núcleo N (`taskset`, só Linux) para medir o que **um único núcleo** aguenta, que é o caso do jogo (o laço de salas roda numa thread). O gerador de carga usa as outras threads/núcleos (`--workers`).
- Para medir outra máquina: `--url ws://host:porta --token SEU_STATUS_TOKEN`. O servidor alvo precisa de `STATUS_TOKEN`, `TICKET_MODE=off` e limites por IP altos (`PERIP`, `PERIP_ROOM`, `PERIP_RATE`, `GLOBAL_RATE=0`); use só em teste, nunca no servidor de produção com gente jogando.
- Níveis: **OK** = tick ≤ 20 ms, loop p99 ≤ 50 ms e CPU ≤ 60% de um núcleo; **Atenção** até 50 ms / 100 ms / 90%; **Crítico** acima. A recomendação é 75% do maior degrau sem alerta. O atraso do loop tem um piso de ~10 ms (resolução do medidor).
- Mede o tráfego de estado do jogo. Não inclui a rádio do DJ (áudio repassado a cada ouvinte), vídeo, voz ou TURN, que gastam banda à parte.
- Se o gerador ficar saturado (aviso no fim), rode-o de outra máquina com `--url`, senão o resultado subestima o servidor.

### Keypass: liberar a renovação da chave de recuperação

Cada conta pode renovar a chave de recuperação sozinha 3 vezes, uma por mês ([Keypass](seguranca.md#keypass-renovação-da-chave-de-recuperação)). Quem já usou as três, ou não pode esperar o mês, pede ao administrador informando o **código do perfil público** (os 20 caracteres do link `/profile#código`).

- **Consultar:** mostra quantas renovações a conta usou, a data da última e se ela já pode renovar.
- **Liberar 1 renovação:** devolve uma oportunidade e tira a espera do mês. Vale uma renovação; liberar de novo antes de o jogador usar não acumula (responde 409).
- O painel não mostra, não gera e não troca chave nenhuma: depois da liberação, quem renova é o jogador, em 🔐 Segurança, com o código atual e o aparelho dele. **Confirme por outro canal que o pedido veio mesmo do dono** antes de liberar: o Keypass existe para limitar o estrago de uma chave vazada.
- API: `POST /status/keypass {"pid":"…"}` (com `"dry":true` só consulta). Mesmas proteções das outras ações do painel; a liberação entra no registro de segurança como `keypass.grant`.

### Moderação por IP

O menu **Moderação por IP** do painel (`/status`) lista os jogadores conectados agrupados por **ID do IP** (com nome, rótulo curto da sala e mundo) e permite:

- **Banir** o IP de um grupo, por 10 min, 1 h, 6 h, 24 h, 7 dias ou 30 dias. O painel pede confirmação, o servidor encerra na hora as conexões desse IP e recusa novas entradas. Em IPv6 o banimento vale para o bloco `/64`.
- **Desbanir** qualquer banimento ativo, pelo ID.
- **Buscar** um jogador por parte do nome, pelo **ID do jogador** (ex.: `p123`), pelo **ID do IP** ou pelo rótulo da sala. Quando todos os resultados vêm do mesmo IP, aparece um botão **Banir este IP**. A lista é virtualizada (só as linhas visíveis existem na página) e foi testada com cerca de 1800 jogadores; dá para ordenar por nome, ID do IP, quantos jogadores dividem o mesmo IP ou sala. A busca também filtra os banimentos ativos.
- **Capacidade:** a seção **Capacidade** do painel define o **limite de salas** e o de **jogadores por sala** (padrão 60 × 16 = 960 jogadores, pensado para 2 vCPU, 8 GB de RAM e 8 TB/mês de banda: salas de 16 gastam metade da banda por jogador que salas de 32; com 960 vagas o servidor precisa de cerca de 1230 descritores de arquivo, então suba o `ulimit -n`/`LimitNOFILE` para 4096 ou mais). O servidor foi projetado para no máximo **3000 jogadores ao mesmo tempo** (teto de projeto: de 1 a 150 salas, de 2 a 40 por sala, e salas × jogadores por sala ≤ 3000); o painel nunca aceita valores acima disso. O limite de **conexões** é calculado sozinho (todos os lugares + 5% + 25) e já ajustado ao aplicar. Antes de aplicar, o painel estima o que o valor exige: conexões, descritores de arquivo (confira `ulimit -n`/`LimitNOFILE`, em geral 1024), banda de envio no pior caso (todos andando ao mesmo tempo, em Mbit/s) e o tick projetado a partir do custo medido (precisa de pelo menos 10 jogadores online). Níveis **OK / Atenção / Crítico**, com confirmação quando não for OK. Reduzir o limite **não derruba ninguém**: salas e jogadores já dentro continuam e só entradas novas são recusadas. O valor fica em `data/capacity.json` (`CAPACITY_FILE`, `0` = só em memória) e vale depois de reiniciar; o ponto de partida vem de `MAXROOMS` e `MAX_PER_ROOM` (variáveis de ambiente) e o arquivo salvo pelo painel prevalece. A lista de jogadores do painel vai comprimida (gzip) quando passa de 2 KB.

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
