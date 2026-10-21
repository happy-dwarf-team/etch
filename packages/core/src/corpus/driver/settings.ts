/**
 * The capturing profile's display settings for one resolution (etch#18, corpus/README.md "how a
 * size is set"). After its first start in a profile the game takes the size from
 * `pdx_settings.txt`, so each session writes both files as named variants of named baselines and
 * puts the baselines back afterwards:
 *
 * - a size below the monitor's: `windowed_resolution` = `WxH` and `display_mode` = `windowed`,
 *   which give exactly that client area;
 * - the monitor's own size: `display_mode` = `borderless_fullscreen`, which fills the monitor.
 *
 * Exclusive full screen is never used, because it changes the monitor's mode.
 */
import type { Screen } from '../../model/gui.ts';
import { resolutionKey } from '../manifest.ts';

export type DisplayMode = 'windowed' | 'borderless';

/** Windowed below the monitor's size, borderless at it; other sizes cannot be captured. */
export function displayModeFor(resolution: Screen, monitor: Screen): DisplayMode {
  if (resolution.width === monitor.width && resolution.height === monitor.height) {
    return 'borderless';
  }
  if (resolution.width <= monitor.width && resolution.height <= monitor.height) return 'windowed';
  throw new Error(
    `${resolutionKey(resolution)} does not fit the ${resolutionKey(monitor)} monitor; a client area larger than the monitor cannot be captured.`,
  );
}

/** The name of a variant file: `settings-1920x1080-windowed.txt`. */
export function variantName(
  base: 'settings' | 'pdx-settings',
  resolution: Screen,
  mode: DisplayMode,
): string {
  return `${base}-${resolutionKey(resolution)}-${mode}.txt`;
}

/**
 * `settings.txt` for a size: the baseline with `graphics.size`, `fullScreen` and `borderless`
 * replaced. Throws when the baseline lacks one of them, rather than writing a file the game would
 * read differently.
 */
export function settingsVariant(baseline: string, resolution: Screen, mode: DisplayMode): string {
  const replace = (text: string, pattern: RegExp, value: string, what: string): string => {
    if (!pattern.test(text)) throw new Error(`The settings.txt baseline has no ${what}.`);
    return text.replace(pattern, (_, before: string) => `${before}${value}`);
  };
  let text = replace(
    baseline,
    /(graphics=\{\s*size=\{\s*x=)\d+/,
    String(resolution.width),
    'graphics.size.x',
  );
  text = replace(
    text,
    /(graphics=\{\s*size=\{\s*x=\d+\s*y=)\d+/,
    String(resolution.height),
    'graphics.size.y',
  );
  text = replace(text, /(^\s*fullScreen=)\w+/m, 'no', 'graphics.fullScreen');
  return replace(
    text,
    /(^\s*borderless=)\w+/m,
    mode === 'borderless' ? 'yes' : 'no',
    'graphics.borderless',
  );
}

/**
 * `pdx_settings.txt` for a size. With a baseline (the file the game wrote at the profile's first
 * start), only `windowed_resolution` and `display_mode` change; without one, the file holds just
 * the `Graphics` block the game writes.
 */
export function pdxSettingsVariant(
  baseline: string | undefined,
  resolution: Screen,
  mode: DisplayMode,
): string {
  const size = resolutionKey(resolution);
  const display = mode === 'borderless' ? 'borderless_fullscreen' : 'windowed';
  if (baseline === undefined) {
    const entry = (name: string, value: string): string =>
      `\t"${name}"={\n\t\tvalue="${value}"\n\t\tversion=0\n\t}\n`;
    return `"Graphics"={\n${entry('fullscreen_resolution', size)}${entry('windowed_resolution', size)}${entry('display_mode', display)}}\n`;
  }
  const replace = (text: string, name: string, value: string): string => {
    const pattern = new RegExp(`("${name}"=\\{\\s*value=")[^"]*`);
    if (!pattern.test(text)) throw new Error(`The pdx_settings.txt baseline has no ${name}.`);
    return text.replace(pattern, (_, before: string) => `${before}${value}`);
  };
  return replace(replace(baseline, 'windowed_resolution', size), 'display_mode', display);
}

/** Lines of `settings.txt` the game may change by itself at a start (the lab's start-up procedure). */
const ALLOWED_CHANGES = /^\s*(refreshRate|graceful_exit)=/;

/**
 * The lines in which the file after a session differs from the variant the session started with,
 * as `- line` (only in the variant) and `+ line` (only after), leaving out `refreshRate` and
 * `graceful_exit`, which the game rewrites itself.
 */
export function unexpectedChanges(
  variant: string,
  after: string,
  allowed = ALLOWED_CHANGES,
): string[] {
  const lines = (text: string): string[] =>
    text.split(/\r?\n/).filter((line) => line.trim() !== '' && !allowed.test(line));
  const before = lines(variant);
  const now = lines(after);
  const removed = multisetMinus(before, now).map((l) => `- ${l}`);
  const added = multisetMinus(now, before).map((l) => `+ ${l}`);
  return [...removed, ...added];
}

function multisetMinus(a: readonly string[], b: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const line of b) left.set(line, (left.get(line) ?? 0) + 1);
  return a.filter((line) => {
    const n = left.get(line) ?? 0;
    if (n === 0) return true;
    left.set(line, n - 1);
    return false;
  });
}
