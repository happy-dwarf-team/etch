// Document symbols for interface files (ADR 0008): a `.gui` file's widget tree, as the Widget
// Outline shows a window, and a `.gfx` file's sprites and fonts, so that the breadcrumbs, VS
// Code's Outline and Go to Symbol in Editor (Ctrl+Shift+O) follow them. A widget is named by its
// `name` (`<kind>` without one, as the outline writes it) and a widget that the game would not
// create (an unknown kind) is not a symbol, as it is not a widget of the model.
import * as vscode from 'vscode';
import {
  parseScript,
  readGfxFile,
  readGuiFile,
  widgetLabel,
  type Widget,
  type WidgetKind,
} from '@etch/core';
import { cwtoolsTypesFonts, cwtoolsTypesSprite } from './cwtools.ts';

export const INTERFACE_SELECTOR: vscode.DocumentSelector = [
  { scheme: 'file', pattern: '**/*.gui' },
  { scheme: 'file', pattern: '**/*.gfx' },
];

/** The widget kinds that hold other widgets, shown as classes; the rest are fields. */
const CONTAINERS: ReadonlySet<WidgetKind> = new Set<WidgetKind>([
  'windowType',
  'containerWindowType',
  'eu3dialogtype',
  'listboxType',
  'smoothListboxType',
  'OverlappingElementsBoxType',
  'gridBoxType',
  'scrollbarType',
  'extendedScrollbarType',
]);

export class InterfaceSymbols implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const parsed = parseScript(document.getText());
    const range = (start: number, end: number): vscode.Range =>
      new vscode.Range(document.positionAt(start), document.positionAt(end));
    if (/\.gfx$/i.test(document.fileName)) {
      const file = readGfxFile(parsed);
      const symbols = [
        ...file.sprites
          .filter((sprite) => !cwtoolsTypesSprite(document, sprite.kind))
          .map((sprite) => {
            const symbol = new vscode.DocumentSymbol(
              sprite.name,
              sprite.kind,
              vscode.SymbolKind.Constant,
              range(sprite.node.start, sprite.node.end),
              range(sprite.nameNode.start, sprite.nameNode.end),
            );
            return { start: sprite.node.start, symbol };
          }),
        ...(cwtoolsTypesFonts(document) ? [] : file.fonts).map((font) => {
          const symbol = new vscode.DocumentSymbol(
            font.name,
            'bitmapfont',
            vscode.SymbolKind.String,
            range(font.node.start, font.node.end),
            range(font.nameNode.start, font.nameNode.end),
          );
          return { start: font.node.start, symbol };
        }),
      ];
      return symbols.sort((a, b) => a.start - b.start).map(({ symbol }) => symbol);
    }
    const widgetSymbol = (widget: Widget): vscode.DocumentSymbol => {
      const name = widget.nameNode ?? widget.node.key;
      const symbol = new vscode.DocumentSymbol(
        widgetLabel(widget),
        widget.kind,
        CONTAINERS.has(widget.kind) ? vscode.SymbolKind.Class : vscode.SymbolKind.Field,
        range(widget.node.start, widget.node.end),
        range(name.start, name.end),
      );
      symbol.children = widget.children.map(widgetSymbol);
      return symbol;
    };
    return readGuiFile(parsed).definitions.map(widgetSymbol);
  }
}

/** Registers the symbols; the returned object is for Etch's tests. */
export function registerInterfaceSymbols(context: vscode.ExtensionContext): InterfaceSymbols {
  const symbols = new InterfaceSymbols();
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(INTERFACE_SELECTOR, symbols, {
      label: 'Etch',
    }),
  );
  return symbols;
}
