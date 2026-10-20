// Downloads VS Code into .vscode-test (once) and runs dist-test/suite.js in it
// with this extension loaded and every other extension disabled.
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

await runTests({
  version: process.env['ETCH_VSCODE_VERSION'] ?? 'stable',
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, 'dist-test', 'suite.js'),
  launchArgs: ['--disable-extensions', '--disable-workspace-trust', '--skip-welcome'],
});
