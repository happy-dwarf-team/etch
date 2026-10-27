/**
 * Checking the corpus files, which are JSON written by hand (the manifest) or by the capture
 * driver (capture records). Every problem is collected with where it is, as `windows[2].id`, so
 * one run reports all of them.
 */

export interface CorpusProblem {
  /** Where the problem is: a field path such as `windows[2].views[0].recipe`; empty for the root. */
  readonly at: string;
  readonly message: string;
}

export type Json = Record<string, unknown>;

/** Uppercase hexadecimal SHA-256, as Etch writes `eu4.exe`'s hash. */
export const SHA256 = /^[0-9A-F]{64}$/;
/** An id used in file names: lowercase words joined by `-`. */
export const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class Checker {
  readonly problems: CorpusProblem[] = [];

  fail(at: string, message: string): void {
    this.problems.push({ at, message });
  }

  /** An object with exactly the given required keys and any of the optional ones. */
  object(
    value: unknown,
    at: string,
    required: readonly string[],
    optional: readonly string[] = [],
  ): Json | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.fail(at, 'Expected an object.');
      return undefined;
    }
    const json = value as Json;
    for (const key of Object.keys(json)) {
      if (!required.includes(key) && !optional.includes(key)) {
        this.fail(field(at, key), `Unknown field "${key}".`);
      }
    }
    for (const key of required) {
      if (!(key in json)) this.fail(at, `Missing field "${key}".`);
    }
    return json;
  }

  /** An object used as a map: any keys, each value checked by the caller. */
  map(value: unknown, at: string): Json | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.fail(at, 'Expected an object.');
      return undefined;
    }
    return value as Json;
  }

  // The checks below say nothing about a missing value: `object` has reported it.

  /** An array, each item checked by `item`; `nonEmpty` asks for at least one. */
  array<T>(
    value: unknown,
    at: string,
    item: (value: unknown, at: string) => T | undefined,
    nonEmpty = false,
  ): T[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      this.fail(at, 'Expected an array.');
      return undefined;
    }
    if (nonEmpty && value.length === 0) this.fail(at, 'Expected at least one item.');
    const items: T[] = [];
    value.forEach((v: unknown, i) => {
      const checked = item(v, `${at}[${String(i)}]`);
      if (checked !== undefined) items.push(checked);
    });
    return items;
  }

  string(value: unknown, at: string, pattern?: RegExp, what?: string): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.trim() === '') {
      this.fail(at, 'Expected a non-empty string.');
      return undefined;
    }
    if (pattern !== undefined && !pattern.test(value)) {
      this.fail(at, `"${value}" is not ${what ?? `a match of ${String(pattern)}`}.`);
      return undefined;
    }
    return value;
  }

  boolean(value: unknown, at: string): boolean | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    this.fail(at, 'Expected true or false.');
    return undefined;
  }

  integer(value: unknown, at: string, min?: number): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      this.fail(at, 'Expected an integer.');
      return undefined;
    }
    if (min !== undefined && value < min) {
      this.fail(at, `Expected at least ${String(min)}.`);
      return undefined;
    }
    return value;
  }

  oneOf<T extends string>(value: unknown, at: string, options: readonly T[]): T | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'string' && (options as readonly string[]).includes(value)) {
      return value as T;
    }
    this.fail(at, `Expected one of ${options.map((o) => `"${o}"`).join(', ')}.`);
    return undefined;
  }

  /** Reports every value that occurs more than once, at its second place. */
  unique(
    values: readonly (string | undefined)[],
    at: (index: number) => string,
    what: string,
  ): void {
    const seen = new Set<string>();
    values.forEach((value, i) => {
      if (value === undefined) return;
      if (seen.has(value)) this.fail(at(i), `The ${what} "${value}" occurs more than once.`);
      seen.add(value);
    });
  }
}

/** `at` extended by a field name. */
export function field(at: string, key: string): string {
  return at === '' ? key : `${at}.${key}`;
}
