// The mesh preview end to end in a real VS Code: a skinned `.mesh` with its diffuse texture and
// two `.anim` files beside it opens in Etch's custom editor; the webview parses and draws it with
// WebGL2, skips the collision shape, textures the part and is offered only the animation that
// names the mesh's bones. A file Etch cannot read is reported instead of shown.
import * as assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ANIM, binary, MESH, obj } from '../../core/test/fixtures/pdx-asset.ts';
import type { EtchApi } from '../src/extension.ts';
import { MESH_PREVIEW_VIEW_TYPE, type MeshShown } from '../src/mesh-preview.ts';
import { dds } from './texture-preview.ts';

const COLD_TIMEOUT_MS = 30_000;

function open(api: EtchApi, file: vscode.Uri): Promise<MeshShown> {
  const shown = new Promise<MeshShown>((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`no mesh preview of ${file.fsPath} within ${String(COLD_TIMEOUT_MS)} ms`));
    }, COLD_TIMEOUT_MS);
    const subscription = api.meshPreview.onDidShow((result) => {
      if (result.uri.toString() !== file.toString()) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve(result);
    });
  });
  void vscode.commands.executeCommand('vscode.openWith', file, MESH_PREVIEW_VIEW_TYPE);
  return shown;
}

export async function testMeshPreview(api: EtchApi): Promise<void> {
  const folder = await mkdtemp(path.join(tmpdir(), 'etch-meshes-'));
  const mesh = vscode.Uri.file(path.join(folder, 'etch_flag.mesh'));
  await writeFile(mesh.fsPath, binary(MESH));
  await writeFile(path.join(folder, 'flag_diffuse.dds'), dds(2, 2, [10, 20, 30, 255]));
  await writeFile(path.join(folder, 'flag_wave.anim'), binary(ANIM));
  // An animation of another skeleton: not offered.
  const other = ANIM.map((item) =>
    'object' in item && item.depth === 2 ? obj(2, `${item.object}_other`) : item,
  );
  await writeFile(path.join(folder, 'other.anim'), binary(other));

  const shown = await open(api, mesh);
  assert.ok(shown.ok, `the mesh shows: ${shown.ok ? '' : shown.message}`);
  // The webview posts no `animation` key before one plays: postMessage drops `undefined`.
  const { animation, ...rest } = shown.summary;
  assert.equal(animation, undefined);
  assert.deepEqual(rest, {
    shapes: 1,
    collisionShapes: 1,
    vertices: 4,
    triangles: 2,
    bones: 2,
    textured: 1,
    animations: ['flag_wave.anim'],
  });
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');

  const broken = vscode.Uri.file(path.join(folder, 'broken.mesh'));
  await writeFile(broken.fsPath, 'not a mesh at all');
  const failed = await open(api, broken);
  assert.ok(!failed.ok, 'a broken mesh is reported');
  assert.match(failed.message, /no @@b@ or @@t@ magic/);
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
