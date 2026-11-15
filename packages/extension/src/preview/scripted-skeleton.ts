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
  withSkeleton,
  type CustomGuiEntry,
  type SkeletonPart,
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
  /** Scripted widgets whose `potential` is `always = yes`, which need nothing in the profile. */
  readonly alwaysShown: readonly string[];
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
  localise?: (key: string) => string | undefined,
): Promise<ScriptedSkeletonResult | undefined> {
  const name = window.name ?? '';
  const all = scriptedSkeleton(window, await customGuiEntries(files), localise);
  // A selector and its rules go together: all are left out when a lower layer has any of the ids.
  const isTaken = (part: SkeletonPart): boolean =>
    (part.selector !== undefined && lower.selectors.has(part.selector)) ||
    part.rules.some((rule) => lower.rules.has(rule));
  const takenParts = all.parts.filter(isTaken);
  const taken = takenParts.map((part) => part.selector ?? part.rules[0] ?? '');
  const leftOut = new Set(takenParts.flatMap((part) => [part.selector, ...part.rules]));
  const skeleton = {
    selectors: all.selectors.filter(([id]) => !leftOut.has(id)),
    rules: all.rules.filter(([id]) => !leftOut.has(id)),
    parts: all.parts.filter((part) => !isTaken(part)),
    alwaysShown: all.alwaysShown,
  };
  if (all.parts.length === 0) {
    void vscode.window.showInformationMessage(
      all.alwaysShown.length === 0
        ? `No widget of ${name} has a potential in the playset's common/custom_gui: there is nothing scripted to add.`
        : `Each scripted widget of ${name} has potential = { always = yes }, so the game always shows it: there is nothing to add.`,
    );
    return undefined;
  }
  if (skeleton.selectors.length === 0 && skeleton.rules.length === 0) {
    void vscode.window.showInformationMessage(
      `Etch's own profile of ${name} already has a selector or rule for each of its ${String(taken.length)} scripted widgets (${taken.slice(0, 5).join(', ')}${taken.length > 5 ? ', …' : ''}): there is nothing to add.`,
    );
    return undefined;
  }
  const file = vscode.Uri.file(join(projectRoot, ...PROJECT_PROFILES, `${name}.jsonc`));
  const document = vscode.workspace.textDocuments.find((d) => d.uri.toString() === file.toString());
  const before =
    document?.getText() ??
    (await readFile(file.fsPath, 'utf8').catch(() => undefined as string | undefined));
  const added = withSkeleton(before, name, skeleton);
  if (document !== undefined) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(file, new vscode.Range(0, 0, document.lineCount, 0), added.text);
    await vscode.workspace.applyEdit(edit);
    await document.save();
  } else {
    await mkdir(dirname(file.fsPath), { recursive: true });
    await writeFile(file.fsPath, added.text, 'utf8');
  }
  return {
    file,
    selectors: added.selectors,
    rules: added.rules,
    kept: added.kept,
    taken,
    alwaysShown: all.alwaysShown,
  };
}
