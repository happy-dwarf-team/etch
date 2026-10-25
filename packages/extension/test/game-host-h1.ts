// Local only, with ETCH_GAME_HOST_CHECK=h1 beside ETCH_GAME_HOST_PATH: H1 of etch#16 (etch#119),
// whether the preview copy draws the same pixels as the original window. For each window the
// game host opens the original by its own name over the main menu, the main menu alone, and the
// preview copy in its backdrop wrapper; the copy's straight RGBA laid over the main menu must give
// the original's pixels. The main menu's map moves, so the test mod's copy of frontend.gui puts a
// plain backdrop (ETCH_H1_BACKDROP: black, the default, or white) under the menu; pixels the menu
// still changes between two captures are left out. Every capture covers the whole screen, so a
// widget the copy drew anywhere else counts too. The images are game art: they stay in the test
// VS Code's storage.
import * as assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { decodeGameText, writePreviewCopy, type CropRect } from '@etch/core';
import type { EtchApi } from '../src/extension.ts';
import { prepareInstall } from '../src/game-host/install.ts';
import { runJob, type JobTarget } from '../src/game-host/jobs.ts';
import { processIdentity } from '../src/game-host/windows.ts';
import { waitFor } from './game-host.ts';
import { nextImage } from './game-host-jobs.ts';

interface Tga {
  readonly width: number;
  readonly height: number;
  /** B, G, R, A bytes, rows top first. */
  readonly pixels: Uint8Array;
}

async function readTga(file: string): Promise<Tga> {
  const bytes = await readFile(file);
  assert.equal(bytes[2], 2, 'an uncompressed true-colour TGA');
  assert.equal(bytes[16], 32, '32 bits per pixel');
  const width = bytes.readUInt16LE(12);
  const height = bytes.readUInt16LE(14);
  assert.equal(bytes.length, 18 + width * height * 4);
  return { width, height, pixels: bytes.subarray(18) };
}

/**
 * The windows #16 named for H1: plain, `if_resolution` with `CENTER`, a same-file `scrollbartype`;
 * and two dialogs, which the copy wraps as windows without their shields (etch#118): a `CENTER`
 * one and the corpus's.
 */
const WINDOWS = [
  { file: 'ages_view.gui', window: 'ages_view', reloadOriginal: true },
  // core.gui holds the types the main menu itself draws with: its own reload is left out.
  { file: 'core.gui', window: 'console_wnd', reloadOriginal: false },
  { file: 'eu3dialog.gui', window: 'DefaultDialog', reloadOriginal: true },
  { file: 'countrydiplomacyview.gui', window: 'DeclareWarDialog', reloadOriginal: true },
  // Last: once goto_box has been open, its edit box's caret blinks at (201, 208) in every later
  // capture, also after the window is closed (etch#119).
  { file: 'goto.gui', window: 'goto_box', reloadOriginal: true },
] as const;

/** A window that draws nothing, which a job opens to capture the main menu alone. */
const BLANK_FILE = 'h1_blank.gui';
const BLANK_WINDOW = 'h1_blank';
const BLANK_GUI =
  'guiTypes = {\r\n\twindowType = {\r\n\t\tname = "h1_blank"\r\n\t\tbackGround = ""\r\n' +
  '\t\tposition = { x = 0 y = 0 }\r\n\t\tsize = { x = 1 y = 1 }\r\n\t\tdontRender = ""\r\n\t}\r\n}\r\n';

/**
 * The main menu's own file with the overlay mod's backdrop sprite as the first child of `mainmenu`
 * (full-screen, upper left), under everything else the menu draws.
 */
function frontendWithBackdrop(text: string, colour: string): string {
  const menu = text.indexOf('name ="mainmenu"');
  const panel = text.indexOf('### MAIN MENU PANEL (upperleft)', menu);
  assert.ok(menu >= 0 && panel > menu, 'frontend.gui has the main menu as in 1.37.5');
  const icon =
    `iconType = { name = "h1_backdrop" spriteType = "GFX_etch_backdrop_${colour}" ` +
    'position = { x = 0 y = 0 } scale = 120 Orientation = "UPPER_LEFT" }\r\n\t\t\t';
  return text.slice(0, panel) + icon + text.slice(panel);
}

