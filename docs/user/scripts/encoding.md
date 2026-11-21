---
title: Encoding
description: See where the game would show other letters than VS Code does, and fix the file's encoding.
since: 2.13.0
clip: encoding
---

A file's encoding is how it stores its letters. The game reads each kind of file in one fixed
encoding, whatever VS Code saves it in. When saving the file would make the game read other
letters than you see in the editor, Etch marks those letters and offers to fix the file.

## The encoding the game reads

| Files                                              | The game reads them as |
| -------------------------------------------------- | ---------------------- |
| Interface files: `.gui`, `.gfx` and `.fnt`         | Windows-1252           |
| Script files: `.txt`, in the folders below         | Windows-1252           |
| Localisation: `.yml`, in a `localisation` folder   | UTF-8 with BOM         |

UTF-8 with BOM is UTF-8 with an invisible mark, the BOM, at the very start of the file. VS Code
calls it **UTF-8 with BOM**.

Etch checks interface files in any folder. Script files are the `.txt` files of `common`,
`events`, `decisions`, `missions`, `history` and `customizable_localization`.

Etch checks these files while you have them open, and again as you type. VS Code shows the
encoding of the open file at the right of the status bar, at the bottom of the window.

## What Etch warns about

Each warning is underlined in the file and listed in the Problems panel.

- **Letters the game reads otherwise.** Say a `history/countries` file is saved as UTF-8 and names
  a leader `José`. The game reads the file as Windows-1252 and shows `JosÃ©`. Etch puts a warning
  on the `é` that says the file is saved as UTF-8 and the game reads `Ã©`.
- **`�` in the editor.** VS Code shows `�` where it could not read a letter: it opened the file in
  the wrong encoding. Etch marks this as an error, because saving the file now loses the original
  letters. Reopen the file in the game's encoding first (see below).
- **Localisation not saved as UTF-8 with BOM.** The warning is at the start of the file.
- **A file saved as UTF-16.** This is an error: the game cannot read the file's letters.
- **An interface file saved with a BOM.** Etch warns because no one has checked how the game reads
  such a file.

## Fix the encoding

Click the underlined letters, then press <kbd>Ctrl+.</kbd> or click the light bulb to see Etch's
quick fixes:

- **Reopen as Windows 1252**, or **Reopen as UTF-8 with BOM** for localisation, opens the file
  again from disk in the game's encoding. The editor then shows the letters as the game reads
  them, and nothing is saved. Use it when the file on disk is right but VS Code opened it in
  another encoding, as when it shows `�`.
- **Save with Encoding…** opens VS Code's own encoding choice: pick **Save with Encoding**, then
  the game's encoding from the table above. Use it when the letters you see are right and only
  need to be saved in the game's encoding.

**Save with Encoding…** is always offered. **Reopen as …** appears only on a file without unsaved
changes, because VS Code can reopen only the saved file. It does not appear for a missing BOM on a
localisation file that is already UTF-8, or for a BOM on an interface file: only saving adds or
removes a BOM.

## Comments

In script files, Etch skips comments, from `#` to the end of the line. The game does not read
them, so an `é` in a comment gets no warning.

## Letters that look like another alphabet

When VS Code opens a Windows-1252 file as UTF-8, most accented letters show as `�`. A few pairs of
letters happen to form one letter of another alphabet instead: the `Úž` of a Windows-1252 file
shows as `ڞ`. In a file that also shows `�`, Etch knows such a letter stands for two of the file's
own letters, not text saved as UTF-8, so it gives it no warning of its own. The `�` in the file
still gets its error: reopen the file as Windows 1252, and both show as the game reads them.

## What it doesn't do

- It checks only the files you have open, and only the kinds in the table above. Other files,
  such as the `.txt` files of `map`, are not checked.
- It does not change VS Code's encoding settings, and it does not save the file for you.
