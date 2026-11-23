// Getting started (etch#648, P2.8): **Etch: Get Started** opens the walkthrough of
// `contributes.walkthroughs`, whose steps tick themselves on completion events. Its first step
// ticks on `etch.gameFound`, which Etch sets while it finds the game folder as the preview does:
// `etch.gamePath` when set, else Steam's library list. VS Code registers the walkthrough up to 5 s
// after it reads the extension (it waits for an experiment's answer) and never ticks a step on a
// context that already holds then: Etch sets the context only after that time. The step also
// ticks on the context with the Get Started page as the active editor (package.json).
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

/**
 * How long after activation Etch waits before it sets `etch.gameFound` the first time: past the
 * 5 s in which VS Code registers the walkthrough (`registerExtensionWalkthroughContributions` and
 * `registerDoneListeners` in its gettingStartedService.ts). A context that holds at registration
 * counts as seen and never ticks its step in that session.
 */
export const WALKTHROUGH_REGISTERED_MS = 6000;

/** Registers Etch: Get Started and keeps `etch.gameFound` up to date. */
export function registerOnboarding(output: vscode.LogOutputChannel): vscode.Disposable {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const registered = new Promise<void>((done) => {
    timer = setTimeout(done, WALKTHROUGH_REGISTERED_MS);
  });
  let checks = 0;
  const check = async (): Promise<void> => {
    const at = ++checks;
    const found = await gameFound();
    await registered;
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
    {
      dispose: () => {
        clearTimeout(timer);
      },
    },
  );
}
