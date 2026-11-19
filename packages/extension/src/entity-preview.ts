// The entity preview (etch.previewEntity): an `.asset` file's entity drawn as the game builds it.
// A CodeLens above each `entity = { … }` of an `.asset` file opens it. The extension resolves the
// entity through the playset's `.gfx` pdxmesh types and `.asset` files (`@etch/core/asset`
// `resolveEntity`: its clone, mesh, scale, states and attachments), with the `.asset` file's
// unsaved text in place of the saved one, reads every mesh, texture and state animation through
// the playset, and posts them to the mesh preview's webview script, which draws the attachments
// on their bones and plays the state the user picks.

import * as path from 'node:path';
import * as vscode from 'vscode';
import { parseScript } from '@etch/core';
import {
  EntityIndex,
  readAssetFile,
  readMesh,
  resolveEntity,
  type ResolvedEntity,
} from '@etch/core/asset';
import { loadEntityIndex, type GameFiles } from '@etch/core/playset';
import { keyOf } from '@etch/core';
import { layerFolder } from './asset-links.ts';
import { meshHtml, read, texturesOf } from './mesh-preview.ts';
import type {
  EntityNode,
  MeshHostMessage,
  MeshSummary,
  MeshWebviewMessage,
} from './mesh-protocol.ts';
import { linkedFiles } from './script-profile-view.ts';

export const ENTITY_PREVIEW_VIEW_TYPE = 'etch.entityPreview';
export const PREVIEW_ENTITY_COMMAND = 'etch.previewEntity';

export type EntityShown =
  | { readonly name: string; readonly ok: true; readonly summary: MeshSummary }
  | { readonly name: string; readonly ok: false; readonly message: string };

export interface EntityPreviewApi {
  /** Fires each time an entity preview has drawn an entity (or a new state) or failed to. */
  readonly onDidShow: vscode.Event<EntityShown>;
}

/** The entities of an `.asset` file's text: each `entity = { name = … }` at the top level. */
export function entitiesOf(text: string): { name: string; start: number }[] {
  const found: { name: string; start: number }[] = [];
  for (const entry of parseScript(text).entries) {
    if (entry.kind !== 'property' || keyOf(entry) !== 'entity' || entry.value?.kind !== 'block') {
      continue;
    }
    let name: string | undefined;
    for (const inner of entry.value.entries) {
      if (inner.kind === 'property' && keyOf(inner) === 'name' && inner.value?.kind === 'scalar') {
        name = inner.value.text;
      }
    }
    if (name !== undefined) found.push({ name, start: entry.start });
  }
  return found;
}

class EntityLenses implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return entitiesOf(document.getText()).map(({ name, start }) => {
      const position = document.positionAt(start);
      return new vscode.CodeLens(new vscode.Range(position, position), {
        title: 'Preview entity',
        tooltip: `Draw ${name} with its attachments and states`,
        command: PREVIEW_ENTITY_COMMAND,
        arguments: [document.uri, name],
      });
    });
  }
}

/** Where a game-relative file is: through the playset, else beside the `.asset` file. */
async function locate(
  gamePath: string,
  files: GameFiles,
  outside: string | undefined,
): Promise<string | undefined> {
  const found = await files.find(gamePath);
  if (found !== undefined) return found.absolutePath;
  if (outside === undefined || gamePath.includes('/')) return undefined;
  // An `.asset` file outside the playset names its animations beside it.
  const beside = path.join(outside, gamePath);
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(beside));
    return beside;
  } catch {
    return undefined;
  }
}

