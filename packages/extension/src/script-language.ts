// Which files are script files, and which notice Etch shows when one opens as Plain Text: VS Code
// opens them so without another extension, and Etch adds no grammar (ADR 0008). No vscode.

/** The extensions that colour script files, as the notice offers them. */
export const SCRIPT_LANGUAGE_EXTENSIONS: readonly { readonly name: string; readonly id: string }[] =
  [
    { name: 'CWTools', id: 'tboby.cwtools-vscode' },
    { name: 'ParadoxCode', id: 'ParadoxCode.paradoxcode-vscode' },
  ];

/** CWTools' extension id. */
export const CWTOOLS_ID = 'tboby.cwtools-vscode';

/** CWTools' language for EU4's script files. */
export const CWTOOLS_EU4_LANGUAGE = 'eu4';

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

/**
 * Whether a file is under a folder whose name CWTools takes for EU4's: its `eu4` language claims
 * only files with a folder named `europa*universalis*iv` in their path (`filenamePatterns` in
 * CWTools 0.10.31's `contributes.languages`), case aside, such as `…/Europa Universalis IV/mod/…`.
 */
export function inGameNamedFolder(fileName: string): boolean {
  const slashed = fileName.replace(/\\/g, '/').toLowerCase();
  return /(?:^|\/)europa[^/]*universalis[^/]*iv\//.test(slashed);
}

/**
 * The `files.associations` entries that give a mod's script files CWTools' `eu4` language in any
 * folder: the same files as {@link isScriptFile}. VS Code matches a pattern with a slash against
 * the file's whole path, and one without against its name.
 */
export const SCRIPT_ASSOCIATIONS: Readonly<Record<string, string>> = Object.fromEntries(
  [...SCRIPT_FOLDERS.map((folder) => `**/${folder}/**/*.txt`), '*.gui', '*.gfx', '*.asset'].map(
    (pattern): [string, string] => [pattern, CWTOOLS_EU4_LANGUAGE],
  ),
);

/**
 * The workspace's `files.associations` with Etch's entries added: an entry the workspace already
 * has, for the same pattern, stays as it is. Undefined when nothing would change.
 */
export function withScriptAssociations(
  current: Readonly<Record<string, string>> | undefined,
): Record<string, string> | undefined {
  const merged = { ...SCRIPT_ASSOCIATIONS, ...current };
  const added = Object.keys(SCRIPT_ASSOCIATIONS).some(
    (pattern) => current?.[pattern] === undefined,
  );
  return added ? merged : undefined;
}

/** What the notice is decided on: an opened document, and the user's setup. */
export interface ScriptLanguageCase {
  readonly scheme: string;
  readonly languageId: string;
  readonly fileName: string;
  /** CWTools or ParadoxCode is installed. */
  readonly installed: boolean;
  /** CWTools is installed. */
  readonly cwtools: boolean;
  /**
   * The user chose Don't Show Again on the notice that offers the extensions, or turned off
   * VS Code's extension recommendations.
   */
  readonly declined: boolean;
  /** The user chose Don't Show Again on the notice about CWTools and the mod's folder. */
  readonly folderDeclined: boolean;
}

/**
 * The notice a document gets, if any. `install`: a script file on disk opens as Plain Text with
 * neither extension, and Etch offers them. `folder`: it opens as Plain Text with CWTools
 * installed, because the file is not under a folder named after the game (etch#704), and Etch
 * says so and offers the `files.associations` entries.
 */
export function scriptLanguageNotice(
  document: ScriptLanguageCase,
): 'install' | 'folder' | undefined {
  if (document.scheme !== 'file' || document.languageId !== 'plaintext') return undefined;
  if (!isScriptFile(document.fileName)) return undefined;
  if (!document.installed) return document.declined ? undefined : 'install';
  if (document.cwtools && !document.folderDeclined && !inGameNamedFolder(document.fileName)) {
    return 'folder';
  }
  return undefined;
}
