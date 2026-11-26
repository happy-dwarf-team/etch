import { describe, expect, it } from 'vitest';
import {
  CWTOOLS_DEV_MACHINE_ID,
  SCRIPT_ASSOCIATIONS,
  inGameNamedFolder,
  isScriptFile,
  offersCwtoolsGameFolder,
  scriptLanguageNotice,
  keptScriptAssociations,
  warnsCwtoolsTelemetry,
  withScriptAssociations,
  type CwtoolsGameFolderCase,
  type CwtoolsTelemetryCase,
  type ScriptLanguageCase,
} from '../src/script-language.ts';

const EVENTS = 'C:\\mods\\etch\\events\\etch_demo_events.txt';

const plain: ScriptLanguageCase = {
  scheme: 'file',
  languageId: 'plaintext',
  fileName: EVENTS,
  installed: false,
  cwtools: false,
  declined: false,
  folderDeclined: false,
};

/** CWTools installed, the file still Plain Text (etch#704). */
const withCwtools: ScriptLanguageCase = { ...plain, installed: true, cwtools: true };

describe('script files', () => {
  it('are interface files anywhere, and .txt files in a script folder', () => {
    expect(
      [
        'C:\\mods\\etch\\interface\\etch_demo.gui',
        '/mods/etch/interface/etch_demo.GFX',
        '/mods/etch/gfx/entities/etch_demo_units.asset',
        EVENTS,
        '/mods/etch/common/ideas/00_etch_ideas.txt',
        '/mods/etch/history/provinces/1 - Stockholm.txt',
        '/mods/etch/map/area.txt',
        '/mods/etch/customizable_localization/etch.txt',
      ].filter((file) => !isScriptFile(file)),
    ).toEqual([]);
  });

  it('are not other files', () => {
    expect(
      [
        '/mods/etch/readme.txt',
        '/mods/etch/descriptor.mod',
        '/mods/etch/localisation/etch_l_english.yml',
        '/mods/etch/common/ideas/notes.md',
        '/mods/etch/commonplace/notes.txt',
      ].filter(isScriptFile),
    ).toEqual([]);
  });
});

describe('the notice that offers the extensions', () => {
  it('shows for a script file on disk that opens as Plain Text, with neither extension', () => {
    expect(scriptLanguageNotice(plain)).toBe('install');
  });

  it('stays silent when the file has a language, either extension is installed, or the user declined', () => {
    expect(scriptLanguageNotice({ ...plain, languageId: 'eu4' })).toBeUndefined();
    expect(scriptLanguageNotice({ ...plain, installed: true })).toBeUndefined();
    expect(scriptLanguageNotice({ ...plain, declined: true })).toBeUndefined();
  });

  it('stays silent for an unsaved document and for other files', () => {
    expect(scriptLanguageNotice({ ...plain, scheme: 'untitled' })).toBeUndefined();
    expect(scriptLanguageNotice({ ...plain, fileName: '/mods/etch/readme.txt' })).toBeUndefined();
  });
});

describe('the notice about CWTools and the mod folder', () => {
  it('shows when CWTools is installed and a script file outside a game-named folder is Plain Text', () => {
    expect(scriptLanguageNotice(withCwtools)).toBe('folder');
    expect(
      scriptLanguageNotice({ ...withCwtools, fileName: 'D:\\git\\my-mod\\interface\\x.gfx' }),
    ).toBe('folder');
  });

  it('still shows after Don’t Show Again on the other notice', () => {
    expect(scriptLanguageNotice({ ...withCwtools, declined: true })).toBe('folder');
  });

  it('stays silent under a game-named folder, with ParadoxCode only, or after its own Don’t Show Again', () => {
    const inMods =
      'C:\\Users\\modder\\Documents\\Paradox Interactive\\Europa Universalis IV\\mod\\etch\\events\\a.txt';
    expect(scriptLanguageNotice({ ...withCwtools, fileName: inMods })).toBeUndefined();
    expect(scriptLanguageNotice({ ...withCwtools, cwtools: false })).toBeUndefined();
    expect(scriptLanguageNotice({ ...withCwtools, folderDeclined: true })).toBeUndefined();
  });

  it('stays silent once the file has CWTools’ language', () => {
    expect(scriptLanguageNotice({ ...withCwtools, languageId: 'eu4' })).toBeUndefined();
  });

  it('shows for a file CWTools opened as paradox, after a .gui file started it', () => {
    const paradox = { ...withCwtools, languageId: 'paradox' };
    expect(scriptLanguageNotice(paradox)).toBe('folder');
    expect(scriptLanguageNotice({ ...paradox, folderDeclined: true })).toBeUndefined();
    const inMods =
      'C:\\Users\\modder\\Documents\\Paradox Interactive\\Europa Universalis IV\\mod\\a\\events\\a.txt';
    expect(scriptLanguageNotice({ ...paradox, fileName: inMods })).toBeUndefined();
  });

  it('never offers the extensions for a file that already has a language', () => {
    expect(
      scriptLanguageNotice({ ...plain, languageId: 'paradox', installed: false }),
    ).toBeUndefined();
  });
});

describe('a game-named folder', () => {
  it('is a folder whose name matches CWTools’ europa*universalis*iv, case aside', () => {
    expect(
      [
        'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Europa Universalis IV\\events\\a.txt',
        'C:\\Users\\modder\\Documents\\Paradox Interactive\\Europa Universalis IV\\mod\\m\\events\\a.txt',
        '/home/modder/europa_universalis_iv/mod/m/interface/a.gui',
      ].filter((file) => !inGameNamedFolder(file)),
    ).toEqual([]);
  });

  it('is not another folder, nor a name that only starts like the game’s', () => {
    expect(
      [
        EVENTS,
        'D:\\git\\eu4-mod\\events\\a.txt',
        'C:\\Europa Universalis IV - Copy\\events\\a.txt',
        'C:\\mods\\europa universalis iv.txt',
      ].filter(inGameNamedFolder),
    ).toEqual([]);
  });
});

