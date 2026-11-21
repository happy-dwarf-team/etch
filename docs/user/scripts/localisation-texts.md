---
title: Localisation texts
description: See the text of a localisation key next to it in .gui and script files, and open the line that defines it.
since: 2.14.0
---

Where a `.gui` file or a script names a localisation key, Etch shows the key's text right after
it, in grey. You read what the player will see without opening the `.yml` file. In
`events/FlavorRUS.txt`, for example, `title = "flavor_rus.EVTNAME3401"` is followed by
**The Pomjestija Reform**.

## Where the texts show

- In `.gui` files: after `text`, `tooltip`, `tooltipText` and `delayedTooltipText`.
- In the `.txt` files of `events`, `decisions`, `missions` and `common`: after `title`, `desc`,
  `name`, `tooltip` and `custom_tooltip`, wherever they stand in the file.

Only a key that your [playset](../reference/glossary.md#playset) (the game, your mod and the mods
it depends on) defines gets a text. A `name` that is a plain word, not a key, gets none.

## Read the whole text

The grey text is short: at most 60 letters, without icons, colour codes and variables.

- Hover over it to see the whole text, the key, its language and the `.yml` file it comes from.
- To open that file at the key's line, <kbd>Ctrl</kbd>+click the key, or put the cursor on it and
  press <kbd>F12</kbd>.

## Choose the language

The texts are in the language of `etch.language`, English unless you change it. Pick another
language in [Settings](../reference/settings.md), and the texts change to it.

When you save a `.yml` file, Etch reads the localisation again, so the texts follow your edits.

## Turn it off

To hide the texts, clear the checkbox of `etch.editor.localisationHints` in
[Settings](../reference/settings.md). If you see no texts at all, VS Code's own
`editor.inlayHints.enabled` setting may be off: it hides all such grey texts, Etch's included.

## What it doesn't do

- A key your playset does not define gets no text and no warning.
- It shows the text the key has in the `.yml` file. Icons, colours and the values of variables
  that the game puts in at play time are left out.
- Only the keys listed above get a text. Others, such as `buttonText` in a `.gui` file, get none.
