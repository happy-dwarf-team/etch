/**
 * Widget paths in a window profile (ADR 0006): names from the top-level window down, joined by
 * `/`, never positions. `*` and `?` stand for any characters of one name, `**` for any number of
 * levels, and `[n]` picks one of siblings that share a name. Names are compared without regard to
 * case, as the game compares them. Paths are written as Tongs and the corpus write them
 * (`corpus/widget-path.ts`), whose patterns write any depth as `//`.
 */
import { matchesWidgetPattern, widgetPatternProblem } from '../corpus/widget-path.ts';
import type { Widget } from '../model/gui.ts';

/** A widget of a window and its path. */
export interface WindowPath {
  readonly widget: Widget;
  readonly path: string;
  /** Index of the parent in the list, −1 for the window. */
  readonly parent: number;
}

const paths = new WeakMap<Widget, readonly WindowPath[]>();

/** Every widget of a window with its path, the window first, parents before children. */
export function windowPaths(window: Widget): readonly WindowPath[] {
  const known = paths.get(window);
  if (known !== undefined) return known;
  const list: WindowPath[] = [];
  const walk = (widget: Widget, path: string, parent: number): void => {
    const index = list.length;
    list.push({ widget, path, parent });
    widget.children.forEach((child, position) => {
      walk(child, `${path}/${stepOf(widget.children, position)}`, index);
    });
  };
  walk(window, stepOf([window], 0), -1);
  paths.set(window, list);
  return list;
}

/** A widget's path step among its siblings, as Tongs writes it. */
function stepOf(siblings: readonly Widget[], position: number): string {
  const name = siblings[position]?.name ?? '';
  if (name === '' || /[\s/[\]*?"]/.test(name)) return `[${String(position + 1)}]`;
  const key = name.toLowerCase();
  const same = siblings.filter((s) => s.name?.toLowerCase() === key);
  if (same.length < 2) return name;
  return `${name}[${String(same.indexOf(siblings[position] as Widget) + 1)}]`;
}

/** A profile path as a corpus widget pattern, or why it is not a path. */
export function profilePattern(path: string): { pattern: string } | { problem: string } {
  const steps = path.split('/');
  const out: string[] = [];
  let deep = false;
  for (const step of steps) {
    if (step === '**') {
      if (deep) return { problem: `"${path}" has "**" twice in a row.` };
      deep = true;
      continue;
    }
    if (step.includes('**')) return { problem: `"**" is a step of its own in "${path}".` };
    out.push(deep && out.length > 0 ? `/${step}` : step);
    if (deep && out.length === 1) out[0] = `//${step}`;
    deep = false;
  }
  // A trailing `**` is everything below.
  if (deep) out.push(out.length === 0 ? '//*' : '/*');
  const pattern = out.join('/');
  const problem = widgetPatternProblem(pattern);
  return problem === undefined ? { pattern } : { problem };
}

/** The widgets of a window a profile path names, in tree order; none for a path with a problem. */
export function widgetsAt(window: Widget, path: string): Widget[] {
  const compiled = profilePattern(path);
  if ('problem' in compiled) return [];
  return windowPaths(window)
    .filter((entry) => matchesWidgetPattern(compiled.pattern, entry.path))
    .map((entry) => entry.widget);
}
