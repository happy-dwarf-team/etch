// One look for the controls of Etch's three webviews: the interface preview (preview/html.ts),
// the texture preview (texture-preview.ts) and the mesh and entity preview (mesh-preview.ts).
// Each page puts this sheet first in its own <style> and adds only what its view needs. It uses
// VS Code's theme colours alone, so it follows every theme, high contrast included (etch#648,
// finding P1.4).

/**
 * The shared rules:
 *
 * - the page and its toolbar (`header`): one row of 34 px, groups split by `.sep`, `.spacer`
 *   pushing what follows to the right;
 * - buttons 26 px high with the editor toolbar's colours and a focus ring;
 * - a toggle (`aria-pressed`) in VS Code's option colours, as Match Case in Find;
 * - `.field`: a button that shows a value, framed like a dropdown;
 * - `.seg` (`role="radiogroup"`): one choice of a few, its buttons `role="radio"` with
 *   `aria-checked`; `.checks` (`role="group"`) with `.tog` buttons, each with a `.tick`: toggles
 *   that add up. The two sets look different, so a set that adds up never reads as one choice;
 *   `.group-label` names a set;
 * - selects and text inputs 26 px high;
 * - `#error` and the notices, the `footer`, and `[hidden]`.
 */
export const CONTROLS_CSS = `
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--vscode-editor-background); color: var(--vscode-foreground);
    font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
  }
  [hidden] { display: none !important; }
  :focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  header {
    display: flex; flex-wrap: wrap; align-items: center; gap: 2px 4px; flex: none;
    min-height: 34px; padding: 3px 6px; box-sizing: border-box;
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
  }
  .spacer { flex: 1; }
  .sep { width: 1px; align-self: stretch; margin: 5px 4px; background: var(--vscode-panel-border, transparent); flex: none; }
  button {
    display: inline-flex; align-items: center; justify-content: center; gap: 5px; flex: none;
    min-width: 26px; height: 26px; padding: 0 7px; box-sizing: border-box; white-space: nowrap;
    font: inherit; color: inherit; background: transparent;
    border: 1px solid transparent; border-radius: 4px; cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground); }
  button:active:not(:disabled), button[aria-expanded="true"] { background: var(--vscode-toolbar-activeBackground); }
  button:disabled { opacity: 0.45; cursor: default; }
  button[aria-pressed="true"] {
    background: var(--vscode-inputOption-activeBackground);
    border-color: var(--vscode-inputOption-activeBorder, transparent);
    color: var(--vscode-inputOption-activeForeground, inherit);
  }
  /* A toggle that is on has a border in the focus colour already: its focus ring goes outside it. */
  button[aria-pressed="true"]:focus-visible, button[aria-checked="true"]:focus-visible { outline-offset: 1px; }
  button.field {
    color: var(--vscode-dropdown-foreground, inherit); background: var(--vscode-dropdown-background);
    border-color: var(--vscode-dropdown-border, transparent); font-variant-numeric: tabular-nums;
  }
  button.field:hover:not(:disabled) { background: var(--vscode-dropdown-background); border-color: var(--vscode-focusBorder); }
  .group-label { margin: 0 2px 0 4px; font-size: 0.92em; color: var(--vscode-descriptionForeground); white-space: nowrap; }
  .seg {
    display: inline-flex; gap: 1px; padding: 1px; flex: none;
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border, transparent)); border-radius: 5px;
  }
  .seg button { position: relative; height: 24px; }
  .seg button[aria-checked="true"] {
    background: var(--vscode-inputOption-activeBackground);
    border-color: var(--vscode-inputOption-activeBorder, transparent);
    color: var(--vscode-inputOption-activeForeground, inherit);
  }
  .seg button + button::before {
    content: ''; position: absolute; left: -1px; top: 5px; bottom: 5px; width: 1px;
    background: var(--vscode-dropdown-border, var(--vscode-panel-border, transparent));
  }
  .seg button[aria-checked="true"]::before, .seg button[aria-checked="true"] + button::before { display: none; }
  .checks { display: inline-flex; align-items: center; gap: 1px; flex: none; }
  .checks button.tog { padding: 0 6px 0 5px; }
  .checks button.tog[aria-pressed] { background: transparent; border-color: transparent; color: inherit; }
  .checks button.tog[aria-pressed]:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground); }
  .checks button.tog[aria-pressed="false"] { color: var(--vscode-descriptionForeground); }
  .tick {
    position: relative; display: inline-block; flex: none; width: 14px; height: 14px; box-sizing: border-box;
    border: 1px solid var(--vscode-checkbox-border, var(--vscode-dropdown-border, currentColor)); border-radius: 3px;
    background: var(--vscode-checkbox-background, transparent);
  }
  .tog[aria-pressed="true"] .tick { border-color: var(--vscode-inputOption-activeBorder, var(--vscode-focusBorder)); }
  .tog[aria-pressed="true"] .tick::after {
    content: ''; position: absolute; left: 4px; top: 1px; width: 3px; height: 7px;
    border: solid var(--vscode-checkbox-foreground, currentColor); border-width: 0 2px 2px 0; transform: rotate(45deg);
  }
  select, input[type="text"], input:not([type]) {
    font: inherit; height: 26px; box-sizing: border-box; padding: 0 6px; border-radius: 2px;
  }
  select {
    color: var(--vscode-dropdown-foreground, var(--vscode-foreground)); background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border, transparent);
  }
  input[type="text"], input:not([type]) {
    color: var(--vscode-input-foreground); background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
  }
  input::placeholder { color: var(--vscode-input-placeholderForeground); }
  input[type="range"] { accent-color: var(--vscode-button-background); vertical-align: middle; }
  #error {
    margin: 0; padding: 4px 8px 4px 10px; white-space: pre-wrap; flex: none;
    border-left: 3px solid var(--vscode-notificationsErrorIcon-foreground);
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
  }
  footer {
    flex: none; padding: 3px 10px; min-height: 1.5em; font-size: 0.92em; white-space: pre;
    color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums;
    border-top: 1px solid var(--vscode-panel-border, transparent);
  }
  .zoom { display: inline-flex; align-items: center; gap: 1px; flex: none; }
  .zoom #zoom-level { min-width: 7.5em; }
`;

/**
 * The zoom control, the same in all three previews (etch#648, finding P2.6): −, the level, +.
 * The level shows the zoom and its click switches between fitting the view and the view's
 * own size; the webview script (with `webview/zoom-keys.ts` for the keys) makes them work.
 * `wheel` names the wheel that zooms, for the tooltips.
 */
export function zoomControl(wheel: string): string {
  return `<span id="zoom" class="zoom" role="group" aria-label="Zoom">
    <button id="zoom-out" type="button" title="Zoom out (Ctrl+-, ${wheel})" aria-label="Zoom out">−</button>
    <button id="zoom-level" class="field" type="button">Fit</button>
    <button id="zoom-in" type="button" title="Zoom in (Ctrl+=, ${wheel})" aria-label="Zoom in">+</button>
  </span>`;
}
