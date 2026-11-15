/**
 * A profile skeleton for a window's scripted widgets (after-v2.md, "Deriving scripted groups"):
 * each widget of the window that a `common/custom_gui` entry gives a `potential` gets a `scripted`
 * selector, shown or hidden, and a rule that hides it when hidden. Etch never evaluates the
 * trigger: the selector is set by hand or by a view, and its note quotes the `potential`.
 *
 * Two kinds of `potential` are read further. `always = yes` and `always = no` are constant: the
 * widget gets no selector, and with `no` a rule that always hides it. Widgets whose `potential` is
 * one test of the same single-valued trigger (`religion = …`, `tag = …`) against different values
 * exclude each other: they share one selector with a value per tested value and `other`. Widgets
 * with the same `potential` show together: they share one selector and one rule.
 */
import type { Widget } from '../model/gui.ts';
import { parseScript, type BlockNode, type EntryNode } from '../script/index.ts';
import { withMembers } from './edit.ts';
import { windowPaths } from './paths.ts';

/** A `custom_…` entry of `common/custom_gui` with a `potential`. */
export interface CustomGuiEntry {
  /** The widget name it scripts, as written. */
  readonly name: string;
  /** `custom_button`, `custom_icon`, `custom_window`, … as written. */
  readonly type: string;
  /** The game-relative file it is in. */
  readonly file: string;
  /** The `potential` block's text, on one line, cut after {@link POTENTIAL_CHARS} characters. */
  readonly potential: string;
  /**
   * The whole `potential` block's text, on one line with one space around `=`, `<`, `>` and the
   * braces: two entries with the same condition are shown and hidden together.
   */
  readonly condition: string;
  /** The `potential`'s only test, when it holds one `key = value` with a word for its value. */
  readonly test?: { readonly key: string; readonly value: string };
  /** The localisation key of its `tooltip`, when it has one. */
  readonly tooltip?: string;
}

/** How much of a tooltip's text a selector's label shows. */
export const LABEL_TEXT_CHARS = 60;

/**
 * A localised text as a short plain label: icons (`£…£`), colour codes (`§Y`, `§!`), variables
 * (`$…$`), scripted text (`[…]`) and rules drawn with `-----` dropped, lines joined and the
 * result cut with `…`.
 * `undefined` when nothing readable is left.
 */
export function plainLabelText(text: string): string | undefined {
  const plain = text
    .replace(/£[^£\s]*£?/g, ' ')
    .replace(/§[A-Za-z0-9!]/g, '')
    .replace(/\$[^$]*\$/g, '…')
    .replace(/\[[^\]]*\]/g, '…')
    .replace(/\\n|[\r\n]+/g, ' ')
    // Rules drawn with characters (`-----`, `=====`).
    .replace(/([-=_*~.])\1{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[\p{L}\p{N}]/u.test(plain)) return undefined;
  return plain.length <= LABEL_TEXT_CHARS
    ? plain
    : `${plain.slice(0, LABEL_TEXT_CHARS - 1).trimEnd()}…`;
}

/** How much of a `potential` a selector's note quotes. */
export const POTENTIAL_CHARS = 160;

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

function blockOf(block: BlockNode, key: string): BlockNode | undefined {
  for (const entry of block.entries) {
    if (
      entry.kind === 'property' &&
      entry.key.text.toLowerCase() === key &&
      entry.value?.kind === 'block'
    ) {
      return entry.value;
    }
  }
  return undefined;
}

