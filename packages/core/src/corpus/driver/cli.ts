/**
 * The capture driver's command line (etch#42). Run from the repository root with Node 22.18 or
 * newer, which runs TypeScript directly:
 *
 *   node packages/core/src/corpus/driver/cli.ts plan [filters]
 *   node packages/core/src/corpus/driver/cli.ts run --lab <lab> --host <dir> --monitor 3440x1440
 *     --settings-baseline <settings.txt> [--records <dir>] [--manifest <file>] [--lock-minutes 240]
 *     [filters]
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
 * unconfirmed sizes too). corpus/README.md, "The capture driver", describes the procedure.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localCorpusFolder, readCorpusManifest } from '../files.ts';
import { parseCorpusManifest, resolutionKey } from '../manifest.ts';
import { readSurveyConfig, surveyManifest } from '../survey.ts';
import { readCrawlFile, runCrawl, type CrawlFile } from './crawl.ts';
import { describeSession, planCaptures, type PlanFilter } from './plan.ts';
import {
  gameScript,
  interruptHandler,
  scriptArgs,
  withGameLock,
  type GameLock,
  type GameScript,
} from './game-script.ts';
import { runCaptures } from './run.ts';
import { connectTongs } from './tongs.ts';
import { DEFAULT_AWAY, type AwayPoint } from './view.ts';
import type { RecipeStart } from '../manifest.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..', '..', '..', '..', '..');

const EU4 = 'Paradox Interactive/Europa Universalis IV';
const DEFAULTS = {
  game: 'C:/Program Files (x86)/Steam/steamapps/common/Europa Universalis IV',
  workshop: 'C:/Program Files (x86)/Steam/steamapps/workshop/content/236850',
  playerProfile: join(homedir(), 'Documents', ...EU4.split('/')),
};

function parseArgs(argv: readonly string[]): { command: string; flags: Map<string, string> } {
  const [command = 'help', ...rest] = argv;
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] ?? '';
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) flags.set(arg.slice(2), 'true');
    else {
      flags.set(arg.slice(2), next);
      i++;
    }
  }
  return { command, flags };
}

function list(value: string | undefined): string[] | undefined {
  return value === undefined
    ? undefined
    : value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
}

function size(value: string, what: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (match === null) throw new Error(`${what} must be WxH, such as 3440x1440.`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function required(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value === 'true') throw new Error(`--${name} is required.`);
  return value;
}

/**
 * Ctrl+C ends Node before any `finally` runs, and the clip and the lock outlive the process:
 * release both on the way out. A game still running is closed with `game.ps1 -Action Stop`
 * (corpus/README.md).
 */
function releaseOnSignal(script: GameScript, lock: GameLock): void {
  const handler = interruptHandler({
    releaseMouse: () => {
      execFileSync('pwsh', scriptArgs(script, ['-Action', 'Release']), { windowsHide: true });
    },
    lock: () => lock,
    exit: (code) => process.exit(code),
    print: (line) => {
      console.error(line);
    },
  });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) process.once(signal, handler);
}

