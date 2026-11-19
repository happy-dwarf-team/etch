// The playset's 3D object definitions: the pdxmesh types of every `.gfx` file under `interface/`
// and the entities and animations of every `.asset` file under `gfx/`, subfolders included, the
// folders vanilla EU4 1.37.5 keeps them in. Files are read in path order; a later definition of a
// name wins (which one the game keeps is not checked).
import { readFile } from 'node:fs/promises';
import { readAssetFile, readPdxMeshTypes, EntityIndex, type PdxMeshType } from '../asset/entity.ts';
import { decodeGameText } from '../game-text.ts';
import { parseScript } from '../script/parse.ts';
import type { GameFile, GameFiles } from './game-files.ts';

async function filesUnder(files: GameFiles, root: string, extension?: string): Promise<GameFile[]> {
  const out: GameFile[] = [];
  const walk = async (dir: string): Promise<void> => {
    out.push(...(await files.list(dir, extension)));
    for (const sub of await files.folders(dir)) await walk(sub);
  };
  await walk(root);
  return out;
}

async function read(file: GameFile): Promise<string> {
  return decodeGameText(await readFile(file.absolutePath), 'script').text;
}

/** Reads the pdxmesh types of the playset's `.gfx` files, one list per file in path order. */
export async function loadPdxMeshTypes(files: GameFiles): Promise<PdxMeshType[][]> {
  const gfxFiles = await filesUnder(files, 'interface', '.gfx');
  return Promise.all(
    gfxFiles.map(async (file) => readPdxMeshTypes(parseScript(await read(file)), file.path)),
  );
}

/**
 * The playset's texture files under `gfx/`, subfolders included, by file name without regard to
 * case. EU4 1.37.5 finds a mesh material's texture by its file name in an index of texture files
 * it builds at start, wherever the file lies, so a mesh can name a texture of another folder.
 * Which folders the game indexes, and which of two files of one name it keeps, are not known:
 * this takes `gfx/` and keeps the first file in path order (a folder's files before its
 * subfolders).
 */
export async function loadTexturesByName(files: GameFiles): Promise<Map<string, GameFile>> {
  const byName = new Map<string, GameFile>();
  for (const file of await filesUnder(files, 'gfx')) {
    const name = file.path.slice(file.path.lastIndexOf('/') + 1).toLowerCase();
    if (/\.(dds|tga)$/.test(name) && !byName.has(name)) byName.set(name, file);
  }
  return byName;
}

/** Reads the playset's `.gfx` pdxmesh types and `.asset` definitions. */
export async function loadEntityIndex(files: GameFiles): Promise<EntityIndex> {
  const [gfx, assetFiles] = await Promise.all([
    loadPdxMeshTypes(files),
    filesUnder(files, 'gfx', '.asset'),
  ]);
  const assets = await Promise.all(
    assetFiles.map(async (file) => readAssetFile(parseScript(await read(file)), file.path)),
  );
  return EntityIndex.of(gfx, assets);
}
