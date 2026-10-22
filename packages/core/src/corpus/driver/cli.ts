/**
 * The capture driver's command line (etch#42). Run from the repository root with Node 22.18 or
 * newer, which runs TypeScript directly:
 *
 *   node packages/core/src/corpus/driver/cli.ts plan [filters]
 *   node packages/core/src/corpus/driver/cli.ts run --lab <lab> --host <dir> --monitor 3440x1440
 *     --settings-baseline <settings.txt> [--records <dir>] [filters]
 *
 * Filters: --playset a,b  --resolution 1920x1080,…  --view a,b  --all (report playsets and
 * unconfirmed sizes too). corpus/README.md, "The capture driver", describes the procedure.
 */
import { execFile, execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localCorpusFolder, readCorpusManifest } from '../files.ts';
import { describeSession, planCaptures, type PlanFilter } from './plan.ts';
import { runCaptures, type GameLauncher, type GameRecord, type StopResult } from './run.ts';
import { connectTongs } from './tongs.ts';
import { DEFAULT_AWAY, type AwayPoint, type CursorState } from './view.ts';
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

/** `game.ps1` through PowerShell 7; its last output line is one JSON object. */
function gameScript(lab: string, hostDir: string): GameLauncher {
  const run = (args: string[]): Promise<Record<string, unknown>> =>
    new Promise((ok, fail) => {
      execFile(
        'pwsh',
        scriptArgs(lab, hostDir, args),
        { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const last = stdout.trim().split(/\r?\n/).pop() ?? '';
          if (error !== null) {
            fail(
              new Error(
                `game.ps1 ${args.join(' ')} failed: ${stderr.trim() || last || error.message}`,
              ),
            );
            return;
          }
          try {
            ok(JSON.parse(last) as Record<string, unknown>);
          } catch {
            fail(new Error(`game.ps1 ${args.join(' ')} printed no JSON: ${last}`));
          }
        },
      );
    });
  return {
    async check() {
      const answer = await run(['-Action', 'Check']);
      return String(answer['copyExe']);
    },
    async start(profile, save) {
      const answer = await run([
        '-Action',
        'Start',
        '-ProfileDir',
        profile,
        ...(save !== undefined ? ['-Save', save] : []),
      ]);
      return answer as unknown as GameRecord;
    },
    mouse: {
      read: async () => cursorState(await run(['-Action', 'Cursor'])),
      pin: async (x, y) =>
        cursorState(await run(['-Action', 'Pin', '-X', String(x), '-Y', String(y)])),
      async release() {
        await run(['-Action', 'Release']);
      },
    },
    async stop(record) {
      const { writeFile, mkdtemp } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const file = join(await mkdtemp(join(tmpdir(), 'etch-capture-')), 'game.json');
      await writeFile(file, JSON.stringify(record));
      return (await run(['-Action', 'Stop', '-Record', file])) as StopResult;
    },
  };
}

function scriptArgs(lab: string, hostDir: string, args: readonly string[]): string[] {
  const script = join(here, 'game.ps1');
  return [
    '-NoProfile',
    '-NonInteractive',
    '-File',
    script,
    '-Lab',
    lab,
    '-HostDir',
    hostDir,
    ...args,
  ];
}

function cursorState(answer: Record<string, unknown>): CursorState {
  const clip = answer['clip'] as Record<string, unknown> | undefined;
  return {
    x: Number(answer['x']),
    y: Number(answer['y']),
    clip: {
      left: Number(clip?.['left']),
      top: Number(clip?.['top']),
      right: Number(clip?.['right']),
      bottom: Number(clip?.['bottom']),
    },
  };
}

/**
 * Ctrl+C ends Node before any `finally` runs, and the clip outlives the process: release the mouse
 * on the way out. A game still running is closed with `game.ps1 -Action Stop` (corpus/README.md).
 */
function releaseOnSignal(lab: string, hostDir: string): void {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) {
    process.once(signal, () => {
      try {
        execFileSync('pwsh', scriptArgs(lab, hostDir, ['-Action', 'Release']), {
          windowsHide: true,
        });
        console.error(`${signal}: the mouse is released.`);
      } catch {
        console.error(`${signal}: the mouse could not be released; press Ctrl+Alt+Del.`);
      }
      process.exit(130);
    });
  }
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
  releaseOnSignal(lab, hostDir);
  const prettier = await import('prettier');
  const report = await runCaptures({
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
    launcher: gameScript(lab, hostDir),
    connect: () => connectTongs(),
    format: async (json, file) =>
      prettier.format(json, { ...(await prettier.resolveConfig(file)), filepath: file }),
    away: away(flags),
    ...(flags.has('hold') ? { holdMs: Number(flags.get('hold')) * 60_000 } : {}),
    print: (line) => {
      console.log(line);
    },
  });
  const captured = report.sessions.flatMap((s) => s.views).filter((v) => v.ok).length;
  const failed = report.sessions.flatMap((s) => s.views).filter((v) => !v.ok).length;
  console.log(
    `run ${report.runId}: ${String(captured)} captured, ${String(failed)} failed, ${String(report.notTried.length)} not tried${report.stopped !== undefined ? `; STOPPED: ${report.stopped}` : ''}`,
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
