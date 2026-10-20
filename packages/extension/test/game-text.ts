// Game text diagnostics, quick fixes and reading, in a real VS Code with its
// default settings (`files.encoding` utf8, no guessing).
import * as assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { REOPEN_WITH_ENCODING, gameTextOfDocument, readGameText } from '../src/game-text.ts';

const TIMEOUT_MS = 5000;

/** Waits until the diagnostics of a file satisfy a condition. */
async function diagnosticsOf(
  uri: vscode.Uri,
  done: (diagnostics: vscode.Diagnostic[]) => boolean,
): Promise<vscode.Diagnostic[]> {
  const current = () => vscode.languages.getDiagnostics(uri);
  if (done(current())) {
    return current();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.dispose();
      reject(new Error(`diagnostics of ${uri.fsPath}: ${JSON.stringify(current())}`));
    }, TIMEOUT_MS);
    const listener = vscode.languages.onDidChangeDiagnostics(() => {
      if (done(current())) {
        clearTimeout(timer);
        listener.dispose();
        resolve(current());
      }
    });
  });
}

async function fixture(root: string, name: string, bytes: number[]): Promise<vscode.Uri> {
  const file = path.join(root, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Uint8Array.from(bytes));
  return vscode.Uri.file(file);
}

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

export async function testGameText(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'etch-game-text-'));

  // `text = "é"` saved as UTF-8: VS Code opens it as UTF-8, the game reads `Ã©`.
  const utf8Gui = await fixture(root, 'interface/utf8.gui', [
    ...ascii('text = "'),
    0xc3,
    0xa9,
    ...ascii('"\n'),
  ]);
  let document = await vscode.workspace.openTextDocument(utf8Gui);
  assert.equal(document.encoding, 'utf8');
  const [differs] = await diagnosticsOf(utf8Gui, (found) => found.length > 0);
  assert.ok(differs);
  assert.equal(differs.code, 'game-text-differs');
  assert.equal(differs.severity, vscode.DiagnosticSeverity.Warning);
  assert.equal(differs.message, 'Saved as UTF-8; the game reads "Ã©".');
  assert.deepEqual([differs.range.start.character, differs.range.end.character], [8, 9]);
  assert.equal((await gameTextOfDocument(document, 'interface')).text, 'text = "Ã©"\n');

  const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    'vscode.executeCodeActionProvider',
    utf8Gui,
    differs.range,
  );
  const titles = actions.map((action) => action.title);
  assert.ok(titles.includes('Reopen as Windows 1252'), titles.join(', '));
  assert.ok(titles.includes('Save with Encoding…'), titles.join(', '));

  // Reopened as Windows-1252, the editor shows what the game reads.
  await vscode.commands.executeCommand(REOPEN_WITH_ENCODING, utf8Gui, 'windows1252');
  document = await vscode.workspace.openTextDocument(utf8Gui);
  assert.equal(document.encoding, 'windows1252');
  assert.equal(document.getText(), 'text = "Ã©"\n');
  await diagnosticsOf(utf8Gui, (found) => found.length === 0);

  // A Windows-1252 file opened as UTF-8 shows U+FFFD: an error.
  const cp1252Gui = await fixture(root, 'interface/cp1252.gui', [...ascii('a = "'), 0xe5, 0x22]);
  await vscode.workspace.openTextDocument(cp1252Gui);
  const [replaced] = await diagnosticsOf(cp1252Gui, (found) => found.length > 0);
  assert.equal(replaced?.code, 'replacement-character');
  assert.equal(replaced.severity, vscode.DiagnosticSeverity.Error);

  // Localisation without a BOM.
  const yml = await fixture(root, 'localisation/test_l_english.yml', ascii('l_english:\n'));
  await vscode.workspace.openTextDocument(yml);
  const [noBom] = await diagnosticsOf(yml, (found) => found.length > 0);
  assert.equal(noBom?.code, 'localisation-encoding');

  // A file that is not open is read from disk.
  const onDisk = await fixture(root, 'interface/disk.gui', [0xef, 0xbb, 0xbf, 0xe5]);
  assert.deepEqual(await readGameText(onDisk), { text: 'å', bom: true });
  assert.equal(await readGameText(vscode.Uri.file(path.join(root, 'notes.txt'))), undefined);
}
