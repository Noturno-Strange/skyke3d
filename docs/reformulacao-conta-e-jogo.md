# Skyke3D 3.27.0 — conta, despensa e medicina

## Arquitetura e causas encontradas

Os `app-*.js` são scripts comuns em ordem, sem build; o servidor Node valida mensagens antes dos handlers. A identidade P-256 e a chave de recuperação já possuem provas, rotação, revogação e espera de proteção. Elas foram preservadas.

A aparência e os amigos dependiam do armazenamento local e do snapshot de um código antigo. Na entrada, o cliente também publicava textos vazios antes de ler os campos persistidos, apagando a versão do servidor. Agora `accountget`, disponível só após prova da chave principal, busca `players.json` (nome, aparência e amigos privados) e os textos de `profiles.json` antes de entrar na sala. Dados existentes de perfil migram como fallback; uma lista vazia salva é autoritativa, para não ressuscitar amigos removidos. Os nomes dos amigos também acompanham a lista. A lista privada e o estoque nunca aparecem nas rotas públicas.

## Conta e acesso

O caminho principal é guardar um arquivo secreto e colá-lo na tela inicial do outro aparelho. O novo código substitui o utilizado; é mostrado e guardado antes de efetivar a troca. A espera de proteção do servidor continua e a interface conclui automaticamente esperas de até dois minutos (o padrão é um minuto). Esperas maiores configuradas pelo administrador informam quando voltar. A chave privada de recuperação não é enviada ao servidor nem persistida no navegador. Chaves antigas continuam sujeitas às verificações criptográficas e às regras existentes.

Digital/PIN é opcional e recolhido. Rotação de chave do aparelho e atualização de snapshots saíram da interface principal; substituição de código comprometido e encerramento de sessões ficam em mais opções. O perfil já nasce público; textos são opcionais. O aceite da política mudou para 15/11/2026 porque a sincronização passa a guardar a lista de amigos no servidor.

## Fazenda e culinária

Cada unidade colhida cuja planta tem ingrediente associado entra em `stock`, dentro do registro da fazenda. O estoque começa vazio na migração: estatísticas históricas não viram itens novos. A receita válida consome uma unidade de cada ingrediente, no servidor, sem baixa parcial quando falta algum. Ingredientes cultiváveis mostram suas sementes de origem. Mantimentos não cultiváveis (sal, leite, ovos etc.) são trocados por quatro moedas por unidade no armazém da despensa. Uma conta nova precisa colher para obter ingredientes ou moedas.

Há uma fazenda por identidade. Terreno, produção e casa são melhorias da mesma posse; os índices e compras anteriores foram preservados. O mapa público desenha só uma casa, identificada pela categoria atual da propriedade.

## Medicina fictícia

Receitas compartilhadas em `assets/medicine.js`, domínio em `lib/health.js`, interface em `assets/app-health.js`. Tônico solar, bálsamo de luar e soro estelar usam apenas ingredientes cultiváveis da despensa. O estoque de cada remédio tem limite de 99.

Após 30 minutos de atividade em pé, o personagem pode apresentar poeira lunar, frio estelar ou fadiga cósmica. Não há morte nem contágio. O cansaço fica visível no nome e no perfil, sem impedir movimento, e passa sozinho em dez minutos, inclusive offline. Uma cura dá 30 minutos de proteção. Sentar não soma atividade. Abas duplicadas não aceleram o relógio.

O servidor exige remédio em estoque, paciente com mal-estar, amizade mútua, mesma sala e distância até três metros. Curar a si mesmo também é possível. A cura consome um remédio, limpa o estado e avisa todos os clientes; repetir a ação em alguém saudável não consome nem repete o efeito. Cuidar de amigos rende experiência de medicina. Partículas têm quantidade e duração limitadas e liberam materiais e geometria; movimentos reduzidos diminuem o efeito. A seringa tem animação e um “Ai!” sintetizado, respeitando volume e silenciamentos do jogo.

## Movimento e limite da investigação

O código anterior zerava os passos quando `prefers-reduced-motion` estava ativo. Agora mantém uma passada discreta e remove o balanço do tronco. WASD usa a posição física das teclas com fallback; setas não rolam a página; mudar o foco para um campo ou esconder a aba limpa teclas presas. O clique para caminhar limita o passo à distância restante, evitando ultrapassar o destino em quadros lentos. A câmera usa suavização por tempo.

Essas correções cobrem causas reproduzíveis no cliente. Testes em Chrome com CPU limitada não equivalem a testar o computador com GeForce 730; não comprovam compatibilidade de driver nem desempenho naquele equipamento. O `?perf=1` continua disponível para diagnóstico local.

## Persistência e operação

`PLAYER_DATA_FILE` e `HEALTH_FILE` usam por padrão `data/players.json` e `data/health.json`. `0` mantém apenas em memória. Arquivos são privados (0600), com gravação atômica e flush ao encerrar. Inclua ambos nos backups do servidor. Culinária e remédios compartilham a despensa em `farm.json`; não há transação de disco única entre os arquivos de progresso, então um encerramento abrupto ainda pode perder alterações recentes do intervalo de gravação, como nos sistemas anteriores.

Testes e ferramentas isolam os arquivos reais do jogador. A publicação da versão 3.27.0 segue o workflow de release do projeto, acionado pelo push na `main`.

## Verificação final

- Suíte completa: o runner registrou 783 testes aprovados, sem falhas nem cancelamentos.
- `npm run check`, `npm run lint`, `npm run format:check` e `git diff --check` passaram.
- Chrome: oito teclas de direção, movimento diagonal, redução de movimentos e limitação de CPU em 4×; sem erros de JavaScript.
- Recuperação pela interface em dois perfis isolados do Chrome: nome, aparência, texto do perfil e nome de amigo offline preservados. Entrada em sala bloqueada durante a recuperação e liberada ao concluir.
- Auditoria das janelas em 1280×720, 960×1040 e zoom de 200%: sem problemas nos painéis nem erros de JavaScript.
- Inspeção visual das telas de conta e medicina e execução dos efeitos da seringa. A renderização por software foi reduzida apenas no navegador de teste; o padrão gráfico do produto foi preservado.
