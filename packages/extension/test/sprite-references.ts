// Find All References and Rename Symbol on sprite names end to end in a real VS Code: a fixture
// game (an `eu4.exe` that is not the game) set as `etch.gamePath`, with a `.gfx` file, a `.gui`
// file, an event and a mission that name one sprite. The tests open no workspace folder, so every
// file is the game's: references find them all, and a rename is refused.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { positionOf } from './asset-links.ts';
import { spriteDocumentPath } from '../src/sprite-references.ts';

const GFX = `spriteTypes = {
	spriteType = {
		name = "GFX_etch_medal"
		texturefile = "gfx/interface/etch_medal.dds"
	}
}
`;

const GUI = `guiTypes = {
	windowType = {
		name = "etch_window"
		iconType = { name = "medal" spriteType = "GFX_etch_medal" }
		iconType = { name = "GFX_etch_medal_label" spriteType = "GFX_etch_other" }
	}
}
`;

const EVENTS = `namespace = etch
country_event = {
	id = etch.1
	picture = gfx_etch_MEDAL
}
`;

const MISSIONS = `etch_series = {
	slot = 1
	etch_mission = {
		icon = GFX_etch_medal
	}
}
`;

async function fixtureGame(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'etch-sprite-refs-'));
  const files: Record<string, string> = {
    'eu4.exe': 'not the game',
    'interface/etch.gfx': GFX,
    'interface/etch.gui': GUI,
    'events/etch.txt': EVENTS,
    'missions/etch.txt': MISSIONS,
    // A file that does not name sprites.
    'common/ideas/etch.txt': 'etch_ideas = { start = { picture = GFX_etch_medal } }\n',
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, ...name.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
}

export async function testSpriteReferences(): Promise<void> {
  assert.deepEqual(
    [
      'C:\\mods\\etch\\interface\\sub\\etch.gfx',
      '/mods/etch/Interface/etch.gui',
      '/mods/etch/events/etch.txt',
      '/mods/etch/gfx/etch.gfx',
    ].map(spriteDocumentPath),
    ['interface/sub/etch.gfx', 'Interface/etch.gui', 'events/etch.txt', undefined],
    "a document's game path comes from its folders",
  );
  const game = await fixtureGame();
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  try {
    const gui = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(game, 'interface', 'etch.gui')),
    );
    const at = positionOf(gui, 'GFX_etch_medal"');
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      gui.uri,
      at,
    );
    const shown = locations
      .map((l) => [
        path.relative(game, l.uri.fsPath).replace(/\\/g, '/'),
        l.range.start.line,
        l.range.start.character,
        l.range.end.character,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    assert.deepEqual(
      shown,
      [
        ['events/etch.txt', 3, 11, 25],
        ['interface/etch.gfx', 2, 10, 24],
        ['interface/etch.gui', 3, 44, 58],
        ['missions/etch.txt', 3, 9, 23],
      ],
      "every place the playset writes the sprite, the definition included, case aside; not a widget's name nor a file that names no sprites",
    );

    const gfx = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(game, 'interface', 'etch.gfx')),
    );
    const fromDefinition = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      gfx.uri,
      positionOf(gfx, 'GFX_etch_medal'),
    );
    assert.equal(fromDefinition.length, 4, 'the same from the definition');

    await assert.rejects(
      Promise.resolve(
        vscode.commands.executeCommand(
          'vscode.executeDocumentRenameProvider',
          gui.uri,
          at,
          'GFX_etch_award',
        ),
      ),
      /Not renamed: GFX_etch_medal is also named where Etch does not change it/,
      "a rename never changes the game's files",
    );
    await assert.rejects(
      Promise.resolve(
        vscode.commands.executeCommand(
          'vscode.executeDocumentRenameProvider',
          gui.uri,
          positionOf(gui, 'etch_window'),
          'x',
        ),
      ),
      /Etch renames sprite names/,
      'a rename needs a sprite name under the cursor',
    );

    // The setting takes the providers away, and gives them back.
    const count = async (): Promise<number> =>
      (
        await vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeReferenceProvider',
          gui.uri,
          at,
        )
      ).length;
    // The change event may come a moment after the update: up to 2 s.
    const settled = async (expected: number): Promise<number> => {
      let seen = await count();
      for (let i = 0; i < 20 && seen !== expected; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        seen = await count();
      }
      return seen;
    };
    await settings.update('editor.rename', false, vscode.ConfigurationTarget.Global);
    assert.equal(await settled(0), 0, 'the setting turns it off');
    await settings.update('editor.rename', undefined, vscode.ConfigurationTarget.Global);
    assert.equal(await settled(4), 4, 'and on again');
  } finally {
    await settings.update('editor.rename', undefined, vscode.ConfigurationTarget.Global);
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
