// The latest script profile (eu4-engine-lab#166): the CSV that Anvil's `anvil-script-profiler`
// writes to the game's `logs/` folder after each profiling span, read and shown as two lists,
// triggers and effects. The format is Anvil's (docs/script-profiler.md there, `format=1`): a `#` line
// of `key=value` pairs, a `#` note, a header and one row per owner and role. Columns are found by
// the header's names, so a later Anvil may add columns. Node only, no vscode.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** One owner and role of a list: what the profiler measured for it. */
export interface ScriptProfileRow {
  /** `event`, `event_option`, `decision`, `on_action`, `casus_belli`, …, or `none`. */
  readonly owner: string;
  /** The owner's key; empty for `none`. */
  readonly name: string;
  /** An event option's number; empty otherwise. */
  readonly option: string;
  /** `trigger`, `effect`, `mean_time_to_happen`, `potential`, … */
  readonly role: string;
  readonly calls: number;
  readonly totalMs: number;
  readonly meanUs: number;
  readonly maxUs: number;
  /** For a row without an owner: where in `eu4.exe` the block was run from. */
  readonly callerRva: string;
  /** For the one row without an owner: how many rows of the CSV, one per caller, it sums. */
  readonly callers?: number;
}

export interface ScriptProfileList {
  readonly rows: readonly ScriptProfileRow[];
  readonly totalMs: number;
  readonly calls: number;
}

export interface ScriptProfile {
  /** The `key=value` pairs of the first line: `format`, `version`, `build`, `status`, `days`, … */
  readonly meta: Readonly<Record<string, string>>;
  /** The span was ended by a load, the menu or quitting the game (`status=interrupted_*`). */
  readonly interrupted: boolean;
  readonly triggers: ScriptProfileList;
  readonly effects: ScriptProfileList;
  /** What could not be read: a newer format, a missing column, a row that is not a number. */
  readonly problems: readonly string[];
}

/** The format this reader was written for; a newer one is read as far as its columns allow. */
export const SCRIPT_PROFILE_FORMAT = 1;
/** The columns a row needs: without them a file is not a script profile. */
const REQUIRED = ['list', 'calls', 'total_ms'] as const;

/** Splits one CSV line: commas, and fields in double quotes with `""` for a quote. */
function csvFields(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      fields.push(field);
      field = '';
    } else field += c;
  }
  fields.push(field);
  return fields;
}

/** The `key=value` pairs of a `#` line, split at spaces. */
function metaPairs(line: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const token of line.replace(/^#\s*/, '').split(/\s+/)) {
    const at = token.indexOf('=');
    if (at > 0) meta[token.slice(0, at)] = token.slice(at + 1);
  }
  return meta;
}

/**
 * The rows without an owner as one row, as the profiler's window shows them: the CSV splits them by
 * the caller's address, which tells the lab where in `eu4.exe` they run, not the modder.
 */
function withOneUnowned(rows: readonly ScriptProfileRow[]): ScriptProfileRow[] {
  const unowned = rows.filter((r) => r.owner === 'none');
  if (unowned.length === 0) return [...rows];
  const calls = unowned.reduce((n, r) => n + r.calls, 0);
  const totalMs = unowned.reduce((n, r) => n + r.totalMs, 0);
  const merged: ScriptProfileRow = {
    owner: 'none',
    name: '',
    option: '',
    role: unowned[0]?.role ?? '',
    calls,
    totalMs,
    meanUs: calls === 0 ? 0 : (totalMs * 1000) / calls,
    maxUs: Math.max(...unowned.map((r) => r.maxUs)),
    callerRva: unowned.length === 1 ? (unowned[0]?.callerRva ?? '') : '',
    callers: unowned.length,
  };
  return [...rows.filter((r) => r.owner !== 'none'), merged];
}

function emptyList(): { rows: ScriptProfileRow[]; totalMs: number; calls: number } {
  return { rows: [], totalMs: 0, calls: 0 };
}

