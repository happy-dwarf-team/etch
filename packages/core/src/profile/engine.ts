/**
 * What the game's code does to a window by the screen height alone, which Etch derives itself so
 * that a profile need not write it (spec section 3, ADR 0006), and for a window without a profile
 * too: the game does it whatever profile Etch has (etch#272).
 *
 * - **`_large` pairs.** Of two sibling widgets `X` and `X_large` the game creates only one: below
 *   814 px of client height the small one, from 814 px the large one (`0x32e` in the province
 *   view's setup and its building variant pickers, etch#155; the corpus captures agree).
 * - **`positionType` moves** the game's code makes, by window, from the same test.
 */

/** The client height from which the game takes the large variants and moves (etch#155). */
export const LARGE_FROM_HEIGHT = 814;

/** The suffix of the large variant of a pair. */
export const LARGE_SUFFIX = '_large';

/** A move the game's code makes: a widget path and the `positionType` it is moved to. */
export interface EngineMove {
  readonly path: string;
  readonly positionType: string;
  /** What the evidence is. */
  readonly evidence: string;
}

/**
 * What a country view's code does at its size steps (`…_scaling_large_min_inc` and
 * `…_scaling_huge_min_inc`: from the screen height of the step's `x`, by its `y`): the widgets it
 * moves down by `y` and those it makes `y` taller, by top-level window (lowercase). Read from each
 * view's `SetupLargeOrHuge` in the GOG build's `eu4.pdb` (the same code as Steam's); the layout
 * applies them (etch#274).
 */
export interface EngineSteps {
  readonly moved: readonly string[];
  readonly grown: readonly string[];
  /** What the evidence is. */
  readonly evidence: string;
}

export const ENGINE_STEPS: ReadonlyMap<string, EngineSteps> = new Map([
  [
    'countrysubjectview',
    {
      moved: [
        'countrysubjectview/country_subjects_info',
        'countrysubjectview/subject_military_focus_window',
      ],
      grown: ['countrysubjectview/subjects_listbox'],
      evidence:
        'CCountrySubjectsView::SetupLargeOrHuge (GOG 1.37.5.2 0xF4ECC0); the coverage survey at 1920×1080 (+328)',
    },
  ],
]);

/**
 * A top-level widget the game's code places in a row of its instances (etch#278): the
 * `positionType` of the first one's place, counted from the lower center of the screen, and of the
 * step from one to the next. The row is centered on its n instances: the first one's x is
 * `W/2 − (n · step.x)/2 + start.x`, each half truncated, its y `H + start.y`.
 */
export interface EngineRow {
  readonly start: string;
  readonly step: string;
  /** What the evidence is. */
  readonly evidence: string;
}

/** The rows by top-level widget (lowercase). */
export const ENGINE_ROWS: ReadonlyMap<string, EngineRow> = new Map([
  [
    'shield',
    {
      start: 'shield_position',
      step: 'shield_offset',
      evidence:
        'CGameSetup::RefreshShortcutShields (GOG 1.37.5.2 0x111C740); the coverage survey at 1920×1080 and 1280×720',
    },
  ],
]);

/** The moves by top-level window (lowercase) and by screen: below 814 px (`small`) or from it. */
export const ENGINE_MOVES: ReadonlyMap<
  string,
  { readonly small: readonly EngineMove[]; readonly large: readonly EngineMove[] }
> = new Map([
  [
    'provinceview',
    {
      small: [
        {
          path: 'provinceview/top_section_window/history',
          positionType: 'top_section_lowres_history_pos',
          evidence: 'setup 0x1344680 (etch#155); the corpus at 1280×720 and 1366×768',
        },
        {
          path: 'provinceview/top_section_window/strait_indicator',
          positionType: 'top_section_lowres_strait_pos',
          evidence: 'setup 0x1344680 (etch#155); not seen in the corpus',
        },
        {
          path: 'provinceview/top_section_window/river_indicator',
          positionType: 'top_section_lowres_river_icon_pos',
          evidence:
            'setup 0x1344680 (the lab, docs/etch-province-positions.md); hidden in the corpus',
        },
        {
          path: 'provinceview/top_section_window/river_indicator_2',
          positionType: 'top_section_lowres_strait_pos',
          evidence:
            'setup 0x1344680 moves it with strait_indicator; the corpus at 1280×720 and 1366×768',
        },
        {
          path: 'provinceview/state_window',
          positionType: 'state_view_lowres_pos',
          evidence: 'setup 0x1344680 (etch#155); not captured',
        },
      ],
      large: [
        {
          path: 'provinceview/top_section_window',
          positionType: 'top_section_position_big',
          evidence: 'setup 0x1344680 (etch#155); the corpus from 1600×900 up',
        },
      ],
    },
  ],
]);
