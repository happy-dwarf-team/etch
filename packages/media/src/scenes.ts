// The scenes (etch-website docs/spec.md section 8.5): each one named shot of Etch editing the
// province view. Every scene starts the same way, in a fresh VS Code with the demo mod and its
// override of the base game's `interface/provinceview.gui` open, the cursor on the window's name and
// the preview open and fitted unscaled beside it; then it performs its steps with the keyboard (the
// mouse only where a user would click the preview) and captures. Every step that changes the
// preview waits for its settled paint.
import type { SceneId } from './manifest.ts';
import type { PaintResult } from './paint.ts';
import type { Cursor, FrameRules, Workbench } from './workbench.ts';

export interface SceneContext {
  readonly wb: Workbench;
  /** Checks the framing and saves the window as `<id>.png`. */
  readonly still: (id: SceneId, rules?: FrameRules) => Promise<void>;
  /** Starts recording the loop; it ends when the scene returns. */
  readonly record: () => Promise<void>;
  /** Notes a moment of the loop (performance.now()); the loop is cut from them. */
  readonly mark: (moment: LoopMoment) => number;
}

/**
 * The moments a loop is cut by: it starts `LOOP_LEAD_MS` before its first keystroke and ends at its
 * last, whose result is the loop's first frame.
 */
export type LoopMoment = 'first-key' | 'last-key';

export interface Scene {
  readonly id: 'hero' | Exclude<SceneId, 'hero' | 'preview'>;
  /** What the scene writes: its own id, and the stills taken during its run. */
  readonly writes: readonly SceneId[];
  readonly loop: boolean;
  run(context: SceneContext): Promise<void>;
}

/**
 * The base-game files the workspace overrides, copied from the local game at every run (spec
 * section 8.2): the province view, the window modders change most. No game file is kept.
 */
export const OVERRIDES = ['interface/provinceview.gui'] as const;
/** The file every scene opens first, and the window it previews. */
export const START_FILE = 'interface/provinceview.gui';
export const WINDOW_NAME = 'provinceview';

/** The hero loop's timing: the start state it opens on, the holds, the pace of the menu. */
export const LOOP_LEAD_MS = 1500;
/** Still frames before the first keystroke, so the cut can find it (freezedetect needs 1 s). */
const PRE_ROLL_MS = 3000;
const HOLD_MS = 2200;
const MENU_MS = 700;
const POST_ROLL_MS = 1500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const until = (at: number): Promise<void> => sleep(Math.max(0, at - performance.now()));

/** The cursor just before the `offset`-th character of the one match of `text`. */
async function cursorIn(wb: Workbench, text: string, offset: number): Promise<Cursor> {
  const match = await wb.find(text);
  return { line: match.line, column: match.start + offset };
}

/** The buildings side panel's position: its x, 480, becomes 580 with one keystroke. */
const BUILDINGS_POSITION = 'x=480 y=13';

/** Game-screen points at 1280 × 720, in the own province view with the buildings side panel. */
const PROVINCE_HEADER = { x: 150, y: 120 };
const FIRST_BUILDING = { x: 545, y: 225 };

export const SCENES: readonly Scene[] = [
  {
    id: 'hero',
    writes: ['hero', 'preview'],
    loop: true,
    async run({ wb, still, record, mark }) {
      // The start state: the first digit of the buildings panel's x selected.
      await wb.walkCursorTo(await cursorIn(wb, BUILDINGS_POSITION, 2), 0);
      await wb.press('Shift+ArrowRight');
      await wb.selectionIs(1);
      await wb.highlightSettled();
      await wb.parkMouse();
      // The poster: the loop's first frame, taken before recording so the master stays still.
      await still('hero');
      await record();
      await sleep(PRE_ROLL_MS);

      // The panel moves 100 px to the right, from the unsaved buffer.
      const move = mark('first-key');
      await wb.paint(() => wb.type('5'));
      await wb.highlightSettled();
      await still('preview');
      await until(move + HOLD_MS);
      // Another view of the same window: the army builder opens beside the moved panel.
      await wb.openMenu('view');
      await sleep(MENU_MS);
      const army = performance.now();
      await wb.chooseView('Build army');
      await until(army + HOLD_MS);
      await wb.chooseView('Own province');
      await sleep(MENU_MS);
      await wb.closeMenus();
      await wb.focusEditor();
      await wb.highlightSettled();
      // The closed menu reaches the screen a few frames later: hold it, so the loop's last frame
      // is the moved panel alone, not the menu.
      await sleep(MENU_MS);
      mark('last-key');
      await wb.paint(() => wb.press('Control+Z'));
      await wb.highlightSettled();
      await sleep(POST_ROLL_MS);
      if (await wb.dirty()) throw new Error('the loop does not close: the file is still unsaved');
    },
  },
  {
    id: 'views',
    writes: ['views'],
    loop: false,
    async run({ wb, still }) {
      await wb.openMenu('view');
      await wb.chooseView('Build army');
      await still('views');
    },
  },
  {
    id: 'data',
    writes: ['data'],
    loop: false,
    async run({ wb, still }) {
      await wb.openMenu('data');
      await wb.chooseTextLength('long');
      await still('data');
    },
  },
  {
    id: 'zoom',
    writes: ['zoom'],
    loop: false,
    async run({ wb, still }) {
      await wb.zoomAt(PROVINCE_HEADER, '200 %');
      await wb.restMouse();
      await still('zoom', { zoomed: true });
    },
  },
  {
    id: 'outline',
    writes: ['outline'],
    loop: false,
    async run({ wb, still }) {
      await wb.command('Explorer: Focus on Widget Outline View');
      await wb.fitPreview();
      // A click in the preview, as a user would: Etch selects the widget's kind keyword.
      await wb.clickScreen(FIRST_BUILDING);
      await wb.frame.locator('#tip:not([hidden])').waitFor();
      await wb.frame.locator('#hover:not([hidden])').waitFor();
      await wb.page.locator('.part.sidebar .monaco-list-row.selected').first().waitFor();
      await still('outline');
    },
  },
  {
    id: 'problems',
    writes: ['problems'],
    loop: false,
    async run({ wb, still }) {
      const allow: PaintResult[] = ['problems'];
      await wb.page.keyboard.press('Control+Shift+M');
      await wb.page.locator('.markers-panel').waitFor();
      await wb.focusEditor();
      await wb.fitPreview();
      await wb.find('"GFX_provinceview_building_bg"');
      await wb.paint(() => wb.type('"GFX_provinceview_biulding_bg"'), allow);
      await wb.filterProblems('biulding');
      await wb.focusEditor();
      await still('problems');
    },
  },
];

/** The scenes that write any of `ids`, in the spec's order. */
export function scenesFor(ids: readonly SceneId[]): Scene[] {
  return SCENES.filter((scene) => scene.writes.some((id) => ids.includes(id)));
}
