# Contributing to Etch

## Pull requests

Every change goes to `main` through a pull request; nobody pushes to `main`
directly. A pull request needs the `windows` check (typecheck, lint, format,
tests, the plugin, VSIX package) and the `conventional-title` check
to pass, and is **squash-merged**: the pull request title becomes the single
commit on `main` and, through it, the changelog entry. Keep one topic per pull
request; split unrelated changes.

Research and prototypes go on `research/*` and `prototype/*` branches, which
are pushed and never merged (specification, section 13).

## Commit and pull request titles

Titles follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <summary in the imperative, lowercase, no period>
```

| Type       | Use for                                        | Release | Changelog   |
| ---------- | ---------------------------------------------- | ------- | ----------- |
| `feat`     | new capability for mod authors                 | minor   | Features    |
| `fix`      | bug fix                                        | patch   | Bug Fixes   |
| `perf`     | faster or lighter, same behaviour              | patch   | Performance |
| `revert`   | reverting an earlier change                    | patch   | Reverts     |
| `build`    | packaging, pinned builds, shipped dependencies | patch   | Build       |
| `docs`     | documentation only                             | none    | hidden      |
| `refactor` | code change without behaviour change           | none    | hidden      |
| `test`     | tests only                                     | none    | hidden      |
| `ci`       | GitHub Actions, Dependabot                     | none    | hidden      |
| `chore`    | anything else (dev dependencies, release PRs)  | none    | hidden      |

Scopes in use: `core`, `renderer`, `extension`, `plugin`, `corpus` and
`pins`. A scope is optional; leave it out when a change spans several.

Breaking changes: add `!` after the type or scope (`feat(extension)!: ...`)
and a `BREAKING CHANGE: <what breaks and how to migrate>` paragraph in the pull
request description. Since 1.0.0 a breaking change bumps the major version.

## Versions and releases

Releases are automated with
[release-please](https://github.com/googleapis/release-please). The whole
repository has one version (ADR 0004):

1. Each push to `main` updates a pull request titled
   `chore(main): release x.y.z`. It bumps the version in `package.json`,
   `packages/extension/package.json` and `plugin/plugin.toml` and adds the
   `CHANGELOG.md` section, both
   computed from the Conventional Commits since the last release. It appears
   only once a commit of a visible type (`feat`, `fix`, `perf`, `revert`,
   `build`) has landed.
2. Merging that pull request tags `vX.Y.Z` and creates the GitHub release with
   the changelog section as release notes.
3. The release workflow then builds the tagged commit and attaches
   `etch-win32-x64-X.Y.Z.vsix` and `SHA256SUMS.txt`, with a build provenance
   attestation (`gh attestation verify <vsix> -R happy-dwarf-team/etch`).
4. It publishes the same VSIX to Open VSX. The VS Code Marketplace gets it by
   hand until the Marketplace offers trusted publishing.
   [docs/release.md](docs/release.md) describes the store accounts, the
   repository secrets and each release's steps.

Do not edit the versions or `CHANGELOG.md` by hand; packaging fails when the
two `package.json` versions differ, and the plugin's build when
`plugin/plugin.toml` differs from `package.json`. To force a specific next version, put
`Release-As: x.y.z` in the body of a commit on `main`. Merging the release pull
request publishes to both stores at once, so it is merged only on the
maintainer's go-ahead.

Until 2.0.0 no store release came from `main` (ADR 0005, v2 specification
section 13), and 2.0.0 was released with `Release-As: 2.0.0`. Fixes for 1.0.x
(bugs only) went by pull request to `release/1.x`, cut at `v1.0.1`, which
released them with its own release-please pull request until 2.0.0 and gets
none after. [docs/release.md](docs/release.md) has the steps.

## Repository layout

A pnpm workspace (ADR 0001):

| Folder               | Holds                                                          |
| -------------------- | -------------------------------------------------------------- |
| `packages/core`      | parser, model, layout, draw list, diagnostics; never `vscode`  |
| `packages/renderer`  | WebGL2 drawing in the preview webview                          |
| `packages/extension` | VS Code glue and the VSIX manifest                             |
| `packages/compare`   | the precision corpus's headless comparison; never shipped      |
| `packages/media`     | the Etch site's media: demo mod, clips (docs/media.md); never shipped |
| `plugin`             | the live game's Anvil plugin (C++, CMake, Anvil SDK)           |
| `corpus`             | precision corpus manifest and capture records (no screenshots) |
| `pins`               | pinned game-side builds: release tag, URL and SHA-256 (pins/README.md) |
| `profiles`           | window profiles Etch ships, by source, and their JSON Schema (ADR 0006) |
| `docs/adr`           | architecture decisions                                         |
| `docs/spec`          | the v1 and v2 specifications (frozen) and after-v2.md (living) |

Workspace packages are TypeScript sources that esbuild bundles into the
extension and the webview script. The VSIX has no runtime dependencies besides
the VS Code API; anything that would ship in it must be MIT, Apache-2.0, BSD or
BSL-1.0 (ADR 0004). Packaging also puts the pinned builds of Anvil and Bellows
into it unchanged, with their licence texts, and writes
`THIRD-PARTY-NOTICES.md` from `pins/game-builds.json`.

## Building and testing

Node.js 22.18 or later (build scripts are TypeScript run by Node directly) and
the pnpm version in `package.json`:

```powershell
pnpm install
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit       # Vitest
pnpm --filter @etch/renderer exec playwright install chromium   # once
pnpm test:renderer   # Playwright: WebGL2 in Chromium (renderer and corpus comparison)
pnpm test:extension  # @vscode/test-electron: downloads VS Code into .vscode-test
pnpm pins            # download and check the pinned builds, stage them, write the notices
pnpm package         # packages/extension/dist/etch-win32-x64-<version>.vsix (runs pnpm pins)
```

`pnpm format` rewrites files with Prettier. Markdown is not formatted; keep its
line breaks and tables as they are.

### The plugin

`plugin/` is a CMake project of its own, built with Visual Studio 2022 (or its
Build Tools) and CMake 3.28 or later against the Anvil SDK that
`plugin/CMakeLists.txt` pins by release URL and SHA-256. The `windows` check
builds it with `/W4 /WX`, runs its tests and `anvil check`, and checks the
format with clang-format 21.1.8:

```powershell
cmake -S plugin -B plugin/build -G "Visual Studio 17 2022" -A x64
cmake --build plugin/build --config Release
ctest --test-dir plugin/build -C Release --output-on-failure
pipx run --spec clang-format==21.1.8 clang-format -i (git ls-files 'plugin/*.cpp' 'plugin/*.hpp')
```

The build leaves the plugin folder in `plugin/build/plugin/etch/` (`etch.dll`,
`plugin.toml`, `symbols.toml`). `pnpm package` needs it installed, with
`LICENSE`, in `plugin/dist/etch/`, which it stages for
`<private install>/anvil/plugins/etch` (pins/README.md):

```powershell
cmake --install plugin/build --config Release --component plugin --prefix plugin/dist
```

The pipe between the plugin and the extension is described in
[docs/plugin-protocol.md](docs/plugin-protocol.md).

`plugin/symbols.lock` records that `plugin/symbols.toml` was checked against
the pinned `eu4.exe`. After changing `symbols.toml`, run
`anvil check plugin --exe "<game folder>/eu4.exe"` with the SDK's
`anvil.exe` (its path is in `plugin/build/anvil-tool.txt`) and commit the
lock; CI, which has no game, only checks that it matches.

The reload budgets and the precision corpus are measured on the maintainer's
machine, not in CI (ADR 0004): shared runners are too noisy to time, and the
corpus needs a licensed game. A change that touches the reload path says in the
pull request what was measured: [docs/budgets.md](docs/budgets.md) says how,
and a new result goes there. Every run of the game follows the EU4 engine
lab's procedure: `eu4.exe`, saves and mods are never changed, and a process is
closed only after its PID, path and creation time are checked. Only one game
or heavy run (a corpus capture, a live game check, `compare --gpu`) runs on the
machine at a time, under the lab's game lock for its whole length: a second one
skews the first one's timings.

These runs print progress for every view or window. When watching one, follow
only the lines that end it or need action:

| Run                                                  | Ends with                                     | Needs action                                                          |
| ---------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| corpus driver (`packages/core/src/corpus/driver`)    | `run <id>: … captured, … failed` and `report:` | `<view>: FAILED:`, `session failed:`, `crashed`, `game lock is held by` |

Screenshots and other game assets never enter Git.
