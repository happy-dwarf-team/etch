import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { CONTROLS_CSS, zoomControl } from '../webview-controls.ts';

/**
 * The neutral background the transparent render is composited over (spec section 2): mid grey,
 * independent of the colour theme.
 */
export const BACKDROP = '#808080';

/**
 * The preview's page: a toolbar (the previewed window, which opens the window list, the menus,
 * the zoom, the live game's start, resolution),
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
  ${CONTROLS_CSS}
  header { flex-wrap: nowrap; }
  #title { font-weight: 600; white-space: nowrap; max-width: 40vw; overflow: hidden; text-overflow: ellipsis; }
  #pinned {
    flex: none; padding: 0 5px; border-radius: 9px; font-size: 0.85em; line-height: 16px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
  }
  /* The window list under the title (etch#648, finding P1.3): a filter and the file's windows. */
  #windows-pop { width: 440px; padding: 6px; }
  #window-filter { width: 100%; box-sizing: border-box; margin-bottom: 6px; }
  #window-list { max-height: 50vh; overflow: auto; }
  #window-list .item {
    display: grid; grid-template-columns: 14px 1fr auto; gap: 2px 6px; align-items: baseline; width: 100%;
    height: auto; min-height: 24px; padding: 3px 8px; box-sizing: border-box; border: 0; border-radius: 3px;
    background: none; color: inherit; text-align: left;
  }
  #window-list .item:hover, #window-list .item:focus {
    background: var(--vscode-list-hoverBackground); outline: none;
  }
  #window-list .item:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  #window-list .item[aria-selected="true"] .mark::before { content: '✓'; }
  #window-list .aside { color: var(--vscode-descriptionForeground); font-size: 0.92em; white-space: nowrap; }
  #window-list .sub { grid-column: 2 / 4; color: var(--vscode-descriptionForeground); font-size: 0.92em; }
  #window-list .head {
    margin: 8px 8px 2px; font-size: 0.85em; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
  }
  #window-list .none { margin: 4px 8px; color: var(--vscode-descriptionForeground); }
  #file { min-width: 0; margin-right: 4px; color: var(--vscode-descriptionForeground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
    display: flex; align-items: center; justify-content: flex-start; gap: 6px; width: 100%; height: auto;
    min-height: 24px; box-sizing: border-box; padding: 2px 10px; border: 0; border-radius: 0;
    background: none; text-align: left; white-space: normal; cursor: pointer;
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
  #notices li.link, #notices li.action { display: flex; align-items: center; gap: 8px; }
  .popup .layer { display: grid; grid-template-columns: auto 1fr auto; gap: 6px; align-items: baseline; padding: 2px 10px; }
  .popup .layer .count { font-size: 0.85em; opacity: 0.75; }
  .popup .layer.list { grid-template-columns: 1fr auto auto auto; }
  .popup .layer.list button { min-width: 1.8em; }
  .popup .detail { padding: 0 10px 2px 30px; font-size: 0.85em; opacity: 0.8; }
  .popup .actions { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 10px 4px 30px; }
  .popup .warning { color: var(--vscode-notificationsWarningIcon-foreground); }
  .popup .note { padding: 2px 10px; font-size: 0.85em; opacity: 0.85; }
  /* The backdrop fills the panel, so that a fitted window sits in the middle of it; a dashed
     line marks the edge of the screen where it is in view (etch#648, finding P1.3). */
  main { flex: 1; min-height: 0; position: relative; overflow: hidden; background: ${BACKDROP}; }
  main.pannable { cursor: grab; }
  main.panning { cursor: grabbing; }
  /* Placed and sized by the webview script from the zoom (etch#162); sharp pixels above 100 %. */
  canvas { position: absolute; left: 0; top: 0; background: ${BACKDROP}; outline: 1px dashed rgba(0, 0, 0, 0.45); }
  canvas.sharp { image-rendering: pixelated; }
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
  <button id="title" class="field" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="windows-pop" title="The previewed window: the one around the cursor in the editor. Click to choose one and pin it.">Etch preview</button>
  <span id="pinned" title="The preview stays on this window while you edit. Choose Follow the cursor in the window list to follow the cursor again." hidden>Pinned</span>
  <span id="file"></span>
  <span id="menus">
    <button id="view-menu" type="button" aria-haspopup="true" aria-expanded="false" hidden>View ▾</button>
    <div id="view-popup" class="popup" role="menu" hidden></div>
    <button id="data-menu" type="button" aria-haspopup="true" aria-expanded="false" hidden>Data ▾</button>
    <div id="data-popup" class="popup" role="menu" hidden></div>
  </span>
  <span class="spacer"></span>
  ${zoomControl({ wheel: 'Ctrl+wheel' })}
  <button id="live-game" type="button" title="Start the live game with this playset (Etch: Start the Live Game).">Live game</button>
  <button id="resolution" class="field" type="button">1920×1080</button>
</header>
<div id="windows-pop" class="pop" role="dialog" aria-label="Previewed window" hidden>
  <input id="window-filter" type="text" spellcheck="false" placeholder="Filter the windows" aria-label="Filter the windows" aria-controls="window-list">
  <div id="window-list" role="listbox" aria-label="Windows"></div>
</div>
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
