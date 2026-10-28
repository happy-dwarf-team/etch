// Sample data end to end (spec sections 2 and 5): a fixture mod project whose window profile
// fills texts and a list box; a text save chosen for the preview, its province changed in
// `Data ▾` (the data selector follows it), the number of a list's entries set there, a link that
// holds for an uncolonised province, drawn instead of the window and pinned from its note, and a
// binary save named as not readable.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { activeLinks } from '@etch/core/profile';
import type { EtchApi } from '../src/extension.ts';
import type { PreviewApi, PreviewRender } from '../src/preview/index.ts';

const TIMEOUT_MS = 30_000;

const GUI = `guiTypes = {
	windowType = {
		name = "etch_data"
		size = { x = 300 y = 200 }
		instantTextBoxType = { name = "province_name" text = "PLACEHOLDER" }
		instantTextBoxType = { name = "title" text = "PLACEHOLDER" }
		instantTextBoxType = { name = "income" text = "PLACEHOLDER" }
		windowType = { name = "foreign" size = { x = 10 y = 10 } }
		listboxType = { name = "cores" position = { x = 0 y = 50 } size = { x = 100 y = 100 } spacing = 2 }
	}
	windowType = {
		name = "etch_core_entry"
		size = { x = 100 y = 20 }
		instantTextBoxType = { name = "tag" text = "TAG" }
	}
	windowType = { name = "etch_other" size = { x = 50 y = 50 } }
}
`;

const PROFILE = `{
  "formatVersion": 1,
  "window": "etch_data",
  "selectors": {
    "owner": { "kind": "data", "fact": "province.ownedByPlayer", "values": { "yes": "Own", "no": "Foreign" } },
    "owned": { "kind": "data", "fact": "province.owned", "default": "yes" }
  },
  "rules": {
    "foreign": { "when": { "owner": "yes" }, "hide": ["etch_data/foreign"] }
  },
  "content": {
    "etch_data/province_name": { "save": "provinces.{province}.name" },
    "etch_data/title": { "loc": "ETCH_DATA_TITLE" },
    "etch_data/income": { "engine": true, "generated": "number" }
  },
  "repeaters": {
    "etch_data/cores": {
      "template": "etch_core_entry",
      "from": "provinces.{province}.cores",
      "count": 2,
      "fields": { "etch_core_entry/tag": { "save": "entry", "transform": "localise" } }
    }
  },
  "links": {
    "uncolonised": { "when": { "owned": "no" }, "window": "etch_other", "label": "Uncolonised" }
  }
}
`;

const SAVE = `EU4txt
date=1444.11.11
player="SWE"
provinces={
-1={
		name="Stockholm"
		owner="SWE"
		controller="SWE"
		cores={
			SWE DAN NOR
		}
	}
-2={
		name="Kalmar"
		owner="DAN"
		controller="DAN"
	}
-3={
		name="Uncharted"
	}
}
countries={
	SWE={ capital=1 }
	DAN={ capital=2 }
}
`;

async function fixture(): Promise<{ game: string; mod: string; saves: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'etch-data-'));
  const files: Record<string, string> = {
    'game/eu4.exe': 'not the game',
    'game/userdir.txt': 'profile',
    'game/profile/settings.txt': 'graphics={\n\tsize={\n\t\tx=1920\n\t\ty=1080\n\t}\n}\n',
    'mod/descriptor.mod': 'name="Etch data"\nsupported_version="1.37.*"\n',
    'mod/interface/etch_data.gui': GUI,
    'mod/localisation/etch_data_l_english.yml':
      '﻿l_english:\n ETCH_DATA_TITLE:0 "Sample title"\n SWE:0 "Sweden"\n DAN:0 "Denmark"\n',
    'mod/.etch/profiles/etch_data.jsonc': PROFILE,
    'saves/text.eu4': SAVE,
    'saves/ironman.eu4': 'EU4bin\u0001\u0000\u0003\u0000',
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, ...name.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, name.endsWith('.eu4') ? 'latin1' : 'utf8');
  }
  return {
    game: path.join(root, 'game'),
    mod: path.join(root, 'mod'),
    saves: path.join(root, 'saves'),
  };
}

