#!/bin/sh
# Skyke3D — instala o launcher para o usuário atual, sem senha de administrador (qualquer distribuição Linux).
# Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
# Uso: ./install.sh            instala (ou atualiza)
#      ./install.sh --remover  desinstala (os ajustes em ~/.config/skyke3d ficam; apague a pasta se quiser)
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
APP="$DATA/skyke3d-launcher"
BIN="$HOME/.local/bin"
DESK="$DATA/applications/skyke3d-launcher.desktop"
ICON="$DATA/icons/hicolor/128x128/apps/skyke3d-launcher.png"
refresh() {
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA/applications" >/dev/null 2>&1 || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q "$DATA/icons/hicolor" >/dev/null 2>&1 || true
}
if [ "${1:-}" = "--remover" ] || [ "${1:-}" = "--uninstall" ]; then
  rm -rf "$APP"
  rm -f "$BIN/skyke3d-launcher" "$DESK" "$ICON"
  refresh
  echo "Launcher do Skyke3D removido."
  exit 0
fi
for f in skyke3d-launcher.jar skyke3d-launcher skyke3d-launcher.desktop skyke3d-launcher.png; do
  [ -f "$HERE/$f" ] || { echo "Falta o arquivo $f ao lado do install.sh. Extraia o .tar.gz inteiro e tente de novo." >&2; exit 1; }
done
mkdir -p "$APP" "$BIN" "$DATA/applications" "$(dirname "$ICON")"
cp "$HERE/skyke3d-launcher.jar" "$APP/skyke3d-launcher.jar"
cp "$HERE/skyke3d-launcher" "$APP/skyke3d-launcher"
cp "$HERE/install.sh" "$APP/install.sh"
[ -f "$HERE/LICENSE" ] && cp "$HERE/LICENSE" "$APP/LICENSE"
chmod 755 "$APP/skyke3d-launcher" "$APP/install.sh"
ln -sf "$APP/skyke3d-launcher" "$BIN/skyke3d-launcher"
cp "$HERE/skyke3d-launcher.png" "$ICON"
# o atalho do menu aponta para o caminho completo: ~/.local/bin nem sempre está no PATH da sessão gráfica
sed "s|^Exec=.*|Exec=\"$APP/skyke3d-launcher\" %u|" "$HERE/skyke3d-launcher.desktop" > "$DESK"
chmod 644 "$DESK"
refresh
echo "Launcher do Skyke3D instalado. Procure por Skyke3D no menu de aplicativos, ou rode: $BIN/skyke3d-launcher"
command -v java >/dev/null 2>&1 || echo "Atenção: não achei o Java. Instale o Java 11 ou mais novo (pacote default-jre, java-21-openjdk ou jre-openjdk)."
echo "Para remover: $APP/install.sh --remover"
