// The entity preview end to end in a real VS Code: in a fixture game folder (`etch.gamePath`), an
// `.asset` file's entity names a `.gfx` pdxmesh (the skinned fixture quad), plays a state through
// the pdxmesh's animation id, and carries a second entity on its `tip` bone; a clone of it
// replaces the attachment group. The CodeLens names each entity, and the webview reports the
// meshes it drew, the states and what it could not resolve, a particle no `.asset` file defines
// among it. The attached entity is drawn: its red texture reddens what the preview draws, which the
// webview reads back from its canvas (`EntityPreviewApi.control`).
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ANIM, binary, MESH, strs } from '../../core/test/fixtures/pdx-asset.ts';
import type { EtchApi } from '../src/extension.ts';
import { PREVIEW_ENTITY_COMMAND, type EntityShown } from '../src/entity-preview.ts';
import { dds } from './asset-links.ts';

const COLD_TIMEOUT_MS = 30_000;

const GFX = `objectTypes = {
  pdxmesh = {
    name = "etch_flag_mesh"
    file = "gfx/models/etch/etch_flag.mesh"
    animation = { id = "idle" type = "etch_wave_animation" }
    scale = 0.5
  }
  pdxmesh = { name = "etch_knob_mesh" file = "gfx/models/etch/etch_knob.mesh" scale = 0.5 }
}
`;

const ASSET = `entity = {
  name = "etch_flag"
  pdxmesh = "etch_flag_mesh"
  state = { name = "idle" animation = "idle" event = { time = 0.5 node = "tip" particle = "etch_sparks" } }
  state = { name = "walk" animation = "walk" event = { particle = "etch_dust" } }
  attach = { name = "top" tip = "etch_knob" }
}

entity = {
  clone = "etch_flag"
  name = "etch_flag_bare"
  attach = { name = "top" tip = "etch_missing" }
}

entity = { name = "etch_knob" pdxmesh = "etch_knob_mesh" }

animation = { name = "etch_wave_animation" file = "etch_wave.anim" }
`;

// The particle systems: etch_sparks only, so the walk state's etch_dust is defined nowhere.
const PARTICLES = `particle = { name = "etch_sparks" subsystem = { max_amount = 10 } }
`;

type Drawn = NonNullable<Extract<EntityShown, { ok: true }>['summary']['drawn']>;

/** The colour the open preview of an entity draws, read back after a frame. */
async function measure(api: EtchApi, uri: vscode.Uri, name: string): Promise<Drawn> {
  const drawn = new Promise<Drawn>((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`no drawn colour of ${name} within ${String(COLD_TIMEOUT_MS)} ms`));
    }, COLD_TIMEOUT_MS);
    const subscription = api.entityPreview.onDidShow((result) => {
      if (result.name !== name || !result.ok || result.summary.drawn === undefined) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve(result.summary.drawn);
    });
  });
  assert.ok(await api.entityPreview.control(uri, name, {}), `a preview of ${name} is open`);
  return drawn;
}

function open(api: EtchApi, uri: vscode.Uri, name: string): Promise<EntityShown> {
  const shown = new Promise<EntityShown>((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`no entity preview of ${name} within ${String(COLD_TIMEOUT_MS)} ms`));
    }, COLD_TIMEOUT_MS);
    const subscription = api.entityPreview.onDidShow((result) => {
      if (result.name !== name) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve(result);
    });
  });
  void vscode.commands.executeCommand(PREVIEW_ENTITY_COMMAND, uri, name);
  return shown;
}

export async function testEntityPreview(api: EtchApi): Promise<void> {
  const game = await mkdtemp(path.join(tmpdir(), 'etch-entity-game-'));
  const models = path.join(game, 'gfx', 'models', 'etch');
  const entities = path.join(game, 'gfx', 'entities');
  await mkdir(models, { recursive: true });
  await mkdir(entities, { recursive: true });
  await mkdir(path.join(game, 'interface'), { recursive: true });
  await writeFile(path.join(game, 'eu4.exe'), 'not the game');
  await writeFile(path.join(game, 'interface', 'etch_units.gfx'), GFX);
  await writeFile(path.join(models, 'etch_flag.mesh'), binary(MESH));
  // The knob: the fixture quad with a red texture of its own.
  await writeFile(
    path.join(models, 'etch_knob.mesh'),
    binary(
      MESH.map((item) =>
        'name' in item && item.name === 'diff' ? strs('diff', 'knob_diffuse.dds') : item,
      ),
    ),
  );
  await writeFile(path.join(models, 'knob_diffuse.dds'), dds(2, 2, [0, 0, 255, 255]));
  await writeFile(path.join(models, 'flag_diffuse.dds'), dds(2, 2, [30, 20, 10, 255]));
  await writeFile(path.join(entities, 'etch_wave.anim'), binary(ANIM));
  await mkdir(path.join(game, 'gfx', 'particles'));
  await writeFile(path.join(game, 'gfx', 'particles', 'etch_sparks.asset'), PARTICLES);
  const asset = vscode.Uri.file(path.join(entities, 'etch_units.asset'));
  await writeFile(asset.fsPath, ASSET);

  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  try {
    const document = await vscode.workspace.openTextDocument(asset);
    await vscode.window.showTextDocument(document);
    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      asset,
    );
    assert.deepEqual(
      lenses
        .filter((lens) => lens.command?.command === PREVIEW_ENTITY_COMMAND)
        .map((lens) => [lens.range.start.line, String(lens.command?.arguments?.[1])]),
      [
        [0, 'etch_flag'],
        [8, 'etch_flag_bare'],
        [14, 'etch_knob'],
      ],
      'a lens above each entity',
    );

    const shown = await open(api, asset, 'etch_flag');
    assert.ok(shown.ok, `the entity shows: ${shown.ok ? '' : shown.message}`);
    assert.deepEqual(shown.summary.entity, {
      name: 'etch_flag',
      nodes: ['etch_flag', 'etch_knob on tip'],
      states: ['idle', 'walk'],
      state: 'idle',
      problems: [
        'etch_flag: state walk: no particle "etch_dust" in the .asset files',
        'etch_flag: state walk: pdxmesh "etch_flag_mesh" has no animation id "walk"',
      ],
      // The idle state's particle event, named since particles are not drawn.
      particles: ['etch_flag: etch_sparks on tip at 0.5 s'],
    });
    assert.equal(shown.summary.shapes, 2, 'the flag and the knob, collision shapes apart');
    assert.equal(shown.summary.textured, 2, 'both textured through the playset');
    const knobbed = await measure(api, asset, 'etch_flag');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

    const bare = await open(api, asset, 'etch_flag_bare');
    assert.ok(bare.ok, `the clone shows: ${bare.ok ? '' : bare.message}`);
    assert.deepEqual(bare.summary.entity?.nodes, ['etch_flag_bare'], 'its group replaced the knob');
    assert.ok(
      bare.summary.entity.problems.includes(
        'etch_flag_bare: no entity "etch_missing" to attach to tip',
      ),
      `the missing attachment is named: ${JSON.stringify(bare.summary.entity.problems)}`,
    );
    // Without the knob only the flag's dark blue-grey texture is drawn.
    const plain = await measure(api, asset, 'etch_flag_bare');
    assert.ok(
      knobbed.mean[0] > plain.mean[0] + 15 && knobbed.mean[0] > knobbed.mean[2],
      `the red knob is drawn: ${String(knobbed.mean)} with it, ${String(plain.mean)} without`,
    );
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
