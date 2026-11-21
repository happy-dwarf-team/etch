// The live game's start report (ADR 0007, part 1): the `error.log` lines the game wrote while it
// loaded, put on the edited mod's files. A line that names a file the edited mod wins goes on that
// file, on its line when it names one; a line that names only a key goes on the first place the
// mod writes the key; the rest (other mods, the game's own files, lines naming nothing) is only
// counted. Node only, no vscode: the caller turns the entries into Problems.
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { checkedTextKind, decodeGameText, findKey, readStartLine } from '@etch/core';
import type { GameFiles } from '@etch/core/playset';
import { collapseErrorLog } from './error-log.ts';

/** A problem of the start report, on a file of the edited mod. */
export interface StartProblem {
  /** The file's absolute path. */
  readonly file: string;
  /** The offsets in the file's game text the problem covers. */
  readonly start: number;
  readonly end: number;
  /** `error.log: <message>`, with `(×N)` for a repeated line. */
  readonly message: string;
  readonly error: boolean;
  /**
   * How the line was placed: on the file's line it names, on the window it names, on the file's
   * start, or on the first place the mod writes its key.
   */
  readonly placed: 'line' | 'window' | 'file' | 'key';
}

export interface StartReport {
  readonly problems: readonly StartProblem[];
  /** Lines after repeats were collapsed. */
  readonly lines: number;
  /** Lines about a file that another mod or the game wins, or outside the playset's files. */
  readonly elsewhere: number;
  /** Lines that name a key the edited mod does not write, or nothing at all. */
  readonly unplaced: number;
}

/** The folders of a mod that hold no text the start report looks keys up in. */
const SKIPPED_FOLDERS: ReadonlySet<string> = new Set(['.git', '.etch', 'gfx', 'music', 'sound']);
/** The most text files the key search reads in one report. */
const MAX_FILES = 20_000;

function inside(root: string, file: string): boolean {
  const rel = relative(root, file);
  return rel !== '' && !rel.startsWith('..') && !rel.includes(`..${sep}`) && !/^[a-z]:/i.test(rel);
}

/** The 1-based line's range in a text, without its indentation and line end. */
function lineRange(text: string, line: number): { start: number; end: number } | undefined {
  let at = 0;
  for (let n = 1; n < line; n++) {
    const next = text.indexOf('\n', at);
    if (next < 0) return undefined;
    at = next + 1;
  }
  let end = text.indexOf('\n', at);
  if (end < 0) end = text.length;
  let start = at;
  while (start < end && /\s/.test(text[start] ?? '')) start++;
  while (end > start && /\s/.test(text[end - 1] ?? '')) end--;
  return { start, end: Math.max(start, end) };
}

/** The game text of a mod file, decoded as the game reads its kind; `undefined` when unreadable. */
async function gameText(file: string, path: string): Promise<string | undefined> {
  const kind = checkedTextKind(path) ?? 'script';
  try {
    return decodeGameText(await readFile(file), kind).text;
  } catch {
    return undefined;
  }
}

/** The mod's text files the key search reads, by game-relative path, in path order. */
async function modTextFiles(root: string): Promise<{ path: string; file: string }[]> {
  const out: { path: string; file: string }[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return;
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (prefix === '' && SKIPPED_FOLDERS.has(entry.name.toLowerCase())) continue;
        await walk(join(dir, entry.name), path);
      } else if (/\.(?:txt|yml|gui|gfx)$/i.test(entry.name)) {
        out.push({ path, file: join(dir, entry.name) });
      }
    }
  };
  await walk(root, '');
  return out;
}

/**
 * Anvil's log throttle (anvil-log-throttle) writes a line's first 10 repeats, then notes instead of
 * the rest: `[x.cpp:1]: [anvil-log-throttle] logged 10 times; further repeats are counted …: <line>`
 * and `[x.cpp:1]: [anvil-log-throttle] repeated 6 more times in the last 198 s: <line>`. The notes
 * are dropped, and a `repeated N more` note adds N to its line's count.
 */
