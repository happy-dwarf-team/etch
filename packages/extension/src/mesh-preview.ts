// The mesh preview (etch.meshPreview): a read-only custom editor for `.mesh` files. The extension
// reads the mesh, decodes the diffuse, normal and specular textures its materials name with
// `@etch/renderer`'s readers
// (a bare name is in the mesh's folder, as vanilla keeps them: through the playset when the mesh is
// in one of its layers, so a mod's texture wins over the game's, else on disk beside the mesh; a
// `.tga` name also tries `.dds`), and lists the `.anim` files beside it whose joints name the mesh's
// bones. The webview script
// (`dist/mesh-webview.js`, from `webview/mesh.ts`) parses the mesh with `@etch/core/asset`, draws
// it with WebGL2 and plays an animation the user picks, skinned on the CPU.

import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { textureCandidates } from '@etch/core';
import { jointsOfBones, readAnimation, readMesh, type PdxMesh } from '@etch/core/asset';
import type { GameFiles } from '@etch/core/playset';
import { inspectTexture } from '@etch/renderer/inspect';
import { layerFolder } from './asset-links.ts';
import type {
  MeshAnimationEntry,
  MeshHostMessage,
  MeshSummary,
  MeshTexture,
  MeshWebviewMessage,
} from './mesh-protocol.ts';
import { linkedFiles } from './script-profile-view.ts';

export const MESH_PREVIEW_VIEW_TYPE = 'etch.meshPreview';

export type MeshShown =
  | { readonly uri: vscode.Uri; readonly ok: true; readonly summary: MeshSummary }
  | { readonly uri: vscode.Uri; readonly ok: false; readonly message: string };

export interface MeshPreviewApi {
  /** Fires each time a mesh preview has drawn a file (or a new animation) or failed to. */
  readonly onDidShow: vscode.Event<MeshShown>;
}

class MeshDocument implements vscode.CustomDocument {
  readonly uri: vscode.Uri;

  constructor(uri: vscode.Uri) {
    this.uri = uri;
  }

  dispose(): void {}
}

export async function read(file: string): Promise<Uint8Array> {
  return Uint8Array.from(await vscode.workspace.fs.readFile(vscode.Uri.file(file)));
}

async function exists(file: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(file));
    return true;
  } catch {
    return false;
  }
}

/** The file a material's bare texture name leads to, and where it came from. */
async function findTexture(
  name: string,
  meshFile: string,
  files: GameFiles | undefined,
): Promise<{ file: string; source: string } | undefined> {
  const folder = files === undefined ? undefined : layerFolder(files, meshFile);
  for (const candidate of textureCandidates(name)) {
    if (files !== undefined && folder !== undefined) {
      const found = await files.find(folder === '' ? candidate : `${folder}/${candidate}`);
      if (found !== undefined) {
        const source = found.layer.name === 'game' ? 'the game' : found.layer.name;
        return { file: found.absolutePath, source };
      }
    }
    const beside = path.join(path.dirname(meshFile), candidate);
    if (await exists(beside)) return { file: beside, source: 'beside the mesh' };
  }
  return undefined;
}

