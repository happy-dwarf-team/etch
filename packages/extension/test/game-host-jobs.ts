// Local only, part of the game host run (game-host.ts): preview jobs against the real game host
// (spec sections 4 and 7, etch#50). Measures the first image and warm edits, checks H1 of etch#16
// on the window's opaque pixels, a texture saved to disk, a saved localisation file and a nested
// eu3dialogtype. The images are game art: they are read here and never written outside the test
// VS Code's storage.
import * as assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { writePreviewCopy, type PreviewCopyFile } from '@etch/core';
import type { EtchApi } from '../src/extension.ts';
import type { JobOutcome } from '../src/game-host/index.ts';
import type { HostImagePaint } from '../src/preview/preview.ts';

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
  assert.equal(bytes[17], 0x28, 'rows top first, 8 alpha bits');
  const width = bytes.readUInt16LE(12);
  const height = bytes.readUInt16LE(14);
  assert.equal(bytes.length, 18 + width * height * 4);
  return { width, height, pixels: bytes.subarray(18) };
}

/** The next game host image the preview draws; a failed job rejects. */
export function nextImage(api: EtchApi, timeoutMs = 30_000): Promise<HostImagePaint> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      done();
      reject(new Error('no game host image in time'));
    }, timeoutMs);
    const painted = api.preview.onDidPaintHostImage((paint) => {
      done();
      resolve(paint);
    });
    const failed = api.gameHost.onDidFinishJob((outcome: JobOutcome) => {
      if (outcome.ok) return;
      done();
      reject(new Error(`job ${String(outcome.job)} failed (${outcome.code}): ${outcome.message}`));
    });
    const done = (): void => {
      clearTimeout(timer);
      painted.dispose();
      failed.dispose();
    };
  });
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

function differing(a: Tga, b: Tga): number {
  let count = 0;
  for (let i = 0; i < a.pixels.length; i += 4) {
    if (
      a.pixels[i] !== b.pixels[i] ||
      a.pixels[i + 1] !== b.pixels[i + 1] ||
      a.pixels[i + 2] !== b.pixels[i + 2] ||
      a.pixels[i + 3] !== b.pixels[i + 3]
    ) {
      count++;
    }
  }
  return count;
}

function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? NaN;
}

function describe(paint: HostImagePaint): string {
  const { outcome } = paint;
  const { crop } = outcome.image;
  return (
    `job ${String(outcome.job)}: ${String(crop.width)}×${String(crop.height)} at ${String(crop.x)},${String(crop.y)}; ` +
    `drawn ${paint.fromChangeMs.toFixed(0)} ms after the change, job ${outcome.ms.job.toFixed(0)} ms ` +
    `(plugin ${JSON.stringify(outcome.plugin)}; frames ${String(outcome.frames.black)}/${String(outcome.frames.white)})`
  );
}

