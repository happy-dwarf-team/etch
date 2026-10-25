/**
 * The game host's diagnostics (spec sections 4 and 10, etch#52): what the game itself says about
 * a preview job, in its `error.log` and in its console's answers, put on the original file's
 * lines, and the warnings about the game's own copy of the window and the FPS counter.
 *
 * The game reports problems of the preview copies (`interface/etch_goto.gui line: 12`, names with
 * the `etch_` or `etchw_` prefix). Each such line is mapped back through the copy's spans to the
 * line of the original it comes from, the copies' names and paths are written back as the
 * original's, and what the two copies both report is reported once.
 */
import type { InterfaceIndex } from '../model/interface-index.ts';
import type { Screen, Widget } from '../model/gui.ts';
import { diagnostic, type ModelDiagnostic } from '../model/diagnostics.ts';
import { keyOf } from '../model/properties.ts';
import type { PropertyNode, SourceRange } from '../script/tree.ts';
import type { CropRect } from './job.ts';
import {
  BACKDROP_WRAPPER_SUFFIX,
  PREVIEW_COPY_PREFIXES,
  originalOffset,
  type PreviewCopyFile,
} from './preview-copy.ts';

/** One console line a job ran and the game's answer (docs/plugin-protocol.md, "Preview job"). */
export interface GameConsoleLine {
  readonly line: string;
  readonly success: boolean;
  readonly text: string;
}

export interface GameHostDiagnosticsRequest {
  /** The original's game text, the one the copies were written from. */
  readonly text: string;
  /** The original's game-relative path, such as `interface/goto.gui`. */
  readonly path: string;
  /** The previewed window, in the model of `text`. */
  readonly window: Widget;
  /** The original's top-level names, which the copies write with their prefix. */
  readonly names: readonly string[];
  /** The two copies the job reloaded. */
  readonly copies: readonly PreviewCopyFile[];
  /** The lines the game wrote to `error.log` while the job ran. */
  readonly errorLog: readonly string[];
  /** The console lines the job ran. */
  readonly commands: readonly GameConsoleLine[];
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
 * The game's report of one preview job, on the original's text: each `error.log` line the job
 * caused and each console line the game refused, without what both copies report twice and
 * without a missing sprite the extension's model already reports at the same place.
 */
export function gameHostDiagnostics(request: GameHostDiagnosticsRequest): ModelDiagnostic[] {
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
    const mapped = copyLineRange(request, line);
    let message = originalMessage(logMessage(line), request);
    // The line number the game gives is the copy's; the message gives the original's.
    if (mapped !== undefined) {
      message = message.replace(LINE_NUMBER, (found, n: string) =>
        found.replace(n, String(mapped.line)),
      );
    }
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
    add(diagnostic(severity, 'game-error-log', mapped?.range ?? windowRange, text));
  }

