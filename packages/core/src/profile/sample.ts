/**
 * Sample data (spec section 5, etch#159): the text each code-filled widget of a profiled window
 * shows, from the layers of `Data ▾`, upper ones winning:
 *
 * 0. **hand**: a text the user typed for a widget, by its path, any text of the window;
 * 1. **live**: a live snapshot (M9), by widget path, when it is on;
 * 2. **save**: the chosen save, country and province, through the profile's `save` sources;
 * 3. **files**: the playset's localisation, for `loc` sources and the `localise` transform;
 * 4. **generated**: text, numbers, percentages and dates of a chosen length.
 *
 * A value a layer lacks falls through to the next; Etch never computes one the way the engine
 * would (spec section 1). Repeaters fill list boxes with entries of a template: one per child of
 * a save collection, or `count` generated entries without a save; the user can set the number of
 * entries of each, the save's first.
 */
import type { LayoutContent } from '../layout/window.ts';
import type { GuiFile, Widget } from '../model/gui.ts';
import { scalarIn, valueIn } from '../save/save.ts';
import type { ContentSource, GeneratedKind, Link, Placement, WindowProfile } from './format.ts';
import { widgetsAt, windowPaths } from './paths.ts';
import { readSavePath, type RepeaterEntry, type SaveChoice } from './save-paths.ts';
import type { WindowView } from './view.ts';

export type DataLayer = 'hand' | 'live' | 'save' | 'files' | 'generated';

export const DATA_LAYERS: readonly DataLayer[] = ['hand', 'live', 'save', 'files', 'generated'];

/** The generated layer's lengths: `typical` by default, `overflow` to test what does not fit. */
export type TextLength = 'short' | 'typical' | 'long' | 'overflow';

export const TEXT_LENGTHS: readonly TextLength[] = ['short', 'typical', 'long', 'overflow'];

const GENERATED: Readonly<Record<GeneratedKind, Readonly<Record<TextLength, string>>>> = {
  text: {
    short: 'Ab',
    typical: 'Northmarch',
    long: 'The Grand Duchy of the Western Marches',
    overflow:
      'The Most Serene Grand Duchy of the Western Marches, the Northern Isles and the Lands Beyond the Sea',
  },
  number: { short: '7', typical: '12.3', long: '-1234.56', overflow: '123456789.01' },
  percent: { short: '5%', typical: '12.5%', long: '-45.25%', overflow: '1234567.89%' },
  date: {
    short: '1 May 1444',
    typical: '11 November 1444',
    long: '29 September 1821',
    overflow: '11 November 1444 – 29 September 1821',
  },
};

/** The generated layer's text of a kind and length. */
export function generatedText(kind: GeneratedKind, length: TextLength): string {
  return GENERATED[kind][length];
}

/**
 * What a live snapshot holds (M9's seam): the text a widget showed in the game, by its path in
 * the window; a row of a list box as `<list path>/row[n]/<path in the entry>`, n from 1.
 */
export interface LiveTexts {
  text(path: string): string | undefined;
}

/** A top-level definition of the playset and the file that holds it, for a repeater's entries. */
export interface Template {
  readonly widget: Widget;
  readonly file: GuiFile;
}

export interface SampleInput {
  /** The chosen save, country and province; none without a save. */
  readonly save?: SaveChoice;
  /** The playset's localisation of a key; `undefined` when it has none. */
  readonly localise: (key: string) => string | undefined;
  readonly length: TextLength;
  /** A live snapshot, when one is on (M9). */
  readonly live?: LiveTexts;
  /** The playset's top-level definition of a name, for repeaters. */
  readonly template?: (name: string) => Template | undefined;
  /** Texts the user typed, by widget path as live texts are (a list's row included). */
  readonly hand?: LiveTexts;
  /** The number of entries the user set for a repeater, by its id; the save's or the profile's otherwise. */
  readonly count?: (repeater: string) => number | undefined;
}

