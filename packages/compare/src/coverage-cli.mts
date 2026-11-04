// The coverage report of the survey (docs/coverage.md). Local only: it needs the game, the
// survey's local folder and, for the pixels, a `compare --corpus <folder>` run over it first.
//
//   $env:ETCH_CORPUS_PATH = '...\work\etch-coverage-survey'
//   pnpm --filter @etch/compare coverage [--playset ID] [--out FILE] [--inventory FILE]
//
// Writes `coverage.json` and `coverage.md` into the survey folder; `--out` writes the Markdown
// summary elsewhere too (the repository's docs/coverage-results.md), `--inventory` the views with
// their recipes and every top-level window's status (the repository's coverage/inventory.json).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { localCorpusFolder, type CorpusManifest } from '@etch/core/corpus';
import { runCoverage } from './coverage.ts';
import { coverageMarkdown } from './coverage-report.ts';

const repository = join(import.meta.dirname, '..', '..', '..');
/** The hand-written part of the summary `--out` keeps: the run on other countries (etch#258). */
const KEPT = { start: '<!-- other countries: start -->', end: '<!-- other countries: end -->' };
const { values } = parseArgs({
  options: {
    playset: { type: 'string', multiple: true },
    out: { type: 'string' },
    inventory: { type: 'string' },
  },
});
const folder = localCorpusFolder(process.env, repository);
if (folder === undefined) {
  console.error("Set ETCH_CORPUS_PATH to the survey's local folder (docs/coverage.md).");
  process.exit(2);
}
const gamePath = process.env['ETCH_GAME_PATH']?.trim();
const result = await runCoverage({
  surveyFolder: folder,
  profilesFolder: join(repository, 'profiles'),
  gamePath: gamePath === undefined || gamePath === '' ? undefined : gamePath,
  ...(values.playset === undefined
    ? {}
    : { playsets: values.playset.flatMap((p) => p.split(',')).map((p) => p.trim()) }),
  log: (line) => {
    console.log(line);
  },
});
await writeFile(join(folder, 'coverage.json'), `${JSON.stringify(result, null, 1)}\n`);
const markdown = coverageMarkdown(result);
await writeFile(join(folder, 'coverage.md'), markdown);
if (values.out !== undefined) {
  await mkdir(dirname(values.out), { recursive: true });
  const before = await readFile(values.out, 'utf8').catch(() => '');
  const start = before.indexOf(KEPT.start);
  const end = before.indexOf(KEPT.end);
  await writeFile(
    values.out,
    start < 0 || end < 0
      ? markdown
      : markdown.replace(
          '## What differs',
          () => `${before.slice(start, end + KEPT.end.length)}\n\n## What differs`,
        ),
  );
}
if (values.inventory !== undefined) {
  const manifest = JSON.parse(
    await readFile(join(folder, 'manifest.json'), 'utf8'),
  ) as CorpusManifest;
  const inventory = {
    formatVersion: 1,
    game: manifest.game,
    tongs: manifest.tongs,
    playsets: manifest.playsets.map((p) => ({
      id: p.id,
      mods: p.mods.map((m) => ({ name: m.name, workshopId: m.workshopId, sha256: m.sha256 })),
      views: manifest.windows
        .filter((w) => p.windows.includes(w.id))
        .flatMap((w) => w.views)
        .map((v) => ({
          id: v.id,
          roots: v.roots,
          from: v.recipe.from,
          steps: v.recipe.steps,
          ...(v.note === undefined ? {} : { note: v.note }),
        })),
      windows: result.windows
        .filter((w) => w.playset === p.id)
        .map((w) => ({
          name: w.name,
          kind: w.kind,
          file: w.file,
          status: w.status,
          ...(w.views.length === 0 ? {} : { views: w.views }),
          confidence: w.widgets === 0 ? 1 : Math.round((1000 * w.confirmed) / w.widgets) / 1000,
        })),
    })),
  };
  await mkdir(dirname(values.inventory), { recursive: true });
  await writeFile(values.inventory, `${JSON.stringify(inventory, null, 1)}\n`);
}
console.log(`${String(result.views.length)} views measured; ${join(folder, 'coverage.md')}`);