/** Everything the webview needs to draw an entity, read through the playset. */
async function entityMessage(
  entity: ResolvedEntity,
  files: GameFiles,
  outside: string | undefined,
): Promise<MeshHostMessage> {
  const nodes: EntityNode[] = [];
  const problems: string[] = [];
  const animationPaths = new Set<string>();
  const visit = async (
    node: ResolvedEntity,
    parent: number | undefined,
    bone: string | undefined,
  ): Promise<void> => {
    problems.push(...node.problems.map((problem) => `${node.name}: ${problem}`));
    if (node.mesh === undefined) return;
    const file = await locate(node.mesh, files, outside);
    if (file === undefined) {
      problems.push(`${node.name}: ${node.mesh} is not in the playset`);
      return;
    }
    let bytes: Uint8Array;
    let textures: EntityNode['textures'];
    try {
      bytes = await read(file);
      textures = await texturesOf(readMesh(bytes), file, files);
    } catch (error) {
      problems.push(
        `${node.name}: ${node.mesh}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const states: Record<string, string | undefined> = {};
    for (const state of node.states) {
      states[state.name] = state.file;
      if (state.file !== undefined) animationPaths.add(state.file);
      if (state.problem !== undefined)
        problems.push(`${node.name}: state ${state.name}: ${state.problem}`);
    }
    const index =
      nodes.push({
        name: node.name,
        parent,
        bone,
        meshName: path.basename(node.mesh),
        bytes,
        textures,
        scale: node.scale,
        states,
      }) - 1;
    for (const attachment of node.attachments) {
      await visit(attachment.entity, index, attachment.bone);
    }
  };
  await visit(entity, undefined, undefined);
  const animations: Record<string, Uint8Array> = {};
  for (const animation of animationPaths) {
    const file = await locate(animation, files, outside);
    if (file === undefined) {
      problems.push(`${animation} is not in the playset`);
      continue;
    }
    animations[animation] = await read(file);
  }
  const states = entity.states.map((state) => state.name);
  return {
    type: 'entity',
    name: entity.name,
    nodes,
    animations,
    states,
    state: entity.defaultState ?? (states.includes('idle') ? 'idle' : undefined),
    problems: [...new Set(problems)],
  };
}

class EntityPreviews {
  readonly shown = new vscode.EventEmitter<EntityShown>();
  private readonly extensionUri: vscode.Uri;
  private readonly output: vscode.LogOutputChannel;
  private index: Promise<{ files: GameFiles; index: EntityIndex } | undefined> | undefined;
  private readonly panels = new Set<() => Promise<void>>();

  constructor(extensionUri: vscode.Uri, output: vscode.LogOutputChannel) {
    this.extensionUri = extensionUri;
    this.output = output;
  }

  /** Forgets the playset and its definitions; open previews draw again. */
  reset(): void {
    this.index = undefined;
    for (const refresh of this.panels) void refresh();
  }

  private playset(): Promise<{ files: GameFiles; index: EntityIndex } | undefined> {
    this.index ??= linkedFiles().then(async (linked) =>
      linked === undefined
        ? undefined
        : { files: linked.files, index: await loadEntityIndex(linked.files) },
    );
    return this.index;
  }

  /** The message for one entity of an `.asset` file, with the file's current text in the index. */
  private async message(uri: vscode.Uri, name: string): Promise<MeshHostMessage | string> {
    const loaded = await this.playset();
    if (loaded === undefined) {
      return "An entity resolves through the game's .gfx and .asset files: set etch.gamePath to the game folder.";
    }
    const { files, index } = loaded;
    const document = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === uri.toString(),
    );
    const text = document?.getText() ?? new TextDecoder().decode(await read(uri.fsPath));
    const folder = layerFolder(files, uri.fsPath);
    const gamePath =
      folder === undefined
        ? path.basename(uri.fsPath)
        : folder === ''
          ? path.basename(uri.fsPath)
          : `${folder}/${path.basename(uri.fsPath)}`;
    const own = readAssetFile(parseScript(text), gamePath);
    const merged = new EntityIndex();
    for (const [key, value] of index.pdxmeshes) merged.pdxmeshes.set(key, value);
    for (const [key, value] of index.entities) merged.entities.set(key, value);
    for (const [key, value] of index.animations) merged.animations.set(key, value);
    for (const entity of own.entities) merged.entities.set(entity.name, entity);
    for (const animation of own.animations) merged.animations.set(animation.name, animation);
    const entity = resolveEntity(merged, name);
    if (entity === undefined) return `No entity "${name}" in ${path.basename(uri.fsPath)}.`;
    return entityMessage(
      entity,
      files,
      folder === undefined ? path.dirname(uri.fsPath) : undefined,
    );
  }

  open(uri: vscode.Uri, name: string): void {
    const panel = vscode.window.createWebviewPanel(
      ENTITY_PREVIEW_VIEW_TYPE,
      `Entity: ${name}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')] },
    );
    const { webview } = panel;
    webview.html = meshHtml(webview, this.extensionUri);
    let ready = false;
    const post = async (): Promise<void> => {
      if (!ready) return;
      try {
        const message = await this.message(uri, name);
        if (typeof message === 'string') {
          this.report({ name, ok: false, message });
          void vscode.window.showWarningMessage(message);
          return;
        }
        await webview.postMessage(message);
      } catch (error) {
        this.report({
          name,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };
    this.panels.add(post);
    const subscriptions = [
      webview.onDidReceiveMessage((message: MeshWebviewMessage) => {
        if (message.type === 'ready') {
          ready = true;
          void post();
        } else if (message.type === 'shown') {
          this.report({ name, ok: true, summary: message.summary });
        } else if (message.type === 'failed') {
          this.report({ name, ok: false, message: message.message });
        }
      }),
    ];
    panel.onDidDispose(() => {
      this.panels.delete(post);
      for (const subscription of subscriptions) subscription.dispose();
    });
  }

  private report(shown: EntityShown): void {
    if (!shown.ok) this.output.warn(`Entity preview of ${shown.name}: ${shown.message}`);
    this.shown.fire(shown);
  }
}

/** Registers the entity preview's CodeLens and command; the returned API is for Etch's tests. */
export function registerEntityPreview(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): EntityPreviewApi {
  const previews = new EntityPreviews(context.extensionUri, output);
  context.subscriptions.push(
    previews.shown,
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/*.asset' },
      new EntityLenses(),
    ),
    vscode.commands.registerCommand(
      PREVIEW_ENTITY_COMMAND,
      async (uri?: vscode.Uri, name?: string) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target === undefined || !/\.asset$/i.test(target.fsPath)) {
          void vscode.window.showInformationMessage('Open an .asset file to preview its entities.');
          return;
        }
        let chosen = name;
        if (chosen === undefined) {
          const document = await vscode.workspace.openTextDocument(target);
          chosen = await vscode.window.showQuickPick(
            entitiesOf(document.getText()).map((entity) => entity.name),
            { placeHolder: 'Entity to preview' },
          );
        }
        if (chosen !== undefined) previews.open(target, chosen);
      },
    ),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (/\.(?:asset|gfx)$/i.test(document.fileName)) previews.reset();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('etch.gamePath') ||
        event.affectsConfiguration('etch.playset')
      ) {
        previews.reset();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      previews.reset();
    }),
  );
  return { onDidShow: previews.shown.event };
}
