/**
 * Province history files of one province under different names. `CLoadProvinces::operator()`
 * takes a `history/provinces` file's province from its name with `atoi` (`1 - Uppland.txt` is
 * province 1) and reads every such file with a new lexer into that province's history; it does not
 * check whether the province already has a file (the EU4 engine lab, 19.11.2026, the same
 * mechanism as the country histories of `checkCountryHistory`). A mod's `1 - Uppland.txt` beside the
 * game's `1-Uppland.txt` is therefore read together with it: it does not replace it.
 *
 * Vanilla has no province with two files; three Workshop mods of the lab have 113, 167 and 793
 * files beside the game's under another name. The open file gets a warning; the playset check sums
 * them up per mod.
 */
import type { CountryHistoryFile } from './country-files.ts';
import type { SourceRange } from './tree.ts';

/**
 * A mod's `history/provinces` file whose province also has a file of the game's that it does not
 * replace; the range is the start of the file.
 */
export interface ProvinceHistoryDiagnostic extends SourceRange {
  readonly severity: 'warning';
  readonly code: 'province-history-shared';
  readonly message: string;
  /** `history/provinces`. */
  readonly key: 'history/provinces';
  /** The province, from the file's name. */
  readonly id: number;
  /** The game's history files of the province that the playset also reads, as game paths. */
  readonly name: string;
}

/**
 * The province a `history/provinces` file is read for: `atoi` of its name, as `CLoadProvinces`
 * takes it (leading blanks and a sign allowed). `undefined` for another path, a file in a folder
 * below it, or a name that gives no province above 0.
 */
export function provinceHistoryId(path: string): number | undefined {
  const match = /^history\/provinces\/([^/]+)\.txt$/i.exec(path.replace(/\\/g, '/'));
  if (match === null) return undefined;
  const id = Number(/^\s*([+-]?\d+)/.exec(match[1] ?? '')?.[1] ?? 0);
  return id >= 1 ? id : undefined;
}

/**
 * A warning for a mod's `history/provinces` file whose province also has one of the game's own
 * history files (`histories`, by province) that the playset reads. Files with the game's names are
 * not reported (they replace the game's), nor a mod's own files of one province that the game has
 * no file of.
 */
export function checkProvinceHistory(
  path: string,
  histories: ReadonlyMap<number, readonly CountryHistoryFile[]>,
): ProvinceHistoryDiagnostic | undefined {
  const id = provinceHistoryId(path);
  if (id === undefined) return undefined;
  const files = histories.get(id) ?? [];
  const key = path.replace(/\\/g, '/').toLowerCase();
  const self = files.find((file) => file.path.toLowerCase() === key);
  if (self === undefined || self.game) return undefined;
  const others = files.filter((file) => file.game).map((file) => file.path);
  if (others.length === 0) return undefined;
  return {
    severity: 'warning',
    code: 'province-history-shared',
    message:
      `This file does not replace the game's ${others.join(', ')}: the game reads every ` +
      'history/provinces file whose name starts with a province id into that province, so ' +
      `province ${String(id)} gets both histories. Only a file of the same name, or replace_path, ` +
      "replaces the game's.",
    key: 'history/provinces',
    id,
    name: others.join(', '),
    start: 0,
    end: 0,
  };
}
