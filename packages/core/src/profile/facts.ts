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
  /** A number, which a rule's `slider` reads, rather than one of `values` (none then). */
  readonly numeric?: boolean;
}

/**
 * The base game's institutions in the order of its `common/institutions`, which the save's
 * `institutions` of a country follows; Anbennar keeps the same eight.
 */
export const BASE_INSTITUTIONS = [
  'feudalism',
  'renaissance',
  'new_world_i',
  'printing_press',
  'global_trade',
  'manufactories',
  'enlightenment',
  'industrialization',
] as const;

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
    name: 'province.hasFort',
    values: ['yes', 'no'],
    description:
      "Whether the province's `buildings` hold a fort (a building whose name starts with `fort_`), which hides its no-fort icon.",
    inSave: true,
  },
  {
    name: 'province.isCapital',
    values: ['yes', 'no'],
    description:
      "Whether the province is its owner's capital: the owner's `capital` is the province. The game then shows `have_capital` instead of `move_capital`.",
    inSave: true,
  },
  {
    name: 'province.isTradePort',
    values: ['yes', 'no'],
    description:
      "Whether the province is its owner's trade port: the owner's `trade_port` is the province. The game then shows `have_trade_port` instead of `move_trade_port`.",
    inSave: true,
  },
  {
    name: 'province.parliamentSeat',
    values: ['seat', 'noSeat', 'none'],
    description:
      "The province in its owner's parliament: `seat` when it has a `seat_in_parliament`, `noSeat` when the owner has a `parliament` and the province no seat, `none` when the owner has no parliament.",
    inSave: true,
  },
  {
    name: 'province.centerOfTrade',
    values: ['yes', 'no'],
    description:
      'Whether the province is a centre of trade: its `center_of_trade` level is above 0.',
    inSave: true,
  },
  {
    name: 'game.cradleOfCivilization',
    values: ['yes', 'no'],
    description:
      "Whether the DLC Cradle of Civilization is active: the save's `dlc_enabled` lists it. `eu4.exe` shows the exploit development buttons, and places the province view's base values, by its flag (`0x233FF24`, the DLC table at `0x1FD4CE0`).",
    inSave: true,
  },
  {
    name: 'country.religionIcon',
    values: ['none', 'secondary', 'school'],
    description:
      "Which religion icon the diplomacy view shows beside the chosen country's name: its secondary religion (the save's `secondary_religion`), else with Cradle of Civilization its religious school (`religious_school`), else none. Without either `eu4.exe` moves `label_nation` and `label_fog` 20 px left (GOG 1.37.5.2 0xEFC380, 0xEFC40D). The lobby's country panel shows only a secondary religion: without one it hides `secondary_religion_icon` and moves `religion_icon` 18 px down (Steam 1.37.5 0x11199A0).",
    inSave: true,
  },
  {
    name: 'country.institution',
    values: [...BASE_INSTITUTIONS, 'none'],
    description:
      "The institution the technology view's institutions window opens on: the first one the chosen country has not embraced, by the save's `institutions` (one 0 or 1 an institution, in the order of `common/institutions`, which the base game and Anbennar share), `none` when it has embraced them all. `eu4.exe` walks the institutions in that order when the window opens and selects the first one not embraced (Steam 1.37.5 0x1018150), which writes its bonus in `when_embraced` (0x1017C50); a click on another institution's icon selects that one.",
    inSave: true,
  },
  {
    name: 'country.patriarchAuthority',
    values: [],
    description:
      "The chosen country's patriarch authority, from 0 to 1: the save's `patriarch_authority`. The religion view's slider places `current_patriarch_authority` by it (Steam 1.37.5 0xFE8190, 0x1488BC0).",
    inSave: true,
    numeric: true,
  },
  {
    name: 'province.hreIndicator',
    values: ['yes', 'no'],
    description:
      "Whether the game shows the province's Holy Roman Empire indicator: the empire exists and the province can be part of it (in the Anbennar playset, its Empire). The map decides that, not the save, so it stays at the selector's default.",
    inSave: false,
  },
  {
    name: 'province.colonialRegion',
    values: ['none', 'region', 'claimed'],
    description:
      "What the colonisation panel writes in `region_text` for an uncolonised province: `none` outside a colonial region (no text), `region` in one (a line break, the region's name and a space), `claimed` when the player's religion has a papacy and the Pope has granted the region to a country (then also `PAPAL_GRANT` with the country's name and flag). `eu4.exe` decides it from the map's colonial regions and the papacy's `colony_claim` (Steam 1.37.5 0xE31A50); the save does not hold the province's region, so it stays at the selector's default.",
    inSave: false,
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
