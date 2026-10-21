// Compares the precision corpus (ADR 0002): renders each captured view headless and compares it
// with its screenshot, widget by widget. Local only: it needs the game and the screenshots.
//
//   $env:ETCH_CORPUS_PATH = 'D:\etch-corpus'     # the local corpus folder (screenshots)
//   $env:ETCH_GAME_PATH = '...\Europa Universalis IV'   # optional; else found through Steam
//   pnpm --filter @etch/compare compare [--playset ID] [--view ID] [--resolution WxH] [--gpu]
//
// Filters take several values separated by commas. Results go to the local corpus folder:
// renders/, diffs/ and reports/ (reports/README.md is the summary). The exit code is 1 when a
// gating capture of the run fails or cannot be compared.
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { localCorpusFolder } from '@etch/core/corpus';
import { RESULT_FOLDERS, runCorpus } from './run.ts';

const repository = join(import.meta.dirname, '..', '..', '..');
const { values } = parseArgs({
  options: {
    playset: { type: 'string', multiple: true },
    view: { type: 'string', multiple: true },
    resolution: { type: 'string', multiple: true },
    gpu: { type: 'boolean', default: false },
  },
});
const list = (items: string[] | undefined): string[] =>
  (items ?? [])
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean);

const localFolder = localCorpusFolder(process.env, repository);
if (localFolder === undefined) {
  console.error('Set ETCH_CORPUS_PATH to the local corpus folder (corpus/README.md).');
  process.exit(2);
}
const gamePath = process.env['ETCH_GAME_PATH']?.trim();
const result = await runCorpus({
  corpusFolder: join(repository, 'corpus'),
  localFolder,
  gamePath: gamePath === undefined || gamePath === '' ? undefined : gamePath,
  playsets: list(values.playset),
  views: list(values.view),
  resolutions: list(values.resolution),
  gpu: values.gpu,
  log: (line) => {
    console.log(line);
  },
});

const compared = result.outcomes.filter((o) => o.kind === 'compared');
console.log(
  `${String(compared.filter((o) => o.comparison.passed).length)} of ${String(result.outcomes.length)} ` +
    `captures pass; ${String(result.outcomes.length - compared.length)} not compared.` +
    (result.gpu === undefined ? '' : ` Rendered with ${result.gpu}.`),
);
console.log(`Reports: ${join(localFolder, RESULT_FOLDERS.reports, 'README.md')}`);
process.exit(result.passed ? 0 : 1);
