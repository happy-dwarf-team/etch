// The structure check of a `.gui` file in Problems: the keys and values EU4 1.37.5 does not read
// as written (`guiStructureDiagnostics`). It goes with the preview's model diagnostics and has no
// setting of its own; CWTools' `.gui` rules report the same.
import type * as vscode from 'vscode';
import { guiStructureDiagnostics, type GuiFile, type ModelDiagnostic } from '@etch/core';

/** The structure check's diagnostics of a `.gui` file, for its open document when there is one. */
export function guiStructureProblems(
  _document: vscode.TextDocument | undefined,
  file: GuiFile,
): ModelDiagnostic[] {
  return guiStructureDiagnostics(file);
}
