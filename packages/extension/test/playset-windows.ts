// Local only, with ETCH_PLAYSET_CHECK naming a playset of the corpus manifest beside ETCH_GAME_PATH
// and ETCH_CORPUS_PATH: every window the playset's mods override opens in the preview (spec
// section 8, etch#55). Every top-level definition of every `.gui` file a mod of the playset wins
// over the game is previewed as a mod author would, cursor on it:
// - in the offline renderer: whether the webview drew it, its draws, texture problems and time,
//   and the file's diagnostics in the Problems panel;
// - with ETCH_GAME_HOST_PATH also set, in the game host, after the offline pass: each `windowType`
//   and `eu3dialogtype` (the kinds `window open` shows) gives an image, a failed job or a notice,
//   with the lines the game wrote to `error.log`, the pixels the image draws, and any restart.
// The mods are the manifest's Workshop items, checked against its pins and read in place; their
// files are copied unchanged into a test mod after the playset, so that previewing them never
// changes the playset (which would restart the game host). ETCH_PLAYSET_FILES (paths separated by
// `,`) limits the check to some files. The report goes to
// `<corpus>/playset-windows/<playset>.json` and `.md`; the game's images stay in the game host's
// captures folder. Nothing is written to the game folder, the player's profile or the mods.
import * as assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  BACKDROP_WRAPPER_SUFFIX,
  PREVIEW_COPY_PREFIXES,
  parseScript,
  readGuiFile,
  type Widget,
} from '@etch/core';
import { hashModFolder, readCorpusManifest } from '@etch/core/corpus';
import {
  PlaysetInterface,
  findPlayset,
  systemEnvironment,
  workshopFolderFor,
} from '@etch/core/playset';
import type { EtchApi } from '../src/extension.ts';
import type { GameHostState } from '../src/game-host/index.ts';
import type { JobOutcome } from '../src/game-host/jobs.ts';
import type { HostImagePaint, PreviewPaint, PreviewRender } from '../src/preview/preview.ts';
import { prepareInstall } from '../src/game-host/install.ts';
import { processIdentity } from '../src/game-host/windows.ts';
import { waitFor } from './game-host.ts';

/** How long one window may take in the offline renderer. */
const OFFLINE_TIMEOUT_MS = 30_000;
/** How long one window may take in the game host, a restart included. */
const HOST_TIMEOUT_MS = 120_000;
/** How long the game host may stay ready and idle without an image of the window. */
const NO_JOB_MS = 20_000;
/** The kinds `window open` shows; the preview refuses the others with a notice (etch#16). */
const HOST_KINDS = new Set(['windowType', 'eu3dialogtype']);

interface FileResult {
  path: string;
  /** The mod whose file wins. */
  mod: string;
  bytes: number;
  /** The file's diagnostics in the Problems panel, by code. */
  problems: Record<string, number>;
  windows: WindowResult[];
}

interface WindowResult {
  name: string;
  kind: string;
  line: number;
  offline?: OfflineResult;
  host?: HostResult;
}

interface OfflineResult {
  painted: boolean;
  draws?: number;
  /** The layout's own diagnostics, by code. */
  layout?: Record<string, number>;
  textureProblems?: string[];
  skipped?: number;
  ms?: number;
  error?: string;
}

interface HostResult {
  /** `image`: the job's image was drawn; `failed`: the job failed; `notice`: no job was sent. */
  outcome: 'image' | 'failed' | 'notice' | 'timeout';
  message?: string;
  /** Pixels of the image with alpha above 0, and how many of them are opaque. */
  drawn?: number;
  opaque?: number;
  jobMs?: number;
  errorLog?: string[];
  /** Game host states other than ready seen while the window was shown. */
  states?: string[];
}

function count(codes: Iterable<string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const code of codes) out[code] = (out[code] ?? 0) + 1;
  return out;
}

/** Pixels with alpha above 0, and opaque ones, of a TGA of straight RGBA (B, G, R, A). */
async function drawnPixels(file: string): Promise<{ drawn: number; opaque: number }> {
  const bytes = await readFile(file);
  let drawn = 0;
  let opaque = 0;
  for (let i = 18 + 3; i < bytes.length; i += 4) {
    const alpha = bytes[i] ?? 0;
    if (alpha > 0) drawn++;
    if (alpha === 255) opaque++;
  }
  return { drawn, opaque };
}

