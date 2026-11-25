// Font hovers and Go to Definition end to end in a real VS Code: a fixture game (an `eu4.exe` that
// is not the game) set as `etch.gamePath`, two `.gfx` files that both define a font, its `.fnt`
// and texture, a font whose files are missing, a `.gui` file that names fonts, one of them
// missing, and a `.gfx` file whose `animatedmaptext` names fonts in its `textblock`.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { dds, markdownOf, positionOf } from './asset-links.ts';

const FIRST_GFX = `bitmapfonts = {
	bitmapfont = {
		name = "etch_font"
		path = "gfx/fonts/etch_font"
		color = 0xffffcc00
		border_color = 0xff000000
	}
	bitmapfont = {
		name = "etch_lost_files"
		path = "gfx/fonts/etch_nowhere"
	}
}
`;

const SECOND_GFX = `bitmapfonts = {
	bitmapfont = {
		name = "etch_font"
		path = "gfx/fonts/etch_other"
	}
}
`;

const MAP_GFX = `objectTypes = {
	animatedmaptext = {
		name = "EtchMapText"
		textblock = {
			text = "test!"
			font = "etch_font"
		}
	}
	animatedmaptext = {
		name = "EtchLostText"
		textblock = { font = "etch_no_font" }
	}
}
`;

const GUI = `guiTypes = {
	windowType = {
		name = "etch_window"
		instantTextBoxType = { name = "title" font = "etch_font" }
		guiButtonType = { name = "ok" buttonFont = "etch_lost_files" }
		instantTextBoxType = { name = "lost" font = "etch_missing" }
	}
}
`;

/** Glyphs for `A` and `a`, each a 4 × 4 cell of the 8 × 8 texture. */
const FNT = `info face="Etch" size=10
common lineHeight=12 base=10 scaleW=8 scaleH=8 pages=1
page id=0 file="etch_font_0.dds"
chars count=2
char id=65 x=0 y=0 width=4 height=4 xoffset=0 yoffset=2 xadvance=5 page=0
char id=97 x=4 y=0 width=4 height=4 xoffset=0 yoffset=4 xadvance=5 page=0
`;

async function fixtureGame(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'etch-fonts-'));
  const files: Record<string, string | Uint8Array> = {
    'eu4.exe': 'not the game',
    'interface/a_fonts.gfx': FIRST_GFX,
    'interface/b_fonts.gfx': SECOND_GFX,
    'interface/etch_map.gfx': MAP_GFX,
    'interface/etch.gui': GUI,
    'gfx/fonts/etch_font.fnt': FNT,
    'gfx/fonts/etch_font.dds': dds(8, 8, [255, 255, 255, 255]),
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, ...name.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
}

export async function testFontLinks(): Promise<void> {
  const game = await fixtureGame();
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  try {
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
    const definitionIn = async (
      document: vscode.TextDocument,
      text: string,
    ): Promise<(string | number)[][]> =>
      (
        await vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeDefinitionProvider',
          document.uri,
          positionOf(document, text),
        )
      ).map((d) => [
        path.relative(game, d.uri.fsPath),
        d.range.start.line,
        d.range.start.character,
        d.range.end.character,
      ]);

    const gui = await open('interface/etch.gui');
    const font = await hoverIn(gui, 'etch_font');
    assert.match(font, /\*\*etch_font\*\* · font/, 'the hover names the font');
    assert.match(
      font,
      /Defined in `interface\/a_fonts\.gfx` — the game \(defined 2 times; Etch uses the first one\)/,
      'the definition the preview draws with, the first one',
    );
    assert.match(font, /Path `gfx\/fonts\/etch_font`/, 'its path');
    assert.match(
      font,
      /colour <span style="color:#ffcc00;">■<\/span> `0xffffcc00`/,
      'its colour, with a swatch',
    );
    assert.match(font, /border <span style="color:#000000;">■<\/span> `0xff000000`/, 'its border');
    assert.match(
      font,
      /Glyphs `gfx\/fonts\/etch_font\.fnt` — the game · 2 characters · line height 12/,
      'its .fnt file',
    );
    assert.match(font, /Texture `gfx\/fonts\/etch_font\.dds` — the game · 8 × 8 · DDS BGRA8/);
    assert.match(
      font,
      /!\[Sample text in etch_font\]\(data:image\/png;base64,/,
      'and a sample drawn in it',
    );
    assert.match(font, /At 2×\./, 'a small font at 2×');
    assert.match(font, /no glyph for \d+ of the sample's characters/, 'naming what it lacks');

    const lost = await hoverIn(gui, 'etch_lost_files');
    assert.match(lost, /\*\*etch_lost_files\*\* · font/, 'buttonFont gets the hover too');
    assert.match(
      lost,
      /\*\*Not in the playset:\*\* `gfx\/fonts\/etch_nowhere\.fnt`/,
      'and missing font files are named',
    );
    assert.equal(
      await hoverIn(gui, 'etch_missing'),
      '',
      'a missing font has no hover: its diagnostic says so',
    );

    assert.deepEqual(
      await definitionIn(gui, 'etch_font'),
      [[path.join('interface', 'a_fonts.gfx'), 2, 10, 19]],
      "Go to Definition opens the first .gfx file at the font's name, inside the quotes",
    );
    assert.deepEqual(await definitionIn(gui, 'etch_missing'), [], 'a missing font has none');

    const map = await open('interface/etch_map.gfx');
    assert.match(
      await hoverIn(map, '"etch_font"'),
      /\*\*etch_font\*\* · font/,
      "a textblock's font in a .gfx file",
    );
    assert.match(
      await hoverIn(map, 'etch_no_font'),
      /\*\*etch_no_font\*\* · no font of that name in the playset's `\.gfx` files/,
      'a missing one says so, as a .gfx textblock has no diagnostic for it',
    );
    assert.deepEqual(
      await definitionIn(map, '"etch_font"'),
      [[path.join('interface', 'a_fonts.gfx'), 2, 10, 19]],
      'Go to Definition from a .gfx file',
    );
    const fonts = await open('interface/a_fonts.gfx');
    assert.doesNotMatch(
      await hoverIn(fonts, 'etch_font'),
      /· font/,
      "a bitmapfont's own name is not a reference",
    );
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
