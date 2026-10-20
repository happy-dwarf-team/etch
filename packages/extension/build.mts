// Bundles the extension and its VS Code test suite. Workspace packages are
// bundled in, so the VSIX has no node_modules and no runtime dependencies.
import * as esbuild from 'esbuild';

const common = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'warning',
} satisfies esbuild.BuildOptions;

await Promise.all([
  esbuild.build({ ...common, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js' }),
  esbuild.build({ ...common, entryPoints: ['test/suite.ts'], outfile: 'dist-test/suite.js' }),
]);
