# PROTOTYPE findings: offline render of one window vs the game (etch#9)

Throwaway prototype for [etch#9](https://github.com/happy-dwarf-team/etch/issues/9).
Not to be merged. Run date 2026-10-20. Machine: Windows 11, NVIDIA RTX 4090.

Labels: **verified** (measured here), **hypothesis** (fits the data, not proven).

## What was built

The stack from ADR 0001, reduced to the minimum:

- `src/core` (plain Node, no `vscode`): a tolerant parser, a file index over
  the game plus mods (`dlc_load.json` order), sprite and font indexes from
  `interface/**/*.gfx`, a BMFont reader, English localisation, and the layout
  of one window into a draw list.
- `src/renderer` (webview): DDS and TGA readers, WebGL2 with one program,
  sampler objects chosen per shader, S3TC upload with a CPU fallback.
- `src/extension`: a webview panel fed from the unsaved buffer with a 30 ms
  debounce. `suite.ts` drives a real VS Code through `@vscode/test-electron`.
- `src/tools/compare.ts`: a per-widget pixel comparison with the game capture.

Run it with `npm install`, then `npm run measure`, then
`node out/compare.js <menu.png> work/run-*/render-mainmenu.png work/run-*/mainmenu.drawlist.json <out>`.

## 1. S3TC in the VS Code webview: verified

- VS Code 1.142.0 (Electron 43.7.7, Chrome 150.0.7871.250). The webview's
  WebGL2 context runs on `ANGLE (NVIDIA GeForce RTX 4090 Direct3D11)`. It
  exposes `WEBGL_compressed_texture_s3tc`, `_s3tc_srgb`,
  `EXT_texture_compression_bptc` and `_rgtc`. WebGL 1 also has S3TC.
- Self-check: a 4×4 DXT1 block uploaded compressed, drawn and read back gives
  `rgba(255,0,0,255)` as expected.
- Real vanilla files with block-aligned sizes (DXT1 216×120, DXT3 672×580,
  DXT5 732×544): compressed upload works. The GPU result differs from Etch's
  CPU decoder by at most 5–6 per channel (mean < 0.52) because of interpolation
  rounding.
- **Sizes that are not a multiple of 4 are refused.** `compressedTexImage2D`
  returns `INVALID_OPERATION` for them. That covers 73 of the 233 vanilla DXT
  interface textures (30 DXT5, 28 DXT3, 15 DXT1), for example
  `new_eoc_bg.dds` 635×790. The DDS data is already padded to whole blocks, so
  the likely fix is to upload at the padded size (`ceil4(w)×ceil4(h)`) and
  scale the UVs (**hypothesis**, not tried). A CPU decode also works.

## 2. Fidelity: main menu vs the Tongs capture

- Reference: `menu.png` from the lab run `tongs-harden-1` (2026-10-19),
  3440×1440, `game_ui_scale = 1`. It was taken with the lab's 10-mod playset,
  and Proper 2K UI Enhanced replaces `frontend.gui`. The comparison therefore
  renders that playset (vanilla plus mods, last mod wins), pinned in
  `samples/playset-menu-capture.json`. Another session changed
  `dlc_load.json` during this work.
- Window: `country_selection_panel/mainmenu`. That covers 23 drawn widgets:
  logos, the bottom panel, and the social buttons.
- Sample data (`samples/mainmenu.json`): the two code-filled strings (the
  continue text and the version label), plus three widgets the game hides.
- Compared: 350,000 pixels the render covers fully (alpha 255). Another
  155,578 edge pixels with partial alpha were left out, because the game blends
  them over the map.

| | Run 1 (first rules) | Final |
| --- | --- | --- |
| Mean max-channel difference | 6.85 | 4.79 |
| Pixels within ±2 | 91.2 % | 92.8 % |
| Widgets pixel-exact (mean 0) | 7 of 21 | 12 of 23 (button text split out) |

Every widget that is not covered by code-filled content matches exactly:
96.5 % of those pixels, mean 0.39.

What matches pixel for pixel (**verified**):

- **Layout:** anchor plus offset, `fullscreen` windows take the screen size,
  `CENTER_DOWN` and `UPPER_RIGHT` anchors, and children with no orientation
  anchor `UPPER_LEFT` to the parent's box (no inheritance seen here).
  `mainmenu_panel_bottom` lands at (1057, 1339), as Tongs reported.
- **Sprites:** BGRA8 DDS drawn 1:1 at integer positions. The D3D9 half-pixel
  offset is compensated by the game: shifting the quads by −0.5 px raises the
  mean difference from 4.8 to 22.4.
- **Bitmap text** in `instantTextBoxType`: BMFont glyphs with kerning, the
  font's `color`, the line height of the `.fnt`, the text at
  `y + borderSize.y`, and wrapping at `maxWidth`. All six text boxes are exact
  after two rules found in run 1:
  - `format = centre` rounds half up, `round((w − textW) / 2)`. Floor was 1 px
    to the left.
  - A wrapped line keeps its trailing space when measured for centring.
    `EU4 v1.37.5.0 Inca (491d)` wraps the same way the game does.

What differs, and why:

- **Code-filled content (expected):** the Russian shield
  (`continue_game_shield`, a masked flag), the five link icons
  (`frontend_links`, an overlapping elements box), and the state of the
  login checkbox (the game shows the green frame). The widgets these cover are
  the ones below 100 % (`frontend_continue_bg`, `continue_game_button`,
  `PersistentSocialButtons/background`, `frontend_bottom_bg`).
- **Button text from `buttonText`** (`credits_button`, `settings_button`):
  the game draws it 1 px lower and slightly blurred. Centring it vertically
  without rounding (y = 19.5 in a 63 px button) halves the error (mean 24 → 12)
  but does not remove it. The cause is still open (**hypothesis**: a
  sub-pixel position through `text.shader`'s linear magnification, plus a
  vertical rule not yet found). Text boxes placed by hand over buttons (Single
  Player, Tutorial, Exit) are exact.

## 3. Budget (vanilla `countrydiplomacyview.gui`, 148 KB, 1920×1080)

The 30 ms debounce is part of the measured path. Times are change → pixels,
40 warm edits: one number in the unsaved buffer toggled.

| Step | Median ms | p95 ms |
| --- | ---: | ---: |
| **Change → pixels (budget ≤ 50)** | **36.6** | **55.2** |
| Debounce timer (set to 30 ms) | 30.7 | 46.0 |
| Debounce fired → pixels | 5.8 | 9.8 |
| Host total (parse + layout + JSON + post) | 3.3 | 3.9 |
| Parse 148 KB | 0.5 | 1.2 |
| Layout + draw list (63 KB JSON) | 2.0 | 2.6 |
| postMessage transit | 1.4 | 1.5 |
| Webview: JSON parse, textures (cached), draw + GPU sync | 1.0 | 5.3 |

- The work itself takes about 6 ms. The **debounce dominates**: the timer
  fires late under load (p95 46 ms for a 30 ms timer), so p95 misses 50 ms.
  Lowering the debounce, or drawing on the leading edge and again on the
  trailing edge, would put p95 near 10–15 ms (**hypothesis**).
- On the 3440×1440 main menu, debounce fired → pixels is 2.8 ms median.

Cold open (new session and new webview, first pixels with all 60 textures):
186–258 ms over six runs. All runs had the files in the OS cache. A
first-ever read from disk was not measured.

| Step (median of runs 2–6) | ms |
| --- | ---: |
| Localisation, all English `.yml` (126,744 keys) | 55 |
| Webview boot to the first message | 55 |
| Textures: fetch + decode + upload of 60 files | 30–35 |
| File index (`interface`, `gfx/interface`, `gfx/fonts`, `localisation`) | 23 |
| `.gfx` sprite index (6,831 sprites) | 10–11 |
| Draw + GPU sync | 5–10 |
| Parse + layout | 7 |
| **Total** | **~195** |

- Cold open sits far under 1 s. No single step dominates: localisation and
  webview boot each take a quarter of the time. With the 10-mod playset the
  index and localisation grow (50 + 22 + 68 ms), and the first webview in a
  fresh VS Code took 185 ms to boot (total 367 ms).
- Texture fetches run in parallel: the 60 single fetches sum to 1.0–2.4 s, but
  the step takes 30–80 ms of wall time.

## Open after this prototype

- The rule for `buttonText` placement (the 1 px plus blur).
- Uploading DXT at padded sizes (73 vanilla textures).
- `toFrame` (requestAnimationFrame after the pixel sync) does not show
  presentation latency; the real screen latency is not measured.
- The unsaved buffer must be decoded as Windows-1252. The prototype set
  `files.encoding = windows1252` in the test profile; the real extension
  needs a decision on this (the editor's encoding is the user's setting).
- Only one window was compared, at one resolution, with `game_ui_scale = 1`.
