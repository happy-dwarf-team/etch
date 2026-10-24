import { readFileSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  clashingPaths,
  detectLicense,
  gameManifest,
  parsePins,
  readZip,
  renderNotices,
  takeFiles,
  type GameBuildPins,
  type PinnedBuild,
} from '../game-builds.mts';

const MIT = `MIT License

Copyright (c) 2026 Happy Dwarf Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction.`;
const BSL = `Boost Software License - Version 1.0 - August 17th, 2003

Permission is hereby granted, free of charge, to any person or organization
obtaining a copy of the software and accompanying documentation covered by
this license (the "Software")`;
const GPL = 'GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007';

const committed = (): unknown =>
  JSON.parse(readFileSync(new URL('../../../pins/game-builds.json', import.meta.url), 'utf8'));

/** A zip of the given files, each stored or deflated, as `readZip` expects to find it. */
function zip(files: Record<string, string>, deflate = true): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const packed = deflate ? deflateRawSync(data) : data;
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const build = (overrides: Partial<PinnedBuild> = {}): PinnedBuild => ({
  id: 'bellows',
  name: 'Bellows',
  tag: 'v0.9.0',
  url: 'https://github.com/happy-dwarf-team/bellows/releases/download/v0.9.0/bellows-windows-x64.zip',
  sha256: 'A'.repeat(64),
  into: 'anvil/plugins/',
  files: ['bellows/'],
  licenses: [{ component: 'Bellows', spdx: 'MIT', file: 'bellows/LICENSE' }],
  ...overrides,
});

const archive = (files: Record<string, string>) =>
  new Map(Object.entries(files).map(([path, text]) => [path, Buffer.from(text)]));

describe('the pin file', () => {
  it('pins Anvil and Bellows with allowed licences and the 1.37.5 game', () => {
    const { pins, problems } = parsePins(committed());
    expect(problems).toEqual([]);
    expect(pins?.game.version).toBe('1.37.5');
    expect(pins?.builds.map((b) => b.id)).toEqual(['anvil', 'bellows']);
  });

  it('reports each wrong field where it is', () => {
    const pins = committed() as { builds: Record<string, unknown>[] };
    const [anvil, bellows] = pins.builds;
    if (anvil === undefined || bellows === undefined) throw new Error('two builds expected');
    anvil['url'] = 'https://example.com/anvil.zip';
    anvil['sha256'] = 'abc';
    bellows['tag'] = 'v0.8.0';
    bellows['licenses'] = [{ component: 'Bellows', spdx: 'GPL-3.0', file: 'bellows/LICENSE' }];
    bellows['files'] = ['../outside/'];
    bellows['extra'] = true;
    const { pins: parsed, problems } = parsePins(pins);
    expect(parsed).toBeUndefined();
    expect(problems.map((p) => p.at)).toEqual([
      'builds[0].url',
      'builds[0].sha256',
      'builds[1].extra',
      'builds[1].files[0]',
      'builds[1].licenses[0].spdx',
      'builds[1].url',
    ]);
  });

  it("asks for the build's own licence first", () => {
    const pins = committed() as { builds: { licenses: unknown[] }[] };
    pins.builds[1]?.licenses.reverse();
    expect(parsePins(pins).problems).toEqual([
      { at: 'builds[1].licenses', message: "The first licence must be Bellows's own." },
    ]);
  });
});

describe('readZip', () => {
  it('reads stored and deflated files and leaves directories out', () => {
    for (const deflate of [false, true]) {
      const files = readZip(
        zip({ 'a/': '', 'a/b.txt': 'hello', 'c.dll': 'x'.repeat(1000) }, deflate),
      );
      expect([...files.keys()]).toEqual(['a/b.txt', 'c.dll']);
      expect(files.get('a/b.txt')?.toString()).toBe('hello');
      expect(files.get('c.dll')?.length).toBe(1000);
    }
  });

  it('refuses a corrupt entry and a path out of the folder', () => {
    const corrupt = zip({ 'a.txt': 'hello' }, false);
    corrupt[30 + 'a.txt'.length] = 'j'.charCodeAt(0);
    expect(() => readZip(corrupt)).toThrow('corrupt entry: a.txt');
    expect(() => readZip(zip({ '../evil.dll': 'x' }))).toThrow('unsafe path');
    expect(() => readZip(Buffer.from('not a zip'))).toThrow('not a zip');
  });
});

