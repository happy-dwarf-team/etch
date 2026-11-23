// Getting started (etch#648, P2.8): **Etch: Get Started** opens the walkthrough of
// `contributes.walkthroughs`, whose steps tick themselves on completion events. Its first step
// ticks on `etch.gameFound`, which Etch sets while it finds the game folder as the preview does:
// `etch.gamePath` when set, else Steam's library list.
import { resolve } from 'node:path';
import * as vscode from 'vscode';
import { findGameInSteam, isGameFolder, systemEnvironment } from '@etch/core/playset';

/** Opens the walkthrough. */
export const GET_STARTED = 'etch.getStarted';
/** The walkthrough's id: the extension's id and `contributes.walkthroughs[0].id`. */
export const WALKTHROUGH = 'happy-dwarf-team.etch#gettingStarted';
/** Set while Etch finds the game folder: the walkthrough's first step ticks on it. */
export const GAME_FOUND_CONTEXT = 'etch.gameFound';

/** Whether Etch finds the game folder: `etch.gamePath` when set, else through Steam. */
export async function gameFound(): Promise<boolean> {
  const setting = vscode.workspace.getConfiguration('etch').get<string>('gamePath', '').trim();
  if (setting !== '') return isGameFolder(resolve(setting)).catch(() => false);
  const found = await findGameInSteam(systemEnvironment()).catch(() => undefined);
  return found !== undefined;
}

/** Registers Etch: Get Started and keeps `etch.gameFound` up to date. */
export function registerOnboarding(output: vscode.LogOutputChannel): vscode.Disposable {
  let checks = 0;
  const check = async (): Promise<void> => {
    const at = ++checks;
    const found = await gameFound();
    // A later change of the setting started a newer check.
    if (at !== checks) return;
    output.info(`Game folder ${found ? 'found' : 'not found'} for the walkthrough.`);
    await vscode.commands.executeCommand('setContext', GAME_FOUND_CONTEXT, found);
  };
  void check();
  return vscode.Disposable.from(
    vscode.commands.registerCommand(GET_STARTED, () =>
      vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH, false),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('etch.gamePath')) void check();
    }),
  );
}
