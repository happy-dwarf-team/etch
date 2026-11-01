# After v1

**Status: final.** Since 2.0.0 (1 November 2026) [after-v2.md](after-v2.md) is
the living list; it took every entry below that is still open. This file stays
as the record of what 1.x left, as it stood at 2.0.0, and is no longer changed.

Etch 1.0.0 is the scope of the [v1 specification](v1.md), frozen at that
release. This file was the living list of what it left: the work v1 put out of
scope, what the v1 milestones found but did not plan, the open issues and the
open points. The [v2 specification](v2.md) took its scope from this list;
entries it settles say so, and the rest moved to after-v2.md at 2.0.0.

## Not in v1

From section 14 of the v1 specification:

- **Sample data** for code-filled windows: format, who writes it, and how it
  stays honest against the game. *Taken by v2 (v2.md sections 4 and 5).*
- **Editing in the preview** (drag, an attribute panel writing back to `.gui`).
- **Headless mode for CI:** diagnostics and precision checks without VS Code.
  `core` stays free of `vscode` so the mode remains possible.
- **Live game windows in the game host:** the game's own window instances with
  code-filled content, which need a recipe per window and a way to refill
  content after a reload. *Taken by v2 as the live game, without the game
  host (ADR 0005, v2.md section 6).*
- **Faithful offline rendering:** sprite, frame, font and colour per widget
  from the game (about 1–2 weeks of reverse engineering), only if pixel diffs
  prove too weak to diagnose corpus failures.
- **UI scale other than 1.0.**

## Found in v1, not planned

- **Recipes per playset.** The corpus recipes start from the release
  playsets' save, so the Anbennar report has no `province` and
  `diplomacy-dialog` captures: Verne in 1444 has neither the outliner entry nor
  the diplomacy row they click. The manifest has no recipe per playset
  (etch#55, docs/game-host.md). *Taken by v2 (v2.md section 11).*
- **Game host job time.** The 150 ms target of v1 section 7 is met for small
  windows, not for full-screen crops, nor for the Anbennar playset's
  `countrydiplomacyview` (215–224 ms); a root's job right after another window
  of the same file took 321–582 ms, not looked into (etch#53, etch#57,
  docs/budgets.md). *Superseded by v2: the game host leaves (ADR 0005).*
- **Game host start with Anbennar:** about 40 s to ready and 36 s to restart,
  twice vanilla's (etch#57). *Superseded by v2: the game host leaves
  (ADR 0005); the live game's restarts have no time target.*

## Open issues

- [etch#96](https://github.com/happy-dwarf-team/etch/issues/96): draw
  `buttonText` glyph edges as faint as the game does. *Fixed in v2: the game
  bakes the text of a button on a `textSpriteType` into a copy of its texture,
  blending alpha with the colour factors, and the renderer does the same; the
  corpus has no known deviation left.*
- [etch#97](https://github.com/happy-dwarf-team/etch/issues/97): a recipe that
  opens an event for the corpus. The event window gates no release until it
  has one.

## Open points

Small unknowns, none worth an issue yet (section 15 of the v1 specification
until 1.0.0):

- The time of the `workspace.encode` path for encodings other than UTF-8 and
  Windows-1252 (etch#15).
- What the game does with a UTF-8 BOM in a `.gui` file (etch#15).
- The default shader for sprites without `effectFile`; it starts as linear
  (ADR 0001). Read in `eu4.exe` since (2.0.0 trial): a sprite definition
  without one loads `gfx/FX/buttonstate.lua`, `buttonstate_linear.lua` at
  another UI scale (0x15DA600); the preview uses it for disabled buttons.
- Layout rules not yet checked against a capture (etch#34): a window's
  `background` names the child painted behind the others; a cornered-tile
  background, and a list's `background` sprite, stretch over their container;
  cornered tiles repeat their edges and middle; `frame` counts from 1;
  `CENTER` anchors round down; a `scale`d sprite keeps fractional pixels; an
  open window stands at `show_position`; an empty progress bar shows its second
  texture or colour; a shield without a flag shows `textureFile1`. `rotation`,
  `origo`, `fixedsize` and `truncate` are not applied, and `left`, `right` and
  `UPPERL_LEFT` orientations anchor upper left with a diagnostic.
- Which way `progress.shader` runs `v`: it negates `v` and samples with
  wrapping, which keeps textures upright and fills vertical bars upwards only
  if the game's quads run `v` from 1 at the top. The renderer assumes so.
- H2 of etch#16 (whether the screen size behind `if_resolution` stays the same
  when a window moves) and H6 (PhysFS precedence of later mods).
- Which value the game shows for a localisation key defined in several files.
  Etch assumes that a file hides one at the same path in an earlier layer,
  that `localisation/replace/` wins over the rest, and that otherwise a later
  layer, then a later path, wins (etch#32). Also unchecked: whether the game
  reads `.yml` files without a language suffix or without a BOM, and what it
  does with escapes other than `\n`, `\t`, `\"` and `\\`.
- Which definition the game uses when a sprite or font name is defined twice,
  and whether it compares those names without regard to case. Etch takes the
  first in load order (the files of a folder sorted, then its subfolders), the
  game's rule for `.gui` names at startup (etch#16), and reports a reference
  that matches only when case is ignored (etch#33).
- Texture paths: a `.tga` path falls back to the `.dds` of the same name, as
  584 vanilla sprites need; which one the game takes when both exist (7
  vanilla paths) is unchecked. Also assumed: the last of a repeated key in one
  block counts, and `if_resolution` properties apply where the block stands
  in the file (etch#33).
- The source of the FPS counter in the top-right corner (etch#22). *Superseded by v2: the game host leaves (ADR 0005).*
- Which monitor the game takes its native resolution from when there are
  several: the preview's "native" is the monitor that shows VS Code (etch#38).
- Windows with an `orientation` other than upper left inside the backdrop
  wrapper (etch#22); a `CENTER` dialog drew where its original does
  (etch#118). *Superseded by v2: the game host leaves (ADR 0005).*
- What a dialog's `shieldtype` draws outside the main menu, where the game
  host leaves it out (etch#118), and whether any other behaviour of the
  dialog class (its `LeftStar` and `RightStar` handling on show) differs from
  a `windowType` in a mod's dialog. *Superseded by v2: the game host leaves (ADR 0005).*
- Nested windows that the game's own code hides in game, such as
  `vassal_select_window` in `countrydiplomacyview` or the court view's advisor
  selection, show in the main menu copy over the window they belong to, and
  buttons show the frames the main menu gives them (etch#126, etch#53); whether
  the preview should hide them is open. Against the corpus captures 2 of 26
  views pass in the game host, all 26 in the offline renderer. *Settled by
  v2: the preview shows the view a window profile names (v2.md section 4).*
- A top-level `parent` on the previewed window names a sibling once the
  wrapper nests it; no file of the corpora has one, and the preview copy
  warns (etch#47). *Superseded by v2: the game host leaves (ADR 0005).*
- Why `ages_view` draws up to 126 pixels 1 apart between two opens, and why
  a closed `goto_box` still shows in the next capture and leaves its caret
  blinking (etch#119). *Superseded by v2: the game host leaves (ADR 0005).*
- Which of `-userdir` and `userdir.txt` wins when both are set; two game
  instances at once (etch#21).
- The one-off 164 hidden `hints_test` windows after the first `reload` in the
  main menu (etch#22).