/** The green FPS counter's corner (etch#22: 60 × 20 at 3440×1440), with a margin: left out. */
const COUNTER = { width: 80, height: 32 };

/** Time after the first image for the main menu to finish fading in. */
const MENU_SETTLE_MS = 5_000;

/** Time from each open to its capture for the jobs this check sends, past any first-frame effect. */
const SETTLE_MS = 300;

interface Difference {
  /** Pixels whose largest channel difference is above 0, 2 and 8. */
  readonly above0: number;
  readonly above2: number;
  readonly above8: number;
  readonly max: number;
  /** The rectangle around the pixels above 2, if any. */
  readonly box: CropRect | undefined;
}

/** Compares the colour of two images, the counter's corner left out; `only` limits the pixels. */
function compare(a: Tga, b: Tga, only?: (i: number) => boolean): Difference {
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let above0 = 0;
  let above2 = 0;
  let above8 = 0;
  let max = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      if (y < COUNTER.height && x >= a.width - COUNTER.width) continue;
      const i = (y * a.width + x) * 4;
      if (only !== undefined && !only(i)) continue;
      let d = 0;
      for (let c = 0; c < 3; c++) {
        d = Math.max(d, Math.abs((a.pixels[i + c] ?? 0) - (b.pixels[i + c] ?? 0)));
      }
      if (d === 0) continue;
      above0++;
      max = Math.max(max, d);
      if (d > 8) above8++;
      if (d <= 2) continue;
      above2++;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  const box = x1 < 0 ? undefined : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  return { above0, above2, above8, max, box };
}

/** The copy's straight RGBA laid over the main menu, as the game blends a window over it. */
function over(copy: Tga, menu: Tga): Tga {
  const pixels = new Uint8Array(copy.pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const a = (copy.pixels[i + 3] ?? 0) / 255;
    for (let c = 0; c < 3; c++) {
      pixels[i + c] = Math.round(
        (copy.pixels[i + c] ?? 0) * a + (menu.pixels[i + c] ?? 0) * (1 - a),
      );
    }
    pixels[i + 3] = 255;
  }
  return { width: copy.width, height: copy.height, pixels };
}

/** The pixels for which `test` holds, the counter's corner left out. */
function countPixels(image: Tga, test: (i: number) => boolean): number {
  let count = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (y < COUNTER.height && x >= image.width - COUNTER.width) continue;
      if (test((y * image.width + x) * 4)) count++;
    }
  }
  return count;
}

function alphaCounts(image: Tga): { opaque: number; clear: number; partial: number } {
  let opaque = 0;
  let clear = 0;
  for (let i = 3; i < image.pixels.length; i += 4) {
    if (image.pixels[i] === 255) opaque++;
    else if (image.pixels[i] === 0) clear++;
  }
  return { opaque, clear, partial: image.width * image.height - opaque - clear };
}

