# Etch's media

The loops on [etch.happydwarf.dev](https://etch.happydwarf.dev/), the hero's and one per
feature, are made by `packages/media` (`@etch/media`), a private package that never ships in the
VSIX. Its contract (clips, framing, the edit, encoding, the paint marker) is the Etch site
specification's section 8,
[Media pipeline](https://github.com/happy-dwarf-team/etch-website/blob/main/docs/spec.md#8-media-pipeline-work-in-etch);
change a rule there first. Media are made on the maintainer's Windows machine, never in CI: they
need EU4 and they show its art.

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
  awake. A take opens a VS Code window of 2560 × 1440 pixels (device scale 1, editor font 14, as
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
pnpm media capture --save <file.eu4>      # every clip; the live clips play the save
pnpm media capture --clip views           # one clip; --clip views,data for several
pnpm media capture --clip reload,pick,snapshot --save <file.eu4> # the live take
pnpm media capture --clip hero            # the trailer, from the rendered preview, reload and pick
pnpm media capture --clip data --reedit   # edit and render again from the take, no new take
```

| Option     | Default                    | Meaning                                                                                                               |
| ---------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `--clip`   | all                        | clip ids: `hero`, `preview`, `views`, `data`, `zoom`, `outline`, `problems`, `reload`, `pick`, `snapshot`             |
| `--save`   | none                       | the live take's save: a base-game save, not ironman, copied into the run; needed for `reload`, `pick` and `snapshot` |
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
menu, a Problems row. Before the take the script checks the framing: the preview at 1280 × 720
shown unscaled (one game pixel, one device pixel), no preview notice, toast, Find widget, hover,
suggestion or unexpected quick pick. Any failure stops the run and leaves
`masters/<clip>.failed.png`.

**The edit.** From the log alone, `clips.ts` builds the clip's edit (`packages/media/src/edit.ts`):
a camera over the master that opens and closes on the wide shot of the whole window (the loop's
seam) and eases to close-ups of what each step changes; an inset of the editor whenever a
close-up leaves it out, so every frame shows the editor and the preview together; captions with
the keys pressed or what happens; rings around what changed; and a drawn pointer where
Playwright's mouse moved (the master has none: Playwright's mouse is not the system pointer).

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
  into its player profile and sets the game windowed at 2560 × 1440; your own files are not
  changed.
- A second monitor of at least 2560 × 1440 right of a 3440-pixel-wide primary, both at 100 %:
  VS Code fills the primary as in the other takes, the game's client area goes to the second
  monitor's top left corner (`GAME_ORIGIN` in `packages/media/src/live.ts`).

The run starts VS Code as for the other takes, with one more extension loaded beside Etch:
`packages/media/live-helper`, a helper that only this take loads. Through the value Etch's
`activate` returns (an API for Etch's own tools, not a stable one), it gives the live game the
run's player profile, answers the two first-use confirmations, and turns on Tongs' pipe, with
input, in the run's private install, which lives in the throwaway profile: the user's private
install, profile and saves are never touched. Then the take runs as a user would: **Etch: Open
Preview**, **Etch: Start the Live Game** and the save in its quick pick. Through Tongs' pipe it
waits until the save is loaded, opens the province view of the player's capital and reads where
the buildings panel is. The real pointer waits over the game's interface, since anywhere outside
the client area the game scrolls its map.

It runs one reload unrecorded (the first reload of a freshly opened province view blanks the
province's name, `docs/live-game.md`, and the start state is then the end's), then records both
windows, each by its own `gfxcapture` (the game's with its pointer) on the take's clock: the
reload (one keystroke, Ctrl+S, the panel moves, Ctrl+Z, Ctrl+S), then pick mode (Ctrl+Shift+E in
the game, three widgets hovered, a click on the buildings panel). Closing VS Code stops the live
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

1. Reads `media.draft.json` of the capture and checks that it is complete: all ten loops with
   their posters, every poster a 1920 × 1080 PNG, every loop file the size the draft says. It
   checks that `--site` is an etch-website checkout.
2. Uploads each loop file with `PutObject` and `If-None-Match: *`, so it never overwrites a key.
   When the bucket answers `412` the key exists: an object of the same size and type counts as
   already uploaded (`Kept …`), and anything else stops the run. So `publish` can run again
   without capturing again.
3. Reads every key back with `HeadObject` and checks its size and type.
4. Only then copies the posters to the site's `src/assets/media/<clip>.png` and writes
   `src/data/media.json`. The manifest never names a key that is not in the bucket.

A failure in steps 1–3 leaves the site's checkout untouched. The command does not commit, push or
open a pull request: the site's change goes through the team's pull request process like any
other.

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
`interface/etch_demo.gfx` and `localisation/etch_demo_l_english.yml`. Its files are our own text;
they name base-game EU4 1.37.5 sprites, textures and fonts, so the preview looks like EU4 while no
game file enters the repository. No DLC-only art, no other mod, no textures of our own, English
only.

The demo mod is the workspace (its descriptor names the mod); the 0.x scenes edited its dialog,
which no clip uses since 2.0.0. The takes find their edits by text in the game's file
(`packages/media/src/clips.ts` and `live.ts`, e.g. the buildings panel's `x=480 y=13`), so a game
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
