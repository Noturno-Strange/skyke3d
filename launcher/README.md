# Launcher do Skyke3D (Java)

Um `.jar` universal (Windows, macOS e Linux) que escolhe **para qual servidor o jogo conecta** e abre o jogo. Tem a mesma cara da tela inicial do jogo: o céu com estrelas e os seis planetas animados, o logo em degradê, a fonte Manrope e os botões no mesmo estilo. A janela se arrasta pelo fundo e fecha com Esc.

![Janela do launcher](../docs/img/launcher.png)

- **Domínio do servidor:** digite o domínio (`skyke3d.com.br`, `jogo.meusite.com`, `meu.servidor:8443`, `localhost:3000`...). Sem `https://`, o launcher usa https; para endereços da própria máquina ou da rede local (localhost, 127.x, 192.168.x, 10.x, 172.16–31.x, `*.local`) usa http. Caminho, usuário e senha no endereço são descartados ou recusados.
- **Atalhos:** abaixo do campo ficam o **✦ Oficial** e os servidores usados por último; um clique troca de servidor e o **×** tira da lista.
- **Sala (opcional):** entra direto na sala com esse código (`#sala=CODIGO`).
- **Testar conexão:** confere se o endereço responde e se é mesmo um servidor do Skyke3D. Avisa quando, sem https, o navegador não vai liberar o microfone (a voz só funciona em https ou em localhost).
- **Jogar:** com **janela própria**, abre o jogo num Chrome, Edge, Brave, Chromium, Vivaldi ou Opera instalado em modo aplicativo (sem abas nem barra de endereço), com um perfil só do launcher; sem nenhum deles, ou com a opção desligada, abre no navegador padrão.

## Versão e launcher oficial

O launcher tem versão própria, em `launcher/VERSION` (hoje 1.2.0), separada da versão do jogo; ela aparece no rodapé da janela e em `--versao` (com o SHA-256 do arquivo). Antes de abrir o jogo, o launcher consulta `/launcher.json` no servidor:

- **Versão mínima:** abaixo dela, o jogo não abre e aparece **Baixar o launcher oficial**. Por padrão o mínimo é a versão atual (`launcher/VERSION`); o operador muda com `LAUNCHER_MIN`.
- **Só os arquivos oficiais:** com `LAUNCHER_SHA256` (o SHA-256 que o Release publica), o servidor aceita só esses `.jar`. Um arquivo alterado no caminho, ou um build próprio, é recusado.
- **O download nunca vem do servidor:** qualquer um pode digitar o domínio de um servidor de terceiros, então o botão abre sempre a página oficial (fixa no código), `https://github.com/Noturno-Strange/skyke3d/releases/latest`.
- Servidor sem a rota (versão antiga do jogo) ou fora do ar: o launcher segue normalmente.

Limite honesto: quem roda o jogo é o navegador, então isso protege quem usa o launcher (versão velha ou arquivo trocado), mas não impede alguém de alterar o próprio launcher para pular a conferência, e o jogo continua aberto a todos pelo navegador.

### Conferir o download

Cada Release publica `skyke3d-launcher.jar.sha256` junto com o `.jar`. Compare com o do arquivo baixado (ou com o rodapé da janela, passando o mouse):

```bash
sha256sum skyke3d-launcher.jar                      # Linux
shasum -a 256 skyke3d-launcher.jar                  # macOS
certutil -hashfile skyke3d-launcher.jar SHA256      # Windows
```

O jogo é o mesmo do site (three.js, WebGL e Web Audio), sempre atualizado: o launcher não guarda nem altera nada do jogo. Como o perfil da janela própria é separado do navegador, a identidade de lá é outra; use o **código de recuperação** para levar a sua.

## Instalar

