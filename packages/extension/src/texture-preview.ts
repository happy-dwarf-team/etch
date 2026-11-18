// The texture preview (etch.texturePreview): a read-only custom editor for `.dds` and `.tga`
// files, which VS Code cannot open itself. The extension reads the file and posts its bytes; the
// webview script (`dist/texture-webview.js`, from `webview/texture.ts`) decodes them with
// `@etch/renderer`'s readers, the same ones the interface preview draws with, and shows a mip
// level with the header's facts. A change on disk (an export from an image editor)
// shows again without reopening.

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { TextureSummary } from '@etch/renderer/inspect';
import type { TextureHostMessage, TextureWebviewMessage } from './texture-protocol.ts';

export const TEXTURE_PREVIEW_VIEW_TYPE = 'etch.texturePreview';

/** What one texture preview showed, for Etch's tests and the output channel. */
export type TextureShown =
  | { readonly uri: vscode.Uri; readonly ok: true; readonly summary: TextureSummary }
  | { readonly uri: vscode.Uri; readonly ok: false; readonly message: string };

export interface TexturePreviewApi {
  /** Fires each time a texture preview has drawn a file or failed to read it. */
  readonly onDidShow: vscode.Event<TextureShown>;
}

class TextureDocument implements vscode.CustomDocument {
  readonly uri: vscode.Uri;

  constructor(uri: vscode.Uri) {
    this.uri = uri;
  }

  dispose(): void {}
}

class TexturePreviewProvider implements vscode.CustomReadonlyEditorProvider<TextureDocument> {
  readonly shown = new vscode.EventEmitter<TextureShown>();
  private readonly extensionUri: vscode.Uri;
  private readonly output: vscode.LogOutputChannel;

  constructor(extensionUri: vscode.Uri, output: vscode.LogOutputChannel) {
    this.extensionUri = extensionUri;
    this.output = output;
  }

  openCustomDocument(uri: vscode.Uri): TextureDocument {
    return new TextureDocument(uri);
  }

  resolveCustomEditor(document: TextureDocument, panel: vscode.WebviewPanel): void {
    const { webview } = panel;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };
    webview.html = textureHtml(webview, this.extensionUri);
    const uri = document.uri;
    const name = uri.path.slice(uri.path.lastIndexOf('/') + 1);

    let ready = false;
    const post = async (): Promise<void> => {
      if (!ready) return;
      let bytes: Uint8Array;
      try {
        bytes = await vscode.workspace.fs.readFile(uri);
      } catch (error) {
        this.report({ uri, ok: false, message: `cannot read the file: ${String(error)}` });
        return;
      }
      // A plain array of its own: `readFile` gives a Node Buffer, which does not reach the
      // webview as bytes.
      const message: TextureHostMessage = { type: 'texture', name, bytes: Uint8Array.from(bytes) };
      await webview.postMessage(message);
    };

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(uri, '..'), name),
    );
    const subscriptions = [
      watcher,
      watcher.onDidChange(() => void post()),
      watcher.onDidCreate(() => void post()),
      webview.onDidReceiveMessage((message: TextureWebviewMessage) => {
        if (message.type === 'ready') {
          ready = true;
          void post();
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

  private report(shown: TextureShown): void {
    if (!shown.ok) this.output.warn(`Texture preview of ${shown.uri.fsPath}: ${shown.message}`);
    this.shown.fire(shown);
  }
}

/** Registers the texture preview; the returned API is for Etch's tests. */
export function registerTexturePreview(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): TexturePreviewApi {
  const provider = new TexturePreviewProvider(context.extensionUri, output);
  context.subscriptions.push(
    provider.shown,
    vscode.window.registerCustomEditorProvider(TEXTURE_PREVIEW_VIEW_TYPE, provider, {
      supportsMultipleEditorsPerDocument: true,
    }),
  );
  return { onDidShow: provider.shown.event };
}

function textureHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString('base64');
  const script = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'texture-webview.js'),
  );
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
  .group { display: flex; gap: 2px; }
  button {
    font: inherit; color: var(--vscode-foreground);
    background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, transparent);
    padding: 1px 6px;
  }
  button[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  #error {
    margin: 8px; padding: 4px 8px; white-space: pre-wrap;
    border-left: 3px solid var(--vscode-notificationsErrorIcon-foreground);
  }
  #error[hidden] { display: none; }
  main { flex: 1; overflow: auto; display: grid; place-items: center; }
  /* A checkerboard behind the texture, so transparent texels show. */
  #stage {
    background-color: #9a9a9a;
    background-image:
      linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%),
      linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%);
    background-size: 16px 16px; background-position: 0 0, 8px 8px;
    line-height: 0;
  }
  canvas { image-rendering: pixelated; display: block; }
  footer { padding: 2px 8px; min-height: 1.4em; opacity: 0.8; font-variant-numeric: tabular-nums; white-space: pre; }
  select {
    font: inherit; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border, transparent);
  }
  select[hidden] { display: none; }
</style>
</head>
<body>
<header>
  <div id="facts"></div>
  <div class="spacer"></div>
  <select id="level" title="Mip level" aria-label="Mip level" hidden></select>
  <div class="group" id="channels" role="group" aria-label="Channels">
    <button data-channels="rgba" aria-pressed="true" title="Colour over the checkerboard">RGBA</button>
    <button data-channels="rgb" aria-pressed="false" title="Colour without alpha">RGB</button>
    <button data-channels="a" aria-pressed="false" title="Alpha as grey">A</button>
  </div>
  <div class="group" id="zoom" role="group" aria-label="Zoom">
    <button id="zoom-out" title="Zoom out">−</button>
    <button id="zoom-fit" aria-pressed="true" title="Fit the panel">Fit</button>
    <button id="zoom-one" aria-pressed="false" title="One texel per screen pixel">1:1</button>
    <button id="zoom-in" title="Zoom in">+</button>
  </div>
</header>
<div id="error" role="alert" hidden></div>
<main><div id="stage"><canvas id="canvas" width="0" height="0"></canvas></div></main>
<footer id="status"></footer>
<script nonce="${nonce}" src="${script.toString()}"></script>
</body>
</html>`;
}
