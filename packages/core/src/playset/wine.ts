import { existsSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

/**
 * Paths written by a Windows game that runs under Wine or Proton, read by Etch on the host.
 *
 * The game writes its mod descriptors with Windows paths (`path="C:/users/steamuser/My
 * Documents/Paradox Interactive/Europa Universalis IV/mod/x"`); Etch, running natively, has to open
 * the files they name, which live inside the Wine prefix.
 */

/** A Windows path with a drive letter: `C:/x`, `z:\y`. */
export function isWindowsDrivePath(path: string): boolean {
  return /^[A-Za-z]:([\\/]|$)/.test(path);
}

/**
 * The Wine prefix that holds `path`: the folder above the `drive_c` that `path` goes through, such
 * as Steam's `.../steamapps/compatdata/236850/pfx`. `undefined` when `path` is not in a prefix.
 */
export function winePrefixOf(path: string): string | undefined {
  const parts = resolve(path).split(sep);
  const at = parts.findIndex((part) => part.toLowerCase() === 'drive_c');
  if (at <= 0) return undefined;
  return parts.slice(0, at).join(sep) || sep;
}

/**
 * The host path of a Windows drive path: `Z:` is the host's root, `C:` is the prefix's `drive_c`, any
 * other letter follows the prefix's `dosdevices/<letter>:` link. A path that is not a drive path, or
 * a drive the prefix does not have, is returned as it is.
 */
export function hostPathFromWindows(path: string, prefix: string | undefined): string {
  const match = /^([A-Za-z]):(.*)$/.exec(path);
  if (match?.[1] === undefined) return path;
  const drive = match[1].toLowerCase();
  const rest = (match[2] ?? '').split(/[\\/]+/).filter((part) => part !== '' && part !== '.');
  if (drive === 'z') return caseInsensitive('/', rest);
  if (prefix === undefined) return path;
  let root: string | undefined;
  if (drive === 'c') {
    root = join(prefix, 'drive_c');
  } else {
    const link = join(prefix, 'dosdevices', `${drive}:`);
    try {
      const target = readlinkSync(link);
      root = isAbsolute(target) ? target : resolve(dirname(link), target);
    } catch {
      return path;
    }
  }
  return caseInsensitive(root, rest);
}

/**
 * Joins `parts` below `root`, taking each part's case from the disk when the exact name is not there
 * (Windows paths ignore case), and `My Documents` for `Documents` when the prefix has no such link.
 */
function caseInsensitive(root: string, parts: readonly string[]): string {
  let current = root;
  for (const part of parts) {
    const exact = join(current, part);
    if (existsSync(exact)) {
      current = exact;
      continue;
    }
    let names: string[] = [];
    try {
      names = readdirSync(current);
    } catch {
      /* the rest cannot exist */
    }
    const wanted = part.toLowerCase();
    const found =
      names.find((name) => name.toLowerCase() === wanted) ??
      (wanted === 'my documents'
        ? names.find((name) => name.toLowerCase() === 'documents')
        : undefined);
    current = join(current, found ?? part);
  }
  // Wine's links (`My Documents` to `Documents`) would make the same folder two different strings.
  try {
    return realpathSync(current);
  } catch {
    return current;
  }
}
