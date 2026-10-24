// One VS Code window for one scene: the pinned VS Code, launched through Playwright's Electron
// driver with Etch loaded from the repository, a fresh profile seeded with the capture settings, an
// empty extensions folder and a copy of the demo mod as the workspace (spec section 8.3). It drives
// the workbench with the keyboard, as a user would, and checks the framing rules before each
// capture (section 8.4).
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { _electron, type ElectronApplication, type Frame, type Page } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import {
  DEVICE_SCALE,
  FIRST_PAINT_TIMEOUT_MS,
  PAINT_TIMEOUT_MS,
  QUIET_MS,
  PREVIEW_RESOLUTION,
  VSCODE_VERSION,
  WINDOW,
  workbenchSettings,
} from './config.ts';
import { paintStep, settledPaint, type Paint, type PaintResult } from './paint.ts';

export interface LaunchOptions {
  /**
   * A short folder for VS Code, its profile and the workspace: VS Code fails to load its workbench
   * when its install path passes MAX_PATH.
   */
  readonly work: string;
  /** `packages/extension`, built. */
  readonly extensionPath: string;
  /** The repository's demo mod; the workspace is a fresh copy, so no edit reaches the repository. */
  readonly demoMod: string;
  /** The demo mod file to open first, relative to the mod. */
  readonly open: string;
  /** `etch.gamePath`; when undefined, Etch finds the game through Steam. */
  readonly gamePath: string | undefined;
  /** Where Playwright records the window, for a loop recorded with `recordVideo`. */
  readonly videoDir: string | undefined;
}

/** What may be on screen in a capture besides the scene's editor and preview. */
export interface FrameRules {
  /** The quick pick or command palette is part of the scene. */
  readonly quickInput?: boolean;
}

/** The workspace folder's name, as the Explorer shows it. */
export const WORKSPACE_NAME = 'etch-demo-mod';

/** The arguments VS Code starts with (spec section 8.3). */
export function launchArgs(paths: {
  workspace: string;
  file: string;
  extensionPath: string;
  userData: string;
  extensions: string;
}): string[] {
  return [
    paths.workspace,
    paths.file,
    `--extensionDevelopmentPath=${paths.extensionPath}`,
    `--user-data-dir=${paths.userData}`,
    // An empty folder rather than --disable-extensions, which shows a notification.
    `--extensions-dir=${paths.extensions}`,
    '--skip-release-notes',
    '--skip-welcome',
    '--disable-telemetry',
    '--disable-experiments',
    '--disable-updates',
    '--disable-workspace-trust',
    '--no-cached-data',
    `--force-device-scale-factor=${String(DEVICE_SCALE)}`,
  ];
}

/** `Ln 12, Col 5` of the status bar. */
export interface Cursor {
  readonly line: number;
  readonly column: number;
}

export function parseCursor(text: string): Cursor | undefined {
  const match = /Ln (\d+), Col (\d+)/.exec(text);
  return match === null ? undefined : { line: Number(match[1]), column: Number(match[2]) };
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The part of Electron's `BrowserWindow` used here (Electron's types are not installed). */
interface ElectronWindow {
  readonly webContents: { getURL(): string };
  unmaximize(): void;
  getBounds(): Bounds;
  getContentBounds(): Bounds;
  setBounds(bounds: Bounds): void;
  setContentBounds(bounds: Bounds): void;
  show(): void;
  focus(): void;
  getNativeWindowHandle(): Buffer;
}

interface ElectronMain {
  readonly BrowserWindow: { getAllWindows(): ElectronWindow[] };
}