/** Reads a script profile's text. Throws when it has no header with the columns a row needs. */
export function parseScriptProfile(text: string): ScriptProfile {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const problems: string[] = [];
  let meta: Record<string, string> = {};
  let header: string[] | undefined;
  const triggers = emptyList();
  const effects = emptyList();
  let other = 0;
  let unreadable = 0;
  for (const line of lines) {
    if (line.trim() === '') continue;
    if (line.startsWith('#')) {
      // The first `#` line holds the pairs; the next one is a note on the columns.
      if (Object.keys(meta).length === 0) meta = metaPairs(line);
      continue;
    }
    const fields = csvFields(line);
    if (header === undefined) {
      header = fields.map((f) => f.trim().toLowerCase());
      const missing = REQUIRED.filter((name) => !header?.includes(name));
      if (missing.length > 0) {
        throw new Error(`Not a script profile: no column ${missing.join(', ')} in its header.`);
      }
      continue;
    }
    const columns = header;
    const at = (name: string): string => {
      const index = columns.indexOf(name);
      return index < 0 ? '' : (fields[index] ?? '').trim();
    };
    const number = (name: string): number => {
      const value = at(name);
      return value === '' ? 0 : Number(value);
    };
    const row: ScriptProfileRow = {
      owner: at('owner') || 'none',
      name: at('name'),
      option: at('option'),
      role: at('role'),
      calls: number('calls'),
      totalMs: number('total_ms'),
      meanUs: number('mean_us'),
      maxUs: number('max_us'),
      callerRva: at('caller_rva'),
    };
    if (![row.calls, row.totalMs, row.meanUs, row.maxUs].every(Number.isFinite)) {
      unreadable++;
      continue;
    }
    const list = at('list').toLowerCase();
    const into = list === 'trigger' ? triggers : list === 'effect' ? effects : undefined;
    if (into === undefined) {
      other++;
      continue;
    }
    into.rows.push(row);
    into.totalMs += row.totalMs;
    into.calls += row.calls;
  }
  if (header === undefined) throw new Error('Not a script profile: it has no header line.');
  const format = Number(meta['format']);
  if (Number.isFinite(format) && format > SCRIPT_PROFILE_FORMAT) {
    problems.push(
      `The file is in format ${String(format)}, newer than Etch reads (${String(SCRIPT_PROFILE_FORMAT)}): only the columns Etch knows are shown.`,
    );
  }
  if (other > 0)
    problems.push(`${String(other)} rows of other lists than triggers and effects are left out.`);
  if (unreadable > 0)
    problems.push(`${String(unreadable)} rows whose numbers could not be read are left out.`);
  for (const list of [triggers, effects]) {
    list.rows = withOneUnowned(list.rows);
    list.rows.sort((a, b) => b.totalMs - a.totalMs);
  }
  return {
    meta,
    interrupted: (meta['status'] ?? '').startsWith('interrupted'),
    triggers,
    effects,
    problems,
  };
}

/** A script profile file in a profile's `logs/` folder. */
export interface ScriptProfileFile {
  readonly path: string;
  readonly modifiedMs: number;
}

const FILE_NAME = /^script_profile_.*\.csv$/i;

/** The newest `logs/script_profile_*.csv` of the given game profile folders, by its file time. */
export async function findLatestScriptProfile(
  profileFolders: readonly string[],
): Promise<ScriptProfileFile | undefined> {
  let latest: ScriptProfileFile | undefined;
  for (const folder of profileFolders) {
    const logs = join(folder, 'logs');
    const names = await readdir(logs).catch(() => [] as string[]);
    for (const name of names) {
      if (!FILE_NAME.test(name)) continue;
      const path = join(logs, name);
      const info = await stat(path).catch(() => undefined);
      if (info === undefined || !info.isFile()) continue;
      if (latest === undefined || info.mtimeMs > latest.modifiedMs) {
        latest = { path, modifiedMs: info.mtimeMs };
      }
    }
  }
  return latest;
}

/** Reads a script profile file. */
export async function readScriptProfile(path: string): Promise<ScriptProfile> {
  return parseScriptProfile(await readFile(path, 'utf8'));
}