/** `--away-menu x,y` as fractions of the client area, `--away-save` as a widget pattern. */
function away(flags: Map<string, string>): Record<RecipeStart, AwayPoint> {
  const menu = flags.get('away-menu');
  let fraction = DEFAULT_AWAY['main-menu'];
  if (menu !== undefined) {
    const [x, y] = menu.split(',').map(Number);
    if (x === undefined || y === undefined || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) {
      throw new Error('--away-menu must be two fractions of the client area, such as 1,1.');
    }
    fraction = { fraction: { x, y } };
  }
  const save = flags.get('away-save');
  return { 'main-menu': fraction, save: save !== undefined ? { widget: save } : DEFAULT_AWAY.save };
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === 'crawl' || command === 'survey-manifest') {
    await survey(command, flags);
    return;
  }
  const manifestFile = resolve(
    flags.get('manifest') ?? join(repositoryRoot, 'corpus', 'manifest.json'),
  );
  const { manifest, problems } = await readCorpusManifest(manifestFile);
  if (manifest === undefined) {
    throw new Error(
      `The manifest has problems: ${problems.map((p) => `${p.at}: ${p.message}`).join('; ')}`,
    );
  }
  const filter: PlanFilter = {
    gating: flags.get('all') !== 'true',
    ...(flags.has('playset') ? { playsets: list(flags.get('playset')) ?? [] } : {}),
    ...(flags.has('resolution') ? { resolutions: list(flags.get('resolution')) ?? [] } : {}),
    ...(flags.has('view') ? { views: list(flags.get('view')) ?? [] } : {}),
  };
  const plan = planCaptures(manifest, filter);

  if (command === 'plan') {
    for (const session of plan.sessions) console.log(describeSession(session));
    for (const s of plan.skipped)
      console.log(`skipped ${s.playset} ${s.resolution} ${s.view}: ${s.reason}`);
    return;
  }
  if (command !== 'run') {
    console.log('Usage: cli.ts plan|run [options]; see the top of cli.ts and corpus/README.md.');
    return;
  }

  const localDir = localCorpusFolder(process.env, repositoryRoot);
  if (localDir === undefined) throw new Error('Set ETCH_CORPUS_PATH to the local corpus folder.');
  const lab = resolve(required(flags, 'lab'));
  const hostDir = resolve(required(flags, 'host'));
  const playerProfile = resolve(flags.get('player-profile') ?? DEFAULTS.playerProfile);
  const print = (line: string): void => {
    console.log(line);
  };
  const script: GameScript = { lab, hostDir };
  const lockMinutes = Number(flags.get('lock-minutes') ?? '240');
  if (!Number.isInteger(lockMinutes) || lockMinutes < 1 || lockMinutes > 240) {
    throw new Error('--lock-minutes must be a whole number of minutes from 1 to 240.');
  }
  const prettier = await import('prettier');
  // The lab's game lock for the whole run, so that no other session starts a game between this
  // run's games (corpus/README.md); a run started under a batch's lock keeps that one.
  const report = await withGameLock(
    script,
    `etch corpus run (PID ${String(process.pid)})`,
    lockMinutes,
    (lock) => {
      print(
        lock.inherited
          ? `game lock: the batch's, until ${lock.expiresAt.toISOString()}`
          : `game lock: held until ${lock.expiresAt.toISOString()} at the latest`,
      );
      releaseOnSignal(script, lock);
      return runCaptures({
        manifest,
        sessions: plan.sessions,
        hostDir,
        sources: {
          settingsBaseline: resolve(required(flags, 'settings-baseline')),
          workshop: resolve(flags.get('workshop') ?? DEFAULTS.workshop),
          saves: resolve(flags.get('saves') ?? join(playerProfile, 'save games')),
        },
        monitor: size(required(flags, 'monitor'), '--monitor'),
        recordsDir: resolve(flags.get('records') ?? join(repositoryRoot, 'corpus')),
        localDir,
        playerProfile,
        launcher: gameScript(script),
        lockExpiresAt: lock.expiresAt,
        connect: () => connectTongs(),
        format: async (json, file) =>
          prettier.format(json, { ...(await prettier.resolveConfig(file)), filepath: file }),
        away: away(flags),
        ...(flags.has('hold') ? { holdMs: Number(flags.get('hold')) * 60_000 } : {}),
        print,
      });
    },
  );
  const views = report.sessions.flatMap((s) => s.views);
  const captured = views.filter((v) => v.ok).length;
  // A view given back when the mouse was released is taken again by the next start.
  const failed = views.filter((v) => !v.ok && v.released !== true).length;
  const released = views.filter((v) => !v.ok && v.released === true).length;
  console.log(
    `run ${report.runId}: ${String(captured)} captured, ${String(failed)} failed, ${String(report.notTried.length)} not tried${released > 0 ? `, ${String(released)} given back when the mouse was released` : ''}${report.stopped !== undefined ? `; STOPPED: ${report.stopped}` : ''}`,
  );
  console.log(`report: ${join(localDir, 'runs', report.runId, 'report.json')}`);
  if (report.stopped !== undefined || failed > 0 || report.notTried.length > 0) {
    process.exitCode = 1;
  }
}

/**
 * The `.gui` file of each window name that a window kind defines, by name in lower case, from the
 * `interface/` folders of the game and the mods in load order (a later one wins): for the survey
 * manifest's `files`, which the comparison only prefers.
 */
async function windowFiles(folders: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const definition =
    /(?:windowType|eu3dialogtype|containerWindowType)\s*=\s*\{\s*name\s*=\s*"?([^"\s}]+)/gi;
  for (const folder of folders) {
    let names: string[];
    try {
      names = await readdir(join(folder, 'interface'));
    } catch {
      continue;
    }
    for (const name of names.filter((n) => n.toLowerCase().endsWith('.gui'))) {
      const text = await readFile(join(folder, 'interface', name), 'latin1');
      for (const match of text.matchAll(definition)) {
        out.set((match[1] ?? '').toLowerCase(), `interface/${name}`);
      }
    }
  }
  return out;
}

