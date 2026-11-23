// Getting started (etch#648, P2.8): **Etch: Get Started** opens the walkthrough of
// `contributes.walkthroughs`, whose steps tick themselves on completion events. Its first step
// ticks when Etch finds the game folder as the preview does: `etch.gamePath` when set, else
// Steam's library list.
//
// A completion context alone does not tick it. VS Code creates its walkthrough service only when a
// Welcome or Get Started page opens, registers the walkthrough up to 5 s later (it waits for an
// experiment's answer), and never ticks a step on a context that already holds then
// (`registerDoneListeners` in its gettingStartedService.ts). So Etch ticks the step itself, once
// per profile, with VS Code's `welcome.markStepComplete`, which saves the step's progress before
// it looks the step up: before the registration the command fails after saving, and Etch ignores
// that. The context `etch.gameFound` stays as the step's completion event for a game folder set
// while the page is open.
import { resolve } from 'node:path';
import * as vscode from 'vscode';
import { findGameInSteam, isGameFolder, systemEnvironment } from '@etch/core/playset';

/** Opens the walkthrough. */
export const GET_STARTED = 'etch.getStarted';
/** The walkthrough's id: the extension's id and `contributes.walkthroughs[0].id`. */
export const WALKTHROUGH = 'happy-dwarf-team.etch#gettingStarted';
/** Set while Etch finds the game folder: the walkthrough's first step ticks on it. */
export const GAME_FOUND_CONTEXT = 'etch.gameFound';
/** The first step's id in VS Code's walkthrough service. */
export const FIND_GAME_STEP = `${WALKTHROUGH}#findGame`;
/** Set in the profile's state once Etch has ticked the first step. */
const FIND_GAME_TICKED = 'etch.walkthrough.findGameTicked';

/** Whether Etch finds the game folder: `etch.gamePath` when set, else through Steam. */
export async function gameFound(): Promise<boolean> {
  const setting = vscode.workspace.getConfiguration('etch').get<string>('gamePath', '').trim();
  if (setting !== '') return isGameFolder(resolve(setting)).catch(() => false);
  const found = await findGameInSteam(systemEnvironment()).catch(() => undefined);
  return found !== undefined;
}

/** Ticks the first step once per profile; the user can untick it on the page. */
async function tickFindGame(state: vscode.Memento): Promise<void> {
  if (state.get<boolean>(FIND_GAME_TICKED, false)) return;
  await state.update(FIND_GAME_TICKED, true);
  await vscode.commands.executeCommand('welcome.markStepComplete', FIND_GAME_STEP).then(
    () => undefined,
    () => undefined,
  );
}

/** Registers Etch: Get Started and keeps the first step of the walkthrough up to date. */
export function registerOnboarding(
  output: vscode.LogOutputChannel,
  state: vscode.Memento,
): vscode.Disposable {
  let checks = 0;
  const check = async (): Promise<void> => {
    const at = ++checks;
    const found = await gameFound();
    // A later change of the setting started a newer check.
    if (at !== checks) return;
    output.info(`Game folder ${found ? 'found' : 'not found'} for the walkthrough.`);
    await vscode.commands.executeCommand('setContext', GAME_FOUND_CONTEXT, found);
    if (found) await tickFindGame(state);
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
