# Skyke3D 3.30.1 e 3.30.2 — troca de conta, reconexão, passkeys e auditoria das chaves de recuperação

## Correções

- **Nome da conta corrompido ao trocar de conta ou recarregar.** A sessão anterior da mesma conta ficava na sala por até 30 s
  esperando reconexão e segurava o nome: a entrada nova virava "Ana 2" e esse nome com sufixo era gravado nos dados da conta.
  Agora a mesma conta entrando de novo na sala substitui a sessão dela que caiu (`addHuman` em `server.js`).
- **Conta "sumia" depois de uma queda de conexão.** A reconexão automática (`resume`) voltava para a sala sem a conta: fazenda,
  mascote, cozinha, presentes, saúde e perfil pediam para entrar de novo. Agora a conexão volta com a conta enquanto a sessão
  dela ainda vale no servidor. O jogador guarda só o hash do token (`lib/auth.js`, `verifyKey`). Sessão vencida ou revogada
  (por exemplo, por quem tem o código) continua voltando à sala sem a conta.

## Auditoria das chaves de recuperação

O que está seguro:

- o código leva uma chave privada P-256 completa (256 bits): força bruta é inviável. A conferência de 40 bits serve só para
  pegar erro de digitação;
- a chave principal fica no IndexedDB, sem poder ser exportada; a chave de recuperação privada nunca é guardada no navegador;
- o servidor guarda só chaves públicas e o hash dos tokens;
- trocar a chave principal exige as duas assinaturas; o código vale uma vez (o pedido já registra o código novo);
- a autorização do administrador é de uso único, vale 24 h e só o hash fica guardado;
- o servidor não revela se uma conta existe, nem pelo tempo de resposta.

Pontos de atenção (configuração e processo, não mudaram nesta versão):

1. **Carência padrão de 1 minuto** (`IDENTITY_GRACE_MS` = 60000). Com um código vazado, o ladrão fica com a conta se o dono não
   estiver online nesse minuto para cancelar. Em produção, recomenda-se `IDENTITY_GRACE_HOURS=24`. Entrar com passkey não espera.
2. **Código vazado logo depois de uma renovação:** o Keypass só deixa renovar de novo depois de 30 dias (3 por conta). Até lá,
   quem tem o código pode repetir o pedido e o dono precisa cancelar toda vez; só o administrador libera a renovação antes.
3. **Cache limpo durante a carência:** vale o código novo mostrado na primeira tentativa. Quem não o guardou só volta com a
   ajuda do administrador.

## Simulado (`tests/account-switch-sim.test.js`)

Usa o cliente de verdade (`assets/identity.js`, num `vm` com IndexedDB e localStorage simulados) contra o servidor de verdade,
com carência de 1,2 s:

- 5 jogadores trocam de conta ao mesmo tempo em 4 rodadas, misturando cache limpo, "Esquecer conta" e queda de conexão no
  meio do pedido de recuperação. A cada troca: o código usado morre, a chave do aparelho antigo não entra mais e os dados
  (nome) acompanham a conta;
- os 5 caem durante o jogo e voltam por `resume`, ainda com acesso à conta (fazenda e dados);
- dois aparelhos restauram a mesma conta com o mesmo código ao mesmo tempo: só um fica com ela;
- cache limpo durante a carência: vale o código novo da primeira tentativa;
- sessões revogadas com o código: a reconexão volta à sala, mas sem a conta.

Rodado contra a versão 3.30.0, o simulado falha no nome com sufixo; na 3.30.1 passa. A suíte completa passou.

## 3.30.2 — passkey roubada não tranca mais o dono

A chave da passkey nasce dentro do autenticador (celular, computador, chave física ou gerenciador) e nunca sai de lá: o servidor só
guarda a pública e confere origem, desafio de uso único, verificação do usuário (biometria ou PIN), algoritmo e contador. Isso continua
igual: o jogo não deve gerar uma chave própria para a passkey.

O problema estava no que a passkey permitia depois de entrar. Quem usasse a passkey de outra pessoa (por exemplo, invadindo a conta do
Google, iCloud ou Bitwarden que a sincroniza) virava o principal na hora e, só com a sessão do aparelho, conseguia cadastrar uma passkey
sua, revogar a do dono e cancelar quantas vezes quisesse a recuperação que o dono pedia com o código. O dono perdia a conta de vez.

Agora a chave de recuperação (o código) assina também:

- **cadastrar uma passkey** — `passkeyAdd(id, rgen, desafio, id da credencial)`, amarrado ao desafio de uso único;
- **revogar passkeys** — `passkeyRemove(id, rgen, época, alvo)`, com o alvo sendo a passkey ou `*` (todas); a época muda a cada
  entrada por passkey ou troca de chave, então uma assinatura antiga não serve de novo;
- **cancelar um pedido de recuperação** — a mesma mensagem de antes, assinada pela principal **e** pela recuperação.

Sem a assinatura (ou com a de outra chave) o servidor responde `need-code` e não muda nada. No navegador, o código é pedido só quando a
chave de recuperação não está na memória (logo depois de criar a conta, restaurar ou gerar um código novo ela fica por 10 minutos). No
cadastro, o código é pedido **depois** de o navegador criar a passkey, porque o Safari só abre a criação se ela sair direto do clique;
cancelar nessa hora não cadastra nada no servidor (a passkey criada fica sem uso no autenticador).

Resultado: o intruso com a passkey ainda entra, mas o dono retoma na hora com a própria passkey (que continua na conta) ou, pelo código,
depois da carência; com o código, revoga a passkey vazada. Se o próprio código vazou, o dono (que também o tem) cancela e gera um novo.

Testes: `tests/passkey-switch-sim.test.js` (o intruso com a passkey não cadastra, não revoga, não cancela; o dono recupera e revoga),
`tests/passkey-ws.test.js` e `tests/passkey-client.test.js` (pedidos sem código ou com código de outra conta são recusados),
`tests/identity-recovery.test.js` e `tests/identity-ws.test.js` (cancelar exige as duas chaves).
