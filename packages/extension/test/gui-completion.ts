// Completion in `.gui` files end to end in a real VS Code: a fixture game (an `eu4.exe` that is
// not the game) set as `etch.gamePath`, with a `.gfx` file of two sprites and a font, a `.gui`
// file the vocabulary comes from, and a `.gui` file with gaps where the test asks for completion.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { dds } from './asset-links.ts';

const GFX = `spriteTypes = {
	spriteType = {
		name = "GFX_etch_badge"
		texturefile = "gfx/interface/etch_badge.dds"
	}
	spriteType = {
		name = "GFX_etch_strip"
		texturefile = "gfx/interface/etch_badge.dds"
		noOfFrames = 2
	}
}
bitmapfonts = {
	bitmapfont = { name = "etch_font" path = "gfx/fonts/etch_font" }
}
`;

/** Where the vocabulary comes from. */
const SOURCE = `guiTypes = {
	windowType = {
		name = "source"
		position = { x = 0 y = 0 }
		iconType = { name = "a" spriteType = "GFX_etch_badge" alwaysTransparent = yes Orientation = "UPPER_LEFT" }
		iconType = { name = "b" spriteType = "GFX_etch_strip" alwaysTransparent = yes }
		instantTextBoxType = { name = "t" font = "etch_font" format = centre }
	}
}
`;

/** `|` marks where the test asks; the marks are taken out before the file is written. */
const EDITED = `guiTypes = {
	windowType = {
		name = "edited"
		iconType = { name = "badge" spriteType = "GFX_|" }
		instantTextBoxType = { name = "t" font = | }
		iconType = { name = "o" orientation = | }
		iconType = { name = "c" alwaysTransparent = | }
		ico|
	}
	|
}
`;

async function fixtureGame(): Promise<{ root: string; marks: number[] }> {
  const root = await mkdtemp(path.join(tmpdir(), 'etch-completion-'));
  const marks: number[] = [];
  let edited = '';
  for (const part of EDITED.split('|')) {
    if (edited !== '' || marks.length > 0) marks.push(edited.length);
    edited += part;
  }
  const files: Record<string, string | Uint8Array> = {
    'eu4.exe': 'not the game',
    'interface/etch.gfx': GFX,
    'interface/a_source.gui': SOURCE,
    'interface/b_edited.gui': edited,
    'gfx/interface/etch_badge.dds': dds(32, 16, [0, 128, 255, 255]),
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, ...name.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return { root, marks };
}

export async function testGuiCompletion(): Promise<void> {
  const { root, marks } = await fixtureGame();
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', root, vscode.ConfigurationTarget.Global);
  try {
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(root, 'interface', 'b_edited.gui')),
    );
    const complete = async (mark: number, resolve = 0): Promise<vscode.CompletionItem[]> => {
      const list = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        document.uri,
        document.positionAt(marks[mark] ?? -1),
        undefined,
        resolve,
      );
      // Only Etch's entries: VS Code's word-based suggestions have no detail.
      return list.items.filter((item) => item.detail !== undefined);
    };
    const labels = (items: vscode.CompletionItem[]): string[] =>
      items.map((item) => (typeof item.label === 'string' ? item.label : item.label.label));
    const insert = (item: vscode.CompletionItem | undefined): string | undefined => {
      const text = item?.insertText;
      return text instanceof vscode.SnippetString ? text.value : text;
    };

    const sprites = await complete(0, 10);
    assert.deepEqual(labels(sprites).sort(), ['GFX_etch_badge', 'GFX_etch_strip']);
    const strip = sprites.find((item) => item.label === 'GFX_etch_strip');
    assert.equal(insert(strip), 'GFX_etch_strip', 'inside closed quotes, the name alone');
    assert.equal(strip?.detail, 'spriteType · interface/etch.gfx');
    const documentation = strip.documentation;
    assert.ok(documentation instanceof vscode.MarkdownString, 'a selected sprite has its hover');
    assert.match(documentation.value, /2 frames/);
    assert.match(documentation.value, /data:image\/png;base64,/, 'with its thumbnail');

    const fonts = await complete(1);
    assert.deepEqual(labels(fonts), ['etch_font']);
    assert.equal(insert(fonts[0]), '"etch_font"', 'a font in quotes, as the game writes them');

    const anchors = await complete(2);
    assert.equal(labels(anchors)[0], 'UPPER_LEFT', 'the anchor the playset writes first');
    assert.equal(anchors.length, 9, 'the nine anchors the game reads');
    assert.equal(insert(anchors[0]), '"UPPER_LEFT"');

    assert.deepEqual(labels(await complete(3)), ['yes', 'no'], 'a key the game reads as yes or no');

    const keys = await complete(4);
    const kinds = keys.filter((item) => item.kind === vscode.CompletionItemKind.Class);
    assert.deepEqual(
      labels(kinds).slice(0, 2),
      ['iconType', 'instantTextBoxType'],
      "a window's children, the playset's first",
    );
    assert.equal(kinds.length, 18, 'every widget the game creates in a window');
    assert.ok(labels(kinds).includes('browserType'), 'also those the playset does not write');
    assert.match(insert(kinds[0]) ?? '', /^iconType = \{\n\tname = "\$1"/);
    const properties = keys.filter((item) => item.kind === vscode.CompletionItemKind.Property);
    assert.deepEqual(labels(properties).slice(0, 2), ['name', 'position']);
    for (const key of ['tooltip', 'tint', 'parent', 'scripted', 'verticalScrollbar']) {
      assert.ok(labels(properties).includes(key), `the game reads ${key} in a window`);
    }
    assert.equal(insert(properties[1]), 'position = { $0 }', 'a block key gets its braces');

    const top = labels(await complete(5));
    assert.equal(top[0], 'windowType', "inside guiTypes, the playset's first");
    assert.equal(top.length, 20, 'every widget the game reads in guiTypes');

    await settings.update('editor.completion', false, vscode.ConfigurationTarget.Global);
    assert.deepEqual(await complete(0), [], 'the setting turns it off');
  } finally {
    await settings.update('editor.completion', undefined, vscode.ConfigurationTarget.Global);
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
