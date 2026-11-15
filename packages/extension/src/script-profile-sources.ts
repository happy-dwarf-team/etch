// Where a script profile's owners are written (eu4-engine-lab#166, after-v2.md): the file and line
// of an event, a decision, an on_action, … in the playset's files, so that a row of the page links
// to the block it measured. Node only, no vscode.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { GameFile, GameFiles } from '@etch/core/playset';
import { parseScript, type BlockNode, type EntryNode, type PropertyNode } from '@etch/core';
import type { ScriptProfileRow } from './script-profile.ts';

/** Where an owner's block, or its role's block inside it, starts. */
export interface ScriptSource {
  /** Absolute path on disk. */
  readonly absolutePath: string;
  /** Game-relative path with `/`. */
  readonly path: string;
  /** The playset layer the file is from: `game` or the mod's name. */
  readonly layer: string;
  /** 1-based line. */
  readonly line: number;
  /** How many other definitions of the same key the playset has (a duplicate event id, say). */
  readonly others: number;
}

/**
 * Where each kind of owner is defined: the folder, and how deep its key is. `top` is a key of the
 * file, `second` a key inside a top-level block (a decision in `country_decisions`, a mission in its
 * group), and `event` a top-level block whose `id` is the key.
 */
const OWNER_FOLDERS: Readonly<
  Record<string, { folder: string; kind: 'top' | 'second' | 'event' }>
> = {
  event: { folder: 'events', kind: 'event' },
  event_option: { folder: 'events', kind: 'event' },
  decision: { folder: 'decisions', kind: 'second' },
  mission: { folder: 'missions', kind: 'second' },
  on_action: { folder: 'common/on_actions', kind: 'top' },
  casus_belli: { folder: 'common/cb_types', kind: 'top' },
  triggered_modifier: { folder: 'common/triggered_modifiers', kind: 'top' },
  province_triggered_modifier: { folder: 'common/province_triggered_modifiers', kind: 'top' },
  church_aspect: { folder: 'common/church_aspects', kind: 'top' },
  scripted_trigger: { folder: 'common/scripted_triggers', kind: 'top' },
};

function isBlockProperty(entry: EntryNode): entry is PropertyNode & { value: BlockNode } {
  return entry.kind === 'property' && entry.value?.kind === 'block';
}

/** The scalar value of a block's property, without regard to the key's case. */
function scalarOf(block: BlockNode, key: string): string | undefined {
  for (const entry of block.entries) {
    if (
      entry.kind === 'property' &&
      entry.key.text.toLowerCase() === key &&
      entry.value?.kind === 'scalar'
    ) {
      return entry.value.text;
    }
  }
  return undefined;
}

/** The owner blocks of one file, by the key a profile's row names. */
function ownersOf(
  entries: readonly EntryNode[],
  kind: 'top' | 'second' | 'event',
): [string, PropertyNode & { value: BlockNode }][] {
  const found: [string, PropertyNode & { value: BlockNode }][] = [];
  for (const entry of entries) {
    if (!isBlockProperty(entry)) continue;
    if (kind === 'top') found.push([entry.key.text, entry]);
    else if (kind === 'event') {
      const id = scalarOf(entry.value, 'id');
      if (id !== undefined) found.push([id, entry]);
    } else {
      for (const inner of entry.value.entries) {
        if (isBlockProperty(inner)) found.push([inner.key.text, inner]);
      }
    }
  }
  return found;
}

/** The 1-based line of an offset. */
function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = text.indexOf('\n'); i >= 0 && i < offset; i = text.indexOf('\n', i + 1)) line++;
  return line;
}

/**
 * The block a row measured inside its owner: an event option's `option` block (the `n`th), and the
 * role's own block (`trigger`, `potential`, `ai_will_do`, …) when the owner writes one. A role the
 * owner does not write as a key (an option's `effect` is the option itself) gives the owner.
 */
function roleBlock(owner: PropertyNode & { value: BlockNode }, row: ScriptProfileRow): EntryNode {
  let block: PropertyNode & { value: BlockNode } = owner;
  if (row.owner === 'event_option') {
    const options = owner.value.entries.filter(
      (e): e is PropertyNode & { value: BlockNode } =>
        isBlockProperty(e) && e.key.text.toLowerCase() === 'option',
    );
    const option = options[Number(row.option) - 1];
    if (option === undefined) return owner;
    block = option;
  }
  const role = row.role.toLowerCase();
  if (role === '') return block;
  const inner = block.value.entries.find(
    (e) => e.kind === 'property' && e.key.text.toLowerCase() === role,
  );
  return inner ?? block;
}

/** The files of a folder and its subfolders across the playset's layers, as the playset wins them. */
async function filesUnder(files: GameFiles, folder: string): Promise<GameFile[]> {
  const found = await files.list(folder, '.txt');
  for (const sub of await files.folders(folder)) found.push(...(await filesUnder(files, sub)));
  return found;
}

