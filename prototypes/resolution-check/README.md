# PROTOTYPE: capture at client areas smaller than the monitor (etch#18), throwaway, never merged

Question ([etch#18](https://github.com/happy-dwarf-team/etch/issues/18)): for
1280×720, 1366×768, 1600×900, 1680×1050, 1920×1080 and 3440×1440, does the
game start with exactly that client area, does it pick the `if_resolution`
branch the client height implies, and are Tongs' screenshots identical across
two shots and identical to the same widgets at 3440×1440 where the layout does
not change?

## What is here

- `host.ps1 -Action Prepare` builds a vanilla game host install under
  `<lab>/work/etch18-host`, as etch#21's prototype does: a junction copy of the
  game with Anvil 1.2.0, anvil-game, Bellows, Tongs `main` (`1b456d1`,
  tongs#61 and tongs#63) with etch#21's main-menu console patch, and
  etch-capture. Its private profile (`-userdir`) has the lab's start-up
  baseline `settings.txt` and only the overlay mod, which holds the probe
  window. It saves the named baseline `baselines/settings-baseline.txt`.
- `host.ps1 -Action Run -Width W -Height H -Mode windowed|borderless` runs one
  verified session under the lab's procedure:
  - preflight: the Lasso rule, both EXE hashes and no running game;
  - named variants `settings-WxH-mode.txt` and `pdx-settings-WxH-mode.txt` of
    the named baselines;
  - start with `Start-LabGame` (suspended, mask 1-7);
  - readiness from `anvil-game.ready` and `Running application` in
    `system.log`;
  - `probe.mjs`;
  - close only through `Stop-VerifiedSession`;
  - a diff of the variants (only `refreshRate` and `graceful_exit` may
    change), then the baselines restored and hash-checked;
  - the player's profile snapshotted before and after.
- `probe-gui.ps1` writes the probe window `etch_res_window`. It is full screen
  and anchored top-left over an opaque black backdrop (etch#22's scaled
  icon). Each vanilla height threshold T (750, 868, 900, 1048, 1052, 1080) gets
  two 32 px markers:
  - `etch_res_max_T` moves from y 100 to y 140 when `max_height = T-1`
    applies;
  - `etch_res_min_T` moves from y 200 to y 240 when `min_height = T`
    applies.

  It also holds static widgets inside 1280×720: a vanilla button with
  localised text, a vanilla icon, a text box, a cornered-tile panel and an
  alpha ramp.
- `probe.mjs` reads Tongs `window`, the main menu's own
  `if_resolution` widgets (`frontend.gui` branches at `max_height = 1079`) and
  two menu screenshots. It then opens the probe with `console window open`,
  reads its widgets and takes two Tongs screenshots and one back-buffer
  read-back (etch-capture).
- `analyze.mjs` compares the screenshots. It masks the green FPS counter in
  the top-right corner (about 30×10 px at every size).

## Runs (2026-10-21)

EU4 1.37.5, SHA-256 `9AD3EFE1…D771A` (original and copy); vanilla, all DLC;
UI scale 1.0; `multi_sampling=8`; DPI 96; process mask 1-7, Lasso rule
`eu4.exe,0,1-7` untouched. Every run: closed after the PID, path and creation
time were verified; baselines restored (hash-checked); the player's profile
unchanged; no `version.dll` or `anvil/` in the Steam folder; no
`CrashReporter.exe` or restarted game.

| Run | Requested | Set in | Client area (Tongs `window`) | Window at | Ready |
| --- | --- | --- | --- | --- | --- |
| r1 | 3440×1440 borderless | `settings.txt` (first start) | 3440×1440 | 0,0 | 18.7 s |
| r2 | 1920×1080 windowed | `settings.txt` only | **3440×1440** (ignored) | 0,0 | 13.3 s |
| r3 | 1920×1080 windowed | `pdx_settings.txt` + `settings.txt` | 1920×1080 | 760,180 | 13.1 s |
| r4 | 1920×1080 borderless | `pdx_settings.txt` + `settings.txt` | **3440×1440** | 0,0 | 12.8 s |
| r5 | 1680×1050 windowed | both | 1680×1050 | 880,195 | 12.5 s |
| r6 | 1600×900 windowed | both | 1600×900 | 920,270 | 12.7 s |
| r7 | 1366×768 windowed | both | 1366×768 | 1037,336 | 12.5 s |
| r8 | 1280×720 windowed | both | 1280×720 | 1080,360 | 12.7 s |

## Results

- **Where the size is set.** At its first start the game writes
  `pdx_settings.txt` into the profile (`Graphics`: `fullscreen_resolution`,
  `windowed_resolution`, `display_mode`). From then on that file decides:
  with only `settings.txt` changed (r2) the game started at 3440×1440 and
  wrote 3440×1440 borderless back into `settings.txt`. `display_mode` takes
  `windowed`, `borderless_fullscreen` or `fullscreen` (strings in `eu4.exe`).
  Exclusive `fullscreen` was not tried, because it changes the monitor's mode.
- **Borderless is always the monitor's size** (r4): `windowed_resolution`
  1920×1080 with `borderless_fullscreen` gave 3440×1440.
- **Windowed gives exactly the requested client area** at every size (r3,
  r5–r8). `system.log` reports the same `Resolution=`, and the window is
  centred on the monitor.
- **`if_resolution` follows the client height.** At each size the markers
  show exactly the band the height implies, for both `max_height` and
  `min_height`:

  | Size | Branches that applied |
  | --- | --- |
  | 3440×1440, 1920×1080 | every `min_height` (≥ 1080) |
  | 1680×1050 | `min_height` ≤ 1048, `max_height` ≥ 1051 (band 1048–1051) |
  | 1600×900 | `min_height` ≤ 900, `max_height` ≥ 1047 (band 900–1047) |
  | 1366×768 | `min_height` 750, `max_height` ≥ 867 (band 750–867) |
  | 1280×720 | every `max_height` (< 750) |

  The main menu's own `frontend.gui` does the same. `version_background` is
  at the panel's −32 at 1080 and above, and at +10 below 1080 (1680×1050 and
  smaller). The bands 868–899 and 1052–1079 have no corpus size.
- **Probe window: pixel-exact at every size.**
  - The two Tongs screenshots are identical. Each is also identical to the
    back buffer that etch-capture read back in `Present`, so `PrintWindow`
    shows exactly the rendered frame.
  - Every probe widget (button and text, vanilla icon, text box, cornered-tile
    panel, alpha ramp over black) and the whole 1280×430 area under the
    markers are identical to 3440×1440, 0 differing pixels.
  - The markers are identical too, compared at their branch positions.
- **Main menu: two screenshots are not identical at any size, 3440×1440
  included.** The menu's background is animated, and 0.8–4.8 million pixels
  differ between two shots 0.3 s apart.
  - Inside the menu's widget rects, the changing pixels are only where the
    background shows through: alpha below 255, which ADR 0002 already masks.
    That covers the semi-transparent `version_background` and social
    `background` and the `frontend_links` area. The 3–8 changing edge pixels
    of the exit and tutorial buttons are probably semi-transparent too
    (hypothesis: their alpha was not read).
  - Opaque widgets are stable across shots: the settings, credits and social
    buttons, and `version_label`.
- **Main menu across sizes.** Every pixel that is stable in both shots of
  both runs was compared with 3440×1440:
  - At 1920×1080 the menu widgets are identical (one edge pixel of the exit
    button differs in r2).
  - Below 1080, the widgets whose `.gui` branch changes differ, as expected:
    `version_label`, the login and Epic buttons (y 8 instead of 7), and the
    exit button, which the social background (moved 73 px left) now overlaps.
  - Widgets with an unchanged layout (settings, credits, tutorial) are
    identical.
- **Start-up:** 12.5–13.3 s to `anvil-game.ready` and `Running application`
  with a warm profile and Bellows, 18.7 s at the profile's first start.

## What this says for the corpus

- All six sizes can be captured pixel-exact in the lab. 1280×720, 1366×768,
  1600×900, 1680×1050 and 1920×1080 are windowed client areas. 3440×1440 is
  the monitor's size, borderless.
- To set a size, the driver writes `pdx_settings.txt` (`windowed_resolution`
  = `WxH`, `display_mode` = `windowed`, or `borderless_fullscreen` for the
  monitor's size) and `settings.txt` (`graphics.size`, `borderless`). Both go
  into the private profile as named variants of named baselines. Changing
  `settings.txt` alone does nothing once the game has started in that profile.
- Windows display settings are never touched. Exclusive full screen is not
  used.
- Two-shot identity cannot be required on the whole screenshot of a view over
  the animated main menu (the frontend views). It can be required on the
  pixels the comparison uses: unmasked pixels with alpha 255 under the
  compared widgets. The opaque widgets were stable in every run.