  // `textures` names a saved texture in every spelling the `.gfx` files write; the game holds only
  // the ones the previewed window draws, so a spelling it does not hold answers "Reload failed"
  // although another one reloaded the file (etch#117).
  const reloaded = new Set(
    request.commands
      .filter((c) => c.success && !/\bfail/i.test(c.text))
      .map(reloadedTexture)
      .filter((key) => key !== undefined),
  );
  for (const command of request.commands) {
    const texture = reloadedTexture(command);
    if (texture !== undefined && reloaded.has(texture)) continue;
    const problem = consoleProblem(command, request);
    if (problem !== undefined) {
      add(diagnostic(problem.severity, 'game-console-answer', windowRange, problem.message));
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * One key for the spellings of a texture file: `gfx//interface//x.tga` and `gfx/interface/x.dds`
 * name the same file, since the game falls back from `.tga` to `.dds` (etch#6).
 */
function textureFileKey(name: string): string {
  return name
    .replace(/[\\/]+/g, '/')
    .replace(/\.(?:dds|tga)$/i, '')
    .toLowerCase();
}

const RELOAD_TEXTURE = 'reloadtexture ';

/** The texture file a `reloadtexture` line names, or `undefined` for another line. */
function reloadedTexture(command: GameConsoleLine): string | undefined {
  return command.line.startsWith(RELOAD_TEXTURE)
    ? textureFileKey(command.line.slice(RELOAD_TEXTURE.length))
    : undefined;
}

/** What a console answer says went wrong, or `undefined` when the game did what was asked. */
function consoleProblem(
  command: GameConsoleLine,
  request: GameHostDiagnosticsRequest,
): { severity: 'error' | 'warning'; message: string } | undefined {
  const [verb = '', ...rest] = command.line.split(' ');
  const argument = rest.join(' ');
  const answer = originalMessage(command.text, request) || 'nothing';
  const refused = !command.success || /\bfail/i.test(command.text);
  switch (verb.toLowerCase()) {
    case 'reload':
      return refused || !/reloaded/i.test(command.text)
        ? {
            severity: 'error',
            message: `The game did not reload the preview copy of ${request.path}; it answered "${answer}".`,
          }
        : undefined;
    case 'reloadtexture':
      return refused
        ? {
            severity: 'warning',
            message:
              `The game did not reload the texture ${argument}; it answered "${answer}", so the ` +
              'game host draws the texture as it was when the game host started.',
          }
        : undefined;
    case 'reloadloc':
      return refused || !/reloaded/i.test(command.text)
        ? {
            severity: 'warning',
            message: `The game did not reload the localisation; it answered "${answer}".`,
          }
        : undefined;
    case 'window':
      // A `window close` of a wrapper that is not open is expected; a refused open is not.
      return rest[0]?.toLowerCase() === 'open' && !command.success
        ? {
            severity: 'error',
            message: `The game did not open the preview copy of ${originalMessage(rest.slice(1).join(' '), request)}; it answered "${answer}".`,
          }
        : undefined;
    default:
      return refused
        ? { severity: 'warning', message: `The game answered "${answer}" to ${command.line}.` }
        : undefined;
  }
}

/**
 * The original's line that a log line names in one of the copies (`file: interface/etch_goto.gui
 * line: 12`), without its indentation, and its 1-based number; `undefined` when it names no copy
 * or no line, or the line is one the copy writer added.
 */
function copyLineRange(
  request: GameHostDiagnosticsRequest,
  line: string,
): { range: SourceRange; line: number } | undefined {
  const lower = line.toLowerCase();
  const copy = request.copies.find((c) => lower.includes(c.fileName.toLowerCase()));
  const number = Number(LINE_NUMBER.exec(line)?.[1]);
  if (copy === undefined || !(number >= 1)) return undefined;
  const start = lineStart(copy.text, number);
  if (start === undefined) return undefined;
  const span = spanAt(copy, start);
  if (span?.inserted !== false) return undefined;
  const offset = originalOffset(copy, start);
  return { range: lineRange(request.text, offset), line: lineNumber(request.text, offset) };
}

/** The 1-based line an offset is on. */
function lineNumber(text: string, offset: number): number {
  let line = 1;
  for (let at = text.indexOf('\n'); at >= 0 && at < offset; at = text.indexOf('\n', at + 1)) {
    line++;
  }
  return line;
}

function spanAt(
  copy: PreviewCopyFile,
  offset: number,
): PreviewCopyFile['spans'][number] | undefined {
  let found: PreviewCopyFile['spans'][number] | undefined;
  for (const span of copy.spans) {
    if (span.copy > offset) break;
    found = span;
  }
  return found;
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

/** A message of the game with the copies' paths and names written as the original's. */
function originalMessage(message: string, request: GameHostDiagnosticsRequest): string {
  let text = message;
  for (const copy of request.copies) {
    for (const name of [copy.path, copy.path.replace(/\//g, '\\'), copy.fileName]) {
      text = replaceAll(text, name, request.path);
    }
  }
  const window = request.window.name ?? '';
  // Only the names the copy writer prefixed: a nested name may start with etch_ of its own.
  for (const prefix of Object.values(PREVIEW_COPY_PREFIXES)) {
    text = replaceAll(
      text,
      prefix + window + BACKDROP_WRAPPER_SUFFIX,
      `${window}'s backdrop`,
      true,
    );
    for (const name of request.names) text = replaceAll(text, prefix + name, name, true);
  }
  return text;
}

/** Replaces every occurrence, ignoring case; with `word`, only where no name character adjoins. */
function replaceAll(text: string, find: string, by: string, word = false): string {
  if (find === '') return text;
  const lower = text.toLowerCase();
  const key = find.toLowerCase();
  const nameChar = (c: string | undefined): boolean => c !== undefined && /\w/.test(c);
  let out = '';
  let at = 0;
  for (let i = lower.indexOf(key); i >= 0; i = lower.indexOf(key, i + 1)) {
    if (i < at) continue;
    if (word && (nameChar(text[i - 1]) || nameChar(text[i + find.length]))) continue;
    out += text.slice(at, i) + by;
    at = i + find.length;
  }
  return out + text.slice(at);
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
 * later mod's file at the same path is what the game reads (H6), or an earlier file in load order
 * defines the name, and the game keeps the first definition. The game host shows the edited text
 * either way, through the preview copy.
 */
export function originalWindowDiagnostics(request: OriginalWindowRequest): ModelDiagnostic[] {
  const { window } = request;
  const name = window.name;
  if (name === undefined) return [];
  const range = window.nameNode ?? window.node.key;
  const shown = 'The game host shows this text through its preview copy.';
  if (!request.wins) {
    return [
      diagnostic(
        'warning',
        'game-original-differs',
        range,
        `A later mod of the playset has its own ${request.path}, which the game reads instead of ` +
          `this file, so the game's own ${name} is likely not this text (H6 of etch#16). ${shown}`,
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
          `the first definition of a top-level name, so the game's own ${name} is that one. ${shown}`,
      ),
    ];
  }
  return [];
}

/**
 * The part of the game host's screen where the game draws a green FPS counter over every window
 * (etch#22, at 3440×1440: x ≥ 3380, y < 20), measured from its top-right corner. Its source and
 * its size at other resolutions are unknown.
 */
export const FPS_COUNTER_CORNER = { width: 60, height: 20 } as const;

/** Whether a crop reaches the corner of the screen with the FPS counter. */
export function cropReachesFpsCounter(crop: CropRect, screen: Screen): boolean {
  return (
    crop.x + crop.width > screen.width - FPS_COUNTER_CORNER.width &&
    crop.y < FPS_COUNTER_CORNER.height
  );
}

/** The warning for a crop that reaches the FPS counter's corner, on the window's name. */
export function fpsCounterDiagnostics(
  window: Widget,
  crop: CropRect,
  screen: Screen,
): ModelDiagnostic[] {
  if (!cropReachesFpsCounter(crop, screen)) return [];
  return [
    diagnostic(
      'warning',
      'fps-counter-corner',
      window.nameNode ?? window.node.key,
      "This window reaches the top-right corner of the game host's screen, where the game draws " +
        "a green FPS counter over every window (etch#22); those pixels of the game host's image " +
        'are not the window’s.',
    ),
  ];
}
