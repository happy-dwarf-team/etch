// A government mechanic's windows in the government view. `common/government_mechanics` names them
// with `gui`, and the game's code puts them in `specific_governments_list`; no `.gui` file says
// where. So a mechanic's window has no place of its own: its negative positions count from its row
// of that list. Everything here is read from eu4.exe 1.37.5 (RVAs below) and measured in the game
// (docs/government-mechanics.md).

import { widgetProperties, type GuiFile, type Screen, type Widget } from '../model/gui.ts';
import type { InterfaceIndex } from '../model/interface-index.ts';
import { parseScript, type BlockNode, type EntryNode, type PropertyNode } from '../script/index.ts';
import type { LayoutContent, LayoutView, ListEntry } from './window.ts';

/** The window that shows the mechanics, and the list in it. */
export const MECHANICS_WINDOW = 'countrygovernmentview';
const MECHANICS_LIST = 'specific_governments_list';
const MECHANICS_LIST_POSITION = 'specific_governments_list_position';
/** The row that holds a mechanic's interactions, and its own list of them. */
const INTERACTIONS_ROW = 'government_mechanic_interactions';
const INTERACTIONS_LIST = 'government_interaction_list';
/** What a power or an interaction without a `gui` shows. */
const DEFAULT_POWER = 'government_shared_power';
const DEFAULT_INTERACTION = 'government_interaction_type';
/** The widgets of an interaction's window that the game's code changes. */
const INTERACTION_BUTTON = 'government_interaction_button';
const POWER_BAR = 'government_power_bar';
const POWER_BAR_FRAME = 'government_power_bar_frame';
/** Interactions to a row (0x13B5B60). */
const INTERACTIONS_PER_ROW = 3;

export interface MechanicPower {
  readonly name: string;
  /** The definition of its row; without one, the game's `government_shared_power`. */
  readonly gui: string | undefined;
  /** Its row goes above the interactions, not below them. */
  readonly showBeforeInteractions: boolean;
}

export interface MechanicInteraction {
  readonly name: string;
  /** The definition of its window; without one, the game's `government_interaction_type`. */
  readonly gui: string | undefined;
  /** The sprite its button shows in place of the `.gui` one. */
  readonly icon: string | undefined;
  /** The power it costs, by name. */
  readonly costType: string | undefined;
  /** The game's code centres its button in its window, unless `center = no`. */
  readonly center: boolean;
}

export interface GovernmentMechanic {
  readonly name: string;
  readonly powers: readonly MechanicPower[];
  readonly interactions: readonly MechanicInteraction[];
  /** The government reforms its `available` names: the country that has it has one of these. */
  readonly reforms: readonly string[];
  /** Its `available` holds for every player's country: nothing, `ai = no` or `always = yes`. */
  readonly everyPlayer: boolean;
}

/** A `custom_icon`, `custom_window` and the like of `common/custom_gui`: a `scripted` widget. */
export interface ScriptedWidget {
  readonly name: string;
  readonly potential: BlockNode | undefined;
}

/** The mechanics of one `common/government_mechanics` file. */
export function readGovernmentMechanics(text: string): GovernmentMechanic[] {
  const mechanics: GovernmentMechanic[] = [];
  for (const entry of parseScript(text).entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'block') continue;
    const body = entry.value;
    mechanics.push({
      name: entry.key.text,
      powers: blocksIn(body, 'powers').map(({ key, block }) => ({
        name: key,
        gui: scalar(block, 'gui'),
        showBeforeInteractions: scalar(block, 'show_before_interactions') === 'yes',
      })),
      interactions: blocksIn(body, 'interactions').map(({ key, block }) => ({
        name: key,
        gui: scalar(block, 'gui'),
        icon: scalar(block, 'icon'),
        costType: scalar(block, 'cost_type'),
        center: scalar(block, 'center') !== 'no',
      })),
      reforms: reformsIn(block(body, 'available')),
      everyPlayer: allOf(block(body, 'available')?.entries ?? [], NO_NAMES, NO_NAMES) === true,
    });
  }
  return mechanics;
}

/**
 * The mechanics the basic reforms of one `common/government_reforms` file give: every country has
 * a basic reform, so these are in its list whatever else it has (Anbennar's
 * `anb_dummy_hold_mechanic`, whose 12 rows of 1 px move a player's other mechanics).
 */
