/**
 * The visibility gate of Etch's own window profiles (ADR 0006, spec v2 section 14): for a capture
 * of a profiled window, the visibility the profile predicts at the view's selector values, for
 * each path it names, must match what the game showed. The screen comes from the capture's size,
 * as the preview's `resolution` selectors take it.
 */
import type { Screen, Widget } from '../model/gui.ts';
import { evaluateView, widgetsAt, windowPaths, type WindowProfile } from '../profile/index.ts';
import type { CapturedWidget } from './capture.ts';

/** A path the profile names whose visibility the game did not show. */
export interface VisibilityMismatch {
  readonly path: string;
  /** Whether the game showed it (itself and its parents visible). */
  readonly game: boolean;
}

export interface VisibilityResult {
  /** The top-level window. */
  readonly window: string;
  /** How many paths the profile names and the capture has. */
  readonly compared: number;
  readonly mismatches: readonly VisibilityMismatch[];
}

/**
 * Compares a profile's prediction with one captured root window. Only the paths the profile names
 * (in its rules' `show`, `hide` and `notCreated`, and its groups' members) are compared; a path the
 * capture lacks is left out, as the game's code may not have built it.
 */
export function profileVisibility(
  profile: WindowProfile,
  window: Widget,
  screen: Screen,
  selectors: Readonly<Record<string, string>>,
  root: CapturedWidget,
): VisibilityResult {
  const shown = new Map<string, boolean>();
  const walk = (w: CapturedWidget, parent: boolean): void => {
    const visible = parent && w.visible;
    shown.set(w.path.toLowerCase(), visible);
    for (const child of w.children ?? []) walk(child, visible);
  };
  walk(root, true);

  const own = new Set(profile.selectors.map((s) => s.id));
  const set = Object.fromEntries(Object.entries(selectors).filter(([id]) => own.has(id)));
  const view = evaluateView(profile, window, screen, { set });
  const named = new Set<Widget>();
  for (const rule of profile.rules) {
    for (const ref of [...rule.show, ...rule.hide, ...rule.notCreated]) {
      for (const w of widgetsAt(window, ref.path)) named.add(w);
    }
  }
  for (const group of profile.groups) {
    for (const member of group.members) {
      for (const w of widgetsAt(window, member.path)) named.add(w);
    }
  }
  let compared = 0;
  const mismatches: VisibilityMismatch[] = [];
  for (const entry of windowPaths(window)) {
    if (!named.has(entry.widget)) continue;
    const game = shown.get(entry.path.toLowerCase());
    if (game === undefined) continue;
    compared++;
    if (view.drawn(entry.widget) !== game) mismatches.push({ path: entry.path, game });
  }
  return { window: profile.window, compared, mismatches };
}
