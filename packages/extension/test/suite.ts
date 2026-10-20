// Runs inside the VS Code that test/run.mts starts. No test framework: a thrown
// error fails the run.
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('happy-dwarf-team.etch');
  assert.ok(extension, 'the extension is installed');
  await extension.activate();
  assert.equal(extension.isActive, true, 'the extension activates');

  const settings = vscode.workspace.getConfiguration('etch');
  assert.equal(settings.get('gamePath'), '', 'etch.gamePath is contributed');
  assert.deepEqual(settings.get('playset'), [], 'etch.playset is contributed');
}
