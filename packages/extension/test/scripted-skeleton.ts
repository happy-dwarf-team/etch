// Etch: Add Scripted Selectors to the Window Profile in a real VS Code: a mod whose window has two
// widgets that its common/custom_gui gives a potential. The command writes them into the mod
// project's profile, the preview reads them as selectors, and a second run keeps what is there.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EtchApi } from '../src/extension.ts';
import {
  ADD_SCRIPTED_SELECTORS,
  type PreviewRender,
  type ScriptedSkeletonResult,
} from '../src/preview/index.ts';

const TIMEOUT_MS = Number(process.env['ETCH_TEST_TIMEOUT_MS'] ?? 5_000) * 2;

const GUI = `guiTypes = {
	windowType = {
		name = "etch_scripted"
		position = { x = 100 y = 50 }
		size = { x = 200 y = 100 }
		windowType = {
			name = "etch_panel"
			size = { x = 100 y = 50 }
			guiButtonType = { name = "etch_button" position = { x = 10 y = 10 } }
		}
		guiButtonType = { name = "etch_plain" position = { x = 10 y = 70 } }
	}
}
`;

const CUSTOM_GUI = `custom_window = {
	name = etch_panel
	potential = { has_country_flag = etch_panel_open }
}
custom_button = {
	name = etch_button
	potential = { ai = no }
}
custom_button = {
	name = etch_plain
}
`;

async function fixture(): Promise<{ root: string; game: string; mod: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'etch-scripted-'));
  const files: Record<string, string> = {
    'game/eu4.exe': 'not the game',
    'mod/descriptor.mod': 'name="Etch scripted"\nsupported_version="1.37.*"\n',
    'mod/interface/etch_scripted.gui': GUI,
    'mod/common/custom_gui/etch_scripted.txt': CUSTOM_GUI,
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, ...name.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, 'utf8');
  }
  return { root, game: path.join(root, 'game'), mod: path.join(root, 'mod') };
}

/** Resolves once the preview's current render satisfies a condition. */
async function rendered(
  api: EtchApi,
  done: (render: PreviewRender) => boolean,
  action?: () => Thenable<unknown> | undefined,
): Promise<PreviewRender> {
  const { preview } = api;
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

const selectorIds = (render: PreviewRender): string[] =>
  render.view?.view.selectors.map((s) => s.selector.id) ?? [];

export async function testScriptedSkeleton(api: EtchApi): Promise<void> {
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes(ADD_SCRIPTED_SELECTORS), `${ADD_SCRIPTED_SELECTORS} is registered`);
  const { root, game, mod } = await fixture();
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  try {
    const guiUri = vscode.Uri.file(path.join(mod, 'interface', 'etch_scripted.gui'));
    await vscode.window.showTextDocument(guiUri, { viewColumn: vscode.ViewColumn.One });
    await rendered(
      api,
      (r) => r.window.name === 'etch_scripted',
      () => vscode.commands.executeCommand('etch.openPreview'),
    );

    let result: ScriptedSkeletonResult | undefined;
    const withSelectors = await rendered(
      api,
      (r) => r.window.name === 'etch_scripted' && selectorIds(r).includes('etch_panel'),
      async () => {
        result = await vscode.commands.executeCommand<ScriptedSkeletonResult | undefined>(
          ADD_SCRIPTED_SELECTORS,
        );
      },
    );
    assert.ok(result, 'the command added the selectors');
    assert.deepEqual(result.selectors, ['etch_panel', 'etch_button']);
    assert.deepEqual(result.rules, ['etch_panel-hidden', 'etch_button-hidden']);
    const file = path.join(mod, '.etch', 'profiles', 'etch_scripted.jsonc');
    assert.equal(result.file.fsPath.toLowerCase(), file.toLowerCase());
    const text = await readFile(file, 'utf8');
    assert.match(text, /"window": "etch_scripted"/);
    assert.match(
      text,
      /common\/custom_gui\/etch_scripted\.txt, custom_window: potential = \{ has_country_flag = etch_panel_open \}/,
    );
    assert.match(text, /"hide": \[\s*"etch_scripted\/etch_panel\/etch_button"\s*\]/);
    assert.deepEqual(selectorIds(withSelectors).sort(), ['etch_button', 'etch_panel']);

    // A second run adds nothing and keeps the file as it is.
    const again = await vscode.commands.executeCommand<ScriptedSkeletonResult | undefined>(
      ADD_SCRIPTED_SELECTORS,
    );
    assert.ok(again, 'a second run answers');
    assert.deepEqual(again.selectors, []);
    assert.equal(again.kept.length, 4);
    assert.equal(await readFile(file, 'utf8'), text);
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await rm(root, { recursive: true, force: true });
  }
}
