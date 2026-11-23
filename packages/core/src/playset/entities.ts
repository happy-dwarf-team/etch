// The playset's 3D object definitions: the pdxmesh and pdxparticle types of every `.gfx` file under
// `interface/` and the entities, animations and particle systems of every `.asset` file under
// `gfx/`, subfolders included, the folders vanilla EU4 1.37.5 keeps them in. Files are read in path
// order; a later definition of a name wins (which one the game keeps is not checked).
import {
  readAssetFile,
  readPdxMeshTypes,
  readPdxParticleTypes,
  EntityIndex,
  type PdxMeshType,
  type PdxParticleType,
} from '../asset/entity.ts';
import { decodeGameText } from '../game-text.ts';
import { parseScript } from '../script/parse.ts';
import type { ParsedScript } from '../script/tree.ts';
import type { GameFile, GameFiles } from './game-files.ts';

async function filesUnder(files: GameFiles, root: string, extension: string): Promise<GameFile[]> {
  const out: GameFile[] = [];
  const walk = async (dir: string): Promise<void> => {
    out.push(...(await files.list(dir, extension)));
    for (const sub of await files.folders(dir)) await walk(sub);
  };
  await walk(root);
  return out;
}

async function read(files: GameFiles, file: GameFile): Promise<string> {
  return decodeGameText(await files.readFile(file), 'script').text;
}

/** Reads each of the playset's `.gfx` files with `reader`, one list per file in path order. */
async function readGfx<T>(
  files: GameFiles,
  reader: (parsed: ParsedScript, path: string) => T[],
): Promise<T[][]> {
  const gfxFiles = await filesUnder(files, 'interface', '.gfx');
  return Promise.all(
    gfxFiles.map(async (file) => reader(parseScript(await read(files, file)), file.path)),
  );
}

/** Reads the pdxmesh types of the playset's `.gfx` files, one list per file in path order. */
export function loadPdxMeshTypes(files: GameFiles): Promise<PdxMeshType[][]> {
  return readGfx(files, readPdxMeshTypes);
}

/** Reads the playset's `.gfx` pdxmesh and pdxparticle types and `.asset` definitions. */
export async function loadEntityIndex(files: GameFiles): Promise<EntityIndex> {
  const [types, assetFiles] = await Promise.all([
    readGfx(files, (parsed, path): { meshes: PdxMeshType[]; particles: PdxParticleType[] }[] => [
      { meshes: readPdxMeshTypes(parsed, path), particles: readPdxParticleTypes(parsed, path) },
    ]),
    filesUnder(files, 'gfx', '.asset'),
  ]);
  const assets = await Promise.all(
    assetFiles.map(async (file) => readAssetFile(parseScript(await read(files, file)), file.path)),
  );
  const gfx = types.flat();
  return EntityIndex.of(
    gfx.map((file) => file.meshes),
    assets,
    gfx.map((file) => file.particles),
  );
}