/** A widget's sample text and the layer it comes from. */
export interface SampleText {
  readonly text: string;
  readonly layer: DataLayer;
  /** Where in the layer: a save path, a localisation key, a length. */
  readonly detail: string;
}

/** The entries a repeater lays out in a list box. */
export interface SampleRows {
  readonly template: Widget;
  readonly file: GuiFile;
  readonly count: number;
  /** Where the entries come from: the save collection, or `generated`. */
  readonly layer: DataLayer;
  /** Where the game's code puts them in a window that is not a list box. */
  readonly place?: Placement;
}

/** A repeater of the window, for `Data ▾`'s lists. */
export interface SampleList {
  /** The repeater's id: the list's path as the profile writes it. */
  readonly id: string;
  /** The list's name and the template's, for a label. */
  readonly list: string;
  readonly template: string;
  readonly count: number;
  /** Whether the user set the number; otherwise it is the save's or the profile's. */
  readonly bySet: boolean;
  readonly layer: DataLayer;
  /** Whether the view draws the list. */
  readonly drawn: boolean;
}

export interface SampleData {
  /** The text a widget shows, in a list box's row `row` when it is a repeater's entry. */
  text(widget: Widget, row?: number): SampleText | undefined;
  /** The entries of a list box a repeater fills. */
  rows(list: Widget): SampleRows | undefined;
  /** How many texts each layer fills, of the widgets the view draws. */
  readonly counts: Readonly<Record<DataLayer, number>>;
  /** The window's repeaters whose template the playset defines. */
  readonly lists: readonly SampleList[];
}

/** The sample data of a window in a view. */
export function sampleData(
  profile: WindowProfile,
  window: Widget,
  view: WindowView | undefined,
  input: SampleInput,
): SampleData {
  const counts: Record<DataLayer, number> = { hand: 0, live: 0, save: 0, files: 0, generated: 0 };
  const drawn = (widget: Widget): boolean => view?.drawn(widget) ?? true;
  const pathOf = new Map(windowPaths(window).map((entry) => [entry.widget, entry.path]));

  const texts = new Map<Widget, SampleText>();
  for (const content of profile.content) {
    for (const widget of widgetsAt(window, content.path.path)) {
      const text = resolve(content, pathOf.get(widget) ?? content.path.path, undefined, input);
      texts.set(widget, text);
    }
  }
  if (input.hand !== undefined) {
    for (const [widget, path] of pathOf) {
      const text = input.hand.text(path);
      if (text !== undefined) texts.set(widget, { text, layer: 'hand', detail: path });
    }
  }
  for (const [widget, text] of texts) if (drawn(widget)) counts[text.layer]++;

  const rows = new Map<Widget, SampleRows>();
  const rowTexts = new Map<Widget, Map<Widget, SampleText>[]>();
  const lists: SampleList[] = [];
  for (const repeater of profile.repeaters) {
    const template = input.template?.(repeater.template);
    if (template === undefined) continue;
    const from =
      repeater.from === undefined
        ? undefined
        : readSavePath(repeater.from.path, { collection: true });
    const entries =
      input.save !== undefined && from !== undefined && !('problem' in from)
        ? input.save.entries(from)
        : undefined;
    const set = input.count?.(repeater.id);
    const count = set ?? entries?.length ?? repeater.count;
    const layer: DataLayer = entries === undefined ? 'generated' : 'save';
    const templatePaths = windowPaths(template.widget);
    const rowPath = (listPath: string, row: number, inEntry: string): string => {
      const relative = inEntry.split('/').slice(1).join('/');
      return `${listPath}/row[${String(row + 1)}]${relative === '' ? '' : `/${relative}`}`;
    };
    const found = widgetsAt(window, repeater.path.path);
    lists.push({
      id: repeater.id,
      list: found[0]?.name ?? repeater.path.path,
      template: repeater.template,
      count,
      bySet: set !== undefined,
      layer,
      drawn: found.some(drawn),
    });
    for (const list of found) {
      rows.set(list, {
        template: template.widget,
        file: template.file,
        count,
        layer,
        ...(repeater.place === undefined ? {} : { place: repeater.place }),
      });
      const listPath = pathOf.get(list) ?? repeater.path.path;
      const perRow: Map<Widget, SampleText>[] = [];
      for (let row = 0; row < count; row++) {
        const filled = new Map<Widget, SampleText>();
        for (const field of repeater.fields) {
          for (const widget of widgetsAt(template.widget, field.path.path)) {
            const inEntry = templatePaths.find((p) => p.widget === widget)?.path ?? field.path.path;
            filled.set(
              widget,
              resolve(field, rowPath(listPath, row, inEntry), entries?.[row], input),
            );
          }
        }
        if (input.hand !== undefined) {
          for (const entry of templatePaths) {
            const path = rowPath(listPath, row, entry.path);
            const text = input.hand.text(path);
            if (text !== undefined) filled.set(entry.widget, { text, layer: 'hand', detail: path });
          }
        }
        if (drawn(list)) for (const text of filled.values()) counts[text.layer]++;
        perRow.push(filled);
      }
      rowTexts.set(list, perRow);
    }
  }

  // A row's widget is shared by every row: look it up in each list's rows.
  const perList = [...rowTexts.values()];
  return {
    text: (widget, row) => {
      if (row === undefined) return texts.get(widget);
      for (const perRow of perList) {
        const found = perRow[row]?.get(widget);
        if (found !== undefined) return found;
      }
      return undefined;
    },
    rows: (list) => rows.get(list),
    counts,
    lists,
  };
}

