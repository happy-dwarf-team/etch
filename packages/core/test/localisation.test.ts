import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  GAME_LANGUAGES,
  Localisation,
  isLocalisationPath,
  type LocalisationFile,
} from '../src/localisation.ts';

const BOM = '﻿';

function file(path: string, layer: number, ...lines: string[]): LocalisationFile {
  return { path, layer, text: lines.join('\n') };
}

describe('isLocalisationPath', () => {
  it('takes the files of the language and files without a language', () => {
    expect(isLocalisationPath('localisation/text_l_english.yml', 'english')).toBe(true);
    expect(isLocalisationPath('localisation/replace/x_l_english.yml', 'english')).toBe(true);
    expect(isLocalisationPath('Localisation\\Text_L_English.YML', 'english')).toBe(true);
    expect(isLocalisationPath('localisation/languages.yml', 'english')).toBe(true);
  });

  it('skips other languages and other folders', () => {
    expect(isLocalisationPath('localisation/text_l_german.yml', 'english')).toBe(false);
    expect(isLocalisationPath('localization/text_l_english.yml', 'english')).toBe(false);
    expect(isLocalisationPath('localisation/text_l_english.txt', 'english')).toBe(false);
    expect(isLocalisationPath('common/text_l_english.yml', 'english')).toBe(false);
  });
});

describe('Localisation.load', () => {
  it('reads entries of the chosen language', () => {
    const loc = Localisation.load('english', [
      file(
        'localisation/text_l_english.yml',
        0,
        `${BOM}l_english:`,
        ' # a comment',
        '',
        ' BOLD:0 "Bold"',
        ' NO_NUMBER: "No number"',
        '\tTABBED:12 "Tabbed" # trailing comment',
        ' EMPTY:0 ""',
      ),
    ]);
    expect(loc.language).toBe('english');
    expect(loc.size).toBe(4);
    expect(loc.get('BOLD')).toBe('Bold');
    expect(loc.get('NO_NUMBER')).toBe('No number');
    expect(loc.get('TABBED')).toBe('Tabbed');
    expect(loc.get('EMPTY')).toBe('');
    expect(loc.problems()).toEqual([]);
  });

  it('keeps substitutions, colours and icons literal and unescapes', () => {
    const loc = Localisation.load('english', [
      file(
        'localisation/a_l_english.yml',
        0,
        'l_english:',
        ' SUB:0 "$WHO$ rules [Root.GetName]: §Y£adm£§!"',
        ' ESC:0 "a\\nb\\tc\\\\d\\"e"',
        // Vanilla has unescaped quotes inside values; the value ends at the last quote.
        ' QUOTE:1 "He said: "I had a dream.""',
      ),
    ]);
    expect(loc.get('SUB')).toBe('$WHO$ rules [Root.GetName]: §Y£adm£§!');
    expect(loc.get('ESC')).toBe('a\nb\tc\\d"e');
    expect(loc.get('QUOTE')).toBe('He said: "I had a dream."');
  });

  it('reads CRLF files', () => {
    const loc = Localisation.load('english', [
      {
        path: 'localisation/a_l_english.yml',
        layer: 0,
        text: `${BOM}l_english:\r\n KEY:0 "value"\r\n`,
      },
    ]);
    expect(loc.get('KEY')).toBe('value');
    expect(loc.problems()).toEqual([]);
  });

  it('takes only the section of the chosen language', () => {
    const files = [
      file(
        'localisation/languages.yml',
        0,
        'l_english:',
        ' l_german:0 "German"',
        'l_german:',
        ' l_german:0 "Deutsch"',
      ),
    ];
    expect(Localisation.load('english', files).get('l_german')).toBe('German');
    expect(Localisation.load('german', files).get('l_german')).toBe('Deutsch');
  });

  it('skips files of other languages', () => {
    const loc = Localisation.load('english', [
      file('localisation/a_l_german.yml', 0, 'l_german:', ' KEY:0 "Deutsch"'),
    ]);
    expect(loc.size).toBe(0);
  });

  it('reports lines it cannot read', () => {
    const loc = Localisation.load('english', [
      file(
        'localisation/a_l_english.yml',
        2,
        ' EARLY:0 "before the header"',
        'l_english:',
        ' BROKEN:0 "no closing quote',
        ' ODD:0 "a\\qb"',
      ),
    ]);
    expect(loc.size).toBe(1);
    expect(loc.get('ODD')).toBe('a\\qb');
    expect(loc.problems().map((p) => [p.layer, p.line, p.message])).toEqual([
      [2, 0, 'Entry before the `l_<language>:` header.'],
      [2, 2, 'Not a localisation entry; the game may skip it.'],
      [2, 3, 'Unknown escape `\\q`; the game may break the value.'],
    ]);
  });

  it('rejects a language name that cannot be a section', () => {
    expect(() => Localisation.load('l_english:', [])).toThrow();
  });

  it('defaults to a game language', () => {
    expect(GAME_LANGUAGES).toContain(DEFAULT_LANGUAGE);
  });
});

