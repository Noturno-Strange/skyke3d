# Testes e medições (v3.24.3)

O que foi testado na expansão 3.24, como repetir e o que saiu. Volte ao [README](../README.md).

## Como rodar

| O quê | Comando | Precisa de |
| --- | --- | --- |
| Suíte automática (regras do servidor, protocolo pelo WebSocket, cliente lido como texto) | `npm test` | só o Node |
| Tipos, lint e formatação | `npm run check`, `npm run lint`, `npm run format:check` | só o Node |
| Interfaces em vários tamanhos de tela e níveis de zoom | `node tools/ui-audit.js` | Chrome ou Chromium (`CHROME=`) |
| Contraste dos textos nos três temas | `node tools/contrast-audit.js` | Chrome ou Chromium |
| Voz: atraso, perdas, CPU e banda do repasse | `node tools/voice-bench.js` | só o Node |
| Carga: muitos jogadores ao mesmo tempo | `node tools/loadtest.js` | só o Node |
| Cena 3D: chamadas de desenho e triângulos de cada mundo | `node tools/world-shots.js --out pasta --json` | Chrome ou Chromium |

As ferramentas sobem um servidor de teste próprio, com todos os arquivos de estado desligados (nada vai para `data/`).

## Suíte automática

739 testes em 91 arquivos, todos passando. Os arquivos novos desta versão:

| Arquivo | O que confere |
| --- | --- |
| `tests/keypass.test.js` | Keypass: 3 renovações por conta, uma por mês, a quarta recusada, liberação pelo administrador, chave antiga recusada, 20 pedidos simultâneos rendendo uma troca só, repetição sem gasto, falha de gravação sem perder a chave nem deixar duas valendo, e o que vai para o disco (só chaves públicas, contagem e datas) |
| `tests/gifts.test.js` | Presentes: só o que o jogador produziu, limites por dia e por pessoa, caixa cheia, repetição sem duplicar, limites que sobrevivem ao reinício, arquivo adulterado descartado, página pública sem código de ninguém |
| `tests/gifts-ws.test.js` | Pela rede: a culinária paga na carteira da fazenda, o presente fica na caixa e não entra na mochila nem vira moeda, aviso a quem recebe, caixa no perfil público, gravação em disco, e o Keypass de ponta a ponta com o painel do administrador |
| `tests/expansion.test.js` | Os 200 itens novos (sem repetição, todo ingrediente usado, progressão por nível), emblemas antigos preservados, carteira única com teto, bônus da horta, renascimento com data e sem duplicar estrela, cores das estrelas com contraste nos dois temas |
| `tests/voice-config.test.js` | `VOICE_TRANSPORT`: WebSocket sem a variável, valores aceitos, valor inválido recusado com mensagem clara, as duas tecnologias nunca transmitem juntas, lixo no canal de voz e queda de quem fala não afetam o chat |
| `tests/sky.test.js` | Céu de cada planeta montado uma vez (nada por quadro), nuvens numa malha só, chuva apagando os enfeites, mapa de sombras refeito em todo quadro (a atualização espaçada deixava peças sem desenho) |
| `tests/scene-fix.test.js` | Bonés retirados (quem tinha fica sem chapéu, no servidor, no perfil e no código de recuperação); preenchimento dos vazios fora da área de jogo, das montanhas e do corredor da frente; cacto e árvores distantes sem peças soltas e galho da terceira copa da árvore torta; caixa de cima da pilha de suprimentos e caixa de dados da estação meteorológica apoiadas de verdade |
| `tests/ui-regress.test.js` | Os defeitos achados pela auditoria de interface, a ligação dos presentes e do Keypass no cliente e a versão dos termos |

## Interfaces (`node tools/ui-audit.js`)

A ferramenta entra numa sala e, em 9 combinações (computador 1280×720 e 1024×600, zoom do navegador de 150 % e 200 %, Interface 125 % com Texto 130 %, tablet em pé, celular 390×780 e 360×640, celular deitado), aperta os 18 botões que abrem janelas, percorre todas as abas e fecha cada janela. Aponta botão que não faz nada, aba que não mostra o conteúdo, janela fora da tela ou com rolagem horizontal, alvo de toque pequeno, texto cortado e erros de JavaScript.

Achados na primeira rodada, corrigidos:

| Problema | Onde | Causa | Correção |
| --- | --- | --- | --- |
| As abas **Receitas** e **Preparo** da Culinária não respondiam ao clique | todas as telas | o script ligava os cliques na primeira lista de abas da página (`.cktabs`), que era a da Fazenda | cada painel liga na própria lista (`#pCook .cktabs`) |
| Visual, Ajustes e Denúncia saíam 10 px para fora da tela, pela esquerda | larguras de 481 a 700 px e tablet em pé | a largura de `calc(100% - 24px)` não contava a borda e o preenchimento | `box-sizing:border-box` nessa faixa |

