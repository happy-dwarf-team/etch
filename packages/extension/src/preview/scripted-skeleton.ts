// Etch: Add Scripted Selectors to the Window Profile (after-v2.md, "Deriving scripted groups"): the
// previewed window's widgets that the playset's `common/custom_gui` gives a `potential` become
// `scripted` selectors and rules of the mod project's `.etch/profiles/<window>.jsonc`, added beside
// what the file already has. Etch never evaluates the trigger; the note quotes it.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as vscode from 'vscode';
import { decodeGameText, type Widget } from '@etch/core';
import type { GameFiles } from '@etch/core/playset';
import {
  readCustomGui,
  scriptedSkeleton,
  withMembers,
  type CustomGuiEntry,
} from '@etch/core/profile';
import { PROJECT_PROFILES } from './profiles.ts';

export const ADD_SCRIPTED_SELECTORS = 'etch.addScriptedSelectors';

const CUSTOM_GUI_FOLDER = 'common/custom_gui';

/** What the command did, for the message and the tests. */
export interface ScriptedSkeletonResult {
  readonly file: vscode.Uri;
  readonly selectors: readonly string[];
  readonly rules: readonly string[];
  /** Ids the file already had, left as written. */
  readonly kept: readonly string[];
  /**
   * Widgets left out because a lower layer (Etch's own profile of the game or a mod) already has a
   * selector or a rule of their id, which the project's file would replace.
   */
  readonly taken: readonly string[];
}

/** The selector and rule ids of a window's profile layers below the mod project's. */
export interface LowerIds {
  readonly selectors: ReadonlySet<string>;
  readonly rules: ReadonlySet<string>;
}

/** The playset's `common/custom_gui` entries with a `potential`, in file order. */
async function customGuiEntries(files: GameFiles): Promise<CustomGuiEntry[]> {
  const entries: CustomGuiEntry[] = [];
  for (const file of await files.list(CUSTOM_GUI_FOLDER, '.txt')) {
    const bytes = await readFile(file.absolutePath).catch(() => undefined);
    if (bytes === undefined) continue;
    entries.push(...readCustomGui(decodeGameText(bytes, 'interface').text, file.path));
  }
  return entries;
}

/**
 * Adds the window's scripted selectors and rules to the mod project's profile of the window; the
 * file is created when needed and an open editor of it is edited and saved. `undefined` when the
 * window has no scripted widget (said to the user).
 */
export async function addScriptedSelectors(
  window: Widget,
  files: GameFiles,
  projectRoot: string,
  lower: LowerIds,
): Promise<ScriptedSkeletonResult | undefined> {
  const name = window.name ?? '';
  const all = scriptedSkeleton(window, await customGuiEntries(files));
  // A selector and its rule go together: both are left out when a lower layer has either id.
  const taken = all.selectors
    .map(([id]) => id)
    .filter((id) => lower.selectors.has(id) || lower.rules.has(`${id}-hidden`));
  const skeleton = {
    selectors: all.selectors.filter(([id]) => !taken.includes(id)),
    rules: all.rules.filter(([id]) => !taken.some((t) => `${t}-hidden` === id)),
  };
  if (all.selectors.length === 0) {
    void vscode.window.showInformationMessage(
      `No widget of ${name} has a potential in the playset's common/custom_gui: there is nothing scripted to add.`,
    );
    return undefined;
  }
  const file = vscode.Uri.file(join(projectRoot, ...PROJECT_PROFILES, `${name}.jsonc`));
  const document = vscode.workspace.textDocuments.find((d) => d.uri.toString() === file.toString());
  const before =
    document?.getText() ??
    (await readFile(file.fsPath, 'utf8').catch(() => undefined as string | undefined));
  const selectors = withMembers(before, name, 'selectors', skeleton.selectors);
  const rules = withMembers(selectors.text, name, 'rules', skeleton.rules);
  if (document !== undefined) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(file, new vscode.Range(0, 0, document.lineCount, 0), rules.text);
    await vscode.workspace.applyEdit(edit);
    await document.save();
  } else {
    await mkdir(dirname(file.fsPath), { recursive: true });
    await writeFile(file.fsPath, rules.text, 'utf8');
  }
  return {
    file,
    selectors: selectors.added,
    rules: rules.added,
    kept: [...selectors.kept, ...rules.kept],
    taken,
  };
}
