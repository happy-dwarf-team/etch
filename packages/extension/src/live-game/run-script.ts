// Running a selected script in the live game (lab#156): the file Etch writes for the game's console
// `run`, the answer it reads back from `game.log` for a trigger, the `error.log` lines mapped back
// to the selection, and the marks that tell which private saves were written after a Run. Etch does
// not parse or check the script (CWTools does); it only wraps it. Node only, no vscode.
import { randomBytes } from 'node:crypto';
import { toCp1252 } from '@etch/core';

/**
 * The script as the game reads its script files, in Windows-1252, and how many characters that
 * code page has no byte for (written as `?`).
 */
export function encodeScript(text: string): { readonly bytes: Uint8Array; readonly lost: number } {
  const bytes: number[] = [];
  let lost = 0;
  for (const c of text) {
    const byte = toCp1252(c.codePointAt(0) as number);
    if (byte === undefined) lost++;
    bytes.push(byte ?? 0x3f);
  }
  return { bytes: Uint8Array.from(bytes), lost };
}

/** Where a selection runs: the player's country (`run`'s own scope) or a province by id. */
export type RunScope =
  { readonly kind: 'country' } | { readonly kind: 'province'; readonly province: number };

/** Effects run as they are; a trigger is checked and its answer logged. */
export type RunMode = 'effect' | 'trigger';

/** The file names the plugin accepts (`IsRunFile`): no folder, one per run. */
export const RUN_FILE = /^etch_run_[0-9a-f]{8,32}\.txt$/;

/** The most characters a selection may have; the game reads the whole file in one frame. */
export const MAX_SCRIPT = 256 * 1024;

/** A fresh script file name and the token its trigger answer carries. */
export function newRunFile(): { readonly file: string; readonly token: string } {
  const token = randomBytes(8).toString('hex');
  return { file: `etch_run_${token}.txt`, token };
}

/** What Etch writes for the game, and where the selection's first line is in it (1-based). */
export interface RunScript {
  readonly text: string;
  readonly firstLine: number;
}

/** The marker of a trigger's answer in `game.log`. */
const MARKER = 'ETCH_CHECK';

/**
 * The script file for a selection: effects as they are in the player's country, wrapped in
 * `<id> = { … }` for a province; a trigger inside `if = { limit = { … } log = "…TRUE" } else = {
 * log = "…FALSE" }`. The selection keeps its lines, so a line the game names maps back to it.
 */
export function buildScript(
  selection: string,
  scope: RunScope,
  mode: RunMode,
  token: string,
): RunScript {
  const body = selection.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  const lines: string[] = [];
  if (scope.kind === 'province') lines.push(`${String(scope.province)} = {`);
  if (mode === 'trigger') lines.push('if = {', 'limit = {');
  const firstLine = lines.length + 1;
  lines.push(body);
  if (mode === 'trigger') {
    lines.push(
      '}',
      `log = "${MARKER} ${token} TRUE"`,
      '}',
      'else = {',
      `log = "${MARKER} ${token} FALSE"`,
      '}',
    );
  }
  if (scope.kind === 'province') lines.push('}');
  return { text: `${lines.join('\n')}\n`, firstLine };
}

/** A trigger's answer from new `game.log` lines: true, false, or `undefined` when none came. */
export function readCheck(lines: readonly string[], token: string): boolean | undefined {
  const pattern = new RegExp(`${MARKER} ${token} (TRUE|FALSE)\\b`);
  for (const line of lines) {
    const found = pattern.exec(line);
    if (found !== null) return found[1] === 'TRUE';
  }
  return undefined;
}

/** An `error.log` line of a run, with the selection's line it names (0-based), when it names one. */
export interface RunError {
  readonly line: string;
  readonly count: number;
  /** The selection's line, 0-based from its first line; `undefined` when the game named none. */
  readonly selectionLine: number | undefined;
}

/**
 * The new `error.log` lines of a run, each with the selection's line its `near line: N` names
 * (the game's parsing errors). A line in the wrapper, before or after the selection, names none.
 */
