# Contributing to Etch

## Pull requests

Every change goes to `main` through a pull request; nobody pushes to `main`
directly. A pull request needs the `windows` check (typecheck, lint, format,
tests, VSIX package) and the `conventional-title` check to pass, and is
**squash-merged**: the pull request title becomes the single commit on `main`
and, through it, the changelog entry. Keep one topic per pull request; split
unrelated changes.

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

Scopes in use: `core`, `renderer`, `extension`, and later `plugin`, `corpus`
and `pins`. A scope is optional; leave it out when a change spans several.

Breaking changes: add `!` after the type or scope (`feat(extension)!: ...`)
and a `BREAKING CHANGE: <what breaks and how to migrate>` paragraph in the pull
request description. Before 1.0.0 a breaking change bumps the minor version.

## Versions and releases

Releases are automated with
[release-please](https://github.com/googleapis/release-please). The whole
repository has one version (ADR 0004):

1. Each push to `main` updates a pull request titled
   `chore(main): release x.y.z`. It bumps the version in `package.json` and
   `packages/extension/package.json` and adds the `CHANGELOG.md` section, both
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
two `package.json` versions differ. To force a specific next version, put
`Release-As: x.y.z` in the body of a commit on `main`. Merging the release pull
request publishes to both stores at once, so it is merged only on the
maintainer's go-ahead.

## Repository layout

A pnpm workspace (ADR 0001):

| Folder               | Holds                                                          |
| -------------------- | -------------------------------------------------------------- |
| `packages/core`      | parser, model, layout, draw list, diagnostics; never `vscode`  |
| `packages/renderer`  | WebGL2 drawing in the preview webview                          |
| `packages/extension` | VS Code glue and the VSIX manifest                             |
| `docs/adr`           | architecture decisions                                         |
| `docs/spec`          | the v1 specification                                           |

Workspace packages are TypeScript sources that esbuild bundles into the
extension and the webview script. The VSIX has no runtime dependencies besides
the VS Code API; anything that would ship in it must be MIT, Apache-2.0, BSD or
BSL-1.0 (ADR 0004).

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
pnpm test:renderer   # Playwright: WebGL2 in Chromium
pnpm test:extension  # @vscode/test-electron: downloads VS Code into .vscode-test
pnpm package         # packages/extension/dist/etch-win32-x64-<version>.vsix
```

`pnpm format` rewrites files with Prettier. Markdown is not formatted; keep its
line breaks and tables as they are.

The reload budgets and the precision corpus are measured on the maintainer's
machine, not in CI (ADR 0004): shared runners are too noisy to time, and the
corpus needs a licensed game. A change that touches the reload path says in the
pull request what was measured: [docs/budgets.md](docs/budgets.md) says how,
and a new result goes there. Every run of the game follows the EU4 engine
lab's procedure: `eu4.exe`, saves and mods are never changed, and a process is
closed only after its PID, path and creation time are checked.

Screenshots and other game assets never enter Git.
