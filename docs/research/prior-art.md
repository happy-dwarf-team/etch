# Prior art for Paradox interface files

Research for [#4](https://github.com/happy-dwarf-team/etch/issues/4): which existing
tools for `.gui` / `.gfx` files Etch can reuse, and where it must differ.

Checked on 2026-10-20 against the projects' own repositories, package registries
and the VS Code Marketplace. "Last activity" is the newest commit or release seen
on that date. Nothing was downloaded or run; source was read online. Facts about
vanilla files come from a local Steam install of EU4 `v1.37.5.0` (read only).

Labels used below: **verified** (read in source, manifest or files), **hypothesis**
(plausible, not checked; needs a prototype or the format research in
[#3](https://github.com/happy-dwarf-team/etch/issues/3)).

## Answer in brief

- **No existing tool previews EU4 1.37.5 interface files.** The closest prior art is
  HOI4 Mod Utilities (MIT, TypeScript, VS Code): it renders HoI4 `.gui` files of the
  same `containerWindowType` lineage as HTML, with jump-to-source, but text uses
  browser fonts at an estimated size and fidelity is not measured. The Paradox
  Modding Toolkit has a measured, calibrated GUI designer, but only for the newer
  Jomini-era GUI format (CK3, Vic3) and under GPL-3.0.
- **Etch must coexist with CWTools and ParadoxCode** in VS Code. Both bind `.gui` and
  `.gfx` under an EU4 folder to the language id `eu4`. Neither validates `.gui`
  structure for EU4: CWTools' EU4 rules only know sprite names, ParadoxCode's EU4
  rules cover `.gfx` (sprites, bitmap fonts) but have no `.gui` schema.
- **Reuse is at the level of small libraries and methods, not a renderer.** Parser,
  DDS, TGA and BMFont code is small and has MIT-compatible options in both
  TypeScript and Rust. GPL/AGPL projects (Paradox Modding Toolkit, Tiger,
  tree-sitter-paradox, foch, pdx-tools) can be read for ideas but not copied into
  MIT-licensed Etch.
- **Where Etch differs:** EU4-specific, bitmap-font text drawn from the game's own
  `.fnt` files (no prior art does this), precision measured against the game, a
  game-host backend, hot reload.

## Editor tooling (language servers, validators)

| Project | Licence | Last activity | EU4 1.37.5 `.gui`/`.gfx` | Relation to Etch |
|---|---|---|---|---|
| [CWTools for VS Code](https://github.com/cwtools/cwtools-vscode) (`tboby.cwtools-vscode`), engine [cwtools](https://github.com/cwtools/cwtools) | MIT ([LICENSE.md](https://github.com/cwtools/cwtools-vscode/blob/main/LICENSE.md)) | release 0.10.31, 2025-10-04; last commit on default branch 2025-12-08; ~144k installs | Claims `.gui`/`.gfx` under `**/europa*universalis*iv/**` as language `eu4` ([release/package.json](https://github.com/cwtools/cwtools-vscode/blob/main/release/package.json)). EU4 rules ([cwtools-eu4-config](https://github.com/cwtools/cwtools-eu4-config), MIT, last commit 2026-04-15) have only `interface/sprites.cwt`, which says "I just want to know the name. So the validation is obviously incomplete"; no `.gui` rules. Syntax errors are reported for any claimed file. | **Coexist.** F#/.NET language server: not embeddable in a webview or a TypeScript/Rust renderer. Its rule format (`.cwt`) is reusable as a vocabulary source (below). |
| [cwtools-hoi4-config](https://github.com/cwtools/cwtools-hoi4-config) `Config/interface/gui.cwt`, [cwtools-stellaris-config](https://github.com/cwtools/cwtools-stellaris-config) `config/interface/gui_types.cwt` | MIT | 2026-09-18 / 2026-06-11 | HoI4 / Stellaris, not EU4. ~950 lines each listing `containerWindowType`, `iconType`, `instantTextBoxType`, enums for `orientation`, `format` etc.; the Stellaris file notes its own gaps ("I also do not know what is optional and what is not optional"). | **Borrow as a starting vocabulary** for Etch's widget schema, then confirm each attribute against EU4 (#3 and the lab's GUI reverse engineering). |
| [ParadoxCode](https://github.com/danxiaogu520/ParadoxCode) (`ParadoxCode.paradoxcode-vscode`) | MIT | v0.5.3, 2026-10-14; commits daily; ~60 installs | EU4-only Rust language server. Claims `**/interface/*.gui` and `*.gfx` as language `eu4` ([editors/vscode/package.json](https://github.com/danxiaogu520/ParadoxCode/blob/main/editors/vscode/package.json)). Rules exist for `interface/gfx.json` (sprites, `bitmapfont` with `path`, `color`, `textcolors`) and `interface/sprites.json`, none for `.gui`. | **Coexist.** Its `.gfx` schema is a useful cross-check for Etch's font/sprite model. Young project. |
| [Paradox Language Support](https://github.com/DragonKnightOfBreeze/Paradox-Language-Support) | MIT | v3.0.4, 2026-10-07 | IntelliJ plugin, not VS Code. Uses CWTools-style configs; previews DDS/TGA; README says configs for games other than Stellaris, Vic3, EU5, HoI4 "may be rather incomplete or out of date". No GUI preview. | **Not in the same editor.** Reference only. |
| [Tiger](https://github.com/amtep/tiger) | GPL-3.0 | v1.19.0, 2026-06-06 | CK3, Vic3, Imperator only (HoI4 unfinished). | Not applicable to EU4; licence excludes reuse. |
| [foch](https://github.com/Acture/foch) | AGPL-3.0 | 2026-10-19, alpha 0.0.2 | EU4 mod merge/analysis with its own parser and LSP; not a GUI tool. | Licence excludes reuse. |
| Syntax-only extensions: [`tboby.paradox-syntax`](https://marketplace.visualstudio.com/items?itemName=tboby.paradox-syntax), [`dragon-archer.paradox-highlight`](https://github.com/dragon-archer/paradox-highlight) (MIT) | MIT | 2025-09 / 2025-11 | TextMate grammars only. | Coexist; Etch adds no grammar. |

## GUI previewers and editors

| Project | Licence | Last activity | Games / format | Rendering fidelity | Relation to Etch |
|---|---|---|---|---|---|
| [HOI4 Mod Utilities](https://github.com/herbix/hoi4modutilities) (`Chaofan.hoi4modutilities`) | MIT | v0.18.1, 2026-10-01; since 2020; ~76k installs | HoI4 `.gui` (`containerWindowType` lineage, like EU4). Schema in [`src/hoiformat/gui.ts`](https://github.com/herbix/hoi4modutilities/blob/master/src/hoiformat/gui.ts); renderers for container window, button, icon, instant text box, grid box, scrollbar, edit box, dropdown ([`src/util/hoi4gui/`](https://github.com/herbix/hoi4modutilities/tree/master/src/util/hoi4gui)). The [wiki](https://github.com/herbix/hoi4modutilities/wiki/GUI-preview) still lists four components. | Approximate. Widgets are absolutely positioned HTML `div`s; DDS/TGA are decoded in the extension host and sent as PNG ([`converter.ts`](https://github.com/herbix/hoi4modutilities/blob/master/src/util/image/converter.ts)). Text is a CSS font with size estimated as `ceil(digits in font name × 0.7)`, white with a CSS shadow ([`instanttextbox.ts`](https://github.com/herbix/hoi4modutilities/blob/master/src/util/hoi4gui/instanttextbox.ts)); no BMFont. No comparison with the game. | **Closest model; reuse ideas and possibly code (MIT, with attribution).** Proves the pattern: preview button on `.gui`, webview, elements carry `start`/`end` source offsets for jump-to-source. Not EU4-aware. |
| [Paradox Modding Toolkit](https://github.com/JDeffner/paradox-modding-toolkit) (`JDeffner.px-toolkit`) | GPL-3.0-or-later | v0.5.5, 2026-10-06; since 2026-07 | CK3, Vic3 (EU5 pending) Jomini-era `.gui` (widgets, `hbox`/`vbox`, anchors), a different format from EU4's. | Measured: every layout rule in [`docs/gui-designer/spec.md`](https://github.com/JDeffner/paradox-modding-toolkit/blob/main/docs/gui-designer/spec.md) cites an in-game calibration batch; text metrics measured per font ([`measuredMetrics.ts`](https://github.com/JDeffner/paradox-modding-toolkit/blob/main/packages/server/src/gui/measuredMetrics.ts)). Its listing says the "preview models supported layout rules; runtime bindings still need an in-game check". | **Different format, incompatible licence.** Reuse the *method* for the precision corpus (#9, #10): flat unique marker colours, written predictions before the screenshot, a script that extracts bounding boxes ([`docs/gui-designer/README.md`](https://github.com/JDeffner/paradox-modding-toolkit/blob/main/docs/gui-designer/README.md)). Not on EU4, so no editor conflict. |
| [HOI4-GUI-Editor](https://github.com/KZJmask/HOI4-GUI-Editor) | MIT (LICENSE.txt; `package.json` says ISC) | v1.1.0, 2026-08-24 | Electron app that *generates* HoI4 GUI from blocks. Does not read DDS or existing `.gui` files. | None (no game assets). | Not relevant. |
| [pdx-gui](https://github.com/mikejaklitsch/pdx-gui) | none stated | 2026-09-27 | Python text tool: lossless tagged-block editing of `.gui`. | No rendering. | Not relevant; no licence. |
| In-game GUI editor of Jomini-era games | proprietary | — | CK3 and later: `-debug_mode -develop`, Ctrl+F8, `reload gui`, auto reload on save ([CK3 wiki](https://ck3.paradoxwikis.com/Interface)). | Is the game. | Not available for EU4's format; whether EU4 can reload its interface is [#2](https://github.com/happy-dwarf-team/etch/issues/2). |

No GUI viewer for EU4, CK2 or Stellaris was found on GitHub or the Marketplace
(searches for `containerWindowType`, "gui editor", "gui viewer", "paradox gui",
"eu4 gui", "ck2 gui"). [Clausewitz-EU4-Editor](https://github.com/fboerman/Clausewitz-EU4-Editor)
(GPL-2.0, last push 2013) and [eug](https://github.com/mmyers/eug) edit game data, not interfaces.

## Parsers

Etch needs from a parser: tolerance of broken input while typing, source spans for
jump to source and diagnostics, file order preserved across different keys (draw
order is a #3 question, and HOI4 Mod Utilities already keeps an `_index` per
element to sort by it), and duplicate keys kept.

| Project | Licence | Last activity | Language / runtime | Spans | Order and duplicates | Fit |
|---|---|---|---|---|---|---|
| [jomini](https://github.com/rakaly/jomini) (crate) | MIT | 0.37.2, 2026-10-15 | Rust, zero deps, Wasm-capable; fuzzed; powers pdx.tools | `TextTape` tokens borrow slices of the input; error types carry byte offsets. No line/column API (spans derivable from slice pointers: **hypothesis**). | Tape keeps order and duplicates. | Strong for a Rust/Wasm renderer; mature. |
| [jomini.js](https://github.com/nickbabcock/jomini) (npm `jomini`) | MIT | 0.10.0, 2026-03-14 | Wasm wrapper of the above | None in output | Plain JS objects group duplicates and can reorder keys; the JSON path keeps file order. | Weak: no spans. |
| [pdxscript-rs](https://github.com/pdx-foundry/pdxscript-rs) | MIT | 2026-10-12, created 2026-09 | Rust | Half-open UTF-8 byte offsets and one-based lines on every item | "preserves item order and duplicate keys"; repairs stray/missing braces as diagnostics | Feature fit is exact; very young (no stars, no release). Callers must decode to UTF-8 first. |
| `@pdx-ts/pdxscript` (from [pdx-ts-sdk](https://github.com/yeager-j/pdx-ts-sdk)) | MIT | npm 0.8.0, 2026-09-03 | TypeScript | Yes (upstream of pdxscript-rs) | Same | TypeScript counterpart; young, Stellaris-oriented SDK. |
| HOI4 Mod Utilities [`hoiparser.ts`](https://github.com/herbix/hoi4modutilities/blob/master/src/hoiformat/hoiparser.ts) | MIT | 2026-10-01 | TypeScript | Token `start`/`end` offsets | Children grouped per type plus `_index` | Usable reference. |
| CWTools parser | MIT | 2025-12 | F# / .NET (FParsec) | Yes | Yes | Not embeddable in Node or a webview. |
| [tree-sitter-paradox](https://github.com/Acture/tree-sitter-paradox) | AGPL-3.0 | 2026-10-10 | C + Wasm/Node bindings, incremental | Yes | Yes | Licence excludes it. |
| Paradox Modding Toolkit parser (`packages/server/src/parser`) | GPL-3.0 | 2026-10-06 | TypeScript CST | Yes | Yes | Licence excludes it. |

The `.gui` syntax Etch needs is a small subset of Paradox script (blocks, scalars,
quoted strings, comments). Writing a tolerant parser in the renderer's language is
a few hundred lines; reusing jomini or pdxscript-rs is equally viable on the Rust side.

## Images and fonts

What vanilla EU4 1.37.5 actually uses (**verified** on the local install):

- `gfx/interface` holds 7,108 `.dds` files: 6,857 uncompressed 32-bit BGRA
  (masks `0xff0000/0xff00/0xff/0xff000000`), 18 uncompressed 24-bit RGB, 112 DXT5,
  93 DXT3, 28 DXT1. No DX10 header, no BC7.
- The 112 vanilla `.gfx` files reference 5,898 `.dds` and 1,013 `.tga` texture
  files (one `.ddr` typo). So a TGA decoder is required too; which file the game
  loads when both or only one exists is for #3.
- The 24 `gfx/fonts/*.fnt` files are AngelCode BMFont **text** format (`info`,
  `common`, `char`, `kerning` lines; `garamond_14.fnt` has 159 kerning pairs) but
  contain **no `page` lines**: the glyph texture is found by the font's base name
  (`garamond_14.dds`/`.tga`, `Arial12.tga` only, `Mapfont.dds` only). `charset="ANSI"`.

| Library | Licence | Last activity | Covers EU4 set? | Notes |
|---|---|---|---|---|
| three.js [`DDSLoader`](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/DDSLoader.js) | MIT | three 0.186.1, 2026-09-24 | Yes: DXT1/3/5 and uncompressed 32-bit RGBA / 24-bit RGB with the masks above | Returns compressed blocks for WebGL upload (needs `WEBGL_compressed_texture_s3tc` in VS Code's webview: **hypothesis**) or expanded RGBA. Can be lifted as a single file. |
| HOI4 Mod Utilities [`util/image/dds`](https://github.com/herbix/hoi4modutilities/tree/master/src/util/image/dds) | MIT | 2026-10-01 | Yes (BC1–BC7 enum, RGB masks) | TypeScript, CPU decode to RGBA in the extension host. |
| [parse-dds](https://github.com/Jam3/parse-dds) | MIT | 1.2.1, 2015 | **No**: FourCC formats only, so not the 96.5% uncompressed files | Unmaintained. |
| [decode-dxt](https://github.com/kchapelier/decode-dxt) | MIT | 1.0.1, 2017 | DXT only | Unmaintained but tiny. |
| Paradox Modding Toolkit `packages/server/src/dds/decoder.ts` | GPL-3.0 | 2026-10-06 | Yes | Licence excludes it. |
| [texture2ddecoder](https://github.com/UniversalGameExtraction/texture2ddecoder) (crate) | MIT OR Apache-2.0 | 0.1.2, 2025-03 | BCn (DXT) | Pure Rust, `no_std`: Wasm-friendly. Header parsing via [ddsfile](https://github.com/cwfitzgerald/ddsfile) (MIT, 0.6.0, 2026-04). |
| [image_dds](https://github.com/ScanMountGoat/image_dds) / bcdec_rs | MIT | 0.7.2, 2025-03 | Yes | Rust. |
| [image](https://github.com/image-rs/image) (crate) | MIT OR Apache-2.0 | 0.25.10, 2026-03 | TGA yes; DDS no longer in its formats list ([Cargo.toml](https://github.com/image-rs/image/blob/main/Cargo.toml)) | Rust TGA decoding. |
| `tga-js` (npm), `tga` (npm, used by HOI4 Mod Utilities) | MIT | 2020 | TGA | TypeScript side. |
| [parse-bmfont-ascii](https://github.com/mattdesl/parse-bmfont-ascii) | MIT | 1.0.6, 2015 | Parses EU4 `.fnt`: `page` lines are optional in its code | ~80 lines; layout (`layout-bmfont-text`, 2017) does not know EU4's text rules (colour codes, `format`, wrapping), so layout must be Etch's own. |
| [bmfont](https://github.com/KalitaAlexey/bmfont-rust) (crate) | MIT OR Apache-2.0 | 0.3.3, 2021 | Text format (page-line handling not checked) | Unmaintained. |

## Recommendations

1. **Coexist in VS Code, do not compete.** Etch contributes no language, grammar or
   language server for `.gui`/`.gfx`; CWTools and ParadoxCode already own the `eu4`
   language id for those files. Etch adds a preview command and editor-title button
   keyed on the file extension (`resourceExtname`), not on the language id, so it
   works whichever language extension is active. Its diagnostics use their own
   `source` and cover what nobody checks for EU4: unknown sprite or font referenced
   from `.gui`, missing texture file, missing glyph, layout problems. Whether Etch
   repeats plain syntax errors that CWTools also reports is a spec decision.
2. **Write the renderer.** There is nothing to fork for EU4. HOI4 Mod Utilities is
   the template for the extension shape (preview webview, source offsets on each
   element, gfx/localisation indexes) and its MIT code may be adapted with
   attribution; its text rendering is the part Etch must replace.
3. **Draw text from the game's bitmap fonts.** EU4 ships `.fnt` plus `.dds`/`.tga`
   pages, so Etch can draw the same glyphs the game draws. Write the `.fnt` reader
   (tolerating missing `page` lines, texture by base name) and the text layout
   itself; this is where Etch's fidelity can exceed all prior art.
4. **Parser:** own tolerant, span- and order-preserving parser in the renderer's
   language, or on Rust: jomini (mature) or pdxscript-rs (exact fit, young).
   Not jomini.js (no spans), not tree-sitter-paradox or the toolkit's parser (licences).
5. **Images:** a minimal decoder for BGRA8, RGB8, DXT1/3/5 plus TGA covers every
   vanilla interface texture. Options: three.js `DDSLoader` or HOI4 Mod Utilities'
   decoder (TypeScript), texture2ddecoder + ddsfile + image/TGA (Rust/Wasm). Mods
   may use other formats; the decoder must report unsupported ones as diagnostics.
6. **Schema vocabulary:** start from CWTools' HoI4/Stellaris GUI rules (MIT) and
   ParadoxCode's EU4 `gfx.json`, confirm against EU4 in #3; do not treat them as truth.
7. **Precision method:** adopt the Paradox Modding Toolkit's calibration method
   (marker colours, predictions before screenshots, automated box extraction) for
   the precision corpus in #9/#10; only the idea is reused, not the GPL code.
8. **Licence rule for the stack:** Etch is MIT, so dependencies must be MIT, Apache-2.0,
   BSD or similar. GPL-3.0 (Paradox Modding Toolkit, Tiger) and AGPL-3.0
   (tree-sitter-paradox, foch, pdx-tools) are read-only references.

## Consequences for the stack ticket (#8)

- No candidate forces a language: every needed piece (parser, DDS/TGA, BMFont) has
  a maintained MIT option in TypeScript and in Rust, or is small enough to write.
  C++ shared with the team's other repositories is not required by any reuse.
- CWTools' engine (.NET) cannot be embedded; reuse of its work is limited to rule
  files as data.
- In TypeScript, the closest reusable code base (HOI4 Mod Utilities) decodes images
  in the extension host and ships PNGs to a DOM-based webview. #8 should check that
  model against the reload budget, against decoding or uploading textures in the
  webview itself (WebGL S3TC is unverified), and against a Rust/Wasm core.
- Text rendering from BMFont pages needs a pixel-addressable surface (Canvas 2D or
  WebGL), not CSS text, if the precision target is to be met.