export function readBasicAbilities(text: string): string[] {
  const abilities: string[] = [];
  for (const entry of parseScript(text).entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'block') continue;
    if (scalar(entry.value, 'basic_reform') !== 'yes') continue;
    for (const ability of block(entry.value, 'government_abilities')?.entries ?? []) {
      if (ability.kind === 'scalar') abilities.push(ability.text);
    }
  }
  return abilities;
}

/** The `scripted` widgets of one `common/custom_gui` file. */
export function readScriptedWidgets(text: string): ScriptedWidget[] {
  const widgets: ScriptedWidget[] = [];
  for (const entry of parseScript(text).entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'block') continue;
    if (!entry.key.text.toLowerCase().startsWith('custom_')) continue;
    const name = scalar(entry.value, 'name');
    if (name !== undefined) widgets.push({ name, potential: block(entry.value, 'potential') });
  }
  return widgets;
}

/** One row of `specific_governments_list`. */
export type MechanicRow =
  | { readonly kind: 'power'; readonly power: MechanicPower }
  | { readonly kind: 'interactions'; readonly interactions: readonly MechanicInteraction[] };

/**
 * The rows a mechanic adds to the list, from the top (0x13B5B60, 0x13B62A0): the powers
 * `show_before_interactions` puts first, the interactions three to a row, then the other powers.
 * A power one interaction alone costs has no row: it shows in that interaction's window. Powers
 * come in the order of a hash table in the game; here in file order, which only a mechanic with
 * several such powers can tell apart.
 */
export function mechanicRows(mechanic: GovernmentMechanic): MechanicRow[] {
  const ownRow = (power: MechanicPower): boolean =>
    mechanic.interactions.filter((i) => i.costType === power.name).length !== 1;
  const powers = (before: boolean): MechanicRow[] =>
    mechanic.powers
      .filter((power) => power.showBeforeInteractions === before && ownRow(power))
      .map((power) => ({ kind: 'power', power }));
  const interactions: MechanicRow[] = [];
  for (let i = 0; i < mechanic.interactions.length; i += INTERACTIONS_PER_ROW) {
    interactions.push({
      kind: 'interactions',
      interactions: mechanic.interactions.slice(i, i + INTERACTIONS_PER_ROW),
    });
  }
  return [...powers(true), ...interactions, ...powers(false)];
}

/** The mechanic that shows a definition in the government view, if the game shows it at all. */
export function mechanicShowing(
  mechanics: readonly GovernmentMechanic[],
  definition: string,
): GovernmentMechanic | undefined {
  const name = definition.toLowerCase();
  return mechanics.find((mechanic) =>
    mechanicRows(mechanic).some((row) =>
      row.kind === 'power'
        ? row.power.gui?.toLowerCase() === name
        : row.interactions.some((i) => i.gui?.toLowerCase() === name),
    ),
  );
}

/** What {@link withMechanics} needs to know of the playset. */
export interface MechanicsInput {
  /** The mechanics the country has, in the list's order. */
  readonly mechanics: readonly GovernmentMechanic[];
  readonly scripted: readonly ScriptedWidget[];
  readonly index: InterfaceIndex;
  readonly screen: Screen;
}

interface Definition {
  readonly template: Widget;
  readonly file: GuiFile;
}

/** What the game's code decides of one entry, by the number {@link ListEntry} gives it. */
interface EntryState {
  readonly interaction?: MechanicInteraction;
  /** Whether its window shows the bar of the power it costs (0x13B3E90). */
  readonly ownBar?: boolean;
  readonly entries?: readonly ListEntry[];
}

/**
 * The government view with the rows of a country's mechanics: its list filled and placed as the
 * game's code does it, and the `scripted` widgets those mechanics decide shown or hidden. `null`
 * when the playset has no such list.
 */
