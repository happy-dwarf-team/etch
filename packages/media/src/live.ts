// The live take (etch-website docs/spec.md section 8.5): Etch's live game beside VS Code, one take
// for the three live clips. VS Code fills the primary monitor as in the offline takes, with the
// preview open; the game runs windowed at a corpus resolution on the monitor right of it, from the
// run's private install with the run's own copies of the player's settings and of one save, through
// the media helper (live-helper/), on the province whose sample data the preview shows. Both windows
// are recorded against the take's clock. The take first saves an edit that the game reloads
// (`reload`), then turns pick mode on in the game, hovers a few widgets and clicks one (`pick`),
// which also gives the preview a live snapshot (`snapshot`). The edits compose the clips as the
// offline ones (clips.ts): the control left, its effect right, the captions under both.
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { findProfileFolder, systemEnvironment } from '@etch/core/playset';
import {
  CODE_SCALE,
  codeView,
  DETAIL_SCALE,
  editorLine,
  LEAD,
  onScreen,
  OVERRIDES,
  pair,
  PRE_ROLL_MS,
  POST_ROLL_MS,
  SAMPLE_PROVINCE,
  SNAPSHOT_VALUES,
  START_FILE,
  TAIL,
  TEXT_FADE,
  TRADE_AREA,
  TRADE_NODE_POSITION,
  VALUES_AREA,
  WINDOW_NAME,
  type Clip,
} from './clips.ts';
import { LIVE_GAME_RESOLUTION } from './config.ts';
import { Desktop, SCAN, type Point, type WindowInfo } from './desktop.ts';
import {
  cameraKeys,
  GUTTER,
  rows,
  STAGE,
  union,
  viewAt,
  type Caption,
  type EditSpec,
  type Highlight,
  type Rect,
  type Source,
} from './edit.ts';
import { videoSize } from './ffmpeg.ts';
import type { ShootOptions } from './shoot.ts';
import { eventOf, eventsOf, rectOf, sleep, Take, type TakeEvent, type TakeLog } from './take.ts';
import { Tongs, type TongsWidget } from './tongs.ts';
import { Workbench } from './workbench.ts';

/** Where the game's client area goes: the top left corner of the monitor right of the primary. */
export const GAME_ORIGIN: Point = { x: 3440, y: 0 };
/**
 * Where the real pointer waits, in the game's client area: over the map right of the buildings
 * panel, away from the screen's edges and outside every part of the window the edits show.
 */
const GAME_REST: Point = { x: 1050, y: 460 };

/**
 * The edit `reload` saves: the trade node button's x, 251, becomes 151 with one keystroke on its
 * first digit, the button `preview` moves too.
 */
export const RELOAD_EDIT = {
  text: TRADE_NODE_POSITION,
  offset: 'x = '.length,
  key: '1',
  from: 251,
  to: 151,
} as const;
/** The edited button, as Tongs finds it in the game. */
export const RELOAD_WIDGET = 'provinceview//tradenode_button';
/** The province the game shows: the sample data's, Kaluga (`SAMPLE_PROVINCE`). */
const LIVE_PROVINCE = 296;
/**
 * What `pick` hovers, in the trade section, the last the button it then clicks, and where the
 * pointer goes across each (0 its left edge, 1 its right; its middle unless given). The game shows
 * its own tooltips in pick mode, at once and beside the pointer, under pick mode's label: the loop
 * hovers widgets without one, and the button at its right end, so its tooltip ("Go to trade node
 * interface") starts past the button instead of covering it.
 */
interface Hover {
  readonly selector: string;
  readonly across?: number;
}
const HOVERED: readonly [Hover, ...Hover[]] = [
  { selector: 'provinceview//tradevalue_value' },
  { selector: 'provinceview//resource_icon' },
  { selector: RELOAD_WIDGET, across: 0.93 },
];

const HOLD_MS = 2400;
/** The height of `pick`'s game band over the definition, in output pixels. */
const PICK_BAND = 340;

