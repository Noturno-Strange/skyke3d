#!/usr/bin/env bash
# Skyke3D — gera o launcher (um .jar universal: Windows, macOS e Linux, Java 11+).
# Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
#
# Uso: ./build.sh                       → build/skyke3d-launcher.jar (servidor padrão: skyke3d.com.br)
#      SKYKE_URL=meu.servidor ./build.sh → outro servidor padrão gravado no .jar (a pessoa ainda pode trocar)
set -euo pipefail
cd "$(dirname "$0")"

# versão do launcher (própria, separada da do jogo): launcher/VERSION; o servidor lê o mesmo arquivo para a versão mínima
VERSION="$(tr -d " \n\r" < VERSION)"
OUT=build
rm -rf "$OUT"
mkdir -p "$OUT/classes/skyke3d/launcher" "$OUT/test"

javac --release 11 -encoding UTF-8 -Xlint:all -Werror -d "$OUT/classes" src/skyke3d/launcher/*.java
javac --release 11 -encoding UTF-8 -cp "$OUT/classes" -d "$OUT/test" test/skyke3d/launcher/*.java
java -cp "$OUT/classes:$OUT/test" skyke3d.launcher.ServerAddressTest
java -cp "$OUT/classes:$OUT/test" skyke3d.launcher.LauncherPolicyTest

RES="$OUT/classes/skyke3d/launcher"
printf '%s' "${VERSION:-dev}" > "$RES/version.txt"
if [ -n "${SKYKE_URL:-}" ]; then printf '%s' "$SKYKE_URL" > "$RES/default-server.txt"; fi
cp ../desktop/src-tauri/icons/32x32.png "$RES/icon-32.png"
cp ../desktop/src-tauri/icons/128x128.png "$RES/icon-128.png"
cp ../LICENSE "$OUT/classes/LICENSE"
# Manrope, a fonte do jogo, em TTF (tools/manrope-ttf.py); licença OFL junto
cp res/manrope-*.ttf "$RES/"
cp res/manrope-OFL.txt "$OUT/classes/manrope-OFL.txt"

# datas fixas dentro do .jar: o mesmo código gera o mesmo arquivo
jar --create --file "$OUT/skyke3d-launcher.jar" --main-class skyke3d.launcher.Launcher \
  --date 2026-01-01T00:00:00Z -C "$OUT/classes" .
# SHA-256 para conferir o download (o Release publica junto; o servidor pode exigir só os oficiais com LAUNCHER_SHA256)
( cd "$OUT" && if command -v sha256sum >/dev/null; then sha256sum skyke3d-launcher.jar; else shasum -a 256 skyke3d-launcher.jar; fi ) > "$OUT/skyke3d-launcher.jar.sha256"
echo "Pronto: $(pwd)/$OUT/skyke3d-launcher.jar (versão ${VERSION:-dev})"
cat "$OUT/skyke3d-launcher.jar.sha256"
