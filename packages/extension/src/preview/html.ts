import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

/**
 * The neutral background the transparent render is composited over, the same for both backends
 * (spec section 2): mid grey, independent of the colour theme.
 */
export const BACKDROP = '#808080';

/**
 * The preview's page: a toolbar (previewed window, backend switch, resolution, pin), notices, the canvas the
 * webview script (`dist/webview.js`, from `webview/main.ts`) draws into, and the outlines of the
 * hovered and the highlighted widget over it. Textures are fetched from the game and mod folders
 * through webview URIs, so `connect-src` allows them.
 */
export function previewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString('base64');
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    `connect-src ${webview.cspSource}`,
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
    display: flex; align-items: center; gap: 8px; padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
  }
  #title { font-weight: 600; }
  #file { min-width: 0; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .spacer { flex: 1; }
  select, button {
    font: inherit; color: var(--vscode-foreground);
    background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, transparent);
    padding: 1px 6px;
  }
  button[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  #notices { margin: 0; padding: 0; list-style: none; }
  #notices li { padding: 4px 8px; border-left: 3px solid var(--vscode-notificationsInfoIcon-foreground); }
  #notices li.warning { border-color: var(--vscode-notificationsWarningIcon-foreground); }
  #notices li.error { border-color: var(--vscode-notificationsErrorIcon-foreground); }
  label { white-space: nowrap; }
  main { flex: 1; min-height: 0; position: relative; }
  /* Scaled down to fit, keeping its aspect ratio, and centred. */
  canvas {
    position: absolute; inset: 8px; margin: auto; max-width: calc(100% - 16px); max-height: calc(100% - 16px);
    background: ${BACKDROP};
  }
  canvas[hidden], .box[hidden], #tip[hidden] { display: none; }
  .box { position: absolute; pointer-events: none; box-sizing: border-box; }
  #hover { border: 1px dashed var(--vscode-editorCursor-foreground, #fff); }
  #selected { border: 2px solid var(--vscode-focusBorder, #0af); }
  #tip {
    position: absolute; pointer-events: none; white-space: pre; padding: 2px 6px;
    background: var(--vscode-editorHoverWidget-background, #252526);
    color: var(--vscode-editorHoverWidget-foreground, #ccc);
    border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
  }
</style>
</head>
<body>
<header>
  <span id="title">Etch preview</span>
  <span id="file"></span>
  <span class="spacer"></span>
  <label>Backend
    <select id="backend">
      <option value="offline">Offline renderer</option>
      <option value="game-host" disabled>Game host (not yet available)</option>
    </select>
  </label>
  <button id="resolution" type="button">1920×1080</button>
  <button id="pin" type="button" aria-pressed="false" disabled>Pin</button>
</header>
<ul id="notices"></ul>
<main>
  <canvas id="screen" hidden></canvas>
  <div id="selected" class="box" hidden></div>
  <div id="hover" class="box" hidden></div>
  <div id="tip" hidden></div>
</main>
<script nonce="${nonce}" src="${script.toString()}"></script>
</body>
</html>`;
}