/** A block's text on one line: comments dropped, spaces collapsed, cut with `…`. */
function oneLine(text: string): string {
  const flat = text
    .replace(/#[^\r\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length <= POTENTIAL_CHARS ? flat : `${flat.slice(0, POTENTIAL_CHARS - 1).trimEnd()}…`;
}

/** A block's text as a condition to compare: comments dropped, one space between tokens. */
function conditionOf(text: string): string {
  return text
    .replace(/#[^\r\n]*/g, ' ')
    .replace(/([{}=<>])/g, ' $1 ')
    .replace(/<\s+=/g, '<=')
    .replace(/>\s+=/g, '>=')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A block's only entry when it is `key = word`, the key in lower case. */
function onlyTest(block: BlockNode): { key: string; value: string } | undefined {
  const [entry, ...rest] = block.entries;
  if (entry?.kind !== 'property' || rest.length > 0) return undefined;
  if (entry.operator !== undefined && entry.operator.text !== '=') return undefined;
  if (entry.value?.kind !== 'scalar') return undefined;
  return { key: entry.key.text.toLowerCase(), value: entry.value.text };
}

/** The `custom_…` entries of one `common/custom_gui` file that have a `potential`. */
export function readCustomGui(text: string, file: string): CustomGuiEntry[] {
  const found: CustomGuiEntry[] = [];
  const visit = (entries: readonly EntryNode[]): void => {
    for (const entry of entries) {
      if (entry.kind !== 'property' || entry.value?.kind !== 'block') continue;
      const type = entry.key.text;
      if (!type.toLowerCase().startsWith('custom_')) continue;
      const name = scalarOf(entry.value, 'name');
      const potential = blockOf(entry.value, 'potential');
      if (name === undefined || name === '' || potential === undefined) continue;
      const test = onlyTest(potential);
      const tooltip = scalarOf(entry.value, 'tooltip');
      found.push({
        name,
        type,
        file,
        potential: `potential = ${oneLine(text.slice(potential.start, potential.end))}`,
        condition: conditionOf(text.slice(potential.start, potential.end)),
        ...(test === undefined ? {} : { test }),
        ...(tooltip === undefined || tooltip === '' ? {} : { tooltip }),
      });
    }
  };
  visit(parseScript(text).entries);
  return found;
}

/** A selector and its rules, which go into a profile together or not at all. */
export interface SkeletonPart {
  /** The selector's id; none for a constant `potential`. */
  readonly selector?: string;
  readonly rules: readonly string[];
}

/** A selector and a rule of the skeleton, as the profile file writes them. */
export interface SkeletonEntries {
  readonly selectors: readonly (readonly [string, unknown])[];
  readonly rules: readonly (readonly [string, unknown])[];
  readonly parts: readonly SkeletonPart[];
  /** Scripted widget names whose `potential` is `always = yes`: always shown, so left out. */
  readonly alwaysShown: readonly string[];
}

/**
 * Triggers that hold for one value at a time in their scope, so two `potential`s testing one of
 * them against different values never hold together.
 */
export const SINGLE_VALUED_TRIGGERS: ReadonlySet<string> = new Set([
  'tag',
  'religion',
  'religion_group',
  'government',
  'primary_culture',
  'culture_group',
  'technology_group',
  'is_subject_of_type',
]);

/** Words that name a scope rather than a value: a test against one compares two scopes. */
const SCOPE_WORDS = /^(root|from|prev|this|owner|controller|capital|emperor|overlord)$/i;

/** The selector value id of a tested value. */
function valueId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, '-');
}

/** How many names a shared selector's note lists before it counts the rest. */
const LISTED_NAMES = 8;

/** Names for a note: the first {@link LISTED_NAMES}, then how many more. */
function listedNames(names: readonly string[]): string {
  if (names.length <= LISTED_NAMES) return names.join(', ');
  return `${names.slice(0, LISTED_NAMES).join(', ')} and ${String(names.length - LISTED_NAMES)} more`;
}

/** The label of a selector that widgets with one condition share. */
function sharedLabel(names: readonly string[]): string {
  const [first, second] = names;
  if (names.length === 2) return `${first ?? ''}, ${second ?? ''}`;
  return `${first ?? ''} and ${String(names.length - 1)} more`;
}

/** The selector id of a scripted widget: its name in lower case, `-` for anything but a–z, 0–9, `_`. */
export function scriptedSelectorId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]+/g, '-');
}

/**
 * The skeleton's selectors and rules for a window: one per scripted widget name found in the
 * window (below its top), the later entry winning when the playset scripts a name twice, as a
 * later file wins in the game. Each rule hides every widget of that name. A constant `potential`
 * gets no selector, widgets testing one single-valued trigger share one (the file's top), and so
 * do widgets with the same condition (the first one's id). A widget whose own id is in
 * `lowerSelectors` (a lower layer's profile already has its selector) shares with none, so that
 * its part is the one the lower layer has.
 */
