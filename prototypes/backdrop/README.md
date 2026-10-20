# PROTOTYPE: a backdrop under the previewed window (etch#22), throwaway, never merged

Question ([etch#22](https://github.com/happy-dwarf-team/etch/issues/22)): the
game host previews a window in the main menu, so wherever the window is
transparent the crop shows the menu (logo, map, buttons). What should the host
draw under the window so the crop shows the window alone, comparable with the
offline renderer? Does it change the window's own pixels, and does it survive
a `window close` → `reload` → `window open` job and a restart?

## What is here

- `host.ps1`: etch#21's launcher (branch `prototype/private-host`) with one
  change. Before the start, `Run` calls `backdrop.ps1`, because `.gfx` files and
  textures load only at startup. It reuses etch#21's game host install
  (`<lab>/work/etch21-host`) and follows the lab's procedure: Lasso rule and
  EXE hashes checked, the game started suspended with mask 1-7, closed only
  after its PID, path and creation time were verified, and the player's
  profile compared before and after.
- `backdrop.ps1` writes into the overlay mod:
  - solid black and white 32×32 TGAs, and a 256×32 alpha ramp (colour
    200/120/40, alpha = column);
  - their sprites (`etch_backdrop.gfx`);
  - three forms of a full-screen backdrop window per colour
    (`etch_backdrop.gui`).
- `probe.mjs <phase> <runDir>` drives the patched Tongs (console) and
  etch-capture (crops) of etch#21. Phases:
  - `fill`: the backdrop forms;
  - `zorder`;
  - `windows`: a backdrop as its own console window;
  - `inject` and `injectcycle`: the backdrop as the previewed window's first
    child;
  - `wrap` and `wrapcycle`: the backdrop in a wrapper window;
  - `fps`.
- `analyze.mjs <runDir> [<earlierRunDir>]` recovers alpha from a black and a
  white capture. Over black, B = c·a; over white, W = c·a + 255·(1−a); so
  a = 1 − (W−B)/255 per channel. It also checks:
  - stability;
  - plain source-over blending;
  - opaque pixels against the window over the menu;
  - the ramp;
  - the cycles;
  - a restart against an earlier run.

  It writes `summary.json`, PNGs and a local `compare.html`. The captures are
  game art and stay outside Git.

Previewed windows: the probe window (ramp plus text, no background), Proper 2K
UI Enhanced's `topbar` (full-screen, mostly transparent) and `goto_box` (a
window with `backGround = "goto_box"`), each as a preview copy with prefixed
top-level names.

## Runs (2026-10-20)

EU4 1.37.5, SHA-256 `9AD3EFE1…D771A` for both the original and the copy, at
3440×1440 borderless with MSAA 8 and UI scale 1.0. Playset: P2KE plus the
overlay mod. Mask 1-7, with the Process Lasso rule untouched.

| Run | Ready | Phases | End |
| --- | --- | --- | --- |
| etch22-run1 | 13.6 s | check, fill, zorder, windows, cycle, inject, injectcycle | access violation in `injectcycle` (see below); game and `CrashReporter.exe` closed after verification, no report sent |
| etch22-run2 (restart) | 13.6 s | check, fps, wrap, wrapcycle | verified close after `stop.txt`, no crash |

Both runs left the player's profile unchanged and the Steam folder without
`version.dll` or `anvil/`.

## Results

- **A backdrop as its own window does not work.** The console keeps one window
  open: `window open B` closes A (the top-level list keeps only the last
  one). Opened before the preview, the backdrop vanishes; opened after, it
  covers the preview. A cornered-tile `Background` (button or icon) draws
  nothing at screen size. A plain icon scaled 120× covers 99.997 % of the
  frame.
- **A backdrop as the window's first child changes the window.** The scaled
  icon at (−4000, −4000), 300×, covers the screen wherever the window sits.
  The probe and the topbar are correct with it. `goto_box`, though, loses its
  background: a window draws its `backGround` widget before every child, and
  only 9,224 of 160,770 pixels stay opaque.
- **A wrapper changes nothing.** The wrapper is a new top-level window
  `etch_<win>_backdrop`: full-screen at (0, 0), with the scaled icon as its
  first child and then the previewed window's whole block, nested.
  - The nested window's rect equals the plain copy's: `goto_box`
    165,215 333×454; `topbar` 0,−1 3440×1440.
  - `goto_box` keeps its background (141,500 opaque pixels).
  - The probe's crops equal the first-child variant byte for byte.
  - Among the pixels where the menu stood still, no opaque pixel differs from
    the plain copy over the menu. The topbar's 6 are the FPS counter.
- **Exact RGBA from black + white.**
  - Two captures of one state are identical.
  - The ramp's recovered alpha matches the texture exactly; the colour is
    within 4 levels where alpha ≥ 32 (8-bit quantisation).
  - The channels agree, and white never comes out below black: plain
    source-over. The topbar is the exception at 7 pixels (spread ≤ 2).
  - Over the menu, B + M·(1−a) predicts the real capture within ±2 for 99.75 %
    (`goto_box`) and 98.7 % (topbar) of the still pixels. The menu's map
    animates: 9–80 % of the crop changes between two captures.
- **Survives jobs.** With the wrapper, 10 of 10 close → reload → open jobs
  showed the window at its new x and only black around it in the first
  Present.
  - Job round trip 22–29 ms, 30–36 ms with the capture.
  - A dual job takes 63–73 ms: close both, reload both copies, open black,
    crop, open white, crop. All 10 of its crops equal the `wrap` phase's.
- **Survives a restart.** Run 2's probe crops over black and white equal
  run 1's byte for byte. The backdrop assets load at startup from the overlay
  mod.
- **Not the backdrop's fault:**
  - A green FPS counter is drawn above all GUI in the top-right corner
    (x ≥ 3380, y < 20). The console has no `fps` command, and its source is
    unknown.
  - One 8×8 element of the topbar (81..88, 88..95) changes from frame to
    frame.
  - The first `reload` in the main menu adds 164 hidden `hints_test` windows,
    once; later reloads add none.
- **Crash (protocol error).** `injectcycle` reloaded `etch_probe.gui` while
  its window was still open, and the game died with an access violation. This
  confirms that every job closes the window before the reload.

## Not run

- Closing the frontend's windows. The scaled backdrop already covers the map
  and the frontend (99.997 %), so it was not needed.
- Windows with `orientation` other than upper left inside the wrapper. The
  parent is the screen at (0, 0), so they should land the same (hypothesis).
- etch#16's H1 diff.
