// What CWTools' EU4 rules cover in interface files, read from the rules it loads (ADR 0008,
// "Beside CWTools"). Etch steps back from a feature only where CWTools answers the same, so
// this reads which sprite kinds the rules type as `sprite`, whether they type fonts, whether
// they have rules for `.gui` files, and which `.gui` keys they type as a sprite or font. No vscode.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** What a folder of CWTools' EU4 rules covers in interface files. */
export interface CwtoolsCoverage {
  /** The `.gfx` keys whose blocks the rules type as `sprite`, such as `spriteType`. */
  readonly spriteKinds: ReadonlySet<string>;
  /** The rules type `bitmapfont` blocks as `font`. */
  readonly fonts: boolean;
  /** The rules check the widgets of `.gui` files. */
  readonly gui: boolean;
  /** The `.gui` keys, lowercase, whose value the rules type as `<sprite>` (`spritetype`). */
  readonly guiSpriteKeys: ReadonlySet<string>;
  /** The `.gui` keys, lowercase, whose value the rules type as `<font>`. */
  readonly guiFontKeys: ReadonlySet<string>;
  /** The script folders of `SPRITE_SCRIPT_KEYS` whose every sprite key the rules type as `<sprite>`. */
  readonly scriptFolders: ReadonlySet<string>;
}

/** Coverage of a CWTools that has no EU4 rules. */
export const NO_COVERAGE: CwtoolsCoverage = {
  spriteKinds: new Set(),
  fonts: false,
  gui: false,
  guiSpriteKeys: new Set(),
  guiFontKeys: new Set(),
  scriptFolders: new Set(),
};

/**
 * Where cwtools-eu4-config types the sprite keys of Etch's script folders: the rules file and a
 * line for each key of the folder. Master at a85622d types the first eleven folders;
 * cwtools-eu4-config#446 the last two.
 */
const SCRIPT_SPRITE_RULES: readonly (readonly [string, string, readonly RegExp[]])[] = [
  ['events', 'events/events.cwt', [/^\s*picture = <sprite>/m]],
  ['missions', 'missions/missions.cwt', [/^\s*icon = <sprite>/m]],
  ['common/church_aspects', 'common/religions_and_related.cwt', [/^\s*sprite = <sprite>/m]],
  ['common/federation_advancements', 'common/federation_advancements.cwt', [/^\s*gfx = <sprite>/m]],
  ['common/holy_orders', 'common/holy_order.cwt', [/^\s*icon = <sprite>/m]],
  [
    'common/professionalism',
    'common/00_small_types_consolidated.cwt',
    [/^\s*marker_sprite = <sprite>/m],
  ],
  ['common/religions', 'common/religions_and_related.cwt', [/^\s*picture = <sprite>/m]],
  [
    'common/religious_conversions',
    'common/religions_and_related.cwt',
    [/^\s*map_icon = <sprite>/m],
  ],
  [
    'common/subject_types',
    'common/subject_types.cwt',
    [
      /^\s*sprite = <sprite>/m,
      /^\s*diplomacy_overlord_sprite = <sprite>/m,
      /^\s*diplomacy_subject_sprite = <sprite>/m,
    ],
  ],
  ['common/tradecompany_investments', 'common/trade_consolidated.cwt', [/^\s*sprite = <sprite>/m]],
  ['common/trading_policies', 'common/trade_consolidated.cwt', [/^\s*button_gfx = <sprite>/m]],
  ['common/estate_privileges', 'common/estates.cwt', [/^\s*icon = <sprite>/m]],
  [
    'common/government_mechanics',
    'common/governments_and_reforms.cwt',
    [/^\s*alert_icon_gfx = <sprite>/m, /^\s*icon = <sprite>/m],
  ],
];

/**
 * The keys of a rules file's `type[sprite]` subtypes and filters. The rules write each kind as a
 * `## type_key_filter = <key>` line, on the type (one kind, as on master before #447) or on a
 * subtype (one per kind).
 */
