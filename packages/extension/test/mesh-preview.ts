// The mesh preview end to end in a real VS Code: a skinned `.mesh` with its diffuse, normal and
// specular textures and two `.anim` files beside it opens in Etch's custom editor; the webview
// parses and draws it with WebGL2, skips the collision shape, textures the part with all three
// maps and is offered only the animation that names the mesh's bones. A mesh in the game folder (`etch.gamePath`, a fixture) takes its texture
// through the playset, one without its texture is drawn untextured, and a file Etch cannot read is
// reported instead of shown. A `PdxMeshTextureAtlas` part reports its flag (the country colours
// until a tag is asked for), and a tag's flag comes from `gfx/flags` through the playset; a
// tag's colours come from the playset's `common/country_colors`, or from its flag as the game takes
// them, and fill the colour boxes of a PdxMeshColor part. A
// `PdxMeshAlphaBlendNoZWrite` part (a selection ring) is reported as blended, and a `PdxMeshSnow`
// part and a map tree as taking snow, and a map tree takes the playset's tint map. A mesh
// with levels of detail draws and counts only its most detailed level, and a mesh a playset's
// `mapobject_<n>` pdxmesh names is drawn as a map tree. What the shaders draw is read back from the
// canvas (`MeshPreviewApi.control`): the Maps button changes it, the country colours colour a
// white PdxMeshColor part and white sails, full snow greys a building and a tree whose normals point
// up, and a map tree's colour follows the Ground colour, the Season and North sliders and the Turn.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  ANIM,
  ANIM_THREE_JOINTS,
  binary,
  floats,
  ints,
  MESH,
  obj,
  strs,
} from '../../core/test/fixtures/pdx-asset.ts';
import type { EtchApi } from '../src/extension.ts';
import {
  countryColours,
  flagTexture,
  MESH_PREVIEW_VIEW_TYPE,
  treeMap,
  treePlace,
  treeSeasons,
  TREE_SEASON,
  TREE_TINT,
  type MeshShown,
} from '../src/mesh-preview.ts';
import type { MeshControls, MeshSummary } from '../src/mesh-protocol.ts';
import { linkedFiles } from '../src/script-profile-view.ts';
import { dds } from './asset-links.ts';

const COLD_TIMEOUT_MS = 30_000;

/** An uncompressed 32-bit TGA, top row first, of BGRA pixels. */
function tga(width: number, height: number, bgra: readonly number[][]): Uint8Array {
  const bytes = new Uint8Array(18 + width * height * 4);
  bytes[2] = 2;
  new DataView(bytes.buffer).setUint16(12, width, true);
  new DataView(bytes.buffer).setUint16(14, height, true);
  bytes[16] = 32;
  bytes[17] = 0x28;
  bgra.forEach((pixel, i) => {
    bytes.set(pixel, 18 + i * 4);
  });
  return bytes;
}

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
  const shown = await controlled(api, file, controls);
  assert.ok(shown.drawn !== undefined);
  return shown.drawn;
}

