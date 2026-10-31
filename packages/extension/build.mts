// Bundles the extension, the preview's webview script and the VS Code test suite, and copies the
// window profiles Etch ships and their JSON Schema (ADR 0006). Workspace packages are bundled in,
// so the VSIX has no node_modules and no runtime dependencies. The build's stamp (version, commit,
// time) goes into the bundle and into dist/build.json, which the running extension compares with
// its own (src/build-stamp.ts).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as esbuild from 'esbuild';

const git = (...args: string[]): string =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
function commit(): string {
  try {
    const sha = git('rev-parse', '--short=7', 'HEAD');
    return git('status', '--porcelain', '--untracked-files=no') === '' ? sha : `${sha}-dirty`;
  } catch {
    return 'unknown';
  }
}
const stamp = {
  version: (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version,
  commit: commit(),
  builtAt: new Date().toISOString(),
};

const common = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'warning',
  define: { ETCH_BUILD: JSON.stringify(stamp) },
} satisfies esbuild.BuildOptions;

await Promise.all([
  esbuild.build({ ...common, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js' }),
  esbuild.build({
    entryPoints: ['webview/main.ts'],
    outfile: 'dist/webview.js',
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    sourcemap: true,
    logLevel: 'warning',
  }),
  esbuild.build({ ...common, entryPoints: ['test/suite.ts'], outfile: 'dist-test/suite.js' }),
]);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/build.json', `${JSON.stringify(stamp, undefined, 2)}\n`);
rmSync('dist/profiles', { recursive: true, force: true });
cpSync('../../profiles', 'dist/profiles', { recursive: true });
