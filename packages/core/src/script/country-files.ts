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

/**
 * A `history/countries` file of a mod whose tag also has a file of the game's that it does not
 * replace; the range is the start of the file.
 */
export interface CountryHistoryDiagnostic extends SourceRange {
  readonly severity: 'warning';
  readonly code: 'country-history-shared';
  readonly message: string;
  /** The tag, from the file's name. */
  readonly key: string;
  /** The game's history files of the tag that the playset also reads, as game paths. */
  readonly name: string;
}

/**
 * A `history/countries` file of the playset: its game path, and whether it has the name of one of
 * the game's own files that the playset reads (no layer replaces the folder).
 */
export interface CountryHistoryFile {
  readonly path: string;
  readonly game: boolean;
}

/**
 * The tags the game needs in `common/country_tags`: without one, `CCountryDataBase::AppendFromFile`
 * logs `Missing <tag> country tag` and stops the game (`bmtest-r40`).
 */
export const REQUIRED_COUNTRY_TAGS: readonly string[] = ['PIR', 'NAT', 'REB'];

/**
 * The game's own tags (`REQUIRED_COUNTRY_TAGS`) that the playset's `common/country_tags` lack, at
 * the start of its first file; the range is the start of the file.
 */
export interface CountryTagsMissingDiagnostic extends SourceRange {
  readonly severity: 'warning';
  readonly code: 'country-tags-required';
  readonly message: string;
  readonly key: 'common/country_tags';
  /** The missing tags, comma-separated. */
  readonly name: string;
}

/**
 * The warning for a playset whose `common/country_tags` files lack tags the game needs (`missing`):
 * after reading them the game logs `Missing REB country tag` (or PIR, NAT) and stops at once, 10 s
 * after it starts (`bmtest-r40`: vanilla's `00_countries.txt` without `REB`, put in a mod).
 */
export function countryTagsMissing(missing: readonly string[]): CountryTagsMissingDiagnostic {
  const tags = missing.join(', ');
  return {
    severity: 'warning',
    code: 'country-tags-required',
    message:
      `No common/country_tags file of the playset defines ${tags}: the game needs ` +
      `${missing.length === 1 ? 'it' : 'them'} and stops while it starts, after "Missing ` +
      `${missing[0] ?? ''} country tag" in error.log.`,
    key: 'common/country_tags',
    name: tags,
    start: 0,
    end: 0,
  };
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
 * The tag a `history/countries` file is read for: the first three characters of its name, upper
 * cased, as `CHistoryDataBase::LoadDatabase` looks it up. `undefined` for another path.
 */
export function countryHistoryTag(path: string): string | undefined {
  const match = /^history\/countries\/([^/]+)\.txt$/i.exec(path.replace(/\\/g, '/'));
  const name = match?.[1];
  return name === undefined || name.length < 3 ? undefined : name.slice(0, 3).toUpperCase();
}

/**
 * A warning for a mod's `history/countries` file whose tag also has one of the game's own history
 * files (`histories`, by tag). `CHistoryDataBase::LoadDatabase` reads every file of the folder
 * whose tag is a country into that country's history, so the game reads both: a mod's
 * `SWE - My Sweden.txt` does not replace vanilla's `SWE - Sweden.txt`, which only a file of the
 * same name, or `replace_path`, does (`bmtest-r41`). Files with the game's names are not reported
 * (vanilla itself has `SOF - Segu.txt` and `SOF - Sofala.txt`, which mods copy), nor a mod's own
 * files of one tag, which the corpus has on purpose.
 */
export function checkCountryHistory(
  path: string,
  histories: ReadonlyMap<string, readonly CountryHistoryFile[]>,
): CountryHistoryDiagnostic | undefined {
  const tag = countryHistoryTag(path);
  if (tag === undefined) return undefined;
  const files = histories.get(tag) ?? [];
  const key = path.replace(/\\/g, '/').toLowerCase();
  const self = files.find((file) => file.path.toLowerCase() === key);
  if (self === undefined || self.game) return undefined;
  const others = files.filter((file) => file.game).map((file) => file.path);
  if (others.length === 0) return undefined;
  return {
    severity: 'warning',
    code: 'country-history-shared',
    message:
      `This file does not replace the game's ${others.join(', ')}: the game reads every ` +
      `history/countries file whose name starts with a tag into that country's history, so ${tag} ` +
      "gets both. Only a file of the same name, or replace_path, replaces the game's.",
    key: tag,
    name: others.join(', '),
    start: 0,
    end: 0,
  };
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
