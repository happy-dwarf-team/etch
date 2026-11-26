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

/**
 * CWTools' language for a script file of no game it recognises. With it, CWTools 0.10.31 runs on
 * the Stellaris rules and reported nothing on an EU4 event file with an unknown trigger.
 */
export const CWTOOLS_PARADOX_LANGUAGE = 'paradox';

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

/**
 * The patterns of Etch's entries that the workspace's `files.associations` already maps to another
 * language than CWTools' `eu4`, with that language. {@link withScriptAssociations} keeps them, so
 * their files stay as they are.
 */
export function keptScriptAssociations(
  current: Readonly<Record<string, string>> | undefined,
): [pattern: string, language: string][] {
  return Object.keys(SCRIPT_ASSOCIATIONS).flatMap((pattern): [string, string][] => {
    const language = current?.[pattern];
    return language === undefined || language === CWTOOLS_EU4_LANGUAGE ? [] : [[pattern, language]];
  });
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
 * says so and offers the `files.associations` entries. It also opens as CWTools' generic
 * `paradox` there once CWTools runs, started by a `.gui` file: then CWTools checks it with no EU4
 * rules, and the same entries help.
 */
export function scriptLanguageNotice(
  document: ScriptLanguageCase,
): 'install' | 'folder' | undefined {
  const plain = document.languageId === 'plaintext';
  if (document.scheme !== 'file' || !(plain || document.languageId === CWTOOLS_PARADOX_LANGUAGE)) {
    return undefined;
  }
  if (!isScriptFile(document.fileName)) return undefined;
  if (!document.installed) return plain && !document.declined ? 'install' : undefined;
  if (document.cwtools && !document.folderDeclined && !inGameNamedFolder(document.fileName)) {
    return 'folder';
  }
  return undefined;
}

/**
 * CWTools' setting, under `cwtools`, that holds EU4's game folder. CWTools builds its cache of the
 * base game from it, and checks a mod against that cache; while it is empty it asks for the folder
 * in a notification of its own, whose folder dialog takes only a folder named
 * `Europa Universalis IV`.
 */
export const CWTOOLS_GAME_FOLDER = 'cache.eu4';

/** What the offer to hand CWTools the game folder is decided on. */
export interface CwtoolsGameFolderCase {
  /** The language of the document that opened: CWTools uses the folder only in its `eu4` mode. */
  readonly languageId: string;
  /** CWTools is installed. */
  readonly cwtools: boolean;
  /** `cwtools.cache.eu4` as the user has it, set or not. */
  readonly cwtoolsGameFolder: string | undefined;
  /** The game folder Etch found, from `etch.gamePath` or Steam. */
  readonly gameFolder: string | undefined;
  /** The user chose Don't Show Again on this offer. */
  readonly declined: boolean;
}

/**
 * The `vscode.env.machineId` that CWTools 0.10.31 takes for its own development host. An editor
 * that runs without telemetry gives it to every extension: VS Code started with
 * `--disable-telemetry`, or a build whose product has no telemetry, such as VSCodium. The setting
 * `telemetry.telemetryLevel` does not: VS Code 1.142.0 gave a real id with it at `off`, `crash`,
 * `error` and `all`, and this one with `--disable-telemetry`. CWTools then names its cache folder by a
 * `vscode-userdata:` address instead of a path, and on Windows its server fails on that name and
 * reports no problems at all (cwtools/cwtools-vscode#167). On Linux and macOS the name is a valid,
 * if odd, folder name, so CWTools keeps working there.
 */
export const CWTOOLS_DEV_MACHINE_ID = 'someValue.machineId';

/** The issue in CWTools' repository about its checks and VS Code's telemetry. */
export const CWTOOLS_TELEMETRY_ISSUE = 'https://github.com/cwtools/cwtools-vscode/issues/167';

/** What the notice about CWTools and VS Code's telemetry is decided on. */
export interface CwtoolsTelemetryCase {
  /** The language of the document that opened: the notice comes with CWTools' `eu4` mode. */
  readonly languageId: string;
  /** CWTools is installed. */
  readonly cwtools: boolean;
  /** `vscode.env.machineId`, which CWTools tests. */
  readonly machineId: string;
  /** `process.platform`. */
  readonly platform: string;
  /** The user chose Don't Show Again on this notice. */
  readonly declined: boolean;
}

/**
 * Whether Etch says that CWTools reports no problems: an `eu4` file opened on Windows with CWTools
 * installed, and the editor gives CWTools' development machine id, as it does without telemetry.
 */
export function warnsCwtoolsTelemetry(document: CwtoolsTelemetryCase): boolean {
  return (
    document.cwtools &&
    !document.declined &&
    document.platform === 'win32' &&
    document.languageId === CWTOOLS_EU4_LANGUAGE &&
    document.machineId === CWTOOLS_DEV_MACHINE_ID
  );
}

/** Whether Etch offers its game folder to CWTools: an `eu4` file opened and CWTools has none. */
export function offersCwtoolsGameFolder(document: CwtoolsGameFolderCase): boolean {
  return (
    document.cwtools &&
    !document.declined &&
    document.languageId === CWTOOLS_EU4_LANGUAGE &&
    document.gameFolder !== undefined &&
    (document.cwtoolsGameFolder ?? '').trim() === ''
  );
}

/** What the notice about CWTools running as EU4 without its rules is decided on (etch#755). */
export interface CwtoolsNoRulesCase {
  /** The language of the document that opened: the notice comes with CWTools' `eu4` mode. */
  readonly languageId: string;
  /** CWTools is installed and running. */
  readonly cwtoolsActive: boolean;
  /** `cwtools.rules_version`: with `manual` the user picked the folder, and CWTools clones nothing. */
  readonly rulesVersion: string | undefined;
  /** The folder CWTools loads its EU4 rules from has rules (undefined while not read yet). */
  readonly rules: boolean | undefined;
  /** The user chose Don't Show Again on this notice. */
  readonly declined: boolean;
}

/**
 * Whether Etch says that CWTools checks EU4 files with no rules: an `eu4` file opened, CWTools runs
 * with rules it clones itself, and its folder has none. CWTools clones them into
 * `<extension>/.cwtools` when it starts; under a deep folder git fails with "path too long", and
 * CWTools then checks nothing and says nothing. With `rules` undefined, whether the folder is worth
 * reading.
 */
export function warnsCwtoolsNoRules(document: CwtoolsNoRulesCase): boolean {
  return (
    document.cwtoolsActive &&
    !document.declined &&
    document.languageId === CWTOOLS_EU4_LANGUAGE &&
    document.rulesVersion !== 'manual' &&
    document.rules !== true
  );
}