/** Moves the cursor into the line that holds `text`, which selects the window around it. */
async function cursorAt(editor: vscode.TextEditor, text: string): Promise<void> {
  const offset = editor.document.getText().indexOf(text);
  assert.ok(offset >= 0, `${text} is in the file`);
  const position = editor.document.positionAt(offset);
  editor.selection = new vscode.Selection(position, position);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export interface JobFixture {
  /** The test mod's copy of `countrydiplomacyview.gui`. */
  readonly gui: string;
  /** The test mod's copy of the window's top background texture. */
  readonly texture: string;
  /** The test mod's localisation file, `HEADER_DIPLOMACY` in it. */
  readonly localisation: string;
}

export async function testGameHostJobs(
  api: EtchApi,
  fixture: JobFixture,
  firstImage: Promise<HostImagePaint>,
): Promise<void> {
  const { preview, gameHost } = api;
  const running = gameHost.running;
  const screen = gameHost.screen;
  assert.ok(running !== undefined && screen !== undefined, 'the game host runs');
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.fsPath.toLowerCase() === fixture.gui.toLowerCase(),
  );
  assert.ok(editor, 'the copy of countrydiplomacyview.gui is open');

  // The first image: the window under the cursor.
  const current = preview.current;
  console.log(
    `[etch] preview render ${String(current?.id)} of ${String(current?.window.name)} at ` +
      `${String(current?.drawList.width)}×${String(current?.drawList.height)}; notices ` +
      JSON.stringify(preview.notices),
  );
  const first = await firstImage;
  console.log(`[etch] first game host image, ${describe(first)}`);
  const image = await readTga(first.outcome.image.path);
  const { crop } = first.outcome.image;
  assert.equal(image.width, crop.width);
  assert.equal(image.height, crop.height);
  const counts = alphaCounts(image);
  console.log(`[etch] alpha of the first image: ${JSON.stringify(counts)}`);
  assert.ok(counts.opaque > 0, 'the window draws opaque pixels');
  assert.ok(
    first.outcome.commands.some((c) => c.line.startsWith('window open etchw_')),
    'the white wrapper opened',
  );
  assert.equal(
    preview.notices.filter((n) => n.severity === 'error').length,
    0,
    `no errors: ${JSON.stringify(preview.notices)}`,
  );

  // H1 of etch#16: the game's own window, opened as it is over the main menu, against the preview
  // copy. Where the copy is opaque nothing shows through, so the pixels must be the same.
  const original = path.join(gameHost.capturesFolder, 'h1-original.tga');
  const copy = writePreviewCopy({
    path: 'interface/countrydiplomacyview.gui',
    text: editor.document.getText(),
    window: 'countrydiplomacyview',
    screen,
  });
  const files = copy.files as readonly [PreviewCopyFile, PreviewCopyFile];
  await running.request(
    {
      type: 'job',
      reload: [files[0].fileName, files[1].fileName],
      black: 'countrydiplomacyview',
      white: 'countrydiplomacyview',
      crop,
      // Its show animation, as the preview's own jobs wait for it.
      settle_ms: 350,
      output: original,
    },
    10_000,
  );
  const plain = await readTga(original);
  let opaque = 0;
  let same = 0;
  let maxDiff = 0;
  for (let i = 0; i < image.pixels.length; i += 4) {
    if (image.pixels[i + 3] !== 255) continue;
    opaque++;
    let diff = 0;
    for (let c = 0; c < 3; c++) {
      diff = Math.max(diff, Math.abs((image.pixels[i + c] ?? 0) - (plain.pixels[i + c] ?? 0)));
    }
    if (diff === 0) same++;
    maxDiff = Math.max(maxDiff, diff);
  }
  console.log(
    `[etch] H1: ${String(same)} of ${String(opaque)} opaque pixels of the preview copy equal the ` +
      `original over the main menu; largest difference ${String(maxDiff)}`,
  );
  assert.ok(maxDiff <= 2, 'the preview copy draws as the original (H1 of etch#16)');

  // Warm edits: each one moves a widget by a pixel, and each must reach the preview as an image.
  const times: number[] = [];
  const jobs: number[] = [];
  for (let edit = 0; edit < 10; edit++) {
    const waiting = nextImage(api);
    const text = editor.document.getText();
    const match = /position = \{ x=-60[01] y=140 \}/.exec(text);
    assert.ok(match, 'the window has its position');
    const range = new vscode.Range(
      editor.document.positionAt(match.index),
      editor.document.positionAt(match.index + match[0].length),
    );
    await editor.edit((builder) => {
      builder.replace(range, `position = { x=${edit % 2 === 0 ? '-601' : '-600'} y=140 }`);
    });
    const paint = await waiting;
    times.push(paint.fromChangeMs);
    jobs.push(paint.outcome.ms.job);
  }
  console.log(
    `[etch] 10 warm edits: change to image median ${quantile(times, 0.5).toFixed(0)} ms, ` +
      `p95 ${quantile(times, 0.95).toFixed(0)} ms; job median ${quantile(jobs, 0.5).toFixed(0)} ms, ` +
      `p95 ${quantile(jobs, 0.95).toFixed(0)} ms (target ≤ 150 ms, spec section 7)`,
  );

  // A texture saved to disk: reloadtexture, and the window's pixels change.
  const before = await readTga((await nextImageAfter(api, () => touch(editor))).outcome.image.path);
  const texture = await readFile(fixture.texture);
  const changed = Buffer.from(texture);
  // An uncompressed 32-bit DDS: its colours inverted, its alpha kept.
  for (let i = 128; i + 3 < changed.length; i += 4) {
    for (let c = 0; c < 3; c++) changed[i + c] = 255 - (changed[i + c] ?? 0);
  }
  const afterTexture = nextImage(api);
  await writeFile(fixture.texture, changed);
  const textured = await afterTexture;
  console.log(`[etch] texture saved, ${describe(textured)}`);
  const reload = textured.outcome.commands.find((c) => c.line.startsWith('reloadtexture '));
  assert.ok(reload, 'the job reloaded the texture');
  console.log(`[etch] "${reload.line}" answered "${reload.text}" (${String(reload.success)})`);
  const after = await readTga(textured.outcome.image.path);
  const moved = differing(before, after);
  console.log(`[etch] ${String(moved)} pixels changed with the texture`);
  assert.ok(moved > 0, 'the saved texture shows in the game host');

  // A saved localisation file: reloadloc.
  const loc = await vscode.workspace.openTextDocument(vscode.Uri.file(fixture.localisation));
  const locEditor = await vscode.window.showTextDocument(loc, vscode.ViewColumn.Two, true);
  const afterLoc = nextImage(api);
  await locEditor.edit((builder) => {
    const start = loc.getText().indexOf('Etch test');
    builder.replace(
      new vscode.Range(loc.positionAt(start), loc.positionAt(start + 'Etch test'.length)),
      'Etch saved',
    );
  });
  await loc.save();
  const localised = await afterLoc;
  const reloadloc = localised.outcome.commands.find((c) => c.line === 'reloadloc');
  assert.ok(reloadloc, 'the job reloaded the localisation');
  console.log(
    `[etch] localisation saved, ${describe(localised)}; reloadloc answered "${reloadloc.text}" ` +
      `(${String(reloadloc.success)}); ${String(differing(after, await readTga(localised.outcome.image.path)))} pixels changed`,
  );
  await vscode.window.showTextDocument(editor.document, vscode.ViewColumn.One);

  // A nested eu3dialogtype (etch#47): GiftDiplomacyDialog of the same file.
  const dialog = nextImage(api);
  await cursorAt(editor, 'name = "GiftDiplomacyDialog"');
  const shown = await dialog;
  console.log(`[etch] eu3dialogtype GiftDiplomacyDialog, ${describe(shown)}`);
  const dialogImage = await readTga(shown.outcome.image.path);
  const dialogCounts = alphaCounts(dialogImage);
  console.log(`[etch] alpha of the eu3dialogtype: ${JSON.stringify(dialogCounts)}`);
  assert.ok(dialogCounts.opaque + dialogCounts.partial > 0, 'the nested eu3dialogtype draws');
  assert.ok(
    shown.outcome.commands.some((c) => c.line === 'window open etch_GiftDiplomacyDialog_backdrop'),
    'the dialog was opened through its wrapper',
  );
}

/** Makes an edit that changes nothing and waits for the image it brings. */
async function nextImageAfter(api: EtchApi, act: () => Promise<void>): Promise<HostImagePaint> {
  const waiting = nextImage(api);
  await act();
  return waiting;
}

async function touch(editor: vscode.TextEditor): Promise<void> {
  const end = editor.document.positionAt(editor.document.getText().length);
  await editor.edit((builder) => {
    builder.insert(end, ' ');
  });
}