/** The player's `settings.txt`, windowed at `size` (the engine reads `graphics.size`). */
export function windowedSettings(
  text: string,
  size: { readonly width: number; readonly height: number },
): string {
  const scale = /game_ui_scale\s*=\s*([\d.]+)/.exec(text);
  if (scale !== null && Number(scale[1]) !== 1) {
    throw new Error(`the player's game_ui_scale is ${scale[1] ?? ''}; the take needs 1.000`);
  }
  const replaced = text
    .replace(
      /(graphics\s*=\s*\{\s*size\s*=\s*\{\s*x\s*=\s*)\d+(\s*y\s*=\s*)\d+/,
      `$1${String(size.width)}$2${String(size.height)}`,
    )
    .replace(/fullScreen\s*=\s*\w+/, 'fullScreen=no')
    .replace(/borderless\s*=\s*\w+/, 'borderless=no');
  if (!/graphics\s*=\s*\{\s*size\s*=/.test(replaced)) {
    throw new Error("the player's settings.txt has no graphics size");
  }
  return replaced;
}

/** The player's `pdx_settings.txt`, windowed at `size` (the launcher's display settings). */
export function windowedPdxSettings(
  text: string,
  size: { readonly width: number; readonly height: number },
): string {
  const value = (name: string, to: string) => (source: string) => {
    const pattern = new RegExp(`("${name}"\\s*=\\s*\\{\\s*value\\s*=\\s*)"[^"]*"`);
    if (!pattern.test(source)) throw new Error(`the player's pdx_settings.txt has no ${name}`);
    return source.replace(pattern, `$1"${to}"`);
  };
  return [
    value('display_mode', 'windowed'),
    value('windowed_resolution', `${String(size.width)}x${String(size.height)}`),
  ].reduce((source, change) => change(source), text);
}

/**
 * The run's player profile: copies of the player's settings, windowed at the take's resolution,
 * and of the take's save. The live game copies these into its own profile in turn.
 */
async function preparePlayer(
  options: { gamePath: string; save: string },
  player: string,
): Promise<string> {
  await rm(player, { recursive: true, force: true });
  await mkdir(path.join(player, 'save games'), { recursive: true });
  const profile = await findProfileFolder(options.gamePath, systemEnvironment());
  const settings = await readFile(path.join(profile, 'settings.txt'), 'latin1');
  await writeFile(
    path.join(player, 'settings.txt'),
    windowedSettings(settings, LIVE_GAME_RESOLUTION),
    'latin1',
  );
  const pdx = await readFile(path.join(profile, 'pdx_settings.txt'), 'latin1');
  await writeFile(
    path.join(player, 'pdx_settings.txt'),
    windowedPdxSettings(pdx, LIVE_GAME_RESOLUTION),
    'latin1',
  );
  const name = path.basename(options.save);
  await copyFile(options.save, path.join(player, 'save games', name));
  return name;
}

/** Waits until `check` holds, polling; throws with `what` after `timeoutMs`. */
async function until(
  what: string,
  check: () => Promise<boolean>,
  timeoutMs: number,
  pollMs = 50,
): Promise<void> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (await check().catch(() => false)) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(pollMs);
  }
}

/** A Tongs widget's rect, in the game's client pixels. */
function rectOfWidget(widget: TongsWidget): Rect {
  return { x: widget.rect.x, y: widget.rect.y, w: widget.rect.w, h: widget.rect.h };
}

/** Records the live take; returns its log, written beside the masters. */
export async function takeLive(options: ShootOptions & { save: string }): Promise<TakeLog> {
  // The live game installs what `pnpm pins` staged; without it Etch only logs an error.
  const builds = path.join(options.extension, 'game', 'manifest.json');
  await stat(builds).catch((error: unknown) => {
    throw new Error(
      `${builds} is missing: build the plugin and run \`pnpm pins\` (CONTRIBUTING.md)`,
      {
        cause: error,
      },
    );
  });
  const player = path.join(options.work, 'live-player');
  const save = await preparePlayer(options, player);
  const helperConfig = path.join(options.work, 'live-helper.json');
  const ready = path.join(options.work, 'live-helper.ready');
  await rm(ready, { force: true });
  await writeFile(helperConfig, JSON.stringify({ player, ready }));

  const take = new Take('live', options.ffmpeg);
  const wb = await Workbench.launch({
    work: options.work,
    extensionPath: options.extension,
    demoMod: path.join(options.repository, 'packages', 'media', 'demo-mod'),
    // Without the demo mod's event file (the `names` clip's, which the live clips do not show):
    // with it, three takes waited 4–10 minutes for the save and the game never reached it; the
    // take without it loaded at once (2026-11-18). Why is not known.
    excluded: ['events'],
    overrides: OVERRIDES,
    open: START_FILE,
    gamePath: options.gamePath,
    videoDir: undefined,
    helpers: [path.join(options.repository, 'packages', 'media', 'live-helper')],
    env: { ETCH_MEDIA_LIVE: helperConfig },
  });
  const desktop = await Desktop.start();
  let tongs: Tongs | undefined;
  // Where the game's client area is in its window's frame: in the master, if that is the frame.
  let clientInFrame: Point | undefined;
  try {
    await until('the media helper', () => stat(ready).then(() => true), 60_000, 200);
    await wb.command('View: Close Primary Side Bar');
    await wb.find(`"${WINDOW_NAME}"`);
    await wb.openPreview();
    await wb.expectPreviewed(WINDOW_NAME);
    await wb.fitPreview();
    // The preview shows the save's province, as the offline takes do, until the game's snapshot.
    await wb.chooseSave(options.save);
    await wb.chooseProvince(SAMPLE_PROVINCE);
    await wb.closeMenus().catch(() => undefined);
    await wb.restMouse();

    // The live game, as a user starts it: the command, then the save in its quick pick.
    await wb.command('Etch: Start the Live Game', { keepsQuickInput: true });
    await wb.page.locator('.quick-input-widget input').waitFor({ timeout: 60_000 });
    await wb.page.keyboard.type(save);
    await wb.page
      .locator('.quick-input-list .monaco-list-row.focused', { hasText: save })
      .waitFor();
    await wb.page.keyboard.press('Enter');
    tongs = await Tongs.connect(600_000);
    const live = tongs;
    let logged = 0;
    await until(
      'the save to load',
      async () => {
        const state = await live.send<{ in_game?: boolean }>('state');
        if (state.in_game === true) return true;
        // While it waits, the game's state every 30 s: a load that never ends says why in it.
        if (Date.now() - logged > 30_000) {
          logged = Date.now();
          console.log(`Waiting for the save: ${JSON.stringify(state)}`);
        }
        return false;
      },
      240_000,
      1_000,
    );
    await live.send('frames timeout=120', 130_000);
    const pid = (await live.send<{ pid: number }>('ping')).pid;

    // The game's window on the monitor right of VS Code's, its client area at the top left.
    let window: WindowInfo | undefined;
    await until(
      "the game's window",
      async () => (window = await desktop.windowOf(pid)) !== undefined,
      30_000,
      500,
    );
    if (window === undefined) throw new Error("the game's window was not found");
    const game = await desktop.placeClient(window.hwnd, GAME_ORIGIN);
    clientInFrame = {
      x: game.client.left - game.frame.left,
      y: game.client.top - game.frame.top,
    };
    const width = game.client.right - game.client.left;
    const height = game.client.bottom - game.client.top;
    if (width !== LIVE_GAME_RESOLUTION.width || height !== LIVE_GAME_RESOLUTION.height) {
      throw new Error(`the game's client area is ${String(width)} × ${String(height)}`);
    }
    const client = game.client;
    const screen = (point: Point): Point => ({ x: client.left + point.x, y: client.top + point.y });
    // The pointer waits over the game's interface: anywhere outside the client area the game
    // scrolls its map, as at a window's edge.
    const rest = screen(GAME_REST);
    await desktop.movePointer(rest, 300);
    // Only the take moves the real pointer: one moved by anything else scrolls the map, and a
    // click in pick mode picks. Checked before each recorded part, with where the game's client
    // area is (a window that moved makes every point here wrong).
    const pointerAt = async (where: Point, what: string): Promise<void> => {
      const at = await desktop.cursor();
      const now = (await desktop.windowOf(pid))?.client;
      const moved = now === undefined || now.left !== client.left || now.top !== client.top;
      if (moved || Math.abs(at.x - where.x) > 3 || Math.abs(at.y - where.y) > 3) {
        throw new Error(
          `${what}: the pointer is at ${JSON.stringify(at)}, not ${JSON.stringify(where)}, ` +
            `the game's client area at ${JSON.stringify(now)}, placed at ${JSON.stringify(client)}; ` +
            'keep the mouse still during the take',
        );
      }
    };

    // The sample data's province, as a click on the map opens it: the camera on it, so the map
    // beside the window is its own.
    await live.send(`province goto ${String(LIVE_PROVINCE)}`);
    await live.send(`province open ${String(LIVE_PROVINCE)}`);
    await until(
      'the province view',
      async () => (await live.send<{ view: { visible: boolean } }>('selection')).view.visible,
      30_000,
      200,
    );
    await live.send('frames timeout=5', 10_000);
    const projects = await live
      .send<{ matches: TongsWidget[] }>('ui find provinceview//great_projects_window')
      .catch(() => ({ matches: [] }));
    if (projects.matches.some((match) => match.visible)) {
      throw new Error(`province ${String(LIVE_PROVINCE)} shows a great project`);
    }

    // The button's x as the game counts it: its left edge less the x in the file, read once the
    // province view has slid in (read during its slide, it was 1 and 18 px short).
    let left = Number.NaN;
    await until(
      'the province view at rest',
      async () => {
        const now = (await live.widget(RELOAD_WIDGET)).rect.x;
        const still = now === left;
        left = now;
        return still;
      },
      10_000,
      500,
    );
    const base = left - RELOAD_EDIT.from;
    const buttonAt = async (x: number): Promise<TongsWidget> => {
      let widget: TongsWidget | undefined;
      try {
        await until(
          `the trade node button at x ${String(x)}`,
          async () => (widget = await live.widget(RELOAD_WIDGET)).rect.x - base === x,
          10_000,
        );
      } catch (error) {
        // What the game shows instead, for the failure's message.
        const found = await live
          .send<{ matches: TongsWidget[] }>(`ui find ${RELOAD_WIDGET}`)
          .then((answer) =>
            JSON.stringify(
              answer.matches.map(({ path, visible, rect }) => ({ path, visible, rect })),
            ),
          )
          .catch((reason: unknown) => String(reason));
        throw new Error(`${(error as Error).message} (base ${String(base)}): ${found}`, {
          cause: error,
        });
      }
      return widget as TongsWidget;
    };
    // The game took the front when it started; the editor's keys need VS Code there.
    if (!(await desktop.focus(wb.hwnd))) throw new Error('VS Code could not be brought forward');
    const edit = await wb.find(RELOAD_EDIT.text);
    const at = { line: edit.line, column: edit.start + RELOAD_EDIT.offset };
    await wb.focusEditor();
    await wb.walkCursorTo(at, 0);
    await wb.press('Shift+ArrowRight');
    await wb.selectionIs(1);

    // One reload unrecorded: the first reload of a freshly opened province view blanks its name
    // (docs/live-game.md), and the start state is then the end's.
    await wb.type(RELOAD_EDIT.key);
    await wb.press('Control+S');
    await buttonAt(RELOAD_EDIT.to);
    await wb.press('Control+Z');
    await wb.press('Control+S');
    await buttonAt(RELOAD_EDIT.from);
    await wb.selectionIs(1);
    await wb.command('Notifications: Clear All Notifications');
    await wb.focusEditor();
    await wb.highlightSettled();

    take.mark('line', { source: 'vscode', rect: await editorLine(wb) });
    take.mark('screen', { source: 'vscode', rect: await wb.screenRect() });
    // The same button in the preview, which outlines it (the cursor is in its block), and in the
    // game: where the game draws the province view in its master (`inGame`).
    take.mark('preview.button', { source: 'vscode', rect: await wb.selectedRect() });
    take.mark('button', { source: 'game', rect: rectOfWidget(await live.widget(RELOAD_WIDGET)) });
    await desktop.movePointer(rest, 300);
    await sleep(300);
    await pointerAt(rest, 'before the recording');
    await take.record('vscode', wb.hwnd, path.join(options.masters, 'live.vscode.mkv'), {
      nudge: () => wb.nudge(),
    });
    // The game draws every frame: its recording needs no nudge.
    await take.record('game', game.hwnd, path.join(options.masters, 'live.game.mkv'), {
      cursor: true,
    });
    await take.until(take.t() + PRE_ROLL_MS / 1000);

    // reload: the edit, saved, reloaded by the game; then undone and saved again.
    take.mark('reload.start');
    take.mark('reload.key');
    await wb.type(RELOAD_EDIT.key);
    await sleep(1000);
    take.mark('reload.save');
    await wb.press('Control+S');
    take.mark('reload.moved', {
      source: 'game',
      rect: rectOfWidget(await buttonAt(RELOAD_EDIT.to)),
    });
    await sleep(HOLD_MS);
    take.mark('reload.undo');
    await wb.press('Control+Z');
    await sleep(700);
    take.mark('reload.resave');
    await wb.press('Control+S');
    take.mark('reload.back', {
      source: 'game',
      rect: rectOfWidget(await buttonAt(RELOAD_EDIT.from)),
    });
    await sleep(1500);
    if (await wb.dirty()) throw new Error('reload does not close: the file is still unsaved');
    take.mark('reload.end');

    // pick: the pointer on the first widget, pick mode on in the game; a number, an icon and the
    // trade node button hovered, the button clicked; the pick opens its definition in VS Code and
    // gives the preview a live snapshot, which repaints it. Pick mode outlines and labels every
    // widget under the pointer, so the pointer goes to the first one before it is on and jumps
    // from one to the next: gliding, it would cross others.
    await sleep(800);
    await pointerAt(rest, 'before pick');
    take.mark('pick.start');
    if (!(await desktop.focus(game.hwnd))) throw new Error('the game could not be brought forward');
    // Where the pointer goes on a widget, in the client area: `across` its width, at its middle.
    const pointOn = (widget: TongsWidget, across = 0.5): Point => ({
      x: Math.round(widget.rect.x + widget.rect.w * across),
      y: widget.click_point.y,
    });
    const [first, ...others] = HOVERED;
    let target = await live.widget(first.selector);
    let point = pointOn(target, first.across);
    await desktop.movePointer(screen(point), 650);
    await sleep(500);
    const picked = await wb.cursor();
    take.mark('pick.on');
    await desktop.keys(SCAN.ctrl, SCAN.shift, SCAN.e);
    // Pick mode labels the widget under the pointer once the pointer moves.
    point = { x: point.x + 2, y: point.y };
    await desktop.movePointer(screen(point), 50);
    await sleep(400);
    take.mark('pick.hover', {
      source: 'game',
      rect: rectOfWidget(target),
      label: first.selector,
      point: await desktop.cursor(),
    });
    await sleep(1600);
    for (const hover of others) {
      const widget = await live.widget(hover.selector);
      point = pointOn(widget, hover.across);
      await desktop.movePointer(screen(point), 0);
      await sleep(150);
      take.mark('pick.hover', {
        source: 'game',
        rect: rectOfWidget(widget),
        label: hover.selector,
        point: await desktop.cursor(),
      });
      await sleep(1300);
      await pointerAt(screen(point), `hovering ${hover.selector}`);
      target = widget;
    }
    const before = await wb.cursor();
    // Nothing is picked before the click: the editor still where pick mode found it.
    if (before.line !== picked.line) {
      throw new Error(
        `the editor moved to line ${String(before.line)} before the click: something picked`,
      );
    }
    take.mark('pick.click', { source: 'game', point });
    const snapshot = wb
      .paint(() => desktop.click())
      .then(
        () => take.mark('pick.snapshot'),
        (error: unknown) => {
          console.log(`The pick's snapshot did not repaint the preview: ${String(error)}`);
        },
      );
    await until(
      'the pick in the editor',
      async () => (await wb.cursor()).line !== before.line,
      10_000,
      25,
    );
    take.mark('pick.jump', { source: 'vscode', rect: await editorLine(wb) });
    await snapshot;
    await sleep(3000);
    take.mark('pick.end');
    // The preview after the snapshot, for the take's review.
    await wb.screenshot(path.join(options.masters, 'live.after-pick.png'));
    await take.until(take.t() + POST_ROLL_MS / 1000);
    // Away from the game's edges again once the loops' frames are recorded: on its way, pick
    // mode, still on, labels every widget it crosses.
    await desktop.movePointer(rest, 600);
  } catch (error) {
    await wb.screenshot(path.join(options.masters, 'live.failed.png')).catch(() => undefined);
    throw error;
  } finally {
    await take.stop();
    tongs?.close();
    desktop.close();
    // Closing VS Code stops the live game, as for a user: saved, then closed after its identity
    // checks (docs/live-game.md, "Stop and exits").
    await wb.close();
  }

  const sizes: Record<string, { width: number; height: number }> = {};
  for (const { name, file } of take.masters()) sizes[name] = await videoSize(options.ffprobe, file);
  // The game's master is its client area, or its frame with the client area inside it.
  const gameSize = sizes['game'];
  if (gameSize !== undefined && gameSize.width !== LIVE_GAME_RESOLUTION.width) {
    take.shift('game', clientInFrame);
  }
  const log = take.log(sizes);
  await writeFile(
    path.join(options.masters, 'live.take.json'),
    `${JSON.stringify(log, null, 2)}\n`,
  );
  return log;
}

const t = (event: TakeEvent): number => event.t;

/**
 * An area of the preview's game screen (1440 × 900) in the game's master: the live game draws the
 * province view as the preview does, lower on its taller screen, and its master may hold the
 * window's frame (`clientInFrame`). The trade node button, in both, gives the shift.
 */
function inGame(log: TakeLog, area: Rect): Rect {
  const screen = rectOf(eventOf(log, 'screen'));
  const preview = rectOf(eventOf(log, 'preview.button'));
  const game = rectOf(eventOf(log, 'button'));
  const dx = game.x + game.w / 2 - (preview.x + preview.w / 2 - screen.x);
  const dy = game.y + game.h / 2 - (preview.y + preview.h / 2 - screen.y);
  return { x: area.x + dx, y: area.y + dy, w: area.w, h: area.h };
}

export const LIVE_CLIPS: readonly Pick<Clip, 'id' | 'edit'>[] = [
  {
    // The trade node button's x retyped and saved: the game reloads the window and the button
    // moves; undone and saved, it moves back. The code left, the game's window right.
    id: 'reload',
    edit(log, sources) {
      const code = sources['vscode'] as Source;
      const s0 = t(eventOf(log, 'reload.key')) - LEAD;
      const at = (time: number): number => time - s0;
      const key = at(t(eventOf(log, 'reload.key')));
      const save = at(t(eventOf(log, 'reload.save')));
      const moved = eventOf(log, 'reload.moved');
      const undo = at(t(eventOf(log, 'reload.undo')));
      const resave = at(t(eventOf(log, 'reload.resave')));
      const back = at(t(eventOf(log, 'reload.back')));
      const end = back + TAIL + 0.4;
      const area = inGame(log, TRADE_AREA);
      const frames = pair(
        { w: STAGE.w - GUTTER - area.w * DETAIL_SCALE, h: STAGE.h },
        { w: area.w * DETAIL_SCALE, h: area.h * DETAIL_SCALE },
      );
      const ms = Math.round((t(moved) - (save + s0)) * 1000);
      const captions: Caption[] = [
        {
          from: key - 0.05,
          to: save - 0.2,
          keys: [RELOAD_EDIT.key],
          text: `x = ${String(RELOAD_EDIT.to)}`,
        },
        { from: save - 0.05, to: at(t(moved)) - 0.2, keys: ['Ctrl', 'S'] },
        {
          // Tongs sees the button moved a poll after the frame that shows it.
          from: at(t(moved)),
          to: undo - 0.2,
          text: `Saved: the game reloads the window (${String(ms)} ms in this take)`,
        },
        { from: undo - 0.05, to: resave - 0.2, keys: ['Ctrl', 'Z'], text: 'x = 251' },
        { from: resave - 0.05, to: back + 0.8, keys: ['Ctrl', 'S'] },
      ];
      const highlights: Highlight[] = [
        { from: at(t(moved)) + 0.1, to: undo - 0.2, panel: 1, rect: rectOf(moved) },
      ];
      return {
        id: 'reload',
        sources,
        // The trailer's part: the key, the save and the button moving, not the undo.
        core: { from: key - 0.5, to: at(t(moved)) + 1.6 },
        segments: [
          {
            duration: end,
            panels: [
              {
                source: 'vscode',
                start: s0,
                keys: cameraKeys([
                  {
                    at: 0,
                    frame: frames.left,
                    view: codeView(rectOf(eventOf(log, 'line')), frames.left, code),
                  },
                ]),
                fadeRight: TEXT_FADE,
              },
              {
                source: 'game',
                start: s0,
                keys: cameraKeys([{ at: 0, frame: frames.right, view: area }]),
              },
            ],
            captions,
            highlights,
          },
        ],
      } satisfies EditSpec;
    },
  },
  {
    // Pick mode in the game: three widgets hovered, the button clicked; its definition opens in
    // VS Code under the game, which shows the province view still: the click did not reach it.
    id: 'pick',
    edit(log, sources) {
      const code = sources['vscode'] as Source;
      const game = sources['game'] as Source;
      const hovers = eventsOf(log, 'pick.hover', HOVERED.length);
      // The loop opens on pick mode's label of the first widget: no frame shows the game without
      // Etch's part in it.
      const s0 = t(hovers[0] as TakeEvent);
      const at = (time: number): number => time - s0;
      const clickEvent = eventOf(log, 'pick.click');
      const click = at(t(clickEvent));
      const clickAt = { t: t(clickEvent), ...(clickEvent.point ?? { x: 0, y: 0 }) };
      const jump = eventOf(log, 'pick.jump');
      const end = at(t(eventOf(log, 'pick.end')));
      // The hovered widgets at 2×, the labels and tips beside them in view.
      const hovered = viewAt(union(...hovers.map(rectOf)), DETAIL_SCALE, STAGE, game, {
        x: 0.3,
        y: 0.55,
      });
      // After the click, the game's row of the button on top at 2×, with pick mode's label above
      // it and the game's own tip beside it (about 490 game px wide, wider than half the stage
      // at 2×), and the definition under it across the stage.
      const { top, bottom } = rows(STAGE, PICK_BAND);
      const button = rectOf(hovers[hovers.length - 1] as TakeEvent);
      const bandHeight = top.h / DETAIL_SCALE;
      const gameSide = {
        x: hovered.x,
        y: Math.max(0, Math.min(game.height - bandHeight, button.y - 0.6 * bandHeight)),
        w: hovered.w,
        h: bandHeight,
      };
      // The definition across the stage at the scale that fills it with the editor's lines and no
      // more: at 1.5× the panel took in a strip of the preview beside the editor.
      const line = rectOf(jump);
      const definition = codeView(line, bottom, code, Math.max(CODE_SCALE, bottom.w / line.w));
      const split = at(t(jump)) - 0.1;
      return {
        id: 'pick',
        sources,
        // The trailer's part: the last hover, the click and the definition. It opens on the
        // button's label: earlier, the icon before it shows with the game's long tip.
        core: { from: at(t(hovers[hovers.length - 1] as TakeEvent)), to: end },
        loopFade: 0.6,
        segments: [
          {
            // To `pick.end`: then the real pointer goes back to rest, pick mode labelling every
            // widget on its way.
            duration: end,
            panels: [
              {
                source: 'game',
                start: s0,
                keys: cameraKeys([
                  { at: 0, frame: STAGE, view: hovered },
                  { at: split, frame: top, view: gameSide, move: 0.6 },
                ]),
                // The click's ring at the game's own pointer, which its master records.
                pointer: {
                  points: [{ t: clickAt.t, x: clickAt.x, y: clickAt.y }],
                  clicks: [clickAt.t],
                  arrow: false,
                },
              },
              {
                source: 'vscode',
                start: s0,
                keys: cameraKeys([
                  { at: 0, frame: bottom, view: definition, opacity: 0 },
                  { at: split, frame: bottom, view: definition, opacity: 1, move: 0.6 },
                ]),
                fadeRight: TEXT_FADE,
              },
            ],
            captions: [
              {
                from: 0,
                to: click - 0.2,
                keys: ['Ctrl', 'Shift', 'E'],
                text: "pick mode in the game: each widget's name, kind, size and file",
              },
              {
                from: split + 0.2,
                to: end - 0.3,
                text: 'A click opens its definition; the game does not take it',
              },
            ],
            highlights: [
              {
                from: split + 0.7,
                to: end - 0.1,
                panel: 1,
                rect: { ...rectOf(jump), w: Math.min(rectOf(jump).w, 600), h: rectOf(jump).h * 2 },
              },
            ],
          },
        ],
      } satisfies EditSpec;
    },
  },
  {
    // The preview beside the game, the same part of the window in both: the preview's values are
    // generated until a pick gives it the game's live snapshot. The game, paused, holds its frame
    // from before pick mode: pick mode's labels beside the pointer run past the panel's edge.
    id: 'snapshot',
    edit(log, sources) {
      const s0 = t(eventOf(log, 'pick.click')) - 3.0;
      const at = (time: number): number => time - s0;
      const click = at(t(eventOf(log, 'pick.click')));
      const painted = log.events.find((event) => event.kind === 'pick.snapshot');
      const snapshot = painted === undefined ? click + 0.3 : at(painted.t);
      const end = at(t(eventOf(log, 'pick.end')));
      // As large as two panels side by side allow, at most 3×.
      const scale = Math.min(3, (STAGE.w - GUTTER) / 2 / VALUES_AREA.w, STAGE.h / VALUES_AREA.h);
      const preview = onScreen(rectOf(eventOf(log, 'screen')), VALUES_AREA);
      const game = inGame(log, VALUES_AREA);
      const frames = pair(
        { w: preview.w * scale, h: preview.h * scale },
        { w: game.w * scale, h: game.h * scale },
      );
      // The military and trade values, which the snapshot changes from generated ones.
      const values = SNAPSHOT_VALUES.map((rect) => onScreen(rectOf(eventOf(log, 'screen')), rect));
      return {
        id: 'snapshot',
        sources,
        core: { from: click - 1.0, to: end },
        loopFade: 0.6,
        segments: [
          {
            duration: end,
            holds: [{ from: 0, to: end, panel: 1, at: t(eventOf(log, 'pick.start')) - 0.2 }],
            panels: [
              {
                source: 'vscode',
                start: s0,
                keys: cameraKeys([{ at: 0, frame: frames.left, view: preview }]),
              },
              {
                source: 'game',
                start: s0,
                keys: cameraKeys([{ at: 0, frame: frames.right, view: game }]),
              },
            ],
            // The second caption comes with the click, before the preview repaints: the cause on
            // screen when the values change.
            captions: [
              {
                from: 0.3,
                to: click - 0.3,
                text: 'The preview (left): the save, values generated',
              },
              {
                from: click - 0.1,
                to: end - 0.3,
                text: "A pick in the game: its live snapshot, the game's own values",
              },
            ],
            highlights: values.map((rect) => ({
              from: snapshot + 0.3,
              to: end - 0.1,
              panel: 0,
              rect,
            })),
          },
        ],
      } satisfies EditSpec;
    },
  },
];
