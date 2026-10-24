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
2. `pnpm media publish --site <etch-website checkout>` uploads the loops and writes the site's
   files. It comes with [etch#89](https://github.com/happy-dwarf-team/etch/issues/89).

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
