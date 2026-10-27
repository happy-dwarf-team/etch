/**
 * A corpus playset on this machine (ADR 0002): the installed game and the playset's mods, checked
 * against the manifest's pins before anything is rendered, because a render from another game
 * build or mod version says nothing about the captures. Everything is read in place, never
 * changed.
 */
import { join } from 'node:path';
import type { Screen } from '@etch/core';
import {
  hashModFolder,
  spriteShaderOf,
  type CorpusManifest,
  type CorpusPlayset,
  type PlanWindow,
} from '@etch/core/corpus';
import {
  PlaysetAssets,
  PlaysetInterface,
  findGameInSteam,
  findPlayset,
  layOutPreview,
  loadPlaysetLocalisation,
  systemEnvironment,
  workshopFolderFor,
  type DiscoveryEnvironment,
} from '@etch/core/playset';
import type { Localisation, Widget } from '@etch/core';
import {
  checkProfile,
  layerProfiles,
  profileModMatches,
  readProfile,
  type PlaysetModKey,
  type ProfileFile,
  type WindowProfile,
} from '@etch/core/profile';
import { readFile, readdir, stat } from 'node:fs/promises';

/** The language captures are taken in; the manifest has no other. */
const LANGUAGE = 'english';

export interface OpenPlaysetOptions {
  /** The game folder; found through Steam when not given. */
  readonly gamePath?: string | undefined;
  readonly environment?: DiscoveryEnvironment | undefined;
}

export class CorpusPlaysetFiles {
  readonly id: string;
  private readonly ui: PlaysetInterface;
  private readonly assets: PlaysetAssets;
  private readonly localisation: Localisation | undefined;
  private readonly mods: readonly PlaysetModKey[];
  private shipped: Promise<ProfileFile[]> | undefined;

  private constructor(
    id: string,
    ui: PlaysetInterface,
    localisation: Localisation | undefined,
    mods: readonly PlaysetModKey[],
  ) {
    this.id = id;
    this.ui = ui;
    this.assets = new PlaysetAssets(ui);
    this.localisation = localisation;
    this.mods = mods;
  }

