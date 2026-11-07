import { readFile } from 'node:fs/promises';
import { decodeGameText } from '../game-text.ts';
import {
  readBasicAbilities,
  readGovernmentMechanics,
  readScriptedWidgets,
  type GovernmentMechanic,
  type ScriptedWidget,
} from '../layout/government-mechanics.ts';
import type { GameFile, GameFiles } from './game-files.ts';

const MECHANICS_FOLDER = 'common/government_mechanics';
const CUSTOM_GUI_FOLDER = 'common/custom_gui';
const REFORMS_FOLDER = 'common/government_reforms';

/** What the playset's `common` files say of the government view's mechanics. */
export interface PlaysetMechanics {
  readonly mechanics: readonly GovernmentMechanic[];
  /** The mechanics every player's country has, whatever its other reforms. */
  readonly basic: readonly GovernmentMechanic[];
  readonly scripted: readonly ScriptedWidget[];
}

/** Reads the playset's government mechanics and `scripted` widgets. */
export async function loadGovernmentMechanics(files: GameFiles): Promise<PlaysetMechanics> {
  const [mechanics, scripted, abilities] = await Promise.all([
    readAll(await files.list(MECHANICS_FOLDER, '.txt'), readGovernmentMechanics),
    readAll(await files.list(CUSTOM_GUI_FOLDER, '.txt'), readScriptedWidgets),
    readAll(await files.list(REFORMS_FOLDER, '.txt'), readBasicAbilities),
  ]);
  const given = new Set(abilities.map((name) => name.toLowerCase()));
  const basic = mechanics.filter((m) => m.everyPlayer && given.has(m.name.toLowerCase()));
  return { mechanics, basic, scripted };
}

async function readAll<T>(
  files: readonly GameFile[],
  read: (text: string) => readonly T[],
): Promise<T[]> {
  const texts = await Promise.all(
    files.map(async (file) => decodeGameText(await readFile(file.absolutePath), 'interface').text),
  );
  return texts.flatMap(read);
}