/** Resolves once the preview's current render satisfies a condition. */
async function rendered(
  preview: PreviewApi,
  done: (render: PreviewRender) => boolean,
  action?: () => Thenable<unknown> | Promise<unknown> | undefined,
): Promise<PreviewRender> {
  const found = new Promise<PreviewRender>((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.dispose();
      const last = preview.current;
      const seen =
        last === undefined
          ? 'none'
          : `${last.window.name ?? '?'}, sample ${String(last.sample !== undefined)}, name ${JSON.stringify(textOf(last, 'province_name'))}`;
      reject(
        new Error(
          `no matching render in ${String(TIMEOUT_MS)} ms; the last: ${seen}; ${JSON.stringify(stateOf(preview)?.notices)}`,
        ),
      );
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

/** What the toolbar shows; read through a call, which assertions do not narrow. */
const stateOf = (preview: PreviewApi) => preview.viewState;

const named = (render: PreviewRender, name: string) =>
  render.layout.widgets.find((w) => w.widget.name === name)?.widget;

const textOf = (render: PreviewRender, name: string, row?: number) => {
  const widget =
    row === undefined
      ? named(render, name)
      : render.layout.widgets.find((w) => w.widget.name === name && w.row === row)?.widget;
  return widget === undefined ? undefined : render.sample?.text(widget, row);
};

export async function testData(api: EtchApi): Promise<void> {
  const { preview } = api;
  const { game, mod, saves } = await fixture();
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  try {
    const guiUri = vscode.Uri.file(path.join(mod, 'interface', 'etch_data.gui'));
    await vscode.window.showTextDocument(guiUri, { viewColumn: vscode.ViewColumn.One });

    // Without a save: the files and generated layers, and two generated list entries.
    const first = await rendered(
      preview,
      (r) => r.window.name === 'etch_data' && r.sample !== undefined,
      () => vscode.commands.executeCommand('etch.openPreview'),
    );
    assert.deepEqual(textOf(first, 'title'), {
      text: 'Sample title',
      layer: 'files',
      detail: 'ETCH_DATA_TITLE',
    });
    assert.equal(textOf(first, 'province_name')?.layer, 'generated');
    assert.equal(textOf(first, 'income')?.text, '12.3');
    assert.equal(first.layout.widgets.filter((w) => w.widget.name === 'etch_core_entry').length, 2);
    assert.equal(stateOf(preview)?.data?.save.state, 'none');

    // A text save: its player's capital, the province's cores as list entries.
    await preview.chooseSave(path.join(saves, 'text.eu4'));
    const own = await rendered(preview, (r) => textOf(r, 'province_name')?.layer === 'save');
    assert.equal(textOf(own, 'province_name')?.text, 'Stockholm');
    assert.deepEqual(
      [0, 1, 2].map((row) => textOf(own, 'tag', row)?.text),
      ['Sweden', 'Denmark', 'NOR'],
    );
    assert.equal(named(own, 'foreign'), undefined, 'an own province hides the foreign window');
    const owner = own.view?.view.selectors.find((s) => s.selector.id === 'owner');
    assert.deepEqual([owner?.value, owner?.source], ['yes', 'save']);
    const menu = stateOf(preview)?.data;
    assert.ok(menu);
    assert.equal(menu.save.state, 'ready');
    assert.equal(menu.label, 'Data: Stockholm · 1444.11.11');
    assert.equal(menu.layers.find((l) => l.id === 'save')?.count, 4);

    // A foreign province: the data selector follows the save.
    const foreign = await rendered(
      preview,
      (r) => textOf(r, 'province_name')?.text === 'Kalmar',
      () => {
        preview.chooseData({ province: 2 });
        return undefined;
      },
    );
    assert.ok(named(foreign, 'foreign'), 'a foreign province shows the foreign window');

    // The number of a list's entries, set in Data ▾ over the save's.
    const more = await rendered(
      preview,
      (r) => {
        const list = named(r, 'cores');
        return list !== undefined && r.sample?.rows(list)?.count === 4;
      },
      async () => {
        await preview.dataAction({ kind: 'entries', list: 'etch_data/cores', count: 4 });
      },
    );
    assert.equal(more.layout.widgets.filter((w) => w.widget.name === 'etch_core_entry').length, 4);
    await preview.idle();
    assert.deepEqual(stateOf(preview)?.data?.lists, [
      {
        id: 'etch_data/cores',
        label: 'cores (etch_core_entry)',
        count: 4,
        bySet: true,
        detail: 'set by you',
      },
    ]);
    await preview.dataAction({ kind: 'entries', list: 'etch_data/cores' });

    // An uncolonised province: the link holds, and its button pins the linked window.
    const uncolonised = await rendered(
      preview,
      (r) => r.linked === 'etch_other',
      () => {
        preview.chooseData({ province: 3 });
        return undefined;
      },
    );
    const viewed = uncolonised.view;
    assert.ok(viewed);
    assert.deepEqual(
      activeLinks(viewed.profile.profile, viewed.view).map((l) => l.window),
      ['etch_other'],
    );
    // The game shows the linked window instead, and so does the preview, with the note.
    assert.equal(uncolonised.linked, 'etch_other');
    assert.equal(uncolonised.layout.widgets[0]?.widget.name, 'etch_other');
    await preview.idle();
    assert.deepEqual(stateOf(preview)?.links, [
      {
        window: 'etch_other',
        label: 'Uncolonised The preview draws etch_other; pin it to edit it.',
      },
    ]);
    let opened: boolean | undefined;
    const other = await rendered(
      preview,
      (r) => r.window.name === 'etch_other',
      async () => {
        opened = await preview.openLink('etch_other');
        assert.equal(opened, true, 'the playset defines the linked window');
      },
    );
    assert.equal(other.pinned, true);
    preview.togglePin();

    // A binary save is named as not readable, on the profiled window again.
    await preview.chooseSave(path.join(saves, 'ironman.eu4'));
    const editor = await vscode.window.showTextDocument(guiUri, {
      viewColumn: vscode.ViewColumn.One,
    });
    await rendered(
      preview,
      (r) => r.window.name === 'etch_data',
      () => {
        // Inside `etch_data`'s block: the preview follows the cursor.
        editor.selection = new vscode.Selection(2, 4, 2, 4);
        return undefined;
      },
    );
    await preview.idle();
    const failed = stateOf(preview)?.data?.save;
    assert.equal(failed?.state, 'failed');
    assert.match(failed.problem ?? '', /ironman/);

    await preview.dataAction({ kind: 'dropSave' });
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await preview.idle();
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
