# What `.gui` and `.gfx` files define, and how EU4 lays them out

Research for [etch#3](https://github.com/happy-dwarf-team/etch/issues/3).
Game: Europa Universalis IV 1.37.5, Steam, win64 (`eu4_rev.txt`
`835bfdf8…`, `eu4.exe` SHA-256 `9ad3efe1…d771a`). Date: 2026-10-20.

## Answer in brief

- A `.gui` file is a tree of named **widgets** under `guiTypes`. 23 block
  kinds occur in vanilla, but three cover 77 % of them: text boxes, icons and
  buttons. Each widget gets a `position` offset from an **anchor**
  (`orientation`) in its parent. Most widgets have no size of their own:
  icons and buttons take it from their sprite, text boxes from
  `maxWidth`/`maxHeight`.
- A `.gfx` file is a flat list of named **sprites** (10 kinds) and **bitmap
  fonts**. A sprite is a texture plus a frame count, an optional shader
  (`effectFile`) and, for some kinds, nine-slice borders or a second texture.
- Fonts are AngelCode BMFont text files with kerning, limited to Windows-1252.
  Text in `.gui` is a localisation key or a literal. The `§`, `£`, `$` and
  `[]` markup lives in localisation, and the game expands it at run time.
- The game's code owns a large part of what is shown. About 80 % of the
  widget names in vanilla also appear as strings in `eu4.exe`. Lists, grids
  and overlapping boxes are filled by code. Progress values, frames, visibility,
  `show_position` animation, button states and nearly all text are set at run
  time.

Evidence labels used below:

- **[F]** counted in files by the scripts described in [Method](#method);
- **[L]** measured in the live game (lab and Tongs notes);
- **[S]** seen statically in `eu4.exe` (string table only, no disassembly here);
- **[W]** stated by a wiki page;
- **[H]** hypothesis, not checked.

## Method

- **Corpora**, all read only:

  | Label | Source | Files |
  | --- | --- | --- |
  | vanilla | game `interface/`, recursive | 129 `.gui`, 132 `.gfx` |
  | P2KUIE | Proper 2K UI Enhanced `interface/` @ `9c73139` | 129 `.gui`, 42 `.gfx` |
  | ANB2K | eu4-anbennar-proper-2k-ui `src/interface/` @ `58554a91` | 64 `.gui`, 20 `.gfx` |
  | DK2K | DK-2KUI `src/interface/` @ `5a3f2b9` | 3 `.gui` |

- **Parser.** A small Clausewitz-script tokenizer and parser handles
  `key = value`, `key = { … }`, `#` comments and quoted strings. Keys were
  lower-cased for counting, because casing varies widely (see [Case](#case)).
  A keyed block counts as a widget when its key ends in `Type` or `Box`, or
  when it has a `name`, unless it is a known property block (`position`,
  `size`, `borderSize`, …). This rule is why the `scrollbarType` parts
  `slider`, `track`, `increaseButton` and `decreaseButton` show up as widgets
  below.
- **Executable strings.** `eu4.exe` was read once as bytes (hash above,
  unchanged) and printable ASCII runs were dumped. The GUI keywords sit
  together in one token table, around file offset `0x1FD9000`–`0x2030000`. A
  string being there proves the engine knows the token. It does not prove
  which widget accepts it.
- **Live data.** Live positions and sizes come from Tongs widget-tree reads
  in the lab (`tongs/docs/design.md`, "Hardening pass"). That run used a
  3440×1440 client area with `game_ui_scale=1.000`.
- The scripts were throwaway and lived outside this repository.

## 1. `.gui` widget inventory

All `.gui` files have one top-level block, `guiTypes`. ANB2K also defines
186 `@name = value` constants at top level and uses them as positions
**[F]**. One ANB2K file (`countrygovernmentview.gui`) has two unclosed braces,
and the game still loads that mod. The renderer's parser therefore has to
tolerate errors.

### Element counts [F]

| Block | vanilla | P2KUIE | ANB2K | DK2K | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| `instantTextBoxType` | 2499 | 2528 | 1540 | 662 | main text widget |
| `iconType` | 2370 | 2426 | 2138 | 607 | sprite or frame of a sprite |
| `guiButtonType` | 1993 | 2015 | 1456 | 446 | sprite button, optional text |
| `windowType` | 887 | 887 | 743 | 134 | container; 623 vanilla roots |
| `listboxType` | 243 | 243 | 127 | 15 | code-filled list |
| `checkboxType` | 179 | 179 | 121 | 159 | two-state button |
| `positionType` | 110 | 110 | 63 | 20 | named point read by code |
| `editBoxType` | 104 | 104 | 24 | 7 | text input |
| `OverlappingElementsBoxType` | 83 | 85 | 36 | 4 | code-filled row that squeezes children |
| `shieldtype` | 70 | 70 | 48 | 2 | country shield (masked flag) |
| `textBoxType` | 54 | 54 | – | – | legacy text widget |
| `eu3dialogtype` | 54 | 54 | 26 | 3 | legacy dialog container (diplomacy) |
| `buttonType` | 36 | 36 | – | – | legacy button (music player) |
| `smoothListboxType` | 35 | 35 | 14 | 2 | code-filled list, smooth scroll |
| `containerWindowType` | 30 | 30 | – | – | newer container (music player, login) |
| `scrollbarType` | 27 | 29 | 6 | – | scroll bar template, referenced by name |
| `background` | 23 | 23 | – | – | sprite block inside `containerWindowType` |
| `gridBoxType` | 18 | 18 | 14 | – | code-filled grid |
| `extendedScrollbarType` (+ `slider`, `track`, `increaseButton`, `decreaseButton`) | 2 (+2 each) | same | – | – | music player volume |

The mods add no new block kinds. Their changes are positions, sizes, fonts,
sprites and a few new widgets.

### Nesting [F]

Roots in vanilla are `windowType` (623), `positionType` (106),
`eu3dialogtype` (54), `iconType` (23), `containerWindowType` (19),
`guiButtonType` (12), `instantTextBoxType` (10) and a few others. Root
non-windows are templates and offsets that code instantiates or reads (for
example `alerticon_startposition` and `tributary_shield`). The wiki says
"all elements must be used within containers" **[W]**, so a root `iconType`
is never drawn on its own **[H]**. Windows nest up to many levels deep
(`windowType > windowType` 257×). `scrollbarType` holds `guiButtonType`
children (109×).

### Properties per element (vanilla) [F]

Each count is the number of times the key appears on that block type.
Tooltip and sound keys are grouped.

| Block | Layout and look | Behaviour (not drawn) |
| --- | --- | --- |
| `instantTextBoxType` | `font` 2502, `maxWidth` 2496, `position` 2483, `maxHeight` 2483, `text` 2395, `format` 2206, `borderSize` 2139, `textureFile` 1396, `fixedsize` 842, `orientation` 730, `alwaystransparent` 204, `truncate` 89, `if_resolution` 70, `scrollbartype` 38, `text_color_code` 6, `vertical_alignment` 5 | `pdx_tooltip` 21, `hint_tag` 14 |
| `iconType` | `position` 2340, `spriteType` 2269, `orientation` 1274, `scale` 368, `frame` 159, `quadTextureSprite` 90, `if_resolution` 77, `rotation` 15, `buttonMesh` 6 | `alwaystransparent` 174, `hint_tag` 183, tooltips 14–22 |
| `guiButtonType` | `position` 1934, `quadTextureSprite` 1861, `buttonFont` 969, `buttonText` 592, `orientation` 509, `spriteType` 123, `scale` 64, `if_resolution` 59, `frame` 54, `size` 27, `text` 25, `font` 11, `format` 6 | tooltips ~785 each, `shortcut` 347, `clicksound` 345, `extra_shortcut` 108, `scripted` 33, `parent` 16, `web_link` 3 |
| `windowType` | `size` 844, `position` 816, `background` 691, `dontRender` 704, `horizontalBorder` 732, `verticalBorder` 546, `fullScreen` 582, `orientation` 262, `show_position` 51, `hide_position` 45, `animation_type` 49, `animation_time` 50, `if_resolution` 10 | `moveable` 816, `upsound` 82, `downsound` 63, `click_to_front` 4 |
| `listboxType` | `position` 241, `size` 232, `scrollbartype` 230, `background` 225, `spacing` 220, `borderSize` 211, `orientation` 199, `horizontal` 196, `if_resolution` 32, `offset` 5, `step` 2, `scrollbar_side` 1 | `priority` 8 |
| `smoothListboxType` | same set as `listboxType` | |
| `gridBoxType` | `position`, `size {width height}`, `slotsize {width height}`, `max_slots_horizontal` 18 each, `format` 17, `max_slots_vertical` 5 | |
| `OverlappingElementsBoxType` | `size` 83, `position` 82, `spacing` 81, `format` 76, `orientation` 55, `first_on_top` 1 | |
| `checkboxType` | `quadTextureSprite` 179, `position` 178, `buttonFont` 44, `orientation` 18, `buttonText` 14 | tooltips 53, `shortcut` 10 |
| `editBoxType` | `font` 104, `size` 102, `text` 94, `borderSize` 87, `orientation` 58, `textureFile` 49 | `instantTextBoxType` (a scalar) 30, `cursor` 9, `use_special_chars` 9, `ignore_tab_navigation` 6 |
| `textBoxType` | `font`, `borderSize`, `text`, `maxWidth` 40, `maxHeight` 36, `format` 21, `textureFile` 17 | |
| `scrollbarType` | `slider`, `track`, `leftbutton`, `rightbutton` (child names), `size`, `position`, `borderSize`, `priority`, `minValue`, `maxValue`, `stepSize`, `startValue`, `horizontal` (27 each) | `scroll_speed` 1 |
| `containerWindowType` | `size {width height}` 30, `position` 28, `orientation` 15, `margin {top left bottom right}` 1, `origo` 1 | `show_animation_type`, `fade_time`, `fade_type` 1 each |
| `shieldtype` | `spriteType`, `position` (70 each) | |
| `positionType` | `position` (110) | |

Properties that appear only in the mods [F]:

- `scripted = yes` on icons, text boxes and windows: ANB2K uses it 1015× and
  DK2K 374×; with buttons the totals are 1561 and 658. It binds a widget to
  Anbennar's `common/custom_gui` triggers and effects (vanilla: 33 buttons
  only).
- `vertical_alignment` on `guiButtonType`: ANB2K, 13×.
- `allwaystransparent` (misspelled) 2×, `format` on an edit box 1×.
- New values: fonts such as `coyote_12b`, `Stellaris_Small` and
  `Large_Font_Stellaris`, plus `orientation = center_left` and
  `orientation = top`.

### Value sets [F]

| Key | Values (vanilla counts) |
| --- | --- |
| `orientation` | `UPPER_LEFT` 2722, `CENTER` 200, `LOWER_RIGHT` 93, `LOWER_LEFT` 75, `UPPER_RIGHT` 73, `left` 25, `CENTER_DOWN` 11, `CENTER_UP` 9, `UPPERL_LEFT` 3 (typo), `right` 1 |
| `format` (text) | `left` 813, `centre` 736, `right` 477, `center` 283, `upper_left` 17 |
| `scale` | 0.3–1.7, mostly 0.5–0.9, one `1000` |
| `rotation` | radians: `1.5708` 9, `-1.5708` 3, `-0.3` 2, `1.57` 1 |
| `frame` | 1–17 |
| `fixedsize` | `yes` 818, `no` 24 |
| `horizontal` (lists) | `0` 195, `1` 42, `2` 10, `yes` 1 |
| `animation_type` | `decelerated` 48, `linear` 1 (the exe also knows `accelerated` and `smoothstep` **[S]**) |
| `size` with `%` | 4, in `pops_login.gui` and `social_view.gui` (`width = 100%`) |
| `position` < 0 | 2073 values, mostly with right, bottom or centre anchors |
| `position` with abs > 5000 | 14 (for example `x = 99512`), a way to hide a widget the code expects to exist |

The exe's token table lists the orientations `upper_left`, `upper_right`,
`lower_left`, `lower_right`, `center_up`, `center_down`, `center_left` and
`center_right`, plus `center`. It lists the formats `left`, `right` and
`centre`, and `vertical_alignment` with `top` and `bottom` **[S]**. How the
engine parses `center` as a format, or `left`, `right`, `top` and
`UPPERL_LEFT` as orientations, is **unverified**. The likely fallback is
`UPPER_LEFT` or `left` **[H]**.

### Keys the engine knows but no corpus uses [S]

The GUI token table also contains `centerPosition`, `clipping`, `padding`,
`add_horizontal`, `max_slots`, `scroll_wheel_factor`, `autohide_scrollbars`,
`drag_scroll`, `tilingCenter`, `color_override`, `icon_scale`,
`icons_add_height`, `min_width`, `max_width`, `resizeableWindow`,
`dropDownBoxType`, `radioButtonGroupType`, `listBoxItemType`,
`multiSpriteButtonType`, `3dButtonType`, `browserType`, `curveGraphType`,
`tileSpriteType`, `scrollingSprite`, `resizeableSpriteType`, `BarChartType`
and `progressbar3dType`, among others. None of them occurs in vanilla or in
the three mods **[F]**. `centerPosition` and `clipping` from the ticket fall
in this group. An offline renderer can implement them later and warn when a
mod uses them.

<a id="case"></a>Case: the same key appears in several casings, for example
`Orientation` 2629 / `orientation` 583, `fullScreen` 509 / `fullscreen` 124
and `backGround` 978 / `background` 15. The game evidently reads keys
without regard to case, and the HOI4 wiki says orientations are
case-insensitive **[W]**. The renderer must lower-case keys and enum values.

## 2. Layout semantics

### Position and orientation

- **[L] Verified.** `orientation` picks the anchor point in the **parent's**
  rectangle, and `position` is added to it to give the widget's **top-left
  corner**. The widget is not aligned to the anchor. With the 2K mods'
  `speed_controls.gui` (root window `UPPER_RIGHT` at (0, 0) on a 3440-pixel
  client), Tongs read three widgets live. Each one equals 3440 + `x` and `y`
  exactly:

  | Widget | `.gui` position | Live position |
  | --- | --- | --- |
  | `button_speedup` | (-105, 18) | (3335, 18) |
  | `button_speeddown` | (-93, 49) | (3347, 49) |
  | `speed_indicator` | (-81, 12) | (3359, 12) |

  The match to the pixel suggests the mods' layout was loaded (vanilla says
  -89/-78/-67).
- A child without its own `orientation` inherits the container's **[W]**.
  This is not yet checked live.
- The anchor rectangle of a root window is the screen. For a child it is
  probably the parent's `size` box **[H]**. Static notes found the button's
  position computed from its orientation, its `.gui` offset and a size
  passed by the caller (`0x15AE930`, Tongs `research/widget-tree`).
- `CENTER_UP`, `CENTER_DOWN`, `CENTER_LEFT` and `CENTER_RIGHT` are the
  midpoints of the edges **[H]**. The names suggest it, and HOI4's wiki lists
  the same set **[W]**.
- `origo` (1× vanilla, `containerWindowType`) is "the origin that the position
  is measured relative to" on HOI4 **[W]**. It is probably the point of the
  widget itself that the position places, so `origo = center` centres the
  music player **[H]**. `centerPosition` would be the same idea for icons on
  HOI4 **[W]**. EU4 content does not use it.

### Size

- **Windows** have `size {x y}` (or `{width height}`) and a percentage form,
  `100%` of the parent **[F]**. **[L]** A window's reported size is its
  `.gui` size even when its sprites draw far outside it: `countryview`
  reports 1229×120 while the panel is larger. Windows therefore do not clip
  their children to `size`.
- **Icons and buttons** take their size from the sprite: the texture width
  divided by `noOfFrames`, by the full texture height **[H]**. `scale`
  multiplies that size, and `rotation` turns the sprite (radians, pivot
  unknown). Buttons whose sprite is a `corneredTileSpriteType` take `size`
  from the `.gui` (27 buttons have `size`) **[H]**.
- **Text boxes** are boxes of `maxWidth` × `maxHeight` with `borderSize` as
  inner padding **[W]**. **[L]** `DateText` (P2KUIE: `maxWidth = 228`,
  `maxHeight = 47`, `borderSize {0 5}`, no `fixedsize`) reported 228×38 live.
  The width is `maxWidth`, but the height rule is **unknown**: it matches
  neither `maxHeight` nor the font's `lineHeight = 48` plus the borders.
- `if_resolution = { min_height | max_height = N … }` replaces `position`,
  `size`, sprite, font, `scale` or `buttonText` when the screen height is in
  range **[W]**. It occurs 267× in vanilla, 283× in P2KUIE and 421× in ANB2K
  **[F]**. The engine also knows `min_width`/`max_width` **[S]**. A faithful
  preview must evaluate these blocks against the target resolution.
- `game_ui_scale` is a setting in `settings.txt`. The lab runs used 1.0, and
  the GUI render context's two scale floats were 1.0 **[L]**. Pointer
  coordinates are divided by these floats on input. The effect on layout of
  any other value is **unverified**.

### Clipping

- At run time every render node has an optional clip rectangle: four `int16`
  at `node+0x128`, enabled by a flag at `+0x130` (Tongs static notes). Hit
  testing honours it.
- Which widgets set that rectangle is **unknown**. Lists that scroll must clip
  to their box **[H]**. `windowType` does not clip (see Size). HOI4's
  `clipping` key ("defaults to true") is not used in EU4 content.

### Lists, grids and scroll bars

- `listboxType` and `smoothListboxType` have a box (`position`, `size`),
  `spacing` between entries, `borderSize`, an optional `background` and a
  `scrollbartype` that names a `scrollbarType` template defined elsewhere.
  `standardlistbox_slider` in `core.gui` is used 271×, and the scroll bar
  sits at `scrollbar_side`. `horizontal` takes the values 0, 1 and 2.
- **[L]** A list creates widgets only for its visible rows and swaps their
  text while scrolling. A scroll bar has no render node.
- The entries are root `windowType` templates. Code names them, for example
  `age_objectives_entry`; the `.gui` does not name them **[F]** **[S]**.
- `gridBoxType` places code-made entries into slots of `slotsize`, up to
  `max_slots_horizontal` per row. `format` (17×) is probably the fill corner
  or direction **[H]**. `add_horizontal` is known to the exe but not used
  **[S]**.
- `OverlappingElementsBoxType` lays children in a row of fixed `size` and
  overlaps them when they do not fit **[W]**. `format` sets the alignment.
  The engine fills it from code.
- A `scrollbarType` is a template with four named child buttons and a value
  range.
- `eu3dialogtype` and `containerWindowType` are containers like `windowType`.
  `containerWindowType` uses `{width height}` and `margin` and has fade
  animations.

## 3. `.gfx` sprite inventory

Top-level blocks: `spriteTypes` (vanilla 109 files), `objectTypes` (23,
mostly 3D map objects under `interface/assets/`) and `bitmapfonts` (3)
**[F]**.

| Kind | vanilla | P2KUIE | ANB2K | Defining properties (vanilla counts) |
| --- | ---: | ---: | ---: | --- |
| `spriteType` | 6595 | 2612 | 2096 | `textureFile` 6595, `noOfFrames` 773, `effectFile` 440, `loadType` 1192, `transparencecheck` 375, `alwaystransparent` 285, `norefcount` 66, `legacy_lazy_load` 31, `clicksound` 18, `alphamaskfile` 15, `animation {…}` 6, `overlay_frames_per_row`/`overlay_rows` 1 |
| `textSpriteType` | 130 | 108 | 93 | `textureFile`; used by 568 buttons with text |
| `progressbartype` | 91 | 92 | 108 | `color`, `colortwo` (RGB 0–1), `textureFile1`/`2` 78, `size {x y}`, `effectFile = progress`, `horizontal` 7 |
| `corneredTileSpriteType` | 36 | 37 | 27 | `textureFile`, `borderSize {x y}` 33, `size {x y}` 26, `effectFile` 6 |
| `maskedShieldType` | 23 | 23 | 17 | `textureFile1` (shield frame), `textureFile2` (mask), `textureFile3` (overlay strip), `noOfFrames`, `effectFile = maskedflag*`, `overlay_frames_per_row`/`overlay_rows` 21 |
| `frameAnimatedSpriteType` | 17 | 11 | – | `noOfFrames`, `animation_rate_fps`, `looping`, `play_on_show`, `pause_on_loop` |
| `PieChartType` | 4 | 4 | 2 | `size` (a radius-like number) |
| `LineChartType` | 2 | 2 | 1 | `size {x y}`, `linewidth` |
| `cursor_offset` | 1 | 1 | 1 | `{ -5 -4 }` |
| `pdxmesh`, `pdxparticle`, `animatedmaptext`, `arrowType`, `tradeRouteType` | 497/11/7/4/1 | – | 7 (`animatedmaptext`) | 3D and map objects, out of scope for window previews |

- Vanilla defines 7393 sprite names. 72 names are defined twice **[F]**, and
  which definition wins is **unverified**.
- 11 sprite references in vanilla `.gui` resolve to no definition **[F]**.
- Sprite references in `.gui`: `spriteType = "…"` (2498) and
  `quadTextureSprite = "…"` (2161). The wiki says `quadTextureSprite` is for
  dynamic or multi-frame sprites **[W]**. Both point into the same name
  space **[F]**.

### Which widget uses which sprite kind (vanilla) [F]

- Icons: 1520× a single-frame `spriteType`, 221× a sprite with more than 4
  frames (the code picks the frame), 121× a `progressbartype`, 70+26× a
  `maskedShieldType`, 18× a `frameAnimatedSpriteType` and 11× a
  `PieChartType`.
- Buttons: 624× a plain `spriteType`, 568× a `textSpriteType`, 233× a sprite
  with `buttonstate`, 110×+53× sprites with 2 frames, 96×+17× a
  `maskedShieldType` and 52×+7× a `corneredTileSpriteType`.
- Check boxes: 1-, 2- or 4-frame sprites (the frame shows the state).

### Frames and shaders

- `noOfFrames` cuts the texture into equal horizontal cells **[H]**, the
  standard Clausewitz convention, and `frame` in `.gui` picks one. Whether
  `frame` counts from 0 or 1 is **unverified**: values 1–17 occur, never 0.
  `overlay_frames_per_row`/`overlay_rows` turn a strip into a grid for flags.
- `effectFile = "gfx/FX/x.lua"` names a shader. No `.lua` shaders exist, but
  `gfx/FX/x.shader` does **[F]**, and the exe holds both `.lua` and
  `.shader` strings **[S]**. The engine therefore swaps the extension
  **[H]**, which is effectively certain.
- Values used: `buttonstate` 356, `progress` 91, `buttonstate_nodowneffect`
  41, `buttonstate_linear` 32, `maskedflag` 22, `buttonstate_onlydisable` 12,
  `gui_rendertarget.shader` 4, `button_overlay` 1, `maskedflag_greydown` 1
  **[F]**.
- `buttonstate.shader` **[F]**:
  - It defines the effects `Up`, `Over`, `Down`, `Disable`, `GreyedUp`,
    `GreyedOver` and `GreyedDown`. Over adds 0.1 to RGB, Down subtracts 0.1,
    and Greyed converts to luminance (0.2127/0.7152/0.0722). Everything is
    multiplied by a `Color` constant, and blending is `src_alpha` /
    `inv_src_alpha`.
  - Its sampler uses **point** filtering (`MagFilter`/`MinFilter = Point`,
    clamp). The `_linear` variant uses linear filtering.
  - The code picks the effect from the button state and moves the texture by
    an `Offset`, which is how frames are selected.
- `progress.shader` draws texture or colour one where
  `u <= CurrentState` and texture or colour two elsewhere, with a vertical
  variant **[F]**. `CurrentState` comes from code.
- Text is drawn with `text.shader` (linear sampling) **[F]**.
- Sprites without `effectFile` use a default shader, **unknown** which one.
  `simple.shader` is a candidate **[H]**.
- A faithful renderer must copy the filtering, point versus linear, per
  shader.

### Textures [F]

Under `gfx/interface/`:

| Format | Count |
| --- | ---: |
| DDS, uncompressed 32-bit | 6857 |
| DDS, DXT5 | 112 |
| DDS, DXT3 | 93 |
| DDS, DXT1 | 28 |
| DDS, 24-bit | 18 |
| TGA, uncompressed 16-bit | 171 |
| TGA, uncompressed 24-bit | 95 |
| TGA, uncompressed 32-bit | 12 |
| TGA, RLE (24- and 32-bit) | 23 |
| TGA, colour-mapped 8-bit | 3 |

1066 of the DDS files have mipmaps. `.gfx` paths use `/` or `//` as the
separator, and one path ends in `.ddr` (a typo).

## 4. Fonts

- `bitmapfonts = { bitmapfont = { name path color [border_color] [effect]
  [textcolors] } textcolors = {…} }` sits in `core.gfx` and `chatfonts.gfx`.
  Vanilla defines 47 fonts, P2KUIE and ANB2K 53 each **[F]**.
- `path` has no extension (`gfx/fonts/garamond_16`), and `color` is
  `0xAARRGGBB`.
- The `.fnt` files are AngelCode BMFont **text**: `info`, `common
  lineHeight base scaleW scaleH`, `char id x y width height xoffset yoffset
  xadvance`, `kerning first second amount`. All 24 vanilla fonts have
  kerning except `tahoma_20_bold` (from 66 pairs in `Arial12` to 4820 in
  `vic_36`) **[F]**. `charset="ANSI"` and char ids up to 255 mean
  Windows-1252.
- Vanilla `.fnt` files have no `page` line. The mod fonts have
  `page id=0 file="cg_12b_0.dds"`, yet the file on disk is `cg_12b.dds`. The
  game finds the texture by the `path` base name and ignores the `page` line
  **[H]**, which is strong: the mod works.
- Several vanilla fonts ship both `.dds` and `.tga` pages, and which one wins
  is **unverified**.
- The mods replace fonts by remapping names to new files: P2KUIE `vic_18`
  points to `gfx/fonts/cg_16b`. A widget's `font` therefore resolves through
  the active mods' `bitmapfonts`.
- `textcolors` maps one letter to RGB 0–255 for `§` codes:
  - global in `core.gfx` (14 letters in vanilla, more in the mods);
  - overridable per font (for example `null_font` redefines `G R Y H T`, and
    16 vanilla fonts have their own `textcolors`).
- `border_color` (outline) and `effect = no` occur once each.

## 5. Text and formatting

- In `.gui`, `text` and `buttonText` hold a localisation key or a literal.
  In vanilla, 1655 values are single tokens, 171 are literals with spaces and
  740 are empty. None contains `$` or `[` **[F]**. The game looks the token
  up in localisation and falls back to the literal **[H]**.
- Localisation (`localisation/*_l_english.yml`, UTF-8 with BOM) holds the
  markup **[W]**. Counts in vanilla English **[F]**:

  | Markup | Meaning | Count |
  | --- | --- | ---: |
  | `§X … §!` | colour by `textcolors` letter, nestable | 23101 `§!`; `§Y` 18230, `§G` 3572, `§R` 1451, `§W` 993, `§M` 544, `§T` 168, `§O` 112, `§g` 52, `§J` 34 |
  | `£key£` | inline icon: sprite `GFX_text_<key>` (the exe has the string `GFX_text_` **[S]**, and `texticons.gfx` defines `GFX_text_yes` for `£yes£`) | 1695 |
  | `$KEY$`, `$KEY\|fmt$` | value from code, with format flags (`Y` colour, `%`, `+`, `=`, digits for decimals) | 12543 plain, 3441 `\|Y` |
  | `[Scope.Command]` | data function such as `[Root.GetName]` | 20013 |
  | `@TAG`, `¤` | flag of a country, ducat icon **[W]** | not counted |
  | `\n` | line break | — |

  Some `£` keys resolve to nothing: `£ME_siege_text_icon£` is used 192× and
  defined nowhere **[F]**. The renderer needs a policy for missing icons.
- Widget-side text rules:
  - `format` aligns horizontally;
  - `vertical_alignment` (`top`/`centre`/`bottom` per the EU4 wiki,
    `top`/`bottom` in the exe) aligns vertically;
  - `fixedsize = yes` truncates to the box **[W]**;
  - `truncate` (89×) has an effect the wiki calls unknown;
  - `text_color_code` sets a default colour letter.

  How wrapping, ellipsis and line height work against `maxWidth`/`maxHeight`
  must be measured in the game.

## 6. What the game's code decides at run time

Verified or strongly evidenced:

- **Which widgets exist and are shown.** Widgets are looked up by name:
  - **[S]** 1775 of 1981 button names, 1980 of 2489 text box names, 1712 of
    2347 icon names, 221 of 241 list names and 522 of 623 root window names
    also occur as strings in `eu4.exe`. This is a proxy: short names such as
    `title` can match unrelated strings.
  - **[L]** Code hides and shows widgets (visibility byte `+0xC5`).
  - **[F]** Mods park widgets they do not want at `x = 99512` instead of
    deleting them, because the code expects the names.
- **List, grid and overlapping-box contents**: entry templates, count, text
  and positions while scrolling **[L]** **[W]**.
- **Text**: almost every text box is overwritten with game data (event
  options, dates, values). Button and text-box strings sit at fixed fields
  that code writes **[L]**.
- **Frames and values**: icon frames (for example `speed_indicator`, 10
  frames), progress bar `CurrentState`, pie and line charts, shields and flags
  (masked with the country's flag texture), and button states (Up, Over,
  Down, Disable) **[F]** **[L]**.
- **Position at run time**: windows with `show_position` and `hide_position`
  slide between the two (`animation_time` in ms), and moveable windows are
  dragged. Some windows open at a position the code picks (tooltips, popups)
  **[H]**.
- **`scripted` widgets** (mods) are shown, hidden or given frames by
  `common/custom_gui` triggers against the game state **[W]**.

## 7. Consequences for an offline renderer

Hardest first:

1. **Code-filled content is most of the window.** A layout preview can draw
   the skeleton. A faithful one needs Sample data for list entries (with the
   template name per list), text values, frames, flags and visibility. None
   of these can be derived from the files.
2. **Text layout fidelity.** It takes BMFont kerning, Windows-1252, `§`
   colours, `£` icons inline, `$`/`[]` substitution, wrapping and truncation
   under `maxWidth`/`maxHeight`/`fixedsize`/`truncate`, plus the unknown
   height rule. Only the game can settle the exact metrics.
3. **Resolution-dependent layout.** `if_resolution` blocks and percentage
   sizes, and probably `game_ui_scale`, make a preview resolution-specific.
4. **Semantics not yet pinned down.** Open items: the anchor box of children,
   `origo`, how `CENTER_*` works with odd sizes, the pivot of `scale` and
   `rotation`, `frame` base, which widgets clip, and fallbacks for bad enum
   values (`center` versus `centre`, `left`, `UPPERL_LEFT`).
5. **Shaders and sampling.** The renderer must reproduce `buttonstate*`,
   `progress`, `maskedflag*` and `text`, with point or linear sampling per
   shader, alpha blending and the per-font colour.
6. **Formats.** It needs DDS (uncompressed, DXT1/3/5, mipmaps) and TGA
   (16/24/32-bit, RLE, colour-mapped). The parser must be tolerant (bad
   braces, `@` constants, case-insensitive keys) and must resolve duplicate
   sprite names in load order.

## 8. Open questions

- What anchor box does a child's `orientation` use: the parent's `size`, the
  parent's sprite, or the screen for some kinds? And does a child inherit the
  parent's orientation (as the wiki says)?
- How are `origo`, `centerPosition`, `clipping` and `scale` on windows
  handled in EU4, and which widget kinds honour each?
- What is the text height and wrap rule (`DateText` 228×38 versus
  `maxHeight = 47`), what does `truncate` do, and does `fixedsize = no`
  grow the box?
- Is `frame` 0- or 1-based?
- Which duplicate sprite or font definition wins, and in what file order
  (alphabetical, then mods)?
- Which shader do sprites without `effectFile` use?
- What happens with `game_ui_scale` ≠ 1?
- Which font page wins when `.dds` and `.tga` both exist?

These are cheap to settle with a few live captures (Tongs widget tree plus
screenshots) and belong in the Precision corpus work.

## Sources

- Game files (read only): `interface/*.gui`, `interface/**/*.gfx`,
  `gfx/fonts/*.fnt`, `gfx/FX/*.shader`, `localisation/*_l_english.yml`,
  `common/custom_gui/`, `settings.txt` (user directory).
- Mods (read only): Proper-2K-UI-Enhanced @ `9c73139`,
  eu4-anbennar-proper-2k-ui @ `58554a91`, DK-2KUI @ `5a3f2b9`.
- eu4-engine-lab: `docs/reverse-engineering.md` ("Konsola, klatka i drzewo
  GUI", "Menu, wczytywanie i widżety na żywo"); `tongs/docs/design.md`
  ("Hardening pass", widget fields and coordinates); Tongs branch
  `research/widget-tree`, `docs/research/widget-tree.md` (position, clip
  rectangle, hit testing).
- `eu4.exe` 1.37.5 string table, read statically.
- Wikis:
  - [EU4 Interface modding](https://eu4.paradoxwikis.com/Interface_modding)
  - [EU4 Localisation](https://eu4.paradoxwikis.com/Localisation)
  - [HOI4 Interface modding](https://hoi4.paradoxwikis.com/Interface_modding),
    a sister game on a newer engine; used only for keys EU4 content lacks
  - [CK2 Interface modding](https://ck2.paradoxwikis.com/Interface_modding),
    which had nothing beyond examples
