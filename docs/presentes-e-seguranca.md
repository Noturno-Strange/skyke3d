# Skyke3D 3.29.0 — presentes, sementes e proteção do jogo

## Presentear sem sair da janela

A janela 🎁 da barra inferior agora oferece **Enviar para**, com os amigos online e offline. Escolher alguém abre a aba Enviar. Os destinatários vêm da lista privada já conhecida pelo jogador; os códigos públicos são calculados localmente, sem criar uma busca de contas no servidor. Os links de perfis públicos continuam funcionando.

O destinatário fica bloqueado enquanto um envio está em andamento. Mudar a pessoa antes do envio reinicia a confirmação, para evitar que o segundo clique envie um presente para alguém diferente. A caixa continua sendo uma coleção: não transfere moedas nem ingredientes. Permanecem as conferências de produção do próprio jogador, cinco envios por dia, um por destinatário por dia e o limite de espaço da caixa.

## Sementes no topo

O controle de sementes fica antes dos recordes e das abas, fixo no topo durante a rolagem. Na horta, mostra a semente em uso e permite trocá-la. No catálogo, o mesmo botão passa a **Usar [nome da semente]**, ou informa o nível necessário. Os detalhes da seleção aparecem antes da lista, sem exigir descer até o final para confirmar.

## Descarte proporcional e limites compartilhados

Uma sequência de 20 posições recebidas juntas podia gerar oito violações e desconectar uma pessoa com atraso de rede. Agora o servidor conserva apenas a posição mais recente e a aplica quando a janela de movimento libera. Não acumula uma fila de passos atrasados. A proteção de 150 mensagens por segundo, os limites de tamanho e o corte de mensagens inválidas continuam ativos.

Produção e ações de divulgação também passam por um limite em memória por **identidade**, compartilhado entre abas e reconexões. Abrir novas conexões, mesmo de IPs diferentes, não cria novas cotas de culinária, medicina, fazenda, presentes, chat ou gestos. Os gestos sonoros compartilham ainda o intervalo de cinco segundos e o teto de seis por minuto. As cotas normais por conexão foram preservadas.

Pedidos econômicos excedentes são descartados e recebem uma resposta de espera com o identificador do pedido. Não são executados mais tarde nem descontam ingredientes. Consultas de interface repetidas são descartadas sem tratar cliques rápidos como infração. Uma segunda aba em espera não gera banimento; os demais jogadores continuam com suas próprias cotas. Validação de payload, autenticação, crescimento das plantas, propriedade dos itens, moedas e cura por outro jogador continuam decididos pelo servidor.

O módulo `lib/action-limit.js` reutiliza o limitador com teto de memória e expiração. O painel protegido `/status.json` mostra somente contadores agregados em `abuse.fraude.trafego`: aceitações, descartes e quantidade de chaves do limitador. Não adiciona nomes, mensagens, IPs ou identidades ao relatório.

## Testes reproduzíveis

- `node --test tests/multiplayer-scenario.test.js`: oito identidades em duas salas, colheita, plantio, rega, compra de mantimentos, culinária, presentes e cura entre amigos. Depois executa 50 rodadas de decisões aleatórias com semente fixa `0x51a7`. Confere isolamento das salas, respostas, conexão dos jogadores e ausência de descanso por antifraude.
- `node --test tests/game-security-ws.test.js tests/action-limit.test.js`: tentativas por múltiplas abas/IPs e reconexão, preservação da despensa, limites de mensagens e sons, rajada de movimento, JSON inválido e inundação real. Confere que os outros jogadores seguem conectados.
- As suítes existentes de segurança, abuso de identidade e presentes cobrem também prova de assinatura, rotações concorrentes, controle de acesso, itens não produzidos, limites de presentes, sinalização de voz e conexões lentas.
- Chrome com dois perfis isolados: seleção de amiga offline, envio pela janela da barra e recebimento após entrar novamente. Seleção e confirmação da semente verificadas em 1280×720, 960×1040 e 640×450, inclusive com o painel rolado até o final.

Uma execução isolada do cenário cooperativo registrou 94 pedidos com resposta e 909 eventos, com percentil 95 de resposta de 26 ms. O teste de carga abaixo não utiliza as contas nem os dados reais:

```sh
node tools/loadtest.js --steps 32,64 --per-room 8 --hold 8 --workers 2 --move 0.65 --chat 6 --out resultado.json
```

Na máquina local (Ryzen 7 5700G, Node 22), os dois degraus terminaram sem quedas. Com 64 jogadores em oito salas, o tick médio foi 0,5 ms, o maior tick 1,9 ms, o atraso de loop p99 13,4 ms e a memória 92 MB. São medições curtas do servidor nessa máquina; não medem renderização dos computadores dos jogadores, vídeo, rádio ou tráfego de voz.

A suíte completa registrou **792 testes aprovados**, sem falhas ou testes ignorados. Tipos, lint, formatação e auditoria das dependências de produção passaram; nenhuma vulnerabilidade conhecida foi apontada. A auditoria de interface conferiu três tamanhos/níveis de zoom, sem problemas de controles nem erros de JavaScript. A auditoria completa de contraste terminou sem textos abaixo do mínimo nos temas claro, escuro e de alto contraste. A ferramenta de contraste passou a usar um perfil isolado e esperar os scripts e a sala estarem prontos, para medir os painéis na cena correta.
