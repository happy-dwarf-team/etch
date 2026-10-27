// Pick mode in VS Code (spec section 7): the toggle command, the hotkey setting sent to the
// plugin, and what a pick opens. A pick opens the definition the game reports at its line (a
// template's referencing widget first), read-only when the file is not the edited mod's, with
// **Override in my mod**, "Go to template" and "Go to sprite" as the notice's buttons. The game
// brings VS Code's window forward itself (the plugin, docs/plugin-protocol.md), and pick mode stays
// on. **Etch: Override in My Mod** copies any interface file of the playset into the edited mod.
import { readFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import type { InterfaceIndex } from '@etch/core';
import { PlaysetInterface, type GameFiles } from '@etch/core/playset';
import { DEFAULT_PICK_KEY, pickKey } from './install.ts';
import type { LiveGame } from './live-game.ts';
import {
  gamePathOf,
  interfaceSources,
  overrideInMod,
  resolvePick,
  spriteLocation,
  type PickLocation,
  type PickSources,
  type PickTarget,
} from './pick.ts';
import type { PickEvent } from './pipe.ts';

/** Turns pick mode on or off in the live game and brings the game forward (spec section 2). */
export const TOGGLE_PICK_MODE = 'etch.togglePickMode';
/** Copies an interface file of the playset into the edited mod (spec section 7). */
export const OVERRIDE_IN_MY_MOD = 'etch.overrideInMyMod';
/** The pick mode key setting, in the `etch` section. */
export const PICK_KEY_SETTING = 'liveGame.pickModeKey';
/** VS Code's command that makes the active editor read-only for the session. */
const READ_ONLY = 'workbench.action.files.setActiveEditorReadonlyInSession';

/** A pick and what it opened, for the preview (spec section 7, "The preview takes over"). */
export interface PickOpened {
  readonly pick: PickEvent;
  readonly target: PickTarget | undefined;
  /** From the click in the game to the line shown in the editor, by the system clock. */
  readonly clickToEditorMs: number;
}

/** The pick mode key the setting names, in the plugin's spelling; the default when it is not one. */
export function pickKeySetting(): string {
  const value = vscode.workspace
    .getConfiguration('etch')
    .get<string>(PICK_KEY_SETTING, DEFAULT_PICK_KEY);
  return pickKey(value) ?? DEFAULT_PICK_KEY;
}

export class PickMode implements vscode.Disposable {
  private readonly game: LiveGame;
  private readonly output: vscode.LogOutputChannel;
  private readonly subscriptions: vscode.Disposable[];
  private readonly emitter = new vscode.EventEmitter<PickOpened>();
  /** Whether pick mode is on, as the plugin last said. */
  private on = false;
  private index: { files: GameFiles; index: Promise<InterfaceIndex> } | undefined;
  /** Picks open one after another, in the order they came. */
  private picks: Promise<unknown> = Promise.resolve();

  /** Fires once a pick's definition is open. */
  readonly onDidPick = this.emitter.event;

  constructor(game: LiveGame, output: vscode.LogOutputChannel) {
    this.game = game;
    this.output = output;
    this.subscriptions = [
      this.emitter,
      vscode.commands.registerCommand(TOGGLE_PICK_MODE, () => this.toggle()),
      vscode.commands.registerCommand(OVERRIDE_IN_MY_MOD, (uri?: vscode.Uri) => this.override(uri)),
      game.onDidChangeState((state) => {
        if (state.status === 'ready') void this.configure();
        else if (state.status !== 'stale') this.on = false;
      }),
      game.onDidPush((event) => {
        if (event.kind === 'pickMode') this.on = event.on;
        else if (event.kind === 'pick') {
          const pick = event.pick;
          this.picks = this.picks.then(() => this.opened(pick)).catch(() => undefined);
        }
      }),
      vscode.workspace.onDidChangeConfiguration((change) => {
        if (change.affectsConfiguration(`etch.${PICK_KEY_SETTING}`)) {
          void this.game.pickMode({ key: pickKeySetting() }).catch((error: unknown) => {
            this.output.warn(`The pick mode key was not sent to the live game: ${String(error)}`);
          });
        }
      }),
    ];
  }

  dispose(): void {
    for (const s of this.subscriptions) s.dispose();
  }

  /**
   * Tells a ready game the hotkey, the mods the label names and VS Code's window, which the game
   * brings forward after a pick: the extension host's parent, VS Code's main process, owns it.
   */
  private async configure(): Promise<void> {
    const files = this.game.files;
    try {
      const answer = await this.game.pickMode({
        key: pickKeySetting(),
        ...(files === undefined ? {} : { sources: await interfaceSources(files) }),
        editor: { pid: process.ppid, title: vscode.workspace.name ?? '' },
      });
      if (answer !== undefined) {
        this.on = answer.on;
        this.output.info(`Pick mode is ready in the live game: ${answer.key} turns it on and off.`);
      }
    } catch (error) {
      this.output.warn(`The live game has no pick mode: ${String(error)}`);
    }
  }

  private async toggle(): Promise<void> {
    const status = this.game.state.status;
    if (status !== 'ready' && status !== 'stale') {
      void vscode.window.showInformationMessage(
        'Pick mode works in the live game: start it first (Etch: Start the Live Game).',
      );
      return;
    }
    try {
      const answer = await this.game.pickMode({ on: !this.on, front: true });
      if (answer === undefined) return;
      this.on = answer.on;
      this.output.info(
        `Pick mode ${answer.on ? 'on' : 'off'}; the game ${answer.front === true ? 'came' : 'did not come'} to the front.`,
      );
      if (answer.on && answer.front === false) {
        void vscode.window.showInformationMessage(
          `Pick mode is on: switch to the game to pick a widget (${answer.key} leaves it).`,
        );
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`Pick mode did not change: ${String(error)}`);
    }
  }

  private sources(): PickSources | undefined {
    const files = this.game.files;
    if (files === undefined) return undefined;
    return { files, editedRoot: this.game.editedRoot, text: textOf };
  }

  private interfaceIndex(files: GameFiles): Promise<InterfaceIndex> {
    if (this.index?.files !== files) {
      this.index = { files, index: PlaysetInterface.load(files).then((p) => p.index) };
    }
    return this.index.index;
  }

  /** Opens what a pick names and says what else it offers (spec section 7). */
  private async opened(pick: PickEvent): Promise<void> {
    const sources = this.sources();
    if (sources === undefined) return;
    const target = await resolvePick(pick, sources);
    if (target === 'no-widget' || target === 'no-file') {
      this.output.info(
        `Pick ${String(pick.seq)}: ${pick.chain[0]?.name ?? 'nothing'} has no file to open.`,
      );
      void vscode.window.showInformationMessage(
        target === 'no-widget'
          ? 'Nothing was under the pointer: the map, a tooltip or the console is not a GUI widget.'
          : `The game knows no file for ${pick.chain[0]?.name ?? 'this widget'}.`,
      );
      this.emitter.fire({
        pick,
        target: undefined,
        clickToEditorMs: Date.now() - pick.timing.clickUnixMs,
      });
      return;
    }
    await show(target.open);
    const clickToEditorMs = Date.now() - pick.timing.clickUnixMs;
    this.output.info(
      `Pick ${String(pick.seq)}: ${target.widget.name} → ${target.open.path}:${String(target.open.line + 1)} ` +
        `(${target.match}${target.template === undefined ? '' : `, template ${target.template.path}:${String(target.template.line + 1)}`}), ` +
        `${String(clickToEditorMs)} ms from the click to the line (in the game ${pick.timing.clickToFrameMs.toFixed(1)} + ` +
        `${pick.timing.readMs.toFixed(1)} ms; VS Code ${pick.front ? 'brought' : 'not brought'} forward by the game).`,
    );
    this.emitter.fire({ pick, target, clickToEditorMs });
    void this.offer(target, sources);
  }

  /** The notice after a pick: read-only and the buttons that go further. */
  private async offer(target: PickTarget, sources: PickSources): Promise<void> {
    const override = 'Override in my mod';
    const template = 'Go to template';
    const sprite = 'Go to sprite';
    const buttons = [
      ...(target.open.readOnly && sources.editedRoot !== undefined ? [override] : []),
      ...(target.template === undefined ? [] : [template]),
      ...(target.sprite === undefined ? [] : [sprite]),
    ];
    const what =
      target.template === undefined
        ? target.widget.name
        : `${target.open.name}, which builds ${target.widget.name} from ${target.template.path}`;
    const where = target.open.readOnly
      ? `Defined in ${target.open.layer === 'game' ? 'EU4' : target.open.layer}, read-only`
      : `Defined in your mod`;
    const note =
      target.match === 'file' ? ' (the widget was not found in the file as it is now)' : '';
    if (buttons.length === 0 && !target.open.readOnly) return;
    const chosen = await vscode.window.showInformationMessage(
      `${what}: ${where}${note}.`,
      ...buttons,
    );
    if (chosen === override) await this.overridePath(target.open.path, target.open.line);
    else if (chosen === template && target.template !== undefined) await show(target.template);
    else if (chosen === sprite && target.sprite !== undefined) {
      const found = await spriteLocation(
        target.sprite,
        await this.interfaceIndex(sources.files),
        sources,
      );
      if (found === undefined) {
        void vscode.window.showInformationMessage(
          `No .gfx file of the playset defines ${target.sprite}.`,
        );
      } else await show(found);
    }
  }

  /** **Etch: Override in My Mod** on a file of the playset (the active editor's by default). */
  private async override(uri: vscode.Uri | undefined): Promise<void> {
    const file = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (file?.scheme !== 'file') {
      void vscode.window.showInformationMessage(
        'Open an interface file of the playset to override it.',
      );
      return;
    }
    const files = this.game.files;
    if (files === undefined) {
      void vscode.window.showInformationMessage(
        'Etch knows the playset once the live game has started: start it, or copy the file by hand.',
      );
      return;
    }
    const path = gamePathOf(file.fsPath, files);
    if (path === undefined || !/^interface\//i.test(path)) {
      void vscode.window.showInformationMessage(
        `${file.fsPath} is not an interface file of the playset.`,
      );
      return;
    }
    const editor = vscode.window.activeTextEditor;
    const line =
      editor?.document.uri.toString() === file.toString() ? editor.selection.active.line : 0;
    await this.overridePath(path, line);
  }

  private async overridePath(path: string, line: number): Promise<void> {
    const files = this.game.files;
    if (files === undefined) return;
    const result = await overrideInMod(path, files, this.game.editedRoot);
    if (result.kind === 'refused') {
      void vscode.window.showWarningMessage(`Nothing copied: ${result.reason}.`);
      return;
    }
    if (result.laterMod !== undefined) {
      void vscode.window.showWarningMessage(
        `${result.laterMod} loads after your mod and has ${path} too, so the game reads its copy, not yours.`,
      );
    }
    this.output.info(
      result.kind === 'copied'
        ? `Copied ${path} into the mod: ${result.absolutePath}.`
        : `${path} is your mod's already.`,
    );
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(result.absolutePath));
    const position = new vscode.Position(Math.min(line, document.lineCount - 1), 0);
    await vscode.window.showTextDocument(document, {
      selection: new vscode.Range(position, position),
      preview: false,
    });
  }
}

/** The text of a file as the user has it: an open editor's buffer, else the file (byte per character). */
async function textOf(absolutePath: string): Promise<string | undefined> {
  const open = vscode.workspace.textDocuments.find(
    (d) => d.uri.scheme === 'file' && d.uri.fsPath.toLowerCase() === absolutePath.toLowerCase(),
  );
  if (open !== undefined) return open.getText();
  return readFile(absolutePath).then(
    (bytes) => bytes.toString('latin1'),
    () => undefined,
  );
}

/** Opens a location; a file not of the edited mod is made read-only for the session. */
async function show(location: PickLocation): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(location.absolutePath));
  const position = new vscode.Position(Math.min(location.line, document.lineCount - 1), 0);
  await vscode.window.showTextDocument(document, {
    selection: new vscode.Range(position, position),
    preview: false,
  });
  if (location.readOnly) await vscode.commands.executeCommand(READ_ONLY);
}
