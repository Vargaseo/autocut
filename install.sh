#!/bin/bash
# Instala o painel AutoCut no Premiere Pro (macOS).
set -e
SRC="$(cd "$(dirname "$0")" && pwd)/AutoCut"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.autocut.panel"

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
# nunca instala o arquivo de depuração (abriria uma porta de debug no Premiere)
rm -f "$DEST/.debug"

# Painel sem assinatura digital: o Premiere so carrega com este modo ligado.
defaults write com.adobe.CSXS.12 PlayerDebugMode 1

echo "AutoCut instalado em: $DEST"
echo "Feche e abra o Premiere Pro, depois va em Janela > Extensões (legado) > AutoCut."