export function mapRunErrors(
  lines: readonly { readonly line: string; readonly count: number }[],
  script: RunScript,
  selectionLines: number,
): RunError[] {
  return lines.map(({ line, count }) => {
    const near = /near line:?\s*(\d+)/i.exec(line);
    const at = near === null ? undefined : Number(near[1]) - script.firstLine;
    return {
      line,
      count,
      selectionLine: at !== undefined && at >= 0 && at < selectionLines ? at : undefined,
    };
  });
}

/**
 * The text to run when nothing is selected: the statement that starts on the cursor's line, with
 * its block when it opens one (`add_treasury = 100`, `capital_scope = { … }`). Braces in comments
 * and quoted strings do not count. Offsets into `text`; `undefined` for an empty line or a block
 * that does not close.
 */
export function blockAtLine(
  text: string,
  lineStart: number,
): { readonly start: number; readonly end: number } | undefined {
  let lineEnd = text.indexOf('\n', lineStart);
  if (lineEnd < 0) lineEnd = text.length;
  let start = lineStart;
  while (start < lineEnd && /\s/.test(text[start] as string)) start++;
  if (start >= lineEnd || text[start] === '#' || text[start] === '}') return undefined;
  let depth = 0;
  let opened = false;
  let quoted = false;
  for (let at = start; at < text.length; at++) {
    const c = text[at] as string;
    if (quoted) {
      if (c === '"') quoted = false;
      else if (c === '\n') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === '#') {
      const next = text.indexOf('\n', at);
      if (next < 0) break;
      at = next - 1;
    } else if (c === '{') {
      depth++;
      opened = true;
    } else if (c === '}') {
      depth--;
      if (depth < 0) return undefined;
      if (depth === 0 && opened) return { start, end: at + 1 };
    } else if (c === '\n' && at >= lineEnd && !opened) {
      return { start, end: trimEnd(text, start, lineEnd) };
    }
  }
  if (!opened) return { start, end: trimEnd(text, start, lineEnd) };
  return undefined;
}

function trimEnd(text: string, start: number, end: number): number {
  // A comment at the end of the line is left out with the line end.
  let stop = end;
  let quoted = false;
  for (let at = start; at < end; at++) {
    const c = text[at] as string;
    if (c === '"') quoted = !quoted;
    else if (c === '#' && !quoted) {
      stop = at;
      break;
    }
  }
  while (stop > start && /\s/.test(text[stop - 1] as string)) stop--;
  return stop;
}

/** A stretch of time in which the live game's state may hold what a Run changed. */
export interface RunSpan {
  readonly from: number;
  /** When the process ended; `undefined` while it runs (or when Etch did not see it end). */
  readonly to?: number | undefined;
}

/** The most spans kept: older ones go first. */
const MAX_SPANS = 64;

/**
 * Which private saves were written after a Run (lab#156): a save written while a process ran with
 * a Run behind it, or by a process that started from such a save. Spans are kept in Etch's global
 * state; a span still open when the next process starts is closed then.
 */
export class RunMarks {
  private spans: RunSpan[];

  constructor(spans: readonly RunSpan[] = []) {
    this.spans = [...spans];
  }

  get all(): readonly RunSpan[] {
    return this.spans;
  }

  /** A save written at `modifiedMs` holds what a Run changed. */
  isAfterRun(modifiedMs: number): boolean {
    return this.spans.some(
      (s) => modifiedMs >= s.from && (s.to === undefined || modifiedMs <= s.to),
    );
  }

  /** A Run at `now`, or a process that started at `now` from a marked save: opens a span. */
  open(now: number): void {
    const last = this.spans.at(-1);
    if (last !== undefined && last.to === undefined) return;
    this.spans.push({ from: now });
    if (this.spans.length > MAX_SPANS) this.spans = this.spans.slice(-MAX_SPANS);
  }

  /** The process ended at `now` (or the next one starts): closes the open span. */
  close(now: number): void {
    const last = this.spans.at(-1);
    if (last === undefined || last.to !== undefined) return;
    this.spans[this.spans.length - 1] = { from: last.from, to: now };
  }

  /** Whether a span is open: the running process holds what a Run changed. */
  get openNow(): boolean {
    const last = this.spans.at(-1);
    return last !== undefined && last.to === undefined;
  }
}
