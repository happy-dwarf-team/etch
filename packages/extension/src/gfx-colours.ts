// Colour swatches and VS Code's colour picker in `.gfx` files (ADR 0008, "Colours"), on the colours
// the model reads: `bitmapfonts`' `textcolors` (`G = { 0 255 0 }`) and a `bitmapfont`'s `color` and
// `border_color` (`0xAARRGGBB`). A colour picked is written back in the same form; `{ R G B }`
// has no alpha.
import * as vscode from 'vscode';
import { formatGfxColour, gfxColours, type GfxColour } from '@etch/core';

export class GfxColours implements vscode.DocumentColorProvider {
  provideDocumentColors(document: vscode.TextDocument): vscode.ColorInformation[] {
    return gfxColours(document.getText()).map(
      (c) => new vscode.ColorInformation(rangeOf(document, c), toColor(c.rgba)),
    );
  }

  provideColorPresentations(
    color: vscode.Color,
    context: { readonly document: vscode.TextDocument; readonly range: vscode.Range },
  ): vscode.ColorPresentation[] {
    const at = context.document.offsetAt(context.range.start);
    const written = gfxColours(context.document.getText()).find((c) => c.start === at);
    const form: GfxColour['form'] = written?.form ?? 'rgb';
    const text = formatGfxColour(form, [
      color.red * 255,
      color.green * 255,
      color.blue * 255,
      color.alpha * 255,
    ]);
    const presentation = new vscode.ColorPresentation(text);
    presentation.textEdit = vscode.TextEdit.replace(context.range, text);
    return [presentation];
  }
}

function rangeOf(document: vscode.TextDocument, c: GfxColour): vscode.Range {
  return new vscode.Range(document.positionAt(c.start), document.positionAt(c.end));
}

function toColor([r, g, b, a]: readonly [number, number, number, number]): vscode.Color {
  return new vscode.Color(r / 255, g / 255, b / 255, a / 255);
}

/** Registers the swatches on `.gfx` files; the object is for Etch's tests. */
export function registerGfxColours(context: vscode.ExtensionContext): GfxColours {
  const colours = new GfxColours();
  context.subscriptions.push(
    vscode.languages.registerColorProvider({ scheme: 'file', pattern: '**/*.gfx' }, colours),
  );
  return colours;
}
