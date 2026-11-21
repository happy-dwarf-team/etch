/**
 * The live game's start report (ADR 0007, part 1): what the game wrote to `error.log` while it
 * loaded, read line by line for the file, the line and the key each names, so that the extension
 * can put on the edited mod's files what the game found in them. The line shapes are those of
 * EU4 1.37.5's own `error.log` (seen on 21.11.2026 in a profile with an Anbennar playset):
 *
 * - `[windowtype.cpp:809]: Guitype 'button1' already exists … file: interface/x.gui line: 731`
 * - `[persistent.cpp:88]: Parsing Error. File: "interface/settings.gui", Error: …, near line: 2640, …`
 * - `[fixedwindow.cpp:2962]: interface/frontend.gui: Missing Button 'social_view_button' …`
 * - `[triggerimplementation.cpp:17071]: Unknown province-modifier in a trigger xx_some_modifier`
 * - `[pdx_localize.cpp:1063]: Error in localization value! Key: "SOME_KEY", Error: "…"`
 *
 * A line that names a file is about that file; one that names only a key is about where the key
 * is written, which the extension looks up in the mod's files.
 */

/** What a start line names. */
export interface StartLine {
  /** The line's message: what follows `[file.cpp:123]: `, after an optional `[hh:mm:ss]`. */
  readonly message: string;
  /** The game-relative path the line names, with `/` separators; `undefined` for none. */
  readonly path?: string;
  /** The 1-based line of `path` the line names; `undefined` for none. */
  readonly line?: number;
  /** The script or localisation key the line names when it names no file. */
  readonly key?: string;
  /** Whether the game says it could not read the file (`Parsing Error`, `Unexpected token`). */
  readonly parseError: boolean;
}

/** The message of a log line: what follows `[file.cpp:123]: `, after an optional `[hh:mm:ss]`. */
export function startLineMessage(line: string): string {
  let rest = line.trim();
  const stamp = /^\[\d{1,2}:\d{2}:\d{2}\]\s*/.exec(rest);
  if (stamp !== null) rest = rest.slice(stamp[0].length);
  const source = /^\[[^\]]*\.cpp:\d+\]:\s*/.exec(rest);
  return source === null ? rest : rest.slice(source[0].length);
}

const FILE_LINE = /\bfile:\s*"?([^"\s,]+)"?\s*,?\s*line:\s*(\d+)/i;
const QUOTED_FILE = /\bFile:\s*"([^"]+)"/;
const NEAR_LINE = /\bnear line:\s*(\d+)/i;
/** A path at the start of the message (`interface/frontend.gui: Missing …`). */
const LEADING_PATH = /^([\w.\- ]+(?:\/[\w.\- ]+)+\.(?:gui|gfx|txt|yml|asset|csv|map|lua)):\s/i;
const KEYS: readonly RegExp[] = [
  /\bKey:\s*"([^"]+)"/,
  /\bKey:\s*([^\s,"]+)/,
  /\bin an? (?:trigger|effect)\s+(\S+)\s*$/i,
];
const PARSE_ERROR = /\bparsing error\b|\bunexpected token\b/i;

function normalise(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '');
}

/** Reads what a line of the start's `error.log` names. */
export function readStartLine(raw: string): StartLine {
  const message = startLineMessage(raw);
  const parseError = PARSE_ERROR.test(message);
  const fileLine = FILE_LINE.exec(message);
  if (fileLine?.[1] !== undefined) {
    return { message, path: normalise(fileLine[1]), line: Number(fileLine[2]), parseError };
  }
  const quoted = QUOTED_FILE.exec(message);
  if (quoted?.[1] !== undefined) {
    const near = NEAR_LINE.exec(message);
    const path = normalise(quoted[1]);
    return near === null
      ? { message, path, parseError }
      : { message, path, line: Number(near[1]), parseError };
  }
  const leading = LEADING_PATH.exec(message);
  if (leading?.[1] !== undefined) return { message, path: normalise(leading[1]), parseError };
  for (const pattern of KEYS) {
    const key = pattern.exec(message)?.[1];
    if (key !== undefined && key !== '') return { message, key, parseError };
  }
  return { message, parseError };
}

/**
 * The first place a key is written in a file's text as a whole word: its offset and length, or
 * `undefined`. A word is what Paradox script and localisation keys are made of (letters, digits,
 * `_`, `.`, `-`, `'`), so `etch.1` is not found inside `etch.10`.
 */
export function findKey(text: string, key: string): { start: number; end: number } | undefined {
  if (key === '') return undefined;
  const word = /[\p{L}\p{N}_.\-']/u;
  let at = text.indexOf(key);
  while (at >= 0) {
    const before = at === 0 ? '' : (text[at - 1] ?? '');
    const after = text[at + key.length] ?? '';
    if (!word.test(before) && !word.test(after)) {
      return { start: at, end: at + key.length };
    }
    at = text.indexOf(key, at + 1);
  }
  return undefined;
}
