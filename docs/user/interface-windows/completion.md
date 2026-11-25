---
title: Suggestions in .gui files
description: Get suggestions for widget types, keys, sprite names, fonts and values as you type in a .gui file.
since: 2.14.0
---

When you type in a `.gui` file, Etch suggests what can come next: a widget type, a key, a
sprite name, a font or a value. The widget types and keys are exactly the ones EU4 1.37.5 reads
at that place. Sprite names, fonts and the order of the list come from your
[playset](../reference/glossary.md#playset): the game, your mod and the mods it depends on.

## Get suggestions

1. Open a `.gui` file and put the cursor where you want to type.
2. Start typing, or press <kbd>Ctrl+Space</kbd>: a list of suggestions opens.
3. Pick one with the arrow keys and press <kbd>Enter</kbd> or <kbd>Tab</kbd>.

Widget types come first, then keys. In each group, the words your playset's files use most come
first. Next to each one, in grey, Etch says what it is and how often your playset's files use it.

## What Etch suggests where

- **Inside `guiTypes = { … }`:** the widget types the game reads there, such as `windowType`.
  Picking one writes the widget with an empty `name = ""`, and the cursor goes into the quotes.
- **Inside a widget:** the kinds of widget the game creates inside this kind of widget, and the
  keys the game reads in it. Inside a `windowType`, for example, you get `iconType` and
  `guiButtonType`, but also `browserType`, `tooltip` and `verticalScrollbar`, which few files
  use. Inside a `containerWindowType` you get `buttonType`, not `guiButtonType`: the game creates
  only that one there. A key that takes a block, such as `position`, comes with its `{ }`. After
  any other key, the suggestions open again for its value.
- **Inside `if_resolution = { … }`:** `min_width`, `max_width`, `min_height` and `max_height`,
  and the widget's own keys and widgets.
- **Inside a block such as `position = { … }` or `size = { … }`:** its keys, such as `x` and `y`.
- **After `spriteType` or `quadTextureSprite`, and after `background` in a `listboxType` or
  `smoothListboxType`:** every sprite name of your playset's `.gfx` files. Move to a sprite in
  the list: the box beside it shows its kind (such as `frameAnimatedSpriteType`), its frames, the
  `.gfx` file that defines it and a small picture of its texture.
- **After `font` or `buttonFont`:** the fonts of your playset. Hover over a font name you wrote to
  see the font, with a sample of its letters
  ([Fonts in .gui and .gfx files](../textures-and-meshes/hovers-and-links.md#fonts-in-gui-and-gfx-files)).
- **After `orientation`:** the nine points the game can anchor a widget to, such as
  `"UPPER_LEFT"`. In a `containerWindowType` you get seven: the game does not take
  `CENTER_LEFT` or `CENTER_RIGHT` there.
- **After a key that takes `yes` or `no`,** such as `alwaysTransparent`: `yes` and `no`.
- **After `format` in a text box:** `left`, `center`, `centre` and `right`. **After
  `vertical_alignment`:** `top`, `center`, `centre` and `bottom`. The game takes both spellings
  of centre.
- **After other keys:** the values your playset's files use for that key, when they use only a
  few different values, such as `clicksound`.

The game reads keys in upper or lower case, so `Orientation` and `orientation` are the same
key. Etch writes a key the way your playset's files write it most, such as `listboxType` rather
than `listBoxType`. Sprite names, fonts and the
`orientation` values are written in quotes, as the game's files write them. If you already typed
the opening quote, Etch adds only the closing one.

## Turn it off

Suggestions are on by default. To turn them off, open [Settings](../reference/settings.md),
search for `etch.editor.completion` and clear its checkbox. Do this if another extension already
suggests words in these files and you want only its list.

With CWTools on, its rules may cover the widgets of `.gui` files. Then the widget types and keys
come from CWTools alone, and Etch suggests only what comes after a key: sprite names, fonts and
the other values above. See
[Etch and CWTools in the same file](../getting-started/install.md#etch-and-cwtools-in-the-same-file).

## What it doesn't do

- A key with many different values, such as `name` or `text`, gets no value suggestions.
  Neither does a key whose values are numbers, such as `scale`.
- Inside a widget kind the game does not read at that place, Etch suggests nothing. A
  [warning in the Problems panel](problems.md#keys-and-values-the-game-does-not-read) marks it
  while the preview is open.
- It works in `.gui` files only, not in `.gfx` files or scripts.
- A sprite or font you add to a `.gfx` file shows up in the suggestions after you save that file.
