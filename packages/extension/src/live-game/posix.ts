// The process helper (windows.ts) on Linux and macOS, from /proc: the same four operations without PowerShell.
//
// A process is the triple (PID, image path, creation time), as on Windows. The creation time is the boot time plus
// the process's start in clock ticks (/proc/<pid>/stat field 22, 10 ms), as a Windows FILETIME so that
// `creationUnixMs` and `sameIdentity` work unchanged. For a program run by Wine or Proton the unix image is the
// loader; its command line starts with the Windows path (`Z:\...\eu4.exe`), which is the image reported.
//
// Not the same as Windows: a child whose parent has exited is re-parented here, so `childProcesses` finds the
// children of a live parent by their parent id. After the parent is gone it finds only a restart of the parent's
// own image (same exact path, created later); it does not guess further, since a wrong match would close a
// game the player started.
import { basename } from 'node:path';
import { defaultProc, type ProcSource } from './procfs.ts';
import type { ProcessIdentity, StopOutcome } from './windows.ts';

const FILETIME_UNIX_EPOCH = 116444736000000000n;
const CLOCK_TICK_MS = 10; // CLK_TCK is 100 on Linux

const WINE_LOADERS =
  /^(?:wine(?:64)?(?:-preloader|-staging)?|proton|reaper|pv-adverb|steam-launch-wrapper)$/i;

interface Stat {
  /** The command name Wine sets to the program's file name (`eu4.exe`); at most 15 characters. */
  readonly comm: string;
  readonly state: string;
  readonly parent: number;
  readonly startTicks: number;
}

/** `/proc/<pid>/stat`: the command name may hold spaces and parentheses, so the fields start after the last `)`. */
export function parseStat(text: string): Stat | undefined {
  const close = text.lastIndexOf(')');
  const open = text.indexOf('(');
  if (close < 0 || open < 0) return undefined;
  const comm = text.slice(open + 1, close);
  const fields = text.slice(close + 2).split(' ');
  const state = fields[0];
  const parent = Number(fields[1]);
  const startTicks = Number(fields[19]); // field 22 overall, the 20th after the name
  if (state === undefined || !Number.isInteger(parent) || !Number.isFinite(startTicks))
    return undefined;
  return { comm, state, parent, startTicks };
}

/**
 * The image of a Wine process, as a Windows path, from what is there to read. A process made by CreateProcess has a command
 * line that starts with its Windows path (`Z:\...\eu4.exe`); the first process of `wine <file>` has the unix path
 * (`/home/.../eu4.exe`), which is the same file as `Z:\home\...\eu4.exe`; and Wine sets the process name to the program's
 * file name either way, which is all there is when neither can be read.
 */
function wineImage(commandLine: string, comm: string): string | undefined {
  const first = commandLine.split('\0')[0] ?? '';
  if (/^[A-Za-z]:[\\/]/.test(first)) return first;
  if (first.startsWith('/') && /\.exe$/i.test(first)) return `Z:${first.replaceAll('/', '\\')}`;
  return /\.exe$/i.test(comm) ? comm : undefined;
}

async function readIdentity(
  pid: number,
  proc: ProcSource,
): Promise<{ identity: ProcessIdentity; parent: number } | undefined> {
  let stat: Stat | undefined;
  try {
    const text = await proc.stat(pid);
    stat = text === undefined ? undefined : parseStat(text);
  } catch {
    return undefined; // gone, or not readable
  }
  if (stat === undefined || stat.state === 'Z' || stat.state === 'X') return undefined; // exited, not yet reaped
  let imagePath = (await proc.exe(pid))?.replace(/ \(deleted\)$/, '');
  if (imagePath === undefined || WINE_LOADERS.test(basename(imagePath))) {
    imagePath = wineImage(await proc.cmdline(pid), stat.comm) ?? imagePath;
  }
  if (imagePath === undefined) return undefined; // another user's process
  const unixMs = (await proc.btime()) * 1000 + stat.startTicks * CLOCK_TICK_MS;
  const creationFileTime = (BigInt(unixMs) * 10000n + FILETIME_UNIX_EPOCH).toString();
  return { identity: { pid, imagePath, creationFileTime }, parent: stat.parent };
}

function imageFileName(path: string): string {
  return path.split(/[\\/]/).pop()?.toLowerCase() ?? '';
}

export async function posixProcessIdentity(
  pid: number,
  proc: ProcSource = defaultProc(),
): Promise<ProcessIdentity | undefined> {
  return (await readIdentity(pid, proc))?.identity;
}

export async function posixProcessesNamed(
  imageName: string,
  proc: ProcSource = defaultProc(),
): Promise<ProcessIdentity[]> {
  const wanted = imageName.toLowerCase();
  const found: ProcessIdentity[] = [];
  for (const pid of await proc.pids()) {
    const read = await readIdentity(pid, proc);
    if (read !== undefined && imageFileName(read.identity.imagePath) === wanted)
      found.push(read.identity);
  }
  return found;
}

export async function posixChildProcesses(
  parent: ProcessIdentity,
  imageName: string,
  proc: ProcSource = defaultProc(),
): Promise<ProcessIdentity[]> {
  const alive = await posixProcessIdentity(parent.pid, proc);
  const parentGone = alive?.creationFileTime !== parent.creationFileTime; // gone, or its PID reused
  const wanted = imageName.toLowerCase();
  // A game that starts itself again (Exit to Main Menu) leaves the parent as the new process starts, and Linux
  // re-parents it. It is still found, but only by what cannot be anyone else's: the very same image path, which is the
  // private install's (the player's own game runs another file), created after the parent.
  const restart = parentGone && imageFileName(parent.imagePath) === wanted;
  if (parentGone && !restart) return [];
  const found: ProcessIdentity[] = [];
  for (const pid of await proc.pids()) {
    const read = await readIdentity(pid, proc);
    if (read === undefined || pid === parent.pid) continue;
    const created = BigInt(read.identity.creationFileTime) >= BigInt(parent.creationFileTime);
    const matches = restart
      ? read.identity.imagePath.toLowerCase() === parent.imagePath.toLowerCase() && created
      : read.parent === parent.pid && imageFileName(read.identity.imagePath) === wanted && created;
    if (matches) found.push(read.identity);
  }
  return found;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Kills the process only if it is still the one `expected` names (checked right before the signal). */
export async function posixStopVerified(
  expected: ProcessIdentity,
  timeoutMs: number,
  sameIdentity: (a: ProcessIdentity, b: ProcessIdentity) => boolean,
  proc: ProcSource = defaultProc(),
): Promise<StopOutcome> {
  const current = await posixProcessIdentity(expected.pid, proc);
  if (current === undefined) return 'already-exited';
  if (!sameIdentity(expected, current)) return 'identity-mismatch-not-closed';
  try {
    // TerminateProcess: no chance to refuse.
    if (!(await proc.kill(expected.pid))) return 'terminated';
  } catch {
    return 'terminate-failed';
  }
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const left = await posixProcessIdentity(expected.pid, proc);
    if (left === undefined || !sameIdentity(expected, left)) return 'terminated';
    if (Date.now() >= deadline) return 'still-alive';
    await sleep(25);
  }
}
