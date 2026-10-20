import { describe, expect, it } from 'vitest';
import { decodeDescriptor, parseModDescriptor, parseVdf } from '../../src/playset/index.ts';

describe('parseVdf', () => {
  it('reads libraryfolders.vdf with nested blocks, escapes and comments', () => {
    const vdf = parseVdf(`"libraryfolders"
{
\t// the default library
\t"0"
\t{
\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"
\t\t"apps"
\t\t{
\t\t\t"236850"\t\t"6963493285"
\t\t}
\t}
\t"1" { "path" "D:\\\\SteamLibrary" "apps" { } }
}`);
    expect(vdf).toEqual({
      libraryfolders: {
        '0': { path: 'C:\\Program Files (x86)\\Steam', apps: { '236850': '6963493285' } },
        '1': { path: 'D:\\SteamLibrary', apps: {} },
      },
    });
  });

  it('reads the old flat format, bare tokens and platform conditionals', () => {
    expect(parseVdf('LibraryFolders { "1" "E:\\\\Games" contentstatsid 42 [$WIN32] }')).toEqual({
      LibraryFolders: { '1': 'E:\\Games', contentstatsid: '42' },
    });
  });

  it('returns what it read from truncated input', () => {
    expect(parseVdf('"a" { "b" "c" "d"')).toEqual({ a: { b: 'c' } });
  });
});

describe('parseModDescriptor', () => {
  it('reads the fields Etch uses and ignores the rest', () => {
    const descriptor = parseModDescriptor(`\uFEFFversion="1.0"
tags={
\t"Fixes"
}
name="Dwarven Knowledge + Proper 2k UI Compatiblity Patch"
dependencies={
\t"Dwarven Knowledge"
\t"Proper 2K UI - Anbennar"
}
replace_path="common/ideas"
replace_path = gfx/loadingscreens # a comment
supported_version="v1.37.*"
path="C:/mods/DK-2KUI/src"
remote_file_id="123"
`);
    expect(descriptor).toEqual({
      name: 'Dwarven Knowledge + Proper 2k UI Compatiblity Patch',
      version: '1.0',
      dependencies: ['Dwarven Knowledge', 'Proper 2K UI - Anbennar'],
      replacePaths: ['common/ideas', 'gfx/loadingscreens'],
      supportedVersion: 'v1.37.*',
      path: 'C:/mods/DK-2KUI/src',
      remoteFileId: '123',
    });
  });

  it('keeps backslashes and braces inside quoted values', () => {
    const descriptor = parseModDescriptor(
      'name="A {weird} = name"\npath="C:\\mods\\a"\ndependencies={ "}" }',
    );
    expect(descriptor.name).toBe('A {weird} = name');
    expect(descriptor.path).toBe('C:\\mods\\a');
    expect(descriptor.dependencies).toEqual(['}']);
  });

  it('reads archive mods and survives a malformed file', () => {
    expect(parseModDescriptor('archive="mod/old.zip"').archive).toBe('mod/old.zip');
    expect(parseModDescriptor('name="x"\ndependencies={ "a"').dependencies).toEqual(['a']);
    expect(parseModDescriptor('= = name').name).toBeUndefined();
  });
});

describe('decodeDescriptor', () => {
  it('decodes UTF-8 and falls back to Windows-1252', () => {
    expect(decodeDescriptor(new TextEncoder().encode('name="Zażółć"'))).toBe('name="Zażółć"');
    expect(decodeDescriptor(Uint8Array.of(0x6e, 0x3d, 0xe9))).toBe('n=é');
  });
});