export function withMechanics(
  input: MechanicsInput,
  view: LayoutView,
  content: LayoutContent | undefined,
): { readonly view: LayoutView; readonly content: LayoutContent } | null {
  const host = definition(input.index, MECHANICS_WINDOW);
  const list = host === undefined ? undefined : findWidget(host.template, MECHANICS_LIST);
  if (host === undefined || list === undefined) return null;

  const states = new Map<number, EntryState>();
  let next = 0;
  const rows: ListEntry[] = [];
  const heightOf = (found: Definition): number =>
    widgetProperties(found.template, found.file.constants, input.screen).size('size')?.height
      .value ?? 0;
  for (const mechanic of input.mechanics) {
    for (const row of mechanicRows(mechanic)) {
      if (row.kind === 'power') {
        const found = definition(input.index, row.power.gui ?? DEFAULT_POWER);
        if (found === undefined) continue;
        const number = next++;
        states.set(number, {});
        rows.push({ ...found, row: number, height: heightOf(found) });
        continue;
      }
      const found = definition(input.index, INTERACTIONS_ROW);
      if (found === undefined) continue;
      const number = next++;
      const entries: ListEntry[] = [];
      let tallest = 0;
      for (const interaction of row.interactions) {
        const window = definition(input.index, interaction.gui ?? DEFAULT_INTERACTION);
        if (window === undefined) continue;
        tallest = Math.max(tallest, heightOf(window));
        const own = next++;
        entries.push({ ...window, row: own });
        states.set(own, {
          interaction,
          ownBar:
            interaction.costType !== undefined &&
            mechanic.interactions.filter((i) => i.costType === interaction.costType).length === 1,
        });
      }
      states.set(number, { entries });
      rows.push({ ...found, row: number, height: tallest });
    }
  }

  const total = rows.reduce((sum, row) => sum + (row.height ?? 0), 0);
  const room =
    widgetProperties(list, host.file.constants, input.screen).size('size')?.height.value ?? 0;
  // 0x13B54A0: at its `positionType`, and when its rows do not fill it, centred in its height.
  const centring = total < room ? Math.trunc(room / 2) - Math.trunc(total / 2) : 0;
  const decided = decideScripted(input.mechanics, input.scripted);
  const decidedOf = (widget: Widget): boolean | undefined =>
    widget.name === undefined ? undefined : decided.get(widget.name.toLowerCase());

  return {
    view: {
      ...view,
      shows: (widget) => decidedOf(widget) ?? view.shows(widget),
      movedTo: (widget) => (widget === list ? MECHANICS_LIST_POSITION : view.movedTo(widget)),
      movedAxis: (widget) => (widget === list ? undefined : view.movedAxis?.(widget)),
      offset: (widget) => (widget === list ? { x: 0, y: centring } : view.offset?.(widget)),
    },
    content: {
      text: (widget, row) => content?.text(widget, row),
      rows: (widget) => content?.rows(widget),
      state: (widget, row) => {
        const own = row === undefined ? undefined : states.get(row);
        if (own?.interaction !== undefined && isPowerBar(widget)) {
          return { visible: own.ownBar === true, enabled: true, checked: false };
        }
        return content?.state?.(widget, row);
      },
      adopted: (widget, row) => content?.adopted?.(widget, row) ?? [],
      entries: (widget, row) => {
        if (widget === list) return rows;
        if (row === undefined || !sameName(widget, INTERACTIONS_LIST)) return undefined;
        return states.get(row)?.entries;
      },
      sprite: (widget, row) =>
        row !== undefined && sameName(widget, INTERACTION_BUTTON)
          ? states.get(row)?.interaction?.icon
          : undefined,
      centred: (widget, row) =>
        row !== undefined &&
        sameName(widget, INTERACTION_BUTTON) &&
        states.get(row)?.interaction?.center === true,
    },
  };
}

function isPowerBar(widget: Widget): boolean {
  return sameName(widget, POWER_BAR) || sameName(widget, POWER_BAR_FRAME);
}

function sameName(widget: Widget, name: string): boolean {
  return widget.name?.toLowerCase() === name;
}

function definition(index: InterfaceIndex, name: string): Definition | undefined {
  const found = index.guiType(name);
  const file = found === undefined ? undefined : index.guiFiles.find((f) => f.path === found.path);
  return found === undefined || file === undefined
    ? undefined
    : { template: found.item, file: file.file };
}

