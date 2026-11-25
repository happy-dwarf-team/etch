// Completion in `.gui` files (ADR 0008): inside `guiTypes`, the widgets the game reads there;
// inside a widget, the keys EU4 1.37.5 reads in it and the child widgets it creates; inside a
// value block (`position`), its fields; after a key, the sprite names (`spriteType`,
// `quadTextureSprite`, a list's `background`) and fonts (`font`, `buttonFont`) of the playset's
// `.gfx` files, the words of an enum or `yes` and `no`, or the few words the playset writes for
// that key (`clicksound`). The playset's `.gui` files rank the keys and give their spelling. A sprite's entry
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
import { cwtoolsChecksGui } from './cwtools.ts';
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
        // CWTools completes the keys itself when its rules check .gui files (ADR 0008).
        if (cwtoolsChecksGui(document)) return undefined;
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
          .values(context.schema, context.key)
          .map((word, rank) => {
            const item = new vscode.CompletionItem(
              word.written,
              vscode.CompletionItemKind.EnumMember,
            );
            item.detail =
              word.count === 0 ? 'read by the game' : `${String(word.count)} uses in the playset`;
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

  /** The keys the game reads where the cursor stands (ADR 0008); CWTools' `.gui` rules give the same. */
  private keys(
    context: GuiKeyContext,
    loaded: Loaded,
    range: vscode.Range,
  ): vscode.CompletionItem[] {
    const where = context.place.kind === 'widget' ? context.place.written : 'guiTypes';
    return this.vocabulary(loaded.ui.index)
      .keys(context.place)
      .map((key, rank) => {
        const widget = key.widget !== undefined;
        const item = new vscode.CompletionItem(
          key.written,
          widget ? vscode.CompletionItemKind.Class : vscode.CompletionItemKind.Property,
        );
        const uses = key.count === 0 ? 'not in the playset' : `${String(key.count)} in the playset`;
        item.detail = `${widget ? 'widget' : (key.value ?? 'block')} · ${uses}`;
        item.documentation = `Read by EU4 1.37.5 in ${where}.`;
        item.insertText = new vscode.SnippetString(
          widget
            ? `${key.written} = {\n\tname = "$1"\n\t$0\n}`
            : key.block
              ? `${key.written} = { $0 }`
              : `${key.written} = $0`,
        );
        item.range = range;
        item.sortText = `${widget ? '0' : '1'}${String(rank).padStart(4, '0')}`;
        if (!key.block) item.command = SUGGEST;
        return item;
      });
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
