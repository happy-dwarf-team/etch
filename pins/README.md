# Pinned builds

`game-builds.json` pins the game-side builds every Etch release carries into
the private install (ADR 0004, ADR 0005): Anvil with `anvil-game`, Bellows
and Tongs, each one release asset of the team's GitHub releases, identified by
its SHA-256. It also pins the game build the live game starts. Etch's own
game plugin is not pinned: it is built from `plugin/` in the same commit
(etch#45).

## The file

JSON; unknown fields are errors. Hashes are uppercase hexadecimal SHA-256.

| Field | What it holds |
| --- | --- |
| `formatVersion` | `1` |
| `game` | `version` and `exeSha256` of the only `eu4.exe` the live game starts: 1.37.5 (Steam, win64), the build of the precision corpus |
| `builds` | one entry per pinned build, below |

| Build field | What it holds |
| --- | --- |
| `id` | lowercase id; the `build` of its files in `game/manifest.json` |
| `name` | the component's name in the notices |
| `tag` | the release tag, `vX.Y.Z` |
| `url` | the release asset, `https://github.com/happy-dwarf-team/<repo>/releases/download/<tag>/<asset>.zip` |
| `sha256` | the asset's SHA-256, as `gh release view <tag> --repo happy-dwarf-team/<repo> --json assets` shows it in `digest` |
| `into` | the folder of the game folder the archive's paths go under, ending in `/`; left out for the game folder itself |
| `files` | the archive paths taken; a path ending in `/` takes every file under it. Each file is copied byte for byte |
| `licenses` | `component`, `spdx` and `file` (an archive path among the files taken) of the build itself, first, and of each component compiled into it |

Only what the live game loads is taken, with its licence texts: from Anvil
`version.dll`, `anvil/anvil.toml` and `anvil-game`, but not `anvil-overlay`
(its notices would be drawn into the captures), `AnvilManager.exe` or the
example plugins, and so not the licences of Dear ImGui and miniz, which only
those contain. From Bellows its whole plugin folder, which goes to
`anvil/plugins/bellows/`. From Tongs its plugin folder without `include/`
(the headers of `tongs.ui` and `tongs.navigation`, which Etch's plugin
vendors), to `anvil/plugins/tongs/`: the live game loads Tongs for those
in-process services only, and the private install removes `anvil/data/tongs/settings.toml` and the
`ANVIL_TONGS_*` variables before every start, so Tongs keeps its defaults
(`enabled = false`: no pipe, input or game calls; v2 specification section 6).

## What packaging does

`pnpm pins` (and `pnpm package`, which runs it) is the pin and notices check
of the `windows` job:

1. It checks the file: every field, and that each licence is MIT,
   Apache-2.0, BSD-2-Clause, BSD-3-Clause or BSL-1.0 (ADR 0004).
2. It downloads each asset (kept by hash in
   `packages/extension/node_modules/.cache/etch-pins/`) and refuses it unless
   its SHA-256 is the pinned one.
3. It takes the `files`, and fails when one is missing from the archive, when
   a licence text does not read as its `spdx`, or when a file that looks like
   a licence is taken but not declared.
4. Once `plugin/CMakeLists.txt` exists, it requires the plugin's build at
   `plugin/dist/etch/` (its `plugin.toml`, entry DLL and the rest of the
   Anvil plugin folder) and takes it whole for `anvil/plugins/etch/`.
5. It fails when two builds would write one path, and stages everything in
   `packages/extension/game/` in the private install's layout, with
   `game/manifest.json`: the `game` pin and every file's `path` (relative to
   the game folder), `sha256` and `build`. etch#48 installs from it and checks
   the installed files against it before every live game start.
6. It writes `THIRD-PARTY-NOTICES.md` at the VSIX root: Etch, each pinned
   build with its release and hash, and each component compiled into it, with
   the path of its licence text in the VSIX.

`package.mts` then checks that the VSIX holds exactly the bundles, the
documents and the staged files.

## Changing a pin

A pinned build changes only through a hand-written `build(deps)` pull request
(scope `pins`), which releases a patch (ADR 0004). Change `tag`, `url` and
`sha256` together, check the new release's licence files and its archive
layout against `files` and `licenses`, run `pnpm pins`, and say in the pull
request what changed in the notices. A new Anvil release also means building
the plugin against that release's SDK.
