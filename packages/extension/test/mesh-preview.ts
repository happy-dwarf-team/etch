// The mesh preview end to end in a real VS Code: a skinned `.mesh` with its diffuse, normal and
// specular textures and two `.anim` files beside it opens in Etch's custom editor; the webview
// parses and draws it with WebGL2, skips the collision shape, textures the part with all three
// maps and is offered only the animation that names the mesh's bones. A mesh in the game folder (`etch.gamePath`, a fixture) takes its texture
// through the playset, one without its texture is drawn untextured, and a file Etch cannot read is
// reported instead of shown. A `PdxMeshTextureAtlas` part reports its flag (the country colours
// until a tag is asked for), and a tag's flag comes from `gfx/flags` through the playset. A
// `PdxMeshAlphaBlendNoZWrite` part (a selection ring) is reported as blended, and a `PdxMeshSnow`
// part and a map tree as taking snow, and a map tree takes the playset's tint map. A mesh
// with levels of detail draws and counts only its most detailed level, and a mesh a playset's
// `mapobject_<n>` pdxmesh names is drawn as a map tree. What the shaders draw is read back from the
// canvas (`MeshPreviewApi.control`): full snow greys a building and a tree whose normals point
// up, and a map tree's colour follows the Ground colour, the Season and North sliders and the Turn.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ANIM, binary, floats, ints, MESH, obj, strs } from '../../core/test/fixtures/pdx-asset.ts';
import type { EtchApi } from '../src/extension.ts';
import {
  flagTexture,
  MESH_PREVIEW_VIEW_TYPE,
  treeMap,
  TREE_SEASON,
  TREE_TINT,
  type MeshShown,
} from '../src/mesh-preview.ts';
import type { MeshControls } from '../src/mesh-protocol.ts';
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

type Drawn = { readonly pixels: number; readonly mean: readonly [number, number, number] };

/** The fixture mesh with its quad's normals turned up (+y), where snow settles. */
const FACING_UP = MESH.map((item) =>
  'name' in item && item.name === 'n' ? floats('n', 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0) : item,
);

/** How far a drawn mean colour is from grey: its largest channel less its smallest. */
const spread = (drawn: Drawn): number => Math.max(...drawn.mean) - Math.min(...drawn.mean);

