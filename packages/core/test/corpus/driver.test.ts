/// <reference types="node" />
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashModFolder, readCorpusManifest, type CorpusManifest } from '../../src/corpus/index.ts';
import {
  describeSession,
  planCaptures,
  type CaptureSession,
} from '../../src/corpus/driver/plan.ts';
import {
  playsetProfile,
  prepareProfile,
  profileDescriptor,
  snapshotChanges,
  snapshotFolder,
} from '../../src/corpus/driver/profile.ts';
import {
  displayModeFor,
  pdxSettingsVariant,
  settingsVariant,
  unexpectedChanges,
  variantName,
} from '../../src/corpus/driver/settings.ts';
import { makeTree, removeTree } from '../playset/fixture.ts';

const CORPUS = join(import.meta.dirname, '..', '..', '..', '..', 'corpus');

async function corpusManifest(): Promise<CorpusManifest> {
  const { manifest, problems } = await readCorpusManifest(join(CORPUS, 'manifest.json'));
  expect(problems).toEqual([]);
  return manifest as CorpusManifest;
}

const SETTINGS = `language="l_english"
graphics={
\tsize={
\t\tx=3440
\t\ty=1440
\t}

\tmin_gui={
\t\tx=1280
\t\ty=720
\t}

\tgame_ui_scale=1.000
\trefreshRate=144
\tfullScreen=no
\tborderless=yes
\tmulti_sampling=8
}
`;

const PDX = `"Graphics"={
\t"fullscreen_resolution"={
\t\tvalue="3440x1440"
\t\tversion=0
\t}
\t"windowed_resolution"={
\t\tvalue="3440x1440"
\t\tversion=0
\t}
\t"display_mode"={
\t\tvalue="borderless_fullscreen"
\t\tversion=0
\t}
}
`;

const MONITOR = { width: 3440, height: 1440 };
const HD = { width: 1920, height: 1080 };

describe('display settings for a resolution', () => {
  it('captures the monitor borderless and smaller sizes windowed', () => {
    expect(displayModeFor(MONITOR, MONITOR)).toBe('borderless');
    expect(displayModeFor(HD, MONITOR)).toBe('windowed');
    expect(() => displayModeFor({ width: 3840, height: 1080 }, MONITOR)).toThrow(
      'does not fit the 3440x1440 monitor',
    );
    expect(variantName('pdx-settings', HD, 'windowed')).toBe('pdx-settings-1920x1080-windowed.txt');
  });

  it("changes only settings.txt's size, full screen and borderless", () => {
    const variant = settingsVariant(SETTINGS, HD, 'windowed');
    expect(variant).toContain('size={\n\t\tx=1920\n\t\ty=1080\n\t}');
    expect(variant).toContain('min_gui={\n\t\tx=1280\n\t\ty=720');
    expect(variant).toContain('\tborderless=no');
    expect(unexpectedChanges(SETTINGS, variant)).toEqual([
      '- \t\tx=3440',
      '- \t\ty=1440',
      '- \tborderless=yes',
      '+ \t\tx=1920',
      '+ \t\ty=1080',
      '+ \tborderless=no',
    ]);
    expect(settingsVariant(SETTINGS, MONITOR, 'borderless')).toBe(SETTINGS);
    expect(() => settingsVariant('language="l_english"\n', HD, 'windowed')).toThrow(
      'no graphics.size.x',
    );
  });

  it("sets pdx_settings.txt's windowed resolution and display mode", () => {
    const windowed = pdxSettingsVariant(PDX, HD, 'windowed');
    expect(windowed).toContain('"windowed_resolution"={\n\t\tvalue="1920x1080"');
    expect(windowed).toContain('"display_mode"={\n\t\tvalue="windowed"');
    expect(windowed).toContain('"fullscreen_resolution"={\n\t\tvalue="3440x1440"');
    expect(pdxSettingsVariant(PDX, MONITOR, 'borderless')).toBe(PDX);
    // Without a baseline the file is written as the game writes it at a first start.
    expect(pdxSettingsVariant(undefined, MONITOR, 'borderless')).toBe(PDX);
    expect(() => pdxSettingsVariant('"Graphics"={\n}\n', HD, 'windowed')).toThrow(
      'no windowed_resolution',
    );
  });

  it('allows the game to change only refreshRate and graceful_exit', () => {
    const after = `${SETTINGS.replace('refreshRate=144', 'refreshRate=60')}graceful_exit=yes\n`;
    expect(unexpectedChanges(SETTINGS, after)).toEqual([]);
    expect(
      unexpectedChanges(SETTINGS, after.replace('multi_sampling=8', 'multi_sampling=4')),
    ).toEqual(['- \tmulti_sampling=8', '+ \tmulti_sampling=4']);
  });
});

