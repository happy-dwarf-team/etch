// Packages the win32-x64 VSIX into dist/ (ADR 0004). The extension is bundled
// by build.mts, so vsce does not look at dependencies.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createVSIX } from '@vscode/vsce';

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
if (existsSync('../../CHANGELOG.md')) {
  copyFileSync('../../CHANGELOG.md', 'CHANGELOG.md');
}
mkdirSync('dist', { recursive: true });
await createVSIX({
  target,
  dependencies: false,
  packagePath: `dist/etch-${target}-${version}.vsix`,
});