function untangleThrottle(lines: readonly string[]): {
  lines: string[];
  extra: Map<string, number>;
} {
  const out: string[] = [];
  const extra = new Map<string, number>();
  for (const line of lines) {
    const note = /^(.*?\]:\s*)\[anvil-log-throttle\]\s*(.*)$/.exec(line);
    if (note === null) {
      out.push(line);
      continue;
    }
    const prefix = (note[1] ?? '').replace(/^\[\d{1,2}:\d{2}:\d{2}\]\s*/, '');
    const repeated = /^repeated (\d+) more times? in the last [^:]*:\s*(.*)$/.exec(note[2] ?? '');
    if (repeated !== null) {
      const key = `${prefix}${repeated[2] ?? ''}`;
      extra.set(key, (extra.get(key) ?? 0) + Number(repeated[1]));
    }
  }
  return { lines: out, extra };
}

/** The window a line names (`… in window 'name'`), for a line that names a file but no line. */
function windowOf(message: string): string | undefined {
  return /\bin window '([^']+)'/i.exec(message)?.[1];
}

/**
 * The start report of the lines the game wrote to `error.log` before it took input, for the edited
 * mod at `editedRoot` in the playset `files`.
 */
export async function startReport(
  lines: readonly string[],
  files: GameFiles,
  editedRoot: string,
): Promise<StartReport> {
  const untangled = untangleThrottle(lines);
  const collapsed = collapseErrorLog(untangled.lines);
  const problems: StartProblem[] = [];
  const texts = new Map<string, Promise<string | undefined>>();
  const textOf = (file: string, path: string): Promise<string | undefined> => {
    let text = texts.get(file);
    if (text === undefined) {
      text = gameText(file, path);
      texts.set(file, text);
    }
    return text;
  };
  const byKey = new Map<string, { message: string; error: boolean }[]>();
  let elsewhere = 0;
  let unplaced = 0;
  for (const { line, count: logged } of collapsed) {
    const count =
      logged + (untangled.extra.get(line.replace(/^\[\d{1,2}:\d{2}:\d{2}\]\s*/, '')) ?? 0);
    const read = readStartLine(line);
    const message = `error.log: ${read.message}${count > 1 ? ` (×${String(count)})` : ''}`;
    if (read.path !== undefined) {
      const found = await files.find(read.path).catch(() => undefined);
      if (found === undefined || !inside(editedRoot, found.absolutePath)) {
        elsewhere++;
        continue;
      }
      const text = await textOf(found.absolutePath, found.path);
      let range: { start: number; end: number } | undefined;
      let placed: StartProblem['placed'] = 'file';
      if (text !== undefined && read.line !== undefined) {
        range = lineRange(text, read.line);
        if (range !== undefined) placed = 'line';
      } else if (text !== undefined) {
        const window = windowOf(read.message);
        range = window === undefined ? undefined : findKey(text, window);
        if (range !== undefined) placed = 'window';
      }
      problems.push({
        file: found.absolutePath,
        start: range?.start ?? 0,
        end: range?.end ?? 0,
        message,
        error: read.parseError,
        placed,
      });
    } else if (read.key !== undefined) {
      const list = byKey.get(read.key) ?? [];
      list.push({ message, error: read.parseError });
      byKey.set(read.key, list);
    } else {
      unplaced++;
    }
  }
  if (byKey.size > 0) {
    const left = new Set(byKey.keys());
    for (const { path, file } of await modTextFiles(editedRoot)) {
      if (left.size === 0) break;
      // The raw bytes first: a big mod's text is about a gigabyte, and keys are ASCII. Only a
      // file that holds a key's bytes is decoded, and nothing is kept.
      let bytes: Buffer;
      try {
        bytes = await readFile(file);
      } catch {
        continue;
      }
      const holds = [...left].filter((key) => bytes.includes(key));
      if (holds.length === 0) continue;
      const kind = checkedTextKind(path) ?? 'script';
      const text = decodeGameText(bytes, kind).text;
      for (const key of holds) {
        const at = findKey(text, key);
        if (at === undefined) continue;
        left.delete(key);
        for (const { message, error } of byKey.get(key) ?? []) {
          problems.push({ file, ...at, message, error, placed: 'key' });
        }
      }
    }
    for (const key of left) unplaced += byKey.get(key)?.length ?? 0;
  }
  return { problems, lines: collapsed.length, elsewhere, unplaced };
}
