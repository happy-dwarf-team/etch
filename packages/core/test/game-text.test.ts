import { describe, expect, it } from 'vitest';
import {
  builtInSaveEncoding,
  checkedTextKind,
  decodeGameText,
  diagnoseGameText,
  encodeForSave,
  gameTextKind,
  nonAsciiRuns,
  type SaveEncoding,
} from '../src/index.ts';
import { decodeWindows1252, encodeWindows1252, inWindows1252 } from '../src/windows-1252.ts';

function encoding(id: string): SaveEncoding {
  const found = builtInSaveEncoding(id);
  if (!found) {
    throw new Error(`no built-in encoding ${id}`);
  }
  return found;
}

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

describe('gameTextKind', () => {
  it('knows interface files anywhere by extension', () => {
    expect(gameTextKind('C:\\mod\\interface\\topbar.gui')).toBe('interface');
    expect(gameTextKind('/mod/interface/core.GFX')).toBe('interface');
    expect(gameTextKind('fonts/vic_18.fnt')).toBe('interface');
  });

  it('knows localisation only inside a localisation folder', () => {
    expect(gameTextKind('C:\\mod\\localisation\\mod_l_english.yml')).toBe('localisation');
    expect(gameTextKind('/mod/Localisation/replace/x_l_english.yml')).toBe('localisation');
    expect(gameTextKind('/mod/.github/workflows/build.yml')).toBeUndefined();
    expect(gameTextKind('/mod/common/ideas/00_ideas.txt')).toBeUndefined();
  });
});

describe('checkedTextKind', () => {
  it('adds script files to the kinds the preview reads', () => {
    expect(checkedTextKind('C:\\mod\\interface\\topbar.gui')).toBe('interface');
    expect(checkedTextKind('/mod/localisation/mod_l_english.yml')).toBe('localisation');
    expect(checkedTextKind('/mod/common/countries/Sweden.txt')).toBe('script');
    expect(checkedTextKind('C:\\mod\\History\\provinces\\1 - Uppland.TXT')).toBe('script');
    expect(checkedTextKind('/mod/events/flavor.txt')).toBe('script');
    expect(checkedTextKind('/mod/customizable_localization/00_texts.txt')).toBe('script');
    expect(checkedTextKind('/mod/notes/readme.txt')).toBeUndefined();
    expect(checkedTextKind('/mod/common/ideas/00_ideas.yml')).toBeUndefined();
    expect(gameTextKind('/mod/common/countries/Sweden.txt')).toBeUndefined();
  });
});

describe('Windows-1252', () => {
  it('decodes every byte to one character, keeping undefined bytes as C1 controls', () => {
    expect(decodeWindows1252(bytes(0x41, 0x80, 0x81, 0x9d, 0x9f, 0xa4, 0xe5))).toBe(
      'A€\u0081\u009dŸ¤å',
    );
  });

  it('decodes more than one chunk', () => {
    const long = new Uint8Array(20000).fill(0x80);
    expect(decodeWindows1252(long)).toBe('€'.repeat(20000));
  });

  it('encodes as VS Code (iconv-lite) does', () => {
    // `?` outside the code page, per UTF-16 code unit; U+FFFD as the last undefined byte.
    expect([...encodeWindows1252('A€åą😀\u0081\ufffd')]).toEqual([
      0x41, 0x80, 0xe5, 0x3f, 0x3f, 0x3f, 0x3f, 0x9d,
    ]);
  });

  it('knows which texts it has a byte for every character of', () => {
    expect(inWindows1252('abc? é€’šŸ')).toBe(true);
    expect(inWindows1252('\u069e')).toBe(false);
    expect(inWindows1252('ą')).toBe(false);
    expect(inWindows1252('')).toBe(true);
  });

  it('round-trips every defined character', () => {
    const all = Uint8Array.from({ length: 256 }, (_, byte) => byte).filter(
      (byte) => ![0x81, 0x8d, 0x8f, 0x90, 0x9d].includes(byte),
    );
    expect(encodeWindows1252(decodeWindows1252(all))).toEqual(all);
  });
});

describe('decodeGameText', () => {
  it('reads interface files as Windows-1252', () => {
    // UTF-8 bytes of `2000¤` read the way the game reads a vanilla file.
    expect(decodeGameText(bytes(...ascii('2000'), 0xc2, 0xa4), 'interface')).toEqual({
      text: '2000Â¤',
      bom: false,
    });
  });

  it('reads localisation as UTF-8', () => {
    expect(
      decodeGameText(bytes(0xef, 0xbb, 0xbf, 0x43, 0x3a, 0x20, 0xc3, 0xa9), 'localisation'),
    ).toEqual({ text: 'C: é', bom: true });
    expect(decodeGameText(bytes(0xe9), 'localisation').text).toBe('\ufffd');
  });

  it('skips a UTF-8 BOM in an interface file and reports it', () => {
    expect(decodeGameText(bytes(0xef, 0xbb, 0xbf, 0x61), 'interface')).toEqual({
      text: 'a',
      bom: true,
    });
  });
});

