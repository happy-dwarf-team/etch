// Colour swatches and the colour picker in `.gfx` files end to end in a real VS Code: the font
// colours of a file in a temporary folder, and a picked colour written back in each form.
import * as assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

const GFX = `bitmapfonts = {
	textcolors = {
		G = { 0 255 0 }
	}
	bitmapfont = {
		name = "etch_font"
		color = 0xffcc8800
	}
}
objectTypes = {
	etch_object = { color = { 0.0 0.5 0.0 } }
}
`;

interface Swatch {
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly rgba: number[];
}

function swatch(info: vscode.ColorInformation): Swatch {
  const { red, green, blue, alpha } = info.color;
  return {
    line: info.range.start.line,
    start: info.range.start.character,
    end: info.range.end.character,
    rgba: [red, green, blue, alpha].map((c) => Math.round(c * 255)),
  };
}

export async function testGfxColours(): Promise<void> {
  const folder = await mkdtemp(path.join(tmpdir(), 'etch-colours-'));
  const file = path.join(folder, 'etch.gfx');
  await writeFile(file, GFX);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
  const colours = await vscode.commands.executeCommand<vscode.ColorInformation[]>(
    'vscode.executeDocumentColorProvider',
    document.uri,
  );
  assert.deepEqual(
    colours.map(swatch),
    [
      { line: 2, start: 6, end: 17, rgba: [0, 255, 0, 255] },
      { line: 6, start: 10, end: 20, rgba: [204, 136, 0, 255] },
    ],
    "the font colours get swatches, objectTypes' colour none",
  );
  const presentations = async (info: vscode.ColorInformation): Promise<string[]> => {
    const answer = await vscode.commands.executeCommand<vscode.ColorPresentation[]>(
      'vscode.executeColorPresentationProvider',
      new vscode.Color(35 / 255, 206 / 255, 1, 0.5),
      { uri: document.uri, range: info.range },
    );
    return answer.map((p) => p.textEdit?.newText ?? p.label);
  };
  const [rgb, hex] = colours;
  assert.ok(rgb !== undefined && hex !== undefined);
  assert.deepEqual(await presentations(rgb), ['{ 35 206 255 }'], '{ R G B } drops the alpha');
  assert.deepEqual(await presentations(hex), ['0x8023ceff'], '0xAARRGGBB keeps it');
}
