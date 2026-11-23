// The command that chooses the preview resolution (spec section 6): the default (the player's
// `settings.txt`, else the monitor), the monitor's native resolution, one of the corpus
// resolutions (3840×2160 marked as not measured against the game) or a custom width × height. The
// choice is the `etch.previewResolution` setting. The list opens on the current choice, first and
// checked, and a size typed into it, such as `2560x1440`, is offered at once.

import * as vscode from 'vscode';
import {
  CORPUS_RESOLUTIONS,
  UNCHECKED_RESOLUTIONS,
  MAX_RESOLUTION_SIDE,
  MIN_RESOLUTION_SIDE,
  formatResolution,
  parseResolution,
  resolutionSetting,
  type ResolutionChoice,
} from '@etch/core';
import { pickCurrent } from '../pick-current.ts';
import { RESOLUTION_SETTING, type PreviewApi } from './preview.ts';

interface ResolutionItem extends vscode.QuickPickItem {
  /** The setting's value; `undefined` asks for a custom size. */
  readonly value?: string;
}

const CHECK = new vscode.ThemeIcon('check');
/** The other items' icon, an empty one, so their labels line up with the checked one. */
const BLANK = new vscode.ThemeIcon('blank');

/** Shows the choices and writes the one picked; resolves to the new setting, if any. */
export async function chooseResolution(preview: PreviewApi): Promise<string | undefined> {
  const { player, native } = preview.resolutionContext;
  const config = vscode.workspace.getConfiguration('etch');
  const current = parseResolution(config.get<string>(RESOLUTION_SETTING, 'default'));
  const currentValue = current === undefined ? undefined : resolutionSetting(current);
  const nativeText = native === undefined ? 'not known yet' : formatResolution(native);

  const items: ResolutionItem[] = [
    {
      label: 'Default',
      description:
        player !== undefined
          ? `${formatResolution(player)} from the game's settings.txt`
          : `the game's settings.txt, else native (${nativeText})`,
      value: 'default',
    },
    { label: 'Native', description: `the monitor's resolution, ${nativeText}`, value: 'native' },
    { label: 'Corpus resolutions', kind: vscode.QuickPickItemKind.Separator },
    ...CORPUS_RESOLUTIONS.map((screen) => ({
      label: formatResolution(screen),
      value: resolutionSetting({ kind: 'size', screen }),
      ...(isUnchecked(screen.width, screen.height)
        ? { description: 'not yet measured against the game' }
        : {}),
    })),
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    { label: 'Custom…', description: 'width × height', iconPath: new vscode.ThemeIcon('edit') },
  ].map((item) => ({ iconPath: BLANK, ...item }));
  // A size that is not one of the items above is a custom one: it gets an item of its own.
  const listed = items.find((item) => item.value !== undefined && item.value === currentValue);
  const custom = current?.kind === 'size' && listed === undefined ? current : undefined;
  const currentItem: ResolutionItem | undefined =
    listed !== undefined
      ? { ...listed, iconPath: CHECK }
      : custom === undefined
        ? undefined
        : {
            label: formatResolution(custom.screen),
            description: 'custom',
            value: resolutionSetting(custom),
            iconPath: CHECK,
          };
  const picked = await pickCurrent(
    currentItem === undefined ? items : items.filter((item) => item !== listed),
    currentItem,
    {
      title: 'Preview Resolution',
      placeholder: 'Choose, or type a size such as 2560x1440',
      current: 'Current',
      rest: 'Automatic',
      typed: (text) => typedSize(text, items, currentValue),
    },
  );
  if (picked === undefined) return undefined;

  let value = picked.value;
  if (value === undefined) {
    const typed = await vscode.window.showInputBox({
      title: 'Custom preview resolution',
      prompt: 'Width × height in pixels, such as 2560x1440',
      ...(custom === undefined ? {} : { value: resolutionSetting(custom) }),
      validateInput: (text) => (customSize(text) === undefined ? INVALID : undefined),
    });
    const choice = typed === undefined ? undefined : customSize(typed);
    if (choice === undefined) return undefined;
    value = resolutionSetting(choice);
  }
  await writeResolution(value);
  return value;
}

const INVALID =
  `Write a width and a height from ${String(MIN_RESOLUTION_SIDE)} to ` +
  `${String(MAX_RESOLUTION_SIDE)} pixels, such as 2560x1440.`;

function customSize(text: string): ResolutionChoice | undefined {
  const choice = parseResolution(text);
  return choice?.kind === 'size' ? choice : undefined;
}

function isUnchecked(width: number, height: number): boolean {
  return UNCHECKED_RESOLUTIONS.some((r) => r.width === width && r.height === height);
}

/** A size typed into the list, such as `2560x1440`, as an item to pick; undefined for other text. */
function typedSize(
  text: string,
  items: readonly ResolutionItem[],
  currentValue: string | undefined,
): ResolutionItem | undefined {
  const choice = customSize(text);
  if (choice?.kind !== 'size') return undefined;
  const value = resolutionSetting(choice);
  const known = items.find((item) => item.value === value);
  return {
    label: formatResolution(choice.screen),
    description:
      value === currentValue
        ? 'current'
        : known === undefined
          ? 'custom'
          : (known.description ?? 'corpus resolution'),
    value,
    iconPath: value === currentValue ? CHECK : BLANK,
  };
}

/**
 * Writes the setting where it is set now: the workspace's when it has one, else the user's. The
 * default removes the value, unless the user's setting would then win over it.
 */
export async function writeResolution(value: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('etch');
  const inspected = config.inspect<string>(RESOLUTION_SETTING);
  const inWorkspace = inspected?.workspaceValue !== undefined;
  const target = inWorkspace
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  const shadowed = inWorkspace && inspected.globalValue !== undefined;
  await config.update(
    RESOLUTION_SETTING,
    value === 'default' && !shadowed ? undefined : value,
    target,
  );
}
