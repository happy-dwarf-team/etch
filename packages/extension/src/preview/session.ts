// The playset one preview draws with (spec sections 2 and 8): the game, the mods, their interface
// files, the texture sizes and fonts layout has read, and the localisation in `etch.language`.
// It also holds the player's `settings.txt`, read once per session, for the default preview
// resolution (spec section 6). Loading it is the bulk of a cold open; a warm reload only updates
// the files that changed.

import { resolve } from 'node:path';
import type { GuiFile, Localisation } from '@etch/core';
import {
  PlaysetAssets,
  PlaysetInterface,
  findPlayset,
  loadPlaysetLocalisation,
  readPlayerSettings,
  type Playset,
  type PlayerSettings,
} from '@etch/core/playset';
import type { Notice } from './protocol.ts';

/** The settings a playset depends on. */
export interface SessionSettings {
  readonly gamePath: string;
  readonly playset: readonly string[];
  readonly language: string;
}

/** Where a file on disk sits in the playset. */
export interface PlaysetPlace {
  /** Game-relative path with `/`. */
  readonly path: string;
  /** Index of the layer in `playset.files.layers`: 0 for the game, then each mod. */
  readonly layer: number;
  /** Whether the game reads this file at that path, rather than a later mod's. */
  readonly wins: boolean;
}

let sessions = 0;

export class PreviewSession {
  /** Tells sessions apart: a new one is loaded when the playset or the settings change. */
  readonly serial = ++sessions;
  readonly settings: SessionSettings;
  readonly workspaceFolder: string;
  readonly playset: Playset;
  readonly ui: PlaysetInterface;
  readonly assets: PlaysetAssets;
  /** `undefined` when the localisation could not be loaded; a notice says why. */
  readonly localisation: Localisation | undefined;
  /** The player's `settings.txt` in the profile folder, `undefined` when there is none. */
  readonly player: PlayerSettings | undefined;
  readonly notices: readonly Notice[];

  private constructor(
    settings: SessionSettings,
    workspaceFolder: string,
    playset: Playset,
    ui: PlaysetInterface,
    localisation: Localisation | undefined,
    player: PlayerSettings | undefined,
    notices: readonly Notice[],
  ) {
    this.settings = settings;
    this.workspaceFolder = workspaceFolder;
    this.playset = playset;
    this.ui = ui;
    this.assets = new PlaysetAssets(ui);
    this.localisation = localisation;
    this.player = player;
    this.notices = notices;
  }

  /** Finds the playset of a file and reads its interface files and localisation. */
  static async load(
    settings: SessionSettings,
    workspaceFolder: string,
    activeFile: string,
  ): Promise<PreviewSession> {
    const playset = await findPlayset({
      gamePath: settings.gamePath,
      playsetOverride: settings.playset,
      workspaceFolder,
      activeFile,
    });
    const notices: Notice[] = playset.diagnostics.map((found) => ({
      severity: found.severity,
      message: found.path === undefined ? found.message : `${found.message} (${found.path})`,
    }));
    const [ui, localisation, player] = await Promise.all([
      PlaysetInterface.load(playset.files),
      loadPlaysetLocalisation(playset.files, settings.language).catch((error: unknown) => {
        notices.push({
          severity: 'error',
          message: `The ${settings.language} localisation could not be read: ${messageOf(error)}`,
        });
        return undefined;
      }),
      readPlayerSettings(playset.profileFolder),
    ]);
    if (player?.uiScale !== undefined && player.uiScale !== 1) {
      notices.push({
        severity: 'information',
        message:
          `The game's settings.txt sets game_ui_scale = ${String(player.uiScale)}; ` +
          'the preview draws at UI scale 1.0 only.',
      });
    }
    return new PreviewSession(
      settings,
      workspaceFolder,
      playset,
      ui,
      localisation,
      player,
      notices,
    );
  }

  /**
   * Whether this session previews a file opened with these settings: the same settings and
   * workspace folder, and the file in the edited mod (or the game folder, when the game's own
   * files are edited).
   */
  serves(settings: SessionSettings, workspaceFolder: string, file: string): boolean {
    if (JSON.stringify(settings) !== JSON.stringify(this.settings)) return false;
    if (pathKey(workspaceFolder) !== pathKey(this.workspaceFolder)) return false;
    const home = this.playset.workspaceMod?.root ?? this.playset.gameFolder;
    return home !== undefined && isInside(file, home);
  }

  /** The folders the webview may read textures from: the game folder and the mods. */
  get roots(): string[] {
    return this.playset.files.layers.map((layer) => layer.root);
  }

  /** Where a file on disk sits in the playset, or `undefined` when no layer holds it. */
  async place(file: string): Promise<PlaysetPlace | undefined> {
    const layers = this.playset.files.layers;
    for (let layer = layers.length - 1; layer >= 0; layer--) {
      const root = layers[layer]?.root;
      if (root === undefined || !isInside(file, root)) continue;
      const path = pathKey(file).slice(pathKey(root).length + 1);
      const winner = await this.playset.files.find(path);
      const wins = winner !== undefined && pathKey(winner.absolutePath) === pathKey(file);
      return { path: winner?.path ?? path, layer, wins };
    }
    return undefined;
  }

  /**
   * Gives the playset the game text of an edited file (the unsaved buffer, etch#15). Returns
   * whether it changed what the playset reads: a file hidden by a later mod changes nothing.
   */
  async update(file: string, text: string): Promise<boolean> {
    const place = await this.place(file);
    if (place?.wins !== true) return false;
    if (/\.(?:gui|gfx)$/i.test(place.path)) {
      await this.ui.update(place.path, text);
      return true;
    }
    if (/\.yml$/i.test(place.path) && this.localisation !== undefined) {
      return this.localisation.update({ path: place.path, layer: place.layer, text });
    }
    return false;
  }

  /** The model of a `.gui` file the playset reads, at a game-relative path. */
  guiFile(path: string): GuiFile | undefined {
    const key = path.toLowerCase();
    return this.ui.index.guiFiles.find((f) => f.path.toLowerCase() === key)?.file;
  }

  /** A `.gui` text as the game shows it: its localised value, or the text itself. */
  readonly localise = (text: string): string => this.localisation?.text(text) ?? text;
}

/** A comparable form of an absolute path, as on Windows. */
function pathKey(path: string): string {
  return resolve(path).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function isInside(path: string, folder: string): boolean {
  const p = pathKey(path);
  const f = pathKey(folder);
  return p === f || p.startsWith(`${f}/`);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
