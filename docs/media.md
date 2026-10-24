# Etch's media

The screenshots and the demo loop on [etch.happydwarf.dev](https://etch.happydwarf.dev/) are
captured by `packages/media` (`@etch/media`), a private package that never ships in the VSIX.
Its contract (scenes, framing, encoding, the paint marker) is the Etch site specification's
section 8, [Media pipeline](https://github.com/happy-dwarf-team/etch-website/blob/main/docs/spec.md#8-media-pipeline-work-in-etch);
change a rule there first. Media are made on the maintainer's Windows machine, never in CI: they
need EU4 and they show its art.

A media refresh has two steps with a human review between them:

1. `pnpm media capture` captures and encodes into the git-ignored `packages/media/out/v<version>/`.
   It publishes nothing.
2. `pnpm media publish --site <etch-website checkout>` uploads the loops to the media bucket and
   then writes the posters, stills and media manifest into the site's checkout. It commits
   nothing.

A media refresh is due after an Etch release that changes what any scene shows, not after every
release; the site keeps the last published set. [The checklist](#media-refresh-checklist) at the
end lists every step.

## Before capturing

- Windows 11 with display scaling at 100 %, on a visible, unlocked desktop. The capture opens a
  VS Code window of 2560 × 1440 device pixels at the top left of the primary monitor; do not
  touch it, cover it with another always-on-top window or minimise it while a scene runs.
- EU4 1.37.5 from Steam (Etch finds it through Steam, or pass `--game`). The game is never started:
  Etch only reads its files. The base game is enough; no DLC or other mod is used.
- The player's `settings.txt` with `game_ui_scale=1.000`: a preview notice the scene does not
  expect fails the run.
- FFmpeg 8.1 or newer, full build (`gfxcapture`, `libvpx-vp9`, `libx264`), on the `PATH` or
  passed with `--ffmpeg`.
- `pnpm install`. The first run downloads the pinned VS Code into the work folder.

## Capturing

```powershell
pnpm media capture                       # every scene
pnpm media capture --scene hero          # one scene; --scene pin,outline for several
pnpm media capture --recorder playwright # record loops with Playwright instead of gfxcapture
```

| Option       | Default                     | Meaning                                                   |
| ------------ | --------------------------- | --------------------------------------------------------- |
| `--scene`    | all                         | scene ids: `hero`, `preview`, `pin`, `outline`, `problems`, `resolution`, `playset` (`preview` is taken during the `hero` run) |
| `--recorder` | `gfxcapture`                | how loops are recorded: FFmpeg's lossless `gfxcapture` master, or Playwright's `recordVideo` |
| `--ffmpeg`   | `ffmpeg` on the `PATH`      | FFmpeg; `ffprobe` is taken from beside it                  |
| `--game`     | Steam, or `ETCH_GAME_PATH`  | the EU4 folder, as `etch.gamePath`                         |
| `--work`     | `%TEMP%\etch-media`         | a short folder for VS Code and its throwaway profiles (VS Code fails under a path longer than MAX_PATH) |

The command builds the extension, then runs each scene in a fresh VS Code 1.142.0 launched
through Playwright's Electron driver: Etch loaded from `packages/extension`, a new profile seeded
with the framing settings, an empty extensions folder and a copy of `packages/media/demo-mod` as
the workspace, so no edit reaches the repository. The scene drives VS Code with the keyboard, and
every step that changes the preview waits for Etch's paint marker (below). Before each capture the
script checks the framing: the preview at 1280 × 720 shown unscaled (one game pixel, one device
pixel), no preview notice, toast, Find widget, hover, suggestion or unexpected quick pick. Any
failure stops the run and leaves `masters/<scene>.failed.png`.

A run of every scene takes about three minutes. It writes into `packages/media/out/v<version>/`:

| File                      | What                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| `<scene>.png`             | stills, and the loop's poster (its first frame), 2560 × 1440          |
| `hero.webm`, `hero.mp4`   | the loop, 1920 × 1080, 30 fps, silent: VP9 two-pass CRF 34, H.264 CRF 23 |
| `media.draft.json`        | the media manifest with local file names (etch-website spec section 5.2) |
| `capture.json`            | the log: Etch version and commit, VS Code, FFmpeg, each scene's run   |
| `masters/`                | the lossless master, the cut loop, failure screenshots                |

The loop is cut from its master by its first keystroke, which `freezedetect` finds as the
master's first change: it starts 1.5 s before it and ends at the second undo, whose result is the
loop's first frame, so the loop closes without a cut.

## Reviewing

Look at every frame before anything is published:

- Every still and the whole loop show the editor and Etch's preview together, nothing else of
  VS Code's that the scene does not need (Welcome, notifications, other extensions, the pointer).
- The preview is sharp at actual size, and the edits show what the scene table says.
- The loop's last frame runs into its first without a jump.
- Sizes: the specification aims at about 1.5 MB for the hero WebM; adjust `VP9_CRF` and
  `H264_CRF` in `packages/media/src/config.ts` only through the specification.

Known artefacts of the capture setup, not of Etch: VS Code's title bar says
`[Extension Development Host]`, and the resolution quick pick's **Native** shows the monitor's
resolution as Chromium sees it under the forced device scale (1720 × 720 on a 3440 × 1440 monitor).

## Publishing

```powershell
pnpm media publish --site ..\etch-website              # the capture of the current version
pnpm media publish --site ..\etch-website --etch 0.2.0 # the capture in out/v0.2.0/
```

The loops go to the R2 bucket `happydwarf-media` behind `media.happydwarf.dev` (the hub
specification's section 7). Its key for a loop file is `etch/v<version>/<scene>.<hash8>.<webm|mp4>`,
where `<hash8>` is the first 8 hex digits of the file's SHA-256. A key therefore never changes
its content, and every object is uploaded with `Cache-Control: public, max-age=31536000, immutable`
and the file's media type (`video/webm`, `video/mp4`) as its `Content-Type`.

The upload token is the Account API token `happydwarf-media-upload` (Object Read & Write on
`happydwarf-media` only, one year), in two **user** environment variables:
`HAPPYDWARF_MEDIA_ACCESS_KEY_ID` and `HAPPYDWARF_MEDIA_SECRET_ACCESS_KEY`. Set them in Windows'
user environment variables, never in a `.env` file, a script or a CI secret, and open a new
terminal afterwards. Without both the command stops before it reads anything; it never prints
their values. The bucket name and the account's S3 endpoint are in
`packages/media/src/config.ts`.

The command:

1. Reads `media.draft.json` of the capture and checks that it is complete: the `hero` loop with
   its poster and all six stills, every image a 2560 × 1440 PNG, every loop file the size the
   draft says. It checks that `--site` is an etch-website checkout.
2. Uploads each loop file with `PutObject` and `If-None-Match: *`, so it never overwrites a key.
   When the bucket answers `412` the key exists: an object of the same size and type counts as
   already uploaded (`Kept …`), and anything else stops the run. So `publish` can run again
   without capturing again.
3. Reads every key back with `HeadObject` and checks its size and type.
4. Only then copies the posters and stills to the site's `src/assets/media/<scene>.png` and writes
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
2. Check out Etch at the release tag and run `pnpm install`.
3. `pnpm media capture` (see [Before capturing](#before-capturing)).
4. Review every still and the whole loop ([Reviewing](#reviewing)).
5. In an up-to-date etch-website checkout, create a branch for the refresh.
6. With the upload token in the user environment variables,
   `pnpm media publish --site <that checkout>`.
7. In the site, `npm run check:media`: it sends `HEAD` to every loop through
   `media.happydwarf.dev` and checks the status, type and length.
8. Commit `src/data/media.json` and `src/assets/media/` and open the site's pull request; its
   description names the Etch version and links the capture's Etch release.
9. After it merges and deploys, look at the loop and the stills on etch.happydwarf.dev.

## The demo mod

`packages/media/demo-mod` is the **Etch demo mod** (MIT, not on the Steam Workshop, not playable):
a descriptor, `interface/etch_demo.gui` with a dialog in the style of an event and a small panel,
`interface/etch_demo.gfx` and `localisation/etch_demo_l_english.yml`. Its files are our own text;
they name base-game EU4 1.37.5 sprites, textures and fonts, so the preview looks like EU4 while no
game file enters the repository. No DLC-only art, no other mod, no textures of our own, English
only.

The scenes find their edits by text (`packages/media/src/scenes.ts`): keep those texts unique in
their file, keep the first option button's block a few lines below the dialog's `size` (the loop
walks there with the arrow keys), and keep each loop edit one keystroke over one digit, so no
intermediate value collapses the window.

## The paint marker

After each `draw`, the preview webview writes `data-paint-id` (the draw's id, the same as
`PreviewPaint.id`) and `data-paint-result` (`ok`, `problems`, `blank` or `failed`) onto
`canvas#screen` (`packages/extension/webview/paint-marker.ts`,
[.github#23](https://github.com/happy-dwarf-team/.github/issues/23)). It ships in release builds,
carries no file or window name and sends nothing anywhere; it is unstable and meant only for
Etch's own tools. The script reads the id before a step, performs the step, and waits until the
id has grown and no new paint has come for 300 ms; a timeout, or a `failed` or `problems` result
the scene does not declare, fails the run. The host defers renders while the preview is hidden, so
scenes keep it visible.
