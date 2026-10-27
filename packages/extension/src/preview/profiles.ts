// The window profiles of the previewed window (spec section 4, ADR 0006): Etch's own, shipped in
// the VSIX under `dist/profiles/<source>/` (vanilla, then the playset's mods by Workshop id or
// name), then the mod project's `.etch/profiles/<window>.jsonc`, read from its editor buffer
// while it is open. Each layer is checked on load against the playset's window; the mod project's
// problems go to Problems with their lines, Etch's own to the log and one notice.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { SUPPORTED_GAME_VERSION, type GuiFile, type InterfaceIndex, type Widget } from '@etch/core';
import {
  checkProfile,
  layerProfiles,
  otherVersionNotice,
  profileModMatches,
  readProfile,
  type ProfileDiagnostic,
  type ProfileFile,
  type WindowProfile,
} from '@etch/core/profile';
import type { Playset } from '@etch/core/playset';

/** Where a mod project keeps its window profiles, beside its `descriptor.mod`. */
export const PROJECT_PROFILES = ['.etch', 'profiles'] as const;

/** The previewed window's profile, as its layers made it. */
export interface LoadedProfile {
  /** The checked profile: what failed its check is left out. */
  readonly profile: WindowProfile;
  /** The mod project's file of this window, which may not exist yet; none without a mod project. */
  readonly projectFile: vscode.Uri | undefined;
  /** The file of the top layer, for **Open profile**. */
  readonly topFile: vscode.Uri | undefined;
  /** Tells profiles apart for the preview's render key: the texts of every layer. */
  readonly key: string;
}

/** What loading found wrong in the mod project's file. */
export interface ProjectProblems {
  readonly uri: vscode.Uri;
  readonly text: string;
  readonly diagnostics: ProfileDiagnostic[];
}

interface Shipped {
  readonly source: string;
  readonly file: ProfileFile;
  readonly text: string;
  /** What reading the file found wrong, such as a skipped entry. */
  readonly diagnostics: readonly ProfileDiagnostic[];
}

export class ProfileStore {
  private readonly folder: string;
  private readonly output: vscode.LogOutputChannel;
  private shipped: Promise<Shipped[]> | undefined;
  /** Problems of Etch's own profiles already logged, so each is logged once. */
  private readonly logged = new Set<string>();
  /** Whether the one notice for problems of Etch's own profiles was given. */
  private noticed = false;

  constructor(extensionUri: vscode.Uri, output: vscode.LogOutputChannel) {
    this.folder = vscode.Uri.joinPath(extensionUri, 'dist', 'profiles').fsPath;
    this.output = output;
  }

