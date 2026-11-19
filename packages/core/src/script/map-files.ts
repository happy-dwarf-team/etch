/**
 * The map files `map/default.map` names that no layer of the playset has. The game reads each one
 * while it loads the map, before the main menu, and does not go on without it (the EU4 engine lab,
 * `bmtest-r18` to `r35`, 19.11.2026):
 *
 * - A script file (`climate`, `region`, …) is read through the game's lexer, which writes
 *   `CLexer failed to load file map/<name>` to `error.log`, keeps no file and then reads from it:
 *   the game crashes about 16 s after it starts (an access violation in `CTextLexer::GetTok`).
 * - A table or a bitmap (`definitions`, `adjacencies`, `rivers`, …) is opened as a file that must
 *   exist: `error.log` gets "File exception: … Could not open file: map/<name>" and the load stops
 *   there, without a crash or a main menu.
 *
 * `trade_winds` and `seasons` are left out: the game tests that the file exists and skips it, and
 * it starts without `ambient_object`'s file too. A key the file leaves unset keeps the game's
 * default name, which the game has.
 */
import type { ParsedScript, ScalarNode, SourceRange } from './tree.ts';

/** What the game does without a map file: crash while it reads it, or stop loading. */
export type MapFileFailure = 'crash' | 'stops';

/** The keys of `map/default.map` that name a file in `map/`, by what the game does without it. */
export const MAP_FILE_KEYS: ReadonlyMap<string, MapFileFailure> = new Map<string, MapFileFailure>([
  ['terrain_definition', 'crash'],
  ['continent', 'crash'],
  ['area', 'crash'],
  ['region', 'crash'],
  ['superregion', 'crash'],
  ['provincegroup', 'crash'],
  ['climate', 'crash'],
  ['positions', 'crash'],
  ['definitions', 'stops'],
  ['provinces', 'stops'],
  ['adjacencies', 'stops'],
  ['terrain', 'stops'],
  ['rivers', 'stops'],
  ['heightmap', 'stops'],
  ['tree_definition', 'stops'],
]);

/** A file `map/default.map` names that no layer of the playset has; the range is the name. */
export interface MapFileDiagnostic extends SourceRange {
  readonly severity: 'warning';
  readonly code: 'map-file-missing';
  readonly message: string;
  /** The key of `map/default.map` that names the file. */
  readonly key: string;
  /** The file name as `map/default.map` writes it. */
  readonly name: string;
  /** The file's game path, `map/<name>`. */
  readonly path: string;
}

/** The file names `map/default.map` sets for `MAP_FILE_KEYS`, by key in lower case; the last wins. */
export function readMapFileNames(parsed: ParsedScript): Map<string, ScalarNode> {
  const names = new Map<string, ScalarNode>();
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'scalar') continue;
    const key = entry.key.text.toLowerCase();
    if (MAP_FILE_KEYS.has(key) && entry.value.text !== '') names.set(key, entry.value);
  }
  return names;
}

/** The game path of a file `map/default.map` names. */
export function mapFilePath(name: string): string {
  return `map/${name}`;
}

const FAILURE_TEXT: Readonly<Record<MapFileFailure, string>> = {
  crash:
    'the game reads it while it loads the map and crashes without it, after "CLexer failed to load file" in error.log',
  stops:
    'the game opens it while it loads the map and stops loading without it, after a file exception in error.log',
};

/**
 * The files `map/default.map` names (`MAP_FILE_KEYS`) that the playset does not have, by whether
 * a layer has each game path (`present`, by the path in lower case); a path `present` does not
 * hold is not checked.
 */
export function checkMapFiles(
  parsed: ParsedScript,
  present: ReadonlyMap<string, boolean>,
): MapFileDiagnostic[] {
  const found: MapFileDiagnostic[] = [];
  for (const [key, name] of readMapFileNames(parsed)) {
    const path = mapFilePath(name.text);
    const failure = MAP_FILE_KEYS.get(key);
    if (failure === undefined || present.get(path.toLowerCase()) !== false) continue;
    found.push({
      severity: 'warning',
      code: 'map-file-missing',
      message: `The playset has no ${path}, which ${key} names: ${FAILURE_TEXT[failure]}.`,
      key,
      name: name.text,
      path,
      start: name.start,
      end: name.end,
    });
  }
  return found.sort((a, b) => a.start - b.start);
}
