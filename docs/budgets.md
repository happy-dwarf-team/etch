# Budget measurements

The budgets of [spec section 7](spec/v1.md#7-budgets) are requirements,
measured on the maintainer's machine and never timed in CI (ADR 0004). This
file records how they are measured and every result, newest first. Terms are
those of [GLOSSARY.md](../GLOSSARY.md): **warm reload** and **cold open**.

## Method: vanilla

The measurement is the extension's own test suite with the game folder set:

```powershell
$env:ETCH_GAME_PATH = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
pnpm --filter etch test
```

[`packages/extension/test/preview-budget.ts`](../packages/extension/test/preview-budget.ts)
runs first in a new VS Code (from `.vscode-test`, every other extension
disabled):

- The game is read in place. The edited file is a copy of vanilla
  `interface/countrydiplomacyview.gui` (148 KB) in a temporary mod, opened as
  Windows-1252, with the cursor in the `countrydiplomacyview` window (135
  draws, 63 textures, 146 widgets). The playset is the game and that mod.
- At each resolution (1920×1080, the corpus's largest 3440×1440), three runs.
  A run is a **cold open**, from the `Etch: Open Preview` command to the
  webview's paint of the window (the playset found, `eu4.exe` hashed, every
  `.gui`, `.gfx` and English localisation file read, the sprite index built,
  the window laid out, its textures and fonts fetched, decoded and uploaded),
  then 40 **warm reloads**, each one edit of the unsaved buffer (`x=0` ↔ `x=1`
  in a `show_position`) 150 ms after the last paint, from the edit to the
  paint. The preview is closed after each run, so the next cold open loads the
  playset and the textures again; only the first in the process is the first
  preview of that VS Code, the others find Node's JIT and the `eu4.exe` hash
  warm.
- A paint is timed after `gl.readPixels` of one pixel, so the GPU has drawn it.
  Warm reloads are also reported from the change event the preview answers;
  the difference is VS Code's own edit handling.
- The game files are in the operating system's file cache: the test cannot
  empty it without administrator rights.
- The test fails when a warm reload p95 is over 50 ms or a cold open over 1 s.
  `ETCH_BUDGET_RUNS` changes the number of runs.

The suite is run three times, so the table has three first cold opens.

## Method: Anbennar

The same test, on the Anbennar playset (etch#57), runs after vanilla's;
`ETCH_BUDGET_PLAYSETS` (playset ids separated by `,`, default
`vanilla,anbennar`) picks the playsets and their order:

```powershell
$env:ETCH_GAME_PATH = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
$env:ETCH_BUDGET_PLAYSETS = 'anbennar'   # only Anbennar, so its first cold open is the process's first
pnpm --filter etch test
```

- The mods are the corpus manifest's Workshop items of the playset (Anbennar,
  Proper 2K UI Enhanced, P2KE Patch - Anbennar), each checked against its pin
  and read in place. The edited file is a copy of the patch's
  `interface/topbar.gui` (347 KB) in a temporary mod that the playset
  override lists after them, with the cursor in the `topbar` window (1,331
  draws, 209 textures, 1,309 widgets). The edit toggles the `x` of its
  `show_position`.
- Everything else is vanilla's method: two resolutions, three runs of a cold
  open and 40 warm reloads each, the preview closed between runs. The test
  fails when a warm reload p95 is over 50 ms or a cold open over 2 s.

The game host's times on the playset are reported, not gated, from
`packages/extension/test/game-host-budget.ts`, with `ETCH_GAME_HOST_PATH` and
`ETCH_GAME_HOST_CHECK=budget` (the pinned builds staged by `pnpm pins`): the
same mods and a test mod with copies of the patch's `topbar.gui` and
`countrydiplomacyview.gui`. It times the start to ready and to the first image,
20 warm edits of each file's window from the change to the drawn image and the
job alone, and two restarts that a `.gfx` file in the test mod causes (saved,
then deleted), from the save to ready and to the next image.

## Results

### 2026-10-26, etch#57 (the Anbennar budgets)

Machine as in etch#39 (Intel Core i9-13900KF, 64 GB, NVIDIA GeForce RTX 4090,
NVMe SSD, Windows 11 Pro 26200); VS Code 1.143.1 from `.vscode-test`. EU4
1.37.5, `eu4.exe` SHA-256 `9AD3EFE1…DC4D771A`. The playset at the corpus
manifest's pins, which the test checks: Anbennar `99DAB21E…54A1DD`, Proper 2K
UI Enhanced `B411CFAE…CED1F9`, P2KE Patch - Anbennar `E4ABCD62…25FC55`.
Processes 1–5 measured Anbennar alone (`ETCH_BUDGET_PLAYSETS=anbennar`), so
their first cold open is the first preview of the process; process 6 was the
default run, Anbennar after vanilla. No run timed out and no sample was lost.