  /**
   * The profile of a window of the playset, with the problems of the mod project's file and the
   * notices for Etch's own; `undefined` when no layer describes the window.
   */
  async load(
    playset: Playset,
    index: InterfaceIndex,
    file: GuiFile,
    window: Widget,
  ): Promise<{
    loaded: LoadedProfile | undefined;
    project: ProjectProblems | undefined;
    notices: string[];
  }> {
    const name = window.name;
    const notices: string[] = [];
    if (name === undefined) return { loaded: undefined, project: undefined, notices };
    const key = name.toLowerCase();
    const shipped = (await this.loadShipped()).filter((s) => s.file.window.toLowerCase() === key);

    const layers: {
      file: ProfileFile;
      text: string;
      version: string | undefined;
      diagnostics: readonly ProfileDiagnostic[];
    }[] = [];
    const vanilla = shipped.find((s) => s.file.mod === undefined);
    if (vanilla !== undefined) {
      layers.push({ ...vanilla, version: gameVersion(playset) });
    }
    for (const mod of playset.mods) {
      const found = shipped.find(
        (s) => s.file.mod !== undefined && profileModMatches(s.file.mod, mod),
      );
      if (found !== undefined) layers.push({ ...found, version: mod.version });
    }

    const root = playset.workspaceMod?.root;
    const projectFile =
      root === undefined
        ? undefined
        : vscode.Uri.file(join(root, ...PROJECT_PROFILES, `${name}.jsonc`));
    let project: ProjectProblems | undefined;
    if (projectFile !== undefined) {
      const text = await projectText(projectFile);
      if (text !== undefined) {
        const read = readProfile(text, {
          layer: layers.length,
          source: 'mod project',
          file: projectFile.toString(),
        });
        project = { uri: projectFile, text, diagnostics: [...read.diagnostics] };
        if (read.file !== undefined && read.file.window.toLowerCase() !== key) {
          project.diagnostics.push({
            severity: 'error',
            code: 'profile-format',
            message: `This file is named for ${name} but describes "${read.file.window}".`,
            start: 0,
            end: 0,
            file: projectFile.toString(),
          });
        } else if (read.file !== undefined) {
          layers.push({ file: read.file, text, version: undefined, diagnostics: [] });
        }
      }
    }
    if (layers.length === 0) return { loaded: undefined, project, notices };

    const files = layers.map((l, layer) => ({ ...l.file, origin: { ...l.file.origin, layer } }));
    const checked = checkProfile(layerProfiles(name, files), {
      window,
      positionType: (type) =>
        file.definitions.some(
          (d) => d.kind === 'positionType' && d.name?.toLowerCase() === type.toLowerCase(),
        ),
      template: (name) => index.guiType(name)?.item,
      windowExists: (name) => index.guiType(name) !== undefined,
    });
    const own: ProfileDiagnostic[] = [];
    for (const layer of layers) {
      own.push(...layer.diagnostics);
      const notice = otherVersionNotice(layer.file, layer.version);
      if (notice !== undefined) own.push(notice);
    }
    for (const found of checked.diagnostics) {
      if (project !== undefined && found.file === project.uri.toString()) {
        project.diagnostics.push(found);
      } else {
        own.push(found);
      }
    }
    for (const found of own) notices.push(...this.report(found));

    const top = layers.at(-1);
    return {
      loaded: {
        profile: checked.profile,
        projectFile,
        topFile: top === undefined ? undefined : uriOf(top.file.origin.file),
        key: layers.map((l) => l.text).join('\u0000'),
      },
      project,
      notices,
    };
  }

  /** Logs a problem of Etch's own profiles once and returns its notice, if it is new. */
  private report(found: ProfileDiagnostic): string[] {
    const message = `${found.message} (${found.file})`;
    if (this.logged.has(message)) return [];
    this.logged.add(message);
    if (found.code === 'profile-other-version') {
      this.output.info(message);
      return [found.message];
    }
    this.output.error(`Window profile Etch ships: ${message}`);
    if (this.noticed) return [];
    this.noticed = true;
    return [
      'A window profile Etch ships has an entry that failed its check and is skipped; the Etch log says which.',
    ];
  }

  /** Etch's own profiles, read once: `<source>/<window>.jsonc` under `dist/profiles`. */
  private loadShipped(): Promise<Shipped[]> {
    this.shipped ??= (async () => {
      const found: Shipped[] = [];
      for (const source of await names(this.folder)) {
        const folder = join(this.folder, source);
        for (const name of await names(folder)) {
          if (!name.toLowerCase().endsWith('.jsonc')) continue;
          const path = join(folder, name);
          const text = await readFile(path, 'utf8').catch(() => undefined);
          if (text === undefined) continue;
          const read = readProfile(text, {
            layer: 0,
            source,
            file: vscode.Uri.file(path).toString(),
          });
          if (read.file !== undefined) {
            found.push({ source, file: read.file, text, diagnostics: read.diagnostics });
          } else {
            // A file Etch cannot use at all: logged once; no window names it.
            for (const problem of read.diagnostics) this.report(problem);
          }
        }
      }
      return found;
    })();
    return this.shipped;
  }
}

/** The game's version as profiles record it, such as `1.37.5`. */
function gameVersion(playset: Playset): string | undefined {
  const build = playset.gameBuild;
  if (build === undefined) return undefined;
  if (build.supported) return SUPPORTED_GAME_VERSION;
  return build.version?.replace(/^v/i, '').replace(/\.0$/, '');
}

/** The mod project's file: its editor buffer while open, else the file; none when missing. */
async function projectText(uri: vscode.Uri): Promise<string | undefined> {
  const key = uri.toString();
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === key);
  if (open !== undefined) return open.getText();
  return readFile(uri.fsPath, 'utf8').catch(() => undefined);
}

async function names(folder: string): Promise<string[]> {
  try {
    return (await readdir(folder)).sort();
  } catch {
    return [];
  }
}

function uriOf(file: string): vscode.Uri | undefined {
  try {
    return vscode.Uri.parse(file, true);
  } catch {
    return undefined;
  }
}
