// Sprite hovers and Go to Definition in `.gui` and script files end to end in a real VS Code: a
// fixture game (an `eu4.exe` that is not the game) set as `etch.gamePath`, two `.gfx` files where
// the later one redefines a sprite, a `.gui` file that names sprites, one of them missing, and an
// event, a mission and an estate privilege that name sprites; then the gutter thumbnails.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { dds, markdownOf, positionOf } from './asset-links.ts';
import type { EtchApi } from '../src/extension.ts';
import { spriteScriptPath } from '../src/sprite-links.ts';

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
	spriteType = {
		name = "ETCH_HARBOUR_eventPicture"
		texturefile = "gfx/event_pictures/etch_harbour.dds"
	}
	spriteType = {
		name = "mission_etch_fleet"
		texturefile = "gfx/interface/etch_badge.dds"
	}
}
`;

const EVENTS = `namespace = etch
country_event = {
	id = etch.1
	picture = ETCH_HARBOUR_eventPicture
}
country_event = {
	id = etch.2
	picture = ETCH_LOST_eventPicture
}
`;

const MISSIONS = `etch_series = {
	slot = 1
	etch_fleet_mission = {
		icon = mission_etch_fleet
	}
}
`;

const PRIVILEGES = `estate_etch_privilege = {
	icon = GFX_etch_strip
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
    'events/etch.txt': EVENTS,
    'missions/etch_missions.txt': MISSIONS,
    'common/estate_privileges/etch.txt': PRIVILEGES,
    'gfx/event_pictures/etch_harbour.dds': dds(90, 60, [200, 120, 40, 255]),
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

export async function testSpriteLinks(api: EtchApi): Promise<void> {
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

    assert.deepEqual(
      [
        'C:\\mods\\Etch\\Events\\etch.txt',
        '/mods/missions/events/etch_missions.txt',
        '/mods/etch/common/estate_privileges/sub/etch.txt',
        '/mods/etch/common/estates/etch.txt',
        '/mods/etch/common/holy_orders/etch.txt',
        '/mods/etch/events/etch.yml',
      ].map(spriteScriptPath),
      [
        'Events/etch.txt',
        'events/etch_missions.txt',
        'common/estate_privileges/sub/etch.txt',
        undefined,
        'common/holy_orders/etch.txt',
        undefined,
      ],
      "a script file's game path comes from its last sprite folder",
    );

    const open = (name: string): Thenable<vscode.TextDocument> =>
      vscode.workspace.openTextDocument(vscode.Uri.file(path.join(game, ...name.split('/'))));
    const hoverIn = async (document: vscode.TextDocument, text: string): Promise<string> =>
      markdownOf(
        await vscode.commands.executeCommand<vscode.Hover[]>(
          'vscode.executeHoverProvider',
          document.uri,
          positionOf(document, text),
        ),
      );
    const events = await open('events/etch.txt');
    const picture = await hoverIn(events, 'ETCH_HARBOUR_eventPicture');
    assert.match(picture, /\*\*ETCH_HARBOUR_eventPicture\*\* · spriteType/, "an event's picture");
    assert.match(picture, /90 × 60 · DDS BGRA8/, 'with its texture');
    assert.match(
      await hoverIn(events, 'ETCH_LOST_eventPicture'),
      /\*\*ETCH_LOST_eventPicture\*\* · no sprite of that name in the playset's `\.gfx` files\. Etch does not read the DLC archives/,
      'a missing picture says so, as a script file has no diagnostic for it',
    );
    assert.match(
      await hoverIn(await open('missions/etch_missions.txt'), 'mission_etch_fleet'),
      /\*\*mission_etch_fleet\*\* · spriteType/,
      "a mission's icon",
    );
    const privileges = await open('common/estate_privileges/etch.txt');
    assert.match(
      await hoverIn(privileges, 'GFX_etch_strip'),
      /Frame 1 of 4:/,
      "an estate privilege's icon",
    );
    const scriptDefinitions = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeDefinitionProvider',
      events.uri,
      positionOf(events, 'ETCH_HARBOUR_eventPicture'),
    );
    assert.deepEqual(
      scriptDefinitions.map((d) => [
        path.relative(game, d.uri.fsPath),
        d.range.start.line,
        d.range.start.character,
      ]),
      [[path.join('interface', 'b_etch.gfx'), 11, 10]],
      "Go to Definition opens the picture's .gfx file at the name",
    );

    // Gutter thumbnails: off by default, then one PNG per line that names a sprite with a texture.
    assert.deepEqual(await api.spriteGutter.icons(gui), [], 'the thumbnails are off by default');
    await settings.update('editor.spriteThumbnails', true, vscode.ConfigurationTarget.Global);
    const icons = await api.spriteGutter.icons(gui);
    assert.deepEqual(
      icons.map((i) => i.line),
      [3, 4],
      'a thumbnail on the badge and the strip lines, none for the missing sprite',
    );
    const [first, second] = icons;
    assert.ok(first !== undefined && second !== undefined);
    assert.notEqual(first.file, second.file, 'each texture has its own PNG');
    const png = await readFile(first.file);
    assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG', 'a PNG file');
    assert.equal(png.readUInt32BE(16), 32, 'the 48 × 24 badge at 32 pixels wide');
    assert.deepEqual(
      (await api.spriteGutter.icons(events)).map((i) => i.line),
      [3],
      "an event's picture, not the lost one",
    );
    assert.equal(
      (await api.spriteGutter.icons(await open('missions/etch_missions.txt')))[0]?.file,
      first.file,
      'the same texture shares its PNG',
    );
  } finally {
    await settings.update('editor.spriteThumbnails', undefined, vscode.ConfigurationTarget.Global);
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
