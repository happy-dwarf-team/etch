# Security policy

Etch is a Visual Studio Code extension that reads the game folder, mods and
profile of Europa Universalis IV, and that starts its own copy of the game as
the live game (the game host in Etch 1.x). Please report security problems privately, not in public
issues.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/happy-dwarf-team/etch/security/advisories/new).
Include the Etch version (from the Extensions view), the VS Code version, how
to reproduce the problem, and what an attacker gains.

This is a volunteer project; reports are handled on a best-effort basis. We
will confirm the report, agree on a fix and a disclosure date with you, and
credit you in the advisory unless you prefer otherwise.

## Supported versions

Only the latest release receives security fixes. Builds from `main` and older
releases are not supported.

## In scope

- Files written outside Etch's own storage: Etch only reads the player's game
  folder, mods and profile, and the live game writes only into its own private
  install.
- Data sent anywhere: Etch has no telemetry and sends nothing.
- Processes closed that Etch did not start, or a live game started with files
  whose hashes do not match the release.
- Code run from a workspace's files beyond what VS Code's workspace trust
  allows.
- Release integrity: a VSIX that does not match `SHA256SUMS.txt` or its build
  provenance attestation.

## Out of scope

- Problems in Anvil, Bellows or other game-side tools: report them in their
  own repositories.
- Vulnerabilities in Europa Universalis IV or in VS Code itself; report those
  to Paradox Interactive or Microsoft.
