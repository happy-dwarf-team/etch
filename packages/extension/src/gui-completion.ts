// Completion in `.gui` files (ADR 0008): inside `guiTypes`, the widget types the playset writes
// there; inside a widget, the child types and keys the playset writes in that widget type; after
// a key, the sprite names (`spriteType`, `quadTextureSprite`, a list's `background`) and fonts
// (`font`, `buttonFont`) of the playset's `.gfx` files, the exe's anchors for `orientation`, or
// the few words the playset writes for that key (`alwaysTransparent`, `format`). A sprite's entry
// shows its hover, thumbnail included, once selected. The playset is the one the sprite links
// read, loaded once and shared with them.
import * as vscode from 'vscode';
import {
  GuiVocabulary,
  guiCompletionAt,
  type GuiKeyContext,
  type GuiValueContext,
  type InterfaceIndex,
  type Located,
  type Sprite,
} from '@etch/core';
import { GUI_SELECTOR, type Loaded, type SpriteLinks } from './sprite-links.ts';

/** The setting that turns completion on and off. */
const SETTING = 'editor.completion';

/** The sprite an entry names, for {@link GuiCompletion.resolveCompletionItem}. */
class SpriteItem extends vscode.CompletionItem {
  readonly sprite: Located<Sprite>;
  readonly loaded: Loaded;

  constructor(label: string, sprite: Located<Sprite>, loaded: Loaded) {
    super(label, vscode.CompletionItemKind.Reference);
    this.sprite = sprite;
    this.loaded = loaded;
  }
}

export class GuiCompletion implements vscode.CompletionItemProvider {
  private readonly links: SpriteLinks;
  private readonly vocabularies = new WeakMap<InterfaceIndex, GuiVocabulary>();

  constructor(links: SpriteLinks) {
    this.links = links;
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[] | undefined> {
    if (!vscode.workspace.getConfiguration('etch', document).get<boolean>(SETTING, true)) {
      return undefined;
    }
    const context = guiCompletionAt(document.getText(), document.offsetAt(position));
    if (context === undefined) return undefined;
    const loaded = await this.links.playset();
    if (loaded === undefined) return undefined;
    const range = new vscode.Range(
      document.positionAt(context.start),
      document.positionAt(context.end),
    );
    switch (context.kind) {
      case 'key':
        return this.keys(context, loaded, range);
      case 'sprite':
        return loaded.ui.index.allSprites().map((sprite) => {
          const item = new SpriteItem(sprite.item.name, sprite, loaded);
          item.detail = `${sprite.item.kind} · ${sprite.path}`;
          return value(item, sprite.item.name, true, context, range);
        });
      case 'font':
        return loaded.ui.index.allFonts().map((font) => {
          const name = font.item.name;
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Text);
          item.detail = `font · ${font.path}`;
          return value(item, name, true, context, range);
        });
      case 'value':
        return this.vocabulary(loaded.ui.index)
          .values(context.widget, context.key)
          .map((word, rank) => {
            const item = new vscode.CompletionItem(
              word.written,
              vscode.CompletionItemKind.EnumMember,
            );
            item.detail =
              word.count === 0
                ? "in the exe's anchors"
                : `${String(word.count)} uses in the playset`;
            item.sortText = String(rank).padStart(4, '0');
            return value(item, word.written, word.quoted, context, range);
          });
    }
  }

  async resolveCompletionItem(item: vscode.CompletionItem): Promise<vscode.CompletionItem> {
    if (item instanceof SpriteItem) {
      item.documentation = await this.links.describe(item.loaded, item.sprite);
    }
    return item;
  }

  private keys(
    context: GuiKeyContext,
    loaded: Loaded,
    range: vscode.Range,
  ): vscode.CompletionItem[] {
    const vocabulary = this.vocabulary(loaded.ui.index);
    const items: vscode.CompletionItem[] = [];
    const kinds =
      context.widget === undefined ? vocabulary.topKinds() : vocabulary.childKinds(context.widget);
    for (const [rank, kind] of kinds.entries()) {
      const item = new vscode.CompletionItem(kind.written, vscode.CompletionItemKind.Class);
      item.detail = `widget · ${String(kind.count)} in the playset`;
      item.insertText = new vscode.SnippetString(`${kind.written} = {\n\tname = "$1"\n\t$0\n}`);
      item.range = range;
      item.sortText = `0${String(rank).padStart(4, '0')}`;
      items.push(item);
    }
    if (context.widget !== undefined) {
      for (const [rank, key] of vocabulary.keys(context.widget).entries()) {
        const item = new vscode.CompletionItem(key.written, vscode.CompletionItemKind.Property);
        item.detail = `${String(key.count)} uses in ${context.widget}`;
        item.insertText = new vscode.SnippetString(
          key.block ? `${key.written} = { $0 }` : `${key.written} = $0`,
        );
        item.range = range;
        item.sortText = `1${String(rank).padStart(4, '0')}`;
        if (!key.block) item.command = SUGGEST;
        items.push(item);
      }
    }
    return items;
  }

  private vocabulary(index: InterfaceIndex): GuiVocabulary {
    let vocabulary = this.vocabularies.get(index);
    if (vocabulary === undefined) {
      vocabulary = GuiVocabulary.of(index.guiFiles.map(({ file }) => file));
      this.vocabularies.set(index, vocabulary);
    }
    return vocabulary;
  }
}

/** Opens the suggestions again after a key, for its value. */
const SUGGEST: vscode.Command = { command: 'editor.action.triggerSuggest', title: 'Suggest' };

/** A value entry: quoted as the playset writes it, unless the text already has the quote. */
function value(
  item: vscode.CompletionItem,
  name: string,
  quoted: boolean,
  context: GuiValueContext,
  range: vscode.Range,
): vscode.CompletionItem {
  item.range = range;
  item.filterText = name;
  if (context.quoted) item.insertText = context.closed ? name : `${name}"`;
  else item.insertText = quoted ? `"${name}"` : name;
  return item;
}

/** Registers completion in `.gui` files; the returned object is for Etch's tests. */
export function registerGuiCompletion(
  context: vscode.ExtensionContext,
  links: SpriteLinks,
): GuiCompletion {
  const completion = new GuiCompletion(links);
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(GUI_SELECTOR, completion, '"'),
  );
  return completion;
}
