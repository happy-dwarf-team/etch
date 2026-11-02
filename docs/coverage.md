# Coverage survey

How well the offline renderer, the widget outline and the live snapshot show the
game's views: every view a player can open in vanilla and in Anbennar, measured
against the game. Decided in the Etch v3 grilling of 2 November 2026 (the v3
specification draft, [spec/v3.md](spec/v3.md), section 2). The results of the
latest run are in [coverage-results.md](coverage-results.md).

The precision corpus ([ADR 0002](adr/0002-precision-corpus-per-widget-exact-thresholds.md))
gates releases on 16 hand-chosen views. The survey asks a wider question: of
everything the game can show, how much does Etch get right, and where it does
not, what kind of thing fails. It gates nothing in 2.x.

## What a view is

A **view** is one state of the screen a player can open: a tab of the country
view, the province view of an own or a foreign province, a page of the ledger,
a dialog. It is told apart from other views by its **signature**: the visible
top-level windows (map icons and tooltips left out), each with the visible
windows inside it three levels deep, without the insides of list boxes and
without the second and later rows of a list. Texts and the number of rows are
not part of it. The same view opened in two ways is one view.

Every top-level window of the playset's `.gui` files gets a status in the
report: **view** (a root of a captured view), **inside** (created inside one,
such as a list's row template) or **not reached**.

## The crawler

`packages/core/src/corpus/driver/crawl.ts` finds the views; the rules are in
[`coverage/survey.json`](../coverage/survey.json). From the playset's start
state (its save, and the main menu) it tries, breadth first and up to three
steps deep, every shown and enabled button and check box, in a list only the
first row; in the start state also the survey's keys (`f1` to `f10`, `l`, `b`)
and up to three provinces of each kind (own, foreign, uncolonised, wasteland,
sea), opened with Tongs' `province open`. A step that shows a new signature is
a new view, with the steps that led to it as its recipe.

It keeps the game as it was:

- It never makes a game call and never clicks what a `never` pattern of the
  survey names: confirmations (`accept`, `confirm`, `yes`, `apply`), what
  leaves, saves or loads a game, what acts on another country at once
  (`declare`, `send`, `annex`), what goes online or changes the DLCs, the
  speed and the map modes, and the contents of the settings. A dialog is opened
  and measured, then closed with Escape, never confirmed.
- Before the first click it takes a fingerprint of the game's state: whether a
  game is loaded, its date, pause, session and game calls, the player, and
  every text of the top bar (treasury, manpower, power, stability and the
  rest). After every click it takes it again. A click that changed it is never
  clicked again, and the game starts afresh from its save.
- A click after which Escape cannot bring back the start state ends the game
  the same way.
- Everything else is the capture driver's procedure (corpus/README.md, "The
  capture driver"): the host install, the profiles, the settings put back, the
  lab's game lock, the pinned mouse.

The crawl's state is a JSON file per playset and start in the survey's local
folder, so that a fresh start goes on where the last one stopped.

The views it found become the survey's own manifest, in the corpus's format
(`survey-manifest`). The capture driver then captures each one from a fresh
start (`run --manifest`), which also checks that its recipe holds; the
comparison compares them as it does the corpus (`compare --corpus`).

## Playsets

| Playset | How | Why |
| --- | --- | --- |
| vanilla | crawled | the game itself |
| anbennar-alone | crawled | Anbennar without UI mods: its own windows |
| bigger-ui | vanilla's views | the **holdout**: Bigger UI V1.37, which changes 21 `.gui` files and which Etch was never tuned on. It is measured once, before any fix the survey leads to, and reported apart, as the measure of how well what the survey confirms carries over to a mod nobody looked at |

Views are captured at 1920×1080; the views whose windows have another variant
at 1280×720 are captured there too.

## Measures

Each captured view is measured three ways, from the capture's widget trees and
the playset's files (`packages/compare/src/coverage.ts`):

1. **The outline, offline.** The window laid out from its `.gui` alone, as the
   preview draws it without a live game and without a profile.
   - *Geometry*: of the widgets the game shows and the layout has (code-filled
     ones apart), the share whose rect, fitted as Tongs fits the game's, is the
     game's to the pixel (windows by position only, as the comparison does).
     Widgets the game shows that the layout lacks, and widgets the layout draws
     that the game did not create, are listed apart.
   - *Visibility*: of the widgets the game created inside a shown parent, the
     share that the layout draws exactly when the game shows them. Without a
     profile the outline draws everything, so this is the gap a profile fills.
2. **The preview from the live snapshot.** A live snapshot made from the same
   capture (the fields of `tongs.ui` version 1 that the Etch plugin reads), put
   through the preview's own path: the profile's selectors that fit it, the
   profile's differences as toggles from the game, the snapshot's texts, rows
   and states as the top sample data layer. The same geometry and visibility,
   and *texts*: the share of the texts the game shows that the preview takes
   from the snapshot. Without a profile the preview takes nothing from a
   snapshot, and the report says so.
3. **Pixels.** `compare --gpu --corpus <survey folder>`: the corpus's own
   per-widget comparison. Reported only.

And for windows no survey reaches, such as a mod's own:

4. **Constructs.** Each compared widget's constructs: its kind, each property
   it sets (`iconType.position`), the values of enumerated properties
   (`instantTextBoxType.format=centre`) and whether it has `if_resolution`
   blocks; names, sprites, fonts and texts left out. A construct is
   *confirmed* when every widget built with it had the game's rect. A window's
   **confidence** is the share of its widgets built only of confirmed
   constructs.

**The target**: 100 % geometry in every view, 100 % visibility in every view
with a profile, 100 % of the live snapshot's fields. A difference is a bug or a
known deviation with an issue, never a tolerance.

## Running it

In the EU4 engine lab, under its game lock, with `ETCH_CORPUS_PATH` set to the
survey's local folder:

```powershell
node packages/core/src/corpus/driver/cli.ts crawl --lab <lab> --host <host> --monitor 3440x1440 `
  --settings-baseline <settings.txt> --saves <saves> --playset vanilla --start save
node packages/core/src/corpus/driver/cli.ts survey-manifest
node packages/core/src/corpus/driver/cli.ts run --manifest $env:ETCH_CORPUS_PATH\manifest.json `
  --records $env:ETCH_CORPUS_PATH --all --resolution 1920x1080 --lab <lab> --host <host> `
  --monitor 3440x1440 --settings-baseline <settings.txt> --saves <saves>
pnpm --filter @etch/compare compare --corpus $env:ETCH_CORPUS_PATH --gpu
pnpm --filter @etch/compare coverage --out docs/coverage-results.md
```

The survey's local folder keeps the crawls, the manifest, the captures, the
screenshots and the reports; only `coverage/survey.json`, this file and the
results summary are in the repository.
