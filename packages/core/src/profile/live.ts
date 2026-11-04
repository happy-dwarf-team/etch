/**
 * A live snapshot (spec section 7, etch#170): every widget of a top-level window as the live game
 * showed it, hidden ones too, with its path, type, flags, text and rectangle. The preview takes
 * three things from it: the texts, as the top sample data layer; the value of each selector whose
 * rules predict exactly the visibility the game showed (`live`); and, where the profile still
 * predicts otherwise, toggles marked "from the game". Etch reads no facts from the game and writes
 * no rules itself.
 */
import type { LayoutContent, LayoutView } from '../layout/window.ts';
import type { Screen, Widget } from '../model/gui.ts';
import type { WindowProfile } from './format.ts';
import type { LiveAdopted, LiveState, LiveTexts } from './sample.ts';
import { widgetsAt, windowPaths } from './paths.ts';
import { evaluateView, fitsScreen, screenLayoutView, type ViewChoice } from './view.ts';

export const LIVE_SNAPSHOT_FORMAT = 1;

/** One widget of a live snapshot; a list box's rows as `<list path>/row[n]/…`. */
export interface LiveWidget {
  readonly path: string;
  readonly type: string;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly checked: boolean;
  readonly text?: string;
  /** The text with the game's colour codes (`Â§Gâ€¦Â§!`), when it has some: what the preview draws. */
  readonly markup?: string;
  readonly rect: readonly [number, number, number, number];
}

export interface LiveSnapshot {
  readonly formatVersion: typeof LIVE_SNAPSHOT_FORMAT;
  /** The top-level window, as the game names it. */
  readonly window: string;
  /** When it was taken (ISO 8601). */
  readonly takenAt: string;
  /** The save the live game was started from, by file name. */
  readonly save?: string;
  /** SHA-256 of the window's winning `.gui` file when it was taken. */
  readonly fileHash?: string;
  /**
   * The game date as a save writes it (`1444.11.11`): from `anvil-game` 1.6.0, while a session
   * runs. Left out in the main menu and with an older Anvil or plugin.
   */
  readonly gameDate?: string;
  /** The game process it came from: another one makes the snapshot "older". */
  readonly game?: { readonly pid: number; readonly startMs: number };
  /** The game window's client size, which the `resolution` selector takes. */
  readonly screen: Screen;
  readonly widgets: readonly LiveWidget[];
  /** Stale widgets inside the window, left out. */
  readonly stale: number;
}

/** A widget as the plugin reads it, with Tongs' path. */
export interface PluginWidget {
  readonly path: string;
  readonly type: string;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly checked: boolean;
  readonly text: string | undefined;
  readonly markup?: string;
  readonly rect: readonly [number, number, number, number];
}

/**
 * The snapshot's widgets with a list box's rows by position (`…/listbox/row[2]/…`), as profiles
 * and the sample data address them: a window under a list box is one of its rows, numbered in the
 * order the game holds them.
 */
export function liveWidgetsOf(widgets: readonly PluginWidget[]): LiveWidget[] {
  const types = new Map(widgets.map((w) => [w.path.toLowerCase(), w.type]));
  const rows = new Map<string, Map<string, number>>();
  const renamed = new Map<string, string>();
  return widgets.map((w) => {
    const steps = w.path.split('/');
    const out: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      const parent = steps.slice(0, i).join('/').toLowerCase();
      const own = steps
        .slice(0, i + 1)
        .join('/')
        .toLowerCase();
      const step = steps[i] ?? '';
      if (i > 0 && types.get(parent) === 'listbox' && types.get(own) === 'window') {
        let known = renamed.get(own);
        if (known === undefined) {
          const counts = rows.get(parent) ?? new Map<string, number>();
          rows.set(parent, counts);
          known = `row[${String(counts.size + 1)}]`;
          counts.set(own, counts.size + 1);
          renamed.set(own, known);
        }
        out.push(known);
      } else out.push(step);
    }
    return {
      path: out.join('/'),
      type: w.type,
      visible: w.visible,
      enabled: w.enabled,
      checked: w.checked,
      ...(w.text === undefined ? {} : { text: w.text }),
      ...(w.markup === undefined || w.markup === w.text ? {} : { markup: w.markup }),
      rect: w.rect,
    };
  });
}

/** Reads a stored snapshot; `undefined` when it is not one this Etch reads. */
export function readLiveSnapshot(value: unknown): LiveSnapshot | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (v['formatVersion'] !== LIVE_SNAPSHOT_FORMAT || typeof v['window'] !== 'string')
    return undefined;
  if (!Array.isArray(v['widgets']) || typeof v['takenAt'] !== 'string') return undefined;
  return value as LiveSnapshot;
}

