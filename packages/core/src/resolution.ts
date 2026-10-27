/**
 * The preview resolution (spec section 6): the screen size the offline renderer lays a window out
 * on and evaluates `if_resolution` blocks against. It is one of the corpus resolutions, the
 * monitor's native resolution or a custom size; by default the resolution of the player's
 * `settings.txt`, else the native one. UI scale is 1.0 only, so the screen is the resolution.
 */

import type { Screen } from './model/gui.ts';

/**
 * The resolutions of the precision corpus (ADR 0002, etch#10, etch#163), smallest first; the
 * preview offers each of them.
 */
export const CORPUS_RESOLUTIONS: readonly Screen[] = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
  { width: 1680, height: 1050 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3440, height: 1440 },
  { width: 3840, height: 2160 },
];

/**
 * Corpus resolutions no capture has checked yet: 3840×2160 does not fit the lab's monitors
 * (etch#163), so the preview at it is not measured against the game.
 */
export const UNCHECKED_RESOLUTIONS: readonly Screen[] = [{ width: 3840, height: 2160 }];

/** The screen while neither the player's settings nor the monitor say another. */
export const FALLBACK_SCREEN: Screen = { width: 1920, height: 1080 };

/** The smallest and largest side of a custom resolution, in pixels. */
export const MIN_RESOLUTION_SIDE = 16;
export const MAX_RESOLUTION_SIDE = 16384;

/** What the resolution setting asks for. */
export type ResolutionChoice =
  /** The player's `settings.txt`, else the monitor's native resolution. */
  | { readonly kind: 'default' }
  | { readonly kind: 'native' }
  /** A corpus resolution or any other width × height. */
  | { readonly kind: 'size'; readonly screen: Screen };

/** Where the preview resolution came from. */
export type ResolutionSource = 'setting' | 'settings.txt' | 'native' | 'fallback';

export interface PreviewResolution {
  readonly screen: Screen;
  readonly source: ResolutionSource;
}

/** What the preview knows about the player and the monitor. */
export interface ResolutionContext {
  /** The resolution in the player's `settings.txt`, when it has one. */
  readonly player?: Screen | undefined;
  /** The monitor's native resolution, once the preview has seen it. */
  readonly native?: Screen | undefined;
}

/**
 * Reads the resolution setting: `default`, `native`, or a size written as `1920x1080` (also with
 * `×` or `*`, spaces and any case). `undefined` for anything else or a side out of range.
 */
export function parseResolution(value: string): ResolutionChoice | undefined {
  const text = value.trim().toLowerCase();
  if (text === '' || text === 'default') return { kind: 'default' };
  if (text === 'native') return { kind: 'native' };
  const match = /^(\d+)\s*[x×*]\s*(\d+)$/.exec(text);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!isSide(width) || !isSide(height)) return undefined;
  return { kind: 'size', screen: { width, height } };
}

/** The setting's value for a choice: `default`, `native` or `1920x1080`. */
export function resolutionSetting(choice: ResolutionChoice): string {
  return choice.kind === 'size'
    ? `${String(choice.screen.width)}x${String(choice.screen.height)}`
    : choice.kind;
}

/** A screen as people read it: `1920×1080`. */
export function formatResolution(screen: Screen): string {
  return `${String(screen.width)}×${String(screen.height)}`;
}

/**
 * The preview resolution for a choice. The default takes the player's resolution, else the
 * native one; a choice that needs the native resolution before the preview has seen the monitor
 * takes the fallback screen.
 */
export function choosePreviewResolution(
  choice: ResolutionChoice,
  context: ResolutionContext,
): PreviewResolution {
  if (choice.kind === 'size') return { screen: choice.screen, source: 'setting' };
  if (choice.kind === 'default' && context.player !== undefined) {
    return { screen: context.player, source: 'settings.txt' };
  }
  if (context.native !== undefined) return { screen: context.native, source: 'native' };
  return { screen: FALLBACK_SCREEN, source: 'fallback' };
}

/** Whether a number can be a side of a preview resolution. */
export function isSide(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_RESOLUTION_SIDE && value <= MAX_RESOLUTION_SIDE;
}