describe('encodeForSave', () => {
  it('writes the byte order mark VS Code writes', () => {
    expect([...encodeForSave('é', encoding('utf8'))]).toEqual([0xc3, 0xa9]);
    expect([...encodeForSave('é', encoding('utf8bom'))]).toEqual([0xef, 0xbb, 0xbf, 0xc3, 0xa9]);
    expect([...encodeForSave('a', encoding('utf16le'))]).toEqual([0xff, 0xfe, 0x61, 0x00]);
    expect([...encodeForSave('a', encoding('utf16be'))]).toEqual([0xfe, 0xff, 0x00, 0x61]);
    expect([...encodeForSave('é', encoding('windows1252'))]).toEqual([0xe9]);
  });

  it('leaves other encodings to VS Code', () => {
    expect(builtInSaveEncoding('shiftjis')).toBeUndefined();
  });

  it('gives the game text of the next save', () => {
    // `¤` typed in a UTF-8 document previews as `Â¤`; `ą` in Windows-1252 as `?`.
    expect(decodeGameText(encodeForSave('2000¤', encoding('utf8')), 'interface').text).toBe(
      '2000Â¤',
    );
    expect(decodeGameText(encodeForSave('ą', encoding('windows1252')), 'interface').text).toBe('?');
  });
});

describe('nonAsciiRuns', () => {
  it('finds maximal runs outside ASCII', () => {
    expect(nonAsciiRuns('ab')).toEqual([]);
    expect(nonAsciiRuns('éé a ü')).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 6 },
    ]);
  });
});