describe('planCaptures', () => {
  it("starts the game three times per playset and resolution: main menu, save, event's save", async () => {
    const manifest = await corpusManifest();
    const plan = planCaptures(manifest);
    // Each release playset at its own confirmed resolutions (Proper 2K UI Enhanced from 2560×1440).
    const confirmed = manifest.resolutions.filter((r) => r.confirmed);
    const pairs = manifest.playsets
      .filter((p) => p.gate === 'release')
      .reduce(
        (n, p) =>
          n +
          confirmed.filter(
            (r) =>
              p.resolutions === undefined ||
              p.resolutions.includes(`${String(r.width)}x${String(r.height)}`),
          ).length,
        0,
      );
    expect(plan.sessions).toHaveLength(pairs * 3);
    expect(describeSession(plan.sessions[0] as CaptureSession)).toBe(
      'vanilla 1280x720 from main-menu: main-menu, lobby',
    );
    expect(plan.sessions[1]?.start).toBe('save');
    expect(plan.sessions[1]?.views.map((v) => v.id)).toContain('diplomacy-dialog');
    // The event view loads a save with an event open (etch#97).
    expect(describeSession(plan.sessions[2] as CaptureSession)).toBe(
      'vanilla 1280x720 from save Russia1719_03_17_event.eu4: event',
    );
    expect(plan.skipped).toEqual([]);
  });

  it('filters by playset, resolution and view, and refuses unknown names', async () => {
    const manifest = await corpusManifest();
    const plan = planCaptures(manifest, {
      playsets: ['vanilla'],
      resolutions: ['1920x1080'],
      views: ['main-menu', 'ledger'],
    });
    expect(plan.sessions.map(describeSession)).toEqual([
      'vanilla 1920x1080 from main-menu: main-menu',
      'vanilla 1920x1080 from save: ledger',
    ]);
    expect(() => planCaptures(manifest, { playsets: ['nope'], resolutions: ['1x1'] })).toThrow(
      'The manifest has no playset "nope", resolution 1x1.',
    );
    expect(() => planCaptures(manifest, { views: ['ledger', 'nowhere'] })).toThrow(
      'The manifest has no view "nowhere".',
    );
  });

  it('leaves out report playsets unless every capture is asked for', async () => {
    const manifest = await corpusManifest();
    const gating = planCaptures(manifest);
    expect(gating.sessions.every((s) => s.playset.gate === 'release')).toBe(true);
    const all = planCaptures(manifest, { gating: false, playsets: ['anbennar'] });
    // The Anbennar playset has its save and pins (etch#55): every view of its windows is planned.
    expect(all.skipped).toEqual([]);
    expect(all.sessions.map(describeSession)).toContain(
      'anbennar 3440x1440 from save: hud, esc-menu, message-settings, court, diplomacy, diplomacy-dialog, province, province-foreign, ledger, settings, macro-builder, estates',
    );
  });

  it('skips, with the reason, a view without roots, a save view without a save and an unpinned mod', async () => {
    type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
    const manifest = structuredClone(await corpusManifest()) as Mutable<CorpusManifest>;
    const view = manifest.windows.flatMap((w) => w.views).find((v) => v.id === 'ledger');
    if (view === undefined) throw new Error('no ledger view');
    view.roots = [];
    const vanilla = manifest.playsets.find((p) => p.id === 'vanilla');
    if (vanilla === undefined) throw new Error('no vanilla playset');
    delete vanilla.save;
    const anbennar = manifest.playsets.find((p) => p.id === 'anbennar');
    const mod = anbennar?.mods[0];
    if (mod === undefined) throw new Error('no Anbennar mod');
    delete mod.sha256;
    const plan = planCaptures(manifest, {
      gating: false,
      playsets: ['vanilla', 'anbennar'],
      resolutions: ['3440x1440'],
      views: ['main-menu', 'ledger', 'court'],
    });
    const skip = (playset: string, view: string, reason: string) => ({
      playset,
      resolution: '3440x1440',
      view,
      reason,
    });
    const unpinned = 'The playset "anbennar" has a mod without a Workshop item or a pin.';
    expect(plan.skipped).toEqual([
      skip('vanilla', 'court', 'The playset "vanilla" has no save.'),
      skip('vanilla', 'ledger', 'The recipe names no roots to read.'),
      skip('anbennar', 'main-menu', unpinned),
      skip('anbennar', 'court', unpinned),
      // The roots are checked first.
      skip('anbennar', 'ledger', 'The recipe names no roots to read.'),
    ]);
    // Only vanilla's main menu needs neither a save nor the mod.
    expect(plan.sessions.map(describeSession)).toEqual([
      'vanilla 3440x1440 from main-menu: main-menu',
    ]);
  });
});

