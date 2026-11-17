/**
 * Names in script effects that the playset does not define and that crash the game. EU4 1.37.5
 * looks up `add_idea_group`'s and `remove_idea_group`'s idea group, and `remove_idea`'s idea, once
 * when it reads the file, keeps the result without checking it, and calls into it when the effect
 * runs or its tooltip is built. An unknown name is a null pointer there: the game crashes and
 * writes nothing to `error.log` (`add_idea_group` and `remove_idea_group` checked in the game on
 * 17.11.2026; `remove_idea` read in the game's code). The triggers that take the same names, such
 * as `has_idea_group`, log an unknown name and are left out.
 */
import type { EntryNode, ParsedScript, ScalarNode, SourceRange } from './tree.ts';

/** The kinds of names the check knows, each a database the playset defines. */
export type ScriptNameKind = 'idea-group' | 'idea';

/** Effects whose value is a name of a kind, by key. */
export const SCRIPT_NAME_KEYS: ReadonlyMap<string, ScriptNameKind> = new Map<
  string,
  ScriptNameKind
>([
  ['add_idea_group', 'idea-group'],
  ['remove_idea_group', 'idea-group'],
  ['remove_idea', 'idea'],
]);

/** The names the playset defines, by kind, and where they came from. */
export interface ScriptNames {
  /** Top-level keys of `common/ideas`: the idea groups, national ideas included. */
  readonly ideaGroups: ReadonlySet<string>;
  /** The ideas of every idea group. */
  readonly ideas: ReadonlySet<string>;
  /** Where the names came from, for messages, such as `common/ideas of the playset`. */
  readonly source: string;
}

export type ScriptNameDiagnosticCode = 'unknown-idea-group' | 'unknown-idea';

/** A name the playset does not define; the range is the name's scalar. */
export interface ScriptNameDiagnostic extends SourceRange {
  readonly severity: 'warning';
  readonly code: ScriptNameDiagnosticCode;
  readonly message: string;
  /** The name as written. */
  readonly name: string;
  /** The effect the name is the value of. */
  readonly key: string;
}

/** Members of an idea group block that are not ideas. */
const IDEA_GROUP_MEMBERS: ReadonlySet<string> = new Set([
  'start',
  'bonus',
  'trigger',
  'ai_will_do',
]);

/**
 * Adds the idea groups and ideas of one `common/ideas` file: each top-level block is an idea group
 * (the game keeps its name as written and compares it byte for byte), and each of its blocks other than `start`, `bonus`,
 * `trigger` and `ai_will_do` is an idea.
 */
export function readIdeaNames(
  parsed: ParsedScript,
  into: { ideaGroups: Set<string>; ideas: Set<string> },
): void {
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'block') continue;
    into.ideaGroups.add(entry.key.text);
    for (const member of entry.value.entries) {
      if (member.kind !== 'property' || member.value?.kind !== 'block') continue;
      if (IDEA_GROUP_MEMBERS.has(member.key.text.toLowerCase())) continue;
      into.ideas.add(member.key.text);
    }
  }
}

/**
 * The names in a parsed script file that the playset does not define, in text order. A value with
 * a `$` is a scripted effect's argument, filled in where the effect is called, and is skipped.
 */
export function checkScriptNames(parsed: ParsedScript, names: ScriptNames): ScriptNameDiagnostic[] {
  const found: ScriptNameDiagnostic[] = [];
  walk(parsed.entries, names, found);
  return found;
}

function walk(
  entries: readonly EntryNode[],
  names: ScriptNames,
  found: ScriptNameDiagnostic[],
): void {
  for (const entry of entries) {
    if (entry.kind === 'block') {
      walk(entry.entries, names, found);
      continue;
    }
    if (entry.kind !== 'property') continue;
    const value = entry.value;
    if (value?.kind === 'block') {
      walk(value.entries, names, found);
      continue;
    }
    if (value?.kind !== 'scalar') continue;
    const key = entry.key.text.toLowerCase();
    const kind = SCRIPT_NAME_KEYS.get(key);
    if (kind === undefined) continue;
    const problem = check(value, key, kind, names);
    if (problem !== undefined) found.push(problem);
  }
}

function check(
  scalar: ScalarNode,
  key: string,
  kind: ScriptNameKind,
  names: ScriptNames,
): ScriptNameDiagnostic | undefined {
  const name = scalar.text;
  if (name === '' || name.includes('$')) return undefined;
  const known = kind === 'idea-group' ? names.ideaGroups : names.ideas;
  if (known.has(name)) return undefined;
  const what = kind === 'idea-group' ? 'idea group' : 'idea';
  return {
    severity: 'warning',
    code: kind === 'idea-group' ? 'unknown-idea-group' : 'unknown-idea',
    message:
      `No ${what} '${name}' in ${names.source} (names are case-sensitive). The game does not ` +
      `check ${key}'s ${what} or report it in error.log: it crashes when the effect runs or ` +
      'its tooltip is shown.',
    name,
    key,
    start: scalar.start,
    end: scalar.end,
  };
}
