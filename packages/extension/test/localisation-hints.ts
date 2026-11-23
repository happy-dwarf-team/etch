// Localisation inlay hints, hovers and Go to Definition end to end in a real VS Code: a fixture
// game (an `eu4.exe` that is not the game) set as `etch.gamePath`, with an English and a French
// localisation file, a `.gui` file and an event that name keys, one of them undefined, and the
// `textcolors` and a text icon's sprite that the hover draws with.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { dds, markdownOf, positionOf } from './asset-links.ts';
import { keyLine, localisationReferencePath } from '../src/localisation-hints.ts';

const ENGLISH = `\uFEFFl_english:
 ETCH_TITLE:0 "§YThe Etch window§!"
 etch.1.t:0 "A harbour is built"
 etch.1.a:0 "Pay $AMOUNT$ ducats £ducats£ for it, and a very long text that the hint must cut short"
 etch.1.a:1 "Pay $AMOUNT$ ducats for it, and a very long text that the hint must cut short"
`;

const FRENCH = `\uFEFFl_french:
 etch.1.t:0 "Un port est construit"
`;

const CORE_GFX = `bitmapfonts = {
	textcolors = { Y = { 255 189 0 } }
}
spriteTypes = {
	spriteType = { name = "GFX_text_ducats" texturefile = "gfx/interface/ducats.dds" }
}
`;

const GUI = `guiTypes = {
	windowType = {
		name = "etch_window"
		instantTextBoxType = { name = "title" text = "ETCH_TITLE" }
		instantTextBoxType = { name = "plain" text = "not a key" }
	}
}
`;

const EVENTS = `namespace = etch
country_event = {
	id = etch.1
	title = etch.1.t
	desc = etch.1.undefined
	option = { name = etch.1.a }
}
`;

async function fixtureGame(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'etch-loc-hints-'));
  const files: Record<string, string | Uint8Array> = {
    'eu4.exe': 'not the game',
    'interface/core.gfx': CORE_GFX,
    'gfx/interface/ducats.dds': dds(1, 1, [0, 200, 255, 255]),
    'localisation/etch_l_english.yml': ENGLISH,
    'localisation/etch_l_french.yml': FRENCH,
    'interface/etch.gui': GUI,
    'events/etch.txt': EVENTS,
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, ...name.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
}

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

export async function testLocalisationHints(): Promise<void> {
  const game = await fixtureGame();
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  try {
    const open = (name: string): Thenable<vscode.TextDocument> =>
      vscode.workspace.openTextDocument(vscode.Uri.file(path.join(game, ...name.split('/'))));
    const gui = await open('interface/etch.gui');
    assert.deepEqual(
      await hintsOf(gui),
      ['instantTextBoxType = { name = "title" text = "ETCH_TITLE" → The Etch window'],
      'a .gui text key gets its plain text; a text that is no key gets nothing',
    );
    const events = await open('events/etch.txt');
    assert.deepEqual(
      await hintsOf(events),
      [
        'title = etch.1.t → A harbour is built',
        'option = { name = etch.1.a → Pay … ducats for it, and a very long text that the hint mus…',
      ],
      "an event's keys at any depth; an undefined key gets nothing",
    );

    const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeDefinitionProvider',
      events.uri,
      positionOf(events, 'etch.1.t'),
    );
    assert.deepEqual(
      definitions.map((d) => [
        path.relative(game, d.uri.fsPath),
        d.range.start.line,
        d.range.start.character,
      ]),
      [[path.join('localisation', 'etch_l_english.yml'), 2, 1]],
      'Go to Definition opens the key in its .yml file',
    );

    const hover = async (document: vscode.TextDocument, text: string): Promise<string> =>
      markdownOf(
        await vscode.commands.executeCommand<vscode.Hover[]>(
          'vscode.executeHoverProvider',
          document.uri,
          positionOf(document, text),
        ),
      );
    const title = await hover(gui, 'ETCH_TITLE');
    assert.match(
      title,
      /\*\*ETCH&#95;TITLE\*\* · localisation · english/,
      'the hover names the key',
    );
    assert.match(
      title,
      /<span style="color:#ffbd00;">The Etch window<\/span>/,
      "a § code in the colour of the playset's textcolors",
    );
    assert.match(
      title,
      /Defined in `localisation\/etch_l_english\.yml:2` — the game/,
      'and the file and line of the key',
    );
    const option = await hover(events, 'etch.1.a');
    assert.match(
      option,
      /^Pay &#36;AMOUNT&#36; ducats <img src="data:image\/png;base64,[^"]+" alt="&#163;ducats&#163;"[^>]*> for it&#44; and a very long text that the hint must cut short$/m,
      "the whole text of the key's first value in the file: an icon as its sprite's picture, a variable as written",
    );
    assert.match(option, /etch_l_english\.yml:4`/, "and that value's line");
    assert.equal(await hover(events, 'etch.1.undefined'), '', 'an undefined key has no hover');

    await settings.update('language', 'french', vscode.ConfigurationTarget.Global);
    assert.deepEqual(
      await hintsOf(events),
      ['title = etch.1.t → Un port est construit'],
      'the hints follow etch.language',
    );
    await settings.update('language', undefined, vscode.ConfigurationTarget.Global);

    await settings.update('editor.localisationHints', false, vscode.ConfigurationTarget.Global);
    assert.deepEqual(await hintsOf(events), [], 'the setting turns them off');
    assert.equal(await hover(events, 'etch.1.t'), '', 'and the hovers');
    await settings.update('editor.localisationHints', undefined, vscode.ConfigurationTarget.Global);

    assert.deepEqual(
      [
        'C:\\mods\\Etch\\interface\\etch.gui',
        'C:\\mods\\Etch\\Events\\etch.txt',
        '/mods/etch/common/ideas/etch.txt',
        '/mods/etch/history/provinces/1.txt',
        '/mods/etch/localisation/etch_l_english.yml',
      ].map(localisationReferencePath),
      ['interface/etch.gui', 'Events/etch.txt', 'common/ideas/etch.txt', undefined, undefined],
      "a file's game path comes from its last script folder",
    );
    assert.deepEqual(
      keyLine(ENGLISH, 'etch.1.a'),
      { line: 3, column: 1 },
      'the first line of a key wins, as the game keeps the first value in a file',
    );
    assert.deepEqual(
      keyLine(ENGLISH, 'etch.1.a', true),
      { line: 4, column: 1 },
      'and the last in a replace file',
    );
    assert.equal(keyLine(ENGLISH, 'etch.1'), undefined, 'a prefix is not a key');
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
    await settings.update('language', undefined, vscode.ConfigurationTarget.Global);
    await settings.update('editor.localisationHints', undefined, vscode.ConfigurationTarget.Global);
  }
}
