/**
 * What the game's code does to a window by the screen height alone, which Etch derives itself for
 * a window that has a profile, so that a profile need not write it (spec section 3, ADR 0006).
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
          // etch#155 read `top_section_lowres_river_icon_pos` here; the captures show the strait's.
          path: 'provinceview/top_section_window/river_indicator_2',
          positionType: 'top_section_lowres_strait_pos',
          evidence: 'the corpus at 1280×720 and 1366×768',
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