Warm reload of the patch's `topbar.gui`, from the edit to the paint (120 edits
per row: 3 runs of 40):

| Process | Resolution | Median | p95 | Max |
| --- | --- | --- | --- | --- |
| 1 | 1920×1080 | 19.0 ms | 23.5 ms | 48.0 ms |
| 1 | 3440×1440 | 18.7 ms | 22.6 ms | 29.1 ms |
| 2 | 1920×1080 | 19.7 ms | 23.3 ms | 41.5 ms |
| 2 | 3440×1440 | 19.6 ms | 23.8 ms | 27.3 ms |
| 3 | 1920×1080 | 19.8 ms | 23.4 ms | 44.6 ms |
| 3 | 3440×1440 | 19.8 ms | 23.2 ms | 31.1 ms |
| 4 | 1920×1080 | 19.5 ms | 23.5 ms | 37.8 ms |
| 4 | 3440×1440 | 18.9 ms | 22.3 ms | 28.3 ms |
| 5 | 1920×1080 | 20.0 ms | 23.3 ms | 41.4 ms |
| 5 | 3440×1440 | 19.7 ms | 23.3 ms | 27.7 ms |
| 6 | 1920×1080 | 19.0 ms | 22.1 ms | 58.9 ms |
| 6 | 3440×1440 | 18.8 ms | 22.3 ms | 26.1 ms |

From the change event the medians are 0.7–1.0 ms lower (17.9–19.1 ms, p95
21.2–22.6 ms).

Cold open, from the command to the paint, in run order (the first number of
processes 1–5 is the process's first preview):

| Process | 1920×1080 | 3440×1440 |
| --- | --- | --- |
| 1 | 1156, 821, 705 ms | 687, 798, 871 ms |
| 2 | 1011, 707, 766 ms | 764, 734, 755 ms |
| 3 | 1870, 728, 665 ms | 740, 725, 704 ms |
| 4 | 1258, 721, 751 ms | 790, 715, 776 ms |
| 5 | 1256, 799, 746 ms | 719, 689, 688 ms |
| 6 | 1288, 751, 771 ms | 923, 733, 817 ms |

Both Anbennar budgets hold: warm reload p95 at most 23.8 ms against 50 ms,
cold open at most 1.87 s against 2 s. The first preview of a process is the
slowest, 1.01–1.87 s; the margin is thin there, and the 1.87 s of process 3
was not traced. Later cold opens take 0.67–0.92 s. One warm reload of 1,440
went above 50 ms (58.9 ms). The window is about ten times vanilla's (1,331
draws, 209 textures, 1,309 widgets against 135, 63 and 146), and a warm
reload takes about three times as long (19 ms against 7 ms).