/** How many files are read at once. */
const READ_AHEAD = 16;

/** Escapes a text for a regular expression. */
function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A quick test of a file's text before it is parsed: whether it may define one of the names, as an
 * event's `id = name` or as a key `name =`. A name that is also used elsewhere (an event id in an
 * `on_action`, a scripted trigger in every event) then costs no parse of the files that only use it.
 */
function mayDefine(names: readonly string[], kinds: ReadonlySet<string>): RegExp {
  const alternatives = names.map(escaped).join('|');
  const patterns: string[] = [];
  if (kinds.has('event')) patterns.push(`\\bid\\s*=\\s*"?(?:${alternatives})(?![\\w.])`);
  if (kinds.has('top') || kinds.has('second'))
    patterns.push(`(?:^|[\\s{])"?(?:${alternatives})"?\\s*=`);
  return new RegExp(patterns.join('|'), 'i');
}

/**
 * Finds where the rows' owners are written in the playset: for each row with an owner and a name,
 * the file and line of the block it measured. A file is parsed only when its text may define a
 * wanted name, so a big mod's `events` costs a read of each file and a parse of a few. The first
 * definition in the folder's file order is the one linked; `others` counts the rest.
 */
export async function findScriptSources(
  files: GameFiles,
  rows: readonly ScriptProfileRow[],
): Promise<Map<ScriptProfileRow, ScriptSource>> {
  const sources = new Map<ScriptProfileRow, ScriptSource>();
  const byFolder = new Map<string, Map<string, ScriptProfileRow[]>>();
  for (const row of rows) {
    const where = OWNER_FOLDERS[row.owner];
    if (where === undefined || row.name === '') continue;
    const names = byFolder.get(where.folder) ?? new Map<string, ScriptProfileRow[]>();
    byFolder.set(where.folder, names);
    const key = row.name.toLowerCase();
    names.set(key, [...(names.get(key) ?? []), row]);
  }
  for (const [folder, wanted] of byFolder) {
    const kinds = new Set(
      Object.values(OWNER_FOLDERS)
        .filter((w) => w.folder === folder)
        .map((w) => w.kind),
    );
    const test = mayDefine([...wanted.keys()], kinds);
    const folderFiles = await filesUnder(files, folder);
    // One character per byte, so offsets are lines either way: script files are Windows-1252 or
    // UTF-8, and only the ASCII keys are compared. A UTF-8 BOM, on the first line, goes first: as
    // latin1 it would join the file's first key.
    const read = (file: GameFile): Promise<string | undefined> =>
      readFile(file.absolutePath).then(
        (bytes) =>
          (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
            ? bytes.subarray(3)
            : bytes
          ).toString('latin1'),
        () => undefined,
      );
    const pending = folderFiles.slice(0, READ_AHEAD).map(read);
    for (const [index, file] of folderFiles.entries()) {
      const next = folderFiles[index + READ_AHEAD];
      if (next !== undefined) pending.push(read(next));
      const text = await pending[index];
      if (text === undefined || !test.test(text)) continue;
      const { entries } = parseScript(text);
      for (const kind of kinds) {
        for (const [name, owner] of ownersOf(entries, kind)) {
          const key = name.toLowerCase();
          const matching = wanted.get(key);
          if (matching === undefined) continue;
          for (const row of matching) {
            if (OWNER_FOLDERS[row.owner]?.kind !== kind) continue;
            const known = sources.get(row);
            if (known !== undefined) {
              sources.set(row, { ...known, others: known.others + 1 });
              continue;
            }
            sources.set(row, {
              absolutePath: file.absolutePath,
              path: file.path,
              layer: file.layer.name,
              line: lineAt(text, roleBlock(owner, row).start),
              others: 0,
            });
          }
        }
      }
    }
  }
  return sources;
}

/** A line of a script file and what the profile measured for the block that starts there. */
export interface ScriptProfileLens {
  /** 1-based line of the owner's block (or an event option's). */
  readonly line: number;
  /** One line: the lists' times and calls, `triggers 40.25 ms (100 calls) · effects 62 ms (10 calls)`. */
  readonly title: string;
  /** Each row's role, list, time and calls, one per line. */
  readonly detail: string;
}

/** The owner kinds a script file can hold, by its path: `…/events/…`, `…/common/cb_types/…`. */
function ownerKindsOfPath(path: string): string[] {
  const normalized = `/${path.replace(/\\/g, '/').toLowerCase()}`;
  return Object.entries(OWNER_FOLDERS)
    .filter(([, where]) => normalized.includes(`/${where.folder}/`))
    .map(([owner]) => owner);
}

