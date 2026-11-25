// Whether CWTools answers a feature in a document itself, so that Etch steps back from it there
// (ADR 0008, "Beside CWTools"): CWTools runs, the document has its `eu4` language, and the rules
// it loads cover the thing. `etch.cwtools` set to `ignore` keeps every Etch feature.
import * as vscode from 'vscode';
import { CWTOOLS_EU4_LANGUAGE, CWTOOLS_ID } from './script-language.ts';
import { NO_COVERAGE, readCoverage, rulesFolder, type CwtoolsCoverage } from './cwtools-rules.ts';

export const CWTOOLS_SETTING = 'cwtools';

let coverage: CwtoolsCoverage = NO_COVERAGE;
let readFor: string | undefined;
let readAt = 0;
let reading: Promise<void> | undefined;

/** How long an empty read stands: on its first start CWTools clones its rules after it starts. */
const EMPTY_RETRY_MS = 60_000;

function empty(read: CwtoolsCoverage): boolean {
  return read.spriteKinds.size === 0 && !read.fonts && !read.gui && read.scriptFolders.size === 0;
}

function cwtoolsRunning(): vscode.Extension<unknown> | undefined {
  const extension = vscode.extensions.getExtension(CWTOOLS_ID);
  return extension?.isActive ? extension : undefined;
}

/** Reads the coverage of CWTools' rules again when the folder it loads has changed. */
function refresh(extension: vscode.Extension<unknown>): void {
  const config = vscode.workspace.getConfiguration('cwtools');
  const folder = rulesFolder(extension.extensionPath, {
    rulesVersion: config.get<string>('rules_version'),
    rulesFolder: config.get<string>('rules_folder'),
  });
  if (folder === readFor && !(empty(coverage) && Date.now() - readAt > EMPTY_RETRY_MS)) return;
  readFor = folder;
  readAt = Date.now();
  if (folder === undefined) {
    coverage = NO_COVERAGE;
    return;
  }
  reading = readCoverage(folder).then((read) => {
    if (readFor === folder) coverage = read;
  });
}

function active(document: vscode.TextDocument): boolean {
  if (
    vscode.workspace.getConfiguration('etch', document).get<string>(CWTOOLS_SETTING) === 'ignore'
  ) {
    return false;
  }
  if (document.languageId !== CWTOOLS_EU4_LANGUAGE) return false;
  const extension = cwtoolsRunning();
  if (extension === undefined) return false;
  refresh(extension);
  return true;
}

/** CWTools types this sprite kind (`spriteType`, `corneredTileSpriteType`…) in this document. */
export function cwtoolsTypesSprite(document: vscode.TextDocument, kind: string): boolean {
  return active(document) && coverage.spriteKinds.has(kind);
}

/**
 * CWTools goes to this sprite's definition itself: its rules type the sprite's kind, and the
 * reference, in a `.gui` file (rules for widgets) or in a script file at `scriptPath` (the
 * game-relative path; rules for every sprite key of its folder).
 */
export function cwtoolsDefinesSprite(
  document: vscode.TextDocument,
  kind: string,
  scriptPath: string | undefined,
): boolean {
  if (!cwtoolsTypesSprite(document, kind)) return false;
  if (scriptPath === undefined) return coverage.gui;
  const lower = scriptPath.toLowerCase();
  return [...coverage.scriptFolders].some((folder) => lower.startsWith(`${folder}/`));
}

/** CWTools types `bitmapfont` blocks in this document. */
export function cwtoolsTypesFonts(document: vscode.TextDocument): boolean {
  return active(document) && coverage.fonts;
}

/** CWTools checks the widgets of this `.gui` document and completes their keys. */
export function cwtoolsChecksGui(document: vscode.TextDocument): boolean {
  return active(document) && coverage.gui;
}

/**
 * Starts reading CWTools' rules when it runs, and again when its rules settings change; for the
 * tests, the promise of the read in progress.
 */
export function registerCwtools(context: vscode.ExtensionContext): () => Promise<void> {
  const start = (): void => {
    const extension = cwtoolsRunning();
    if (extension !== undefined) refresh(extension);
  };
  start();
  context.subscriptions.push(
    vscode.extensions.onDidChange(start),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('cwtools')) {
        readFor = undefined;
        start();
      }
    }),
  );
  return async () => reading;
}
