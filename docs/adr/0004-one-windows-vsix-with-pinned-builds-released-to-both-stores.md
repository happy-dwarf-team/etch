# One win32-x64 VSIX with pinned builds, one version, released to both extension stores

Etch is MIT throughout, its C++ game plugin included, and it lives in one
repository with one version: release-please (the team's configuration, tags
`vX.Y.Z`, 0.x until the v1 scope ships) bumps the extension and the plugin
together. Each release is a single platform-specific VSIX for `win32-x64` that
carries the pinned builds of Anvil (with `anvil-game`) and Bellows, recorded
in the repository by release URL and SHA-256, plus Etch's own plugin. The same
file goes to the GitHub release (with `SHA256SUMS.txt` and a provenance
attestation), the VS Code Marketplace and Open VSX, published by OIDC trusted
publishing as `happy-dwarf-team.etch`. The stores carry Etch from 0.1.0,
marked `preview` until 1.0.0. The repository goes public with the first pull
request that adds code, together with CI and the team's rulesets.

We chose one repository and one version over a separate plugin repository
with its own releases, because the plugin is useless without the extension and
their pipe protocol changes in step. We chose pinned builds inside the VSIX
over downloading them on first use, because a download would add a network
dependency and a moving target to a game host that refuses anything but known
hashes. We chose a `win32-x64` package with no universal fallback because v1
targets Windows only and the game host cannot run elsewhere. We dropped the
Marketplace pre-release channel because it accepts only `major.minor.patch`
and expects an even/odd minor scheme that release-please does not follow. We
chose OIDC over personal access tokens because Azure DevOps retires global
PATs on 1 December 2026 and OIDC keeps publishing tokens out of repository
secrets.

## Consequences

- Everything inside the VSIX (extension dependencies, the plugin and the pinned
  builds) must be MIT, Apache-2.0, BSD or BSL-1.0; BSL-1.0 is admitted because
  Anvil compiles in SafetyHook. Pinned builds go in unchanged with their own
  licence files, `THIRD-PARTY-NOTICES.md` at the VSIX root lists every
  component, and no game asset is ever packaged.
- A pinned build changes only through a hand-written `build(deps)` pull
  request, which releases a patch; Dependabot covers only workflow actions and
  pnpm dev dependencies. The extension checks the installed files' hashes
  against the VSIX before every game host start.
- Every pull request needs the `windows` and `conventional-title` checks.
  `windows` runs typecheck, ESLint (`strictTypeChecked`) and Prettier, Vitest,
  Playwright, `@vscode/test-electron`, the plugin's CMake build with
  `anvil check plugin`, `clang-format` and `/W4 /WX`, the pin and notices
  checks, and `vsce package --target win32-x64`. The precision corpus and the
  reload budgets gate nothing in CI: the corpus needs a licensed game, and
  shared runners are too noisy to time.
- While the repository is private on GitHub Free it can have no rulesets,
  required checks or auto-merge, so documentation-only pull requests merge as
  before.
- The Marketplace publisher ID cannot change. The verified publisher badge
  (domain `happydwarf.dev`) becomes possible six months after the first
  Marketplace release, and the Open VSX namespace must be claimed as owner,
  or releases with the Marketplace's identifier stay under review.
