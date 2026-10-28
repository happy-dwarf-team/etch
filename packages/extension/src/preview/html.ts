import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

/**
 * The neutral background the transparent render is composited over (spec section 2): mid grey,
 * independent of the colour theme.
 */
export const BACKDROP = '#808080';

/**
 * The preview's page: a toolbar (previewed window, the menus, the zoom, the live game's start,
 * resolution, pin),
 * notices, the canvas the webview script (`dist/webview.js`, from `webview/main.ts`) draws into,
 * and the outlines of the hovered and the highlighted widget over it. Textures are fetched from the game and mod folders
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
  header > button, #zoom > button { flex-shrink: 0; white-space: nowrap; }
  button {
    font: inherit; color: var(--vscode-foreground);
    background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, transparent);
    padding: 1px 6px;
  }
  button[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  /* The menus of the toolbar: View ▾ (spec section 4), and Data ▾ beside it (section 5). */
  #menus { display: flex; gap: 4px; position: relative; }
  .popup {
    position: absolute; z-index: 10; top: calc(100% + 2px); left: 0; min-width: 280px; max-width: 420px;
    max-height: 70vh; overflow: auto; padding: 4px 0;
    background: var(--vscode-menu-background, var(--vscode-dropdown-background));
    color: var(--vscode-menu-foreground, var(--vscode-foreground));
    border: 1px solid var(--vscode-menu-border, var(--vscode-dropdown-border, transparent));
    box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.36));
  }
  .popup[hidden] { display: none; }
  .popup h4 { margin: 6px 10px 2px; font-size: 0.85em; text-transform: uppercase; opacity: 0.7; }
  .popup .item {
    display: flex; align-items: center; gap: 6px; width: 100%; box-sizing: border-box;
    padding: 2px 10px; border: 0; background: none; text-align: left; cursor: pointer;
  }
  .popup .item:hover:not(:disabled) { background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground)); }
  .popup .item:disabled { opacity: 0.5; cursor: default; }
  .popup .row { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; align-items: center; padding: 2px 10px; }
  .popup select { font: inherit; max-width: 170px; }
  .popup .source { font-size: 0.85em; opacity: 0.75; }
  .popup .release { padding: 0 4px; }
  .popup hr { border: 0; border-top: 1px solid var(--vscode-menu-separatorBackground, var(--vscode-panel-border, #555)); margin: 4px 0; }
  #notices { margin: 0; padding: 0; list-style: none; }
  #notices li {
    padding: 4px 8px; border-left: 3px solid var(--vscode-notificationsInfoIcon-foreground);
    white-space: pre-wrap;
  }
  #notices li.warning { border-color: var(--vscode-notificationsWarningIcon-foreground); }
  #notices li.error { border-color: var(--vscode-notificationsErrorIcon-foreground); }
  #notices li.link { display: flex; align-items: center; gap: 8px; }
  .popup .layer { display: grid; grid-template-columns: auto 1fr auto; gap: 6px; align-items: baseline; padding: 2px 10px; }
  .popup .layer .count { font-size: 0.85em; opacity: 0.75; }
  .popup .detail { padding: 0 10px 2px 30px; font-size: 0.85em; opacity: 0.8; }
  .popup .actions { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 10px 4px 30px; }
  .popup .warning { color: var(--vscode-notificationsWarningIcon-foreground); }
  .popup .note { padding: 2px 10px; font-size: 0.85em; opacity: 0.85; }
  main { flex: 1; min-height: 0; position: relative; overflow: hidden; }
  main.pannable { cursor: grab; }
  main.panning { cursor: grabbing; }
  /* Placed and sized by the webview script from the zoom (etch#162); sharp pixels above 100 %. */
  canvas { position: absolute; left: 0; top: 0; background: ${BACKDROP}; }
  canvas.sharp { image-rendering: pixelated; }
  #zoom { display: flex; gap: 2px; }
  #zoom-level { min-width: 72px; }
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
  <span id="menus">
    <button id="view-menu" type="button" aria-haspopup="true" aria-expanded="false" hidden>View ▾</button>
    <div id="view-popup" class="popup" role="menu" hidden></div>
    <button id="data-menu" type="button" aria-haspopup="true" aria-expanded="false" hidden>Data ▾</button>
    <div id="data-popup" class="popup" role="menu" hidden></div>
  </span>
  <span class="spacer"></span>
  <span id="zoom" role="group" aria-label="Zoom">
    <button id="zoom-out" type="button" title="Zoom out (Ctrl+-, Ctrl+wheel)">−</button>
    <button id="zoom-level" type="button">Fit</button>
    <button id="zoom-in" type="button" title="Zoom in (Ctrl+=, Ctrl+wheel)">+</button>
  </span>
  <button id="live-game" type="button" title="Start the live game with this playset (Etch: Start the Live Game).">Live game</button>
  <button id="resolution" type="button">1920×1080</button>
  <button id="pin" type="button" aria-pressed="false" disabled>Pin</button>
</header>
<ul id="notices"></ul>
<main id="stage">
  <canvas id="screen" hidden></canvas>
  <div id="selected" class="box" hidden></div>
  <div id="hover" class="box" hidden></div>
  <div id="tip" hidden></div>
</main>
<script nonce="${nonce}" src="${script.toString()}"></script>
</body>
</html>`;
}
