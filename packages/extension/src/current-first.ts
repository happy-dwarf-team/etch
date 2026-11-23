// The order of Etch's pickers: the current value comes first, in a section that says what it is
// ("Current", "At the cursor"), and the other items follow as they were. `pick-current.ts` shows
// the list; this part has no `vscode`, so the unit tests run it.

/** What this module reads of a quick pick item: a `kind` of `SEPARATOR` starts a section. */
export interface Ordered {
  readonly label: string;
  readonly kind?: number;
}

/** `vscode.QuickPickItemKind.Separator`. */
export const SEPARATOR = -1;

export interface Sections {
  /** The current item's section, such as `Current` or `At the cursor`. */
  readonly current: string;
  /** The section of the items after it, where the list does not start with a section of its own. */
  readonly rest?: string;
}

/**
 * The items with `current` first, under its own section and taken out of where it was; a section
 * the move leaves empty goes too. `current` need not be one of the items (a custom size is not).
 * Without a current item the list stays as it is.
 */
export function currentFirst<T extends Ordered>(
  items: readonly T[],
  current: T | undefined,
  sections: Sections,
  separator: (label: string) => T,
): T[] {
  if (current === undefined) return [...items];
  const rest = withoutEmptySections(items.filter((item) => item !== current));
  const opensSection = rest[0]?.kind === SEPARATOR;
  const restSection =
    rest.length === 0 || opensSection || sections.rest === undefined
      ? []
      : [separator(sections.rest)];
  return [separator(sections.current), current, ...restSection, ...rest];
}

/** The list without separators that no item follows. */
function withoutEmptySections<T extends Ordered>(items: readonly T[]): T[] {
  return items.filter(
    (item, index) =>
      item.kind !== SEPARATOR || (index + 1 < items.length && items[index + 1]?.kind !== SEPARATOR),
  );
}

/**
 * The list with a typed item first (`offered`), without the items of the same label it stands for
 * and the sections that leaves empty.
 */
export function withOffered<T extends Ordered>(listed: readonly T[], offered: T | undefined): T[] {
  if (offered === undefined) return [...listed];
  return [
    offered,
    ...withoutEmptySections(
      listed.filter((item) => item.kind === SEPARATOR || item.label !== offered.label),
    ),
  ];
}
