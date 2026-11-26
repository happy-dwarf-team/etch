# A script language server in the VSIX, with semantic tokens and no language id

**Status: proposed** (26 November 2026), for v3 (etch#753, decisions D1 and D3).
The maintainer accepts or rejects it together with the other decisions of
etch#753. If accepted, it supersedes the v2 principle "No language server"
(v2 specification, section 1), the sentence of ADR 0007 that restates it, and
the words "no language server" in ADR 0008. Nothing else in those ADRs
changes. In particular this ADR does not decide whether Etch reports problems
in script files. That is decision D7 of etch#753, and until it is taken,
ADR 0007 (the game checks script files) and ADR 0008's "No script
diagnostics" stand.

## Context

Etch gives editor features to `.gui` and `.gfx` files and to the places in
script and localisation files where they name what Etch already reads
(ADR 0008). Every one of them runs as a provider in the extension host, next
to the preview, from the core's indexes of the playset. EU4 script files
themselves (`common/`, `events/`, `decisions/`, `missions/`, `history/`) get
their colours, checks and completion from CWTools or ParadoxCode.

Support for CWTools' EU4 rules has stopped (cwtools/cwtools-eu4-config#452),
and the CWTools extension for VS Code has defects of its own on Windows that
nobody will fix (etch#719, etch#755). etch#753 maps the way to EU4 script
support in Etch itself. Two questions come before any of it: where the
script engine runs, and how script files get colours without the language id
ADR 0008 kept out.

Full script support is a different load from today's features. CWTools needs
about a minute to read the game and a mod before its first answers. Reading
every script file of a playset and checking it against a rules set of tens of
thousands of lines, again after each change, would compete with the
preview's reload budget ([docs/budgets.md](../budgets.md)) on the extension
host's single thread.

## Decision

**A language server for scripts.** The script engine is a new workspace
package, `packages/script`, free of `vscode` as `packages/core` is. It reads
the playset through `core`, so there is one idea of the load order and of
the file layers. It runs in a language server: a Node process of its own,
started by the extension with VS Code's language client and shipped in the
same VSIX, speaking LSP. The extension's existing providers for interface
files, assets and localisation stay in the extension host, beside the
preview whose indexes they share.

The same engine without a client is a command-line check (`etch check`) that
reads a mod's playset and writes its findings as text or JSON. after-v2.md
lists this "headless mode for CI" as later work; it comes with the server at
no extra cost.

**Colours from semantic tokens, with no language id.** The server colours
script files with semantic tokens on Etch's file-pattern selectors, as every
Etch feature is registered today. The token types come from what the engine
knows about a key (a trigger, an effect, a scope, a localisation key, a
number, a key no rule knows), not from a grammar's guess. Etch contributes no
language id and no TextMate grammar, so it still never competes with CWTools
or ParadoxCode over who owns a file.

The prototype of etch#759 (branch `prototype/semantic-tokens`, never merged)
showed that this works: a `DocumentSemanticTokensProvider` on a file pattern
coloured an event file that VS Code 1.142.0 opened as Plain Text, in Default
Dark Modern and Default Light Modern, with the themes' default colours for
semantic tokens. The screenshots and pixel values are in that issue.

## Why

We chose a server process over providers in the extension host because the
work of reading and checking a whole playset's scripts should not run on the
thread that draws the preview and answers the editor. We chose it over a
`worker_thread` in the extension host because a worker gives the extension
host its thread back but nothing else, while a server also gives the
command-line check and can later answer other editors, as CWTools' and
ParadoxCode's servers do. We kept the interface features out of the server
because moving them would split them from the preview's indexes, or keep two
copies of those indexes, for no gain to the user.

ADR 0001 holds: the server is TypeScript on Node, with no native module and
no runtime of another language. That is what rules out embedding CWTools'
.NET server or ParadoxCode's native one. ADR 0004 holds: VS Code's language
client and server libraries are MIT.

We chose semantic tokens over a language id with a grammar because a
language id brings back the conflict ADR 0008 avoided. VS Code merges
contributions to one id, so taking CWTools' `eu4` would not clash with its
declaration, but it would make CWTools start on every Etch project. A new id
of Etch's own would compete with `eu4` for the same files. A grammar colours
by the shape of the text; the engine colours by what a key means in the game.

## Consequences

- A second process: the server's memory and start-up count against Etch's
  budgets. Before this ADR is accepted, the parser-only `etch check`
  prototype measures the floor on vanilla 1.37.5 and on Anbennar, the
  largest corpus playset (etch#753). Before the server ships, its cold start,
  its first answers on Anbennar and the reparse of one edited file get
  budgets in [docs/budgets.md](../budgets.md), measured on the same machine
  as the other budgets.
- Script files colour only where Etch's selectors match. Plain Text has no
  language configuration, so comment toggling, bracket matching and
  auto-closing stay with CWTools or ParadoxCode, or wait for a later
  decision. This is what keeping no language id costs.
- With CWTools or ParadoxCode beside Etch, both may colour the same file:
  VS Code applies semantic tokens over a grammar's colours. "Beside CWTools"
  in ADR 0008 says where Etch steps back; colours join that list if a
  side-by-side run shows a conflict.
- The server and the CLI ship in the one VSIX of ADR 0004; the CLI is a
  script in it, not a package of its own, until a CI user asks for one.
- Each script feature that reaches users is listed in the v3 specification
  with its own setting, and the whole engine is off by default until its
  gate passes (decision D6 of etch#753).
