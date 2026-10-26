# Prototype: switching views and sample data in the preview

Throwaway, never merged ([etch#159](https://github.com/happy-dwarf-team/etch/issues/159), map
[etch#151](https://github.com/happy-dwarf-team/etch/issues/151)). Question: how should the
preview switch between views of a window (a window profile's views, hand toggles in the Widget
Outline) and choose sample data (generated text lengths, a save's province, a live game
snapshot)?

It mimics the preview and the Widget Outline on `provinceview` of the Anbennar playset (Anbennar,
Proper 2K UI Enhanced, P2KE Patch - Anbennar), drawn by the real offline renderer from the
playset's files, read only. Three variants of where the switches live:

- **A**: toolbar menus in the preview, `View ▾` and `Data ▾`; eye toggles in the outline.
- **B**: an inspector beside the preview with every selector, where each value came from
  (auto, save, you, default), and the data layers; the outline only says why.
- **C**: the outline itself: exclusive windows as radios, others as check boxes, code-filled
  texts with their sample value; data and views from quick picks on the status bar.
- **D** (after the maintainer's reaction: B's choice without its panel, A's two menus and eyes,
  C's radios): `View ▾` holds the ready views, your own saved views (selectors and hand toggles,
  per window) and every selector compactly with its source; the outline has radios for windows
  that exclude one another and an eye on every other window and, once a window is opened, on each
  of its single elements.

```bash
pnpm proto:views
```

Then open `http://localhost:5159/?variant=A` (B, C, D; arrow keys or the bar at the bottom switch).
The game is found through Steam or `ETCH_GAME_PATH`. The save is `ETCH_PROTO_SAVE`, else
`saves/Verne1444_11_11_test.eu4` under `ETCH_CORPUS_PATH`, else `Verne1444_11_11.eu4` in the
player's save games folder. The live snapshot is a mock: no game is started.

- `views.js`: the pure part: the window profile as data, the reducer, effective selectors,
  window states, sample texts by layer.
- `page.js`, `index.html`: the page shell and the three variants.
- `server.mts`, `playset.mts`, `save.mts`: layout with sample texts (a `sample` hook added to
  `layoutWindow` on this branch), textures, and a regex save reader (not etch#154's design).