export async function testPlaysetWindows(
  api: EtchApi,
  gamePath: string,
  gameHostPath: string | undefined,
): Promise<void> {
  const extension = vscode.extensions.getExtension<EtchApi>('happy-dwarf-team.etch');
  assert.ok(extension);
  const local = process.env['ETCH_CORPUS_PATH'];
  assert.ok(local, 'ETCH_CORPUS_PATH names the local corpus folder');
  const repository = path.join(extension.extensionPath, '..', '..');
  const read = await readCorpusManifest(path.join(repository, 'corpus', 'manifest.json'));
  const manifest = read.manifest;
  assert.ok(manifest, `the manifest reads: ${JSON.stringify(read.problems)}`);
  const playsetId = process.env['ETCH_PLAYSET_CHECK'] ?? '';
  const playset = manifest.playsets.find((p) => p.id === playsetId);
  assert.ok(playset, `the manifest has the playset ${playsetId}`);

  // The playset's mods, each the version the manifest pins, read in place.
  const workshop = workshopFolderFor(gamePath);
  const modFolders: string[] = [];
  for (const mod of playset.mods) {
    assert.ok(mod.workshopId !== undefined, `${mod.name} is a Workshop item`);
    const folder = path.join(workshop, mod.workshopId);
    if (mod.sha256 !== undefined) {
      assert.equal(await hashModFolder(folder), mod.sha256, `${mod.name} is the pinned version`);
    }
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

  // The `.gui` files a mod wins, copied unchanged into a test mod after the playset.
  const only = (process.env['ETCH_PLAYSET_FILES'] ?? '')
    .split(',')
    .map((f) => f.trim().toLowerCase())
    .filter((f) => f !== '');
  const mod = path.join(await mkdtemp(path.join(tmpdir(), 'etch-playset-')), 'etch_playset');
  await mkdir(mod, { recursive: true });
  await writeFile(path.join(mod, 'descriptor.mod'), 'name="Etch playset test"\n');
  const files: FileResult[] = [];
  for (const { path: file } of ui.index.guiFiles) {
    const winning = await found.files.find(file);
    if (winning === undefined || winning.layer.name === 'game') continue;
    if (only.length > 0 && !only.includes(file.toLowerCase())) continue;
    await mkdir(path.dirname(path.join(mod, file)), { recursive: true });
    await copyFile(winning.absolutePath, path.join(mod, file));
    files.push({
      path: file,
      mod: winning.layer.name,
      bytes: (await readFile(winning.absolutePath)).byteLength,
      problems: {},
      windows: [],
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  assert.ok(files.length > 0, 'the playset overrides .gui files');
  console.log(
    `[etch] playset ${playset.id}: ${String(files.length)} .gui files from ${found.mods.map((m) => m.name).join(', ')}`,
  );

  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', gamePath, vscode.ConfigurationTarget.Global);
  await settings.update('playset', [...modFolders, mod], vscode.ConfigurationTarget.Global);
  const { preview, gameHost } = api;

  // Every render and paint, by render id.
  const renders = new Map<number, PreviewRender>();
  const paints = new Map<number, PreviewPaint>();
  const listeners = [
    preview.onDidRender((r) => renders.set(r.id, r)),
    preview.onDidPaint((p) => paints.set(p.id, p)),
  ];
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await preview.idle();
  };
  /** Opens a test mod file and calls `show` with each top-level definition under the cursor. */
  const eachWindow = async (
    result: FileResult,
    show: (definition: Widget, index: number, uri: vscode.Uri, line: number) => Promise<void>,
  ): Promise<void> => {
    const uri = vscode.Uri.file(path.join(mod, result.path));
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
    await settle();
    // Offsets in the document's own text, whatever its encoding.
    const model = readGuiFile(parseScript(document.getText()));
    for (const [index, definition] of model.definitions.entries()) {
      const position = document.positionAt((definition.nameNode ?? definition.node).start + 1);
      editor.selection = new vscode.Selection(position, position);
      await show(definition, index, uri, position.line + 1);
    }
  };
  /** The result entry of a definition, created on the first pass. */
  const entry = (result: FileResult, definition: Widget, line: number): WindowResult => {
    let window = result.windows.find((w) => w.line === line && w.name === (definition.name ?? ''));
    if (window === undefined) {
      window = { name: definition.name ?? '', kind: definition.kind, line };
      result.windows.push(window);
    }
    return window;
  };

  const report = async (): Promise<void> => {
    const out = path.join(local, 'playset-windows');
    await mkdir(out, { recursive: true });
    await writeFile(
      path.join(out, `${playset.id}.json`),
      `${JSON.stringify({ playset: playset.id, mods: found.mods.map((m) => m.name), files }, null, 1)}\n`,
    );
    await writeFile(path.join(out, `${playset.id}.md`), summary(playset.id, files));
  };

  try {
    // Offline renderer. An editor first, so that the preview opens beside it, not under it: a
    // preview that is not visible does not render.
    const first = files[0];
    assert.ok(first);
    await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(mod, first.path))),
      vscode.ViewColumn.One,
    );
    preview.open();
    await preview.idle();
    const offlineStart = Date.now();
    for (const result of files) {
      await eachWindow(result, async (definition, index, uri, line) => {
        const window = entry(result, definition, line);
        const started = Date.now();
        let offline: OfflineResult = { painted: false, error: 'not previewed' };
        while (Date.now() - started < OFFLINE_TIMEOUT_MS) {
          await settle();
          const render = preview.current;
          if (
            render === undefined ||
            render.uri.toString() !== uri.toString() ||
            render.file.definitions.indexOf(render.window) !== index
          ) {
            continue;
          }
          const paint = paints.get(render.id);
          if (paint === undefined) continue;
          offline = {
            painted: paint.painted,
            draws: render.layout.drawList.draws.length,
            layout: count(render.layout.diagnostics.map((d) => d.code)),
            textureProblems: paint.problems.map((p) => JSON.stringify(p)),
            skipped: paint.skipped.length,
            ms: paint.at - render.requestedAt,
            ...(paint.error === undefined ? {} : { error: paint.error }),
          };
          break;
        }
        window.offline = offline;
        if (!offline.painted) {
          console.log(
            `[etch] playset ${result.path} ${window.name}: offline ${JSON.stringify(offline)}, ` +
              `current ${preview.current?.window.name ?? 'none'}`,
          );
        }
      });
      result.problems = count(
        vscode.languages
          .getDiagnostics(vscode.Uri.file(path.join(mod, result.path)))
          .map((d) => String(typeof d.code === 'object' ? d.code.value : (d.code ?? d.message))),
      );
      console.log(
        `[etch] playset ${result.path}: ${String(result.windows.filter((w) => w.offline?.painted === true).length)} of ${String(result.windows.length)} drawn offline`,
      );
    }
    const offlineWindows = files.flatMap((f) => f.windows);
    console.log(
      `[etch] playset ${playset.id}: offline ${String(offlineWindows.filter((w) => w.offline?.painted === true).length)} of ${String(offlineWindows.length)} windows drawn in ${String(Date.now() - offlineStart)} ms`,
    );
    await report();

    if (gameHostPath !== undefined) {
      await prepareInstall({
        layout: gameHost.install.layout,
        gameFolder: gameHostPath,
        buildsFolder: path.join(extension.extensionPath, 'game'),
        mods: [],
        display: { width: 1920, height: 1080, language: 'english' },
      });
      const states: string[] = [];
      const stateListener = gameHost.onDidChangeState((s: GameHostState) => {
        if (s.status !== 'ready')
          states.push(s.status === 'restarting' ? `restarting: ${s.reason}` : s.status);
      });
      const images: HostImagePaint[] = [];
      const failures: JobOutcome[] = [];
      listeners.push(
        stateListener,
        preview.onDidPaintHostImage((p) => images.push(p)),
        gameHost.onDidFinishJob((o) => {
          if (!o.ok) failures.push(o);
        }),
      );
      preview.setBackend('game-host');
      const ready = await waitFor(api, 'ready', 240_000);
      assert.ok(ready.status === 'ready');
      console.log(
        `[etch] playset ${playset.id}: game host ready ${String(ready.readyMs)} ms after creation`,
      );
      await gameHost.jobsIdle();
      const hostStart = Date.now();
      for (const result of files) {
        // Opening the file previews its first window before the cursor moves to it: an image or
        // a failure counts from the file's opening on.
        const imagesBefore = images.length;
        const failuresBefore = failures.length;
        await eachWindow(result, async (definition, index, _uri, line) => {
          const window = entry(result, definition, line);
          if (!HOST_KINDS.has(definition.kind) || definition.name === undefined) return;
          const opens =
            `window open ${PREVIEW_COPY_PREFIXES.black}${definition.name}${BACKDROP_WRAPPER_SUFFIX}`.toLowerCase();
          states.length = 0;
          const started = Date.now();
          let host: HostResult | undefined;
          while (host === undefined && Date.now() - started < HOST_TIMEOUT_MS) {
            await settle();
            await gameHost.jobsIdle();
            const image = images
              .slice(imagesBefore)
              .findLast((p) => p.outcome.commands.some((c) => c.line.toLowerCase() === opens));
            if (image !== undefined) {
              const pixels = await drawnPixels(image.outcome.image.path).catch(() => undefined);
              host = {
                outcome: 'image',
                ...(pixels ?? {}),
                jobMs: Math.round(image.outcome.ms.job),
                errorLog: [...image.outcome.errorLog],
              };
              break;
            }
            const failed = failures
              .slice(failuresBefore)
              .findLast(
                (o) =>
                  o.commands.length === 0 || o.commands.some((c) => c.line.toLowerCase() === opens),
              );
            if (failed !== undefined && !failed.ok) {
              host = {
                outcome: 'failed',
                message: `${failed.code}: ${failed.message}`,
                errorLog: [...failed.errorLog],
              };
              break;
            }
            const current = preview.current;
            if (
              gameHost.state.status === 'ready' &&
              current !== undefined &&
              current.file.definitions.indexOf(current.window) === index &&
              preview.notices.some((n) => n.severity !== 'information') &&
              Date.now() - started > 3_000
            ) {
              host = {
                outcome: 'notice',
                message: preview.notices.map((n) => n.message).join(' | '),
              };
              break;
            }
            // Ready all along, idle, and still nothing: the preview sent no job for the window.
            if (
              gameHost.state.status === 'ready' &&
              states.length === 0 &&
              Date.now() - started > NO_JOB_MS
            ) {
              host = {
                outcome: 'timeout',
                message: `no job in ${String(NO_JOB_MS)} ms; notices ${JSON.stringify(preview.notices)}`,
              };
              break;
            }
            if (gameHost.state.status === 'failed' || gameHost.state.status === 'stopped') {
              // Stopped after three crashes in five minutes: note it and start again.
              states.push(`${gameHost.state.status}: ${JSON.stringify(gameHost.state)}`);
              preview.setBackend('offline');
              preview.setBackend('game-host');
              await waitFor(api, 'ready', 240_000).catch(() => undefined);
            }
          }
          window.host = {
            ...(host ?? { outcome: 'timeout' }),
            ...(states.length > 0 ? { states: [...states] } : {}),
          };
          if (window.host.outcome !== 'image') {
            console.log(
              `[etch] playset ${result.path} ${window.name}: ${JSON.stringify(window.host)}`,
            );
          }
        });
        await report();
      }
      const hostWindows = files.flatMap((f) => f.windows).filter((w) => w.host !== undefined);
      console.log(
        `[etch] playset ${playset.id}: game host ${String(hostWindows.filter((w) => w.host?.outcome === 'image').length)} of ${String(hostWindows.length)} windows drawn in ${String(Date.now() - hostStart)} ms`,
      );

      const last = gameHost.running;
      gameHost.setIdleTime(2_000);
      preview.setBackend('offline');
      await waitFor(api, 'stopped', 60_000);
      if (last !== undefined) {
        assert.equal(
          await processIdentity(last.identity.pid),
          undefined,
          'the game process is gone',
        );
      }
      await vscode.commands.executeCommand('etch.removeGameHostInstall');
    }
    await report();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  } finally {
    for (const listener of listeners) listener.dispose();
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
    await settings.update('playset', undefined, vscode.ConfigurationTarget.Global);
  }
}

