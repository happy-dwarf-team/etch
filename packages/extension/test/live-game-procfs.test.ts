import { describe, expect, it } from 'vitest';
import { flatpakProc, parseSnapshot, type ProcSource } from '../src/live-game/procfs.ts';
import {
  posixChildProcesses,
  posixProcessIdentity,
  posixProcessesNamed,
  posixStopVerified,
} from '../src/live-game/posix.ts';
import { sameIdentity } from '../src/live-game/windows.ts';

/** `/proc/<pid>/stat`: state, parent, 17 fields not used here, then the start in clock ticks. */
const stat = (pid: number, name: string, state: string, parent: number, ticks: number): string =>
  `${String(pid)} (${name}) ${state} ${String(parent)} ${'0 '.repeat(17)}${String(ticks)} 0 0`;

interface Fake {
  readonly stat: string;
  readonly cmdline?: string;
  readonly exe?: string;
}

/** A process table in memory, with the kills it was asked for. */
function fakeProc(table: Map<number, Fake>): ProcSource & { killed: number[] } {
  const killed: number[] = [];
  return {
    killed,
    pids: () => Promise.resolve([...table.keys()]),
    stat: (pid) => Promise.resolve(table.get(pid)?.stat),
    cmdline: (pid) => Promise.resolve(table.get(pid)?.cmdline ?? ''),
    exe: (pid) => Promise.resolve(table.get(pid)?.exe),
    btime: () => Promise.resolve(1_700_000_000),
    kill: (pid) => {
      killed.push(pid);
      return Promise.resolve(table.delete(pid));
    },
  };
}

const GAME = String.raw`Z:\home\u\private\game\eu4.exe`;

/** The game under Proton: the loader is the unix image, the Windows image is the first word of the command line. */
function proton(): Map<number, Fake> {
  return new Map<number, Fake>([
    [
      100,
      {
        stat: stat(100, 'proton', 'S', 1, 1000),
        exe: '/usr/bin/python3',
        cmdline: 'python3\0/x/proton\0waitforexitandrun\0',
      },
    ],
    [
      200,
      {
        stat: stat(200, 'eu4.exe', 'S', 100, 1100),
        exe: '/opt/proton/files/bin/wine64-preloader',
        cmdline: `${GAME}\0-userdir=Z:/p/\0`,
      },
    ],
    [
      201,
      {
        stat: stat(201, 'steam.exe', 'S', 100, 1050),
        exe: '/opt/proton/files/bin/wine64-preloader',
        cmdline: 'C:\\windows\\system32\\steam.exe\0',
      },
    ],
    [
      300,
      {
        stat: stat(300, 'eu4.exe', 'S', 1, 900),
        exe: '/opt/proton/files/bin/wine64-preloader',
        cmdline: String.raw`Z:\other\eu4.exe` + '\0',
      },
    ],
    [400, { stat: stat(400, 'sleep', 'Z', 1, 100), exe: '/usr/bin/sleep' }],
  ]);
}

describe('the process helper on a Proton game', () => {
  it('reports the Windows image of a Wine process, not the loader', async () => {
    const identity = await posixProcessIdentity(200, fakeProc(proton()));
    expect(identity?.imagePath).toBe(GAME);
    expect(identity?.pid).toBe(200);
    expect(await posixProcessIdentity(400, fakeProc(proton()))).toBeUndefined(); // a zombie is gone
    expect(await posixProcessIdentity(999, fakeProc(proton()))).toBeUndefined();
  });

  it('finds the game by image name among the other EU4 processes', async () => {
    const found = await posixProcessesNamed('EU4.EXE', fakeProc(proton()));
    expect(found.map((p) => p.pid).sort()).toEqual([200, 300]);
  });

  it('finds the children of a live parent only', async () => {
    const proc = fakeProc(proton());
    const parent = await posixProcessIdentity(100, proc);
    expect(parent).toBeDefined();
    if (parent === undefined) return;
    expect((await posixChildProcesses(parent, 'eu4.exe', proc)).map((p) => p.pid)).toEqual([200]);
  });

  it('stops only the process it was told about, and says so', async () => {
    const proc = fakeProc(proton());
    const identity = await posixProcessIdentity(200, proc);
    if (identity === undefined) throw new Error('no identity');
    const other = { ...identity, creationFileTime: '1' };
    expect(await posixStopVerified(other, 500, sameIdentity, proc)).toBe(
      'identity-mismatch-not-closed',
    );
    expect(proc.killed).toEqual([]);
    expect(await posixStopVerified(identity, 500, sameIdentity, proc)).toBe('terminated');
    expect(proc.killed).toEqual([200]);
    expect(await posixStopVerified(identity, 500, sameIdentity, proc)).toBe('already-exited');
  });
});

