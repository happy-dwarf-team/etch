// Local only, part of the game host run (game-host.ts): preview jobs against the real game host
// (spec sections 4 and 7, etch#50). Measures the first image and warm edits, and reports what a
// texture saved to disk and a saved localisation file do; a nested eu3dialogtype gets a notice.
// The images are game art: they are read here and never written outside the test VS Code's
// storage.
import * as assert from 'node:assert/strict';
import { readFile, rename, writeFile } from 'node:fs/promises';
import * as vscode from 'vscode';
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
  // Written whole under another name and moved over the texture, so no job reads half a file.
  await writeFile(`${fixture.texture}.part`, changed);
  await rename(`${fixture.texture}.part`, fixture.texture);
  const textured = await afterTexture;
  console.log(`[etch] texture saved, ${describe(textured)}`);
  for (const c of textured.outcome.commands.filter((c) => c.line.startsWith('reloadtexture '))) {
    console.log(`[etch] "${c.line}" answered "${c.text}" (${String(c.success)})`);
  }
  const after = await readTga(textured.outcome.image.path);
  console.log(`[etch] ${String(differing(before, after))} pixels changed with the texture`);
  if (
    textured.outcome.commands.some(
      (c) => c.line.startsWith('reloadtexture ') && /fail/i.test(c.text),
    )
  ) {
    assert.ok(
      gameDiagnostics(editor.document.uri).some((d) => d.code === 'game-console-answer'),
      'a refused reloadtexture is in the Problems panel',
    );
  }
  // In etch#50's live runs reloadtexture answered "Reload failed" at once in the main menu, for
  // every spelling of the name: reported here, not asserted.

  // A saved localisation file: reloadloc.
  const loc = await vscode.workspace.openTextDocument(vscode.Uri.file(fixture.localisation));
  // In the editor's column, so that the preview beside it stays visible.
  const locEditor = await vscode.window.showTextDocument(loc, vscode.ViewColumn.One);
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
  assert.ok(reloadloc, 'the job ran reloadloc');
  console.log(
    `[etch] localisation saved, ${describe(localised)}; reloadloc answered "${reloadloc.text}" ` +
      `(${String(reloadloc.success)}); ${String(differing(after, await readTga(localised.outcome.image.path)))} pixels changed`,
  );
  const guiEditor = await vscode.window.showTextDocument(editor.document, vscode.ViewColumn.One);

  // Diagnostics from the game (etch#52): two icons of one name and a sprite no .gfx defines.
  const probe =
    '\t\ticonType = { name = "etch_probe_icon" spriteType = "GFX_etch_probe_missing" position = { x = 0 y = 0 } }\r\n';
  const anchor = guiEditor.document.getText().indexOf('\t\tupsound = tab_diplomacy');
  assert.ok(anchor >= 0, 'the window has its upsound');
  const probed = nextImage(api);
  await guiEditor.edit((builder) => {
    builder.insert(guiEditor.document.positionAt(anchor), probe + probe);
  });
  const probedPaint = await probed;
  console.log(`[etch] probe edit, ${describe(probedPaint)}`);
  for (const line of probedPaint.outcome.errorLog) console.log(`[etch] error.log: ${line}`);
  const found = gameDiagnostics(guiEditor.document.uri);
  for (const d of found) {
    console.log(
      `[etch] Problems (${JSON.stringify(d.code)}, line ${String(d.range.start.line + 1)}): ${d.message}`,
    );
  }
  assert.ok(
    !found.some((d) => d.message.includes('GFX_etch_probe_missing')),
    'the missing sprite is reported once, by the model',
  );
  assert.ok(
    found.every((d) => !/etchw?_countrydiplomacyview/i.test(d.message)),
    'the messages name the original, not the copies',
  );
  // The game names the second icon of the name; it is on the line after the anchor's.
  const second = guiEditor.document.positionAt(anchor).line + 1;
  assert.ok(
    found.some(
      (d) =>
        d.code === 'game-error-log' &&
        d.range.start.line === second &&
        d.message.includes("'etch_probe_icon'") &&
        d.message.includes(`interface/countrydiplomacyview.gui line: ${String(second + 1)}`),
    ),
    'the duplicate name is on the second icon, with the original line',
  );
  assert.equal(
    found.filter((d) => d.message.includes('already exists')).length,
    1,
    'what both copies report is reported once',
  );
  assert.ok(
    !found.some((d) => d.code === 'game-original-differs'),
    'the test mod file is the one the game reads',
  );
  const unprobed = nextImage(api);
  await guiEditor.edit((builder) => {
    builder.delete(
      new vscode.Range(
        guiEditor.document.positionAt(anchor),
        guiEditor.document.positionAt(anchor + 2 * probe.length),
      ),
    );
  });
  await unprobed;

  // A nested eu3dialogtype (etch#47): in etch#50's live runs the backdrop wrapper hid it (the
  // same dialog opened on its own drew), so the preview says so instead of running a job.
  await cursorAt(guiEditor, 'name = "GiftDiplomacyDialog"');
  // The selection's event can come after a turn of the event loop.
  for (let i = 0; i < 100 && preview.current?.window.name !== 'GiftDiplomacyDialog'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await preview.idle();
  assert.ok(
    preview.notices.some((n) => n.message.includes('eu3dialogtype')),
    `the preview says the game host cannot show the dialog: ${JSON.stringify(preview.notices)}`,
  );
}

/** Etch's diagnostics of a file that come from the game host. */
function gameDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
  return vscode.languages
    .getDiagnostics(uri)
    .filter((d) => typeof d.code === 'string' && /^(?:game-|fps-)/.test(d.code));
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