export function scriptedSkeleton(
  window: Widget,
  entries: readonly CustomGuiEntry[],
  localise?: (key: string) => string | undefined,
  lowerSelectors: ReadonlySet<string> = new Set(),
): SkeletonEntries {
  // A widget's label: its name, and the playset's text of its tooltip when it has one.
  const labelOf = (entry: CustomGuiEntry): string => {
    const text = entry.tooltip === undefined ? undefined : localise?.(entry.tooltip);
    const plain = text === undefined ? undefined : plainLabelText(text);
    return plain === undefined ? entry.name : `${entry.name}: ${plain}`;
  };
  const byName = new Map<string, CustomGuiEntry>();
  for (const entry of entries) byName.set(entry.name.toLowerCase(), entry);
  const paths = new Map<string, string[]>();
  for (const { widget, path, parent } of windowPaths(window)) {
    if (parent < 0 || widget.name === undefined) continue;
    const key = widget.name.toLowerCase();
    if (!byName.has(key)) continue;
    paths.set(key, [...(paths.get(key) ?? []), path]);
  }
  const found = [...paths].flatMap(([key, hidden]) => {
    const entry = byName.get(key);
    return entry === undefined ? [] : [{ entry, hidden }];
  });

  // The single-valued triggers this window's widgets test against two or more values.
  const exclusiveTest = (entry: CustomGuiEntry): CustomGuiEntry['test'] => {
    const test = entry.test;
    if (test === undefined || !SINGLE_VALUED_TRIGGERS.has(test.key)) return undefined;
    return SCOPE_WORDS.test(test.value) || test.value.includes(':') ? undefined : test;
  };
  const tested = new Map<string, Set<string>>();
  for (const { entry } of found) {
    const test = exclusiveTest(entry);
    if (test === undefined) continue;
    tested.set(test.key, (tested.get(test.key) ?? new Set<string>()).add(valueId(test.value)));
  }
  const groupOf = (entry: CustomGuiEntry): string | undefined => {
    const key = exclusiveTest(entry)?.key;
    if (key === undefined) return undefined;
    return (tested.get(key)?.size ?? 0) > 1 ? key : undefined;
  };

  // Names that give one id (`my.icon`, `my-icon`) get `-2`, `-3`… after the first, so that each
  // keeps a selector and a rule of its own. The groups' ids (`scripted-<key>`) are taken first, so
  // a widget named `scripted.tag` does not share the selector of the `tag` group.
  const used = new Set<string>();
  for (const { entry } of found) {
    const key = groupOf(entry);
    if (key !== undefined) used.add(`scripted-${scriptedSelectorId(key)}`);
  }
  const uniqueId = (name: string): string => {
    const base = scriptedSelectorId(name);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${String(n)}`;
    used.add(id);
    return id;
  };
  const selectors: [string, unknown][] = [];
  const rules: [string, unknown][] = [];
  const parts: SkeletonPart[] = [];
  const alwaysShown: string[] = [];
  const groups = new Map<string, { entry: CustomGuiEntry; hidden: string[] }[]>();
  const constant = (entry: CustomGuiEntry): string | undefined =>
    entry.test?.key === 'always' ? entry.test.value.toLowerCase() : undefined;
  // Widgets with the same condition, neither constant nor in a group: one selector for them all.
  // A widget a lower layer already gives a selector keeps its own, or the shared rule would hide
  // it a second time under another id.
  const ownSelector = (entry: CustomGuiEntry): boolean =>
    lowerSelectors.has(scriptedSelectorId(entry.name));
  const sharing = new Map<string, { entry: CustomGuiEntry; hidden: string[] }[]>();
  for (const member of found) {
    const always = constant(member.entry);
    if (always === 'yes' || always === 'no' || groupOf(member.entry) !== undefined) continue;
    if (ownSelector(member.entry)) continue;
    const key = member.entry.condition;
    sharing.set(key, [...(sharing.get(key) ?? []), member]);
  }
  for (const { entry, hidden } of found) {
    const always = constant(entry);
    if (always === 'yes') {
      alwaysShown.push(entry.name);
      continue;
    }
    if (always === 'no') {
      const id = uniqueId(entry.name);
      const note = `${entry.file}, ${entry.type}: ${entry.potential}: the game never shows it`;
      rules.push([`${id}-never`, { note, hide: hidden }]);
      parts.push({ rules: [`${id}-never`] });
      continue;
    }
    const group = groupOf(entry);
    if (group !== undefined) {
      groups.set(group, [...(groups.get(group) ?? []), { entry, hidden }]);
      continue;
    }
    const members = ownSelector(entry)
      ? [{ entry, hidden }]
      : (sharing.get(entry.condition) ?? [{ entry, hidden }]);
    // The first widget of a shared condition stands for the others.
    if (members[0]?.entry !== entry) continue;
    const id = uniqueId(entry.name);
    const shared = members.length > 1;
    const names = members.map((member) => member.entry.name);
    parts.push({ selector: id, rules: [`${id}-hidden`] });
    selectors.push([
      id,
      {
        kind: 'scripted',
        label: shared ? sharedLabel(names) : labelOf(entry),
        values: { shown: 'Shown', hidden: 'Hidden' },
        note: shared
          ? `${entry.file}, ${entry.type}: ${entry.potential}: the same potential as ` +
            `${listedNames(names.slice(1))}, so they show together`
          : `${entry.file}, ${entry.type}: ${entry.potential}`,
      },
    ]);
    rules.push([
      `${id}-hidden`,
      { when: { [id]: 'hidden' }, hide: members.flatMap((member) => member.hidden) },
    ]);
  }

  for (const [key, members] of groups) {
    const id = `scripted-${scriptedSelectorId(key)}`;
    const values: Record<string, string> = {};
    const hiddenOf = new Map<string, string[]>();
    for (const { entry, hidden } of members) {
      const value = entry.test?.value ?? '';
      // Religions, cultures, tags… are localisation keys of their names.
      const text = localise?.(value);
      values[valueId(value)] = (text === undefined ? undefined : plainLabelText(text)) ?? value;
      hiddenOf.set(valueId(value), [...(hiddenOf.get(valueId(value)) ?? []), ...hidden]);
    }
    values['other' in values ? 'another' : 'other'] = `Another ${key}`;
    const names = members.map(({ entry }) => entry.name).join(', ');
    selectors.push([
      id,
      {
        kind: 'scripted',
        label: `${key} (scripted)`,
        values,
        note: `${names} test ${key} against one value each, so at most one of them shows`,
      },
    ]);
    const ruleIds = [...hiddenOf.keys()].map((value) => `${id}-${value}`);
    for (const [value, hidden] of hiddenOf) {
      const others = Object.keys(values).filter((v) => v !== value);
      rules.push([`${id}-${value}`, { when: { [id]: others }, hide: hidden }]);
    }
    parts.push({ selector: id, rules: ruleIds });
  }
  return { selectors, rules, parts, alwaysShown };
}

/** What {@link withSkeleton} did: the new text, and the ids it added and the ones it left alone. */
export interface AddedSkeleton {
  readonly text: string;
  readonly selectors: readonly string[];
  readonly rules: readonly string[];
  /** Ids the file already had, selectors and rules, left as written. */
  readonly kept: readonly string[];
}

/**
 * The text of a profile file with a skeleton's selectors and rules added (a new file when `text`
 * is `undefined`). What the file already has is kept as written, and so is a selector's meaning:
 * the rules of a part whose selector the file already had are not added, since that selector's
 * values may not be the ones they test; those it already has count as kept. Throws when the file
 * is not JSONC.
 */
export function withSkeleton(
  text: string | undefined,
  window: string,
  skeleton: SkeletonEntries,
): AddedSkeleton {
  const selectors = withMembers(text, window, 'selectors', skeleton.selectors);
  const own = new Set(selectors.kept);
  const ofOwn = new Set(
    skeleton.parts
      .filter((part) => part.selector !== undefined && own.has(part.selector))
      .flatMap((part) => part.rules),
  );
  const rules = withMembers(
    selectors.text,
    window,
    'rules',
    skeleton.rules.filter(([id]) => !ofOwn.has(id)),
  );
  // Only its `kept` is used: the rules of the file's own selectors that it already has.
  const ownRules = withMembers(
    selectors.text,
    window,
    'rules',
    skeleton.rules.filter(([id]) => ofOwn.has(id)),
  );
  return {
    text: rules.text,
    selectors: selectors.added,
    rules: rules.added,
    kept: [...selectors.kept, ...rules.kept, ...ownRules.kept],
  };
}
