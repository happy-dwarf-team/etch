// PROTOTYPE (etch#9) build: extension host bundle, webview bundle, Node tools.
import * as esbuild from 'esbuild';
const common = { bundle: true, sourcemap: true, logLevel: 'warning', target: 'es2022' };
await Promise.all([
  esbuild.build({ ...common, platform: 'node', format: 'cjs', external: ['vscode'], entryPoints: { extension: 'src/extension/extension.ts', suite: 'src/extension/suite.ts' }, outdir: 'out' }),
  esbuild.build({ ...common, platform: 'browser', format: 'iife', entryPoints: { webview: 'src/renderer/main.ts' }, outdir: 'out' }),
  esbuild.build({ ...common, platform: 'node', format: 'cjs', entryPoints: { dump: 'src/tools/dump.ts', compare: 'src/tools/compare.ts', 'run-vscode': 'src/tools/run-vscode.ts' }, outdir: 'out', external: ['@vscode/test-electron', 'pngjs'] }),
]);
