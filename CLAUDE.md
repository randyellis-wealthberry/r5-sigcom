# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

R5-SIGCOM is a layout + theme + mods package for the [Herdr](https://github.com/jerryfane/herdr) desktop app: a fictional signals-intelligence "ops floor" whose visuals are driven by real agent status. There is no build system, package manager, or test suite. `RECIPE.md` is the authoritative spec (layout tree, colors, behaviors, "Watch out" gotchas, and "Done when" acceptance criteria) — keep it in sync with code changes.

## Commands

```sh
# Install / deploy into Herdr (copy is the "build")
sh install.sh   # or: cp -R layouts themes mods ~/.config/herdr-app/
~/.local/bin/herdr-app do layout.switch --name r5-sigcom

# Validate mods (the only automated check)
herdr-app check   # must pass for r5-sigcom, r5-tabs, r5-files

# Optional: add terminal-browser to Herdr's + menu (edits ~/.config/herdr-app/programs.json, keeps a .bak)
sh mods/r5-sigcom/add-browser-menu.sh
```

Verification is manual against the "Done when" list in `RECIPE.md`.

## Architecture

- `layouts/r5-sigcom.json` — the floor plan: `rail` | `work` column (`banner`, `ticker`, `tabs`, `work-body` with `main` + hidden `panel`, `feed`). The panel ids `panel`, `panel-body`, `files`, `changes`, `dossier` are referenced by the tab bar's panel buttons and `layout.show/select` — renaming them breaks those commands.
- `themes/r5-sigcom.json` — colors + 16 ANSI colors. Required alongside the layout.
- `mods/r5-sigcom/main.js` — one mod (`{"place":"none"}`) that renders a different View per `props.role`: `rail`, `banner`, `ticker`, `feed`, `dossierpanel`, plus popup roles `tabmenu` / `filemenu` opened via `openOverlay({mod:"r5-sigcom", kind:"popup", …})`.
  - The **`banner` role owns the state machine** (dormant → boot → active/alert) on a 400ms tick and publishes it via `setShared("r5.state")` / `setShared("r5.log")`. All other roles read shared state rather than computing it — they are separate View instances.
  - Asset numbers (R5-0n) are stable per agent address in shared state; operation codenames are hashed from space id.
  - Intercept reads agent screens with `hc(["read", address, "--lines", n])`, strips ANSI/TUI chrome, and redacts secrets (`SECRETS` regexes, `redactPath`) before display.
  - The only network call is a daily World Bank GDP fetch via `curl`, cached in shared state with built-in fallback figures.
- `mods/r5-tabs`, `mods/r5-files` — clones of Herdr's shipped `tabs`/`files` mods (v0.1.16, see `cloned_from` in `mod.json`), modified to open the r5-sigcom popups on right-click and add the Dossier panel button. Keep diffs from upstream minimal.
- Imports come from Herdr's runtime modules: `gpui-kit`, `gpui-base`, `herdr`.

## Gotchas (from RECIPE.md)

- Never do heavy work in `render` — precompute animation frames on timers and use native `.frames()`, `.loop()`, `.spin()`; otherwise views get "could not be re-rendered".
- `.line_height(16)` is a multiplier; use `"16px"`.
- Braille glyphs don't render in the UI font; use block elements (▁…█ ▀ ▔) and box drawing.
- `h_flex` centers children by default; add `.items_start()` in feed columns.
- Inside popups, `flex_1` / `min_h(0)` collapses them to nothing.
- Intercept must skip the focused agent and poll no faster than a few seconds, or typing lags.
- Everything must stay fictional: no real agency seals, names, or insignia.
