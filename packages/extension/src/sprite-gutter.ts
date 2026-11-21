// Sprite thumbnails in the gutter (ADR 0008, "Images in more scripts"): with
// `etch.editor.spriteThumbnails` on, each line of a `.gui` file or of a script file that names a
// sprite (`documentSpriteReferences`) shows the sprite's texture, its first frame for a strip,
// beside the line numbers, for the visible editors only. VS Code draws a gutter icon from a file,
// so each thumbnail is a small PNG in Etch's global storage, named by the texture file, its time,
// size and frames, and each PNG has a decoration type of its own.

import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import {
  documentSpriteReferences,
  findTexture,
  GUI_SELECTOR,
  SPRITE_SCRIPT_SELECTOR,
  type SpriteLinks,
} from './sprite-links.ts';
import { texturePng } from './texture-thumbnail.ts';

/** The setting that turns the gutter thumbnails on; off by default. */
const SETTING = 'editor.spriteThumbnails';
/** The thumbnail's longest side in pixels: VS Code scales it into the gutter's line height. */
const ICON_SIZE = 32;
/** The most thumbnails one editor shows, the first lines first. */
const MAX_ICONS = 500;
/** How long after the last edit the thumbnails follow it, in ms. */
const EDIT_DELAY_MS = 400;

/** A line's thumbnail: the 0-based line and the PNG file VS Code draws. */
export interface GutterIcon {
  readonly line: number;
  readonly file: string;
}

export class SpriteGutter implements vscode.Disposable {
  private readonly links: SpriteLinks;
  private readonly folder: string;
  private readonly types = new Map<string, vscode.TextEditorDecorationType>();
  private readonly pngs = new Map<string, Promise<string | undefined>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(links: SpriteLinks, storage: vscode.Uri) {
    this.links = links;
    this.folder = join(storage.fsPath, 'sprite-gutter');
  }

  /** Whether a document gets thumbnails: the setting is on and the document names sprites. */
  static wants(document: vscode.TextDocument): boolean {
    if (!vscode.workspace.getConfiguration('etch', document).get<boolean>(SETTING, false)) {
      return false;
    }
    return (
      vscode.languages.match(GUI_SELECTOR, document) > 0 ||
      vscode.languages.match(SPRITE_SCRIPT_SELECTOR, document) > 0
    );
  }

  /** The thumbnails of a document: one per line that names a sprite with a texture. */
  async icons(document: vscode.TextDocument): Promise<GutterIcon[]> {
    if (!SpriteGutter.wants(document)) return [];
    const loaded = await this.links.playset();
    if (loaded === undefined) return [];
    const out: GutterIcon[] = [];
    const lines = new Set<number>();
    for (const reference of documentSpriteReferences(document)) {
      if (out.length >= MAX_ICONS) break;
      const line = document.positionAt(reference.node.start).line;
      if (lines.has(line)) continue;
      const sprite = loaded.ui.index.sprite(reference.name);
      const texture = sprite?.item.textures[0];
      if (sprite === undefined || texture === undefined) continue;
      const file = await findTexture(loaded.files, texture.path);
      if (file === undefined) continue;
      const png = await this.png(file.absolutePath, sprite.item.frames);
      if (png === undefined) continue;
      lines.add(line);
      out.push({ line, file: png });
    }
    return out;
  }

  /** Draws the thumbnails of an editor again, or clears them when it gets none. */
  async refresh(editor: vscode.TextEditor): Promise<void> {
    const version = editor.document.version;
    const icons = await this.icons(editor.document).catch(() => []);
    // An edit while the icons were read: the next refresh draws them.
    if (editor.document.version !== version) return;
    const byFile = new Map<string, vscode.Range[]>();
    for (const { line, file } of icons) {
      const ranges = byFile.get(file) ?? [];
      ranges.push(new vscode.Range(line, 0, line, 0));
      byFile.set(file, ranges);
    }
    for (const file of byFile.keys()) this.typeFor(file);
    for (const [file, type] of this.types) editor.setDecorations(type, byFile.get(file) ?? []);
  }

  /** Draws every visible editor again: after a setting, the playset or a `.gfx` file changed. */
  refreshAll(): void {
    for (const editor of vscode.window.visibleTextEditors) void this.refresh(editor);
  }

  /** Draws an editor's document again a moment after its last edit. */
  refreshSoon(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document === document) void this.refresh(editor);
        }
      }, EDIT_DELAY_MS),
    );
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const type of this.types.values()) type.dispose();
    this.types.clear();
  }

  private typeFor(file: string): vscode.TextEditorDecorationType {
    let type = this.types.get(file);
    if (type === undefined) {
      type = vscode.window.createTextEditorDecorationType({
        gutterIconPath: vscode.Uri.file(file),
        gutterIconSize: 'contain',
      });
      this.types.set(file, type);
    }
    return type;
  }

  /** The PNG of a texture's thumbnail in the storage folder, written once; `undefined` if unreadable. */
  private async png(absolutePath: string, frames: number): Promise<string | undefined> {
    const info = await stat(absolutePath).catch(() => undefined);
    if (info === undefined) return undefined;
    const key = `${absolutePath.toLowerCase()}|${String(info.mtimeMs)}|${String(info.size)}|${String(frames)}`;
    let entry = this.pngs.get(key);
    if (entry === undefined) {
      const name = `${createHash('sha1').update(key).digest('hex').slice(0, 16)}.png`;
      const file = join(this.folder, name);
      entry = (async () => {
        try {
          const { png } = await texturePng(absolutePath, frames, ICON_SIZE);
          await mkdir(this.folder, { recursive: true });
          await writeFile(file, png);
          return file;
        } catch {
          return undefined;
        }
      })();
      this.pngs.set(key, entry);
    }
    return entry;
  }
}

/** Registers the gutter thumbnails; the object is for Etch's tests. */
export function registerSpriteGutter(
  context: vscode.ExtensionContext,
  links: SpriteLinks,
): SpriteGutter {
  const gutter = new SpriteGutter(links, context.globalStorageUri);
  context.subscriptions.push(
    gutter,
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      for (const editor of editors) void gutter.refresh(editor);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length > 0) gutter.refreshSoon(event.document);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      // A `.gfx` file can change any sprite: SpriteLinks forgets the playset, and every editor
      // gets its thumbnails again.
      if (/\.gfx$/i.test(document.fileName)) gutter.refreshAll();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(`etch.${SETTING}`) ||
        event.affectsConfiguration('etch.gamePath') ||
        event.affectsConfiguration('etch.playset')
      ) {
        gutter.refreshAll();
      }
    }),
  );
  gutter.refreshAll();
  return gutter;
}
