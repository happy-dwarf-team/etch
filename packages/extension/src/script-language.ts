// Which files are script files, and when Etch offers an extension that colours them: VS Code opens
// them as Plain Text, and Etch adds no grammar (ADR 0008). No vscode.

/** The extensions that colour script files, as the notice offers them. */
export const SCRIPT_LANGUAGE_EXTENSIONS: readonly { readonly name: string; readonly id: string }[] =
  [
    { name: 'CWTools', id: 'tboby.cwtools-vscode' },
    { name: 'ParadoxCode', id: 'ParadoxCode.paradoxcode-vscode' },
  ];

/** The game's folders whose `.txt` files are script files. */
const SCRIPT_FOLDERS = [
  'common',
  'customizable_localization',
  'decisions',
  'events',
  'history',
  'map',
  'missions',
];

/** A `.gui`, `.gfx` or `.asset` file, or a `.txt` file in one of the game's script folders. */
export function isScriptFile(fileName: string): boolean {
  const slashed = fileName.replace(/\\/g, '/').toLowerCase();
  if (/\.(?:gui|gfx|asset)$/.test(slashed)) return true;
  if (!slashed.endsWith('.txt')) return false;
  return SCRIPT_FOLDERS.some((folder) => slashed.includes(`/${folder}/`));
}

/** What the notice is decided on: an opened document, and the user's setup. */
export interface ScriptLanguageCase {
  readonly scheme: string;
  readonly languageId: string;
  readonly fileName: string;
  /** CWTools or ParadoxCode is installed. */
  readonly installed: boolean;
  /** The user chose Don't Show Again, or turned off VS Code's extension recommendations. */
  readonly declined: boolean;
}

/** Whether a document is a script file on disk that opens as Plain Text, with neither extension. */
export function offersScriptLanguage(document: ScriptLanguageCase): boolean {
  return (
    document.scheme === 'file' &&
    document.languageId === 'plaintext' &&
    !document.installed &&
    !document.declined &&
    isScriptFile(document.fileName)
  );
}
