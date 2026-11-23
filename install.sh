#!/usr/bin/env bash
# Installs the R5-SIGCOM Herdr layout (layout + theme + mods r5-sigcom, r5-tabs, r5-files).
# Never overwrites silently: anything already there is moved to <name>.bak-<time>.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
STAMP="$(date +%s)"
[ -d "$HOME_DIR" ] || { echo "No Herdr home at $HOME_DIR. Launch herdr-app once first (or set HERDR_APP_HOME)."; exit 1; }

place() { # place <src> <dest>
  if [ -e "$2" ]; then mv "$2" "$2.bak-$STAMP"; echo "backed up $2 -> $2.bak-$STAMP"; fi
  cp -R "$1" "$2"; echo "installed $2"
}
mkdir -p "$HOME_DIR/layouts" "$HOME_DIR/themes" "$HOME_DIR/mods"
place "$SRC/layouts/r5-sigcom.json" "$HOME_DIR/layouts/r5-sigcom.json"
place "$SRC/layouts/r5-sigcom.png"  "$HOME_DIR/layouts/r5-sigcom.png"
place "$SRC/themes/r5-sigcom.json"  "$HOME_DIR/themes/r5-sigcom.json"
for m in r5-sigcom r5-tabs r5-files; do place "$SRC/mods/$m" "$HOME_DIR/mods/$m"; done

# Font: the layout uses "JetBrains Mono". Omarchy ships "JetBrainsMono Nerd Font".
if command -v fc-list >/dev/null; then
  if ! fc-list : family | grep -qx "JetBrains Mono"; then
    if fc-list : family | grep -q "JetBrainsMono Nerd Font"; then
      F="JetBrainsMono Nerd Font"
      for f in "$HOME_DIR/layouts/r5-sigcom.json" "$HOME_DIR/mods/r5-sigcom/main.js"; do
        sed "s/\"JetBrains Mono\"/\"$F\"/g" "$f" > "$f.tmp" && mv "$f.tmp" "$f"
      done
      echo "font: switched to \"$F\" (plain JetBrains Mono not installed)"
    else
      echo "font: JetBrains Mono not found. Install it: sudo pacman -S ttf-jetbrains-mono"
    fi
  fi
fi

for dep in curl git; do command -v "$dep" >/dev/null || echo "note: '$dep' missing; the r5-sigcom panels that use it will stay empty"; done
command -v terminal-browser >/dev/null || echo "note: terminal-browser not installed (optional, only for the Browser entry)"

if command -v herdr-app >/dev/null; then
  for m in r5-sigcom r5-tabs r5-files; do herdr-app check "$HOME_DIR/mods/$m" || echo "check reported issues for $m"; done
fi
echo
if command -v herdr-app >/dev/null && herdr-app do layout.switch --name r5-sigcom 2>/dev/null; then
  echo "Done. Switched to r5-sigcom (ctrl-shift-l switches back)."
else
  echo "Done. In Herdr, switch layouts with ctrl-shift-l and pick r5-sigcom."
fi
echo "Your existing layouts and keys.json were not touched."
