// Province id and name warnings in a real VS Code (anvil#426): an open event file against the game
// folder's map, and Etch: Check Province IDs and Names in the Playset on files that are not open (no
// workspace folder is open in the test, so the playset is the game folder that etch.gamePath names).
import * as assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CHECK_PROVINCE_IDS } from '../src/province-ids.ts';

const TIMEOUT_MS = 10000;

/** Waits until the diagnostics of a file satisfy a condition. */
async function diagnosticsOf(
  uri: vscode.Uri,
  done: (diagnostics: vscode.Diagnostic[]) => boolean,
): Promise<vscode.Diagnostic[]> {
  const current = (): vscode.Diagnostic[] =>
    vscode.languages.getDiagnostics(uri).filter((d) => d.source === 'Etch');
  const deadline = Date.now() + TIMEOUT_MS;
  while (!done(current())) {
    if (Date.now() > deadline) {
      throw new Error(`diagnostics of ${uri.fsPath}: ${JSON.stringify(current())}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return current();
}

async function write(root: string, name: string, text: string): Promise<vscode.Uri> {
  const file = path.join(root, ...name.split('/'));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  return vscode.Uri.file(file);
}

export async function testProvinceIds(): Promise<void> {
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes(CHECK_PROVINCE_IDS), `${CHECK_PROVINCE_IDS} is registered`);

  const root = await mkdtemp(path.join(tmpdir(), 'etch-province-ids-'));
  const game = path.join(root, 'game');
  await write(
    game,
    'map/default.map',
    'max_provinces = 10\nlakes = { 4 }\ncanal_definition = { name = "lost" x = 1 y = 1 }\n' +
      'region = "lost_region.txt"\n',
  );
  const definitions = await write(
    game,
    'map/definition.csv',
    'province;r;g;b;x;x\n1;1;1;1;A;x\n2;2;300;2;B;x\n',
  );
  const open = await write(
    game,
    'events/open.txt',
    'e = {\n\ttrigger = { owns = 12 owns = 1 }\n\timmediate = { 2 = { add_core = ROOT } }\n}\n',
  );
  const closed = await write(
    game,
    'common/scripted_effects/fx.txt',
    'fx = {\n\t3 = { add_core = ROOT }\n}\n',
  );
  await write(game, 'common/ideas/ideas.txt', 'quantity_ideas = {\n\tlevee_en_masse = { }\n}\n');
  // A tag whose country file no layer has, next to one whose file is there.
  const tags = await write(
    game,
    'common/country_tags/00_countries.txt',
    'SWE = "countries/Sweden.txt"\nLST = "countries/Lost.txt"\n',
  );
  await write(game, 'common/countries/Sweden.txt', 'graphical_culture = westerngfx\n');
  // Written before the playset's map is read: the map keeps the map files it found then.
  const links = await write(
    game,
    'map/adjacencies.csv',
    'From;To;Type;Through\n12;1;sea;2\n-1;-1;;-1\n',
  );
  const ideas = await write(
    game,
    'events/ideas.txt',
    'e = {\n\timmediate = { add_idea_group = quantity_idea remove_idea = levee_en_masse }\n}\n',
  );

  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  try {
    const document = await vscode.workspace.openTextDocument(open);
    await vscode.window.showTextDocument(document);
    const [outOfRange, ...others] = await diagnosticsOf(open, (found) => found.length > 0);
    assert.deepEqual(others, []);
    assert.equal(outOfRange?.code, 'province-id-out-of-range');
    assert.equal(outOfRange.severity, vscode.DiagnosticSeverity.Warning);
    assert.deepEqual(
      [
        outOfRange.range.start.line,
        outOfRange.range.start.character,
        outOfRange.range.end.character,
      ],
      [1, 20, 22],
    );
    assert.match(
      outOfRange.message,
      /^Province 12 is not on the map: map\/default\.map of the game sets max_provinces = 10/,
    );

    // The adjacencies file, a .csv: From 12 is past the map.
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(links));
    const [link, ...otherLinks] = await diagnosticsOf(links, (found) => found.length > 0);
    assert.deepEqual(otherLinks, []);
    assert.equal(link?.code, 'province-id-out-of-range');
    assert.deepEqual(
      [link.range.start.line, link.range.start.character, link.range.end.character],
      [1, 0, 2],
    );
    // The definition file: a green of 300 is past the game's colour table.
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(definitions));
    const [colour, ...otherColours] = await diagnosticsOf(definitions, (found) => found.length > 0);
    assert.deepEqual(otherColours, []);
    assert.equal(colour?.code, 'province-colour-out-of-range');
    assert.deepEqual(
      [colour.range.start.line, colour.range.start.character, colour.range.end.character],
      [2, 4, 7],
    );
    await vscode.window.showTextDocument(document);

    // An edit is checked as it is typed.
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor);
    await editor.edit((edit) => {
      edit.replace(new vscode.Range(1, 20, 1, 22), '9');
    });
    const [notDefined] = await diagnosticsOf(
      open,
      (found) => found[0]?.code === 'province-id-not-defined',
    );
    assert.equal(
      notDefined?.message,
      'Province 9 is not in map/definition.csv of the game, so the map has no such province.',
    );

    // The playset check: a file that is not open, and default.map's own lists.
    await vscode.commands.executeCommand(CHECK_PROVINCE_IDS);
    const [scope] = await diagnosticsOf(closed, (found) => found.length > 0);
    assert.equal(scope?.code, 'province-id-not-defined');
    assert.deepEqual([scope.range.start.line, scope.range.start.character], [1, 1]);
    const [lake, canal, file] = await diagnosticsOf(
      vscode.Uri.file(path.join(game, 'map', 'default.map')),
      (found) => found.length > 0,
    );
    assert.match(lake?.message ?? '', /^Province 4 is not in map\/definition\.csv/);
    // A canal whose bitmap the playset does not have, from the same file.
    assert.equal(canal?.code, 'canal-bitmap-missing');
    assert.deepEqual([canal.range.start.line, canal.range.start.character], [2, 28]);
    // A region file the playset does not have, from the same file.
    assert.equal(file?.code, 'map-file-missing');
    assert.deepEqual([file.range.start.line, file.range.start.character], [3, 9]);
    // An idea group the playset does not define, from the same check.
    const [group, ...rest] = await diagnosticsOf(ideas, (found) => found.length > 0);
    assert.deepEqual(rest, []);
    assert.equal(group?.code, 'unknown-idea-group');
    assert.deepEqual([group.range.start.line, group.range.start.character], [1, 32]);
    assert.match(group.message, /^No idea group 'quantity_idea' in common\/ideas of the playset/);
    // The country file a tag names that the playset does not have.
    const [country, ...otherTags] = await diagnosticsOf(tags, (found) => found.length > 0);
    assert.deepEqual(otherTags, []);
    assert.equal(country?.code, 'country-file-missing');
    assert.deepEqual(
      [country.range.start.line, country.range.start.character, country.range.end.character],
      [1, 6, 26],
    );
    assert.match(
      country.message,
      /^The playset has no common\/countries\/Lost\.txt, which LST names/,
    );
  } finally {
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    // Windows can still hold the folder of a file the editor just closed.
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
