// The structure check of a `.gui` file in Problems: the keys and values EU4 1.37.5 does not read
// as written (`guiStructureDiagnostics`). It goes with the preview's model diagnostics and has no
// setting of its own. Where CWTools checks the widgets of the document itself, its `.gui` rules
// report the same, so Etch steps back (ADR 0008, "Beside CWTools").
import type * as vscode from 'vscode';
import { guiStructureDiagnostics, type GuiFile, type ModelDiagnostic } from '@etch/core';
import { cwtoolsChecksGui } from './cwtools.ts';

/** The structure check's diagnostics of a `.gui` file, for its open document when there is one. */
export function guiStructureProblems(
  document: vscode.TextDocument | undefined,
  file: GuiFile,
): ModelDiagnostic[] {
  if (document !== undefined && cwtoolsChecksGui(document)) return [];
  return guiStructureDiagnostics(file);
}