export async function testPreviewCopyH1(api: EtchApi, gamePath: string): Promise<void> {
  const extension = vscode.extensions.getExtension<EtchApi>('happy-dwarf-team.etch');
  assert.ok(extension);
  // A test mod with the three files as the game has them, so the game loads exactly the text the
  // copies are written from, and the blank window.
  const mod = path.join(await mkdtemp(path.join(tmpdir(), 'etch-h1-')), 'etch_h1');
  await mkdir(path.join(mod, 'interface'), { recursive: true });
  await writeFile(path.join(mod, 'descriptor.mod'), 'name="Etch H1 test"\n');
  for (const { file } of WINDOWS) {
    await copyFile(path.join(gamePath, 'interface', file), path.join(mod, 'interface', file));
  }
  await writeFile(path.join(mod, 'interface', BLANK_FILE), BLANK_GUI);
  const colour = process.env['ETCH_H1_BACKDROP'] ?? 'black';
  assert.ok(colour === 'black' || colour === 'white', 'ETCH_H1_BACKDROP is black or white');
  // Read and written byte for byte ('latin1'): only ASCII goes in.
  const frontend = await readFile(path.join(gamePath, 'interface', 'frontend.gui'), 'latin1');
  await writeFile(
    path.join(mod, 'interface', 'frontend.gui'),
    frontendWithBackdrop(frontend, colour),
    'latin1',
  );
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', gamePath, vscode.ConfigurationTarget.Global);
  try {
    const first = path.join(mod, 'interface', WINDOWS[0].file);
    // The preview's first job shows the first window.
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(first));
    const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
    const start = document.positionAt(document.getText().indexOf(`"${WINDOWS[0].window}"`));
    editor.selection = new vscode.Selection(start, start);
    const { preview, gameHost } = api;
    preview.open();
    await preview.idle();
    await prepareInstall({
      layout: gameHost.install.layout,
      gameFolder: gamePath,
      buildsFolder: path.join(extension.extensionPath, 'game'),
      mods: [],
      display: { width: 1920, height: 1080, language: 'english' },
    });
    const firstImage = nextImage(api, 90_000);
    firstImage.catch(() => undefined);
    preview.setBackend('game-host');
    await waitFor(api, 'ready', 180_000);
    const running = gameHost.running;
    const screen = gameHost.screen;
    assert.ok(running !== undefined && screen !== undefined, 'the game host runs');
    // The preview's own job of the first window; the check's jobs come after it.
    const paint = await firstImage;
    await gameHost.jobsIdle();
    await new Promise((resolve) => setTimeout(resolve, MENU_SETTLE_MS));
    console.log(
      `[etch] h1: game host ready at ${String(screen.width)}×${String(screen.height)}; the preview's ` +
        `job of ${WINDOWS[0].window}: crop ${JSON.stringify(paint.outcome.image.crop)}`,
    );

    const folder = path.join(path.dirname(gameHost.capturesFolder), 'h1');
    await mkdir(folder, { recursive: true });
    const target: JobTarget = {
      overlayFolder: gameHost.install.layout.overlay,
      capturesFolder: folder,
      request: (body, timeoutMs) => running.request(body, timeoutMs),
    };
    const crop: CropRect = { x: 0, y: 0, width: screen.width, height: screen.height };
    let count = 0;
    /** One job of this check: reloads `reload`, opens `black` then `white`, captures the screen. */
    const job = async (label: string, reload: string[], black: string, white = black) => {
      const output = path.join(folder, `${String(++count).padStart(2, '0')}-${label}.tga`);
      const answer = await running.request(
        { type: 'job', reload, black, white, crop, settle_ms: SETTLE_MS, output },
        30_000,
      );
      const commands = (answer['commands'] ?? []) as { line: string; text: string }[];
      console.log(
        `[etch] h1: ${label}: frames ${JSON.stringify(answer['frames'])}; ` +
          commands.map((c) => `"${c.line}" → "${c.text}"`).join('; '),
      );
      return readTga(output);
    };

    const failures: string[] = [];
    for (const { file, window, reloadOriginal } of WINDOWS) {
      const original = decodeGameText(
        await readFile(path.join(mod, 'interface', file)),
        'interface',
      );
      const copy = writePreviewCopy({
        path: `interface/${file}`,
        text: original.text,
        bom: original.bom,
        window,
        screen,
      });
      assert.ok(copy.files, `${window}: the copy is written: ${JSON.stringify(copy.diagnostics)}`);
      const [black, white] = copy.files;
      const name = window.replace(/[^a-z_]/gi, '');

      const menu = await job(`${name}-menu`, [BLANK_FILE], BLANK_WINDOW);
      const opened = await job(`${name}-original`, [BLANK_FILE], window);
      // The product's path: the copies written and the job sent as the preview sends them.
      const product = await runJob(
        target,
        {
          copies: copy.files,
          crop,
          textures: [],
          localisation: false,
          requestedAt: Date.now(),
          tag: 0,
        },
        ++count,
      );
      assert.ok(product.ok, `${window}: the copy's job runs: ${product.ok ? '' : product.message}`);
      const productImage = await readTga(product.image.path);
      const settled = await job(
        `${name}-copy`,
        [black.fileName, white.fileName],
        black.wrapper,
        white.wrapper,
      );
      const reloaded = reloadOriginal ? await job(`${name}-reloaded`, [file], window) : undefined;
      const menuAgain = await job(`${name}-menu-again`, [BLANK_FILE], BLANK_WINDOW);

      const drawn = compare(opened, menu);
      // The pixels compared: the menu and the original did not change between the two frames of
      // their captures (a job that opens one window twice gets alpha 255 only where both frames
      // agree), and outside the copy the menu draws the same after as before. Under the copy the
      // menu before counts: a closed goto_box still showed in the capture right after its close.
      // The rest moved, such as the tip text or a caret.
      const still = (i: number) =>
        menu.pixels[i + 3] === 255 &&
        opened.pixels[i + 3] === 255 &&
        ((settled.pixels[i + 3] ?? 0) > 0 ||
          (menuAgain.pixels[i + 3] === 255 &&
            menu.pixels[i] === menuAgain.pixels[i] &&
            menu.pixels[i + 1] === menuAgain.pixels[i + 1] &&
            menu.pixels[i + 2] === menuAgain.pixels[i + 2]));
      const steadyReload = (i: number) => still(i) && reloaded?.pixels[i + 3] === 255;
      const result = {
        window,
        alpha: alphaCounts(settled),
        originalOverMenu: drawn,
        menuStable: compare(menu, menuAgain),
        // Pixels left out below, all of them and those the copy draws on (alpha above 0).
        movedPixels: countPixels(menu, (i) => !still(i)),
        movedUnderCopy: countPixels(menu, (i) => !still(i) && (settled.pixels[i + 3] ?? 0) > 0),
        productVsSettled: compare(productImage, settled),
        productAlphaSame: compare(
          { ...productImage, pixels: productImage.pixels.map((v, i) => (i % 4 === 3 ? v : 0)) },
          { ...settled, pixels: settled.pixels.map((v, i) => (i % 4 === 3 ? v : 0)) },
        ).above0,
        copyOverMenu: compare(over(settled, menu), opened, still),
        opaqueOnly: compare(settled, opened, (i) => settled.pixels[i + 3] === 255),
        productOverMenu: compare(over(productImage, menu), opened, still),
        reloadedOriginal:
          reloaded === undefined ? undefined : compare(reloaded, opened, steadyReload),
      };
      console.log(`[etch] h1: ${JSON.stringify(result)}`);
      if (drawn.above2 === 0) failures.push(`${window}: the original drew nothing over the menu`);
      if (result.alpha.opaque === 0) failures.push(`${window}: the copy drew nothing`);
      // A moved pixel under the copy is not compared: more than 1 in 1,000 of the copy's would
      // leave too much of the window unchecked.
      if (result.movedUnderCopy * 1000 > result.alpha.opaque + result.alpha.partial) {
        failures.push(
          `${window}: ${String(result.movedUnderCopy)} of its pixels moved in the menu`,
        );
      }
      if (result.copyOverMenu.above2 > 0) {
        failures.push(
          `${window}: ${String(result.copyOverMenu.above2)} pixels differ by more than 2`,
        );
      }
    }
    console.log(`[etch] h1: ${failures.length === 0 ? 'passed' : failures.join('; ')}`);

    const last = gameHost.running;
    gameHost.setIdleTime(2_000);
    preview.setBackend('offline');
    await waitFor(api, 'stopped', 60_000);
    assert.equal(gameHost.running, undefined);
    if (last !== undefined) {
      assert.equal(await processIdentity(last.identity.pid), undefined, 'the game process is gone');
    }
    await vscode.commands.executeCommand('etch.removeGameHostInstall');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    assert.deepEqual(failures, [], 'H1: the preview copy draws the original');
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
