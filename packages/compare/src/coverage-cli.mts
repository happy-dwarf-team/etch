// The coverage report of the survey (docs/coverage.md). Local only: it needs the game, the
// survey's local folder and, for the pixels, a `compare --corpus <folder>` run over it first.
//
//   $env:ETCH_CORPUS_PATH = '...\work\etch-coverage-survey'
//   pnpm --filter @etch/compare coverage [--playset ID] [--out FILE]
//
// Writes `coverage.json` and `coverage.md` into the survey folder; `--out` writes the Markdown
// summary elsewhere too (the repository's docs/coverage-results.md).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { localCorpusFolder } from '@etch/core/corpus';
import { runCoverage } from './coverage.ts';
import { coverageMarkdown } from './coverage-report.ts';

const repository = join(import.meta.dirname, '..', '..', '..');
const { values } = parseArgs({
  options: {
    playset: { type: 'string', multiple: true },
    out: { type: 'string' },
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
  await writeFile(values.out, markdown);
}
console.log(`${String(result.views.length)} views measured; ${join(folder, 'coverage.md')}`);
