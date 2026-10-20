import { parseScript } from '../script/index.ts';

/**
 * The fields of a `.mod` descriptor that Etch uses. The launcher writes descriptors in UTF-8;
 * `path` is absolute or relative to the profile folder.
 */
export interface ModDescriptor {
  name?: string;
  path?: string;
  archive?: string;
  version?: string;
  supportedVersion?: string;
  remoteFileId?: string;
  /** Names of the mods this one is loaded after, in the order listed. */
  dependencies: string[];
  /** Folders, relative to the game folder, whose files from the game and earlier mods are hidden. */
  replacePaths: string[];
}

/**
 * Reads a `.mod` descriptor with the script parser. Unknown keys are ignored, and a malformed
 * descriptor yields what could be read.
 */
export function parseModDescriptor(text: string): ModDescriptor {
  const descriptor: ModDescriptor = { dependencies: [], replacePaths: [] };
  for (const entry of parseScript(text.replace(/^\uFEFF/, '')).entries) {
    if (entry.kind !== 'property' || entry.value === undefined) continue;
    const value = entry.value;
    if (value.kind === 'block') {
      if (entry.key.text !== 'dependencies') continue;
      for (const item of value.entries) {
        if (item.kind === 'scalar') descriptor.dependencies.push(item.text);
      }
      continue;
    }
    const text = value.text;
    switch (entry.key.text) {
      case 'name':
        descriptor.name = text;
        break;
      case 'path':
        descriptor.path = text;
        break;
      case 'archive':
        descriptor.archive = text;
        break;
      case 'version':
        descriptor.version = text;
        break;
      case 'supported_version':
        descriptor.supportedVersion = text;
        break;
      case 'remote_file_id':
        descriptor.remoteFileId = text;
        break;
      case 'replace_path':
        descriptor.replacePaths.push(text);
        break;
    }
  }
  return descriptor;
}

/** Decodes a descriptor's bytes: UTF-8 with or without BOM, else Windows-1252 as a fallback. */
export function decodeDescriptor(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