describe('takeFiles', () => {
  it('takes folders and files unchanged under `into`', () => {
    const { files, problems } = takeFiles(
      build(),
      archive({ 'bellows/LICENSE': MIT, 'bellows/bellows.dll': 'dll', 'SHA256SUMS.txt': '' }),
    );
    expect(problems).toEqual([]);
    expect(files.map((f) => [f.path, f.build, f.data.toString()])).toEqual([
      ['anvil/plugins/bellows/LICENSE', 'bellows', MIT],
      ['anvil/plugins/bellows/bellows.dll', 'bellows', 'dll'],
    ]);
  });

  it('reports missing files, wrong and undeclared licences', () => {
    const { problems } = takeFiles(
      build({
        files: ['bellows/', 'bellows.exe'],
        licenses: [
          { component: 'Bellows', spdx: 'MIT', file: 'bellows/LICENSE' },
          {
            component: 'SafetyHook',
            spdx: 'MIT',
            file: 'bellows/third-party/safetyhook-LICENSE.txt',
          },
          { component: 'Missing', spdx: 'MIT', file: 'docs/LICENSE' },
        ],
      }),
      archive({
        'bellows/LICENSE': GPL,
        'bellows/third-party/safetyhook-LICENSE.txt': BSL,
        'bellows/third-party/zydis-LICENSE.txt': MIT,
      }),
    );
    expect(problems).toEqual([
      'bellows: "bellows.exe" is not in the archive',
      'bellows: "bellows/LICENSE" reads as no allowed licence, not MIT',
      'bellows: "bellows/third-party/safetyhook-LICENSE.txt" reads as BSL-1.0, not MIT',
      'bellows: the licence file "docs/LICENSE" is not taken',
      'bellows: "bellows/third-party/zydis-LICENSE.txt" looks like a licence but is not in licenses',
    ]);
  });
});

describe('licences and paths', () => {
  it('tells the allowed licences apart by their wording', () => {
    expect(detectLicense(MIT)).toBe('MIT');
    expect(detectLicense(BSL)).toBe('BSL-1.0');
    expect(detectLicense('Apache License\n  Version 2.0, January 2004')).toBe('Apache-2.0');
    expect(
      detectLicense('Redistribution and use in source and binary forms, with or without'),
    ).toBe('BSD-2-Clause');
    expect(
      detectLicense('Redistribution and use in source and binary forms ... Neither the name of'),
    ).toBe('BSD-3-Clause');
    expect(detectLicense(GPL)).toBeUndefined();
  });

  it('finds two builds writing one path, whatever its case', () => {
    const file = (path: string, b: string) => ({ path, build: b, data: Buffer.alloc(0) });
    expect(
      clashingPaths([file('anvil/a.toml', 'anvil'), file('Anvil/A.toml', 'etch'), file('b', 'x')]),
    ).toEqual(['Anvil/A.toml (anvil and etch)']);
  });
});

describe('what packaging writes', () => {
  const pins = parsePins(committed()).pins as GameBuildPins;

  it('lists every file with its hash in game/manifest.json, sorted by path', () => {
    const manifest = gameManifest(pins, [
      { path: 'version.dll', build: 'anvil', data: Buffer.from('') },
      { path: 'anvil/anvil.toml', build: 'anvil', data: Buffer.from('') },
    ]);
    expect(manifest.game).toEqual(pins.game);
    expect(manifest.files).toEqual([
      {
        path: 'anvil/anvil.toml',
        sha256: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
        build: 'anvil',
      },
      {
        path: 'version.dll',
        sha256: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
        build: 'anvil',
      },
    ]);
  });

  it('names every component and its licence text in the notices', () => {
    const notices = renderNotices(pins, '0.3.0', false);
    for (const b of pins.builds) {
      for (const license of b.licenses) {
        expect(notices).toContain(`| ${license.component} |`);
        expect(notices).toContain(`\`game/${b.into ?? ''}${license.file}\``);
      }
      expect(notices).toContain(b.sha256);
    }
    expect(notices).toContain('| SafetyHook | | BSL-1.0 |');
    expect(notices).not.toContain('game plugin');
    expect(renderNotices(pins, '0.3.0', true)).toContain(
      'and the game plugin `game/anvil/plugins/etch/`',
    );
  });
});
