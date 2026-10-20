# TypeScript offline renderer: layout in the extension host, WebGL2 drawing in the webview

Etch's offline renderer and extension are written in TypeScript only, with no
Wasm and no native Node modules; C++ appears only in the game host's own Anvil
plugin. The extension host parses `.gui`/`.gfx`/`.fnt`, lays the window out and
produces diagnostics, the widget outline and jump to source from that one
model, then sends the webview a small draw list. The webview fetches the raw
DDS/TGA files itself through webview URIs, decodes them, keeps them on the GPU
and draws with WebGL2, porting the game's GUI shaders to GLSL with point or
linear sampling per shader. Speed is the first requirement: a warm reload must
reach pixels in 50 ms or less for the largest vanilla window, a cold open in
1 s or less on vanilla, driven by the unsaved editor buffer.

We chose this over a Rust/Wasm core (mature jomini and texture2ddecoder crates,
but a second toolchain and a JS↔Wasm bridge for no measured gain at 150 KB per
file), over running everything in the webview (diagnostics would need a second
parse in the host), over decoding in the host and shipping PNGs as HOI4 Mod
Utilities does (an encode and a copy per window on every open), and over
Canvas 2D (masks, progress bars, disabled greying and per-font tinting only
through compositing tricks, no control over sampling, DXT decoded on the CPU).

## Consequences

- The parser, model, layout and draw list live in a `core` package that never
  imports `vscode`, so a headless mode can run it in plain Node and draw with the
  same WebGL2 `renderer` package in headless Chromium.
- Parser, DDS (BGRA8, RGB8, DXT1/3/5), TGA and BMFont readers are Etch's own;
  outside MIT code is used only as a model or copied with attribution.
- DXT textures rely on `WEBGL_compressed_texture_s3tc`; verified in Electron's
  Chromium on Windows (ANGLE, Direct3D11) but not yet inside a VS Code webview,
  and a CPU decode covers drivers without it.
- Text input is Windows-1252; localisation is UTF-8 mapped to Windows-1252 code
  points for glyph lookup.
