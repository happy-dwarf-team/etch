/**
 * Names in script that the playset does not define and that crash the game. EU4 1.37.5 looks
 * these names up once, when it reads the file, keeps the result without checking it, and calls
 * into it later. An unknown name is a null pointer there: the game crashes and writes nothing to
 * `error.log`.
 *
 * - `add_idea_group`, `remove_idea_group` and `remove_idea` crash when the effect runs or its
 *   tooltip is built. So does `change_graphical_culture`, whose value is a graphical culture
 *   unless it is a country tag or a scope.
 * - `provincial_institution_progress`'s `which`, `num_of_religion`'s `religion` and
 *   `had_active_policy`'s `policy` crash when the trigger is evaluated: a decision's `allow` with
 *   one of them crashed the game on the first day, though no country met its `potential`.
 * - The others crash only when their tooltip or description is built, for example when a player
 *   hovers over a decision, a mission or an event option that uses them: the game's
 *   `PostValidate` of these keys looks the name up again but logs nothing, and the validation
 *   passes ignore what it returns. Inside a `custom_trigger_tooltip`, which shows its own text,
 *   they are not checked. Their names are compared ignoring case, because whether these lookups
 *   are case-sensitive was not read.
 *
 * Each key was read in the game's code and crashed a running game on 17.11.2026 (EU4 engine lab,
 * `docs/script-unchecked-indexes.md`), `advisor` and `change_graphical_culture` on 18.11.2026;
 * `seenInGame` keeps a key added from a reading alone apart, and its message says so. The
 * decisions that held the tooltip keys in `allow` were shown without a crash, until a hover over
 * the tooltip. `ruler_has_personality`, `heir_has_personality`, `consort_has_personality`,
 * `has_institution` and `is_institution_enabled` with an unknown name were tested the same way and
 * only show an empty tooltip: they are left out.
 *
 * `has_idea` logs "Invalid idea" when the file is read but keeps the missing idea, and building
 * its tooltip crashes the game: its warning names the log line. Keys whose unknown name the game
 * reports and then handles (`has_idea_group`'s "Invalid idea group") or replaces with a fallback
 * (`add_idea`'s null idea) are left out.
 */
import type { EntryNode, ParsedScript, ScalarNode, SourceRange } from './tree.ts';
import type { CountryHistoryFile } from './country-files.ts';

/** The kinds of names the check knows, each a database the playset defines. */
export type ScriptNameKind =
  | 'idea-group'
  | 'idea'
  | 'policy'
  | 'religion'
  | 'rebel-type'
  | 'disaster'
  | 'icon'
  | 'institution'
  | 'estate-agenda'
  | 'advisor-type'
  | 'graphical-culture';

/** When an unknown name crashes the game. */
export type ScriptNameCrash = 'effect' | 'trigger' | 'tooltip';

/** A key whose value is a name of a kind. */
export interface ScriptNameKey {
  readonly kind: ScriptNameKind;
  readonly crash: ScriptNameCrash;
  /** Whether the crash was seen in a running game, not only read in its code. */
  readonly seenInGame: boolean;
  /** What the game logs in error.log for the missing name before it crashes, if anything. */
  readonly logged?: string;
}

/** Keys whose value is a name, by key. */
export const SCRIPT_NAME_KEYS: ReadonlyMap<string, ScriptNameKey> = new Map<string, ScriptNameKey>([
  ['add_idea_group', { kind: 'idea-group', crash: 'effect', seenInGame: true }],
  ['remove_idea_group', { kind: 'idea-group', crash: 'effect', seenInGame: true }],
  ['remove_idea', { kind: 'idea', crash: 'effect', seenInGame: true }],
  ['has_active_policy', { kind: 'policy', crash: 'tooltip', seenInGame: true }],
  ['enable_religion', { kind: 'religion', crash: 'tooltip', seenInGame: true }],
  ['likely_rebels', { kind: 'rebel-type', crash: 'tooltip', seenInGame: true }],
  ['current_icon', { kind: 'icon', crash: 'tooltip', seenInGame: true }],
  ['has_spawned_rebels', { kind: 'rebel-type', crash: 'tooltip', seenInGame: true }],
  ['has_not_spawned_rebels', { kind: 'rebel-type', crash: 'tooltip', seenInGame: true }],
  ['has_active_estate_agenda', { kind: 'estate-agenda', crash: 'tooltip', seenInGame: true }],
  ['has_idea', { kind: 'idea', crash: 'tooltip', seenInGame: true, logged: 'Invalid idea' }],
  ['advisor', { kind: 'advisor-type', crash: 'tooltip', seenInGame: true }],
  ['change_graphical_culture', { kind: 'graphical-culture', crash: 'effect', seenInGame: true }],
]);

