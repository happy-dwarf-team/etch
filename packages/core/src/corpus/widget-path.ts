/**
 * Widget paths as Tongs reports them, and the patterns the corpus manifest uses to name widgets
 * in them (etch#41). A path is the `.gui` names from a top-level window down, joined by `/`, with
 * `[n]` where siblings share a name and a bare `[n]` for a widget without a usable name:
 * `countryview/tabs/court_tab`, `outliner/entries[2]`, `menubar/[3]`.
 *
 * A pattern is the part of Tongs' selector syntax that names widgets: steps joined by `/`, `//`
 * for any depth (`EventWindow//event_option_button`, or `//DateText` anywhere), names ignoring
 * case with `*` and `?`, and an optional `[n]`. A step without `[n]` matches every sibling of
 * that name. Tongs' filters (`[type=…]`, `[text=…]`, …) are not part of a pattern: they depend on
 * the game's state and language.
 */

interface PatternStep {
  /** Whether the step may match any number of levels below the previous one (`//`). */
  readonly deep: boolean;
  readonly name: RegExp;
  /** The name in lower case when it has no wildcard, compared without the expression. */
  readonly literal: string | undefined;
  /** The `[n]` the step asks for, or `undefined` for any. */
  readonly index: number | undefined;
}

/** A step of a widget path: its name and `[n]`. */
export interface PathStep {
  readonly name: string;
  readonly index: number | undefined;
}

const STEP = /^([^[\]/]*)(?:\[([1-9]\d*)\])?$/;

/** Why a pattern cannot be used, or `undefined` when it can. */
export function widgetPatternProblem(pattern: string): string | undefined {
  const steps = compile(pattern);
  return typeof steps === 'string' ? steps : undefined;
}

/**
 * Whether a widget path, split by `splitWidgetPath` once, matches a pattern; for matching many
 * paths of a window against many patterns (a window profile). A pattern ends at the path's last
 * step, so that step is compared first.
 */
export function matchesSplitWidgetPath(pattern: string, parts: readonly PathStep[]): boolean {
  const steps = compile(pattern);
  if (typeof steps === 'string') return false;
  const last = steps[steps.length - 1];
  const end = parts[parts.length - 1];
  if (last === undefined || end === undefined || !stepMatches(last, end)) return false;
  return matchFrom(steps, 0, parts, 0);
}

/** Whether a widget path matches a pattern; `false` for a pattern that cannot be used. */
export function matchesWidgetPattern(pattern: string, path: string): boolean {
  const steps = compile(pattern);
  if (typeof steps === 'string') return false;
  const parts = splitWidgetPath(path);
  return parts !== undefined && matchFrom(steps, 0, parts, 0);
}

/**
 * A widget path split into its steps, or `undefined` when it is not one: empty steps, a stray
 * bracket or wildcard.
 */
export function splitWidgetPath(path: string): PathStep[] | undefined {
  if (path === '') return undefined;
  const steps: PathStep[] = [];
  for (const part of path.split('/')) {
    const match = STEP.exec(part);
    if (!match || /[*?]/.test(part)) return undefined;
    const name = match[1] ?? '';
    const index = match[2] === undefined ? undefined : Number(match[2]);
    if (name === '' && index === undefined) return undefined;
    steps.push({ name, index });
  }
  return steps;
}

/** The path of a widget's parent, or `undefined` for a top-level window. */
export function parentWidgetPath(path: string): string | undefined {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? undefined : path.slice(0, slash);
}

const compiled = new Map<string, PatternStep[] | string>();

function compile(pattern: string): PatternStep[] | string {
  const known = compiled.get(pattern);
  if (known !== undefined) return known;
  const result = compileUncached(pattern);
  compiled.set(pattern, result);
  return result;
}

function compileUncached(pattern: string): PatternStep[] | string {
  if (pattern.trim() !== pattern || pattern === '')
    return 'A pattern is not empty and has no surrounding spaces.';
  const steps: PatternStep[] = [];
  let rest = pattern;
  let deep = false;
  if (rest.startsWith('//')) {
    deep = true;
    rest = rest.slice(2);
  }
  for (const part of rest.split('/')) {
    if (part === '') {
      if (deep) return `"${pattern}" has more than two slashes in a row.`;
      deep = true;
      continue;
    }
    const match = STEP.exec(part);
    if (!match) return `"${part}" in "${pattern}" is not a name with an optional [n].`;
    const name = match[1] ?? '';
    if (name === '' && match[2] === undefined) return `"${pattern}" has an empty step.`;
    steps.push({
      deep,
      name: wildcard(name),
      literal: name === '' || /[*?]/.test(name) ? undefined : name.toLowerCase(),
      index: match[2] === undefined ? undefined : Number(match[2]),
    });
    deep = false;
  }
  if (deep) return `"${pattern}" ends with a slash.`;
  return steps;
}

/** A name with `*` and `?` as a case-insensitive regular expression; an empty name is `*`. */
function wildcard(name: string): RegExp {
  if (name === '') return /^.*$/;
  const source = name
    .split('')
    .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${source}$`, 'i');
}

function matchFrom(
  steps: readonly PatternStep[],
  s: number,
  parts: readonly PathStep[],
  p: number,
): boolean {
  if (s === steps.length) return p === parts.length;
  const step = steps[s];
  if (step === undefined) return false;
  const last = step.deep ? parts.length - 1 : p;
  for (let at = p; at <= last; at++) {
    const part = parts[at];
    if (part === undefined) return false;
    if (stepMatches(step, part) && matchFrom(steps, s + 1, parts, at + 1)) return true;
  }
  return false;
}

function stepMatches(step: PatternStep, part: PathStep): boolean {
  if (step.index !== undefined && step.index !== part.index) return false;
  return step.literal === undefined
    ? step.name.test(part.name)
    : step.literal.length === part.name.length && step.literal === part.name.toLowerCase();
}