/** Sets an open preview's controls and waits for the colour it then draws. */
async function measure(api: EtchApi, file: vscode.Uri, controls: MeshControls): Promise<Drawn> {
  const drawn = new Promise<Drawn>((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`no drawn colour of ${file.fsPath} within ${String(COLD_TIMEOUT_MS)} ms`));
    }, COLD_TIMEOUT_MS);
    const subscription = api.meshPreview.onDidShow((result) => {
      if (result.uri.toString() !== file.toString() || !result.ok) return;
      if (result.summary.drawn === undefined) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve(result.summary.drawn);
    });
  });
  assert.ok(await api.meshPreview.control(file, controls), `a preview of ${file.fsPath} is open`);
  return drawn;
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
  assert.equal(atlas.summary.blended, undefined, 'nothing blended');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');

  // A unit's selection ring: the fixture quad as a PdxMeshAlphaBlendNoZWrite part.
  const ring = vscode.Uri.file(path.join(folder, 'etch_ring.mesh'));
  await writeFile(
    ring.fsPath,
    binary(
      MESH.map((item) =>
        'name' in item && item.name === 'shader' && item.values[0] === 'PdxMeshStandardSkinned'
          ? strs('shader', 'PdxMeshAlphaBlendNoZWrite')
          : item,
      ),
    ),
  );
  const blended = await open(api, ring);
  assert.ok(blended.ok, `the ring shows: ${blended.ok ? '' : blended.message}`);
  assert.equal(blended.summary.blended, 1, 'one part blended by its diffuse alpha');
  assert.equal(blended.summary.snow, undefined, 'no snow offered');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');

  // A building: the fixture quad, facing up, as a PdxMeshSnow part takes snow, none until the
  // slider moves; at full snow it is drawn in the snow's grey.
  const building = vscode.Uri.file(path.join(folder, 'etch_building.mesh'));
  await writeFile(
    building.fsPath,
    binary(
      FACING_UP.map((item) =>
        'name' in item && item.name === 'shader' && item.values[0] === 'PdxMeshStandardSkinned'
          ? strs('shader', 'PdxMeshSnow')
          : item,
      ),
    ),
  );
  const snowy = await open(api, building);
  assert.ok(snowy.ok, `the building shows: ${snowy.ok ? '' : snowy.message}`);
  assert.deepEqual(snowy.summary.snow, { parts: 1, amount: 0 }, 'snow offered, none by default');
  const unsnowed = await measure(api, building, {});
  assert.ok(unsnowed.pixels > 0, 'the building is drawn');
  const snowed = await measure(api, building, { snow: 1 });
  assert.ok(spread(unsnowed) > 10, `the building is coloured: ${String(unsnowed.mean)}`);
  assert.ok(spread(snowed) <= 3, `full snow greys the building: ${String(snowed.mean)}`);
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');

  // A map tree's levels of detail: a quad at level 0 and a triangle at level 1, as two shapes.
  const tree = vscode.Uri.file(path.join(folder, 'etch_tree.mesh'));
  const level = (name: string, p: number[], tri: number[]) => [
    obj(2, name),
    obj(3, 'mesh'),
    floats('p', ...p),
    ints('tri', ...tri),
    obj(4, 'material'),
    strs('shader', 'PdxMeshStandard'),
  ];
  await writeFile(
    tree.fsPath,
    binary([
      ints('pdxasset', 1, 0),
      obj(1, 'object'),
      ...level('lodShape0', [0, 0, 0, 2, 0, 0, 0, 1, 0, 2, 1, 0], [0, 1, 2, 1, 3, 2]),
      ...level('lodShape1', [0, 0, 0, 2, 0, 0, 0, 1, 0], [0, 1, 2]),
    ]),
  );
  const lod = await open(api, tree);
  assert.ok(lod.ok, `the tree shows: ${lod.ok ? '' : lod.message}`);
  assert.deepEqual(lod.summary.lod, { level: 0, levels: [0, 1] }, 'level 0 of 0 and 1');
  assert.deepEqual(
    [lod.summary.shapes, lod.summary.vertices, lod.summary.triangles],
    [1, 4, 2],
    'only level 0 is drawn and counted',
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
  // A map tree: a pdxmesh named mapobject_<n> in a .gfx file of the playset names the mesh.
  const trees = path.join(game, 'gfx', 'models', 'Mapitems', 'Trees');
  await mkdir(trees, { recursive: true });
  await writeFile(path.join(trees, 'etch_tree.mesh'), binary(FACING_UP));
  await mkdir(path.join(game, 'interface'));
  await writeFile(
    path.join(game, 'interface', 'etch_trees.gfx'),
    'objectTypes = {\n  pdxmesh = { name = "mapobject_3" file = "gfx/models/Mapitems/Trees/etch_tree.mesh" }\n}\n',
  );
  // The trees' tint map: a 24-bit BMP, 2 x 1, its one row padded to 8 bytes (BGR texels).
  const tint = new Uint8Array(62);
  const header = new DataView(tint.buffer);
  tint.set([0x42, 0x4d]);
  header.setUint32(10, 54, true);
  header.setUint32(14, 40, true);
  header.setInt32(18, 2, true);
  header.setInt32(22, 1, true);
  header.setUint16(28, 24, true);
  tint.set([20, 120, 60, 200, 150, 100], 54);
  await mkdir(path.join(game, 'map', 'terrain'), { recursive: true });
  await writeFile(path.join(game, 'map', 'terrain', 'Tree_tint.bmp'), tint);
  await writeFile(path.join(game, 'map', 'terrain', 'Tree_season.bmp'), tint);
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
    assert.equal(inGame.summary.tree, undefined, 'a mesh no mapobject_<n> names is not a tree');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const tree = await open(api, vscode.Uri.file(path.join(trees, 'etch_tree.mesh')));
    assert.ok(tree.ok, `the map tree shows: ${tree.ok ? '' : tree.message}`);
    assert.equal(tree.summary.tree, 'mapobject_3', 'drawn as the map tree that names it');
    assert.deepEqual(tree.summary.snow, { parts: 1, amount: 0 }, 'a map tree takes snow');
    assert.deepEqual(
      tree.summary.tint,
      { source: 'the game', turn: 0 },
      "a map tree takes the playset's tint map",
    );
    assert.equal(inGame.summary.tint, undefined, 'another mesh takes no tint');
    assert.equal(tree.summary.ground, '#808080', 'the Ground colour starts at the neutral grey');
    assert.equal(inGame.summary.ground, undefined, 'another mesh has no ground colour');
    assert.deepEqual(
      tree.summary.season,
      { source: 'the game', time: 0, north: 0 },
      "a map tree takes the playset's season map, North at 0",
    );
    assert.equal(inGame.summary.season, undefined, 'another mesh takes no season map');
    // What the tree shader draws follows the controls (the canvas read back, mean colour).
    const treeUri = vscode.Uri.file(path.join(trees, 'etch_tree.mesh'));
    const plain = await measure(api, treeUri, {});
    assert.ok(plain.pixels > 0, 'the tree is drawn');
    // Ground red, laid over at 0.25: red rises, green and blue fall; grey changes nothing.
    const red = await measure(api, treeUri, { ground: '#ff0000' });
    assert.ok(
      red.mean[0] > plain.mean[0] + 5,
      `a red ground reddens the tree: ${String(red.mean)}`,
    );
    assert.ok(red.mean[1] < plain.mean[1] - 5 && red.mean[2] < plain.mean[2] - 5);
    assert.deepEqual(await measure(api, treeUri, { ground: '#808080' }), plain);
    // North 1 adds the season map's texel less grey; the fixture's texels are below grey in red
    // and blue. North 0 changes nothing.
    const north = await measure(api, treeUri, { season: 0, north: 1 });
    assert.ok(north.mean[0] < plain.mean[0] - 10, `the season colour: ${String(north.mean)}`);
    assert.ok(north.mean[2] < plain.mean[2] - 10);
    assert.deepEqual(await measure(api, treeUri, { north: 0 }), plain);
    // The turn moves the tint map's place, which differs along u in the fixture.
    const turned = await measure(api, treeUri, { turn: 0.5 });
    assert.notDeepEqual(turned.mean, plain.mean, 'the turn shifts the tint');
    // Snow on a map tree whose normals point up.
    const treeSnow = await measure(api, treeUri, { turn: 0, snow: 1 });
    assert.ok(spread(plain) > 10, `the tree is coloured: ${String(plain.mean)}`);
    assert.ok(spread(treeSnow) <= 3, `full snow greys the tree: ${String(treeSnow.mean)}`);
    assert.deepEqual(await measure(api, treeUri, { snow: 0 }), plain);
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

    // The tint map, decoded through the playset: RGBA, top row first.
    const decoded = await treeMap(files, TREE_TINT);
    assert.ok(decoded.ok, `the tint map is read: ${decoded.ok ? '' : decoded.message}`);
    assert.deepEqual(
      [decoded.width, decoded.height, decoded.source, Array.from(decoded.rgba)],
      [2, 1, 'the game', [60, 120, 20, 255, 100, 150, 200, 255]],
    );
    assert.deepEqual(await treeMap(undefined, TREE_SEASON), {
      ok: false,
      message: 'no map/terrain/Tree_season.bmp in the playset',
    });
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
