// The live game's reload policy (spec section 6, etch#157, corrected by the live checks in
// docs/live-game-checks.md): what a saved file of the playset makes the live game do. The
// extension decides here and the plugin runs one job on the main thread. Node only, no vscode.
import { readFile } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';
import {
  decodeGameText,
  parseScript,
  readGuiFile,
  textureReloadNames,
  type InterfaceIndex,
} from '@etch/core';
import type { GameFiles } from '@etch/core/playset';
import type { ReloadRequest } from './pipe.ts';

/**
 * The files the in-game idler listens to (research of etch#2 claim 5): a reload of any of them
 * rebuilds the whole HUD, which leaks (live checks, "HUD leaks and the leak limit").
 */
export const HUD_FILES: ReadonlySet<string> = new Set([
  'main.gui',
  'topbar.gui',
  'menubar.gui',
  'macrobuildinterface.gui',
  'macrobuildinterface_override.gui',
  'papacy.gui',
  'great_powers.gui',
  'parliament.gui',
  'mapmode_more.gui',
  'more_interface.gui',
  'unitpanel.gui',
  'outliner.gui',
  'core.gui',
]);

/**
 * Windows a file builds on demand without a listener, closed through the game before its file is
 * reloaded; the player opens them again (spec section 6).
 */
export const ON_DEMAND_WINDOWS: ReadonlyMap<string, readonly string[]> = new Map([
  ['countrydiplomacyview.gui', ['DeclareWarDialog']],
]);

/**
 * Windows a rebuild shows even when they were closed (H2): closed again when they were hidden
 * before the reload.
 */
export const SHOWN_BY_REBUILD: ReadonlyMap<string, readonly string[]> = new Map([
  ['provinceview.gui', ['provinceview']],
]);

/** HUD rebuilds after which a planned restart is asked for: the tested range (spec section 6). */
export const HUD_LIMIT = 10;
/** Panel rebuilds of the tested range, which set no limit yet (spec section 6). */
export const PANEL_TESTED = 20;

/** Folders the game reads files from; a saved file elsewhere (a README, `.etch/`) is not the game's. */
const GAME_FOLDERS = [
  'common',
  'customizable_localization',
  'decisions',
  'events',
  'gfx',
  'history',
  'hints',
  'interface',
  'localisation',
  'map',
  'missions',
  'music',
  'sound',
  'tutorial',
  'tweakergui_assets',
];

const TEXTURE = /\.(dds|tga|png)$/i;

/** What a saved file makes the live game do. */
export type ReloadPlan =
  /** One reload job. */
  | {
      readonly kind: 'reload';
      /** The game path of the saved file. */
      readonly path: string;
      readonly request: ReloadRequest;
      /** The job rebuilds the HUD (counted toward `HUD_LIMIT`), a panel, or neither. */
      readonly rebuild: 'hud' | 'panel' | undefined;
      /** Localisation: afterwards, reload the listened files whose windows are on screen. */
      readonly thenVisible: boolean;
      /** A texture: "Reload failed" from the game is not an error (no window holds it). */
      readonly texture: boolean;
    }
  /** A planned restart, with its reason. */
  | { readonly kind: 'restart'; readonly path: string; readonly reason: string }
  /**
   * Nothing: the file is not the game's (`ignored`), or another mod's copy of it wins in the
   * playset (`overridden`, `game-original-differs`), so saving it changes nothing in the game.
   */
  | {
      readonly kind: 'none';
      readonly path: string | undefined;
      readonly why: 'ignored' | 'overridden';
      readonly reason: string;
    };

export interface PlanInput {
  /** The saved file on disk. */
  readonly file: string;
  /** The playset's files: the game folder and the mods in load order. */
  readonly files: GameFiles;
  /** The playset's interface index, built on demand, for the spellings of a texture. */
  readonly index: () => Promise<InterfaceIndex>;
  /** Whether the game drew a sprite with this texture while it was missing (H9). */
  readonly drawnMissing: (path: string) => Promise<boolean>;
}

