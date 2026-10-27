import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  autosaveOf,
  copySave,
  copySettings,
  isIronman,
  listSaves,
  liveSettings,
  newestSave,
  zipEntry,
} from '../src/live-game/saves.ts';

/** A zip as the game writes a compressed save: deflated entries with a central directory. */
function zip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = deflateRawSync(Buffer.from(text, 'latin1'));
    const nameBytes = Buffer.from(name, 'latin1');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(text.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(8, 10);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(text.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    central.push(header, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

let temp: string;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'etch-saves-'));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('liveSettings', () => {
  it('turns an autosave that is off into a monthly one, and leaves any other alone', () => {
    expect(autosaveOf('debug_saves=0\nautosave="YEARLY"\n')).toBe('YEARLY');
    expect(liveSettings('autosave="YEARLY"\n')).toEqual({
      text: 'autosave="YEARLY"\n',
      autosaveOn: false,
    });
    expect(liveSettings('x=1\r\nautosave="NEVER"\r\nautosave_tocloud=no\r\n')).toEqual({
      text: 'x=1\r\nautosave="MONTHLY"\r\nautosave_tocloud=no\r\n',
      autosaveOn: true,
    });
    expect(liveSettings('no autosave line\n').autosaveOn).toBe(false);
  });
});

describe('copySettings', () => {
  it('copies the files the player has and keeps the others', async () => {
    const player = join(temp, 'player');
    const profile = join(temp, 'private');
    await mkdir(player, { recursive: true });
    await mkdir(profile, { recursive: true });
    // Windows-1252 bytes survive the copy.
    await writeFile(
      join(player, 'settings.txt'),
      Buffer.from('name="J\xF6rg"\nautosave="NEVER"\n', 'latin1'),
    );
    await writeFile(join(profile, 'pdx_settings.txt'), 'kept');
    expect(await copySettings(player, profile)).toEqual({
      copied: ['settings.txt'],
      autosaveOn: true,
    });
    expect(await readFile(join(profile, 'settings.txt'))).toEqual(
      Buffer.from('name="J\xF6rg"\nautosave="MONTHLY"\n', 'latin1'),
    );
    expect(await readFile(join(profile, 'pdx_settings.txt'), 'utf8')).toBe('kept');
    expect((await readdir(profile)).sort()).toEqual(['pdx_settings.txt', 'settings.txt']);
  });
});

describe('saves', () => {
  async function save(name: string, content: Buffer | string, minutesAgo: number): Promise<void> {
    const path = join(temp, 'saves', name);
    await mkdir(join(temp, 'saves'), { recursive: true });
    await writeFile(path, content);
    const time = new Date(Date.now() - minutesAgo * 60_000);
    await utimes(path, time, time);
  }

  it('lists the saves newest first and tells ironman ones', async () => {
    await save('plain.eu4', 'EU4txt\ndate=1444.11.11\nplayer="FRA"\n', 30);
    await save('plain_ironman.eu4', 'EU4txt\ndate=1444.11.11\nironman=yes\n', 20);
    await save('binary.eu4', Buffer.from('EU4bin\x01\x00\x02', 'latin1'), 10);
    await save(
      'zipped.eu4',
      zip({ meta: 'EU4txt\ndate=1500.1.1\n', gamestate: 'EU4txt\n', ai: 'EU4txt\n' }),
      5,
    );
    await save('zipped_ironman.eu4', zip({ meta: 'EU4bin\x01\x00', gamestate: 'EU4bin' }), 1);
    await save('notes.txt', 'not a save', 0);
    const saves = await listSaves(join(temp, 'saves'));
    expect(saves.map((s) => [s.name, s.ironman])).toEqual([
      ['zipped_ironman.eu4', true],
      ['zipped.eu4', false],
      ['binary.eu4', true],
      ['plain_ironman.eu4', true],
      ['plain.eu4', false],
    ]);
    expect((await newestSave(join(temp, 'saves')))?.name).toBe('zipped_ironman.eu4');
    expect(await newestSave(join(temp, 'none'))).toBeUndefined();
    expect(await zipEntry(join(temp, 'saves', 'zipped.eu4'), 'meta')).toEqual(
      Buffer.from('EU4txt\ndate=1500.1.1\n'),
    );
    expect(await zipEntry(join(temp, 'saves', 'plain.eu4'), 'meta')).toBeUndefined();
    expect(await isIronman(join(temp, 'saves', 'missing.eu4'))).toBe(false);
  });

  it('copies a save without overwriting a game played on in the live game', async () => {
    await save('Verne1444_11_11.eu4', 'EU4txt\nfirst\n', 10);
    const privateSaves = join(temp, 'private', 'save games');
    const [first] = await listSaves(join(temp, 'saves'));
    if (first === undefined) throw new Error('a save expected');
    expect(await copySave(first, privateSaves)).toBe('Verne1444_11_11.eu4');
    // The same save again: the copy is still the same, and it starts from it.
    expect(await copySave(first, privateSaves)).toBe('Verne1444_11_11.eu4');
    // Played on in the live game: a new copy beside it.
    await writeFile(join(privateSaves, 'Verne1444_11_11.eu4'), 'EU4txt\nplayed on\n');
    expect(await copySave(first, privateSaves)).toBe('Verne1444_11_11-2.eu4');
    expect(await readFile(join(privateSaves, 'Verne1444_11_11.eu4'), 'utf8')).toBe(
      'EU4txt\nplayed on\n',
    );
    expect((await readdir(privateSaves)).sort()).toEqual([
      'Verne1444_11_11-2.eu4',
      'Verne1444_11_11.eu4',
    ]);
  });
});
