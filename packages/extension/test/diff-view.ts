// The diff view end to end in a real VS Code (spec section 5, etch#54), on the fixture game of
// preview.ts. No game runs: a stand-in replaces the game host's state, screen and jobs on the
// extension's own GameHost, and a job's image is a TGA this test writes into the captures folder,
// as the plugin would.
import * as assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { SpriteDraw } from '@etch/core';
import type { EtchApi } from '../src/extension.ts';
import type { GameHostState, JobChange, JobOutcome } from '../src/game-host/index.ts';
import type { PreviewApi, PreviewPaint } from '../src/preview/index.ts';

const TIMEOUT_MS = 5_000;

/** The parts of the GameHost the stand-in replaces, with its private event emitters. */
interface HostInternals {
  readonly emitter: vscode.EventEmitter<GameHostState>;
  readonly jobEmitter: vscode.EventEmitter<JobOutcome>;
}

const REPLACED = ['state', 'screen', 'use', 'update', 'submit'] as const;

/** A TGA as the plugin writes it: straight BGRA, 32 bits, rows top first. */
function hostTga(
  width: number,
  height: number,
  pixels: readonly { x: number; y: number; rgba: readonly number[] }[],
): Uint8Array {
  const bytes = new Uint8Array(18 + width * height * 4);
  bytes[2] = 2;
  bytes[12] = width & 0xff;
  bytes[13] = width >> 8;
  bytes[14] = height & 0xff;
  bytes[15] = height >> 8;
  bytes[16] = 32;
  bytes[17] = 0x28;
  for (const { x, y, rgba } of pixels) {
    const [r = 0, g = 0, b = 0, a = 0] = rgba;
    bytes.set([b, g, r, a], 18 + (y * width + x) * 4);
  }
  return bytes;
}

async function until(done: () => boolean, what: string): Promise<void> {
  const end = Date.now() + TIMEOUT_MS;
  while (!done()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Lets the preview render what a setting changed. */
async function settle(preview: PreviewApi): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  await preview.idle();
}

function nextDiffPaint(preview: PreviewApi): Promise<PreviewPaint> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.dispose();
      reject(new Error('no diff view painted in time'));
    }, TIMEOUT_MS);
    const listener = preview.onDidPaint((paint) => {
      if (paint.diff === undefined) return;
      clearTimeout(timer);
      listener.dispose();
      resolve(paint);
    });
  });
}

function hasNotice(preview: PreviewApi, pattern: RegExp): boolean {
  return preview.notices.some((n) => pattern.test(n.message));
}

