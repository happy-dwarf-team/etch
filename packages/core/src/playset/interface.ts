import { readFile } from 'node:fs/promises';
import { decodeGameText } from '../game-text.ts';
import {
  InterfaceIndex,
  allWidgets,
  guiDiagnostics,
  gfxDiagnostics,
  normaliseGamePath,
  readGfxFile,
  readGuiFile,
  textureCandidates,
  type GfxFile,
  type GuiFile,
  type InterfaceFile,
  type ModelDiagnostic,
} from '../model/index.ts';
import { fontFilePaths } from '../text/bmfont.ts';
import { parseScript } from '../script/index.ts';
import type { GameFile, GameFiles } from './game-files.ts';

/** The folder the game reads `.gui` and `.gfx` files from, subfolders included. */
const INTERFACE_FOLDER = 'interface';

/**
 * The playset's interface: every `.gfx` and `.gui` file of `interface/` and its subfolders, read
 * from the winning layer and modelled, the {@link InterfaceIndex} over them, and the texture and
 * font files they name, looked up once so that checks run without touching the disk.
 *
 * An edited file is given to {@link update} with its game text (the unsaved buffer, etch#15).
 * Files that appear on disk after loading are not seen until the playset is loaded again.
 */
export class PlaysetInterface {
  private readonly files: GameFiles;
  private current: InterfaceIndex;
  /** Looked-up paths by {@link cacheKey}; `null` when no layer has the file. */
  private readonly found = new Map<string, GameFile | null>();
  /** The latest {@link update} of each path, so that a slower earlier one never wins. */
  private readonly updates = new Map<string, number>();
  private updateCount = 0;

  private constructor(files: GameFiles, index: InterfaceIndex) {
    this.files = files;
    this.current = index;
  }

  /** Reads and models the playset's interface files and looks up the files they name. */
  static async load(files: GameFiles): Promise<PlaysetInterface> {
    const paths = await interfaceFiles(files);
    const gfx: InterfaceFile<GfxFile>[] = [];
    const gui: InterfaceFile<GuiFile>[] = [];
    await Promise.all(
      paths.map(async (file) => {
        const text = decodeGameText(await readFile(file.absolutePath), 'interface').text;
        if (/\.gfx$/i.test(file.path)) {
          gfx.push({ path: file.path, file: readGfxFile(parseScript(text)) });
        } else {
          gui.push({ path: file.path, file: readGuiFile(parseScript(text)) });
        }
      }),
    );
    const loaded = new PlaysetInterface(files, InterfaceIndex.of(gfx, gui));
    await loaded.lookUp([
      ...gfx.flatMap((f) => [...gfxPaths(f.file)]),
      ...gui.flatMap((f) => [...guiPaths(f.file)]),
    ]);
    return loaded;
  }

  get index(): InterfaceIndex {
    return this.current;
  }

  /** Whether a game-relative file was found; only paths the loaded files name are known. */
  readonly exists = (path: string): boolean => this.gameFile(path) !== undefined;

  /** The winning file at a game-relative path that a loaded file names, such as a texture. */
  gameFile(path: string): GameFile | undefined {
    return this.found.get(cacheKey(path)) ?? undefined;
  }

  /**
   * Replaces the model of one `.gui` or `.gfx` file with its game text, or with `undefined`
   * removes it, and looks up the new files it names. `path` is game-relative.
   */
  async update(path: string, text: string | undefined): Promise<void> {
    const key = cacheKey(path);
    const token = ++this.updateCount;
    this.updates.set(key, token);
    if (/\.gfx$/i.test(path)) {
      const file = text === undefined ? undefined : readGfxFile(parseScript(text));
      if (file !== undefined) await this.lookUp(gfxPaths(file));
      if (this.updates.get(key) === token) this.current = this.current.withGfx(path, file);
    } else if (/\.gui$/i.test(path)) {
      const file = text === undefined ? undefined : readGuiFile(parseScript(text));
      if (file !== undefined) await this.lookUp(guiPaths(file));
      if (this.updates.get(key) === token) this.current = this.current.withGui(path, file);
    }
  }

  /** The diagnostics of one loaded `.gui` or `.gfx` file; empty when it is not loaded. */
  diagnostics(path: string): ModelDiagnostic[] {
    const key = cacheKey(path);
    const gui = this.current.guiFiles.find((f) => cacheKey(f.path) === key);
    if (gui !== undefined) return guiDiagnostics(gui.file, this.current, this.exists);
    const gfx = this.current.gfxFiles.find((f) => cacheKey(f.path) === key);
    if (gfx !== undefined) return gfxDiagnostics(gfx.path, gfx.file, this.current, this.exists);
    return [];
  }

  private async lookUp(paths: Iterable<string>): Promise<void> {
    const missing = new Set<string>();
    for (const path of paths) {
      const normal = normaliseGamePath(path);
      if (normal !== '' && !this.found.has(cacheKey(normal))) missing.add(normal);
    }
    await Promise.all(
      [...missing].map(async (path) => {
        this.found.set(cacheKey(path), (await this.files.find(path)) ?? null);
      }),
    );
  }
}

function cacheKey(path: string): string {
  return normaliseGamePath(path).toLowerCase();
}

/** The `.gfx` and `.gui` files of the interface folder and its subfolders. */
async function interfaceFiles(files: GameFiles): Promise<GameFile[]> {
  const out: GameFile[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const file of await files.list(dir)) {
      if (/\.(?:gfx|gui)$/i.test(file.path)) out.push(file);
    }
    for (const sub of await files.folders(dir)) await walk(sub);
  };
  await walk(INTERFACE_FOLDER);
  return out;
}

function* gfxPaths(file: GfxFile): Generator<string> {
  for (const sprite of file.sprites) {
    for (const texture of sprite.textures) yield* textureCandidates(texture.path);
  }
  for (const font of file.fonts) {
    if (font.path === undefined) continue;
    const { fnt, textures } = fontFilePaths(normaliseGamePath(font.path));
    yield fnt;
    yield* textures;
  }
}

function* guiPaths(file: GuiFile): Generator<string> {
  for (const { widget } of allWidgets(file)) {
    const props = [...widget.properties, ...widget.resolutionBlocks.flatMap((b) => b.entries)];
    for (const p of props) {
      if (
        p.key.text.toLowerCase() === 'texturefile' &&
        p.value?.kind === 'scalar' &&
        p.value.text !== ''
      ) {
        yield* textureCandidates(p.value.text);
      }
    }
  }
}
