import { describe, expect, it } from 'vitest';
import {
  isScriptFile,
  offersScriptLanguage,
  type ScriptLanguageCase,
} from '../src/script-language.ts';

const EVENTS = 'C:\\mods\\etch\\events\\etch_demo_events.txt';

const plain: ScriptLanguageCase = {
  scheme: 'file',
  languageId: 'plaintext',
  fileName: EVENTS,
  installed: false,
  declined: false,
};

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

describe('the script language notice', () => {
  it('offers the extensions for a script file on disk that opens as Plain Text', () => {
    expect(offersScriptLanguage(plain)).toBe(true);
  });

  it('stays silent when the file has a language, either extension is installed, or the user declined', () => {
    expect(offersScriptLanguage({ ...plain, languageId: 'eu4' })).toBe(false);
    expect(offersScriptLanguage({ ...plain, installed: true })).toBe(false);
    expect(offersScriptLanguage({ ...plain, declined: true })).toBe(false);
  });

  it('stays silent for an unsaved document and for other files', () => {
    expect(offersScriptLanguage({ ...plain, scheme: 'untitled' })).toBe(false);
    expect(offersScriptLanguage({ ...plain, fileName: '/mods/etch/readme.txt' })).toBe(false);
  });
});
