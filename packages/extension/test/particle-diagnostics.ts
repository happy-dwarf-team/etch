// Particle warnings in a real VS Code (etch#631): an open `.asset` file's state events and an open
// `.gfx` file's pdxparticle types against the game folder that etch.gamePath names (no workspace
// folder is open in the test), as typed, and again after a saved `.gfx` file; the warnings of an
// open `.asset` file's particle blocks, against the game folder's particle shader and textures; and
// a hover on a key of a particle block.
import * as assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

const TIMEOUT_MS = 10000;

/** Waits until the Etch diagnostics of a file satisfy a condition. */
async function diagnosticsOf(
  uri: vscode.Uri,
  done: (diagnostics: vscode.Diagnostic[]) => boolean,
): Promise<vscode.Diagnostic[]> {
  const current = (): vscode.Diagnostic[] =>
    vscode.languages.getDiagnostics(uri).filter((d) => d.source === 'Etch');
  const deadline = Date.now() + TIMEOUT_MS;
  while (!done(current())) {
    if (Date.now() > deadline) {
      throw new Error(`diagnostics of ${uri.fsPath}: ${JSON.stringify(current())}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return current();
}

async function write(root: string, name: string, text: string): Promise<vscode.Uri> {
  const file = path.join(root, ...name.split('/'));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  return vscode.Uri.file(file);
}

const where = (d: vscode.Diagnostic): [unknown, number, number, number] => [
  d.code,
  d.range.start.line,
  d.range.start.character,
  d.range.end.character,
];

export async function testParticleDiagnostics(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'etch-particles-'));
  const game = path.join(root, 'game');
  const gfx = await write(
    game,
    'interface/etch_guns.gfx',
    'objectTypes = {\n' +
      '\tpdxparticle = { name = "etch_cannon" type = "etch_cannon_system" scale = 0.8 }\n' +
      '\tpdxparticle = { name = "etch_smoke" type = "etch_smoke_sytem" }\n' +
      '}\n',
  );
  await write(
    game,
    'gfx/particles/etch_particles.asset',
    'particle = { name = "etch_cannon_system" }\nparticle = { name = "etch_smoke_system" }\n',
  );
  const asset = await write(
    game,
    'gfx/entities/etch_guns.asset',
    'entity = { name = "etch_gun"\n' +
      '\tstate = { name = "idle"\n' +
      '\t\tevent = { time = 0 particle = "etch_cannon" }\n' +
      '\t\tevent = { time = 0.5 particle = "etch_cannon_system" }\n' +
      '\t}\n' +
      '}\n',
  );
  // An .asset file outside gfx/ is not one the game reads: no warnings.
  const elsewhere = await write(
    game,
    'common/etch_guns.asset',
    'entity = { name = "x" state = { name = "s" event = { particle = "nothing" } } }\n',
  );

  await write(
    game,
    'gfx/FX/particle.shader',
    'Effect ParticleAdditive\n{\n}\nEffect ParticleAlphaBlend\n{\n}\n',
  );
  await write(game, 'gfx/particles/etch_cloud.dds', 'not a texture, only its path is looked up');
  const effects = await write(
    game,
    'gfx/particles/etch_effects.asset',
    'particle = {\n' +
      '\tname = "etch_effect"\n' +
      '\tsubsystem = {\n' +
      '\t\tlifee = 1\n' +
      '\t\tsize = { 1,etch_grow }\n' +
      '\t\ttexture = { shader = "ParticleAdditive" file = "gfx/particles/etch_cloud.dds" }\n' +
      '\t}\n' +
      '\tsubsystem = { texture = { shader = "ParticleGlow" file = "gfx/particles/etch_none.dds" } }\n' +
      '}\n',
  );

  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  try {
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(asset));
    const onAsset = await diagnosticsOf(asset, (found) => found.length > 0);
    assert.deepEqual(onAsset.map(where), [['unknown-pdxparticle', 3, 34, 54]]);
    const [cannon] = onAsset;
    assert.ok(cannon);
    assert.equal(cannon.severity, vscode.DiagnosticSeverity.Warning);
    assert.match(
      cannon.message,
      /^No \.gfx file has a pdxparticle named "etch_cannon_system", so the game does not start this particle\. .* use the pdxparticle that starts it, "etch_cannon"\.$/,
    );

    const gfxDocument = await vscode.workspace.openTextDocument(gfx);
    const gfxEditor = await vscode.window.showTextDocument(gfxDocument);
    const onGfx = await diagnosticsOf(gfx, (found) => found.length > 0);
    assert.deepEqual(onGfx.map(where), [['unknown-particle-system', 2, 44, 62]]);

    // Fixing the typo as it is typed clears the warning.
    await gfxEditor.edit((edit) => {
      edit.replace(new vscode.Range(2, 44, 2, 62), '"etch_smoke_system"');
    });
    await diagnosticsOf(gfx, (found) => found.length === 0);

    // A pdxparticle of the system's own name, saved: the .asset file is checked again.
    await gfxEditor.edit((edit) => {
      edit.insert(
        new vscode.Position(3, 0),
        '\tpdxparticle = { name = "etch_cannon_system" type = "etch_cannon_system" }\n',
      );
    });
    assert.ok(await gfxDocument.save(), 'the .gfx file is saved');
    await diagnosticsOf(asset, (found) => found.length === 0);

    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(elsewhere));
    // Give the debounced check time to run before asserting nothing came.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.deepEqual(
      vscode.languages.getDiagnostics(elsewhere).filter((d) => d.source === 'Etch'),
      [],
    );

    // The particle blocks: an unknown key, a curve nothing defines, a shader effect the game
    // folder's particle.shader does not have, and a texture it does not have.
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(effects));
    const onEffects = await diagnosticsOf(effects, (found) => found.length >= 4);
    assert.deepEqual(onEffects.map(where), [
      ['unknown-particle-key', 3, 2, 7],
      ['unknown-particle-curve', 4, 13, 22],
      ['unknown-particle-shader', 7, 36, 50],
      ['missing-particle-texture', 7, 59, 86],
    ]);
    assert.equal(
      onEffects[3]?.message,
      'Texture gfx/particles/etch_none.dds is not in the playset, so the game has no picture for these particles.',
    );
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      effects,
      new vscode.Position(5, 4),
    );
    const texts = hovers.flatMap((h) =>
      h.contents.map((c) => (c instanceof vscode.MarkdownString ? c.value : '')),
    );
    assert.ok(
      texts.some((t) => t.startsWith('**`texture`** in a subsystem block')),
      JSON.stringify(texts),
    );
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    // Windows can still hold the folder of a file the editor just closed.
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