describe('precedence', () => {
  const vanilla = file(
    'localisation/text_l_english.yml',
    0,
    'l_english:',
    ' A:0 "vanilla"',
    ' B:0 "vanilla"',
  );

  it('lets a later mod win', () => {
    const loc = Localisation.load('english', [
      file('localisation/Mod2_l_english.yml', 2, 'l_english:', ' A:0 "mod2"'),
      vanilla,
      file('localisation/mod1_l_english.yml', 1, 'l_english:', ' A:0 "mod1"', ' B:0 "mod1"'),
    ]);
    expect(loc.get('A')).toBe('mod2');
    expect(loc.get('B')).toBe('mod1');
    expect(loc.source('A')).toEqual({ path: 'localisation/Mod2_l_english.yml', layer: 2 });
  });

  it('lets replace files win over any other file', () => {
    const loc = Localisation.load('english', [
      vanilla,
      file('localisation/replace/r_l_english.yml', 1, 'l_english:', ' A:0 "replace"'),
      file('localisation/later_l_english.yml', 2, 'l_english:', ' A:0 "later"'),
    ]);
    expect(loc.get('A')).toBe('replace');
  });

  it('hides a file at the same path in an earlier layer', () => {
    const loc = Localisation.load('english', [
      file('localisation/text_l_english.yml', 1, 'l_english:', ' A:0 "mod"'),
      vanilla,
    ]);
    expect(loc.get('A')).toBe('mod');
    expect(loc.get('B')).toBeUndefined();
  });

  it('orders files of one layer by path', () => {
    const loc = Localisation.load('english', [
      file('localisation/b_l_english.yml', 0, 'l_english:', ' A:0 "b"'),
      file('localisation/a_l_english.yml', 0, 'l_english:', ' A:0 "a"'),
    ]);
    expect(loc.get('A')).toBe('b');
  });
});

describe('text', () => {
  it('shows the value of a key, else the text itself', () => {
    const loc = Localisation.load('english', [
      file('localisation/a_l_english.yml', 0, 'l_english:', ' KEY:0 "Value"'),
    ]);
    expect(loc.text('KEY')).toBe('Value');
    expect(loc.text('Plain text')).toBe('Plain text');
  });
});

describe('update and remove', () => {
  const base = (): Localisation =>
    Localisation.load('english', [
      file('localisation/text_l_english.yml', 0, 'l_english:', ' A:0 "vanilla"', ' B:0 "vanilla"'),
      file('localisation/mod_l_english.yml', 1, 'l_english:', ' A:0 "mod"', ' C:0 "mod"'),
    ]);

  it('applies an edit and gives keys back when it drops them', () => {
    const loc = base();
    expect(
      loc.update(file('localisation/mod_l_english.yml', 1, 'l_english:', ' B:0 "edited"')),
    ).toBe(true);
    expect(loc.get('A')).toBe('vanilla');
    expect(loc.get('B')).toBe('edited');
    expect(loc.get('C')).toBeUndefined();
  });

  it('keeps a later layer winning over an edit in an earlier one', () => {
    const loc = base();
    loc.update(
      file(
        'localisation/text_l_english.yml',
        0,
        'l_english:',
        ' A:0 "vanilla 2"',
        ' B:0 "vanilla 2"',
      ),
    );
    expect(loc.get('A')).toBe('mod');
    expect(loc.get('B')).toBe('vanilla 2');
  });

  it('adds a new file and ignores one hidden by a later layer', () => {
    const loc = base();
    expect(
      loc.update(file('localisation/replace/r_l_english.yml', 0, 'l_english:', ' A:0 "replace"')),
    ).toBe(true);
    expect(loc.get('A')).toBe('replace');
    expect(
      loc.update(file('localisation/mod_l_english.yml', 0, 'l_english:', ' C:0 "hidden"')),
    ).toBe(false);
    expect(loc.get('C')).toBe('mod');
    expect(loc.update(file('localisation/x_l_german.yml', 1, 'l_german:', ' D:0 "x"'))).toBe(false);
  });

  it('removes a file', () => {
    const loc = base();
    loc.remove('localisation/mod_l_english.yml', 0);
    expect(loc.get('C')).toBe('mod');
    loc.remove('Localisation/MOD_l_english.yml', 1);
    expect(loc.get('A')).toBe('vanilla');
    expect(loc.get('C')).toBeUndefined();
    expect(loc.size).toBe(2);
  });

  it('replaces the problems of an edited file', () => {
    const loc = base();
    loc.update(file('localisation/mod_l_english.yml', 1, 'l_english:', ' broken'));
    expect(loc.problems()).toHaveLength(1);
    loc.update(file('localisation/mod_l_english.yml', 1, 'l_english:'));
    expect(loc.problems()).toEqual([]);
  });
});
