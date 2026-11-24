#!/bin/sh
# Installs R5-SIGCOM into the Herdr desktop app (macOS or Linux) and switches to it.
# Usage: sh install.sh            (run from the downloaded repo folder)
set -e
SRC=$(cd "$(dirname "$0")" && pwd)
DEST="${XDG_CONFIG_HOME:-$HOME/.config}/herdr-app"
mkdir -p "$DEST"
cp -R "$SRC/layouts" "$SRC/themes" "$SRC/mods" "$DEST/"
echo "Copied layouts/, themes/, mods/ into $DEST"

if command -v fc-list >/dev/null 2>&1 && ! fc-list | grep -q "JetBrains Mono"; then
  echo "Note: font 'JetBrains Mono' not found. On Arch/Omarchy: sudo pacman -S ttf-jetbrains-mono"
fi

HERDR=$(command -v herdr-app 2>/dev/null || echo "$HOME/.local/bin/herdr-app")
if [ -x "$HERDR" ]; then
  "$HERDR" do layout.switch --name r5-sigcom && echo "Switched to the r5-sigcom layout."
else
  echo "herdr-app CLI not found. Pick 'r5-sigcom' from Herdr's layout menu instead."
fi
