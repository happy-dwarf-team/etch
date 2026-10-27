// The command that chooses the preview resolution (spec section 6): the default (the player's
// `settings.txt`, else the monitor), the monitor's native resolution, one of the six corpus
// resolutions or a custom width × height. The choice is the `etch.previewResolution` setting.

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
import { RESOLUTION_SETTING, type PreviewApi } from './preview.ts';

interface ResolutionItem extends vscode.QuickPickItem {
  /** The setting's value; `undefined` asks for a custom size. */
  readonly value?: string;
}

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
    ...CORPUS_RESOLUTIONS.map((screen) => {
      const value = resolutionSetting({ kind: 'size', screen });
      const unchecked = UNCHECKED_RESOLUTIONS.some(
        (r) => r.width === screen.width && r.height === screen.height,
      );
      return {
        label: formatResolution(screen),
        value,
        ...(unchecked ? { description: 'not yet measured against the game' } : {}),
      };
    }),
  ];
  for (const item of items)
    if (item.value !== undefined && item.value === currentValue) item.detail = 'current';
  // A size that is not one of the items above is a custom one.
  const custom =
    current?.kind === 'size' && !items.some((item) => item.value === currentValue)
      ? current
      : undefined;
  items.push(
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    {
      label: 'Custom…',
      description: custom === undefined ? 'width × height' : formatResolution(custom.screen),
      ...(custom === undefined ? {} : { detail: 'current' }),
    },
  );
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Preview resolution',
    placeHolder: `Now ${formatResolution(preview.resolution.screen)}`,
  });
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
