# Releasing to the extension stores

Merging the release-please pull request tags `vX.Y.Z`, and `release.yml` then
builds that commit and publishes one file, `etch-win32-x64-X.Y.Z.vsix`, three
times (ADR 0004):

| Job           | Where                                                                                                      | Authentication                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `publish`     | the GitHub release, with `SHA256SUMS.txt` and a provenance attestation                                      | `GITHUB_TOKEN`                                                  |
| `marketplace` | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=happy-dwarf-team.etch)            | OIDC trusted publishing; else secret `VSCE_PAT`; else by hand   |
| `open-vsx`    | [Open VSX](https://open-vsx.org/extension/happy-dwarf-team/etch)                                            | OIDC trusted publishing; else secret `OVSX_PAT`                 |

Once the GitHub release has its assets, `notify-website` (`website.yml`) asks
etch.happydwarf.dev and happydwarf.dev to rebuild, so their badges show the new
version; run `website.yml` by hand to ask again.

The store jobs start after the GitHub release has its assets and pass
`--skip-duplicate`, so a failed job can be re-run alone. The VSIX contents are
checked by `pnpm package` on every pull request (`package.mts`, and the
pinned builds and notices by `stage-game.mts`, pins/README.md); the stores
show the extension's `README.md`, `CHANGELOG.md`, icon and `preview` flag.

## Authentication

ADR 0004 chose OIDC trusted publishing for both stores, so that no publishing
token lives in the repository. Each store job tries it first, and falls back to
a token only when it fails:

- **VS Code Marketplace.** The Marketplace has offered trusted publishing
  since 28 October 2026: a policy on the publisher names a GitHub repository,
  a workflow file and, optionally, an environment, and
  `vsce publish --oidc` (`@vscode/vsce` 4.1.0; 4.0.0's token exchange is
  rejected) exchanges the job's OIDC token for a Marketplace credential valid
  for 15 minutes. `--oidc` never falls back to a token by itself, so the
  `marketplace` job does: if it fails and a `VSCE_PAT` secret is set, the
  token publishes; without either, the job publishes nothing, succeeds, and
  leaves a warning and a step summary with the release's VSIX link to upload
  by hand. Azure DevOps retires the global tokens a `VSCE_PAT` would be on
  1 December 2026, so after that date only OIDC or the hand upload are left.
  The job runs in the `vscode-marketplace` environment, which needs a
  maintainer's approval for each run and allows only `main` and `release/1.x`;
  the policy names that environment.
- **Open VSX.** `ovsx publish --trusted-publishing` (ovsx 1.1.0 and later) is
  tried first. A trusted publisher can only be registered for an extension
  that already has a version, by a namespace owner, which is why the first
  releases went out with `OVSX_PAT`. If trusted publishing fails and
  `OVSX_PAT` is set, the token publishes; without it the job fails.

Each job's step summary says which route published ("published with trusted
publishing (OIDC)" or "published with VSCE_PAT / OVSX_PAT"), with a warning
when it fell back, so a token can be deleted once a release has published
without it.

## One-time setup (maintainer)

1. **Marketplace publisher.** At <https://marketplace.visualstudio.com/manage>,
   signed in with a Microsoft account, create the publisher with ID
   `happy-dwarf-team` (it cannot change later) and name `Happy Dwarf Team`.
2. **Open VSX account.** Create an Eclipse Foundation account at
   <https://accounts.eclipse.org/user/register> with the same GitHub user name
   you log in to <https://open-vsx.org> with. On
   <https://open-vsx.org/user-settings/profile>, log in with Eclipse and accept
   the Publisher Agreement.
3. **Open VSX token and namespace.** Create a token at
   <https://open-vsx.org/user-settings/tokens>, then create the namespace
   (case-sensitive, equal to `publisher`) with the token in `OVSX_PAT`:
   `npx ovsx create-namespace happy-dwarf-team`. Save the token as the
   repository secret `OVSX_PAT`
   (`gh secret set OVSX_PAT --repo happy-dwarf-team/etch`, which prompts for
   the value).
4. **Open VSX ownership.** Claim the namespace in a public issue at
   <https://github.com/EclipseFdn/open-vsx.org/issues/new/choose> ("Claiming
   namespace `happy-dwarf-team`"). Until it is granted the namespace is
   unverified, and an extension with the Marketplace's identifier may stay
   under review.
5. **Marketplace trusted publishing policy.** At
   <https://marketplace.visualstudio.com/manage/publishers/happy-dwarf-team>,
   open the **Trusted Publishing** tab, expand **Create** and fill in:

   | Field            | Value                |
   | ---------------- | -------------------- |
   | Policy name      | `Etch release`       |
   | Repository owner | `happy-dwarf-team`   |
   | Repository       | `etch`               |
   | Workflow         | `release.yml`        |
   | Environment      | `vscode-marketplace` |

   The names must be exact. The repository is public, so the policy does not
   expire before its first use (a private repository's policy must be used
   within 48 hours). The page shows each policy's status and last use.
6. **Open VSX trusted publisher.** Once the namespace is owned, register a
   trusted publisher for `happy-dwarf-team.etch` on
   <https://open-vsx.org/user-settings/trusted-publishers>: GitHub Actions,
   owner `happy-dwarf-team`, repository `etch`, workflow `release.yml`, no
   environment. If the form limits it to a branch, allow `release/1.x` too.

## Each release

Approve the `vscode-marketplace` deployment of the `marketplace` job; it
publishes the release's VSIX. The Marketplace scans the file and lists it after
a few minutes. While it waits, later pushes still update the release pull request.
A deployment no longer needed, because the VSIX was uploaded by hand, can be
cancelled on the run's page.

Read both store jobs' summaries. A warning that trusted publishing failed means
a token published, or for the Marketplace without `VSCE_PAT`, that the VSIX has
to be uploaded by hand: download it from the GitHub release and, at
<https://marketplace.visualstudio.com/manage/publishers/happy-dwarf-team>,
upload it with **Update** on the extension.

After a release that changes what any media clip shows, do a media refresh
([docs/media.md](media.md#media-refresh-checklist)); release-please triggers none.

## After the first release with OIDC

1. When the `open-vsx` summary says "published with trusted publishing
   (OIDC)", delete the `OVSX_PAT` repository secret
   (`gh secret delete OVSX_PAT --repo happy-dwarf-team/etch`) and revoke the
   token at <https://open-vsx.org/user-settings/tokens>.
2. When the `marketplace` summary says the same, delete `VSCE_PAT` if one was
   ever set, and revoke its token in Azure DevOps.

## 1.0.x releases until 2.0.0

`main` builds 2.0.0 and makes no store release before it (ADR 0005): its
release pull request stays open. 1.x fixes (bugs only) are pull requests to
`release/1.x`, cut at `v1.0.1`; its `release.yml` runs release-please against
that branch, so merging its own `chore(release/1.x): release 1.0.x` pull
request publishes 1.0.x as above. After 2.0.0 the branch gets nothing more.

`release/1.x` is protected by the `main` ruleset, which targets it beside the
default branch: changes come by pull request only, squash-merged, with the
`windows` and `conventional-title` checks green, linear history, and no
deletion or force push. The `vscode-marketplace` environment allows deployments
from `main` and `release/1.x`, so the `marketplace` job publishes a 1.0.x
release after the same approval. Before the first one, check that the Open VSX
trusted publisher (when registered) is not limited to `main`.
