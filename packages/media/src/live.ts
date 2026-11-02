// The live take (etch-website docs/spec.md section 8.5): Etch's live game beside VS Code, one take
// for the three live clips. VS Code fills the primary monitor as in the offline takes, with the
// preview open; the game runs windowed at a corpus resolution on the monitor right of it, from the
// run's private install with the run's own copies of the player's settings and of one save, through
// the media helper (live-helper/). Both windows are recorded against the take's clock. The take
// first saves an edit that the game reloads (`reload`), then turns pick mode on in the game, hovers
// a few widgets and clicks one (`pick`), which also gives the preview a live snapshot (`snapshot`).
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { findProfileFolder, systemEnvironment } from '@etch/core/playset';
import { OVERRIDES, START_FILE, WINDOW_NAME, type Clip } from './clips.ts';
import { LIVE_GAME_RESOLUTION } from './config.ts';
import { Desktop, SCAN, type Point, type WindowInfo } from './desktop.ts';
import {
  cameraKeys,
  focus,
  FULL_FRAME,
  MOVE,
  union,
  whole,
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
/** Where the real pointer waits, in the game's client area: over the ornament right of the province view. */
const GAME_REST: Point = { x: 1200, y: 1000 };

/** The edit `reload` saves: the buildings side panel's x, 480, becomes 580 with one keystroke. */
export const RELOAD_EDIT = { text: 'x=480 y=13', offset: 2, key: '5', from: 480, to: 580 } as const;
/** The edited window, as Tongs finds it in the game. */
export const RELOAD_WIDGET = 'provinceview//buildings_window';
/**
 * The panel the edited window shows, which the clips frame, ring and click: the window also holds
 * the great projects' panel, hidden (an empty strip) in a province without one.
 */
const PANEL_WIDGET = 'provinceview//general_buildings_window';
/** Widgets `pick` hovers, where the game shows them, before it clicks the buildings panel. */
const HOVERED = [
  'provinceview//military_header',
  'provinceview//trade_header',
  'provinceview//province_name',
];

const PRE_ROLL_MS = 2500;
const POST_ROLL_MS = 2000;
const HOLD_MS = 2200;
/** The wide shot before the first move and after the last. */
const LEAD = 2.2;
const TAIL = 1.4;

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
    await until(
      'the save to load',
      async () => (await live.send<{ in_game?: boolean }>('state')).in_game === true,
      600_000,
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

    // An own province's view, as a click on the map opens it: the capital's, or the next one
    // without a great project. Its picture is DLC art, which the preview's playset (the base
    // game and the demo mod) does not have, so the snapshot would draw its placeholder.
    const tag = (await live.send<{ tag: string }>('player')).tag;
    const country = await live.send<{ capital: number | null; provinces: number[] }>(
      `country ${tag}`,
    );
    const candidates = [
      ...(country.capital === null ? [] : [country.capital]),
      ...country.provinces.filter((id) => id !== country.capital),
    ].slice(0, 20);
    let opened: number | undefined;
    for (const id of candidates) {
      await live.send(`province open ${String(id)}`);
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
      if (!projects.matches.some((match) => match.visible)) {
        opened = id;
        break;
      }
    }
    if (opened === undefined) throw new Error(`no province of ${tag} without a great project`);
    take.mark('province', { label: String(opened) });

    // The panel's x as the game counts it: its left edge less the x in the file.
    const base = (await live.widget(RELOAD_WIDGET)).rect.x - RELOAD_EDIT.from;
    const panelAt = async (x: number): Promise<TongsWidget> => {
      let widget: TongsWidget | undefined;
      try {
        await until(
          `the buildings panel at x ${String(x)}`,
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
    const panelRect = async (): Promise<Rect> =>
      rectOfWidget(await live.widget(PANEL_WIDGET).catch(() => live.widget(RELOAD_WIDGET)));
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
    await panelAt(RELOAD_EDIT.to);
    await wb.press('Control+Z');
    await wb.press('Control+S');
    await panelAt(RELOAD_EDIT.from);
    await wb.selectionIs(1);
    await wb.command('Notifications: Clear All Notifications');
    await wb.focusEditor();
    await wb.highlightSettled();

    take.mark('line', { source: 'vscode', rect: await wb.lineRect() });
    take.mark('screen', { source: 'vscode', rect: await wb.screenRect() });
    take.mark('panel', { source: 'game', rect: await panelRect() });
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
    await wb.type(RELOAD_EDIT.key);
    take.mark('reload.key');
    await sleep(700);
    take.mark('reload.save');
    await wb.press('Control+S');
    await panelAt(RELOAD_EDIT.to);
    take.mark('reload.moved', { source: 'game', rect: await panelRect() });
    await sleep(HOLD_MS);
    take.mark('reload.undo');
    await wb.press('Control+Z');
    await sleep(500);
    take.mark('reload.resave');
    await wb.press('Control+S');
    await panelAt(RELOAD_EDIT.from);
    take.mark('reload.back', { source: 'game', rect: await panelRect() });
    await sleep(1500);
    if (await wb.dirty()) throw new Error('reload does not close: the file is still unsaved');
    take.mark('reload.end');

    // pick: pick mode on in the game, a few widgets hovered, the buildings panel clicked; the
    // pick opens its definition in VS Code and gives the preview a live snapshot.
    await sleep(800);
    take.mark('pick.start');
    if (!(await desktop.focus(game.hwnd))) throw new Error('the game could not be brought forward');
    await sleep(500);
    take.mark('pick.on');
    await desktop.keys(SCAN.ctrl, SCAN.shift, SCAN.e);
    await sleep(900);
    for (const selector of HOVERED) {
      const widget = await live.widget(selector).catch(() => undefined);
      if (widget === undefined) continue;
      await desktop.movePointer(screen(widget.click_point), 650);
      take.mark('pick.hover', { source: 'game', rect: rectOfWidget(widget), label: selector });
      await sleep(1000);
    }
    const target = await live.widget(PANEL_WIDGET).catch(() => live.widget(RELOAD_WIDGET));
    const point = target.click_point;
    await desktop.movePointer(screen(point), 650);
    take.mark('pick.hover', { source: 'game', rect: rectOfWidget(target), label: PANEL_WIDGET });
    await sleep(700);
    const before = await wb.cursor();
    take.mark('pick.click', { source: 'game', point });
    await desktop.click();
    await until(
      'the pick in the editor',
      async () => (await wb.cursor()).line !== before.line,
      10_000,
      25,
    );
    take.mark('pick.jump', { source: 'vscode', rect: await wb.lineRect() });
    await sleep(2500);
    take.mark('pick.end');
    await desktop.movePointer(rest, 600);
    await take.until(take.t() + POST_ROLL_MS / 1000);
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

// The live clips' layouts in the 1920 × 1080 output: side by side, both 16:9 (the wide shot and the
// loop's seam), and tall, each half of the frame.
const SIDE_CODE: Rect = { x: 24, y: 280, w: 924, h: 520 };
const SIDE_GAME: Rect = { x: 972, y: 280, w: 924, h: 520 };
const TALL_CODE: Rect = { x: 24, y: 24, w: 924, h: 1032 };
const TALL_GAME: Rect = { x: 972, y: 24, w: 924, h: 1032 };
/** A small inset of the other window over a full-frame one. */
const INSET: Rect = { x: 1392, y: 40, w: 488, h: 274 };
const TALL = TALL_CODE.w / TALL_CODE.h;
const WIDE = FULL_FRAME.w / FULL_FRAME.h;

const t = (event: TakeEvent): number => event.t;

/** The two panels' sources, and their wide views in a 16:9 frame. */
function liveSources(sources: Readonly<Record<string, Source>>) {
  const code = sources['vscode'] as Source;
  const game = sources['game'] as Source;
  return { code, game, codeWide: whole(code, WIDE), gameWide: whole(game, WIDE) };
}

export const LIVE_CLIPS: readonly Pick<Clip, 'id' | 'edit'>[] = [
  {
    id: 'reload',
    edit(log, sources) {
      const { code, game, codeWide, gameWide } = liveSources(sources);
      const s0 = t(eventOf(log, 'reload.start')) - LEAD;
      const at = (time: number): number => time - s0;
      const save = t(eventOf(log, 'reload.save'));
      const moved = eventOf(log, 'reload.moved');
      const resave = t(eventOf(log, 'reload.resave'));
      const back = eventOf(log, 'reload.back');
      const zoomIn = LEAD - 0.5;
      const zoomOut = at(t(back)) + 0.6;
      const lineView = focus(rectOf(eventOf(log, 'line')), code, TALL, {
        margin: 30,
        minWidth: 520,
      });
      const panelView = focus(union(rectOf(eventOf(log, 'panel')), rectOf(moved)), game, TALL, {
        margin: 60,
        minWidth: 640,
      });
      const ms = Math.round((t(moved) - save) * 1000);
      const captions: Caption[] = [
        { from: at(save) - 0.15, to: at(t(moved)) + 0.3, keys: ['Ctrl', 'S'] },
        {
          from: at(t(moved)) + 0.3,
          to: at(t(moved)) + 2.0,
          text: `Saved, and the game reloads it (${String(ms)} ms in this take)`,
        },
        {
          from: at(t(eventOf(log, 'reload.undo'))) - 0.15,
          to: at(resave) - 0.05,
          keys: ['Ctrl', 'Z'],
        },
        { from: at(resave) - 0.05, to: at(t(back)) + 0.5, keys: ['Ctrl', 'S'] },
      ];
      const highlights: Highlight[] = [
        { from: at(t(moved)), to: at(t(moved)) + 1.8, panel: 1, rect: rectOf(moved) },
      ];
      return {
        id: 'reload',
        sources,
        // The trailer's part: the save and the panel moving, not the undo.
        core: { from: zoomIn, to: at(t(moved)) + 2.0 },
        segments: [
          {
            duration: zoomOut + MOVE + TAIL,
            panels: [
              {
                source: 'vscode',
                start: s0,
                keys: cameraKeys([
                  { at: 0, frame: SIDE_CODE, view: codeWide },
                  { at: zoomIn, frame: TALL_CODE, view: lineView },
                  { at: zoomOut, frame: SIDE_CODE, view: codeWide },
                ]),
              },
              {
                source: 'game',
                start: s0,
                keys: cameraKeys([
                  { at: 0, frame: SIDE_GAME, view: gameWide },
                  { at: zoomIn, frame: TALL_GAME, view: panelView },
                  { at: zoomOut, frame: SIDE_GAME, view: gameWide },
                ]),
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
    id: 'pick',
    edit(log, sources) {
      const { code, game, codeWide, gameWide } = liveSources(sources);
      const s0 = t(eventOf(log, 'pick.start')) - LEAD;
      const at = (time: number): number => time - s0;
      const on = at(t(eventOf(log, 'pick.on')));
      const hovers = eventsOf(log, 'pick.hover');
      const click = at(t(eventOf(log, 'pick.click')));
      const jump = eventOf(log, 'pick.jump');
      const end = at(t(eventOf(log, 'pick.end')));
      const hovered = focus(union(...hovers.map(rectOf)), game, WIDE, {
        margin: 160,
        minWidth: 1280,
      });
      const lineView = focus(rectOf(jump), code, WIDE, { margin: 60, minWidth: 1280 });
      // While the game fills the frame, the editor stays in it as an inset: the frame is the
      // editor and the game's window together (etch-website docs/spec.md section 1.1).
      const codeInset = {
        frame: INSET,
        view: focus(rectOf(eventOf(log, 'line')), code, WIDE, { margin: 40, minWidth: 1100 }),
      };
      return {
        id: 'pick',
        sources,
        // The trailer's part: the last hover, the click and the definition.
        core: { from: at(t(hovers[hovers.length - 1] as TakeEvent)) - 0.6, to: end },
        loopFade: 0.5,
        segments: [
          {
            duration: end + MOVE + TAIL,
            panels: [
              {
                source: 'vscode',
                start: s0,
                keys: cameraKeys([
                  { at: 0, frame: SIDE_CODE, view: codeWide },
                  { at: on - 0.4, ...codeInset },
                  { at: click + 0.2, frame: FULL_FRAME, view: lineView, opacity: 1 },
                  { at: end, frame: SIDE_CODE, view: codeWide },
                ]),
              },
              {
                source: 'game',
                start: s0,
                keys: cameraKeys([
                  { at: 0, frame: SIDE_GAME, view: gameWide },
                  { at: on - 0.4, frame: FULL_FRAME, view: hovered },
                  { at: click + 0.2, frame: INSET, view: hovered },
                  { at: end, frame: SIDE_GAME, view: gameWide },
                ]),
              },
            ],
            captions: [
              {
                from: on - 0.1,
                to: on + 1.4,
                keys: ['Ctrl', 'Shift', 'E'],
                text: 'pick mode, in the game',
              },
              {
                from: at(t(hovers[0] as TakeEvent)) - 0.1,
                to: click,
                text: 'Each widget: its name, kind, size and file',
              },
              { from: click + 0.5, to: end, text: 'A click opens its definition at its line' },
            ],
            highlights: [{ from: click + 0.9, to: end - 0.2, panel: 0, rect: rectOf(jump) }],
          },
        ],
      } satisfies EditSpec;
    },
  },
  {
    id: 'snapshot',
    edit(log, sources) {
      const { code, codeWide, gameWide } = liveSources(sources);
      const clickTime = t(eventOf(log, 'pick.click'));
      const s0 = clickTime - 3.2;
      const at = (time: number): number => time - s0;
      const click = at(clickTime);
      const end = at(t(eventOf(log, 'pick.end')));
      // The preview with the editor's right edge beside it: the editor stays in the frame.
      const screen = rectOf(eventOf(log, 'screen'));
      const preview = focus(
        union(screen, { x: screen.x - 420, y: screen.y, w: 1, h: screen.h }),
        code,
        WIDE,
        { margin: 30 },
      );
      const zoomIn = LEAD - 0.5;
      return {
        id: 'snapshot',
        sources,
        core: { from: zoomIn, to: end },
        loopFade: 0.5,
        segments: [
          {
            duration: end + MOVE + TAIL,
            panels: [
              {
                source: 'vscode',
                start: s0,
                keys: cameraKeys([
                  { at: 0, frame: SIDE_CODE, view: codeWide },
                  { at: zoomIn, frame: FULL_FRAME, view: preview },
                  { at: end, frame: SIDE_CODE, view: codeWide },
                ]),
              },
              {
                source: 'game',
                start: s0,
                keys: cameraKeys([
                  { at: 0, frame: SIDE_GAME, view: gameWide },
                  { at: zoomIn, frame: INSET, view: gameWide },
                  { at: end, frame: SIDE_GAME, view: gameWide },
                ]),
              },
            ],
            captions: [
              { from: zoomIn + 0.4, to: click - 0.1, text: 'The preview, with sample data' },
              {
                from: click + 0.6,
                to: end,
                text: "A pick in the game: a live snapshot, the game's own texts",
              },
            ],
            highlights: [],
          },
        ],
      } satisfies EditSpec;
    },
  },
];