Resultado final: 0 problemas nas 9 combinações (17 ou 18 janelas abertas em cada uma) e nenhum erro de JavaScript.

## Contraste (`node tools/contrast-audit.js`)

A auditoria de contraste passou a abrir também a Fazenda e os Presentes. O painel de presentes, as estrelas e o aviso do Keypass passam nos temas escuro, claro e alto contraste. Achados e correções: o contador de moedas da Fazenda ficava em 3,7:1 no tema claro (herdava a transparência dos textos pequenos do cabeçalho) e, no alto contraste, os botões Discord e Launcher e o rodapé da tela inicial ficavam entre 4,6:1 e 6,4:1 (o modo pede 7:1). Os seis efeitos de nome novos foram conferidos nos temas escuro e claro com cinco cores da paleta. Resta um aviso intermitente da própria ferramenta: a legenda rotativa da tela inicial às vezes é medida no meio da troca de tema, quando já está sumindo.

## Fluxo de presente em dois navegadores

Dois jogadores na mesma sala (Chromium): um liga o perfil público e planta; o outro prepara uma receita, abre a caixa do primeiro em 🎁, escolhe o item e confirma em dois toques. Conferido: o presente aparece na caixa de quem recebeu com o nome de quem enviou e a data, o aviso chega na hora, o limite passa de 5 para 4, a página `/profile` mostra a caixa e a `/fazenda` desenha o mapa nos temas claro e escuro e em tela de celular. Nenhum erro de console.

## Voz

Números completos e a comparação com a malha WebRTC em [Auditoria e arquitetura da voz](auditoria-voz.md#medições-v3242). Resumo: até 40 pessoas com 4 falando ao mesmo tempo, o repasse pelo WebSocket acrescentou menos de 1 ms na mediana (p99 de até 2,6 ms), sem nenhum quadro perdido, usando 6,5 % de um núcleo e 77 MB. Em dois navegadores de verdade, só a tecnologia escolhida transmitiu. O WebSocket continua o padrão.

## Carga (`node tools/loadtest.js --steps 160,320,640 --per-room 32 --hold 8`)

Máquina de 4 núcleos (Xeon 2,1 GHz), 16 GB, Node 22; gerador de carga na mesma máquina.

| Jogadores | Salas | Tick médio / máximo | Atraso do laço (p99) | CPU (um núcleo) | Memória | Envio | Por jogador |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 160 | 5 | 1,0 / 5,7 ms | 19,7 ms | 5 % | 84 MB | 231 KB/s | 1,44 KB/s |
| 320 | 10 | 1,2 / 8,7 ms | 19,7 ms | 5 % | 94 MB | 336 KB/s | 1,05 KB/s |
| 640 | 20 | 1,8 / 16,5 ms | 19,7 ms | 8 % | 113 MB | 620 KB/s | 0,97 KB/s |

Nenhum degrau gerou alerta. As funções novas (presentes, moedas da culinária, Keypass) só trabalham quando o jogador age, sem relógio por jogador, e não mudaram o custo do laço do servidor.

## Cena 3D

Chromium com desenho por software, sala parada, média de 40 quadros por mundo.

| Mundo | Chamadas de desenho (antes → depois) | Triângulos (antes → depois) |
| --- | --- | --- |
| Amazora | 359 → 297 | 139,8 mil → 111,7 mil |
| Cerron | 333 → 278 | 98,3 mil → 84,9 mil |
| Atlanthia | 356 → 287 | 108,2 mil → 90,5 mil |
| Caatara | 328 → 263 | 80,7 mil → 67,3 mil |
| Panthara | 344 → 285 | 99,0 mil → 84,3 mil |
| Pamphora | 343 → 277 | 107,5 mil → 89,2 mil |

"Antes" é o valor de todo quadro na versão 3.23.24 (as sombras eram refeitas sempre); "depois" é a média com a sombra refeita só quando algo se mexe e as nuvens numa malha só, já com o céu novo. O pico (o quadro em que a sombra é refeita) ficou igual ao de antes.

## O que não foi testado aqui

- Voz com pessoas de verdade, em redes com perda de pacotes e variação de atraso, e a qualidade percebida em cada navegador (a taxa de áudio da malha WebRTC não foi medida: o microfone falso do navegador não abriu a transmissão).
- Firefox e Safari (as ferramentas usam o Chromium). O código novo usa só o que o jogo já usava nesses navegadores.
- Aparelhos modestos de verdade (as medições da cena são em desenho por software, boas para comparar antes e depois, não para dizer quadros por segundo).
