// Local only, with ETCH_GAME_HOST_CHECK=corpus beside ETCH_GAME_HOST_PATH and ETCH_CORPUS_PATH: the
// game host on the precision corpus's windows (etch#53). For one playset of the manifest
// (ETCH_CORPUS_PLAYSET, vanilla by default), at the game host's resolution, the preview shows each
// root window of every captured view through the game host, as a mod author would, and the check
// - lays the roots' images over each other, in the order the comparison renders them, into one
//   straight RGBA image of the screen per view, `<corpus>/game-host/images/captures/<playset>/<WxH>/<view>.png`,
//   which `pnpm --filter @etch/compare compare --game-host` compares with the capture's screenshot;
// - checks H1 of etch#16 for each root: the copy on the whole screen laid over the main menu
//   against the original opened by its own name, as game-host-h1.ts does;
// - reports the time to ready and each root's job time.
// The frontend views' images are not comparable: H1's backdrop lies inside their root. The images
// are game art: they stay in the local corpus folder, which never enters Git.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  BACKDROP_WRAPPER_SUFFIX,
  PREVIEW_COPY_PREFIXES,
  keyOf,
  parseScript,
  previewCopyPath,
  readGuiFile,
  type CropRect,
} from '@etch/core';
import {
  captureRecordFile,
  capturePath,
  encodePng,
  hashModFolder,
  readCaptureRecord,
  readCorpusManifest,
  requiredCaptures,
  resolutionKey,
  splitWidgetPath,
} from '@etch/core/corpus';
import {
  PlaysetInterface,
  findPlayset,
  systemEnvironment,
  workshopFolderFor,
} from '@etch/core/playset';
import type { EtchApi } from '../src/extension.ts';
import type { HostImagePaint } from '../src/preview/preview.ts';
import { prepareInstall } from '../src/game-host/install.ts';
import { processIdentity } from '../src/game-host/windows.ts';
import { waitFor } from './game-host.ts';
import {
  BLANK_FILE,
  BLANK_GUI,
  BLANK_WINDOW,
  MENU_SETTLE_MS,
  SETTLE_MS,
  compare,
  over,
  readTga,
  type Tga,
} from './game-host-h1.ts';
import { nextImage } from './game-host-jobs.ts';

/** How long a root may take to show before the check gives up on it. */
const ROOT_TIMEOUT_MS = 30_000;

/** The overlay mod's backdrop as the first child of `mainmenu`, under everything else it draws. */
function frontendWithBackdrop(text: string): string {
  const name = /name\s*=\s*"mainmenu"/i.exec(text);
  assert.ok(name, 'frontend.gui defines mainmenu');
  const line = text.indexOf('\n', name.index) + 1;
  const icon =
    '\t\ticonType = { name = "corpus_backdrop" spriteType = "GFX_etch_backdrop_black" ' +
    'position = { x = 0 y = 0 } scale = 120 Orientation = "UPPER_LEFT" }\r\n';
  return text.slice(0, line) + icon + text.slice(line);
}

/** A crop of straight RGBA (B, G, R, A) placed on a transparent screen. */
function onScreen(image: Tga, crop: CropRect, width: number, height: number): Tga {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < image.height; y++) {
    const row = crop.y + y;
    if (row < 0 || row >= height) continue;
    for (let x = 0; x < image.width; x++) {
      const column = crop.x + x;
      if (column < 0 || column >= width) continue;
      const from = (y * image.width + x) * 4;
      pixels.set(image.pixels.subarray(from, from + 4), (row * width + column) * 4);
    }
  }
  return { width, height, pixels };
}

/**
 * The file with every top-level window's `position` set to its `show_position`, as the preview
 * copy writes the previewed window: `window open` leaves a window at its `position` and only the
 * game's own code animates it to `show_position` (etch#50), so the original opened for H1 stands
 * where the copy and the game draw it.
 */