/** The report's Markdown summary: totals, then every window that was not simply drawn. */
function summary(playset: string, files: readonly FileResult[]): string {
  const windows = files.flatMap((f) => f.windows.map((w) => ({ file: f, window: w })));
  const offlineDrawn = windows.filter((w) => w.window.offline?.painted === true);
  const host = windows.filter((w) => w.window.host !== undefined);
  const hostBy = count(host.map((w) => w.window.host?.outcome ?? ''));
  const problems: Record<string, number> = {};
  for (const f of files) {
    for (const [code, n] of Object.entries(f.problems)) problems[code] = (problems[code] ?? 0) + n;
  }
  const lines = [
    `# Playset windows: ${playset}`,
    '',
    `${String(files.length)} .gui files, ${String(windows.length)} top-level definitions.`,
    '',
    `- Offline renderer: ${String(offlineDrawn.length)} drawn, ${String(windows.length - offlineDrawn.length)} not.`,
    `- Game host: ${String(host.length)} windows shown: ${JSON.stringify(hostBy)}.`,
    `- Problems panel: ${JSON.stringify(problems)}.`,
    '',
    '| File | Window | Kind | Offline | Game host |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const { file, window } of windows) {
    const offline = window.offline;
    const hostResult = window.host;
    const plain =
      offline?.painted === true &&
      (offline.textureProblems?.length ?? 0) === 0 &&
      (hostResult === undefined ||
        (hostResult.outcome === 'image' && (hostResult.errorLog?.length ?? 0) === 0));
    if (plain) continue;
    const offlineText =
      offline === undefined
        ? ''
        : offline.painted
          ? `drawn, ${String(offline.textureProblems?.length ?? 0)} texture problems`
          : `not drawn: ${offline.error ?? ''}`;
    const hostText =
      hostResult === undefined
        ? ''
        : `${hostResult.outcome}${hostResult.message === undefined ? '' : `: ${hostResult.message}`}${(hostResult.errorLog?.length ?? 0) > 0 ? `; error.log: ${(hostResult.errorLog ?? []).join(' / ')}` : ''}`;
    lines.push(
      `| ${file.path} | ${window.name} | ${window.kind} | ${offlineText.replaceAll('|', '\\|')} | ${hostText.replaceAll('|', '\\|')} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}