Where the cold open goes, from the same steps in plain Node 24 (two runs):
finding the playset 34–91 ms (the first hashes `eu4.exe`), reading and
modelling every `.gui` and `.gfx` file of the playset (162 `.gui` files, all
of them a mod's) 469–512 ms, with the English localisation (59 MB of
Anbennar's) 469–503 ms alongside. The rest, about 0.2–1.3 s, is the webview,
the window's 209 textures, and the extension host's first run of that code.

Vanilla in process 6, after the change: warm reload p95 10.0 ms (1920×1080)
and 9.0 ms (3440×1440), cold opens 509, 315, 303 ms and 324, 303, 300 ms.
Both vanilla budgets still hold.

The game host on the same playset (reported, not gated; Anvil 1.3.0, Bellows
0.9.0, 3440×1440, a new private profile each run), four runs of
`ETCH_GAME_HOST_CHECK=budget`, each under the EU4 engine lab's procedure
(`eu4.exe` hash and the Process Lasso rule before and after, the player's
profile and the Steam folder unchanged, every game closed after its PID, path
and creation time were checked, none left running):

| Measure | Runs 1–4 |
| --- | --- |
| Start: switch to ready (to the first image) | 40.8–42.6 s |
| Start: process creation to ready | 38.9–40.9 s |
| `topbar` (crop 3440×1440), 20 warm edits: job median / p95 | 333–439 / 359–505 ms |
| `topbar`, change to the drawn image, median / p95 | 469–647 / 551–742 ms |
| `countrydiplomacyview` (crop 3440×1284): job median / p95 | 215–224 / 251–263 ms |
| `countrydiplomacyview`, change to the drawn image, median / p95 | 423–447 / 461–495 ms |
| Restart (a `.gfx` file saved or deleted): save to ready | 35.8–38.3 s |
| Restart: process creation to ready | 34.4–36.7 s |
| Restart: save to the new game's first image (run 4) | 36.5–37.0 s (0.44–0.59 s after ready) |

A start with Anbennar takes about 40 s, twice vanilla's 13–21 s (etch#53), and
a restart about 36 s. The 150 ms job target of spec section 7 is missed for
both windows: `countrydiplomacyview` of the patch takes 215–224 ms against
vanilla's 175–195 ms (etch#50), and the full-screen `topbar` 333–439 ms; the
topbar is a HUD file, which the target leaves out. Runs 1–3 timed the image
after a restart wrongly (the old game still answers the changed file's job
before it closes, and the restarting preview draws that image again, stale),
so that row is run 4's alone; the test was fixed before it.

### 2026-10-25, etch#53 (game host on the corpus windows, reported, not gated)

The game host's times on the corpus windows (docs/game-host.md, "The corpus
windows"), 3440×1440, EU4 1.37.5 `9AD3EFE1…DC4D771A`, Anvil 1.3.0, Bellows
0.9.0, vanilla and Proper 2K UI Enhanced:

| Measure | Result |
| --- | --- |
| Restart time to ready (seven starts) | 13.2–20.7 s |
| Job of a root window, from the cursor on its name (first complete vanilla run, 15 roots) | 47–201 ms |
| The same, right after the preview's job of another window of the file (runs 5–7) | 321–582 ms |

The jobs test of the same day (etch#118) measured warm edits of
`countrydiplomacyview` at a job median of 194 ms (p95 221 ms) and a 573 × 580
dialog at 61 ms: the 150 ms target is met for small windows, not for
full-screen crops.

### 2026-10-25, etch#50 (game host jobs, reported, not gated)

The game host's job time (spec section 7: target ≤ 150 ms for files outside
the HUD) from the extension's test suite with `ETCH_GAME_HOST_PATH`, four runs
of 10 warm edits of a copy of vanilla `countrydiplomacyview.gui` at 3440×1440
(EU4 1.37.5 `9AD3EFE1…DC4D771A`, Anvil 1.3.0, Bellows 0.9.0). The crop is
3440×1310:

| Measure | Median | p95 |
| --- | --- | --- |
| Job (copies written to answer) | 175–195 ms | 187–208 ms |
| Change to the drawn image | 295–300 ms | 343–366 ms |

Most of a job is the first `window open` of the wrapper (about 80 ms for this
window); a 573×580 dialog took 72–75 ms. docs/game-host.md has the breakdown.

### 2026-10-24, etch#44 (after the corpus's renderer fixes)

Checked again after the text, sprite and texture rules of etch#44 (#86, #91,
#92, #94, #99, #100), with the method above. Machine as below; VS Code 1.143.1
from `.vscode-test`. EU4 1.37.5, `eu4.exe` SHA-256 `9AD3EFE1…DC4D771A`.

Warm reload, from the edit to the paint (120 edits per row: 3 runs of 40):

| Process | Resolution | Median | p95 | Max |
| --- | --- | --- | --- | --- |
| 1 | 1920×1080 | 6.4 ms | 9.8 ms | 37.0 ms |
| 1 | 3440×1440 | 6.3 ms | 8.1 ms | 11.5 ms |
| 2 | 1920×1080 | 6.5 ms | 12.2 ms | 35.2 ms |
| 2 | 3440×1440 | 6.3 ms | 7.9 ms | 9.6 ms |
| 3 | 1920×1080 | 7.2 ms | 12.6 ms | 51.5 ms |
| 3 | 3440×1440 | 7.2 ms | 9.3 ms | 12.0 ms |

From the change event the medians are 0.7–0.8 ms lower (5.5–6.5 ms, p95
6.9–11.8 ms).

Cold open, from the command to the paint, in run order:

| Process | 1920×1080 | 3440×1440 |
| --- | --- | --- |
| 1 | 519, 302, 293 ms | 297, 291, 297 ms |
| 2 | 510, 299, 293 ms | 298, 295, 292 ms |
| 3 | 523, 300, 294 ms | 290, 308, 292 ms |

Both vanilla budgets still hold: warm reload p95 at most 12.6 ms against
50 ms, cold open at most 523 ms against 1 s. One warm reload of 720 went
above 50 ms (51.5 ms), as in etch#39.

### 2026-10-21, etch#39 (after etch#38)

Machine: Intel Core i9-13900KF, 64 GB, NVIDIA GeForce RTX 4090, NVMe SSD,
Windows 11 Pro 26200. VS Code 1.142.0, Node in the extension host as VS Code
ships it. EU4 1.37.5, `eu4.exe` SHA-256 `9AD3EFE1…DC4D771A`. The preview
renders without a debounce.

Warm reload, from the edit to the paint (120 edits per row: 3 runs of 40):

| Process | Resolution | Median | p95 | Max |
| --- | --- | --- | --- | --- |
| 1 | 1920×1080 | 7.0 ms | 13.8 ms | 91.3 ms |
| 1 | 3440×1440 | 6.5 ms | 11.4 ms | 30.1 ms |
| 2 | 1920×1080 | 6.4 ms | 10.9 ms | 50.0 ms |
| 2 | 3440×1440 | 6.2 ms | 9.0 ms | 12.1 ms |
| 3 | 1920×1080 | 6.1 ms | 9.9 ms | 29.1 ms |
| 3 | 3440×1440 | 6.1 ms | 8.3 ms | 11.0 ms |

From the change event the medians are 0.7–0.9 ms lower (5.3–6.1 ms, p95
7.6–12.8 ms).

Cold open, from the command to the paint, in run order (the first number of
each process is its first preview):

| Process | 1920×1080 | 3440×1440 |
| --- | --- | --- |
| 1 | 852, 407, 501 ms | 336, 337, 422 ms |
| 2 | 613, 304, 299 ms | 306, 309, 308 ms |
| 3 | 655, 336, 363 ms | 334, 294, 332 ms |

Both vanilla budgets hold: warm reload p95 at most 13.8 ms against 50 ms, cold
open at most 852 ms against 1 s, the first preview of a process being the
slowest. A single warm reload above 50 ms happens (one of 720 edits, 91.3 ms;
its cause was not traced); the budget is read as the p95.

Where the first cold open goes, from the same steps timed in plain Node 24
outside VS Code (two runs, ±5 ms): finding the playset 91–95 ms (most of it
hashing the 1.37.5 `eu4.exe`, cached afterwards per size and modification
time), reading and modelling every vanilla `.gui` and `.gfx` file 238–244 ms,
with the English localisation (77–82 ms) read alongside, laying the window
out with its texture headers and fonts 13 ms, its diagnostics 3 ms. The rest,
about 250–500 ms and not timed step by step, is the webview: creating it,
loading its script, and
fetching, decoding and uploading the window's 63 textures (7.0 MB), plus the
extension host's first run of that code.

Debounce (the open point of etch#9): settled as none. The preview renders a
change at once when it is idle and coalesces changes that arrive during a
render into one more render. With that, the p95 is 8–14 ms where etch#9 had
55 ms with a 30 ms debounce, so neither a shorter debounce nor a separate
leading-edge draw is needed.

## Earlier measurements

- etch#36 (first end-to-end preview, 1920×1080, three runs of 40 edits): warm
  reload median 5–6 ms, p95 10–12 ms; cold open 0.54–0.66 s.
- etch#9 (prototype, branch `prototype/offline-render`): warm reload median
  36.6 ms, p95 55 ms, of which a 30 ms debounce; the work about 6 ms. Cold
  open about 0.2 s for one window with the files in the file cache.
