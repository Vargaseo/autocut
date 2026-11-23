#!/bin/bash
# Instala o painel AutoCut no Premiere Pro (macOS).
set -e
SRC="$(cd "$(dirname "$0")" && pwd)/AutoCut"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.autocut.panel"

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
# arquivos de desenvolvimento nunca vao para o painel instalado:
#   .debug         abriria uma porta de depuracao no Premiere
#   _harness.html  e a banca de testes, com o Premiere simulado
rm -f "$DEST/.debug" "$DEST/_harness.html"

# Painel sem assinatura digital: o Premiere so carrega com este modo ligado.
defaults write com.adobe.CSXS.12 PlayerDebugMode 1

echo "AutoCut instalado em: $DEST"
echo "Feche e abra o Premiere Pro, depois va em Janela > Extensões (legado) > AutoCut."