O launcher precisa de **Java 11 ou mais novo**. Cada [Release](https://github.com/Noturno-Strange/skyke3d/releases/latest) traz o mesmo `.jar` em quatro formas:

| Sistema | Arquivo | Como instalar |
| --- | --- | --- |
| **Windows** | `skyke3d-launcher-setup.exe` | Dois cliques. Instala só para o seu usuário (não pede senha de administrador), cria atalhos no menu Iniciar e na área de trabalho e aparece em *Aplicativos instalados* para desinstalar. Se não achar o Java, avisa e oferece a página de download. |
| **Debian, Ubuntu, Mint** | `skyke3d-launcher.deb` | `sudo apt install ./skyke3d-launcher.deb` (o Java vem junto como dependência). O **Skyke3D** aparece no menu de aplicativos e o comando `skyke3d-launcher` no terminal. Para remover: `sudo apt remove skyke3d-launcher`. |
| **Qualquer Linux** | `skyke3d-launcher-linux.tar.gz` | Extraia e rode `./install.sh`: instala em `~/.local/share/skyke3d-launcher`, sem senha de administrador, com atalho no menu. Para remover: `~/.local/share/skyke3d-launcher/install.sh --remover`. |
| **Qualquer sistema** (macOS também) | `skyke3d-launcher.jar` | Não instala nada: dois cliques, ou `java -jar skyke3d-launcher.jar`. |

Os instaladores só copiam o `.jar`, o ícone e um atalho; os ajustes e a identidade continuam na pasta de ajustes do launcher (abaixo) e não são apagados na desinstalação. O `SHA256SUMS.txt` do Release traz o SHA-256 de cada pacote. O instalador do Windows não é assinado digitalmente, então o SmartScreen pode pedir confirmação ("Mais informações" › "Executar assim mesmo").

## Usar

Pelo atalho instalado, ou direto pelo `.jar`:

```bash
java -jar skyke3d-launcher.jar                         # abre o launcher
java -jar skyke3d-launcher.jar meu.servidor.com        # já com este domínio no campo
java -jar skyke3d-launcher.jar -s meu.servidor.com -r ABC123 --jogar   # abre o jogo direto, sem a janela
java -jar skyke3d-launcher.jar -s meu.servidor.com --testar            # só testa a conexão (código de saída 0 = ok)
java -jar skyke3d-launcher.jar --ajuda
```

Os ajustes ficam em `launcher.properties`: `%APPDATA%\Skyke3D` no Windows, `~/Library/Application Support/Skyke3D` no macOS e `~/.config/skyke3d` no Linux (ali também fica a pasta `janela`, o perfil da janela própria).

## Gerar

```bash
launcher/build.sh                                  # → launcher/build/skyke3d-launcher.jar (padrão: skyke3d.com.br)
SKYKE_URL=meu.servidor.com launcher/build.sh       # grava outro servidor padrão no .jar (a pessoa ainda pode trocar)
```

O mesmo script gera os pacotes instaláveis em `launcher/build/`: `skyke3d-launcher-linux.tar.gz` (sempre), `skyke3d-launcher.deb` (com `dpkg-deb`) e `skyke3d-launcher-setup.exe` (com o NSIS e o MinGW-w64: `sudo apt install nsis gcc-mingw-w64-x86-64`; os dois rodam no Linux). Os arquivos de cada um ficam em `packaging/` (`windows/installer.nsi`, `windows/skyke3d.c`, `windows/sign.sh`, `linux/install.sh`, o atalho `.desktop` e o script que acha o Java). Sem uma das ferramentas, o pacote correspondente é pulado e o `.jar` sai do mesmo jeito.

### Windows: `Skyke3D.exe` e assinatura

O atalho do Windows abre o `Skyke3D.exe`, um programa pequeno em C (`packaging/windows/skyke3d.c`, com ícone, versão e manifesto sem pedido de administrador). Ele procura o `javaw.exe` no `JAVA_HOME`, no `PATH`, no registro (`HKLM`/`HKCU\SOFTWARE\JavaSoft`) e nas pastas padrão dos instaladores do Java (Eclipse Adoptium, Oracle, Microsoft, Zulu, Corretto, BellSoft). Achando, abre `javaw -jar skyke3d-launcher.jar` com os argumentos que recebeu; sem Java, avisa e abre a página de download. Com `/skyke3d-java-check` ele só responde (0 = tem Java, 2 = não tem), e é assim que o instalador decide se mostra o aviso. Até a versão 1.2.0 o atalho abria um `Skyke3D.cmd` pelo `cmd.exe`; quem atualiza perde o `.cmd` antigo.

Um `.exe` assinado mostra o nome de quem publicou e acumula reputação no SmartScreen do Windows e nos navegadores; sem assinatura, Chrome e Edge avisam que o arquivo "não é baixado com frequência" e o Windows mostra "editor desconhecido". A assinatura (Authenticode SHA-256, com carimbo de tempo RFC 3161) é feita por `packaging/windows/sign.sh`, com o [jsign](https://ebourg.github.io/jsign/) (versão e SHA-256 fixos, baixado do Maven Central), em três arquivos: o `Skyke3D.exe`, o desinstalador (`!uninstfinalize` do NSIS) e o instalador pronto (`!finalize`), antes do `SHA256SUMS.txt`. Sem certificado configurado, nada é assinado e o build segue.

Para ligar no CI, crie os *secrets* do repositório (Settings → Secrets and variables → Actions):

| Secret | Para que serve |
|---|---|
| `SIGN_STORETYPE` | liga a assinatura. `PKCS12` para um arquivo `.pfx`; para serviços em nuvem, o tipo do jsign: `ESIGNER` (SSL.com), `DIGICERTONE`, `AZUREKEYVAULT`, `GOOGLECLOUD`, `AWS` |
| `SIGN_PFX_BASE64` | só para `PKCS12`: o `.pfx` em base64 (`base64 -w0 certificado.pfx`) |
| `SIGN_KEYSTORE` | para os serviços em nuvem: o endereço ou a conta que o jsign pede para aquele tipo |
| `SIGN_STOREPASS` | senha do `.pfx` ou credencial do serviço |
| `SIGN_ALIAS` | nome/ID do certificado (opcional num `.pfx` com um certificado só) |
| `SIGN_KEYPASS` | senha da chave, quando for diferente (opcional) |
| `SIGN_TSA` | servidor de carimbo de tempo (opcional; padrão `http://timestamp.sectigo.com`) |

Exemplos (os nomes exatos de cada serviço estão na documentação do jsign):

- **SSL.com eSigner**: `SIGN_STORETYPE=ESIGNER`, `SIGN_STOREPASS=<usuário>|<senha>`, `SIGN_ALIAS=<credential ID>` e o segredo TOTP em `SIGN_KEYPASS`.
- **Arquivo `.pfx`** (certificados emitidos antes de junho de 2023, ou de teste): `SIGN_STORETYPE=PKCS12`, `SIGN_PFX_BASE64`, `SIGN_STOREPASS`.
- **SignPath Foundation** (grátis para código aberto): a assinatura é feita pelo serviço deles, que recebe o arquivo do CI por uma action própria; isso entra como um passo depois do build, no lugar do `sign.sh`.

No computador, o mesmo vale com variáveis de ambiente: `SIGN_STORETYPE=PKCS12 SIGN_PFX_BASE64=$(base64 -w0 cert.pfx) SIGN_STOREPASS=... launcher/build.sh`. Para conferir: `osslsigncode verify launcher/build/skyke3d-launcher-setup.exe`.

A reputação vem com o tempo e com downloads: mantenha o mesmo certificado e o mesmo nome de arquivo entre versões. Se o SmartScreen ou o Defender acusar uma versão nova, envie o arquivo como desenvolvedor em https://www.microsoft.com/wdsi/filesubmission. Divulgue o instalador `.exe`: o Chrome trata `.jar` como tipo de arquivo perigoso, com ou sem assinatura.

As fontes em `res/` são a Manrope do jogo convertida para TTF por `tools/manrope-ttf.py` (licença OFL em `res/manrope-OFL.txt`). O script lê a versão de `VERSION`, roda os testes de `test/` (endereço e política do servidor), monta o `.jar` com datas fixas e gera o `.sha256`. O SHA-256 só bate entre builds feitos com o mesmo JDK: para `LAUNCHER_SHA256`, use o do Release (gerado no CI). O script compila para Java 11 (`--release 11`, avisos viram erro), roda os testes de `test/` e monta o `.jar` com datas fixas. O CI faz o mesmo a cada push e anexa o `.jar` ao Release.
