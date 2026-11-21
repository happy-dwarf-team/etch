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

const PARSING_ERRORS = /^(.*?)Parsing Errors\.\s*File:\s*"([^"]+)"/;
const CONTINUATION = /^\s+\[\d+\]:(.*)$/;

/**
 * The lines with each `Parsing Errors.` block split into one line per error. The game writes a
 * file's several errors as a header and indented lines that name no file (seen on 21.11.2026):
 *
 * ```
 * [persistent.cpp:88]: Parsing Errors. File: "events/x.txt", Error:
 *   [0]: Unknown trigger type. Key: adm_techh: adm_techh, near line: 9
 *   [1]: Failed to create trigger: 1, near line: 9
 * ```
 *
 * Each indented line becomes `[persistent.cpp:88]: Parsing Error. File: "events/x.txt", Error: …`,
 * as the game writes a file's single error, and the header goes. Other lines stay as they are.
 */
export function splitParsingErrors(lines: readonly string[]): string[] {
  const out: string[] = [];
  let header: { prefix: string; path: string; line: string; used: boolean } | undefined;
  const flush = (): void => {
    if (header !== undefined && !header.used) out.push(header.line);
    header = undefined;
  };
  for (const line of lines) {
    const rest = CONTINUATION.exec(line);
    if (rest !== null && header !== undefined) {
      out.push(
        `${header.prefix}Parsing Error. File: "${header.path}", Error: ${(rest[1] ?? '').trim()}`,
      );
      header.used = true;
      continue;
    }
    flush();
    const opened = PARSING_ERRORS.exec(line);
    if (opened === null) out.push(line);
    else header = { prefix: opened[1] ?? '', path: opened[2] ?? '', line, used: false };
  }
  flush();
  return out;
}

/** Whether a start line is about a localisation key, whose place is the `.yml` that defines it. */
export function isLocalisationLine(message: string): boolean {
  return /\blocali[sz]ation\b/i.test(message);
}

const FILE_LINE = /\bfile:\s*"?([^"\s,]+)"?[\s,]*line:\s*(\d+)/i;
const QUOTED_FILE = /\bFile:\s*"([^"]+)"/;
const NEAR_LINE = /\bnear line:\s*(\d+)/i;
/** A path at the start of the message (`interface/frontend.gui: Missing …`). */
const LEADING_PATH = /^([\w.\- ]+(?:\/[\w.\- ]+)+\.(?:gui|gfx|txt|yml|asset|csv|map|lua)):\s/i;
const KEYS: readonly RegExp[] = [
  /\bKey:\s*"([^"]+)"/,
  // `Key: adm_techh: adm_techh`: the key without the colon after it.
  /\bKey:\s*([^\s,":]+)/,
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
