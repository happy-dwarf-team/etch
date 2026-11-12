// Where the process helper reads processes from: /proc of this machine, or the host's /proc when the extension runs in a
// Flatpak sandbox (one `flatpak-spawn --host sh` run prints a snapshot of every process).
import { readFile, readdir, readlink } from 'node:fs/promises';
import { hostShell, isFlatpak } from './host.ts';

export interface ProcSource {
  pids(): Promise<number[]>;
  /** `/proc/<pid>/stat`, or `undefined` when the process is gone. */
  stat(pid: number): Promise<string | undefined>;
  /** `/proc/<pid>/cmdline` with NUL separators ('' when unreadable). */
  cmdline(pid: number): Promise<string>;
  /** `/proc/<pid>/exe`'s target, or `undefined` (another user's process, or gone). */
  exe(pid: number): Promise<string | undefined>;
  /** The boot time, seconds since the epoch. */
  btime(): Promise<number>;
  /** Sends SIGKILL; resolves `true` when the signal was sent, `false` when there was no such process. */
  kill(pid: number): Promise<boolean>;
}

export function nativeProc(): ProcSource {
  return {
    async pids() {
      const names = await readdir('/proc').catch(() => []);
      return names.filter((name) => /^\d+$/.test(name)).map(Number);
    },
    stat: (pid) => readFile(`/proc/${String(pid)}/stat`, 'utf8').catch(() => undefined),
    cmdline: (pid) => readFile(`/proc/${String(pid)}/cmdline`, 'utf8').catch(() => ''),
    exe: (pid) => readlink(`/proc/${String(pid)}/exe`).catch(() => undefined),
    async btime() {
      const text = await readFile('/proc/stat', 'utf8');
      const match = /^btime\s+(\d+)/m.exec(text);
      if (match?.[1] === undefined) throw new Error('/proc/stat has no btime');
      return Number(match[1]);
    },
    kill(pid) {
      return new Promise((resolve, reject) => {
        try {
          process.kill(pid, 'SIGKILL');
          resolve(true);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') resolve(false);
          else reject(new Error((error as Error).message, { cause: error }));
        }
      });
    },
  };
}

/** What the snapshot script prints: one block per process, `\x01` standing for NUL in the command line. */
export const SNAPSHOT_SCRIPT = String.raw`
echo "B $(sed -n 's/^btime //p' /proc/stat)"
for d in /proc/[0-9]*; do
  p=\${d#/proc/}; [ -r "$d/stat" ] || continue
  printf 'P %s\n' "$p"
  printf 'S '; tr '\n' ' ' < "$d/stat" 2>/dev/null; echo
  printf 'C '; tr '\0' '\1' < "$d/cmdline" 2>/dev/null; echo
  printf 'E %s\n' "$(readlink "$d/exe" 2>/dev/null)"
done`.replaceAll('\\$', '$');

export interface Snapshot {
  readonly btime: number;
  readonly processes: ReadonlyMap<
    number,
    { stat: string; cmdline: string; exe: string | undefined }
  >;
}

export function parseSnapshot(text: string): Snapshot {
  let btime = 0;
  const processes = new Map<number, { stat: string; cmdline: string; exe: string | undefined }>();
  let current: { pid: number; stat: string; cmdline: string; exe: string | undefined } | undefined;
  const flush = (): void => {
    if (current !== undefined) processes.set(current.pid, current);
  };
  for (const line of text.split('\n')) {
    const tag = line[0];
    const rest = line.slice(2);
    if (tag === 'B') btime = Number(rest);
    else if (tag === 'P') {
      flush();
      current = { pid: Number(rest), stat: '', cmdline: '', exe: undefined };
    } else if (current !== undefined) {
      if (tag === 'S') current.stat = rest.trim();
      else if (tag === 'C') current.cmdline = rest.replaceAll('\x01', '\0');
      else if (tag === 'E') current.exe = rest === '' ? undefined : rest;
    }
  }
  flush();
  return { btime, processes };
}

/** The host's processes as one snapshot per `maxAgeMs`, for a Flatpak sandbox. */
export function flatpakProc(
  run: (script: string) => Promise<string> = (script) => hostShell(script, true),
  maxAgeMs = 250,
): ProcSource {
  // `doneAt` is set when the snapshot has arrived: a snapshot takes longer than `maxAgeMs`, so the age counts from its
  // end, and one that is still being taken is reused (a scan reads every process from it).
  let cached: { doneAt: number | undefined; snapshot: Promise<Snapshot> } | undefined;
  const snapshot = (): Promise<Snapshot> => {
    if (
      cached === undefined ||
      (cached.doneAt !== undefined && Date.now() - cached.doneAt > maxAgeMs)
    ) {
      const entry: NonNullable<typeof cached> = {
        doneAt: undefined,
        snapshot: run(SNAPSHOT_SCRIPT).then(parseSnapshot),
      };
      entry.snapshot.then(
        () => {
          entry.doneAt = Date.now();
        },
        () => {
          if (cached === entry) cached = undefined;
        },
      );
      cached = entry;
    }
    return cached.snapshot;
  };
  return {
    async pids() {
      cached = undefined;
      return [...(await snapshot()).processes.keys()];
    },
    async stat(pid) {
      const stat = (await snapshot()).processes.get(pid)?.stat;
      return stat === undefined || stat === '' ? undefined : stat;
    },
    async cmdline(pid) {
      return (await snapshot()).processes.get(pid)?.cmdline ?? '';
    },
    async exe(pid) {
      return (await snapshot()).processes.get(pid)?.exe;
    },
    async btime() {
      return (await snapshot()).btime;
    },
    async kill(pid) {
      cached = undefined;
      await run(`kill -KILL ${String(Math.trunc(pid))} 2>/dev/null; true`);
      // The host's kill reports nothing useful through flatpak-spawn: whether it was sent is whether the process was there.
      return true;
    },
  };
}

let source: ProcSource | undefined;

/** The process source of the machine the player sits at. */
export function defaultProc(): ProcSource {
  source ??= isFlatpak() ? flatpakProc() : nativeProc();
  return source;
}
