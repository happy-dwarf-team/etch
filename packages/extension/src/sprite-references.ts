// Find All References and Rename Symbol on sprite names (ADR 0008, "References and rename"): on a
// sprite's name in a `.gfx` definition, a `.gui` use (`spriteType`, `quadTextureSprite`, a list's
// `background`) or a script use (an event's `picture`, a mission's or an estate privilege's
// `icon`), Shift+F12 lists every place the playset's files write it, and F2 renames it in the
// edited mod's files: its definition in the mod's `.gfx` and its uses in the mod's `.gui` and
// script files, never another mod's or the game's files. A rename that would leave the old name
// behind is refused (`planSpriteRename`).

import * as vscode from 'vscode';
import {
  decodeGameText,
  occurrencesOf,
  planSpriteRename,
  spriteFileKind,
  spriteOccurrenceAt,
  type SpriteOccurrence,
} from '@etch/core';
import { spriteNamingFiles, type GameFile } from '@etch/core/playset';
import {
  GUI_SELECTOR,
  SPRITE_SCRIPT_SELECTOR,
  spriteScriptPath,
  type SpriteLinks,
} from './sprite-links.ts';
import { readGamePath } from '@etch/core/playset';
import { pathUri } from './dlc-files.ts';

const GFX_SELECTOR: vscode.DocumentSelector = [{ scheme: 'file', pattern: '**/*.gfx' }];
/** The setting that turns Find All References and Rename Symbol on sprite names on and off. */
const RENAME_SETTING = 'editor.rename';

/** The game path of a document that names sprites, from its folders; `undefined` for others. */
export function spriteDocumentPath(fileName: string): string | undefined {
  if (/\.(?:gfx|gui)$/i.test(fileName)) {
    const slashed = fileName.replace(/\\/g, '/');
    const at = slashed.toLowerCase().lastIndexOf('/interface/');
    return at < 0 ? undefined : slashed.slice(at + 1);
  }
  return spriteScriptPath(fileName);
}

/** A file's text as VS Code shows it: the open document's, else the file's game text. */
interface FileText {
  readonly uri: vscode.Uri;
  /** The playset layer's name (`game` for the game folder) and folder. */
  readonly layer: string;
  readonly root: string;
  readonly path: string;
  readonly text: string;
  readonly document: vscode.TextDocument | undefined;
}

export class SpriteReferences implements vscode.ReferenceProvider, vscode.RenameProvider {
  private readonly links: SpriteLinks;

  constructor(links: SpriteLinks) {
    this.links = links;
  }

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
  ): Promise<vscode.Location[]> {
    const found = occurrenceAt(document, position);
    if (found === undefined) return [];
    const texts = await withDocuments(await this.playsetTexts(), found.name);
    const out: vscode.Location[] = [];
    for (const file of texts) {
      for (const o of occurrencesOf(file.path, file.text, found.name)) {
        if (o.definition && !context.includeDeclaration) continue;
        out.push(new vscode.Location(file.uri, rangeIn(file, o)));
      }
    }
    return out;
  }

  prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): { range: vscode.Range; placeholder: string } {
    const found = occurrenceAt(document, position);
    if (found === undefined) {
      throw new Error('Etch renames sprite names: put the cursor on one.');
    }
    const range = new vscode.Range(
      document.positionAt(found.start),
      document.positionAt(found.end),
    );
    return { range, placeholder: document.getText(range) };
  }

  async provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
  ): Promise<vscode.WorkspaceEdit> {
    const found = occurrenceAt(document, position);
    if (found === undefined) throw new Error('Etch renames sprite names: put the cursor on one.');
    const loaded = await this.links.playset();
    if (loaded === undefined) throw new Error('Etch cannot read the playset.');
    const texts = await withDocuments(await this.playsetTexts(), found.name);
    const { editedRoot } = loaded;
    const plan = planSpriteRename(
      texts.map((file) => ({
        path: file.path,
        text: file.text,
        editable: file.layer !== 'game' && editedRoot !== undefined && inFolder(file, editedRoot),
      })),
      found.name,
      newName,
      (name) => loaded.ui.index.sprite(name) !== undefined,
    );
    if (plan.kind === 'refused') throw new Error(`Not renamed: ${plan.message}.`);
    const edit = new vscode.WorkspaceEdit();
    for (const change of plan.edits) {
      const file = texts[change.file];
      if (file === undefined) continue;
      edit.replace(file.uri, rangeIn(file, change), newName);
    }
    return edit;
  }

  /** Every file of the playset that can name a sprite, as VS Code would show its text. */
  private async playsetTexts(): Promise<FileText[]> {
    const loaded = await this.links.playset();
    if (loaded === undefined) return [];
    const open = new Map(
      vscode.workspace.textDocuments
        .filter((d) => d.uri.scheme === 'file')
        .map((d) => [d.uri.fsPath.toLowerCase(), d]),
    );
    const files = await spriteNamingFiles(loaded.files);
    return Promise.all(files.map((file) => textOf(file, open)));
  }
}