describe('diagnoseGameText', () => {
  it('says nothing about pure ASCII', () => {
    expect(diagnoseGameText('text = "abc"', 'interface', encoding('utf8'))).toEqual([]);
  });

  it('says nothing when the save writes what the game reads', () => {
    expect(diagnoseGameText('text = "åé"', 'interface', encoding('windows1252'))).toEqual([]);
    expect(diagnoseGameText('k:0 "é"', 'localisation', encoding('utf8bom'))).toEqual([]);
  });

  it('warns once per run where the game reads other characters', () => {
    expect(diagnoseGameText('a é b ¤', 'interface', encoding('utf8'))).toEqual([
      {
        code: 'game-text-differs',
        severity: 'warning',
        range: { start: 2, end: 3 },
        message: 'Saved as UTF-8; the game reads "Ã©".',
      },
      {
        code: 'game-text-differs',
        severity: 'warning',
        range: { start: 6, end: 7 },
        message: 'Saved as UTF-8; the game reads "Â¤".',
      },
    ]);
    expect(diagnoseGameText('ą', 'interface', encoding('windows1252'))[0]?.message).toBe(
      'Saved as Windows 1252; the game reads "?".',
    );
  });

  it('shows control characters and cuts long runs in messages', () => {
    const [diagnostic] = diagnoseGameText('ā'.repeat(30), 'interface', encoding('utf8'));
    expect(diagnostic?.message).toBe(`Saved as UTF-8; the game reads "${'Ä\\x81'.repeat(20)}…".`);
  });

  it('reports U+FFFD in the editor as an error', () => {
    // A Windows-1252 file opened as UTF-8; saving writes EF BF BD.
    expect(diagnoseGameText('x\ufffdy', 'interface', encoding('utf8'))).toEqual([
      {
        code: 'replacement-character',
        severity: 'error',
        range: { start: 1, end: 2 },
        message:
          'The editor shows U+FFFD: the file was read with the wrong encoding, and saving ' +
          'destroys its original bytes. Saved as UTF-8; the game reads "ï¿½".',
      },
    ]);
    // In localisation the game reads U+FFFD back, but the bytes are still lost.
    const [diagnostic] = diagnoseGameText('\ufffd', 'localisation', encoding('utf8bom'));
    expect(diagnostic?.code).toBe('replacement-character');
    expect(diagnostic?.message).not.toContain('the game reads');
  });

  it('takes UTF-8 sequences in a file it misread for text only when Windows-1252 has them', () => {
    // A Windows-1252 file opened as UTF-8: "Jihomoravský" has a byte no UTF-8 reads, and the
    // bytes DA 9E of "Úžina" form a valid sequence, "ڞ", which the game shows as "Úž", as written.
    const misread = 'a = "Jihomoravsk�" b = "ڞina"';
    expect(diagnoseGameText(misread, 'script', encoding('utf8')).map((d) => d.code)).toEqual([
      'replacement-character',
    ]);
    // A mixed file: a name saved as UTF-8 among Windows-1252 bytes is still reported.
    const mixed = 'a = "�ed" b = "Dáire"';
    expect(diagnoseGameText(mixed, 'script', encoding('utf8')).map((d) => d.code)).toEqual([
      'replacement-character',
      'game-text-differs',
    ]);
    // A three-byte sequence is no chance: a stray "∂" before a comment with a Windows-1252 "ö".
    const stray = '\u2202 # B\ufffdttger';
    expect(diagnoseGameText(stray, 'script', encoding('utf8')).map((d) => d.message)).toEqual([
      'Saved as UTF-8; the game reads "âˆ‚".',
    ]);
    // Without U+FFFD the file is UTF-8, and every character the game reads otherwise is reported.
    expect(diagnoseGameText('b = "ڞina"', 'script', encoding('utf8'))[0]?.message).toBe(
      'Saved as UTF-8; the game reads "Úž".',
    );
    // A file saved as Windows-1252 writes "?" for "ą", whatever else it holds.
    expect(
      diagnoseGameText('� ą', 'interface', encoding('windows1252')).map((d) => d.code),
    ).toEqual(['replacement-character', 'game-text-differs']);
  });

  it('reads a script file as Windows-1252 and skips its comments', () => {
    // A country file saved as UTF-8: the leader's name shows as the game reads it.
    const text = '# Göran\nleader_names = { "Göran" Åke } # Åke\n';
    const found = diagnoseGameText(text, 'script', encoding('utf8'));
    expect(found.map((d) => [d.code, text.slice(d.range.start, d.range.end), d.message])).toEqual([
      ['game-text-differs', 'ö', 'Saved as UTF-8; the game reads "Ã¶".'],
      ['game-text-differs', 'Å', 'Saved as UTF-8; the game reads "Ã…".'],
    ]);
    expect(diagnoseGameText(text, 'script', encoding('windows1252'))).toEqual([]);
    expect(decodeGameText(bytes(0x47, 0xf6), 'script').text).toBe('Gö');
  });

  it('takes a # inside a script string, also over several lines, for text', () => {
    const text = 'a = "x #\n é"\nb = 1 # é';
    const found = diagnoseGameText(text, 'script', encoding('utf8'));
    expect(found.map((d) => d.range.start)).toEqual([text.indexOf('é')]);
    // A string that never closes ends at its line end.
    const open = 'a = "x\n# é';
    expect(diagnoseGameText(open, 'script', encoding('utf8'))).toEqual([]);
  });

  it('keeps U+FFFD in script text an error, but not in a comment', () => {
    const text = 'name = "x�y" # z�';
    const found = diagnoseGameText(text, 'script', encoding('utf8'));
    expect(found.map((d) => [d.code, d.range.start])).toEqual([['replacement-character', 9]]);
  });

  it('warns about a BOM in an interface file', () => {
    expect(diagnoseGameText('a', 'interface', encoding('utf8bom'))).toEqual([
      {
        code: 'interface-bom',
        severity: 'warning',
        range: { start: 0, end: 0 },
        message:
          "Saved with a UTF-8 BOM; the game's handling of a BOM in an interface file is unverified.",
      },
    ]);
  });

  it('warns about localisation that is not UTF-8 with BOM', () => {
    expect(diagnoseGameText('l_english:', 'localisation', encoding('utf8'))).toEqual([
      {
        code: 'localisation-encoding',
        severity: 'warning',
        range: { start: 0, end: 0 },
        message: 'Saved as UTF-8; the game expects localisation in UTF-8 with BOM.',
      },
    ]);
    const cp1252 = diagnoseGameText('k:0 "é"', 'localisation', encoding('windows1252'));
    expect(cp1252.map((d) => d.code)).toEqual(['localisation-encoding', 'game-text-differs']);
    expect(cp1252[1]?.message).toBe('Saved as Windows 1252; the game reads "\ufffd".');
  });

  it('treats U+FEFF inside the text as a character, not a byte order mark', () => {
    expect(diagnoseGameText('a\ufeffb', 'localisation', encoding('utf8bom'))).toEqual([]);
  });

  it('reports UTF-16 as unreadable', () => {
    expect(diagnoseGameText('abc', 'interface', encoding('utf16le'))).toEqual([
      {
        code: 'unreadable-encoding',
        severity: 'error',
        range: { start: 0, end: 3 },
        message: 'Saved as UTF-16 LE; the game reads every character as two or more bytes.',
      },
    ]);
  });

  it('agrees with encoding and reading the whole document', () => {
    // Run by run is exact because ASCII is saved as itself in these encodings.
    const text = 'a ¤é\ufffd b ąš€ 😀 c';
    for (const id of ['utf8', 'utf8bom', 'windows1252']) {
      for (const kind of ['interface', 'localisation'] as const) {
        const save = encoding(id);
        let pieced = text;
        for (const run of nonAsciiRuns(text).reverse()) {
          const game = decodeGameText(save.encode(text.slice(run.start, run.end)), kind).text;
          pieced = pieced.slice(0, run.start) + game + pieced.slice(run.end);
        }
        expect(pieced, `${id} ${kind}`).toBe(decodeGameText(encodeForSave(text, save), kind).text);
      }
    }
  });
});
