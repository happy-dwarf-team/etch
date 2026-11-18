// Links and hovers on asset paths end to end in a real VS Code: a fixture game in a temp folder
// (an `eu4.exe` that is not the game) set as `etch.gamePath`, one `.gfx` file that names a
// texture, a pdxmesh with a texture beside its mesh, and an `.asset` file that names an
// animation beside it.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

/** An A8R8G8B8 DDS file of one colour, without a mip chain. */
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

const GFX = `spriteTypes = {
	spriteType = {
		name = "GFX_etch_badge"
		texturefile = "gfx//interface//etch_badge.tga"
	}
	spriteType = {
		name = "GFX_etch_missing"
		texturefile = "gfx//interface//etch_missing.dds"
	}
}
objectTypes = {
	pdxmesh = {
		name = "etch_tower_mesh"
		file = "gfx/models/etch/etch_tower.mesh"
		meshsettings = {
			texture_diffuse = "etch_tower_diffuse.dds"
		}
	}
}
`;

const ASSET = `animation = {
	name = "etch_tower_idle"
	file = "etch_tower_idle.anim"
}
`;

async function fixtureGame(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'etch-assets-'));
  const files: Record<string, string | Uint8Array> = {
    'eu4.exe': 'not the game',
    'interface/etch_assets.gfx': GFX,
    // The .tga the sprite names exists only as .dds, as for 584 vanilla sprites.
    'gfx/interface/etch_badge.dds': dds(48, 24, [0, 128, 255, 255]),
    'gfx/models/etch/etch_tower.mesh': '@@b@',
    'gfx/models/etch/etch_tower_diffuse.dds': dds(8, 8, [255, 0, 0, 255]),
    'gfx/models/etch/etch_tower_idle.anim': '@@b@',
    'gfx/models/etch/etch_tower.asset': ASSET,
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, ...name.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
}

function markdownOf(hovers: vscode.Hover[]): string {
  return hovers
    .flatMap((hover) => hover.contents)
    .map((content) =>
      content instanceof vscode.MarkdownString
        ? content.value
        : typeof content === 'string'
          ? content
          : '',
    )
    .join('\n');
}

function positionOf(document: vscode.TextDocument, text: string): vscode.Position {
  const offset = document.getText().indexOf(text);
  assert.ok(offset >= 0, `the fixture has ${text}`);
  return document.positionAt(offset + 2);
}

export async function testAssetLinks(): Promise<void> {
  const game = await fixtureGame();
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  try {
    const gfx = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(game, 'interface', 'etch_assets.gfx')),
    );
    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      'vscode.executeLinkProvider',
      gfx.uri,
      10,
    );
    const targets = links.map((link) => [
      gfx.getText(link.range),
      link.target === undefined ? undefined : path.relative(game, link.target.fsPath),
    ]);
    assert.deepEqual(
      targets,
      [
        ['gfx//interface//etch_badge.tga', path.join('gfx', 'interface', 'etch_badge.dds')],
        ['gfx/models/etch/etch_tower.mesh', path.join('gfx', 'models', 'etch', 'etch_tower.mesh')],
        ['etch_tower_diffuse.dds', path.join('gfx', 'models', 'etch', 'etch_tower_diffuse.dds')],
      ],
      'every path the playset resolves links to its file, a .tga to its .dds; a missing one does not',
    );

    const badge = markdownOf(
      await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        gfx.uri,
        positionOf(gfx, 'gfx//interface//etch_badge.tga'),
      ),
    );
    assert.match(badge, /`gfx\/interface\/etch_badge\.dds` — the game/, 'the hover names the file');
    assert.match(
      badge,
      /!\[etch_badge\.dds\]\(data:image\/png;base64,[A-Za-z0-9+/=]+\)/,
      'and shows it',
    );
    assert.match(badge, /48 × 24 · DDS BGRA8 · no mip chain · opaque/, 'with its facts');

    const missing = markdownOf(
      await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        gfx.uri,
        positionOf(gfx, 'gfx//interface//etch_missing.dds'),
      ),
    );
    assert.match(missing, /Not in the playset/, 'a missing texture is named');

    const asset = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(game, 'gfx', 'models', 'etch', 'etch_tower.asset')),
    );
    const assetLinks = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      'vscode.executeLinkProvider',
      asset.uri,
      10,
    );
    assert.deepEqual(
      assetLinks.map((link) => link.target && path.relative(game, link.target.fsPath)),
      [path.join('gfx', 'models', 'etch', 'etch_tower_idle.anim')],
      'a bare animation name links to the file beside the .asset file',
    );
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
