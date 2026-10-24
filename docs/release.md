# Releasing to the extension stores

Merging the release-please pull request tags `vX.Y.Z`, and `release.yml` then
builds that commit and publishes one file, `etch-win32-x64-X.Y.Z.vsix`, three
times (ADR 0004):

| Job           | Where                                                                                                      | Authentication                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `publish`     | the GitHub release, with `SHA256SUMS.txt` and a provenance attestation                                      | `GITHUB_TOKEN`                                             |
| `marketplace` | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=happy-dwarf-team.etch)            | secret `VSCE_PAT` if set, otherwise upload by hand          |
| `open-vsx`    | [Open VSX](https://open-vsx.org/extension/happy-dwarf-team/etch)                                            | secret `OVSX_PAT` if set, otherwise OIDC trusted publishing |

The store jobs start after the GitHub release has its assets and pass
`--skip-duplicate`, so a failed job can be re-run alone. The VSIX contents are
checked by `pnpm package` on every pull request (`package.mts`, and the
pinned builds and notices by `stage-game.mts`, pins/README.md); the stores
show the extension's `README.md`, `CHANGELOG.md`, icon and `preview` flag.

## Authentication

ADR 0004 chose OIDC trusted publishing for both stores, so that no publishing
token lives in the repository. As of October 2026 neither store allows it for
the first release:

- **VS Code Marketplace.** `vsce publish --oidc` exists in `@vscode/vsce`
  4.0.0 (hidden from `--help`), but the Marketplace does not yet let a
  publisher register a trusted publishing policy, and the token exchange of
  4.0.0 predates the Marketplace's contract (fixed in the 4.0.1 pre-releases).
  The other automatic routes need Azure: a personal access token needs an
  Azure DevOps organization, and new organizations need an Azure subscription
  (since late 2025); Azure DevOps retires the global tokens the Marketplace
  needs on 1 December 2026; Microsoft Entra ID (`--azure-credential`) needs an
  Azure identity. Etch therefore uploads to the Marketplace **by hand** until
  `--oidc` works: without a `VSCE_PAT` secret the `marketplace` job publishes
  nothing, succeeds, and leaves a warning and a step summary with the
  release's VSIX link. A `VSCE_PAT` from an existing Azure DevOps organization
  still makes the job publish.
- **Open VSX.** `ovsx publish --trusted-publishing` (ovsx 1.1.0 and later)
  works, but a trusted publisher can only be registered for an extension that
  already has a version, by a namespace owner. The first release publishes
  with `OVSX_PAT`; afterwards the maintainer registers the trusted publisher
  and deletes the secret, and the job switches to OIDC by itself.

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

## Each release

The `marketplace` job's summary links the VSIX. Download it from the GitHub
release and, at
<https://marketplace.visualstudio.com/manage/publishers/happy-dwarf-team>,
upload it: **New extension → Visual Studio Code** the first time, **Update**
on the extension afterwards. The Marketplace scans the file and lists it after
a few minutes.

After a release that changes what any media scene shows, do a media refresh
([docs/media.md](media.md#media-refresh-checklist)); release-please triggers none.

## After the first release

1. Once the Open VSX namespace is owned, register a trusted publisher for
   `happy-dwarf-team.etch` on
   <https://open-vsx.org/user-settings/trusted-publishers>: GitHub Actions,
   owner `happy-dwarf-team`, repository `etch`, workflow `release.yml`, no
   environment.
2. Delete the `OVSX_PAT` repository secret and revoke the token. A set
   `OVSX_PAT` always wins over trusted publishing.
3. When the Marketplace offers trusted publishing policies, register one for
   `release.yml`, update `@vscode/vsce` to a version with the current token
   exchange, and switch the `marketplace` job to `vsce publish --oidc` with
   `id-token: write`.
