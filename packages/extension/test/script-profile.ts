// Etch: Show Latest Script Profile in a real VS Code: the newest CSV of the game profile that the
// game folder's userdir.txt names, shown as a Markdown preview of a virtual document, its names
// linked to where the game folder defines them (no workspace folder is open in the test).
import * as assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { HIDE_SCRIPT_PROFILE_LENSES } from '../src/script-profile-lenses.ts';
import { SHOW_SCRIPT_PROFILE } from '../src/script-profile-view.ts';

const TIMEOUT_MS = 10000;

const csv = (status: string, name: string): string =>
  [
    `# format=1 plugin=anvil-script-profiler version=1.22.0 status=${status} days=30 first_day=1444.11.11 last_day=1444.12.11 wall_s=4.2`,
    '# note',
    'list,rank,owner,name,option,role,calls,total_ms,mean_us,max_us,main_thread_ms,caller_rva',
    `trigger,1,event,${name},,trigger,10,2.5,250.0,400.0,2.5,`,
    'effect,1,decision,test_decision,,effect,3,1.0,333.3,500.0,1.0,',
  ].join('\n');

async function documentOf(scheme: string): Promise<vscode.TextDocument> {
  const deadline = Date.now() + TIMEOUT_MS;
  for (;;) {
    const found = vscode.workspace.textDocuments.find((d) => d.uri.scheme === scheme);
    if (found !== undefined) return found;
    if (Date.now() > deadline) throw new Error(`no ${scheme} document was opened`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

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
  try {
    await vscode.commands.executeCommand(SHOW_SCRIPT_PROFILE);
    const page = (await documentOf('etch-script-profile')).getText();
    assert.match(page, /# Script profile/);
    assert.match(page, /30 days \(1444\.11\.11 to 1444\.12\.11\)/);
    assert.match(page, /\*\*Interrupted\*\* \(interrupted_session\)/);
    const link = vscode.Uri.file(events).with({ fragment: 'L5' }).toString();
    assert.ok(
      page.includes(
        `| 1 | Event | [new_events.1](<${link}> "events/new_events.txt, line 5 (the game)") | trigger | 10 |`,
      ),
      'the event links to its trigger in the game folder',
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
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    // Windows can still hold the folder of a file the editor just closed.
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
