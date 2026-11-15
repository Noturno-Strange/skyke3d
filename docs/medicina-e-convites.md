# Skyke3D 3.28.0 — farmácia astral e convites

A medicina passa de 3 para 18 receitas. Os nomes combinam referências à farmácia, à botânica brasileira e à alquimia fantástica. Todos os preparos e efeitos pertencem ao jogo: não reproduzem fórmulas, dosagens ou indicações de medicamentos reais.

| Forma | Receitas | Feedback |
| --- | --- | --- |
| Tônicos | Paracetamol de Aurora; Dipirona de Vênus; Garrafada de Açaí Astral | Frasco, goles, bolhas em espiral e gotas sonoras |
| Bálsamos | Unguento de Copaíba Lunar; Cataplasma de Jatobá Cósmico; Pomada Calêndula-7 | Pote, massagem, folhas de luz e som suave de fricção |
| Injeções | Soro Fisiológico de Éter; Penicilina Quântica; Vacina de Nebulosa | Seringa, reação de picada, “Ai!” sintetizado e hélice luminosa |
| Brumas | Aerossol de Hortelã Glacial; Salbutamol-Nimbus; Bruma de Eucalipto Azul | Borrifador, respiração, nuvens e sopro |
| Cápsulas | Vitamina C de Supernova; Cápsula de Guaraná e Fótons; Comprimido Acetil-Lunar | Cápsula, gesto de deglutição, estrelas e pequenos estalos |
| Alquimia | Pedra Filosofal Líquida; Panaceia de Azoth; Elixir Albedo-Rubedo | Frasco, gesto com as duas mãos, círculos de luz e sinos |

Cada receita possui uma paleta e uma tonalidade sonora. O preparo tem animação, partículas e som próprios. O painel oferece busca por nome ou ingrediente, filtro por forma de aplicação e receitas expansíveis. Ingredientes e quantidades continuam vindo da despensa da fazenda. Todas as receitas curam os mesmos tipos de mal-estar fictício, sem exigir que o jogador adivinhe qual medicamento serve para cada doença.

Os identificadores `tonico_solar`, `balsamo_luar` e `soro_estelar` foram preservados: remédios existentes recebem o novo nome sem perder quantidades. O formato do arquivo de saúde continua sendo a versão 1. A cura continua exigindo **outro jogador**, amizade mútua, mesma sala e proximidade de até 3 metros. Não existe autocura nem recuperação automática pelo tempo.

Os efeitos acompanham a posição do avatar e são descartados ao terminar ou sair da sala. Há no máximo oito efeitos simultâneos, com seis partículas por efeito quando a redução de movimentos está ativa. Os sons respeitam o canal de efeitos, o volume, a distância e o silenciamento do jogo. A ferramenta `node tools/audio-audit.js --medicina` mede preparo e aplicação de todas as receitas.

## Convite pela lista de amigos

Ao aceitar um convite, o cliente abre outra conexão e reutiliza o token de sessão ainda válido. O carregamento da conta passou a acontecer antes da entrada na sala, mas não enviava esse token: o servidor recusava a conexão nova e o jogador voltava ao menu com “Entre novamente para carregar sua conta”.

Agora o cliente envia o token no carregamento e o servidor verifica validade, geração, época e permissão da chave principal antes de ler os dados privados. Token inválido ou de recuperação não permite essa leitura. A troca de sala preserva aparência e lista de amigos. Convite para a própria sala não provoca saída.

O remetente só vê “Convite enviado” depois que o servidor entrega a notificação. Amigos indisponíveis, pessoas já na mesma sala e o intervalo de 30 segundos entre convites recebem feedback específico, mantendo as regras de privacidade e de limitação existentes.

## Validação

- Suíte completa: 787 testes aprovados, sem falhas ou testes ignorados.
- Checagem de tipos, lint, formatação e auditoria das dependências de produção aprovados; nenhuma vulnerabilidade encontrada.
- Convite aceito pela lista de notificações em dois perfis isolados do Chrome, entrando na mesma sala sem erro de sessão.
- As 18 receitas foram preparadas pela interface; busca sem acentos, filtros, animações e descarte das geometrias verificados. O painel foi conferido em 1280×900, 1280×720, 960×1040 e 640×450, sem rolagem horizontal nem erros de JavaScript.
- O painel de medicina passou na medição de contraste nos temas claro e escuro, com e sem alto contraste.
- Os 36 sons de preparo e aplicação passaram no alvo de volume e no teto de pico da ferramenta de auditoria.

As verificações do navegador usaram renderização por software com resolução reduzida somente na sessão de teste; o padrão gráfico do produto foi preservado.
