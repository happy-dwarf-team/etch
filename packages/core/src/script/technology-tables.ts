/**
 * The technology tables of `common/technology.txt` (`tables = { adm_tech = "technologies/adm.txt" }`)
 * that no layer of the playset has. The game reads each table's file below
 * `common/` through the game's lexer while the game starts, with no test that the file exists, as
 * it does for country files: a missing one leaves
 * `CLexer failed to load file common/technologies/<name>` in `error.log`, and the game crashes
 * about 12 s after it starts, before the main menu (an access violation; the
 * EU4 engine lab, `bmtest-r37`, 19.11.2026). Vanilla and the lab's mods with their own
 * `common/technology.txt` name only the three files they have.
 */
import { countryFilePath } from './country-files.ts';
import type { ParsedScript, ScalarNode, SourceRange } from './tree.ts';

/** A technology table that no layer has; the range is its file name. */
export interface TechnologyTableDiagnostic extends SourceRange {
  readonly severity: 'warning';
  readonly code: 'technology-table-missing';
  readonly message: string;
  /** The table's key, such as `adm_tech`. */
  readonly key: string;
  /** The file name as the table writes it. */
  readonly name: string;
  /** The file's game path, `common/<name>`. */
  readonly path: string;
}

/** Whether a path is the technology file, `common/technology.txt`. */
export function isTechnologyPath(path: string): boolean {
  return /^common\/technology\.txt$/i.test(path.replace(/\\/g, '/'));
}

/** The tables of a parsed `common/technology.txt`, each with the `.txt` file it names, in order. */
export function readTechnologyTables(parsed: ParsedScript): { key: string; file: ScalarNode }[] {
  const found: { key: string; file: ScalarNode }[] = [];
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || entry.key.text.toLowerCase() !== 'tables') continue;
    if (entry.value?.kind !== 'block') continue;
    for (const table of entry.value.entries) {
      if (table.kind !== 'property' || table.value?.kind !== 'scalar') continue;
      if (!/\.txt$/i.test(table.value.text)) continue;
      found.push({ key: table.key.text, file: table.value });
    }
  }
  return found;
}

/**
 * The technology tables a parsed `common/technology.txt` names that the playset does not have, by
 * whether a layer has each game path (`present`, by the path in lower case). A table's file is a
 * path below `common/`, as a country file is (`countryFilePath`).
 */
export function checkTechnologyTables(
  parsed: ParsedScript,
  present: ReadonlyMap<string, boolean>,
): TechnologyTableDiagnostic[] {
  const found: TechnologyTableDiagnostic[] = [];
  for (const { key, file } of readTechnologyTables(parsed)) {
    const path = countryFilePath(file.text);
    if (path === undefined || present.get(path.toLowerCase()) !== false) continue;
    found.push({
      severity: 'warning',
      code: 'technology-table-missing',
      message:
        `The playset has no ${path}, which the technology table ${key} names: the game reads ` +
        'every table while it starts and crashes without it, after "CLexer failed to load file" ' +
        'in error.log.',
      key,
      name: file.text,
      path,
      start: file.start,
      end: file.end,
    });
  }
  return found;
}
