/**
 * Where a file writes a sprite's name (ADR 0008, "References and rename"): its definitions in a
 * `.gfx` file's `spriteTypes`, the `.gui` keys that name a sprite (`spriteType`,
 * `quadTextureSprite`, a list's `background`) and the script keys that do (an event's `picture`,
 * a mission's and an estate privilege's `icon`). Sprite names are matched without regard to case,
 * as `InterfaceIndex` looks them up.
 */
import { parseScript } from '../script/parse.ts';
import type { ScalarNode } from '../script/tree.ts';
import { readGfxFile } from './gfx.ts';
import { readGuiFile } from './gui.ts';
import { spriteReferences } from './references.ts';
import { isSpriteScriptPath, scriptSpriteReferences } from './script-sprites.ts';

/** A place a file writes a sprite's name: offsets of the name inside any quotes. */
export interface SpriteOccurrence {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  /** A `.gfx` definition's `name`, not a use. */
  readonly definition: boolean;
  /**
   * The name is written out here. A `.gui` use through an `@constant` is not: renaming it would
   * mean changing the constant.
   */
  readonly literal: boolean;
}

/** What kind of file a game-relative path is for sprite names; `undefined` when it names none. */
export function spriteFileKind(path: string): 'gfx' | 'gui' | 'script' | undefined {
  const lower = path.replace(/\\/g, '/').toLowerCase();
  if (lower.endsWith('.gfx')) return 'gfx';
  if (lower.endsWith('.gui')) return 'gui';
  return isSpriteScriptPath(lower) ? 'script' : undefined;
}

function inside(node: ScalarNode): { start: number; end: number } {
  return node.quoted && node.end - node.start >= 2
    ? { start: node.start + 1, end: node.end - 1 }
    : { start: node.start, end: node.end };
}

/**
 * Every sprite name a file writes, definitions and uses, in text order. `path` is game-relative
 * (`interface/x.gui`, `events/x.txt`), which decides how the file is read.
 */
export function spriteOccurrences(path: string, text: string): SpriteOccurrence[] {
  const kind = spriteFileKind(path);
  if (kind === undefined) return [];
  const out: SpriteOccurrence[] = [];
  if (kind === 'gfx') {
    for (const sprite of readGfxFile(parseScript(text)).sprites) {
      out.push({ name: sprite.name, ...inside(sprite.nameNode), definition: true, literal: true });
    }
  } else {
    const references =
      kind === 'gui'
        ? spriteReferences(readGuiFile(parseScript(text)))
        : scriptSpriteReferences(path, parseScript(text, { script: true }));
    for (const { node, name } of references) {
      out.push({
        name,
        ...inside(node),
        definition: false,
        literal: node.text.toLowerCase() === name.toLowerCase(),
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The sprite name at an offset of a file, definition or use; `undefined` when there is none. */
export function spriteOccurrenceAt(
  path: string,
  text: string,
  offset: number,
): SpriteOccurrence | undefined {
  return spriteOccurrences(path, text).find((o) => o.start <= offset && offset <= o.end);
}

/** The places a file writes one sprite's name, by case-blind match. */
export function occurrencesOf(path: string, text: string, name: string): SpriteOccurrence[] {
  const lower = name.toLowerCase();
  // Most files never write the name: skip parsing them.
  if (!text.toLowerCase().includes(lower) && !text.includes('@')) return [];
  return spriteOccurrences(path, text).filter((o) => o.name.toLowerCase() === lower);
}

/** A file a rename reads: its game path, its text, and whether the rename may change it. */
export interface SpriteRenameFile {
  readonly path: string;
  readonly text: string;
  /** A file of the edited mod; the game's and other mods' files are never changed. */
  readonly editable: boolean;
}

/** One change of a rename: the name's offsets in `files[file]`. */
export interface SpriteRenameEdit {
  readonly file: number;
  readonly start: number;
  readonly end: number;
}

export type SpriteRenamePlan =
  | { readonly kind: 'edits'; readonly edits: readonly SpriteRenameEdit[] }
  | { readonly kind: 'refused'; readonly message: string };

/**
 * The changes that rename a sprite in the edited mod: its definitions in the mod's `.gfx` files
 * and its uses in the mod's `.gui` and script files. Refused when the new name is not a bare
 * word or is already a sprite (`taken`), when the mod does not define the sprite, when a file the
 * rename may not change also defines or names it (the game's or another mod's: they would keep
 * the old name), or when a mod's `.gui` file names it through an `@constant`.
 */
export function planSpriteRename(
  files: readonly SpriteRenameFile[],
  name: string,
  newName: string,
  taken: (name: string) => boolean,
): SpriteRenamePlan {
  if (!isSpriteNameWord(newName)) {
    return {
      kind: 'refused',
      message: `"${newName}" is not a sprite name: use letters, digits, _, . and - only`,
    };
  }
  if (newName.toLowerCase() !== name.toLowerCase() && taken(newName)) {
    return { kind: 'refused', message: `the playset already has a sprite named ${newName}` };
  }
  const edits: SpriteRenameEdit[] = [];
  let defined = false;
  const elsewhere: string[] = [];
  for (const [index, file] of files.entries()) {
    const found = occurrencesOf(file.path, file.text, name);
    if (found.length === 0) continue;
    if (!file.editable) {
      elsewhere.push(file.path);
      continue;
    }
    for (const occurrence of found) {
      if (!occurrence.literal) {
        elsewhere.push(`${file.path} (through an @constant)`);
        continue;
      }
      if (occurrence.definition) defined = true;
      edits.push({ file: index, start: occurrence.start, end: occurrence.end });
    }
  }
  if (elsewhere.length > 0) {
    const shown = elsewhere.slice(0, 3).join(', ');
    const more = elsewhere.length > 3 ? ` and ${String(elsewhere.length - 3)} more` : '';
    return {
      kind: 'refused',
      message: `${name} is also named where Etch does not change it: ${shown}${more}`,
    };
  }
  if (!defined) {
    return { kind: 'refused', message: `the mod's .gfx files do not define ${name}` };
  }
  return { kind: 'edits', edits };
}

/**
 * Whether a new sprite name can be written as a bare word in `.gfx`, `.gui` and script files:
 * letters, digits, `_`, `.` and `-`, as the game's own sprite names are.
 */
export function isSpriteNameWord(name: string): boolean {
  return /^[\p{L}\p{N}_.-]+$/u.test(name);
}
