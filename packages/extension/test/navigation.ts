// The widget outline and navigation in a real VS Code: following the cursor,
// revealing source from the preview's side, and the preview choosing the
// window. The file is UTF-8 with a non-ASCII comment first, so every model
// offset differs from the editor's.
import * as assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { allWidgets, type Widget } from '@etch/core';
import type { EtchApi } from '../src/extension.ts';
import { OUTLINE_VIEW, REVEAL_WIDGET_SOURCE, type WidgetHighlight } from '../src/navigation.ts';

const TIMEOUT_MS = 5000;

const GUI = `# Fenêtre d'essai
guiTypes = {
  windowType = {
    name = "first"
    size = { x = 100 y = 100 }
    iconType = { name = "icon" position = { x = 1 y = 2 } }
    windowType = {
      name = "inner"
      instantTextBoxType = { name = "label" text = "Größe" }
    }
  }
  windowType = {
    name = "second"
    guiButtonType = { name = "button" }
  }
}
`;

async function waitFor(what: string, done: () => boolean): Promise<void> {
  const start = Date.now();
  while (!done()) {
    if (Date.now() - start > TIMEOUT_MS) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export async function testNavigation(api: EtchApi): Promise<void> {
  const { navigation } = api;
  const root = await mkdtemp(path.join(tmpdir(), 'etch-navigation-'));
  const file = path.join(root, 'interface', 'test.gui');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, GUI, 'utf8');

  const previewedName = () => navigation.previewed?.window.name;
  const highlights: WidgetHighlight[] = [];
  const listener = navigation.onDidHighlight((highlight) => highlights.push(highlight));
  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    assert.equal(document.encoding, 'utf8');
    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand(`${OUTLINE_VIEW}.focus`);
    await waitFor('the outline to be visible', () => navigation.outline.visible);

    // The cursor is at the top, outside every window: the first one is previewed.
    await waitFor('the first window', () => previewedName() === 'first');
    assert.equal(navigation.outline.description, 'first');
    assert.equal(navigation.highlighted?.source, undefined);

    const widget = (name: string): Widget => {
      const model = navigation.previewed?.file;
      assert.ok(model);
      const found = [...allWidgets(model)].find((entry) => entry.widget.name === name);
      assert.ok(found, `widget ${name}`);
      return found.widget;
    };
    const selectedName = () => {
      const node = navigation.outline.selection[0];
      return node !== undefined && 'name' in node ? node.name : undefined;
    };
    const moveTo = (text: string): void => {
      const position = document.positionAt(document.getText().indexOf(text));
      editor.selection = new vscode.Selection(position, position);
    };

    // Source to preview: the cursor on the label highlights it in the preview and the outline.
    moveTo('"label"');
    const label = widget('label');
    await waitFor(
      'the label highlighted',
      () => navigation.highlighted?.source === label.node.start,
    );
    assert.equal(highlights.at(-1)?.uri.toString(), document.uri.toString());
    await waitFor('the label selected in the outline', () => selectedName() === 'label');

    // The cursor in another window previews that window.
    moveTo('"button"');
    await waitFor('the second window', () => previewedName() === 'second');
    const button = widget('button');
    await waitFor(
      'the button highlighted',
      () => navigation.highlighted?.source === button.node.start,
    );
    await waitFor('the button selected in the outline', () => selectedName() === 'button');

    // Preview to source: a click reveals the widget's key in the editor.
    moveTo('guiTypes');
    await waitFor(
      'the window kept outside every window',
      () => navigation.highlighted?.source === undefined && previewedName() === 'second',
    );
    assert.equal(await navigation.revealSource(button.node.start), true);
    const keyOf = (selection: vscode.Selection) =>
      vscode.window.activeTextEditor?.document.getText(selection);
    assert.equal(
      keyOf(vscode.window.activeTextEditor?.selection ?? editor.selection),
      'guiButtonType',
    );
    await waitFor(
      'the button highlighted again',
      () => navigation.highlighted?.source === button.node.start,
    );
    await waitFor('the button selected again', () => selectedName() === 'button');
    // An offset that is no widget's start reveals the innermost widget around it.
    assert.equal(await navigation.revealSource(button.node.start + 3), true);
    assert.equal(await navigation.revealSource(0), false);

    // The outline's own command, as a click on an entry runs it.
    const window = navigation.previewed?.window;
    assert.ok(window);
    await vscode.commands.executeCommand(REVEAL_WIDGET_SOURCE, window.node.start);
    assert.equal(
      keyOf(vscode.window.activeTextEditor?.selection ?? editor.selection),
      'windowType',
    );
    await waitFor(
      'the window highlighted',
      () => navigation.highlighted?.source === window.node.start,
    );

    // The preview pins the first window: the cursor no longer changes it.
    const previewed = navigation.previewed;
    assert.ok(previewed);
    const first = previewed.file.definitions[0];
    assert.ok(first);
    navigation.setPreviewed({ ...previewed, window: first });
    assert.equal(navigation.outline.description, 'first');
    moveTo('"button"');
    await waitFor(
      'no highlight outside the pinned window',
      () => navigation.highlighted?.source === undefined,
    );
    assert.equal(previewedName(), 'first');
    assert.equal(await navigation.revealSource(label.node.start), true);
    assert.equal(
      keyOf(vscode.window.activeTextEditor?.selection ?? editor.selection),
      'instantTextBoxType',
    );
    await waitFor(
      'the label highlighted in the pinned window',
      () => navigation.highlighted?.source === label.node.start,
    );
    navigation.setPreviewed(undefined);
    moveTo('"button"');
    await waitFor('following the cursor again', () => previewedName() === 'second');

    // An edit re-reads the model after the debounce.
    await editor.edit((edit) => {
      edit.insert(
        document.positionAt(document.getText().indexOf('    guiButtonType')),
        '    iconType = { name = "added" }\n',
      );
    });
    await waitFor('the edited model', () => navigation.previewed?.version === document.version);
    assert.deepEqual(
      api.navigation.previewed?.window.children.map((child) => child.name),
      ['added', 'button'],
    );
    moveTo('"added"');
    const added = widget('added');
    await waitFor(
      'the added widget highlighted',
      () => navigation.highlighted?.source === added.node.start,
    );

    // Handed back with no `.gui` editor active, the outline is empty.
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    navigation.setPreviewed(undefined);
    assert.equal(navigation.previewed, undefined);
    assert.equal(navigation.highlighted, undefined);
  } finally {
    listener.dispose();
  }
}
