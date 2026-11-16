# Skyke3D 3.30.0 — chave física e gerenciadores de passkeys

A entrada opcional agora mostra duas escolhas: **Bitwarden ou outra passkey** e **Chave física FIDO2 (USB/NFC)**. São chaves de acesso WebAuthn, sem criar uma senha ou PIN próprio do jogo. O código de recuperação continua disponível.

## Cadastrar

1. Entre na sua conta e abra **🔐 Conta e acesso → Chave física ou passkey**.
2. Escolha onde guardar a credencial. Para uma TrustKey T110, escolha **Chave física FIDO2**; para o Bitwarden, escolha **Bitwarden ou outra passkey**.
3. Dê um apelido, por exemplo “TrustKey T110” ou “Bitwarden”, e clique em **Cadastrar chave de acesso**.
4. Siga a confirmação do navegador, da chave ou do gerenciador. No Bitwarden, a função de salvar e usar passkeys deve estar habilitada e o domínio do jogo não pode estar na lista de exclusões. [Instruções oficiais do Bitwarden](https://bitwarden.com/help/storing-passkeys/).

## Entrar em outro aparelho

Na tela inicial, abra **Já jogo · Entrar na minha conta**, escolha o tipo de chave e clique em **Entrar**. O primeiro clique prepara a conexão segura; o segundo abre o autenticador. A conta e seus dados são carregados antes da escolha da sala. Use o mesmo endereço HTTPS em que cadastrou a chave.

## O PIN pertence ao autenticador

A T110 usa **PIN e toque**, conforme a [documentação da TrustKey](https://trustkeysolutions.com/en/sub/view.form?boardId=press&postNo=115). Escolher a chave física evita tratar o PIN do computador como a única opção de acesso, mas não remove a proteção da própria chave. O navegador ou o gerenciador também pode pedir desbloqueio. O Skyke3D não recebe nem guarda esse PIN, a senha do cofre ou a chave privada da passkey.

O modo físico usa a preferência `security-key` do WebAuthn e, no cadastro, um autenticador externo (`cross-platform`). O modo para gerenciadores não impõe autenticador do sistema nem transporte interno: o navegador ou extensão apresenta as passkeys disponíveis. O jogo não identifica a marca do provedor e não força a abertura de uma extensão específica. [WebAuthn, recomendações de autenticador](https://www.w3.org/TR/webauthn-3/#enumdef-publickeycredentialhint).

## Segurança e compatibilidade

Permanecem obrigatórios `userVerification: required`, presença do usuário, credencial descobrível, desafio de uso único, vínculo à conexão, domínio, origem, assinatura e validação dos contadores. O cadastro e a entrada não foram rebaixados para aceitar uma confirmação sem verificação do usuário. Chaves apenas U2F, sem as capacidades FIDO2 necessárias, não substituem uma passkey neste fluxo de entrada sem senha.

A detecção do cliente deixou de exigir os métodos no protótipo nativo de `AuthenticatorAttestationResponse`: gerenciadores podem fornecer esses métodos na resposta da própria credencial. A resposta recebida ainda precisa fornecer os dados necessários ao servidor; versões de navegador ou provedor incompatíveis recebem uma mensagem de atualização.

Os testes automatizados simulam um provedor de passkeys e uma chave externa. A verificação no Chrome usa um autenticador virtual CTAP2 por USB, com credencial descobrível e verificação do usuário, e exercita cadastro e entrada em outro perfil de navegador. Isso verifica o fluxo do padrão, sem certificar um exemplar físico da T110 ou uma instalação real do Bitwarden.

Validação da versão: **794 testes aprovados**, sem falhas nem testes ignorados; tipos, lint e formatação aprovados. A auditoria de interface passou em três tamanhos/níveis de zoom e a auditoria completa de contraste não encontrou textos abaixo do mínimo.
