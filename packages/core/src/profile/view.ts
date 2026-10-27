/**
 * The view a window profile chooses (spec sections 3 and 4): the value of each selector and where
 * it came from, and for every widget of the window whether the game creates it, whether it shows,
 * where the game's code moves it and which frame it sets. The offline renderer draws what this
 * says and the Widget Outline shows it.
 *
 * In order, later winning: the `_large` pairs and moves Etch derives (`engine.ts`), the exclusive
 * groups, the rules in layer order, then the hand toggles. A widget the game does not create stays
 * so; a hand toggle cannot create it.
 */
import type { LayoutView } from '../layout/window.ts';
import type { Screen, Widget } from '../model/gui.ts';
import { ENGINE_MOVES, LARGE_FROM_HEIGHT, LARGE_SUFFIX } from './engine.ts';
import type { Group, Selector, SelectorValue, WindowProfile } from './format.ts';
import { widgetsAt, windowPaths } from './paths.ts';

/**
 * Where a selector's value came from: the preview's screen (`auto`), the chosen save (`save`),
 * a live snapshot (`live`), the user by hand or through a view (`you`), or the profile's default.
 */
export type SelectorSource = 'auto' | 'save' | 'live' | 'you' | 'default';

/** What the user chose, and what the save and the live game say. */
export interface ViewChoice {
  /** Selector values set by hand or by a view, by selector id. */
  readonly set?: Readonly<Record<string, string>>;
  /** Hand toggles by path: `true` shows the widget, `false` hides it. */
  readonly toggles?: Readonly<Record<string, boolean>>;
  /** Fact values from the chosen save, by fact name (M7). */
  readonly facts?: Readonly<Record<string, string>>;
  /** Selector values from a live snapshot, by selector id (M9). */
  readonly live?: Readonly<Record<string, string>>;
}

export interface SelectorState {
  readonly selector: Selector;
  readonly value: string;
  readonly source: SelectorSource;
}

export interface WidgetState {
  /** Whether the game creates the widget at all; one of a `_large` pair is not. */
  readonly created: boolean;
  /** Whether the widget itself shows; it is drawn when its parents show too. */
  readonly shown: boolean;
  /** What the profile says without hand toggles. */
  readonly profileShown: boolean;
  /** Whether a hand toggle set `shown`. */
  readonly byHand: boolean;
  /** Why it is so, for the Widget Outline. */
  readonly why: string;
  /** The `positionType` the game's code moves it to. */
  readonly positionType?: string;
  /** The sprite frame the game's code sets, from 1. */
  readonly frame?: number;
}

/** An exclusive group of the view: which member shows, and the widgets of each. */
export interface GroupState {
  readonly group: Group;
  /** The selector value whose member shows, `undefined` for none. */
  readonly chosen: string | undefined;
  /** Whether a hand toggle chose it rather than the selector. */
  readonly byHand: boolean;
  readonly members: readonly { readonly value: string; readonly widgets: readonly Widget[] }[];
}

export interface WindowView {
  readonly selectors: readonly SelectorState[];
  readonly groups: readonly GroupState[];
  /** The state of every widget of the window. */
  readonly widgets: ReadonlyMap<Widget, WidgetState>;
  /** How many hand toggles apply. */
  readonly handToggles: number;
  /** Whether a widget is drawn: created, shown, and so are all its parents. */
  drawn(widget: Widget): boolean;
}

const DEFAULT_STATE: WidgetState = {
  created: true,
  shown: true,
  profileShown: true,
  byHand: false,
  why: 'always shown',
};

