#!/usr/bin/env bash
# Skyke3D — assina um .exe do Windows (Authenticode, com carimbo de tempo) usando o jsign, que roda no Linux.
# Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
#
# Uso: sign.sh arquivo.exe
# Sem certificado configurado (SIGN_STORETYPE vazio) não faz nada e sai com 0: o build continua, com o .exe sem assinatura.
# Chamado por launcher/build.sh para o Skyke3D.exe e pelo makensis (!uninstfinalize e !finalize) para o desinstalador e o
# instalador; assim o SHA256SUMS.txt é calculado já sobre os arquivos assinados.
#
# Variáveis (no GitHub Actions vêm dos secrets do repositório; veja launcher/README.md):
#   SIGN_STORETYPE   tipo do certificado no jsign: PKCS12 (arquivo .pfx), ESIGNER (SSL.com), DIGICERTONE, AZUREKEYVAULT,
#                    GOOGLECLOUD, AWS...
#   SIGN_PFX_BASE64  só para PKCS12: o .pfx em base64 (o script grava num arquivo temporário e apaga no fim)
#   SIGN_KEYSTORE    para os serviços em nuvem: o endereço/conta que o jsign pede (para PKCS12, o caminho do .pfx, se não usar
#                    SIGN_PFX_BASE64)
#   SIGN_STOREPASS   senha do .pfx ou credencial do serviço
#   SIGN_ALIAS       nome/ID do certificado (opcional para PKCS12 com um certificado só)
#   SIGN_KEYPASS     senha da chave, quando for diferente (opcional)
#   SIGN_CERTFILE    cadeia de certificados .p7b/.pem, quando o serviço pedir (opcional)
#   SIGN_TSA         carimbo de tempo RFC 3161 (padrão: http://timestamp.sectigo.com)
set -euo pipefail

f="${1:?uso: sign.sh arquivo.exe}"
if [ -z "${SIGN_STORETYPE:-}" ]; then
  echo "sign.sh: sem certificado (SIGN_STORETYPE vazio): $(basename "$f") fica sem assinatura."
  exit 0
fi

# jsign com versão e SHA-256 fixos (baixado do Maven Central uma vez por máquina)
JSIGN_VER=6.0
JSIGN_SHA256=edff5fee8b9db5651c2e56917f156e33abb9279af1dcef096d48fe0133c3dc4e
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/skyke3d"
JAR="$CACHE/jsign-$JSIGN_VER.jar"
if [ ! -f "$JAR" ] || ! echo "$JSIGN_SHA256  $JAR" | sha256sum -c --status; then
  mkdir -p "$CACHE"
  for i in 1 2 3 4; do
    curl -fsSL -o "$JAR.tmp" "https://repo1.maven.org/maven2/net/jsign/jsign/$JSIGN_VER/jsign-$JSIGN_VER.jar" && break
    sleep $((i * 4))
  done
  echo "$JSIGN_SHA256  $JAR.tmp" | sha256sum -c --status || { echo "sign.sh: o jsign baixado não confere com o SHA-256 esperado" >&2; exit 1; }
  mv "$JAR.tmp" "$JAR"
fi

TMP=""
cleanup() { if [ -n "$TMP" ]; then rm -f "$TMP"; fi; }
trap cleanup EXIT
KEYSTORE="${SIGN_KEYSTORE:-}"
if [ "$SIGN_STORETYPE" = "PKCS12" ] && [ -n "${SIGN_PFX_BASE64:-}" ]; then
  TMP="$(mktemp --suffix=.pfx)"
  chmod 600 "$TMP"
  printf '%s' "$SIGN_PFX_BASE64" | base64 -d > "$TMP"
  KEYSTORE="$TMP"
fi

args=(--storetype "$SIGN_STORETYPE" --alg SHA-256 --tsmode RFC3161 --tsaurl "${SIGN_TSA:-http://timestamp.sectigo.com}"
  --tsretries 4 --tsretrywait 10 --name "Skyke3D Launcher" --url "https://github.com/Noturno-Strange/skyke3d" --replace)
if [ -n "$KEYSTORE" ]; then args+=(--keystore "$KEYSTORE"); fi
if [ -n "${SIGN_STOREPASS:-}" ]; then args+=(--storepass "$SIGN_STOREPASS"); fi
if [ -n "${SIGN_ALIAS:-}" ]; then args+=(--alias "$SIGN_ALIAS"); fi
if [ -n "${SIGN_KEYPASS:-}" ]; then args+=(--keypass "$SIGN_KEYPASS"); fi
if [ -n "${SIGN_CERTFILE:-}" ]; then args+=(--certfile "$SIGN_CERTFILE"); fi

java -jar "$JAR" "${args[@]}" "$f"
echo "sign.sh: $(basename "$f") assinado."