/** The snapshot's texts for the sample data, and how many of them no longer match the window. */
export interface LiveMatch {
  /** The texts, the number of each list's rows and each widget's state, by path. */
  readonly texts: LiveTexts;
  /** Texts whose widget the window as it is now does not have: they fall through. */
  readonly unmatched: number;
}

const LIST_BOXES = new Set(['listboxType', 'smoothListboxType']);

/**
 * Matches a snapshot with a window by path, list rows by position (spec section 7). With the
 * window's profile, the entries the game's code puts in a window or a box rather than a list box
 * (a repeater with `place`, an `OverlappingElementsBoxType`) are rows too: the game names them
 * after their template, `general_buildings_window/building_progress_entry[2]`, and the preview
 * as `general_buildings_window/row[2]` (a single entry has no `[n]`). The match gives every text,
 * the number of rows of each list and each widget's visible, enabled and checked state (2.0.0
 * trial: the building slots, the core shields and the disabled buttons the game showed).
 */
export function liveMatch(
  snapshot: LiveSnapshot,
  window: Widget,
  profile?: WindowProfile,
): LiveMatch {
  const entries = windowPaths(window);
  const known = new Set(entries.map((e) => e.path.toLowerCase()));
  const pathOf = new Map(entries.map((e) => [e.widget, e.path.toLowerCase()]));
  const placed: { prefix: string; list: string }[] = [];
  for (const repeater of profile?.repeaters ?? []) {
    for (const list of widgetsAt(window, repeater.path.path)) {
      const listPath = pathOf.get(list);
      if (listPath === undefined || LIST_BOXES.has(list.kind)) continue;
      const template = repeater.template.toLowerCase();
      placed.push({ prefix: `${listPath}/${template}`, list: listPath });
      const parent = listPath.slice(0, listPath.lastIndexOf('/'));
      if (list.kind === 'OverlappingElementsBoxType' && parent !== '') {
        placed.push({ prefix: `${parent}/${template}`, list: listPath });
      }
    }
  }
  const normal = (raw: string): string => {
    const path = raw.toLowerCase();
    for (const { prefix, list } of placed) {
      if (!path.startsWith(prefix)) continue;
      const match = /^(?:\[(\d+)\])?(\/.*)?$/.exec(path.slice(prefix.length));
      if (match !== null) return `${list}/row[${match[1] ?? '1'}]${match[2] ?? ''}`;
    }
    return path;
  };
  const texts = new Map<string, string>();
  const states = new Map<string, LiveState>();
  const rows = new Map<string, number>();
  const adopted = new Map<string, LiveAdopted[]>();
  let unmatched = 0;
  for (const w of snapshot.widgets) {
    const path = normal(w.path);
    // A widget the window's `.gui` lacks right under one it has, outside a list's rows: one the
    // game's code made from another definition (etch#256), drawn where the game showed it.
    const at = path.lastIndexOf('/');
    const parent = path.slice(0, at);
    if (
      at > 0 &&
      w.visible &&
      !known.has(path) &&
      known.has(parent) &&
      !/\/row\[\d+\]/.test(path)
    ) {
      const name = (w.path.split('/').pop() ?? '').replace(/\[\d+\]$/, '');
      const entry = {
        name,
        rect: w.rect,
        ...(w.text === undefined ? {} : { text: w.markup ?? w.text }),
      };
      adopted.set(parent, [...(adopted.get(parent) ?? []), entry]);
    }
    states.set(path, {
      visible: w.visible,
      enabled: w.enabled,
      checked: w.checked,
      rect: w.rect,
    });
    // A row's widgets come from its template: the list box must still be there.
    const row = /^(.*?)\/row\[(\d+)\](?:\/|$)/.exec(path);
    if (row !== null && known.has(row[1] ?? '')) {
      const list = row[1] ?? '';
      rows.set(list, Math.max(rows.get(list) ?? 0, Number(row[2])));
    }
    // The colours too: the game colours values with codes (Â§Gâ€¦Â§!), which Tongs' `text` drops.
    const text = w.markup ?? w.text;
    if (text === undefined) continue;
    if (known.has(row === null ? path : (row[1] ?? ''))) texts.set(path, text);
    else if (!builtByCode(path, known)) unmatched++;
  }
  // Lookups take the game's paths too (`…/building_progress_entry[2]/…`), as they are stored.
  return {
    texts: {
      text: (path) => texts.get(normal(path)),
      // A list the game showed has its rows, none when it showed none; a hidden one says nothing.
      rows: (list) => {
        const path = list.toLowerCase();
        return states.get(path)?.visible === true ? (rows.get(path) ?? 0) : undefined;
      },
      state: (path) => states.get(normal(path)),
      adopted: (path) => adopted.get(normal(path)) ?? [],
    },
    unmatched,
  };
}

