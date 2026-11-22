#!/bin/sh
# Adds "Browser" (terminal-browser) to Herdr's + menu, keeping everything else
# in programs.json as it was. Safe to run more than once.
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.config/herdr-app/programs.json")
data = {}
if os.path.exists(p):
    with open(p) as f:
        txt = f.read().strip()
    if txt:
        data = json.loads(txt)
    os.replace(p, p + ".bak") if txt else None
os.makedirs(os.path.dirname(p), exist_ok=True)
progs = data.setdefault("programs", {})
progs["terminal-browser"] = {**progs.get("terminal-browser", {}), "name": "Browser", "run": ["terminal-browser"], "tile": "#0F3A20", "color": "#E3C76A"}
with open(p, "w") as f:
    json.dump(data, f, indent=2)
print("Browser added to the + menu (" + p + ")")
PY
