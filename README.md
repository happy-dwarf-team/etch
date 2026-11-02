# Etch

[![build](https://github.com/happy-dwarf-team/etch/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/happy-dwarf-team/etch/actions/workflows/build.yml)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-Etch-007ACC)](https://marketplace.visualstudio.com/items?itemName=happy-dwarf-team.etch)
[![Open VSX](https://img.shields.io/open-vsx/v/happy-dwarf-team/etch?label=Open%20VSX)](https://open-vsx.org/extension/happy-dwarf-team/etch)
[![License: MIT](https://img.shields.io/github/license/happy-dwarf-team/etch)](LICENSE)

Etch is a Visual Studio Code extension for Europa Universalis IV interface
mods: edit a `.gui` or `.gfx` file and see the window as the game would show
it, within moments, and have each saved file reloaded into the running game.
Website: [etch.happydwarf.dev](https://etch.happydwarf.dev/).

Status: the latest release is 2.1.0 (1 November 2026). 2.0.0, released the
same day, is the whole of the [v2 specification](docs/spec/v2.md), frozen with
it; what comes after it is in
[docs/spec/after-v2.md](docs/spec/after-v2.md). v2 replaced 1.x's game host and
its diff view with the **live game**: Etch's private copy of the game, played
beside the editor, with each saved file reloaded into the game's own window,
**pick mode** to jump from a widget in the game to its definition, and **live
snapshots** of a window's texts and states. The preview gained **views** of a
window from window profiles and **sample data** from saves (ADR 0005). Users
who want the game host stay on 1.0.x: the extension's
[README](packages/extension/README.md#etch-1x) says how. Releases are on
[Open VSX](https://open-vsx.org/extension/happy-dwarf-team/etch), the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=happy-dwarf-team.etch)
and the [GitHub releases](https://github.com/happy-dwarf-team/etch/releases);
the [changelog](CHANGELOG.md) lists what each one changed, and the
extension's [README](packages/extension/README.md) says what it does. The
[v1 specification](docs/spec/v1.md) says what 1.0.0 contains and in what
order it was built; the decisions behind both are in [docs/adr](docs/adr) and
in the wayfinder maps in this repository's issues (label `wayfinder:map`).
[CONTRIBUTING.md](CONTRIBUTING.md) says how to build and test it.

## v2 in brief

- The editor is a Visual Studio Code extension: preview, widget outline,
  diagnostics and jump from a widget to its source line.
- One preview, drawn by the offline renderer, which needs no game: a window in
  one view, with sample data, as the game would show it.
- The live game is the game itself, with Etch's Anvil plugin: reloads, pick
  mode and live snapshots.
- Precision is measured against the game, not claimed: the precision corpus
  of vanilla, Proper 2K UI Enhanced and Anbennar, at seven resolutions from
  1280×720 to 3440×1440. The preview also offers 3840×2160, not yet measured
  against the game.
- Target: EU4 1.37.5 (Steam, win64) on Windows.

See [GLOSSARY.md](GLOSSARY.md) for the terms used in the issues.

## Built on Anvil

The live game runs on [Anvil](https://anvil.happydwarf.dev/), the team's
plugin loader for EU4, with the [Bellows](https://anvil.happydwarf.dev/plugins/bellows/)
plugin for a faster start and [Tongs](https://anvil.happydwarf.dev/plugins/tongs/)
for the widget tree; the precision corpus is captured with Tongs. Etch is a project of the
[Happy Dwarf Team](https://happydwarf.dev/).

## License

MIT, see [LICENSE](LICENSE). Etch is an unofficial community project, not affiliated
with or endorsed by Paradox Interactive.
