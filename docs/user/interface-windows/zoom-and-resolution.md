---
title: Zoom and resolution
description: Choose the screen size the preview lays a window out at, and zoom in or out without changing it.
clip: zoom
---

Two things set how big a window looks in the preview. The **preview resolution** is the size of
the game's screen the window is laid out at, as on a player's monitor. The **zoom** only makes the
drawing bigger or smaller in the panel, and never changes the layout.

## The preview resolution

By default the preview uses the resolution in your game's `settings.txt`, else your monitor's.
The resolution button in the toolbar shows it, such as **1920×1080**. Point at it to read where it
comes from.

The resolution changes what the game itself changes with the screen size:

- which of a `_large` pair the game creates: the small widget on a screen less than 814 pixels
  high, the `_large` one from 814 pixels;
- the `if_resolution` blocks of a `.gui` file, such as the ones in the base game's
  `countrydecisionsview.gui`;
- the **Screen height** [selector](../reference/glossary.md#selector) in **View ▾**, for a window
  with a [window profile](../reference/glossary.md#window-profile).

### Choose another resolution

1. Click the resolution button in the toolbar, or run **Etch: Choose the Preview Resolution** from
   the Command Palette (<kbd>Ctrl+Shift+P</kbd>). The list opens on your current choice: it is
   first, under **Current**, with a check mark, so <kbd>Enter</kbd> keeps it.
2. Choose one:
   - **Default**: your game's `settings.txt`, else your monitor;
   - **Native**: your monitor's resolution;
   - one of the sizes under **Corpus resolutions**, the screen sizes at which Etch's drawing is
     compared with the game's: 1280×720, 1366×768, 1600×900, 1680×1050, 1920×1080, 2560×1440,
     3440×1440 or 3840×2160;
   - any other size: type its width × height in pixels in the box at the top of the list, such
     as `2560x1440`. The size shows as the first item as soon as you have typed it; press
     <kbd>Enter</kbd> to choose it. **Custom…**, at the end of the list, asks for the size in a
     box of its own instead.

The preview lays the window out again at that size, and the resolution button shows it.

Etch keeps your choice in the setting `etch.previewResolution`: `default`, `native`, or a width ×
height such as `1920x1080`. When your workspace settings already have it (for a folder you opened,
its `.vscode/settings.json`), Etch changes it there. Otherwise it saves it in your user settings,
which hold for every folder you open. You can also type it in the settings yourself. When Etch
cannot read the value, a notice above the window says so, and the preview uses the default.

## Zoom

The preview opens with the whole game screen fitted into the panel, but never above 100 %. At
100 %, one pixel of the game's screen is one pixel of your monitor, as the game shows it. Above
100 % only whole steps are offered, 200 % to 800 %, so that pixels stay sharp.

| To | Do this |
| --- | --- |
| Zoom in or out around the pointer | <kbd>Ctrl</kbd> + mouse wheel, or <kbd>Ctrl+=</kbd> and <kbd>Ctrl+-</kbd> |
| Zoom in or out around the middle | click **+** or **−** in the toolbar |
| Go to 100 % | <kbd>Ctrl+0</kbd> |
| Fit the screen into the panel | <kbd>Ctrl+Shift+0</kbd> |
| Fit the screen, or pick 50 %, 100 %, 200 % or 400 % | click the zoom level, such as "Fit · 47 %", and pick in its menu |
| Move around a zoomed screen | the mouse wheel (<kbd>Shift</kbd> + wheel sideways), or drag |

<kbd>Ctrl</kbd> with the numeric keypad's <kbd>+</kbd>, <kbd>−</kbd> and <kbd>0</kbd> works too.
After you click in the preview, these keys zoom the preview instead of VS Code.

- Drag with the left or the middle mouse button. A drag does not count as a click on a widget.
- Clicking a widget, pointing at it and the outline of the highlighted widget work at any zoom.
  When the widget you highlight from the editor or the Widget Outline is outside the visible part
  of the preview, the preview moves to put it in the middle.
- The preview keeps its zoom when VS Code reloads its window.

## What it doesn't do

- The preview lays windows out at UI scale 1.0 only. When your game's `settings.txt` sets another
  `game_ui_scale`, a notice says so, and the preview still draws at 1.0.
- 3840×2160 has not been checked against the game: the list marks it "not yet measured against
  the game".
- Zoom never changes the layout. To see a window at another screen size, change the resolution.
