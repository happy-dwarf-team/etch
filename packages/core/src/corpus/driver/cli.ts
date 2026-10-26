/**
 * The capture driver's command line (etch#42). Run from the repository root with Node 22.18 or
 * newer, which runs TypeScript directly:
 *
 *   node packages/core/src/corpus/driver/cli.ts plan [filters]
 *   node packages/core/src/corpus/driver/cli.ts run --lab <lab> --host <dir> --monitor 3440x1440
 *     --settings-baseline <settings.txt> [--records <dir>] [--lock-minutes 240] [filters]
 *
 * Filters: --playset a,b  --resolution 1920x1080,…  --view a,b  --all (report playsets and
 * unconfirmed sizes too). corpus/README.md, "The capture driver", describes the procedure.
 */
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localCorpusFolder, readCorpusManifest } from '../files.ts';
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
  const manifestFile = join(repositoryRoot, 'corpus', 'manifest.json');
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
