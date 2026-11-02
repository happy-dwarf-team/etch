/**
 * The visibility gate of Etch's own window profiles (ADR 0006, spec v2 section 14): for a capture
 * of a profiled window, the visibility the profile predicts at the view's selector values, for
 * every widget of the window, must match what the game showed. A widget the profile does not name
 * is drawn, so one the game hides in a capture fails until the profile says when the game hides it
 * (the 2.0.0 trial found the province view drawing widgets the game shows only in some views). The screen comes from the capture's size,
 * as the preview's `resolution` selectors take it. The texts the profile fills from the save are
 * reported against the capture's.
 */
import type { Screen, Widget } from '../model/gui.ts';
import {
  evaluateView,
  sampleData,
  windowPaths,
  type SaveChoice,
  type WindowProfile,
} from '../profile/index.ts';
import type { CapturedWidget } from './capture.ts';

/** A widget whose visibility the profile predicts otherwise than the game showed. */
export interface VisibilityMismatch {
  readonly path: string;
  /** Whether the game showed it (itself and its parents visible). */
  readonly game: boolean;
}

export interface VisibilityResult {
  /** The top-level window. */
  readonly window: string;
  /** How many widgets of the window the capture has and compares. */
  readonly compared: number;
  readonly mismatches: readonly VisibilityMismatch[];
}

/**
 * Compares a profile's prediction with one captured root window, widget by widget. A path the
 * capture lacks is left out, as the game's code may not have built it, and so is a text the game
 * showed empty, which draws nothing whether the profile shows it or not (`fort_number` without a
 * fort). So is a widget the game puts wholly outside the client area, with everything inside it:
 * Tongs ≥ 0.15 counts such a widget hidden for where it is (tongs#74), so whether the game's code
 * shows it is not known, and it draws nothing on the screen either way (Anbennar's `topbar_1` at
 * x 119415).
 */
export function profileVisibility(
  profile: WindowProfile,
  window: Widget,
  screen: Screen,
  selectors: Readonly<Record<string, string>>,
  root: CapturedWidget,
): VisibilityResult {
  const shown = new Map<string, boolean>();
  const empty = new Set<string>();
  const walk = (w: CapturedWidget, parent: boolean): void => {
    if (!w.visible && outside(w.rect, screen)) return;
    const visible = parent && w.visible;
    shown.set(w.path.toLowerCase(), visible);
    if (visible && w.text === '') empty.add(w.path.toLowerCase());
    for (const child of w.children ?? []) walk(child, visible);
  };
  walk(root, true);

  const view = evaluateView(profile, window, screen, { set: ownSelectors(profile, selectors) });
  let compared = 0;
  const mismatches: VisibilityMismatch[] = [];
  for (const entry of windowPaths(window)) {
    const game = shown.get(entry.path.toLowerCase());
    if (game === undefined || empty.has(entry.path.toLowerCase())) continue;
    compared++;
    if (view.drawn(entry.widget) !== game) mismatches.push({ path: entry.path, game });
  }
  return { window: profile.window, compared, mismatches };
}

/**
 * A rect Tongs counts hidden for where it is: one without a size placed outside the client area,
 * or one wholly outside it (`FitRects`).
 */
function outside(
  rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  screen: Screen,
): boolean {
  if (rect.w <= 0 || rect.h <= 0) {
    return rect.x < 0 || rect.y < 0 || rect.x > screen.width || rect.y > screen.height;
  }
  return (
    rect.x + rect.w <= 0 ||
    rect.y + rect.h <= 0 ||
    rect.x >= screen.width ||
    rect.y >= screen.height
  );
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
