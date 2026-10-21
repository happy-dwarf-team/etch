# Releasing to the extension stores

Merging the release-please pull request tags `vX.Y.Z`, and `release.yml` then
builds that commit and publishes one file, `etch-win32-x64-X.Y.Z.vsix`, three
times (ADR 0004):

| Job           | Where                                                                                                      | Authentication                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `publish`     | the GitHub release, with `SHA256SUMS.txt` and a provenance attestation                                      | `GITHUB_TOKEN`                                             |
| `marketplace` | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=happy-dwarf-team.etch)            | secret `VSCE_PAT`                                          |
| `open-vsx`    | [Open VSX](https://open-vsx.org/extension/happy-dwarf-team/etch)                                            | secret `OVSX_PAT` if set, otherwise OIDC trusted publishing |

The store jobs start after the GitHub release has its assets and pass
`--skip-duplicate`, so a failed job can be re-run alone. The VSIX contents are
checked by `pnpm package` on every pull request (`package.mts`); the stores
show the extension's `README.md`, `CHANGELOG.md`, icon and `preview` flag.

## Authentication

ADR 0004 chose OIDC trusted publishing for both stores, so that no publishing
token lives in the repository. As of October 2026 neither store allows it for
the first release:

- **VS Code Marketplace.** `vsce publish --oidc` exists in `@vscode/vsce`
  4.0.0 (hidden from `--help`), but the Marketplace does not yet let a
  publisher register a trusted publishing policy, and the token exchange of
  4.0.0 predates the Marketplace's contract (fixed in the 4.0.1 pre-releases).
  The job therefore uses a personal access token. Azure DevOps retires global
  personal access tokens, which the Marketplace needs, on **1 December 2026**;
  before then the job must move to `--oidc` (once the Marketplace offers it)
  or to Microsoft Entra ID (`--azure-credential` after `azure/login` with a
  federated credential).
- **Open VSX.** `ovsx publish --trusted-publishing` (ovsx 1.1.0 and later)
  works, but a trusted publisher can only be registered for an extension that
  already has a version, by a namespace owner. The first release publishes
  with `OVSX_PAT`; afterwards the maintainer registers the trusted publisher
  and deletes the secret, and the job switches to OIDC by itself.

## One-time setup (maintainer)

1. **Marketplace publisher.** At <https://marketplace.visualstudio.com/manage>,
   signed in with a Microsoft account, create the publisher with ID
   `happy-dwarf-team` (it cannot change later) and name `Happy Dwarf Team`.
2. **Marketplace token.** At <https://dev.azure.com>, in the same Microsoft
   account's user settings, create a personal access token with
   **Organization: All accessible organizations** and the custom scope
   **Marketplace → Manage**, with an expiry after the next planned release and
   no later than 1 December 2026. Save it as the repository secret `VSCE_PAT`.
3. **Open VSX account.** Create an Eclipse Foundation account at
   <https://accounts.eclipse.org/user/register> with the same GitHub user name
   you log in to <https://open-vsx.org> with. On
   <https://open-vsx.org/user-settings/profile>, log in with Eclipse and accept
   the Publisher Agreement.
4. **Open VSX token and namespace.** Create a token at
   <https://open-vsx.org/user-settings/tokens>, then create the namespace
   (case-sensitive, equal to `publisher`):
   `npx ovsx create-namespace happy-dwarf-team` with the token in `OVSX_PAT`.
   Save the token as the repository secret `OVSX_PAT`.
5. **Open VSX ownership.** Claim the namespace in a public issue at
   <https://github.com/EclipseFdn/open-vsx.org/issues/new/choose> ("Claiming
   namespace `happy-dwarf-team`", the option for a VS Code publisher with a
   repository). Until it is granted the namespace is unverified, and an
   extension with the Marketplace's identifier may stay under review.

## After the first release

1. On <https://open-vsx.org/user-settings/trusted-publishers>, register a
   trusted publisher for `happy-dwarf-team.etch`: GitHub Actions, owner
   `happy-dwarf-team`, repository `etch`, workflow `release.yml`, no
   environment.
2. Delete the `OVSX_PAT` repository secret and revoke the token. A set
   `OVSX_PAT` always wins over trusted publishing.
3. Before 1 December 2026, move the `marketplace` job off `VSCE_PAT` (see
   above).