/** A block member that is a name, by the member's key. */
function member(
  key: string,
  kind: ScriptNameKind,
  crash: ScriptNameCrash,
  seenInGame: boolean,
): ReadonlyMap<string, ScriptNameKey> {
  return new Map<string, ScriptNameKey>([[key, { kind, crash, seenInGame }]]);
}

/** Members of block triggers whose value is a name, by the block's key and then the member's. */
export const SCRIPT_NAME_MEMBERS: ReadonlyMap<string, ReadonlyMap<string, ScriptNameKey>> = new Map(
  [
    ['had_active_policy', member('policy', 'policy', 'trigger', true)],
    ['has_disaster_progress', member('disaster', 'disaster', 'tooltip', true)],
    ['num_of_religion', member('religion', 'religion', 'trigger', true)],
    ['provincial_institution_progress', member('which', 'institution', 'trigger', true)],
  ],
);

/**
 * What a kind is called in messages, the folder under `common` that defines it, and whether the
 * game's lookup was read to be case-sensitive (the others are compared ignoring case).
 */
export const SCRIPT_NAME_KINDS: ReadonlyMap<
  ScriptNameKind,
  { readonly what: string; readonly folder: string; readonly caseSensitive: boolean }
> = new Map([
  ['idea-group', { what: 'idea group', folder: 'common/ideas', caseSensitive: true }],
  ['idea', { what: 'idea', folder: 'common/ideas', caseSensitive: true }],
  ['policy', { what: 'policy', folder: 'common/policies', caseSensitive: false }],
  ['religion', { what: 'religion', folder: 'common/religions', caseSensitive: false }],
  ['rebel-type', { what: 'rebel type', folder: 'common/rebel_types', caseSensitive: false }],
  ['disaster', { what: 'disaster', folder: 'common/disasters', caseSensitive: false }],
  ['icon', { what: 'orthodox icon', folder: 'common/religions', caseSensitive: false }],
  ['institution', { what: 'institution', folder: 'common/institutions', caseSensitive: false }],
  [
    'estate-agenda',
    { what: 'estate agenda', folder: 'common/estate_agendas', caseSensitive: false },
  ],
  ['advisor-type', { what: 'advisor type', folder: 'common/advisortypes', caseSensitive: false }],
  [
    'graphical-culture',
    {
      what: 'graphical culture',
      folder: 'common/graphicalculturetype.txt',
      caseSensitive: false,
    },
  ],
]);

/** Keys whose block shows its own tooltip instead of its triggers'. */
const OWN_TOOLTIP_KEYS: ReadonlySet<string> = new Set(['custom_trigger_tooltip']);

