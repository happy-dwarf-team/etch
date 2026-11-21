---
title: Localisation texts
description: See the text of a localisation key next to it in .gui and script files, and open the line that defines it.
since: 2.14.0
---

Where a `.gui` file or a script names a localisation key, Etch shows the key's text right after
it, in grey. You read what the player will see without opening the `.yml` file. In
`events/FlavorRUS.txt`, for example, `title = "flavor_rus.EVTNAME3401"` is followed by
"The Pomjestija Reform".

## Where the texts show

- In `.gui` files: after `text`, `tooltip`, `tooltipText` and `delayedTooltipText`.
- In the `.txt` files of `events`, `decisions`, `missions` and `common`: after `title`, `desc`,
  `name`, `tooltip` and `custom_tooltip`, wherever they stand in the file.

Only a key that your [playset](../reference/glossary.md#playset) (the game, your mod and the mods
it depends on) defines gets a text. A `name` that is a plain word, not a key, gets none.

## Read the whole text

The grey text is short: at most 60 characters. It leaves out icons and colour codes, and shows a
variable such as `$COUNTRY$`, or a scripted text in `[…]`, as "…".

- Hover over the grey text to see the whole text, the key, its language and the `.yml` file it
  comes from. When several `.yml` files define the key, Etch shows the text the game shows:
  - A file in `localisation/replace` wins over the others.
  - Otherwise the first text wins: the game's text over your mod's. Of your mod's files, the one
    whose name comes first in the alphabet wins (`a_…` over `z_…`), and in one file the first
    line with the key.
  - A file of your mod with the same name and folder as a file of the game's hides the whole of
    the game's file.

  To change one of the game's texts, put it in `localisation/replace`.
- To open that file at the key's line, <kbd>Ctrl</kbd>+click the key, or put the cursor on it and
  press <kbd>F12</kbd>.

When you save a `.yml` file, Etch reads the localisation again, so the texts follow your edits.

## Choose the language

The texts are in the language of `etch.language`, English unless you change it. To see another
language, set `etch.language` in [Settings](../reference/settings.md): the texts change to it.
The same setting is the language the [preview](../interface-windows/preview.md) draws its texts
in, so the preview changes too.

## Turn it off

To hide the texts, open [Settings](../reference/settings.md), search for
`etch.editor.localisationHints` and clear its checkbox. If you see no texts at all, VS Code's own
`editor.inlayHints.enabled` setting may be off: it hides all such grey texts, Etch's included.

## What it doesn't do

- A key your playset does not define gets no text and no warning.
- It shows the text the key has in the `.yml` file. Icons and colours are left out, and the
  values that the game puts in at play time, such as a variable's, show as "…".
- Only the keys listed above get a text. Others, such as `buttonText` in a `.gui` file, get none.