/** One text through the layers: by hand, live, then its source, then generated. */
function resolve(
  source: ContentSource,
  path: string,
  entry: RepeaterEntry | undefined,
  input: SampleInput,
): SampleText {
  const hand = input.hand?.text(path);
  if (hand !== undefined) return { text: hand, layer: 'hand', detail: path };
  const live = input.live?.text(path);
  if (live !== undefined) return { text: live, layer: 'live', detail: path };
  if (source.source === 'save' && input.save !== undefined) {
    const value = saveValue(source, entry, input);
    if (value !== undefined)
      return { text: value, layer: 'save', detail: source.save.map((s) => s.path).join(' + ') };
  }
  if (source.source === 'loc' && source.loc !== undefined) {
    const text = input.localise(source.loc);
    if (text !== undefined) return { text, layer: 'files', detail: source.loc };
  }
  return {
    text: generatedText(source.generated, input.length),
    layer: 'generated',
    detail: `${source.generated}, ${input.length}`,
  };
}

/** A save source's value, formatted; `undefined` when the save lacks any of its paths. */
function saveValue(
  source: ContentSource,
  entry: RepeaterEntry | undefined,
  input: SampleInput,
): string | undefined {
  const values: string[] = [];
  for (const ref of source.save) {
    const path = readSavePath(ref.path, { entry: entry !== undefined });
    if ('problem' in path) return undefined;
    const value = input.save?.value(path, entry);
    if (value === undefined) return undefined;
    values.push(value);
  }
  if (source.transform === 'sum') {
    const numbers = values.map(Number);
    if (numbers.some((n) => !Number.isFinite(n))) return undefined;
    return formatNumber(
      numbers.reduce((a, b) => a + b, 0),
      source.format,
      source.decimals,
    );
  }
  const value = values[0];
  if (value === undefined) return undefined;
  if (source.transform === 'localise') return input.localise(value) ?? value;
  if (source.format === 'text') return value;
  const number = Number(value);
  return Number.isFinite(number) ? formatNumber(number, source.format, source.decimals) : value;
}

