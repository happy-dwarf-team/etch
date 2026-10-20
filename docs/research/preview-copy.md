# Research: does a renamed copy of a .gui file preview the same as the original in the game host?

Ticket: happy-dwarf-team/etch#16 (map: #1). Follows up the reload research
([Can EU4 1.37.5 reload its interface while it runs?](https://github.com/happy-dwarf-team/etch/issues/2),
branch `research/interface-reload`, `docs/research/interface-reload.md`, cited
as "reload research"), the stale-definitions research
([etch#14](https://github.com/happy-dwarf-team/etch/issues/14), branch
`research/stale-definitions`, `docs/research/stale-definitions.md`, cited as
"stale research"), the reload prototype (etch#6, branch
`prototype/game-reload`, `prototypes/game-reload/README.md`) and ADR 0003
(`docs/adr/0003-extension-driven-game-host-in-private-install.md`), whose
open point "a renamed copy must preview the same as the original file" this
answers statically.

Static analysis only. The game was not started, and no file of the game, its
saves, mods, `settings.txt` or `dlc_load.json` was changed. Build: `eu4.exe`
1.37.5 Steam win64, SHA-256
`9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A`. The
installed EXE and the lab's analysed copy (`work/ghidra/input/eu4.exe`) had
this hash before and after the work. The lab's Ghidra project was opened
read-only (project data opened without a project lock, program opened as a
read-only domain object that cannot be saved); the few functions Ghidra had
not defined were created inside transactions that were rolled back. All
addresses are RVAs relative to the image base `0x140000000`.

Methods, named for each claim:

- **decomp**: Ghidra 12.1.4 decompiler on the lab's project, read locally.
  The pseudo-C is not reproduced here.
- **disasm**: Ghidra listing of the instructions at that RVA.
- **xrefs**: Ghidra references to an address.
- **bytes**: values read from the EXE: vtables, strings and the keyword table
  in `.data` (entries of a 32-bit token id followed by the keyword; ids below
  are given with their keyword).
- **scan**: a script over a set of functions or a call graph, looking for one
  pattern (a registry lookup through manager `+0xC8`, a call to a known
  function, string literals). It finds what the pattern matches and can miss
  indirect accesses.
- **files**: a small Paradox-script parser run over `.gui` files (read only):
  vanilla `interface/**/*.gui` (129 files) and these mods: Proper 2K UI
  Enhanced (P2KE, workshop 3290499798), Anbennar (1385440355), Proper 2K UI
  Anbennar (workshop 3681465653 and the older 3311452878, plus the
  maintainer's local dev copy), P2KE Patch Anbennar (3777997797), Bigger UI
  (788906833) and the DK + 2K UI patch (local). "Playset" counts merge vanilla
  with the named mods, a later mod replacing a file with the same path. Also
  the game's existing `logs/setup.log` from its last start.

Terms as in the stale research: *definition* (type) is the parsed object of a
`.gui` entry, *widget* the object built from it, *type registry* the
case-insensitive name → definition tree at GUI manager `+0xC8` (manager
`0x23494F0`). *Top-level* means a direct child of a `guiTypes` block; only
those are in the registry. *Copy* is the preview copy
`interface/etch_<file>.gui`; *original* is the edited file under its own path.

## Short answer

Yes, for what `window open` can show, provided the copy writer follows a few
rules. A window built by `window open` has no controller, and what it draws
comes from its own definition tree plus a short list of by-name lookups. None
of the code that builds such a window reads the definition's source file
(`type+0x30`) or compares the window's name with anything, so the `etch_`
prefix and the different path do not change the result. Parse-time inputs are
the same as at startup: `if_resolution` and relative sizes are evaluated
while the file is parsed, against the current UI-scaled screen size, which
does not change while the game host runs at a fixed resolution. After every
parse, startup or reload, the same post-processing pass runs over the whole
registry, so a reloaded file is finalized the same way as a startup one.

The copy must:

- **prefix every top-level name**, whatever its type, and nothing else. A
  top-level name left unprefixed makes the reload delete the original's live
  definition and replace it for the whole game.
- **leave nested names alone**. Nested definitions live in their container's
  own map, and several references point at siblings by name (`background`,
  scrollbar `slider`/`track`/buttons, nested `parent`).
- **rewrite only the values that the engine looks up in the global registry,
  and only when they name a top-level definition of the same file**:
  `scrollbartype` in list boxes, smooth list boxes and instant text boxes,
  `parent` on a top-level definition, and a button's `tooltip` when it names
  a text box type. References to other files stay as they are: they resolve to
  the same definitions the original would use. In the corpora the same-file
  case is rare (one vanilla instance, `console_list` in `core.gui`), the
  cross-file case common (about 300 `scrollbartype` references to `core.gui`).
- **never contain the same top-level name twice**. The engine's duplicate
  check inside one file does not work (it compares string pointers), so at
  startup one of the two definitions wins unpredictably, and on a reload of a
  name already in the registry both entries delete the same old definition: a
  double free. Anbennar's `countryreformview.gui` (and every P2K Anbennar
  variant) has this case. For the copy it would strike on its second reload.

What the copy cannot show is anything other files see through these names:
an edit to a scrollbar type in `core.gui` changes every list box of every
other file, but those keep pointing at the unprefixed original. Such edits,
renames and deletions, `.gfx` and font changes, and `if_resolution` branches
for another resolution need the real file reloaded (with the reload
research's leak and stale-definition costs) or a restart. `window open` also
has no type check, so only top-level `windowType` (and the eu4 subclass
`eu3dialogtype`) can be previewed this way.

## Verified statically

### Loading at startup and on reload

1. **Startup reads every `.gui` file once, in sorted order, without the
   reloading flag** (decomp of the GUI phase `0x202850`). It lists the files
   with extension `.gui` in the interface directory through the VFS
   enumerator `0x170FFE0` (a pre-enumerated cache, or the live path `0x17180E0`
   → `0x17171F0` over `PHYSFS_enumerate`); `0x1718940` sorts the list with a
   stable sort (`0x4193B0`) and drops adjacent duplicates. Each file is opened
   with the engine reader `0x170DD70`, parsed through the manager's slot
   `+0x18` and logged as `Loaded GUI Definition File: <path>`. After the last
   file it stores `mgr+0x220` and runs the post-parse pass `0x14EAAA0` once.
   The manager byte `+0x228` (reloading) is not set on this path.
2. **The enumeration includes subdirectories, after the top-level files**
   (files: the game's existing `setup.log` lists 129 files, `interface/*.gui`
   alphabetically from `achievements.gui` to `warsubsidydialog.gui`, then
   `interface/government_mechanics/*.gui`). The comparator of the sort was
   not read; the log is consistent with a byte-wise, case-sensitive order.
3. **A reload uses the same reader and parser, with the flag set** (decomp of
   `0x14EB7D0`; reload research claim 8): `+0x228` = 1, reader `0x170DD70`,
   manager slot `+0x18`, then the same `0x14EAAA0`, then `+0x228` = 0. So
   the bytes of a file are read and parsed identically on both paths.
4. **The `guiTypes` key (`0x7E`) passes the flag to the registry; four other
   root keys set global defaults** (decomp of `0x14EA9F0`; bytes).
   `default_clicksound` (699), `default_oversound` (700), `default_downsound`
   (701) and `default_upsound` (702) at file level store strings at manager
   `+0x20`, `+0x40`, `+0x60`, `+0x80`; these are the four names `0x14EAAA0`
   resolves through the sound object at `+0x220` (the "four named entries" of
   the reload research). No vanilla file has them (files: every vanilla root
   key is `guiTypes`).
5. **The eu4 manager subclasses the clausewitz one** (decomp of `0x10B3BD0`,
   bytes of vtable `0x1D58108` against the base `0x1D8DC40`). Its factory
   (`0x10B3FE0`) builds eu4 subclasses for `guiButtonType` (`0x7F`, vtable
   `0x1D589B0`), `iconType` (`0xB6`, `0x1D58938`) and `eu3dialogtype`
   (`0x27FF`, a `windowType` subclass, `0x1D574A0`) and leaves every other
   keyword to the base factory `0x14EAC80`. It overrides the hook slot `+0xC0`
   that ends `0x14EAAA0` (claim 13).

### Names in the registry

6. **The duplicate check inside one file compares string pointers, so it
   never fires** (decomp of `0x14ECE90`, `0x171F5C0`, `0x14ED980`). For each
   top-level entry the parser keeps the new definition in a local hash table
   whose key is the address of the definition's name characters: the hash is
   computed over the 8 bytes of that address, and lookup compares addresses.
   Two definitions never share that address, so a second entry with the same
   name is not reported as `Already Defined Key` by this check.
7. **Startup keeps the first definition from earlier files; reload replaces
   it** (decomp of `0x14ECE90`; reload research claim 9). For each entry the
   parser asks the registry (slot `+0x8`) for the name. Flag clear: if found,
   it logs `Already Defined Key: <name>` and drops the new entry. Flag set: if
   found, it calls the old object's deleting destructor at once. New entries
   are inserted only after the whole file: begin (`0xE2B8E0`, sets the batch
   flag), one insert per local entry (`0x14EC950`, into a pending list sorted
   with `memcmp`), end (`0x14EC750`, inserts the pending list into the tree in
   a balanced order with `0x14ED760`).
8. **The tree insert overwrites a value without freeing it** (decomp of
   `0x14ED760`). A second insert under an existing name stores the new pointer
   in the node and leaves the old object alive and unreferenced.
9. **So two top-level entries with the same name in one file behave
   differently on the two paths** (claims 6–8):
   - startup: neither is rejected; both are inserted, the later insert wins
     and the other leaks. Which one is later follows the local hash table's
     iteration order (a hash of heap addresses) and the batch's balanced
     insert order, not the order in the file;
   - reload, when the name is already in the registry: both entries find the
     same old definition, because the registry is updated only at the end. The
     first deletes it, the second calls the deleting destructor on the freed
     object again;
   - reload, when the name is new (the copy's first reload): no delete; both
     are inserted and one leaks. The next reload is the previous case.
10. **The registry is case-insensitive** (decomp of `0x14EC630` →
    `0x6E4880`/`0x6E4800` and of `0x14ED760`): find and insert pass every
    character through `tolower`, and nodes store lower-cased characters. Names
    that differ only in case are one entry for the startup check, for the
    reload replacement and for `window open`, which uses the same find
    (`0x14E9030`).
11. **Nested definitions live in their container's own map** (decomp of
    `0x155E3D0`, the window's child insert; stale research claim 5). A nested
    name already present in the same window logs `Guitype '%s' already exists
    in windowtype '%s'` and the map insert overwrites it; the name is added to
    the window's child-name list (`+0x498`) again. Nested names never touch the
    global registry.

### Parse-time inputs

12. **`if_resolution` is applied while the file is parsed, against the
    current UI-scaled screen size** (decomp of the definition base key
    handler `0x15A4310`, token `0x2C9`; sub-reader vtable `0x1D99948`, key
    handler `0x15A4160`; bytes: tokens `0x2CA` `max_height`, `0x2CB`
    `min_height`, `0x2CC` `max_width`, `0x2CD` `min_width`). The handler reads
    width and height from the object at `*(*(0x23494E8)+0x28)+0x40`, fields
    `+0xE0`/`+0xE4`, divides by the value at `+0xF8` in thousandths (so
    `size × 1000 / value`, rounded), and parses the block with a reader that
    checks the conditions and forwards every other key to the definition's
    own key handler. A failed condition clears a flag and the rest of the
    block is skipped; keys placed before a failing condition have already been
    applied. Nothing about the condition is kept in the definition.
13. **`windowType` sizes relative to the screen are also resolved at parse
    and finalize time** (decomp of the `windowType` key handler `0x155CB60`,
    key `size` `0x2F`, and of `0x155C520`): `size` is parsed against the root
    size at `mgr+0xC0 → +0x490` minus the position read so far, and
    `fullScreen` copies the root size during finalize. Windows are created
    with the same root size (`0x14E9030` passes it to `0x155C260`).
14. **The post-parse pass is the same on both paths and walks the whole
    registry** (decomp of `0x14EAAA0`, `0x14ED910`, `0x14EE2B8`; disasm of
    `0x14EE2B8`: a jump to the definition's slot `+0x48`). It calls the
    finalize slot `+0x48` of every top-level definition, passing the registry,
    resolves the four default sound names, then calls the manager's hook
    `+0xC0`. In the eu4 manager that hook is `0x10B4F40` → `0x132E190`: it
    destroys (widget slot `+0x130`) every widget kept in 33 recycling pools at
    `0x2358400`–`0x2358718` and empties them; `0x132E0C0` fills the pools, up to
    200 widgets each, and `0x132E300` reuses them by name (decomp, xrefs).
    Every reload, the copy's included, flushes these pools.

### Inheritance through `parent`

15. **`parent` is an inheritance link, resolved by name at finalize time**
    (decomp of the `windowType` finalize `0x155C520`, `0x155C200`,
    `0x155DF00`, `0x155D8A0`; key `parent` `0x87` → string `+0x138`). Finalize
    first finalizes the window's nested definitions, passing the window's own
    child map (`+0xE8`) as the lookup table. Then, if `parent` is not empty, it
    looks the name up in the table it was given and copies each inheritable
    property that is still unset: `size`, `position`, `parent` (so chains
    work), `priority`, `background`, `verticalScrollbar`,
    `horizontalScrollbar`, `horizontalBorder`, `verticalBorder` and one more
    (token `0x140`). "Unset" is tested by value (zero or empty string). The values
    are copied, not referenced.
16. **The same pattern exists in other classes** (decomp of the finalize
    slots): `guiButtonType` `0x15AFE20` (`parent` at `+0x1E0`), list boxes
    `0x15EAF60` (`+0x108`), `scrollbarType` `0x15E8E20` (recursing with its
    own child map `+0x208`), and `0x15E9F00`, `0x15EA580`, `0x15F1F20`.
17. **So `parent` on a top-level definition names a registry entry, and on a
    nested definition names a sibling** (claims 14–16). The windows' child
    lookup at construction is different: `0x155E2E0` tries the window's own
    map and, when the name is missing, looks the definition named by
    `+0x138` up in the global registry and searches that one's map (stale
    research claim 5).
18. **Finalize does not refresh values it already copied** (claim 15). A
    second pass sees the copied values as set and skips them; only a value
    that still reads as unset (for example a `position` with `x` or `y` equal
    to 0, which `0x155DF00` treats as unset) is copied again on every later
    pass.

### What `window open` builds

19. **`window open` has no type check** (decomp of `0x14E9030`, `0x155C260`).
    It finds the name in the registry and calls the `windowType` create
    function `0x155C260` on whatever it found, which passes several dozen
    fields read at `windowType` offsets to the window constructor
    (`0x1543F80`, a `0xA80`-byte object).
    The containerWindowType path (manager slot `+0x58`, `0x14E9160`) checks
    the token id `0x264` first; this one does not.
20. **No code that builds the window reads its source file or compares its
    name** (scan of the 132 functions reachable by direct calls from
    `0x155C260` within the GUI library range `0x14E0000`–`0x1650000`, depth 6).
    None calls the reload registration (`0x14E0D90`, `0x14E1F60`); the only
    name-like string literals are key names, modifier keys and the fallback
    `defaultTextBox`. Calls through vtables are not followed by this scan; the
    child builders the window calls directly (`0x155D8F0`–`0x155DE70`,
    `0x15E7600`, `0x15EBD10`) are in the set.
21. **Global by-name lookups during construction** (same scan for registry
    finds through manager `+0xC8` slot `+0x8`, and calls to `0x14E8CF0`;
    decomp and disasm of each):
    - list boxes: `0x152E220` → `0x152F710` looks up the definition's
      `scrollbartype` (key `0x8C`, stored at `+0x210` by the list box key
      handler `0x15EB530`) and builds a scrollbar from it (`0x15E8C30`).
      `listboxType` (`0xA9`) and `smoothListboxType` (`0x1FB`) share this
      definition class (`0x15EAB80`);
    - instant text boxes: the factory `0x15E7600` passes `scrollbartype`
      (`+0x178`, key handler `0x15E7770`) to the constructor `0x1529D20`, which
      looks it up the same way;
    - a third class created through `0x15EBD10` (probably
      `OverlappingElementsBoxType`) does the same in `0x1583000`;
    - buttons: `0x15AF5F0` → `0x15AC670` creates a text box by the name in
      `tooltip` (key `0x92`, `+0x1C0`) when it is not empty, through
      `0x14E8CF0`, which falls back to `defaultTextBox` with an error text when
      the name is not in the registry. `0x15F6B60` does the same;
    - sounds: the window and container constructors (`0x1543F80`,
      `0x16307B0`) and `0x1570E70` look their sound strings up through
      `mgr+0x220`, not the type registry.
22. **Everything else a window draws is found locally or in other
    registries.** Child windows, their scrollbars (`verticalScrollbar`
    through `0x155DCB0` → `0x155E2E0`) and container children (own map at
    `+0x260`, `0x1639CB0`) come from the container's map. `background` names a
    nested button: when a child `guiButtonType` is parsed whose name equals
    the string, it becomes the background button (decomp of `0x155CB60`).
    Sprites, fonts and localisation keys are passed as strings to the widget
    constructors and resolved there (decomp of `0x15AF5F0`, `0x15E7600`;
    stale research claim 7).

### What the files do

23. **Top-level definitions** (files). Vanilla: 129 files, 858 top-level
    definitions (623 `windowType`, 106 `positionType`, 54 `eu3dialogtype`, 23
    `iconType`, 19 `containerWindowType`, 12 `guiButtonType`, 10
    `instantTextBoxType`, 4 `scrollbarType`, 3 `textBoxType`, 2
    `listboxType`, one `OverlappingElementsBoxType` and one
    `extendedScrollbarType`); 101 files have more than one, up to 55.
24. **Duplicate top-level names** (files):
    - inside one file: none in vanilla, P2KE, Bigger UI or DK + 2K UI. Anbennar
      and every P2K Anbennar variant (both workshop items, the local dev copy,
      P2KE Patch Anbennar) define `gov_view_reform_level_entry_4` twice in
      `countryreformview.gui`; the two definitions are identical;
    - across files, in the merged playsets vanilla + P2KE, vanilla + Anbennar
      (+ P2K Anbennar workshop or dev), vanilla + P2KE + Anbennar + patch, and
      vanilla + Bigger UI: none. The older P2K Anbennar item (3311452878) ships
      `tradeinterface_bak.gui` next to `tradeinterface.gui`, with 9 names in
      both; at startup `tradeinterface.gui` sorts first and wins (claims 1–2,
      7).
25. **By-name references into the registry** (files: every string value whose
    unquoted text equals, ignoring case, a top-level name of the playset):
    - `scrollbartype` to a `scrollbarType` in another file (`core.gui`): 300
      in vanilla (229 list boxes, 38 instant text boxes, 33 smooth list boxes),
      303 with P2KE, 314–316 with Anbennar;
    - `scrollbartype` to a top-level of the same file: 1 in every playset,
      `console_wnd/console_list` in `core.gui`;
    - `parent` in a `windowType` or on any top-level definition: 0. All
      `parent` keys are in nested `guiButtonType`s inside scrollbars (16 in
      vanilla, 20 in P2KE), naming siblings such as `listboxSliderButton`;
    - non-empty `tooltip` on a button: 0 in vanilla (844 empty), 1 in P2KE
      (a localisation key that names no type);
    - coincidences that are not registry references: `background` equal to the
      window's own name (4: `goto_box`, `flagship_designer`, ...; it names a
      nested button of the same name) and text keys equal to a window name (3,
      for example `COMBAT`, `Menu`).
26. **Nested names that equal a top-level name of the same file** (files): 12
    in vanilla, for example `goto_box` (window and its background button) and
    `interact_button` in `countrysubjectsview.gui`.
27. **`if_resolution`** (files): 267 blocks in 15 vanilla files, 283 in P2KE,
    344 in Bigger UI, 395–443 in the P2K Anbennar variants. In every corpus
    each block lists its conditions before any other key, so the order effect
    of claim 12 does not occur.

## Hypotheses (need a live check)

- **H1: a copy and the reloaded original draw the same pixels.** Expected from
  claims 12–22 for every top-level `windowType` whose same-file registry
  references are rewritten. *Check:* in the game host, for two or three files
  (`goto.gui`, `ages_view.gui` with `if_resolution`, `core.gui`'s
  `console_wnd` for the same-file `scrollbartype`), capture `window open
  <name>` after `reload <file>.gui` and `window open etch_<name>` after
  reloading the copy, and diff the crops.
- **H2: the screen size used by `if_resolution` is stable while the game host
  runs.** The fields of claim 12 are probably the back-buffer size and the UI
  scale × 1000; resolution and scale changes require a restart (reload
  research claim 20). Whether moving or resizing a borderless or windowed game
  changes them was not traced. *Check:* read `+0xE0`, `+0xE4` and `+0xF8` of
  the object in claim 12 with Tongs before and after an `alt-tab` and a
  window move; compare with `settings.txt`.
- **H3: `window open` on a non-window type corrupts memory or crashes.**
  Claim 19 shows the type confusion; what a `positionType` or
  `containerWindowType` read as a `windowType` does was not tried. *Check:*
  not worth running; the host only opens `windowType` names.
- **H4: a copy with a duplicate top-level name crashes on its second
  reload.** Claim 9. *Check:* not worth running; the writer removes
  duplicates. The same applies to reloading Anbennar's real
  `countryreformview.gui` once: the startup definition is deleted twice.
- **H5: `reloadloc` followed by `window open` shows edited localisation.**
  Text keys are resolved at construction (claim 22), so a newly opened window
  should use the reloaded text; the copy itself does not need to change.
  *Check:* edit a key used by an open preview, `reloadloc`, reopen, compare.
- **H6: later mods win for the same path.** The ADR assumes that the overlay
  mod, loaded last, takes precedence; the mount order of the playset in
  PhysFS was not traced here. *Check:* the game host's `setup.log` prints
  only virtual paths, so check with a file that exists in two mods with
  different contents and `window open` on a name from it.

## Unknowns

- The comparator of the startup sort (claim 2) and whether the pre-enumerated
  cache can order files differently from the live enumeration.
- The class built by `0x15EBD10` (claim 21, probably
  `OverlappingElementsBoxType`) and which key of it holds the scrollbar name.
- Indirect calls during construction (claim 20 follows direct calls only):
  a widget class that looks a name up through a vtable slot would not be
  found. The definition classes' finalize slots were read for registry use
  (claim 16), their create slots only where the window calls them directly.
- Who reads `windowType` `verticalBorder`/`horizontalBorder` and which
  registry they name (most likely sprites).
- What the eu4 recycling pools (claim 14) hold (map icons or tooltips are
  likely, from the callers around `0x132E770`).

## Consequences for Etch

Rules for the preview-copy writer:

- **Prefix every top-level name** (every direct child of every `guiTypes`
  block, whatever its keyword) with `etch_`, in lower case. Because the
  registry ignores case (claim 10), check that no other top-level name of the
  playset already equals the prefixed name ignoring case; none does in the
  corpora. A top-level name left unprefixed is not a preview: the reload
  deletes the playset's live definition, the game's own windows built from it
  keep a freed pointer, and every later by-name creation of that name uses
  the copy (claims 7, 9; stale research).
- **Do not touch nested names**, nested `parent` values, `background`,
  scrollbar `slider`/`track`/`leftbutton`/`rightbutton`, or any text,
  sprite, font or sound value (claims 11, 17, 22, 25, 26).
- **Rewrite these values when, ignoring case, they equal a top-level name of
  the same file**, to the prefixed name:
  - `scrollbartype` in `listboxType`, `smoothListboxType` and
    `instantTextBoxType` (and the third class of claim 21 once known);
  - `parent` directly on a top-level definition;
  - `tooltip` on a `guiButtonType` when it names a `textBoxType`.
  Leave them when they name a top-level of another file: the copy then uses
  the same definition the original uses. Leave everything that does not match
  a top-level name. Matching must be by key and position, not a text search
  for the name, because of the coincidences in claim 25.
- **Remove or reject duplicate top-level names** before writing (claim 9).
  Keep one definition (when they are identical, as in Anbennar, the result is
  the same) and report the duplicate as a diagnostic, since the game itself
  picks one unpredictably. Also warn when the *real* file has such a
  duplicate: reloading it is a double free.
- **Drop file-level `default_*sound` keys from the copy** or accept that a
  reload sets the game's default button sounds from it (claim 4).
- **Copy files from subdirectories under a flattened name** (for example
  `interface/etch_government_mechanics__militarization.gui`), so that two
  originals with the same base name do not share a copy (claim 2).
- **Clean `interface/etch_*.gui` out of the overlay mod before the game host
  starts.** A copy present at startup is loaded with the other files
  (claim 1); with a duplicate name its first reload would be the double-free
  case.

Rules for the host:

- **Only `windowType` (and `eu3dialogtype`) top-level names go to `window
  open`** (claim 19). A `containerWindowType` needs another path (manager slot
  `+0x58`), which no console command offers; `positionType` and the other
  kinds are not windows.
- **Use the prefixed name for everything the host addresses**: `window
  close`/`open`, and the window's name in a capture or tree read (the widget's
  name comes from the definition, so it is `etch_<name>`).
- **Reload the real file, or restart, for edits the copy cannot show:**
  - a change to a top-level definition that windows of other files use by
    name: a `scrollbarType` in `core.gui` (about 300 references), a text box
    type named by `tooltip`, a parent of other files' windows. Alternative
    without touching the real file: when the referenced file is also edited,
    copy it too and point the previewed copy's reference at its prefixed name;
  - renaming or deleting a top-level definition: a reload never removes names
    it did not parse, so old `etch_` and original names stay in the registry
    until a restart; previews are unaffected, but a reference to a deleted
    name keeps resolving;
  - `.gfx`, sprite and font changes (reload research claim 18, prototype):
    restart; texture pixels: `reloadtexture`;
  - localisation: `reloadloc`, then reopen (H5);
  - another resolution or UI scale, including the other branch of an
    `if_resolution` block: restart at that resolution (claim 12).
- **Warn about the playset**, because the original preview of the game may not
  be the edited text: when another file of the playset defines the same
  top-level name and sorts earlier, startup uses that one (claims 2, 7, 24);
  when a later mod overrides the edited file's path, the game reads that mod's
  file, not the edited one (H6). The copy always shows the edited text.
- **The cycle itself stays as in the ADR.** No startup-only step is skipped by
  a reload that affects the window: the same reader, parser and post-parse
  pass run (claims 1, 3, 14). Each reload, the copy's included, also flushes
  the eu4 widget pools (claim 14) and rebuilds the hints window (reload
  research claim 2).

## Sources

- `eu4.exe` 1.37.5, SHA-256 above, analysed with the lab's Ghidra project
  (`eu4-engine-lab`, `work/ghidra`, project `eu4-1.37.5`, opened read-only)
  and throwaway scripts for decompiling, call-graph and pattern scans, and
  the keyword table.
- Reload research: happy-dwarf-team/etch, branch `research/interface-reload`,
  `docs/research/interface-reload.md`.
- Stale research: happy-dwarf-team/etch, branch `research/stale-definitions`,
  `docs/research/stale-definitions.md`.
- Prototype: happy-dwarf-team/etch, branch `prototype/game-reload`,
  `prototypes/game-reload/README.md`.
- ADR 0003 and `GLOSSARY.md`: happy-dwarf-team/etch, `main`.
- Lab notes: `eu4-engine-lab`, `docs/reverse-engineering.md` ("Konsola,
  klatka i drzewo GUI"), `docs/static-analysis.md`.
- Game files (read only): vanilla `interface/**/*.gui`, the game's
  `logs/setup.log` from its last start, and the mods listed under Methods.
