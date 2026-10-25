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

## Results

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