export function spriteKindsOf(sprites: string): Set<string> {
  const kinds = new Set<string>();
  if (!/\btype\[sprite\]/.test(sprites)) return kinds;
  for (const match of sprites.matchAll(/^\s*##\s*type_key_filter\s*=\s*([A-Za-z_]\w*)\s*$/gm)) {
    const kind = match[1];
    if (kind !== undefined) kinds.add(kind);
  }
  return kinds;
}

/** Whether a rules file types `bitmapfont` blocks, under `bitmapfonts`, as `font`. */
export function typesFonts(text: string): boolean {
  return /##\s*type_key_filter\s*=\s*bitmapfont\s*$\s*type\[font\]/m.test(text);
}

/**
 * The keys, lowercase, that a `.gui` rules file types with `<type>` (`spriteType = <sprite>`):
 * where CWTools reports a name of that type that the mod and the game do not define.
 */
export function guiKeysTyped(gui: string, type: 'sprite' | 'font'): Set<string> {
  const keys = new Set<string>();
  for (const match of gui.matchAll(new RegExp(`^\\s*([A-Za-z_]\\w*)\\s*=\\s*<${type}>`, 'gm'))) {
    const key = match[1];
    if (key !== undefined) keys.add(key.toLowerCase());
  }
  return keys;
}

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

/** Reads the coverage of the EU4 rules in `folder` (a clone of cwtools-eu4-config). */
export async function readCoverage(folder: string): Promise<CwtoolsCoverage> {
  const [sprites, objects, gui] = await Promise.all([
    readOrEmpty(join(folder, 'interface', 'sprites.cwt')),
    readOrEmpty(join(folder, 'interface', 'gfx_objects.cwt')),
    readOrEmpty(join(folder, 'interface', 'gui_types.cwt')),
  ]);
  const files = new Map<string, Promise<string>>();
  const read = (file: string): Promise<string> => {
    let text = files.get(file);
    if (text === undefined) {
      text = readOrEmpty(join(folder, ...file.split('/')));
      files.set(file, text);
    }
    return text;
  };
  const scriptFolders = new Set<string>();
  for (const [scriptFolder, file, lines] of SCRIPT_SPRITE_RULES) {
    const text = await read(file);
    if (lines.every((line) => line.test(text))) scriptFolders.add(scriptFolder);
  }
  const checksGui = /\btype\[\w+\]/.test(gui);
  return {
    spriteKinds: spriteKindsOf(sprites),
    fonts: typesFonts(objects),
    gui: checksGui,
    guiSpriteKeys: checksGui ? guiKeysTyped(gui, 'sprite') : new Set(),
    guiFontKeys: checksGui ? guiKeysTyped(gui, 'font') : new Set(),
    scriptFolders,
  };
}

/** CWTools' own settings that choose its rules (`cwtools.rules_version`, `cwtools.rules_folder`). */
export interface CwtoolsRulesSettings {
  readonly rulesVersion: string | undefined;
  readonly rulesFolder: string | undefined;
}

/**
 * The folder of EU4 rules that CWTools 0.10.31 loads: `cwtools.rules_folder` when
 * `cwtools.rules_version` is `manual` (CWTools ignores the folder otherwise), else its own clone
 * in `<extension>/.cwtools/eu4`. Undefined when `manual` names no folder.
 */
export function rulesFolder(
  extensionPath: string,
  settings: CwtoolsRulesSettings,
): string | undefined {
  if (settings.rulesVersion === 'manual') {
    const folder = settings.rulesFolder?.trim();
    return folder ? folder : undefined;
  }
  return join(extensionPath, '.cwtools', 'eu4');
}

/**
 * Whether `folder` holds rules: a `.cwt` file in it or in a folder right under it, as a clone of
 * cwtools-eu4-config has (`common/`, `interface/`…). `.git` is not read. False for a missing folder.
 */
export async function hasRules(folder: string): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return false;
  }
  if (entries.some((entry) => entry.isFile() && entry.name.endsWith('.cwt'))) return true;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    try {
      const inner = await readdir(join(folder, entry.name));
      if (inner.some((name) => name.endsWith('.cwt'))) return true;
    } catch {
      // A folder that cannot be read holds no rules CWTools loads.
    }
  }
  return false;
}

/** The most entries `folderStamp` reads; a clone of the rules in progress has far fewer. */
const STAMP_ENTRIES = 5000;

/**
 * What changes in `folder` while something writes into it: the number of entries under it
 * (`.git` included), their total size and the latest change time. Empty for a missing folder.
 */
export async function folderStamp(folder: string): Promise<string> {
  let count = 0;
  let bytes = 0;
  let latest = 0;
  const walk = async (path: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (count >= STAMP_ENTRIES) return;
      count += 1;
      const child = join(path, entry.name);
      try {
        const info = await stat(child);
        bytes += info.isFile() ? info.size : 0;
        latest = Math.max(latest, info.mtimeMs);
      } catch {
        // An entry removed while it is read: the next stamp differs anyway.
      }
      if (entry.isDirectory()) await walk(child);
    }
  };
  try {
    latest = (await stat(folder)).mtimeMs;
  } catch {
    return '';
  }
  await walk(folder);
  return `${String(count)}:${String(bytes)}:${String(latest)}`;
}

/** One look at CWTools' rules folder; undefined when CWTools does not run or names no folder. */
export interface RulesLook {
  rules: boolean;
  stamp: string;
}

/** How long `waitForRules` gives CWTools' first clone of its rules. */
export interface RulesWait {
  /** Before the first look: CWTools starts the clone after it starts. */
  firstMs: number;
  /** Between later looks. */
  againMs: number;
  /** After this, a folder that still changes is left undecided. */
  giveUpMs: number;
}

export const RULES_WAIT: RulesWait = { firstMs: 60_000, againMs: 30_000, giveUpMs: 600_000 };

/**
 * Whether CWTools' rules folder stays without rules: `empty` once two looks in a row find no
 * rules and the same folder, so a clone still writing (slower than the first wait) is not taken
 * for a failed one. `rules` when they are there, `unknown` when CWTools stops running, `sleep`
 * says the wait was cancelled (it resolves false), or the folder still changes after `giveUpMs`.
 */
export async function waitForRules(
  look: () => Promise<RulesLook | undefined>,
  sleep: (ms: number) => Promise<boolean>,
  wait: RulesWait = RULES_WAIT,
): Promise<'rules' | 'empty' | 'unknown'> {
  let waited = wait.firstMs;
  if (!(await sleep(wait.firstMs))) return 'unknown';
  let previous: string | undefined;
  for (;;) {
    const seen = await look();
    if (seen === undefined) return 'unknown';
    if (seen.rules) return 'rules';
    if (seen.stamp === previous) return 'empty';
    previous = seen.stamp;
    if (waited >= wait.giveUpMs) return 'unknown';
    waited += wait.againMs;
    if (!(await sleep(wait.againMs))) return 'unknown';
  }
}
