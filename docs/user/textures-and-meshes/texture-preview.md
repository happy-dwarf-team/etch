---
title: Texture preview
description: Open .dds and .tga textures in VS Code and look at their colours, alpha and mip levels.
since: 2.13.0
clip: texture
---

VS Code cannot show `.dds` and `.tga` files. With Etch they open in the **Etch Texture
Preview**, which reads them exactly as Etch's preview of your `.gui` windows does.

## Open a texture

Open any `.dds` or `.tga` file from the Explorer, for example the base game's
`gfx/interface/provinceview_bg.dds`. The texture shows over a checkerboard, so you can see where
it is see-through. The bar above it lists:

- its size in pixels;
- its format, such as DXT1, DXT5 or BGRA8 for a `.dds`, or 16, 24 or 32 bits for a `.tga`;
- how many mip levels it has (smaller copies the game uses when it shows the texture small);
- whether it uses its alpha, the see-through part.

## Controls

| Control                       | What it does                                                        |
| ----------------------------- | ------------------------------------------------------------------- |
| **RGBA**                      | Shows the colours with the see-through parts.                       |
| **RGB**                       | Shows the colours alone, as if nothing were see-through.            |
| **A**                         | Shows the alpha alone, in grey: white is solid, black is see-through. |
| **Mip**                       | Picks one of the smaller copies, down to 1 × 1 pixel.               |
| **−** and **+**, <kbd>Ctrl</kbd>+mouse wheel, <kbd>Ctrl+-</kbd> and <kbd>Ctrl+=</kbd> | Zoom out and in. |
| The zoom level, such as "Fit · 50 %" | Switches between fitting the panel and 100 %.            |
| <kbd>Ctrl+0</kbd>             | Goes to 100 %: one texture pixel per screen pixel.                   |
| <kbd>Ctrl+Shift+0</kbd>       | Fits the texture into the panel. A large one shrinks; a small one is never enlarged. |

After you click in the preview, the zoom keys zoom the texture instead of VS Code. They are the
same in the interface preview and the mesh preview.

**RGBA**, **RGB** and **A** sit in one frame because you pick one of them: the one you picked is
filled. With the keyboard, press <kbd>Tab</kbd> to reach them and the arrow keys to pick another.

At the bottom you see where the pixel under the mouse is, and its red, green, blue and alpha
values.

## Edit and see it at once

Keep the texture open while you work on it in your image editor. When you export it again, the
preview shows the new file at once.

## A size that is not a multiple of 4

A DXT texture is stored in blocks of 4 × 4 pixels. If its width or height is not a multiple of 4,
the game still draws each block whole, filler pixels included, so it draws the texture larger: a
30 × 30 texture at 32 × 32. The bar says the size the game draws.

## Open it another way

To open a texture with another viewer, or as text, run **View: Reopen Editor With…** from the
Command Palette (<kbd>Ctrl+Shift+P</kbd>).

## What it doesn't do

- It does not edit textures; use your image editor.
- A few kinds of `.dds` file do not open, such as a cube map or a BC7 texture. The preview names
  the format instead of drawing it.