/** The diffuse, normal and specular textures of a mesh's drawn parts, decoded, by file name. */
export async function texturesOf(
  mesh: PdxMesh,
  meshFile: string,
  files: GameFiles | undefined,
): Promise<Record<string, MeshTexture>> {
  const textures: Record<string, MeshTexture> = {};
  const names = mesh.shapes
    .filter((shape) => !shape.collision)
    .flatMap((shape) => shape.parts)
    .flatMap(({ material }) => [material.diffuse, material.normal, material.specular]);
  for (const name of names) {
    if (name === undefined || name in textures) continue;
    const found = await findTexture(name, meshFile, files);
    if (found === undefined) {
      textures[name] = { ok: false, message: `not found: ${textureCandidates(name).join(', ')}` };
      continue;
    }
    try {
      const { summary, rgba } = inspectTexture(found.file, await read(found.file));
      textures[name] = {
        ok: true,
        width: summary.width,
        height: summary.height,
        rgba,
        source: found.source,
      };
    } catch (error) {
      textures[name] = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return textures;
}

/** The `.anim` files beside the mesh whose joints name at least half of a skinned shape's bones. */
async function animationsOf(
  mesh: PdxMesh,
  folder: string,
  stem: string,
): Promise<MeshAnimationEntry[]> {
  const skeletons = mesh.shapes.filter((shape) => shape.skeleton.length > 0);
  if (skeletons.length === 0) return [];
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folder));
  } catch {
    return [];
  }
  const found: MeshAnimationEntry[] = [];
  for (const [name, type] of entries) {
    if (type !== vscode.FileType.File || !/\.anim$/i.test(name)) continue;
    try {
      const animation = readAnimation(await read(path.join(folder, name)));
      const fits = skeletons.some((shape) => {
        const named = jointsOfBones(shape.skeleton, animation).filter((j) => j !== undefined);
        return named.length * 2 >= shape.skeleton.length;
      });
      if (fits) found.push({ name, frames: animation.frames, fps: animation.fps });
    } catch {
      // An animation Etch cannot read is not offered.
    }
  }
  // The mesh's own animations first (`carrack_idle.anim` for `carrack.mesh`): ships and units
  // share bone names, so other meshes' animations beside it fit as well.
  const own = (entry: MeshAnimationEntry): number =>
    entry.name.toLowerCase().startsWith(`${stem.toLowerCase()}_`) ? 0 : 1;
  return found.sort((a, b) => own(a) - own(b) || a.name.localeCompare(b.name));
}

class MeshPreviewProvider implements vscode.CustomReadonlyEditorProvider<MeshDocument> {
  readonly shown = new vscode.EventEmitter<MeshShown>();
  private readonly extensionUri: vscode.Uri;
  private readonly output: vscode.LogOutputChannel;
  private files: Promise<GameFiles | undefined> | undefined;

  constructor(extensionUri: vscode.Uri, output: vscode.LogOutputChannel) {
    this.extensionUri = extensionUri;
    this.output = output;
  }

  /** Forgets the playset: after a setting or the workspace folders change. */
  reset(): void {
    this.files = undefined;
  }

