/**
 * The country files of `common/country_tags` (`SWE = "countries/Sweden.txt"`) that no layer of the
 * playset has. `CCountryDataBase::ReadCountryFiles` reads each tag's file below `common/` through
 * the game's lexer while the game starts, with no test that the file exists: a missing one leaves
 * `CLexer failed to load file common/countries/<name>` in `error.log`, and the game crashes about
 * 20 s after it starts, before the main menu (an access violation in `CPersistent::Read`; the EU4
 * engine lab, `bmtest-r36`, 19.11.2026). One of the lab's Workshop mods, run alone, crashes
 * that way on a tag whose file it does not ship.
 *
 * The game passes the path's bytes to its file system, which reads them as UTF-8, while Etch reads
 * script files as Windows-1252: a path with other than ASCII characters is not checked, so that a
 * name such as `Jötunnheim.txt` written in UTF-8 is not taken for a missing file.
 */
import type { ParsedScript, ScalarNode, SourceRange } from './tree.ts';

/** A country file a `common/country_tags` file names that no layer has; the range is the path. */
export interface CountryFileDiagnostic extends SourceRange {
  readonly severity: 'warning';
  readonly code: 'country-file-missing';
  readonly message: string;
  /** The country's tag. */
  readonly key: string;
  /** The file name as the tag writes it. */
  readonly name: string;
  /** The file's game path, `common/<path>`. */
  readonly path: string;
}

/** Whether a path is a file of `common/country_tags`. */
export function isCountryTagsPath(path: string): boolean {
  return /^common\/country_tags\/[^/]+\.txt$/i.test(path.replace(/\\/g, '/'));
}

/** The game path of a country file a tag names, or `undefined` for a path Etch does not check. */
export function countryFilePath(name: string): string | undefined {
  if (name === '' || !/^[\x20-\x7e]+$/.test(name)) return undefined;
  return `common/${name.replace(/\\/g, '/')}`;
}

/**
 * The tags of a `common/country_tags` file with the `.txt` file each names, in file order: a
 * three-character key with a file name ending in `.txt` (not a setting such as
 * `dynamic_tags = yes`).
 */
export function readCountryFiles(parsed: ParsedScript): { tag: string; file: ScalarNode }[] {
  const found: { tag: string; file: ScalarNode }[] = [];
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'scalar') continue;
    if (!/^[A-Za-z0-9]{3}$/.test(entry.key.text) || !/\.txt$/i.test(entry.value.text)) continue;
    found.push({ tag: entry.key.text, file: entry.value });
  }
  return found;
}

/**
 * The country files a parsed `common/country_tags` file names that the playset does not have, by
 * whether a layer has each game path (`present`, by the path in lower case); a path `present`
 * does not hold is not checked.
 */
export function checkCountryFiles(
  parsed: ParsedScript,
  present: ReadonlyMap<string, boolean>,
): CountryFileDiagnostic[] {
  const found: CountryFileDiagnostic[] = [];
  for (const { tag, file } of readCountryFiles(parsed)) {
    const path = countryFilePath(file.text);
    if (path === undefined || present.get(path.toLowerCase()) !== false) continue;
    found.push({
      severity: 'warning',
      code: 'country-file-missing',
      message:
        `The playset has no ${path}, which ${tag} names: the game reads every tag's file while it ` +
        'starts and crashes without it, after "CLexer failed to load file" in error.log.',
      key: tag,
      name: file.text,
      path,
      start: file.start,
      end: file.end,
    });
  }
  return found;
}
