/**
 * The capture driver's command line arguments (`cli.ts`), apart from the command itself so that
 * they can be tested without starting it.
 */
import type { RecipeStart } from '../manifest.ts';
import { DEFAULT_AWAY, type AwayPoint } from './view.ts';

/** The command and its `--name value` flags; a flag without a value is `'true'`. */
export function parseArgs(argv: readonly string[]): {
  command: string;
  flags: Map<string, string>;
} {
  const [command = 'help', ...rest] = argv;
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] ?? '';
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) flags.set(arg.slice(2), 'true');
    else {
      flags.set(arg.slice(2), next);
      i++;
    }
  }
  return { command, flags };
}

/** A comma-separated list without empty items, `undefined` without the flag. */
export function list(value: string | undefined): string[] | undefined {
  return value === undefined
    ? undefined
    : value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
}

/** A `WxH` size, such as `--monitor 3440x1440`. */
export function size(value: string, what: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (match === null) throw new Error(`${what} must be WxH, such as 3440x1440.`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** A flag that must have a value. */
export function required(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value === 'true') throw new Error(`--${name} is required.`);
  return value;
}

/** `--lock-minutes`: how long the game lock is taken for, 240 by default and at most. */
export function lockMinutes(flags: ReadonlyMap<string, string>): number {
  const minutes = Number(flags.get('lock-minutes') ?? '240');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
    throw new Error('--lock-minutes must be a whole number of minutes from 1 to 240.');
  }
  return minutes;
}

/** `--away-menu x,y` as fractions of the client area, `--away-save` as a widget pattern. */
export function away(flags: ReadonlyMap<string, string>): Record<RecipeStart, AwayPoint> {
  const menu = flags.get('away-menu');
  let fraction = DEFAULT_AWAY['main-menu'];
  if (menu !== undefined) {
    const [x, y] = menu.split(',').map(Number);
    if (x === undefined || y === undefined || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) {
      throw new Error('--away-menu must be two fractions of the client area, such as 1,1.');
    }
    fraction = { fraction: { x, y } };
  }
  const save = flags.get('away-save');
  if (save === 'true') throw new Error('--away-save needs a widget pattern.');
  return { 'main-menu': fraction, save: save !== undefined ? { widget: save } : DEFAULT_AWAY.save };
}
