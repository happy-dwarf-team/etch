import { decodeGameText } from '../game-text.ts';
import { Localisation, isLocalisationPath, type LocalisationFile } from '../localisation.ts';
import type { GameFile, GameFiles } from './game-files.ts';

/**
 * The folder the game reads localisation `.yml` files from, at any depth: `PdxLocalizeReadFolder`
 * lists `localisation` recursively and then `localisation/replace` recursively, whose files win
 * (EU4 engine lab, research for eu4-engine-lab#59). A mod's `localisation/english/*.yml` is read.
 */
const LOCALISATION_FOLDER = 'localisation';

/** A line of a localisation file that gives a key's value; group 1 is the key. */
const ENTRY_LINE = /^[ \t]*([^\s:"#]+):\d*[ \t]*"/;

/**
 * A localisation file's text without the lines of the keys `keys` does not match, so that a
 * localisation of a few keys (the province names, `PROV151`) does not hold the whole playset's.
 * The other lines stay: the language's header, comments and blank lines.
 */
export function keepLocalisationKeys(text: string, keys: RegExp): string {
  return text
    .split('\n')
    .filter((line) => {
      const key = ENTRY_LINE.exec(line)?.[1];
      return key === undefined || keys.test(key);
    })
    .join('\n');
}

/**
 * Reads the playset's localisation in `language` from disk: the winning `.yml` files under the
 * localisation folder and its subfolders, decoded as UTF-8 (game text, etch#15). A file open in
 * the editor is given to {@link Localisation.update} afterwards. With `keys`, only the keys it
 * matches are kept ({@link keepLocalisationKeys}).
 */
export async function loadPlaysetLocalisation(
  files: GameFiles,
  language: string,
  keys?: RegExp,
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
      .map(async (file): Promise<LocalisationFile> => {
        const { text, bom } = decodeGameText(await files.readFile(file), 'localisation');
        return {
          path: file.path,
          layer: files.layers.indexOf(file.layer),
          text: keys === undefined ? text : keepLocalisationKeys(text, keys),
          bom,
        };
      }),
  );
  return Localisation.load(language, read);
}
