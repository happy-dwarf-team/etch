// Getting started (etch#648, P2.8): **Etch: Get Started** opens the walkthrough of
// `contributes.walkthroughs`, whose steps tick themselves on completion events. Its first step
// ticks when Etch finds the game folder as the preview does: `etch.gamePath` when set, else
// Steam's library list. Its sixth ticks when CWTools or ParadoxCode is installed (P2.9).
//
// A completion event alone does not tick them. VS Code creates its walkthrough service only when a
// Welcome or Get Started page opens, registers the walkthrough up to 5 s later (it waits for an
// experiment's answer), and never ticks a step on a context that already holds then
// (`registerDoneListeners` in its gettingStartedService.ts). Nor on `extensionInstalled:` for an
// extension installed before: the service sends that event for every installed extension as it
// starts (`initCompletionEventListeners`), before the walkthrough's listeners exist. So Etch ticks
// both steps itself, once per profile, with VS Code's `welcome.markStepComplete`, which saves the
// step's progress before it looks the step up: before the registration the command fails after
// saving, and Etch ignores that. The steps' completion events stay for what happens while the page
// is open: a game folder set, an extension installed.
import { resolve } from 'node:path';
import * as vscode from 'vscode';
import { findGameInSteam, isGameFolder, systemEnvironment } from '@etch/core/playset';
import { scriptLanguageInstalled } from './script-language-notice.ts';

/** Opens the walkthrough. */
export const GET_STARTED = 'etch.getStarted';
/** The walkthrough's id: the extension's id and `contributes.walkthroughs[0].id`. */
export const WALKTHROUGH = 'happy-dwarf-team.etch#gettingStarted';
/** Set while Etch finds the game folder: the walkthrough's first step ticks on it. */
export const GAME_FOUND_CONTEXT = 'etch.gameFound';
/** The first step's id in VS Code's walkthrough service. */
export const FIND_GAME_STEP = `${WALKTHROUGH}#findGame`;
/** The sixth step's id: it ticks once CWTools or ParadoxCode is installed. */
export const COLOUR_SCRIPTS_STEP = `${WALKTHROUGH}#colourScripts`;
/** Set in the profile's state once Etch has ticked the first step. */
const FIND_GAME_TICKED = 'etch.walkthrough.findGameTicked';
/** Set in the profile's state once Etch has ticked the sixth step. */
const COLOUR_SCRIPTS_TICKED = 'etch.walkthrough.colourScriptsTicked';

/** Whether Etch finds the game folder: `etch.gamePath` when set, else through Steam. */
export async function gameFound(): Promise<boolean> {
  const setting = vscode.workspace.getConfiguration('etch').get<string>('gamePath', '').trim();
  if (setting !== '') return isGameFolder(resolve(setting)).catch(() => false);
  const found = await findGameInSteam(systemEnvironment()).catch(() => undefined);
  return found !== undefined;
}

/** Ticks a step once per profile, noted under `ticked`; the user can untick it on the page. */
async function tickOnce(state: vscode.Memento, ticked: string, step: string): Promise<void> {
  if (state.get<boolean>(ticked, false)) return;
  await state.update(ticked, true);
  await vscode.commands.executeCommand('welcome.markStepComplete', step).then(
    () => undefined,
    () => undefined,
  );
}

/** Registers Etch: Get Started and keeps the first and the sixth step of the walkthrough up to date. */
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
    if (found) await tickOnce(state, FIND_GAME_TICKED, FIND_GAME_STEP);
  };
  void check();
  const colourScripts = (): void => {
    if (scriptLanguageInstalled()) void tickOnce(state, COLOUR_SCRIPTS_TICKED, COLOUR_SCRIPTS_STEP);
  };
  colourScripts();
  return vscode.Disposable.from(
    vscode.commands.registerCommand(GET_STARTED, () =>
      vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH, false),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('etch.gamePath')) void check();
    }),
    // An extension installed, turned on or off.
    vscode.extensions.onDidChange(colourScripts),
  );
}