/**
 * Whether a path the window does not have lies in a widget the game's code builds: the first
 * step the window lacks is a numbered copy (`unit[2]`) under a parent the window has, such as
 * the unit entries of the build views. Those never were in the file, so they do not count as
 * values that no longer match.
 */
function builtByCode(path: string, known: ReadonlySet<string>): boolean {
  const steps = path.split('/');
  for (let i = 1; i < steps.length; i++) {
    const prefix = steps.slice(0, i + 1).join('/');
    if (known.has(prefix)) continue;
    return /\[\d+\]$/.test(steps[i] ?? '') && known.has(steps.slice(0, i).join('/'));
  }
  return false;
}

/** Visibility by path, rows left out: what the profile's rules can be compared with. */
function visibility(snapshot: LiveSnapshot): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const w of snapshot.widgets) {
    if (!/\/row\[\d+\](?:\/|$)/.test(w.path)) out.set(w.path.toLowerCase(), w.visible);
  }
  return out;
}

/** Selector values from a snapshot, and the selectors none of whose values fits. */
export interface LiveSelectors {
  readonly values: Readonly<Record<string, string>>;
  readonly unknown: readonly string[];
}

/**
 * The value of each selector from a snapshot (spec section 7): the resolution from the game
 * window's size; any other selector takes the value whose rules predict exactly the visibility the
 * snapshot shows for the widgets that selector's rules and groups name (the default when several
 * fit, "unknown" when none does). Two passes, so that one selector's value can follow another's.
 */
export function liveSelectors(
  profile: WindowProfile,
  window: Widget,
  snapshot: LiveSnapshot,
  facts?: Readonly<Record<string, string>>,
): LiveSelectors {
  const visible = visibility(snapshot);
  // A text box the game keeps shown with nothing in it (`fort_number` without a fort) says nothing
  // about what the view is.
  for (const w of snapshot.widgets) {
    if (w.type === 'text' && w.text === '') visible.delete(w.path.toLowerCase());
  }
  const pathOf = new Map(windowPaths(window).map((e) => [e.widget, e.path.toLowerCase()]));
  const values = new Map<string, string>();
  for (const selector of profile.selectors) {
    if (selector.kind !== 'resolution') continue;
    const fits = selector.values.find((v) => fitsScreen(v, snapshot.screen));
    if (fits !== undefined) values.set(selector.id, fits.id);
  }
  const named = (id: string): Widget[] => {
    const paths = [
      ...profile.rules
        .filter((r) => r.when.some((c) => c.selector === id))
        .flatMap((r) => [...r.show, ...r.hide].map((ref) => ref.path)),
      ...profile.groups
        .filter((g) => g.selector === id)
        .flatMap((g) => g.members.map((m) => m.path)),
    ];
    const widgets = new Set(paths.flatMap((p) => widgetsAt(window, p)));
    return [...widgets].filter((w) => visible.has(pathOf.get(w) ?? ''));
  };
  let unknown: string[] = [];
  for (let pass = 0; pass < 2; pass++) {
    unknown = [];
    for (const selector of profile.selectors) {
      if (selector.kind === 'resolution') continue;
      const widgets = named(selector.id);
      const fits = selector.values.filter((value) => {
        const choice: ViewChoice = {
          live: { ...Object.fromEntries(values), [selector.id]: value.id },
          ...(facts === undefined ? {} : { facts }),
        };
        const view = evaluateView(profile, window, snapshot.screen, choice);
        return widgets.every((w) => view.drawn(w) === visible.get(pathOf.get(w) ?? ''));
      });
      if (fits.length === 0) {
        unknown.push(selector.id);
        values.delete(selector.id);
      } else {
        values.set(
          selector.id,
          fits.some((v) => v.id === selector.default)
            ? selector.default
            : (fits[0]?.id ?? selector.default),
        );
      }
    }
  }
  // Selectors whose rules work together (`hre-foreign`: `hre` yes and `owner` no) fit only as a
  // combination, which one selector at a time never tries (the coverage survey's foreign
  // provinces of Anbennar, etch#257): while the combinations are few, the unknown selectors are
  // tried together, and the first combination that fits all their widgets is taken.
  if (unknown.length > 1) {
    const together = profile.selectors.filter((s) => unknown.includes(s.id));
    const total = together.reduce((n, s) => n * s.values.length, 1);
    const widgets = [...new Set(together.flatMap((s) => named(s.id)))];
    for (let i = 0; i < total && total <= MAX_COMBINATIONS; i++) {
      let rest = i;
      const combination: Record<string, string> = {};
      for (const s of together) {
        combination[s.id] = s.values[rest % s.values.length]?.id ?? s.default;
        rest = Math.floor(rest / s.values.length);
      }
      const view = evaluateView(profile, window, snapshot.screen, {
        live: { ...Object.fromEntries(values), ...combination },
        ...(facts === undefined ? {} : { facts }),
      });
      if (widgets.every((w) => view.drawn(w) === visible.get(pathOf.get(w) ?? ''))) {
        for (const [id, value] of Object.entries(combination)) values.set(id, value);
        unknown = [];
        break;
      }
    }
  }
  return { values: Object.fromEntries(values), unknown };
}