/** The names the playset defines, by kind; a kind the playset has no files for is absent. */
export interface ScriptNames {
  readonly byKind: ReadonlyMap<ScriptNameKind, ReadonlySet<string>>;
  /**
   * The playset's scripted effects and triggers, in lower case. A block under one of these keys,
   * below a file's top level, is a call, and its members are the call's arguments
   * (`my_effect = { advisor = yes }` gives `$advisor$` the text `yes`), not triggers or effects,
   * so they are not checked. At the top level of `common/scripted_triggers` the same key is the
   * definition, which is checked.
   */
  readonly scripted?: ReadonlySet<string>;
  /**
   * Whether a layer has each country file `common/country_tags` names, by game path in lower case
   * (`checkCountryFiles`).
   */
  readonly countryFiles?: ReadonlyMap<string, boolean>;
  /**
   * The `common/country_tags` file that defines each tag first, by tag, as a game path in lower
   * case (`firstCountryTags`).
   */
  readonly countryTags?: ReadonlyMap<string, string>;
  /**
   * When a mod's file is the first of the playset's `common/country_tags` files and no file defines
   * all of `REQUIRED_COUNTRY_TAGS`: that file's game path and the missing tags.
   */
  readonly countryTagsMissing?:
    { readonly path: string; readonly tags: readonly string[] } | undefined;
  /**
   * The playset's `history/countries` files by the tag the game reads each for
   * (`countryHistoryTag`, `checkCountryHistory`).
   */
  readonly countryHistories?: ReadonlyMap<string, readonly CountryHistoryFile[]>;
  /**
   * The tags whose country file the game checks, by the file's game path in lower case, in the
   * order the game reads them (`checkCountryContent`).
   */
  readonly countryFileTags?: ReadonlyMap<string, readonly string[]>;
  /**
   * Whether a layer has each technology table `common/technology.txt` names, by game path in lower
   * case (`checkTechnologyTables`).
   */
  readonly technologyTables?: ReadonlyMap<string, boolean>;
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
 * top-level religion group that sets `icon` (every religion of the game and of the Workshop mods
 * on the lab's disk does), and an icon is a block of a religion's `orthodox_icons`.
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

/**
 * Adds the top-level blocks of a file as names of a kind (policies, rebel types, disasters,
 * institutions, estate agendas, advisor types).
 */
export function readTopLevelNames(
  parsed: ParsedScript,
  kind: ScriptNameKind,
  into: ScriptNameSets,
): void {
  const names = setOf(into, kind);
  for (const block of blocks(parsed.entries)) names.add(block.key);
}

/** Adds the bare words of a file that is only a list as names of a kind (graphical cultures). */
export function readBareNames(
  parsed: ParsedScript,
  kind: ScriptNameKind,
  into: ScriptNameSets,
): void {
  const names = setOf(into, kind);
  for (const entry of parsed.entries) if (entry.kind === 'scalar') names.add(entry.text);
}

/**
 * Values that are not names but a scope or a variable: a scripted effect's `$argument$`, an
 * `event_target:` or other prefixed scope, and the scope keywords and country tags a religion
 * (`num_of_religion = { religion = ROOT }`) or a graphical culture (`change_graphical_culture =
 * FRA`, which takes that country's) can be given as.
 */
function isScopeOrVariable(name: string, kind: ScriptNameKind): boolean {
  if (/[$:@[]/.test(name)) return true;
  if (kind !== 'religion' && kind !== 'graphical-culture') return false;
  return (
    /^(?:root|this|(?:prev|from)+|owner|controller|emperor|capital)$/i.test(name) ||
    /^[A-Z][A-Z0-9]{2}$/.test(name)
  );
}

/**
 * The names in a parsed script file that the playset does not define, in text order. A kind the
 * playset has no files for is not checked. `ownTooltip` reads the text as inside a block that
 * shows its own tooltip, such as a string argument written inside a `custom_trigger_tooltip`.
 * `body` reads the text as the inside of a trigger or an effect, such as a string argument's
 * script, whose top level can call a scripted effect; otherwise it is a whole file's.
 */
export function checkScriptNames(
  parsed: ParsedScript,
  names: ScriptNames,
  ownTooltip = false,
  body = false,
): ScriptNameDiagnostic[] {
  const found: ScriptNameDiagnostic[] = [];
  walk(parsed.entries, undefined, ownTooltip, !body, names, found);
  return found;
}

/** Whether a block of this key shows its own tooltip instead of its triggers'. */
export function showsOwnTooltip(key: string): boolean {
  return OWN_TOOLTIP_KEYS.has(key.toLowerCase());
}

function walk(
  entries: readonly EntryNode[],
  members: ReadonlyMap<string, ScriptNameKey> | undefined,
  ownTooltip: boolean,
  top: boolean,
  names: ScriptNames,
  found: ScriptNameDiagnostic[],
): void {
  for (const entry of entries) {
    if (entry.kind === 'block') {
      walk(entry.entries, undefined, ownTooltip, false, names, found);
      continue;
    }
    if (entry.kind !== 'property') continue;
    const key = entry.key.text.toLowerCase();
    const value = entry.value;
    if (value?.kind === 'block') {
      if (!top && names.scripted?.has(key) === true) continue;
      const inner = ownTooltip || OWN_TOOLTIP_KEYS.has(key);
      walk(value.entries, SCRIPT_NAME_MEMBERS.get(key), inner, false, names, found);
      continue;
    }
    if (value?.kind !== 'scalar') continue;
    const nameKey = members?.get(key) ?? SCRIPT_NAME_KEYS.get(key);
    if (nameKey === undefined || (ownTooltip && nameKey.crash === 'tooltip')) continue;
    const problem = check(value, key, nameKey, names);
    if (problem !== undefined) found.push(problem);
  }
}

/**
 * What the message says happens, by when the name crashes the game and by whether that was seen
 * in a running game or only read in its code.
 */
const CRASH_TEXT: Readonly<Record<ScriptNameCrash, { seen: string; read: string }>> = {
  effect: {
    seen: 'running the effect or showing its tooltip crashes the game (tried in the game)',
    read: "running the effect or showing its tooltip reads through the missing name (read in the game's code, not tried in the game)",
  },
  trigger: {
    seen: 'evaluating the trigger crashes the game (tried in the game), and so does showing its tooltip',
    read: "evaluating the trigger reads through the missing name, and so does showing its tooltip (read in the game's code, not tried in the game)",
  },
  tooltip: {
    seen: 'showing the tooltip crashes the game, for example when a player hovers over the decision, mission or option that uses it (tried in the game)',
    read: "showing the tooltip reads through the missing name, for example when a player hovers over the decision, mission or option that uses it (read in the game's code, not tried in the game)",
  },
};

const lowerCased = new WeakMap<ReadonlySet<string>, ReadonlySet<string>>();

/** A set's names in lower case, made once per set. */
function lowerCase(set: ReadonlySet<string>): ReadonlySet<string> {
  let lower = lowerCased.get(set);
  if (lower === undefined) {
    lower = new Set([...set].map((name) => name.toLowerCase()));
    lowerCased.set(set, lower);
  }
  return lower;
}

function check(
  scalar: ScalarNode,
  key: string,
  { kind, crash, seenInGame, logged }: ScriptNameKey,
  names: ScriptNames,
): ScriptNameDiagnostic | undefined {
  const name = scalar.text;
  if (name === '' || isScopeOrVariable(name, kind)) return undefined;
  const known = names.byKind.get(kind);
  if (known === undefined || known.has(name)) return undefined;
  const { what, folder, caseSensitive } = SCRIPT_NAME_KINDS.get(kind) ?? {
    what: kind,
    folder: 'common',
    caseSensitive: false,
  };
  if (!caseSensitive && lowerCase(known).has(name.toLowerCase())) return undefined;
  const when = seenInGame ? CRASH_TEXT[crash].seen : CRASH_TEXT[crash].read;
  return {
    severity: 'warning',
    code: `unknown-${kind}`,
    message:
      `No ${what} '${name}' in ${folder} of the playset${caseSensitive ? ' (names are case-sensitive)' : ''}. ` +
      (logged === undefined
        ? `The game does not check ${key}'s ${what} or report it in error.log: ${when}.`
        : `The game logs "${logged}" in error.log for ${key}'s ${what} but keeps the missing name: ${when}.`),
    name,
    key,
    start: scalar.start,
    end: scalar.end,
  };
}
