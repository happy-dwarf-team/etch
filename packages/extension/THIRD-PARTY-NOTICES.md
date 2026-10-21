# Third-party notices

This file lists every component inside the Etch VSIX and its licence
(ADR 0004).

| Component | Licence | Notes |
| --------- | ------- | ----- |
| Etch (`dist/extension.js`, `dist/webview.js`, `media/icon.png`) | MIT, see `LICENSE` | Etch's own code, bundled by esbuild |

The bundles contain no third-party code: Etch has no runtime dependencies, and
the build tools (esbuild, TypeScript, `@vscode/vsce`) are not shipped. No game
asset is packaged; Etch reads the game's files from the user's own
installation.

Later releases add the game host's pinned builds of Anvil and Bellows and
Etch's own game plugin, each with its licence files.
