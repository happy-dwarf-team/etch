import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { DiscoveryEnvironment } from '../../src/playset/index.ts';

/** A folder tree in the system's temp folder; `files` maps `/`-separated paths to contents. */
export async function makeTree(files: Record<string, string | Uint8Array>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'etch-playset-'));
  await addFiles(root, files);
  return root;
}

export async function addFiles(
  root: string,
  files: Record<string, string | Uint8Array>,
): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, ...path.split('/'));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}

export async function removeTree(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

/** Every file and folder under `root` with its size, modification time and content hash. */
export async function snapshotTree(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      const info = await stat(path);
      if (entry.isDirectory()) {
        snapshot.set(path, `dir ${String(info.mtimeMs)}`);
        await walk(path);
      } else {
        const hash = createHash('sha256')
          .update(await readFile(path))
          .digest('hex');
        snapshot.set(path, `${String(info.size)} ${String(info.mtimeMs)} ${hash}`);
      }
    }
  };
  await walk(root);
  return snapshot;
}

/** An environment with a fixed registry and no Steam outside it. */
export function fakeEnvironment(
  registry: Record<string, string>,
  env: Record<string, string> = {},
  home = 'Z:\\nowhere',
): DiscoveryEnvironment {
  return {
    readRegistryValue: (key, value) => Promise.resolve(registry[`${key}\\${value}`]),
    env,
    homedir: home,
  };
}

/** A `.mod` descriptor's text. */
export function descriptor(fields: {
  name: string;
  path?: string;
  dependencies?: string[];
  replacePaths?: string[];
  remoteFileId?: string;
  archive?: string;
}): string {
  const lines = [`name="${fields.name}"`];
  if (fields.dependencies !== undefined) {
    lines.push('dependencies={', ...fields.dependencies.map((d) => `\t"${d}"`), '}');
  }
  for (const replace of fields.replacePaths ?? []) lines.push(`replace_path="${replace}"`);
  lines.push('supported_version="v1.37.*.*"');
  if (fields.path !== undefined) lines.push(`path="${fields.path.replace(/\\/g, '/')}"`);
  if (fields.archive !== undefined) lines.push(`archive="${fields.archive}"`);
  if (fields.remoteFileId !== undefined) lines.push(`remote_file_id="${fields.remoteFileId}"`);
  return `${lines.join('\n')}\n`;
}
