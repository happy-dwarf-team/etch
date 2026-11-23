// Province names as inlay hints in a real VS Code (etch#648, P3.14): a fixture game (an `eu4.exe`
// that is not the game) set as `etch.gamePath`, with a map, the English province names and an
// event that gives province ids the map has, one it does not list, one past `max_provinces` and a
// tag.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

const TIMEOUT_MS = 10000;

const NAMES = `\uFEFFl_english:
 PROV151:0 "Constantinople"
 PROV152:0 "§YEdirne§!"
 PROV5075:0 "Beyond the map"
 ETCH_TITLE:0 "Not a province"
`;

const EVENTS = `namespace = etch
country_event = {
	id = etch.1
	trigger = { owns = 151 owns = 153 owns = 5075 }
	immediate = {
		152 = { add_core = ROOT }
		add_core = FRA
	}
}
`;

async function fixtureGame(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'etch-province-names-'));
  const files: Record<string, string> = {
    'eu4.exe': 'not the game',
    'map/default.map': 'max_provinces = 200\n',
    'map/definition.csv': 'province;red;green;blue;x;x\n151;1;1;1;A;x\n152;2;2;2;B;x\n',
    'localisation/prov_names_l_english.yml': NAMES,
    'events/etch.txt': EVENTS,
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, ...name.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
}

/** The document's inlay hints, as `text before the hint → hint`. */
async function hintsOf(document: vscode.TextDocument): Promise<string[]> {
  const end = document.lineAt(document.lineCount - 1).range.end;
  const hints = await vscode.commands.executeCommand<vscode.InlayHint[]>(
    'vscode.executeInlayHintProvider',
    document.uri,
    new vscode.Range(new vscode.Position(0, 0), end),
  );
  return hints.map((hint) => {
    const label =
      typeof hint.label === 'string' ? hint.label : hint.label.map((p) => p.value).join('');
    const line = document.lineAt(hint.position.line).text;
    return `${line.slice(0, hint.position.character).trim()} → ${label}`;
  });
}

/** Waits until the hints are `expected`: the playset is read after the settings change. */
async function expectHints(document: vscode.TextDocument, expected: string[]): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  let seen = await hintsOf(document);
  while (JSON.stringify(seen) !== JSON.stringify(expected) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    seen = await hintsOf(document);
  }
  assert.deepEqual(seen, expected);
}

export async function testProvinceNames(): Promise<void> {
  const game = await fixtureGame();
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  try {
    const events = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(game, 'events', 'etch.txt')),
    );
    // 153 is not in definition.csv and 5075 is past max_provinces: their warnings say why, and
    // they get no name; FRA is a tag.
    await expectHints(events, ['trigger = { owns = 151 → Constantinople', '152 → Edirne']);

    const hint = (
      await vscode.commands.executeCommand<vscode.InlayHint[]>(
        'vscode.executeInlayHintProvider',
        events.uri,
        new vscode.Range(new vscode.Position(0, 0), new vscode.Position(4, 0)),
      )
    )[0];
    const tooltip = hint?.tooltip;
    assert.ok(tooltip instanceof vscode.MarkdownString, 'a hint has a Markdown tooltip');
    assert.match(
      tooltip.value,
      /\*\*PROV151\*\* · english · `localisation\/prov_names_l_english\.yml`/,
    );
    // appendText writes the spaces as &nbsp;.
    assert.match(tooltip.value, /Province(?: |&nbsp;)151:(?: |&nbsp;)Constantinople/);

    await settings.update('editor.provinceNames', false, vscode.ConfigurationTarget.Global);
    await expectHints(events, []);
  } finally {
    await settings.update('editor.provinceNames', undefined, vscode.ConfigurationTarget.Global);
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
