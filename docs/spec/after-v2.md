# After v2

Etch 2.0.0 is the scope of the [v2 specification](v2.md), frozen at that
release on 1 November 2026. This file is the living list of what it left: the
work v2 put out of scope (its section 16), what the 2.0.0 trial found but did
not fix ([docs/release-2.0.0.md](../release-2.0.0.md), "The trial" and "Live
game"), the open issues and the open points, those of v2's section 17 and those
of the offline renderer that [after-v1.md](after-v1.md), the record of 1.x,
kept until 2.0.0. When implementation learns something that changes an entry, a
pull request changes it here, until the next version gets its own
specification.

## Not in v2

From section 16 of the v2 specification, with v1's entries that v2 did not take:

- **Editing in the preview** (drag, an attribute panel writing back to `.gui`).
- **Headless mode for CI:** diagnostics and precision checks without VS Code.
  `core` stays free of `vscode` so the mode remains possible.
- **Faithful offline rendering:** sprite, frame, font and colour per widget
  from the game (about 1–2 weeks of reverse engineering), only if pixel diffs
  prove too weak to diagnose corpus failures.
- **UI scale other than 1.0.**
- **Ironman and other binary saves**, melting or writing saves: only if
  Paradox publishes or licenses a token table.
- **Deriving scripted groups** of a profile from `custom_window` and
  `potential`, and their labels; a command that writes a profile skeleton.
- **Profiles for more windows and other big mods** (Dwarven Knowledge and
  others), and captures of the state tab, `colonisationpanel` and Anbennar's
  `aPUI_*` windows.
- **More in a live snapshot:** code-set sprites and frames (below), tooltips
  (with a new snapshot `formatVersion` once `tongs.ui` reads them), and
  exporting a snapshot.
- Checking the **3840×2160** preview resolution against the game (below).
- **A media refresh** showing the live game and a popular view, made with
  Etch's own demo mod: a release step after v2.

## Left open by the 2.0.0 trial

- **Code-set sprites and frames.** The game's code sets the terrain picture,
  the shields' flags, the trade goods, the frame of a building under
  construction and the locked slot; a live snapshot has only the fields of
  `tongs.ui` version 1, so the preview drawn from it differs there (v2
  section 7, "Not in v2"). Seen in both trial runs against the game, on
  `cffbf88` and `c2cf182`.
- **Reopening or reselecting the province** after a restart or a reload (H8).
  The plugin does not call the game's selection `0x139C830` yet; the recorded
  workaround is that Etch says the view was not reopened (docs/live-game.md,
  "Reopening the view"). Tongs' `province open` selects a province by id and
  waits for its view, and the corpus driver uses it since
  [etch#221](https://github.com/happy-dwarf-team/etch/issues/221); the plugin
  reads Tongs only through `tongs.ui`. The trial also found that the game's own
  `reload provinceview.gui` with the province view open clears the province's
  name in its header until the next reload (3 of 3 provinces, Etch closing and
  hiding nothing); reselecting the province after a reload would hide it.
- **An uncolonised province.** That the game shows `colonisationpanel` for land
  without a city is read from `0x1347A50` (etch#155) and the profile's link
  draws it; no live capture of one was taken, so whether any of `provinceview`
  stays with it is open.
- **The `_not_exploitable` base values.** Without the DLC Cradle of
  Civilization the game hides the three exploit buttons and moves the base
  values to `development_value_vertical_position_not_exploitable`; the vanilla
  profile's `exploit` selector follows it, read from the code only, as every
  corpus save has the DLC and no capture without it was taken.
- **Lists without sample entries in `provinceview`:** the province modifiers,
  whose placement from `province_modifier_start` matches the captures by no
  rule found, and the history list, whose entry template is in no `.gui` of the
  window.

## Done since 2.0.0

- **A long text in a `fixedsize` box,** left open by the trial: the game cuts
  it with " ..." (`East Dam ...` for the culture "East Damerian" in the
  province view of P2KE Patch - Anbennar), and the preview wrapped it over
  the religion below. The rule is read from `eu4.exe` (the font's fit
  `0x159F510`, which the text node calls only for a `fixedsize`
  `instantTextBoxType`) and the offline renderer applies it, with
  `truncate = no` (v2 section 3).

## Open issues

- [etch#97](https://github.com/happy-dwarf-team/etch/issues/97): a recipe that
  opens an event for the corpus. The event window gates no release until it
  has one, in any playset.
- [etch#163](https://github.com/happy-dwarf-team/etch/issues/163): 3840×2160 is
  in the corpus and the preview but unconfirmed, as no window of the lab holds
  a 2160-pixel client area; it gates nothing and the preview marks it as not
  measured against the game.

## Open points

Small unknowns, none worth an issue yet.

### Live game and pick mode

From section 17 of the v2 specification until 2.0.0, with what the release
record left of the reload policy and two points of after-v1.md about the game's
process:

- The vanilla province view's reload misses its 150 ms target with the stale
  check's reads: 168/181 ms (median/p95) (docs/budgets.md, M8).
- The private profile keeps one `save games/` for every playset, so
  **Continue** may offer another playset's save.
- The game Exit to Main Menu starts again ran without Anvil in the M8 run, so
  the live game closes it and stops instead of adopting it.
- Real hardware input in pick mode: checked with posted messages (M9) and with
  `SendInput` (the activation click and the trial in VS Code), never with a
  hand on the mouse. VS Code coming forward under the default
  `ForegroundLockTimeout` and `Ctrl+Shift+E` with the province view on screen
  held in M9 (docs/pick-mode-checks.md).
- Whether `GetKeyState` alone tracks Ctrl and Shift with a real keyboard (the
  plugin also tracks them from key messages, which is what matched in M9).
- Esc in pick mode with a real key: a posted Escape closed nothing, with pick
  mode on or off.
- The time from the save in VS Code to the plugin's call (the watcher and the
  pipe): not measured yet.
- Panel rebuild leaks beyond 20 reloads of one file.
- Whether `reload assets` reloads sprite types; until it is checked a `.gfx`
  change is a planned restart.
- Starting the player's `eu4.exe` directly, without Steam, beside the live
  game (not tried, H11).
- The game date in a live snapshot needs `anvil-game.game` to offer it.
- Reload policy rows not run live: `DeclareWarDialog` (an on-demand window
  closed before a reload), texture reloads, ironman and multiplayer
  (docs/release-2.0.0.md, "Live game").
- Which of `-userdir` and `userdir.txt` wins when both are set; two game
  instances at once (etch#21).
- The one-off 164 hidden `hints_test` windows after the first `reload` in the
  main menu (etch#22).

### Offline renderer

From [after-v1.md](after-v1.md#open-points), which kept them from 1.0.0 until
2.0.0 (its points about the game host are not carried over: the game host left
with ADR 0005), and the one the release record left of the profiles:

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
  texture or colour; a shield without a flag shows `textureFile1`. `rotation`
  and `origo` are not applied, and `left`, `right` and
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
- Which monitor the game takes its native resolution from when there are
  several: the preview's "native" is the monitor that shows VS Code (etch#38).
- The trade power's rounding: the game cuts the save's `trade_power` 3.19 to
  3.1 in Heroes' Rest, and a profile's one decimal rounds it to 3.2; the other
  provinces' values round and cut alike (docs/release-2.0.0.md, "Profiles").
