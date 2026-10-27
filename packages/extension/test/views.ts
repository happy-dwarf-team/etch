// Views and window profiles end to end (spec sections 2 and 4): a fixture mod project with its own
// `.etch/profiles/<window>.jsonc`, previewed in its default view; a faulty entry in Problems with
// its line; `View ▾`'s selectors, a hand toggle from the Widget Outline, and Save as view writing
// into the mod project's file.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EtchApi } from '../src/extension.ts';
import type { PreviewApi, PreviewRender } from '../src/preview/index.ts';

const TIMEOUT_MS = 30_000;

const GUI = `guiTypes = {
	windowType = {
		name = "etch_view"
		size = { x = 300 y = 200 }
		windowType = { name = "tab_a" size = { x = 100 y = 100 } }
		windowType = { name = "tab_b" size = { x = 100 y = 100 } }
		windowType = { name = "extra" size = { x = 10 y = 10 } }
	}
}
`;

const PROFILE = `{
  // The fixture's own profile.
  "formatVersion": 1,
  "window": "etch_view",
  "selectors": {
    "tab": { "kind": "ui", "label": "Tab", "values": { "a": "A", "b": "B" } }
  },
  "groups": {
    "tab": { "selector": "tab", "members": { "a": "etch_view/tab_a", "b": "etch_view/tab_b" } }
  },
  "rules": {
    "extra": { "hide": ["etch_view/extra"] },
    "broken": { "hide": ["etch_view/nowhere"] }
  },
  "views": {
    "first": { "label": "First tab", "set": { "tab": "a" } }
  }
}
`;

async function fixture(): Promise<{ game: string; mod: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'etch-views-'));
  const files: Record<string, string> = {
    'game/eu4.exe': 'not the game',
    'game/userdir.txt': 'profile',
    'game/profile/settings.txt': 'graphics={\n\tsize={\n\t\tx=1920\n\t\ty=1080\n\t}\n}\n',
    'mod/descriptor.mod': 'name="Etch views"\nsupported_version="1.37.*"\n',
    'mod/interface/etch_view.gui': GUI,
    'mod/.etch/profiles/etch_view.jsonc': PROFILE,
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, ...name.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return { game: path.join(root, 'game'), mod: path.join(root, 'mod') };
}

/** Resolves once the preview's current render satisfies a condition. */
async function rendered(
  preview: PreviewApi,
  done: (render: PreviewRender) => boolean,
  action?: () => Thenable<unknown> | undefined,
): Promise<PreviewRender> {
  const found = new Promise<PreviewRender>((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.dispose();
      reject(new Error(`no matching render in ${String(TIMEOUT_MS)} ms`));
    }, TIMEOUT_MS);
    const listener = preview.onDidRender((render) => {
      if (!done(render)) return;
      clearTimeout(timer);
      listener.dispose();
      resolve(render);
    });
  });
  await action?.();
  const current = preview.current;
  if (current !== undefined && done(current)) return current;
  return found;
}

const laidOut = (render: PreviewRender): string[] =>
  render.layout.widgets.map((w) => w.widget.name ?? '');

export async function testViews(api: EtchApi): Promise<void> {
  const { preview, navigation } = api;
  const { game, mod } = await fixture();
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  const profileUri = vscode.Uri.file(path.join(mod, '.etch', 'profiles', 'etch_view.jsonc'));
  try {
    const guiUri = vscode.Uri.file(path.join(mod, 'interface', 'etch_view.gui'));
    await vscode.window.showTextDocument(guiUri, { viewColumn: vscode.ViewColumn.One });

    // The default view: the first tab, without what a rule hides.
    const first = await rendered(
      preview,
      (r) => r.window.name === 'etch_view' && r.view !== undefined,
      () => vscode.commands.executeCommand('etch.openPreview'),
    );
    assert.deepEqual(laidOut(first), ['etch_view', 'tab_a']);
    assert.equal(first.view?.view.selectors[0]?.source, 'you', 'the default view sets the tab');

    // The faulty rule is skipped and reported on its line.
    const problems = vscode.languages
      .getDiagnostics(profileUri)
      .filter((d) => d.code === 'profile-unknown-path');
    assert.equal(problems.length, 1, JSON.stringify(vscode.languages.getDiagnostics(profileUri)));
    assert.equal(problems[0]?.range.start.line, 12, "the broken rule's line");

    // A selector from View ▾.
    const second = await rendered(
      preview,
      (r) => laidOut(r).includes('tab_b'),
      () => preview.viewAction({ kind: 'select', selector: 'tab', value: 'b' }),
    );
    assert.deepEqual(laidOut(second), ['etch_view', 'tab_b']);

    // An eye of the Widget Outline: a hand toggle, counted.
    const extra = second.window.children.find((w) => w.name === 'extra');
    assert.ok(extra);
    assert.equal(navigation.previewed?.view?.widgets.get(extra)?.shown, false);
    const toggled = await rendered(
      preview,
      (r) => laidOut(r).includes('extra'),
      () => vscode.commands.executeCommand('etch.outline.show', extra),
    );
    assert.equal(toggled.view?.view.handToggles, 1);

    // Save as view writes the selectors and the toggle into the mod project's file.
    const saved = await rendered(
      preview,
      (r) => r.view?.profile.profile.views.some((v) => v.id === 'mine') === true,
      () => preview.viewAction({ kind: 'saveView', label: 'Mine' }),
    );
    const text = await readFile(profileUri.fsPath, 'utf8');
    assert.match(text, /\/\/ The fixture's own profile\./);
    const view = saved.view?.profile.profile.views.find((v) => v.id === 'mine');
    assert.ok(view, 'the saved view is in the profile');
    assert.deepEqual(
      view.set.map((s) => [s.selector, s.value]),
      [['tab', 'b']],
    );
    assert.deepEqual(
      view.toggles.map((t) => [t.path, t.shown]),
      [['etch_view/extra', true]],
    );

    // Back to the first view.
    const back = await rendered(
      preview,
      (r) => laidOut(r).join() === 'etch_view,tab_a',
      () => preview.viewAction({ kind: 'chooseView', id: 'first' }),
    );
    assert.equal(back.view?.view.handToggles, 0);

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await preview.idle();
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