/** The sidebar's width in CSS px when a scene shows it: the editor keeps about 30 characters. */
const SIDEBAR_WIDTH = 200;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class Workbench {
  /** The webview frame that holds the preview's `canvas#screen`, once the preview is open. */
  private previewFrame: Frame | undefined;

  readonly app: ElectronApplication;
  readonly page: Page;
  /** The window's handle, for FFmpeg's `gfxcapture`. */
  readonly hwnd: string;
  /** The workspace copy of the demo mod. */
  readonly workspace: string;

  private constructor(app: ElectronApplication, page: Page, hwnd: string, workspace: string) {
    this.app = app;
    this.page = page;
    this.hwnd = hwnd;
    this.workspace = workspace;
  }

  static async launch(options: LaunchOptions): Promise<Workbench> {
    const run = path.join(options.work, 'run');
    await rm(run, { recursive: true, force: true });
    const workspace = path.join(run, WORKSPACE_NAME);
    await cp(options.demoMod, workspace, { recursive: true });
    const userData = path.join(run, 'user-data');
    await mkdir(path.join(userData, 'User'), { recursive: true });
    await writeFile(
      path.join(userData, 'User', 'settings.json'),
      `${JSON.stringify(workbenchSettings(options.gamePath), null, 2)}\n`,
    );
    const extensions = path.join(run, 'extensions');
    await mkdir(extensions, { recursive: true });

    const executablePath = await downloadAndUnzipVSCode({
      version: VSCODE_VERSION,
      cachePath: path.join(options.work, 'vscode'),
    });
    const app = await _electron.launch({
      executablePath,
      args: launchArgs({
        workspace,
        file: path.join(workspace, ...options.open.split('/')),
        extensionPath: options.extensionPath,
        userData,
        extensions,
      }),
      ...(options.videoDir === undefined
        ? {}
        : {
            recordVideo: {
              dir: options.videoDir,
              size: { width: WINDOW.width * DEVICE_SCALE, height: WINDOW.height * DEVICE_SCALE },
            },
          }),
    });
    try {
      const page = await app.firstWindow();
      for (let i = 0; i < 300 && !page.url().includes('workbench'); i++) await sleep(100);
      const hwnd = await app.evaluate((electron: ElectronMain, size) => {
        const window = electron.BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().includes('workbench'),
        );
        if (window === undefined) throw new Error('VS Code opened no workbench window');
        window.unmaximize();
        window.setContentBounds({ x: 0, y: 0, ...size });
        // Windows keeps a border of one device-independent pixel out of the content: grow the
        // window by whatever the content lacks.
        const content = window.getContentBounds();
        const outer = window.getBounds();
        window.setBounds({
          x: 2 * outer.x - content.x,
          y: 2 * outer.y - content.y,
          width: outer.width + size.width - content.width,
          height: outer.height + size.height - content.height,
        });
        window.show();
        window.focus();
        return window.getNativeWindowHandle().readBigUInt64LE().toString();
      }, WINDOW);
      await page.waitForSelector('.monaco-workbench');
      await page.waitForSelector('.monaco-editor .view-lines');
      const measure = (): Promise<{ width: number; height: number; scale: number }> =>
        page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
          scale: window.devicePixelRatio,
        }));
      let inner = await measure();
      for (
        let i = 0;
        i < 30 && (inner.width !== WINDOW.width || inner.height !== WINDOW.height);
        i++
      ) {
        await sleep(100);
        inner = await measure();
      }
      if (
        inner.width !== WINDOW.width ||
        inner.height !== WINDOW.height ||
        inner.scale !== DEVICE_SCALE
      ) {
        throw new Error(
          `VS Code is ${String(inner.width)} × ${String(inner.height)} CSS px at scale ` +
            `${String(inner.scale)}, not ${String(WINDOW.width)} × ${String(WINDOW.height)} at ` +
            String(DEVICE_SCALE),
        );
      }
      return new Workbench(app, page, hwnd, workspace);
    } catch (error) {
      await app.close().catch(() => undefined);
      throw error;
    }
  }

  /** The preview's webview frame. */
  get frame(): Frame {
    if (this.previewFrame === undefined) throw new Error('the preview is not open');
    return this.previewFrame;
  }

  /** Runs **Etch: Open Preview** and waits for its first settled paint. */
  async openPreview(allow: readonly PaintResult[] = []): Promise<Paint> {
    await this.command('Etch: Open Preview');
    const frame = await this.findPreviewFrame();
    this.previewFrame = frame;
    const paint = await settledPaint(frame, -1, { timeoutMs: FIRST_PAINT_TIMEOUT_MS, allow });
    await this.focusEditor();
    return paint;
  }

  /** Performs a step that changes the preview and waits for its settled paint. */
  paint(step: () => Promise<void>, allow: readonly PaintResult[] = []): Promise<Paint> {
    return paintStep(this.frame, step, { allow });
  }

  private async findPreviewFrame(): Promise<Frame> {
    // VS Code nests a webview two frames deep.
    for (let i = 0; i < 300; i++) {
      for (const frame of this.page.frames()) {
        const found = await frame
          .evaluate(() => document.querySelector('canvas#screen') !== null)
          .catch(() => false);
        if (found) return frame;
      }
      await sleep(100);
    }
    throw new Error("the preview's canvas#screen did not appear");
  }

  /** Runs a command through the command palette, by its title. */
  async command(title: string, options: { keepsQuickInput?: boolean } = {}): Promise<void> {
    await this.openQuickInput('F1');
    await this.page.keyboard.type(title);
    await this.page
      .locator('.quick-input-list .monaco-list-row.focused', { hasText: title })
      .waitFor();
    await this.page.keyboard.press('Enter');
    if (options.keepsQuickInput !== true) await this.quickInputClosed();
  }

  /** Opens a workspace file through Quick Open, by its file name, in the editor's group. */
  async quickOpen(name: string): Promise<void> {
    await this.focusEditor();
    await this.openQuickInput('Control+P');
    await this.page.keyboard.type(name);
    await this.page
      .locator('.quick-input-list .monaco-list-row.focused', { hasText: name })
      .waitFor();
    await this.page.keyboard.press('Enter');
    await this.quickInputClosed();
    await this.page.locator('.tab.active', { hasText: name }).waitFor();
  }

  /**
   * Opens the command palette or Quick Open by its key. A key pressed while the focus is still
   * leaving the preview's webview can be lost, so the key is pressed again until it opens.
   */
  private async openQuickInput(key: string): Promise<void> {
    const input = this.page.locator('.quick-input-widget input');
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.page.keyboard.press(key);
      try {
        await input.waitFor({ state: 'visible', timeout: 2_000 });
        return;
      } catch {
        // Pressed again below.
      }
    }
    await input.waitFor({ state: 'visible', timeout: 2_000 });
  }

  private async quickInputClosed(): Promise<void> {
    await this.page.locator('.quick-input-widget').waitFor({ state: 'hidden' });
  }

  /**
   * Selects the one match of `text` in the active editor with Find, then closes Find: the editor
   * keeps the match selected. Not Go to Line, whose column is wrong in tab-indented files.
   * Resolves to the match's line and the columns of its first character and of the one after it.
   */
  async find(text: string): Promise<{ line: number; start: number; end: number }> {
    await this.focusEditor();
    await this.page.keyboard.press('Control+Home');
    await this.page.keyboard.press('Control+F');
    const widget = this.page.locator('.find-widget.visible');
    await widget.waitFor();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.type(text);
    try {
      await widget.locator('.matchesCount', { hasText: /^1 of 1$/ }).waitFor({ timeout: 5_000 });
    } catch (error) {
      throw new Error(`"${text}" is not found exactly once in the active editor`, {
        cause: error,
      });
    }
    await this.page.keyboard.press('Escape');
    await widget.waitFor({ state: 'hidden' });
    await this.selectionIs(text.length);
    // The status bar's column is the selection's end; the match has no tabs.
    const end = await this.cursor();
    return { line: end.line, start: end.column - text.length, end: end.column };
  }

  /** Presses a key, `times` times, `delayMs` apart. */
  async press(key: string, times = 1, delayMs = 0): Promise<void> {
    for (let i = 0; i < times; i++) {
      if (i > 0 && delayMs > 0) await sleep(delayMs);
      await this.page.keyboard.press(key);
    }
  }

  async type(text: string): Promise<void> {
    await this.page.keyboard.type(text);
  }

  /** The cursor of the active editor, from the status bar. */
  async cursor(): Promise<Cursor> {
    const text = await this.page.locator('[id="status.editor.selection"]').textContent();
    const cursor = parseCursor(text ?? '');
    if (cursor === undefined) throw new Error(`the status bar shows no cursor: "${text ?? ''}"`);
    return cursor;
  }

  /**
   * Walks the cursor to `target` with the arrow keys, `delayMs` between keys, reading the status
   * bar after each key, so it never overshoots.
   */
  async walkCursorTo(target: Cursor, delayMs: number): Promise<void> {
    for (let i = 0; i < 400; i++) {
      const at = await this.cursor();
      const key =
        at.line < target.line
          ? 'ArrowDown'
          : at.line > target.line
            ? 'ArrowUp'
            : at.column < target.column
              ? 'ArrowRight'
              : at.column > target.column
                ? 'ArrowLeft'
                : undefined;
      if (key === undefined) return;
      await this.page.keyboard.press(key);
      await this.page.waitForFunction(
        (before) => document.getElementById('status.editor.selection')?.textContent !== before,
        `Ln ${String(at.line)}, Col ${String(at.column)}`,
        { timeout: 5_000 },
      );
      await sleep(delayMs);
    }
    throw new Error(
      `the cursor did not reach Ln ${String(target.line)}, Col ${String(target.column)}`,
    );
  }

  /** Waits until the status bar shows `characters` selected. */
  async selectionIs(characters: number): Promise<void> {
    await this.page
      .locator('[id="status.editor.selection"]', { hasText: `(${String(characters)} selected)` })
      .waitFor();
  }

  /** Whether an editor has unsaved changes. */
  async dirty(): Promise<boolean> {
    return (await this.page.locator('.tab.dirty').count()) > 0;
  }

  /** Waits until the preview's toolbar names `window`. */
  async expectPreviewed(window: string): Promise<void> {
    await this.frame.locator('#title', { hasText: new RegExp(`^${window}$`) }).waitFor();
  }

  /**
   * Waits until the outline of the widget at the cursor shows and has not moved for a quiet
   * window: the host posts it after the cursor moves, without a paint.
   */
  async highlightSettled(): Promise<void> {
    await this.frame.waitForFunction(
      (quietMs) => {
        const box = document.getElementById('selected');
        if (box === null || box.hidden) return false;
        const key = box.style.cssText;
        const seen = window as unknown as { etchMediaOutline?: { key: string; at: number } };
        const now = performance.now();
        if (seen.etchMediaOutline?.key !== key) {
          seen.etchMediaOutline = { key, at: now };
          return false;
        }
        return now - seen.etchMediaOutline.at >= quietMs;
      },
      QUIET_MS,
      { polling: 25, timeout: PAINT_TIMEOUT_MS },
    );
  }

  /** Moves the focus in the open quick pick down to the item whose label starts with `label`. */
  async focusQuickPickItem(label: string): Promise<void> {
    const focused = this.page.locator('.quick-input-list .monaco-list-row.focused');
    await focused.waitFor();
    for (let i = 0; i < 30; i++) {
      const text = (await focused.textContent()) ?? '';
      if (text.startsWith(label)) return;
      await this.page.keyboard.press('ArrowDown');
      await this.page.waitForFunction(
        (before) =>
          document.querySelector('.quick-input-list .monaco-list-row.focused')?.textContent !==
          before,
        text,
      );
    }
    throw new Error(`the quick pick has no item ${label}`);
  }

  /** Puts Playwright's mouse over the editor, where it shows nothing (hovers are off). */
  async parkMouse(): Promise<void> {
    const box = await this.page
      .locator('.part.editor .monaco-editor .view-lines')
      .first()
      .boundingBox();
    if (box !== null) await this.page.mouse.move(box.x + 24, box.y + box.height - 24);
  }

  /** Moves the keyboard focus to the editor beside the preview. */
  async focusEditor(): Promise<void> {
    const focused = this.page.locator('.part.editor .monaco-editor.focused');
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.page.keyboard.press('Control+1');
      try {
        await focused.waitFor({ timeout: 2_000 });
        return;
      } catch {
        // Pressed again below, as for a lost key in openQuickInput.
      }
    }
    await focused.waitFor({ timeout: 2_000 });
  }

  /**
   * Drags the sash between the editor and the preview, and the bottom panel's when it is open, so
   * the preview canvas shows the game screen unscaled: one game pixel, one device pixel (spec
   * section 8.4). The editor gives way.
   */
  async fitPreview(): Promise<void> {
    const sidebars = this.page.locator('.part.sidebar').filter({ visible: true });
    const sidebar = (await sidebars.count()) > 0 ? await sidebars.first().boundingBox() : null;
    if (sidebar !== null && sidebar.width !== SIDEBAR_WIDTH) {
      await this.dragSash('vertical', sidebar.x + sidebar.width, SIDEBAR_WIDTH - sidebar.width);
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const fit = await this.previewFit();
      if (fit.width === 0 && fit.height === 0) return;
      if (fit.width !== 0) await this.dragSash('vertical', fit.left, -fit.width);
      if (fit.height !== 0) await this.dragSash('horizontal', fit.bottom, fit.height);
      await sleep(300);
    }
    const fit = await this.previewFit();
    if (fit.width !== 0 || fit.height !== 0) {
      throw new Error(`the preview cannot be fitted unscaled: ${JSON.stringify(fit)}`);
    }
  }

  /**
   * How many CSS pixels the preview's area lacks in width and height (negative: too much) for an
   * unscaled canvas inside its 8 px margin, and where the webview's left and bottom edges are.
   */
  private async previewFit(): Promise<{
    width: number;
    height: number;
    left: number;
    bottom: number;
  }> {
    const area = await this.frame.evaluate(() => {
      const main = document.querySelector('main');
      return main === null ? undefined : { width: main.clientWidth, height: main.clientHeight };
    });
    const webview = await this.page.locator('iframe.webview').boundingBox();
    if (area === undefined || webview === null) throw new Error('the preview has no area to fit');
    const wantWidth = PREVIEW_RESOLUTION.width / DEVICE_SCALE + 16;
    // A few pixels to spare: the area's height is fractional, its clientHeight is not.
    const wantHeight = PREVIEW_RESOLUTION.height / DEVICE_SCALE + 16 + 4;
    return {
      width: wantWidth - area.width,
      // Only a lack of height matters: the canvas is centred vertically.
      height: Math.max(0, wantHeight - area.height),
      left: webview.x,
      bottom: webview.y + webview.height,
    };
  }

  /**
   * Drags the sash at `at` (an x for a vertical sash, a y for a horizontal one) by `by` CSS px.
   * Playwright's mouse is not the system pointer, so nothing moves on screen but the sash.
   */
  private async dragSash(
    orientation: 'vertical' | 'horizontal',
    at: number,
    by: number,
  ): Promise<void> {
    const sashes = this.page.locator(`.monaco-sash.${orientation}:not(.disabled)`);
    const count = await sashes.count();
    for (let i = 0; i < count; i++) {
      const box = await sashes.nth(i).boundingBox();
      if (box === null || box.width === 0 || box.height === 0) continue;
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      if (Math.abs((orientation === 'vertical' ? centre.x : centre.y) - at) > 4) continue;
      await this.page.mouse.move(centre.x, centre.y);
      await this.page.mouse.down();
      const to =
        orientation === 'vertical'
          ? { x: centre.x + by, y: centre.y }
          : { x: centre.x, y: centre.y + by };
      await this.page.mouse.move(to.x, to.y, { steps: 5 });
      await this.page.mouse.up();
      return;
    }
    throw new Error(`no ${orientation} sash at ${String(at)} px`);
  }

  /**
   * Fails when the frame breaks the framing rules (spec section 8.4): a scaled preview, a preview
   * notice, a notification toast, the Find widget, a hover, or a quick pick the scene does not show.
   */
  async checkFrame(rules: FrameRules = {}): Promise<void> {
    const preview = await this.frame.evaluate(() => {
      const canvas = document.querySelector('canvas#screen');
      if (!(canvas instanceof HTMLCanvasElement)) return undefined;
      const box = canvas.getBoundingClientRect();
      return {
        width: canvas.width,
        height: canvas.height,
        shown: { width: box.width * devicePixelRatio, height: box.height * devicePixelRatio },
        hidden: canvas.hidden,
        notices: [...document.querySelectorAll('#notices li')].map((li) => li.textContent),
      };
    });
    const problems: string[] = [];
    if (preview === undefined || preview.hidden) problems.push('the preview shows no canvas');
    else {
      if (
        preview.width !== PREVIEW_RESOLUTION.width ||
        preview.height !== PREVIEW_RESOLUTION.height
      ) {
        problems.push(`the preview screen is ${String(preview.width)} × ${String(preview.height)}`);
      }
      if (preview.shown.width !== preview.width || preview.shown.height !== preview.height) {
        problems.push(
          `the preview is scaled to ${String(preview.shown.width)} × ${String(preview.shown.height)}`,
        );
      }
      for (const notice of preview.notices) problems.push(`preview notice: ${notice}`);
    }
    const visible = async (selector: string): Promise<boolean> =>
      (await this.page.locator(selector).filter({ visible: true }).count()) > 0;
    if (await visible('.notifications-toasts .notification-toast')) {
      problems.push('a notification toast is shown');
    }
    if (await visible('.find-widget.visible')) problems.push('the Find widget is open');
    if (await visible('.monaco-hover:not(.hidden)')) problems.push('a hover is shown');
    if (await visible('.suggest-widget.visible')) problems.push('suggestions are shown');
    if (!(await visible('iframe.webview'))) problems.push('the preview is hidden');
    if (rules.quickInput !== true && (await visible('.quick-input-widget'))) {
      problems.push('a quick pick is open');
    }
    if (problems.length > 0) throw new Error(`framing: ${problems.join('; ')}`);
  }

  /** A PNG of the whole window at device scale: 2560 × 1440. */
  async screenshot(file: string): Promise<void> {
    await this.page.screenshot({ path: file, animations: 'disabled', caret: 'initial' });
  }

  /** Closes VS Code (unsaved edits go with its throwaway profile); the recorded video, if any. */
  async close(): Promise<string | undefined> {
    const video = this.page.video();
    await this.app.close();
    return video === null ? undefined : await video.path();
  }
}
