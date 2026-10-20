# PROTOTYPE: game reload probe (etch#6) — throwaway, never merged

Question ([etch#6](https://github.com/happy-dwarf-team/etch/issues/6)): can a
running EU4 1.37.5 show a changed window through an Anvil plugin without
crashing; how long does a reload take, which windows survive it, what goes
stale?

The plugin used is Tongs 0.12.0 (an Anvil plugin that runs console commands
through the game's dispatcher on the main thread, via `anvil-game`'s
`run_on_main_thread`). A dedicated Etch plugin would make the same calls, so
it was not written. `probe.mjs` talks to Tongs' pipe from Node with
`node:net`, the way the extension would talk to the game host's pipe.

## How it was run

- `session.ps1 -Action Start|Stop -RunName …`: creates a temporary mod
  `etch-reload-probe` with unchanged vanilla copies of `goto.gui`,
  `outliner.gui`, `topbar.gui`, `countrydiplomacyview.gui` and
  `gfx/interface/topbar_UL.dds`, and enables it alone in `dlc_load.json`
  (restored afterwards). It then starts the EU4 engine lab's
  `scripts/anvil-play.ps1` (Anvil 1.0.0 + `anvil-game` + Tongs with input and
  game calls, the lab's Russia 1719 save via `continue=`). The lab script
  checks the EXE hash and the Process Lasso rule, closes the game only after
  verifying the session, restores `settings.txt` and removes Anvil.
- `node probe.mjs <phase> <runDir>` with the phases `check`, `cycle`,
  `newfile`, `hud`, `texture`, `gfx`, `topbar` (run 1), `diplo` and `topbar2`
  (run 2). Each request and answer goes to `probe.jsonl`.
- 2026-10-20, EXE SHA-256 `9AD3EFE1…771A`, 3440×1440 borderless, UI scale
  1.0, about 75 frames per second while paused. Vanilla interface (Proper 2K
  UI Enhanced, which overrides every probed file, was off for these runs).

## Results

Times: `run` is the time on the main thread measured by Tongs. `queued` is
the wait for the next frame (8–21 ms). `gap` is the longest gap between
frames around the call.

| Case | Result | run | gap |
| --- | --- | --- | --- |
| `window close goto_box` → `reload goto.gui` → `window open goto_box`, ×5 | new layout every time (`provinces` x 176 ↔ 216 as edited) | reload 6–8 ms, open/close 0–4 ms; 46–52 ms client round trip for the three calls | 22–24 ms |
| a `.gui` file created while the game runs (`etch_probe.gui`) | `window open` fails before the reload and opens after it (H6 holds) | 6–7 ms | — |
| `reload outliner.gui` (registered; rebuilt by the in-game idler) while visible, ×5 | new layout; the rebuilt HUD windows replay their show animation (250 ms), so reads right after the reload see moving positions | 54–91 ms | 78–116 ms |
| `reload countrydiplomacyview.gui`, largest vanilla file (148 KB), with `window open countrydiplomacyview` open | no crash; hover, close and a full tree read later were fine | 22 ms | 49 ms |
| country view, diplomacy tab, after that reload | **follows the reload**: new layout (moved `topGold` visible), but its code-filled content (rivals, shield rows) is empty; it also showed itself without being opened | — | — |
| `reloadinterface` afterwards | the tab keeps the new layout and gets its content back | 368 ms | 405 ms |
| `reload topbar.gui` (registered file) while visible | the topbar is rebuilt from the new definitions (moved `brown_bg` visible); the alert banners (`alerts_parent`) stay empty until the next game update and come back after a game month | 80–87 ms | 105–117 ms |
| **run 1:** a Tongs `ui find` 3 s after that topbar reload | **the game crashed**: access violation in `eu4.exe` code (return address RVA `0x1A35138`) called from Tongs' tree read on the main thread. Before that, 3 s of frames and a hover over the topbar were fine | — | — |
| **run 2:** the same reload, then hovering, four clicks on topbar buttons, a game month at speed 5 and the same tree read | no crash | — | — |
| `reloadtexture gfx//interface//topbar_UL.tga` after inverting the mod's copy | the topbar shows the new pixels at once; the name is the `texturefile` string from the `.gfx` as written, and the `.tga` → `.dds` fallback also works on reload | 357–362 ms (927×160 uncompressed) | 380–384 ms |
| a new `.gfx` file with a new `spriteType`, used by a reloaded `.gui` | `reload etch_probe.gfx` answers `Failed to reload the file`; the icon is drawn as the magenta "missing" placeholder and `error.log` says `Could not find sprite type [GFX_etch_probe]`. A `.gfx` change needs a restart | — | — |
| hidden windows owned by the game (two hidden `goto_box` instances) | after the reload they were rebuilt **visible** and at the new position | — | — |

## What this says

- The game's own path works: a reload lands on screen in one frame for a
  window opened by `window open`. If close, reload and open run in one
  main-thread job, the cost is about one frame plus 6–22 ms. HUD files cost
  55–90 ms because the idler rebuilds the whole HUD. `reloadinterface` and
  `reloadtexture` cost about 360 ms each.
- Rebuilt windows lose their state: hidden windows become visible, show
  animations play again, and code-filled content stays empty until the next
  game update (or `reloadinterface` for the country view tabs).
- Stale definitions are real. Run 1 crashed in a tree read after a
  `topbar.gui` reload, and run 2 did not. A use-after-free behaves exactly
  like this (whether it crashes depends on what reused the freed memory).
  Which widget held the freed definition was not identified (hypothesis:
  one built from `topbar.gui` that no listener rebuilds). The game alone
  (drawing, hover, clicks, a month of updates) did not crash in either run.
- `.gfx` changes need a restart. Texture pixel changes do not.
