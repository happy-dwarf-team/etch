// What the user chose of a window's view (spec section 4, etch#159 variant D): the view picked in
// `View ▾`, the selectors set by hand and the hand toggles of the Widget Outline, kept per window
// while the preview is open, and the menu the webview draws from them. Plain data; no vscode.

import {
  windowPaths,
  type SavedView,
  type ViewChoice,
  type WindowProfile,
  type WindowView,
} from '@etch/core/profile';
import type { Widget } from '@etch/core';
import type { ViewAction, ViewMenu } from './protocol.ts';

export interface ChoiceState {
  /** The view last picked; the label says so while its selectors hold. */
  readonly view: string | undefined;
  /** Selector values set by hand or by the view (source `you`). */
  readonly set: Readonly<Record<string, string>>;
  /** Hand toggles by path. */
  readonly toggles: Readonly<Record<string, boolean>>;
}

/** The choice a window starts with: its profile's default view. */
export function initialChoice(profile: WindowProfile): ChoiceState {
  return viewChoice(profile, profile.defaultView);
}

function viewChoice(profile: WindowProfile, id: string | undefined): ChoiceState {
  const view = profile.views.find((v) => v.id === id);
  if (view === undefined) return { view: undefined, set: {}, toggles: {} };
  return {
    view: view.id,
    set: Object.fromEntries(view.set.map((s) => [s.selector, s.value])),
    toggles: Object.fromEntries(view.toggles.map((t) => [t.path, t.shown])),
  };
}

/** The choice as core's view evaluation takes it. */
export function viewChoiceOf(choice: ChoiceState): ViewChoice {
  return { set: choice.set, toggles: choice.toggles };
}

/** The choice after a click in `View ▾`; Save as view and Open profile change nothing here. */
export function applyViewAction(
  profile: WindowProfile,
  choice: ChoiceState,
  action: ViewAction,
): ChoiceState {
  switch (action.kind) {
    case 'chooseView':
      return viewChoice(profile, action.id);
    case 'select':
      return { ...choice, set: { ...choice.set, [action.selector]: action.value } };
    case 'release':
      return { ...choice, set: without(choice.set, [action.selector]) };
    case 'resetToggles':
      return { ...choice, toggles: {} };
    case 'saveView':
    case 'openProfile':
      return choice;
  }
}

/**
 * The choice after an eye of the Widget Outline: a toggle that agrees with the profile is not a
 * hand toggle, so it is dropped.
 */
export function toggleWidget(
  choice: ChoiceState,
  view: WindowView,
  window: Widget,
  widget: Widget,
  shown: boolean,
): ChoiceState {
  const path = pathOf(window, widget);
  const state = view.widgets.get(widget);
  if (path === undefined || state === undefined) return choice;
  const toggles = without(choice.toggles, [path]);
  if (state.profileShown !== shown) toggles[path] = shown;
  return { ...choice, toggles };
}

/**
 * The choice after a radio of an exclusive group: its member shows and the others are hidden, by
 * hand; choosing what the selector shows anyway drops the group's hand toggles.
 */
export function chooseMember(
  choice: ChoiceState,
  view: WindowView,
  window: Widget,
  group: string,
  value: string | undefined,
): ChoiceState {
  const state = view.groups.find((g) => g.group.id === group);
  if (state === undefined) return choice;
  const selected = view.selectors.find((s) => s.selector.id === state.group.selector)?.value;
  const members = state.members.flatMap((member) =>
    member.widgets.map((widget) => ({ value: member.value, path: pathOf(window, widget) })),
  );
  const toggles = without(
    choice.toggles,
    members.flatMap((m) => (m.path === undefined ? [] : [m.path])),
  );
  if (value !== selected) {
    for (const member of members) {
      if (member.path !== undefined) toggles[member.path] = member.value === value;
    }
  }
  return { ...choice, toggles };
}

/** A copy of a record without some keys. */
function without<T>(
  record: Readonly<Record<string, T>>,
  keys: readonly string[],
): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

/** A widget's path in its window, as profiles write it. */
export function pathOf(window: Widget, widget: Widget): string | undefined {
  return windowPaths(window).find((entry) => entry.widget === widget)?.path;
}

/** What Save as view writes: every selector but the resolution, and the hand toggles. */
export function savedView(label: string, view: WindowView, choice: ChoiceState): SavedView {
  return {
    label,
    set: Object.fromEntries(
      view.selectors
        .filter((s) => s.selector.kind !== 'resolution')
        .map((s) => [s.selector.id, s.value]),
    ),
    toggles: { ...choice.toggles },
  };
}

/** An id for a new view from its label, unlike the ids the profile has. */
export function viewId(label: string, profile: WindowProfile, mine: readonly string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'view';
  // A view of the mod project's own file of the same name is replaced; another layer's is not.
  if (mine.includes(base)) return base;
  let id = base;
  for (let n = 2; profile.views.some((v) => v.id === id); n++) id = `${base}-${String(n)}`;
  return id;
}

/** `View ▾` for a window's profile, view and choice. */
export function viewMenu(
  profile: WindowProfile,
  view: WindowView,
  choice: ChoiceState,
  canSave: boolean,
): ViewMenu {
  const value = new Map(view.selectors.map((s) => [s.selector.id, s.value]));
  const picked = profile.views.find((v) => v.id === choice.view);
  const holds = picked?.set.every((s) => value.get(s.selector) === s.value) === true;
  const current = holds ? picked : undefined;
  const name = current?.label ?? (profile.views.length === 0 ? 'Profile' : 'Custom view');
  const hand = view.handToggles;
  return {
    label: hand === 0 ? name : `${name} · ${String(hand)} by hand`,
    views: profile.views.map((v) => ({
      id: v.id,
      label: v.label,
      mine: v.origin.source === 'mod project',
      current: v.id === current?.id,
    })),
    selectors: view.selectors.map(({ selector, value: v, source }) => ({
      id: selector.id,
      label: selector.label,
      kind: selector.kind,
      value: v,
      source,
      values: selector.values.map((x) => ({ id: x.id, label: x.label })),
      ...(selector.note === undefined ? {} : { note: selector.note }),
    })),
    handToggles: hand,
    canSave,
  };
}