describe('a Wine process the way the real one looks', () => {
  const loader = '/usr/lib/wine/x86_64-unix/wine-preloader';
  const table = (): Map<number, Fake> =>
    new Map<number, Fake>([
      // `wine /home/u/private/game/eu4.exe`: the command line is the unix path (seen in a real run).
      [
        10,
        {
          stat: stat(10, 'eu4.exe', 'S', 1, 100),
          exe: loader,
          cmdline: '/home/u/private/game/eu4.exe\0-userdir=Z:/p/\0',
        },
      ],
      // Nothing readable but the process name Wine gives it.
      [11, { stat: stat(11, 'other.exe', 'S', 1, 100), exe: loader, cmdline: '' }],
    ]);

  it('takes the Windows form of a unix path, so it compares with the one Etch derives from the exe', async () => {
    const identity = await posixProcessIdentity(10, fakeProc(table()));
    expect(identity?.imagePath).toBe('Z:\\home\\u\\private\\game\\eu4.exe');
  });

  it('falls back on the process name Wine sets', async () => {
    expect((await posixProcessIdentity(11, fakeProc(table())))?.imagePath).toBe('other.exe');
    expect((await posixProcessesNamed('other.exe', fakeProc(table()))).map((p) => p.pid)).toEqual([
      11,
    ]);
  });
});

describe('a game that starts itself again', () => {
  it('is found after its parent ended, by its exact image path, and nothing else is', async () => {
    const table = proton();
    const proc = fakeProc(table);
    const parent = await posixProcessIdentity(200, proc);
    if (parent === undefined) throw new Error('no identity');
    table.delete(200); // the game exits to the main menu and ends
    // The restart: the same private image, created later, re-parented to init. And another game (the player's).
    table.set(210, {
      stat: stat(210, 'eu4.exe', 'S', 1, 1500),
      exe: '/opt/proton/files/bin/wine64-preloader',
      cmdline: `${GAME}\0`,
    });
    table.set(220, {
      stat: stat(220, 'eu4.exe', 'S', 1, 1600),
      exe: '/opt/proton/files/bin/wine64-preloader',
      cmdline: 'Z:\\player\\eu4.exe\0',
    });
    expect((await posixChildProcesses(parent, 'eu4.exe', proc)).map((p) => p.pid)).toEqual([210]);
    // Not for another image name (a crash reporter's children are not restarts), and not before the parent started.
    expect(await posixChildProcesses(parent, 'CrashReporter.exe', proc)).toEqual([]);
    table.set(230, {
      stat: stat(230, 'eu4.exe', 'S', 1, 10),
      exe: '/opt/proton/files/bin/wine64-preloader',
      cmdline: `${GAME}\0`,
    });
    expect((await posixChildProcesses(parent, 'eu4.exe', proc)).map((p) => p.pid)).toEqual([210]);
  });
});

describe('the host snapshot of a Flatpak sandbox', () => {
  const output = [
    'B 1700000000',
    'P 200',
    `S ${stat(200, 'eu4.exe', 'S', 100, 1100)}`,
    `C ${GAME}\x01-userdir=Z:/p/\x01`,
    'E /opt/proton/files/bin/wine64-preloader',
    'P 300',
    `S ${stat(300, 'sleep', 'S', 1, 5)}`,
    'C sleep\x0160\x01',
    'E ',
    '',
  ].join('\n');

  it('parses the blocks the script prints', () => {
    const snapshot = parseSnapshot(output);
    expect(snapshot.btime).toBe(1_700_000_000);
    expect([...snapshot.processes.keys()]).toEqual([200, 300]);
    expect(snapshot.processes.get(200)?.cmdline).toBe(`${GAME}\0-userdir=Z:/p/\0`);
    expect(snapshot.processes.get(300)?.exe).toBeUndefined();
  });

  it('serves the helper from one host run, and finds the game through it', async () => {
    let runs = 0;
    const proc = flatpakProc(() => {
      runs++;
      return Promise.resolve(output);
    });
    const found = await posixProcessesNamed('eu4.exe', proc);
    expect(found).toHaveLength(1);
    expect(found[0]?.imagePath).toBe(GAME);
    expect(runs).toBe(1);
  });

  it('reads a snapshot that takes longer than its age once for a whole scan', async () => {
    let runs = 0;
    const proc = flatpakProc(async () => {
      runs++;
      await new Promise((resolve) => setTimeout(resolve, 60));
      return output;
    }, 10);
    const found = await posixProcessesNamed('eu4.exe', proc);
    expect(found).toHaveLength(1);
    expect(runs).toBe(1);
  });
});
