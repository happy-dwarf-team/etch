// The sample data the preview shows (spec section 5, etch#159): the chosen save, read off the
// cold-open path, its country and province, the generated text's length, whether a live
// snapshot is on, the texts typed by hand and the number of entries set for each list, kept for
// the whole preview (the typed texts across sessions, by window); and `Data ▾`, drawn from them.
// Plain data and core calls; no vscode.

import {
  DATA_LAYERS,
  SaveChoice,
  defaultSaveChoice,
  saveFacts,
  type DataLayer,
  type LiveTexts,
  type SampleData,
  type TextLength,
} from '@etch/core/profile';
import type { BlockNode } from '@etch/core';
import { SaveReadError, readSave, scalarIn, type Save } from '@etch/core/save';
import type { DataMenu } from './protocol.ts';

/** Where the chosen save is, and how far it is read. */
type SaveState =
  | { readonly state: 'loading'; readonly path: string; readonly abort: AbortController }
  | { readonly state: 'failed'; readonly path: string; readonly problem: string }
  | {
      readonly state: 'ready';
      readonly path: string;
      readonly save: Save;
      readonly choice: SaveChoice;
    };

/** What the preview tells the user while a save is read, and when it is ready. */
export interface DataEvents {
  /** The data changed: lay the window out again. */
  changed(): void;
  /** A save was read, with the time from the choice to its index, in ms. */
  read?(path: string, ms: number): void;
}

/** The most entries a list can be set to: the profile's limit for a repeater's count. */
export const MAX_ENTRIES = 100;

const LAYER_LABELS: Readonly<Record<DataLayer, string>> = {
  hand: 'By hand',
  live: 'Live snapshot',
  save: 'Save',
  files: 'Game and mod files',
  generated: 'Generated',
};

/** Where the texts typed by hand are kept between sessions: by window, then by widget path. */
export interface HandStore {
  get(): Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
  set(texts: Readonly<Record<string, Readonly<Record<string, string>>>>): void;
}

/** What `Data ▾` says of the live snapshot of the previewed window. */
export interface LiveLayer {
  /** Its time, save, "older" and how many values no longer match; `undefined` without one. */
  readonly detail: string | undefined;
  /** Whether the live game runs, so that **Refresh from live game** can take one. */
  readonly canRefresh: boolean;
}

export class PreviewData {
  /** The generated text's length; `typical` by default. */
  length: TextLength = 'typical';
  /** Whether a live snapshot, when there is one, is used (M9). */
  live = true;
  private current: SaveState | undefined;
  private serial = 0;
  private readonly events: DataEvents;
  private readonly read: (path: string) => Promise<Uint8Array>;
  private readonly store: HandStore | undefined;
  /** Texts typed by hand, by window name (lower case), then by widget path (lower case). */
  private readonly hand = new Map<string, Map<string, { path: string; text: string }>>();
  /** The number of entries set for a list, by window name (lower case), then by repeater id. */
  private readonly entries = new Map<string, Map<string, number>>();

  constructor(events: DataEvents, read: (path: string) => Promise<Uint8Array>, store?: HandStore) {
    this.events = events;
    this.read = read;
    this.store = store;
    const kept = store?.get();
    if (kept !== undefined && typeof kept === 'object') {
      for (const [window, texts] of Object.entries(kept)) {
        for (const [path, text] of Object.entries(texts)) {
          if (typeof text === 'string') this.typed(window).set(path.toLowerCase(), { path, text });
        }
      }
    }
  }

  private typed(window: string): Map<string, { path: string; text: string }> {
    const key = window.toLowerCase();
    let texts = this.hand.get(key);
    if (texts === undefined) {
      texts = new Map();
      this.hand.set(key, texts);
    }
    return texts;
  }

  /** The texts typed by hand for a window, as sample data takes them. */
  handTexts(window: string): LiveTexts {
    const texts = this.hand.get(window.toLowerCase());
    return { text: (path) => texts?.get(path.toLowerCase())?.text };
  }

  /** The text typed for a widget path of a window, `undefined` when none. */
  handText(window: string, path: string): string | undefined {
    return this.handTexts(window).text(path);
  }

  /** Types a text for a widget of a window by its path; `undefined` takes it back. */
  setHandText(window: string, path: string, text: string | undefined): void {
    const texts = this.typed(window);
    if (text === undefined) texts.delete(path.toLowerCase());
    else texts.set(path.toLowerCase(), { path, text });
    this.keepHand();
  }

  /** Takes back every text typed for a window. */
  clearHand(window: string): void {
    this.hand.delete(window.toLowerCase());
    this.keepHand();
  }

  /** The number of entries set for each list of a window, by repeater id. */
  entryCounts(window: string): (repeater: string) => number | undefined {
    const set = this.entries.get(window.toLowerCase());
    return (repeater) => set?.get(repeater);
  }