  /**
   * Finds the game and the playset's mods (by Workshop item, else by name), checks `eu4.exe` and
   * every pinned mod against the manifest, and reads the interface files and localisation.
   */
  static async open(
    manifest: CorpusManifest,
    playset: CorpusPlayset,
    options: OpenPlaysetOptions = {},
  ): Promise<CorpusPlaysetFiles> {
    const environment = options.environment ?? systemEnvironment();
    const gameFolder = options.gamePath ?? (await findGameInSteam(environment));
    if (gameFolder === undefined) {
      throw new Error('EU4 was not found in Steam; set ETCH_GAME_PATH to the game folder.');
    }
    const workshop = workshopFolderFor(gameFolder);
    const mods = await Promise.all(
      playset.mods.map(async (mod) => {
        if (mod.workshopId !== undefined) {
          const folder = join(workshop, mod.workshopId);
          if (await isDirectory(folder)) return folder;
        }
        return mod.name;
      }),
    );
    const found = await findPlayset({
      gamePath: gameFolder,
      workspaceFolder: gameFolder,
      playsetOverride: mods,
      environment,
      supportedExeSha256: [manifest.game.exeSha256],
    });
    const errors = found.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) throw new Error(errors.map((d) => d.message).join(' '));
    if (found.gameBuild?.exeSha256 !== manifest.game.exeSha256) {
      throw new Error(
        `The game's eu4.exe is not the build the manifest pins (${manifest.game.version}).`,
      );
    }
    if (found.mods.length !== playset.mods.length) {
      throw new Error(
        `Found ${String(found.mods.length)} of the ${String(playset.mods.length)} mods of the ` +
          `playset "${playset.id}": ${found.diagnostics.map((d) => d.message).join(' ')}`,
      );
    }
    for (const [i, mod] of playset.mods.entries()) {
      const local = found.mods[i];
      if (mod.sha256 === undefined || local === undefined) continue;
      if ((await hashModFolder(local.root)) !== mod.sha256) {
        throw new Error(
          `The mod "${mod.name}" is not the version the playset "${playset.id}" pins.`,
        );
      }
    }
    const [ui, localisation] = await Promise.all([
      PlaysetInterface.load(found.files),
      loadPlaysetLocalisation(found.files, LANGUAGE).catch(() => undefined),
    ]);
    return new CorpusPlaysetFiles(
      playset.id,
      ui,
      localisation,
      playset.mods.map((m) => ({
        name: m.name,
        ...(m.workshopId === undefined ? {} : { workshopId: m.workshopId }),
      })),
    );
  }

  /**
   * A top-level window laid out at a resolution, or `undefined` when the playset defines none by
   * that name. A definition in one of `files` (the corpus window's) is preferred.
   */
  async window(
    name: string,
    screen: Screen,
    files: readonly string[] = [],
  ): Promise<PlanWindow | undefined> {
    const definitions = this.ui.index.guiTypeDefinitions(name);
    const preferred = new Set(files.map((f) => f.toLowerCase()));
    const definition =
      definitions.find((d) => preferred.has(d.path.toLowerCase())) ?? definitions[0];
    if (definition === undefined) return undefined;
    const file = this.ui.index.guiFiles.find((f) => f.path === definition.path)?.file;
    if (file === undefined) return undefined;
    const layout = await layOutPreview(this.ui, this.assets, file, definition.item, {
      screen,
      localise: (text) => this.localisation?.text(text) ?? text,
    });
    const context = { constants: file.constants, index: this.ui.index, screen };
    return { layout, shaderOf: (widget) => spriteShaderOf(widget, context) };
  }

  /**
   * Etch's own profile of a top-level window in this playset (ADR 0006): the vanilla layer, then
   * each mod's by Workshop id or name, from the repository's `profiles/` folder, checked against
   * the window as the extension checks it; `undefined` when no layer describes the window. The
   * check's problems come back too: a profile the corpus gates must load cleanly.
   */
  async profile(
    profilesFolder: string,
    name: string,
    files: readonly string[] = [],
  ): Promise<{ profile: WindowProfile; window: Widget; problems: string[] } | undefined> {
    const definitions = this.ui.index.guiTypeDefinitions(name);
    const preferred = new Set(files.map((f) => f.toLowerCase()));
    const definition =
      definitions.find((d) => preferred.has(d.path.toLowerCase())) ?? definitions[0];
    const file = this.ui.index.guiFiles.find((f) => f.path === definition?.path)?.file;
    if (definition === undefined || file === undefined) return undefined;
    this.shipped ??= readShipped(profilesFolder);
    const key = name.toLowerCase();
    const shipped = (await this.shipped).filter((f) => f.window.toLowerCase() === key);
    const layers = [
      ...shipped.filter((f) => f.mod === undefined),
      ...this.mods.flatMap((mod) =>
        shipped.filter((f) => f.mod !== undefined && profileModMatches(f.mod, mod)),
      ),
    ];
    if (layers.length === 0) return undefined;
    const checked = checkProfile(
      layerProfiles(
        name,
        layers.map((f, layer) => ({ ...f, origin: { ...f.origin, layer } })),
      ),
      {
        window: definition.item,
        positionType: (type) =>
          file.definitions.some(
            (d) => d.kind === 'positionType' && d.name?.toLowerCase() === type.toLowerCase(),
          ),
        template: (template) => this.ui.index.guiType(template)?.item,
        windowExists: (other) => this.ui.index.guiType(other) !== undefined,
      },
    );
    return {
      profile: checked.profile,
      window: definition.item,
      problems: checked.diagnostics.map((d) => `${d.file}: ${d.message}`),
    };
  }

  /** The playset's English localisation of a key; `undefined` when it has none. */
  readonly localise = (key: string): string | undefined => this.localisation?.get(key);

  /** The file on disk of a game-relative path a loaded file names, such as a texture. */
  readonly fileOf = (path: string): string | undefined => this.ui.gameFile(path)?.absolutePath;
}

/**
 * The profiles of `profiles/<source>/*.jsonc`, as read; a file that cannot be read is left out,
 * and a missing folder has none.
 */
async function readShipped(folder: string): Promise<ProfileFile[]> {
  const files: ProfileFile[] = [];
  let sources;
  try {
    sources = await readdir(folder, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const source of sources) {
    if (!source.isDirectory()) continue;
    for (const name of await readdir(join(folder, source.name))) {
      if (!name.endsWith('.jsonc')) continue;
      const text = await readFile(join(folder, source.name, name), 'utf8');
      const read = readProfile(text, {
        layer: 0,
        source: source.name,
        file: `${source.name}/${name}`,
      });
      if (read.file !== undefined) files.push(read.file);
    }
  }
  return files;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
