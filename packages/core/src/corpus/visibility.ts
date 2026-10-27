/**
 * The visibility gate of Etch's own window profiles (ADR 0006, spec v2 section 14): for a capture
 * of a profiled window, the visibility the profile predicts at the view's selector values, for
 * each path it names, must match what the game showed. The screen comes from the capture's size,
 * as the preview's `resolution` selectors take it. The texts the profile fills from the save are
 * reported against the capture's.
 */
import type { Screen, Widget } from '../model/gui.ts';
import {
  evaluateView,
  sampleData,
  widgetsAt,
  windowPaths,
  type SaveChoice,
  type WindowProfile,
} from '../profile/index.ts';
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

  const view = evaluateView(profile, window, screen, { set: ownSelectors(profile, selectors) });
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

/** The selector values a profile has; a view's values for other windows' selectors are left out. */
function ownSelectors(
  profile: WindowProfile,
  selectors: Readonly<Record<string, string>>,
): Record<string, string> {
  const own = new Set(profile.selectors.map((s) => s.id));
  return Object.fromEntries(Object.entries(selectors).filter(([id]) => own.has(id)));
}

/** A text the profile fills from the save that is not the capture's. */
export interface SaveTextDifference {
  readonly path: string;
  /** The save layer's text, as the preview shows it. */
  readonly sample: string;
  /** The capture's text. */
  readonly game: string;
  /** The save path it comes from. */
  readonly from: string;
}

export interface SaveTextReport {
  readonly window: string;
  /** Texts the profile fills from the save that the game showed. */
  readonly compared: number;
  readonly matched: number;
  readonly differences: readonly SaveTextDifference[];
}

/**
 * The texts a profile's `save` sources fill, for the save, country and province the view shows,
 * against the capture's texts (spec v2 section 14: reported, not gated). Only texts the profile's
 * view draws and the game showed are compared; list rows are left out.
 */
export function profileSaveTexts(
  profile: WindowProfile,
  window: Widget,
  screen: Screen,
  selectors: Readonly<Record<string, string>>,
  save: SaveChoice,
  localise: (key: string) => string | undefined,
  root: CapturedWidget,
): SaveTextReport {
  const game = new Map<string, string>();
  const walk = (w: CapturedWidget, parent: boolean): void => {
    const visible = parent && w.visible;
    if (visible && w.text !== undefined) game.set(w.path.toLowerCase(), w.text);
    for (const child of w.children ?? []) walk(child, visible);
  };
  walk(root, true);
  const view = evaluateView(profile, window, screen, { set: ownSelectors(profile, selectors) });
  const sample = sampleData(profile, window, view, { save, localise, length: 'typical' });
  let compared = 0;
  let matched = 0;
  const differences: SaveTextDifference[] = [];
  for (const entry of windowPaths(window)) {
    if (!view.drawn(entry.widget)) continue;
    const text = sample.text(entry.widget);
    if (text?.layer !== 'save') continue;
    const shown = game.get(entry.path.toLowerCase());
    if (shown === undefined) continue;
    compared++;
    if (normalise(shown) === normalise(text.text)) matched++;
    else differences.push({ path: entry.path, sample: text.text, game: shown, from: text.detail });
  }
  return { window: profile.window, compared, matched, differences };
}

/** Texts compared as shown: runs of white space as one space, trimmed. */
function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