/** Sets the controls of the open preview of `file` and answers its summary with what is drawn. */
async function controlled(
  api: EtchApi,
  file: vscode.Uri,
  controls: MeshControls,
): Promise<MeshSummary> {
  const drawn = new Promise<MeshSummary>((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`no drawn colour of ${file.fsPath} within ${String(COLD_TIMEOUT_MS)} ms`));
    }, COLD_TIMEOUT_MS);
    const subscription = api.meshPreview.onDidShow((result) => {
      if (result.uri.toString() !== file.toString() || !result.ok) return;
      if (result.summary.drawn === undefined) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve(result.summary);
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
  // An animation of another skeleton, one joint more than the mesh's bones: the game plays it
  // only on a skeleton of as many bones, so it is not offered. Joint names do not count.
  await writeFile(path.join(folder, 'other.anim'), binary(ANIM_THREE_JOINTS));

  const shown = await open(api, mesh);
  assert.ok(shown.ok, `the mesh shows: ${shown.ok ? '' : shown.message}`);
  // The normal map (tilted along x) and the specular map's highlight change what is drawn.
  const allOnSummary = await controlled(api, mesh, {});
  assert.ok(allOnSummary.drawn !== undefined);
  const withMaps = allOnSummary.drawn;
  assert.ok(withMaps.pixels > 0, 'the mesh is drawn');
  // Each map on its own: Normal, Spec and Diffuse off each change it, and all on again draws as
  // before.
  const noNormalSummary = await controlled(api, mesh, { maps: { normal: false } });
  assert.ok(noNormalSummary.drawn !== undefined);
  const noNormal = noNormalSummary.drawn;
  assert.notDeepEqual(
    noNormal.mean,
    withMaps.mean,
    `Normal off: ${JSON.stringify(noNormalSummary)}, all on: ${JSON.stringify(allOnSummary)}`,
  );
  const noMaps = await measure(api, mesh, { maps: { specular: false } });
  assert.notDeepEqual(noMaps.mean, noNormal.mean, `Normal and Spec off: ${String(noMaps.mean)}`);
  const grey = await measure(api, mesh, { maps: { diffuse: false } });
  assert.notDeepEqual(grey.mean, noMaps.mean, `all off: ${String(grey.mean)}`);
  // The plain grey (0.72) is far lighter than the dark blue diffuse texture.
  assert.ok(
    grey.mean[0] > noMaps.mean[0] + 40,
    `grey without the diffuse map: ${String(grey.mean)}`,
  );
  const allOn = { maps: { diffuse: true, normal: true, specular: true } };
  assert.deepEqual(await measure(api, mesh, allOn), withMaps);
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
    maps: { diffuse: true, normal: true, specular: true },
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

  // A white quad drawn with the country colours: as a PdxMeshColor part whose specular map
  // masks the primary colour everywhere (R; the fixture DDS is BGRA) and gives no highlight (A),
  // and as sails whose stripes are the three colours.
  await writeFile(path.join(folder, 'white.dds'), dds(2, 2, [255, 255, 255, 255]));
  await writeFile(path.join(folder, 'primary_mask.dds'), dds(2, 2, [0, 0, 255, 0]));
  const white = (shader: string) =>
    binary(
      MESH.flatMap((item) => {
        if (!('name' in item)) return [item];
        if (item.name === 'shader' && item.values[0] === 'PdxMeshStandardSkinned') {
          return [strs('shader', shader)];
        }
        if (item.name === 'diff')
          return [strs('diff', 'white.dds'), strs('spec', 'primary_mask.dds')];
        return [item];
      }),
    );
  const coloured = vscode.Uri.file(path.join(folder, 'etch_coloured.mesh'));
  await writeFile(coloured.fsPath, white('PdxMeshColor'));
  assert.ok((await open(api, coloured)).ok, 'the coloured part shows');
  const red = await measure(api, coloured, { colours: { primary: '#ff0000' } });
  assert.ok(
    red.mean[0] > 4 * red.mean[1] && red.mean[0] > 4 * red.mean[2],
    `red primary: ${String(red.mean)}`,
  );
  const blue = await measure(api, coloured, { colours: { primary: '#0000ff' } });
  assert.ok(
    blue.mean[2] > 4 * blue.mean[0] && blue.mean[2] > 4 * blue.mean[1],
    `blue primary: ${String(blue.mean)}`,
  );
  // A region colour takes the tertiary colour's place only: the primary mask is not touched.
  assert.deepEqual(await measure(api, coloured, { region: '#ff0000' }), blue);
  // Without the specular map the masks go: the white quad is drawn white, not blue.
  const unmasked = await measure(api, coloured, { maps: { specular: false } });
  assert.ok(spread(unmasked) < 8, `no country colour without Spec: ${String(unmasked.mean)}`);
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  // The same quad with a specular map that masks the tertiary colour (B) everywhere.
  await writeFile(path.join(folder, 'tertiary_mask.dds'), dds(2, 2, [255, 0, 0, 0]));
  const third = vscode.Uri.file(path.join(folder, 'etch_third.mesh'));
  await writeFile(
    third.fsPath,
    binary(
      MESH.flatMap((item) => {
        if (!('name' in item)) return [item];
        if (item.name === 'shader' && item.values[0] === 'PdxMeshStandardSkinned') {
          return [strs('shader', 'PdxMeshColor')];
        }
        if (item.name === 'diff')
          return [strs('diff', 'white.dds'), strs('spec', 'tertiary_mask.dds')];
        return [item];
      }),
    ),
  );
  assert.ok((await open(api, third)).ok, 'the tertiary part shows');
  const tertiaryBlue = await measure(api, third, {
    region: null,
    colours: { tertiary: '#0000ff' },
  });
  assert.ok(
    tertiaryBlue.mean[2] > 4 * tertiaryBlue.mean[0],
    `blue tertiary: ${String(tertiaryBlue.mean)}`,
  );
  const regionRed = await controlled(api, third, { region: '#ff0000' });
  assert.equal(regionRed.region, '#ff0000', 'the region colour is shown');
  assert.ok(regionRed.drawn !== undefined);
  assert.ok(
    regionRed.drawn.mean[0] > 4 * regionRed.drawn.mean[2],
    `the region colour in the tertiary's place: ${String(regionRed.drawn.mean)}`,
  );
  const regionOff = await controlled(api, third, { region: null });
  assert.equal(regionOff.region, undefined, 'off: no region colour');
  assert.deepEqual(regionOff.drawn, tertiaryBlue);
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  const stripes = vscode.Uri.file(path.join(folder, 'etch_white_sails.mesh'));
  await writeFile(stripes.fsPath, white('PdxMeshTextureAtlas'));
  assert.ok((await open(api, stripes)).ok, 'the white sails show');
  const green = await measure(api, stripes, {
    colours: { primary: '#00ff00', secondary: '#00ff00', tertiary: '#00ff00' },
  });
  assert.ok(
    green.mean[1] > 4 * green.mean[0] && green.mean[1] > 4 * green.mean[2],
    `green stripes: ${String(green.mean)}`,
  );
  // A red region colour takes the flag's far half: red rises and green falls.
  const halfRed = await measure(api, stripes, { region: '#ff0000' });
  assert.ok(
    halfRed.mean[0] > green.mean[0] + 20 && halfRed.mean[1] < green.mean[1] - 20,
    `the far half red: ${String(halfRed.mean)}, ${String(green.mean)} without`,
  );
  assert.deepEqual(await measure(api, stripes, { region: null }), green);
  // Which half: with red, green and blue stripes, a black region colour leaves the red third
  // and half the green one (u under 0.5), so red stays and blue goes.
  const nearHalf = await measure(api, stripes, {
    region: '#000000',
    colours: { primary: '#ff0000', secondary: '#00ff00', tertiary: '#0000ff' },
  });
  assert.ok(
    nearHalf.mean[0] > 4 * nearHalf.mean[2],
    `the far half (u over 0.5) takes the region colour: ${String(nearHalf.mean)}`,
  );
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

  // A map tree's levels of detail: a quad at level 0 and a triangle at level 1, as two shapes
  // whose lod property gives the level, as vanilla's HighShape and LowShape do.
  const tree = vscode.Uri.file(path.join(folder, 'etch_tree.mesh'));
  const level = (name: string, lod: number, p: number[], tri: number[]) => [
    obj(2, name),
    ints('lod', lod),
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
      floats('loddist', 0, 30),
      ...level('HighShape', 0, [0, 0, 0, 2, 0, 0, 0, 1, 0, 2, 1, 0], [0, 2, 1, 1, 2, 3]),
      ...level('LowShape', 1, [0, 0, 0, 2, 0, 0, 0, 1, 0], [0, 2, 1]),
    ]),
  );
  const lod = await open(api, tree);
  assert.ok(lod.ok, `the tree shows: ${lod.ok ? '' : lod.message}`);
  assert.deepEqual(
    lod.summary.lod,
    { level: 0, levels: [0, 1], from: 0 },
    'level 0 of 0 and 1, from distance 0',
  );
  assert.deepEqual(
    [lod.summary.shapes, lod.summary.vertices, lod.summary.triangles],
    [1, 4, 2],
    'only level 0 is drawn and counted',
  );
  // LOD auto: the camera's distance to the mesh's origin picks the level by its loddist, as the
  // game picks it. The camera orbits the middle of the 2 x 1 quad, about a unit from the origin.
  const near = await controlled(api, tree, { lod: 'auto', distance: 5 });
  assert.deepEqual(near.lod, { level: 0, levels: [0, 1], from: 0, auto: true }, 'level 0 near');
  const far = await controlled(api, tree, { lod: 'auto', distance: 60 });
  assert.deepEqual(far.lod, { level: 1, levels: [0, 1], from: 30, auto: true }, 'level 1 past 30');
  assert.equal(far.triangles, 1, 'only level 1 is drawn and counted');
  // A level picked again leaves Auto.
  const picked = await controlled(api, tree, { lod: 0 });
  assert.deepEqual(picked.lod, { level: 0, levels: [0, 1], from: 0 }, 'level 0 picked');
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
  // FLG's flag: three blue pixels and one yellow (BGRA).
  const flagBlue = [147, 82, 0, 255];
  await writeFile(
    path.join(game, 'gfx', 'flags', 'FLG.tga'),
    tga(2, 2, [flagBlue, flagBlue, [0, 204, 254, 255], flagBlue]),
  );
  // The countries, and the colours of two of them: ETC's color1 only.
  await mkdir(path.join(game, 'common', 'country_tags'), { recursive: true });
  await writeFile(
    path.join(game, 'common', 'country_tags', '00_countries.txt'),
    'ABC = "countries/Abc.txt"\nETC = "countries/Etc.txt"\nFLG = "countries/Flg.txt"\n',
  );
  await mkdir(path.join(game, 'common', 'country_colors'));
  await writeFile(
    path.join(game, 'common', 'country_colors', '00_country_colors.txt'),
    [
      'ABC = {',
      '  color1 = { 10 20 30 }',
      '  color2 = { 40 50 60 }',
      '  color3 = { 70 80 90 }',
      '}',
      'ETC = { color1 = { 255 0 0 } }',
      '',
    ].join('\n'),
  );
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
  // The seasons: four map seasons and eight tree blocks of the fixture's own; 1 July falls in
  // summer and in tree_summer2 (column 5).
  await writeFile(
    path.join(game, 'map', 'seasons.txt'),
    [
      'winter = { start_date = 00.12.01 end_date = 00.02.28 }',
      'spring = { start_date = 00.04.01 end_date = 00.05.15 }',
      'summer = { start_date = 00.06.01 end_date = 00.08.31 }',
      'autumn = { start_date = 00.10.01 end_date = 00.10.31 }',
      'tree_winter = { start_date = 00.11.20 end_date = 00.11.30 }',
      'tree_winter2 = { start_date = 00.12.20 end_date = 00.01.10 }',
      'tree_spring = { start_date = 00.02.01 end_date = 00.02.10 }',
      'tree_spring2 = { start_date = 00.03.01 end_date = 00.04.10 }',
      'tree_summer = { start_date = 00.05.01 end_date = 00.05.31 }',
      'tree_summer2 = { start_date = 00.06.10 end_date = 00.09.01 }',
      'tree_autumn = { start_date = 00.10.01 end_date = 00.10.10 }',
      'tree_autumn2 = { start_date = 00.10.21 end_date = 00.11.01 }',
      '',
    ].join('\n'),
  );
  // A map of 64 x 32 with two provinces, one in the far north and one in the south, and a colour
  // map of one colour per map season (BGRA).
  await writeFile(
    path.join(game, 'map', 'default.map'),
    'width = 64\nheight = 32\npositions = "positions.txt"\n',
  );
  await writeFile(
    path.join(game, 'map', 'positions.txt'),
    '1 = { position = { 10.000 30.000 11.000 29.000 } }\n2 = { position = { 40.000 4.000 } }\n',
  );
  const colourMaps = {
    winter: [200, 100, 50, 255],
    spring: [0, 200, 0, 255],
    summer: [40, 40, 200, 255],
    autumn: [0, 160, 240, 255],
  };
  for (const [season, bgra] of Object.entries(colourMaps)) {
    await writeFile(path.join(game, 'map', 'terrain', `colormap_${season}.dds`), dds(2, 2, bgra));
  }
  // Summer's colour map is 1 x 8, red in its top half and blue in its bottom half. Province 1, at
  // y 30 of 32, is read at v = 1.5 / 32, 1 / 8 of a texel above row 0's centre: seven eighths of
  // row 0 and, the map repeating, one eighth of row 7.
  const summer = dds(1, 8, colourMaps.summer);
  for (let row = 4; row < 8; row++) summer.set([255, 0, 0, 255], 128 + row * 4);
  await writeFile(path.join(game, 'map', 'terrain', 'colormap_summer.dds'), summer);
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
      { source: 'the game', seasons: 'the game', day: 181, value: 5, north: 0 },
      "a map tree takes the playset's season map and tree seasons, 1 July, North at 0",
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
    // North 1 adds the season map's texel less grey. On 20 November (tree_winter, column 0) the
    // fixture's map is below grey in red and blue; on 1 May (tree_summer, column 4) it takes more
    // of the second texel, whose blue is above grey. North 0 changes nothing.
    const north = await measure(api, treeUri, { day: 323, north: 1 });
    assert.ok(north.mean[0] < plain.mean[0] - 10, `the season colour: ${String(north.mean)}`);
    assert.ok(north.mean[2] < plain.mean[2] - 10);
    const summer = await measure(api, treeUri, { day: 120 });
    assert.ok(
      summer.mean[2] > north.mean[2] + 10,
      `the date moves the column: ${String(summer.mean)} on 1 May, ${String(north.mean)} on 20 November`,
    );
    assert.deepEqual(await measure(api, treeUri, { north: 0 }), plain);
    // A place gives Ground and North: province 1 lies in the far north (North 1), and on 1 July
    // (summer) summer's colour map gives mostly its red there (175, 35, 66.875). The tree is drawn
    // as with those set by hand.
    const byHand = await measure(api, treeUri, { day: 181, ground: '#af2343', north: 1 });
    const placed = await controlled(api, treeUri, { day: 181, place: 1 });
    assert.deepEqual(placed.place, {
      province: 1,
      source: 'the game',
      ground: '#af2343',
      north: 1,
    });
    assert.equal(placed.ground, '#af2343', 'Ground follows the place');
    // Within 2 of the mean colour: the place's line in the list of facts can wrap the bar, and
    // the smaller canvas has fewer edge pixels.
    const close = (a: readonly number[] | undefined, b: readonly number[]): boolean =>
      a !== undefined && b.every((v, k) => Math.abs((a[k] ?? 0) - v) <= 2);
    assert.ok(
      close(placed.drawn?.mean, byHand.mean),
      `drawn as with Ground and North set by hand: ${String(placed.drawn?.mean)}, ${String(byHand.mean)}`,
    );
    assert.notDeepEqual(byHand, plain);
    // 16 September: 16 days into the 31 between summer and autumn.
    const september = await controlled(api, treeUri, { day: 258 });
    assert.equal(september.place?.ground, '#d16420', 'the date mixes the next colour map in');
    // A province without a position gives no place and is named.
    const nowhere = await controlled(api, treeUri, { place: 99 });
    assert.equal(nowhere.place, undefined, 'no place without a position');
    // Province 2 lies in the south: North 0.
    const south = await controlled(api, treeUri, { place: 2 });
    assert.equal(south.place?.north, 0);
    // An empty box clears the place; Ground and North given with it are the user's again.
    const cleared = await controlled(api, treeUri, {
      place: null,
      day: 181,
      ground: '#808080',
      north: 0,
    });
    assert.equal(cleared.place, undefined);
    assert.ok(
      close(cleared.drawn?.mean, plain.mean),
      `the tree is drawn as before the place: ${String(cleared.drawn?.mean)}`,
    );
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

    // A tag's colours: common/country_colors, the rest from its .tga flag; not known without.
    const colourFile = 'common/country_colors/00_country_colors.txt';
    assert.deepEqual(await countryColours('ABC', files), {
      ok: true,
      colours: ['#0a141e', '#28323c', '#46505a'],
      from: [colourFile, colourFile, colourFile],
    });
    assert.deepEqual(await countryColours('FLG', files), {
      ok: true,
      colours: ['#105090', '#f0d010', '#105090'],
      from: ['the flag', 'the flag', 'the flag'],
    });
    assert.deepEqual(await countryColours('ETC', files), {
      ok: false,
      message:
        'colours not known: common/country_colors gives ETC no color2, color3, and there is no gfx/flags/ETC.tga in the playset',
    });
    assert.deepEqual(await countryColours('XYZ', files), {
      ok: false,
      message: "colours not known: the playset's common/country_tags has no XYZ",
    });
    assert.deepEqual(await countryColours('ABC', undefined), {
      ok: false,
      message: 'the colours come from the playset: set etch.gamePath',
    });

    // The Country box fills the colour boxes of a PdxMeshColor part with the tag's colours.
    assert.ok((await open(api, coloured)).ok, 'the coloured part shows again');
    const abc = await controlled(api, coloured, { tag: 'abc' });
    assert.deepEqual(abc.country, {
      tag: 'ABC',
      colours: ['#0a141e', '#28323c', '#46505a'],
    });
    // The webview's answer comes as JSON, which leaves out a tag that is undefined.
    const handSet = await controlled(api, coloured, { colours: { secondary: '#ffffff' } });
    assert.deepEqual(
      handSet.country,
      { colours: ['#0a141e', '#ffffff', '#46505a'] },
      "a colour set by hand is no longer the tag's",
    );
    const unknown = await controlled(api, coloured, { tag: 'ETC' });
    assert.deepEqual(
      unknown.country,
      { colours: ['#0a141e', '#ffffff', '#46505a'] },
      'a tag whose colours are not known leaves the colour boxes as they were',
    );
    const flg = await controlled(api, coloured, { tag: 'FLG' });
    assert.deepEqual(flg.country?.colours, ['#105090', '#f0d010', '#105090']);
    assert.ok(
      (flg.drawn?.mean[2] ?? 0) > 2 * (flg.drawn?.mean[0] ?? 0),
      `the flag's blue primary colour is drawn: ${String(flg.drawn?.mean)}`,
    );
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

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
    // The tree seasons, read through the playset: days of the year by column.
    const seasons = await treeSeasons(files);
    assert.ok(seasons.ok, `the tree seasons are read: ${seasons.ok ? '' : seasons.message}`);
    assert.deepEqual(
      [seasons.source, seasons.problems, seasons.spans.length, seasons.spans[1]],
      ['the game', [], 8, { start: 353, end: 9 }],
    );
    assert.ok(seasons.ok);
    assert.deepEqual(seasons.mapSpans[0], { start: 334, end: 58 }, 'winter over the year end');
    // A place, through the playset: the province's position, each colour map's colour there,
    // North from how far north it is.
    assert.deepEqual(await treePlace(1, files), {
      ok: true,
      province: 1,
      x: 10,
      y: 30,
      colours: [
        [50, 100, 200],
        [0, 200, 0],
        [175, 35, 66.875],
        [240, 160, 0],
      ],
      north: 1,
      source: 'the game',
    });
    const southern = await treePlace(2, files);
    assert.ok(southern.ok && southern.north === 0, 'the south takes no season colour');
    assert.deepEqual(await treePlace(99, files), {
      ok: false,
      message: 'map/positions.txt: no position for province 99',
    });
    assert.deepEqual(await treePlace(1, undefined), {
      ok: false,
      message: 'a place comes from the playset: set etch.gamePath',
    });
    assert.deepEqual(await treeSeasons(undefined), {
      ok: false,
      message: 'no map/seasons.txt in the playset',
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
