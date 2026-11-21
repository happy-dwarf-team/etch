# Writing Etch's user docs

The pages in this folder are Etch's user documentation. The Etch website builds them into
[etch.happydwarf.dev/docs/](https://etch.happydwarf.dev/docs/) from the latest release's tag
(the site's `docs/spec.md`, section 3.4), so they describe the version players have. Files whose
names are in capitals (`README.md`, this file) are not pages.

## The reader

A modder who knows EU4's files (`.gui`, `.gfx`, localisation, events, `common`, `history`) and
edits them in VS Code, but is not a programmer. They want to know what to do and what they will
see. Write every page for them.

## When a page changes

A pull request that changes what a user sees or does changes its page in the same pull request:
a new feature gets a page or a section, a changed one its text, a removed one loses it. A new
command or setting needs no page of its own: the site lists them from `package.json`, so its
title and description there are written to these rules too.

## A page

Front matter, then the body without an h1 (the site writes the title):

```markdown
---
title: Mesh preview
description: Open a .mesh file and turn the model in your hand, with its textures, colours and animations.
since: 2.13.0
clip: mesh
---
```

- `title`: the feature's name as Etch's interface writes it, or a task, in sentence case, a few
  words.
- `description`: one sentence that says what the page is for. The site shows it under the title
  and uses it as the page's summary in search results.
- `since`: the release that added the feature, only when it is newer than 2.0.0.
- `clip`: the id of the site's loop that shows the feature (the site's `docs/spec.md`, section
  8.5), only when there is one. The site shows the loop under the description.

The body opens with one or two sentences on what the feature is and where you find it. Then how
to use it, as numbered steps for a task or a list for controls; then the details; and last,
under `## What it doesn't do`, its limits. Sections are `##`, with few `###`.

Link other pages with relative links (`[pick mode](../live-game/pick-mode.md)`), other files of
this repository with full GitHub links, and the Glossary page for a word of Etch's own.

## Plain language

This list is also what the review below checks.

1. **Say what to do and what you will see.** "Click **Wire**: the model's triangles show as lines."
2. **Headings name a task or a thing** ("Open a mesh", "Controls"), never a mechanism.
3. **Short sentences**, one idea each. Write "you"; use the active voice.
4. **Explain Etch's own words** where a page first uses them, in a few plain words, or link the
   Glossary: previewed window, view, window profile, selector, playset, sample data, layer, live
   game, private install, live snapshot, pick mode, planned restart.
5. **Use plain words for developer words**, or explain the developer word when no plain one fits:

   | Instead of            | Write                                        |
   | --------------------- | -------------------------------------------- |
   | buffer                | the unsaved file, what you typed             |
   | render                | draw                                         |
   | webview               | the preview                                  |
   | configuration key     | setting                                      |
   | diagnostic            | warning (in the Problems panel)              |
   | parse                 | read                                         |
   | resolve (a path)      | find                                         |
   | instance, process     | the game, the running game                   |
   | API, protocol, pipe   | leave out, or say what it does for the user  |

6. **Name what you click exactly as Etch writes it**, in bold: **View ▾**, **Etch: Open
   Preview**. Keys as `<kbd>Ctrl+Shift+E</kbd>`.
7. **Code style only for** file names, paths, script text and setting names: `provinceview.gui`,
   `owns = 151`, `etch.gamePath`.
8. **One example from the base game** where it helps: a real file, window or line.
9. **State limits plainly**, at the end, under "What it doesn't do".
10. **Etch's internal parts** (Tongs, Bellows, the plugin protocol, the precision corpus) appear
    only where a user meets them, and then with what they do for the user.
11. **Say only what Etch does today**: every claim follows Etch's specifications or its code.
    No plans, no "soon". The extension's README is a short overview of these pages for the
    stores: a change to what a page says that the README repeats changes the README too.

## The plain-language review

Every pull request that adds or changes a page, a command's or setting's text, or the release
notes gets a plain-language review before it merges:

1. A reviewer reads the changed text as the reader above: a subagent briefed with this file and
   the changed pages, or a person who is not a programmer.
2. They list every sentence they could not follow or act on, and why, and every rule of the list
   above a passage breaks.
3. The author rewrites those sentences. A sentence the reader could not follow is rewritten, not
   explained in a review comment.
4. The pull request's Evidence lists the findings and what changed.
