/**
 * The capture driver's command line (etch#42). Run from the repository root with Node 22.18 or
 * newer, which runs TypeScript directly:
 *
 *   node packages/core/src/corpus/driver/cli.ts plan [filters]
 *   node packages/core/src/corpus/driver/cli.ts run --lab <lab> --host <dir> --monitor 3440x1440
 *     --settings-baseline <settings.txt> [--records <dir>] [--manifest <file>] [--lock-minutes 240]
 *     [--max-starts 2] [filters]
 *
 * The coverage survey (docs/coverage.md), with ETCH_CORPUS_PATH set to the survey's local folder:
 *
 *   node packages/core/src/corpus/driver/cli.ts crawl --lab <lab> --host <dir> --monitor 3440x1440
 *     --settings-baseline <settings.txt> [--playset a,b] [--start save,main-menu] [--max-starts 20]
 *   node packages/core/src/corpus/driver/cli.ts survey-manifest
 *
 * `survey-manifest` writes the views the crawls found as the survey folder's `manifest.json`,
 * which `run --manifest <survey>/manifest.json --records <survey> --all` captures.
 *
 * Filters: --playset a,b  --resolution 1920x1080,…  --view a,b  --all (report playsets and
 * unconfirmed sizes too). corpus/README.md, "The capture driver", describes the procedure; the
 * commands are in `command.ts`.
 */
import { runCommand } from './command.ts';

runCommand(process.argv.slice(2), process.env).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
