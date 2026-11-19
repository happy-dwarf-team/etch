/**
 * The capture driver's commands (`cli.ts`, which describes them): `plan`, `run`, `crawl` and
 * `survey-manifest`, apart from the entry point so that they can be tested without a real lab.
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
import { away, list, lockMinutes, parseArgs, required, size } from './cli-args.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..', '..', '..', '..', '..');

const EU4 = 'Paradox Interactive/Europa Universalis IV';
const DEFAULTS = {
  game: 'C:/Program Files (x86)/Steam/steamapps/common/Europa Universalis IV',
  workshop: 'C:/Program Files (x86)/Steam/steamapps/workshop/content/236850',
  playerProfile: join(homedir(), 'Documents', ...EU4.split('/')),
};

/** The process environment the commands read (`ETCH_CORPUS_PATH`, `ETCH_GAME_PATH`). */
export type CommandEnv = Readonly<Record<string, string | undefined>>;

/**
 * Ctrl+C ends Node before any `finally` runs, and the clip and the lock outlive the process:
 * release both on the way out. A game still running is closed with `game.ps1 -Action Stop`
 * (corpus/README.md). The returned function takes the handlers off again, once the lock is
 * released.
 */
function releaseOnSignal(script: GameScript, lock: GameLock): () => void {
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
  const signals = ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const;
  for (const signal of signals) process.once(signal, handler);
  return () => {
    for (const signal of signals) process.off(signal, handler);
  };
}

/**
 * Runs one command of the driver with its arguments (`process.argv` without Node and the script)
 * and gives the process's exit code: 1 when a run or crawl stopped or left views out.
 */
export async function runCommand(argv: readonly string[], env: CommandEnv): Promise<number> {
  const { command, flags } = parseArgs(argv);
  if (command === 'crawl' || command === 'survey-manifest') return survey(command, flags, env);
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
    return 0;
  }
  if (command !== 'run') {
    console.log('Usage: cli.ts plan|run [options]; see the top of cli.ts and corpus/README.md.');
    return 0;
  }

  const localDir = localCorpusFolder(env, repositoryRoot);
  if (localDir === undefined) throw new Error('Set ETCH_CORPUS_PATH to the local corpus folder.');
  const lab = resolve(required(flags, 'lab'));
  const hostDir = resolve(required(flags, 'host'));
  const playerProfile = resolve(flags.get('player-profile') ?? DEFAULTS.playerProfile);
  const print = (line: string): void => {
    console.log(line);
  };
  const script: GameScript = { lab, hostDir };
  const minutes = lockMinutes(flags);
  const prettier = await import('prettier');
  // The lab's game lock for the whole run, so that no other session starts a game between this
  // run's games (corpus/README.md); a run started under a batch's lock keeps that one.
  const report = await withGameLock(
    script,
    `etch corpus run (PID ${String(process.pid)})`,
    minutes,
    (lock) => {
      print(
        lock.inherited
          ? `game lock: the batch's, until ${lock.expiresAt.toISOString()}`
          : `game lock: held until ${lock.expiresAt.toISOString()} at the latest`,
      );
      const unhook = releaseOnSignal(script, lock);
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
        ...(flags.has('max-starts') ? { maxStarts: Number(flags.get('max-starts')) } : {}),
        print,
      }).finally(unhook);
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
  return report.stopped !== undefined || failed > 0 || report.notTried.length > 0 ? 1 : 0;
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
async function survey(
  command: string,
  flags: Map<string, string>,
  env: CommandEnv,
): Promise<number> {
  const surveyFile = resolve(
    flags.get('survey') ?? join(repositoryRoot, 'coverage', 'survey.json'),
  );
  const config = readSurveyConfig(await readFile(surveyFile, 'utf8'));
  const { manifest } = await readCorpusManifest(join(repositoryRoot, 'corpus', 'manifest.json'));
  if (manifest === undefined) throw new Error('corpus/manifest.json has problems.');
  const localDir = localCorpusFolder(env, repositoryRoot);
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
        env['ETCH_GAME_PATH'] ?? DEFAULTS.game,
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
    return parsed.problems.length > 0 ? 1 : 0;
  }

  const lab = resolve(required(flags, 'lab'));
  const hostDir = resolve(required(flags, 'host'));
  const playerProfile = resolve(flags.get('player-profile') ?? DEFAULTS.playerProfile);
  const script: GameScript = { lab, hostDir };
  const minutes = lockMinutes(flags);
  const wanted = list(flags.get('playset'));
  const starts = list(flags.get('start')) ?? config.starts;
  const resolution = manifest.resolutions.find((r) => resolutionKey(r) === config.resolution);
  if (resolution === undefined)
    throw new Error(`The corpus has no resolution ${config.resolution}.`);
  const print = (line: string): void => {
    console.log(line);
  };
  // Every crawl of the run, under its lock.
  const crawlAll = async (lock: GameLock): Promise<number> => {
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
        if (result.stopped !== undefined) return 1;
      }
    }
    return 0;
  };
  return withGameLock(
    script,
    `etch coverage crawl (PID ${String(process.pid)})`,
    minutes,
    async (lock) => {
      print(`game lock until ${lock.expiresAt.toISOString()}`);
      const unhook = releaseOnSignal(script, lock);
      try {
        return await crawlAll(lock);
      } finally {
        unhook();
      }
    },
  );
}