describe('the playset profile', () => {
  const trees: string[] = [];
  afterEach(async () => {
    await Promise.all(trees.splice(0).map(removeTree));
  });

  it("points the Workshop item's descriptor at its folder", () => {
    expect(
      profileDescriptor(
        '\uFEFFname="A mod"\r\npath="mod/old"\r\narchive="x.zip"\r\nsupported_version="v1.37.*.*"\r\n\r\n',
        'C:\\Steam\\workshop\\123',
      ),
    ).toBe('name="A mod"\nsupported_version="v1.37.*.*"\npath="C:/Steam/workshop/123"\n');
  });

  it('writes descriptors, dlc_load.json, the settings baseline and the save, checking the pins', async () => {
    const sources = await makeTree({
      'workshop/123/descriptor.mod': 'name="A mod"\n',
      'workshop/123/interface/a.gui': 'guiTypes = {}\n',
      'saves/a.eu4': 'EU4txt',
      'settings.txt': SETTINGS,
    });
    const host = await makeTree({});
    trees.push(sources, host);
    const pin = await hashModFolder(join(sources, 'workshop', '123'));
    const { createHash } = await import('node:crypto');
    const saveSha = createHash('sha256').update('EU4txt').digest('hex').toUpperCase();
    const playset = {
      id: 'modded',
      title: 'Modded',
      gate: 'release' as const,
      save: { file: 'a.eu4', sha256: saveSha, description: 'a save' },
      mods: [{ name: 'A mod', workshopId: '123', sha256: pin }],
      disabledDlcs: ['Golden Century'],
      windows: [],
    };
    const options = {
      settingsBaseline: join(sources, 'settings.txt'),
      workshop: join(sources, 'workshop'),
      saves: join(sources, 'saves'),
    };
    expect(await prepareProfile(host, playset, options)).toEqual({
      saveSha256: saveSha,
      mods: [{ name: 'A mod', sha256: pin }],
    });
    const { profile, baselines } = playsetProfile(host, 'modded');
    expect(await readFile(join(profile, 'mod', 'ugc_123.mod'), 'utf8')).toBe(
      `name="A mod"\npath="${join(sources, 'workshop', '123').replaceAll('\\', '/')}"\n`,
    );
    expect(JSON.parse(await readFile(join(profile, 'dlc_load.json'), 'utf8'))).toEqual({
      enabled_mods: ['mod/ugc_123.mod'],
      disabled_dlcs: ['Golden Century'],
    });
    expect(await readFile(join(profile, 'settings.txt'), 'utf8')).toBe(SETTINGS);
    expect(await readFile(join(baselines, 'settings-baseline.txt'), 'utf8')).toBe(SETTINGS);
    expect(await readFile(join(profile, 'save games', 'a.eu4'), 'utf8')).toBe('EU4txt');

    // The last save the game loaded is forgotten before every start: no Continue on the main menu.
    await writeFile(join(profile, 'continue_game.json'), '{"filename":"save games/a.eu4"}');
    await prepareProfile(host, playset, options);
    expect(existsSync(join(profile, 'continue_game.json'))).toBe(false);

    // A changed copy of the save in the profile stops it, and so does one in the player's folder
    // for a profile that has none yet.
    await writeFile(join(profile, 'save games', 'a.eu4'), 'EU4txt changed');
    await expect(prepareProfile(host, playset, options)).rejects.toThrow(
      "The profile's copy of a.eu4 is not the save the manifest pins.",
    );
    const other = await makeTree({});
    trees.push(other);
    await writeFile(join(sources, 'saves', 'a.eu4'), 'EU4txt changed');
    await expect(prepareProfile(other, playset, options)).rejects.toThrow(
      `${join(sources, 'saves', 'a.eu4')} is not the save the manifest pins.`,
    );
    // Without a save, only the mods.
    const { save, ...withoutSave } = playset;
    expect(save.file).toBe('a.eu4');
    expect(await prepareProfile(other, withoutSave, options)).toEqual({
      mods: [{ name: 'A mod', sha256: pin }],
    });
    // A mod without a Workshop item or pin cannot be captured.
    await expect(
      prepareProfile(other, { ...playset, mods: [{ name: 'Local mod' }] }, options),
    ).rejects.toThrow('"Local mod" has no Workshop item or pin; the playset cannot be captured.');

    // A mod that no longer matches its pin stops the profile.
    await writeFile(join(sources, 'workshop', '123', 'interface', 'a.gui'), 'changed');
    await expect(prepareProfile(host, playset, options)).rejects.toThrow('the manifest pins');
  });

  it('notices a changed, added or removed file in a snapshot', async () => {
    const root = await makeTree({ 'a.txt': 'a', 'cache/big.bin': 'x', 'logs/b.txt': 'b' });
    trees.push(root);
    const before = await snapshotFolder(root);
    expect([...before.keys()].sort()).toEqual(['a.txt', 'logs/b.txt']);
    await writeFile(join(root, 'a.txt'), 'aa');
    await writeFile(join(root, 'c.txt'), 'c');
    await writeFile(join(root, 'cache', 'big.bin'), 'yy');
    await rm(join(root, 'logs', 'b.txt'));
    expect(snapshotChanges(before, await snapshotFolder(root))).toEqual([
      'added c.txt',
      'changed a.txt',
      'removed logs/b.txt',
    ]);
    // A folder that is not there has no files.
    expect(await snapshotFolder(join(root, 'missing'))).toEqual(new Map());
  });
});