function withShownPositions(text: string): string {
  const edits: { start: number; end: number; text: string }[] = [];
  for (const definition of readGuiFile(parseScript(text)).definitions) {
    const position = definition.properties.findLast((p) => keyOf(p) === 'position');
    const shown = definition.properties.findLast((p) => keyOf(p) === 'show_position');
    if (position?.value === undefined || shown?.value === undefined) continue;
    edits.push({
      start: position.value.start,
      end: position.value.end,
      text: text.slice(shown.value.start, shown.value.end),
    });
  }
  let out = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

/** The pixels an image draws: alpha above 0. */
function countDrawn(image: Tga): number {
  let count = 0;
  for (let i = 3; i < image.pixels.length; i += 4) if ((image.pixels[i] ?? 0) > 0) count++;
  return count;
}

/** `top` laid over `bottom`, both straight RGBA (B, G, R, A), source-over. */
function stack(bottom: Tga, top: Tga): Tga {
  const pixels = new Uint8Array(bottom.pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const a = (top.pixels[i + 3] ?? 0) / 255;
    const b = (bottom.pixels[i + 3] ?? 0) / 255;
    const out = a + b * (1 - a);
    for (let c = 0; c < 3; c++) {
      const colour = (top.pixels[i + c] ?? 0) * a + (bottom.pixels[i + c] ?? 0) * b * (1 - a);
      pixels[i + c] = out === 0 ? 0 : Math.round(colour / out);
    }
    pixels[i + 3] = Math.round(out * 255);
  }
  return { width: bottom.width, height: bottom.height, pixels };
}

/** B, G, R, A to the R, G, B, A of a PNG. */
function rgba(image: Tga): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(image.pixels.length);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = image.pixels[i + 2] ?? 0;
    data[i + 1] = image.pixels[i + 1] ?? 0;
    data[i + 2] = image.pixels[i] ?? 0;
    data[i + 3] = image.pixels[i + 3] ?? 0;
  }
  return { width: image.width, height: image.height, data };
}

interface RootResult {
  readonly root: string;
  readonly file?: string;
  readonly skipped?: string;
  readonly crop?: CropRect;
  readonly jobMs?: number;
  readonly drawnMs?: number;
  readonly h1?: unknown;
}

