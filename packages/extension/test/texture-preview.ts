// The texture preview end to end in a real VS Code: a DDS and a TGA file in a temp folder open in
// Etch's custom editor, the webview decodes and reports them, a file rewritten on disk shows
// again, and a file Etch cannot read is reported instead of shown.
import * as assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EtchApi } from '../src/extension.ts';
import { TEXTURE_PREVIEW_VIEW_TYPE, type TextureShown } from '../src/texture-preview.ts';

const TIMEOUT_MS = Number(process.env['ETCH_TEST_TIMEOUT_MS'] ?? 5_000);
const COLD_TIMEOUT_MS = 30_000;

/** An A8R8G8B8 DDS file without a mip chain, every texel the same BGRA. */
function dds(width: number, height: number, bgra: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(128 + width * height * 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x20534444, true);
  view.setUint32(4, 124, true);
  view.setUint32(8, 0x1007, true);
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  view.setUint32(76, 32, true);
  view.setUint32(80, 0x41, true);
  view.setUint32(88, 32, true);
  [0xff0000, 0xff00, 0xff, 0xff000000].forEach((mask, i) => {
    view.setUint32(92 + i * 4, mask, true);
  });
  view.setUint32(108, 0x1000, true);
  for (let i = 128; i < bytes.length; i += 4) bytes.set(bgra, i);
  return bytes;
}

/** An uncompressed 24-bit TGA file, bottom row first. */
function tga(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(18 + width * height * 3);
  bytes[2] = 2;
  bytes[12] = width;
  bytes[14] = height;
  bytes[16] = 24;
  return bytes;
}

function nextShow(api: EtchApi, file: vscode.Uri, timeout: number): Promise<TextureShown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`no texture preview of ${file.fsPath} within ${String(timeout)} ms`));
    }, timeout);
    const subscription = api.texturePreview.onDidShow((shown) => {
      if (shown.uri.toString() !== file.toString()) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve(shown);
    });
  });
}

async function open(api: EtchApi, file: vscode.Uri, timeout = TIMEOUT_MS): Promise<TextureShown> {
  const shown = nextShow(api, file, timeout);
  await vscode.commands.executeCommand('vscode.openWith', file, TEXTURE_PREVIEW_VIEW_TYPE);
  return shown;
}

export async function testTexturePreview(api: EtchApi): Promise<void> {
  const folder = await mkdtemp(path.join(tmpdir(), 'etch-textures-'));
  const ddsFile = vscode.Uri.file(path.join(folder, 'etch_box.dds'));
  await writeFile(ddsFile.fsPath, dds(4, 2, [10, 20, 30, 128]));

  const first = await open(api, ddsFile, COLD_TIMEOUT_MS);
  assert.ok(first.ok, `the DDS file shows: ${first.ok ? '' : first.message}`);
  assert.deepEqual(
    first.summary,
    {
      container: 'DDS',
      level: 0,
      width: 4,
      height: 2,
      drawnWidth: 4,
      drawnHeight: 2,
      format: 'BGRA8',
      dx10: false,
      mipLevels: 1,
      hasAlpha: true,
    },
    'the preview reports the header facts',
  );

  // An image editor's export: the open preview shows the new file.
  const again = nextShow(api, ddsFile, TIMEOUT_MS * 2);
  await writeFile(ddsFile.fsPath, dds(8, 8, [10, 20, 30, 255]));
  const changed = await again;
  assert.ok(changed.ok, 'the rewritten DDS file shows');
  assert.equal(changed.summary.width, 8, 'the rewritten file shows at its new size');
  assert.equal(changed.summary.hasAlpha, false, 'the rewritten file is opaque');

  const tgaFile = vscode.Uri.file(path.join(folder, 'etch_box.tga'));
  await writeFile(tgaFile.fsPath, tga(3, 2));
  const fromTga = await open(api, tgaFile);
  assert.ok(fromTga.ok, 'the TGA file shows');
  assert.equal(fromTga.summary.format, '24-bit', 'the preview names the TGA encoding');

  const broken = vscode.Uri.file(path.join(folder, 'broken.dds'));
  await writeFile(broken.fsPath, new TextEncoder().encode('not a texture '.repeat(20)));
  const failed = await open(api, broken);
  assert.ok(!failed.ok, 'a file Etch cannot read is reported');
  assert.match(failed.message, /no "DDS " magic/, 'the report names the defect');

  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
