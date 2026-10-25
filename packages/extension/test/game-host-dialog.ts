// Local only, with ETCH_GAME_HOST_CHECK=dialog beside ETCH_GAME_HOST_PATH: how the game host can
// show an eu3dialogtype window (etch#118). For each dialog it captures the main menu alone, the
// original opened by its own name, and the preview copy in several wrappers, and reports where
// each draws and how its pixels compare with the original's. The main menu's map moves, so the
// test mod's copy of frontend.gui puts a plain backdrop (ETCH_H1_BACKDROP) under the menu, as in
// the H1 check. The images are game art: they stay in the test VS Code's storage.
import * as assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { decodeGameText, writePreviewCopy, type CropRect, type PreviewCopyFile } from '@etch/core';
import type { EtchApi } from '../src/extension.ts';
import { prepareInstall } from '../src/game-host/install.ts';
import { processIdentity } from '../src/game-host/windows.ts';
import { waitFor } from './game-host.ts';
import {
  BLANK_FILE,
  BLANK_GUI,
  BLANK_WINDOW,
  compare,
  frontendWithBackdrop,
  MENU_SETTLE_MS,
  over,
  readTga,
  SETTLE_MS,
  type Tga,
} from './game-host-h1.ts';
import { nextImage } from './game-host-jobs.ts';

const DIALOGS = [
  { file: 'countrydiplomacyview.gui', window: 'GiftDiplomacyDialog' },
  { file: 'countrydiplomacyview.gui', window: 'DeclareWarDialog' },
  { file: 'eu3dialog.gui', window: 'DefaultDialog' },
] as const;

function retyped(text: string, file: PreviewCopyFile): string {
  const at = text.indexOf(`name = "${file.wrapper}"`);
  const key = text.slice(at).search(/eu3dialogtype/i);
  assert.ok(at >= 0 && key > 0);
  return text.slice(0, at + key) + 'windowType' + text.slice(at + key + 'eu3dialogtype'.length);
}

