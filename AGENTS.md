# Etch: repository rules

- VS Code extension with a fast, game-faithful preview of EU4 interface mods: an offline
  renderer and a game host (the Anvil plugin in `plugin/`). What Etch does is in the
  [v1 specification](docs/spec/v1.md) and the decisions in [docs/adr/](docs/adr/); read the
  section a change touches first. The v1 specification is frozen at 1.0.0 and describes 1.x;
  `main` is built to the [v2 specification](docs/spec/v2.md), living until 2.0.0. Open points
  of the offline renderer stay in [docs/spec/after-v1.md](docs/spec/after-v1.md). Terms in
  [GLOSSARY.md](GLOSSARY.md), budgets in [docs/budgets.md](docs/budgets.md).
- [CONTRIBUTING.md](CONTRIBUTING.md) holds the titles and scopes, the `research/*` and
  `prototype/*` branches (pushed, never merged), releases, the repository layout, and the
  build and tests, including the game host plugin. Run its checks before finishing a change;
  the `windows` CI job runs all of them.
- No EU4 or Paradox assets in the repository, and do not imply affiliation with Paradox
  Interactive. English in code and docs.
- The agent owns the pull request flow: it works on a branch with Conventional Commits,
  pushes it and opens the PR as a draft. Once ready (green CI, the change tested as above,
  no blocking review findings, not put on hold by the user) it marks the PR ready and
  squash-merges it; GitHub does not allow auto-merge on a draft. Pull requests from other
  contributors get a review and a recommendation; the maintainer decides on merging them.
  Do not bypass CI or branch protection, and do not change repository settings beyond what
  auto-merge needs.
