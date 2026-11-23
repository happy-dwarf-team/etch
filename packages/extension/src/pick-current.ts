// Etch's pickers open on the current value: it comes first, in a section that says what it is,
// and it is the active item, so Enter keeps it and the arrow keys start from it. A picker can also
// turn what the user types into an item at once, such as the preview resolution's `2560x1440`.

import * as vscode from 'vscode';
import { currentFirst, withOffered, type Sections } from './current-first.ts';

export interface PickCurrentOptions<T extends vscode.QuickPickItem> extends Sections {
  readonly title: string;
  readonly placeholder: string;
  /** Typed text as an item to offer first, or undefined when the text is not one. */
  readonly typed?: (value: string) => T | undefined;
}

/** Shows the items with `current` first and active; resolves to the item picked, if any. */
export function pickCurrent<T extends vscode.QuickPickItem>(
  items: readonly T[],
  current: T | undefined,
  options: PickCurrentOptions<T>,
): Promise<T | undefined> {
  // A separator is never picked, so it stands in the list as a `T`.
  const separator = (label: string): T =>
    ({ label, kind: vscode.QuickPickItemKind.Separator }) as T;
  const listed = currentFirst(items, current, options, separator);
  return new Promise((resolve) => {
    const pick = vscode.window.createQuickPick<T>();
    pick.title = options.title;
    pick.placeholder = options.placeholder;
    pick.items = listed;
    if (current !== undefined) pick.activeItems = [current];
    let offered: T | undefined;
    let done = false;
    const finish = (item: T | undefined): void => {
      if (done) return;
      done = true;
      resolve(item);
      pick.hide();
    };
    const subscriptions = [
      pick.onDidChangeValue((value) => {
        if (options.typed === undefined) return;
        const typed = options.typed(value);
        if (typed?.label === offered?.label) return;
        offered = typed === undefined ? undefined : { ...typed, alwaysShow: true };
        pick.items = withOffered(listed, offered);
        if (offered !== undefined) pick.activeItems = [offered];
      }),
      pick.onDidAccept(() => {
        finish(pick.selectedItems[0] ?? pick.activeItems[0]);
      }),
      pick.onDidHide(() => {
        finish(undefined);
        for (const subscription of subscriptions) subscription.dispose();
        pick.dispose();
      }),
    ];
    pick.show();
  });
}
