/**
 * Check File in the Live Game (ADR 0007, part 2): a script file's trigger and effect blocks,
 * wrapped so that nothing in them runs, for the plugin's `run` job; and the `error.log` lines of
 * that run, mapped back to the file's lines. The gate run of 21.11.2026 (docs/live-game.md, "The
 * script check: the gate run") showed that the game reads a false `if`'s effects and a `limit`'s
 * triggers after `always = no` when it reads the run file, logs their unknown keys with the run
 * file's line, and runs none of them.
 */
import { parseScript } from '../script/parse.ts';
import type { BlockNode, EntryNode, PropertyNode } from '../script/tree.ts';
import { findKey, readStartLine, splitParsingErrors, startLineMessage } from './start-report.ts';

/** The folders whose files a check reads, each with its own layout of blocks. */
export type CheckFolder =
  'events' | 'decisions' | 'missions' | 'scripted_effects' | 'scripted_triggers';

/** The folder of a game-relative or absolute path whose blocks a check knows; `undefined` for others. */
export function checkFolderOf(path: string): CheckFolder | undefined {
  const parts = path.replace(/\\/g, '/').toLowerCase().split('/');
  if (!(parts.at(-1) ?? '').endsWith('.txt')) return undefined;
  const parent = parts.at(-2);
  const grand = parts.at(-3);
  if (parent === 'events' || parent === 'decisions' || parent === 'missions') return parent;
  if (grand === 'common' && (parent === 'scripted_effects' || parent === 'scripted_triggers')) {
    return parent;
  }
  return undefined;
}

/** What a block holds: triggers (checked after `always = no`) or effects (in a false `if`). */
export type BlockKind = 'trigger' | 'effect';

/** One wrapped block of the file. */
export interface CheckBlock {
  readonly kind: BlockKind;
  /** The block's key as written (`trigger`, `option`, a scripted effect's name). */
  readonly key: string;
  /** The 1-based file line of the key. */
  readonly line: number;
}

/** A run file's text, with the file line each of its lines came from. */
export interface CheckChunk {
  readonly text: string;
  /** For each 1-based line of `text` (index 0 is line 1), its 1-based file line; 0 for a wrapper's. */
  readonly lines: readonly number[];
  readonly blocks: readonly CheckBlock[];
}

/** Why a file cannot be checked as it is. */
export interface CheckRefusal {
  readonly code: 'folder' | 'syntax' | 'empty';
  readonly message: string;
  /** The 1-based file line of a syntax error. */
  readonly line?: number;
}

/** A file's run files, at most `maxChars` characters each, or why there are none. */
export type CheckPlan =
  | { readonly kind: 'chunks'; readonly chunks: readonly CheckChunk[] }
  | ({ readonly kind: 'refused' } & CheckRefusal);

/** The keys of an event's or a decision's `option`-like block that are not effects. */
const OPTION_NOT_EFFECTS = new Set(['name', 'ai_chance', 'highlight', 'goto', 'trigger']);

/** Per folder: the keys of a block in an entity that hold triggers, and those that hold effects. */
const LAYOUT: Record<
  'events' | 'decisions' | 'missions',
  { readonly triggers: ReadonlySet<string>; readonly effects: ReadonlySet<string> }
> = {
  events: {
    triggers: new Set(['trigger']),
    effects: new Set(['immediate', 'after', 'option']),
  },
  decisions: {
    triggers: new Set(['potential', 'allow', 'provinces_to_highlight']),
    effects: new Set(['effect']),
  },
  missions: {
    triggers: new Set(['potential', 'trigger', 'provinces_to_highlight']),
    effects: new Set(['effect']),
  },
};

const EVENT_KINDS = new Set(['country_event', 'province_event']);

interface Unit {
  readonly lines: readonly string[];
  readonly map: readonly number[];
  readonly block: CheckBlock;
}

function isBlockProperty(entry: EntryNode): entry is PropertyNode & { value: BlockNode } {
  return entry.kind === 'property' && entry.value?.kind === 'block';
}

