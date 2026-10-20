// Runs inside the VS Code that test/run.mts starts. No test framework: a thrown
// error fails the run.
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('happy-dwarf-team.etch');
  assert.ok(extension, 'the extension is installed');
  await extension.activate();
  assert.equal(extension.isActive, true, 'the extension activates');
}