  /** Sets the number of entries of a list; `undefined` goes back to the save's or the profile's. */
  setEntries(window: string, repeater: string, count: number | undefined): void {
    const key = window.toLowerCase();
    const set = this.entries.get(key) ?? new Map<string, number>();
    if (count === undefined) set.delete(repeater);
    else set.set(repeater, Math.max(0, Math.min(MAX_ENTRIES, Math.round(count))));
    this.entries.set(key, set);
    this.serial++;
    this.events.changed();
  }

  private keepHand(): void {
    this.store?.set(
      Object.fromEntries(
        [...this.hand]
          .filter(([, texts]) => texts.size > 0)
          .map(([window, texts]) => [
            window,
            Object.fromEntries([...texts.values()].map((t) => [t.path, t.text])),
          ]),
      ),
    );
    this.serial++;
    this.events.changed();
  }

  /** The save's path, while one is chosen. */
  get path(): string | undefined {
    return this.current?.path;
  }

  /** What the render key needs to tell two data states apart. */
  get key(): string {
    const c = this.current;
    const choice =
      c?.state === 'ready' ? `${c.choice.country ?? ''}:${String(c.choice.province)}` : '';
    return [this.serial, c?.state ?? 'none', choice, this.length, this.live].join('|');
  }

  /** The chosen save, country and province, once the save is read. */
  get choice(): SaveChoice | undefined {
    return this.current?.state === 'ready' ? this.current.choice : undefined;
  }

  /** The facts of the chosen province, for the view's `data` selectors. */
  facts(): Record<string, string> {
    const choice = this.choice;
    return choice === undefined ? {} : saveFacts(choice);
  }

  /**
   * Reads a save and makes it the chosen one, on the player's country and its capital. A save
   * chosen before it is read cancels that read.
   */
  async open(path: string): Promise<void> {
    this.drop();
    const abort = new AbortController();
    this.current = { state: 'loading', path, abort };
    this.serial++;
    this.events.changed();
    const started = performance.now();
    try {
      const bytes = await this.read(path);
      const save = await readSave(bytes, { signal: abort.signal });
      if (this.current.path !== path || abort.signal.aborted) return;
      const { country, province } = defaultSaveChoice(save);
      this.current = {
        state: 'ready',
        path,
        save,
        choice: new SaveChoice(save, country, province),
      };
      this.events.read?.(path, performance.now() - started);
    } catch (error) {
      if (abort.signal.aborted || this.current.path !== path) return;
      this.current = { state: 'failed', path, problem: problemOf(error) };
    }
    this.serial++;
    this.events.changed();
  }

  /** Forgets the save; the save layer is empty again. */
  drop(): void {
    if (this.current === undefined) return;
    if (this.current.state === 'loading') this.current.abort.abort(new Error('another save'));
    this.current = undefined;
    this.serial++;
    this.events.changed();
  }

  /** Chooses a country of the save, keeping the province. */
  chooseCountry(tag: string): void {
    const c = this.current;
    if (c?.state !== 'ready' || !c.save.index.countries.has(tag)) return;
    this.current = { ...c, choice: new SaveChoice(c.save, tag, c.choice.province) };
    this.events.changed();
  }

  /** Chooses a province of the save, own or foreign. */
  chooseProvince(id: number): void {
    const c = this.current;
    if (c?.state !== 'ready' || !c.save.index.provinces.has(id)) return;
    this.current = { ...c, choice: new SaveChoice(c.save, c.choice.country, id) };
    this.events.changed();
  }

  /** The countries of the save for a pick: the chosen one and the save's player first. */
  countries(
    localise: (key: string) => string | undefined,
  ): { tag: string; label: string; detail: string }[] {
    const c = this.current;
    if (c?.state !== 'ready') return [];
    const player = c.save.meta.player;
    const first = [c.choice.country, player].filter((t): t is string => t !== undefined);
    const tags = [...new Set([...first, ...c.save.countries])];
    return tags.map((tag) => ({
      tag,
      label: localise(tag) ?? tag,
      detail: [tag, ...(tag === player ? ["the save's player"] : [])].join(' · '),
    }));
  }

  /** The provinces for a pick: those of the chosen country first, then every other one. */
  provinces(
    localise: (key: string) => string | undefined,
  ): { id: number; label: string; detail: string; own: boolean }[] {
    const c = this.current;
    if (c?.state !== 'ready') return [];
    const country = c.choice.block('country');
    const owned = country === undefined ? undefined : ownedProvinces(country);
    const own = new Set(owned ?? []);
    const ids = [
      ...(owned ?? []).filter((id) => c.save.index.provinces.has(id)),
      ...c.save.provinces.filter((id) => !own.has(id)),
    ];
    return ids.map((id) => ({
      id,
      label: localise(`PROV${String(id)}`) ?? `Province ${String(id)}`,
      detail: `#${String(id)}`,
      own: own.has(id),
    }));
  }

