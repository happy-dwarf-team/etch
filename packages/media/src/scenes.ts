// The scenes (etch-website docs/spec.md section 8.5): each one named shot of Etch editing the demo
// mod. Every scene starts the same way, in a fresh VS Code with `interface/etch_demo.gui` open, the
// cursor in the dialog and the preview open and fitted unscaled beside it; then it performs its
// steps with the keyboard (the mouse only where a user would click the preview) and captures.
// Every step that changes the preview waits for its settled paint.
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

/** The demo mod file every scene opens first, and the window it previews. */
export const START_FILE = 'interface/etch_demo.gui';
export const DIALOG = 'etch_demo_dialog';

/** The hero loop's timing: the start state it opens on, the holds, the arrow keys' pace. */
export const LOOP_LEAD_MS = 1500;
/** Still frames before the first keystroke, so the cut can find it (freezedetect needs 1 s). */
const PRE_ROLL_MS = 3000;
const HOLD_MS = 2200;
const ARROW_MS = 110;
const UNDO_GAP_MS = 1000;
const POST_ROLL_MS = 1500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const until = (at: number): Promise<void> => sleep(Math.max(0, at - performance.now()));

/** The cursor just before the `offset`-th character of the one match of `text`. */
async function cursorIn(wb: Workbench, text: string, offset: number): Promise<Cursor> {
  const match = await wb.find(text);
  return { line: match.line, column: match.start + offset };
}

/** The game-screen point of the second option button's middle, at 1280 × 720. */
const OPTION_REST = { x: 160 + 40 + 150, y: 70 + 270 + 16 };

export const SCENES: readonly Scene[] = [
  {
    id: 'hero',
    writes: ['hero', 'preview'],
    loop: true,
    async run({ wb, still, record, mark }) {
      // Where the arrow keys will walk to: just before the option button's x, 40.
      const button = await cursorIn(wb, 'x = 40 y = 226', 4);
      // The start state: the first digit of the dialog's width, 380, selected.
      await wb.walkCursorTo(await cursorIn(wb, 'x = 380', 4), 0);
      await wb.press('Shift+ArrowRight');
      await wb.selectionIs(1);
      await wb.highlightSettled();
      // The poster: the loop's first frame, taken before recording so the master stays still.
      await still('hero');
      await record();
      await sleep(PRE_ROLL_MS);

      const widen = mark('first-key');
      await wb.paint(() => wb.type('5'));
      await until(widen + HOLD_MS);
      await wb.walkCursorTo(button, ARROW_MS);
      await wb.highlightSettled();
      const move = performance.now();
      await wb.paint(() => wb.type('2'));
      await still('preview');
      await until(move + HOLD_MS);
      const undo = performance.now();
      await wb.paint(() => wb.press('Control+Z'));
      await until(undo + UNDO_GAP_MS);
      mark('last-key');
      await wb.paint(() => wb.press('Control+Z'));
      await wb.highlightSettled();
      await sleep(POST_ROLL_MS);
      if (await wb.dirty()) throw new Error('the loop does not close: the file is still unsaved');
    },
  },
  {
    id: 'pin',
    writes: ['pin'],
    loop: false,
    async run({ wb, still }) {
      // Pinning keeps the window already drawn, so it paints nothing new.
      await wb.frame.locator('#pin').click();
      await wb.frame.locator('#pin[aria-pressed="true"]').waitFor();
      await wb.quickOpen('etch_demo.gfx');
      await wb.find('300_32.dds');
      await wb.paint(() => wb.type('300_32_glow.dds'));
      await wb.expectPreviewed(DIALOG);
      await wb.parkMouse();
      await still('pin');
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
      await wb.frame
        .locator('canvas#screen')
        .click({ position: { x: OPTION_REST.x / 2, y: OPTION_REST.y / 2 } });
      await wb.selectionIs('guiButtonType'.length);
      await wb.frame.locator('#tip:not([hidden])').waitFor();
      await wb.frame.locator('#hover:not([hidden])').waitFor();
      await wb.page
        .locator('.monaco-list-row.selected', { hasText: 'option_rest' })
        .first()
        .waitFor();
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
      await wb.find('GFX_mission_icons_frame');
      await wb.paint(() => wb.type('GFX_mission_icons_frmae'), allow);
      await wb.page.locator('.markers-panel .monaco-list-row', { hasText: 'frmae' }).waitFor();
      await still('problems');
    },
  },
  {
    id: 'resolution',
    writes: ['resolution'],
    loop: false,
    async run({ wb, still }) {
      await wb.find('if_resolution');
      await wb.command('Etch: Choose the Preview Resolution', { keepsQuickInput: true });
      await wb.focusQuickPickItem('1280×720');
      await still('resolution', { quickInput: true });
      await wb.page.keyboard.press('Escape');
    },
  },
  {
    id: 'playset',
    writes: ['playset'],
    loop: false,
    async run({ wb, still }) {
      // Edits first: VS Code hides Find in an editor as narrow as the Explorer leaves it.
      await wb.quickOpen('etch_demo_l_english.yml');
      await wb.find('The Forge Is Lit');
      await wb.paint(() => wb.type('The Anvil Rings'));
      await wb.expectPreviewed(DIALOG);
      // The Explorer reveals the opened files, so it shows interface/ and localisation/.
      await wb.page.keyboard.press('Control+Shift+E');
      await wb.page.locator('.explorer-folders-view').waitFor();
      await wb.focusEditor();
      await wb.fitPreview();
      await still('playset');
    },
  },
];

/** The scenes that write any of `ids`, in the spec's order. */
export function scenesFor(ids: readonly SceneId[]): Scene[] {
  return SCENES.filter((scene) => scene.writes.some((id) => ids.includes(id)));
}
