import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PlaysetDiagnostic } from './diagnostics.ts';
import type { Mod } from './mods.ts';

/**
 * The folders the game lists recursively for the files it loads, and the extensions it loads from
 * each (`eu4.exe` 1.37.5; EU4 engine lab, research for eu4-engine-lab#56 and #59).
 */
const RECURSIVE_ROOTS: ReadonlyMap<string, readonly string[]> = new Map([
  ['interface', ['.gfx', '.gui']],
  ['localisation', ['.yml']],
  ['events', ['.txt']],
  ['gfx', ['.asset']],
  ['sound', ['.asset']],
  ['music', ['.asset']],
]);

/**
 * Warnings for a `replace_path` the game mishandles. When a mod's `replace_path` names a subfolder
 * of a folder the game lists recursively (`interface/assets`, `gfx/entities`), the game's listing
 * gives the files directly in that subfolder by their bare name, and the loader looks for them at
 * the listed folder's top: they are not loaded (`EnumerateFilesRecursive`, research for
 * eu4-engine-lab#56). Etch still shows them, so the preview and the game differ.
 *
 * Only a subfolder that this mod or a later one fills with a file the game loads from that root
 * is reported: entries such as `gfx/loadingscreens` or `gfx/flags`, which hold no `.asset`, are
 * common and harmless (eu4-engine-lab#59 found none that loses a file among 94 mods on disk and
 * 198 public descriptors). `localisation/replace` is a root of its own and is not reported.
 */
export async function replacePathWarnings(mods: readonly Mod[]): Promise<PlaysetDiagnostic[]> {
  const diagnostics: PlaysetDiagnostic[] = [];
  for (const [index, mod] of mods.entries()) {
    for (const written of mod.replacePaths) {
      const folder = written.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
      const parts = folder.split('/').filter((p) => p !== '');
      const root = parts[0]?.toLowerCase();
      const extensions = root === undefined ? undefined : RECURSIVE_ROOTS.get(root);
      if (extensions === undefined || parts.length < 2) continue;
      if (parts.length === 2 && root === 'localisation' && parts[1]?.toLowerCase() === 'replace') {
        continue;
      }
      const hidden: string[] = [];
      for (const later of mods.slice(index)) {
        for (const name of await filesIn(join(later.root, ...parts))) {
          if (extensions.some((ext) => name.toLowerCase().endsWith(ext))) {
            hidden.push(`${later.name}: ${folder}/${name}`);
          }
        }
      }
      if (hidden.length === 0) continue;
      const shown = hidden.slice(0, 3).join(', ') + (hidden.length > 3 ? ', …' : '');
      diagnostics.push({
        severity: 'warning',
        code: 'replace-path-hides-files',
        message:
          `Mod "${mod.name}" has replace_path = "${written}", a subfolder of ${parts[0] ?? ''}, ` +
          `which the game lists recursively. EU4 1.37.5 then does not load the ` +
          `${extensions.join(' and ')} files directly in it (${String(hidden.length)}: ${shown}), ` +
          `while Etch's preview shows them. Move them to ${parts[0] ?? ''} or to a subfolder of ` +
          `${folder}, or drop that replace_path.`,
        path: mod.descriptorPath ?? mod.root,
      });
    }
  }
  return diagnostics;
}

async function filesIn(folder: string): Promise<string[]> {
  try {
    const entries = await readdir(folder, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}
