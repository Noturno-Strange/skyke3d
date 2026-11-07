# Auditoria da voz pelo WebSocket (v3.23.1)

O que foi conferido no código, o que foi corrigido e o que ainda precisa de teste em rede real. O protocolo, o codec
(Opus com o ADPCM como alternativa), as salas, o chat e o movimento não mudaram, e os clientes atuais seguem compatíveis.

## O que já existia e foi mantido

- `maxPayload` de 32 KB e `perMessageDeflate` desligado no `WebSocketServer`.
- Quadro de entrada validado (`parseIn`): tipo 2, codec conhecido, de 4 a 600 bytes, sem cópia (`subarray`).
- Limite por jogador (`frameOk`): 50 quadros/s e 12 KB/s; o excesso é descartado sem derrubar.
- Enxurrada: mais de 150 mensagens binárias por segundo derruba a conexão (1008) e conta no banimento.
- O quadro de saída é montado uma vez e o mesmo `Buffer` vai para todos os ouvintes.
- Cada ouvinte recebe no máximo 8 vozes (as mais próximas); quem fala não recebe a própria voz.
- Fila de saída acima de 1 MB derruba a conexão (`sendRaw`); ping a cada 30 s derruba conexões mortas.
- O tratamento de mensagens fica dentro de `try/catch`; não há operação síncrona de disco ou rede no caminho da voz.

## Problemas confirmados e corrigidos

| Problema | Correção |
| --- | --- |
| A voz só era descartada com mais de 256 KB na fila: são vários segundos de áudio que o cliente já não aproveita (ele toca no máximo 0,6 s à frente), e o estado, o chat e o movimento da mesma conexão esperavam atrás. | Limite de 64 KB (o mesmo que o cliente usa para enviar), com histerese: depois de congestionar, a voz para essa pessoa só volta abaixo de 16 KB (`VWS.roomy`). |
| Quadro binário malformado era descartado sem consequência: dava para mandar quase 150 × 32 KB por segundo de lixo sem ser derrubado. | Quadro malformado conta como violação, como um JSON inválido: 8 em 10 s derrubam. O cliente do jogo nunca manda um. |
| `speak` estava nos tipos SOFT: acima do limite de taxa o aviso se perdia, e o servidor podia ficar descartando a voz de quem falava (ou contando como falando quem parou). | `speak` entrou em `TRAIL`: o último estado é aplicado quando o limite libera, como no `vlisten`. |
| O painel não separava os descartes por causa nem mostrava quem estava congestionado. | `perf.voice` ganhou `limited`, `malformed` e `congested` (contadores, sem identificar jogador). |

O laço de repasse saiu de `voiceIn` para `VWS.relay` (mesmo comportamento), para poder ser testado com conexões falsas.
Um erro ao mandar para um ouvinte não interrompe os demais.

## Testes

- `tests/voicews-overload.test.js` (local, sem rede): histerese, ouvinte lento perde só a própria voz e os outros
  recebem tudo, fila limitada a ~64 KB, erro num ouvinte, salas independentes, custo do repasse numa sala de 40.
- `tests/voicews-overload-ws.test.js` (servidor de verdade, conexões em 127.0.0.1): duas salas com todos falando,
  quadros malformados e grandes, áudio contínuo acima do limite, cliente que para de ler, queda sem fechamento e
  troca rápida de `speak`. Os testes de malformados e de `speak` falham com o `server.js` anterior.

## O que ainda precisa de ambiente real

- Rede real (perda, latência, banda de celular) e navegadores reais: os testes rodam em loopback.
- No loopback o kernel absorve vários MB antes de a fila do servidor crescer; o descarte por congestionamento só
  aparece depois de um bom tempo sem ler (numa medição local de 150 s apareceu, e o ping derrubou os clientes parados).
- A voz roda no mesmo processo do jogo. Numa medição local (160 conexões, 80 falando, ~30 mil quadros/s e ~5 MB/s de
  saída), o tick médio ficou em 0,5 ms e o atraso do loop p99 em ~16 ms. Isso não substitui um teste de carga na
  máquina de produção.
