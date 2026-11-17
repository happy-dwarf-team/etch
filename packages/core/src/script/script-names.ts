/**
 * Names in script that the playset does not define and that crash the game. EU4 1.37.5 looks
 * these names up once, when it reads the file, keeps the result without checking it, and calls
 * into it later. An unknown name is a null pointer there: the game crashes and writes nothing to
 * `error.log`.
 *
 * - `add_idea_group`, `remove_idea_group` and `remove_idea` crash when the effect runs or its
 *   tooltip is built (the two idea group effects checked in the game on 17.11.2026, `remove_idea`
 *   read in the game's code).
 * - The others crash only when their tooltip or description is built, for example when a player
 *   hovers over a decision, a mission or an event option that uses them (read in the game's code,
 *   not run): the game's `PostValidate` of these keys looks the name up again but logs nothing,
 *   and the validation passes ignore what it returns.
 *
 * Keys whose unknown name the game reports (`has_idea_group`'s "Invalid idea group") or replaces
 * with a fallback (`add_idea`'s null idea) are left out.
 */
import type { EntryNode, ParsedScript, ScalarNode, SourceRange } from './tree.ts';

/** The kinds of names the check knows, each a database the playset defines. */
export type ScriptNameKind =
  'idea-group' | 'idea' | 'policy' | 'religion' | 'rebel-type' | 'disaster' | 'icon';

/** When an unknown name crashes the game. */
export type ScriptNameCrash = 'effect' | 'tooltip';

/** A key whose value is a name of a kind. */
export interface ScriptNameKey {
  readonly kind: ScriptNameKind;
  readonly crash: ScriptNameCrash;
}

/** Keys whose value is a name, by key. */
export const SCRIPT_NAME_KEYS: ReadonlyMap<string, ScriptNameKey> = new Map<string, ScriptNameKey>([
  ['add_idea_group', { kind: 'idea-group', crash: 'effect' }],
  ['remove_idea_group', { kind: 'idea-group', crash: 'effect' }],
  ['remove_idea', { kind: 'idea', crash: 'effect' }],
  ['has_active_policy', { kind: 'policy', crash: 'tooltip' }],
  ['enable_religion', { kind: 'religion', crash: 'tooltip' }],
  ['likely_rebels', { kind: 'rebel-type', crash: 'tooltip' }],
  ['current_icon', { kind: 'icon', crash: 'tooltip' }],
]);

/** A block member that is a name whose tooltip crashes, by the member's key. */
function tooltipMember(member: string, kind: ScriptNameKind): ReadonlyMap<string, ScriptNameKey> {
  return new Map<string, ScriptNameKey>([[member, { kind, crash: 'tooltip' }]]);
}

/** Members of block triggers whose value is a name, by the block's key and then the member's. */
export const SCRIPT_NAME_MEMBERS: ReadonlyMap<string, ReadonlyMap<string, ScriptNameKey>> = new Map(
  [
    ['had_active_policy', tooltipMember('policy', 'policy')],
    ['has_disaster_progress', tooltipMember('disaster', 'disaster')],
    ['num_of_religion', tooltipMember('religion', 'religion')],
  ],
);

/** What a kind is called in messages, and the folder under `common` that defines it. */
export const SCRIPT_NAME_KINDS: ReadonlyMap<
  ScriptNameKind,
  { readonly what: string; readonly folder: string }
> = new Map([
  ['idea-group', { what: 'idea group', folder: 'common/ideas' }],
  ['idea', { what: 'idea', folder: 'common/ideas' }],
  ['policy', { what: 'policy', folder: 'common/policies' }],
  ['religion', { what: 'religion', folder: 'common/religions' }],
  ['rebel-type', { what: 'rebel type', folder: 'common/rebel_types' }],
  ['disaster', { what: 'disaster', folder: 'common/disasters' }],
  ['icon', { what: 'orthodox icon', folder: 'common/religions' }],
]);

/** The names the playset defines, by kind; a kind the playset has no files for is absent. */
export interface ScriptNames {
  readonly byKind: ReadonlyMap<ScriptNameKind, ReadonlySet<string>>;
}

export type ScriptNameDiagnosticCode = `unknown-${ScriptNameKind}`;

/** A name the playset does not define; the range is the name's scalar. */
export interface ScriptNameDiagnostic extends SourceRange {
  readonly severity: 'warning';
  readonly code: ScriptNameDiagnosticCode;
  readonly message: string;
  /** The name as written. */
  readonly name: string;
  /** The key the name is the value of: the effect, the trigger or the block member. */
  readonly key: string;
}

/** Members of an idea group block that are not ideas. */
const IDEA_GROUP_MEMBERS: ReadonlySet<string> = new Set([
  'start',
  'bonus',
  'trigger',
  'ai_will_do',
]);

/** Mutable sets, by kind, that the readers below add to. */
export type ScriptNameSets = Map<ScriptNameKind, Set<string>>;

function setOf(into: ScriptNameSets, kind: ScriptNameKind): Set<string> {
  let set = into.get(kind);
  if (set === undefined) {
    set = new Set();
    into.set(kind, set);
  }
  return set;
}

