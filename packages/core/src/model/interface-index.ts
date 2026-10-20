/**
 * The playset's sprite index, font index and registry of top-level `.gui` definitions, built from
 * the `.gfx` and `.gui` files in the order the game loads them.
 */
import type { Rgb } from '../text/markup.ts';
import type { FontDefinition, GfxFile, Sprite } from './gfx.ts';
import type { GuiFile, Widget } from './gui.ts';

/** A file of the playset's `interface` folder and its model; `path` is game-relative. */
export interface InterfaceFile<T> {
  readonly path: string;
  readonly file: T;
}

/** A definition and the game-relative path of the file that holds it. */
export interface Located<T> {
  readonly path: string;
  readonly item: T;
}

/**
 * The order in which the game reads the files of a folder: the files directly in it, sorted, then
 * each subfolder in sorted order the same way (etch#16 for `.gui`; assumed for `.gfx`). Names
 * compare in lower case; the game's comparator was not read, and the startup log is also
 * consistent with a case-sensitive byte order.
 */
export function compareInterfacePaths(a: string, b: string): number {
  const pa = a.toLowerCase().split(/[\\/]+/);
  const pb = b.toLowerCase().split(/[\\/]+/);
  for (let i = 0; ; i++) {
    const sa = pa[i];
    const sb = pb[i];
    if (sa === undefined || sb === undefined) return pa.length - pb.length;
    if (sa === sb) continue;
    const aIsFile = i === pa.length - 1;
    const bIsFile = i === pb.length - 1;
    if (aIsFile !== bIsFile) return aIsFile ? -1 : 1;
    return sa < sb ? -1 : 1;
  }
}

function indexBy<F, T>(
  files: readonly InterfaceFile<F>[],
  items: (file: F) => readonly T[],
  nameOf: (item: T) => string | undefined,
): Map<string, Located<T>[]> {
  const map = new Map<string, Located<T>[]>();
  for (const file of files) {
    for (const item of items(file.file)) {
      const name = nameOf(item);
      if (name === undefined || name === '') continue;
      const key = name.toLowerCase();
      const list = map.get(key);
      const located = { path: file.path, item };
      if (list === undefined) map.set(key, [located]);
      else list.push(located);
    }
  }
  return map;
}

/**
 * Sprites, fonts and top-level `.gui` definitions by name, without regard to case. When a name
 * is defined more than once, the first definition in load order wins: the game's rule for
 * `.gui` names at startup (etch#16), assumed for sprites and fonts. A later mod overriding a file
 * by its path is handled before this, by the playset's file system.
 */
export class InterfaceIndex {
  private readonly gfx: GfxSide;
  private readonly gui: GuiSide;

  private constructor(gfx: GfxSide, gui: GuiSide) {
    this.gfx = gfx;
    this.gui = gui;
  }

  /** An index over the files, given in any order; they are kept sorted in load order. */
  static of(
    gfx: readonly InterfaceFile<GfxFile>[],
    gui: readonly InterfaceFile<GuiFile>[],
  ): InterfaceIndex {
    return new InterfaceIndex(new GfxSide(gfx), new GuiSide(gui));
  }

  /** The `.gfx` files in load order. */
  get gfxFiles(): readonly InterfaceFile<GfxFile>[] {
    return this.gfx.files;
  }

  /** The `.gui` files in load order. */
  get guiFiles(): readonly InterfaceFile<GuiFile>[] {
    return this.gui.files;
  }

  /** The sprite a reference resolves to. */
  sprite(name: string): Located<Sprite> | undefined {
    return this.spriteDefinitions(name)[0];
  }

  /** Every definition of a sprite name, in load order. */
  spriteDefinitions(name: string): readonly Located<Sprite>[] {
    return this.gfx.sprites().get(name.toLowerCase()) ?? [];
  }

  font(name: string): Located<FontDefinition> | undefined {
    return this.fontDefinitions(name)[0];
  }

  fontDefinitions(name: string): readonly Located<FontDefinition>[] {
    return this.gfx.fonts().get(name.toLowerCase()) ?? [];
  }

  /** The top-level `.gui` definition with a name, such as a `scrollbarType` template. */
  guiType(name: string): Located<Widget> | undefined {
    return this.guiTypeDefinitions(name)[0];
  }

  guiTypeDefinitions(name: string): readonly Located<Widget>[] {
    return this.gui.definitions().get(name.toLowerCase()) ?? [];
  }

  /** The global `textcolors` of all `bitmapfonts` blocks; the first definition of a letter wins. */
  get textColours(): Readonly<Record<string, Rgb>> {
    return this.gfx.textColours();
  }

  /**
   * The index with one `.gfx` file added, replaced (same path, any case) or, with `undefined`,
   * removed. The `.gui` side is shared, so a warm reload rebuilds only what changed.
   */
  withGfx(path: string, file: GfxFile | undefined): InterfaceIndex {
    return new InterfaceIndex(new GfxSide(replaceFile(this.gfx.files, path, file)), this.gui);
  }

  /** The index with one `.gui` file added, replaced or removed; the sprite and font side is shared. */
  withGui(path: string, file: GuiFile | undefined): InterfaceIndex {
    return new InterfaceIndex(this.gfx, new GuiSide(replaceFile(this.gui.files, path, file)));
  }
}

/** The `.gfx` files and their lazily built name maps. */
class GfxSide {
  readonly files: readonly InterfaceFile<GfxFile>[];
  private spriteMap: Map<string, Located<Sprite>[]> | undefined;
  private fontMap: Map<string, Located<FontDefinition>[]> | undefined;
  private colours: Record<string, Rgb> | undefined;

  constructor(files: readonly InterfaceFile<GfxFile>[]) {
    this.files = [...files].sort((a, b) => compareInterfacePaths(a.path, b.path));
  }

  sprites(): Map<string, Located<Sprite>[]> {
    this.spriteMap ??= indexBy(
      this.files,
      (f) => f.sprites,
      (s) => s.name,
    );
    return this.spriteMap;
  }

  fonts(): Map<string, Located<FontDefinition>[]> {
    this.fontMap ??= indexBy(
      this.files,
      (f) => f.fonts,
      (font) => font.name,
    );
    return this.fontMap;
  }

  textColours(): Record<string, Rgb> {
    if (this.colours === undefined) {
      const colours: Record<string, Rgb> = {};
      for (const { file } of this.files) {
        for (const [letter, rgb] of Object.entries(file.textColours)) {
          if (!(letter in colours)) colours[letter] = rgb;
        }
      }
      this.colours = colours;
    }
    return this.colours;
  }
}

/** The `.gui` files and their lazily built registry of top-level names. */
class GuiSide {
  readonly files: readonly InterfaceFile<GuiFile>[];
  private definitionMap: Map<string, Located<Widget>[]> | undefined;

  constructor(files: readonly InterfaceFile<GuiFile>[]) {
    this.files = [...files].sort((a, b) => compareInterfacePaths(a.path, b.path));
  }

  definitions(): Map<string, Located<Widget>[]> {
    this.definitionMap ??= indexBy(
      this.files,
      (f) => f.definitions,
      (w) => w.name,
    );
    return this.definitionMap;
  }
}

function replaceFile<T>(
  files: readonly InterfaceFile<T>[],
  path: string,
  file: T | undefined,
): InterfaceFile<T>[] {
  const key = normaliseKey(path);
  const kept = files.filter((f) => normaliseKey(f.path) !== key);
  if (file !== undefined) kept.push({ path, file });
  return kept;
}

function normaliseKey(path: string): string {
  return path.replace(/[\\/]+/g, '/').toLowerCase();
}
