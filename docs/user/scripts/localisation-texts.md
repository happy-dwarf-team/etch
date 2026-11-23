---
title: Localisation texts
description: See the text of a localisation key next to it in .gui and script files, hover over a key to read its whole text in the game's colours, and open the line that defines it.
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

- Hover over the key, or over the grey text after it, to see the whole text as the game colours
  it. The hover also names the key and its language. Its last line says which `.yml` file and
  line the text comes from, and whether it is the game's or your mod's, such as
  "Defined in `localisation/etch_demo_l_english.yml:3` — Etch demo mod". In the text:
  - a colour code such as `§Y` paints the text up to its `§!` in that colour. The colours are
    the ones the `textcolors` blocks of your playset's `.gfx` files give each letter: yellow for
    `§Y` in the base game;
  - an icon such as `£building£`, or the gold icon `¤`, shows as its small picture when your
    playset has its sprite, and as written otherwise;
  - a line break (`\n`) breaks the line;
  - a variable such as `$COUNTRY$`, a scripted text in `[…]` and a country's flag such as `@FRA`
    stay as written, because the game fills them in while you play.
- When several `.yml` files define the key, Etch shows the text the game shows. A file in
  `localisation/replace` wins over the others. Otherwise the first definition wins, and the
  game's comes before your mod's. Of your mod's files, the one whose path comes first in the
  alphabet wins (`a_…` over `z_…`, and `a_…` over `sub/…`). In one file, the first line with the
  key wins.
- To change one of the game's texts, put your version in your mod's `localisation/replace`
  folder. If your mod has a file with the same name and folder as one of the game's files, the
  game's file is not read at all, so its other texts disappear too.
- To open that file at the key's line, <kbd>Ctrl</kbd>+click the key, or put the cursor on it and
  press <kbd>F12</kbd>.

When you save a `.yml` file, Etch reads the localisation again, so the texts follow your edits.

## Texts the game does not show

The game skips some localisation, and so does Etch. The text is then missing in the game and in
Etch's texts and previews:

- A file that is not saved as UTF-8 with BOM (an encoding setting of your editor, explained in
  [Encoding](encoding.md)). The game does not read it. Etch warns at the start of the file.
- A file whose name lacks the language suffix, such as `my_texts.yml` instead of
  `my_texts_l_english.yml`. The game does not read it and writes nothing about it in its log.
  Etch skips it too, without a warning.
- A backslash before anything other than `n`, `t`, `"` or another backslash, such as `\q` or
  `\r`. Capitals `\N` and `\T` work too. The game stops reading the file at that line: that line
  and every line after it get no text. The lines before it still work. To show a backslash, write
  `\\`. A backslash just before the closing quote is shown as it is.

## Choose the language

The texts are in the language of `etch.language`, English unless you change it. To see another
language, set `etch.language` in [Settings](../reference/settings.md): the texts change to it.
The same setting is the language the [preview](../interface-windows/preview.md) draws its texts
in, so the preview changes too.

## Turn it off

To hide the texts, open [Settings](../reference/settings.md), search for
`etch.editor.localisationHints` and clear its checkbox. That also turns off the hover on the key
and <kbd>Ctrl</kbd>+click, for example when another extension already shows localisation. If you
see no grey texts at all, VS Code's own `editor.inlayHints.enabled` setting may be off: it hides
all such grey texts, Etch's included.

## What it doesn't do

- A key your playset does not define gets no text and no warning.
- It shows the text the key has in the `.yml` file. The grey text leaves out icons and colours,
  and the values that the game puts in at play time, such as a variable's, show as "…".
- The hover shows the colours on VS Code's background, not on the game's window, so a dark
  colour such as black can be hard to read there.
- Only the keys listed above get a text. Others, such as `buttonText` in a `.gui` file, get none.