function findWidget(window: Widget, name: string): Widget | undefined {
  for (const child of window.children) {
    if (sameName(child, name)) return child;
    const found = findWidget(child, name);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The `scripted` widgets the mechanics decide, by lower-case name. Etch does not evaluate triggers
 * in general: this reads only what a mechanic answers (which mechanics and reforms the country
 * has, and that it is a player's), and a potential with anything else stays undecided.
 */
function decideScripted(
  mechanics: readonly GovernmentMechanic[],
  scripted: readonly ScriptedWidget[],
): ReadonlyMap<string, boolean> {
  const names = new Set(mechanics.map((m) => m.name.toLowerCase()));
  const reforms = new Set(mechanics.flatMap((m) => m.reforms.map((r) => r.toLowerCase())));
  const decided = new Map<string, boolean>();
  for (const widget of scripted) {
    if (widget.potential === undefined) continue;
    const holds = allOf(widget.potential.entries, names, reforms);
    if (holds !== undefined) decided.set(widget.name.toLowerCase(), holds);
  }
  return decided;
}

const NO_NAMES: ReadonlySet<string> = new Set();

function allOf(
  entries: readonly EntryNode[],
  names: ReadonlySet<string>,
  reforms: ReadonlySet<string>,
): boolean | undefined {
  const results = entries.map((entry) => holds(entry, names, reforms));
  if (results.includes(false)) return false;
  return results.includes(undefined) ? undefined : true;
}

function anyOf(
  entries: readonly EntryNode[],
  names: ReadonlySet<string>,
  reforms: ReadonlySet<string>,
): boolean | undefined {
  const results = entries.map((entry) => holds(entry, names, reforms));
  if (results.includes(true)) return true;
  return results.includes(undefined) ? undefined : false;
}

function holds(
  entry: EntryNode,
  names: ReadonlySet<string>,
  reforms: ReadonlySet<string>,
): boolean | undefined {
  if (entry.kind !== 'property' || entry.value === undefined) return undefined;
  const key = entry.key.text.toLowerCase();
  if (entry.value.kind === 'block') {
    const { entries } = entry.value;
    if (key === 'and') return allOf(entries, names, reforms);
    if (key === 'or') return anyOf(entries, names, reforms);
    if (key === 'not') {
      const any = anyOf(entries, names, reforms);
      return any === undefined ? undefined : !any;
    }
    return undefined;
  }
  const value = entry.value.text.toLowerCase();
  if (key === 'always') return value === 'yes';
  if (key === 'ai') return value === 'no';
  if (key === 'has_government_mechanic') return names.has(value);
  if (key === 'has_reform') return reforms.size === 0 ? undefined : reforms.has(value);
  return undefined;
}

function reformsIn(available: BlockNode | undefined): string[] {
  if (available === undefined) return [];
  const reforms: string[] = [];
  const walk = (entries: readonly EntryNode[]): void => {
    for (const entry of entries) {
      if (entry.kind !== 'property' || entry.value === undefined) continue;
      if (entry.value.kind === 'block') {
        if (entry.key.text.toLowerCase() !== 'not') walk(entry.value.entries);
      } else if (entry.key.text.toLowerCase() === 'has_reform') {
        reforms.push(entry.value.text);
      }
    }
  };
  walk(available.entries);
  return reforms;
}

function property(body: BlockNode, key: string): PropertyNode | undefined {
  const lower = key.toLowerCase();
  return body.entries.find(
    (entry): entry is PropertyNode =>
      entry.kind === 'property' && entry.key.text.toLowerCase() === lower,
  );
}

function scalar(body: BlockNode, key: string): string | undefined {
  const value = property(body, key)?.value;
  return value?.kind === 'scalar' ? value.text : undefined;
}

function block(body: BlockNode, key: string): BlockNode | undefined {
  const value = property(body, key)?.value;
  return value?.kind === 'block' ? value : undefined;
}

function blocksIn(
  body: BlockNode,
  key: string,
): readonly { readonly key: string; readonly block: BlockNode }[] {
  const out: { key: string; block: BlockNode }[] = [];
  for (const entry of block(body, key)?.entries ?? []) {
    if (entry.kind === 'property' && entry.value?.kind === 'block') {
      out.push({ key: entry.key.text, block: entry.value });
    }
  }
  return out;
}
