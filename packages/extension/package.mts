// Packages the win32-x64 VSIX into dist/ (ADR 0004). The extension is bundled
// by build.mts, so vsce does not look at dependencies.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createVSIX } from '@vscode/vsce';

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
  name: string;
  version: string;
};
const target = 'win32-x64';

copyFileSync('../../LICENSE', 'LICENSE');
mkdirSync('dist', { recursive: true });
await createVSIX({
  target,
  dependencies: false,
  packagePath: `dist/${manifest.name}-${target}-${manifest.version}.vsix`,
});