/** The text without the `shieldtype` blocks after the wrapper's name. */
function withoutShields(text: string, file: PreviewCopyFile): string {
  const at = text.indexOf(`name = "${file.wrapper}"`);
  let out = text.slice(0, at);
  let rest = text.slice(at);
  for (;;) {
    const found = /shieldtype\s*=\s*\{/i.exec(rest);
    if (found === null) break;
    let depth = 0;
    let end = found.index + found[0].length - 1;
    for (; end < rest.length; end++) {
      if (rest[end] === '{') depth++;
      else if (rest[end] === '}' && --depth === 0) break;
    }
    out += rest.slice(0, found.index);
    rest = rest.slice(end + 1);
  }
  return out + rest;
}

/** A wrapper variant: how the copy's text changes before the reload. */
const VARIANTS: Record<string, (text: string, file: PreviewCopyFile) => string> = {
  nested: (text) => text,
  // The wrapped dialog written as a plain window.
  retyped: (text, file) => retyped(text, file),
  // The wrapped dialog as a plain window without its shieldtype children, which only a dialog holds.
  retypedNoShields: (text, file) => withoutShields(retyped(text, file), file),
};

/** The rectangle around the pixels where `test` holds. */
function bounds(image: Tga, test: (i: number) => boolean): CropRect | undefined {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      // The FPS counter's corner, as the H1 check leaves it out.
      if (y < 32 && x >= image.width - 80) continue;
      if (!test((y * image.width + x) * 4)) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? undefined : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** `image` moved by (dx, dy), what falls outside cut off and the rest transparent black. */
function shifted(image: Tga, dx: number, dy: number): Tga {
  const pixels = new Uint8Array(image.pixels.length);
  for (let y = 0; y < image.height; y++) {
    const from = y - dy;
    if (from < 0 || from >= image.height) continue;
    for (let x = 0; x < image.width; x++) {
      const fx = x - dx;
      if (fx < 0 || fx >= image.width) continue;
      const i = (y * image.width + x) * 4;
      const j = (from * image.width + fx) * 4;
      pixels.set(image.pixels.subarray(j, j + 4), i);
    }
  }
  return { ...image, pixels };
}

export async function testDialogHost(api: EtchApi, gamePath: string): Promise<void> {
  const extension = vscode.extensions.getExtension<EtchApi>('happy-dwarf-team.etch');
  assert.ok(extension);
  const mod = path.join(await mkdtemp(path.join(tmpdir(), 'etch-dialog-')), 'etch_dialog');
  await mkdir(path.join(mod, 'interface'), { recursive: true });
  await writeFile(path.join(mod, 'descriptor.mod'), 'name="Etch dialog test"\n');
  for (const file of new Set(DIALOGS.map((d) => d.file))) {
    await copyFile(path.join(gamePath, 'interface', file), path.join(mod, 'interface', file));
  }
  await writeFile(path.join(mod, 'interface', BLANK_FILE), BLANK_GUI);
  const colour = process.env['ETCH_H1_BACKDROP'] ?? 'black';
  assert.ok(colour === 'black' || colour === 'white', 'ETCH_H1_BACKDROP is black or white');
  const frontend = await readFile(path.join(gamePath, 'interface', 'frontend.gui'), 'latin1');
  await writeFile(
    path.join(mod, 'interface', 'frontend.gui'),
    frontendWithBackdrop(frontend, colour),
    'latin1',
  );
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', gamePath, vscode.ConfigurationTarget.Global);
  try {
    const first = path.join(mod, 'interface', DIALOGS[0].file);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(first));
    const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
    // The preview's own first job shows the file's main window, which the game host can show.
    const start = document.positionAt(document.getText().indexOf('"countrydiplomacyview"'));
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
    await firstImage;
    await gameHost.jobsIdle();
    await new Promise((resolve) => setTimeout(resolve, MENU_SETTLE_MS));
    console.log(`[etch] dialog: ready at ${String(screen.width)}×${String(screen.height)}`);

    const folder = path.join(path.dirname(gameHost.capturesFolder), 'dialog');
    await mkdir(folder, { recursive: true });
    const interfaceFolder = path.join(gameHost.install.layout.overlay, 'interface');
    const crop: CropRect = { x: 0, y: 0, width: screen.width, height: screen.height };
    let count = 0;
    const errorLog = path.join(gameHost.install.layout.profile, 'logs', 'error.log');
    const readLog = () => readFile(errorLog).catch(() => Buffer.alloc(0));
    const job = async (label: string, reload: string[], black: string, white = black) => {
      const before = (await readLog()).length;
      const output = path.join(folder, `${String(++count).padStart(2, '0')}-${label}.tga`);
      const answer = await running.request(
        { type: 'job', reload, black, white, crop, settle_ms: SETTLE_MS, output },
        30_000,
      );
      const commands = (answer['commands'] ?? []) as { line: string; text: string }[];
      console.log(
        `[etch] dialog: ${label}: frames ${JSON.stringify(answer['frames'])}; ` +
          commands.map((c) => `"${c.line}" → "${c.text}"`).join('; '),
      );
      const log = (await readLog()).subarray(before).toString('latin1');
      if (log !== '') console.log(`[etch] dialog: ${label}: error.log ${JSON.stringify(log)}`);
      return readTga(output);
    };

    for (const { file, window } of DIALOGS) {
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
      const menu = await job(`${window}-menu`, [BLANK_FILE], BLANK_WINDOW);
      const opened = await job(`${window}-original`, [BLANK_FILE], window);
      const steady = (i: number) => menu.pixels[i + 3] === 255 && opened.pixels[i + 3] === 255;
      const drawnAt = bounds(opened, (i) => {
        let d = 0;
        for (let c = 0; c < 3; c++)
          d = Math.max(d, Math.abs((opened.pixels[i + c] ?? 0) - (menu.pixels[i + c] ?? 0)));
        return d > 2;
      });
      console.log(`[etch] dialog: ${window}: the original draws at ${JSON.stringify(drawnAt)}`);
      for (const [name, change] of Object.entries(VARIANTS)) {
        for (const f of copy.files) {
          const text = change(Buffer.from(f.bytes).toString('latin1'), f);
          await writeFile(path.join(interfaceFolder, f.fileName), Buffer.from(text, 'latin1'));
        }
        const [black, white] = copy.files;
        const image = await job(
          `${window}-${name}`,
          [black.fileName, white.fileName],
          black.wrapper,
          white.wrapper,
        );
        const at = bounds(image, (i) => (image.pixels[i + 3] ?? 0) > 0);
        const result: Record<string, unknown> = { window, variant: name, drawsAt: at };
        if (at !== undefined && drawnAt !== undefined) {
          // Laid over the menu where the original stands: by the offset between the two boxes.
          const moved = shifted(image, drawnAt.x - at.x, drawnAt.y - at.y);
          result['offset'] = { x: drawnAt.x - at.x, y: drawnAt.y - at.y };
          result['overMenu'] = compare(over(moved, menu), opened, steady);
          result['inPlace'] = compare(over(image, menu), opened, steady);
        }
        console.log(`[etch] dialog: ${JSON.stringify(result)}`);
      }
      // Close the last wrapper before the next dialog's original.
      await job(`${window}-menu-again`, [BLANK_FILE], BLANK_WINDOW);
    }

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
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