/**
 * The run files that check a script file: each trigger block as `if = { limit = { always = no …
 * } }`, each effect block as `if = { limit = { always = no } … }`, the block's own lines in
 * between, so that a `near line: N` maps back through `CheckChunk.lines`. An `option`'s `name`,
 * `ai_chance`, `highlight` and `goto` are left out and its `trigger` gets a wrapper of its own. A
 * scripted effect or trigger with `$PARAMETERS$` is left out: it only means something once called.
 * A file with a block that does not close, or a `}` too many, is refused: the game would read the
 * run file's wrappers wrong.
 */
export function planCheck(text: string, folder: CheckFolder, maxChars: number): CheckPlan {
  const parsed = parseScript(text, { script: true });
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (offset: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
  const broken = parsed.diagnostics.find(
    (d) => d.code === 'unclosed-block' || d.code === 'unmatched-close',
  );
  if (broken !== undefined) {
    return {
      kind: 'refused',
      code: 'syntax',
      message: broken.message,
      line: lineOf(broken.start),
    };
  }

  const units: Unit[] = [];
  /** The text of entries, each on its own lines, mapped to the file's lines. */
  const body = (entries: readonly EntryNode[]): { lines: string[]; map: number[] } => {
    const lines: string[] = [];
    const map: number[] = [];
    for (const entry of entries) {
      const first = lineOf(entry.start);
      const pieces = text.slice(entry.start, entry.end).replace(/\r/g, '').split('\n');
      pieces.forEach((piece, i) => {
        lines.push(piece);
        map.push(first + i);
      });
    }
    return { lines, map };
  };
  const wrap = (kind: BlockKind, key: PropertyNode, entries: readonly EntryNode[]): void => {
    if (entries.length === 0) return;
    const inner = body(entries);
    const block: CheckBlock = { kind, key: key.key.text, line: lineOf(key.start) };
    if (kind === 'trigger') {
      units.push({
        lines: ['if = { limit = { always = no', ...inner.lines, '} }'],
        map: [0, ...inner.map, 0],
        block,
      });
    } else {
      units.push({
        lines: ['if = { limit = { always = no }', ...inner.lines, '}'],
        map: [0, ...inner.map, 0],
        block,
      });
    }
  };
  const option = (property: PropertyNode & { value: BlockNode }): void => {
    const effects = property.value.entries.filter(
      (entry) =>
        !(entry.kind === 'property' && OPTION_NOT_EFFECTS.has(entry.key.text.toLowerCase())),
    );
    for (const entry of property.value.entries) {
      if (isBlockProperty(entry) && entry.key.text.toLowerCase() === 'trigger') {
        wrap('trigger', entry, entry.value.entries);
      }
    }
    wrap('effect', property, effects);
  };

  if (folder === 'scripted_effects' || folder === 'scripted_triggers') {
    for (const entry of parsed.entries) {
      if (!isBlockProperty(entry)) continue;
      if (text.slice(entry.value.start, entry.value.end).includes('$')) continue;
      wrap(folder === 'scripted_triggers' ? 'trigger' : 'effect', entry, entry.value.entries);
    }
  } else {
    const layout = LAYOUT[folder];
    const entity = (block: BlockNode): void => {
      for (const entry of block.entries) {
        if (!isBlockProperty(entry)) continue;
        const key = entry.key.text.toLowerCase();
        if (layout.triggers.has(key)) wrap('trigger', entry, entry.value.entries);
        else if (key === 'option') option(entry);
        else if (layout.effects.has(key)) wrap('effect', entry, entry.value.entries);
      }
    };
    for (const entry of parsed.entries) {
      if (!isBlockProperty(entry)) continue;
      const key = entry.key.text.toLowerCase();
      if (folder === 'events') {
        if (EVENT_KINDS.has(key)) entity(entry.value);
      } else if (folder === 'decisions') {
        // `country_decisions = { name = { potential … } … }`
        for (const decision of entry.value.entries) {
          if (isBlockProperty(decision)) entity(decision.value);
        }
      } else {
        // A mission series holds its own `potential` and its missions.
        for (const inner of entry.value.entries) {
          if (!isBlockProperty(inner)) continue;
          const innerKey = inner.key.text.toLowerCase();
          if (layout.triggers.has(innerKey)) wrap('trigger', inner, inner.value.entries);
          else if (!layout.effects.has(innerKey)) entity(inner.value);
        }
      }
    }
  }
  if (units.length === 0) {
    return { kind: 'refused', code: 'empty', message: 'the file has no trigger or effect blocks' };
  }

  const chunks: CheckChunk[] = [];
  let lines: string[] = [];
  let map: number[] = [];
  let blocks: CheckBlock[] = [];
  let size = 0;
  const flush = (): void => {
    if (lines.length === 0) return;
    chunks.push({ text: `${lines.join('\n')}\n`, lines: map, blocks });
    lines = [];
    map = [];
    blocks = [];
    size = 0;
  };
  for (const unit of units) {
    const unitSize = unit.lines.reduce((sum, line) => sum + line.length + 1, 0);
    if (size > 0 && size + unitSize > maxChars) flush();
    lines.push(...unit.lines);
    map.push(...unit.map);
    blocks.push(unit.block);
    size += unitSize;
  }
  flush();
  return { kind: 'chunks', chunks };
}

/** An `error.log` line of a check, placed on the file. */
export interface CheckError {
  /** The line's message, without the time and the source file of the game. */
  readonly message: string;
  readonly count: number;
  /** The 1-based file line; `undefined` when the line names neither a line nor a key of the file. */
  readonly line: number | undefined;
  /** Where on `line` the key the game names is, when it names one found there. */
  readonly column?: { readonly start: number; readonly end: number };
}

const NEAR_LINE = /\bnear line:?\s*(\d+)/i;
const MODIFIER_TYPE = /\bUnknown modifier-type '([^']+)'/;
const RUN_FILE_NAME = /\bFile:\s*"[^"]*"/;

