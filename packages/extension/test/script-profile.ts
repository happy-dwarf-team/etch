// Etch: Show the Latest Script Profile in a real VS Code: the newest CSV of the game profile that the
// game folder's userdir.txt names, shown as a Markdown preview of a page in Etch's storage, its
// names linked to where the game folder defines them (no workspace folder is open in the test).
import * as assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { pageLink } from '../src/script-profile.ts';
import { HIDE_SCRIPT_PROFILE_LENSES } from '../src/script-profile-lenses.ts';
import { SCRIPT_PROFILE_PAGE, SHOW_SCRIPT_PROFILE } from '../src/script-profile-view.ts';

const csv = (status: string, name: string): string =>
  [
    `# format=1 plugin=anvil-script-profiler version=1.22.0 status=${status} days=30 first_day=1444.11.11 last_day=1444.12.11 wall_s=4.2`,
    '# note',
    'list,rank,owner,name,option,role,calls,total_ms,mean_us,max_us,main_thread_ms,caller_rva',
    `trigger,1,event,${name},,trigger,10,2.5,250.0,400.0,2.5,`,
    'effect,1,decision,test_decision,,effect,3,1.0,333.3,500.0,1.0,',
  ].join('\n');

export async function testScriptProfile(): Promise<void> {
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes(SHOW_SCRIPT_PROFILE), `${SHOW_SCRIPT_PROFILE} is registered`);

  const root = await mkdtemp(path.join(tmpdir(), 'etch-script-profile-'));
  const game = path.join(root, 'game');
  const profile = path.join(root, 'profile');
  await mkdir(game, { recursive: true });
  await mkdir(path.join(profile, 'logs'), { recursive: true });
  await writeFile(path.join(game, 'userdir.txt'), profile);
  await mkdir(path.join(game, 'events'), { recursive: true });
  const events = path.join(game, 'events', 'new_events.txt');
  await writeFile(
    events,
    'namespace = new_events\n\ncountry_event = {\n\tid = new_events.1\n\ttrigger = { always = yes }\n}\n',
  );
  const older = path.join(profile, 'logs', 'script_profile_2026-11-01_100000.csv');
  const newest = path.join(profile, 'logs', 'script_profile_2026-11-02_100000.csv');
  await writeFile(older, csv('complete', 'old_events.1'));
  await writeFile(newest, csv('interrupted_session', 'new_events.1'));
  await utimes(older, new Date('2026-11-01'), new Date('2026-11-01'));
  await utimes(newest, new Date('2026-11-02'), new Date('2026-11-02'));

  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  // The game files' encoding, as modders set it: the page is still read as UTF-8.
  const files = vscode.workspace.getConfiguration('files');
  await files.update('encoding', 'windows1252', vscode.ConfigurationTarget.Global);
  try {
    const shown = await vscode.commands.executeCommand<vscode.Uri | undefined>(SHOW_SCRIPT_PROFILE);
    assert.ok(shown !== undefined, 'the command answers the page');
    assert.equal(path.basename(shown.fsPath), SCRIPT_PROFILE_PAGE);
    const document = await vscode.workspace.openTextDocument(shown);
    const page = document.getText();
    assert.match(page, /# Script profile/);
    assert.ok(page.includes('| Mean (µs) | Max (µs) |'), 'µ reads as µ under windows1252');
    assert.match(page, /30 days \(1444\.11\.11 to 1444\.12\.11\)/);
    assert.match(page, /\*\*Interrupted\*\* \(interrupted_session\)/);
    const link = pageLink(
      path.posix.dirname(document.uri.path),
      vscode.Uri.file(events).path,
      'L5',
    );
    assert.ok(link !== undefined);
    assert.ok(
      page.includes(
        `| 1 | Event | [new_events.1](<${link}> "events/new_events.txt, line 5 (the game)") | trigger | 10 |`,
      ),
      'the event links to its trigger in the game folder',
    );
    // The preview renders the link as a link (a `file:` link stayed text), and VS Code's Markdown
    // language service, which opens a clicked link, resolves it to the file at the trigger's line.
    const html = await vscode.commands.executeCommand<string>('markdown.api.render', page);
    assert.ok(html.includes(`data-href="${link}"`), `the preview renders the link: ${html}`);
    assert.doesNotMatch(html, /\]\(/, 'no link is left as Markdown text');
    assert.equal(document.uri.scheme, 'file', 'the page is a file, so its links open files');
    const targets = (
      (await vscode.commands.executeCommand<vscode.DocumentLink[] | undefined>(
        'vscode.executeLinkProvider',
        document.uri,
        10,
      )) ?? []
    ).flatMap((l) => (l.target === undefined ? [] : [l.target]));
    const resolved = targets.map((t) => t.toString(true));
    const key = (uri: vscode.Uri): string => uri.fsPath.toLowerCase();
    assert.ok(
      targets.some(
        (t) =>
          t.scheme === 'file' &&
          key(t) === key(vscode.Uri.file(events)) &&
          /^L5\b/.test(t.fragment),
      ),
      `the language service resolves the event's link to its file at line 5: ${JSON.stringify(resolved)}`,
    );
    assert.ok(
      targets.some((t) => t.scheme === 'file' && key(t) === key(vscode.Uri.file(newest))),
      `and the page's first link to the CSV: ${JSON.stringify(resolved)}`,
    );
    assert.match(page, /Names link to where they are written in the game folder/);
    assert.match(page, /\| 1 \| Decision \| test_decision \| effect \| 3 \|/);
    assert.doesNotMatch(page, /old_events/);

    // The lenses: above the event in its file, gone after the hide command.
    const lensesOf = async (): Promise<vscode.CodeLens[]> =>
      (await vscode.commands.executeCommand<vscode.CodeLens[] | undefined>(
        'vscode.executeCodeLensProvider',
        vscode.Uri.file(events),
      )) ?? [];
    await vscode.window.showTextDocument(vscode.Uri.file(events));
    const lenses = await lensesOf();
    assert.deepEqual(
      lenses.map((l) => [l.range.start.line, l.command?.title]),
      [[2, 'Script profile: triggers 2.5 ms (10 calls)']],
      'one lens above the measured event',
    );
    assert.equal(lenses[0]?.command?.command, 'markdown.showPreview');
    await vscode.commands.executeCommand(HIDE_SCRIPT_PROFILE_LENSES);
    assert.deepEqual(await lensesOf(), [], 'no lens after hiding');
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
    await files.update('encoding', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    // Windows can still hold the folder of a file the editor just closed.
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
