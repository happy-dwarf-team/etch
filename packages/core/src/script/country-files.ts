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
 *
 * `CCountryDataBase::AppendFromFile` reads the files in name order and keeps the first file of a
 * tag: a tag defined again, in the same file or a later one, is left out with `Duplicate Country
 * Tag - <tag>` in `error.log`, and its file is not read (`bmtest-r38`). Such a tag is reported as a
 * duplicate and its file is not checked. A key of other than three characters is left out without
 * a word (`ZZEX = "countries/…"`, `bmtest-r39`): there is no such country, which is reported too.
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

/**
 * A tag of `common/country_tags` the game leaves out: one an earlier line defines, or a key of other
 * than three characters with a country file; the range is the key.
 */
export interface CountryTagDiagnostic extends SourceRange {
  readonly severity: 'warning';
  readonly code: 'country-tag-duplicate' | 'country-tag-length';
  readonly message: string;
  /** The tag. */
  readonly key: string;
  /** The file name this line writes, which the game does not read. */
  readonly name: string;
  /**
   * For a duplicate, the game path of the `common/country_tags` file whose definition the game
   * keeps, in lower case.
   */
  readonly path?: string;
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
export function readCountryFiles(
  parsed: ParsedScript,
): { tag: string; file: ScalarNode; key: ScalarNode }[] {
  const found: { tag: string; file: ScalarNode; key: ScalarNode }[] = [];
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'scalar') continue;
    if (!/^[A-Za-z0-9]{3}$/.test(entry.key.text) || !/\.txt$/i.test(entry.value.text)) continue;
    found.push({ tag: entry.key.text, file: entry.value, key: entry.key });
  }
  return found;
}

/**
 * The file of `common/country_tags` that defines each tag first, by tag, from the playset's files
 * in the order the game reads them (by name); the paths are in lower case.
 */
export function firstCountryTags(
  files: readonly { readonly path: string; readonly parsed: ParsedScript }[],
): Map<string, string> {
  const firsts = new Map<string, string>();
  for (const { path, parsed } of files) {
    for (const { tag } of readCountryFiles(parsed)) {
      if (!firsts.has(tag)) firsts.set(tag, path.replace(/\\/g, '/').toLowerCase());
    }
  }
  return firsts;
}

/**
 * The country files a parsed `common/country_tags` file names that the playset does not have, by
 * whether a layer has each game path (`present`, by the path in lower case); a path `present`
 * does not hold is not checked. With the file's game path and the first file of each tag
 * (`firstCountryTags`), a tag an earlier line or file defines is reported instead, and its file
 * is not checked: the game does not read it.
 */
export function checkCountryFiles(
  parsed: ParsedScript,
  present: ReadonlyMap<string, boolean>,
  tags?: { readonly path: string; readonly firsts: ReadonlyMap<string, string> },
): (CountryFileDiagnostic | CountryTagDiagnostic)[] {
  const found: (CountryFileDiagnostic | CountryTagDiagnostic)[] = [];
  const here = tags?.path.replace(/\\/g, '/').toLowerCase();
  const seen = new Set<string>();
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'scalar') continue;
    const { key, value } = entry;
    if (key.text.length === 3 || !/\.txt$/i.test(value.text)) continue;
    found.push({
      severity: 'warning',
      code: 'country-tag-length',
      message:
        `${key.text} is not a tag: the game takes only three-character tags from ` +
        'common/country_tags and leaves this line out without a word in error.log, so there is ' +
        'no such country.',
      key: key.text,
      name: value.text,
      start: key.start,
      end: key.end,
    });
  }
  for (const { tag, file, key } of readCountryFiles(parsed)) {
    const first = tags?.firsts.get(tag);
    if (first !== undefined && (first !== here || seen.has(tag))) {
      found.push({
        severity: 'warning',
        code: 'country-tag-duplicate',
        message:
          `${tag} is a tag of ${first === here ? 'an earlier line of this file' : first} already: the ` +
          `game keeps the first and leaves this one out, with "Duplicate Country Tag - ${tag}" in ` +
          'error.log, and does not read its file.',
        key: tag,
        name: file.text,
        path: first,
        start: key.start,
        end: key.end,
      });
      continue;
    }
    seen.add(tag);
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
  return found.sort((a, b) => a.start - b.start);
}
