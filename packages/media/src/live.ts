// The live take (etch-website docs/spec.md section 8.5): Etch's live game beside VS Code, one take
// for the four live clips. VS Code fills the primary monitor as in the offline takes, with the
// preview open; the game runs windowed at a corpus resolution on the monitor right of it, from the
// run's private install with the run's own copies of the player's settings and of one save, through
// the media helper (live-helper/), on the province whose sample data the preview shows. Both windows
// are recorded against the take's clock. The take first saves an edit that the game reloads
// (`reload`), then turns pick mode on in the game, hovers a few widgets and clicks one (`pick`),
// which also gives the preview a live snapshot (`snapshot`); last, it runs script in the game from
// the editor's context menu (`run`). The edits compose the clips as the offline ones (clips.ts):
// the control left, its effect right, the captions under both.
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { Locator } from '@playwright/test';
import { findProfileFolder, systemEnvironment } from '@etch/core/playset';
import {
  centre,
  CODE_SCALE,
  codeView,
  DETAIL_SCALE,
  editorLine,
  LEAD,
  onScreen,
  OVERRIDES,
  pair,
  pointTo,
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
import { DEVICE_SCALE, LIVE_GAME_RESOLUTION } from './config.ts';
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
/** A widget `pick` hovers, and where the pointer goes across it: 0 its left edge, 1 its right. */
interface Hover {
  readonly selector: string;
  readonly across?: number;
}
/**
 * What `pick` hovers, in the trade section, the last the button it then clicks. The game shows its
 * own tooltip in pick mode at once, beside the pointer and under pick mode's label, and every
 * widget of the section has one: the loop hovers the widgets with a one-line tooltip (the
 * section's numbers and their labels have tooltips of ten lines, which cover the label), and the
 * button at its right end, so its tooltip ("Go to trade node interface") starts past the button;
 * at its left end the tooltip covers the button, and pick mode's outline seems to frame it.
 */
const HOVERED: readonly [Hover, ...Hover[]] = [
  { selector: 'provinceview//trade_shield' },
  { selector: 'provinceview//tradepost_button' },
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
    // take without it loaded at once (2026-11-18). Why is not known. Nor its models `.gfx`
    // (`hovers`' file, which no live clip shows), so the game loads what it loaded then.
    excluded: ['events', path.join('interface', 'assets')],
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
    // The plugin logs each switch of pick mode in the private install's anvil.log: the key can be
    // lost (a take on 2026-11-21 hovered with pick mode off), so it is pressed once more if no
    // switch follows.
    const anvilLog = path.join(
      path.dirname(wb.workspace),
      'user-data',
      'User',
      'globalStorage',
      'happy-dwarf-team.etch',
      'private-install',
      'game',
      'anvil',
      'anvil.log',
    );
    const pickOns = async (): Promise<number> =>
      ((await readFile(anvilLog, 'utf8').catch(() => '')).match(/\] pick mode on \(/g) ?? [])
        .length;
    const onsBefore = await pickOns();
    take.mark('pick.on');
    await desktop.keys(SCAN.ctrl, SCAN.shift, SCAN.e);
    const turnedOn = (): Promise<boolean> =>
      until('pick mode on', async () => (await pickOns()) > onsBefore, 1_500, 50).then(
        () => true,
        () => false,
      );
    if (!(await turnedOn())) {
      console.log('Pick mode did not come on: the key is pressed again.');
      if (!(await desktop.focus(game.hwnd)))
        throw new Error('the game could not be brought forward');
      await sleep(300);
      take.mark('pick.again');
      await desktop.keys(SCAN.ctrl, SCAN.shift, SCAN.e);
      if (!(await turnedOn()))
        throw new Error('pick mode did not come on after Ctrl+Shift+E, twice');
    }
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

    await takeRun({ wb, take, live, repository: options.repository });
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

/** The demo mod's event file `run` selects in, copied into the workspace once the game is in. */
const RUN_FILE = 'etch_demo_events.txt';
/** The effect `run` runs, its first line; the next line is the effect's second. */
const RUN_EFFECT = 'add_base_production = 1';
/** The letter `run` adds to the effect's name: the game logs an unknown effect. */
const RUN_TYPO = 's';
/** The part of the game's error.log line, in Problems, that the loop shows. */
const RUN_ERROR_TEXT = 'Error: Unknown effect type. Key: add_base_productions';
/** The trigger `run` checks, in the province's scope. */
const RUN_TRIGGER = 'development = 10';
/** The province view's development, as Tongs finds it: its three parts and its sum. */
const DEVELOPMENT = [
  'provinceview//tax_base_value',
  'provinceview//production_base_value',
  'provinceview//manpower_base_value',
  'provinceview//development_value',
] as const;
const RUN_MENU_ITEM = 'Run Selection in the Province on Screen';
const CHECK_MENU_ITEM = 'Check Selection as Trigger in the Live Game';

interface Development {
  readonly base_tax: number;
  readonly base_production: number;
  readonly base_manpower: number;
}

/**
 * `run`, the take's last part, since it changes the game: the demo mod's event file in VS Code,
 * Problems open under it. The effect's two lines run in the province on screen from the editor's
 * context menu, the trigger checked there, the effect's name misspelt and run again; then undone.
 * The game's state is not restored: the loop dissolves its end into its start.
 */
async function takeRun({
  wb,
  take,
  live,
  repository,
}: {
  wb: Workbench;
  take: Take;
  live: Tongs;
  repository: string;
}): Promise<void> {
  const development = (): Promise<Development> =>
    live.send<Development>(`province ${String(LIVE_PROVINCE)}`);
  const developmentRect = async (): Promise<Rect> => {
    const found: Rect[] = [];
    for (const selector of DEVELOPMENT) {
      const widget = await live.widget(selector).catch(() => undefined);
      if (widget?.visible === true) found.push(rectOfWidget(widget));
    }
    if (found.length === 0) throw new Error("the province view's development is not found");
    return union(...found);
  };

  // The file, written into the workspace now: the game loaded the mod without it (`excluded`).
  await mkdir(path.join(wb.workspace, 'events'), { recursive: true });
  await copyFile(
    path.join(repository, 'packages', 'media', 'demo-mod', 'events', RUN_FILE),
    path.join(wb.workspace, 'events', RUN_FILE),
  );
  await wb.quickOpen(RUN_FILE);
  await wb.page.keyboard.press('Control+Shift+M');
  await wb.page.locator('.markers-panel').waitFor();
  await wb.filterProblems(RUN_FILE).catch(() => undefined);
  const trigger = await wb.find(RUN_TRIGGER);
  const effect = await wb.find(RUN_EFFECT);

  const select = {
    // The effect's two lines, from the first one's first letter.
    effect: async (): Promise<void> => {
      await wb.walkCursorTo({ line: effect.line, column: 1 }, 0);
      await wb.press('Home');
      await wb.press('Shift+ArrowDown');
      await wb.press('Shift+End');
    },
    trigger: async (): Promise<void> => {
      await wb.walkCursorTo({ line: trigger.line, column: 1 }, 0);
      await wb.press('Home');
      await wb.press('Shift+End');
    },
  };
  const menuItem = (label: string) =>
    wb.page.locator('.context-view .monaco-menu .action-item', { hasText: label }).first();
  const toast = (text: string | RegExp) =>
    wb.page.locator('.notifications-toasts .notification-toast', { hasText: text }).last();
  /** A box once it stops moving: a notification slides in, and pushes the older ones up. */
  const settled = async (locator: Locator): Promise<Rect> => {
    let last = await wb.box(locator);
    for (let tries = 0; tries < 30; tries += 1) {
      await sleep(50);
      const now = await wb.box(locator);
      if (now.x === last.x && now.y === last.y && now.w === last.w && now.h === last.h) return now;
      last = now;
    }
    return last;
  };
  const scopePick = wb.page
    .locator('.quick-input-list .monaco-list-row', { hasText: `Province ${String(LIVE_PROVINCE)}` })
    .first();

  // A first run unrecorded: the first of a session adds a notice about the private copy.
  await select.trigger();
  await wb.command(`Etch: ${CHECK_MENU_ITEM}`, { keepsQuickInput: true });
  await scopePick.waitFor();
  await scopePick.click();
  await toast(/The trigger is (TRUE|FALSE)/).waitFor({ timeout: 30_000 });
  await wb.command('Notifications: Clear All Notifications');
  await wb.focusEditor();

  // The lines, measured with the effect selected, as the take starts.
  await select.effect();
  const editor = await wb.box(wb.page.locator('.part.editor .monaco-editor').first());
  const line = await wb.lineRect();
  const effectLines: Rect = { x: editor.x, y: line.y - line.h, w: editor.w, h: 2 * line.h };
  take.mark('run.lines', { source: 'vscode', rect: effectLines });
  await select.trigger();
  take.mark('run.trigger', { source: 'vscode', rect: await editorLine(wb) });
  await select.effect();
  take.mark('run.panel', { source: 'vscode', rect: await wb.box(wb.page.locator('.part.panel')) });
  take.mark('run.dev', { source: 'game', rect: await developmentRect() });
  const context = { wb, take };
  const rest = { x: editor.x + 60, y: editor.y + editor.h - 60 };
  await pointTo(context, rest, 16);
  await sleep(1200);

  /** Right-clicks the selection and clicks `label` in the editor's context menu. */
  const fromMenu = async (label: string, step: string): Promise<void> => {
    const selected = await wb.box(wb.page.locator('.part.editor .selected-text').first());
    const at = { x: selected.x + Math.min(160, selected.w / 2), y: selected.y + selected.h / 2 };
    await pointTo(context, at, 600);
    await sleep(150);
    take.click();
    await wb.page.mouse.click(at.x, at.y, { button: 'right' });
    const item = menuItem(label);
    await item.waitFor();
    take.mark(`${step}.menu`, {
      source: 'vscode',
      rect: await wb.box(wb.page.locator('.context-view .monaco-menu').first()),
    });
    await sleep(350);
    await pointTo(context, await centre(item), 450);
    await sleep(200);
    take.mark(`${step}.click`, { source: 'vscode', rect: await wb.box(item) });
    take.click();
    await item.click();
  };

  // The effect run in the province on screen: the development rises in the game.
  const before = await development();
  take.mark('run.start');
  await fromMenu(RUN_MENU_ITEM, 'run.effect');
  await until(
    'the development to rise',
    async () => (await development()).base_production > before.base_production,
    15_000,
    50,
  );
  take.mark('run.raised', { source: 'game', rect: await developmentRect() });
  const ran = toast(`Ran in province ${String(LIVE_PROVINCE)}`);
  await ran.waitFor({ timeout: 10_000 });
  take.mark('run.ran', { source: 'vscode', rect: await settled(ran) });
  await sleep(1400);

  // The trigger checked in the province: the answer in a notification.
  take.mark('run.select');
  await select.trigger();
  await sleep(300);
  await fromMenu(CHECK_MENU_ITEM, 'run.check');
  await scopePick.waitFor();
  take.mark('run.scope', {
    source: 'vscode',
    rect: await settled(wb.page.locator('.quick-input-widget')),
  });
  await sleep(300);
  await pointTo(context, await centre(scopePick), 500);
  await sleep(150);
  take.click();
  await scopePick.click();
  const answer = toast(/The trigger is (TRUE|FALSE)/);
  await answer.waitFor({ timeout: 30_000 });
  take.mark('run.answer', { source: 'vscode', rect: await settled(answer) });
  await sleep(1600);

  // The effect's name misspelt and run again: the game's error, in Problems on the selection.
  take.mark('run.typo');
  await wb.walkCursorTo({ line: effect.line, column: 1 }, 0);
  await wb.press('Home');
  await wb.press('ArrowRight', 'add_base_production'.length);
  await wb.type(RUN_TYPO);
  await sleep(500);
  await select.effect();
  await sleep(200);
  await fromMenu(RUN_MENU_ITEM, 'run.again');
  const problem = wb.page.locator('.markers-panel .monaco-list-row', { hasText: 'error.log' });
  await problem.first().waitFor({ timeout: 30_000 });
  // The row is as wide as the window, its message a long error.log line: the loop shows the part
  // that names the misspelt effect.
  const message = await problem.first().evaluate((row, wanted) => {
    const walker = row.ownerDocument.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(wanted) ?? -1;
      if (at < 0) continue;
      const range = row.ownerDocument.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + wanted.length);
      const box = range.getBoundingClientRect();
      return { x: box.x, y: box.y, w: box.width, h: box.height };
    }
    return undefined;
  }, RUN_ERROR_TEXT);
  if (message === undefined) throw new Error(`the Problems row does not say "${RUN_ERROR_TEXT}"`);
  take.mark('run.error', {
    source: 'vscode',
    rect: {
      x: message.x * DEVICE_SCALE,
      y: message.y * DEVICE_SCALE,
      w: message.w * DEVICE_SCALE,
      h: message.h * DEVICE_SCALE,
    },
  });
  await sleep(2000);
  take.mark('run.undo');
  await wb.press('Control+Z');
  await problem.first().waitFor({ state: 'detached', timeout: 10_000 });
  await sleep(300);
  await pointTo(context, rest, 600);
  await sleep(800);
  take.mark('run.end');
  await take.until(take.t() + POST_ROLL_MS / 1000);
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
  {
    // Run in the live game: the event file left, with the context menu over it; the game's
    // development top right; what Etch answers under it: the notification of each run, the
    // scope's pick, Problems. The end dissolves into the start: the game keeps the development.
    id: 'run',
    edit(log, sources) {
      const code = sources['vscode'] as Source;
      const game = sources['game'] as Source;
      const s0 = t(eventOf(log, 'run.start')) - LEAD;
      const at = (time: number): number => time - s0;
      const atOf = (kind: string): number => at(t(eventOf(log, kind)));
      const end = atOf('run.end') + TAIL;
      const dev = rectOf(eventOf(log, 'run.dev'));
      // The development's row at 2×, with room around it for its ring.
      const right = { w: Math.min(900, Math.round((dev.w + 80) * DETAIL_SCALE)) };
      const left: Rect = { x: STAGE.x, y: STAGE.y, w: STAGE.w - GUTTER - right.w, h: STAGE.h };
      const ran = rectOf(eventOf(log, 'run.ran'));
      const scope = rectOf(eventOf(log, 'run.scope'));
      const answer = rectOf(eventOf(log, 'run.answer'));
      const error = rectOf(eventOf(log, 'run.error'));
      // Each answer at the largest scale the column's width takes, up to 1.8×; the panel under
      // the development as tall as the tallest of them; the two centred on the stage's height.
      const answerScale = (rect: Rect): number => Math.min(1.8, (right.w - 48) / rect.w);
      const topH = Math.round((dev.h + 120) * DETAIL_SCALE);
      const bottomH = Math.round(
        Math.max(...[ran, scope, answer, error].map((rect) => rect.h * answerScale(rect))) + 48,
      );
      const top: Rect = {
        x: left.x + left.w + GUTTER,
        y: STAGE.y + Math.round((STAGE.h - topH - GUTTER - bottomH) / 2),
        w: right.w,
        h: topH,
      };
      const bottom: Rect = { ...top, y: top.y + top.h + GUTTER, h: bottomH };
      // The code from the trigger's line down to the menu's bottom, at 1.5× if it fits.
      const triggerLine = rectOf(eventOf(log, 'run.trigger'));
      const menuBottom = Math.max(
        ...['run.effect.menu', 'run.check.menu', 'run.again.menu'].map((kind) => {
          const menu = rectOf(eventOf(log, kind));
          return menu.y + menu.h;
        }),
      );
      const codeScale = Math.min(CODE_SCALE, left.h / (menuBottom + 24 - (triggerLine.y - 48)));
      const codeViewRect = viewAt(
        { ...triggerLine, y: triggerLine.y - 48 },
        codeScale,
        left,
        code,
        { x: 0, y: 0 },
      );
      // `margin` output px from the panel's left edge, in the middle of its height; the error's
      // excerpt at the edge, where the text before it would show.
      const answerView = (rect: Rect, margin = 24): Rect => {
        const scale = answerScale(rect);
        return viewAt(rect, scale, bottom, code, {
          x: margin / (bottom.w / scale),
          y: 0.5 - rect.h / 2 / (bottom.h / scale),
        });
      };
      // From one answer to the next through black: they lie far apart in the window, and a pan
      // would cross the preview.
      const cutTo = (at: number, from: Rect, to: Rect, margin?: number) => [
        { at: at - 0.35, view: answerView(from), opacity: 0, move: 0.15 },
        { at: at - 0.2, view: answerView(to, margin), opacity: 0, move: 0 },
        { at: at - 0.19, view: answerView(to, margin), opacity: 1, move: 0.2 },
      ];
      const raised = atOf('run.raised');
      const ranAt = atOf('run.ran');
      const scopeAt = atOf('run.scope');
      const answerAt = atOf('run.answer');
      const errorAt = atOf('run.error');
      const undo = atOf('run.undo');
      const pointer = { points: log.pointer, clicks: log.clicks };
      const captions: Caption[] = [
        {
          from: 0.2,
          to: raised - 0.2,
          text: `Right-click an effect: ${RUN_MENU_ITEM}`,
        },
        {
          from: raised,
          to: atOf('run.select') - 0.2,
          text: "The game runs it: the province's development rises",
        },
        {
          from: atOf('run.select'),
          to: answerAt - 0.2,
          text: `${CHECK_MENU_ITEM}, in the province`,
        },
        { from: answerAt, to: atOf('run.typo') - 0.2, text: "The game's answer" },
        {
          from: atOf('run.typo'),
          to: errorAt - 0.2,
          keys: [RUN_TYPO],
          text: 'A misspelt effect, run again',
        },
        { from: errorAt, to: undo - 0.2, text: "The game's error, in Problems on the selection" },
        { from: undo, to: end - 0.3, keys: ['Ctrl', 'Z'] },
      ];
      const highlights: Highlight[] = [
        { from: raised + 0.1, to: atOf('run.select') - 0.1, panel: 1, rect: dev },
        { from: answerAt + 0.3, to: atOf('run.typo') - 0.1, panel: 2, rect: answer },
        { from: errorAt + 0.3, to: undo - 0.1, panel: 2, rect: error },
        {
          from: errorAt + 0.3,
          to: undo - 0.1,
          panel: 0,
          rect: { ...rectOf(eventOf(log, 'run.lines')), w: 720 },
        },
      ];
      return {
        id: 'run',
        sources,
        loopFade: 0.6,
        segments: [
          {
            duration: end,
            panels: [
              {
                source: 'vscode',
                start: s0,
                keys: cameraKeys([{ at: 0, frame: left, view: codeViewRect }]),
                pointer,
                fadeRight: TEXT_FADE,
              },
              {
                source: 'game',
                start: s0,
                keys: cameraKeys([
                  { at: 0, frame: top, view: viewAt(dev, DETAIL_SCALE, top, game) },
                ]),
              },
              {
                source: 'vscode',
                start: s0,
                keys: cameraKeys([
                  { at: 0, frame: bottom, view: answerView(ran), opacity: 0 },
                  { at: ranAt - 0.1, view: answerView(ran), opacity: 1, move: 0.3 },
                  ...cutTo(scopeAt, ran, scope),
                  ...cutTo(answerAt, scope, answer),
                  ...cutTo(errorAt, answer, error, 8),
                  // The undo clears Problems: the panel goes with it.
                  { at: undo, view: answerView(error, 8), opacity: 0, move: 0.3 },
                ]),
                pointer,
                fadeRight: TEXT_FADE,
              },
            ],
            captions,
            highlights,
          },
        ],
      } satisfies EditSpec;
    },
  },
];