const OWNERS: Readonly<Record<string, string>> = {
  event: 'Event',
  event_option: 'Event option',
  decision: 'Decision',
  on_action: 'On action',
  casus_belli: 'Casus belli',
  triggered_modifier: 'Triggered modifier',
  province_triggered_modifier: 'Province triggered modifier',
  mission: 'Mission',
  none: 'No owner found',
};

/** Escapes a text for a Markdown table cell. */
function cell(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ');
}

/** The owner's name as the profiler's window shows it: an event option is the event and `#n`. */
export function rowLabel(row: ScriptProfileRow): string {
  if (row.owner === 'none') {
    if ((row.callers ?? 1) > 1)
      return `${String(row.callers)} callers in eu4.exe (the CSV lists each)`;
    return row.callerRva === '' ? '' : `called from ${row.callerRva}`;
  }
  if (row.owner === 'event_option' && row.option !== '') return `${row.name} #${row.option}`;
  return row.name;
}

function figure(value: number, decimals: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function listMarkdown(title: string, list: ScriptProfileList, rows: number): string[] {
  const out = [
    `## ${title}`,
    '',
    `${figure(list.totalMs, 1)} ms in ${figure(list.calls, 0)} calls, ${figure(list.rows.length, 0)} rows.`,
    '',
  ];
  if (list.rows.length === 0) return [...out, 'None measured.', ''];
  out.push(
    '| # | Owner | Name | Role | Calls | Total (ms) | Mean (µs) | Max (µs) |',
    '| ---: | --- | --- | --- | ---: | ---: | ---: | ---: |',
  );
  list.rows.slice(0, rows).forEach((row, i) => {
    out.push(
      `| ${String(i + 1)} | ${cell(OWNERS[row.owner] ?? row.owner)} | ${cell(rowLabel(row))} | ${cell(row.role)} | ${figure(row.calls, 0)} | ${figure(row.totalMs, 2)} | ${figure(row.meanUs, 3)} | ${figure(row.maxUs, 1)} |`,
    );
  });
  if (list.rows.length > rows) {
    out.push('', `${figure(list.rows.length - rows, 0)} more rows are in the CSV.`);
  }
  out.push('');
  return out;
}

/** What the span was: its days and dates, wall time, game build and Anvil version. */
function spanLine(meta: Readonly<Record<string, string>>): string {
  const parts: string[] = [];
  if (meta['days'] !== undefined) {
    const dates =
      meta['first_day'] !== undefined && meta['last_day'] !== undefined
        ? ` (${meta['first_day']} to ${meta['last_day']})`
        : '';
    parts.push(`${meta['days']} days${dates}`);
  }
  if (meta['wall_s'] !== undefined) parts.push(`${meta['wall_s']} s`);
  if (meta['started'] !== undefined) parts.push(`started ${meta['started'].replace('T', ' ')}`);
  if (meta['build'] !== undefined) parts.push(meta['build']);
  if (meta['version'] !== undefined) parts.push(`Anvil ${meta['version']}`);
  if (meta['multiplayer'] === '1' || meta['multiplayer'] === 'true') parts.push('multiplayer');
  if (meta['ironman'] === '1' || meta['ironman'] === 'true') parts.push('ironman');
  return parts.join(' · ');
}

/** The profile as a Markdown page: the span, an interruption, then the longest rows of each list. */
export function scriptProfileMarkdown(
  profile: ScriptProfile,
  file: { path: string; uri: string },
  rows: number,
): string {
  const out = ['# Script profile', '', `[${cell(file.path)}](${file.uri})`, ''];
  const span = spanLine(profile.meta);
  if (span !== '') out.push(span, '');
  if (profile.interrupted) {
    out.push(
      `> **Interrupted** (${cell(profile.meta['status'] ?? '')}): a load, leaving to the menu or quitting the game ended the span early. The lists hold what was measured until then.`,
      '',
    );
  }
  for (const problem of profile.problems) out.push(`> ${cell(problem)}`, '');
  out.push(...listMarkdown('Triggers', profile.triggers, rows));
  out.push(...listMarkdown('Effects', profile.effects, rows));
  out.push(
    'Times are summed over every game thread. A trigger inside an effect (a `limit`) counts in both lists.',
    '',
  );
  return out.join('\n');
}
