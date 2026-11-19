// The mesh preview end to end in a real VS Code: a skinned `.mesh` with its diffuse, normal and
// specular textures and two `.anim` files beside it opens in Etch's custom editor; the webview
// parses and draws it with WebGL2, skips the collision shape, textures the part with all three
// maps and is offered only the animation that names the mesh's bones. A mesh in the game folder (`etch.gamePath`, a fixture) takes its texture
// through the playset, one without its texture is drawn untextured, and a file Etch cannot read is
// reported instead of shown. A `PdxMeshTextureAtlas` part reports its flag (the country colours
// until a tag is asked for), and a tag's flag comes from `gfx/flags` through the playset.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ANIM, binary, MESH, obj, strs } from '../../core/test/fixtures/pdx-asset.ts';
import type { EtchApi } from '../src/extension.ts';
import { flagTexture, MESH_PREVIEW_VIEW_TYPE, type MeshShown } from '../src/mesh-preview.ts';
import { linkedFiles } from '../src/script-profile-view.ts';
import { dds } from './asset-links.ts';

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
  // The fixture mesh with a normal and a specular map named after its diffuse texture.
  const mapped = MESH.flatMap((item) =>
    'name' in item && item.name === 'diff'
      ? [item, strs('n', 'flag_normal.dds'), strs('spec', 'flag_spec.dds')]
      : [item],
  );
  await writeFile(mesh.fsPath, binary(mapped));
  await writeFile(path.join(folder, 'flag_diffuse.dds'), dds(2, 2, [10, 20, 30, 255]));
  await writeFile(path.join(folder, 'flag_normal.dds'), dds(2, 2, [255, 128, 128, 255]));
  await writeFile(path.join(folder, 'flag_spec.dds'), dds(2, 2, [0, 0, 0, 128]));
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
    normalMapped: 1,
    specularMapped: 1,
    animations: ['flag_wave.anim'],
    textures: {
      'flag_diffuse.dds': 'beside the mesh',
      'flag_normal.dds': 'beside the mesh',
      'flag_spec.dds': 'beside the mesh',
    },
  });
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');

  // A ship's sails: the fixture quad as a PdxMeshTextureAtlas part, with its second UVs.
  const sails = vscode.Uri.file(path.join(folder, 'etch_sails.mesh'));
  await writeFile(
    sails.fsPath,
    binary(
      MESH.map((item) =>
        'name' in item && item.name === 'shader' && item.values[0] === 'PdxMeshStandardSkinned'
          ? strs('shader', 'PdxMeshTextureAtlas')
          : item,
      ),
    ),
  );
  const atlas = await open(api, sails);
  assert.ok(atlas.ok, `the sails show: ${atlas.ok ? '' : atlas.message}`);
  assert.deepEqual(
    atlas.summary.flag,
    { parts: 1 },
    'one flag part, in the country colours until a tag is asked for',
  );
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');

  // The same mesh in a fixture game folder: its texture comes from the playset's game layer.
  const game = await mkdtemp(path.join(tmpdir(), 'etch-mesh-game-'));
  const models = path.join(game, 'gfx', 'models', 'etch');
  await mkdir(models, { recursive: true });
  await writeFile(path.join(game, 'eu4.exe'), 'not the game');
  await writeFile(path.join(models, 'etch_flag.mesh'), binary(MESH));
  await writeFile(path.join(models, 'flag_diffuse.dds'), dds(2, 2, [30, 20, 10, 255]));
  await mkdir(path.join(game, 'gfx', 'models', 'bare'));
  await mkdir(path.join(game, 'gfx', 'flags'));
  // dds() takes its bytes as BGRA: a red flag.
  await writeFile(path.join(game, 'gfx', 'flags', 'ETC.dds'), dds(2, 2, [40, 40, 200, 255]));
  await writeFile(path.join(game, 'gfx', 'models', 'bare', 'etch_bare.mesh'), binary(MESH));
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  try {
    const inGame = await open(api, vscode.Uri.file(path.join(models, 'etch_flag.mesh')));
    assert.ok(inGame.ok, `the game's mesh shows: ${inGame.ok ? '' : inGame.message}`);
    assert.deepEqual(
      inGame.summary.textures,
      { 'flag_diffuse.dds': 'the game' },
      'a mesh in the game folder takes its texture through the playset',
    );
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const bare = await open(
      api,
      vscode.Uri.file(path.join(game, 'gfx', 'models', 'bare', 'etch_bare.mesh')),
    );
    assert.ok(bare.ok, `a mesh without its texture shows: ${bare.ok ? '' : bare.message}`);
    assert.equal(bare.summary.textured, 0, 'untextured');
    assert.equal(bare.summary.normalMapped, 0, 'no normal map named');
    assert.deepEqual(bare.summary.textures, { 'flag_diffuse.dds': 'not found' });
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

    // A tag's flag: gfx/flags/<TAG>.tga, here as its .dds fallback, through the playset.
    const files = (await linkedFiles())?.files;
    const etc = await flagTexture('ETC', files);
    assert.ok(etc.ok, `the fixture flag is found: ${etc.ok ? '' : etc.message}`);
    assert.deepEqual([etc.width, etc.height, etc.source], [2, 2, 'the game']);
    assert.deepEqual(Array.from(etc.rgba.subarray(0, 4)), [200, 40, 40, 255]);
    const missing = await flagTexture('XYZ', files);
    assert.deepEqual(missing, { ok: false, message: 'no gfx/flags/XYZ.tga in the playset' });
    const notATag = await flagTexture('../x', files);
    assert.ok(!notATag.ok, 'only a country tag is looked up');
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }

  const broken = vscode.Uri.file(path.join(folder, 'broken.mesh'));
  await writeFile(broken.fsPath, 'not a mesh at all');
  const failed = await open(api, broken);
  assert.ok(!failed.ok, 'a broken mesh is reported');
  assert.match(failed.message, /no @@b@ or @@t@ magic/);
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
