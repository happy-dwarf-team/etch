// Sprite hovers and Go to Definition in `.gui` files end to end in a real VS Code: a fixture game
// (an `eu4.exe` that is not the game) set as `etch.gamePath`, two `.gfx` files where the later
// one redefines a sprite, and a `.gui` file that names sprites, one of them missing.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { dds, markdownOf, positionOf } from './asset-links.ts';

const FIRST_GFX = `spriteTypes = {
	spriteType = {
		name = "GFX_etch_badge"
		texturefile = "gfx/interface/etch_old.dds"
	}
}
`;

const SECOND_GFX = `spriteTypes = {
	spriteType = {
		name = "GFX_etch_badge"
		texturefile = "gfx//interface//etch_badge.tga"
	}
	spriteType = {
		name = "GFX_etch_strip"
		texturefile = "gfx/interface/etch_strip.dds"
		noOfFrames = 4
	}
}
`;

const GUI = `guiTypes = {
	windowType = {
		name = "etch_window"
		iconType = { name = "badge" spriteType = "GFX_etch_badge" }
		guiButtonType = { name = "strip" quadTextureSprite = "GFX_etch_strip" }
		iconType = { name = "lost" spriteType = "GFX_etch_nowhere" }
	}
}
`;

async function fixtureGame(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'etch-sprites-'));
  const files: Record<string, string | Uint8Array> = {
    'eu4.exe': 'not the game',
    'interface/a_etch.gfx': FIRST_GFX,
    'interface/b_etch.gfx': SECOND_GFX,
    'interface/etch.gui': GUI,
    'gfx/interface/etch_badge.dds': dds(48, 24, [0, 128, 255, 255]),
    'gfx/interface/etch_strip.dds': dds(64, 16, [255, 255, 255, 128]),
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, ...name.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
}

export async function testSpriteLinks(): Promise<void> {
  const game = await fixtureGame();
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  try {
    const gui = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(game, 'interface', 'etch.gui')),
    );
    const hover = (text: string): Thenable<vscode.Hover[]> =>
      vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        gui.uri,
        positionOf(gui, text),
      );

    const badge = markdownOf(await hover('GFX_etch_badge'));
    assert.match(badge, /\*\*GFX_etch_badge\*\* · spriteType/, 'the hover names the sprite');
    assert.match(
      badge,
      /Defined in `interface\/b_etch\.gfx` — the game \(defined 2 times; the last one wins\)/,
      'the definition the game draws, the last one',
    );
    assert.match(badge, /Texture `gfx\/interface\/etch_badge\.dds` — the game/, 'its texture');
    assert.match(badge, /48 × 24 · DDS BGRA8/, 'the facts');
    assert.match(badge, /!\[etch_badge\.dds\]\(data:image\/png;base64,/, 'and the thumbnail');

    const strip = markdownOf(await hover('GFX_etch_strip'));
    assert.match(strip, /· 4 frames/, 'a strip names its frames');
    assert.match(strip, /Frame 1 of 4:/, 'and shows the first');

    assert.equal(
      markdownOf(await hover('GFX_etch_nowhere')),
      '',
      'a missing sprite has no hover: its diagnostic says so',
    );

    const definitions = await vscode.commands.executeCommand<
      (vscode.Location | vscode.LocationLink)[]
    >('vscode.executeDefinitionProvider', gui.uri, positionOf(gui, 'GFX_etch_badge'));
    const targets = definitions.map((d) =>
      d instanceof vscode.Location
        ? [path.relative(game, d.uri.fsPath), d.range.start.line, d.range.start.character]
        : [path.relative(game, d.targetUri.fsPath), d.targetRange.start.line],
    );
    assert.deepEqual(
      targets,
      [[path.join('interface', 'b_etch.gfx'), 2, 10]],
      'Go to Definition opens the winning .gfx file at the name',
    );
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
