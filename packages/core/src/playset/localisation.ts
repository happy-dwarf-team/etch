import { readFile } from 'node:fs/promises';
import { decodeGameText } from '../game-text.ts';
import { Localisation, isLocalisationPath, type LocalisationFile } from '../localisation.ts';
import type { GameFiles } from './game-files.ts';

/** The folders the game lists for localisation `.yml` files (EU4 engine lab, startup profile). */
const LOCALISATION_FOLDERS = ['localisation', 'localisation/replace'];

/**
 * Reads the playset's localisation in `language` from disk: the winning `.yml` files of the
 * localisation folders, decoded as UTF-8 (game text, etch#15). A file open in the editor is given
 * to {@link Localisation.update} afterwards.
 */
export async function loadPlaysetLocalisation(
  files: GameFiles,
  language: string,
): Promise<Localisation> {
  const listed = await Promise.all(LOCALISATION_FOLDERS.map((dir) => files.list(dir, '.yml')));
  const read = await Promise.all(
    listed
      .flat()
      .filter((file) => isLocalisationPath(file.path, language))
      .map(async (file): Promise<LocalisationFile> => ({
        path: file.path,
        layer: files.layers.indexOf(file.layer),
        text: decodeGameText(await readFile(file.absolutePath), 'localisation').text,
      })),
  );
  return Localisation.load(language, read);
}
