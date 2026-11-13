#!/usr/bin/env bash
# Skyke3D — gera o launcher (um .jar universal: Windows, macOS e Linux, Java 11+) e os pacotes instaláveis:
# skyke3d-launcher-setup.exe (Windows, se houver makensis), skyke3d-launcher.deb (se houver dpkg-deb) e skyke3d-launcher-linux.tar.gz.
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
# ícones da janela do launcher (os mesmos dos pacotes de Linux)
cp res/icon-32.png res/icon-128.png "$RES/"
cp ../LICENSE "$OUT/classes/LICENSE"
# Manrope, a fonte do jogo, em TTF (tools/manrope-ttf.py); licença OFL junto
cp res/manrope-*.ttf "$RES/"
cp res/manrope-OFL.txt "$OUT/classes/manrope-OFL.txt"

# datas fixas dentro do .jar: o mesmo código gera o mesmo arquivo
jar --create --file "$OUT/skyke3d-launcher.jar" --main-class skyke3d.launcher.Launcher \
  --date 2026-01-01T00:00:00Z -C "$OUT/classes" .
# SHA-256 para conferir o download (o Release publica junto; o servidor pode exigir só os oficiais com LAUNCHER_SHA256)
( cd "$OUT" && if command -v sha256sum >/dev/null; then sha256sum skyke3d-launcher.jar; else shasum -a 256 skyke3d-launcher.jar; fi ) > "$OUT/skyke3d-launcher.jar.sha256"

# ---------- pacotes instaláveis (o mesmo .jar por dentro) ----------
# Linux, qualquer distribuição: .tar.gz com o .jar e o install.sh (instala para o usuário, sem senha de administrador)
PKG="$OUT/pkg"
TGZ="$PKG/skyke3d-launcher-$VERSION"
mkdir -p "$TGZ"
cp "$OUT/skyke3d-launcher.jar" ../LICENSE packaging/linux/install.sh packaging/linux/skyke3d-launcher packaging/linux/skyke3d-launcher.desktop "$TGZ/"
cp res/icon-128.png "$TGZ/skyke3d-launcher.png"
chmod 755 "$TGZ/install.sh" "$TGZ/skyke3d-launcher"
tar --sort=name --owner=0 --group=0 --numeric-owner --mtime=2026-01-01T00:00:00Z -C "$PKG" -czf "$OUT/skyke3d-launcher-linux.tar.gz" "skyke3d-launcher-$VERSION"
MADE="skyke3d-launcher-linux.tar.gz"

# Debian, Ubuntu, Mint e derivados: .deb (precisa do dpkg-deb; pede um Java 11+ como dependência)
if command -v dpkg-deb >/dev/null; then
  DEB="$PKG/deb"
  mkdir -p "$DEB/DEBIAN" "$DEB/usr/bin" "$DEB/usr/share/skyke3d-launcher" "$DEB/usr/share/applications" \
    "$DEB/usr/share/icons/hicolor/128x128/apps" "$DEB/usr/share/doc/skyke3d-launcher"
  cp "$OUT/skyke3d-launcher.jar" "$DEB/usr/share/skyke3d-launcher/"
  cp packaging/linux/skyke3d-launcher "$DEB/usr/bin/skyke3d-launcher"
  cp packaging/linux/skyke3d-launcher.desktop "$DEB/usr/share/applications/"
  cp res/icon-128.png "$DEB/usr/share/icons/hicolor/128x128/apps/skyke3d-launcher.png"
  cp ../LICENSE "$DEB/usr/share/doc/skyke3d-launcher/copyright"
  chmod 755 "$DEB/usr/bin/skyke3d-launcher"
  cat > "$DEB/DEBIAN/control" <<CONTROL
Package: skyke3d-launcher
Version: $VERSION
Section: games
Priority: optional
Architecture: all
Depends: default-jre | java11-runtime | java17-runtime | java21-runtime
Maintainer: Noturno-Strange <noreply@skyke3d.com.br>
Homepage: https://github.com/Noturno-Strange/skyke3d
Description: Launcher do Skyke3D
 Escolhe para qual servidor o Skyke3D conecta e abre o jogo, um ponto de
 encontro 3D social e multiplayer que roda no navegador.
CONTROL
  find "$DEB" -exec touch -d 2026-01-01T00:00:00Z {} +
  dpkg-deb --root-owner-group -Zgzip --build "$DEB" "$OUT/skyke3d-launcher.deb" >/dev/null
  MADE="$MADE skyke3d-launcher.deb"
else
  echo "dpkg-deb não encontrado: o .deb não foi gerado."
fi

# Windows: instalador .exe feito com o NSIS (makensis roda no Linux; instala para o usuário, com atalhos e desinstalador).
# O atalho abre o Skyke3D.exe (packaging/windows/skyke3d.c, compilado com o MinGW-w64), que acha o Java e abre o .jar.
# Assinatura: packaging/windows/sign.sh assina o Skyke3D.exe, o desinstalador e o instalador quando há certificado
# (SIGN_STORETYPE e companhia; veja o README). Sem certificado, os .exe saem sem assinatura e o build segue.
CC_WIN=x86_64-w64-mingw32-gcc
RC_WIN=x86_64-w64-mingw32-windres
if command -v makensis >/dev/null && command -v "$CC_WIN" >/dev/null && command -v "$RC_WIN" >/dev/null; then
  WIN="$PKG/win"
  mkdir -p "$WIN"
  cp "$OUT/skyke3d-launcher.jar" "$WIN/"
  sed 's/$/\r/' ../LICENSE > "$WIN/LICENSE.txt"
  IFS=. read -r V1 V2 V3 <<< "$VERSION"
  ( cd packaging/windows && "$RC_WIN" -DV1="$V1" -DV2="$V2" -DV3="$V3" -DVSTR="\\\"$VERSION\\\"" skyke3d.rc -O coff -o "$OLDPWD/$WIN/skyke3d.res.o" )
  # sem data no cabeçalho do .exe: o mesmo código gera o mesmo arquivo
  "$CC_WIN" -municode -mwindows -O2 -s -Wall -Wextra -Werror -Wl,--no-insert-timestamp \
    packaging/windows/skyke3d.c "$WIN/skyke3d.res.o" -o "$WIN/Skyke3D.exe"
  packaging/windows/sign.sh "$WIN/Skyke3D.exe"
  makensis -V2 -DVERSION="$VERSION" -DSRC="$(pwd)/$WIN" -DOUT="$(pwd)/$OUT/skyke3d-launcher-setup.exe" \
    -DSIGNCMD="$(pwd)/packaging/windows/sign.sh" packaging/windows/installer.nsi
  MADE="$MADE skyke3d-launcher-setup.exe"
else
  echo "makensis (NSIS) ou o MinGW-w64 ($CC_WIN) não encontrado: o instalador do Windows não foi gerado."
fi
rm -rf "$PKG"
# SHA-256 de cada pacote, para conferir o download
( cd "$OUT" && for f in $MADE; do if command -v sha256sum >/dev/null; then sha256sum "$f"; else shasum -a 256 "$f"; fi; done ) > "$OUT/SHA256SUMS.txt"

echo "Pronto: $(pwd)/$OUT/skyke3d-launcher.jar (versão ${VERSION:-dev})"
cat "$OUT/skyke3d-launcher.jar.sha256"
echo "Pacotes instaláveis:"
cat "$OUT/SHA256SUMS.txt"
