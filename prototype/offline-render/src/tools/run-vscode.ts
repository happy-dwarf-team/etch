// PROTOTYPE (etch#9): download VS Code stable into .vscode-test and run the suite in it. Throwaway.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

(async () => {
  const root = path.resolve(__dirname, '..');
  const cachePath = path.join(root, '.vscode-test');
  const out = path.join(root, 'work', 'run-' + new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(out, { recursive: true });
  const exe = await downloadAndUnzipVSCode({ version: process.env.ETCH_VSCODE ?? 'stable', cachePath });
  const ud = path.join(cachePath, 'user-data');
  fs.mkdirSync(path.join(ud, 'User'), { recursive: true });
  // .gui/.gfx are Windows-1252; the unsaved buffer must decode them that way
  fs.writeFileSync(path.join(ud, 'User', 'settings.json'), JSON.stringify({ 'files.encoding': 'windows1252', 'files.autoGuessEncoding': false, 'workbench.startupEditor': 'none', 'window.restoreWindows': 'none', 'security.workspace.trust.enabled': false }, null, 1));
  console.log('VS Code:', exe, '\nout:', out);
  await runTests({
    vscodeExecutablePath: exe, extensionDevelopmentPath: root, extensionTestsPath: path.join(root, 'out', 'suite.js'),
    launchArgs: ['--disable-extensions', '--user-data-dir', ud, out],
    extensionTestsEnv: { ETCH_OUT: out },
  });
  console.log('results in', out);
})().catch(e => { console.error(e); process.exit(1); });