describe('the files.associations entries', () => {
  it('give the script folders’ .txt files and the interface files CWTools’ eu4 language', () => {
    expect(SCRIPT_ASSOCIATIONS).toEqual({
      '**/common/**/*.txt': 'eu4',
      '**/customizable_localization/**/*.txt': 'eu4',
      '**/decisions/**/*.txt': 'eu4',
      '**/events/**/*.txt': 'eu4',
      '**/history/**/*.txt': 'eu4',
      '**/map/**/*.txt': 'eu4',
      '**/missions/**/*.txt': 'eu4',
      '*.gui': 'eu4',
      '*.gfx': 'eu4',
      '*.asset': 'eu4',
    });
  });

  it('are added to the workspace’s, which keep their own entries', () => {
    expect(withScriptAssociations(undefined)).toEqual(SCRIPT_ASSOCIATIONS);
    const merged = withScriptAssociations({ '*.gui': 'plaintext', '*.yml': 'yaml' });
    expect(merged?.['*.gui']).toBe('plaintext');
    expect(merged?.['*.yml']).toBe('yaml');
    expect(merged?.['**/events/**/*.txt']).toBe('eu4');
  });

  it('change nothing when the workspace has them all', () => {
    expect(withScriptAssociations({ ...SCRIPT_ASSOCIATIONS })).toBeUndefined();
  });

  it('change nothing when the workspace maps them all to another language (etch#726)', () => {
    const paradox = Object.fromEntries(
      Object.keys(SCRIPT_ASSOCIATIONS).map((pattern) => [pattern, 'paradox']),
    );
    expect(withScriptAssociations(paradox)).toBeUndefined();
    expect(keptScriptAssociations(paradox)).toHaveLength(Object.keys(SCRIPT_ASSOCIATIONS).length);
    expect(keptScriptAssociations(paradox)[0]).toEqual(['**/common/**/*.txt', 'paradox']);
  });

  it('name the workspace’s own entries for the same patterns, not its eu4 or other ones', () => {
    expect(keptScriptAssociations(undefined)).toEqual([]);
    expect(keptScriptAssociations({ ...SCRIPT_ASSOCIATIONS })).toEqual([]);
    expect(
      keptScriptAssociations({ '*.gui': 'plaintext', '*.gfx': 'eu4', '*.yml': 'yaml' }),
    ).toEqual([['*.gui', 'plaintext']]);
  });
});

describe('the offer to hand CWTools the game folder', () => {
  const GAME = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Europa Universalis IV';
  const offer: CwtoolsGameFolderCase = {
    languageId: 'eu4',
    cwtools: true,
    cwtoolsGameFolder: undefined,
    gameFolder: GAME,
    declined: false,
  };

  it('shows for an eu4 file when CWTools has no game folder and Etch has one', () => {
    expect(offersCwtoolsGameFolder(offer)).toBe(true);
    expect(offersCwtoolsGameFolder({ ...offer, cwtoolsGameFolder: '  ' })).toBe(true);
  });

  it('stays silent when CWTools has a folder, Etch has none, or the user declined', () => {
    expect(offersCwtoolsGameFolder({ ...offer, cwtoolsGameFolder: 'D:\\EU4' })).toBe(false);
    expect(offersCwtoolsGameFolder({ ...offer, gameFolder: undefined })).toBe(false);
    expect(offersCwtoolsGameFolder({ ...offer, declined: true })).toBe(false);
    expect(offersCwtoolsGameFolder({ ...offer, cwtools: false })).toBe(false);
  });

  it('stays silent outside CWTools eu4 mode, where it does not use the folder', () => {
    expect(offersCwtoolsGameFolder({ ...offer, languageId: 'plaintext' })).toBe(false);
    expect(offersCwtoolsGameFolder({ ...offer, languageId: 'paradox' })).toBe(false);
  });
});

describe('the notice about CWTools without telemetry', () => {
  const off: CwtoolsTelemetryCase = {
    languageId: 'eu4',
    cwtools: true,
    machineId: CWTOOLS_DEV_MACHINE_ID,
    platform: 'win32',
    declined: false,
  };

  it('shows for an eu4 file on Windows when VS Code gives CWTools’ development machine id', () => {
    expect(CWTOOLS_DEV_MACHINE_ID).toBe('someValue.machineId');
    expect(warnsCwtoolsTelemetry(off)).toBe(true);
  });

  it('stays silent with a real machine id, without CWTools, or after Don’t Show Again', () => {
    expect(warnsCwtoolsTelemetry({ ...off, machineId: '3f1c9a0e7b' })).toBe(false);
    expect(warnsCwtoolsTelemetry({ ...off, cwtools: false })).toBe(false);
    expect(warnsCwtoolsTelemetry({ ...off, declined: true })).toBe(false);
  });

  it('stays silent on Linux and macOS, where CWTools keeps working', () => {
    expect(warnsCwtoolsTelemetry({ ...off, platform: 'linux' })).toBe(false);
    expect(warnsCwtoolsTelemetry({ ...off, platform: 'darwin' })).toBe(false);
  });

  it('stays silent outside CWTools’ eu4 mode', () => {
    expect(warnsCwtoolsTelemetry({ ...off, languageId: 'plaintext' })).toBe(false);
    expect(warnsCwtoolsTelemetry({ ...off, languageId: 'paradox' })).toBe(false);
  });
});
