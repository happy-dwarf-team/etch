---
title: Completion in .gui files
description: Get suggestions for widget types, keys, sprite names, fonts and values as you type in a .gui file.
since: 2.14.0
---

When you type in a `.gui` file, Etch suggests what can come next: a widget type, a key, a
sprite name, a font or a value. The suggestions come from your
[playset](../reference/glossary.md#playset) (the game, your mod and the mods it depends on), so
they are the words the game's and your mods' files really use.

## Get suggestions

1. Open a `.gui` file and put the cursor where you want to type.
2. Start typing, or press <kbd>Ctrl+Space</kbd>: a list of suggestions opens.
3. Pick one with the arrow keys and press <kbd>Enter</kbd> or <kbd>Tab</kbd>.

The most used words come first. Next to each one, in grey, Etch says what it is and how often
your playset writes it.

## What Etch suggests where

- **Inside `guiTypes = { … }`:** the widget types written there, such as `windowType`. Picking
  one writes the widget with an empty `name = ""`, and the cursor goes into the quotes.
- **Inside a widget:** the widgets that other widgets of this type hold, and the keys written in
  this type. Inside an `iconType`, for example, you get `position`, `name`, `spriteType` and
  `Orientation` first. A key that takes a block, such as `position`, comes with its `{ }`. After
  any other key, the suggestions open again for its value.
- **After `spriteType`, `quadTextureSprite` or a list's `background`:** every sprite name of
  your playset's `.gfx` files. Select one to see what its hover shows: its kind, its frames, the
  `.gfx` file that defines it and a small picture of its texture.
- **After `font` or `buttonFont`:** the fonts of your playset.
- **After `orientation`:** the nine points the game can anchor a widget to, such as
  `"UPPER_LEFT"`.
- **After other keys:** the values your playset writes for that key, when there are only a few
  words. After `alwaysTransparent` you get `yes` and `no`; after `format` in a text box, `left`,
  `centre`, `right` and `center`.

Sprite names, fonts and the anchors are written in quotes, as the game's files write them. If
you already typed the opening quote, Etch adds only the closing one.

## Turn it off

Completion is on by default. To turn it off, clear the checkbox of `etch.editor.completion` in
[Settings](../reference/settings.md). Do this if another extension already suggests words in
these files and you want only its list.

## What it doesn't do

- Etch suggests only what some file of your playset writes. A key the game knows but no file
  uses is not in the list, and nothing tells you whether a key works in a widget type.
- A key with many different values, such as `name`, `text` or `clicksound`, gets no value
  suggestions. Neither does a key whose values are numbers, such as `scale`.
- Inside a block such as `position = { … }` or `size = { … }`, Etch suggests nothing.
- Completion works in `.gui` files only, not in `.gfx` files or scripts.
- A sprite or font you add to a `.gfx` file shows up in the suggestions after you save that file.
