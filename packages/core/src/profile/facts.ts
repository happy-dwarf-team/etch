/**
 * The facts a `data` selector can read (spec section 4, ADR 0006). Etch implements each one; a
 * profile can name only these, and a new fact needs an Etch release. A fact is read from the
 * chosen save, never computed the way the engine would (spec section 1): one the save does not
 * hold stays at the selector's default until the user sets it.
 */

export interface Fact {
  readonly name: string;
  /** Its values; a `data` selector that reads it has exactly these. */
  readonly values: readonly string[];
  /** What it means and where it comes from, for the documentation and the schema. */
  readonly description: string;
  /** Whether a text save holds it. */
  readonly inSave: boolean;
}

export const FACTS: readonly Fact[] = [
  {
    name: 'province.ownedByPlayer',
    values: ['yes', 'no'],
    description:
      "Whether the province's owner is the player's country: the save's `player` and the province's `owner` (etch#155).",
    inSave: true,
  },
  {
    name: 'province.owned',
    values: ['yes', 'no'],
    description:
      'Whether the province has an owner; an uncolonised one opens `colonisationpanel` instead (etch#155).',
    inSave: true,
  },
  {
    name: 'province.occupied',
    values: ['yes', 'no'],
    description: "Whether the province's `controller` is not its `owner`.",
    inSave: true,
  },
  {
    name: 'province.constructing',
    values: ['yes', 'no'],
    description:
      'Whether the province builds something: a `military_construction` or a building in construction.',
    inSave: true,
  },
  {
    name: 'province.hasGreatProjects',
    values: ['yes', 'no'],
    description: 'Whether the province lists `great_projects` (etch#155).',
    inSave: true,
  },
  {
    name: 'owner.buildsNativeBuildings',
    values: ['yes', 'no'],
    description:
      "Whether the owner builds native buildings, which the engine tests on the owner's government; a save does not say, so it stays at the selector's default.",
    inSave: false,
  },
];

const BY_NAME = new Map(FACTS.map((fact) => [fact.name, fact]));

/** The fact of a name, `undefined` when Etch does not implement it. */
export function factNamed(name: string): Fact | undefined {
  return BY_NAME.get(name);
}