export async function testGameHostCorpus(api: EtchApi, gamePath: string): Promise<void> {
  const extension = vscode.extensions.getExtension<EtchApi>('happy-dwarf-team.etch');
  assert.ok(extension);
  const local = process.env['ETCH_CORPUS_PATH'];
  assert.ok(local, 'ETCH_CORPUS_PATH names the local corpus folder');
  const repository = path.join(extension.extensionPath, '..', '..');
  const read = await readCorpusManifest(path.join(repository, 'corpus', 'manifest.json'));
  const manifest = read.manifest;
  assert.ok(manifest, `the manifest reads: ${JSON.stringify(read.problems)}`);
  const playsetId = process.env['ETCH_CORPUS_PLAYSET'] ?? 'vanilla';
  const playset = manifest.playsets.find((p) => p.id === playsetId);
  assert.ok(playset, `the manifest has the playset ${playsetId}`);

  // The playset's mods, each the version the manifest pins, read in place.
  const workshop = workshopFolderFor(gamePath);
  const modFolders: string[] = [];
  for (const mod of playset.mods) {
    assert.ok(mod.workshopId !== undefined, `${mod.name} is a Workshop item`);
    const folder = path.join(workshop, mod.workshopId);
    assert.equal(await hashModFolder(folder), mod.sha256, `${mod.name} is the pinned version`);
    modFolders.push(folder);
  }
  const found = await findPlayset({
    gamePath,
    workspaceFolder: gamePath,
    playsetOverride: modFolders,
    environment: systemEnvironment(),
    supportedExeSha256: [manifest.game.exeSha256],
  });
  assert.equal(found.gameBuild?.exeSha256, manifest.game.exeSha256, 'the pinned eu4.exe');
  const ui = await PlaysetInterface.load(found.files);

  // A test mod after the playset: the blank window, and the corpus windows' files as the playset
  // has them (the preview edits the test mod, so that its playset never changes, which would
  // restart the game host), frontend.gui with the backdrop under the main menu, which moves.
  const mod = path.join(await mkdtemp(path.join(tmpdir(), 'etch-corpus-')), 'etch_corpus');
  await mkdir(path.join(mod, 'interface'), { recursive: true });
  await writeFile(path.join(mod, 'descriptor.mod'), 'name="Etch corpus test"\n');
  await writeFile(path.join(mod, 'interface', BLANK_FILE), BLANK_GUI);
  const copied = new Set(
    manifest.windows
      .filter((w) => playset.windows.includes(w.id))
      .flatMap((w) => w.files.map((f) => f.toLowerCase())),
  );
  copied.add('interface/frontend.gui');
  for (const file of copied) {
    const winning = await found.files.find(file);
    assert.ok(winning, `the playset has ${file}`);
    // Read a byte a character, which keeps every byte; only ASCII is changed.
    let text = withShownPositions((await readFile(winning.absolutePath)).toString('latin1'));
    if (file === 'interface/frontend.gui') text = frontendWithBackdrop(text);
    await mkdir(path.dirname(path.join(mod, file)), { recursive: true });
    await writeFile(path.join(mod, file), Buffer.from(text, 'latin1'));
  }

  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', gamePath, vscode.ConfigurationTarget.Global);
  await settings.update('playset', [...modFolders, mod], vscode.ConfigurationTarget.Global);
  try {
    const blank = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(mod, 'interface', BLANK_FILE)),
    );
    const blankEditor = await vscode.window.showTextDocument(blank, vscode.ViewColumn.One);
    blankEditor.selection = new vscode.Selection(
      blank.positionAt(blank.getText().indexOf('"h1_blank"')),
      blank.positionAt(blank.getText().indexOf('"h1_blank"')),
    );
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
    const switched = Date.now();
    const firstImage = nextImage(api, 120_000);
    firstImage.catch(() => undefined);
    preview.setBackend('game-host');
    const ready = await waitFor(api, 'ready', 240_000);
    assert.ok(ready.status === 'ready');
    const running = gameHost.running;
    const screen = gameHost.screen;
    assert.ok(running !== undefined && screen !== undefined, 'the game host runs');
    console.log(
      `[etch] corpus: ${playset.id}: game host ready ${String(ready.readyMs)} ms after creation, ` +
        `${String(Date.now() - switched)} ms after the switch, at ${String(screen.width)}×${String(screen.height)}`,
    );
    await firstImage;
    await gameHost.jobsIdle();
    await new Promise((resolve) => setTimeout(resolve, MENU_SETTLE_MS));

    const out = path.join(local, 'game-host');
    const scratch = path.join(out, 'jobs', playset.id);
    await mkdir(scratch, { recursive: true });
    const full: CropRect = { x: 0, y: 0, width: screen.width, height: screen.height };
    let count = 0;
    /** A job of the check's own: reloads `reload`, opens `black` then `white`, captures the screen. */
    const job = async (
      label: string,
      reload: string[],
      black: string,
      white = black,
    ): Promise<Tga> => {
      const output = path.join(scratch, `${String(++count).padStart(3, '0')}-${label}.tga`);
      assert.equal(gameHost.running, running, `the game host did not restart (${label})`);
      await running.request(
        {
          type: 'job',
          reload,
          black,
          white,
          crop: full,
          settle_ms: SETTLE_MS,
          output,
        },
        30_000,
      );
      return readTga(output);
    };

    const keys = requiredCaptures(manifest).filter(
      (k) => k.playset === playset.id && resolutionKey(k.resolution) === resolutionKey(screen),
    );
    const roots = new Map<string, { result: RootResult; image?: Tga }>();
    const views: unknown[] = [];
    for (const key of keys) {
      const record = (
        await readCaptureRecord(captureRecordFile(path.join(repository, 'corpus'), key))
      ).capture;
      if (record === undefined) {
        views.push({ view: key.view, skipped: 'no capture record' });
        continue;
      }
      const files =
        manifest.windows.find((w) => w.views.some((v) => v.id === key.view))?.files ?? [];
      const order = [
        ...new Set(record.widgets.map((w) => splitWidgetPath(w.path)?.[0]?.name ?? w.path)),
      ];
      let screenImage: Tga = {
        width: screen.width,
        height: screen.height,
        pixels: new Uint8Array(screen.width * screen.height * 4),
      };
      for (const root of order) {
        let shown = roots.get(root.toLowerCase());
        if (shown === undefined) {
          shown = await showRoot(root, files);
          roots.set(root.toLowerCase(), shown);
          console.log(`[etch] corpus: ${JSON.stringify(shown.result)}`);
        }
        if (shown.image !== undefined) screenImage = stack(screenImage, shown.image);
      }
      const file = path.join(out, 'images', `${capturePath(key)}.png`);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, encodePng(rgba(screenImage)));
      views.push({ view: key.view, roots: order });
    }
    const summary = {
      playset: playset.id,
      screen,
      readyMs: ready.readyMs,
      roots: [...roots.values()].map((r) => r.result),
      views,
    };
    await writeFile(
      path.join(out, `${playset.id}-${resolutionKey(screen)}.json`),
      `${JSON.stringify(summary, null, 1)}\n`,
    );

    /** Shows one root window through the preview and checks H1 for it. */
    async function showRoot(
      root: string,
      files: readonly string[],
    ): Promise<{ result: RootResult; image?: Tga }> {
      const preferred = new Set(files.map((f) => f.toLowerCase()));
      const definitions = ui.index.guiTypeDefinitions(root);
      const definition =
        definitions.find((d) => preferred.has(d.path.toLowerCase())) ?? definitions[0];
      if (definition === undefined) return { result: { root, skipped: 'no top-level definition' } };
      if (definition.item.kind !== 'windowType' && definition.item.kind !== 'eu3dialogtype') {
        return { result: { root, skipped: `a top-level ${definition.item.kind}` } };
      }
      if (!copied.has(definition.path.toLowerCase())) {
        return { result: { root, skipped: `defined in ${definition.path}, not a corpus file` } };
      }
      // The name's offset in the test mod's file, read a byte a character; the document has the
      // same offsets unless a character before it decodes to another length, which is checked.
      const bytes = (await readFile(path.join(mod, definition.path))).toString('latin1');
      const own = readGuiFile(parseScript(bytes)).definitions.find(
        (d) => d.name?.toLowerCase() === root.toLowerCase(),
      );
      const offset = own?.nameNode?.start ?? 0;
      const name = own?.name ?? root;
      // Opening a file previews the window under its cursor first, and its image can come after
      // the cursor moved: an image is the root's when its job opened the root's wrapper.
      const opens = `window open ${PREVIEW_COPY_PREFIXES.black}${name}${BACKDROP_WRAPPER_SUFFIX}`;
      let paint: HostImagePaint | undefined;
      let rootPainted: () => void = () => undefined;
      const painting = new Promise<void>((resolve, reject) => {
        rootPainted = resolve;
        setTimeout(() => {
          reject(new Error(`no image of ${root} in time`));
        }, ROOT_TIMEOUT_MS);
      });
      painting.catch(() => undefined);
      const painted = preview.onDidPaintHostImage((p) => {
        if (!p.outcome.commands.some((c) => c.line.toLowerCase() === opens.toLowerCase())) return;
        paint = p;
        rootPainted();
      });
      const settle = async (): Promise<void> => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        await preview.idle();
        await gameHost.jobsIdle();
        await preview.idle();
      };
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.file(path.join(mod, definition.path)),
      );
      const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
      await settle();
      assert.ok(
        document
          .getText()
          .slice(offset, offset + root.length + 2)
          .toLowerCase()
          .includes(root.toLowerCase()),
        `${root} is where the file says`,
      );
      const at = document.positionAt(offset + 1);
      // The check's own jobs wait until the preview's are done.
      editor.selection = new vscode.Selection(at, at);
      try {
        await painting;
        await settle();
        assert.equal(preview.current?.window.name?.toLowerCase(), root.toLowerCase());
      } catch (error) {
        return {
          result: {
            root,
            file: definition.path,
            skipped: `no image: ${error instanceof Error ? error.message : String(error)}; notices ${JSON.stringify(preview.notices)}`,
          },
        };
      } finally {
        painted.dispose();
      }
      if (paint === undefined) return { result: { root, skipped: 'no image' } };
      const crop = paint.outcome.image.crop;
      const copy = onScreen(await readTga(paint.outcome.image.path), crop, full.width, full.height);
      const base: RootResult = {
        root,
        file: definition.path,
        crop,
        jobMs: Math.round(paint.outcome.ms.job),
        drawnMs: Math.round(paint.fromChangeMs),
      };

      // H1: the copy over the main menu against the original by its own name, both on the whole
      // screen. The test mod's windows stand at their show_position, where the copy puts them.
      const [black, white] = (['black', 'white'] as const).map((colour) => ({
        file: path.basename(previewCopyPath(definition.path, colour) ?? ''),
        wrapper: `${PREVIEW_COPY_PREFIXES[colour]}${name}${BACKDROP_WRAPPER_SUFFIX}`,
      })) as [{ file: string; wrapper: string }, { file: string; wrapper: string }];
      const menu = await job(`${root}-menu`, [BLANK_FILE], BLANK_WINDOW);
      const original = await job(`${root}-original`, [BLANK_FILE], root);
      const whole = await job(
        `${root}-copy`,
        [black.file, white.file],
        black.wrapper,
        white.wrapper,
      );
      const steady = (i: number) => menu.pixels[i + 3] === 255 && original.pixels[i + 3] === 255;
      const h1 = {
        originalDrew: compare(original, menu).above2,
        copyPixels: countDrawn(whole),
        outsideCrop: countDrawn(whole) - countDrawn(copy),
        copyOverMenu: compare(over(whole, menu), original, steady),
      };
      return { result: { ...base, h1 }, image: copy };
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
    await settings.update('playset', undefined, vscode.ConfigurationTarget.Global);
  }
}
