import { readFile } from 'node:fs/promises';
import { decodeGameText } from '../game-text.ts';
import { Localisation, isLocalisationPath, type LocalisationFile } from '../localisation.ts';
import type { GameFile, GameFiles } from './game-files.ts';

/**
 * The folder the game reads localisation `.yml` files from, at any depth: `PdxLocalizeReadFolder`
 * lists `localisation` recursively and then `localisation/replace` recursively, whose files win
 * (EU4 engine lab, research for eu4-engine-lab#59). A mod's `localisation/english/*.yml` is read.
 */
const LOCALISATION_FOLDER = 'localisation';

/**
 * Reads the playset's localisation in `language` from disk: the winning `.yml` files under the
 * localisation folder and its subfolders, decoded as UTF-8 (game text, etch#15). A file open in
 * the editor is given to {@link Localisation.update} afterwards.
 */
export async function loadPlaysetLocalisation(
  files: GameFiles,
  language: string,
): Promise<Localisation> {
  const listed: GameFile[] = [];
  const walk = async (dir: string): Promise<void> => {
    listed.push(...(await files.list(dir, '.yml')));
    for (const sub of await files.folders(dir)) await walk(sub);
  };
  await walk(LOCALISATION_FOLDER);
  const read = await Promise.all(
    listed
      .filter((file) => isLocalisationPath(file.path, language))
      .map(async (file): Promise<LocalisationFile> => ({
        path: file.path,
        layer: files.layers.indexOf(file.layer),
        text: decodeGameText(await readFile(file.absolutePath), 'localisation').text,
      })),
  );
  return Localisation.load(language, read);
}