/** A number as a profile formats it: fixed decimals, else at most two with trailing zeros dropped. */
export function formatNumber(
  value: number,
  format: 'text' | 'number' | 'percent',
  decimals: number | undefined,
): string {
  const text =
    decimals === undefined ? String(Math.round(value * 100) / 100) : value.toFixed(decimals);
  return format === 'percent' ? `${text}%` : text;
}

/**
 * The facts a `data` selector reads from the save (spec section 4): of the chosen province, with
 * the chosen country as the player. A fact the save does not decide is left out, so its selector
 * keeps its default.
 */
export function saveFacts(choice: SaveChoice): Record<string, string> {
  const province = choice.block('province');
  if (province === undefined) return {};
  const yesNo = (value: boolean): string => (value ? 'yes' : 'no');
  const owner = scalarIn(province, 'owner');
  const controller = scalarIn(province, 'controller');
  const projects = valueIn(province, 'great_projects');
  const buildings = valueIn(province, 'buildings');
  const ownerBlock = choice.block('owner');
  const id = String(choice.province);
  const ownerFacts: Record<string, string> =
    ownerBlock === undefined
      ? {}
      : {
          'province.isCapital': yesNo(scalarIn(ownerBlock, 'capital') === id),
          'province.isTradePort': yesNo(scalarIn(ownerBlock, 'trade_port') === id),
          'province.parliamentSeat':
            valueIn(ownerBlock, 'parliament') === undefined
              ? 'none'
              : valueIn(province, 'seat_in_parliament') === undefined
                ? 'noSeat'
                : 'seat',
        };
  const dlcs = choice.save.meta.dlcs;
  return {
    ...ownerFacts,
    ...(dlcs === undefined
      ? {}
      : { 'game.cradleOfCivilization': yesNo(dlcs.includes('Cradle of Civilization')) }),
    'province.centerOfTrade': yesNo(Number(scalarIn(province, 'center_of_trade') ?? 0) > 0),
    'province.owned': yesNo(owner !== undefined),
    'province.ownedByPlayer': yesNo(owner !== undefined && owner === choice.country),
    'province.occupied': yesNo(
      owner !== undefined && controller !== undefined && controller !== owner,
    ),
    'province.constructing': yesNo(
      valueIn(province, 'building_construction') !== undefined ||
        valueIn(province, 'military_construction') !== undefined,
    ),
    'province.hasGreatProjects': yesNo(projects?.kind === 'block' && projects.entries.length > 0),
    'province.hasFort': yesNo(
      buildings?.kind === 'block' &&
        buildings.entries.some((e) => {
          const name = e.kind === 'property' ? e.key.text : e.kind === 'scalar' ? e.text : '';
          return /^fort_/i.test(name);
        }),
    ),
  };
}

/** The links that hold in a view: every condition of theirs holds (spec section 2). */
export function activeLinks(profile: WindowProfile, view: WindowView): readonly Link[] {
  const value = new Map(view.selectors.map((s) => [s.selector.id, s.value]));
  return profile.links.filter((link) =>
    link.when.every((c) => c.values.includes(value.get(c.selector) ?? '')),
  );
}

/**
 * The country and province a save opens on: the player's country and its capital, else the
 * first country and province of the save (spec section 5).
 */
export function defaultSaveChoice(save: SaveChoice['save']): {
  country: string | undefined;
  province: number | undefined;
} {
  const player = save.meta.player;
  const country =
    player !== undefined && save.index.countries.has(player) ? player : save.countries[0];
  const block = country === undefined ? undefined : save.country(country);
  const capital = Number(block === undefined ? NaN : scalarIn(block, 'capital'));
  const province = save.index.provinces.has(capital) ? capital : save.provinces[0];
  return { country, province };
}

/** The sample data as layout takes it (`LayoutInput.content`). */
export function layoutContentOf(sample: SampleData): LayoutContent {
  return {
    text: (widget, row) => sample.text(widget, row)?.text,
    rows: (list) => sample.rows(list),
  };
}
