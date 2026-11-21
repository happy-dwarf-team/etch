// Document symbols of `.gui` and `.gfx` files end to end in a real VS Code: a `.gui` file's widget
// tree and a `.gfx` file's sprites and fonts, from files in a temporary folder.
import * as assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

const GUI = `guiTypes = {
	windowType = {
		name = "etch_window"
		iconType = { name = "badge" spriteType = "GFX_etch_badge" }
		listboxType = {
			name = "list"
			guiButtonType = { name = "row" }
		}
		instantTextBoxType = { text = "no name" }
	}
	scrollbarType = { name = "etch_scrollbar" }
}
`;

const GFX = `spriteTypes = {
	spriteType = { name = "GFX_etch_badge" texturefile = "gfx/interface/etch.dds" }
	corneredTileSpriteType = { name = "GFX_etch_tiles" texturefile = "gfx/interface/etch.dds" }
}
bitmapfonts = {
	bitmapfont = { name = "etch_font" path = "gfx/fonts/etch_font" }
}
`;

interface Plain {
  readonly name: string;
  readonly detail: string;
  readonly kind: string;
  readonly children?: Plain[];
}

function plain(symbols: readonly vscode.DocumentSymbol[]): Plain[] {
  return symbols.map((symbol) => ({
    name: symbol.name,
    detail: symbol.detail,
    kind: vscode.SymbolKind[symbol.kind],
    ...(symbol.children.length > 0 ? { children: plain(symbol.children) } : {}),
  }));
}

export async function testInterfaceSymbols(): Promise<void> {
  const folder = await mkdtemp(path.join(tmpdir(), 'etch-symbols-'));
  const gui = path.join(folder, 'etch.gui');
  const gfx = path.join(folder, 'etch.gfx');
  await writeFile(gui, GUI);
  await writeFile(gfx, GFX);
  const symbolsOf = async (file: string): Promise<vscode.DocumentSymbol[]> => {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    return vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri,
    );
  };

  const widgets = await symbolsOf(gui);
  assert.deepEqual(plain(widgets), [
    {
      name: 'etch_window',
      detail: 'windowType',
      kind: 'Class',
      children: [
        { name: 'badge', detail: 'iconType', kind: 'Field' },
        {
          name: 'list',
          detail: 'listboxType',
          kind: 'Class',
          children: [{ name: 'row', detail: 'guiButtonType', kind: 'Field' }],
        },
        { name: '<instantTextBoxType>', detail: 'instantTextBoxType', kind: 'Field' },
      ],
    },
    { name: 'etch_scrollbar', detail: 'scrollbarType', kind: 'Class' },
  ]);
  const window = widgets[0];
  assert.equal(window?.range.start.line, 1, 'the widget runs from its key');
  assert.equal(window.range.end.line, 9, 'to its closing brace');
  assert.equal(window.selectionRange.start.line, 2, 'its name is what Go to Symbol selects');

  assert.deepEqual(plain(await symbolsOf(gfx)), [
    { name: 'GFX_etch_badge', detail: 'spriteType', kind: 'Constant' },
    { name: 'GFX_etch_tiles', detail: 'corneredTileSpriteType', kind: 'Constant' },
    { name: 'etch_font', detail: 'bitmapfont', kind: 'String' },
  ]);
}