/** Runs with the preview open on the fixture's `etch_first`, at its default 1600×900. */
export async function testDiffView(api: EtchApi): Promise<void> {
  const { preview, gameHost } = api;
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('etch.toggleDiffView'), 'the diff view command is registered');

  // With the offline renderer there is nothing to compare with; the command says so.
  assert.equal(preview.backend, 'offline');
  assert.match(preview.diff.blocked ?? '', /switch the backend to the game host/);
  await vscode.commands.executeCommand('etch.toggleDiffView');
  assert.equal(preview.diff.on, false, 'a blocked diff view does not turn on');

  const screen = { width: 1600, height: 900 };
  const state: GameHostState = { status: 'ready', pid: 4242, readyMs: 1 };
  const submitted: JobChange[] = [];
  Object.defineProperties(gameHost, {
    state: { get: () => state, configurable: true },
    screen: { get: () => screen, configurable: true },
    use: { value: () => undefined, configurable: true },
    update: { value: () => undefined, configurable: true },
    submit: {
      value: (change: JobChange) => {
        submitted.push(change);
        return true;
      },
      configurable: true,
    },
  });
  const internals = gameHost as unknown as HostInternals;
  const settings = vscode.workspace.getConfiguration('etch');
  try {
    preview.setBackend('game-host');
    internals.emitter.fire(state);
    await until(() => submitted.length > 0, 'a game host job');
    await preview.idle();
    assert.deepEqual(preview.diff, { on: false }, 'the diff view can show');

    preview.setDiffView(true);
    assert.ok(hasNotice(preview, /shows once the game host has drawn/), 'no image yet');

    // The game host's image: the box as the offline renderer draws it, and one pixel it alone
    // draws, as content the game's code fills in would be; the text only the offline renderer.
    const change = submitted.at(-1);
    assert.ok(change);
    const { crop } = change;
    const box = preview.current?.drawList.draws.find((d): d is SpriteDraw => d.kind === 'sprite');
    assert.ok(box);
    const red = [255, 0, 0, 255];
    const boxPixels = [0, 1, 2, 3].flatMap((dy) =>
      [0, 1, 2, 3].map((dx) => ({ x: box.x - crop.x + dx, y: box.y - crop.y + dy, rgba: red })),
    );
    const extra = { x: crop.x + 1, y: crop.y + 1 };
    const file = path.join(gameHost.capturesFolder, 'job-1.tga');
    await mkdir(gameHost.capturesFolder, { recursive: true });
    await writeFile(
      file,
      hostTga(crop.width, crop.height, [...boxPixels, { x: 1, y: 1, rgba: [255, 255, 255, 255] }]),
    );
    const painted = nextDiffPaint(preview);
    internals.jobEmitter.fire({
      ok: true,
      job: 1,
      tag: change.tag,
      requestedAt: change.requestedAt,
      commands: [],
      errorLog: [],
      earlierErrorLog: [],
      image: { path: file, crop },
      frames: { black: 1, white: 2 },
      ms: { copies: 0, pipe: 0, job: 0 },
      plugin: { queued: 0, commands: 0, black: 0, white: 0, recover: 0, write: 0, total: 0 },
    });
    const { diff } = await painted;
    assert.ok(diff);
    assert.equal(diff.compared, crop.width * crop.height);
    assert.equal(diff.different, 0);
    assert.equal(diff.hostOnly, 1);
    assert.ok(diff.offlineOnly > 0, 'the text is drawn only by the offline renderer');
    assert.equal(diff.largest, 255);
    assert.ok(hasNotice(preview, /differ by design/), JSON.stringify(preview.notices));

    // The box the same, in grey; the game host's pixel yellow; outside the crop dark.
    const probed = await preview.probe([{ x: box.x + 1, y: box.y + 1 }, extra, { x: 5, y: 5 }]);
    assert.deepEqual(probed.pixels, [
      [70, 70, 70, 255],
      [255, 200, 0, 255],
      [32, 32, 32, 255],
    ]);

    // Off: the game host's image itself.
    preview.setDiffView(false);
    assert.deepEqual((await preview.probe([{ x: box.x + 1, y: box.y + 1 }])).pixels, [red]);
    preview.setDiffView(true);
    assert.equal((await preview.probe([extra])).diff?.hostOnly, 1);

    // Another preview resolution than the game host's turns it off, with a note.
    await settings.update('previewResolution', '1280x720', vscode.ConfigurationTarget.Global);
    await until(() => preview.diff.blocked !== undefined, 'the resolution to block the diff view');
    await settle(preview);
    assert.match(preview.diff.blocked ?? '', /1600×900, not 1280×720/);
    assert.ok(hasNotice(preview, /diff view is off/));
    assert.deepEqual((await preview.probe([{ x: box.x + 1, y: box.y + 1 }])).pixels, [red]);
    await settings.update('previewResolution', undefined, vscode.ConfigurationTarget.Global);
    await until(() => preview.diff.blocked === undefined, 'the resolutions to match again');

    // So does an image of another playset or language.
    await settings.update('language', 'french', vscode.ConfigurationTarget.Global);
    await until(() => preview.diff.blocked !== undefined, 'the language to block the diff view');
    assert.match(preview.diff.blocked ?? '', /another playset or language/);
    await settings.update('language', undefined, vscode.ConfigurationTarget.Global);
    await until(() => preview.diff.blocked === undefined, 'the language to match again');
    await settle(preview);
    assert.equal((await preview.probe([extra])).diff?.hostOnly, 1, 'it shows again');
  } finally {
    await settings.update('previewResolution', undefined, vscode.ConfigurationTarget.Global);
    await settings.update('language', undefined, vscode.ConfigurationTarget.Global);
    preview.setDiffView(false);
    preview.setBackend('offline');
    for (const key of REPLACED) Reflect.deleteProperty(gameHost, key);
    internals.emitter.fire(gameHost.state);
    await preview.idle();
  }
}
