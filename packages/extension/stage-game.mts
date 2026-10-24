// The pin and notices checks (ADR 0004, etch#46): downloads every pinned build, checks its
// SHA-256 and licences, and stages the files the VSIX carries under game/ (the game host install's
// layout, with game/manifest.json) together with the game plugin's build, then writes
// THIRD-PARTY-NOTICES.md. package.mts packages what this leaves behind.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  PLUGIN_FOLDER,
  clashingPaths,
  gameManifest,
  parsePins,
  readZip,
  renderNotices,
  sha256Of,
  takeFiles,
  type GameFile,
  type PinnedBuild,
} from './game-builds.mts';

const PINS_FILE = '../../pins/game-builds.json';
// Downloads are kept by hash, so a pin change fetches the new archive and nothing is trusted
// without its hash being checked again.
const CACHE = 'node_modules/.cache/etch-pins';
// etch#45: the plugin's CMake build installs an Anvil plugin folder here.
const PLUGIN_SOURCE = '../../plugin/CMakeLists.txt';
const PLUGIN_BUILD = '../../plugin/dist/etch';

const parsed = parsePins(JSON.parse(readFileSync(PINS_FILE, 'utf8')) as unknown);
if (parsed.pins === undefined) {
  const lines = parsed.problems.map((p) => `  ${p.at === '' ? '(root)' : p.at}: ${p.message}`);
  throw new Error(`pins/game-builds.json:\n${lines.join('\n')}`);
}
const pins = parsed.pins;

// Etch ships no runtime dependencies (ADR 0004); a dependency would need its own notices entry.
const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string;
  dependencies?: Record<string, string>;
};
if (Object.keys(manifest.dependencies ?? {}).length > 0) {
  throw new Error('the extension has runtime dependencies, which the notices do not cover');
}

async function archiveOf(build: PinnedBuild): Promise<Buffer> {
  const cached = join(CACHE, `${build.sha256}.zip`);
  if (existsSync(cached)) {
    const data = readFileSync(cached);
    if (sha256Of(data) === build.sha256) return data;
  }
  const response = await fetch(build.url);
  if (!response.ok) {
    throw new Error(`${build.id}: ${build.url} answered ${String(response.status)}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const actual = sha256Of(data);
  if (actual !== build.sha256) {
    throw new Error(
      `${build.id}: ${build.url} has SHA-256 ${actual}, not the pinned ${build.sha256}`,
    );
  }
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, data);
  return data;
}

function filesUnder(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)).replaceAll('\\', '/'));
}

const files: GameFile[] = [];
const problems: string[] = [];
for (const build of pins.builds) {
  const taken = takeFiles(build, readZip(await archiveOf(build)));
  files.push(...taken.files);
  problems.push(...taken.problems);
}

// Once the plugin's sources exist its build is required; before etch#45 the slot stays empty.
const hasPlugin = existsSync(PLUGIN_SOURCE);
if (hasPlugin) {
  if (!existsSync(join(PLUGIN_BUILD, 'plugin.toml'))) {
    problems.push(
      `etch: no plugin build at plugin/dist/etch/ (build and install the plugin first)`,
    );
  } else {
    for (const path of filesUnder(PLUGIN_BUILD)) {
      files.push({
        path: `${PLUGIN_FOLDER}${path}`,
        build: 'etch',
        data: readFileSync(join(PLUGIN_BUILD, path)),
      });
    }
  }
}

problems.push(...clashingPaths(files).map((clash) => `two builds install ${clash}`));
if (problems.length > 0) {
  throw new Error(`the game-side builds cannot be packaged:\n  ${problems.join('\n  ')}`);
}

rmSync('game', { recursive: true, force: true });
for (const file of files) {
  const target = join('game', file.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, file.data);
}
writeFileSync('game/manifest.json', `${JSON.stringify(gameManifest(pins, files), null, 2)}\n`);
writeFileSync('THIRD-PARTY-NOTICES.md', renderNotices(pins, manifest.version, hasPlugin));

const builds = [...pins.builds.map((b) => `${b.name} ${b.tag}`), ...(hasPlugin ? ['plugin'] : [])];
console.log(`game/: ${String(files.length)} files from ${builds.join(', ')}; notices written`);
