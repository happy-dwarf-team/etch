/**
 * A profile skeleton for a window's scripted widgets (after-v2.md, "Deriving scripted groups"):
 * each widget of the window that a `common/custom_gui` entry gives a `potential` gets a `scripted`
 * selector, shown or hidden, and a rule that hides it when hidden. Etch never evaluates the
 * trigger: the selector is set by hand or by a view, and its note quotes the `potential`.
 */
import type { Widget } from '../model/gui.ts';
import { parseScript, type BlockNode, type EntryNode } from '../script/index.ts';
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
      found.push({
        name,
        type,
        file,
        potential: `potential = ${oneLine(text.slice(potential.start, potential.end))}`,
      });
    }
  };
  visit(parseScript(text).entries);
  return found;
}

/** A selector and a rule of the skeleton, as the profile file writes them. */
export interface SkeletonEntries {
  readonly selectors: readonly (readonly [string, unknown])[];
  readonly rules: readonly (readonly [string, unknown])[];
}

/** The selector id of a scripted widget: its name in lower case, `-` for anything but a–z, 0–9, `_`. */
export function scriptedSelectorId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]+/g, '-');
}

/**
 * The skeleton's selectors and rules for a window: one per scripted widget name found in the
 * window (below its top), the later entry winning when the playset scripts a name twice, as a
 * later file wins in the game. Each rule hides every widget of that name.
 */
export function scriptedSkeleton(
  window: Widget,
  entries: readonly CustomGuiEntry[],
): SkeletonEntries {
  const byName = new Map<string, CustomGuiEntry>();
  for (const entry of entries) byName.set(entry.name.toLowerCase(), entry);
  const paths = new Map<string, string[]>();
  for (const { widget, path, parent } of windowPaths(window)) {
    if (parent < 0 || widget.name === undefined) continue;
    const key = widget.name.toLowerCase();
    if (!byName.has(key)) continue;
    paths.set(key, [...(paths.get(key) ?? []), path]);
  }
  const selectors: [string, unknown][] = [];
  const rules: [string, unknown][] = [];
  for (const [key, hidden] of paths) {
    const entry = byName.get(key);
    if (entry === undefined) continue;
    const id = scriptedSelectorId(entry.name);
    selectors.push([
      id,
      {
        kind: 'scripted',
        label: entry.name,
        values: { shown: 'Shown', hidden: 'Hidden' },
        note: `${entry.file}, ${entry.type}: ${entry.potential}`,
      },
    ]);
    rules.push([`${id}-hidden`, { when: { [id]: 'hidden' }, hide: hidden }]);
  }
  return { selectors, rules };
}