  /** `Data ▾` for the sample data drawn, and how the save's mods differ from the playset's. */
  menu(
    sample: SampleData | undefined,
    playsetMods: readonly string[],
    localise: (key: string) => string | undefined,
    live: LiveLayer = { detail: undefined, canRefresh: false },
  ): DataMenu {
    const counts = sample?.counts ?? { hand: 0, live: 0, save: 0, files: 0, generated: 0 };
    const c = this.current;
    const save: DataMenu['save'] =
      c === undefined
        ? { state: 'none' }
        : c.state === 'loading'
          ? { state: 'loading', name: fileName(c.path) }
          : c.state === 'failed'
            ? { state: 'failed', name: fileName(c.path), problem: c.problem }
            : readySave(c.save, c.choice, c.path, playsetMods, localise);
    const detail: Readonly<Record<DataLayer, string>> = {
      hand:
        counts.hand > 0
          ? 'texts you typed, over every other layer'
          : 'type a text here or from the Widget Outline',
      live:
        live.detail ??
        (live.canRefresh ? 'no snapshot yet' : 'no snapshot yet; it comes from the live game'),
      save:
        save.state === 'ready'
          ? [save.name, save.country, save.province].filter((x) => x !== undefined).join(' · ')
          : save.state === 'loading'
            ? `reading ${save.name ?? ''}…`
            : save.state === 'failed'
              ? (save.problem ?? 'not readable')
              : 'no save chosen',
      files: 'localisation, names (always on)',
      generated: this.length,
    };
    const label =
      save.state === 'ready'
        ? `Data: ${[save.province, save.date].filter((x) => x !== undefined).join(' · ') || (save.name ?? 'save')}`
        : save.state === 'loading'
          ? 'Data: reading save…'
          : `Data: generated, ${this.length}`;
    return {
      label,
      layers: DATA_LAYERS.map((id) => ({
        id,
        label: LAYER_LABELS[id],
        detail: detail[id],
        count: counts[id],
        on: id === 'live' ? this.live : id === 'save' ? save.state === 'ready' : true,
        canToggle: id === 'live',
      })),
      lists: (sample?.lists ?? [])
        .filter((list) => list.drawn)
        .map((list) => ({
          id: list.id,
          label: `${list.list} (${list.template})`,
          count: list.count,
          bySet: list.bySet,
          detail: list.bySet
            ? 'set by you'
            : list.layer === 'live'
              ? 'from the live snapshot'
              : list.layer === 'save'
                ? 'from the save'
                : 'generated',
        })),
      save,
      length: this.length,
      canRefresh: live.canRefresh,
    };
  }
}

function readySave(
  save: Save,
  choice: SaveChoice,
  path: string,
  playsetMods: readonly string[],
  localise: (key: string) => string | undefined,
): DataMenu['save'] {
  const country = choice.country;
  const province = choice.block('province');
  const provinceName = province === undefined ? undefined : scalarIn(province, 'name');
  const mismatch = modsMismatch(save.meta.mods, playsetMods);
  return {
    state: 'ready',
    name: fileName(path),
    ...(save.meta.date === undefined ? {} : { date: save.meta.date }),
    ...(country === undefined ? {} : { country: localise(country) ?? country }),
    ...(provinceName === undefined ? {} : { province: provinceName }),
    ...(mismatch === undefined ? {} : { mismatch }),
  };
}

/**
 * How the save's mods differ from the playset's, by display name, for a warning (etch#154): the
 * save still applies, as values a playset lacks fall through.
 */
export function modsMismatch(
  saveMods: readonly string[],
  playsetMods: readonly string[],
): string | undefined {
  const key = (name: string): string => name.trim().toLowerCase();
  const inPlayset = new Set(playsetMods.map(key));
  const inSave = new Set(saveMods.map(key));
  const missing = playsetMods.filter((m) => !inSave.has(key(m)));
  const extra = saveMods.filter((m) => !inPlayset.has(key(m)));
  if (missing.length === 0 && extra.length === 0) return undefined;
  const list = (names: readonly string[]): string =>
    names.length <= 3
      ? names.join(', ')
      : `${names.slice(0, 3).join(', ')} and ${String(names.length - 3)} more`;
  const parts = [
    ...(missing.length === 0 ? [] : [`made without ${list(missing)}`]),
    ...(extra.length === 0 ? [] : [`made with ${list(extra)}`]),
  ];
  return `This save was ${parts.join(' and ')}; values the playset lacks fall through.`;
}

/** A country's `owned_provinces`, the ids as the save writes them. */
function ownedProvinces(country: BlockNode): number[] {
  for (const entry of country.entries) {
    if (entry.kind !== 'property' || entry.key.text !== 'owned_provinces') continue;
    if (entry.value?.kind !== 'block') return [];
    return entry.value.entries.flatMap((e) =>
      e.kind === 'scalar' && /^\d+$/.test(e.text) ? [Number(e.text)] : [],
    );
  }
  return [];
}

function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

function problemOf(error: unknown): string {
  if (error instanceof SaveReadError) return error.message;
  return `The save cannot be read: ${error instanceof Error ? error.message : String(error)}.`;
}