async function textOf(
  file: GameFile,
  open: ReadonlyMap<string, vscode.TextDocument>,
): Promise<FileText> {
  const uri = pathUri(file.absolutePath);
  const { name: layer, root } = file.layer;
  const document = open.get(file.absolutePath.toLowerCase());
  if (document !== undefined) {
    return { uri, layer, root, path: file.path, text: document.getText(), document };
  }
  const kind = spriteFileKind(file.path) === 'script' ? 'script' : 'interface';
  const text = decodeGameText(await readGamePath(file.absolutePath), kind).text;
  return { uri, layer, root, path: file.path, text, document: undefined };
}

/**
 * The files that write the name, read as VS Code reads them: a closed file is opened (not shown),
 * so that the ranges and the edits follow VS Code's decoding of it (`files.encoding`), not the
 * game's. The others stay as they are: they have nothing to place.
 */
async function withDocuments(texts: FileText[], name: string): Promise<FileText[]> {
  const lower = name.toLowerCase();
  return Promise.all(
    texts.map(async (file) => {
      if (file.document !== undefined || !file.text.toLowerCase().includes(lower)) return file;
      const document = await vscode.workspace.openTextDocument(file.uri);
      return { ...file, text: document.getText(), document };
    }),
  );
}

/** Whether a file is in the edited mod's folder (its layer's root is that folder). */
function inFolder(file: FileText, folder: string): boolean {
  const normal = (path: string): string =>
    path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return normal(file.root) === normal(folder);
}

function occurrenceAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): SpriteOccurrence | undefined {
  const path = spriteDocumentPath(document.fileName);
  if (path === undefined) return undefined;
  return spriteOccurrenceAt(path, document.getText(), document.offsetAt(position));
}

function rangeIn(file: FileText, at: { start: number; end: number }): vscode.Range {
  if (file.document !== undefined) {
    return new vscode.Range(file.document.positionAt(at.start), file.document.positionAt(at.end));
  }
  return new vscode.Range(positionIn(file.text, at.start), positionIn(file.text, at.end));
}

/** A position in a file's text, counting `\r\n`, `\n` and a lone `\r` as VS Code does. */
function positionIn(text: string, offset: number): vscode.Position {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    const c = text[i];
    if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) {
      line++;
      lineStart = i + 1;
    }
  }
  return new vscode.Position(line, offset - lineStart);
}

/** Registers the providers on the files that name sprites; the object is for Etch's tests. */
export function registerSpriteReferences(
  context: vscode.ExtensionContext,
  links: SpriteLinks,
): SpriteReferences {
  const references = new SpriteReferences(links);
  // Registered only while the setting is on, so that with it off another extension's references
  // and rename answer alone, as if Etch had none.
  let registered: vscode.Disposable | undefined;
  const apply = (): void => {
    const on = vscode.workspace.getConfiguration('etch').get<boolean>(RENAME_SETTING, true);
    if (on && registered === undefined) {
      registered = vscode.Disposable.from(
        ...[GFX_SELECTOR, GUI_SELECTOR, SPRITE_SCRIPT_SELECTOR].flatMap((selector) => [
          vscode.languages.registerReferenceProvider(selector, references),
          vscode.languages.registerRenameProvider(selector, references),
        ]),
      );
    } else if (!on && registered !== undefined) {
      registered.dispose();
      registered = undefined;
    }
  };
  apply();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`etch.${RENAME_SETTING}`)) apply();
    }),
    {
      dispose: () => {
        registered?.dispose();
      },
    },
  );
  return references;
}