/**
 * The new `error.log` lines of a chunk's run, placed on the file: by the `near line: N` the game
 * names, through the chunk's line map; else by the first place the file writes the key the line
 * names (`Key: …`, `Unknown modifier-type '…'`, `… in a trigger …`). A line that names neither
 * is kept with `line` undefined: the game may write it about something else while the run runs.
 * The game's multi-line parsing errors are split first; repeats are counted.
 */
export function mapCheckErrors(
  lines: readonly string[],
  chunk: CheckChunk,
  text: string,
): CheckError[] {
  const counts = new Map<string, number>();
  for (const split of splitParsingErrors(lines)) {
    counts.set(split, (counts.get(split) ?? 0) + 1);
  }
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const placeKey = (key: string): Pick<CheckError, 'line' | 'column'> => {
    const found = findKey(text, key);
    if (found === undefined) return { line: undefined };
    let line = 0;
    while (line + 1 < lineStarts.length && (lineStarts[line + 1] ?? 0) <= found.start) line++;
    const start = found.start - (lineStarts[line] ?? 0);
    return { line: line + 1, column: { start, end: start + (found.end - found.start) } };
  };
  const result: CheckError[] = [];
  for (const [raw, count] of counts) {
    const message = startLineMessage(raw);
    // The run file the game names is not the checked file: only the key places such a line.
    const key =
      MODIFIER_TYPE.exec(message)?.[1] ?? readStartLine(message.replace(RUN_FILE_NAME, '')).key;
    const near = NEAR_LINE.exec(message);
    const mapped = near === null ? undefined : chunk.lines[Number(near[1]) - 1];
    if (mapped !== undefined && mapped > 0) {
      const lineText = text.slice(lineStarts[mapped - 1] ?? 0, lineStarts[mapped] ?? text.length);
      const at = key === undefined ? undefined : findKey(lineText, key);
      result.push(
        at === undefined
          ? { message, count, line: mapped }
          : { message, count, line: mapped, column: at },
      );
    } else if (key !== undefined) {
      result.push({ message, count, ...placeKey(key) });
    } else {
      result.push({ message, count, line: undefined });
    }
  }
  return result;
}
