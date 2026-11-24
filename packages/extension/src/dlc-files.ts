// The files of the DLC archives (ADR 0009) as read-only documents: the `etch-dlc` scheme names an
// entry of an archive on disk as `etch-dlc:/<archive path>!/<entry>`, so VS Code can open it, a
// webview can load it, and `vscode.workspace.fs` reads it like a file on disk.

import { ZipArchive, archivePlaceOnDisk, type GameFile } from '@etch/core/playset';
import { stat } from 'node:fs/promises';
import * as vscode from 'vscode';

export const DLC_SCHEME = 'etch-dlc';
const SEPARATOR = '!/';

/** The URI of a playset file: a file on disk, or an entry of a DLC's archive. */
export function gameFileUri(file: GameFile): vscode.Uri {
  return file.archiveEntry === undefined
    ? vscode.Uri.file(file.absolutePath)
    : archiveEntryUri(file.layer.root, file.archiveEntry);
}

/**
 * The URI of a `GameFile.absolutePath`: an entry of a DLC's archive when the path runs through
 * one, else the file on disk (also under a folder whose name ends in `.zip`).
 */
export function pathUri(absolutePath: string): vscode.Uri {
  const place = archivePlaceOnDisk(absolutePath);
  return place === undefined
    ? vscode.Uri.file(absolutePath)
    : archiveEntryUri(place.archive, place.entry);
}

/** The URI of an entry of an archive on disk. */
export function archiveEntryUri(archive: string, entry: string): vscode.Uri {
  const path = archive.replace(/\\/g, '/');
  return vscode.Uri.from({
    scheme: DLC_SCHEME,
    path: `${path.startsWith('/') ? '' : '/'}${path}${SEPARATOR}${entry}`,
  });
}

/** The URI a webview's `localResourceRoots` lists to load an archive's entries. */
export function archiveRootUri(archive: string): vscode.Uri {
  return archiveEntryUri(archive, '');
}

/** A playset file's bytes, from disk or from a DLC's archive. */
export async function readGameFile(file: GameFile): Promise<Uint8Array> {
  return vscode.workspace.fs.readFile(gameFileUri(file));
}

/** Where a URI of the scheme points: the archive on disk and the entry's name. */
export function parseArchiveUri(uri: vscode.Uri): { archive: string; entry: string } | undefined {
  if (uri.scheme !== DLC_SCHEME) return undefined;
  const at = uri.path.indexOf(SEPARATOR);
  if (at < 0) return undefined;
  let archive = uri.path.slice(0, at);
  // `/C:/…` on Windows is the drive path `C:/…`.
  if (/^\/[a-z]:/i.test(archive)) archive = archive.slice(1);
  return { archive, entry: uri.path.slice(at + SEPARATOR.length) };
}

/** Reads the archives' entries for VS Code; nothing is written. */
class DlcFileSystem implements vscode.FileSystemProvider {
  private readonly archives = new Map<string, ZipArchive>();
  private readonly changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.changes.event;

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const { entry, archive } = await this.entry(uri);
    const info = await stat(archive).catch(() => {
      throw vscode.FileSystemError.FileNotFound(uri);
    });
    if (entry === undefined) {
      if (parseArchiveUri(uri)?.entry !== '') throw vscode.FileSystemError.FileNotFound(uri);
      return { type: vscode.FileType.Directory, ctime: info.ctimeMs, mtime: info.mtimeMs, size: 0 };
    }
    return {
      type: vscode.FileType.File,
      ctime: info.ctimeMs,
      mtime: info.mtimeMs,
      size: entry.size,
      permissions: vscode.FilePermission.Readonly,
    };
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const { zip, entry } = await this.entry(uri);
    if (entry === undefined) throw vscode.FileSystemError.FileNotFound(uri);
    return zip.read(entry);
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  writeFile(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  delete(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  rename(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  private async entry(uri: vscode.Uri) {
    const place = parseArchiveUri(uri);
    if (place === undefined) throw vscode.FileSystemError.FileNotFound(uri);
    let zip = this.archives.get(place.archive.toLowerCase());
    if (zip === undefined) {
      zip = new ZipArchive(place.archive);
      this.archives.set(place.archive.toLowerCase(), zip);
    }
    const entry = place.entry === '' ? undefined : await zip.entry(place.entry);
    return { zip, entry, archive: place.archive };
  }
}

/** Registers the read-only `etch-dlc` file system. */
export function registerDlcFiles(): vscode.Disposable {
  return vscode.workspace.registerFileSystemProvider(DLC_SCHEME, new DlcFileSystem(), {
    isCaseSensitive: false,
    isReadonly: new vscode.MarkdownString(
      'A file of a DLC archive of EU4, read in place: Etch does not change the game.',
    ),
  });
}