/** The view of a window on a screen for a choice of selectors and toggles. */
export function evaluateView(
  profile: WindowProfile,
  window: Widget,
  screen: Screen,
  choice: ViewChoice = {},
): WindowView {
  const selectors = profile.selectors.map((selector) => selectorState(selector, screen, choice));
  const value = new Map(selectors.map((s) => [s.selector.id, s.value]));
  const states = new Map<Widget, WidgetState>();
  const update = (widget: Widget, change: Partial<WidgetState>): void => {
    const state = { ...(states.get(widget) ?? DEFAULT_STATE), ...change };
    states.set(widget, { ...state, profileShown: state.shown });
  };

  deriveFromScreen(window, screen, update);

  const groups: { group: Group; members: { value: string; widgets: readonly Widget[] }[] }[] = [];
  for (const group of profile.groups) {
    const chosen = value.get(group.selector);
    const label = labelOf(profile.selectors, group.selector);
    const members = group.members.map((member) => ({
      value: member.value,
      widgets: widgetsAt(window, member.path),
    }));
    for (const member of members) {
      for (const widget of member.widgets) {
        update(widget, { shown: member.value === chosen, why: `${label}: ${chosen ?? '?'}` });
      }
    }
    groups.push({ group, members });
  }

  for (const rule of profile.rules) {
    if (!rule.when.every((c) => c.values.includes(value.get(c.selector) ?? ''))) continue;
    const why = `rule ${rule.id}`;
    for (const ref of rule.show)
      for (const w of widgetsAt(window, ref.path)) update(w, { shown: true, why });
    for (const ref of rule.hide)
      for (const w of widgetsAt(window, ref.path)) update(w, { shown: false, why });
    for (const ref of rule.notCreated) {
      for (const w of widgetsAt(window, ref.path))
        update(w, { created: false, why: `not created (${why})` });
    }
    for (const ref of rule.position) {
      for (const w of widgetsAt(window, ref.path)) update(w, { positionType: ref.positionType });
    }
    for (const ref of rule.frame) {
      for (const w of widgetsAt(window, ref.path)) update(w, { frame: ref.frame });
    }
  }

  let handToggles = 0;
  for (const [path, shown] of Object.entries(choice.toggles ?? {})) {
    const widgets = widgetsAt(window, path);
    if (widgets.length === 0) continue;
    handToggles++;
    for (const widget of widgets) {
      const state = states.get(widget) ?? DEFAULT_STATE;
      if (!state.created) continue;
      states.set(widget, {
        ...state,
        shown,
        byHand: true,
        why: `by hand (profile: ${state.profileShown ? 'shown' : 'hidden'})`,
      });
    }
  }

  const stateOf = (widget: Widget): WidgetState => states.get(widget) ?? DEFAULT_STATE;
  const groupStates: GroupState[] = groups.map(({ group, members }) => {
    const shown = members.filter((m) => m.widgets.some((w) => stateOf(w).shown));
    const byHand = members.some((m) => m.widgets.some((w) => stateOf(w).byHand));
    return {
      group,
      chosen:
        shown.length === 1
          ? shown[0]?.value
          : shown.length === 0
            ? undefined
            : value.get(group.selector),
      byHand,
      members,
    };
  });

  const all = new Map<Widget, WidgetState>();
  for (const entry of windowPaths(window)) all.set(entry.widget, stateOf(entry.widget));
  const parents = new Map<Widget, Widget | undefined>();
  const list = windowPaths(window);
  for (const entry of list) parents.set(entry.widget, list[entry.parent]?.widget);
  const drawnCache = new Map<Widget, boolean>();
  const drawn = (widget: Widget): boolean => {
    const known = drawnCache.get(widget);
    if (known !== undefined) return known;
    const own = stateOf(widget);
    const parent = parents.get(widget);
    const result = own.created && own.shown && (parent === undefined || drawn(parent));
    drawnCache.set(widget, result);
    return result;
  };

  return { selectors, groups: groupStates, widgets: all, handToggles, drawn };
}

/** A selector's value: by hand, else live, else from the save, else the screen, else the default. */
function selectorState(selector: Selector, screen: Screen, choice: ViewChoice): SelectorState {
  const has = (id: string | undefined): id is string =>
    id !== undefined && selector.values.some((v) => v.id === id);
  if (selector.kind === 'resolution') {
    const fits = selector.values.find((v) => fitsScreen(v, screen));
    return fits === undefined
      ? { selector, value: selector.default, source: 'default' }
      : { selector, value: fits.id, source: 'auto' };
  }
  const own = choice.set?.[selector.id];
  if (has(own)) return { selector, value: own, source: 'you' };
  const live = choice.live?.[selector.id];
  if (has(live)) return { selector, value: live, source: 'live' };
  if (selector.kind === 'data' && selector.fact !== undefined) {
    const fact = choice.facts?.[selector.fact];
    if (has(fact)) return { selector, value: fact, source: 'save' };
  }
  return { selector, value: selector.default, source: 'default' };
}

function fitsScreen(value: SelectorValue, screen: Screen): boolean {
  return (
    (value.minWidth === undefined || screen.width >= value.minWidth) &&
    (value.maxWidth === undefined || screen.width <= value.maxWidth) &&
    (value.minHeight === undefined || screen.height >= value.minHeight) &&
    (value.maxHeight === undefined || screen.height <= value.maxHeight)
  );
}

/** The `_large` pairs and the engine's moves at this screen height. */
function deriveFromScreen(
  window: Widget,
  screen: Screen,
  update: (widget: Widget, change: Partial<WidgetState>) => void,
): void {
  const large = screen.height >= LARGE_FROM_HEIGHT;
  for (const { widget } of windowPaths(window)) {
    const names = new Map(widget.children.map((c) => [c.name?.toLowerCase(), c]));
    for (const child of widget.children) {
      const name = child.name?.toLowerCase();
      if (name === undefined || name.endsWith(LARGE_SUFFIX)) continue;
      const pair = names.get(name + LARGE_SUFFIX);
      if (pair === undefined) continue;
      if (large)
        update(child, { created: false, why: `not created from ${String(LARGE_FROM_HEIGHT)} px` });
      else
        update(pair, { created: false, why: `not created below ${String(LARGE_FROM_HEIGHT)} px` });
    }
  }
  const moves = ENGINE_MOVES.get(window.name?.toLowerCase() ?? '');
  for (const move of (large ? moves?.large : moves?.small) ?? []) {
    for (const widget of widgetsAt(window, move.path))
      update(widget, { positionType: move.positionType });
  }
}

function labelOf(selectors: readonly Selector[], id: string): string {
  return selectors.find((s) => s.id === id)?.label ?? id;
}

/** The view as layout takes it (`LayoutInput.view`). */
export function layoutViewOf(view: WindowView): LayoutView {
  return {
    shows: (widget) => {
      const state = view.widgets.get(widget);
      return state === undefined || (state.created && state.shown);
    },
    movedTo: (widget) => view.widgets.get(widget)?.positionType,
    frame: (widget) => view.widgets.get(widget)?.frame,
  };
}