/** `crawl` and `survey-manifest`: the survey's side of the driver (docs/coverage.md). */
async function survey(command: string, flags: Map<string, string>): Promise<void> {
  const surveyFile = resolve(
    flags.get('survey') ?? join(repositoryRoot, 'coverage', 'survey.json'),
  );
  const config = readSurveyConfig(await readFile(surveyFile, 'utf8'));
  const { manifest } = await readCorpusManifest(join(repositoryRoot, 'corpus', 'manifest.json'));
  if (manifest === undefined) throw new Error('corpus/manifest.json has problems.');
  const localDir = localCorpusFolder(process.env, repositoryRoot);
  if (localDir === undefined) throw new Error("Set ETCH_CORPUS_PATH to the survey's local folder.");
  const crawlFile = (playset: string, start: string): string =>
    join(localDir, 'crawl', `${playset}-${config.resolution}-${start}.json`);

  if (command === 'survey-manifest') {
    const crawls: CrawlFile[] = [];
    for (const p of config.playsets.filter((x) => x.crawl)) {
      for (const start of config.starts) {
        const crawl = await readCrawlFile(crawlFile(p.id, start));
        if (crawl === undefined) console.log(`no crawl of ${p.id} from ${start}`);
        else crawls.push(crawl);
      }
    }
    const files = new Map<string, Map<string, string>>();
    for (const p of config.playsets) {
      const playset = p.playset ?? manifest.playsets.find((c) => c.id === p.id);
      const folders = [
        process.env['ETCH_GAME_PATH'] ?? DEFAULTS.game,
        ...(playset?.mods ?? []).map((m) =>
          join(flags.get('workshop') ?? DEFAULTS.workshop, m.workshopId ?? ''),
        ),
      ];
      files.set(p.id, await windowFiles(folders));
    }
    const out = surveyManifest(manifest, config, crawls, (playset, window) =>
      files.get(playset)?.get(window.toLowerCase()),
    );
    const parsed = parseCorpusManifest(JSON.parse(JSON.stringify(out)) as unknown);
    for (const p of parsed.problems) console.log(`manifest problem at ${p.at}: ${p.message}`);
    await mkdir(localDir, { recursive: true });
    await writeFile(join(localDir, 'manifest.json'), `${JSON.stringify(out, null, 1)}\n`);
    console.log(
      `${String(out.windows.length)} views in ${join(localDir, 'manifest.json')}` +
        out.playsets.map((p) => `; ${p.id}: ${String(p.windows.length)}`).join(''),
    );
    if (parsed.problems.length > 0) process.exitCode = 1;
    return;
  }

  const lab = resolve(required(flags, 'lab'));
  const hostDir = resolve(required(flags, 'host'));
  const playerProfile = resolve(flags.get('player-profile') ?? DEFAULTS.playerProfile);
  const script: GameScript = { lab, hostDir };
  const lockMinutes = Number(flags.get('lock-minutes') ?? '240');
  const wanted = list(flags.get('playset'));
  const starts = list(flags.get('start')) ?? config.starts;
  const resolution = manifest.resolutions.find((r) => resolutionKey(r) === config.resolution);
  if (resolution === undefined)
    throw new Error(`The corpus has no resolution ${config.resolution}.`);
  const print = (line: string): void => {
    console.log(line);
  };
  await withGameLock(
    script,
    `etch coverage crawl (PID ${String(process.pid)})`,
    lockMinutes,
    async (lock) => {
      print(`game lock until ${lock.expiresAt.toISOString()}`);
      releaseOnSignal(script, lock);
      for (const p of config.playsets) {
        if (!p.crawl || (wanted !== undefined && !wanted.includes(p.id))) continue;
        const playset = p.playset ?? manifest.playsets.find((c) => c.id === p.id);
        if (playset === undefined) throw new Error(`No playset "${p.id}".`);
        for (const start of starts) {
          if (start !== 'save' && start !== 'main-menu') throw new Error(`No start "${start}".`);
          const result = await runCrawl({
            manifest,
            session: {
              playset,
              resolution,
              start,
              ...(start === 'save' && playset.save !== undefined ? { save: playset.save } : {}),
              views: [],
            },
            rules: {
              ...config.crawl,
              ...(flags.has('session-minutes')
                ? { sessionMinutes: Number(flags.get('session-minutes')) }
                : {}),
            },
            file: crawlFile(p.id, start),
            maxStarts: Number(flags.get('max-starts') ?? '20'),
            hostDir,
            sources: {
              settingsBaseline: resolve(required(flags, 'settings-baseline')),
              workshop: resolve(flags.get('workshop') ?? DEFAULTS.workshop),
              saves: resolve(flags.get('saves') ?? join(playerProfile, 'save games')),
            },
            monitor: size(required(flags, 'monitor'), '--monitor'),
            recordsDir: localDir,
            localDir,
            playerProfile,
            launcher: gameScript(script),
            lockExpiresAt: lock.expiresAt,
            connect: () => connectTongs(),
            format: (json) => Promise.resolve(json),
            away: away(flags),
            print,
          });
          print(
            `crawl ${p.id} ${start}: ${result.crawl.done ? 'done' : 'not done'}, ${String(result.crawl.states.length)} views${result.stopped !== undefined ? `; STOPPED: ${result.stopped}` : ''}`,
          );
          if (result.stopped !== undefined) {
            process.exitCode = 1;
            return;
          }
        }
      }
    },
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
