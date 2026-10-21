/**
 * The capturing profile of a playset in the capture host install (etch#21, etch#42): a private
 * `-userdir` that holds the playset's mods as descriptors with absolute paths to the Workshop
 * items, `dlc_load.json`, a copy of the playset's save and the display settings. Named baselines
 * of the settings files sit next to the profile, outside it, so the game never sees them. The
 * player's own profile, saves and mods are only read.
 */
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CorpusPlayset } from '../manifest.ts';
import { hashFile, hashModFolder } from '../files.ts';

export interface PlaysetProfile {
  /** The `-userdir` folder. */
  readonly profile: string;
  /** The named baselines and variants of the settings files. */
  readonly baselines: string;
}

export function playsetProfile(hostDir: string, playset: string): PlaysetProfile {
  return {
    profile: join(hostDir, 'profiles', playset, 'profile'),
    baselines: join(hostDir, 'profiles', playset, 'baselines'),
  };
}

export interface ProfileSources {
  /** The `settings.txt` a new profile starts from (the lab's start-up baseline, UI scale 1). */
  readonly settingsBaseline: string;
  /** Steam's Workshop folder of EU4, `…/steamapps/workshop/content/236850`. */
  readonly workshop: string;
  /** The player's `save games` folder, from which the playset's save is copied once. */
  readonly saves: string;
}

/** The mod's descriptor for the profile: the Workshop item's own, pointing at its folder. */
export function profileDescriptor(itemDescriptor: string, itemFolder: string): string {
  const text = itemDescriptor.charCodeAt(0) === 0xfeff ? itemDescriptor.slice(1) : itemDescriptor;
  const lines = text.split(/\r?\n/).filter((line) => !/^\s*(path|archive)\s*=/.test(line));
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
  return `${[...lines, `path="${itemFolder.replaceAll('\\', '/')}"`].join('\n')}\n`;
}

/**
 * Creates or refreshes the playset's profile: `settings.txt` and its named baseline at the first
 * use, the mod descriptors and `dlc_load.json` every time, and the save copied once. Checks the
 * save's hash and every mod's content hash against the manifest; returns the hashes it read.
 */
export async function prepareProfile(
  hostDir: string,
  playset: CorpusPlayset,
  sources: ProfileSources,
): Promise<{ saveSha256?: string; mods: { name: string; sha256: string }[] }> {
  const { profile, baselines } = playsetProfile(hostDir, playset.id);
  await mkdir(join(profile, 'mod'), { recursive: true });
  await mkdir(baselines, { recursive: true });

  const settingsBaseline = join(baselines, 'settings-baseline.txt');
  if (!(await exists(settingsBaseline))) {
    await copyFile(sources.settingsBaseline, settingsBaseline);
    await copyFile(sources.settingsBaseline, join(profile, 'settings.txt'));
  }

  const mods: { name: string; sha256: string }[] = [];
  const enabled: string[] = [];
  for (const entry of await readdir(join(profile, 'mod'))) {
    if (entry.endsWith('.mod')) await rm(join(profile, 'mod', entry));
  }
  for (const mod of playset.mods) {
    if (mod.workshopId === undefined || mod.sha256 === undefined) {
      throw new Error(`"${mod.name}" has no Workshop item or pin; the playset cannot be captured.`);
    }
    const folder = join(sources.workshop, mod.workshopId);
    const sha256 = await hashModFolder(folder);
    if (sha256 !== mod.sha256) {
      throw new Error(
        `"${mod.name}" (${folder}) has the content hash ${sha256}; the manifest pins ${mod.sha256}.`,
      );
    }
    const descriptor = await readFile(join(folder, 'descriptor.mod'), 'utf8');
    const file = `ugc_${mod.workshopId}.mod`;
    await writeFile(join(profile, 'mod', file), profileDescriptor(descriptor, folder));
    enabled.push(`mod/${file}`);
    mods.push({ name: mod.name, sha256 });
  }
  await writeFile(
    join(profile, 'dlc_load.json'),
    JSON.stringify({ enabled_mods: enabled, disabled_dlcs: playset.disabledDlcs }),
  );

  if (playset.save === undefined) return { mods };
  const saveFolder = join(profile, 'save games');
  const save = join(saveFolder, playset.save.file);
  if (!(await exists(save))) {
    const source = join(sources.saves, playset.save.file);
    if ((await hashFile(source)) !== playset.save.sha256) {
      throw new Error(`${source} is not the save the manifest pins.`);
    }
    await mkdir(saveFolder, { recursive: true });
    await copyFile(source, save);
  }
  const saveSha256 = await hashFile(save);
  if (saveSha256 !== playset.save.sha256) {
    throw new Error(
      `The profile's copy of ${playset.save.file} is not the save the manifest pins.`,
    );
  }
  return { saveSha256, mods };
}

/** A folder's files as `relative path → size|modified`, leaving out the given folder names. */
export async function snapshotFolder(
  folder: string,
  skip: readonly string[] = ['cache', 'shadercache', 'gfx', 'pops_filestorage'],
): Promise<Map<string, string>> {
  const rows = new Map<string, string>();
  const walk = async (dir: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!skip.includes(entry.name.toLowerCase())) await walk(join(dir, entry.name), path);
      } else if (entry.isFile()) {
        const s = await stat(join(dir, entry.name));
        rows.set(path, `${String(s.size)}|${String(s.mtimeMs)}`);
      }
    }
  };
  await walk(folder, '');
  return rows;
}

/** The paths added, removed or changed between two snapshots. */
export function snapshotChanges(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): string[] {
  const changes: string[] = [];
  for (const [path, value] of before) {
    const now = after.get(path);
    if (now === undefined) changes.push(`removed ${path}`);
    else if (now !== value) changes.push(`changed ${path}`);
  }
  for (const path of after.keys()) if (!before.has(path)) changes.push(`added ${path}`);
  return changes.sort();
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