function milliseconds(value: number): string {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ms`;
}

function callsText(calls: number): string {
  return `${calls.toLocaleString('en-US')} ${calls === 1 ? 'call' : 'calls'}`;
}

/** The lens of a set of rows: each list's sum, then a line per row. */
function lensOf(
  line: number,
  rows: readonly { list: string; row: ScriptProfileRow }[],
): ScriptProfileLens {
  const lists = ['triggers', 'scripted trigger uses', 'effects'];
  const title = lists
    .map((list) => {
      const of = rows.filter((r) => r.list === list);
      if (of.length === 0) return undefined;
      const ms = of.reduce((n, r) => n + r.row.totalMs, 0);
      const calls = of.reduce((n, r) => n + r.row.calls, 0);
      return `${list} ${milliseconds(ms)} (${callsText(calls)})`;
    })
    .filter((part) => part !== undefined)
    .join(' · ');
  const detail = rows
    .map(({ list, row }) => {
      const what = row.option !== '' ? `option ${row.option} ${row.role}` : row.role || 'all uses';
      return `${what} (${list}): ${milliseconds(row.totalMs)} in ${callsText(row.calls)}, max ${row.maxUs.toLocaleString('en-US', { maximumFractionDigits: 1 })} µs`;
    })
    .join('\n');
  return { line, title: `Script profile: ${title}`, detail };
}

/** A comparable form of an absolute path: resolved, `/` separators, lower case. */
function pathKey(path: string): string {
  return resolve(path).replace(/\\/g, '/').toLowerCase();
}

/**
 * Whether the file at `path` is the copy the playset loads: the winning file at its game path in
 * the layer whose folder holds it (the deepest one). `false` for a copy a later layer overrides or
 * a `replace_path` hides, whose blocks the measured game never ran; `undefined` for a file in none
 * of the layers.
 */
export async function isLoadedCopy(path: string, files: GameFiles): Promise<boolean | undefined> {
  const file = pathKey(path);
  let root: string | undefined;
  for (const layer of files.layers) {
    const key = `${pathKey(layer.root)}/`;
    if (file.startsWith(key) && (root === undefined || key.length > root.length)) root = key;
  }
  if (root === undefined) return undefined;
  const winner = await files.find(file.slice(root.length));
  return winner !== undefined && pathKey(winner.absolutePath) === file;
}

/**
 * The lenses of a script file from a profile: above each owner block the profile measured, the
 * times of its rows (an event's options included), and above each measured option its own. The
 * file's kind comes from its folder; a scripted trigger takes the list of all its uses, the other
 * owners the trigger and effect lists, kept apart since an effect's time includes its `limit`s.
 */
export function scriptProfileLenses(
  text: string,
  path: string,
  profile: {
    readonly triggers: { readonly rows: readonly ScriptProfileRow[] };
    readonly scriptedTriggers: { readonly rows: readonly ScriptProfileRow[] };
    readonly effects: { readonly rows: readonly ScriptProfileRow[] };
  },
): ScriptProfileLens[] {
  const owners = ownerKindsOfPath(path);
  if (owners.length === 0) return [];
  const listed = [
    ...profile.triggers.rows.map((row) => ({ list: 'triggers', row })),
    ...profile.scriptedTriggers.rows.map((row) => ({ list: 'scripted trigger uses', row })),
    ...profile.effects.rows.map((row) => ({ list: 'effects', row })),
  ].filter(
    ({ list, row }) =>
      owners.includes(row.owner) &&
      row.name !== '' &&
      // A scripted trigger's root rows are part of its uses, listed on their own.
      (row.owner !== 'scripted_trigger' || list === 'scripted trigger uses'),
  );
  if (listed.length === 0) return [];
  const byName = new Map<string, { list: string; row: ScriptProfileRow }[]>();
  for (const entry of listed) {
    const key = entry.row.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), entry]);
  }
  const kinds = new Set(owners.map((owner) => OWNER_FOLDERS[owner]?.kind));
  const lenses: ScriptProfileLens[] = [];
  const { entries } = parseScript(text);
  for (const kind of kinds) {
    if (kind === undefined) continue;
    for (const [name, owner] of ownersOf(entries, kind)) {
      const rows = byName.get(name.toLowerCase());
      if (rows === undefined) continue;
      lenses.push(lensOf(lineAt(text, owner.start), rows));
      const options = owner.value.entries.filter(
        (e): e is PropertyNode & { value: BlockNode } =>
          isBlockProperty(e) && e.key.text.toLowerCase() === 'option',
      );
      options.forEach((option, index) => {
        const of = rows.filter(
          (r) => r.row.owner === 'event_option' && r.row.option === String(index + 1),
        );
        if (of.length > 0) lenses.push(lensOf(lineAt(text, option.start), of));
      });
    }
  }
  return lenses.sort((a, b) => a.line - b.line);
}