function blocks(entries: readonly EntryNode[]): { key: string; entries: readonly EntryNode[] }[] {
  const found: { key: string; entries: readonly EntryNode[] }[] = [];
  for (const entry of entries) {
    if (entry.kind === 'property' && entry.value?.kind === 'block') {
      found.push({ key: entry.key.text, entries: entry.value.entries });
    }
  }
  return found;
}

/**
 * Adds the idea groups and ideas of one `common/ideas` file: each top-level block is an idea group
 * (the game keeps its name as written and compares it byte for byte), and each of its blocks other than `start`, `bonus`,
 * `trigger` and `ai_will_do` is an idea.
 */
export function readIdeaNames(parsed: ParsedScript, into: ScriptNameSets): void {
  const groups = setOf(into, 'idea-group');
  const ideas = setOf(into, 'idea');
  for (const group of blocks(parsed.entries)) {
    groups.add(group.key);
    for (const member of blocks(group.entries)) {
      if (!IDEA_GROUP_MEMBERS.has(member.key.toLowerCase())) ideas.add(member.key);
    }
  }
}

/**
 * Adds the religions and orthodox icons of one `common/religions` file: a religion is a block of a
 * top-level religion group that sets `icon`, and an icon is a block of a religion's
 * `orthodox_icons`.
 */
export function readReligionNames(parsed: ParsedScript, into: ScriptNameSets): void {
  const religions = setOf(into, 'religion');
  const icons = setOf(into, 'icon');
  for (const group of blocks(parsed.entries)) {
    for (const religion of blocks(group.entries)) {
      const setsIcon = religion.entries.some(
        (entry) => entry.kind === 'property' && entry.key.text.toLowerCase() === 'icon',
      );
      if (!setsIcon) continue;
      religions.add(religion.key);
      for (const member of blocks(religion.entries)) {
        if (member.key.toLowerCase() !== 'orthodox_icons') continue;
        for (const icon of blocks(member.entries)) icons.add(icon.key);
      }
    }
  }
}

/** Adds the top-level blocks of a file as names of a kind (policies, rebel types, disasters). */
export function readTopLevelNames(
  parsed: ParsedScript,
  kind: ScriptNameKind,
  into: ScriptNameSets,
): void {
  const names = setOf(into, kind);
  for (const block of blocks(parsed.entries)) names.add(block.key);
}

/**
 * Values that are not names but a scope or a variable: a scripted effect's `$argument$`, an
 * `event_target:` or other prefixed scope, and the scope keywords and country tags a religion can
 * be given as (`num_of_religion = { religion = ROOT }`).
 */
function isScopeOrVariable(name: string, kind: ScriptNameKind): boolean {
  if (/[$:@[]/.test(name)) return true;
  if (kind !== 'religion') return false;
  return (
    /^(?:root|this|from+|(?:prev)+|owner|controller|emperor|capital)$/i.test(name) ||
    /^[A-Z][A-Z0-9]{2}$/.test(name)
  );
}

/**
 * The names in a parsed script file that the playset does not define, in text order. A kind the
 * playset has no files for is not checked.
 */
export function checkScriptNames(parsed: ParsedScript, names: ScriptNames): ScriptNameDiagnostic[] {
  const found: ScriptNameDiagnostic[] = [];
  walk(parsed.entries, undefined, names, found);
  return found;
}

function walk(
  entries: readonly EntryNode[],
  members: ReadonlyMap<string, ScriptNameKey> | undefined,
  names: ScriptNames,
  found: ScriptNameDiagnostic[],
): void {
  for (const entry of entries) {
    if (entry.kind === 'block') {
      walk(entry.entries, undefined, names, found);
      continue;
    }
    if (entry.kind !== 'property') continue;
    const key = entry.key.text.toLowerCase();
    const value = entry.value;
    if (value?.kind === 'block') {
      walk(value.entries, SCRIPT_NAME_MEMBERS.get(key), names, found);
      continue;
    }
    if (value?.kind !== 'scalar') continue;
    const nameKey = members?.get(key) ?? SCRIPT_NAME_KEYS.get(key);
    if (nameKey === undefined) continue;
    const problem = check(value, key, nameKey, names);
    if (problem !== undefined) found.push(problem);
  }
}

function check(
  scalar: ScalarNode,
  key: string,
  { kind, crash }: ScriptNameKey,
  names: ScriptNames,
): ScriptNameDiagnostic | undefined {
  const name = scalar.text;
  if (name === '' || isScopeOrVariable(name, kind)) return undefined;
  const known = names.byKind.get(kind);
  if (known === undefined || known.has(name)) return undefined;
  const { what, folder } = SCRIPT_NAME_KINDS.get(kind) ?? { what: kind, folder: 'common' };
  const when =
    crash === 'effect'
      ? 'it crashes when the effect runs or its tooltip is shown'
      : 'it crashes if it builds the tooltip, for example when a player hovers over the decision, mission or option that uses it (a custom_trigger_tooltip around it shows its own text instead)';
  return {
    severity: 'warning',
    code: `unknown-${kind}`,
    message:
      `No ${what} '${name}' in ${folder} of the playset (names are case-sensitive). The game ` +
      `does not check ${key}'s ${what} or report it in error.log: ${when}.`,
    name,
    key,
    start: scalar.start,
    end: scalar.end,
  };
}