/** Decides what a saved file of the playset makes the live game do (spec section 6). */
export async function planReload(input: PlanInput): Promise<ReloadPlan> {
  const found = gamePath(input.files, input.file);
  if (found === undefined) {
    return { kind: 'none', path: undefined, why: 'ignored', reason: 'not a file of the playset' };
  }
  const { path, layer } = found;
  const top = path.split('/')[0]?.toLowerCase() ?? '';
  if (!GAME_FOLDERS.includes(top)) {
    return { kind: 'none', path, why: 'ignored', reason: 'the game does not read it' };
  }
  const winner = await input.files.find(path);
  if (winner !== undefined && winner.layer !== layer) {
    return {
      kind: 'none',
      path,
      why: 'overridden',
      reason: `${winner.layer.name} has its own ${path}, which the game reads instead`,
    };
  }
  const lower = path.toLowerCase();
  const name = basename(lower);

  if (lower.endsWith('.gfx')) {
    return restart(path, 'a .gfx file defines sprite types, which the game reads only at start');
  }
  if (/\.(fnt|font)$/.test(lower) || lower.startsWith('gfx/fonts/')) {
    return restart(path, 'the game reads fonts only at start');
  }
  if (lower.startsWith('common/custom_gui/') || lower.startsWith('common/scripted_guis/')) {
    return restart(path, 'the game reads custom GUI and scripted GUIs only at start');
  }
  if (top === 'localisation' && lower.endsWith('.yml')) {
    return {
      kind: 'reload',
      path,
      request: { lines: ['reloadloc'] },
      rebuild: undefined,
      thenVisible: true,
      texture: false,
    };
  }
  if (TEXTURE.test(lower)) {
    if (await input.drawnMissing(path)) {
      return restart(
        path,
        `the game drew ${path} while it was missing, and keeps it missing until a restart (H9)`,
      );
    }
    const names = textureReloadNames(await input.index(), path);
    return {
      kind: 'reload',
      path,
      request: { lines: names.map((n) => `reloadtexture ${n}`) },
      rebuild: undefined,
      thenVisible: false,
      texture: true,
    };
  }
  if (top === 'interface' && lower.endsWith('.gui')) {
    const twice = await nameWrittenTwice(input.file);
    if (twice !== undefined) {
      return restart(
        path,
        `${twice} is written twice at the top level, and the game keeps its first definition`,
      );
    }
    if (name === 'countryview.gui') {
      return restart(path, 'nothing in a loaded game rebuilds the country view (H6)');
    }
    // Only a .gui name directly in the console's `reload`; the game finds it under interface/.
    const file = basename(path);
    if (name === 'speed_controls.gui') {
      // Nothing rebuilds the speed controls but a HUD rebuild (H6).
      return {
        kind: 'reload',
        path,
        request: { lines: [`reload ${file}`, 'reload topbar.gui'], check: [path] },
        rebuild: 'hud',
        thenVisible: false,
        texture: false,
      };
    }
    return {
      kind: 'reload',
      path,
      request: {
        lines: [`reload ${file}`],
        check: [path],
        close: [...(ON_DEMAND_WINDOWS.get(name) ?? [])],
        keepHidden: [...(SHOWN_BY_REBUILD.get(name) ?? [])],
      },
      rebuild: HUD_FILES.has(name) ? 'hud' : 'panel',
      thenVisible: false,
      texture: false,
    };
  }
  return restart(path, `the game reads ${path} only at start`);
}

/**
 * After `reloadloc`, the reloads of the listened `.gui` files whose windows are on screen, so that
 * their static texts change too (spec section 6). Files without a listener are left out: a reload
 * would leave their windows stale.
 */
export function visibleReloads(visibleFiles: readonly string[]): ReloadRequest | undefined {
  const files = [
    ...new Set(
      visibleFiles
        .map((f) => f.replace(/\\/g, '/'))
        .filter((f) => /^interface\/[^/]+\.gui$/i.test(f))
        .filter(
          (f) => !['countryview.gui', 'speed_controls.gui'].includes(basename(f).toLowerCase()),
        ),
    ),
  ];
  if (files.length === 0) return undefined;
  return {
    lines: files.map((f) => `reload ${basename(f)}`),
    check: files,
    keepHidden: files.flatMap((f) => [...(SHOWN_BY_REBUILD.get(basename(f).toLowerCase()) ?? [])]),
  };
}

function restart(path: string, reason: string): ReloadPlan {
  return { kind: 'restart', path, reason };
}

/** The game path of a file on disk, from the last layer (in load order) whose folder holds it. */
function gamePath(
  files: GameFiles,
  file: string,
): { readonly path: string; readonly layer: GameFiles['layers'][number] } | undefined {
  const absolute = resolve(file);
  for (let i = files.layers.length - 1; i >= 0; i--) {
    const layer = files.layers[i];
    if (layer === undefined) continue;
    const rel = relative(resolve(layer.root), absolute);
    if (rel === '' || rel.startsWith('..') || rel.includes(':')) continue;
    return { path: rel.split(sep).join('/'), layer };
  }
  return undefined;
}

/** A top-level name the `.gui` file defines twice, or `undefined`. */
async function nameWrittenTwice(file: string): Promise<string | undefined> {
  const bytes = await readFile(file).catch(() => undefined);
  if (bytes === undefined) return undefined;
  const gui = readGuiFile(parseScript(decodeGameText(bytes, 'interface').text));
  const seen = new Set<string>();
  for (const definition of gui.definitions) {
    const name = definition.name?.toLowerCase();
    if (name === undefined) continue;
    if (seen.has(name)) return definition.name;
    seen.add(name);
  }
  return undefined;
}