  private playset(): Promise<GameFiles | undefined> {
    this.files ??= linkedFiles().then(
      (linked) => linked?.files,
      (error: unknown) => {
        this.output.warn(
          `Mesh preview: the playset could not be read, textures come from beside the mesh: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return undefined;
      },
    );
    return this.files;
  }

  openCustomDocument(uri: vscode.Uri): MeshDocument {
    return new MeshDocument(uri);
  }

  resolveCustomEditor(document: MeshDocument, panel: vscode.WebviewPanel): void {
    const { webview } = panel;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };
    webview.html = meshHtml(webview, this.extensionUri);
    const uri = document.uri;
    const file = uri.fsPath;
    const folder = path.dirname(file);
    const name = path.basename(file);

    let ready = false;
    const post = async (): Promise<void> => {
      if (!ready) return;
      let bytes: Uint8Array;
      let mesh: PdxMesh;
      try {
        bytes = await read(file);
        mesh = readMesh(bytes);
      } catch (error) {
        this.report({
          uri,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      const message: MeshHostMessage = {
        type: 'mesh',
        name,
        bytes,
        textures: await texturesOf(mesh, file, await this.playset()),
        animations: await animationsOf(mesh, folder, path.basename(file, path.extname(file))),
      };
      await webview.postMessage(message);
    };

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(folder), '*.{mesh,dds,tga,anim}'),
    );
    const subscriptions = [
      watcher,
      watcher.onDidChange(() => void post()),
      watcher.onDidCreate(() => void post()),
      webview.onDidReceiveMessage(async (message: MeshWebviewMessage) => {
        if (message.type === 'ready') {
          ready = true;
          void post();
        } else if (message.type === 'animation') {
          // Only a name the host offered: a plain file name beside the mesh.
          if (path.basename(message.name) !== message.name || !/\.anim$/i.test(message.name)) {
            return;
          }
          try {
            const bytes = await read(path.join(folder, message.name));
            const reply: MeshHostMessage = { type: 'animation', name: message.name, bytes };
            await webview.postMessage(reply);
          } catch (error) {
            this.report({
              uri,
              ok: false,
              message: `cannot read ${message.name}: ${String(error)}`,
            });
          }
        } else if (message.type === 'shown') {
          this.report({ uri, ok: true, summary: message.summary });
        } else {
          this.report({ uri, ok: false, message: message.message });
        }
      }),
    ];
    panel.onDidDispose(() => {
      for (const subscription of subscriptions) subscription.dispose();
    });
  }

  private report(shown: MeshShown): void {
    if (!shown.ok) this.output.warn(`Mesh preview of ${shown.uri.fsPath}: ${shown.message}`);
    this.shown.fire(shown);
  }
}

/** Registers the mesh preview; the returned API is for Etch's tests. */
export function registerMeshPreview(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): MeshPreviewApi {
  const provider = new MeshPreviewProvider(context.extensionUri, output);
  context.subscriptions.push(
    provider.shown,
    vscode.window.registerCustomEditorProvider(MESH_PREVIEW_VIEW_TYPE, provider, {
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('etch.gamePath') ||
        event.affectsConfiguration('etch.playset')
      ) {
        provider.reset();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      provider.reset();
    }),
  );
  return { onDidShow: provider.shown.event };
}

export function meshHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString('base64');
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'mesh-webview.js'));
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
  ].join('; ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style nonce="${nonce}">
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--vscode-editor-background); color: var(--vscode-foreground);
    font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
  }
  header {
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
  }
  #facts { display: flex; flex-wrap: wrap; gap: 4px 12px; }
  #facts span { white-space: nowrap; }
  .spacer { flex: 1; }
  input[type="color"] { width: 24px; height: 20px; padding: 0; border: none; background: none; vertical-align: middle; }
  button, select {
    font: inherit; color: var(--vscode-foreground);
    background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, transparent);
    padding: 1px 6px;
  }
  button[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  [hidden] { display: none !important; }
  #error {
    margin: 8px; padding: 4px 8px; white-space: pre-wrap;
    border-left: 3px solid var(--vscode-notificationsErrorIcon-foreground);
  }
  main { flex: 1; position: relative; min-height: 0; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; }
  canvas:active { cursor: grabbing; }
  footer { padding: 2px 8px; min-height: 1.4em; opacity: 0.8; font-variant-numeric: tabular-nums; white-space: pre; }
</style>
</head>
<body>
<header>
  <div id="facts"></div>
  <div class="spacer"></div>
  <select id="animation" title="Animation beside the mesh" aria-label="Animation" hidden></select>
  <button id="play" aria-pressed="false" title="Play or pause the animation" hidden>Play</button>
  <span id="colours" title="The country colours a PdxMeshColor part shows (the specular map's R, G and B mask them)" hidden>
    <input type="color" id="primary" value="#bf291f" aria-label="Primary country colour">
    <input type="color" id="secondary" value="#ebe0bf" aria-label="Secondary country colour">
    <input type="color" id="tertiary" value="#264d99" aria-label="Tertiary country colour">
  </span>
  <button id="maps" aria-pressed="true" title="Draw the normal and specular maps">Maps</button>
  <button id="wireframe" aria-pressed="false" title="Show the triangle edges">Wire</button>
  <button id="reset" title="Frame the whole mesh">Reset view</button>
</header>
<div id="error" role="alert" hidden></div>
<main><canvas id="canvas"></canvas></main>
<footer id="status"></footer>
<script nonce="${nonce}" src="${script.toString()}"></script>
</body>
</html>`;
}
