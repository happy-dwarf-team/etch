/**
 * The live game's diagnostics (spec section 12, ADR 0005): what the game writes to its `error.log`
 * about a file, put on that file's lines, and the warning that the game's own window of a name may
 * not be the edited text.
 *
 * The live game reloads the real file, so a line of `error.log` that names it
 * (`file: interface/goto.gui line: 12`) is put on that line as it is.
 */
import type { InterfaceIndex } from '../model/interface-index.ts';
import type { Widget } from '../model/gui.ts';
import { diagnostic, type ModelDiagnostic } from '../model/diagnostics.ts';
import { keyOf } from '../model/properties.ts';
import type { PropertyNode, SourceRange } from '../script/tree.ts';

export interface ErrorLogRequest {
  /** The file's game text, as the game read it. */
  readonly text: string;
  /** The file's game-relative path, such as `interface/goto.gui`. */
  readonly path: string;
  /** The window the lines are put on when they name no line of the file, in the model of `text`. */
  readonly window: Widget;
  /** The lines the game wrote to `error.log`. */
  readonly errorLog: readonly string[];
  /** What the extension's model already reports for `text`; the game's own report of it is left out. */
  readonly offline: readonly ModelDiagnostic[];
}

/** The message of a log line: what follows `[file.cpp:123]: `, after an optional `[hh:mm:ss]`. */
function logMessage(line: string): string {
  let rest = line;
  if (/^\[\d{1,2}:\d{2}:\d{2}\]/.test(rest)) rest = rest.slice(rest.indexOf(']') + 1);
  const end = rest.startsWith('[') ? rest.indexOf(']:') : -1;
  return end < 0 ? line : rest.slice(end + 2).trim();
}

const MISSING_SPRITE = 'could not find sprite type [';

/** The sprite of `Could not find sprite type [GFX_x]`, or `undefined` for another message. */
function missingSprite(message: string): string | undefined {
  const start = message.toLowerCase().indexOf(MISSING_SPRITE);
  if (start < 0) return undefined;
  const from = start + MISSING_SPRITE.length;
  const end = message.indexOf(']', from);
  return end > from ? message.slice(from, end) : undefined;
}

const LINE_NUMBER = /\bline:?\s*(\d+)/i;
const PARSE_ERROR = /\bparsing error\b|\bunexpected token\b/i;

/**
 * The game's `error.log` lines on the file's text, each once: a line that names the file and a
 * line number on that line, a missing sprite on every widget of the window that uses it (unless
 * the extension's model already reports it there), anything else on the window's name.
 */
export function errorLogDiagnostics(request: ErrorLogRequest): ModelDiagnostic[] {
  const out: ModelDiagnostic[] = [];
  const seen = new Set<string>();
  const add = (d: ModelDiagnostic): void => {
    const key = `${String(d.start)}|${String(d.end)}|${d.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(d);
  };
  const windowRange = request.window.nameNode ?? request.window.node.key;
  const offlineSprites = new Set(
    request.offline.filter((d) => d.code === 'missing-sprite').map((d) => d.start),
  );

  for (const raw of request.errorLog) {
    const line = raw.trim();
    if (line === '') continue;
    const message = logMessage(line);
    const severity = PARSE_ERROR.test(message) ? 'error' : 'warning';
    const text = `error.log: ${message}`;
    const sprite = missingSprite(message);
    if (sprite !== undefined) {
      // The game names the sprite, not the widget: every widget of the window that uses it.
      const uses = valuesNamed(request.window, sprite);
      for (const use of uses.length > 0 ? uses : [windowRange]) {
        if (offlineSprites.has(use.start)) continue;
        add(diagnostic(severity, 'game-error-log', use, text));
      }
      continue;
    }
    add(diagnostic(severity, 'game-error-log', fileLineRange(request, line) ?? windowRange, text));
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * The file's line that a log line names (`file: interface/goto.gui line: 12`), without its
 * indentation; `undefined` when it names another file or no line.
 */
function fileLineRange(request: ErrorLogRequest, line: string): SourceRange | undefined {
  const lower = line.toLowerCase().replace(/\\/g, '/');
  if (!lower.includes(request.path.toLowerCase().replace(/\\/g, '/'))) return undefined;
  const number = Number(LINE_NUMBER.exec(line)?.[1]);
  if (!(number >= 1)) return undefined;
  const start = lineStart(request.text, number);
  return start === undefined ? undefined : lineRange(request.text, start);
}

/** The offset where a 1-based line starts, or `undefined` past the end. */
function lineStart(text: string, line: number): number | undefined {
  let at = 0;
  for (let n = 1; n < line; n++) {
    const next = text.indexOf('\n', at);
    if (next < 0) return undefined;
    at = next + 1;
  }
  return at;
}

/** The line around an offset, without its indentation and line end. */
function lineRange(text: string, offset: number): SourceRange {
  let start = text.lastIndexOf('\n', offset - 1) + 1;
  let end = text.indexOf('\n', offset);
  if (end < 0) end = text.length;
  while (start < end && /\s/.test(text[start] ?? '')) start++;
  while (end > start && /\s/.test(text[end - 1] ?? '')) end--;
  return end > start ? { start, end } : { start: offset, end: offset };
}

/** Every scalar value in the window's widgets that names `name`, ignoring case. */
function valuesNamed(window: Widget, name: string): SourceRange[] {
  const key = name.toLowerCase();
  const out: SourceRange[] = [];
  const visit = (widget: Widget): void => {
    const properties: PropertyNode[] = [
      ...widget.properties.filter((p) => keyOf(p) !== 'if_resolution'),
      ...widget.resolutionBlocks.flatMap((b) => b.entries),
    ];
    for (const property of properties) {
      const value = property.value;
      if (value?.kind === 'scalar' && value.text.toLowerCase() === key) out.push(value);
    }
    for (const child of widget.children) visit(child);
  };
  visit(window);
  return out;
}

export interface OriginalWindowRequest {
  /** The edited file's game-relative path. */
  readonly path: string;
  /** Whether the game reads this file at that path, rather than a later mod's (H6 of etch#16). */
  readonly wins: boolean;
  /** The previewed window, in the edited file's model. */
  readonly window: Widget;
  /** The playset's registry, for the definition of the window's name the game keeps. */
  readonly index: InterfaceIndex;
}

/**
 * A warning when the game's own window of that name may not be the edited text (etch#16): a
 * later mod's file at the same path is what the game reads (H6), so saving this file changes
 * nothing in the live game, or an earlier file in load order defines the name, and the game keeps
 * the first definition.
 */
export function originalWindowDiagnostics(request: OriginalWindowRequest): ModelDiagnostic[] {
  const { window } = request;
  const name = window.name;
  if (name === undefined) return [];
  const range = window.nameNode ?? window.node.key;
  if (!request.wins) {
    return [
      diagnostic(
        'warning',
        'game-original-differs',
        range,
        `A later mod of the playset has its own ${request.path}, which the game reads instead of ` +
          `this file, so the game's own ${name} is likely not this text (H6 of etch#16).`,
      ),
    ];
  }
  const first = request.index.guiType(name);
  if (first !== undefined && first.path.toLowerCase() !== request.path.toLowerCase()) {
    return [
      diagnostic(
        'warning',
        'game-original-differs',
        range,
        `${first.path} defines ${first.item.name ?? name} earlier in load order, and the game keeps ` +
          `the first definition of a top-level name, so the game's own ${name} is that one.`,
      ),
    ];
  }
  return [];
}
