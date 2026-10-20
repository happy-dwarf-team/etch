// Bundles the renderer for the webview: one IIFE script exposing `EtchRenderer`.
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/renderer.js',
  bundle: true,
  format: 'iife',
  globalName: 'EtchRenderer',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: true,
  logLevel: 'warning',
});
