# Precision corpus: per-widget comparison with masks and exact thresholds; captures stay outside Git

The precision corpus measures only the offline renderer's layout preview. A
faithful preview comes from the game host, which shows the game's own frame,
so it has no threshold. Each capture is compared widget by widget: the
widget's rect as the game reports it, and its pixels cropped from the
screenshot. Two kinds of pixel are masked out. One is pixels under code-filled
content, using the game's rects of the widgets the code fills. The other is
pixels the render does not cover fully (alpha below 255), because the game
blends those edges over the map. A static widget passes when its rect matches
to the pixel and at least 99 % of its compared pixels are within ±2 per
channel. A window passes when every compared widget passes or is a known
deviation, and the layout preview meets its target when every window passes
at every resolution in every playset. Aggregate figures (share within ±2, mean
difference) are reported for trends but gate nothing. Only text lives in the
repository: the manifest (windows, recipes, playsets, resolutions, hashes) and
the widget trees. The screenshots stay in a local corpus folder outside Git.

We chose per-widget exact thresholds because the first comparison
([etch#9](https://github.com/happy-dwarf-team/etch/issues/9)) showed every
static widget of the main menu matching the game pixel for pixel. A whole-image
metric would have hidden a regression in one small widget behind a large
background. A tolerance band (SSIM, a mean-difference ceiling) would have
accepted errors the renderer does not need to make. We rejected committing the
screenshots because each is 3–7.5 MB of Paradox art, and the repository must
not redistribute game assets.

## Consequences

- Sprite, frame, font and colour per widget are not captured. A wrong sprite or
  font shows up in the pixels, and locating those fields in the game (about
  1–2 weeks of reverse engineering) waits until pixel diffs prove too weak to
  diagnose.
- Every known deviation names its widget and links an issue. A new one needs
  the maintainer's consent before a release.
- Captures are taken from a fresh game start for each resolution and playset.
  They never read the widget tree after a `reload`, and two identical
  screenshots are required, because Tongs' screenshots are not synchronised
  with a frame.
- The corpus cannot run in CI as it stands: it needs a licensed game, a GPU
  and screenshots that live outside the repository.
