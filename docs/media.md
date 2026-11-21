# Etch's media

The loops on [etch.happydwarf.dev](https://etch.happydwarf.dev/), the hero's and one per
feature, are made by `packages/media` (`@etch/media`), a private package that never ships in the
VSIX. Its contract (clips, framing, the edit, encoding, the paint marker) is the Etch site
specification's section 8,
[Media pipeline](https://github.com/happy-dwarf-team/etch-website/blob/main/docs/spec.md#8-media-pipeline-work-in-etch);
change a rule there first. Media are made on the maintainer's Windows machine, never in CI: they
need EU4 and they show its art. The same package makes the screenshots of a pull request's
Evidence ([below](#evidence-for-a-pull-request)).

A media refresh has two steps with a human review between them:

1. `pnpm media capture` records each clip's take, edits it and encodes the loops into the
   git-ignored `packages/media/out/v<version>/`. It publishes nothing.
2. `pnpm media publish --site <etch-website checkout>` uploads the loops to the media bucket and
   then writes the posters and media manifest into the site's checkout. It commits nothing.

A media refresh is due after an Etch release that changes what any clip shows, not after every
release; the site keeps the last published set. [The checklist](#media-refresh-checklist) at the
end lists every step.

## Before capturing

- Windows 11 with display scaling at 100 %, on a visible, unlocked desktop with the display
  awake. A take opens a VS Code window of 2560 × 1440 pixels (device scale 1, editor font 18, as
  on an ordinary monitor) at the top left of the primary monitor; do not touch it, cover it with another always-on-top window or minimise it
  while a take runs.
- EU4 1.37.5 from Steam (found through Steam, or pass `--game`). Only the live take starts the
  game ([below](#the-live-take)); the others only read its files, and each take copies the base
  game's `interface/provinceview.gui` into its throwaway workspace (below). The base game is
  enough; the offline takes use no DLC or other mod.
- The player's `settings.txt` with `game_ui_scale=1.000`: a preview notice the clip does not
  expect fails the run.
- FFmpeg 8.1 or newer, full build (`gfxcapture`, `libvpx-vp9`, `libx264`), on the `PATH` or
  passed with `--ffmpeg`.
- `pnpm install`. The first run downloads the pinned VS Code into the work folder, and the first
  render Remotion's Chrome Headless Shell.
- In the EU4 engine lab, every capture runs under the lab's game lock: its takes and renders load
  the machine.

## Capturing

```powershell
pnpm media capture --save <file.eu4> --profile <file.csv> # every clip
pnpm media capture --clip views           # one clip; --clip views,data for several
pnpm media capture --clip reload,pick,snapshot --save <file.eu4> # the live take
pnpm media capture --clip hero --save <file.eu4> # the demo loop: the open take, then four rendered loops
pnpm media capture --clip data --reedit   # edit and render again from the take, no new take
```

| Option     | Default                    | Meaning                                                                                                               |
| ---------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `--clip`   | all                        | clip ids: `hero`, `preview`, `views`, `data`, `zoom`, `outline`, `problems`, `profile`, `names`, `texture`, `encoding`, `hovers`, `mesh`, `trees`, `entity`, `reload`, `pick`, `snapshot` |
| `--save`   | none                       | the live take's save: a base-game save, not ironman, copied into the run; needed for `reload`, `pick` and `snapshot` |
| `--profile` | none                      | the script profile `profile` shows: a CSV of Anvil's script profiler measured in a base game; needed for `profile` |
| `--reedit` | off                        | edit, render and encode the clips again from their takes' logs and masters                                            |
| `--ffmpeg` | `ffmpeg` on the `PATH`     | FFmpeg; `ffprobe` is taken from beside it                                                                             |
| `--game`   | `ETCH_GAME_PATH`, or Steam | the EU4 folder: `etch.gamePath`, and where the overridden file is copied from                                         |
| `--work`   | `%TEMP%\etch-media`        | a short folder for VS Code and its throwaway profiles (VS Code fails under a path longer than MAX_PATH)               |

The command builds the extension, then makes each clip in three steps.

**The take.** The clip's steps (`packages/media/src/clips.ts`) run once in a fresh VS Code
1.142.0 launched through Playwright's Electron driver: Etch loaded from `packages/extension`, a
new profile seeded with the framing settings, an empty extensions folder and, as the workspace, a
copy of `packages/media/demo-mod` with the base game's `interface/provinceview.gui` copied into
it, as **Override in my mod** would, so no edit reaches the repository or the game, and no game
file is kept after the run. The steps drive VS Code with the keyboard and Playwright's mouse, and
every step that changes the preview waits for Etch's paint marker (below). FFmpeg's `gfxcapture`
records the window into a lossless master against the take's clock, and each step logs an event
on that clock with the rects the edit needs: the cursor's line, the preview's widget outline, a
menu, a Problems row. Before the take the script checks the framing: the preview at 1440 × 900
(the large layout the game draws at that height) shown unscaled (one game pixel, one device
pixel), no preview notice, toast, Find widget, hover,
suggestion or unexpected quick pick. Any failure stops the run and leaves
`masters/<clip>.failed.png`.

**The edit.** From the log alone, `clips.ts` builds the clip's edit (`packages/media/src/edit.ts`)
for the site, where a loop is about 650 px wide: panels cut from the master, mostly a split with
the control on the left (the code, a menu of the preview, the Widget Outline, Problems) and its
effect on the right (the preview or the game), each at a scale that still reads at the site's size
(code at 1.5× or more, the preview's menus at 2.2×). The camera moves only between steps; the loop
opens and closes on the same shot (its seam). A menu's panel is folded to its button's row while
the menu is closed and unfolds with it. While a menu of the preview is open over the window, the
window's panel holds its frame from before the menu opened and shows the window's new state from
the frame the menu closes, so the menu shows whole in its own panel and never cut off at the
window panel's edge. Where the pointer crosses the preview's widgets on its way (`outline`) or
other names in the editor (`hovers`), the drawn pointer glides while Playwright's mouse moves at
the end only, so no tip or hover shows on the way. Panels of text lines longer than they are
(code, Problems) fade out at their right edge rather than cut a word. Captions give the keys pressed and what they
do, rings mark what changed once it has, and a pointer is drawn where Playwright's mouse moved (the
master has none: Playwright's mouse is not the system pointer).

**The render.** The Remotion composition in `packages/media/motion/` draws the edit at
1920 × 1080, 30 fps, from H.264 proxies of the masters, into a ProRes 4444 cut, whose first frame
is the poster; the cut is encoded as before. Remotion is free for individuals and companies of
up to three people (its licence); it needs no key.

A run of every clip takes about fifteen minutes. It writes into `packages/media/out/v<version>/`:

| File                    | What                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| `<clip>.png`            | the loop's poster, its first frame, 1920 × 1080                          |
| `<clip>.webm`, `.mp4`   | the loop, 1920 × 1080, 30 fps, silent: VP9 two-pass CRF 34, H.264 CRF 23 |
| `media.draft.json`      | the media manifest with local file names (etch-website spec section 5.2) |
| `capture.json`          | the log: Etch version and commit, VS Code, FFmpeg, when each take ran    |
| `masters/`              | the takes' masters and logs (`<take>.take.json`), the edits (`<clip>.edit.json`), the proxies, the cuts, failure screenshots |

`--reedit` turns the same take into a new edit: change a camera move or a caption in
`clips.ts` or `live.ts` and render again without recording.

**The demo loop.** The hero's loop (`--clip hero`) has five chapters: `open`, `type`, `mesh`,
`reload` and `pick` (etch-website spec section 4.2). The first is a take of its own, `open`, which
no loop of the site shows alone: VS Code with the demo mod's folder in the Explorer and no editor
open; a click opens `interface/provinceview.gui` at the trade node button's line, its title bar's
Open Preview opens the preview beside it, and the camera moves in from the whole window to the
line and the button. The others are the cores of the rendered `preview`, `mesh`, `reload` and
`pick` cuts, so those must be captured first. Each part fades in from the background and out into
it. The edit writes each chapter's start, on a whole frame, into `hero.edit.json`, and the
capture copies them into the draft manifest's `chapters`. `--clip hero` takes `open` again;
with `--reedit` it edits it from its log.

## The scripts' takes

`profile`, `names` and `encoding` show Etch's work on script files (the Etch site
specification's section 3.2.3). They show VS Code alone: no preview and no game art.

- **`profile`** copies the CSV given with `--profile` into the run's throwaway private profile
  (`<work>/run/user-data/User/globalStorage/happy-dwarf-team.etch/private-install/profile/logs/`),
  where **Etch: Show Latest Script Profile** finds it as the newest (your own profile's `logs`
  folder is searched first, so a profile you measured later than the copy would win). The take
  types the command in the palette, waits for the page, clicks a decision's name
  (`expel_foreign_traders`) and waits for its file to open with the profile's line above the
  block. The page shows the CSV's path: pass a `--work` outside your user folder (for example
  `C:\etch-media`). Use a profile measured in a base game, so the names link into the take's
  playset; the CSV is not committed (its `caller_rva` column holds addresses in `eu4.exe`).
- **`names`** opens `events/etch_demo_events.txt` of the demo mod, filters Problems to it, types a
  `5` before `owns = 151` (province 5151, not on the map) and `al` into `economic_ideas` (an idea
  group the playset does not define), and undoes both.
- **`encoding`** opens the same file and reopens it as UTF-8, VS Code's default: the takes' VS
  Code opens files in the game's encoding (`files.encoding` in `packages/media/src/config.ts`), and
  the file is ASCII, so it reads the same. An `é` typed into the second event's ruler name
  (`Rene`, now `Renée`) gets Etch's warning; its quick fix **Save with Encoding…** and VS Code's
  list save the run's copy of the file as Windows 1252, and the warning goes.

## The art takes

`texture`, `mesh`, `trees`, `entity` and `hovers` show Etch's previews of the game's art (the
Etch site specification's sections 3.2.2 and 8.2). `texture`, `mesh`, `trees` and `entity` open a
base-game file read-only from the local game with Quick Open and its absolute path; the first
three then move the editor into the preview's group, where it takes the preview's width. No file
is copied. The Mesh Preview's loops show the bar's strip above a part of the canvas: a wider view
would take in the code beside it.

- **`texture`** opens `gfx/interface/game_settings_bg.dds` (an alpha and ten mip levels), clicks
  **A** and **RGBA**, steps the mip level down twice with ↓ and back with Home, and rests the
  pointer on the texture. The level is chosen with the keyboard: a click would open the list in a
  window of its own, which `gfxcapture` does not record.
- **`mesh`** opens `gfx/models/ships/carrack.mesh` (a skeleton, its own idle animation and sails
  that show a flag): a drag turns the ship, **Wire** goes on and off, `FRA` typed in **Flag** puts
  France's flag on the sails, the idle animation is chosen (without its list, as above) and plays,
  and **Reset view** frames the ship again.
- **`trees`** opens `gfx/models/Mapitems/Trees/leafs_01.mesh`, which `mapobject_5` makes a map
  tree: a leaf tree, because only the first row of the game's `Tree_season.bmp` has colours and
  the pines take their season colour from its grey rows. Off camera, **Date** is set to 1 April;
  the take drags **North** to 1, **Date** to 28 October and **Snow** to 1, and types `1`
  (Stockholm, the docs' example) in **Place**: Ground and North take the map's values there (North
  0.85), and lock. The sliders are dragged with the pointer from their thumbs, whose places the
  take works out from the slider's box and range.
- **`entity`** opens `gfx/entities/western_units.asset` in the editor's own group and clicks
  **Preview entity** above its first entity, `westerngfx_INFANTRY_1`: the preview opens beside it
  with the halberd on the unit's right hand, playing `idle`, and the state list is set to `walk`
  (without its list, as above). Off camera, before the take, the preview is opened and closed once,
  so the take's draws at once rather than after the playset's `.gfx` and `.asset` files are read.
  The bar's first line lists the attachments in its tooltip, which opens in a window of its own:
  the loop rings the `attach` block in the code and the facts' "1 attached" instead.
- **`hovers`** turns VS Code's hovers on in the run's settings for its take (the takes run with them
  off, so the pointer shows nothing on its way). The pointer hovers `GFX_provinceview_building_bg`
  in `provinceview.gui` and **F12** opens the base game's `.gfx` at its name. After a cut, the demo
  mod's `interface/assets/etch_demo_models.gfx`: a hover on its mesh path draws the ship, a
  Ctrl+click on its texture path opens the Texture Preview, and **Ctrl+W** twice comes back.

## The live take

`reload`, `pick` and `snapshot` come from one take beside Etch's live game: a save reloads the
province view in the running game; pick mode in the game outlines widgets and a click opens one's
definition in VS Code; the same pick gives the preview a live snapshot (the Etch site
specification's section 8.5). It is the only take that starts EU4, and it needs:

- EU4 not running, and the desktop to itself for about two minutes: the script moves and clicks
  the **real pointer** (pick mode takes only a real click) and presses **Ctrl+Shift+E** in the
  game, which comes to the front. Keep your hands off the mouse and keyboard until the run ends.
- A base-game save, not ironman, passed with `--save`. The run copies it into its own player
  profile and never opens the original.
- Your `settings.txt` and `pdx_settings.txt` (with `game_ui_scale=1.000`). The run copies them
  into its player profile and sets the game windowed at the preview's 1440 × 900
  (`LIVE_GAME_RESOLUTION` in `packages/media/src/config.ts`), as for a player whose preview
  follows the game's settings; your own files are not changed. (Until Etch 2.12 the preview drew
  a live snapshot's positions as the game's screen had them, so from a game at 2560 × 1440 the
  province view was drawn 540 px lower, off the preview's canvas.)
- A second monitor of at least 1440 × 900 right of a 3440-pixel-wide primary, both at 100 %:
  VS Code fills the primary as in the other takes, the game's client area goes to the second
  monitor's top left corner (`GAME_ORIGIN` in `packages/media/src/live.ts`).

The run starts VS Code as for the other takes, with one more extension loaded beside Etch:
`packages/media/live-helper`, a helper that only this take loads. Through the value Etch's
`activate` returns (an API for Etch's own tools, not a stable one), it gives the live game the
run's player profile, answers the two first-use confirmations, and turns on Tongs' pipe, with
input, in the run's private install, which lives in the throwaway profile: the user's private
install, profile and saves are never touched. The live take's copy of the demo mod leaves out
`events/` (the `names` clip's file, which the live clips do not show): with it, three takes on
2026-11-18 waited 4–10 minutes and the save never loaded, and without it the save loaded at once;
why is not known. It leaves out `interface/assets/` too (the models `.gfx` of `hovers`), so the
game loads the same files as in those takes. Then the take runs as a user would: **Etch: Open
Preview**, **Etch: Start the Live Game** and the save in its quick pick. Through Tongs' pipe it
waits until the save is loaded (logging the game's state every 30 s while it waits), moves the
camera to Kaluga (296, the sample data's province), opens its province view and reads where the
trade node button is. The real pointer waits over the map right of the buildings panel, away from
the screen's edges (anywhere near or outside them the game scrolls its map) and outside every part
of the window the edits show.

It runs one reload unrecorded (the first reload of a freshly opened province view blanks the
province's name, `docs/live-game.md`, and the start state is then the end's), then records both
windows, each by its own `gfxcapture` (the game's with its pointer) on the take's clock: the
reload (one keystroke, Ctrl+S, the button moves, Ctrl+Z, Ctrl+S), then pick mode: the pointer
goes to the first widget, Ctrl+Shift+E in the game, and the pointer jumps from widget to widget
(three hovered, the last one the trade node button, then clicked), so pick mode outlines no widget
on the way. Closing VS Code stops the live
game: it is saved into the run's private profile and closed after its identity checks. The take
needs the plugin's build and the pinned game-side builds staged under
`packages/extension/game/` (`pnpm pins`, CONTRIBUTING.md); without them it stops at once.

## Reviewing

Look at every frame of every loop before anything is published:

- Every frame shows the editor and Etch's preview together, or in the live loops the editor and
  the game, nothing else of VS Code's that the clip does not need (Welcome, notifications, other
  extensions). The live loops show the game in play with the province view open, paused, no
  notification, and the system pointer only over the game.
- The close-ups land on what changes, the captions say what the clip does, and the loop's last
  frame runs into its first without a jump.
- Sizes: the specification aims at about 1.5 MB a WebM; adjust `VP9_CRF` and `H264_CRF` in
  `packages/media/src/config.ts` only through the specification.

Known artefacts of the capture setup, not of Etch: VS Code's title bar says
`[Extension Development Host]`, and the status bar counts the problems Etch finds in the base
game's `provinceview.gui` itself.

## Publishing

```powershell
pnpm media publish --site ..\etch-website              # the capture of the current version
pnpm media publish --site ..\etch-website --etch 2.0.0 # the capture in out/v2.0.0/
```

The loops go to the R2 bucket `happydwarf-media` behind `media.happydwarf.dev` (the hub
specification's section 7). Its key for a loop file is `etch/v<version>/<clip>.<hash8>.<webm|mp4>`,
where `<hash8>` is the first 8 hex digits of the file's SHA-256. A key therefore never changes
its content, and every object is uploaded with `Cache-Control: public, max-age=31536000, immutable`
and the file's media type (`video/webm`, `video/mp4`) as its `Content-Type`.

Each machine you upload from has its own Account API token,
`happydwarf-media-upload-<computer>` with the Windows computer name in lower case (Object Read &
Write on `happydwarf-media` only, one year; hub specification 7.4), in two **user** environment
variables: `HAPPYDWARF_MEDIA_ACCESS_KEY_ID` and `HAPPYDWARF_MEDIA_SECRET_ACCESS_KEY`. Set them in
Windows' user environment variables, never in a `.env` file, a script or a CI secret, and never
copy them to another machine; open a new terminal afterwards. Without both the command stops
before it reads anything; it never prints their values. The bucket name and the account's S3
endpoint are in `packages/media/src/config.ts`.

The command:

1. Reads `media.draft.json` of the capture and checks that it is complete: all eighteen loops with
   their posters, every poster a 1920 × 1080 PNG, every loop file the size the draft says. It
   checks that `--site` is an etch-website checkout.
2. Uploads each loop file with `PutObject` and `If-None-Match: *`, so it never overwrites a key.
   When the bucket answers `412` the key exists: an object of the same size and type counts as
   already uploaded (`Kept …`), and anything else stops the run. So `publish` can run again
   without capturing again.
3. Reads every key back with `HeadObject` and checks its size and type.
4. Only then copies the posters to the site's `src/assets/media/<clip>.png` and writes
   `src/data/media.json`. The manifest never names a key that is not in the bucket.

`--keep <clip>` (repeatable, or ids separated by commas) keeps a loop the site already shows
instead of the capture's: when a new take shows an Etch bug, the loop is not published, and the
bug is reported rather than worked around on camera. The capture need not have that clip. The
command takes the loop from the site's `src/data/media.json` and its poster as they are, checks
that its files still read back from the bucket, and writes it with `etch`, the version it was
captured for, which is also its keys' prefix (etch-website spec section 5.2).

```powershell
pnpm media publish --site ..\etch-website --keep snapshot
```

A failure in steps 1–3 leaves the site's checkout untouched. The command does not commit, push or
open a pull request: the site's change goes through the team's pull request process like any
other.

## Evidence for a pull request

`pnpm media evidence` makes the screenshots, and on request a recording, that show a pull
request's change in VS Code (CONTRIBUTING.md, Evidence). It uses the captures' VS Code and
window (VS Code 1.142.0, 2560 × 1440 at device scale 1, a throwaway profile and workspace) and
runs the steps of a scenario file. With `--before`, it runs the same steps against another
checkout's Etch first, so "before" and "after" show the same files in the same window.

```powershell
pnpm media evidence packages/media/evidence/sprite-hover.json --before ..\etch-main
pnpm media evidence packages/media/evidence/references.json --record
```

| Option     | Default                    | Meaning                                                                                       |
| ---------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| `--before` | none                       | a checkout of the code before the change, with `pnpm install` run: its Etch is "before"     |
| `--record` | off                        | also record each side: Playwright's recording of the window, cut to the steps, as an MP4      |
| `--ffmpeg` | `ffmpeg` on the `PATH`     | FFmpeg, which cuts the recording                                                              |
| `--game`   | `ETCH_GAME_PATH`, or Steam | the EU4 folder (`etch.gamePath`)                                                              |
| `--work`   | `C:\etch-evidence`         | VS Code's folder; outside the user folder, so no picture shows the account name in a path    |

A checkout for `--before` is a worktree of `main`:
`git worktree add --detach ..\etch-main origin/main`, then `pnpm install` in it. Each side
builds its own extension first.

The output goes into the git-ignored `packages/media/out/evidence/<scenario>/`: `before/` and
`after/` with one PNG per shot and `recording.mp4`, and `evidence.md`, an Evidence section that
pairs the shots in a before/after table and names the build of each side. The command prints
the `gh pr comment` line that posts it with one `--attach` per file. Look at every picture
first. A shot that shows the home folder's path prints a warning: crop it out with `clip`.

### Scenario files

A scenario is a JSON file. The ones in `packages/media/evidence/` are examples to copy; a
scenario for one pull request can stay out of Git.

| Key        | Meaning                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------- |
| `mod`      | the mod copied into the workspace, relative to the scenario file (default: the demo mod)   |
| `open`     | the file VS Code opens first, relative to the mod                                            |
| `settings` | user settings over the captures' ones; hovers are on (`editor.hover.enabled`)                |
| `steps`    | the steps, in order; each has one action                                                     |

| Step                                                   | What it does                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `{ "wait": 2000 }`                                     | waits that many milliseconds: for Etch to read the mod after launch, a hint to come |
| `{ "open": "etch_demo.gfx" }`                          | opens a file through Quick Open, by its name                                     |
| `{ "find": "GFX_close", "caret": "start" }`            | selects the one match of the text in the editor; `caret` collapses the selection to its start or end |
| `{ "hover": true }`                                    | opens the hover at the cursor and waits for it                                    |
| `{ "command": "View: Close Primary Side Bar" }`        | runs a command from the palette, by its title                                    |
| `{ "key": "Shift+F12", "times": 1 }`                   | presses a key (Playwright's names: `Control+Enter`, `Escape`, `F2`)              |
| `{ "type": "GFX_new_name", "delayMs": 60 }`            | types text, a key at a time                                                      |
| `{ "click": "Apply" }`                                 | clicks a button by its label                                                     |
| `{ "shot": "hover", "clip": { "x": 0, "y": 0, "width": 1100, "height": 1000 } }` | a PNG of the window, or of the `clip` part of it at 1:1, never scaled |

Any step can add `"until": "<selector>"`: after the action, it waits up to 15 s until an
element of the selector shows, then half a second for it to take the focus. The selector is
Playwright's: CSS, as `.peekview-widget` after Shift+F12 or `.rename-box input` after F2, or a
role, as `role=button[name="Apply"]` after Control+Enter in the rename box. Without `until`, a
key pressed next can go to the editor before the new element takes the focus. A step that fails
stops the run and saves the window as `failed.png`.

The run needs no game. Playwright sends the keys to VS Code itself, not through the system
keyboard, but VS Code must keep its focus: do not click into its window while it runs. In the
EU4 engine lab it runs under the game lock, as a capture does.

## Media refresh checklist

1. **The Paradox User Agreement.** Compare the "Last update" date of the
   [Paradox User Agreement](https://legal.paradoxplaza.com/eula) with **2026-01-21**. If it has
   changed, re-read sections 5 and 6 and check trigger 4 of the Etch site specification's
   section 1.1 (sections 5–6 changed in a way that weakens our reading) before uploading
   anything; if it fires, stop and write to Paradox first.
2. Check out Etch at the release tag and run `pnpm install`; build the plugin and run
   `pnpm pins` for the live take.
3. `pnpm media capture --save <file>` (see [Before capturing](#before-capturing) and
   [The live take](#the-live-take)); in the EU4 engine lab, under its game lock.
4. Review every loop ([Reviewing](#reviewing)); fix an edit with `--reedit`.
5. In an up-to-date etch-website checkout, create a branch for the refresh.
6. With the upload token in the user environment variables,
   `pnpm media publish --site <that checkout>`.
7. In the site, `npm run check:media`: it sends `HEAD` to every loop through
   `media.happydwarf.dev` and checks the status, type and length.
8. Commit `src/data/media.json` and `src/assets/media/` and open the site's pull request; its
   description names the Etch version and links the capture's Etch release.
9. After it merges and deploys, look at the loops on etch.happydwarf.dev.

## The demo mod and the province view

Since 2.0.0 the clips edit the province view, the window modders change most: each take copies
the base game's `interface/provinceview.gui` from the local game into the workspace, beside the
demo mod's own files, and opens it. The copy lives only in the throwaway run folder; no game file
enters the repository or the media bucket. The preview draws it in its profile's views with
generated sample data; no save is read (the live take's save is the game's, not the preview's).

`packages/media/demo-mod` is the **Etch demo mod** (MIT, not on the Steam Workshop, not playable):
a descriptor, `interface/etch_demo.gui` with a dialog in the style of an event and a small panel,
`interface/etch_demo.gfx`, `localisation/etch_demo_l_english.yml`, `events/etch_demo_events.txt`
and `interface/assets/etch_demo_models.gfx`. The event file has two events that are never fired
(`is_triggered_only`): `names` edits the first; the second, a province event, has the development
effect and the trigger for `run` and a ruler's name, ASCII in the file, for `encoding`. The models
`.gfx`, in the folder where the game reads pdxmeshes, has one `pdxmesh` that names the base game's
carrack mesh, its textures and its idle animation, for `hovers` and the demo loop's mesh chapter;
no entity uses it, and the live take leaves it out with `events/`. Its files are our own text;
they name base-game EU4 1.37.5 sprites, meshes, textures and fonts, so the preview looks like EU4
while no game file enters the repository. No DLC-only art, no other mod, no textures of our own,
English only.

The demo mod is the workspace (its descriptor names the mod); the 0.x scenes edited its dialog,
which no clip uses since 2.0.0. The takes find their edits by text in the game's file
(`packages/media/src/clips.ts` and `live.ts`, e.g. the trade node button's `x = 251 y = 551`), so a game
patch that changes those texts fails the run.

## The paint marker

After each `draw`, the preview webview writes `data-paint-id` (the draw's id, the same as
`PreviewPaint.id`) and `data-paint-result` (`ok`, `problems`, `blank` or `failed`) onto
`canvas#screen` (`packages/extension/webview/paint-marker.ts`,
[.github#23](https://github.com/happy-dwarf-team/.github/issues/23)). It ships in release builds,
carries no file or window name and sends nothing anywhere; it is unstable and meant only for
Etch's own tools. The script reads the id before a step, performs the step, and waits until the
id has grown and no new paint has come for 300 ms; a timeout, or a `failed` or `problems` result
the clip does not declare, fails the run. The host defers renders while the preview is hidden, so
takes keep it visible.
