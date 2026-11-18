/**
 * The asset files a `.gfx` or `.asset` file names: textures, meshes and animations, as the
 * editor's links and hovers show them (etch.texturePreview). Only the path is read; whether the
 * file exists is the playset's question.
 *
 * Where a path is relative to, as vanilla EU4 1.37.5 writes them (checked over its files):
 * - A path with a folder (`gfx//interface//x.tga`, `gfx\models\a.mesh`) is game-relative.
 * - A bare file name in a `pdxmesh`'s `meshsettings` (`texture_diffuse = "a_diffuse.dds"`) is in
 *   the folder of that `pdxmesh`'s `file`; the 6 vanilla ones (`dharma_mapitems.gfx`) are there.
 * - Any other bare name, such as an `animation`'s `file = "eagle_idle.anim"` in an `.asset` file,
 *   is in the folder of the file that names it; all 152 vanilla ones are there.
 */
import type { BlockNode, EntryNode, ParsedScript, ScalarNode } from '../script/tree.ts';
import { keyOf } from './properties.ts';
import { normaliseGamePath, textureCandidates } from './references.ts';

export type AssetKind = 'texture' | 'mesh' | 'animation';

const KINDS: ReadonlyMap<string, AssetKind> = new Map([
  ['dds', 'texture'],
  ['tga', 'texture'],
  ['mesh', 'mesh'],
  ['anim', 'animation'],
]);

export interface AssetReference {
  readonly kind: AssetKind;
  /** The path as written, without quotes. */
  readonly written: string;
  /** The scalar that names it; its range includes the quotes of a quoted path. */
  readonly node: ScalarNode;
  /**
   * Game-relative files to try, in order: a `.tga` texture falls back to the `.dds` of the same
   * name (`textureCandidates`). Relative to `folder` when it is `document`.
   */
  readonly candidates: readonly string[];
  /** `game` for a game-relative path, `document` for a bare name in the naming file's folder. */
  readonly folder: 'game' | 'document';
}

/** Every asset path of a parsed `.gfx` or `.asset` file, in file order. */
export function assetReferences(parsed: ParsedScript): AssetReference[] {
  const found: AssetReference[] = [];
  visit(parsed.entries, undefined, found);
  return found;
}

/** The kind of a path by its extension, ignoring case; `undefined` for anything else. */
export function assetKind(path: string): AssetKind | undefined {
  const dot = path.lastIndexOf('.');
  // A name, not only an extension: `.dds` alone names no file.
  if (dot <= 0 || /[\\/\s"]/.test(path.charAt(dot - 1))) return undefined;
  return KINDS.get(
    path
      .slice(dot + 1)
      .trim()
      .toLowerCase(),
  );
}

function visit(
  entries: readonly EntryNode[],
  meshFolder: string | undefined,
  found: AssetReference[],
): void {
  for (const entry of entries) {
    if (entry.kind !== 'property' || entry.value === undefined) continue;
    const value = entry.value;
    if (value.kind === 'block') {
      visit(value.entries, keyOf(entry) === 'pdxmesh' ? meshFolderOf(value) : meshFolder, found);
      continue;
    }
    const kind = assetKind(value.text);
    if (kind === undefined) continue;
    const normal = normaliseGamePath(value.text);
    if (normal === '') continue;
    const bare = !normal.includes('/');
    const path = bare && meshFolder !== undefined ? `${meshFolder}/${normal}` : normal;
    found.push({
      kind,
      written: value.text,
      node: value,
      candidates: kind === 'texture' ? textureCandidates(path) : [path],
      folder: bare && meshFolder === undefined ? 'document' : 'game',
    });
  }
}

/** The game-relative folder of a `pdxmesh` block's `file`, if it has one with a folder. */
function meshFolderOf(block: BlockNode): string | undefined {
  let folder: string | undefined;
  for (const entry of block.entries) {
    if (entry.kind !== 'property' || keyOf(entry) !== 'file' || entry.value?.kind !== 'scalar') {
      continue;
    }
    const normal = normaliseGamePath(entry.value.text);
    const slash = normal.lastIndexOf('/');
    folder = slash < 0 ? undefined : normal.slice(0, slash);
  }
  return folder;
}
