// Packages the win32-x64 VSIX into dist/ (ADR 0004). The extension is bundled
// by build.mts and the game-side builds are staged under game/ by stage-game.mts,
// so vsce does not look at dependencies.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createVSIX, listFiles, PackageManager } from '@vscode/vsce';

const readVersion = (file: string) =>
  (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version;

// release-please bumps both; one version for the whole repository (ADR 0004).
const version = readVersion('package.json');
const workspaceVersion = readVersion('../../package.json');
if (version !== workspaceVersion) {
  throw new Error(`extension version ${version} differs from the workspace's ${workspaceVersion}`);
}

const target = 'win32-x64';

copyFileSync('../../LICENSE', 'LICENSE');
// release-please writes CHANGELOG.md at the root with the first release.
const hasChangelog = existsSync('../../CHANGELOG.md');
if (hasChangelog) {
  copyFileSync('../../CHANGELOG.md', 'CHANGELOG.md');
}

// The same file goes to the GitHub release and both stores, so what it holds
// is checked on every pull request rather than at publish time.
const game = JSON.parse(readFileSync('game/manifest.json', 'utf8')) as {
  files: { path: string }[];
};
const expected = [
  'dist/extension.js',
  'dist/webview.js',
  'media/icon.png',
  'package.json',
  'README.md',
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
  ...(hasChangelog ? ['CHANGELOG.md'] : []),
  'game/manifest.json',
  ...game.files.map((file) => `game/${file.path}`),
].sort();
const files = (await listFiles({ packageManager: PackageManager.None })).sort();
if (files.join() !== expected.join()) {
  throw new Error(`the VSIX would hold ${files.join(', ')}, not ${expected.join(', ')}`);
}

mkdirSync('dist', { recursive: true });
await createVSIX({
  target,
  dependencies: false,
  packagePath: `dist/etch-${target}-${version}.vsix`,
});
