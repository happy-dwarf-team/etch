// RESEARCH (etch#753, branch research/etch-check-baseline, never merged): the floor of a headless
// `etch check`. Parser only, no rules: it reads the script files of a game or mod folder
// (`common/`, `events/`, `decisions/`, `missions/`), decodes them as the game does, parses them
// with core's script parser and writes the parser's syntax problems in the shape `etch check
// --json` could take. It also times reading and parsing, so that a language server's first pass
// has a measured floor.
//
// Usage: node research/check/check.mts [--json out.json] [--repeat N] <folder>...
// A folder is a game or mod folder (the one with `common/`). Output: one summary line per folder,
// per file class, on stdout; with --json, every file and problem.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { decodeGameText } from '../../packages/core/src/game-text.ts';
import { parseScript } from '../../packages/core/src/script/parse.ts';

const CLASSES = ['common', 'events', 'decisions', 'missions'] as const;

interface Problem {
  readonly code: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

interface FileResult {
  readonly path: string;
  readonly class: string;
  /** `common/<folder>` for files under `common/`, else the class. */
  readonly folder: string;
  readonly bytes: number;
  readonly parseMs: number;
  readonly problems: readonly Problem[];
}

interface ClassSummary {
  files: number;
  bytes: number;
  filesWithProblems: number;
  problems: number;
  byCode: Record<string, number>;
}

function* walk(dir: string): Generator<string> {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (name.toLowerCase().endsWith('.txt')) yield full;
  }
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function position(starts: readonly number[], offset: number): [number, number] {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return [lo + 1, offset - starts[lo]! + 1];
}

interface Run {
  readonly files: FileResult[];
  readonly listMs: number;
  readonly readMs: number;
  readonly decodeMs: number;
  readonly parseMs: number;
  readonly totalMs: number;
}

function checkFolder(root: string): Run {
  const t0 = performance.now();
  const paths: [string, string][] = [];
  for (const cls of CLASSES) for (const file of walk(path.join(root, cls))) paths.push([cls, file]);
  const t1 = performance.now();
  let readMs = 0;
  let decodeMs = 0;
  let parseMs = 0;
  const files: FileResult[] = [];
  for (const [cls, file] of paths) {
    const a = performance.now();
    const bytes = readFileSync(file);
    const b = performance.now();
    const { text } = decodeGameText(bytes, 'script');
    const c = performance.now();
    const parsed = parseScript(text, { script: true });
    const d = performance.now();
    readMs += b - a;
    decodeMs += c - b;
    parseMs += d - c;
    const rel = path.relative(root, file).split(path.sep).join('/');
    const parts = rel.split('/');
    const folder = cls === 'common' && parts.length > 2 ? `common/${parts[1]}` : cls;
    let starts: number[] | undefined;
    const problems = parsed.diagnostics.map((p) => {
      starts ??= lineStarts(text);
      const [line, column] = position(starts, p.start);
      return { code: p.code, line, column, message: p.message };
    });
    files.push({ path: rel, class: cls, folder, bytes: bytes.length, parseMs: d - c, problems });
  }
  return {
    files,
    listMs: t1 - t0,
    readMs,
    decodeMs,
    parseMs,
    totalMs: performance.now() - t0,
  };
}

function summarise(files: readonly FileResult[], key: (f: FileResult) => string) {
  const out: Record<string, ClassSummary> = {};
  for (const f of files) {
    const s = (out[key(f)] ??= {
      files: 0,
      bytes: 0,
      filesWithProblems: 0,
      problems: 0,
      byCode: {},
    });
    s.files++;
    s.bytes += f.bytes;
    if (f.problems.length > 0) s.filesWithProblems++;
    s.problems += f.problems.length;
    for (const p of f.problems) s.byCode[p.code] = (s.byCode[p.code] ?? 0) + 1;
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const args = process.argv.slice(2);
let jsonOut: string | undefined;
let repeat = 1;
const roots: string[] = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === '--json') jsonOut = args[++i];
  else if (arg === '--repeat') repeat = Number(args[++i]);
  else roots.push(arg);
}

const report: unknown[] = [];
for (const root of roots) {
  const runs: Run[] = [];
  for (let r = 0; r < repeat; r++) runs.push(checkFolder(root));
  const first = runs[0]!;
  const slowest = [...first.files].sort((a, b) => b.parseMs - a.parseMs)[0];
  const largest = [...first.files].sort((a, b) => b.bytes - a.bytes)[0];
  const byClass = summarise(first.files, (f) => f.class);
  const timing = {
    runs: runs.length,
    firstTotalMs: first.totalMs,
    medianTotalMs: median(runs.map((r) => r.totalMs)),
    medianListMs: median(runs.map((r) => r.listMs)),
    medianReadMs: median(runs.map((r) => r.readMs)),
    medianDecodeMs: median(runs.map((r) => r.decodeMs)),
    medianParseMs: median(runs.map((r) => r.parseMs)),
    slowestFile: slowest && { path: slowest.path, bytes: slowest.bytes, parseMs: slowest.parseMs },
    largestFile: largest && { path: largest.path, bytes: largest.bytes, parseMs: largest.parseMs },
  };
  console.log(
    JSON.stringify({ root: path.basename(root), files: first.files.length, byClass, timing }),
  );
  report.push({
    root,
    summary: { byClass, byFolder: summarise(first.files, (f) => f.folder) },
    timing,
    files: first.files.filter((f) => f.problems.length > 0),
  });
}
if (jsonOut !== undefined) writeFileSync(jsonOut, JSON.stringify({ version: 0, report }, null, 1));