/** The most combinations of unknown selectors' values `liveSelectors` tries together. */
const MAX_COMBINATIONS = 4096;

/**
 * Where the profile, with the choice's selectors, still predicts otherwise than the snapshot
 * shows: each widget whose parent the game showed, created in the view, and shown or hidden
 * against the game (spec section 7, "Against the profile"). The paths are the window's own; rows
 * are left out.
 */
export function liveDifferences(
  profile: WindowProfile,
  window: Widget,
  screen: Screen,
  choice: ViewChoice,
  snapshot: LiveSnapshot,
): Record<string, boolean> {
  const visible = visibility(snapshot);
  const view = evaluateView(profile, window, screen, { ...choice, toggles: {}, gameToggles: {} });
  const list = windowPaths(window);
  const out: Record<string, boolean> = {};
  for (const entry of list) {
    const shown = visible.get(entry.path.toLowerCase());
    if (shown === undefined) continue;
    const parent = list[entry.parent];
    if (parent !== undefined && visible.get(parent.path.toLowerCase()) !== true) continue;
    const state = view.widgets.get(entry.widget);
    if (state === undefined || !state.created) continue;
    if (state.shown !== shown) out[entry.path] = shown;
  }
  return out;
}

/**
 * What a live snapshot gives the preview of a window without a profile (etch#255, from the
 * coverage survey: the outliner, the HRE, most country view tabs and the dialogs have none): the
 * texts the game showed and each widget's state, by the widget's path in the window. Without a
 * profile there are no repeaters, so a list keeps the rows its `.gui` has (none); with one, the
 * sample data's live layer does this (`sampleData`).
 */
export function liveContent(window: Widget, texts: LiveTexts): LayoutContent {
  const pathOf = new Map(windowPaths(window).map((e) => [e.widget, e.path]));
  return {
    text: (widget, row) => {
      if (row !== undefined) return undefined;
      const path = pathOf.get(widget);
      return path === undefined ? undefined : texts.text(path);
    },
    state: (widget, row) => {
      if (row !== undefined) return undefined;
      const path = pathOf.get(widget);
      return path === undefined ? undefined : texts.state?.(path);
    },
    rows: () => undefined,
    adopted: (widget, row) => {
      const path = row === undefined ? pathOf.get(widget) : undefined;
      return path === undefined ? [] : (texts.adopted?.(path) ?? []);
    },
  };
}

/**
 * The view a live snapshot gives a window without a profile: what the game hid is not drawn,
 * and what the snapshot does not have (not created, or not read) is drawn as the `.gui` has it.
 */
export function liveView(window: Widget, texts: LiveTexts, screen: Screen): LayoutView {
  const pathOf = new Map(windowPaths(window).map((e) => [e.widget, e.path]));
  // Over what the game's code does by the screen height (etch#272): the half of a `_large` pair
  // the game does not create is in no snapshot, and stays undrawn.
  const base = screenLayoutView(window, screen);
  return {
    shows: (widget) => {
      const path = pathOf.get(widget);
      return base.shows(widget) && (path === undefined || texts.state?.(path)?.visible !== false);
    },
    movedTo: (widget) => base.movedTo(widget),
    movedAxis: (widget) => base.movedAxis?.(widget),
    frame: () => undefined,
  };
}
